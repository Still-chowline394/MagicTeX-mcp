# MagicTeX — LaTeX Editor for AI Agents

<!-- badges -->
[![CI](https://github.com/ZoeLinUTS/magictex-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/magictex-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/magictex-mcp?style=flat)](https://github.com/ZoeLinUTS/magictex-mcp/stargazers)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

**MagicTeX** is a **LaTeX editor built for AI agents** — an Overleaf-like
one-window workspace for Claude Code, served by an MCP server, with **no local TeX
install and no Overleaf account**: live PDF preview, a source editor with a Visual
(WYSIWYG) mode, change history, and **comments you anchor on the rendered PDF that
become edit instructions for the agent**. (npm package: `magictex-mcp`.)

It compiles with a WASM TeX Live 2026 engine ([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex))
running inside a headless browser, so there's nothing multi-gigabyte to install —
just a one-time WASM asset download.

## The workspace

One browser window (inspired by Typst's one-surface editor and LiquidText's
anchored annotations):

```
┌──────────────────────────────────────────────────────────────┐
│  ✓ up to date · 13 pages        Export .zip · Download PDF   │
├────────────┬──────────────────────────────┬──────────────────┤
│ Source /   │          PDF (live)          │    Comments      │
│ History    │  select text → 💬 comment    │  pending → ask   │
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
/plugin marketplace add ZoeLinUTS/magictex-mcp
/plugin install magictex
```

Then, in your paper project:

- **`/magic-latex`** — compile and open the workspace (the live preview).
- **`/ai-review [skill]`** — review the paper with a skill (default
  `academic-paper-revision`; pass any skill name) and post comments for you to
  Accept/Reject. Missing skills are reported with an install hint.
- **`/address-comments`** — resolve your accepted comments (loop it with
  `/loop 60s /address-comments`).

> The plugin's bundled MCP server runs `npx magictex-mcp`, so it works once the
> package is published to npm. Until then, keep the `.mcp.json` above for the server;
> the slash commands work either way.

## How it works

```
Claude edits .tex ─┐
 file watcher ─────┼─▶ compile coordinator ─▶ headless Chromium ─▶ WASM TeX ─▶ PDF
 render_preview ───┘         (serialized)         (engine host)                │
                                                                               ▼
                        your browser tab  ◀── WebSocket "reload" ◀── local HTTP server
                        (pdf.js viewer, /latest.pdf)
```

The WASM engines need DOM/Worker globals, so the server hosts a hidden headless
Chromium as its compile worker; the tab *you* open is a lightweight pdf.js viewer
with no WASM in it. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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

## License

[AGPL-3.0-or-later](LICENSE) — matching the `texlyre-busytex` engine it builds on.
See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
