# MagicTeX — LaTeX-Editor für KI-Agenten

<!-- badges -->
[![npm](https://img.shields.io/npm/v/magictex-mcp?logo=npm)](https://www.npmjs.com/package/magictex-mcp)
[![MCP registry](https://img.shields.io/badge/MCP%20registry-io.github.ZoeLinUTS%2Fmagictex-6f42c1)](https://registry.modelcontextprotocol.io)
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](../../LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [Português](README.pt.md)

![MagicTeX workspace](../images/workspace.png)

**MagicTeX** ist ein **LaTeX-Editor für KI-Agenten** — ein Overleaf-artiger
**Ein-Fenster-Arbeitsbereich** für Claude Code, bereitgestellt über einen MCP-Server, **ohne
lokale TeX-Installation und ohne Overleaf-Konto**: Live-PDF-Vorschau, ein Quellcode-Editor mit
**Visual-Modus (WYSIWYG)**, Änderungsverlauf und **Kommentare, die du im gerenderten PDF
verankerst und die zu Bearbeitungsanweisungen für den Agenten werden**. (npm-Paket:
`magictex-mcp`.)

Kompiliert wird mit einer WASM-TeX-Live-2026-Engine
([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)) in einem Headless-Browser — es
gibt also nichts Mehrere-GB-Großes zu installieren, nur einen einmaligen WASM-Asset-Download.

## Vor der Installation ansehen

Unter **[zoelin.dev/tools/magictex](https://zoelin.dev/tools/magictex)** gibt es einen
geführten Durchlauf der Kommentar-→-Agent-Schleife, gebaut aus echter Tool-Ausgabe. Es ist
ein Replay, keine gehostete Instanz — die TeX-Engine ist ein einmaliger Download von
~480 MB, und die Agent-Hälfte ist Claude selbst. MagicTeX läuft daher neben deinem Projekt,
nicht in einer Webseite.

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

1. Füge es zur `.mcp.json` deines Projekts hinzu (siehe [`.mcp.json.example`](../../.mcp.json.example)):

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
- ⚡ **`/ultra-agents [skill] [depth]`** — vollautonomer Modus: prüfen, automatisch
  akzeptieren, korrigieren, wiederholen — bis zu `depth` Runden (Standard 2),
  vorzeitiger Stopp, sobald eine Runde nichts Neues findet. Keine Freigabe zwischen
  den Runden — das ist der Sinn und das Risiko zugleich. Über `depth = 5` wird vor
  dem Start eine Bestätigung verlangt. Endet mit einer Zusammenfassung (was
  angemerkt, was geändert wurde, welche Checkpoints anzuschauen sind) — jede Runde
  bleibt ein normaler, rückgängig machbarer Checkpoint.

### Ein Befehl pro Tool

Jedes MCP-Tool hat auch einen Slash-Befehl mit **demselben Namen**, du kannst also jeden einzelnen Schritt per Tool-Namen auslösen. Die Regel zum Weitergeben: *das Tool heißt `X` → tippe `/X`*.

| Das tippen | Führt Tool aus | Was es tut |
| --- | --- | --- |
| `/render_preview` | `render_preview` | Kompiliert das Paper und öffnet/aktualisiert die Live-Vorschau. |
| `/check_comments` | `check_comments` | Listet deine akzeptierten Kommentare als Anweisungen (noch keine Änderung). |
| `/resolve_comment [id] [Notiz]` | `resolve_comment` | Markiert einen Kommentar nach der Änderung als erledigt; wird **grün** zur Prüfung. |
| `/add_comment ["Zitat"] [Notiz]` | `add_comment` | Verankert einen Kommentar an einer Stelle zum Annehmen/Ablehnen. |
| `/reply_to_comment [id] [Text]` | `reply_to_comment` | Fügt eine Thread-Antwort zu einem Kommentar hinzu. |
| `/show_diff [checkpoint]` | `show_diff` | Nebeneinander-Diff als Bild (aktuelle Änderungen oder ein Checkpoint). |
| `/list_checkpoints [limit]` | `list_checkpoints` | Letzte Checkpoints mit sha, neueste zuerst — um einen an `/show_diff` zu übergeben. |

Du musst sie nie tippen – normale Sprache funktioniert auch (*„zeig eine Vorschau“*, *„bearbeite meine Kommentare“*). Die Befehle sind nur eine schnelle, gut vermittelbare Kurzform.

## Tools (Werkzeuge)

Die MCP-Schnittstelle, für jeden Client, der MCP spricht. (In Claude Code genügen normale Sprache oder die Slash-Befehle oben — das hier sind die Werkzeuge darunter.)

| Tool | Parameter | Was es tut |
| ---- | ---- | ---- |
| `render_preview` | `mainFile?` · `engine?` (`pdflatex` \| `xelatex` \| `lualatex`, Standard `xelatex`) · `backend?` (`wasm` \| `system` \| `auto`, Standard `auto` — lokales latexmk falls installiert, sonst die gebündelte WASM-Engine) | Kompiliert das Projekt und öffnet/aktualisiert den Live-Arbeitsbereich. Ohne Angabe wird die Hauptdatei per `\documentclass`-Suche erkannt. |
| `check_comments` | `includeResolved?` (Standard `false`) | Gibt akzeptierte Kommentare als **lokalisierte Aufgaben** zurück: Seite, Zitat, die Quell-`Datei:Zeile` und deine Bitte. Reviewer-Vorschläge, die noch auf deine Entscheidung warten, werden gemeldet, aber nicht als Arbeit zurückgegeben. |
| `add_comment` | `quote` · `comment` · `role?` (`reviewer` \| `defender`) · `page?` · `accepted?` | Verankert einen Kommentar an einer Textstelle. Wird als **Vorschlag** gepostet, der auf dein Annehmen/Ablehnen wartet — außer `accepted` ist gesetzt; genau dieses Flag macht den autonomen Modus autonom. |
| `resolve_comment` | `id` · `note` | Markiert einen Kommentar nach der Änderung als erledigt, mit einer Zeile dazu, was sich geändert hat. Er wird im Arbeitsbereich **grün** und wartet auf deine Prüfung. |
| `reply_to_comment` | `id` · `text` · `role?` (`author` \| `reviewer` \| `defender`) | Fügt eine Thread-Antwort hinzu, damit eine Meinungsverschiedenheit am Kommentar statt im Chat geklärt wird. |
| `show_diff` | `checkpoint?` | Rendert ein Nebeneinander-Diff **als Bild**, inline im Gespräch. Standardmäßig die nicht committeten Änderungen; mit einem Checkpoint-Sha eine gespeicherte Fassung. |
| `list_checkpoints` | `limit?` (Standard 10, max. 50) | Letzte Checkpoints mit sha, neueste zuerst — um zu finden, welchen du an `show_diff` übergibst. |

**Die Aushängeschilder sind *auf* diesen Werkzeugen gebaut, nicht Teil davon.** `/magic-latex`, `/ai-review`, `/address-comments` und ⚡ `/ultra-agents` sind **Plugin-Befehle** von Claude Code, die die Werkzeuge oben orchestrieren — `/ultra-agents` verkettet Prüfen → automatisch annehmen → korrigieren über so viele Runden, wie du erlaubst, und ist der Grund, warum `add_comment` ein `accepted`-Flag hat. Sie gehören nicht zur MCP-Schnittstelle: ein anderer MCP-Client sieht nur diese sieben. Siehe den Plugin-Abschnitt oben und [docs/AGENT-LOOP.de.md](AGENT-LOOP.de.md).

## Dokumentation

- [**Benutzerhandbuch**](USER-GUIDE.de.md) — täglicher Einsatz, die Kommentar-Schleife,
  Visual-Modus, der Dateibaum, dein Paper nach Overleaf bringen, Paketabdeckung.
- [**Die Agent-Schleife**](AGENT-LOOP.de.md) — Kommentare als Auslöser, unbeaufsichtigt mit `/loop`,
  der Ablauf Reviewer → Freigabe → Resolver, und ⚡ `/ultra-agents`.
- [**Roadmap**](ROADMAP.de.md) — was für gleichzeitige Agents fertig ist und was echtes paralleles
  Multi-Agent-Bearbeiten noch braucht.
- [**Architektur**](ARCHITECTURE.de.md) — warum ein Headless-Browser, was jedes Modul tut, der
  Kompilierungsablauf.

Alle vier sind in dieselben 8 Sprachen übersetzt wie dieses README — jede Seite hat oben ihre
eigene Sprachauswahl.

## Dieses Projekt unterstützen

MagicTeX ist frei und quelloffen (AGPL-3.0). Wenn es dir Zeit bei deinen Papern spart, erwäge
bitte, **[das Projekt zu unterstützen](https://github.com/sponsors/ZoeLinUTS)**. Ein ⭐ auf dem
Repo hilft ebenfalls.

## Lizenz

[AGPL-3.0-or-later](../../LICENSE) — wie die Engine `texlyre-busytex`, auf der es aufbaut.
Siehe [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).
