---
description: Address my accepted PDF comments and resolve each one
---

Address my accepted comments on the paper:

1. Call `check_comments`.
2. For each pending (accepted) item, open the source at the `file:line` it gives
   and make the edit it asks for. Saving recompiles automatically and leaves a
   checkpoint in the History tab.
3. Call `resolve_comment` with the comment id and a one-line note describing the
   change.
4. If nothing is pending, tell me there's nothing to do. If there are reviewer
   suggestions still awaiting my acceptance, remind me to Accept them in the
   workspace first (they aren't actionable until I do).

You can run this on a loop with `/loop 60s /address-comments` to keep clearing new
comments as I accept them.
