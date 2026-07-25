// The comments half of the workspace loop: the human anchors comments on the
// rendered PDF; Claude pulls them as edit instructions and resolves them after
// making the edits. This is what turns "point at the document" into a channel
// alongside chat.
import { z } from 'zod';

export const CHECK_COMMENTS_NAME = 'check_comments';
export const checkCommentsConfig = {
  title: 'Check pending PDF comments',
  description:
    'List the pending comments the user anchored on the rendered PDF as located work items. Each has an id, page, the quoted passage, the source file:line it anchors to (best-effort), and the user\'s instruction. Call this when the user asks to "address/check my comments" (or after they mention leaving comments) — or on each pass of an agent loop watching for new comments. For each item: open the source at the given location, make the requested edit (saving triggers a recompile + a checkpoint automatically), then call resolve_comment with its id and a one-line note. If it returns no pending comments, there is nothing to do.',
  inputSchema: {
    includeResolved: z.boolean().optional().describe('Also list resolved comments (default false).'),
  },
};

export const ADD_COMMENT_NAME = 'add_comment';
export const addCommentConfig = {
  title: 'Raise a review comment on the paper',
  description:
    'Post a review comment anchored to a passage of the paper — for a reviewer agent marking up the document. Give the exact quoted text from the compiled paper (or the source prose) it refers to, and your comment/instruction. By default it is created as a *suggestion* the human accepts in the workspace before the author loop acts on it; pass accepted:true only in fully-autonomous ("copilot") mode to make it immediately actionable. Use this to leave many targeted comments rather than one long critique.',
  inputSchema: {
    quote: z.string().min(1).describe('The exact passage the comment is about (a sentence or phrase from the paper).'),
    comment: z.string().min(1).max(2000).describe('The review comment or revision instruction for this passage.'),
    page: z.number().int().positive().optional().describe('PDF page the passage is on, if known (default 1; the workspace re-anchors by text anyway).'),
    accepted: z.boolean().optional().describe('Autonomous mode: create it already accepted (actionable) instead of a suggestion awaiting the human. Default false.'),
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
