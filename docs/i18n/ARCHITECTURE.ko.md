# 아키텍처

[English](../ARCHITECTURE.md) · [简体中文](ARCHITECTURE.zh-CN.md) · [日本語](ARCHITECTURE.ja.md) · **한국어** · [Español](ARCHITECTURE.es.md) · [Français](ARCHITECTURE.fr.md) · [Deutsch](ARCHITECTURE.de.md) · [Português](ARCHITECTURE.pt.md)

> 이 문서는 코드를 바짝 따라갑니다. 파일 경로, 함수명, 식별자는 영어 그대로 둡니다.

## 왜 헤드리스 브라우저인가

WASM TeX Live 엔진(`texlyre-busytex`, 그 이전의 SwiftLaTeX)은 **브라우저 라이브러리**입니다. 내부에서 `document.createElement('script')` 와 `new Worker(...)` 를 호출하므로 순수 Node 프로세스에서는 실행되지 않습니다. 그래서 MCP 서버는 Playwright로 **숨겨진 헤드리스 Chromium** 을 컴파일 워커로 띄웁니다. 엔진은 거기서 한 번만 초기화되고 이후 모든 컴파일에서 재사용됩니다.

부수적 이점: 엔진이 숨겨진 브라우저에 있으므로 **당신이** 여는 탭은 React 작업 공간과 가벼운 `pdf.js` 뷰어뿐 — 그 안에 WASM은 없습니다.

## 구성 요소

- `src/server.ts` — MCP stdio 서버. 7개 도구를 모두 등록. 무거운 것은 전부 지연 실행이라, 엔진·프리뷰 서버·파일 감시자는 연결 시점이 아니라 첫 `render_preview` 호출 때 시작됩니다.
- `src/tools/*ToolDef.ts` — 도구 묶음별 파일 하나씩, 각각 이름 + Zod 입력 스키마 + 설명을 내보냅니다: `renderPreviewToolDef.ts`, `commentsToolDefs.ts`(`check_comments` / `resolve_comment` / `add_comment` / `reply_to_comment`), `showDiffToolDef.ts`, `listCheckpointsToolDef.ts`.
- `src/lock.ts` — 동시에 돌아가는 여러 MCP 서버 프로세스가 공유하는 상태를 위한 크로스 프로세스 뮤텍스(배타적 락 파일 + 실효 복구). 각 Claude Code 세션은 자기 `tsx server.ts`를 띄우므로(stdio MCP = 클라이언트당 자식 프로세스 하나), 프로세스 내부 락만으로는 같은 프로젝트를 다루는 두 세션을 지킬 수 없습니다. [`ROADMAP.ko.md`](ROADMAP.ko.md) 참고.
- `src/engine/browserHost.ts` — 싱글턴 헤드리스 Chromium + 엔진 호스트 페이지. `compile(files, mainTexPath, engine)`을 노출하고 엔진 초기화를 한 번으로 유지합니다.
- `src/engine/hostPage.ts` — 숨겨진 페이지의 HTML. WASM 엔진을 임포트하고 `window.__compile`을 노출합니다. 데이터 패키지 이름에는 `.js` 접미사가 필요하고(`importScripts`에 그대로 전달되므로), 바이너리 그림은 base64로 전달됩니다.
- `src/engine/assets.ts` — 첫 실행 시 WASM TeX Live 자산 다운로드.
- `src/engine/fallbackStyles.ts` — 번들된 TeX Live 부분집합에 빠진 `.sty`(algorithms 계열, multirow, `bbm` 근사)를 내장해두고, 프로젝트에 자체 사본이 없을 때 컴파일 시점에 주입합니다.
- `src/preview/previewServer.ts` — 하나의 로컬 HTTP+WS 서버. 숨겨진 브라우저에는 엔진 호스트 페이지 + WASM 자산을, 당신에게는 작업 공간(`/app`, `ui/dist`에서) 또는 `ui/dist`가 없을 때만 레거시 인라인 뷰어(`src/preview/viewerPage.ts`)를 제공합니다. 그 외 `/api/*`(파일, 코멘트, 업로드), `/git/*`(체크포인트, diff, 상태), `/export.zip` + `/overleaf/link`. 모든 응답에 COOP/COEP 헤더를 붙입니다(엔진의 Worker/SharedArrayBuffer가 교차 출처 격리를 요구).
- `src/preview/filesApi.ts` — `/api/*` 뒤의 파일 트리와 읽기/쓰기/이름변경/삭제/업로드, 경로 탈출 방어 포함.
- `src/preview/commentsStore.ts` — 코멘트를 `<project>/.latex-preview/comments.json`에 저장(원자적 쓰기: 임시 파일 + 이름 변경). 모든 변경은 `lock.ts` 아래에서 실행. 상태 흐름: `suggested` → (사람이 수락) → `accepted` → (author가 해결) → `resolved`.
- `src/preview/anchorMatch.ts` — 인용 → `{file, line}` 최선 노력 조회. 실제 인덱스 없이도 `check_comments`가 Claude에게 위치를 알려줄 수 있게 합니다.
- `src/preview/diffViewPage.ts` — `show_diff`가 diff를 이미지로 돌려주기 위해 스크린샷을 찍는 숨겨진 페이지.
- `src/project/*` — `resolveMainFile`(`\documentclass` 찾기), `collectProjectFiles`(프로젝트 트리 수집), `compileProject`(공용 컴파일), `parseLog`(TeX 로그 → `{file, line, message}`).
- `src/export/overleafZip.ts` — 깨끗한 빌드 입력 zip 생성(컴파일된 PDF, `.git`, `.latex-preview` 제외). `/export.zip`과 Overleaf의 "Upload Project"용.
- `src/git/checkpoints.ts` — Zed 스타일 자동 체크포인트. 컴파일이 성공할 때마다 임시 index(`GIT_INDEX_FILE`)를 써서 작업 트리를 **숨겨진 ref**(`refs/latex-preview/checkpoints`) 아래의 평행 커밋 체인으로 스냅샷하므로, 사용자의 작업 트리 / index / HEAD / 브랜치는 절대 건드리지 않습니다. 변경을 일으키는 모든 연산(`createCheckpoint`, `restoreCheckpoint`, `restoreFile`)은 `lock.ts` 아래에서 실행됩니다. diff와 체크포인트 목록은 `.latex-preview/` 와 `.claude/` 를 제외합니다(git exclude pathspec) — 둘 다 논문의 일부가 아닙니다.
- `src/git/remote.ts` — GitHub 원격(있다면)을 파싱해 공개 저장소용 Open-in-Overleaf 링크를 만듭니다.
- `src/coordinator.ts` — **한 프로세스 내부**의 모든 컴파일(도구 + 감시자)을 하나의 promise 체인으로 직렬화하고, 성공할 때마다 git 체크포인트를 만듭니다. 공유 상태의 크로스 프로세스 직렬화는 `lock.ts`의 일이지 여기가 아닙니다 — coordinator는 WASM 엔진만 담당하고, 엔진 자체가 프로세스당 하나입니다.
- `src/watch/fileWatcher.ts` — 수동적 라이브 리로드를 위한 chokidar 감시자.
- `src/session.ts` — 현재 프로젝트 루트. coordinator(설정하는 쪽)와 git/코멘트 엔드포인트(읽는 쪽)가 순환 임포트 없이 공유합니다.

