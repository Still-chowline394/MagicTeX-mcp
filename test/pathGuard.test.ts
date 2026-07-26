import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTextFile, writeTextFile, deleteEntry, renameEntry, createTextFile } from '../src/preview/filesApi.js';

// Every one of these endpoints takes a path from an HTTP query string and reads
// or writes the user's disk with it. The lexical guard (resolve + startsWith with
// the separator) was correct; what was missing is that a string is not an inode.
// Git stores symlinks, so a cloned LaTeX template or an Overleaf import can ship
// `notes.tex -> ../../../.ssh/id_rsa`: every lexical check passes and readFile
// follows it out of the project. writeFile follows it the other way.

function project() {
  const base = mkdtempSync(join(tmpdir(), 'magictex-guard-'));
  const root = join(base, 'paper');
  const outside = join(base, 'secrets');
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(join(root, 'main.tex'), 'inside\n');
  writeFileSync(join(outside, 'id_rsa'), 'PRIVATE KEY\n');
  return { base, root, outside };
}

/** Symlinks need Developer Mode or admin on Windows; skip rather than pretend. */
function trySymlink(target: string, path: string, type?: 'file' | 'dir'): boolean {
  try { symlinkSync(target, path, type); return true; }
  catch { return false; }
}

test('lexical traversal is still rejected', async () => {
  const { root } = project();
  for (const bad of ['../secrets/id_rsa', '..\\secrets\\id_rsa', '/etc/passwd', 'C:\\Windows\\win.ini', '.']) {
    await assert.rejects(() => readTextFile(root, bad), `should reject ${JSON.stringify(bad)}`);
  }
});

test('a symlinked FILE cannot be read out of the project', async (t) => {
  const { root, outside } = project();
  if (!trySymlink(join(outside, 'id_rsa'), join(root, 'notes.tex'), 'file')) {
    return t.skip('symlinks unavailable (Windows without Developer Mode)');
  }
  // The lexical guard passes this happily: no `..`, not absolute, inside root.
  await assert.rejects(
    () => readTextFile(root, 'notes.tex'),
    /symlink/,
    'readTextFile followed a symlink out of the project',
  );
});

test('a symlinked FILE cannot be written through', async (t) => {
  const { root, outside } = project();
  if (!trySymlink(join(outside, 'id_rsa'), join(root, 'notes.tex'), 'file')) {
    return t.skip('symlinks unavailable');
  }
  await assert.rejects(() => writeTextFile(root, 'notes.tex', 'OVERWRITTEN'), /symlink/);
  // And prove it: the target is untouched. Write-anywhere is the worse half —
  // a link to a shell profile is arbitrary code execution at next login.
  assert.equal(readFileSync(join(outside, 'id_rsa'), 'utf8'), 'PRIVATE KEY\n');
});

test('a symlinked DIRECTORY cannot be written into', async (t) => {
  const { root, outside } = project();
  if (!trySymlink(outside, join(root, 'sections'), 'dir')) {
    return t.skip('symlinks unavailable');
  }
  // The file does not exist yet, so the guard has to resolve the PARENT.
  await assert.rejects(() => writeTextFile(root, 'sections/new.tex', 'x'), /symlink/);
});

test('a symlink cannot be used to delete outside the project', async (t) => {
  const { root, outside } = project();
  if (!trySymlink(join(outside, 'id_rsa'), join(root, 'notes.tex'), 'file')) {
    return t.skip('symlinks unavailable');
  }
  await assert.rejects(() => deleteEntry(root, 'notes.tex'), /symlink/);
  assert.equal(readFileSync(join(outside, 'id_rsa'), 'utf8'), 'PRIVATE KEY\n', 'the target was deleted');
});

test('a symlink cannot be a rename destination', async (t) => {
  const { root, outside } = project();
  if (!trySymlink(outside, join(root, 'elsewhere'), 'dir')) {
    return t.skip('symlinks unavailable');
  }
  await assert.rejects(() => renameEntry(root, 'main.tex', 'elsewhere/stolen.tex'), /symlink/);
});

test('ordinary paths inside the project still work', async () => {
  // The guard must not be so strict that it breaks the product. Two real traps
  // it has to survive: a Windows 8.3 short path (this machine's tmpdir is
  // C:\Users\ZOELIN~1\...) and a macOS temp dir, which is itself a symlink
  // (/var -> /private/var). A naive realpath comparison rejects both.
  const { root } = project();
  assert.equal(await readTextFile(root, 'main.tex'), 'inside\n');

  // writeTextFile does not create parent directories — createTextFile does. A
  // first draft of this test assumed otherwise and failed on ENOENT, which is
  // the test being wrong about the contract, not the guard rejecting anything.
  mkdirSync(join(root, 'sections'));
  await writeTextFile(root, 'sections/intro.tex', 'hello');
  assert.equal(await readTextFile(root, 'sections/intro.tex'), 'hello');

  // And through the create/rename/delete paths, which each resolve differently.
  await createTextFile(root, 'sections/methods.tex');
  await renameEntry(root, 'sections/methods.tex', 'sections/results.tex');
  await deleteEntry(root, 'sections/results.tex');
});
