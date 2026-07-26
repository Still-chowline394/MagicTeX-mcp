# Arquitectura

[English](../ARCHITECTURE.md) · [简体中文](ARCHITECTURE.zh-CN.md) · [日本語](ARCHITECTURE.ja.md) · [한국어](ARCHITECTURE.ko.md) · **Español** · [Français](ARCHITECTURE.fr.md) · [Deutsch](ARCHITECTURE.de.md) · [Português](ARCHITECTURE.pt.md)

> Este documento sigue de cerca al código. Rutas de archivo, nombres de función e identificadores se dejan en inglés.

## Por qué un navegador headless

Los motores WASM de TeX Live (`texlyre-busytex`, y SwiftLaTeX antes) son **librerías de navegador**: internamente llaman a `document.createElement('script')` y `new Worker(...)`, y no pueden ejecutarse en un proceso Node pelado. Por eso el servidor MCP lanza un **Chromium headless oculto** (vía Playwright) como su worker de compilación. El motor se inicializa una vez allí y se reutiliza en cada compilación.

Beneficio colateral: como el motor vive en el navegador oculto, la pestaña que **tú** abres es el espacio de trabajo React con un visor `pdf.js` ligero — sin WASM dentro.

## Piezas

- `src/server.ts` — servidor MCP stdio; registra las 7 herramientas. Todo lo pesado es perezoso: el motor, el servidor de vista previa y el watcher arrancan en la primera llamada a `render_preview`, no al conectar.
- `src/tools/*ToolDef.ts` — un archivo por grupo de herramientas, cada uno exportando su nombre + esquema Zod de entrada + descripción: `renderPreviewToolDef.ts`, `commentsToolDefs.ts` (`check_comments` / `resolve_comment` / `add_comment` / `reply_to_comment`), `showDiffToolDef.ts`, `listCheckpointsToolDef.ts`.
- `src/lock.ts` — mutex entre procesos (archivo de bloqueo exclusivo + recuperación de bloqueos obsoletos) para el estado compartido entre procesos de servidor MCP que corren a la vez: cada sesión de Claude Code lanza su propio `tsx server.ts` (MCP por stdio = un proceso hijo por cliente), así que un bloqueo dentro del proceso no bastaría para proteger dos sesiones trabajando el mismo proyecto. Ver [`ROADMAP.es.md`](ROADMAP.es.md).
- `src/engine/browserHost.ts` — Chromium headless singleton + página anfitriona del motor; expone `compile(files, mainTexPath, engine)`. Mantiene el motor inicializado una sola vez.
- `src/engine/hostPage.ts` — el HTML de la página oculta; importa el motor WASM y expone `window.__compile`. Los nombres de los paquetes de datos llevan sufijo `.js` (se pasan tal cual a `importScripts`); las figuras binarias llegan en base64.
- `src/engine/assets.ts` — descarga en la primera ejecución de los recursos WASM de TeX Live.
- `src/engine/fallbackStyles.ts` — incluye los `.sty` que el subconjunto de TeX Live empaquetado omite (familia algorithms, multirow, una aproximación de `bbm`) y los inyecta al compilar cuando el proyecto no trae su propia copia.
- `src/preview/previewServer.ts` — un único servidor local HTTP+WS: sirve la página anfitriona del motor + los recursos WASM al navegador oculto; el espacio de trabajo (`/app`, desde `ui/dist`) o el visor inline heredado (`src/preview/viewerPage.ts`, solo si falta `ui/dist`); `/api/*` (archivos, comentarios, subidas); `/git/*` (checkpoints, diff, estado); `/export.zip` + `/overleaf/link`. Todas las respuestas llevan cabeceras COOP/COEP (el Worker/SharedArrayBuffer del motor requieren aislamiento entre orígenes).
- `src/preview/filesApi.ts` — el árbol de archivos y leer/escribir/renombrar/borrar/subir detrás de `/api/*`, con protección contra travesía de rutas.
- `src/preview/commentsStore.ts` — comentarios persistidos en `<project>/.latex-preview/comments.json` (escritura atómica: archivo temporal + renombrado), todas las mutaciones bajo `lock.ts`. Flujo de estados: `suggested` → (el humano acepta) → `accepted` → (el autor resuelve) → `resolved`.
- `src/preview/anchorMatch.ts` — búsqueda cita → `{file, line}` con el mejor esfuerzo, para que `check_comments` pueda señalarle a Claude una ubicación sin un índice real.
- `src/preview/diffViewPage.ts` — la página oculta de la que `show_diff` toma captura para devolver un diff como imagen.
- `src/project/*` — `resolveMainFile` (encontrar `\documentclass`), `collectProjectFiles` (reunir el árbol del proyecto), `compileProject` (la compilación compartida), `parseLog` (log de TeX → `{file, line, message}`).
- `src/export/overleafZip.ts` — construye un zip limpio de entradas de compilación (excluye PDFs compilados, `.git`, `.latex-preview`) para `/export.zip` y el "Upload Project" de Overleaf.
- `src/git/historyRepo.ts` — decide dónde vive el historial de un proyecto. Un repositorio git lo mantiene en la ref oculta dentro de sí mismo; una carpeta simple recibe un repositorio nuestro en `.latex-preview/history.git`, con el proyecto como árbol de trabajo — así el historial sigue al artículo y no a la ruta: se mueve, se copia y se borra con la carpeta, y `git` ejecutado ahí sigue diciendo que no hay repositorio. Los historiales anteriores a 0.1.9 vivían en la caché por usuario bajo un hash de la ruta; solo se adopta uno cuando sus bytes registrados aún coinciden con un archivo en disco, de modo que una ruta reutilizada no puede heredar los checkpoints de otro proyecto.
- `src/git/checkpoints.ts` — auto-checkpoints al estilo Zed. En cada compilación exitosa, instantánea del árbol de trabajo hacia una cadena de commits paralela bajo una **ref oculta** (`refs/latex-preview/checkpoints`) usando un index temporal (`GIT_INDEX_FILE`), de modo que el árbol de trabajo / index / HEAD / ramas del usuario nunca se tocan. Toda operación que escribe (`createCheckpoint`, `restoreCheckpoint`, `restoreFile`) corre bajo `lock.ts`. Los diffs y la lista de checkpoints excluyen `.latex-preview/` y `.claude/` (pathspec de exclusión de git) — ninguno forma parte del artículo del usuario.
- `src/git/remote.ts` — analiza el remoto de GitHub (si lo hay) para construir el enlace Open-in-Overleaf de repos públicos.
- `src/coordinator.ts` — serializa todas las compilaciones **dentro de un proceso** (herramienta + watcher) en una única cadena de promesas; tras cada compilación exitosa crea un checkpoint de git. La serialización entre procesos del estado compartido es tarea de `lock.ts`, no de aquí — el coordinador solo posee el motor WASM, que ya es uno por proceso.
- `src/watch/fileWatcher.ts` — watcher chokidar para la recarga en vivo pasiva.
- `src/session.ts` — la raíz del proyecto actual, compartida entre el coordinador (que la fija) y los endpoints de git/comentarios (que la leen), sin ciclo de imports.

