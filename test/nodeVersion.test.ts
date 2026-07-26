import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { floorOf, isBelowFloor, tooOldMessage } from '../bin/nodeVersion.mjs';

// This covers the check in bin/cli.mjs — the npm `bin` entrypoint, and the only
// place a Node floor can be enforced, because ESM evaluates every `import`
// before a module body. An earlier version of this file tested a copy in
// src/server.ts that could never fire on the Node it targeted.

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('a lower version at any position is below the floor', () => {
  assert.equal(isBelowFloor('18.20.4', '>=20.19.0'), true, 'major');
  assert.equal(isBelowFloor('20.18.9', '>=20.19.0'), true, 'minor');
  assert.equal(isBelowFloor('20.19.0', '>=20.19.1'), true, 'patch');
});

test('equal or newer is not below', () => {
  assert.equal(isBelowFloor('20.19.0', '>=20.19.0'), false, 'exactly the floor passes');
  assert.equal(isBelowFloor('22.14.0', '>=20.19.0'), false);
  // Compared numerically, not as text: "9" > "1" lexically gets this backwards.
  assert.equal(isBelowFloor('20.9.0', '>=20.19.0'), true);
});

test('the range forms npm actually accepts are understood', () => {
  // The previous implementation used /(\d+)\.(\d+)\.(\d+)/ and matched none of
  // these, so it silently returned false and the check disappeared. Each line
  // here is a form that disabled it.
  for (const range of ['>=22', '22.x', '^22', '~22.0', '>=22 <24']) {
    assert.equal(isBelowFloor('20.19.0', range), true, `20.19.0 should be below ${range}`);
    assert.equal(isBelowFloor('22.0.0', range), false, `22.0.0 should satisfy ${range}`);
  }
});

test('a union range takes its lowest branch', () => {
  // Satisfying any branch satisfies the range, so the floor is the lowest one.
  assert.deepEqual(floorOf('^20.19.0 || >=22'), [20, 19, 0]);
  assert.equal(isBelowFloor('20.19.0', '^20.19.0 || >=22'), false);
  assert.equal(isBelowFloor('18.0.0', '^20.19.0 || >=22'), true);
});

test('an unreadable range lets the process start', () => {
  // Refusing to run over a string we failed to parse would turn a cosmetic
  // problem into a total one.
  assert.equal(isBelowFloor('22.14.0', 'lts/*'), false);
  assert.equal(isBelowFloor('22.14.0', ''), false);
  assert.equal(isBelowFloor('22.14.0', undefined as unknown as string), false);
  assert.equal(isBelowFloor('', '>=20.19.0'), false);
});

test('the message names the version, the floor, and what to do', () => {
  const m = tooOldMessage('18.20.4', floorOf('>=20.19.0')!);
  assert.match(m, /18\.20\.4/, 'what you have');
  assert.match(m, /20\.19\.0/, 'what is needed');
  assert.doesNotMatch(m, />=/, 'the raw range is not shown to the user');
  assert.match(m, /nodejs\.org/, 'where to get it');
  assert.match(m, /restart/i, 'what to do after');
});

test('there is exactly one Node floor, and it comes from engines', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    engines?: { node?: string };
  };
  assert.ok(pkg.engines?.node, 'package.json must declare engines.node');

  const cli = readFileSync(join(root, 'bin', 'cli.mjs'), 'utf8');
  assert.match(cli, /pkg\.engines/, 'cli.mjs must read the floor from engines, not restate it');
  // There were three floors at once: two hardcoded numbers here and a third in
  // src/server.ts. Any bare version literal in the launcher is a fourth waiting
  // to disagree with engines.
  assert.doesNotMatch(cli, /MIN_MAJOR|MIN_MINOR/, 'no hardcoded floor in cli.mjs');

  // And the running Node satisfies it, or none of this suite would be running.
  assert.equal(isBelowFloor(process.versions.node, pkg.engines!.node!), false);
});
