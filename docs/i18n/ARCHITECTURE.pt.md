# Arquitetura

[English](../ARCHITECTURE.md) · [简体中文](ARCHITECTURE.zh-CN.md) · [日本語](ARCHITECTURE.ja.md) · [한국어](ARCHITECTURE.ko.md) · [Español](ARCHITECTURE.es.md) · [Français](ARCHITECTURE.fr.md) · [Deutsch](ARCHITECTURE.de.md) · **Português**

> Este documento acompanha o código de perto. Caminhos de arquivo, nomes de função e identificadores ficam em inglês.

## Por que um navegador headless

Os motores WASM do TeX Live (`texlyre-busytex`, e o SwiftLaTeX antes dele) são **bibliotecas de navegador**: internamente chamam `document.createElement('script')` e `new Worker(...)`, e não rodam num processo Node puro. Por isso o servidor MCP lança um **Chromium headless oculto** (via Playwright) como seu worker de compilação. O motor é inicializado uma vez ali e reutilizado em cada compilação.

Benefício colateral: como o motor vive no navegador oculto, a aba que **você** abre é o espaço de trabalho React com um visualizador `pdf.js` leve — sem WASM dentro.

## Peças

- `src/server.ts` — servidor MCP stdio; registra as 7 ferramentas. Tudo que é pesado é preguiçoso: o motor, o servidor de preview e o watcher iniciam na primeira chamada de `render_preview`, não ao conectar.
- `src/tools/*ToolDef.ts` — um arquivo por grupo de ferramentas, cada um exportando nome + schema Zod de entrada + descrição: `renderPreviewToolDef.ts`, `commentsToolDefs.ts` (`check_comments` / `resolve_comment` / `add_comment` / `reply_to_comment`), `showDiffToolDef.ts`, `listCheckpointsToolDef.ts`.
- `src/lock.ts` — mutex entre processos (arquivo de trava exclusiva + recuperação de travas obsoletas) para o estado compartilhado entre processos de servidor MCP rodando ao mesmo tempo: cada sessão do Claude Code lança seu próprio `tsx server.ts` (MCP via stdio = um processo filho por cliente), então uma trava dentro do processo não protegeria duas sessões trabalhando no mesmo projeto. Veja [`ROADMAP.pt.md`](ROADMAP.pt.md).
- `src/engine/browserHost.ts` — Chromium headless singleton + página hospedeira do motor; expõe `compile(files, mainTexPath, engine)`. Mantém o motor inicializado uma só vez.
- `src/engine/hostPage.ts` — o HTML da página oculta; importa o motor WASM e expõe `window.__compile`. Nomes de pacotes de dados levam sufixo `.js` (são passados crus para `importScripts`); figuras binárias chegam em base64.
- `src/engine/assets.ts` — download dos recursos WASM do TeX Live na primeira execução.
- `src/engine/fallbackStyles.ts` — embute os `.sty` que o subconjunto do TeX Live empacotado não traz (família algorithms, multirow, uma aproximação de `bbm`) e os injeta na compilação quando o projeto não tem cópia própria.
- `src/preview/previewServer.ts` — um único servidor local HTTP+WS: serve a página hospedeira do motor + recursos WASM ao navegador oculto; o espaço de trabalho (`/app`, de `ui/dist`) ou o visualizador inline legado (`src/preview/viewerPage.ts`, apenas se faltar `ui/dist`); `/api/*` (arquivos, comentários, upload); `/git/*` (checkpoints, diff, status); `/export.zip` + `/overleaf/link`. Todas as respostas levam cabeçalhos COOP/COEP (o Worker/SharedArrayBuffer do motor exigem isolamento entre origens).
- `src/preview/filesApi.ts` — a árvore de arquivos e ler/escrever/renomear/excluir/enviar por trás de `/api/*`, com proteção contra travessia de caminho.
- `src/preview/commentsStore.ts` — comentários persistidos em `<project>/.latex-preview/comments.json` (escrita atômica: arquivo temporário + renomear), todas as alterações sob `lock.ts`. Fluxo de estados: `suggested` → (humano aceita) → `accepted` → (autor resolve) → `resolved`.
- `src/preview/anchorMatch.ts` — busca citação → `{file, line}` em melhor esforço, para que `check_comments` possa apontar um local ao Claude sem um índice de verdade.
- `src/preview/diffViewPage.ts` — a página oculta da qual `show_diff` tira uma captura para devolver um diff como imagem.
- `src/project/*` — `resolveMainFile` (achar `\documentclass`), `collectProjectFiles` (reunir a árvore do projeto), `compileProject` (a compilação compartilhada), `parseLog` (log do TeX → `{file, line, message}`).
- `src/export/overleafZip.ts` — monta um zip limpo das entradas de compilação (exclui PDFs compilados, `.git`, `.latex-preview`) para `/export.zip` e o "Upload Project" do Overleaf.
- `src/git/checkpoints.ts` — auto-checkpoints no estilo Zed. A cada compilação bem-sucedida, tira um snapshot da árvore de trabalho para uma cadeia de commits paralela sob uma **ref oculta** (`refs/latex-preview/checkpoints`) usando um index temporário (`GIT_INDEX_FILE`), de modo que a árvore de trabalho / index / HEAD / branches do usuário nunca são tocados. Toda operação que escreve (`createCheckpoint`, `restoreCheckpoint`, `restoreFile`) roda sob `lock.ts`. Diffs e a lista de checkpoints excluem `.latex-preview/` e `.claude/` (pathspec de exclusão do git) — nenhum dos dois faz parte do artigo.
- `src/git/remote.ts` — analisa o remoto do GitHub (se houver) para montar o link Open-in-Overleaf de repositórios públicos.
- `src/coordinator.ts` — serializa todas as compilações **dentro de um processo** (ferramenta + watcher) numa única cadeia de promises; após cada compilação bem-sucedida cria um checkpoint do git. A serialização entre processos do estado compartilhado é trabalho do `lock.ts`, não daqui — o coordinator só cuida do motor WASM, que já é um por processo.
- `src/watch/fileWatcher.ts` — watcher chokidar para o live-reload passivo.
- `src/session.ts` — a raiz do projeto atual, compartilhada entre o coordinator (que a define) e os endpoints de git/comentários (que a leem), sem ciclo de import.

