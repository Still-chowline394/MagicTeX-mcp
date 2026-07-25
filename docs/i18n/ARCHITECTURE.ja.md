# アーキテクチャ

[English](../ARCHITECTURE.md) · [简体中文](ARCHITECTURE.zh-CN.md) · **日本語** · [한국어](ARCHITECTURE.ko.md) · [Español](ARCHITECTURE.es.md) · [Français](ARCHITECTURE.fr.md) · [Deutsch](ARCHITECTURE.de.md) · [Português](ARCHITECTURE.pt.md)

> このドキュメントはコードに密接に追従します。ファイルパス・関数名・識別子は英語のままです。

## なぜヘッドレスブラウザなのか

WASM 版の TeX Live エンジン（`texlyre-busytex`、その前身の SwiftLaTeX）は**ブラウザライブラリ**です。内部で `document.createElement('script')` や `new Worker(...)` を呼ぶため、素の Node プロセスでは動きません。そこで MCP サーバーは Playwright 経由で**隠しヘッドレス Chromium** をコンパイル用ワーカーとして起動します。エンジンはそこで一度だけ初期化され、以降のコンパイルで再利用されます。

副次的な利点：エンジンが隠しブラウザ側にあるため、**あなたが**開くタブは React ワークスペースと軽量な `pdf.js` ビューアだけで、WASM は含まれません。

## 構成要素

- `src/server.ts` — MCP stdio サーバー。7 つのツールすべてを登録。重い処理はすべて遅延実行で、エンジン・プレビューサーバー・ファイル監視は接続時ではなく最初の `render_preview` 呼び出しで起動します。
- `src/tools/*ToolDef.ts` — ツール群ごとに 1 ファイル。名前 + Zod 入力スキーマ + 説明をエクスポート：`renderPreviewToolDef.ts`、`commentsToolDefs.ts`（`check_comments` / `resolve_comment` / `add_comment` / `reply_to_comment`）、`showDiffToolDef.ts`、`listCheckpointsToolDef.ts`。
- `src/lock.ts` — 同時に動く複数の MCP サーバープロセス間で共有される状態を守るクロスプロセス・ミューテックス（排他ロックファイル + 失効回復）。各 Claude Code セッションは自前の `tsx server.ts` を起動する（stdio MCP はクライアントごとに子プロセス 1 つ）ため、プロセス内ロックだけでは同じプロジェクトを扱う 2 セッションを守れません。[`ROADMAP.ja.md`](ROADMAP.ja.md) 参照。
- `src/engine/browserHost.ts` — シングルトンのヘッドレス Chromium + エンジンホストページ。`compile(files, mainTexPath, engine)` を公開し、エンジンの初期化を一度きりに保ちます。
- `src/engine/hostPage.ts` — 隠しページの HTML。WASM エンジンを読み込み `window.__compile` を公開。データパッケージ名には `.js` サフィックスが必要（`importScripts` にそのまま渡されるため）。バイナリ図版は base64 で渡されます。
- `src/engine/assets.ts` — 初回実行時の WASM TeX Live アセットのダウンロード。
- `src/engine/fallbackStyles.ts` — 同梱 TeX Live サブセットに欠けている `.sty`（algorithms 系、multirow、`bbm` の近似）を内蔵し、プロジェクト側に無い場合コンパイル時に注入します。
- `src/preview/previewServer.ts` — 1 つのローカル HTTP+WS サーバー。隠しブラウザへエンジンホストページ + WASM アセットを、あなたへワークスペース（`/app`、`ui/dist` から）または `ui/dist` が無い場合のみ旧来のインラインビューア（`src/preview/viewerPage.ts`）を提供。加えて `/api/*`（ファイル、コメント、アップロード）、`/git/*`（チェックポイント、差分、状態）、`/export.zip` + `/overleaf/link`。全レスポンスに COOP/COEP ヘッダーを付与します（エンジンの Worker/SharedArrayBuffer がクロスオリジン分離を要求するため）。
- `src/preview/filesApi.ts` — `/api/*` の背後にあるファイルツリーと読み書き・リネーム・削除・アップロード。パストラバーサル対策付き。
- `src/preview/commentsStore.ts` — コメントを `<project>/.latex-preview/comments.json` に永続化（アトミック書き込み：一時ファイル + リネーム）。すべての変更は `lock.ts` の下で実行。状態遷移：`suggested` →（人間が承認）→ `accepted` →（author が解決）→ `resolved`。
- `src/preview/anchorMatch.ts` — 引用 → `{file, line}` のベストエフォート照合。本格的なインデックス無しで `check_comments` が Claude に位置を示せるようにします。
- `src/preview/diffViewPage.ts` — `show_diff` が差分を画像として返すためにスクリーンショットを撮る隠しページ。
- `src/project/*` — `resolveMainFile`（`\documentclass` を探す）、`collectProjectFiles`（プロジェクトツリーの収集）、`compileProject`（共通のコンパイル処理）、`parseLog`（TeX ログ → `{file, line, message}`）。
- `src/export/overleafZip.ts` — きれいなビルド入力 zip を構築（コンパイル済み PDF、`.git`、`.latex-preview` を除外）。`/export.zip` と Overleaf の「Upload Project」用。
- `src/git/checkpoints.ts` — Zed 風の自動チェックポイント。コンパイル成功のたびに、一時 index（`GIT_INDEX_FILE`）を使って作業ツリーを**隠し ref**（`refs/latex-preview/checkpoints`）配下の並行コミットチェーンにスナップショットするため、ユーザーの作業ツリー / index / HEAD / ブランチには一切触れません。変更を伴う操作（`createCheckpoint`、`restoreCheckpoint`、`restoreFile`）はすべて `lock.ts` の下で実行。差分とチェックポイント一覧は `.latex-preview/` と `.claude/` を除外します（git の exclude pathspec）——どちらも論文の一部ではありません。
- `src/git/remote.ts` — GitHub リモート（あれば）を解析し、公開リポジトリ向けの Open-in-Overleaf リンクを構築。
- `src/coordinator.ts` — **1 プロセス内**のすべてのコンパイル（ツール + 監視）を 1 本の promise チェーンで直列化し、成功のたびに git チェックポイントを作成します。共有状態のクロスプロセス直列化は `lock.ts` の仕事であってここではありません——coordinator が担うのは WASM エンジンだけで、それ自体がプロセスごとに 1 つです。
- `src/watch/fileWatcher.ts` — 受動的なライブリロードのための chokidar 監視。
- `src/session.ts` — 現在のプロジェクトルート。coordinator（設定する側）と git/コメントのエンドポイント（読む側）で共有し、循環 import を避けます。

