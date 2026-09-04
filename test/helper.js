'use strict';
const path = require('path');
const { replay } = require('../server.js');
// name: 확장자 없는 픽스처 이름. 반환: { s, breaks, byCause, snap }
function runFixture(name) {
  const fp = path.join(__dirname, 'fixtures', name + '.jsonl');
  const { snapshot, sessions } = replay(fp);
  const s = [...sessions.values()][0];
  return { s, breaks: s ? s.breaks : [], byCause: s ? s.byCause : {}, snap: snapshot };
}
module.exports = { runFixture };
