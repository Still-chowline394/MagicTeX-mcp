# MagicTeX — LaTeX Editor for AI Agents

<!-- badges -->
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

**English** · [简体中文](docs/i18n/README.zh-CN.md) · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Español](docs/i18n/README.es.md) · [Français](docs/i18n/README.fr.md) · [Deutsch](docs/i18n/README.de.md) · [Português](docs/i18n/README.pt.md)

**MagicTeX** is a **LaTeX editor built for AI agents** — an Overleaf-like
one-window workspace for Claude Code, served by an MCP server, with **no local TeX
install and no Overleaf account**: live PDF preview, a source editor with a Visual
(WYSIWYG) mode, change history, and **comments you anchor on the rendered PDF that
become edit instructions for the agent**. (npm package: `magictex-mcp`.)

It compiles with a WASM TeX Live 2026 engine ([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex))
running inside a headless browser, so there's nothing multi-gigabyte to install —
just a one-time WASM asset download.

![The MagicTeX workspace: file tree, source editor, live PDF, and a reviewer comment](docs/images/workspace.png)

## The workspace

One browser window (inspired by Typst's one-surface editor and LiquidText's
anchored annotations):

```
┌──────────────────────────────────────────────────────────────┐
│  ✓ up to date · 13 pages        Export .zip · Download PDF   │
├────────────┬──────────────────────────────┬──────────────────┤
│ Source /   │          PDF (live)          │    Comments      │
│ History    │  select text → 💬 comment    │  accepted → ask  │
│  editor,   │  highlights stay anchored    │  Claude to       │
│  timeline  │  auto-reloads on every edit  │  address them    │
│  + diffs   │                              │  → resolved ✓    │
└────────────┴──────────────────────────────┴──────────────────┘
```

- **Comment → Claude loop (the point of it all).** Review the *rendered* document
  like a supervisor marking up a printout: select text, attach a comment
  ("tighten this paragraph"). Then tell Claude to *"address my comments"* — it
  pulls them via `check_comments` as **located work items** (page + quoted passage
  + the source `file:line` it anchors to + your ask), edits the source, and
  resolves each card with a note. You interact with the document; Claude interacts
  with the source. Run it hands-off with `/loop` — see
  [`docs/AGENT-LOOP.md`](docs/AGENT-LOOP.md).
- **Editable source panel.** A CodeMirror LaTeX editor with the project's files —
  save (Ctrl+S) recompiles and refreshes the PDF, Typst-style. Or keep using your
  own editor: any save triggers the same live loop.
- **Live reload.** A file watcher recompiles on every save — Claude's edits, the
  built-in editor's, or your external editor's.
- **Change history.** Each successful compile is auto-snapshotted to a **hidden
  git ref** (`refs/latex-preview/checkpoints`) — never touching your branches,
  `git log`, or working tree. The History tab shows the timeline and each
  checkpoint's colorized diff beside the PDF.
- **Get to Overleaf.** **Download PDF**, **Export .zip** (clean build-inputs
  bundle), and a one-click **Open in Overleaf** link for public GitHub repos;
  Premium Git-bridge sync is a documented `git push`. See [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md).
- **Review workflow (reviewer → gate → resolver).** A reviewer/defender agent posts
  comments via `add_comment`; you **Accept/Reject** them (or flip *Auto-accept* for
  copilot mode); an author loop resolves the accepted ones. Comments carry roles and
  a reply thread. See [`docs/AGENT-LOOP.md`](docs/AGENT-LOOP.md).
- **Save vs. recompile, your call.** The built-in editor auto-saves every 30s without
  recompiling; **Ctrl+S** / **Save** / **Recompile** rebuild the PDF on demand. (Flip
  **⚡ Live** for recompile-as-you-type.) Your own editor and Claude's edits still
  auto-recompile via the watcher.
- **Real projects.** Auto-detects the main file, gathers multi-file
  `\input`/`\include`, `.bib`, in-repo `.cls`/`.sty`/`.bst` and figures, runs
  BibTeX and reruns when needed; common missing packages are auto-injected.
- **Compile backend.** Zero-install **WASM** TeX Live by default; pass
  `backend: "system"` (or `"auto"`) to `render_preview` to compile with your local
  **latexmk** for full package fidelity.
- **MCP tools:** `render_preview` (compile + open the workspace), `check_comments` /
  `resolve_comment` / `add_comment` / `reply_to_comment` (the review loop), `show_diff`
  (side-by-side diff as an image — useful on image-capable clients).
- **Actionable errors.** Failed compiles return parsed `{file, line, message}`
  errors so Claude can self-correct, and show in the workspace.

