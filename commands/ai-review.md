---
description: Review this paper with a skill and post comments for me to accept
argument-hint: [skill-name]
---

Review the current paper and leave targeted comments I can accept or reject in the
MagicTeX workspace.

The review skill to use is: **$ARGUMENTS** — if that is empty, default to
`academic-paper-revision`.

Do this:

1. **Check the skill is available.** If the named skill is not installed/available
   to you, STOP and tell me its name and where to get it (for
   `academic-paper-revision`, that is https://github.com/ZoeLinUTS/Academic-paper-revision).
   Do not continue until it's available.
2. **Load and follow that skill** to review the paper.
3. For each issue, call the `add_comment` MCP tool with the *exact quoted passage*
   from the paper and your comment. Use `role: "reviewer"` for a suggested change,
   or `role: "defender"` when you're challenging a claim's validity. **Do not edit
   the source** — these are suggestions I will Accept or Reject in the workspace.
4. When done, summarize how many comments you posted, grouped by section.
