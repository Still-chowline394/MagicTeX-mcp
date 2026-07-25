# MagicTeX — Editor LaTeX para agentes de IA

<!-- badges -->
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](../../LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **Português**

![MagicTeX workspace](../images/workspace.png)

**MagicTeX** é um **editor LaTeX feito para agentes de IA** — um espaço de trabalho de **uma
única janela** ao estilo Overleaf para o Claude Code, servido por um servidor MCP, **sem
instalação local de TeX e sem conta Overleaf**: pré-visualização de PDF ao vivo, um editor de
código com **modo Visual (WYSIWYG)**, histórico de alterações e **comentários que você ancora
no PDF renderizado e que se tornam instruções de edição para o agente**. (pacote npm:
`magictex-mcp`.)

Compila com um motor WASM TeX Live 2026
([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)) rodando dentro de um navegador
headless, então não há nada de vários GB para instalar — apenas um download único de recursos
WASM.

## O espaço de trabalho

Uma única janela do navegador (inspirada na edição de superfície única do Typst e nas anotações
ancoradas do LiquidText):

- **Ciclo comentário → agente (o essencial).** Revise o documento *renderizado* como quem
  corrige uma prova impressa: selecione texto e adicione um comentário. Depois diga ao Claude
  «address my comments» — ele os obtém via `check_comments` como **tarefas localizadas** (página
  + citação + o `arquivo:linha` de origem + seu pedido), edita a fonte e resolve cada cartão com
  uma nota.
- **Painel de código editável + árvore de arquivos.** Editor LaTeX CodeMirror, árvore de
  arquivos ao estilo Overleaf (pastas, novo/renomear/excluir, trocar de arquivo). Ctrl+S
  recompila.
- **Modo Visual (WYSIWYG).** Títulos, negrito, itálico e fórmulas `$…$` e `\begin{equation}` são
  renderizados no lugar; ao passar o cursor, o LaTeX original reaparece para edição.
- **Fluxo de revisão (revisor → aprovação humana → autor).** Um agente revisor/defensor publica
  comentários com `add_comment`; você **aceita/rejeita** (ou ativa o modo copiloto de
  *auto-aceitar*); um ciclo autor resolve os aceitos.
- **Histórico de alterações.** Cada compilação bem-sucedida é salva em uma **ref git oculta**,
  sem tocar em seus branches nem no seu `git log`.

## Configuração

1. Adicione ao `.mcp.json` do seu projeto (veja [`.mcp.json.example`](../../.mcp.json.example)):

   ```json
   {
     "mcpServers": {
       "magictex": { "command": "npx", "args": ["-y", "magictex-mcp"] }
     }
   }
   ```

2. **Reinicie o Claude Code** (ou reconecte com `/mcp`) para carregar o servidor.
3. Peça ao Claude «render a preview of this paper» — na primeira vez ele baixa os recursos WASM
   TeX Live (~480 MB, uma única vez), compila e abre a pré-visualização ao vivo.

## Instalar como plugin do Claude Code (comandos de barra)

Para digitar menos, instale o MagicTeX como plugin — uma instalação te dá o servidor MCP **e**
os comandos de barra:

```
/plugin marketplace add ZoeLinUTS/MagicTeX-mcp
/plugin install magictex
```

- **`/magic-latex`** — compila e abre o espaço de trabalho.
- **`/ai-review [skill]`** — revisa o artigo com uma skill (padrão `academic-paper-revision`;
  qualquer nome funciona) e publica comentários para aceitar/rejeitar.
- **`/address-comments`** — resolve seus comentários aceitos (`/loop 60s /address-comments`).
- **`/ultra-agents [skill] [depth]`** — modo totalmente autônomo: revisa, aceita
  automaticamente, corrige, repete, até `depth` rodadas (padrão 2), parando mais
  cedo se uma rodada não encontrar nada novo. Sem aprovação entre rodadas — esse é
  o ponto, e o risco. Acima de `depth = 5` pede confirmação antes de começar.
  Termina com um resumo (o que foi apontado, o que mudou, quais checkpoints
  conferir) — cada rodada continua sendo um checkpoint normal e reversível.

### Um comando por ferramenta

Cada ferramenta MCP também tem um comando com o **mesmo nome**, então você executa qualquer passo digitando o nome da ferramenta. A regra para ensinar: *a ferramenta é `X` → digite `/X`*.

| Digite isto | Executa a ferramenta | O que faz |
| --- | --- | --- |
| `/render_preview` | `render_preview` | Compila o artigo e abre/atualiza a pré-visualização ao vivo. |
| `/check_comments` | `check_comments` | Lista os comentários que você aceitou como instruções (sem editar ainda). |
| `/resolve_comment [id] [nota]` | `resolve_comment` | Marca um comentário como feito após a edição; fica **verde** para sua revisão. |
| `/add_comment ["citação"] [nota]` | `add_comment` | Ancora um comentário num trecho para você aceitar/rejeitar. |
| `/reply_to_comment [id] [texto]` | `reply_to_comment` | Adiciona uma resposta no tópico de um comentário. |
| `/show_diff [sha]` | `show_diff` | Diff visual lado a lado como imagem (mudanças atuais ou um checkpoint). |
| `/list_checkpoints [limit]` | `list_checkpoints` | Checkpoints recentes com seu sha, mais novo primeiro — para passar um ao `/show_diff`. |

Você nunca precisa digitá-los: linguagem natural também funciona (*“renderize uma pré-visualização”*, *“resolva meus comentários”*). Os comandos são só um atalho rápido e fácil de ensinar.

## Patrocine este projeto

O MagicTeX é livre e de código aberto (AGPL-3.0). Se ele economiza seu tempo com os artigos,
considere **[patrocinar o projeto](https://github.com/sponsors/ZoeLinUTS)**. Uma ⭐ no
repositório também ajuda.

## Licença

[AGPL-3.0-or-later](../../LICENSE) — igual ao motor `texlyre-busytex` sobre o qual é construído.
Veja [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).
