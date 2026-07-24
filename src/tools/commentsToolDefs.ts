// The comments half of the workspace loop: the human anchors comments on the
// rendered PDF; Claude pulls them as edit instructions and resolves them after
// making the edits. This is what turns "point at the document" into a channel
// alongside chat.
import { z } from 'zod';

export const CHECK_COMMENTS_NAME = 'check_comments';
export const checkCommentsConfig = {
  title: 'Check pending PDF comments',
  description:
    'List the pending comments the user anchored on the rendered PDF in the workspace. Each has an id, page, the quoted passage it is attached to, and the user\'s instruction. Call this when the user asks to "address/check my comments" (or after they mention leaving comments), then make the requested source edits and call resolve_comment for each one you handled.',
  inputSchema: {
    includeResolved: z.boolean().optional().describe('Also list resolved comments (default false).'),
  },
};

export const RESOLVE_COMMENT_NAME = 'resolve_comment';
export const resolveCommentConfig = {
  title: 'Resolve a PDF comment',
  description:
    'Mark a workspace comment as resolved after you have made the edit it asked for. Pass the comment id (from check_comments) and a one-line note describing what you changed — the note is shown to the user on the comment card.',
  inputSchema: {
    id: z.string().describe('The comment id, as returned by check_comments.'),
    note: z.string().max(500).describe('One line describing the edit you made to address it.'),
  },
};
