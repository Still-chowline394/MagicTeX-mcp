---
description: Autonomous multi-round review + fix loop — no per-round approval
argument-hint: [skill-name] [depth]
---

Run an autonomous review-and-fix loop on the current paper. Parse **$ARGUMENTS** as
up to two tokens: skill name, then depth (both optional, either order is fine to
infer from context).

- **Skill**: the named one, else default to `academic-paper-revision`.
- **Depth**: the number of review→fix rounds to run back-to-back with no approval
  from me between rounds. Use the given value if it's a positive integer, else
  default to **2**. Mention once, up front, that this is the default and I can set
  a different depth next time (`/ultra-agents <skill> <depth>`) — and that whatever
  depth is chosen, a round that finds nothing new to flag stops the loop early, so
  it won't necessarily run the full count.

**If depth > 5**: stop here, before touching the skill or the paper. Tell me plainly
what that means — up to that many unattended rounds of edits with no per-round
check-in from me, and proportionally more time/tool calls — and ask me to confirm
running at that depth, or suggest 5 or fewer instead. End your turn and wait for my
reply; do not start reviewing on this same turn.

Once depth is settled (≤5, or I confirmed a larger one): **check the skill is
available** — if not installed, stop and tell me its name and where to get it (same
as `/ai-review`), don't continue.

Then run up to `depth` rounds. For round *i* (starting at 1):

1. Load the skill and review the paper **as it currently stands** — later rounds are
   reviewing what earlier rounds already changed, not the original draft. For each
   issue, call `add_comment` with the exact quoted passage, your comment,
   `role: "reviewer"` or `"defender"`, and **`accepted: true`** — that's what makes
   it actionable immediately with no human gate, which is the entire point of this
   mode. Note how many you posted this round.
2. **If this round posted zero comments, stop the loop now** (even if under
   `depth`) — the paper has converged and further rounds would just spin. Go
   straight to the summary below.
3. Otherwise call `check_comments`, and for each accepted item: open the source at
   the `file:line` it gives, make the edit, then call `resolve_comment` with a
   one-line note. Saving recompiles and checkpoints automatically — don't call
   `render_preview` yourself mid-loop.
4. Keep a short private record for the summary: round number, how many comments
   raised/resolved, one line on what changed.

When the loop ends (depth reached, or an empty round), call `list_checkpoints` and
give me a summary — not a raw comment dump:

- How many rounds ran and why it stopped (hit the depth limit vs. converged early).
- Per round, grouped by section: what was raised, what you changed, in plain
  language.
- The checkpoint sha(s) from `list_checkpoints` that correspond to this run (match
  by timestamp), so I can go straight to `/show_diff <sha>` for any round instead of
  hunting through History.
- A reminder that every round is an ordinary checkpoint — reviewable and revertible
  from the History tab, per file if I only want part of it undone.
