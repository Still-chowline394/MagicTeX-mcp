// Gather the project's compile inputs into the engine's file format.
//
// Design choice: rather than precisely following \input/\include chains (fragile
// with nested/relative/extensionless includes), we collect the whole project
// tree of relevant file types. That's what a real compile needs anyway and
// mirrors how Overleaf sees the full project. In-repo .cls/.sty/.bst are picked
// up automatically this way (e.g. acl.sty, llncs.cls), which the engine's bundled
// package set may not include.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { EngineFile } from '../engine/browserHost.js';

const TEXT_EXT = new Set(['.tex', '.bib', '.cls', '.sty', '.bst', '.cfg', '.clo', '.def', '.ldf', '.fd', '.bbx', '.cbx', '.lbx']);
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.eps', '.svg', '.ttf', '.otf', '.gif']);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.latex-preview', '.vscode', '__pycache__']);

const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 60 MB
const MAX_FILES = 800;

export interface CollectResult {
  files: EngineFile[];
  truncated: boolean;
  totalBytes: number;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

const toPosix = (p: string) => p.split(sep).join('/');

export function collectProjectFiles(projectRoot: string): Promise<CollectResult> {
  return walkProject(projectRoot, true);
}

/**
 * How big the project is, without reading any of it.
 *
 * The same tree and the same caps as `collectProjectFiles`, so the number it
 * reports means the same thing — but it only stats. The system backend hands
 * latexmk a directory and lets it read from disk, so collecting the contents
 * there was 32.4 MB read and discarded on every save of a real IEEE paper (the
 * cap is 60 MB), purely to be able to say "49 files" at the end.
 */
export async function countProjectFiles(projectRoot: string): Promise<{ count: number; truncated: boolean; totalBytes: number }> {
  const { count, truncated, totalBytes } = await walkProject(projectRoot, false);
  return { count, truncated, totalBytes };
}

async function walkProject(projectRoot: string, readContents: boolean): Promise<CollectResult & { count: number }> {
  const files: EngineFile[] = [];
  let count = 0;
  let totalBytes = 0;
  let truncated = false;

  async function walk(dir: string): Promise<void> {
    if (truncated) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (truncated) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        await walk(full);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = extOf(e.name);
      const isText = TEXT_EXT.has(ext);
      const isBin = BINARY_EXT.has(ext);
      if (!isText && !isBin) continue;

      const s = await stat(full).catch(() => null);
      if (!s) continue;
      // Counted rather than `files.length`, so the caps land in the same place
      // whether or not contents are being read — otherwise "how big is this
      // project" and "what did we send the engine" could disagree.
      if (count >= MAX_FILES || totalBytes + s.size > MAX_TOTAL_BYTES) { truncated = true; return; }
      count++;
      totalBytes += s.size;

      if (!readContents) continue;
      const rel = toPosix(relative(projectRoot, full));
      if (isText) {
        files.push({ path: rel, content: await readFile(full, 'utf8'), encoding: 'utf8' });
      } else {
        files.push({ path: rel, content: (await readFile(full)).toString('base64'), encoding: 'base64' });
      }
    }
  }

  await walk(projectRoot);
  return { files, truncated, totalBytes, count };
}
