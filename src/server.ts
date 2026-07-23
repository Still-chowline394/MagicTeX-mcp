#!/usr/bin/env node
// latex-live-preview-mcp — MCP stdio server exposing one tool, render_preview.
// Everything heavy (headless browser, WASM engine, preview server, file watcher)
// is lazily started on the first render_preview call, so merely connecting is cheap.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import open from 'open';
import { RENDER_PREVIEW_NAME, renderPreviewConfig } from './tools/renderPreviewToolDef.js';
import { getPreview } from './engine/browserHost.js';
import { setConfig, requestCompile } from './coordinator.js';
import { startWatching } from './watch/fileWatcher.js';
import { type Engine } from './project/compileProject.js';
import { MainFileError } from './project/resolveMainFile.js';
import { summarizeErrors } from './project/parseLog.js';

const server = new McpServer({ name: 'latex-live-preview-mcp', version: '0.0.1' });

let viewerOpened = false;

server.registerTool(RENDER_PREVIEW_NAME, renderPreviewConfig, async ({ mainFile, engine }) => {
  const projectRoot = process.cwd();
  try {
    const preview = await getPreview();
    setConfig({ projectRoot, mainFile, engine: engine as Engine | undefined });
    startWatching(projectRoot); // passive live-reload for saves between tool calls

    const result = await requestCompile();

    // Open the viewer tab once per server lifetime.
    if (!viewerOpened) { viewerOpened = true; open(preview.viewerUrl).catch(() => {}); }

    if (result.success) {
      const truncNote = result.truncated ? ' (note: project too large — some files were skipped)' : '';
      return {
        content: [{
          type: 'text',
          text: `✓ Compiled ${result.mainFile} with ${result.engine} in ${result.ms}ms — ${result.fileCount} files${truncNote}. Live preview (auto-reloads on edits): ${preview.viewerUrl}`,
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[latex-live-preview-mcp] ready on stdio');
