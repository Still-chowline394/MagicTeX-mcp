#!/usr/bin/env node
// npm bin launcher. The server is TypeScript; register tsx's ESM loader in-process
// (no subprocess, so the MCP stdio channel is untouched), then start it.

// Check the Node version BEFORE importing anything, because the imports are what
// break. On an old Node this file failed inside tsx's own parsing, and an MCP
// client has no way to surface that — Claude Code shows a bare `-32000`, which
// says only "the server didn't start". A real user lost an hour to it: the cause
// was Node 12, and the first thing that ever said so out loud was an `npm install`
// warning buried in eighty lines of unrelated output.
//
// `engines` in package.json doesn't cover this: npm only warns, and never at run
// time. The floor is a real one — chokidar 5 needs >= 20.19.0 and playwright
// needs >= 20, so a Node 18 install would start fine and then silently stop
// live-reloading, which is worse than refusing to run.
const MIN_MAJOR = 20;
const MIN_MINOR = 19;
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)) {
  console.error(`
✖ MagicTeX needs Node ${MIN_MAJOR}.${MIN_MINOR} or newer — you are running v${process.versions.node}.

  Install the current LTS from https://nodejs.org/ — the macOS and Windows
  installers replace your existing Node — then restart your MCP client.

  Using nvm:  nvm install --lts && nvm alias default 'lts/*'

  Note that MCP clients launched from a GUI may not see a nvm-managed Node at
  all; if that happens, point the "command" in your MCP config at the absolute
  path from \`which node\`.
`);
  process.exit(1);
}

const { register } = await import('tsx/esm/api');
register();
await import(new URL('../src/server.ts', import.meta.url).href);
