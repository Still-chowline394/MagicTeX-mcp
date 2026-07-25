// LiquidText-style anchored comments, stored per-project in
// .latex-preview/comments.json. The anchor is a page number + the quoted text +
// its bounding rects at scale 1, so highlights re-project at any zoom. The dir
// is already ignored by the file watcher and the project collector, so comment
// writes never trigger recompiles or end up in export zips.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { withLock } from '../lock.js';

export interface CommentRect { x: number; y: number; w: number; h: number }

// Status flow for the review workflow:
//   suggested — a reviewer agent proposed it; awaits the human's accept
//   accepted  — actionable (human comments start here); the author loop acts on these
//   resolved  — an author agent addressed it, with a note
// Renamed from 'pending' (confusingly read as "still awaiting your decision"
// when it actually meant the opposite: you already decided, the author hasn't
// acted yet) — this collision fooled both users and Claude's own summaries.
export type CommentStatus = 'suggested' | 'accepted' | 'resolved';
// Who raised a comment or wrote a reply. reviewer/defender are review agents;
// author is the revising agent; human is you.
export type CommentRole = 'human' | 'reviewer' | 'defender' | 'author';

export interface Reply { by: CommentRole; text: string; at: string }

export interface Comment {
  id: string;
  page: number;
  quote: string;
  rects: CommentRect[];
  text: string;
  status: CommentStatus;
  role?: CommentRole; // who raised it (default human)
  replies?: Reply[];  // a thread of follow-ups (human ↔ agents)
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
    if (!Array.isArray(parsed)) return [];
    // One-time upgrade for files written before the 'pending'->'accepted' rename
    // (see the CommentStatus comment above) — normalize on read and persist so
    // this only runs once per file.
    //
    // Shape is normalized here as well. This file is plain JSON sitting in the
    // user's project: it can be hand-edited, written by an older version, or
    // produced directly by an agent. Returning it as Comment[] unchecked is a
    // claim the type system cannot verify, and one missing `rects` was enough
    // to take down the whole PDF pane. Guarantee the array fields exist once,
    // here, instead of defending at every read site.
    let migrated = false;
    for (const c of parsed) {
      if (c?.status === 'pending') { c.status = 'accepted'; migrated = true; }
      if (c && !Array.isArray(c.rects)) { c.rects = []; migrated = true; }
      if (c && !Array.isArray(c.replies)) { c.replies = []; migrated = true; }
    }
    if (migrated) await save(root, parsed);
    return parsed;
  } catch {
    return [];
  }
}

// Atomic write (temp file + rename): a concurrent listComments() from another
// process/agent then always sees either the fully-old or fully-new file, never
// a truncated one mid-write — true regardless of the lock below, which exists
// for a different problem (see withLock callers): two WRITERS racing to read
// the pre-edit array, each appending their own change, and the second save()
// silently discarding the first agent's change ("lost update").
async function save(root: string, comments: Comment[]): Promise<void> {
  await mkdir(join(root, '.latex-preview'), { recursive: true });
  const dest = storePath(root);
  const tmp = `${dest}.tmp-${randomBytes(4).toString('hex')}`;
  await writeFile(tmp, JSON.stringify(comments, null, 2), 'utf8');
  await rename(tmp, dest);
}

export async function addComment(
  root: string,
  input: { page: number; quote: string; rects: CommentRect[]; text: string; role?: CommentRole; status?: CommentStatus },
): Promise<Comment> {
  const comment: Comment = {
    id: randomBytes(6).toString('hex'),
    page: Math.max(1, Math.floor(input.page || 1)),
    quote: String(input.quote).slice(0, 600),
    rects: (input.rects ?? []).slice(0, 40).map((r) => ({ x: +r.x, y: +r.y, w: +r.w, h: +r.h })),
    text: String(input.text).slice(0, 4000),
    status: input.status ?? 'accepted',
    role: input.role ?? 'human',
    created: new Date().toISOString(),
  };
  // The whole read -> mutate -> write runs as one cross-process critical
  // section, so two agents adding/resolving/replying to comments at the same
  // moment queue instead of one silently overwriting the other's change.
  await withLock(root, async () => {
    const all = await listComments(root);
    all.push(comment);
    await save(root, all);
  });
  return comment;
}

export async function updateComment(
  root: string,
  id: string,
  patch: { status?: CommentStatus; resolvedNote?: string; text?: string },
): Promise<Comment | null> {
  return withLock(root, async () => {
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
  });
}

export async function addReply(
  root: string,
  id: string,
  reply: { by: CommentRole; text: string },
): Promise<Comment | null> {
  return withLock(root, async () => {
    const all = await listComments(root);
    const c = all.find((x) => x.id === id);
    if (!c) return null;
    (c.replies ??= []).push({ by: reply.by, text: String(reply.text).slice(0, 2000), at: new Date().toISOString() });
    await save(root, all);
    return c;
  });
}

export async function deleteComment(root: string, id: string): Promise<boolean> {
  return withLock(root, async () => {
    const all = await listComments(root);
    const next = all.filter((x) => x.id !== id);
    if (next.length === all.length) return false;
    await save(root, next);
    return true;
  });
}
