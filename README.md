# latex-live-preview-mcp

<!-- badges -->
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/latex-live-preview-mcp?style=flat)](https://github.com/ZoeLinUTS/latex-live-preview-mcp/stargazers)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

A local **MCP server for Claude Code** that gives you an Overleaf-like **live PDF
preview** of your LaTeX project — right on your machine, with **no local TeX
install and no Overleaf account**. Claude edits your `.tex`, and you (and Claude)
see the rendered PDF update instantly.

It compiles with a WASM TeX Live 2026 engine ([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex))
running inside a headless browser, so there's nothing multi-gigabyte to install —
just a one-time WASM asset download.

> **Status:** working — `render_preview` tool, real multi-file projects
> (`\input` + `.bib` + `\cite`/`\ref`), a live pdf.js viewer with auto-reload on
> save, a **change-history panel** (auto-checkpoints beside the preview), and
> **export to Overleaf** (clean zip + one-click "Open in Overleaf" for public
> GitHub repos; Premium Git-bridge is a documented push).

## What it does

- **One tool, `render_preview`.** Compiles your project's main `.tex` and opens/updates
  a live preview in your browser.
- **Live reload.** A file watcher recompiles on every save, so the preview stays
  current between tool calls and on manual edits — no refresh needed.
- **Change history, beside the preview.** Each successful compile is auto-snapshotted
  to a **hidden git ref** (`refs/latex-preview/checkpoints`) — never touching your
  real branches, `git log`, or working tree. A toggleable History panel lists the
  checkpoints and shows each one's `.tex` diff *next to the rendered PDF*, so you see
  a source change and its effect together.
- **Get to Overleaf.** One-click **Download PDF**, **Export .zip** (a clean upload
  bundle — build inputs only), and, for public GitHub repos, a one-click **Open in
  Overleaf** link. Syncing to an existing Overleaf project uses its Git bridge (a
  documented `git push`; your token stays with you). See [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md).
- **Real projects.** Auto-detects the main file (`\documentclass`), gathers the
  whole project (multi-file `\input`/`\include`, `.bib`, in-repo `.cls`/`.sty`/`.bst`,
  figures), runs BibTeX and multiple passes when the document needs them.
- **Actionable errors.** A failed compile returns parsed `{file, line, message}`
  errors so Claude can fix them, and shows them in the preview.

## Setup

1. **Add it to your paper project's `.mcp.json`** (see [`.mcp.json.example`](.mcp.json.example)):

   ```json
   {
     "mcpServers": {
       "latex-live-preview": { "command": "npx", "args": ["-y", "latex-live-preview-mcp"] }
     }
   }
   ```

   For local development from a clone, point it at the source instead:
   `"command": "npx", "args": ["tsx", "/absolute/path/to/latex-live-preview-mcp/src/server.ts"]`

2. **Restart Claude Code** (or `/mcp` reconnect) so it picks up the server.

3. **Ask Claude to render.** e.g. *"render a preview of this paper"* → the first call
   downloads the WASM TeX Live assets (~480 MB, one time), compiles, and opens the
   live preview tab. Subsequent edits reload it automatically.

The WASM assets are **not** in this repo — they're fetched on first run into
`assets/`. To pre-fetch them manually: `npx texlyre-busytex download-assets assets`.

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

## License

[AGPL-3.0-or-later](LICENSE) — matching the `texlyre-busytex` engine it builds on.
See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
