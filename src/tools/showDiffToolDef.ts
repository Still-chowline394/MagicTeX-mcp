// Second MCP tool: render a side-by-side diff as an IMAGE, returned inline.
// Claude Code has no diff-viewer to render into, and it summarizes captured
// command output — so the only reliable way to show the user a visual diff in
// the conversation is an image (which Claude Code does display inline).
import { z } from 'zod';

export const SHOW_DIFF_NAME = 'show_diff';

export const showDiffInputSchema = {
  checkpoint: z
    .string()
    .optional()
    .describe('A checkpoint commit sha (from the preview History panel) to diff. Omit to show the current uncommitted changes vs the last commit.'),
};

export const showDiffConfig = {
  title: 'Show diff (side-by-side image)',
  description:
    "Render a side-by-side git diff as an image, shown inline in the conversation. Use this when the user asks to SEE a diff visually — it returns a picture, not a text summary. Defaults to current uncommitted changes; pass a checkpoint sha for a specific saved version.",
  inputSchema: showDiffInputSchema,
};
