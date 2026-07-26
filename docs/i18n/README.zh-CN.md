# MagicTeX — 面向 AI Agent 的 LaTeX 编辑器

<!-- badges -->
[![npm](https://img.shields.io/npm/v/magictex-mcp?logo=npm)](https://www.npmjs.com/package/magictex-mcp)
[![MCP registry](https://img.shields.io/badge/MCP%20registry-io.github.ZoeLinUTS%2Fmagictex-6f42c1)](https://registry.modelcontextprotocol.io)
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](../../LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](../../README.md) · **简体中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md)

![MagicTeX workspace](../images/workspace.png)

**MagicTeX** 是一个**为 AI Agent 打造的 LaTeX 编辑器**——一个类 Overleaf 的
**单窗口工作区**，通过 MCP 服务器接入 Claude Code，**无需本地安装 TeX，也无需
Overleaf 账号**：实时 PDF 预览、带**可视化（所见即所得）模式**的源码编辑器、修改历史，
以及**你在渲染后的 PDF 上锚定的评论——它们会直接变成 Agent 的修改指令**。（npm 包名：
`magictex-mcp`。）

它用运行在无头浏览器里的 WASM TeX Live 2026 引擎
（[texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)）编译，因此没有几个 GB
的东西要装——只有一次性的 WASM 资源下载。

## 安装前先看一眼

**[zoelin.dev/tools/magictex](https://zoelin.dev/tools/magictex)** 上有一个「评论 → agent」
闭环的分步演示，全部内容取自真实工具输出。它是回放，不是在线实例——TeX 引擎需要一次性下载
约 480 MB，而 agent 那一半就是 Claude 本身，所以 MagicTeX 运行在你的项目旁边，而不是网页里。

## 工作区

一个浏览器窗口（灵感来自 Typst 的单界面编辑与 LiquidText 的锚定批注）：

- **评论 → Agent 闭环（核心）。** 像导师批改打印稿一样审阅**渲染后**的文档：选中文字、
  加一条评论（“把这段改简洁”）。然后让 Claude *“address my comments”*——它通过
  `check_comments` 把评论作为**带定位的工作项**（页码 + 引用原文 + 对应的源码 `文件:行号`
  + 你的要求）取走、修改源码、并逐条标记完成。你操作文档，Claude 操作源码。可用 `/loop`
  无人值守地跑。
- **可编辑源码面板 + 文件树。** CodeMirror LaTeX 编辑器，Overleaf 式文件树（文件夹、
  新建/重命名/删除、切换文件）；Ctrl+S 保存即重新编译并刷新 PDF。
- **可视化（所见即所得）模式。** 标题、加粗、斜体、`$…$` 与 `\begin{equation}` 数学公式
  就地渲染；把光标移上去即显示原始 LaTeX 可编辑。
- **审阅工作流（reviewer → 人工确认 → 修改）。** reviewer/defender agent 通过
  `add_comment` 提出评论；你 **Accept/Reject**（或开启 *自动接受* 的 copilot 模式）；
  author 循环去解决已接受的评论。评论带角色与回复线程。
- **修改历史。** 每次成功编译都会自动快照到一个**隐藏的 git ref**，不污染你的分支与
  `git log`；History 标签页展示时间线与彩色 diff。
- **保存与重编译分离。** 内置编辑器每 30 秒自动保存（不重编译）；**Ctrl+S / 保存 /
  Recompile** 才按需重建 PDF。

## 安装

1. 在你的论文项目的 `.mcp.json` 中加入（见 [`.mcp.json.example`](../../.mcp.json.example)）：

   ```json
   {
     "mcpServers": {
       "magictex": { "command": "npx", "args": ["-y", "magictex-mcp"] }
     }
   }
   ```

2. **重启 Claude Code**（或 `/mcp` 重连）以加载服务器。
3. 让 Claude *“render a preview of this paper”*——首次会下载 WASM TeX Live 资源
   （约 480 MB，一次性），编译并打开实时预览。之后的修改会自动刷新。

## 作为 Claude Code 插件安装（斜杠命令）

想少打字，就把 MagicTeX 装成插件——一次安装即同时获得 MCP 服务器与斜杠命令：

```
/plugin marketplace add ZoeLinUTS/MagicTeX-mcp
/plugin install magictex
```

- **`/magic-latex`** — 编译并打开工作区。
- **`/ai-review [skill]`** — 用某个 skill 审阅论文（默认 `academic-paper-revision`，
  也可传入任意 skill 名）并留下评论供你确认；skill 未安装时会给出安装提示。
- **`/address-comments`** — 解决你已接受的评论（可 `/loop 60s /address-comments`）。
- ⚡ **`/ultra-agents [skill] [depth]`** — 全自动模式：审阅、自动接受、修改、重复，最多
  `depth` 轮（默认 2），某一轮没有新意见就提前停止。轮与轮之间不经过你确认——这既是它
  的意义，也是风险所在。`depth` 超过 5 会先让你确认才开始。跑完给一份总结（提了什么、
  改了什么、对应哪些 checkpoint），每一轮依然是普通的、可撤销的 checkpoint。

### 每个工具一个命令

每个 MCP 工具都有一个**同名**的 slash 命令，任何单步都能用工具名触发。要教别人的规则一句话：**工具叫 `X`，就打 `/X`**。

| 打这个 | 调用工具 | 作用 |
| --- | --- | --- |
| `/render_preview` | `render_preview` | 编译论文，打开/刷新实时预览。 |
| `/check_comments` | `check_comments` | 列出你已接受的评论（作为修改指令，先不改）。 |
| `/resolve_comment [id] [说明]` | `resolve_comment` | 改完后标记完成；评论变**绿**等你复核。 |
| `/add_comment ["引文"] [说明]` | `add_comment` | 把评论锚定到某段文字，供你接受/拒绝。 |
| `/reply_to_comment [id] [内容]` | `reply_to_comment` | 给某条评论追加线程回复。 |
| `/show_diff [checkpoint]` | `show_diff` | 并排可视化 diff（图片；当前改动或某个 checkpoint）。 |
| `/list_checkpoints [limit]` | `list_checkpoints` | 列出最近的 checkpoint 及其 sha（按时间倒序）——找一个传给 `/show_diff`。 |

其实不打命令也行——直接说人话同样有效（“渲染预览”、“处理我的评论”）。命令只是更快、更好教的简写。

## Tools（工具）

面向任何支持 MCP 的客户端的接口层。（在 Claude Code 里直接说人话、或用上面的斜杠命令就行——这些是底层工具。）

| 工具 | 参数 | 作用 |
| ---- | ---- | ---- |
| `render_preview` | `mainFile?` · `engine?`（`pdflatex` \| `xelatex` \| `lualatex`，默认 `xelatex`）· `backend?`（`wasm` \| `system` \| `auto`，默认 `auto` —— 本机装了 latexmk 就用它，否则用内置 WASM 引擎） | 编译项目并打开/刷新实时工作区。省略主文件时扫描 `\documentclass` 自动识别。 |
| `check_comments` | `includeResolved?`（默认 `false`） | 把已接受的评论作为**带位置的工作项**返回——页码、引用原文、对应源码 `文件:行号`、你的要求。等待裁决的 reviewer 建议只会被提示，不作为工作项返回。 |
| `add_comment` | `quote` · `comment` · `role?`（`reviewer` \| `defender`）· `page?` · `accepted?` | 把评论锚定到某段文字上。默认发布为等待你 Accept/Reject 的**建议**；设置 `accepted` 才直接生效——这个标志正是「全自动模式」之所以全自动的开关。 |
| `resolve_comment` | `id` · `note` | 编辑完成后标记评论已处理，并用一句话说明改了什么。它在工作区里变**绿**，等你复核。 |
| `reply_to_comment` | `id` · `text` · `role?`（`author` \| `reviewer` \| `defender`） | 在评论下追加回复，让分歧在评论里解决，而不是散落在聊天记录中。 |
| `show_diff` | `checkpoint?` | 把并排 diff 渲染成**图片**，直接显示在对话里。默认是当前未提交的改动；传 checkpoint sha 可看某个存档版本。 |
| `list_checkpoints` | `limit?`（默认 10，最大 50） | 列出最近的 checkpoint 及其 sha，最新在前——用它找到要传给 `show_diff` 的那个。 |

**核心卖点建立在这些工具之上，而不在这张表里。** `/magic-latex`、`/ai-review`、`/address-comments` 和 ⚡ `/ultra-agents` 是 Claude Code 的**插件命令**，负责编排上面这些工具——`/ultra-agents` 会把「评审 → 自动接受 → 修复」串成循环，跑满你允许的轮数，`add_comment` 的 `accepted` 参数正是为它而设。它们不属于 MCP 接口层，所以其他 MCP 客户端只会看到这 7 个工具。详见上面的插件小节和 [docs/AGENT-LOOP.zh-CN.md](AGENT-LOOP.zh-CN.md)。

## 我需要本机装 TeX 吗？

不需要 —— 内置的 WASM 引擎不装任何东西就能编译，这正是它的意义。但它只是 TeX Live
的一个*子集*：`svg`、大多数会议文档类，以及一些不那么常见的宏包都不在里面。缺了
的时候会明确告诉你，而不是默默给你一份错的 PDF。

当你需要和 Overleaf 完全一致的输出时再装。MagicTeX 会自动发现并使用它，无需配置：

| | |
|---|---|
| macOS | [MacTeX](https://tug.org/mactex/) |
| Linux | `texlive-full` |
| Windows | [TeX Live](https://tug.org/texlive/) |

> MagicTeX 在 `PATH` 上找的是 `latexmk`，但它**不是一个可以单独安装的东西** ——
> 它是上面这些发行版自带的驱动脚本。装完用 `which latexmk` 确认；macOS 上可能要
> 先跑 `eval "$(/usr/libexec/path_helper)"` 或者重开一个终端。

每次编译都会说明用的是哪个 —— `xelatex · system` 还是 `xelatex · wasm`。

## 文档

- [**用户手册**](USER-GUIDE.zh-CN.md) —— 日常使用、评论循环、可视化模式、文件树、
  把论文导入 Overleaf、宏包覆盖情况。
- [**Agent 循环**](AGENT-LOOP.zh-CN.md) —— 评论作为触发器、用 `/loop` 无人值守运行、
  reviewer → 人工把关 → resolver 工作流,以及 ⚡ `/ultra-agents`。
- [**路线图**](ROADMAP.zh-CN.md) —— 并发 agent 目前已实现了什么,真正的并行 multi-agent
  还差什么。
- [**架构**](ARCHITECTURE.zh-CN.md) —— 为什么用无头浏览器、每个模块干什么、编译流程。

这四篇都翻译成了和本 README 相同的 8 种语言——每页顶部都有自己的语言切换器。

## 赞助本项目

MagicTeX 是免费开源的（AGPL-3.0）。如果它为你的论文节省了时间，欢迎
**[赞助本项目](https://github.com/sponsors/ZoeLinUTS)**，这将支持它持续开发。给仓库点个
⭐ 也很有帮助。

## 致谢

MagicTeX 由 [Zoe Lin](https://zoelin.dev) 编写和维护，使用 **[Claude Code](https://claude.com/claude-code)** 开发。

感谢 **David Turnbull**，是他告诉我 Knuth 宁可花十年自己造一套排版系统，也不接受自己
的书排成那样 —— 这个项目至今仍在跟这个故事较劲。也感谢 [`texlyre-busytex`](https://github.com/TeXlyre/texlyre-busytex) 的维护者们，没有那份
WASM 版 TeX Live，这里在本地一行都跑不起来。

## 许可证

[AGPL-3.0-or-later](../../LICENSE)——与其所依赖的 `texlyre-busytex` 引擎保持一致。
详见 [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)。
