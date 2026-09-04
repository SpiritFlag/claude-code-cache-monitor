# docs/RULE.md

이 프로젝트는 pdca-skill v1 체계를 따른다. 절차 본문은 스킬(`pdca-plan` `pdca-design` `pdca-do` `pdca-close` `cycle-propose` `backlog-sync`)이 정본이고, 이 파일은 **이 프로젝트만의 예외와 훅**만 담는다.

## 검증 수단

Plan §5의 SC에 붙일 수 있는 수단. 여기 없는 수단을 SC에 쓰지 않는다.

| 수단 | 방법 | 비고 |
|---|---|---|
| 자동 테스트 | `node --test test/` | 테스트 위치 `test/*.test.js`. Node 18 내장 `node:test`만 쓴다(의존성 없음 원칙). CI가 없으므로 사이클 브랜치에서 수동 실행하고 결과를 do §3에 남긴다. 트랜스크립트 픽스처는 `test/fixtures/*.jsonl`에 두되 개인 경로·프롬프트 본문은 지우고 넣는다 |
| 사용자 육안 | `node server.js`로 띄운 대시보드를 브라우저(`http://localhost:7777`)에서 본다. 카드 · 그래프 · Cache breaks 표 · 습관 순위 · 캐릭터 상태 | 사용자가 확인한 날짜를 do §3에 남긴다 |
| 로그·수치 | 서버 기동 로그(`[cc-monitor] …`)와 `curl localhost:7777/api/state`, `curl "localhost:7777/api/detail?id=<sessionId>"`의 JSON 필드 값을 읽는다. 변경 전후 비교는 같은 폴더를 두 번 띄워 집계(`byCause` · `breaks`)를 대조한다 | |

## 브랜치 · CI

- 통합 브랜치: `develop`. 릴리즈 브랜치: `main`. 다르면 여기 적는다.
- 사이클 브랜치는 `{버전}-{사이클명}`, develop에서 분기.
- 릴리즈 전진 방식(둘 중 하나를 지운다):
  - `ff-only`: `git switch main && git merge --ff-only {버전} && git push`. main 직푸시가 허용될 때.
  - `PR merge commit`: main이 GitHub 룰셋으로 보호돼 직푸시가 안 될 때. `gh pr create --base main --head develop` → status check 통과 → Merge commit 병합 → develop에 main 백머지. Squash · Rebase 병합 금지(태그 SHA가 main 밖에 남는다).
- CI 확인 명령: `{예: gh run list --branch <브랜치> --limit 1, gh pr checks <PR>}`. 없으면 "사용자 확인"이라 쓴다. close가 게이트와 릴리즈 전진 전에 이걸 쓴다.

## 종료 훅

close 6단계(docs 커밋 직전)에 이 프로젝트가 추가로 하는 일. 없으면 "없음".

1. README.md 최신화

## 릴리즈노트

- 제목 이모지: 매번 적절한 것을 선택
- 톤: 게임 공지
- 제품명: Cache Monitor for Claude Code

## 예외

{이 프로젝트가 표준 규칙에서 벗어나는 것. 없으면 "없음".}
