// pdf.js 6.x calls Math.sumPrecise, a TC39 Stage 3 proposal that Safari ≤26.1
// and Chrome ≤146 do not implement. Calling an absent method reads as
//
//   TypeError: undefined is not a function
//
// which is what the PDF pane died with on a real paper.
//
// Loaded into BOTH scopes on purpose: a worker has its own global, so patching
// the main thread alone leaves the half that parses fonts still broken. See
// pdfWorker.ts.

/**
 * Sum an iterable more precisely than a running `+` does.
 *
 * Neumaier compensated summation over the finite values, with the non-finite
 * cases handled first. The first version of this did only the compensated part,
 * and returned NaN for every input that reached ±Infinity — measured:
 *
 *   sumPrecise([Infinity])        → NaN   (should be Infinity)
 *   sumPrecise([1e308, 1e308])    → NaN   (should be Infinity)
 *   sumPrecise([-0])              → +0    (should be -0)
 *
 * because once a partial sum is ±Infinity the compensation term is ∓Infinity,
 * and the final `sum + compensation` is NaN. Since this is installed on the
 * global Math and pdf.js sums glyph advances with it, a document with an
 * overflowing metric got NaN layout coordinates — text silently misplaced or
 * missing, rather than a clean failure.
 */
function sumPrecise(items: Iterable<number>): number {
  let sum = 0;
  let compensation = 0;
  let sawAny = false;
  let sawNaN = false;
  let sawPosInf = false;
  let sawNegInf = false;
  let sawFinite = false;
  // Signed zero has to be accumulated separately: the proposal returns -0 for
  // [-0] but +0 for [0, -0], and a running sum starting at +0 loses that.
  let zeros = -0;

  for (const item of items) {
    sawAny = true;
    const value = Number(item);
    if (Number.isNaN(value)) { sawNaN = true; continue; }
    if (value === Infinity) { sawPosInf = true; continue; }
    if (value === -Infinity) { sawNegInf = true; continue; }
    if (value === 0) { zeros += value; continue; }

    sawFinite = true;
    const next = sum + value;
    compensation += Math.abs(sum) >= Math.abs(value)
      ? (sum - next) + value
      : (value - next) + sum;
    sum = next;
  }

  if (!sawAny) return -0;                          // the proposal's empty case
  if (sawNaN || (sawPosInf && sawNegInf)) return NaN;
  if (sawPosInf) return Infinity;
  if (sawNegInf) return -Infinity;
  if (!sawFinite) return zeros;

  // Overflow during accumulation. The proposal sums exactly and rounds once, so
  // [MAX, MAX, -MAX] is MAX; Neumaier cannot recover from an intermediate
  // Infinity, and getting that right needs a full expansion sum. Saturating is a
  // deliberate, documented divergence — and returning ±Infinity for something
  // that overflowed is far better than the NaN this used to produce. See
  // test/mathSumPrecise.test.ts, which pins it.
  if (!Number.isFinite(sum)) return sum;
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
