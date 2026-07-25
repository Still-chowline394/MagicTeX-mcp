// Optional real-TeX backend: compile with a locally installed TeX Live via
// latexmk, for 100% package fidelity (the WASM engine ships a subset). Off by
// default — the WASM engine stays the zero-install path. Selected with backend
// 'system' (force) or 'auto' (use it when available, else fall back to WASM).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { CompileOutput } from './browserHost.js';
import type { Engine } from '../project/compileProject.js';

const pexec = promisify(execFile);

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
