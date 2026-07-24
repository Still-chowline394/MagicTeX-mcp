// LiquidText-style anchored comments, stored per-project in
// .latex-preview/comments.json. The anchor is a page number + the quoted text +
// its bounding rects at scale 1, so highlights re-project at any zoom. The dir
// is already ignored by the file watcher and the project collector, so comment
// writes never trigger recompiles or end up in export zips.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface CommentRect { x: number; y: number; w: number; h: number }

export interface Comment {
  id: string;
  page: number;
  quote: string;
  rects: CommentRect[];
  text: string;
  status: 'pending' | 'resolved';
  created: string;
  resolvedNote?: string;
  resolvedAt?: string;
}

const FILE = 'comments.json';

function storePath(root: string): string {
  return join(root, '.latex-preview', FILE);
}

export async function listComments(root: string): Promise<Comment[]> {
  try {
    const raw = await readFile(storePath(root), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function save(root: string, comments: Comment[]): Promise<void> {
  await mkdir(join(root, '.latex-preview'), { recursive: true });
  await writeFile(storePath(root), JSON.stringify(comments, null, 2), 'utf8');
}

export async function addComment(
  root: string,
  input: { page: number; quote: string; rects: CommentRect[]; text: string },
): Promise<Comment> {
  const comment: Comment = {
    id: randomBytes(6).toString('hex'),
    page: Math.max(1, Math.floor(input.page)),
    quote: String(input.quote).slice(0, 600),
    rects: (input.rects ?? []).slice(0, 40).map((r) => ({ x: +r.x, y: +r.y, w: +r.w, h: +r.h })),
    text: String(input.text).slice(0, 4000),
    status: 'pending',
    created: new Date().toISOString(),
  };
  const all = await listComments(root);
  all.push(comment);
  await save(root, all);
  return comment;
}

export async function updateComment(
  root: string,
  id: string,
  patch: { status?: 'pending' | 'resolved'; resolvedNote?: string; text?: string },
): Promise<Comment | null> {
  const all = await listComments(root);
  const c = all.find((x) => x.id === id);
  if (!c) return null;
  if (patch.text !== undefined) c.text = String(patch.text).slice(0, 4000);
  if (patch.status) {
    c.status = patch.status;
    if (patch.status === 'resolved') c.resolvedAt = new Date().toISOString();
    else { delete c.resolvedAt; delete c.resolvedNote; }
  }
  if (patch.resolvedNote !== undefined) c.resolvedNote = String(patch.resolvedNote).slice(0, 2000);
  await save(root, all);
  return c;
}

export async function deleteComment(root: string, id: string): Promise<boolean> {
  const all = await listComments(root);
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return false;
  await save(root, next);
  return true;
}
