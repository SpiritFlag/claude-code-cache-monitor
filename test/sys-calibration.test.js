'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');

test('mcp-config-cold: cfgKey가 두 attachment의 서버 이름 집합과 같고 sysSource === cold-self', () => {
  const { snap } = runFixture('mcp-config-cold');
  const s = snap.sessions[0];
  assert.equal(s.cfgKey, 'claude_ai_Figma|github');
  assert.equal(s.sysSource, 'cold-self');
  assert.equal(s.sysTokens, 40000);
});

test('mcp-config-warm: 웜 시작 + 유일한 샘플 -> sysSource === warm-folder', () => {
  const { snap } = runFixture('mcp-config-warm');
  const s = snap.sessions[0];
  assert.notEqual(s.cfgKey, '');
  assert.equal(s.sysSource, 'warm-folder');
  assert.equal(s.sysTokens, 51002);
});

test('mcp-config-none: attachment 없음 -> cfgKey는 빈 문자열이고 sysSource === default', () => {
  const { snap } = runFixture('mcp-config-none');
  const s = snap.sessions[0];
  assert.equal(s.cfgKey, '');
  assert.equal(s.sysSource, 'default');
  assert.equal(s.sysTokens, 45000);
});
