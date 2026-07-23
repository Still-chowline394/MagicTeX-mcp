// The one shared compile path: resolve main file -> gather project -> compile.
// Both the render_preview MCP tool and (later) the file watcher call this.
import { resolveMainFile } from './resolveMainFile.js';
import { collectProjectFiles } from './collectProjectFiles.js';
import { compile, type CompileOutput } from '../engine/browserHost.js';

export type Engine = 'xelatex' | 'pdflatex' | 'lualatex';

export interface CompileProjectResult extends CompileOutput {
  mainFile: string;
  engine: Engine;
  fileCount: number;
  truncated: boolean;
}

export interface CompileProjectOptions {
  projectRoot: string;
  mainFile?: string;
  engine?: Engine;
}

export async function compileProject(opts: CompileProjectOptions): Promise<CompileProjectResult> {
  const mainFile = await resolveMainFile(opts.projectRoot, opts.mainFile);
  const { files, truncated } = await collectProjectFiles(opts.projectRoot);

  const main = files.find((f) => f.path === mainFile || f.path.endsWith('/' + mainFile));
  const mainSrc = main?.content ?? '';
  const engine: Engine = opts.engine ?? detectEngine(mainSrc);

  // Enable a bib pass + reruns only when the document actually needs them —
  // avoids paying for extra passes on a simple doc.
  const hasBib = /\\(bibliography|addbibresource)\b/.test(mainSrc) || files.some((f) => f.path.endsWith('.bib'));
  const usesCite = /\\cite[a-zA-Z]*\s*\{/.test(mainSrc);
  const needsRerun = hasBib || /\\(ref|autoref|tableofcontents|label)\b/.test(mainSrc);
  const bibtex = hasBib && usesCite;

  const out = await compile(files, main ? main.path : mainFile, engine, { bibtex, rerun: needsRerun });

  return { ...out, mainFile, engine, fileCount: files.length, truncated };
}

// Pick an engine from the preamble: fontspec/unicode-math need xe/lua; otherwise
// default to xelatex (broadest font/UTF-8 support, matches modern Overleaf defaults).
function detectEngine(src: string): Engine {
  if (/\\usepackage\{(fontspec|unicode-math)\}/.test(src)) return 'xelatex';
  return 'xelatex';
}
