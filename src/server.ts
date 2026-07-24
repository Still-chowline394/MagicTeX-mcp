#!/usr/bin/env node
// latex-live-preview-mcp — MCP stdio server exposing one tool, render_preview.
// Everything heavy (headless browser, WASM engine, preview server, file watcher)
// is lazily started on the first render_preview call, so merely connecting is cheap.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import open from 'open';
import { RENDER_PREVIEW_NAME, renderPreviewConfig } from './tools/renderPreviewToolDef.js';
import { SHOW_DIFF_NAME, showDiffConfig } from './tools/showDiffToolDef.js';
import { CHECK_COMMENTS_NAME, checkCommentsConfig, RESOLVE_COMMENT_NAME, resolveCommentConfig } from './tools/commentsToolDefs.js';
import { listComments, updateComment } from './preview/commentsStore.js';
import { getPreview, captureDiff } from './engine/browserHost.js';
import { setConfig, requestCompile } from './coordinator.js';
import { setProjectRoot } from './session.js';
import { startWatching } from './watch/fileWatcher.js';
import { isGitRepo } from './git/checkpoints.js';
import { type Engine } from './project/compileProject.js';
import { MainFileError } from './project/resolveMainFile.js';
import { summarizeErrors } from './project/parseLog.js';

const server = new McpServer({ name: 'latex-live-preview-mcp', version: '0.0.1' });

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url));
// The React workspace is the primary UI; fall back to the legacy /viewer only
// when ui/dist hasn't been built (e.g. a fresh clone before `npm run build:ui`).
const hasWorkspace = existsSync(join(PKG_ROOT, 'ui', 'dist', 'index.html'));

let viewerOpened = false;

server.registerTool(RENDER_PREVIEW_NAME, renderPreviewConfig, async ({ mainFile, engine }) => {
  const projectRoot = process.cwd();
  try {
    const preview = await getPreview();
    setConfig({ projectRoot, mainFile, engine: engine as Engine | undefined });
    startWatching(projectRoot); // passive live-reload for saves between tool calls

    const result = await requestCompile();

    const workspaceUrl = hasWorkspace ? `${preview.url}/app` : preview.viewerUrl;
    // Open the workspace tab once per server lifetime.
    if (!viewerOpened) { viewerOpened = true; open(workspaceUrl).catch(() => {}); }

    if (result.success) {
      const truncNote = result.truncated ? ' (note: project too large — some files were skipped)' : '';
      return {
        content: [{
          type: 'text',
          text: `✓ Compiled ${result.mainFile} with ${result.engine} in ${result.ms}ms — ${result.fileCount} files${truncNote}. Workspace (live preview, source editor, history, PDF comments — auto-reloads on edits): ${workspaceUrl}`,
        }],
      };
    }

    // Compile failed — return parsed errors so Claude can self-correct.
    return {
      isError: true,
      content: [{ type: 'text', text: `✖ Compile of ${result.mainFile} failed (${result.engine}).\n\n${summarizeErrors(result.log || result.error || '')}` }],
    };
  } catch (err) {
    const msg = err instanceof MainFileError ? err.message : String((err as Error).message ?? err);
    return { isError: true, content: [{ type: 'text', text: `✖ ${msg}` }] };
  }
});

server.registerTool(SHOW_DIFF_NAME, showDiffConfig, async ({ checkpoint }) => {
  const projectRoot = process.cwd();
  setProjectRoot(projectRoot); // the diff endpoints read this
  try {
    await getPreview(); // ensure the preview server + headless browser are up
    if (!(await isGitRepo(projectRoot))) {
      return { isError: true, content: [{ type: 'text', text: '✖ Not a git repository — nothing to diff.' }] };
    }
    const path = checkpoint ? `/diff-view?sha=${encodeURIComponent(checkpoint)}` : '/diff-view';
    const { empty, png } = await captureDiff(path);
    if (empty || !png) {
      return { content: [{ type: 'text', text: 'No changes to show — the working tree is clean.' }] };
    }
    return {
      content: [
        { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
        { type: 'text', text: checkpoint ? `Side-by-side diff of checkpoint ${checkpoint}.` : 'Side-by-side diff of your current uncommitted changes.' },
      ],
    };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `✖ ${String((err as Error).message)}` }] };
  }
});

server.registerTool(CHECK_COMMENTS_NAME, checkCommentsConfig, async ({ includeResolved }) => {
  const projectRoot = process.cwd();
  setProjectRoot(projectRoot);
  const all = await listComments(projectRoot);
  const pending = all.filter((c) => c.status === 'pending');
  const resolved = all.filter((c) => c.status === 'resolved');
  const fmt = (c: (typeof all)[number]) =>
    `[id: ${c.id}] p.${c.page} — "${c.quote.slice(0, 160)}${c.quote.length > 160 ? '…' : ''}"\n  → ${c.text}`;
  let text: string;
  if (!pending.length) {
    text = 'No pending comments.' + (resolved.length ? ` (${resolved.length} already resolved.)` : '');
  } else {
    text = `${pending.length} pending comment${pending.length === 1 ? '' : 's'} — make each requested edit, then call ${RESOLVE_COMMENT_NAME} with its id and a one-line note:\n\n${pending.map(fmt).join('\n\n')}`;
  }
  if (includeResolved && resolved.length) {
    text += `\n\nResolved:\n${resolved.map(fmt).join('\n\n')}`;
  }
  return { content: [{ type: 'text', text }] };
});

server.registerTool(RESOLVE_COMMENT_NAME, resolveCommentConfig, async ({ id, note }) => {
  const projectRoot = process.cwd();
  setProjectRoot(projectRoot);
  const updated = await updateComment(projectRoot, id, { status: 'resolved', resolvedNote: note });
  if (!updated) {
    return { isError: true, content: [{ type: 'text', text: `✖ Unknown comment id: ${id}` }] };
  }
  try { (await getPreview()).broadcast({ type: 'comments-changed' }); } catch { /* viewer not open */ }
  return { content: [{ type: 'text', text: `✓ Resolved comment ${id} ("${updated.quote.slice(0, 60)}…") — the card now shows: ${note}` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[latex-live-preview-mcp] ready on stdio');
