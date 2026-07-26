// Grouping a page's text spans into visual lines, for highlight geometry.
//
// Extracted from PdfView so this can be checked against real PDF coordinates.
// That mattered: two plausible fixes for the two-column bug below passed a
// synthetic test and still left a real IEEE page painting highlights across the
// gutter.

export interface LineSpan {
  start: number;
  len: number;
  l: number;
  t: number;
  w: number;
  h: number;
}

export interface Line<S extends LineSpan> {
  t: number;
  b: number;
  l: number;
  r: number;
  spans: S[];
}

/**
 * Find the x positions where the page splits into columns.
 *
 * A column boundary is an x that almost no text crosses. "Almost" matters: a
 * full-width title or figure caption crosses the gutter, so requiring zero
 * crossings finds nothing on a real paper.
 *
 * Measuring crossings is what makes this work where a gap threshold could not.
 * On a real IEEE page the widest gap *inside* a line is 16.5pt while the
 * narrowest jump *across* the gutter is 11.9pt — the two populations overlap, so
 * no per-gap rule can separate them. Whether text crosses a given x is not a
 * matter of degree.
 */
function columnBoundaries(spans: LineSpan[]): number[] {
  if (spans.length < 20) return []; // too little text to infer a layout from
  const minX = Math.min(...spans.map((s) => s.l));
  const maxX = Math.max(...spans.map((s) => s.l + s.w));
  const width = maxX - minX;
  if (width <= 0) return [];

  const SAMPLES = 160;
  const profile: { x: number; crossings: number }[] = [];
  for (let i = 1; i < SAMPLES; i++) {
    const x = minX + (width * i) / SAMPLES;
    let crossings = 0;
    for (const s of spans) if (s.l < x && s.l + s.w > x) crossings++;
    profile.push({ x, crossings });
  }

  const peak = Math.max(...profile.map((p) => p.crossings));
  if (peak === 0) return [];
  // 10% of the busiest column tolerates a handful of full-width elements while
  // staying far below the density of actual body text.
  const quiet = Math.max(1, peak * 0.1);

  const runs: { from: number; to: number }[] = [];
  let cur: { from: number; to: number } | null = null;
  for (const p of profile) {
    if (p.crossings <= quiet) {
      cur ??= { from: p.x, to: p.x };
      cur.to = p.x;
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);

  // Runs touching either extreme are ragged margins, not gutters.
  return runs
    .filter((r) => r.from > minX + width * 0.15 && r.to < maxX - width * 0.15)
    .map((r) => (r.from + r.to) / 2);
}

/**
 * Group spans into visual lines.
 *
 * Vertically, "same line" means the new span's range overlaps the line's
 * accumulated range — which tolerates italic, math and superscript runs whose
 * boxes differ from roman text on the same baseline, while a real line break is
 * close to a full font-size and far bigger than any such overlap.
 *
 * But vertical overlap alone is not a line. In a two-column paper the columns
 * share every vertical band, so a left-column line and a right-column line at
 * the same height became one group running from the left column's left edge to
 * the right column's right edge. Highlights draw their interior lines flush
 * across the line, so the highlight jumped the gutter and covered unrelated
 * text — which is what a reader saw on a real IEEE paper.
 *
 * So spans are assigned to a column first, and grouped into lines within it.
 * Spans that straddle a boundary (a full-width title, a wide figure caption)
 * are their own group, since they really do span the page.
 */
export function groupLines<S extends LineSpan>(spans: S[]): Line<S>[] {
  const boundaries = columnBoundaries(spans);

  const columnOf = (s: S): number => {
    for (const b of boundaries) if (s.l < b && s.l + s.w > b) return -1; // straddles
    let i = 0;
    for (const b of boundaries) if (s.l + s.w / 2 > b) i++;
    return i;
  };

  const byColumn = new Map<number, S[]>();
  for (const s of spans) {
    const c = columnOf(s);
    (byColumn.get(c) ?? byColumn.set(c, []).get(c)!).push(s);
  }

  const out: Line<S>[] = [];
  for (const group of byColumn.values()) {
    const sorted = [...group].sort((a, b) => a.t - b.t || a.l - b.l);
    for (const s of sorted) {
      const cur = out[out.length - 1];
      const sameGroup = cur && cur.spans[0] !== undefined && group.includes(cur.spans[0]);
      const overlap = sameGroup ? Math.min(s.t + s.h, cur.b) - Math.max(s.t, cur.t) : -1;
      if (sameGroup && overlap > Math.min(s.h, cur.b - cur.t) * 0.3) {
        cur.l = Math.min(cur.l, s.l);
        cur.r = Math.max(cur.r, s.l + s.w);
        cur.t = Math.min(cur.t, s.t);
        cur.b = Math.max(cur.b, s.t + s.h);
        cur.spans.push(s);
      } else {
        out.push({ t: s.t, b: s.t + s.h, l: s.l, r: s.l + s.w, spans: [s] });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t || a.l - b.l);
}
