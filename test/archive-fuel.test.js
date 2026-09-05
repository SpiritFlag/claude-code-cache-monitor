'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { replay } = require('../server.js');

// D-5. data/fishing은 .gitignore 대상이라 커밋되지 않는다. 이 머신에서만 회귀를 잡는 조건부 테스트.
// 값은 2026-09-05에 이 아카이브를 replay()해 do §3에 남긴 실측값이다(±1% 허용).
const ARCHIVE = path.join(__dirname, '..', 'data', 'fishing');
const has = fs.existsSync(ARCHIVE);

test('archive-fuel: 폴더·일별·세션 activeMs가 아카이브 실측값과 ±1% 안에서 같다 (SC-11 · SC-12 · SC-27)', { skip: has ? false : 'data/fishing 없음' }, () => {
  const { snapshot, sessions } = replay(ARCHIVE);
  const within = (v, ref) => Math.abs(v - ref) <= Math.abs(ref) * 0.01;

  assert.ok(within(snapshot.folder.activeMs, 157774338), `folder.activeMs=${snapshot.folder.activeMs}`);

  const d = snapshot.folder.days['2026-08-13'];
  assert.ok(d, "folder.days['2026-08-13'] 없음");
  assert.ok(within(d.activeMs, 15123657), `2026-08-13 activeMs=${d.activeMs}`);
  assert.ok(within(d.cost, 195.66), `2026-08-13 cost=${d.cost}`);

  let s7 = null;
  for (const s of sessions.values()) if (s.id.startsWith('7014916b')) s7 = s;
  assert.ok(s7, '세션 7014916b 없음');
  assert.ok(within(s7.activeMs, 5103156), `세션 7014916b activeMs=${s7.activeMs}`);
});
