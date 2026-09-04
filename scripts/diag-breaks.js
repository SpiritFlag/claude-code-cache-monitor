#!/usr/bin/env node
// usage: node scripts/diag-breaks.js --dir <경로> [--top 20]
'use strict';
const path = require('path');
const { replay } = require('../server.js');

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = path.resolve(argv('--dir', '.'));
const TOP = parseInt(argv('--top', '20'), 10);

const { sessions } = replay(DIR);
const all = [];
for (const s of sessions.values()) for (const b of s.breaks) all.push({ ...b, sessionId: s.id });

function byCauseTable(list) {
  const t = {};
  for (const b of list) { const c = t[b.cause] = t[b.cause] || { n: 0, rewrite: 0, extra: 0 }; c.n++; c.rewrite += b.rewrite; c.extra += b.extra; }
  return t;
}
function printTable(label, list) {
  console.log('\n' + label);
  const t = byCauseTable(list);
  for (const [cause, v] of Object.entries(t).sort((a, b) => b[1].extra - a[1].extra)) {
    console.log(`  ${cause.padEnd(18)} n=${String(v.n).padEnd(5)} rewrite=${String(v.rewrite).padEnd(10)} extra=$${v.extra.toFixed(4)}`);
  }
}

printTable('메인 세션', all.filter(b => !b.sub));
printTable('서브에이전트', all.filter(b => b.sub));

console.log(`\n최근 ${TOP}건`);
const recent = [...all].sort((a, b) => b.ts - a.ts).slice(0, TOP);
for (const b of recent) {
  console.log(`  ${new Date(b.ts).toISOString()} ${b.sessionId} ${b.cause.padEnd(18)} rewrite=${b.rewrite} shrink=${b.shrink} grew=${b.grew} prefixIntact=${b.prefixIntact} events=${JSON.stringify(b.events)}`);
}
