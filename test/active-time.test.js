'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');

test('active-basic: activeMs는 각 그룹의 last_ts - 직전 이벤트 시각의 합과 같다 (SC-7)', () => {
  const { snap } = runFixture('active-basic');
  const s = snap.sessions[0];
  // group1: prevTs=00:00:00, lastTs=00:00:15 -> 15000ms. group2: prevTs=00:00:20, lastTs=00:00:30 -> 10000ms.
  assert.equal(s.activeMs, 15000 + 10000);
});

test('active-notime: 타임스탬프 없는 top-level 이벤트는 activeMs에 영향이 없다 (SC-8)', () => {
  const { snap: snapBasic } = runFixture('active-basic');
  const { snap: snapNotime } = runFixture('active-notime');
  assert.equal(snapNotime.sessions[0].activeMs, snapBasic.sessions[0].activeMs);
});

test('active-sidechain: isSidechain 필드가 있는 assistant 줄은 activeMs에서 제외된다 (SC-9, D-7)', () => {
  const { snap: snapBasic } = runFixture('active-basic');
  const { snap: snapSidechain } = runFixture('active-sidechain');
  assert.equal(snapSidechain.sessions[0].activeMs, snapBasic.sessions[0].activeMs);
});

test('active-dayline: KST 05:00 경계로 04:59 그룹과 05:00 그룹이 서로 다른 day key에 들어간다 (SC-10)', () => {
  const { snap } = runFixture('active-dayline');
  const days = snap.folder.days;
  assert.equal(days['2026-09-01'].activeMs, 60000); // 19:58:00 -> 19:59:00 (04:59 KST)
  assert.equal(days['2026-09-02'].activeMs, 30000); // 19:59:30 -> 20:00:00 (05:00 KST)
});
