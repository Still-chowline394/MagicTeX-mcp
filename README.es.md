# MagicTeX — Editor de LaTeX para agentes de IA

<!-- badges -->
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md)

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

1. Añádelo al `.mcp.json` de tu proyecto (ver [`.mcp.json.example`](.mcp.json.example)):

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

## Patrocina este proyecto

MagicTeX es libre y de código abierto (AGPL-3.0). Si te ahorra tiempo con tus artículos,
considera **[patrocinar el proyecto](https://github.com/sponsors/ZoeLinUTS)**. Una ⭐ en el
repositorio también ayuda.

## Licencia

[AGPL-3.0-or-later](LICENSE) — igual que el motor `texlyre-busytex` sobre el que se construye.
Ver [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
