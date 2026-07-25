// Text-match "SyncTeX" — the WASM engine can't emit a real .synctex map, so we
// jump between the PDF and the source by matching the visible words. Works well
// for prose (most of a paper); LaTeX-only lines (commands, math) simply won't
// find a match, which is fine — nothing jumps.

/** Lowercase, drop everything but words, collapse runs to single spaces. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Strip LaTeX so a source line reduces to its rendered prose. */
export function stripLatex(line: string): string {
  return line
    .replace(/%.*$/, '')            // comments
    .replace(/\\[a-zA-Z@]+\*?/g, ' ') // \commands
    .replace(/[{}$&~^_\\]/g, ' ')   // markup punctuation
    .replace(/\[[^\]]*\]/g, ' ')    // optional args
    .trim();
}

/** First `maxWords` normalized words of a string (a distinctive phrase). */
export function phrase(text: string, maxWords = 6): string {
  return normalize(text).split(' ').filter(Boolean).slice(0, maxWords).join(' ');
}
