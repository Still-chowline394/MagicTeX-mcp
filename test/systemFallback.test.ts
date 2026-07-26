import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemFallbackNote } from '../src/engine/systemTex.js';

// The case this exists for, taken from a real macOS install: a minimal BasicTeX
// lacked algorithm.sty, the system compile failed, and the agent quietly retried
// with the bundled engine and reported "Compile succeeded". The human had no way
// to know their own TeX had failed or that the PDF came from a subset.
test('names what failed, what produced the PDF instead, and how to fix it', () => {
  const note = systemFallbackNote({
    errors: ["LaTeX Error: File `algorithm.sty' not found."],
    missingPackages: ['algorithm'],
    missingClasses: [],
  });
  assert.match(note, /`algorithm` not found/);
  assert.match(note, /Fell back to the bundled WASM engine/);
  assert.match(note, /may not match Overleaf/, 'the fidelity caveat is the point');
  assert.match(note, /tlmgr install algorithms/, 'the package name is not the bundle name');
});

test('maps \\usepackage names to the CTAN bundle that actually installs', () => {
  // `tlmgr install algorithm` errors — the bundle is `algorithms`. Handing
  // someone a command that fails is worse than handing them nothing.
  const note = systemFallbackNote({
    errors: [], missingPackages: ['algorithm', 'algorithmic', 'algpseudocode'], missingClasses: [],
  });
  const cmd = note.match(/tlmgr install ([^\n]+)/)?.[1] ?? '';
  assert.equal(cmd, 'algorithms algorithmicx', 'deduplicated, and no bare "algorithm"');
});

test('passes through packages whose name already is the bundle', () => {
  const note = systemFallbackNote({ errors: [], missingPackages: ['svg', 'transparent'], missingClasses: [] });
  assert.match(note, /tlmgr install svg transparent/);
});

test('a missing class is reported alongside packages', () => {
  const note = systemFallbackNote({ errors: [], missingPackages: [], missingClasses: ['IEEEtran'] });
  assert.match(note, /`IEEEtran` not found/);
  assert.match(note, /tlmgr install ieeetran/, 'CTAN names it lowercase');
});

test('falls back to the first error when nothing identifiable is missing', () => {
  // latexmk can die for reasons that name no file — the note must still say
  // which toolchain produced the PDF rather than going silent.
  const note = systemFallbackNote({
    errors: ['! Emergency stop.'], missingPackages: [], missingClasses: [],
  });
  assert.match(note, /Emergency stop/);
  assert.match(note, /may not match Overleaf/);
  assert.doesNotMatch(note, /tlmgr install\s*$/m, 'no empty install command');
});

test('says nothing about tlmgr when there is nothing to install', () => {
  const note = systemFallbackNote({ errors: ['! Undefined control sequence.'], missingPackages: [], missingClasses: [] });
  assert.doesNotMatch(note, /tlmgr/);
});
