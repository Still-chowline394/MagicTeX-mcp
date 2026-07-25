# The agent loop — comments as triggers

The workspace turns a **comment on the PDF** into a **task for Claude**. You point at
the document; Claude works on the source. This page shows how to run that as a loop, so
Claude keeps addressing comments as you leave them — the first step toward the paper
working itself while you watch the history.

## The one-pass flow (manual)

1. In the workspace, select text on the rendered PDF and leave a comment
   (e.g. *"tighten this paragraph"*, *"this claim needs a citation"*).
2. In Claude Code, say **"address my comments"**.
3. Claude calls `check_comments` and gets each pending comment as a **located work item**:

   ```
   2 pending comments — edit each at its source location per the instruction,
   then call resolve_comment with its id and a one-line note:

   [id: a1b2c3] p.1 — "the largest of twelve predefined contrasts is 7.2 percentage points"
     ↳ source: main.tex:37
     → State the exact p-value here.

   [id: d4e5f6] p.2 — "Judges deployed across languages should be audited"
     ↳ source: main.tex:44
     → Soften this to a recommendation, not a mandate.
   ```

4. For each item Claude opens the source at that `file:line`, makes the edit, and calls
   `resolve_comment(id, note)`. Saving triggers a recompile and a git checkpoint
   automatically, so the PDF refreshes and the change is diffable in **History**.
5. Each card flips to **resolved ✓** with Claude's note. Nothing you have to re-say.

## Running it as a loop (hands-off)

Use Claude Code's `/loop` to keep a watch on the comment inbox. In your paper project:

```
/loop 60s Address my PDF comments: call check_comments; for each pending item, edit the
source at its location per the instruction and call resolve_comment with a one-line note.
If there are no pending comments, do nothing this pass.
```

- Every ~60s Claude checks for new comments and clears them. Leave a comment, walk away,
  come back to a resolved card and a checkpoint diff.
- `check_comments` returning "No pending comments" is a clean no-op, so idle passes are cheap.
- Stop the loop any time; everything it did is in your git history.

## Why this is safe to watch, not babysit

- **Traceable** — every pass leaves a checkpoint you can open in History and a resolved-note
  on the card, so you can always see *what* changed and *why*.
- **Reversible** — checkpoints live on a hidden git ref; your own `git log` and working tree
  are never touched. Revert any change the normal way.
- **Scoped** — Claude edits only where a comment points; an empty inbox means no edits.

## Toward multi-agent (next)

The same inbox is the coordination point for multiple roles — a **reviewer** that posts
critique as comments, an **author** that revises, a **defender** that checks claims. That
needs a role tag on comments and turn-taking over git branches; see the system blueprint.
For now the loop runs one agent, which is already the whole comment→revision cycle.
