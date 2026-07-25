// Zed-style auto-checkpoints: on each successful compile we snapshot the working
// tree into a parallel commit chain under a HIDDEN ref, touching none of the
// user's working tree, index, HEAD, or branches. History you can browse without
// polluting `git log`. All git access is via execFile (no shell) — validated on
// Windows git in the spike.
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { git, gitOrNull } from './exec.js';

const REF = 'refs/latex-preview/checkpoints';
// The well-known empty tree — used to diff the very first checkpoint (no parent).
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const SHA_RE = /^[0-9a-f]{7,64}$/; // guards HTTP-supplied shas against git arg injection

export async function isGitRepo(root: string): Promise<boolean> {
  return (await gitOrNull(root, ['rev-parse', '--git-dir'])) !== null;
}

export interface Checkpoint {
  sha: string;
  time: string; // ISO 8601
  filesChanged: number;
  insertions: number;
  deletions: number;
}

/**
 * Snapshot the current working tree into the hidden checkpoint chain.
 * No-op (returns {created:false}) when not a git repo or the tree is unchanged
 * since the last checkpoint. Never throws for expected conditions.
 */
export async function createCheckpoint(root: string): Promise<{ created: boolean; sha?: string }> {
  if (!(await isGitRepo(root))) return { created: false };

  // Temp index OUTSIDE the repo, fresh each time — so the user's real index is
  // untouched and the index file itself never lands in a snapshot.
  const idx = join(tmpdir(), `latex-ckpt-${randomBytes(6).toString('hex')}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  try {
    await git(root, ['add', '-A'], env); // respects .gitignore -> build artifacts excluded
    const tree = (await git(root, ['write-tree'], env)).trim();

    const prev = (await gitOrNull(root, ['rev-parse', '--verify', '-q', REF]))?.trim() || '';
    if (prev) {
      const prevTree = (await git(root, ['rev-parse', `${prev}^{tree}`])).trim();
      if (tree === prevTree) return { created: false }; // nothing changed
    }

    const msg = `checkpoint ${new Date().toISOString()}`;
    const commitArgs = prev
      ? ['commit-tree', tree, '-p', prev, '-m', msg]
      : ['commit-tree', tree, '-m', msg];
    const sha = (await git(root, commitArgs)).trim();
    await git(root, ['update-ref', REF, sha]);
    return { created: true, sha };
  } catch {
    return { created: false }; // never let checkpointing break a compile
  } finally {
    await rm(idx, { force: true }).catch(() => {});
  }
}

const SHORTSTAT_RE = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;

/** Newest-first list of checkpoints. Empty when no checkpoints / not a git repo. */
export async function listCheckpoints(root: string): Promise<Checkpoint[]> {
  const out = await gitOrNull(root, ['log', REF, '--format=@@@%H %cI', '--shortstat']);
  if (!out) return [];
  const checkpoints: Checkpoint[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('@@@')) {
      const sp = line.indexOf(' ');
      checkpoints.push({ sha: line.slice(3, sp), time: line.slice(sp + 1).trim(), filesChanged: 0, insertions: 0, deletions: 0 });
    } else {
      const m = line.match(SHORTSTAT_RE);
      if (m && checkpoints.length) {
        const cur = checkpoints[checkpoints.length - 1];
        cur.filesChanged = Number(m[1] || 0);
        cur.insertions = Number(m[2] || 0);
        cur.deletions = Number(m[3] || 0);
      }
    }
  }
  return checkpoints;
}

// Hide MagicTeX's own state (the comments store) from every diff view — it's not
// part of the user's paper. Passed as a git exclude pathspec.
const EXCLUDE_TOOL = ['--', '.', ':(exclude).latex-preview'];

/** Current uncommitted changes vs HEAD (or everything, if there's no commit yet). */
export async function getWorkingDiff(root: string): Promise<string> {
  const hasHead = (await gitOrNull(root, ['rev-parse', '--verify', '-q', 'HEAD'])) !== null;
  return (await gitOrNull(root, [...(hasHead ? ['diff', 'HEAD'] : ['diff']), ...EXCLUDE_TOOL])) ?? '';
}

/**
 * Restore the working tree to a checkpoint ("revert to this version"). Snapshots
 * the current state first (so it's reversible — the just-lost work becomes a new
 * checkpoint), then writes the checkpoint's files back via a TEMP index +
 * checkout-index, so the user's real index/HEAD/branches are never touched. Files
 * added after the checkpoint are left in place (safer than deleting).
 */
export async function restoreCheckpoint(root: string, sha: string): Promise<void> {
  if (!SHA_RE.test(sha)) throw new Error('invalid checkpoint id');
  const reachable = await gitOrNull(root, ['merge-base', '--is-ancestor', sha, REF]);
  if (reachable === null) throw new Error('unknown checkpoint');
  await createCheckpoint(root); // make the current state recoverable before we overwrite it
  const idx = join(tmpdir(), `latex-restore-${randomBytes(6).toString('hex')}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  try {
    await git(root, ['read-tree', sha], env);       // load the checkpoint tree into a temp index
    await git(root, ['checkout-index', '-a', '-f'], env); // write those files to the working tree
  } finally {
    await rm(idx, { force: true }).catch(() => {});
  }
}

/** Restore ONE file to its content at a checkpoint (per-file revert). Same temp-
 *  index + checkout-index approach, reversible, real index untouched. */
export async function restoreFile(root: string, sha: string, relPath: string): Promise<void> {
  if (!SHA_RE.test(sha)) throw new Error('invalid checkpoint id');
  const rel = String(relPath).replace(/^[/\\]+/, '');
  if (!rel || rel.includes('..')) throw new Error('invalid path');
  const reachable = await gitOrNull(root, ['merge-base', '--is-ancestor', sha, REF]);
  if (reachable === null) throw new Error('unknown checkpoint');
  await createCheckpoint(root); // recoverable
  const idx = join(tmpdir(), `latex-restorefile-${randomBytes(6).toString('hex')}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  try {
    await git(root, ['read-tree', sha], env);
    await git(root, ['checkout-index', '-f', '--', rel], env);
  } finally {
    await rm(idx, { force: true }).catch(() => {});
  }
}

/** Unified diff for one checkpoint (vs its parent, or the empty tree for the first). */
export async function getCheckpointDiff(root: string, sha: string): Promise<string> {
  if (!SHA_RE.test(sha)) throw new Error('invalid checkpoint id');
  // Only allow shas reachable from our own ref — never diff arbitrary objects.
  const reachable = await gitOrNull(root, ['merge-base', '--is-ancestor', sha, REF]);
  if (reachable === null) throw new Error('unknown checkpoint');
  const hasParent = (await gitOrNull(root, ['rev-parse', '--verify', '-q', `${sha}^`])) !== null;
  const base = hasParent ? `${sha}^` : EMPTY_TREE;
  return git(root, ['diff', base, sha, ...EXCLUDE_TOOL]);
}
