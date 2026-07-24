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