## Fluxo de compilação

```
render_preview ─┐                          ┌─ setLatestPdf ─▶ WS "reload" ─▶ espaço de trabalho
                ├─▶ coordinator (serial) ──▶│
salvar arquivo ─┘        compileProject     └─ compile-error ─▶ WS ─▶ faixa de erro
                          │
                          ├─ resolveMainFile + collectProjectFiles
                          └─ browserHost.compile → page.evaluate(window.__compile)
                                                    → BusyTexRunner (reutilizado) → PDF
```

## A UI do espaço de trabalho (`ui/`)

Um app Vite+React+TS compilado para `ui/dist` (`npm run build:ui`) e servido estaticamente pelo servidor de preview em `/app` — mesma origem da API e do WebSocket, então sem proxy nem CORS. O servidor cai no `/viewer` inline legado quando falta `ui/dist` (clone novo antes do build).

- `ui/src/App.tsx` — estrutura de três painéis: abas à esquerda (Source | History), PDF no centro, Comments à direita.
- `ui/src/components/Toolbar.tsx` — marca + título do documento, Recompile, alternador de comentários, Export .zip / Download PDF.
- `ui/src/components/PdfView.tsx` — canvas do pdf.js + **camada de texto** (selecionável) + camada de destaques; selecionar texto abre o compositor de comentário. Os destaques são **reancorados ao texto vivo a cada render** (casando as frases inicial e final da citação do comentário, encurtadas progressivamente) em vez de fixados em coordenadas congeladas, então acompanham o refluxo depois de uma edição; o formato segue o de uma seleção de texto (primeira/última linha parciais, linhas do meio na largura cheia) para que um destaque de várias linhas não se fragmente por peculiaridades de métrica de fonte (itálicos, matemática inline).
- `ui/src/components/SourcePanel.tsx` — editor LaTeX CodeMirror 6 (modos Code/Visual, alternador de quebra de linha) sobre `/api/files` + `/api/file` (GET/PUT, com proteção de caminho); salva automaticamente a cada 30s sem recompilar, e Ctrl+S / Save / Recompile reconstroem sob demanda.
- `ui/src/components/FileTree.tsx` — árvore de arquivos aninhada no estilo Overleaf: novo/renomear/excluir, upload de figuras, altura ajustável.
- `ui/src/components/HistoryPanel.tsx` + `DiffView.tsx` — linha do tempo de checkpoints; um renderizador de diff unificado feito à mão (não diff2html) com seções recolhíveis por arquivo; botões de **restaurar** por checkpoint e por arquivo (`POST /git/restore`, `/git/restore-file`).
- `ui/src/components/CommentsPanel.tsx` — cartões suggested/accepted/resolved, o alternador Auto-accept (copilot), pular para o destaque.
- Laço MCP de comentários: `check_comments` devolve os comentários aceitos como instruções estruturadas; `resolve_comment` marca um como resolvido com uma nota; as duas pontas ficam sincronizadas pelo evento WS `comments-changed`.

## Fora de escopo (por enquanto)

Veja [`ROADMAP.pt.md`](ROADMAP.pt.md) para o detalhe do que está pronto e do que está planejado. Em resumo: edição multi-agente de fato concorrente (revisor/autor/defensor editando ao mesmo tempo de verdade, em seus próprios branches do git, mesclados depois) é o próximo marco — a trava entre processos de hoje (`src/lock.ts`) deixa *sessões* concorrentes a salvo de perda de dados, mas elas ainda se revezam em vez de editar o mesmo arquivo realmente em paralelo.
