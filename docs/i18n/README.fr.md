# MagicTeX — Éditeur LaTeX pour agents IA

<!-- badges -->
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](../../LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [Português](README.pt.md)

![MagicTeX workspace](../images/workspace.png)

**MagicTeX** est un **éditeur LaTeX conçu pour les agents IA** : un espace de travail à
**fenêtre unique** façon Overleaf pour Claude Code, fourni par un serveur MCP, **sans
installation locale de TeX ni compte Overleaf** : aperçu PDF en direct, un éditeur de code
avec **mode Visuel (WYSIWYG)**, historique des modifications, et **des commentaires que vous
ancrez sur le PDF rendu et qui deviennent des instructions d'édition pour l'agent**. (paquet
npm : `magictex-mcp`.)

Il compile avec un moteur WASM TeX Live 2026
([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)) tournant dans un navigateur
headless : rien de plusieurs Go à installer — juste un téléchargement unique des ressources
WASM.

## L'espace de travail

Une seule fenêtre de navigateur (inspirée de l'édition à surface unique de Typst et des
annotations ancrées de LiquidText) :

- **Boucle commentaire → agent (l'essentiel).** Relisez le document *rendu* comme on annote une
  épreuve papier : sélectionnez du texte, ajoutez un commentaire. Dites ensuite à Claude
  « address my comments » — il les récupère via `check_comments` sous forme de **tâches
  localisées** (page + citation + le `fichier:ligne` source + votre demande), modifie la source
  et résout chaque carte avec une note.
- **Panneau de code éditable + arborescence de fichiers.** Éditeur LaTeX CodeMirror,
  arborescence façon Overleaf (dossiers, nouveau/renommer/supprimer, changer de fichier). Ctrl+S
  recompile.
- **Mode Visuel (WYSIWYG).** Titres, gras, italique et formules `$…$` et `\begin{equation}` sont
  rendus sur place ; au survol, le LaTeX d'origine réapparaît pour l'édition.
- **Flux de revue (relecteur → validation humaine → auteur).** Un agent relecteur/défenseur
  publie des commentaires via `add_comment` ; vous **acceptez/refusez** (ou activez le mode
  copilote *auto-accepter*) ; une boucle auteur résout les acceptés.
- **Historique des modifications.** Chaque compilation réussie est capturée dans une **ref git
  cachée**, sans toucher à vos branches ni à votre `git log`.

## Installation

1. Ajoutez-le au `.mcp.json` de votre projet (voir [`.mcp.json.example`](../../.mcp.json.example)) :

   ```json
   {
     "mcpServers": {
       "magictex": { "command": "npx", "args": ["-y", "magictex-mcp"] }
     }
   }
   ```

2. **Redémarrez Claude Code** (ou reconnectez avec `/mcp`) pour charger le serveur.
3. Demandez à Claude « render a preview of this paper » — la première fois télécharge les
   ressources WASM TeX Live (~480 Mo, une seule fois), compile et ouvre l'aperçu en direct.

## Installer comme plugin Claude Code (commandes slash)

Pour taper moins, installez MagicTeX comme plugin — une seule installation vous donne le serveur
MCP **et** les commandes slash :

```
/plugin marketplace add ZoeLinUTS/MagicTeX-mcp
/plugin install magictex
```

- **`/magic-latex`** — compile et ouvre l'espace de travail.
- **`/ai-review [skill]`** — relit l'article avec une skill (par défaut
  `academic-paper-revision` ; n'importe quel nom fonctionne) et publie des commentaires à
  accepter/refuser.
- **`/address-comments`** — résout vos commentaires acceptés (`/loop 60s /address-comments`).
- **`/ultra-agents [skill] [depth]`** — mode entièrement autonome : relit, accepte
  automatiquement, corrige, recommence, jusqu'à `depth` tours (2 par défaut), en
  s'arrêtant plus tôt si un tour ne trouve rien de nouveau. Aucune approbation entre
  les tours — c'est le principe, et le risque. Au-delà de `depth = 5`, une
  confirmation est demandée avant de démarrer. Se termine par un résumé (ce qui a
  été relevé, ce qui a changé, quels checkpoints regarder) — chaque tour reste un
  checkpoint normal et réversible.

### Une commande par outil

Chaque outil MCP a aussi une commande du **même nom**, vous pouvez donc exécuter n'importe quelle étape en tapant le nom de l'outil. La règle à enseigner : *l'outil est `X` → tapez `/X`*.

| Tapez ceci | Exécute l'outil | Ce que ça fait |
| --- | --- | --- |
| `/render_preview` | `render_preview` | Compile l'article et ouvre/rafraîchit l'aperçu en direct. |
| `/check_comments` | `check_comments` | Liste les commentaires acceptés comme instructions (sans encore éditer). |
| `/resolve_comment [id] [note]` | `resolve_comment` | Marque un commentaire comme fait après l'édition ; il passe au **vert** pour votre relecture. |
| `/add_comment ["citation"] [note]` | `add_comment` | Ancre un commentaire sur un passage à accepter/refuser. |
| `/reply_to_comment [id] [texte]` | `reply_to_comment` | Ajoute une réponse au fil d'un commentaire. |
| `/show_diff [sha]` | `show_diff` | Diff visuel côte à côte en image (modifications actuelles ou un checkpoint). |
| `/list_checkpoints [limit]` | `list_checkpoints` | Checkpoints récents avec leur sha, du plus récent — pour en passer un à `/show_diff`. |

Rien ne vous oblige à les taper : le langage naturel marche aussi (*« affiche un aperçu »*, *« traite mes commentaires »*). Les commandes sont juste un raccourci rapide et facile à enseigner.

## Soutenir ce projet

MagicTeX est libre et open source (AGPL-3.0). S'il vous fait gagner du temps sur vos articles,
pensez à **[soutenir le projet](https://github.com/sponsors/ZoeLinUTS)**. Une ⭐ sur le dépôt
aide aussi.

## Licence

[AGPL-3.0-or-later](../../LICENSE) — comme le moteur `texlyre-busytex` sur lequel il repose.
Voir [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).
