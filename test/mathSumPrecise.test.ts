import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sumPrecise } from '../ui/src/mathSumPrecise.js';

// pdf.js 6.x calls Math.sumPrecise, which Safari ≤26.1 and Chrome ≤146 lack.
// This polyfill is installed on the global Math, so anything wrong in it is
// wrong for every glyph advance pdf.js measures.

test('matches plain addition where plain addition is exact', () => {
  assert.equal(sumPrecise([1, 2, 3, 4]), 10);
  assert.equal(sumPrecise([0.5, 0.25, 0.125]), 0.875);
  assert.equal(sumPrecise([-1, 1]), 0);
});

test('keeps the low bits that naive summation drops', () => {
  // The reason the proposal exists: small terms vanish into a large one and
  // never come back. Both expectations are measured, not assumed — a first draft
  // asserted naive summation returned 0 for the first case, when it returns 1,
  // and failed on its own arithmetic rather than the code's.
  const a = [1e100, 1, -1e100, 1];
  assert.equal(a.reduce((x, y) => x + y, 0), 1, 'naive loses one of the two 1s');
  assert.equal(sumPrecise(a), 2, 'both survive');

  const b = [1e16, 1, 1, 1, 1, -1e16];
  assert.equal(b.reduce((x, y) => x + y, 0), 0, 'naive loses all four');
  assert.equal(sumPrecise(b), 4);
});

// The whole of what follows was broken and shipped. Every case here returned NaN
// or the wrong zero, because compensated summation was applied to values it
// cannot handle: once a partial sum is ±Infinity the compensation is ∓Infinity
// and `sum + compensation` is NaN.

test('infinities are not turned into NaN', () => {
  assert.equal(sumPrecise([Infinity]), Infinity);
  assert.equal(sumPrecise([Infinity, 1]), Infinity);
  assert.equal(sumPrecise([1, Infinity, 2]), Infinity);
  assert.equal(sumPrecise([-Infinity]), -Infinity);
  assert.equal(sumPrecise([-Infinity, 5]), -Infinity);
});

test('opposing infinities and NaN give NaN, as specified', () => {
  assert.ok(Number.isNaN(sumPrecise([Infinity, -Infinity])));
  assert.ok(Number.isNaN(sumPrecise([NaN])));
  assert.ok(Number.isNaN(sumPrecise([1, NaN, 2])));
  assert.ok(Number.isNaN(sumPrecise([Infinity, NaN])));
});

test('signed zero follows the proposal', () => {
  assert.ok(Object.is(sumPrecise([]), -0), 'empty is -0');
  assert.ok(Object.is(sumPrecise([-0]), -0));
  assert.ok(Object.is(sumPrecise([-0, -0]), -0));
  assert.ok(Object.is(sumPrecise([0, -0]), 0), 'a positive zero wins');
  assert.ok(Object.is(sumPrecise([0]), 0));
  // A real sum that lands on zero is +0, not -0.
  assert.ok(Object.is(sumPrecise([1, -1]), 0));
});

test('overflow saturates rather than returning NaN — a documented divergence', () => {
  // The proposal sums exactly and rounds once, so [MAX, MAX, -MAX] is MAX.
  // Neumaier cannot recover from an intermediate Infinity, and doing so needs a
  // full expansion sum. This pins the deviation deliberately: Infinity, not NaN,
  // and not silently something else.
  assert.equal(sumPrecise([1e308, 1e308]), Infinity);
  assert.equal(sumPrecise([-1e308, -1e308]), -Infinity);
  const max = Number.MAX_VALUE;
  assert.equal(sumPrecise([max, max, -max]), Infinity,
    'diverges from the spec (which gives MAX) — but not by producing NaN');
});

test('accepts any iterable, not just arrays', () => {
  assert.equal(sumPrecise(new Set([1, 2, 3])), 6);
  assert.equal(sumPrecise((function* () { yield 2; yield 3; })()), 5);
});

test('installs itself on Math when the runtime lacks it', async () => {
  await import('../ui/src/mathSumPrecise.js');
  assert.equal(typeof Math.sumPrecise, 'function');
  assert.equal(Math.sumPrecise!([1e100, 1, -1e100, 1]), 2);
});

// The half that matters most, and the half that is easiest to get wrong: a
// worker has its own global, so patching the main thread leaves pdf.js's font
// and layout code still calling a method that isn't there.
test('the polyfill is compiled into the worker bundle, not just the main one', () => {
  const dist = join(dirname(dirname(fileURLToPath(import.meta.url))), 'ui', 'dist', 'assets');
  let files: string[];
  try { files = readdirSync(dist).filter((f) => f.endsWith('.js')); } catch { return; } // not built yet
  const workerChunks = files.filter((f) => /worker/i.test(f));
  assert.ok(workerChunks.length, `no worker chunk in ${dist} — did the build change?`);
  const patched = workerChunks.filter((f) => readFileSync(join(dist, f), 'utf8').includes('sumPrecise'));
  assert.ok(patched.length, `worker chunks carry no sumPrecise polyfill: ${workerChunks.join(', ')}`);
});
