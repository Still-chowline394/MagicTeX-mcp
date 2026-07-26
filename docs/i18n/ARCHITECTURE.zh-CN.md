# 架构

[English](../ARCHITECTURE.md) · **简体中文** · [日本語](ARCHITECTURE.ja.md) · [한국어](ARCHITECTURE.ko.md) · [Español](ARCHITECTURE.es.md) · [Français](ARCHITECTURE.fr.md) · [Deutsch](ARCHITECTURE.de.md) · [Português](ARCHITECTURE.pt.md)

> 本文档紧贴代码。文件路径、函数名、标识符一律保持英文原样。

## 为什么用无头浏览器

WASM 版的 TeX Live 引擎(`texlyre-busytex`,以及更早的 SwiftLaTeX)本质上是**浏览器库**:它们内部调用
`document.createElement('script')` 和 `new Worker(...)`,在纯 Node 进程里跑不起来。所以 MCP server 会启动
一个**隐藏的无头 Chromium**(通过 Playwright)作为它的编译 worker。引擎在那里初始化一次,之后每次编译都复用。

一个附带的好处:因为引擎活在隐藏的浏览器里,**你**打开的那个标签页是 React 工作区加一个轻量的
`pdf.js` 查看器 —— 里面没有 WASM。

## 各个部件

- `src/server.ts` —— MCP stdio server;注册全部 7 个工具(见下)。重活都是懒加载的:引擎、预览
  server、文件监听器都在第一次调用 `render_preview` 时才启动,而不是连接时。
- `src/tools/*ToolDef.ts` —— 每组工具一个文件,各自导出名称 + Zod 输入 schema + 描述:
  `renderPreviewToolDef.ts`、`commentsToolDefs.ts`(`check_comments` / `resolve_comment` /
  `add_comment` / `reply_to_comment`)、`showDiffToolDef.ts`、`listCheckpointsToolDef.ts`。
- `src/lock.ts` —— 跨进程互斥锁(排他锁文件 + 失效恢复),保护那些被并发运行的多个 MCP server 进程
  共享的状态:每个 Claude Code 会话都会启动自己的 `tsx server.ts`(stdio MCP = 每个客户端一个子进程),
  所以只有进程内的锁保护不了两个会话同时操作同一个项目。见 [`ROADMAP.zh-CN.md`](ROADMAP.zh-CN.md)。
- `src/engine/browserHost.ts` —— 单例的无头 Chromium + 引擎宿主页面;暴露
  `compile(files, mainTexPath, engine)`。让引擎只初始化一次。
- `src/engine/hostPage.ts` —— 隐藏页面的 HTML;导入 WASM 引擎并暴露 `window.__compile`。
  数据包名字要带 `.js` 后缀(它们被原样传给 `importScripts`);二进制图片以 base64 编码传入。
- `src/engine/assets.ts` —— 首次运行时下载 WASM TeX Live 资源。
- `src/engine/fallbackStyles.ts` —— 内置那些自带 TeX Live 子集里缺失的 `.sty`(algorithms 家族、
  multirow、一个 `bbm` 的近似实现),在项目自己没有这些文件时于编译时注入。
- `src/preview/previewServer.ts` —— 一个本地 HTTP+WS server:给隐藏浏览器提供引擎宿主页面 + WASM 资源;
  给你提供工作区(`/app`,来自 `ui/dist`)或者旧版内联查看器(`src/preview/viewerPage.ts`,仅当
  `ui/dist` 不存在时);`/api/*`(文件、评论、上传);`/git/*`(checkpoint、diff、状态);
  `/export.zip` + `/overleaf/link`。所有响应都带 COOP/COEP 头(引擎的 Worker/SharedArrayBuffer
  需要跨源隔离)。
- `src/preview/filesApi.ts` —— `/api/*` 背后的文件树和读/写/重命名/删除/上传,带路径穿越防护。
- `src/preview/commentsStore.ts` —— 评论持久化在 `<project>/.latex-preview/comments.json`
  (原子写入:临时文件 + 重命名),所有写操作都走 `lock.ts`。状态流转:`suggested` →(人工接受)→
  `accepted` →(author 解决)→ `resolved`。
- `src/preview/anchorMatch.ts` —— 尽力而为的"引文 → `{file, line}`"定位,这样 `check_comments`
  不需要真正的索引也能给 Claude 指出位置。
- `src/preview/diffViewPage.ts` —— `show_diff` 用来截图、把 diff 作为图片返回的那个隐藏页面。
- `src/project/*` —— `resolveMainFile`(找 `\documentclass`)、`collectProjectFiles`(收集项目文件树)、
  `compileProject`(共享的编译流程)、`parseLog`(TeX 日志 → `{file, line, message}`)。
- `src/export/overleafZip.ts` —— 构建一个干净的"编译输入" zip(排除编译出的 PDF、`.git`、
  `.latex-preview`),供 `/export.zip` 和 Overleaf 的 "Upload Project" 使用。
