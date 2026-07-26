import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startPreviewServer } from '../src/preview/previewServer.js';

// `server.close()` stops accepting new connections and then waits for the open
// ones to finish. A WebSocket never finishes — that is the point of it — so
// closing the http server on its own never returns.
//
// This is the discriminating half of the shutdown work. The end-to-end smoke
// finds the port released and the process gone even without the fix, because a
// clean transport close tears the process down anyway; those two checks pass in
// both directions and so prove nothing on their own.
//
// This one does. Reverted to the old `server.close()` it produced no output at
// all for five minutes — the run did not fail, it never finished, because the
// server was still listening and holding the event loop open. That is the leak,
// reproduced.

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} did not finish within ${ms}ms`)), ms).unref()),
  ]);

test('close() returns even with a WebSocket client attached', async () => {
  const preview = await startPreviewServer();
  const ws = new WebSocket(`ws://127.0.0.1:${preview.port}`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });

  await withTimeout(preview.close(), 5000, 'close()');
  assert.ok(true, 'returned rather than hanging on the open socket');
});

test('the socket is told before it is dropped', async () => {
  const preview = await startPreviewServer();
  const ws = new WebSocket(`ws://127.0.0.1:${preview.port}`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });

  // The goodbye is the entire reason a stale window can tell it is stale. Without
  // it the socket just drops, which is indistinguishable from a network hiccup —
  // and a window that thinks it is merely reconnecting keeps showing its last
  // render, including its last error.
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
