# MagicTeX — LaTeX-Editor für KI-Agenten

<!-- badges -->
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [Português](README.pt.md)

![MagicTeX workspace](docs/images/workspace.png)

**MagicTeX** ist ein **LaTeX-Editor für KI-Agenten** — ein Overleaf-artiger
**Ein-Fenster-Arbeitsbereich** für Claude Code, bereitgestellt über einen MCP-Server, **ohne
lokale TeX-Installation und ohne Overleaf-Konto**: Live-PDF-Vorschau, ein Quellcode-Editor mit
**Visual-Modus (WYSIWYG)**, Änderungsverlauf und **Kommentare, die du im gerenderten PDF
verankerst und die zu Bearbeitungsanweisungen für den Agenten werden**. (npm-Paket:
`magictex-mcp`.)

Kompiliert wird mit einer WASM-TeX-Live-2026-Engine
([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)) in einem Headless-Browser — es
gibt also nichts Mehrere-GB-Großes zu installieren, nur einen einmaligen WASM-Asset-Download.

## Der Arbeitsbereich

Ein einziges Browserfenster (inspiriert von Typsts Ein-Flächen-Editor und LiquidTexts
verankerten Anmerkungen):

- **Kommentar-→-Agent-Schleife (der Kern).** Prüfe das *gerenderte* Dokument wie eine
  Papierkorrektur: Text auswählen, Kommentar hinzufügen. Sag dann Claude „address my comments“ —
  es holt sie über `check_comments` als **lokalisierte Aufgaben** (Seite + Zitat + die
  Quell-`Datei:Zeile` + deine Bitte), bearbeitet die Quelle und löst jede Karte mit einer Notiz.
- **Editierbares Quellpanel + Dateibaum.** CodeMirror-LaTeX-Editor, Overleaf-artiger Dateibaum
  (Ordner, Neu/Umbenennen/Löschen, Datei wechseln). Ctrl+S kompiliert neu.
- **Visual-Modus (WYSIWYG).** Überschriften, Fett, Kursiv sowie `$…$`- und
  `\begin{equation}`-Formeln werden an Ort und Stelle gerendert; beim Hovern erscheint das
  Original-LaTeX zum Bearbeiten.
- **Review-Workflow (Reviewer → menschliche Freigabe → Autor).** Ein Reviewer-/Defender-Agent
  postet Kommentare via `add_comment`; du **akzeptierst/lehnst ab** (oder aktivierst den
  Copilot-Modus *Auto-Akzeptieren*); eine Autor-Schleife löst die akzeptierten.
- **Änderungsverlauf.** Jede erfolgreiche Kompilierung wird in eine **versteckte git-Ref**
  gespeichert — deine Branches und dein `git log` bleiben unberührt.

## Einrichtung

1. Füge es zur `.mcp.json` deines Projekts hinzu (siehe [`.mcp.json.example`](.mcp.json.example)):

   ```json
   {
     "mcpServers": {
       "magictex": { "command": "npx", "args": ["-y", "magictex-mcp"] }
     }
   }
   ```

2. **Starte Claude Code neu** (oder `/mcp` neu verbinden), damit der Server geladen wird.
3. Bitte Claude „render a preview of this paper“ — beim ersten Mal werden die WASM-TeX-Live-
   Assets (~480 MB, einmalig) heruntergeladen, kompiliert und die Live-Vorschau geöffnet.

## Als Claude-Code-Plugin installieren (Slash-Befehle)

Für weniger Tippen installiere MagicTeX als Plugin — eine Installation gibt dir den MCP-Server
**und** die Slash-Befehle:

```
/plugin marketplace add ZoeLinUTS/MagicTeX-mcp
/plugin install magictex
```

- **`/magic-latex`** — kompilieren und den Arbeitsbereich öffnen.
- **`/ai-review [skill]`** — das Paper mit einer Skill prüfen (Standard
  `academic-paper-revision`; jeder Name geht) und Kommentare zum Akzeptieren/Ablehnen posten.
- **`/address-comments`** — deine akzeptierten Kommentare lösen (`/loop 60s /address-comments`).

## Dieses Projekt unterstützen

MagicTeX ist frei und quelloffen (AGPL-3.0). Wenn es dir Zeit bei deinen Papern spart, erwäge
bitte, **[das Projekt zu unterstützen](https://github.com/sponsors/ZoeLinUTS)**. Ein ⭐ auf dem
Repo hilft ebenfalls.

## Lizenz

[AGPL-3.0-or-later](LICENSE) — wie die Engine `texlyre-busytex`, auf der es aufbaut.
Siehe [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
