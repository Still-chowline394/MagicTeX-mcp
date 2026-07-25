# The agent loop — comments as triggers

The workspace turns a **comment on the PDF** into a **task for Claude**. You point at
the document; Claude works on the source. This page shows how to run that as a loop, so
Claude keeps addressing comments as you leave them — the first step toward the paper
working itself while you watch the history.

## The one-pass flow (manual)

1. In the workspace, select text on the rendered PDF and leave a comment
   (e.g. *"tighten this paragraph"*, *"this claim needs a citation"*).
2. In Claude Code, say **"address my comments"**.
3. Claude calls `check_comments` and gets each accepted comment as a **located work item**:

   ```
   2 accepted comments — edit each at its source location per the instruction,
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
/loop 60s Address my PDF comments: call check_comments; for each accepted item, edit the
source at its location per the instruction and call resolve_comment with a one-line note.
If there are no accepted comments, do nothing this pass.
```

- Every ~60s Claude checks for new comments and clears them. Leave a comment, walk away,
  come back to a resolved card and a checkpoint diff.
- `check_comments` returning "No accepted comments" is a clean no-op, so idle passes are cheap.
- Stop the loop any time; everything it did is in your git history.

## Why this is safe to watch, not babysit

- **Traceable** — every pass leaves a checkpoint you can open in History and a resolved-note
  on the card, so you can always see *what* changed and *why*.
- **Reversible** — checkpoints live on a hidden git ref; your own `git log` and working tree
  are never touched. Revert any change the normal way.
- **Scoped** — Claude edits only where a comment points; an empty inbox means no edits.

## The reviewer → human gate → resolver workflow

The comment inbox has three states, which chain a whole review cycle:

`suggested` → (human accepts) → `accepted` → (author loop) → `resolved`

1. **Reviewer posts comments.** Point Claude at your review skill and let it mark up the
   paper — for each issue it calls `add_comment(quote, comment)`, which lands as a
   **suggestion** (a purple dashed highlight on the PDF, a card in the *Suggested* section):

   ```
   Review my paper using my academic-paper-revision skill
   (github.com/ZoeLinUTS/Academic-paper-revision). For each issue, call add_comment
   with the exact quoted passage and your comment. Don't edit the source yet.
   ```

2. **Human gates the review.** In the *Suggested* section you **Accept** the comments you
   agree with (they turn into actionable `accepted`), **Reject** the rest, or edit/add your
   own. `check_comments` deliberately ignores `suggested` items — the author never acts on a
   suggestion you haven't accepted.

   - Prefer hands-off? Flip **Auto-accept reviewer suggestions (copilot)** at the top of the
     Comments panel, and every suggestion is accepted the moment it arrives. (Fully headless
     agents can also post directly-actionable comments with `add_comment(..., accepted: true)`.)

3. **Author loop resolves.** Run the loop from above — it picks up the `accepted`
   comments, edits at each located `file:line`, recompiles, and resolves each with a note.

4. **Everything is recorded.** Each accept, edit, and resolve leaves a checkpoint + a note,
   so the whole reviewer→author round is traceable in **History**.

This is one reviewer + one author with a human in the middle. True concurrent multi-agent
(reviewer / author / defender on their own git branches, coordinated turn-taking) is the
next milestone — see the system blueprint.
