# cc-monitor 캐릭터 상태 정의 (8개)

대시보드가 세션 데이터로 **상태 하나**를 고르고 `img/<state>.png`를 보여준다.
이미지는 제미나이로 생성. "공통 프롬프트" + 각 상태의 "표정/자세"를 붙여서 뽑는다.

## 공통 프롬프트 (모든 상태에 앞에 붙임)

```
A small round mascot character, same character in every image: a soft cream-colored blob with
short stubby arms, big expressive eyes, no mouth unless noted, a tiny green LED antenna on top.
Chibi style, clean flat illustration, thick soft outline, pastel palette, front-facing,
centered, square 1:1, plain transparent background, no text, no props unless noted.
```

## 상태 (우선순위 순: 위에서부터 처음 맞는 것 하나)

| # | state | 발동 조건 | 표정 / 자세 | 대사 |
|---|---|---|---|---|
| 1 | `broke` | 방금 호출에서 피할 수 있던 캐시 깨짐(모델/effort/툴 목록 변경), 3분 유지 | dizzy spiral eyes, small stars circling the head, wobbling pose, antenna LED blinking yellow | "아야… 다시 다 읽었어요" |
| 2 | `asking` | 마지막 도구가 AskUserQuestion이고 답 대기 중 | head tilted, one big question mark above, hands together waiting, eyes on the viewer | "형, 어떻게 할까요?" |
| 3 | `working` | 도구 호출 중 (stop_reason=tool_use, 3분 내 호출) | focused eyes, tiny hard hat, holding a wrench, small motion lines, antenna LED green | "작업 중…" |
| 4 | `full` | 놀고 있고 컨텍스트 ≥ 400k | very round bloated body, half-closed satisfied eyes, one hand on belly, a tiny burp cloud | "배가 불러요…" |
| 5 | `sleepy` | TTL 남은 시간 12분 미만, 캐시 살아있음 | droopy half-closed eyes, yawning (small open mouth), one arm rubbing eye, antenna LED dim orange | "졸려요… 곧 잊어버릴 것 같아요" |
| 6 | `asleep` | TTL 만료, 컨텍스트 < 이어가기 임계 | eyes closed, small "z z z", curled up, antenna LED off | "자고 있어요. 깨워도 돼요" |
| 7 | `amnesia` | TTL 만료, 컨텍스트 ≥ 이어가기 임계 | eyes closed, an empty dotted thought bubble, a tiny fallen memory card beside it, antenna LED off | "깨우면 다 까먹은 상태예요" |
| 8 | `idle` | 그 외 | neutral friendly eyes, slight smile, small wave with one hand, antenna LED green | "대기 중" |

## 판정 규칙

- 1번 `broke`는 3분 홀드. 그동안은 아래 조건을 보지 않는다.
- `full`은 400k 기준에 히스테리시스 20k (380k 밑으로 내려가야 해제).
- 대사는 이미지 밑에 텍스트로 붙이므로 이미지에는 글자를 넣지 않는다.

## 뺀 것과 이유

refusal(월 1회), api_error(월 22회지만 몇 초짜리), dieting/압축(월 20회), cloning/서브에이전트(월 39회),
powerup(모델 전환은 `broke`와 같은 순간), thinking(`working`에 흡수), night(새벽 호출 0건), proud/levelup(퀘스트 붙인 뒤에).
나중에 추가하려면 표에 한 줄 넣고 png 하나 추가하면 된다.

## 파일 규칙

- `cc-monitor/img/<state>.png`, 512×512, 투명 배경. 없는 상태는 `idle.png`로 대체.

## 제미나이 프롬프트 예시 (`full`)

```
A small round mascot character, same character in every image: a soft cream-colored blob with
short stubby arms, big expressive eyes, no mouth unless noted, a tiny green LED antenna on top.
Chibi style, clean flat illustration, thick soft outline, pastel palette, front-facing,
centered, square 1:1, plain transparent background, no text, no props unless noted.
Expression and pose: very round bloated body, half-closed satisfied eyes, one hand on belly,
a tiny burp cloud.
```
