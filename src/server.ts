#!/usr/bin/env node
// latex-live-preview-mcp — MCP stdio server exposing one tool, render_preview.
// Everything heavy (headless browser, WASM engine, preview server) is lazily
// started on the first render_preview call, so merely connecting is cheap.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import open from 'open';
import { RENDER_PREVIEW_NAME, renderPreviewConfig } from './tools/renderPreviewToolDef.js';
import { getPreview } from './engine/browserHost.js';
import { compileProject, type Engine } from './project/compileProject.js';
import { MainFileError } from './project/resolveMainFile.js';

const server = new McpServer({ name: 'latex-live-preview-mcp', version: '0.0.1' });

let viewerOpened = false;

server.registerTool(RENDER_PREVIEW_NAME, renderPreviewConfig, async ({ mainFile, engine }) => {
  const projectRoot = process.cwd();
  try {
    const preview = await getPreview();
    preview.broadcast({ type: 'compiling' });

    const result = await compileProject({ projectRoot, mainFile, engine: engine as Engine | undefined });

    // Open the viewer tab once per server lifetime, on first successful reach.
    if (!viewerOpened) { viewerOpened = true; open(preview.viewerUrl).catch(() => {}); }

    if (result.success && result.pdf) {
      preview.setLatestPdf(result.pdf);
      const truncNote = result.truncated ? ' (note: project too large — some files were skipped)' : '';
      return {
        content: [{
          type: 'text',
          text: `✓ Compiled ${result.mainFile} with ${result.engine} in ${result.ms}ms — ${result.fileCount} files${truncNote}. Live preview: ${preview.viewerUrl}`,
        }],
      };
    }

    // Compile failed — surface the log tail so Claude can self-correct, and show it in the viewer.
    const logTail = (result.log || result.error || 'unknown error').slice(-1800);
    preview.broadcast({ type: 'compile-error', log: logTail });
    return {
      isError: true,
      content: [{ type: 'text', text: `✖ Compile of ${result.mainFile} failed (${result.engine}). Log tail:\n\n${logTail}` }],
    };
  } catch (err) {
    const msg = err instanceof MainFileError ? err.message : String((err as Error).message ?? err);
    return { isError: true, content: [{ type: 'text', text: `✖ ${msg}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[latex-live-preview-mcp] ready on stdio');
