// pdf.js 6.x calls Math.sumPrecise, a TC39 Stage 3 proposal that Safari does not
// implement. Safari's wording for calling an absent method is
//
//   TypeError: undefined is not a function
//
// which is exactly what the PDF pane died with on a real paper — a blank pane,
// no pages, no preview. Chrome logs the same failure but only as a warning,
// which is why it looked like a document-specific bug for three rounds of
// wrong guesses.
//
// Loaded into BOTH scopes on purpose: a worker has its own global, so patching
// the main thread alone leaves the half that parses fonts still broken. See
// pdfWorker.ts.
//
// Neumaier compensated summation. pdf.js sums glyph advances, where plain
// addition drifts; this keeps the low-order bits the proposal exists to keep.
function sumPrecise(items: Iterable<number>): number {
  let sum = 0;
  let compensation = 0;
  let sawAny = false;
  for (const item of items) {
    sawAny = true;
    const value = Number(item);
    const next = sum + value;
    compensation += Math.abs(sum) >= Math.abs(value)
      ? (sum - next) + value
      : (value - next) + sum;
    sum = next;
  }
  // The proposal returns -0 for an empty iterable, not 0.
  if (!sawAny) return -0;
  return sum + compensation;
}

declare global {
  interface Math {
    sumPrecise?: (items: Iterable<number>) => number;
  }
}

if (typeof Math.sumPrecise !== 'function') {
  Object.defineProperty(Math, 'sumPrecise', {
    value: sumPrecise,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

export { sumPrecise };
