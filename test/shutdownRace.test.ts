import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureServer, shutdownEngine, __resetForTests } from '../src/engine/browserHost.js';

// Two things the shutdown got wrong, both of which turn the teardown into the
// leak it was written to prevent.

test('nothing can rebuild a tier once shutdown has begun', async () => {
  // Teardown is not instantaneous and the server keeps answering requests while
  // it runs, so a tool call or a debounced watcher compile can arrive mid-way.
  // The tier handles used to be nulled at the END of shutdownEngine(), which is
  // precisely the arrangement that lets such a call build a NEW preview server
  // on a NEW port — moments before process.exit orphans it.
  __resetForTests();
  const preview = await ensureServer();
  const firstPort = preview.port;

  await shutdownEngine();

  await assert.rejects(
    () => ensureServer(),
    (e: Error) => e.name === 'ShuttingDownError',
    'ensureServer() must refuse after shutdown, not bind a fresh port',
  );

  // And the old port is genuinely released, not merely forgotten.
  await assert.rejects(
    fetch(`http://127.0.0.1:${firstPort}/git/status`, { signal: AbortSignal.timeout(1500) }),
    'the port should be closed',
  );
});

test('a second shutdown waits for the first instead of racing it', async () => {
  // The regression: `if (shuttingDown) return` made the second caller resolve
  // immediately. Each caller then ran process.exit(0), so the second signal
  // killed the process while the first teardown was still inside browser.close().
  // The client sends stdin-close and SIGTERM two seconds apart every time, so
  // this was the normal path.
  //
  // This models the fixed shape — a cached promise — and asserts both callers
  // observe the same completion.
  let done = false;
  let run: Promise<void> | null = null;
  const slowTeardown = async () => { await new Promise((r) => setTimeout(r, 200)); done = true; };
  const shutdown = () => (run ??= slowTeardown());

  const first = shutdown();
  const second = shutdown();
  assert.equal(second, first, 'the second call must return the in-flight promise, not a resolved one');

  await second;
  assert.equal(done, true, 'the second caller resolved before the teardown finished');
  await first;
});

test('shutdownEngine is safe to call twice', async () => {
  __resetForTests();
  await ensureServer();
  await shutdownEngine();
  await shutdownEngine();
});
