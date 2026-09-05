#!/usr/bin/env node
// usage: node scripts/diag-shrink.js --dir <경로> [--min 2000] [--session <id 접두>] [--cause <원인>]
// 판정은 하지 않는다: replay가 낸 브레이크 목록을 그대로 쓰고, 브레이크 사이 레코드를 원본 jsonl에서 다시 읽어 덤프만 한다.
'use strict';
const fs = require('fs');
const path = require('path');
const { replay, files } = require('../server.js');

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = path.resolve(argv('--dir', '.'));
const MIN = parseInt(argv('--min', '2000'), 10);
const SESSION = argv('--session', '');
const CAUSE = argv('--cause', '');

const { sessions } = replay(DIR);
const filePaths = [...files.keys()];

for (const s of sessions.values()) {
  if (SESSION && !s.id.startsWith(SESSION)) continue;
  const fps = filePaths.filter(fp => files.get(fp).sessionId === s.id);
  for (const b of s.breaks) {
    if (b.rewrite < MIN) continue;
    if (CAUSE && b.cause !== CAUSE) continue;
    const prevTs = b.ts - b.gapMin * 60000;
    console.log(`\n=== ${s.id} ${new Date(b.ts).toISOString()} cause=${b.cause} rewrite=${b.rewrite} (${new Date(prevTs).toISOString()} ~ ${new Date(b.ts).toISOString()}) ===`);
    for (const fp of fps) {
      let text; try { text = fs.readFileSync(fp, 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let d; try { d = JSON.parse(line); } catch { continue; }
        const ts = d.timestamp ? Date.parse(d.timestamp) : 0;
        if (ts <= prevTs || ts > b.ts) continue;
        console.log(`  ${d.type || ''} subtype=${d.subtype || ''} isMeta=${!!d.isMeta} attachment.type=${(d.attachment && d.attachment.type) || ''} uuid=${d.uuid || ''}`);
      }
    }
  }
}
