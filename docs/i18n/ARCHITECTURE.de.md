# Architektur

[English](../ARCHITECTURE.md) · [简体中文](ARCHITECTURE.zh-CN.md) · [日本語](ARCHITECTURE.ja.md) · [한국어](ARCHITECTURE.ko.md) · [Español](ARCHITECTURE.es.md) · [Français](ARCHITECTURE.fr.md) · **Deutsch** · [Português](ARCHITECTURE.pt.md)

> Dieses Dokument folgt eng dem Code. Dateipfade, Funktionsnamen und Bezeichner bleiben auf Englisch.

## Warum ein Headless-Browser

Die WASM-TeX-Live-Engines (`texlyre-busytex`, davor SwiftLaTeX) sind **Browser-Bibliotheken**: Sie rufen intern `document.createElement('script')` und `new Worker(...)` auf und laufen nicht in einem nackten Node-Prozess. Deshalb startet der MCP-Server ein **verstecktes Headless-Chromium** (via Playwright) als Kompilier-Worker. Die Engine wird dort einmal initialisiert und für jede Kompilierung wiederverwendet.

Nebeneffekt: Da die Engine im versteckten Browser lebt, ist der Tab, den **du** öffnest, der React-Arbeitsbereich mit einem schlanken `pdf.js`-Viewer — ganz ohne WASM.

## Bausteine

- `src/server.ts` — MCP-stdio-Server; registriert alle 7 Tools. Alles Schwere ist lazy: Engine, Preview-Server und Datei-Watcher starten beim ersten `render_preview`-Aufruf, nicht beim Verbinden.
- `src/tools/*ToolDef.ts` — eine Datei pro Tool-Gruppe, jeweils mit Name + Zod-Eingabeschema + Beschreibung: `renderPreviewToolDef.ts`, `commentsToolDefs.ts` (`check_comments` / `resolve_comment` / `add_comment` / `reply_to_comment`), `showDiffToolDef.ts`, `listCheckpointsToolDef.ts`.
- `src/lock.ts` — prozessübergreifender Mutex (exklusive Lock-Datei + Wiederherstellung veralteter Sperren) für Zustand, den mehrere gleichzeitig laufende MCP-Server-Prozesse teilen: Jede Claude-Code-Sitzung startet ihr eigenes `tsx server.ts` (stdio-MCP = ein Kindprozess pro Client), eine prozessinterne Sperre würde zwei Sitzungen am selben Projekt also nicht schützen. Siehe [`ROADMAP.de.md`](ROADMAP.de.md).
- `src/engine/browserHost.ts` — Singleton-Headless-Chromium + Engine-Hostseite; stellt `compile(files, mainTexPath, engine)` bereit und hält die Engine einmal initialisiert.
- `src/engine/hostPage.ts` — das HTML der versteckten Seite; importiert die WASM-Engine und stellt `window.__compile` bereit. Namen von Datenpaketen tragen ein `.js`-Suffix (sie werden roh an `importScripts` gereicht); binäre Abbildungen kommen base64-kodiert an.
- `src/engine/assets.ts` — Download der WASM-TeX-Live-Assets beim ersten Start.
- `src/engine/fallbackStyles.ts` — liefert die `.sty` mit, die die gebündelte TeX-Live-Teilmenge auslässt (algorithms-Familie, multirow, eine `bbm`-Näherung), und spielt sie beim Kompilieren ein, wenn das Projekt keine eigene Kopie hat.
- `src/preview/previewServer.ts` — ein lokaler HTTP+WS-Server: liefert die Engine-Hostseite + WASM-Assets an den versteckten Browser; den Arbeitsbereich (`/app`, aus `ui/dist`) oder den alten Inline-Viewer (`src/preview/viewerPage.ts`, nur wenn `ui/dist` fehlt); `/api/*` (Dateien, Kommentare, Upload); `/git/*` (Checkpoints, Diff, Status); `/export.zip` + `/overleaf/link`. Alle Antworten tragen COOP/COEP-Header (Worker/SharedArrayBuffer der Engine brauchen Cross-Origin-Isolation).
- `src/preview/filesApi.ts` — Dateibaum sowie Lesen/Schreiben/Umbenennen/Löschen/Hochladen hinter `/api/*`, mit Schutz gegen Path-Traversal.
- `src/preview/commentsStore.ts` — Kommentare persistiert in `<project>/.latex-preview/comments.json` (atomares Schreiben: temporäre Datei + Umbenennen), alle Änderungen hinter `lock.ts`. Zustandsfluss: `suggested` → (Mensch akzeptiert) → `accepted` → (Autor löst auf) → `resolved`.
- `src/preview/anchorMatch.ts` — Best-Effort-Zuordnung Zitat → `{file, line}`, damit `check_comments` Claude eine Stelle nennen kann, ohne echten Index.
- `src/preview/diffViewPage.ts` — die versteckte Seite, von der `show_diff` einen Screenshot macht, um einen Diff als Bild zurückzugeben.
- `src/project/*` — `resolveMainFile` (`\documentclass` finden), `collectProjectFiles` (Projektbaum sammeln), `compileProject` (die gemeinsame Kompilierung), `parseLog` (TeX-Log → `{file, line, message}`).
- `src/export/overleafZip.ts` — baut ein sauberes Zip der Build-Eingaben (ohne kompilierte PDFs, `.git`, `.latex-preview`) für `/export.zip` und Overleafs „Upload Project“.
- `src/git/checkpoints.ts` — Zed-artige Auto-Checkpoints. Bei jeder erfolgreichen Kompilierung wird der Arbeitsbaum über einen temporären Index (`GIT_INDEX_FILE`) in eine parallele Commit-Kette unter einer **versteckten Ref** (`refs/latex-preview/checkpoints`) gespiegelt, sodass Arbeitsbaum / Index / HEAD / Branches des Nutzers nie angefasst werden. Jede schreibende Operation (`createCheckpoint`, `restoreCheckpoint`, `restoreFile`) läuft unter `lock.ts`. Diffs und die Checkpoint-Liste schließen `.latex-preview/` und `.claude/` aus (git-Exclude-Pathspec) — beides gehört nicht zum Paper.
- `src/git/remote.ts` — liest das GitHub-Remote (falls vorhanden) aus, um den Open-in-Overleaf-Link für öffentliche Repos zu bauen.
- `src/coordinator.ts` — serialisiert alle Kompilierungen **innerhalb eines Prozesses** (Tool + Watcher) über eine einzige Promise-Kette; nach jeder erfolgreichen Kompilierung entsteht ein Git-Checkpoint. Die prozessübergreifende Serialisierung geteilten Zustands ist Aufgabe von `lock.ts`, nicht hier — der Coordinator besitzt nur die WASM-Engine, und die gibt es ohnehin einmal pro Prozess.
- `src/watch/fileWatcher.ts` — chokidar-Watcher für passives Live-Reload.
- `src/session.ts` — der aktuelle Projektstamm, geteilt zwischen Coordinator (setzt ihn) und den git/Kommentar-Endpunkten (lesen ihn), ohne Import-Zyklus.