## Flujo de compilación

```
render_preview ─┐                          ┌─ setLatestPdf ─▶ WS "reload" ─▶ espacio de trabajo
                ├─▶ coordinator (serial) ──▶│
guardar archivo ┘        compileProject     └─ compile-error ─▶ WS ─▶ banner de error
                          │
                          ├─ resolveMainFile + collectProjectFiles
                          └─ browserHost.compile → page.evaluate(window.__compile)
                                                    → BusyTexRunner (reutilizado) → PDF
```

## La UI del espacio de trabajo (`ui/`)

Una app Vite+React+TS construida a `ui/dist` (`npm run build:ui`) y servida estáticamente por el servidor de vista previa en `/app` — mismo origen que la API y el WebSocket, así que sin proxy ni CORS. El servidor recurre al `/viewer` inline heredado cuando falta `ui/dist` (clon recién hecho antes de compilar).

- `ui/src/App.tsx` — armazón de tres paneles: pestañas a la izquierda (Source | History), PDF al centro, Comments a la derecha.
- `ui/src/components/Toolbar.tsx` — marca + título del documento, Recompile, interruptor de comentarios, Export .zip / Download PDF.
- `ui/src/components/PdfView.tsx` — canvas de pdf.js + **capa de texto** (seleccionable) + capa de resaltados; seleccionar texto abre el compositor de comentarios. Los resaltados se **re-anclan al texto en vivo en cada render** (emparejando la frase inicial y final de la cita del comentario, acortándolas progresivamente) en vez de fijarse a coordenadas congeladas, así siguen la recomposición tras una edición; con forma de selección de texto (primera/última línea parciales, líneas intermedias a ancho completo) para que un resaltado multilínea no se fragmente por rarezas de métricas de fuente (cursivas, matemáticas en línea).
- `ui/src/components/SourcePanel.tsx` — editor LaTeX CodeMirror 6 (modos Code/Visual, interruptor de ajuste de línea) sobre `/api/files` + `/api/file` (GET/PUT, con protección de rutas); autoguarda cada 30s sin recompilar, y Ctrl+S / Save / Recompile reconstruyen bajo demanda.
- `ui/src/components/FileTree.tsx` — árbol de archivos anidado al estilo Overleaf: nuevo/renombrar/borrar, subida de figuras, altura ajustable.
- `ui/src/components/HistoryPanel.tsx` + `DiffView.tsx` — línea de tiempo de checkpoints; un renderizador de diff unificado hecho a mano (no diff2html) con secciones plegables por archivo; botones de **restaurar** por checkpoint y por archivo (`POST /git/restore`, `/git/restore-file`).
- `ui/src/components/CommentsPanel.tsx` — tarjetas suggested/accepted/resolved, el interruptor Auto-accept (copilot), salto al resaltado.
- Bucle MCP de comentarios: `check_comments` devuelve los comentarios aceptados como instrucciones estructuradas; `resolve_comment` marca uno como resuelto con una nota; ambos extremos se mantienen en sync mediante el evento WS `comments-changed`.

## Fuera de alcance (por ahora)

Ver [`ROADMAP.es.md`](ROADMAP.es.md) para el detalle de qué está listo y qué está planeado. En resumen: la edición multi-agente realmente concurrente (revisor/autor/defensor editando de verdad al mismo tiempo, en sus propias ramas de git, fusionadas después) es el próximo hito — el bloqueo entre procesos de hoy (`src/lock.ts`) hace que las *sesiones* concurrentes estén a salvo de pérdida de datos, pero siguen turnándose en vez de editar el mismo archivo en paralelo de verdad.
