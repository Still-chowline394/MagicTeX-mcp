// The single MCP tool this server exposes. Git history/diffing is intentionally
// NOT a tool here — Claude Code's native Bash already covers it.
import { z } from 'zod';

export const RENDER_PREVIEW_NAME = 'render_preview';

export const renderPreviewInputSchema = {
  mainFile: z
    .string()
    .optional()
    .describe('Path to the main .tex file, relative to the project root. Auto-detected (by scanning for \\documentclass) if omitted.'),
  engine: z
    .enum(['pdflatex', 'xelatex', 'lualatex'])
    .optional()
    .describe('TeX engine. Defaults to xelatex.'),
};

export const renderPreviewConfig = {
  title: 'Render LaTeX preview',
  description:
    'Compile the current project\'s LaTeX to a PDF locally (WASM TeX Live in a headless browser — no local TeX install needed) and update the live preview. Returns compile success/errors, the local preview URL, and page count. Call this after editing .tex files to see and verify the rendered result.',
  inputSchema: renderPreviewInputSchema,
};
