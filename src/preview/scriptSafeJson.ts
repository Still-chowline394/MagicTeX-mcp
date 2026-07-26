// Characters built by code point rather than typed.
//
// U+2028 and U+2029 are line terminators in JavaScript, so a regex literal
// containing the raw character is a syntax error — "Unterminated regular
// expression" — and the raw character is invisible in an editor either way.
// `tsc --noEmit` accepted such a file; only esbuild rejected it, which is a
// reminder that a green typecheck is not a parse.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * JSON safe to embed inside an inline `<script>` element.
 *
 * `JSON.stringify` escapes quotes but NOT `</script>` — verified:
 *
 *     JSON.stringify('x </script><img src=x onerror=alert(1)>')
 *     → "x </script><img src=x onerror=alert(1)>"
 *
 * The HTML parser sees that closing tag before any JavaScript runs, ends the
 * script element, and treats what follows as markup. Where the embedded string
 * comes from the user's own project — a git diff, a filename — one line in a
 * `.tex` or `.bib` file becomes script execution on the preview server's origin,
 * with the whole file API (read, write, delete) reachable from it. Such a line
 * arrives easily enough: a cloned LaTeX template, a co-author's commit, a bib
 * entry pasted off a website.
 *
 * Each replacement emits a six-character sequence — a backslash followed by
 * `u003c` — which JavaScript reads back as the original character inside a
 * string literal and which the HTML parser cannot read as a tag. Note the
 * doubled backslash in the source. Writing a single one produces the character
 * `<` itself, so the function replaces `<` with `<`: a no-op that still reads
 * correctly. That mistake was made twice while writing this, which is why
 * test/scriptSafeJson.test.ts asserts the exact output rather than trusting it.
 */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .split(LINE_SEPARATOR).join('\\u2028')
    .split(PARAGRAPH_SEPARATOR).join('\\u2029');
}
