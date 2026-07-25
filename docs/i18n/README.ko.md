# MagicTeX — AI 에이전트를 위한 LaTeX 편집기

<!-- badges -->
[![CI](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ZoeLinUTS/MagicTeX-mcp/actions/workflows/ci.yml)
[![stars](https://img.shields.io/github/stars/ZoeLinUTS/MagicTeX-mcp?style=flat)](https://github.com/ZoeLinUTS/MagicTeX-mcp/stargazers)
[![last commit](https://img.shields.io/github/last-commit/ZoeLinUTS/MagicTeX-mcp)](https://github.com/ZoeLinUTS/MagicTeX-mcp/commits/main)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](../../LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%9D%A4-Sponsor-db61a2)](https://github.com/sponsors/ZoeLinUTS)

[English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · **한국어** · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md)

![MagicTeX workspace](../images/workspace.png)

**MagicTeX** 는 **AI 에이전트를 위해 만들어진 LaTeX 편집기**입니다. MCP 서버를 통해 Claude
Code 에 연결되는 Overleaf 스타일의 **단일 창 작업 공간**으로, **로컬 TeX 설치도 Overleaf
계정도 필요 없습니다**: 실시간 PDF 미리보기, **비주얼(WYSIWYG) 모드**가 있는 소스 편집기,
변경 이력, 그리고 **렌더링된 PDF 위에 고정한 코멘트가 그대로 에이전트의 편집 지시가 됩니다**.
(npm 패키지: `magictex-mcp`)

헤드리스 브라우저에서 실행되는 WASM TeX Live 2026 엔진
([texlyre-busytex](https://github.com/TeXlyre/texlyre-busytex))으로 컴파일하므로, 수 GB를
설치할 필요가 없습니다 — 한 번만 WASM 자산을 내려받으면 됩니다.

## 작업 공간

하나의 브라우저 창(Typst의 단일 화면 편집과 LiquidText의 고정 주석에서 영감):

- **코멘트 → 에이전트 루프(핵심).** 렌더링된 문서를 인쇄물 첨삭하듯 검토: 텍스트를 선택해
  코멘트를 답니다. 그런 다음 Claude 에게 “address my comments”라고 말하면 — `check_comments`
  로 **위치 정보가 포함된 작업 항목**(페이지 + 인용 + 대응 소스의 `파일:줄` + 요청)을 가져와
  소스를 수정하고 각 카드에 메모와 함께 해결합니다.
- **편집 가능한 소스 패널 + 파일 트리.** CodeMirror LaTeX 편집기, Overleaf 식 파일 트리
  (폴더, 새로 만들기/이름 변경/삭제, 파일 전환). Ctrl+S 로 재컴파일.
- **비주얼(WYSIWYG) 모드.** 제목·굵게·기울임·`$…$` 및 `\begin{equation}` 수식을 즉석에서
  렌더링. 커서를 올리면 원본 LaTeX 가 나타나 편집할 수 있습니다.
- **리뷰 워크플로우(reviewer → 사람 확인 → 수정).** reviewer/defender 에이전트가
  `add_comment` 로 코멘트를 게시하고, 당신이 **Accept/Reject**(또는 *자동 수락* 코파일럿
  모드), author 루프가 수락된 항목을 해결합니다.
- **변경 이력.** 성공한 컴파일마다 **숨겨진 git ref** 에 자동 스냅샷 — 브랜치나 `git log` 를
  건드리지 않습니다.

## 설치

1. 논문 프로젝트의 `.mcp.json` 에 추가([`.mcp.json.example`](../../.mcp.json.example) 참고):

   ```json
   {
     "mcpServers": {
       "magictex": { "command": "npx", "args": ["-y", "magictex-mcp"] }
     }
   }
   ```

2. **Claude Code 재시작**(또는 `/mcp` 재연결)하여 서버를 로드합니다.
3. Claude 에게 “render a preview of this paper”라고 요청 — 처음에는 WASM TeX Live 자산
   (약 480 MB, 1회)을 내려받아 컴파일하고 실시간 미리보기를 엽니다.

## Claude Code 플러그인으로 설치(슬래시 명령)

타이핑을 줄이려면 MagicTeX 를 플러그인으로 설치 — 한 번의 설치로 MCP 서버와 슬래시 명령을
모두 얻습니다:

```
/plugin marketplace add ZoeLinUTS/MagicTeX-mcp
/plugin install magictex
```

- **`/magic-latex`** — 컴파일하고 작업 공간 열기.
- **`/ai-review [skill]`** — 스킬로 논문을 검토(기본값 `academic-paper-revision`, 임의 스킬
  이름 가능)하고 확인용 코멘트를 게시. 미설치 스킬은 설치 안내를 표시.
- **`/address-comments`** — 수락된 코멘트 해결(`/loop 60s /address-comments` 가능).
- ⚡ **`/ultra-agents [skill] [depth]`** — 완전 자동 모드: 검토·자동 수락·수정을 반복. 최대
  `depth` 라운드(기본 2), 한 라운드에서 새 의견이 없으면 조기 종료. 라운드 사이에 승인
  확인이 없음—그게 이 모드의 목적이자 위험 요소. `depth`가 5를 넘으면 시작 전에 확인을
  요청. 종료 후 요약(무엇을 지적했고 무엇을 바꿨는지, 해당 checkpoint) 제공. 각 라운드도
  여전히 되돌릴 수 있는 일반 checkpoint.

### 도구마다 명령 하나

모든 MCP 도구에는 **같은 이름**의 슬래시 명령이 있어, 도구 이름만 입력하면 해당 단계를 실행합니다. 가르칠 규칙은 한 줄: **도구가 `X` 면 `/X` 입력**.

| 이렇게 입력 | 실행 도구 | 하는 일 |
| --- | --- | --- |
| `/render_preview` | `render_preview` | 논문을 컴파일하고 라이브 미리보기 열기/새로고침. |
| `/check_comments` | `check_comments` | 수락한 코멘트를 편집 지시로 나열(아직 편집 안 함). |
| `/resolve_comment [id] [메모]` | `resolve_comment` | 편집 후 완료 표시; 코멘트가 **초록색**으로 바뀌어 검토 대기. |
| `/add_comment ["인용"] [메모]` | `add_comment` | 해당 구절에 코멘트를 고정해 수락/거절할 수 있게. |
| `/reply_to_comment [id] [내용]` | `reply_to_comment` | 코멘트에 스레드 답글 추가. |
| `/show_diff [sha]` | `show_diff` | 나란히 보는 시각적 diff 이미지(현재 변경 또는 checkpoint). |
| `/list_checkpoints [limit]` | `list_checkpoints` | 최근 checkpoint를 sha와 함께 최신순으로 표시—`/show_diff`에 넘길 sha 찾기용. |

꼭 입력할 필요는 없습니다——평범한 말로도 됩니다(“미리보기 렌더링”, “코멘트 처리해줘”). 명령은 빠르고 가르치기 쉬운 단축일 뿐입니다.

## 문서

- [**사용자 가이드**](USER-GUIDE.ko.md) — 일상적인 사용법, 코멘트 루프, 비주얼 모드, 파일 트리,
  논문을 Overleaf로 가져가기, 패키지 지원 범위.
- [**에이전트 루프**](AGENT-LOOP.ko.md) — 트리거로서의 코멘트, `/loop`로 무인 운영,
  reviewer → 사람의 승인 → resolver 워크플로, 그리고 ⚡ `/ultra-agents`.
- [**로드맵**](ROADMAP.ko.md) — 동시 실행 agent에 대해 무엇이 완료됐고, 진짜 병렬 multi-agent
  편집에 무엇이 더 필요한지.
- [**아키텍처**](ARCHITECTURE.ko.md) — 왜 헤드리스 브라우저인지, 각 모듈이 하는 일, 컴파일 흐름.

네 문서 모두 이 README와 같은 8개 언어로 번역되어 있습니다 — 각 페이지 상단에 자체 언어 전환기가 있습니다.

## 이 프로젝트 후원

MagicTeX 는 무료 오픈 소스(AGPL-3.0)입니다. 논문 작업 시간을 아꼈다면
**[이 프로젝트를 후원](https://github.com/sponsors/ZoeLinUTS)**해 주세요. 저장소에 ⭐ 도 큰
힘이 됩니다.

## 라이선스

[AGPL-3.0-or-later](../../LICENSE) — 기반 엔진 `texlyre-busytex` 와 동일합니다.
자세한 내용은 [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) 참고.
