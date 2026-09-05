# docs/RULE.md

이 프로젝트는 pdca-skill v1 체계를 따른다. 절차 본문은 스킬(`pdca-plan` `pdca-design` `pdca-do` `pdca-close` `cycle-propose` `backlog-sync`)이 정본이고, 이 파일은 **이 프로젝트만의 예외와 훅**만 담는다.

## 검증 수단

Plan §5의 SC에 붙일 수 있는 수단. 여기 없는 수단을 SC에 쓰지 않는다.

| 수단 | 방법 | 비고 |
|---|---|---|
| 자동 테스트 | `node --test` (인자 없이. 디렉터리 인자를 주면 Node 24가 그것을 모듈로 읽으려다 실패한다) | 테스트 위치 `test/*.test.js`. Node 18 내장 `node:test`만 쓴다(의존성 없음 원칙). CI가 없으므로 사이클 브랜치에서 수동 실행하고 결과를 do §3에 남긴다. 트랜스크립트 픽스처는 `test/fixtures/*.jsonl`에 두되 개인 경로·프롬프트 본문은 지우고 넣는다 |
| 사용자 육안 | `node server.js --dir <대상> --port <빈 포트>`로 띄운 대시보드를 브라우저에서 본다. 포트를 고정하지 않는다(7777은 사용자의 상시 모니터가 점유하는 일이 잦다). 쓴 포트 번호를 do §3에 적는다. 카드 · 그래프 · Cache breaks 표 · 습관 순위 · 캐릭터 상태 | 사용자가 확인한 날짜를 do §3에 남긴다 |
| 로그·수치 | 서버 기동 로그(`[cc-monitor] …`)와 `curl localhost:7777/api/state`, `curl "localhost:7777/api/detail?id=<sessionId>"`의 JSON 필드 값을 읽는다. 변경 전후 비교는 같은 폴더를 두 번 띄워 집계(`byCause` · `breaks`)를 대조한다 | |

## 브랜치 · CI

- 통합 브랜치: `develop`. 릴리즈 브랜치: `main`. 다르면 여기 적는다.
- 사이클 브랜치는 `{버전}-{사이클명}`, develop에서 분기.
- 릴리즈 전진 방식: `ff-only`. `git switch main && git merge --ff-only {버전} && git push`.
  (2026-09-04 확인: `SpiritFlag/claude-code-cache-monitor`의 main은 룰셋·브랜치 보호가 없어 직푸시가 된다. 보호가 걸리면 이 줄을 `PR merge commit` 방식으로 바꾼다.)
- CI 확인 명령: **사용자 확인**. `.github/workflows/`가 없어 자동 검사가 돌지 않는다. close는 게이트와 릴리즈 전진 전에 `node --test` 결과와 사용자 육안 확인 날짜가 do §3에 남아 있는지를 대신 본다.

## 종료 훅

close 6단계(docs 커밋 직전)에 이 프로젝트가 추가로 하는 일. 없으면 "없음".

1. README.md 최신화

## 릴리즈노트

- 제목 이모지: 매번 적절한 것을 선택
- 톤: 게임 공지
- 제품명: Cache Monitor for Claude Code

## 예외

1. **의존성 없음.** `package.json`이 없다. 런타임·테스트 모두 Node 내장 모듈만 쓴다(`node:test` 포함). 라이브러리를 들이려면 그 자체를 하나의 사이클로 연다.
2. **CI 없음.** 모든 게이트는 수동 실행이고, 실행 결과는 do §3에 날짜와 함께 남겨야 근거로 인정한다.
3. **테스트 위치와 픽스처 규약.** 테스트는 `test/*.test.js`, 합성 픽스처는 `test/fixtures/*.jsonl`이고 `test/helper.js`의 `runFixture(name)`이 `replay`를 불러 `{ s, f, breaks, byCause, snap }`을 준다. 픽스처에는 집계에 쓰는 필드만 남기고 `lastPrompt`·`cwd`·홈 경로를 넣지 않는다.
4. **트랜스크립트 픽스처는 개인정보다.** `~/.claude/projects/` 원본을 그대로 커밋하지 않는다. 경로·프롬프트 본문·토큰을 지우고 집계에 필요한 수치 필드만 남긴다.
5. **인덱스에 문서 열을 두지 않는다.** `docs/PDCA/_INDEX.md`의 표는 `| 버전 | 날짜 | 사이클명 | 종류 | 한 줄 요약 |` 다섯 열이다. pdca-close §5는 존재하는 stage를 적는 '문서' 열을 요구하지만, 같은 문단이 링크를 금지하므로 그 열이 stage 이름 나열로만 남아 폴더를 열어 보는 것 이상을 알려주지 않는다. close에서 이 열을 되살리지 않는다.
