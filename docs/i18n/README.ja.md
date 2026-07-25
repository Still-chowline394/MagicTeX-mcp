# MagicTeX — AI エージェントのための LaTeX エディタ

<!-- badges -->
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](../../LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](../../README.md) · [简体中文](README.zh-CN.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md)

![MagicTeX workspace](../images/workspace.png)

**MagicTeX** は **AI エージェントのために作られた LaTeX エディタ**です。MCP サーバー経由で
Claude Code に接続する、Overleaf ライクな**ワンウィンドウ・ワークスペース**で、
**ローカルの TeX インストールも Overleaf アカウントも不要**：ライブ PDF プレビュー、
**ビジュアル（WYSIWYG）モード**付きのソースエディタ、変更履歴、そして
**レンダリング後の PDF 上にアンカーしたコメントが、そのままエージェントへの編集指示になります**。
（npm パッケージ名：`magictex-mcp`）

ヘッドレスブラウザ内で動く WASM TeX Live 2026 エンジン
（[texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)）でコンパイルするため、
数 GB のインストールは不要——一度きりの WASM アセットのダウンロードだけです。

## ワークスペース

1 つのブラウザウィンドウ（Typst の単一画面編集と LiquidText のアンカー注釈にヒント）：

- **コメント → エージェントのループ（核心）。** レンダリング後の文書を、印刷原稿に赤入れ
  するように査読：テキストを選択してコメントを付ける。あとは Claude に「address my comments」と
  伝えるだけ——`check_comments` で**位置情報付きの作業項目**（ページ＋引用＋対応ソースの
  `ファイル:行`＋要望）として取得し、ソースを編集し、各カードにメモを付けて解決します。
- **編集可能なソースパネル＋ファイルツリー。** CodeMirror LaTeX エディタ、Overleaf 風の
  ファイルツリー（フォルダ、新規/リネーム/削除、ファイル切替）。Ctrl+S で再コンパイル。
- **ビジュアル（WYSIWYG）モード。** 見出し・太字・斜体・`$…$` や `\begin{equation}` の数式を
  その場で描画。カーソルを合わせると元の LaTeX が表示され編集できます。
- **査読ワークフロー（reviewer → 人間の承認 → 修正）。** reviewer/defender エージェントが
  `add_comment` でコメントを投稿。あなたが **Accept/Reject**（または *自動承認* の
  コパイロットモード）。author ループが承認済みを解決します。
- **変更履歴。** 成功したコンパイルごとに**隠し git ref** へ自動スナップショット。
  あなたのブランチや `git log` を汚しません。

## セットアップ

1. 論文プロジェクトの `.mcp.json` に追加（[`.mcp.json.example`](../../.mcp.json.example) 参照）：

   ```json
   {
     "mcpServers": {
       "magictex": { "command": "npx", "args": ["-y", "magictex-mcp"] }
     }
   }
   ```

2. **Claude Code を再起動**（または `/mcp` で再接続）してサーバーを読み込みます。
3. Claude に「render a preview of this paper」と依頼——初回は WASM TeX Live アセット
   （約 480 MB、一度きり）をダウンロードし、コンパイルしてライブプレビューを開きます。

## Claude Code プラグインとして導入（スラッシュコマンド）

タイピングを減らすには、MagicTeX をプラグインとして導入——1 回のインストールで MCP サーバーと
スラッシュコマンドの両方が手に入ります：

```
/plugin marketplace add ZoeLinUTS/MagicTeX-mcp
/plugin install magictex
```

- **`/magic-latex`** — コンパイルしてワークスペースを開く。
- **`/ai-review [skill]`** — スキルで論文を査読（既定は `academic-paper-revision`、
  任意のスキル名も可）し、承認用のコメントを投稿。未導入のスキルは案内を表示。
- **`/address-comments`** — 承認済みコメントを解決（`/loop 60s /address-comments` も可）。
- ⚡ **`/ultra-agents [skill] [depth]`** — 完全自動モード：査読・自動承認・修正を繰り返す。
  最大 `depth` ラウンド（既定 2）、あるラウンドで新規指摘がゼロなら早期停止。ラウンド間
  で承認確認は挟まない——それがこのモードの目的でありリスクでもある。`depth` が 5 を
  超えると開始前に確認を求める。終了後は要約（何を指摘し何を変更したか、対応する
  checkpoint）を提示。各ラウンドも通常どおり取り消し可能な checkpoint のまま。

### ツールごとに 1 コマンド

各 MCP ツールには**同名**のスラッシュコマンドがあり、ツール名を打つだけで各ステップを実行できます。教えるルールは一言：**ツールが `X` なら `/X` と打つ**。

| これを打つ | 実行ツール | 内容 |
| --- | --- | --- |
| `/render_preview` | `render_preview` | 論文をコンパイルしてライブプレビューを開く/更新。 |
| `/check_comments` | `check_comments` | 承認済みコメントを編集指示として一覧表示（まだ編集しない）。 |
| `/resolve_comment [id] [メモ]` | `resolve_comment` | 編集後に解決としてマーク；コメントが**緑**になり確認待ち。 |
| `/add_comment ["引用"] [メモ]` | `add_comment` | 該当箇所にコメントをアンカーし、承認/却下できるように。 |
| `/reply_to_comment [id] [本文]` | `reply_to_comment` | コメントにスレッド返信を追加。 |
| `/show_diff [sha]` | `show_diff` | 並列ビジュアル差分を画像で表示（現在の変更か checkpoint）。 |
| `/list_checkpoints [limit]` | `list_checkpoints` | 直近のチェックポイントを sha 付きで新しい順に表示——`/show_diff` に渡す sha を探すのに。 |

必ずしも打つ必要はありません——普通の日本語でも動きます（「プレビューを表示」「コメントに対応して」）。コマンドは速くて教えやすい省略形です。

## このプロジェクトを支援

MagicTeX は無料のオープンソース（AGPL-3.0）です。論文作業の時間を節約できたなら、ぜひ
**[このプロジェクトを支援](https://github.com/sponsors/ZoeLinUTS)**してください。リポジトリへの
⭐ も励みになります。

## ライセンス

[AGPL-3.0-or-later](../../LICENSE)——依存する `texlyre-busytex` エンジンに合わせています。
詳細は [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) を参照。
