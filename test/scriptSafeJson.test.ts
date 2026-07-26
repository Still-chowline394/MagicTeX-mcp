import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptSafeJson } from '../src/preview/scriptSafeJson.js';
import { diffViewHtml } from '../src/preview/diffViewPage.js';

// `JSON.stringify` does not escape `</script>`. The diff page embeds a git diff
// — the user's own file contents — inside an inline <script>, so one line in a
// .tex or .bib file could end the script element and run as markup on the
// preview server's origin, where the whole file API lives. show_diff triggers it.
//
// This test exists because the fix is invisible to reading. Writing '<' where
// '\\u003c' is meant replaces `<` with `<` and the function becomes a no-op that
// still looks right — that happened twice while writing it. And a regex literal
// holding a raw U+2028 is a syntax error that `tsc --noEmit` accepted and only
// esbuild caught.

// Built by code point: typing these raw would be invisible here too.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

const PAYLOAD = '+ some text </script><img src=x onerror=alert(1)>';

test('the raw closing tag never survives into the output', () => {
  const out = scriptSafeJson(PAYLOAD);
  assert.ok(!out.includes('</script'), `raw </script in: ${out}`);
  assert.ok(!out.includes('<'), `an unescaped < survived: ${out}`);
});

test('the escape is the six-character sequence, not the character itself', () => {
  // The whole point. If the replacement produced '<', this assertion is the only
  // thing between a green suite and a live XSS.
  const out = scriptSafeJson('<');
  assert.equal(out, '"\\u003c"');
  assert.equal(out.length, 8, 'expected a quote, six escape characters, a quote');
});

test('JavaScript reads the escaped form back as the original string', () => {
  // Escaping is worthless if it changes the value.
  for (const s of [PAYLOAD, '<<<', 'plain text', '', 'a "quoted" \\ mess', 'ünïcødé']) {
    assert.equal(JSON.parse(scriptSafeJson(s)), s, `round-trip failed for ${JSON.stringify(s)}`);
  }
});

test('JS line terminators are escaped — they would end the literal', () => {
  const input = `a${LS}b${PS}c`;
  const out = scriptSafeJson(input);
  assert.ok(!out.includes(LS), 'raw U+2028 survived');
  assert.ok(!out.includes(PS), 'raw U+2029 survived');
  assert.equal(JSON.parse(out), input);
});

test('the diff page itself is not injectable', () => {
  const html = diffViewHtml(PAYLOAD);
  const at = html.indexOf('</script><img');
  assert.equal(at, -1, `raw </script> reached the page at ${at}`);

  // And the page is still well-formed — proving the escaping did not simply
  // mangle it into something that renders nothing.
  assert.equal((html.match(/<\/script>/g) ?? []).length, 2, 'expected the diff2html tag and the inline one');
  assert.match(html, /window\.__rendered = true/);
});

test('an empty diff still produces a well-formed page', () => {
  const html = diffViewHtml('');
  assert.match(html, /window\.__empty = true/);
  assert.equal((html.match(/<\/script>/g) ?? []).length, 2);
});
