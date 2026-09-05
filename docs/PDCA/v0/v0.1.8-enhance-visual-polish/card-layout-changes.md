# 상단 4카드 레이아웃 변경 명세

대상: `index.html`의 `.top` 안 4개 카드(Cache TTL · Context · Cost · 캐릭터).
기준 코드: `uploads/index-437c800c.html`. 시안: `Dashboard Cards.dc.html`.
그리드(`.top`, 미디어쿼리, 1×4↔2×2 전환)는 그대로 둔다. 카드 **내부 배치만** 바꾼다.

## 공통 원칙

- 모든 카드를 `display:flex; flex-direction:column; gap:14px`로 만든다. (`.card`에 직접 넣어도 되고 `.top > .card`로 한정해도 됨)
- 카드 안은 세 층으로 나눈다: **상단 고정 블록** / **가운데 블록(`flex:1`, 남는 높이에서 세로 가운데 정렬)** / **바닥 고정 블록**.
  - 가운데 블록: `flex:1; display:flex; flex-direction:column; justify-content:center`
  - 바닥 블록은 그냥 마지막 자식으로 두면 된다 (spacer 역할을 가운데 블록이 함).
- 2×2일 때 행 높이는 제일 긴 카드에 맞춰 늘어나므로, 위 구조로 빈 공간이 중간에 뜨지 않고 위·아래로 정돈된다.
- `.card h2`의 `margin-bottom:6px`은 제거 (gap이 대신함). 헤더는 4카드 모두 **좌측 정렬**(TTL 카드의 `text-align:center` 제거, 링·문구만 가운데).
- 기존에 `margin-top`으로 간격을 주던 요소(`.bar`, `.ctxbar`, `.advice`, `.fuel`, `.sub`, `#ttlwarn`)는 이 카드들 안에서 `margin-top:0`으로 두고 gap에 맡긴다.
- 작은 라벨+값 "타일" 스타일(재사용): `background:#232836; border-radius:6px; padding:7px 9px; display:flex; flex-direction:column; gap:3px` / 라벨 `11px var(--dim)` / 값 `600 13px var(--mono)`.

## 1. Cache TTL 카드

구조:
```
<div class="card ttl">
  <h2>Cache TTL (60m)</h2>                          ← 상단
  <div class="ttl-mid">                             ← flex:1, 세로·가로 가운데
    <div class="ring">…</div>
    (진행 중일 때) 깨뜨리면 $x (현재 cost의 n%) / compact 미리 안내 문구
  </div>
  <div id="ttlwarn">okbox / warnbox</div>           ← 바닥 (만료 판단문 · "곧 만료" 박스)
</div>
```
- `.ttl-mid { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; }`
- 링 크기 180 → **160px** (r=70, stroke 11, dasharray 439.8). `.ring { margin:0 }`.
- 링 안 숫자 `.big` 40 → **36px**, `letter-spacing:-.02em`.
- `tick()`의 출력 분리:
  - 진행 중: "깨뜨리면 $…" 줄과 노란 compact 안내 → `.ttl-mid` 안(링 아래, `text-align:center`)에 넣는다. "곧 만료" `warnbox`만 `#ttlwarn`(바닥)에.
  - 만료: `#ttlwarn`에 `resumeBox` (okbox/warnbox) 한 줄, `text-align:center; font-weight:600`.
- `#ttlwarn`의 인라인 `margin-top:12px` 제거.

## 2. Context 카드

구조:
```
<div class="card">
  <div class="ctx-top">                             ← 상단 고정
    <h2>Context</h2>
    <div class="ctx-head"><div class="big">273k</div><div class="sub">of 1M window · cacheR … · cacheW … · compacts …</div></div>
  </div>
  <div class="ctx-mid">                             ← flex:1, 세로 가운데
    <div class="cl-note">구성은 추정 — …</div>       ← text-align:right
    <div class="ctxbar">…8층…</div>
    <div class="complegend">…8줄…</div>
  </div>
  <div class="advice">… <button>상세</button></div>  ← 바닥 (구분선 포함)
</div>
```
- `.ctx-top { display:flex; flex-direction:column; gap:6px; }`
- `.ctx-mid { flex:1; display:flex; flex-direction:column; justify-content:center; gap:8px; }`
- `.cl-note { text-align:right; margin-top:0; }` — 위치를 head 아래가 아니라 **바 바로 위**로 옮긴다.
- `.ctxbar { margin-top:0 }`.
- `.complegend`를 세로 8줄 → **2열 그리드**로: `display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:3px 18px; margin-top:0`. `.cl-row`는 그대로(swatch · 라벨 ellipsis · 토큰 52px · 퍼센트 34~38px).
- `.advice { margin-top:0 }` (border-top·padding-top 유지).

