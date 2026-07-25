// End-to-end: spawn the real MCP server as a subprocess and drive the review
// workflow over stdio. Only the comment tools are exercised, so no browser /
// WASM engine is needed — this stays fast and reliable in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const server = fileURLToPath(new URL('../src/server.ts', import.meta.url));

test('review workflow over MCP: post → gate → located → thread → resolve', { timeout: 90_000 }, async () => {
  const proj = mkdtempSync(join(tmpdir(), 'e2e-'));
  writeFileSync(join(proj, 'main.tex'),
    '\\documentclass{article}\n\\begin{document}\nWe report a large speedup on the benchmark today.\n\\end{document}\n');
  const transport = new StdioClientTransport({ command: 'npx', args: ['tsx', server], cwd: proj });
  const client = new Client({ name: 'ci', version: '0' }, { capabilities: {} });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })).content.map((x: { text?: string }) => x.text ?? '').join('\n');

  try {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, ['add_comment', 'check_comments', 'render_preview', 'reply_to_comment', 'resolve_comment', 'show_diff']);

    // A reviewer suggestion is NOT actionable until accepted.
    await call('add_comment', { quote: 'large speedup on the benchmark', comment: 'Which baseline?', role: 'reviewer' });
    let ck = await call('check_comments');
    assert.match(ck, /No pending comments/);
    assert.match(ck, /1 reviewer suggestion/);

    // An accepted (autonomous) comment is actionable, role-tagged, and located.
    const posted = await call('add_comment', { quote: 'We report a large speedup', comment: 'Cite the runs.', role: 'defender', accepted: true });
    const id = posted.match(/comment ([0-9a-f]{6,})/)?.[1];
    assert.ok(id, 'expected a new comment id');
    ck = await call('check_comments');
    assert.match(ck, /1 pending comment/);
    assert.match(ck, /main\.tex:3/);
    assert.match(ck, /\(defender\)/);

    // Threaded reply shows up in the work item.
    await call('reply_to_comment', { id, text: 'averaged over 5 runs', role: 'author' });
    ck = await call('check_comments');
    assert.match(ck, /author: averaged over 5 runs/);

    // Resolve clears it.
    await call('resolve_comment', { id, note: 'added the baseline + runs' });
    ck = await call('check_comments');
    assert.match(ck, /No pending comments/);
  } finally {
    await client.close();
    rmSync(proj, { recursive: true, force: true });
  }
});
