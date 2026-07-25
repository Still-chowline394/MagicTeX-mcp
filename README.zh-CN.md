# MagicTeX — 面向 AI Agent 的 LaTeX 编辑器

<!-- badges -->
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](README.md) · **简体中文**

**MagicTeX** 是一个**为 AI Agent 打造的 LaTeX 编辑器**——一个类 Overleaf 的
**单窗口工作区**，通过 MCP 服务器接入 Claude Code，**无需本地安装 TeX，也无需
Overleaf 账号**：实时 PDF 预览、带**可视化（所见即所得）模式**的源码编辑器、修改历史，
以及**你在渲染后的 PDF 上锚定的评论——它们会直接变成 Agent 的修改指令**。（npm 包名：
`magictex-mcp`。）

它用运行在无头浏览器里的 WASM TeX Live 2026 引擎
（[texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex)）编译，因此没有几个 GB
的东西要装——只有一次性的 WASM 资源下载。

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

1. 在你的论文项目的 `.mcp.json` 中加入（见 [`.mcp.json.example`](.mcp.json.example)）：

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

## 赞助本项目

MagicTeX 是免费开源的（AGPL-3.0）。如果它为你的论文节省了时间，欢迎
**[赞助本项目](https://github.com/sponsors/ZoeLinUTS)**，这将支持它持续开发。给仓库点个
⭐ 也很有帮助。

## 许可证

[AGPL-3.0-or-later](LICENSE)——与其所依赖的 `texlyre-busytex` 引擎保持一致。
详见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
