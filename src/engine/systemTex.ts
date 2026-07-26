// Real-TeX backend: compile with a locally installed TeX Live via latexmk, for
// 100% package fidelity (the WASM engine ships a subset). Used by default under
// backend 'auto' when a local TeX is present; 'system' forces it, 'wasm' opts
// out and keeps the zero-install path.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { CompileOutput } from './browserHost.js';
import type { Engine } from '../project/compileProject.js';

const pexec = promisify(execFile);

/**
 * What to tell someone who turns out not to have a local TeX.
 *
 * Naming `latexmk` on its own actively misleads: it is not separately
 * installable, it is a Perl driver that ships inside TeX Live. Someone reading
 * "latexmk was not found" goes looking for a package by that name and finds
 * nothing that helps — this happened, and the user came back asking whether they
 * needed "latexmk or the mactex pkg". So name the distribution instead, and say
 * plainly that they may not need one at all.
 */
export const INSTALL_TEX_HELP = [
  "latexmk isn't installed on its own — it ships with a TeX distribution:",
  '  macOS    MacTeX          https://tug.org/mactex/',
  '  Linux    texlive-full    (via your package manager)',
  '  Windows  TeX Live        https://tug.org/texlive/',
  '',
  "You don't need one to use MagicTeX: the bundled WASM engine compiles with no",
  'install at all. But it is a subset of TeX Live, so packages like `svg` and most',
  "venue classes aren't in it. Install a distribution when you need output that",
  'matches Overleaf exactly.',
].join('\n');

let cached: 'latexmk' | null | undefined;

/** Is a usable local TeX (latexmk) on PATH? Cached after the first check. */
export async function hasSystemTex(): Promise<boolean> {
  if (cached !== undefined) return cached !== null;
  try {
    await pexec('latexmk', ['-version'], { timeout: 6000 });
    cached = 'latexmk';
  } catch {
    cached = null;
  }
  return cached !== null;
}

const ENGINE_FLAG: Record<Engine, string> = {
  xelatex: '-xelatex', lualatex: '-lualatex', pdflatex: '-pdf',
};

/** Compile `mainRelPath` (relative to `root`) with local latexmk; artifacts go
 *  under .latex-preview/build so the project tree stays clean. */
export async function compileWithSystemTex(root: string, mainRelPath: string, engine: Engine): Promise<CompileOutput> {
  const started = Date.now();
  const outdir = join(root, '.latex-preview', 'build');
  await mkdir(outdir, { recursive: true });
  const args = [ENGINE_FLAG[engine] ?? '-pdf', '-interaction=nonstopmode', '-file-line-error', `-outdir=${outdir}`, mainRelPath];
  try {
    const { stdout, stderr } = await pexec('latexmk', args, { cwd: root, timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
    const pdfPath = join(outdir, basename(mainRelPath).replace(/\.tex$/i, '') + '.pdf');
    const pdf = new Uint8Array(await readFile(pdfPath));
    return { success: true, exitCode: 0, pdf, pdfLen: pdf.length, log: stdout + stderr, ms: Date.now() - started };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number; message?: string };
    const log = (err.stdout ?? '') + (err.stderr ?? err.message ?? 'latexmk failed');
    return { success: false, exitCode: err.code ?? 1, pdf: undefined, pdfLen: 0, log, ms: Date.now() - started, error: 'system latexmk compile failed' };
  }
}
