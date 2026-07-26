import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { historyRepo, forgetHistoryRepo } from '../src/git/historyRepo.js';

// The distinction these tests exist for: "no git" and "couldn't create the
// history store" are different problems with different answers, and they were a
// single state whose message always said the first. Someone whose cache was
// unwritable got told to install software they already had.

test('a plain folder gets a shadow repo', async () => {
  forgetHistoryRepo();
  const dir = mkdtempSync(join(tmpdir(), 'hr-plain-'));
  try {
    writeFileSync(join(dir, 'main.tex'), '');
    const r = await historyRepo(dir);
    assert.equal(r.mode, 'shadow');
    assert.ok(r.env.GIT_DIR, 'points at a repo outside the project');
    assert.equal(r.env.GIT_WORK_TREE, dir);
    assert.equal(r.detail, undefined, 'nothing went wrong, so nothing to explain');
  } finally {
    forgetHistoryRepo();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unwritable history store reports where and why — not "no git"', async () => {
  // MAGICTEX_ASSETS_DIR doesn't cover the history path, so point the cache at a
  // location that cannot hold a directory: a regular file. mkdir fails with
  // ENOTDIR/EEXIST, which is the shape of every real cause here — bad
  // permissions, a full disk, a stale file where a directory should be.
  const blocker = join(mkdtempSync(join(tmpdir(), 'hr-blocked-')), 'not-a-dir');
  writeFileSync(blocker, 'this is a file, not a cache directory');
  const project = mkdtempSync(join(tmpdir(), 'hr-proj-'));
  const prev = { LOCALAPPDATA: process.env.LOCALAPPDATA, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME, HOME: process.env.HOME };
  try {
    forgetHistoryRepo();
    process.env.LOCALAPPDATA = blocker;
    process.env.XDG_CACHE_HOME = blocker;
    process.env.HOME = blocker; // macOS builds its path from homedir()

    const r = await historyRepo(project);
    // On a machine without git this would be 'no-git' and the test would be
    // meaningless, so assert we're exercising the branch we think we are.
    assert.notEqual(r.mode, 'no-git', 'this machine must have git for the test to mean anything');
    assert.equal(r.mode, 'unwritable');
    assert.ok(r.detail, 'the reason must survive to the caller');
    assert.match(r.detail!, /not-a-dir/, 'names the path it tried');
    assert.ok(r.detail!.length > 'not-a-dir'.length + 2, 'and carries the OS error, not just the path');
  } finally {
    forgetHistoryRepo();
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(project, { recursive: true, force: true });
    try { chmodSync(blocker, 0o666); rmSync(blocker, { force: true }); } catch { /* best effort */ }
  }
});

test('an existing git repo is left alone', async () => {
  forgetHistoryRepo();
  const dir = mkdtempSync(join(tmpdir(), 'hr-repo-'));
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    const r = await historyRepo(dir);
    assert.equal(r.mode, 'project');
    assert.equal(r.env.GIT_DIR, undefined, 'no shadow repo — checkpoints belong in theirs');
  } finally {
    forgetHistoryRepo();
    rmSync(dir, { recursive: true, force: true });
  }
});
