# Architecture

## Why a headless browser

The WASM TeX Live engines (`texlyre-busytex`, and SwiftLaTeX before it) are
browser libraries: they call `document.createElement('script')` and
`new Worker(...)` internally and cannot run in a bare Node process. So the MCP
server launches a **hidden headless Chromium** (via Playwright) as its compile
worker. The engine initializes once there and is reused for every compile.

A side benefit: because the engine lives in the hidden browser, the tab **you**
open is a lightweight `pdf.js` viewer with no WASM in it.

## Pieces

- `src/server.ts` — MCP stdio server; registers the single `render_preview` tool.
  Everything heavy is lazy: created on the first tool call.
- `src/engine/browserHost.ts` — singleton headless Chromium + engine host page;
  exposes `compile(files, mainTexPath, engine)`. Keeps the engine initialized once.
- `src/engine/hostPage.ts` — the hidden page's HTML; imports the WASM engine and
  exposes `window.__compile`. Data-package names carry a `.js` suffix (they're
  passed raw to `importScripts`); binary figures arrive base64-encoded.
- `src/engine/assets.ts` — first-run download of the ~480 MB WASM TeX Live assets.
- `src/preview/previewServer.ts` — one local HTTP+WS server: serves the engine host
  page + WASM assets to the hidden browser, and the pdf.js viewer + `/latest.pdf` +
  a WebSocket reload channel to your tab. All responses carry COOP/COEP headers
  (the engine's Worker/SharedArrayBuffer require cross-origin isolation).
- `src/preview/viewerPage.ts` — the human-facing viewer; renders `/latest.pdf` with
  pdf.js and re-renders on a WS `reload`, preserving scroll.
- `src/project/*` — `resolveMainFile` (find `\documentclass`), `collectProjectFiles`
  (gather the project tree), `compileProject` (the shared compile), `parseLog`
  (TeX log → `{file, line, message}`).
- `src/coordinator.ts` — serializes all compiles (tool + watcher) through one chain.
- `src/watch/fileWatcher.ts` — chokidar watcher for passive live-reload.

## Compile flow

```
render_preview ─┐                          ┌─ setLatestPdf ─▶ WS "reload" ─▶ viewer
                ├─▶ coordinator (serial) ──▶│
file save ──────┘        compileProject     └─ compile-error ─▶ WS ─▶ viewer banner
                          │
                          ├─ resolveMainFile + collectProjectFiles
                          └─ browserHost.compile → page.evaluate(window.__compile)
                                                    → BusyTexRunner (reused) → PDF
```

## Out of scope (for now)

- **Pushing back to Overleaf.** A later phase, and only via official paths:
  Open-in-Overleaf zip-URI (new project, any tier) for free users, the Git bridge
  for Premium. No reverse-engineered internal APIs.
- **Version history.** Just use git — Claude Code already has shell access.
