# MagicTeX — Editor de LaTeX para agentes de IA

<!-- badges -->
[![npm](https://img.shields.io/npm/v/magictex-mcp?logo=npm)](https://www.npmjs.com/package/magictex-mcp)
[![MCP registry](https://img.shields.io/badge/MCP%20registry-io.github.ZoeLinUTS%2Fmagictex-6f42c1)](https://registry.modelcontextprotocol.io)
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](../../LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md)

![MagicTeX workspace](../images/workspace.png)

**MagicTeX** es un **editor de LaTeX creado para agentes de IA**: un espacio de trabajo de
**una sola ventana** al estilo Overleaf para Claude Code, servido por un servidor MCP, **sin
instalación local de TeX ni cuenta de Overleaf**: vista previa del PDF en vivo, un editor de
código con **modo Visual (WYSIWYG)**, historial de cambios y **comentarios que anclas en el
PDF renderizado y que se convierten en instrucciones de edición para el agente**. (paquete
npm: `magictex-mcp`.)

Compila con un motor WASM TeX Live 2026
([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)) que corre dentro de un
navegador headless, así que no hay nada de varios GB que instalar — solo una descarga única
de recursos WASM.

## Véalo antes de instalar

En **[zoelin.dev/tools/magictex](https://zoelin.dev/tools/magictex)** hay un recorrido guiado
del bucle comentario → agente, construido con salida real de la herramienta. Es una
repetición, no una instancia alojada: el motor TeX es una descarga única de ~480 MB y la
mitad del agente es el propio Claude, así que MagicTeX corre junto a tu proyecto, no en una
página web.

## El espacio de trabajo

Una sola ventana del navegador (inspirada en la edición de una superficie de Typst y las
anotaciones ancladas de LiquidText):

- **Bucle comentario → agente (lo esencial).** Revisa el documento *renderizado* como quien
  corrige una copia impresa: selecciona texto y añade un comentario. Luego dile a Claude
  «address my comments» — los obtiene con `check_comments` como **tareas localizadas** (página
  + cita + el `archivo:línea` de origen + tu petición), edita la fuente y resuelve cada tarjeta
  con una nota.
- **Panel de código editable + árbol de archivos.** Editor LaTeX CodeMirror, árbol de archivos
  al estilo Overleaf (carpetas, nuevo/renombrar/eliminar, cambiar de archivo). Ctrl+S recompila.
- **Modo Visual (WYSIWYG).** Títulos, negrita, cursiva y fórmulas `$…$` y `\begin{equation}` se
  renderizan en su lugar; al pasar el cursor se muestra el LaTeX original para editar.
- **Flujo de revisión (revisor → visto bueno humano → autor).** Un agente revisor/defensor
  publica comentarios con `add_comment`; tú **aceptas/rechazas** (o activas el modo copiloto de
  *auto-aceptar*); un bucle autor resuelve los aceptados.
- **Historial de cambios.** Cada compilación exitosa se guarda en un **ref oculto de git**, sin
  tocar tus ramas ni tu `git log`.

## Configuración

1. Añádelo al `.mcp.json` de tu proyecto (ver [`.mcp.json.example`](../../.mcp.json.example)):

   ```json
   {
     "mcpServers": {
       "magictex": { "command": "npx", "args": ["-y", "magictex-mcp"] }
     }
   }
   ```

2. **Reinicia Claude Code** (o reconecta con `/mcp`) para que cargue el servidor.
3. Pídele a Claude «render a preview of this paper» — la primera vez descarga los recursos WASM
   TeX Live (~480 MB, una sola vez), compila y abre la vista previa en vivo.

## Instalar como plugin de Claude Code (comandos de barra)

Para escribir menos, instala MagicTeX como plugin — una sola instalación te da el servidor MCP
**y** los comandos de barra:

```
/plugin marketplace add ZoeLinUTS/MagicTeX-mcp
/plugin install magictex
```

- **`/magic-latex`** — compila y abre el espacio de trabajo.
- **`/ai-review [skill]`** — revisa el artículo con una skill (por defecto
  `academic-paper-revision`; admite cualquier nombre) y publica comentarios para aceptar/rechazar.
- **`/address-comments`** — resuelve tus comentarios aceptados (`/loop 60s /address-comments`).
- ⚡ **`/ultra-agents [skill] [depth]`** — modo totalmente autónomo: revisa, acepta
  automáticamente, corrige y repite, hasta `depth` rondas (2 por defecto), parando
  antes si una ronda no encuentra nada nuevo. Sin aprobación entre rondas — ese es
  el punto, y el riesgo. Si `depth` supera 5, te pide confirmar antes de empezar.
  Termina con un resumen (qué se señaló, qué se cambió, qué checkpoints revisar) —
  cada ronda sigue siendo un checkpoint normal y reversible.

### Un comando por herramienta

Cada herramienta MCP tiene también un comando con el **mismo nombre**, así que puedes ejecutar cualquier paso escribiendo el nombre de la herramienta. La regla para enseñar: *la herramienta es `X` → escribe `/X`*.

| Escribe esto | Ejecuta la herramienta | Qué hace |
| --- | --- | --- |
| `/render_preview` | `render_preview` | Compila el artículo y abre/actualiza la vista previa en vivo. |
| `/check_comments` | `check_comments` | Lista los comentarios que aceptaste como instrucciones (sin editar aún). |
| `/resolve_comment [id] [nota]` | `resolve_comment` | Marca un comentario como hecho tras la edición; se pone **verde** para tu revisión. |
| `/add_comment ["cita"] [nota]` | `add_comment` | Ancla un comentario en un pasaje para que lo aceptes/rechaces. |
| `/reply_to_comment [id] [texto]` | `reply_to_comment` | Añade una respuesta en el hilo de un comentario. |
| `/show_diff [checkpoint]` | `show_diff` | Diff visual en paralelo como imagen (cambios actuales o un checkpoint). |
| `/list_checkpoints [limit]` | `list_checkpoints` | Checkpoints recientes con su sha, más nuevo primero — para pasarle uno a `/show_diff`. |

Nunca es obligatorio escribirlos: el lenguaje natural también funciona (*«renderiza una vista previa»*, *«atiende mis comentarios»*). Los comandos son solo un atajo rápido y fácil de enseñar.

## Tools (herramientas)

La superficie MCP, para cualquier cliente que hable MCP. (En Claude Code basta con pedirlo en lenguaje natural o usar los comandos de arriba: estas son las herramientas que hay debajo.)

| Herramienta | Parámetros | Qué hace |
| ---- | ---- | ---- |
| `render_preview` | `mainFile?` · `engine?` (`pdflatex` \| `xelatex` \| `lualatex`, por defecto `xelatex`) · `backend?` (`wasm` \| `system` \| `auto`, por defecto `auto` — latexmk local si está instalado, si no el motor WASM incluido) | Compila el proyecto y abre/actualiza el espacio de trabajo en vivo. Si se omite, detecta el archivo principal buscando `\documentclass`. |
| `check_comments` | `includeResolved?` (por defecto `false`) | Devuelve los comentarios aceptados como **tareas localizadas**: página, cita, el `archivo:línea` de origen y tu petición. Las sugerencias de un revisor pendientes de tu decisión se informan, pero no se devuelven como trabajo. |
| `add_comment` | `quote` · `comment` · `role?` (`reviewer` \| `defender`) · `page?` · `accepted?` | Ancla un comentario en un pasaje. Se publica como **sugerencia** a la espera de tu Accept/Reject salvo que actives `accepted`: ese indicador es justamente lo que hace autónomo al modo autónomo. |
| `resolve_comment` | `id` · `note` | Marca un comentario como hecho tras la edición, con una línea sobre lo que cambió. Se pone **verde** en el espacio de trabajo, esperando tu revisión. |
| `reply_to_comment` | `id` · `text` · `role?` (`author` \| `reviewer` \| `defender`) | Añade una respuesta al hilo, para resolver un desacuerdo sobre el comentario y no en el chat. |
| `show_diff` | `checkpoint?` | Renderiza un diff en paralelo **como imagen**, mostrada en la conversación. Por defecto los cambios sin confirmar; pasa un sha de checkpoint para una versión guardada. |
| `list_checkpoints` | `limit?` (por defecto 10, máx. 50) | Checkpoints recientes con su sha, del más nuevo — para encontrar cuál pasarle a `show_diff`. |

**Lo más vistoso está construido *sobre* estas herramientas, no entre ellas.** `/magic-latex`, `/ai-review`, `/address-comments` y ⚡ `/ultra-agents` son **comandos del plugin** de Claude Code que orquestan las herramientas de arriba — `/ultra-agents` encadena revisar → aceptar automáticamente → corregir durante tantas rondas como permitas, y es la razón de que `add_comment` tenga un parámetro `accepted`. No forman parte de la superficie MCP, así que otro cliente MCP solo ve estas siete. Ver la sección del plugin más arriba y [docs/AGENT-LOOP.es.md](AGENT-LOOP.es.md).

## Documentación

- [**Guía de usuario**](USER-GUIDE.es.md) — uso diario, el bucle de comentarios, modo Visual,
  el árbol de archivos, llevar tu artículo a Overleaf, cobertura de paquetes.
- [**El bucle del agente**](AGENT-LOOP.es.md) — los comentarios como disparadores, ejecutarlo
  sin manos con `/loop`, el flujo revisor → visto bueno → resolutor, y ⚡ `/ultra-agents`.
- [**Hoja de ruta**](ROADMAP.es.md) — qué está listo para agentes concurrentes y qué falta aún
  para la edición multi-agente realmente paralela.
- [**Arquitectura**](ARCHITECTURE.es.md) — por qué un navegador headless, qué hace cada módulo,
  el flujo de compilación.

Las cuatro están traducidas a los mismos 8 idiomas que este README — cada página tiene su
propio selector de idioma arriba.

## Patrocina este proyecto

MagicTeX es libre y de código abierto (AGPL-3.0). Si te ahorra tiempo con tus artículos,
considera **[patrocinar el proyecto](https://github.com/sponsors/ZoeLinUTS)**. Una ⭐ en el
repositorio también ayuda.

## Agradecimientos

MagicTeX está escrito y mantenido por [Zoe Lin](https://zoelin.dev), construido con **[Claude Code](https://claude.com/claude-code)**.

Gracias a **David Turnbull**, que me contó la historia de Knuth dedicando diez años a
construir su propio tipógrafo en lugar de aceptar cómo se veía su libro — la historia
con la que este proyecto sigue discutiendo. Y a quienes mantienen [`texlyre-busytex`](https://github.com/TeXlyre/texlyre-busytex), sin cuyo
TeX Live en WASM nada de esto funcionaría localmente.

## Licencia

[AGPL-3.0-or-later](../../LICENSE) — igual que el motor `texlyre-busytex` sobre el que se construye.
Ver [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).
