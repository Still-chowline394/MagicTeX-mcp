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

export async function collectProjectFiles(projectRoot: string): Promise<CollectResult> {
  const files: EngineFile[] = [];
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
      if (files.length >= MAX_FILES || totalBytes + s.size > MAX_TOTAL_BYTES) { truncated = true; return; }

      const rel = toPosix(relative(projectRoot, full));
      if (isText) {
        files.push({ path: rel, content: await readFile(full, 'utf8'), encoding: 'utf8' });
      } else {
        files.push({ path: rel, content: (await readFile(full)).toString('base64'), encoding: 'base64' });
      }
      totalBytes += s.size;
    }
  }

  await walk(projectRoot);
  return { files, truncated, totalBytes };
}
