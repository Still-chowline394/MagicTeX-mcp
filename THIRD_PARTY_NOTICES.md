# Third-party notices

This project depends on the following packages at runtime. Their licenses apply
to their respective code; this project itself is licensed under AGPL-3.0-or-later
(see `LICENSE`).

| Package | License | Role |
|---|---|---|
| [`texlyre-busytex`](https://github.com/TeXlyre/texlyre-busytex) | AGPL-3.0-or-later | WASM TeX Live engine (the LaTeX compiler). Driven at arm's length via IPC into a headless browser page; its ~480 MB TeX Live assets are downloaded from its GitHub Releases on first run, not redistributed here. |
| [`pdfjs-dist`](https://github.com/mozilla/pdf.js) | Apache-2.0 | Renders the compiled PDF in the preview page. |
| [`playwright`](https://github.com/microsoft/playwright) | Apache-2.0 | Hosts the headless Chromium that runs the WASM engine. |
| [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) | MIT | MCP server/stdio transport. |
| [`chokidar`](https://github.com/paulmillr/chokidar) | MIT | File watcher for passive live-reload. |
| [`ws`](https://github.com/websockets/ws) | MIT | WebSocket push to the preview page. |
| [`open`](https://github.com/sindresorhus/open) | MIT | Opens the preview tab in the default browser. |
| [`zod`](https://github.com/colinhacks/zod) | MIT | Tool input schema. |
| [`adm-zip`](https://github.com/cthackers/adm-zip) | MIT | Builds the Overleaf export zip. |

The chosen AGPL-3.0-or-later license matches `texlyre-busytex`, the core engine
dependency.

## Vendored LaTeX packages (`assets/fallback-styles/`)

busytex's bundled TeX Live is a subset; these common packages are omitted, so we
vendor them **unmodified** and inject them at compile time when a project uses them.
All are **LPPL** (LaTeX Project Public License) and redistributable:

| File | Package / bundle | Author |
|---|---|---|
| `algorithm.sty`, `algorithmic.sty` | [`algorithms`](https://ctan.org/pkg/algorithms) | Rogério Brito et al. |
| `algorithmicx.sty`, `algpseudocode.sty` | [`algorithmicx`](https://ctan.org/pkg/algorithmicx) | Szász János |

`assets/fallback-styles/bbm.sty` is **not** the real `bbm` package (that needs fonts
absent from the WASM subset). It is a small **preview shim** written for this project
that approximates `\mathbbm` (letters via amssymb's `\mathbb`; the `\mathbbm{1}`
indicator via a poor-man's double-struck 1) so papers using bbm still render locally.
Your final compile on Overleaf uses the real bbm.
