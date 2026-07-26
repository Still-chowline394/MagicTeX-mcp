import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCompile, blockedToolHelp } from '../src/engine/compileLog.js';

// Verbatim from a user's failing paper. Detection written against this rather
// than from memory: a pattern that doesn't match is a feature that silently
// doesn't exist, and the user spent half an hour on this one unaided.
const REAL_SVG_LOG = String.raw`
wasn't possible to launch the Inkscape export
(svg)                for ` + '`' + String.raw`fig/Fed_CMA architecture diagram2.svg' on input line 113.

! Package svg Error: File ` + '`' + String.raw`Fed_CMA architecture diagram2_svg-tex.pdf' is missing.

See the svg package documentation for explanation.
Did you run the export with Inkscape? There's no file
` + '`' + String.raw`./svg-inkscape/Fed_CMA architecture diagram2_svg-tex.pdf'
`;

test('the real svg failure is recognised as a blocked tool', () => {
  const v = classifyCompile(REAL_SVG_LOG, 30416);
  assert.deepEqual(v.blockedTools, ['Inkscape']);
});

test('a clean log reports no blocked tools', () => {
  // Otherwise every successful compile would carry an explanation for a
  // problem it doesn't have.
  const v = classifyCompile('This is XeTeX\nOutput written on main.pdf (7 pages)\n', 30416);
  assert.deepEqual(v.blockedTools, []);
});

test('a refused \\write18 is caught even without a package saying so', () => {
  // gnuplottex and friends produce no branded error — only TeX's own line.
  const v = classifyCompile('runsystem(gnuplot main.gnuplot)...disabled\n', 100);
  assert.deepEqual(v.blockedTools, ['an external program']);
});

test('wasm is told the flag cannot help, because it cannot', () => {
  // The bundled engine has no subprocesses. Telling this reader to enable
  // shell-escape is the same mistake as naming latexmk and stopping.
  const h = blockedToolHelp(['Inkscape'], 'wasm', false);
  assert.match(h, /cannot run external programs at all/);
  assert.match(h, /no flag will enable it/);
  assert.match(h, /\\includegraphics/, 'the route that actually works comes first');
});

test('system without the flag is told how to turn it on, and what it costs', () => {
  const h = blockedToolHelp(['Inkscape'], 'system', false);
  assert.match(h, /shellEscape: true/);
  assert.match(h, /execute shell commands/, 'the risk is stated, not buried');
  assert.match(h, /sources you trust/);
});

test('system WITH the flag is told the tool is probably missing', () => {
  // Repeating "enable shell-escape" to someone who already did is the dead end
  // this whole class of message keeps falling into.
  const h = blockedToolHelp(['Inkscape'], 'system', true);
  assert.match(h, /isn't installed or isn't on PATH/);
  assert.doesNotMatch(h, /shellEscape: true/);
});

test('no blocked tools means no advice at all', () => {
  assert.equal(blockedToolHelp([], 'wasm', false), '');
  assert.equal(blockedToolHelp([], 'system', true), '');
});
