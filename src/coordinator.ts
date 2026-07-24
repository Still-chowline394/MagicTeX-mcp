// Single compile path shared by the render_preview tool (active) and the file
// watcher (passive). All compiles are serialized through one promise chain so a
// watcher-triggered compile and a tool-triggered compile never run at once, and
// each compile always reads the latest files off disk.
import { compileProject, type CompileProjectResult, type Engine } from './project/compileProject.js';
import { getPreview } from './engine/browserHost.js';

interface Config {
  projectRoot: string;
  mainFile?: string;
  engine?: Engine;
}

let config: Config | null = null;
let chain: Promise<CompileProjectResult | null> = Promise.resolve(null);

export function setConfig(next: Config): void {
  config = next;
}

async function doCompile(): Promise<CompileProjectResult> {
  if (!config) throw new Error('No project configured yet — call render_preview first.');
  const preview = await getPreview();
  preview.broadcast({ type: 'compiling' });
  const result = await compileProject(config);
  if (result.success && result.pdf) {
    preview.setLatestPdf(result.pdf, result.mainFile);
  } else {
    preview.broadcast({ type: 'compile-error', log: (result.log || result.error || 'compile failed').slice(-1800) });
  }
  return result;
}

/** Enqueue a compile; resolves with its result. Serialized against all others. */
export function requestCompile(): Promise<CompileProjectResult> {
  const next = chain.then(() => doCompile());
  // Keep the chain alive even if this compile rejects.
  chain = next.then(
    (r) => r,
    () => null,
  );
  return next;
}