## コンパイルの流れ

```
render_preview ─┐                          ┌─ setLatestPdf ─▶ WS "reload" ─▶ ワークスペース
                ├─▶ coordinator (直列) ────▶│
ファイル保存 ────┘        compileProject     └─ compile-error ─▶ WS ─▶ エラーバナー
                          │
                          ├─ resolveMainFile + collectProjectFiles
                          └─ browserHost.compile → page.evaluate(window.__compile)
                                                    → BusyTexRunner (再利用) → PDF
```

## ワークスペース UI（`ui/`）

Vite+React+TS のアプリで、`ui/dist` にビルドされ（`npm run build:ui`）、プレビューサーバーが `/app` で静的配信します——API と WebSocket と同一オリジンなのでプロキシも CORS も不要。`ui/dist` が無い場合（ビルド前のクリーンな clone）は旧来のインライン `/viewer` にフォールバックします。

- `ui/src/App.tsx` — 3 ペイン構成：左タブ（Source | History）、中央 PDF、右 Comments。
- `ui/src/components/Toolbar.tsx` — ブランドマーク + 文書タイトル、Recompile、コメント切替、Export .zip / Download PDF。
- `ui/src/components/PdfView.tsx` — pdf.js キャンバス + **テキストレイヤー**（選択可能）+ ハイライトレイヤー。テキスト選択でコメント入力欄が開きます。ハイライトは古い座標に固定するのではなく**描画のたびに現在のテキストへ再アンカー**され（コメント引用の先頭・末尾フレーズを、必要に応じて短くしながら照合）、編集後の再フローに追随します。形状はテキスト選択に倣い（最初と最後の行は部分、中間の行は行いっぱい）、複数行のハイライトがフォント計量の差（斜体、行内数式）で分断されないようにしています。
- `ui/src/components/SourcePanel.tsx` — CodeMirror 6 の LaTeX エディタ（Code/Visual モード、行折り返し切替）。`/api/files` + `/api/file`（GET/PUT、パスガード付き）の上で動作し、30 秒ごとに再コンパイル無しで自動保存、Ctrl+S / Save / Recompile で必要時に再ビルド。
- `ui/src/components/FileTree.tsx` — 入れ子の Overleaf 風ファイルツリー：新規/リネーム/削除、図版アップロード、高さ変更可能。
- `ui/src/components/HistoryPanel.tsx` + `DiffView.tsx` — チェックポイントのタイムライン。自前の unified diff レンダラ（diff2html ではない）でファイル単位の折りたたみに対応し、チェックポイント単位・ファイル単位の**復元**ボタン（`POST /git/restore`、`/git/restore-file`）を備えます。
- `ui/src/components/CommentsPanel.tsx` — suggested/accepted/resolved のカード、Auto-accept（copilot）トグル、ハイライトへのジャンプ。
- コメントの MCP ループ：`check_comments` が承認済みコメントを構造化された指示として返し、`resolve_comment` が 1 件をメモ付きで解決済みにします。両端は `comments-changed` の WS イベントで同期します。

## 現時点で対象外

「実装済み vs 計画中」の詳細は [`ROADMAP.ja.md`](ROADMAP.ja.md) を参照。要するに、真の並行 multi-agent 編集（reviewer/author/defender がそれぞれ自分の git ブランチで同時に実際に編集し、あとで統合する）が次のマイルストーンです——現在のクロスプロセスロック（`src/lock.ts`）は並行**セッション**をデータ損失から守りますが、同じファイルを本当に並列編集するのではなく、依然として順番待ちです。
