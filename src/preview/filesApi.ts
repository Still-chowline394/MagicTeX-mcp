// Source-panel file API: list/read/write the project's editable text files.
// Writes go straight to disk — the file watcher then recompiles and the WS
// reload refreshes the PDF, so "save in the browser editor" reuses the exact
// same live loop as any other edit (Claude's or an external editor's).
import { readdir, readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';

const TEXT_EXT = /\.(tex|bib|cls|sty|bst|cfg|clo|def|ldf|fd|bbx|cbx|lbx|txt|md)$/i;
// Figures/assets: shown in the tree (not editable) and allowed for upload.
const FIGURE_EXT = /\.(png|jpe?g|gif|pdf|eps|svg)$/i;
const isListable = (name: string) => TEXT_EXT.test(name) || FIGURE_EXT.test(name);
const isWritable = (name: string) => TEXT_EXT.test(name) || FIGURE_EXT.test(name);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.latex-preview', '.vscode', '__pycache__']);
const MAX_FILES = 500;
const MAX_FILE_BYTES = 4 * 1024 * 1024;  // 4 MB per LaTeX source
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB per uploaded figure

const toPosix = (p: string) => p.split(sep).join('/');

export async function listTextFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (out.length >= MAX_FILES) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        await walk(full);
      } else if (e.isFile() && TEXT_EXT.test(e.name)) {
        out.push(toPosix(relative(root, full)));
      }
    }
  }
  await walk(root);
  // main.tex first, then alphabetical — matches how people think about a project.
  return out.sort((a, b) => {
    const am = /(^|\/)main\.tex$/i.test(a) ? 0 : 1;
    const bm = /(^|\/)main\.tex$/i.test(b) ? 0 : 1;
    return am - bm || a.localeCompare(b);
  });
}

export interface TreeNode { name: string; path: string; type: 'file' | 'dir'; editable?: boolean; children?: TreeNode[] }

/** Nested tree of folders + editable text files and figure assets. */
export async function listTree(root: string): Promise<TreeNode[]> {
  async function walk(dir: string): Promise<TreeNode[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const nodes: TreeNode[] = [];
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = toPosix(relative(root, full));
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        nodes.push({ name: e.name, path: rel, type: 'dir', children: await walk(full) });
      } else if (e.isFile() && isListable(e.name)) {
        nodes.push({ name: e.name, path: rel, type: 'file', editable: TEXT_EXT.test(e.name) });
      }
    }
    // folders first, then main.tex, then alphabetical.
    return nodes.sort((a, b) =>
      (a.type === b.type ? 0 : a.type === 'dir' ? -1 : 1) ||
      (/^main\.tex$/i.test(a.name) ? -1 : /^main\.tex$/i.test(b.name) ? 1 : 0) ||
      a.name.localeCompare(b.name));
  }
  return walk(root);
}

/** Resolve a client path safely inside the root. `requireText` for edit ops. */
function guardPath(root: string, rel: string, requireText = false): string {
  const clean = String(rel).replace(/^[/\\]+/, '');
  if (!clean || clean.split(/[/\\]/).some((s) => s === '..' || s === '.')) throw new Error('invalid path');
  if (requireText && !TEXT_EXT.test(clean)) throw new Error('unsupported file type');
  const full = normalize(resolve(root, clean));
  const rootAbs = normalize(resolve(root)) + sep;
  if (!full.startsWith(rootAbs)) throw new Error('path outside project');
  if (SKIP_DIRS.has(clean.split(/[/\\]/)[0])) throw new Error('protected directory');
  return full;
}

const guard = (root: string, rel: string) => guardPath(root, rel, true);

export async function createTextFile(root: string, rel: string): Promise<void> {
  const full = guard(root, rel);
  if (await stat(full).then(() => true, () => false)) throw new Error('file already exists');
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, '', 'utf8');
}

export async function createDir(root: string, rel: string): Promise<void> {
  await mkdir(guardPath(root, rel), { recursive: true });
}

export async function renameEntry(root: string, from: string, to: string): Promise<void> {
  await mkdir(dirname(guardPath(root, to)), { recursive: true });
  await rename(guardPath(root, from), guardPath(root, to));
}

export async function deleteEntry(root: string, rel: string): Promise<void> {
  await rm(guardPath(root, rel), { recursive: true, force: true });
}

export async function readTextFile(root: string, rel: string): Promise<string> {
  return readFile(guard(root, rel), 'utf8');
}

export async function writeTextFile(root: string, rel: string, content: string): Promise<void> {
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) throw new Error('file too large');
  await writeFile(guard(root, rel), content, 'utf8');
}

/** Write an uploaded figure/asset (or text file) as raw bytes, guarded. */
export async function writeUpload(root: string, rel: string, data: Buffer): Promise<void> {
  const clean = String(rel).replace(/^[/\\]+/, '');
  if (!isWritable(clean)) throw new Error('unsupported file type');
  if (data.length > MAX_UPLOAD_BYTES) throw new Error('file too large (max 25 MB)');
  const full = guardPath(root, clean); // path safety (traversal / protected dirs)
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, data);
}
