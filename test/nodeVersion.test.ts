import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOlderThan, tooOldMessage } from '../src/nodeVersion.js';

// The README claimed "the server checks at startup and says so" from the first
// release onward. It did not. `engines` only makes npm warn, and the documented
// install line is `npx -y magictex-mcp`, which ignores it — so the promise was
// load-bearing for nobody and Node 18 users got an unrelated crash.

test('a lower version at any position is older', () => {
  assert.equal(isOlderThan('18.20.4', '20.19.0'), true, 'major');
  assert.equal(isOlderThan('20.18.9', '20.19.0'), true, 'minor');
  assert.equal(isOlderThan('20.19.0', '20.19.1'), true, 'patch');
});

test('equal or newer is not older', () => {
  assert.equal(isOlderThan('20.19.0', '20.19.0'), false, 'exactly the floor passes');
  assert.equal(isOlderThan('20.19.1', '20.19.0'), false);
  assert.equal(isOlderThan('22.0.0', '20.19.0'), false);
  // 20.9 vs 20.19: string comparison says "9" > "1" and gets this backwards.
  assert.equal(isOlderThan('20.9.0', '20.19.0'), true, 'compared numerically, not as text');
});

test('the range syntax npm actually writes is understood', () => {
  assert.equal(isOlderThan('18.20.4', '>=20.19.0'), true);
  assert.equal(isOlderThan('22.14.0', '>=20.19.0'), false);
});

test('an unreadable version lets the server start', () => {
  // Refusing to run over a version string we failed to parse would turn a
  // cosmetic problem into a total one.
  assert.equal(isOlderThan('', '>=20.19.0'), false);
  assert.equal(isOlderThan('22.14.0', 'lts/*'), false);
  assert.equal(isOlderThan('not a version', 'also not'), false);
});

test('the message names the version, the floor, and what to do', () => {
  const m = tooOldMessage('18.20.4', '>=20.19.0');
  assert.match(m, /18\.20\.4/, 'what you have');
  assert.match(m, /20\.19\.0/, 'what is needed');
  assert.match(m, /nodejs\.org/, 'where to get it');
  assert.match(m, /restart/i, 'what to do after');
});

test('the floor is read from package.json, not restated', () => {
  // The README and the code had already drifted once. This asserts the check is
  // driven by `engines` so they cannot drift again silently.
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { engines?: { node?: string } };
  assert.ok(pkg.engines?.node, 'package.json must declare engines.node — the check reads it');

  const src = readFileSync(join(root, 'src', 'server.ts'), 'utf8');
  assert.match(src, /pkg\.engines\?\.node/, 'server.ts must take the floor from engines, not a literal');

  // And the running Node satisfies it, or none of the suite would be running.
  assert.equal(isOlderThan(process.versions.node, pkg.engines!.node!), false);
});