## Setup

1. **Add it to your paper project's `.mcp.json`** (see [`.mcp.json.example`](.mcp.json.example)):

   ```json
   {
     "mcpServers": {
       "magictex": { "command": "npx", "args": ["-y", "magictex-mcp"] }
     }
   }
   ```

   For local development from a clone, point it at the source instead:
   `"command": "npx", "args": ["tsx", "/absolute/path/to/magictex-mcp/src/server.ts"]`

2. **Restart Claude Code** (or `/mcp` reconnect) so it picks up the server.

3. **Ask Claude to render.** e.g. *"render a preview of this paper"* → the first call
   downloads the WASM TeX Live assets (~480 MB, one time), compiles, and opens the
   live preview tab. Subsequent edits reload it automatically.

The WASM assets are **not** in this repo — they're fetched on first run into
`assets/`. To pre-fetch them manually: `npx texlyre-busytex download-assets assets`.

## Install as a Claude Code plugin (slash commands)

For a low-typing workflow, install MagicTeX as a plugin — one install gives you the
MCP server **and** the slash commands:

```
/plugin marketplace add ZoeLinUTS/MagicTeX-mcp
/plugin install magictex
```

Then, in your paper project, use the **workflow commands** for the common flows:

- **`/magic-latex`** — compile and open the workspace (the live preview).
- **`/ai-review [skill]`** — review the paper with a skill (default
  `academic-paper-revision`; pass any skill name) and post comments for you to
  Accept/Reject. Missing skills are reported with an install hint.
- **`/address-comments`** — resolve your accepted comments (loop it with
  `/loop 60s /address-comments`).
