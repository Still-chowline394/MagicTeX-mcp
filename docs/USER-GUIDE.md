# MagicTeX — User guide

![The MagicTeX workspace](images/workspace.png)

## Everyday use

1. Add the server to your paper project's `.mcp.json` (see the README), restart Claude Code.
   Or install the plugin for slash commands (below).
2. Ask Claude to *"render a preview"* (or run `/magic-latex`). The **workspace** opens: a
   **file tree + source editor** on the left, the **live PDF** in the center, and **Comments**
   on the right (toggle the 💬 **Comments** button in the top bar).
3. From then on the PDF stays live. Your own editor's saves and Claude's edits auto-recompile;
   in the built-in editor you press **Ctrl+S** / **Recompile** to rebuild (it auto-saves your
   work every 30s without recompiling).

## Slash commands (plugin)

Install once — `/plugin marketplace add ZoeLinUTS/MagicTeX-mcp` then `/plugin install magictex` —
and drive it with minimal typing:

- **`/magic-latex`** — compile and open the workspace.
- **`/ai-review [skill]`** — review the paper with a skill (default `academic-paper-revision`;
  any skill name works) and post comments for you to accept.
- **`/address-comments`** — resolve your accepted comments (loop it: `/loop 60s /address-comments`).

## The comment loop (review on the PDF, Claude edits the source)

1. **Select text on the rendered PDF** → a composer pops up → write what you want changed
   ("tighten this paragraph", "this equation looks wrong") → **Add comment**. The passage
   gets an anchored highlight; the card appears in the right panel as *pending*.
2. In Claude Code, say *"address my comments"*. Claude calls `check_comments` (each comment
   arrives with its page, the exact quoted passage, and your instruction), edits the source,
   and calls `resolve_comment` with a one-line note.
3. The PDF recompiles, the card flips to *resolved ✓* with Claude's note, and the History tab
   holds the checkpoint diff of what changed.

You never have to touch LaTeX — you point at the document; Claude works on the source.

## The review workflow (reviewer → you gate → author resolves)

You can also let an agent *raise* the comments, and keep yourself in the loop:

1. **Reviewer pass.** Run `/ai-review academic-paper-revision` (or point it at any review skill).
   The agent reads the paper and calls `add_comment` for each issue — they appear as **Suggested**
   cards (purple dashed highlights on the PDF), tagged **reviewer** or **defender**.
2. **You gate.** In the Comments panel, **Accept** the ones you agree with (they become actionable
   *pending*), **Reject** the rest, or add your own. Prefer hands-off? Tick **Auto-accept reviewer
   suggestions (copilot)** and every suggestion is accepted automatically.
3. **Author resolves.** Run `/address-comments` (or loop it). The author edits each accepted comment
   at its source location and marks it resolved with a note.

Comments have a **reply thread** (you and the agents can discuss before resolving), and **resolved**
comments drop their PDF highlight and move to the *Resolved* list — so several review rounds don't
pile up colors on the page. Use **Close** / **clear all** to archive them.

## Visual (WYSIWYG) mode

In the editor bar, toggle **Code / Visual**. Visual mode renders the document in place —
`\section`/`\textbf`/`\emph`, `$…$` and `\begin{equation}` math (via KaTeX), lists, `\cite` chips,
links — while dimming the preamble. Click any element to reveal its raw LaTeX and edit it. It's a
decoration layer over the same file, so it never changes your source. **⏎ Wrap** wraps long lines
(for LaTeX written without line breaks).

## The file tree

The **FILES** panel is a full tree: expand folders, click a file to switch to it, and use
**+ File / + Folder** or a row's rename/delete. Drag the divider below it to resize.

## The source editor

The left panel's **Source** tab lists the project's text files in a CodeMirror LaTeX editor.
**Ctrl+S** (or Save) writes to disk — the watcher recompiles and the PDF refreshes, exactly
like Typst's editor loop. Prefer your own editor? Saves from anywhere trigger the same loop.

### Seeing a diff inside the conversation

Ask Claude *"show me the diff"* (or *"show the diff of the last checkpoint"*) and it uses the
`show_diff` tool to return a **side-by-side diff as an image, right in the chat**. This exists
because Claude Code has no diff-viewer of its own — if Claude just runs `git diff`, it captures
the text and summarizes it. `show_diff` gives you the actual visual split instead. (For the same
diff *next to the rendered PDF*, use the browser History panel; for a terminal split, `git diff`
with [delta](https://github.com/dandavison/delta) configured.)

## Getting your paper into Overleaf

There are three ways, depending on your setup. The tool can't push to Overleaf *for* you without
your credentials, so these keep you in control.

### 1. Upload a clean zip (works for everyone)

Click **⬆ Export .zip**. You get a zip containing only the build inputs — `.tex`, `.bib`,
`.cls`/`.sty`/`.bst`, and figures — with build artifacts (`.aux`, `.log`, the compiled PDF),
`.git/`, and `node_modules/` left out. In Overleaf: **New Project → Upload Project**, drop the zip.

This is the reliable, universal path — no account linking, no public repo needed.

### 2. One-click "Open in Overleaf" (public GitHub repos)

If your project is a git repo with a **public** GitHub `origin`, the toolbar shows
**Open in Overleaf ↗**. Clicking it asks Overleaf to import your repo's current-branch archive
directly — a new project, one click. It only works if the repo is public, because Overleaf's
servers fetch the archive over the internet.

### 3. Sync to an existing Overleaf project (Overleaf Premium — Git bridge)

Overleaf Premium exposes each project as a git remote. Set it up once, yourself (your token is a
credential the tool never handles):

```bash
git remote add overleaf https://git.overleaf.com/<your-project-id>
# use your Overleaf git token when git prompts for a password
git push overleaf <branch>
```

After that, publishing an update is just `git push overleaf` — you can ask Claude to run it.

## Package coverage

The WASM engine ships a **subset** of TeX Live (basic + recommended + extra). Most common
packages are included. A few common omissions are handled automatically:
- the `algorithm`/`algorithmicx` family — the real `.sty` are vendored and injected;
- `bbm` — a small **preview shim** approximates `\mathbbm` (letters via `\mathbb`, the
  `\mathbbm{1}` indicator via a poor-man's double-struck 1), so the paper still renders.

Anything else that's outside the subset and font-based will fail with `File '<pkg>.sty' not
found`. If you hit that, drop the package's `.sty` (and fonts) into your project, or adjust the
preamble. Either way, your final compile on Overleaf uses the real packages — the local preview
is an approximation.

## Notes

- The compiled PDF is an approximation of what Overleaf produces (a current TeX Live via WASM),
  not a guaranteed bit-identical match. It's accurate for the vast majority of papers; always do
  a final compile on your target (Overleaf or your submission system).
- Change history is stored under a hidden git ref (`refs/latex-preview/checkpoints`) and never
  touches your branches, `git log`, or working tree.
