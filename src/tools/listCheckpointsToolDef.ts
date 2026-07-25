// Checkpoints are auto-saved on every successful compile, but until now nothing
// exposed the sha list to Claude — show_diff takes a sha but there was no way to
// learn one short of asking the user to open the History panel. This closes that
// gap and lets a multi-step session (e.g. /ultra-agents) cite exact saved
// versions in its own summary instead of a vague "check your history".
import { z } from 'zod';

export const LIST_CHECKPOINTS_NAME = 'list_checkpoints';

export const listCheckpointsInputSchema = {
  limit: z.number().int().positive().max(50).optional().describe('Max checkpoints to return, newest first (default 10).'),
};

export const listCheckpointsConfig = {
  title: 'List recent checkpoints',
  description:
    'List recent checkpoints (auto-saved on each successful compile) — sha, timestamp, and file/line-change stat, newest first. Use this to find a sha to pass into show_diff, or to cite specific saved versions when summarizing a multi-step editing session.',
  inputSchema: listCheckpointsInputSchema,
};
