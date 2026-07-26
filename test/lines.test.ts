import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupLines, type LineSpan } from '../ui/src/lines.js';

// Geometry of an IEEE two-column page in points: 612 wide, two ~250pt columns
// with an ~18pt gutter. Only the numbers the grouping looks at.
const COL_L = 55, COL_L_W = 245;
const COL_R = 318, COL_R_W = 245;
const H = 10, LEAD = 12;

let seq = 0;
const span = (l: number, t: number, w: number): LineSpan => ({ start: seq++ * 10, len: 8, l, t, w, h: H });

/**
 * A page of body text in `cols` columns, `rows` lines deep.
 *
 * Each line is two style runs, as pdfjs emits them — and the break between them
 * moves from line to line. That jitter is not decoration: with every line
 * breaking at the same x, the fixture manufactures a text-free vertical band
 * that is indistinguishable from a real gutter, and the layout detection
 * correctly splits there. Real prose never lines its runs up that way.
 */
function page(cols: { l: number; w: number }[], rows: number, top = 100): LineSpan[] {
  const out: LineSpan[] = [];
  for (let r = 0; r < rows; r++) {
    for (const c of cols) {
      const split = 0.35 + ((r * 7) % 11) / 30; // 0.35 … 0.68 of the column
      out.push(span(c.l, top + r * LEAD, c.w * split));
      out.push(span(c.l + c.w * (split + 0.02), top + r * LEAD + 0.4, c.w * (0.98 - split)));
    }
  }
  return out;
}

const TWO_COL = [{ l: COL_L, w: COL_L_W }, { l: COL_R, w: COL_R_W }];

/** The grouping as it stood before columns were considered. Kept so the tests
 *  can show they catch something rather than passing against both. */
function verticalOnly(spans: LineSpan[]) {
  const sorted = [...spans].sort((a, b) => a.t - b.t || a.l - b.l);
  const lines: { t: number; b: number; l: number; r: number }[] = [];
  for (const s of sorted) {
    const c = lines[lines.length - 1];
    const ov = c ? Math.min(s.t + s.h, c.b) - Math.max(s.t, c.t) : -1;
    if (c && ov > Math.min(s.h, c.b - c.t) * 0.3) {
      c.l = Math.min(c.l, s.l); c.r = Math.max(c.r, s.l + s.w);
      c.t = Math.min(c.t, s.t); c.b = Math.max(c.b, s.t + s.h);
    } else lines.push({ t: s.t, b: s.t + s.h, l: s.l, r: s.l + s.w });
  }
  return lines;
}

const crossesGutter = (L: { l: number; r: number }) => L.l < COL_L + COL_L_W && L.r > COL_R;

test('no line spans the gutter on a two-column page', () => {
  const lines = groupLines(page(TWO_COL, 20));
  assert.equal(lines.filter(crossesGutter).length, 0);
  assert.equal(lines.length, 40, 'twenty rows x two columns');
});

test('...and the old grouping merged every row across it, which is the bug', () => {
  // Highlights draw interior lines flush from L.l to L.r, so a line spanning
  // both columns paints a band over unrelated text in the other column.
  const before = verticalOnly(page(TWO_COL, 20));
  assert.ok(before.filter(crossesGutter).length > 0, 'the fixture must reproduce it');
  assert.equal(before.length, 20, 'each pair of column lines collapsed into one');
});

test('a full-width title stays one line and does not defeat detection', () => {
  // A title crossing the gutter is why the boundary is "almost no text crosses"
  // rather than "none": requiring zero crossings finds nothing on a real paper.
  const spans = [span(120, 60, 372), ...page(TWO_COL, 20)];
  const lines = groupLines(spans);
  const wide = lines.filter((L) => L.r - L.l > 300);
  assert.equal(wide.length, 1, 'exactly the title');
  assert.equal(wide[0].t, 60);
  assert.equal(lines.filter(crossesGutter).filter((L) => L.t > 90).length, 0, 'body text still split');
});

test('single-column text is unaffected', () => {
  const lines = groupLines(page([{ l: COL_L, w: 500 }], 20));
  assert.equal(lines.length, 20);
  for (const L of lines) assert.equal(L.l, COL_L);
});

test('three columns split three ways', () => {
  const lines = groupLines(page([{ l: 40, w: 150 }, { l: 230, w: 150 }, { l: 420, w: 150 }], 15));
  assert.equal(lines.length, 45);
});

test('runs within one line still merge — the normal case must not regress', () => {
  // pdfjs emits a span per style run, so one sentence with an italic phrase
  // arrives as several adjacent spans.
  const lines = groupLines(page([{ l: COL_L, w: 500 }], 20));
  assert.ok(lines.every((L) => L.spans.length === 2), 'both runs on each line grouped');
});

test('a superscript joins the line it sits on', () => {
  // Citation marks have a different box on the same baseline; the vertical
  // tolerance exists for these and must survive column splitting.
  const spans = page([{ l: COL_L, w: 400 }], 20);
  spans.push({ start: 9999, len: 3, l: COL_L + 402, t: 100 - 3, w: 10, h: 6 });
  const lines = groupLines(spans);
  const first = lines.find((L) => L.t <= 100)!;
  assert.ok(first.r >= COL_L + 412, 'the superscript extended the first line');
});

test('too little text to infer a layout is left alone', () => {
  // Two spans are not a page. Guessing a column boundary from them would split
  // a heading and its page number into separate "lines" for no reason.
  const lines = groupLines([span(COL_L, 100, 240), span(COL_R, 100, 240)]);
  assert.equal(lines.length, 1);
});