- `src/git/historyRepo.ts` —— 决定一个项目的历史放在哪里。已经是 git 仓库的项目,历史仍然放在它自己内部的隐藏 ref 上;
  普通文件夹则会得到一个属于我们的仓库,位于 `.latex-preview/history.git`,以项目本身作为工作树 —— 于是历史跟着论文走,
  而不是跟着路径走:文件夹被移动、复制、删除时历史也一起,而在那里运行 `git` 依然会说这不是一个仓库。0.1.9 之前的历史
  存在按用户的缓存里,以路径哈希为键;只有当它记录的字节仍然和磁盘上的某个文件一致时才会被迁移过来,所以一个被复用的
  路径不可能继承另一个项目的 checkpoint。
- `src/git/checkpoints.ts` —— Zed 风格的自动 checkpoint。每次成功编译后,用一个临时 index
  (`GIT_INDEX_FILE`)把工作树快照到一条**隐藏 ref**(`refs/latex-preview/checkpoints`)下的并行提交链上,
  所以用户的工作树 / index / HEAD / 分支都不会被碰到。每个会写入的操作(`createCheckpoint`、
  `restoreCheckpoint`、`restoreFile`)都在 `lock.ts` 下运行。diff 和 checkpoint 列表会排除
  `.latex-preview/` 和 `.claude/`(git exclude pathspec)—— 这两个都不属于用户的论文。
- `src/git/remote.ts` —— 解析 GitHub remote(如果有),为公开仓库构建 Open-in-Overleaf 链接。
- `src/coordinator.ts` —— 把**单个进程内**的所有编译(工具触发 + 监听器触发)串行化到一条 promise 链上;
  每次成功编译后创建一个 git checkpoint。共享状态的跨进程串行化是 `lock.ts` 的职责,不是这里 ——
  coordinator 只管 WASM 引擎,而引擎本身就是每进程一个。
- `src/watch/fileWatcher.ts` —— chokidar 监听器,用于被动的实时重载。
- `src/session.ts` —— 当前项目根目录,在 coordinator(负责设置)和 git/评论端点(负责读取)之间共享,
  且不产生循环 import。

## 编译流程

```
render_preview ─┐                          ┌─ setLatestPdf ─▶ WS "reload" ─▶ 工作区
                ├─▶ coordinator (串行) ────▶│
文件保存 ────────┘        compileProject     └─ compile-error ─▶ WS ─▶ 工作区错误横幅
                          │
                          ├─ resolveMainFile + collectProjectFiles
                          └─ browserHost.compile → page.evaluate(window.__compile)
                                                    → BusyTexRunner (复用) → PDF
```

## 工作区 UI(`ui/`)

一个 Vite+React+TS 应用,构建到 `ui/dist`(`npm run build:ui`),由预览 server 静态托管在 `/app` ——
和 API、WebSocket 同源,所以不需要代理和 CORS。当 `ui/dist` 不存在时(全新 clone 还没构建),
server 会回退到旧版内联的 `/viewer`。

- `ui/src/App.tsx` —— 三栏骨架:左侧标签页(Source | History)、中间 PDF、右侧 Comments。
- `ui/src/components/Toolbar.tsx` —— 品牌标识 + 文档标题、Recompile、评论开关、
  Export .zip / Download PDF。
- `ui/src/components/PdfView.tsx` —— pdf.js 画布 + **文字层**(可选中)+ 高亮层;选中文字会打开评论
  编辑框。高亮在**每次渲染时都重新锚定到当前文字上**(用评论引文的首尾短语匹配,匹配不上就逐步缩短),
  而不是钉死在旧坐标上,所以能跟着改动后的重排走;形状按文字选中的样子处理(首尾行部分覆盖,中间行
  整行顶格满宽),这样多行高亮不会因为字体度量的差异(斜体、行内公式)而碎掉。
- `ui/src/components/SourcePanel.tsx` —— CodeMirror 6 LaTeX 编辑器(Code/Visual 模式、折行开关),
  基于 `/api/files` + `/api/file`(GET/PUT,带路径防护);每 30 秒自动保存但不重新编译,
  Ctrl+S / Save / Recompile 才按需重建。
- `ui/src/components/FileTree.tsx` —— 嵌套的 Overleaf 风格文件树:新建/重命名/删除、图片上传、
  可调高度。
- `ui/src/components/HistoryPanel.tsx` + `DiffView.tsx` —— checkpoint 时间线;一个手写的统一 diff
  渲染器(不是 diff2html),支持按文件折叠;支持按 checkpoint 和按文件**恢复**
  (`POST /git/restore`、`/git/restore-file`)。
- `ui/src/components/CommentsPanel.tsx` —— suggested/accepted/resolved 三类卡片、
  Auto-accept(copilot)开关、跳转到高亮。
- 评论的 MCP 循环:`check_comments` 把已接受的评论作为结构化指令返回;`resolve_comment` 把某条标记为
  已解决并附上说明;两端通过 `comments-changed` WS 事件保持同步。

## 暂不在范围内

更详细的"已实现 vs 计划中"见 [`ROADMAP.zh-CN.md`](ROADMAP.zh-CN.md)。简单说:真正并发的 multi-agent
编辑(reviewer/author/defender 同时真正地编辑,各自在自己的 git 分支上,最后合并回来)是下一个里程碑 ——
今天的跨进程锁(`src/lock.ts`)让并发的**会话**不会丢数据,但它们依然是轮流干活,而不是真的并行编辑同一个文件。