- ⚡ **`/ultra-agents [skill] [depth]`** — fully autonomous: review, auto-accept, fix,
  repeat, up to `depth` rounds (default 2), stopping early the moment a round finds
  nothing new. No per-round approval — that's the point, and the risk. `depth > 5`
  asks you to confirm before starting. Ends with a summary (what was raised, what
  changed, which checkpoints to look at) — every round is still an ordinary,
  revertible checkpoint. See [`docs/AGENT-LOOP.md`](docs/AGENT-LOOP.md#ultra-agents).

### One command per tool

Every MCP tool also has a slash command with the **same name**, so you can drive any
single step by typing the tool name. The rule to teach: *the tool is `X` → type
`/X`.*

| Type this      | Runs tool         | What it does |
| -------------- | ----------------- | ------------ |
| `/render_preview` | `render_preview` | Compile the paper and open/refresh the live preview. |
| `/check_comments` | `check_comments` | List the comments you've accepted, as edit instructions (no edits yet). |
| `/resolve_comment [id] [note]` | `resolve_comment` | Mark a comment done after the edit; it turns **green** for your review. |
| `/add_comment ["quote"] [note]` | `add_comment` | Anchor a comment onto a passage for you to Accept/Reject. |
| `/reply_to_comment [id] [text]` | `reply_to_comment` | Add a threaded reply to a comment. |
| `/show_diff [sha]` | `show_diff` | Side-by-side visual diff as an image (current changes, or a checkpoint). |
| `/list_checkpoints [limit]` | `list_checkpoints` | Recent checkpoints with their sha, newest first — find one to pass into `/show_diff`. |

You never *have* to type these — plain English works too (*"render a preview"*,
*"address my comments"*). The commands are just a fast, teachable shorthand.

> The plugin's bundled MCP server runs `npx magictex-mcp`, so it works once the
> package is published to npm. Until then, keep the `.mcp.json` above for the server;
> the slash commands work either way.

## See it in the terminal

These are real tool outputs, captured verbatim from an actual run against the sample
paper — not mocked up. This is what you see in Claude Code while the browser
workspace (screenshot above) reflects the same state live.

You type:
```
/magic-latex
```
Claude calls `render_preview` and replies:
```
✓ Compiled main.tex with xelatex in 1900ms — 2 files. Workspace (live preview,
source editor, history, PDF comments — auto-reloads on edits):
http://127.0.0.1:52042/app
```

You (or a reviewer skill) leave a comment, then ask what's ready to act on. Claude
calls `check_comments`:
```
1 accepted comment — edit each at its source location per the instruction, then
call resolve_comment with its id and a one-line note:

[id: 2fce9e3c8b5f] p.1 — "Sorting widgets efficiently is a long-standing problem"
  ↳ source: main.tex:15
  → Tighten this opening sentence.

(1 reviewer suggestion still awaits the human's accept in the workspace — not
actionable yet.)
```
Claude makes the edit and calls `resolve_comment`:
```
✓ Resolved comment 2fce9e3c8b5f ("Sorting widgets efficiently is a long-standing
problem…") — the card now shows: Rewrote the opening sentence.
```
Ask again, and the accepted queue is empty — only the still-unaccepted suggestion
remains, waiting on you:
```
No accepted comments. (2 already resolved.)

(1 reviewer suggestion still awaits the human's accept in the workspace — not
actionable yet.)
```

## How it works

```
Claude edits .tex ─┐
 file watcher ─────┼─▶ compile coordinator ─▶ headless Chromium ─▶ WASM TeX ─▶ PDF
 render_preview ───┘         (serialized)         (engine host)                │
                                                                               ▼
                     your workspace (/app)  ◀── WebSocket "reload" ◀── local HTTP server
                     Source · PDF · History · Comments        (serves /app + /latest.pdf)
```

The WASM engines need DOM/Worker globals, so the server hosts a hidden headless
Chromium as its compile worker; the workspace *you* open is a lightweight React +
pdf.js app with no WASM in it. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```mermaid
flowchart LR
  H["👤 You<br/>Source · PDF · History · Comments"]
  A["🤖 Claude Code<br/>+ review / author agents"]

  H <-->|"select text →<br/>anchor comment"| SRV["Preview server<br/>HTTP + WebSocket · serves /app"]
  A -->|"7 MCP tools"| MCP["MCP server<br/>render_preview · show_diff · list_checkpoints<br/>check / resolve / add / reply_comment"]

  SRV --> CO["Compile coordinator<br/>(serialized)"]
  MCP --> CO
  A -. edits source .-> FILES[("Paper files · git repo")]
  FILES --> WATCH["File watcher"] --> CO
  CO --> ENG["WASM busytex<br/>(headless Chromium)"] --> PDF["/latest.pdf"]
  PDF -. live reload .-> H
  CO --> CK["git checkpoints<br/>(hidden ref) → History"]

  SRV <--> CJSON[(".latex-preview/<br/>comments.json")]
  MCP <--> CJSON
  CJSON -->|"check_comments<br/>(your accepted asks)"| A
```

Both front doors — you in the workspace, agents through the 7 MCP tools — meet at
the same coordinator, comment store, and git history. You act on the *rendered
document* (anchor a comment); Claude acts on the *source* (reads your comments via
`check_comments`, edits, `resolve_comment`). That shared substrate is what makes
the comment loop, the review workflow, and traceable history possible.

## Requirements

- Node 20+
- Playwright's Chromium (installed automatically; ~150–300 MB) — or set it to reuse
  your installed Chrome.
- ~650 MB disk for the one-time WASM TeX Live assets (a normal paper only needs the
  ~118 MB basic set; larger package sets load on demand).

## Development

```bash
npm install
npm run typecheck    # tsc for the server and the UI
npm run build:ui     # build the React workspace to ui/dist
npm test             # comment store, anchor matching, and an MCP workflow E2E
npm start            # run the server on stdio (for a manual MCP client)
```

CI (`.github/workflows/ci.yml`) runs typecheck + UI build + tests on Node 20 and 22
for every push and pull request. The tests are engine-free (no headless browser), so
they're fast and deterministic; please keep them green and add coverage with changes.

## Documentation

- [**User guide**](docs/USER-GUIDE.md) — everyday use, the comment loop, Visual mode, the
  file tree, getting your paper into Overleaf, package coverage.
- [**The agent loop**](docs/AGENT-LOOP.md) — comments as triggers, running it hands-off with
  `/loop`, the reviewer → gate → resolver workflow, and ⚡ `/ultra-agents`.
- [**Roadmap**](docs/ROADMAP.md) — what's shipped for concurrent agents, and what real
  parallel multi-agent editing still needs.
- [**Architecture**](docs/ARCHITECTURE.md) — why a headless browser, what every module does,
  the compile flow.

All four are translated into the same 8 languages as this README — each page has its own
language switcher at the top.

## Roadmap

Multiple Claude Code sessions can already work the same project concurrently without
corrupting comments or the checkpoint history (see [`docs/ROADMAP.md`](docs/ROADMAP.md))
— true parallel multi-agent editing (reviewer/author/defender on their own git branches,
merged back together) is the next milestone.

## Sponsor this project

MagicTeX is free and open source (AGPL-3.0). If it saves you time on your papers,
please consider **[sponsoring the project](https://github.com/sponsors/ZoeLinUTS)** —
it funds continued development. A ⭐ on the repo helps too.

## License

[AGPL-3.0-or-later](LICENSE) — matching the `texlyre-busytex` engine it builds on.
See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