## Kompilierungsablauf

```
render_preview ─┐                          ┌─ setLatestPdf ─▶ WS "reload" ─▶ Arbeitsbereich
                ├─▶ coordinator (seriell) ─▶│
Datei speichern ┘        compileProject     └─ compile-error ─▶ WS ─▶ Fehlerbanner
                          │
                          ├─ resolveMainFile + collectProjectFiles
                          └─ browserHost.compile → page.evaluate(window.__compile)
                                                    → BusyTexRunner (wiederverwendet) → PDF
```

## Die Arbeitsbereich-UI (`ui/`)

Eine Vite+React+TS-App, gebaut nach `ui/dist` (`npm run build:ui`) und vom Preview-Server statisch unter `/app` ausgeliefert — gleiche Herkunft wie API und WebSocket, also kein Proxy und kein CORS. Fehlt `ui/dist` (frischer Klon vor dem Build), fällt der Server auf den alten Inline-`/viewer` zurück.

- `ui/src/App.tsx` — Drei-Panel-Gerüst: Tabs links (Source | History), PDF in der Mitte, Comments rechts.
- `ui/src/components/Toolbar.tsx` — Markenzeichen + Dokumenttitel, Recompile, Kommentar-Umschalter, Export .zip / Download PDF.
- `ui/src/components/PdfView.tsx` — pdf.js-Canvas + **Textebene** (markierbar) + Hervorhebungsebene; Textauswahl öffnet den Kommentar-Editor. Hervorhebungen werden **bei jedem Rendern neu am lebenden Text verankert** (durch Abgleich der Anfangs- und Endphrase des Kommentarzitats, schrittweise gekürzt), statt auf eingefrorenen Koordinaten festzuhängen — so folgen sie dem Umbruch nach einer Bearbeitung. Ihre Form entspricht einer Textauswahl (erste/letzte Zeile teilweise, mittlere Zeilen bündig über die volle Breite), damit eine mehrzeilige Hervorhebung nicht an Schriftmetrik-Eigenheiten (Kursive, Inline-Mathematik) zerbricht.
- `ui/src/components/SourcePanel.tsx` — CodeMirror-6-LaTeX-Editor (Code/Visual-Modus, Zeilenumbruch-Schalter) über `/api/files` + `/api/file` (GET/PUT, pfadgeschützt); speichert alle 30s automatisch ohne Neukompilierung, Ctrl+S / Save / Recompile bauen auf Wunsch neu.
- `ui/src/components/FileTree.tsx` — verschachtelter Dateibaum im Overleaf-Stil: neu/umbenennen/löschen, Abbildungs-Upload, höhenverstellbar.
- `ui/src/components/HistoryPanel.tsx` + `DiffView.tsx` — Checkpoint-Zeitleiste; ein selbstgeschriebener Unified-Diff-Renderer (nicht diff2html) mit pro Datei einklappbaren Abschnitten; **Wiederherstellen**-Buttons pro Checkpoint und pro Datei (`POST /git/restore`, `/git/restore-file`).
- `ui/src/components/CommentsPanel.tsx` — Karten für suggested/accepted/resolved, der Auto-accept-(copilot-)Schalter, Sprung zur Hervorhebung.
- Kommentar-MCP-Schleife: `check_comments` liefert akzeptierte Kommentare als strukturierte Anweisungen; `resolve_comment` markiert einen mit Notiz als gelöst; beide Seiten bleiben über das WS-Ereignis `comments-changed` synchron.

## Außerhalb des Umfangs (vorerst)

Für Details zu „fertig vs. geplant“ siehe [`ROADMAP.de.md`](ROADMAP.de.md). Kurz gesagt: Echtes gleichzeitiges Multi-Agent-Bearbeiten (Reviewer/Autor/Defender bearbeiten wirklich zeitgleich, auf eigenen Git-Branches, danach zusammengeführt) ist der nächste Meilenstein — die heutige prozessübergreifende Sperre (`src/lock.ts`) schützt gleichzeitige *Sitzungen* vor Datenverlust, aber sie wechseln sich weiterhin ab, statt dieselbe Datei wirklich parallel zu bearbeiten.
