// Refusing to start on too old a Node, with a message that says so.
//
// The README has promised this check since the first release and it did not
// exist. `engines` in package.json only makes npm warn, and `npx -y` — the
// documented install line — does not enforce it at all. So someone on Node 18 got
// whatever chokidar or playwright throws first, with nothing in it naming Node.
//
// The floor is read from `engines` rather than restated here, so the two cannot
// drift apart the way the promise and the code already had.

/** True when `have` is an earlier release than `want`. Both are "x.y.z" strings. */
export function isOlderThan(have: string, want: string): boolean {
  const parse = (v: string) => v.match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number);
  const h = parse(have);
  const w = parse(want);
  // Unparseable either way: let it start. Refusing to run on a version we failed
  // to read would turn a cosmetic problem into a total one.
  if (!h || !w) return false;
  for (let i = 0; i < 3; i++) {
    if (h[i] !== w[i]) return h[i] < w[i];
  }
  return false;
}

export function tooOldMessage(have: string, want: string): string {
  return (
    `[magictex-mcp] Node ${have} is too old — MagicTeX needs ${want}.\n` +
    `  That is the floor chokidar and playwright actually need; below it MagicTeX fails\n` +
    `  in ways that never mention Node at all.\n` +
    `  Install a newer Node from https://nodejs.org/ (or via nvm / fnm / volta), then\n` +
    `  restart your MCP client. Nothing else about your setup needs to change.`
  );
}
