import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findAnchor } from '../src/preview/anchorMatch.js';

const project = (main: string) => {
  const d = mkdtempSync(join(tmpdir(), 'am-'));
  writeFileSync(join(d, 'main.tex'), main);
  return d;
};

test('locates a prose quote at the right file:line', async () => {
  const d = project('\\documentclass{article}\n\\begin{document}\nThe quick brown fox jumps over the lazy dog here.\n\\end{document}\n');
  try {
    const a = await findAnchor(d, 'quick brown fox jumps over the lazy dog');
    assert.ok(a, 'expected a match');
    assert.equal(a!.file, 'main.tex');
    assert.equal(a!.line, 3);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('matches through LaTeX markup (ignores commands)', async () => {
  const d = project('\\documentclass{article}\n\\begin{document}\nWe find a \\textbf{large speedup} on the benchmark today.\n\\end{document}\n');
  try {
    const a = await findAnchor(d, 'large speedup on the benchmark');
    assert.ok(a);
    assert.equal(a!.line, 3);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('returns null for a quote that is not there', async () => {
  const d = project('\\documentclass{article}\n\\begin{document}\nHello world.\n\\end{document}\n');
  try {
    assert.equal(await findAnchor(d, 'nonexistent passage zzz qqq wibble'), null);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
