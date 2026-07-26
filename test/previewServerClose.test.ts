import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startPreviewServer } from '../src/preview/previewServer.js';

// Shutting the preview server down has to actually finish, and quickly.
//
// The MCP client disconnects with stdin.end() → 2s → SIGTERM → 2s → SIGKILL
// (@modelcontextprotocol/sdk client/stdio.js). Anything here that takes longer
// than that budget may as well not run: the process is killed still holding
// Chromium and the port, which is the leak the shutdown path exists to prevent.
//
// The first implementation failed that on three counts, all measured:
//   - one WebSocket peer that never answered a close frame → close() took
//     30 015 ms (the ws library's closeTimeout);
//   - an HTTP request sent one second into close() was answered with 200,
//     because server.close() only ran inside wss.close()'s callback;
//   - so a connection arriving in that window became something server.close()
//     then had to wait for, with no bound at all.

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} did not finish within ${ms}ms`)), ms).unref()),
  ]);

const open = async (port: number) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return ws;
};

test('close() returns even with a WebSocket client attached', async () => {
  const preview = await startPreviewServer();
  await open(preview.port);
  await withTimeout(preview.close(), 5000, 'close()');
});

test('close() is not held hostage by a peer that never answers', async () => {
  // The case that measured 30s: a client that completes the handshake, then
  // ignores the close frame and stops reading. A suspended tab, a slept laptop
  // or a dropped VPN all look exactly like this.
  const preview = await startPreviewServer();
  const ws = await open(preview.port);
  ws.close = () => {};        // ignore the server's request to close
  // @ts-expect-error reaching into ws to simulate a peer that stopped reading
  ws._socket.pause();

  const t0 = Date.now();
  await withTimeout(preview.close(), 4000, 'close() with a deaf peer');
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, `close() took ${ms}ms — a deaf peer must not cost the shutdown budget`);
});

test('the port stops accepting immediately, not after the drain', async () => {
  // While close() was draining, the server was still answering requests — and
  // each new connection was then something server.close() had to wait for. The
  // listener has to go first.
  const preview = await startPreviewServer();
  const ws = await open(preview.port);
  ws.close = () => {};
  // @ts-expect-error see above
  ws._socket.pause();

  const closing = preview.close();
  await new Promise((r) => setTimeout(r, 150));

  let served = false;
  try {
    const res = await fetch(`http://127.0.0.1:${preview.port}/git/status`, { signal: AbortSignal.timeout(1500) });
    served = res.ok;
  } catch { /* refused — which is the point */ }
  assert.equal(served, false, 'the server answered a request after close() began');

  await withTimeout(closing, 4000, 'close()');
});

test('the socket is told before it is dropped', async () => {
  // The goodbye is the entire reason a stale window can tell it is stale.
  // Without it the socket just drops, which is indistinguishable from a network
  // hiccup — and a window that thinks it is merely reconnecting keeps showing
  // its last render, including its last error.
  const preview = await startPreviewServer();
  const ws = await open(preview.port);

  const seen: string[] = [];
  ws.on('message', (d) => seen.push(String(d)));
  const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()));

  await withTimeout(preview.close(), 5000, 'close()');
  await withTimeout(closed, 5000, 'socket close');

  assert.ok(
    seen.some((m) => JSON.parse(m).type === 'server-closing'),
    `expected a server-closing message, got ${JSON.stringify(seen)}`,
  );
});

test('close() is safe to call when nothing ever connected', async () => {
  const preview = await startPreviewServer();
  await withTimeout(preview.close(), 5000, 'close()');
});

test('close() is idempotent', async () => {
  // Two shutdown triggers arrive as a matter of course (stdin close, then
  // SIGTERM two seconds later), so this can be reached twice.
  const preview = await startPreviewServer();
  await open(preview.port);
  await withTimeout(preview.close(), 5000, 'first close()');
  await withTimeout(preview.close(), 5000, 'second close()');
});
