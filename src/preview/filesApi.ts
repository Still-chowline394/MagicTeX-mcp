// Source-panel file API: list/read/write the project's editable text files.
// Writes go straight to disk — the file watcher then recompiles and the WS
// reload refreshes the PDF, so "save in the browser editor" reuses the exact
// same live loop as any other edit (Claude's or an external editor's).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, normalize, relative, resolve, sep } from 'node:path';

const TEXT_EXT = /\.(tex|bib|cls|sty|bst|cfg|clo|def|ldf|fd|bbx|cbx|lbx|txt|md)$/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', '.latex-preview', '.vscode', '__pycache__']);
const MAX_FILES = 500;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB per file is plenty for LaTeX sources

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

/** Resolve a client-supplied relative path safely inside the project root. */
function guard(root: string, rel: string): string {
  if (!TEXT_EXT.test(rel)) throw new Error('unsupported file type');
  const full = normalize(resolve(root, rel));
  const rootAbs = normalize(resolve(root)) + sep;
  if (!full.startsWith(rootAbs)) throw new Error('path outside project');
  return full;
}

export async function readTextFile(root: string, rel: string): Promise<string> {
  return readFile(guard(root, rel), 'utf8');
}

export async function writeTextFile(root: string, rel: string, content: string): Promise<void> {
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) throw new Error('file too large');
  await writeFile(guard(root, rel), content, 'utf8');
}
