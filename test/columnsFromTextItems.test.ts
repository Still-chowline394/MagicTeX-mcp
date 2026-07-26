import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnsFromTextItems } from '../ui/src/lines.js';

// `getTextContent()` does not return a homogeneous list. Reading `.str` off
// every entry threw inside the page-render loop and took the whole PDF pane
// down — "render failed: TypeError: undefined is not a function" — on a real
// paper, in a release whose entire purpose was to fix highlight placement. A
// worse failure than the one it fixed.
//
// So the contract is: anything unrecognisable is skipped, and nothing in here
// may throw. The caller also wraps it, but a function that can't be trusted
// with its own input shouldn't need the caller to know that.

const item = (str: string, x: number, y: number, w: number) =>
  ({ str, transform: [1, 0, 0, 1, x, y], width: w, height: 10 });

// Two columns of body text: 20 rows, a left and a right column with a gutter.
const twoColumnPage = () => {
  const items: unknown[] = [];
  for (let r = 0; r < 20; r++) {
    const y = 700 - r * 12;
    items.push(item('left column text here', 55, y, 245));
    items.push(item('right column text here', 318, y, 245));
  }
  return items;
};

test('finds the gutter on a normal two-column page', () => {
  const cols = columnsFromTextItems(twoColumnPage(), 792);
  assert.equal(cols.length, 1);
  assert.ok(cols[0] > 300 && cols[0] < 318, `boundary should sit in the gutter, got ${cols[0]}`);
});

test('marked-content entries with no str are skipped, not dereferenced', () => {
  // This is the shape that broke it: pdf.js mixes these in among text items.
  const items = [{ type: 'beginMarkedContent', id: 'p1' }, ...twoColumnPage(), { type: 'endMarkedContent' }];
  const cols = columnsFromTextItems(items, 792);
  assert.equal(cols.length, 1, 'the markers are ignored and the page still resolves');
});

test('survives every shape of junk without throwing', () => {
  const junk: unknown[] = [
    null,
    undefined,
    {},
    { str: 'no transform' },
    { str: 'short transform', transform: [1, 0] },
    { str: 'non-array transform', transform: 'nope' },
    { str: 'nan coords', transform: [1, 0, 0, 1, NaN, 10], width: 5 },
    { str: '   ', transform: [1, 0, 0, 1, 10, 10], width: 5 },
    { transform: [1, 0, 0, 1, 10, 10], width: 5 },
    42,
    'a string',
  ];
  assert.doesNotThrow(() => columnsFromTextItems(junk, 792));
  assert.deepEqual(columnsFromTextItems(junk, 792), [], 'nothing usable means no boundaries');
});

test('junk mixed into a real page does not stop it resolving', () => {
  const items = [null, { str: 'x' }, ...twoColumnPage(), undefined, { type: 'marker' }];
  assert.equal(columnsFromTextItems(items, 792).length, 1);
});

test('an empty page yields no boundaries rather than failing', () => {
  assert.deepEqual(columnsFromTextItems([], 792), []);
});

test('a missing or non-iterable list is handled before the entries are', () => {
  // The reported error — "undefined is not a function" pointing at the for-of —
  // is what a non-iterable gives you, so the list being absent was at least as
  // likely a cause as a malformed entry. Guarding only the entries would have
  // left the actual failure in place.
  for (const bad of [undefined, null, 42, 'items', {}, { length: 3 }]) {
    assert.doesNotThrow(() => columnsFromTextItems(bad, 792), `threw on ${JSON.stringify(bad)}`);
    assert.deepEqual(columnsFromTextItems(bad, 792), []);
  }
});

test('single-column text yields no boundary', () => {
  const items: unknown[] = [];
  for (let r = 0; r < 20; r++) items.push(item('one wide column of text', 55, 700 - r * 12, 500));
  assert.deepEqual(columnsFromTextItems(items, 792), []);
});
