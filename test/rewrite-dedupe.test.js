'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runFixture } = require('./helper.js');

test('rewrite-dup: 재기록 구간(uuid 동일)은 종류 불문 한 번만 반영된다 (D-1a)', () => {
  const { s, f, breaks } = runFixture('rewrite-dup');
  assert.equal(s.prompts, 1);
  assert.equal(s.compacts, 1);
  assert.equal(s.asks, 1);
  assert.equal(s.commits, 1);
  assert.equal(f.comp.toolResult, 6);   // tool_result 본문 6자가 한 번만
  assert.equal(f.comp.toolInput, 88);   // 두 tool_use의 input JSON 88자가 한 번만
  assert.equal(f.results.length, 1);
  assert.equal(breaks.length, 1);
  assert.deepEqual(breaks[0].events, ['prefix:deferred_tools_delta', 'compact']);
});

test('assistant-split: 같은 message.id · 다른 uuid인 세 줄은 content가 모두 반영되고 usage는 한 번만 (D-1a 회귀 방지)', () => {
  const { s, f } = runFixture('assistant-split');
  assert.equal(s.calls, 1);
  assert.equal(s.commits, 2);
  assert.equal(f.comp.toolInput, 74);   // 두 tool_use의 input JSON이 모두 반영된다
});
