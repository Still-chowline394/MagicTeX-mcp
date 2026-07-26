// The one shared compile path: resolve main file -> gather project -> compile.
// Both the render_preview MCP tool and (later) the file watcher call this.
import { resolveMainFile } from './resolveMainFile.js';
import { collectProjectFiles } from './collectProjectFiles.js';
import { getFallbackStyles } from '../engine/fallbackStyles.js';
import { compile, type CompileOutput } from '../engine/browserHost.js';
import { hasSystemTex, compileWithSystemTex } from '../engine/systemTex.js';
import { classifyCompile, stubPackage, usesPackage, type CompileVerdict } from '../engine/compileLog.js';

export type Engine = 'xelatex' | 'pdflatex' | 'lualatex';
// Which compiler runs: 'wasm' (bundled busytex, zero-install; default),
// 'system' (local latexmk, full fidelity), or 'auto' (system if present else wasm).
export type Backend = 'wasm' | 'system' | 'auto';

export interface CompileProjectResult extends CompileOutput {
  mainFile: string;
  engine: Engine;
  backend: 'wasm' | 'system';
  fileCount: number;
  truncated: boolean;
  /** What the TeX log says actually happened (wasm backend). */
  verdict?: CompileVerdict;
  /** Missing packages stubbed out to get past a stale \usepackage. */
  stubbedPackages?: string[];
}

export interface CompileProjectOptions {
  projectRoot: string;
  mainFile?: string;
  engine?: Engine;
  backend?: Backend;
}

export async function compileProject(opts: CompileProjectOptions): Promise<CompileProjectResult> {
  const mainFile = await resolveMainFile(opts.projectRoot, opts.mainFile);
  const { files, truncated } = await collectProjectFiles(opts.projectRoot);

  // Inject bundled fallback .sty for packages busytex omits — but only those the
  // project doesn't already ship (a project's own copy always wins).
  const present = new Set(files.map((f) => f.path.split('/').pop()));
  const fallbacks = (await getFallbackStyles()).filter((f) => !present.has(f.path));
  const allFiles = fallbacks.length ? [...files, ...fallbacks] : files;

  const main = allFiles.find((f) => f.path === mainFile || f.path.endsWith('/' + mainFile));
  const mainSrc = main?.content ?? '';
  const engine: Engine = opts.engine ?? detectEngine(mainSrc);

  // Real-TeX backend: when forced ('system') or available under 'auto', latexmk
  // compiles the on-disk project directly — full package fidelity, no fallback
  // shims. 'system' with no local TeX is a clear error rather than a silent WASM
  // fallback (so the user knows their choice couldn't be honored).
  //
  // 'auto' is the default. The zero-install promise was that you don't *need* a
  // local TeX, not that we'd decline to use one: defaulting to wasm meant someone
  // with MacTeX on PATH silently got the bundled subset — no venue classes, no
  // `svg` — and output that doesn't match Overleaf, without ever being told a
  // better compiler was sitting right there.
  const backend: Backend = opts.backend ?? 'auto';
  const wantSystem = backend === 'system' || (backend === 'auto' && (await hasSystemTex()));
  if (wantSystem) {
    if (backend === 'system' && !(await hasSystemTex())) {
      return { success: false, pdf: undefined, pdfLen: 0, log: '', ms: 0, error: 'backend "system" requested but no local TeX (latexmk) was found on PATH.', mainFile, engine, backend: 'system', fileCount: files.length, truncated };
    }
    const out = await compileWithSystemTex(opts.projectRoot, main ? main.path : mainFile, engine);
    return { ...out, mainFile, engine, backend: 'system', fileCount: files.length, truncated };
  }

  // Enable a bib pass + reruns only when the document actually needs them —
  // avoids paying for extra passes on a simple doc.
  const hasBib = /\\(bibliography|addbibresource)\b/.test(mainSrc) || allFiles.some((f) => f.path.endsWith('.bib'));
  const usesCite = /\\cite[a-zA-Z]*\s*\{/.test(mainSrc);
  const needsRerun = hasBib || /\\(ref|autoref|tableofcontents|label)\b/.test(mainSrc);
  const bibtex = hasBib && usesCite;

  let out = await compile(allFiles, main ? main.path : mainFile, engine, { bibtex, rerun: needsRerun });
  let verdict = classifyCompile(out.log ?? '', out.pdfLen);
  let stubbed: string[] = [];

  // A `\usepackage` the bundled TeX Live lacks halts the whole document — even
  // when nothing in it uses that package, which is the usual case for an import
  // left behind after its figures or code were removed. Stub those and retry
  // once, so a stale line in the preamble can't cost the author their preview.
  // Packages the source really does use are left alone: failing is better than
  // silently rendering something different from what they wrote.
  if (verdict.fatal && verdict.missingPackages.length) {
    const unused = verdict.missingPackages.filter((p) => !usesPackage(p, mainSrc));
    if (unused.length) {
      const stubs = unused.map((p) => ({ path: `${p}.sty`, content: stubPackage(p), encoding: 'utf8' as const }));
      const retryOut = await compile([...allFiles, ...stubs], main ? main.path : mainFile, engine, { bibtex, rerun: needsRerun });
      const retryVerdict = classifyCompile(retryOut.log ?? '', retryOut.pdfLen);
      // Keep the retry only if it actually got further; otherwise report the
      // original failure, which is the more informative one.
      if (retryVerdict.usable || !retryVerdict.fatal) {
        out = retryOut;
        verdict = retryVerdict;
        stubbed = unused;
      }
    }
  }

  return {
    ...out,
    // busytex says success even when LaTeX stopped on an error; the log is the
    // only honest signal. Downstream uses this to decide whether to replace the
    // reader's PDF and whether to write a checkpoint.
    success: verdict.usable,
    verdict,
    stubbedPackages: stubbed,
    mainFile,
    engine,
    backend: 'wasm',
    fileCount: files.length,
    truncated,
  };
}

// Pick an engine from the preamble: fontspec/unicode-math need xe/lua; otherwise
// default to xelatex (broadest font/UTF-8 support, matches modern Overleaf defaults).
function detectEngine(src: string): Engine {
  if (/\\usepackage\{(fontspec|unicode-math)\}/.test(src)) return 'xelatex';
  return 'xelatex';
}