## 3. Cost 카드

구조:
```
<div class="card cost-card">
  <h2>Cost (API 환산)</h2>                          ← 상단
  <div class="cost-mid">                            ← flex:1, 세로 가운데
    <div class="cost-head">
      <div class="cost-k"><span>이 세션</span><div class="big">$7.56</div></div>
      <div class="vsep"></div>
      <div class="cost-k"><span>오늘 누적</span><div class="mid">$149.80</div></div>
      <div class="cost-k right"><span>캐시 깨짐 손실</span><div class="mid bad">$0.00 <small>0건</small></div></div>
    </div>
  </div>
  <div class="cost-foot">                           ← 바닥
    <div class="sub">모델은 세션 안에서 바꾸지 않습니다 — …</div>
    <div class="fuel">활성 시간 대비 COST + 3줄</div> (border-top 포함)
  </div>
</div>
```
- **out / think / calls 타일 삭제** (`.cost-stats` 제거). 깨짐 손실만 남긴다.
- `.cost-mid { flex:1; display:flex; flex-direction:column; justify-content:center; }` (기존 `align-items:center` 제거)
- `.cost-head { display:flex; align-items:flex-end; gap:18px; }`
- `.cost-k { display:flex; flex-direction:column; gap:6px; }` / 라벨 `span { font-size:11px; color:var(--dim); }`
- `.cost-k .big { font:700 44px/1 var(--mono); letter-spacing:-.02em; }`
- `.cost-k .mid { font:600 26px/1 var(--mono); color:var(--dim); padding-bottom:2px; }`
- `.cost-k .mid.bad { color:var(--bad); }` / `.mid small { font-size:12px; color:var(--dim); font-weight:400; }`
- `.cost-k.right { margin-left:auto; align-items:flex-end; text-align:right; }` — 손실은 우측 끝으로.
- `.vsep { width:1px; align-self:stretch; background:var(--line); }` — **$7.56과 오늘 누적 사이에만** 둔다. 오늘 누적과 손실 사이엔 선 없음.
- 기존 `.today-total` 제거(위 `.cost-k`로 대체). 툴팁(title)은 오늘 누적 `.cost-k`에 유지.
- `.cost-foot { display:flex; flex-direction:column; gap:10px; }`
- `principleLine()`의 `.sub`는 `margin-top:0`. `.fuel { margin-top:0 }` (border-top·padding-top 유지).
- `renderMain()`에서 `${principleLine()} ${fuelCells(s)}`를 `.cost-foot`으로 감싼다.

## 4. 캐릭터 카드

구조:
```
<div class="card">
  <div class="char">                                ← 카드 = flex column, align-items:center
    <div class="char-mid">                          ← flex:1, 세로 가운데
      <div class="bubble">대사</div>
      <img …>
    </div>
    <div class="bubble down">모델명</div>           ← 바닥
  </div>
</div>
```
- `.char { flex:1; display:flex; flex-direction:column; align-items:center; gap:12px; }` (카드 높이를 채우도록 `flex:1` 또는 `height:100%`)
- `.char-mid { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; width:100%; }`
- `charCard()`에서 말풍선+img를 `.char-mid`로 감싸고 `.bubble.down`은 밖(마지막 자식)에 둔다.
- 이미지 170 → **160px**.

## 값 요약 (변경 전 → 후)

- 카드 padding: `14px 16px` → `16px 18px`
- 링: 180px/r80/stroke12/dash 502.6 → 160px/r70/stroke11/dash 439.8 (tick()의 `502.6` 상수도 `439.8`로)
- 링 숫자: 40px → 36px
- 캐릭터 img: 170px → 160px
- 큰 숫자(`.big`): 44px 유지 + `letter-spacing:-.02em`
- 범례: 1열 → 2열 그리드
- Cost 타일(out/think/calls): 삭제
