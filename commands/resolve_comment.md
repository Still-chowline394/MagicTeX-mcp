---
description: resolve_comment tool — mark a comment done after you've made the edit
argument-hint: [comment-id] [what you changed]
---

Call the `resolve_comment` MCP tool to mark a comment as resolved once the edit is
made. Read the comment id and a one-line note from **$ARGUMENTS**. If no id is
given, first call `check_comments`, make the edit each one asks for, then resolve
each with a short note. Resolved comments turn **green** in the workspace so I can
review and close them.
