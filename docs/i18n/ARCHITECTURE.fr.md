# Architecture

[English](../ARCHITECTURE.md) · [简体中文](ARCHITECTURE.zh-CN.md) · [日本語](ARCHITECTURE.ja.md) · [한국어](ARCHITECTURE.ko.md) · [Español](ARCHITECTURE.es.md) · **Français** · [Deutsch](ARCHITECTURE.de.md) · [Português](ARCHITECTURE.pt.md)

> Ce document colle au code. Chemins de fichiers, noms de fonctions et identifiants restent en anglais.

## Pourquoi un navigateur headless

Les moteurs WASM de TeX Live (`texlyre-busytex`, et SwiftLaTeX avant lui) sont des **bibliothèques de navigateur** : ils appellent en interne `document.createElement('script')` et `new Worker(...)`, et ne peuvent pas tourner dans un processus Node nu. Le serveur MCP lance donc un **Chromium headless caché** (via Playwright) comme worker de compilation. Le moteur s'y initialise une fois et est réutilisé à chaque compilation.

Bénéfice annexe : comme le moteur vit dans le navigateur caché, l'onglet que **vous** ouvrez est l'espace de travail React avec une visionneuse `pdf.js` légère — sans WASM dedans.

## Les pièces

- `src/server.ts` — serveur MCP stdio ; enregistre les 7 outils. Tout ce qui est lourd est paresseux : le moteur, le serveur d'aperçu et le watcher démarrent au premier appel de `render_preview`, pas à la connexion.
- `src/tools/*ToolDef.ts` — un fichier par groupe d'outils, chacun exportant son nom + son schéma d'entrée Zod + sa description : `renderPreviewToolDef.ts`, `commentsToolDefs.ts` (`check_comments` / `resolve_comment` / `add_comment` / `reply_to_comment`), `showDiffToolDef.ts`, `listCheckpointsToolDef.ts`.
- `src/lock.ts` — mutex inter-processus (fichier de verrou exclusif + récupération des verrous obsolètes) pour l'état partagé entre plusieurs processus serveur MCP tournant en même temps : chaque session Claude Code lance son propre `tsx server.ts` (MCP en stdio = un processus enfant par client), donc un verrou intra-processus ne protégerait pas deux sessions travaillant le même projet. Voir [`ROADMAP.fr.md`](ROADMAP.fr.md).
- `src/engine/browserHost.ts` — Chromium headless en singleton + page hôte du moteur ; expose `compile(files, mainTexPath, engine)`. Garde le moteur initialisé une seule fois.
- `src/engine/hostPage.ts` — le HTML de la page cachée ; importe le moteur WASM et expose `window.__compile`. Les noms de paquets de données portent le suffixe `.js` (ils sont passés tels quels à `importScripts`) ; les figures binaires arrivent en base64.
- `src/engine/assets.ts` — téléchargement au premier lancement des ressources WASM TeX Live.
- `src/engine/fallbackStyles.ts` — embarque les `.sty` que le sous-ensemble TeX Live fourni omet (famille algorithms, multirow, une approximation de `bbm`) et les injecte à la compilation quand le projet n'a pas sa propre copie.
- `src/preview/previewServer.ts` — un seul serveur local HTTP+WS : sert la page hôte du moteur + les ressources WASM au navigateur caché ; l'espace de travail (`/app`, depuis `ui/dist`) ou la visionneuse inline héritée (`src/preview/viewerPage.ts`, seulement si `ui/dist` manque) ; `/api/*` (fichiers, commentaires, upload) ; `/git/*` (checkpoints, diff, statut) ; `/export.zip` + `/overleaf/link`. Toutes les réponses portent les en-têtes COOP/COEP (le Worker/SharedArrayBuffer du moteur exigent l'isolation cross-origin).
- `src/preview/filesApi.ts` — l'arborescence et lire/écrire/renommer/supprimer/téléverser derrière `/api/*`, protégés contre la traversée de chemins.
- `src/preview/commentsStore.ts` — commentaires persistés dans `<project>/.latex-preview/comments.json` (écriture atomique : fichier temporaire + renommage), toutes les mutations sous `lock.ts`. Flux d'états : `suggested` → (l'humain accepte) → `accepted` → (l'auteur résout) → `resolved`.
- `src/preview/anchorMatch.ts` — recherche citation → `{file, line}` au mieux, pour que `check_comments` puisse indiquer un emplacement à Claude sans véritable index.
- `src/preview/diffViewPage.ts` — la page cachée dont `show_diff` fait une capture pour renvoyer un diff en image.
- `src/project/*` — `resolveMainFile` (trouver `\documentclass`), `collectProjectFiles` (rassembler l'arborescence), `compileProject` (la compilation partagée), `parseLog` (log TeX → `{file, line, message}`).
- `src/export/overleafZip.ts` — construit un zip propre des entrées de compilation (exclut les PDF compilés, `.git`, `.latex-preview`) pour `/export.zip` et le « Upload Project » d'Overleaf.
- `src/git/historyRepo.ts` — décide où vit l'historique d'un projet. Un dépôt git le garde sur la ref cachée en son sein ; un dossier ordinaire reçoit un dépôt à nous dans `.latex-preview/history.git`, avec le projet comme arbre de travail — l'historique suit donc l'article et non le chemin : il se déplace, se copie et disparaît avec le dossier, et `git` lancé là continue de dire qu'il n'y a pas de dépôt. Les historiques d'avant 0.1.9 vivaient dans le cache par utilisateur sous un hachage du chemin ; l'un n'est repris que si les octets qu'il a enregistrés correspondent encore à un fichier sur le disque, de sorte qu'un chemin réutilisé ne peut pas hériter des checkpoints d'un autre projet.
- `src/git/checkpoints.ts` — auto-checkpoints à la Zed. À chaque compilation réussie, capture l'arbre de travail dans une chaîne de commits parallèle sous une **ref cachée** (`refs/latex-preview/checkpoints`) en utilisant un index temporaire (`GIT_INDEX_FILE`), de sorte que l'arbre de travail / index / HEAD / branches de l'utilisateur ne sont jamais touchés. Toute opération qui écrit (`createCheckpoint`, `restoreCheckpoint`, `restoreFile`) tourne sous `lock.ts`. Les diffs et la liste des checkpoints excluent `.latex-preview/` et `.claude/` (pathspec d'exclusion git) — ni l'un ni l'autre ne fait partie de l'article.
- `src/git/remote.ts` — analyse le remote GitHub (s'il existe) pour construire le lien Open-in-Overleaf des dépôts publics.
- `src/coordinator.ts` — sérialise toutes les compilations **au sein d'un processus** (outil + watcher) sur une seule chaîne de promesses ; après chaque compilation réussie, crée un checkpoint git. La sérialisation inter-processus de l'état partagé est le travail de `lock.ts`, pas celui-ci — le coordinateur ne possède que le moteur WASM, lui-même un par processus.
- `src/watch/fileWatcher.ts` — watcher chokidar pour le rechargement passif en direct.
- `src/session.ts` — la racine du projet courant, partagée entre le coordinateur (qui la fixe) et les endpoints git/commentaires (qui la lisent), sans cycle d'import.

## Flux de compilation

```
render_preview ─┐                          ┌─ setLatestPdf ─▶ WS "reload" ─▶ espace de travail
                ├─▶ coordinator (série) ───▶│
sauvegarde ─────┘        compileProject     └─ compile-error ─▶ WS ─▶ bandeau d'erreur
                          │
                          ├─ resolveMainFile + collectProjectFiles
                          └─ browserHost.compile → page.evaluate(window.__compile)
                                                    → BusyTexRunner (réutilisé) → PDF
```

## L'UI de l'espace de travail (`ui/`)

Une app Vite+React+TS construite vers `ui/dist` (`npm run build:ui`) et servie statiquement par le serveur d'aperçu sur `/app` — même origine que l'API et le WebSocket, donc pas de proxy ni de CORS. Le serveur retombe sur le `/viewer` inline hérité quand `ui/dist` manque (clone frais avant build).

- `ui/src/App.tsx` — coquille à trois panneaux : onglets à gauche (Source | History), PDF au centre, Comments à droite.
- `ui/src/components/Toolbar.tsx` — logo + titre du document, Recompile, bascule des commentaires, Export .zip / Download PDF.
- `ui/src/components/PdfView.tsx` — canvas pdf.js + **couche de texte** (sélectionnable) + couche de surlignage ; sélectionner du texte ouvre le compositeur de commentaire. Les surlignages sont **ré-ancrés sur le texte vivant à chaque rendu** (en faisant correspondre les phrases de début et de fin de la citation du commentaire, raccourcies progressivement) plutôt que figés sur d'anciennes coordonnées : ils suivent donc la recomposition après une édition ; leur forme suit celle d'une sélection de texte (première/dernière ligne partielles, lignes du milieu pleine largeur) pour qu'un surlignage multiligne ne se fragmente pas à cause des métriques de fontes (italiques, maths en ligne).
- `ui/src/components/SourcePanel.tsx` — éditeur LaTeX CodeMirror 6 (modes Code/Visual, bascule de retour à la ligne) au-dessus de `/api/files` + `/api/file` (GET/PUT, chemins protégés) ; sauvegarde automatique toutes les 30s sans recompiler, Ctrl+S / Save / Recompile reconstruisent à la demande.
- `ui/src/components/FileTree.tsx` — arborescence imbriquée à la Overleaf : nouveau/renommer/supprimer, téléversement de figures, hauteur ajustable.
- `ui/src/components/HistoryPanel.tsx` + `DiffView.tsx` — frise des checkpoints ; un rendu de diff unifié fait maison (pas diff2html) avec sections repliables par fichier ; boutons **restaurer** par checkpoint et par fichier (`POST /git/restore`, `/git/restore-file`).
- `ui/src/components/CommentsPanel.tsx` — cartes suggested/accepted/resolved, la bascule Auto-accept (copilot), saut vers le surlignage.
- Boucle MCP des commentaires : `check_comments` renvoie les commentaires acceptés comme instructions structurées ; `resolve_comment` en marque un résolu avec une note ; les deux bouts restent synchronisés via l'événement WS `comments-changed`.

## Hors périmètre (pour l'instant)

Voir [`ROADMAP.fr.md`](ROADMAP.fr.md) pour le détail de ce qui est livré et de ce qui est prévu. En bref : l'édition multi-agent réellement concurrente (relecteur/auteur/défenseur éditant vraiment en même temps, sur leurs propres branches git, fusionnées ensuite) est le prochain jalon — le verrou inter-processus actuel (`src/lock.ts`) met les *sessions* concurrentes à l'abri de la perte de données, mais elles se relaient toujours au lieu d'éditer réellement le même fichier en parallèle.