## 컴파일 흐름

```
render_preview ─┐                          ┌─ setLatestPdf ─▶ WS "reload" ─▶ 작업 공간
                ├─▶ coordinator (직렬) ────▶│
파일 저장 ───────┘        compileProject     └─ compile-error ─▶ WS ─▶ 오류 배너
                          │
                          ├─ resolveMainFile + collectProjectFiles
                          └─ browserHost.compile → page.evaluate(window.__compile)
                                                    → BusyTexRunner (재사용) → PDF
```

## 작업 공간 UI (`ui/`)

Vite+React+TS 앱으로 `ui/dist`에 빌드되고(`npm run build:ui`) 프리뷰 서버가 `/app`에서 정적으로 제공합니다 — API 및 WebSocket과 동일 출처라 프록시나 CORS가 필요 없습니다. `ui/dist`가 없으면(빌드 전 새로 clone한 경우) 레거시 인라인 `/viewer`로 폴백합니다.

- `ui/src/App.tsx` — 3분할 셸: 왼쪽 탭(Source | History), 가운데 PDF, 오른쪽 Comments.
- `ui/src/components/Toolbar.tsx` — 브랜드 마크 + 문서 제목, Recompile, 코멘트 토글, Export .zip / Download PDF.
- `ui/src/components/PdfView.tsx` — pdf.js 캔버스 + **텍스트 레이어**(선택 가능) + 하이라이트 레이어. 텍스트 선택 시 코멘트 작성창이 열립니다. 하이라이트는 고정된 좌표에 못 박히지 않고 **매번 렌더링할 때 현재 텍스트에 다시 고정**되어(코멘트 인용의 앞뒤 구절을 점점 짧게 줄여가며 매칭) 편집 후 재배치를 따라갑니다. 모양은 텍스트 선택처럼 처리되어(첫/마지막 줄은 부분, 중간 줄은 꽉 찬 너비) 여러 줄 하이라이트가 폰트 계량 차이(이탤릭, 인라인 수식)로 조각나지 않습니다.
- `ui/src/components/SourcePanel.tsx` — CodeMirror 6 LaTeX 편집기(Code/Visual 모드, 줄바꿈 토글). `/api/files` + `/api/file`(GET/PUT, 경로 보호) 위에서 동작하며, 30초마다 재컴파일 없이 자동 저장하고 Ctrl+S / Save / Recompile로 필요할 때 다시 빌드합니다.
- `ui/src/components/FileTree.tsx` — 중첩된 Overleaf 스타일 파일 트리: 새로 만들기/이름 변경/삭제, 그림 업로드, 높이 조절 가능.
- `ui/src/components/HistoryPanel.tsx` + `DiffView.tsx` — 체크포인트 타임라인. 직접 만든 unified diff 렌더러(diff2html 아님)로 파일별 접기를 지원하고, 체크포인트별·파일별 **복원** 버튼(`POST /git/restore`, `/git/restore-file`)을 제공합니다.
- `ui/src/components/CommentsPanel.tsx` — suggested/accepted/resolved 카드, Auto-accept(copilot) 토글, 하이라이트로 점프.
- 코멘트 MCP 루프: `check_comments`는 수락된 코멘트를 구조화된 지시로 반환하고, `resolve_comment`는 하나를 메모와 함께 해결 처리합니다. 양쪽은 `comments-changed` WS 이벤트로 동기화됩니다.

## 현재 범위 밖

"완료 vs 계획"에 대한 자세한 내용은 [`ROADMAP.ko.md`](ROADMAP.ko.md)를 보세요. 요약하면, 진짜 동시 multi-agent 편집(reviewer/author/defender가 각자의 git 브랜치에서 실제로 동시에 편집하고 나중에 병합)이 다음 마일스톤입니다 — 지금의 크로스 프로세스 락(`src/lock.ts`)은 동시 **세션**을 데이터 유실로부터 지켜주지만, 같은 파일을 진짜로 병렬 편집하는 게 아니라 여전히 번갈아 작업합니다.
