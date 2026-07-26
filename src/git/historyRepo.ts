// Where a project's checkpoint history lives.
//
// Until now history required the project to already be a git repository, so
// anyone writing a paper in a plain folder got nothing — no timeline, no diffs,
// no record of what an agent changed. That is the feature this project exists
// for, absent for most of the people it is for.
//
// Telling them to run `git init` is the wrong answer: it puts a .git in their
// directory, changes what `git status` does there forever, and makes them adopt
// a tool they did not ask for to get a feature they did not know they were
// opting into. So for those projects the repository lives in our cache, with the
// project as its work tree — git tracks the files, and nothing appears in the
// author's folder. Verified on Windows git 2.45: the project keeps only the
// author's own files, and `git` run there by the author still reports no
// repository.
import { createHash } from 'node:crypto';
import { mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { cacheRoot } from '../engine/assetsDir.js';
import { git, gitOrNull } from './exec.js';

export type HistoryMode =
  | 'project'     // the project is a git repo; checkpoints go on a hidden ref in it
  | 'shadow'      // not a repo; history lives in our cache, work tree is the project
  | 'no-git'      // no git binary on PATH
  | 'unwritable'; // git is fine, but the history store could not be created

/**
 * Two ways to have no history, and they need different things from the reader:
 * one is "install git", the other is "look at this path". They were a single
 * `'unavailable'` state whose message always said the first — so a failed setup
 * told people to install software they already had, and left them with nowhere
 * to go after they did.
 */
export interface HistoryRepo {
  mode: HistoryMode;
  /** Env to pass to every git call for this project. Empty for 'project'. */
  env: NodeJS.ProcessEnv;
  /** For 'unwritable': where it tried, and what the OS said back. Both matter —
   *  a permissions error and a full disk need different responses. */
  detail?: string;
}

const NO_GIT: HistoryRepo = { mode: 'no-git', env: {} };

/** Identity for commits we create. A shadow repo has no user config to inherit,
 *  and `commit-tree` fails outright without one — which would have turned "no
 *  git identity configured" into "history silently never appears". */
const IDENTITY = {
  GIT_AUTHOR_NAME: 'MagicTeX',
  GIT_AUTHOR_EMAIL: 'magictex@localhost',
  GIT_COMMITTER_NAME: 'MagicTeX',
  GIT_COMMITTER_EMAIL: 'magictex@localhost',
};

let gitPresent: boolean | undefined;
async function hasGit(): Promise<boolean> {
  if (gitPresent === undefined) {
    gitPresent = (await gitOrNull(process.cwd(), ['--version'])) !== null;
  }
  return gitPresent;
}

/** Stable directory for a project's shadow repo. Keyed by the resolved path, so
 *  the same project reached through a symlink or a different case on Windows
 *  lands on one history rather than two. */
async function shadowDirFor(root: string): Promise<string> {
  let key = root;
  try { key = await realpath(root); } catch { /* not yet created; the raw path will do */ }
  if (process.platform === 'win32') key = key.toLowerCase();
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return join(cacheRoot(), 'history', hash);
}

const cache = new Map<string, HistoryRepo>();

/**
 * Decide where this project's history lives, creating the shadow repo on first
 * use. Cached per project for the process's lifetime.
 */
export async function historyRepo(root: string): Promise<HistoryRepo> {
  const hit = cache.get(root);
  if (hit) return hit;

  if (!(await hasGit())) {
    cache.set(root, NO_GIT);
    return NO_GIT;
  }

  // An existing repo keeps the current behaviour: checkpoints sit on a hidden
  // ref inside it, so they survive a clone and live beside the author's own
  // history rather than in a cache directory they'd never find.
  if ((await gitOrNull(root, ['rev-parse', '--git-dir'])) !== null) {
    const resolved: HistoryRepo = { mode: 'project', env: { ...IDENTITY } };
    cache.set(root, resolved);
    return resolved;
  }

  const dir = await shadowDirFor(root);
  const env: NodeJS.ProcessEnv = { ...IDENTITY, GIT_DIR: dir, GIT_WORK_TREE: root };
  try {
    await mkdir(dir, { recursive: true });
    // `git init` is idempotent, but checking first keeps a re-init out of the
    // common path and makes a corrupted directory visible as a failure here
    // rather than as a confusing error on the first commit.
    try {
      await access(join(dir, 'HEAD'));
    } catch {
      await git(root, ['init', '--quiet'], { ...process.env, ...env });
    }
    const resolved: HistoryRepo = { mode: 'shadow', env };
    cache.set(root, resolved);
    return resolved;
  } catch (err) {
    // Degrade to no history rather than failing the compile that triggered this
    // — but keep why. Reported as "no git found", this sent people to install
    // software they already had, and left them nowhere to go once they had.
    const resolved: HistoryRepo = {
      mode: 'unwritable',
      env: {},
      detail: `${dir}: ${(err as Error)?.message ?? String(err)}`,
    };
    cache.set(root, resolved);
    return resolved;
  }
}

/** Reset the memo — for tests, and for a project whose git status changed under
 *  us (someone ran `git init` while the server was up). */
export function forgetHistoryRepo(root?: string): void {
  if (root) cache.delete(root);
  else cache.clear();
  gitPresent = undefined;
}
