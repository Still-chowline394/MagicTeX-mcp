import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sumPrecise } from '../ui/src/mathSumPrecise.js';

// pdf.js 6.x calls Math.sumPrecise, which Safari does not implement. Calling an
// absent method there reads as "TypeError: undefined is not a function" — which
// is what blanked the PDF pane on a real paper. Chrome versions before 151 log
// the same failure as a warning and carry on, which is why it looked
// document-specific for three rounds of wrong guesses.

test('matches plain addition where plain addition is exact', () => {
  assert.equal(sumPrecise([1, 2, 3, 4]), 10);
  assert.equal(sumPrecise([0.5, 0.25, 0.125]), 0.875);
  assert.equal(sumPrecise([-1, 1]), 0);
});

test('keeps the low bits that naive summation drops', () => {
  // The reason the proposal exists: small terms vanish into a large one and
  // never come back. Both expectations here are measured, not assumed — a first
  // draft asserted naive summation returned 0 for the first case, when it
  // returns 1, and the test failed on its own arithmetic rather than the code's.
  const a = [1e100, 1, -1e100, 1];
  assert.equal(a.reduce((x, y) => x + y, 0), 1, 'naive loses one of the two 1s');
  assert.equal(sumPrecise(a), 2, 'both survive');

  const b = [1e16, 1, 1, 1, 1, -1e16];
  assert.equal(b.reduce((x, y) => x + y, 0), 0, 'naive loses all four');
  assert.equal(sumPrecise(b), 4);
});

test('an empty iterable gives -0, as the proposal specifies', () => {
  assert.ok(Object.is(sumPrecise([]), -0));
});

test('accepts any iterable, not just arrays', () => {
  assert.equal(sumPrecise(new Set([1, 2, 3])), 6);
  assert.equal(sumPrecise((function* () { yield 2; yield 3; })()), 5);
});

test('installs itself on Math when the runtime lacks it', async () => {
  // Importing the module is what patches the global; this asserts the patch
  // happened rather than that the export exists.
  await import('../ui/src/mathSumPrecise.js');
  assert.equal(typeof Math.sumPrecise, 'function');
  assert.equal(Math.sumPrecise!([1e100, 1, -1e100, 1]), 2);
});

// The half that matters most, and the half that is easiest to get wrong: a
// worker has its own global, so patching the main thread leaves pdf.js's font
// and layout code still calling a method that isn't there. This checks the
// polyfill is actually inside the built worker chunk, not merely imported
// somewhere in the app.
test('the polyfill is compiled into the worker bundle, not just the main one', () => {
  const dist = join(dirname(dirname(fileURLToPath(import.meta.url))), 'ui', 'dist', 'assets');
  let files: string[];
  try { files = readdirSync(dist).filter((f) => f.endsWith('.js')); } catch { return; } // not built yet
  const workerChunks = files.filter((f) => /worker/i.test(f));
  assert.ok(workerChunks.length, `no worker chunk in ${dist} — did the build change?`);
  const patched = workerChunks.filter((f) => readFileSync(join(dist, f), 'utf8').includes('sumPrecise'));
  assert.ok(patched.length, `worker chunks carry no sumPrecise polyfill: ${workerChunks.join(', ')}`);
});
