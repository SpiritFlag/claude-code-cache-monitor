#!/usr/bin/env node
// cc-monitor: watches Claude Code transcripts and serves a live cockpit.
// usage: node server.js [--dir <projectsDir>] [--port 7777]
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const args = process.argv.slice(2);
const argv = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(argv('--dir', path.join(os.homedir(), '.claude', 'projects')));
const PORT = parseInt(argv('--port', '7777'), 10);

// $/MTok base input price; cache write 1h = 2x, 5m = 1.25x; cache read = 0.1x (Fable 5.1: 0.025x); output listed separately
const PRICE = {
  'claude-fable-5-1': { in: 10, out: 50, read: 0.025 },
  'claude-fable-5': { in: 10, out: 50, read: 0.1 },
  'claude-opus-5': { in: 5, out: 25, read: 0.1 },
  'claude-sonnet-5': { in: 2, out: 10, read: 0.1 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5, read: 0.1 },
};
const price = (m) => PRICE[m] || { in: 5, out: 25, read: 0.1 };
const PREFIX_EVENTS = new Set(['deferred_tools_delta', 'mcp_instructions_delta', 'agent_listing_delta', 'skill_listing', 'date_change', 'auto_mode', 'auto_mode_exit', 'nested_memory', 'invoked_skills']);
const RESUME_RE = /continue from where you left off/i;
// D-2. 서버 이름 정규화: instructions 쪽 "claude.ai Figma"와 tool 이름 쪽 "claude_ai_Figma"를 같은 키로 합친다
const normName = n => String(n).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
// deferred_tools_delta.addedNames의 "mcp__<서버>__<툴>"에서 서버 이름만 뽑는다
function serverNamesFromToolNames(names) {
  const out = [];
  for (const n of names || []) {
    const parts = String(n).split('__');
    if (parts.length >= 3 && parts[0] === 'mcp') out.push(parts.slice(1, -1).join('__'));
  }
  return out;
}
// D-4a. 프로젝트 키: ROOT 상대 경로의 첫 디렉터리 세그먼트. 평평하면 ''
function projectKey(fp) {
  const rel = path.relative(ROOT, path.dirname(fp)).replace(/\\/g, '/');
  if (!rel || rel === '.' || rel.startsWith('..')) return '';
  return rel.split('/')[0];
}
// 실측 근거(v0.1.2 do §3, 2026-08 아카이브 한 달): breakpoint_shift 5건의 rewrite 최대 18,708 · |rewrite-shrink| 최대 2,753,
// effort_change 135건 중 124건이 |rewrite-shrink| ≤ 3,000이고 rewrite 최소는 25,140.
// 두 원인을 실제로 가르는 것은 MAX_REWRITE 하나이고 여유는 위 5,140 · 아래 1,292다. 표본 5건이라 값은 유지한다.
const BP_MAX_REWRITE = 20000;   // 이보다 크면 브레이크포인트 이동으로 보지 않는다
const BP_SHRINK_SLACK = 3000;   // |rewrite - shrink| 허용 폭 (= 직전 호출의 cw)
const FREE_CAUSES = new Set(['compact', 'breakpoint_shift']); // 손실로 세지 않는 원인

// ---------------- state ----------------
const files = new Map();     // file -> { offset, rest, sessionId, isSub, chainKey, seen:Set, prev, pending:[], lastUserTs }
const sessions = new Map();  // sessionId -> session state
let version = 0;

function session(id) {
  let s = sessions.get(id);
  if (!s) {
    s = {
      id, title: '', cwd: '', entry: '', model: '', effort: '', skill: '', mode: '',
      firstTs: 0, lastTs: 0, lastCallStart: 0, lastCallEnd: 0, lastStop: '', lastTool: '',
      ctx: 0, ttlMin: 5, calls: 0, subCalls: 0, out: 0, think: 0, cacheRead: 0, cacheWrite: 0, cost: 0,
      prompts: 0, compacts: 0, asks: 0, series: [], breaks: [], breakCost: 0, subActive: 0,
      tok: { in: 0, cw1h: 0, cw5m: 0, cwOther: 0, cr: 0, out: 0 }, modelCalls: {}, tokByModel: {}, costByModel: {},
      sysTokens: 0, sysSet: false, comp: null, toolTop: [], compScale: 0,
      coldStartCw: 0, warmStartTotal: 0, firstTotal: 0, startRegrowth: null, compactions: [], compactSamples: [], byCause: {},
      projKey: '', cfgKey: '', sysSource: 'default',
      saved: 0, commits: 0, lateCalls: 0, nightCalls: 0, streak: 0, bestStreak: 0,
      lastAvoidableBreakTs: 0, pendingAsk: false, fullFlag: false,
    };
    sessions.set(id, s);
  }
  return s;
}

function tokensOf(u) {
  const cc = u.cache_creation || {};
  return {
    in: u.input_tokens || 0, cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0, out: u.output_tokens || 0,
    cw1h: cc.ephemeral_1h_input_tokens || 0, cw5m: cc.ephemeral_5m_input_tokens || 0,
    think: (u.output_tokens_details || {}).thinking_tokens || 0,
  };
}

// ---- context composition (estimated from transcript text; scaled to the real context size at each call)
const COMP_KEYS = ['user', 'assistant', 'toolInput', 'toolResult', 'reminders', 'summary', 'images'];
const IMAGE_CHARS = 5600; // ~1600 tokens per pasted image, in char-equivalents
function newComp() { const c = {}; for (const k of COMP_KEYS) c[k] = 0; return c; }
function blockLen(b) {
  if (!b) return 0;
  if (typeof b === 'string') return b.length;
  if (Array.isArray(b)) return b.reduce((n, x) => n + blockLen(x), 0);
  if (b.type === 'text') return (b.text || '').length;
  if (b.type === 'tool_result') return blockLen(b.content);
  if (b.type === 'image') return IMAGE_CHARS;
  return 0;
}
function markerText(c) {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(b => (b && b.type === 'text' ? (b.text || '') : '')).join(' ');
  return '';
}
// ---- compaction advice: dead weight in context + cost flow
const OLD_CALLS = 40;   // tool results older than this many calls count as stale
const REGROWTH_CALLS = 15; // how many calls after a (re)start we measure regrowth over
// Calibration: measured from the watched folder itself (medians). Defaults are used only when the folder has no sample, and are flagged in the UI.
const DEFAULTS = { sys: 45000, summary: 20000, regrowth: 80000 };
// D-5. 실측 표본을 담는 3층 버킷. byKey/byProj는 사다리용, folder는 기존 CAL.sys 등 폴더 중앙값의 재료.
const CAL = {
  sys: DEFAULTS.sys, summary: DEFAULTS.summary, regrowth: DEFAULTS.regrowth,
  n: { sys: 0, summary: 0, regrowth: 0, rewrite: 0, extra: 0, postCtx: 0, warmSys: 0 },
  byKey: new Map(), byProj: new Map(), folder: { cold: [], warm: [], summary: [], regrowth: [], rewrite: [], extra: [], postCtx: [] },
  cfgKeys: 0, noCfgKey: 0,
  // D-9. 압축 실측 재료: 표시 전용, 표본이 없으면 기본값 없이 null(화면이 "샘플 없음"으로 그린다)
  rewrite: null, extra: null, postCtx: null, warmSys: null,
};
const median = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
// byKey · byProj는 {sid, v} 표본을 담아 resolveSys가 자기 자신의 표본을 빼고 median을 낼 수 있게 한다(자기 자신뿐이면
// 그 칸은 못 맞은 것으로 보고 다음 칸으로 내려간다). folder는 기존 CAL.sys와 같은 값을 배열로 유지한다(자기 제외 없음).
const medianExcl = (entries, sid) => median(entries.filter(e => e.sid !== sid).map(e => e.v));
const keyOf = (projKey, cfgKey) => JSON.stringify([projKey, cfgKey]);
function calibrate() {
  const byKey = new Map(), byProj = new Map();
  const folder = { cold: [], warm: [], summary: [], regrowth: [], rewrite: [], extra: [], postCtx: [] };
  const bucket = (map, k) => { let b = map.get(k); if (!b) { b = { cold: [], warm: [] }; map.set(k, b); } return b; };
  let noKey = 0;
  for (const s of sessions.values()) {
    if (!s.calls) continue;
    if (!s.cfgKey) noKey++; // cfgKey를 못 만든 세션은 sys 보정(콜드/웜 표본)에서만 뺀다 — 압축 실측은 구성과 무관해 그대로 쓴다
    if (s.cfgKey) {
      const bk = bucket(byKey, keyOf(s.projKey, s.cfgKey)), bp = bucket(byProj, s.projKey);
      if (s.coldStartCw) { bk.cold.push({ sid: s.id, v: s.coldStartCw }); bp.cold.push({ sid: s.id, v: s.coldStartCw }); folder.cold.push(s.coldStartCw); }
      if (s.warmStartTotal) { bk.warm.push({ sid: s.id, v: s.warmStartTotal }); bp.warm.push({ sid: s.id, v: s.warmStartTotal }); folder.warm.push(s.warmStartTotal); }
    }
    for (const c of s.compactions) { if (c.summary != null) folder.summary.push(c.summary); if (c.regrowth != null) folder.regrowth.push(c.regrowth); }
    if (s.startRegrowth != null) folder.regrowth.push(s.startRegrowth);
    for (const cs of s.compactSamples) { folder.rewrite.push(cs.rewrite); folder.extra.push(cs.extra); folder.postCtx.push(cs.ctx); }
  }
  CAL.byKey = byKey; CAL.byProj = byProj; CAL.folder = folder;
  CAL.cfgKeys = byKey.size; CAL.noCfgKey = noKey;
  const m = median(folder.cold); CAL.sys = m != null ? m : DEFAULTS.sys; CAL.n.sys = folder.cold.length;
  const ms = median(folder.summary); CAL.summary = ms != null ? ms : DEFAULTS.summary; CAL.n.summary = folder.summary.length;
  const mr = median(folder.regrowth); CAL.regrowth = mr != null ? mr : DEFAULTS.regrowth; CAL.n.regrowth = folder.regrowth.length;
  CAL.rewrite = median(folder.rewrite); CAL.n.rewrite = folder.rewrite.length;
  CAL.extra = median(folder.extra); CAL.n.extra = folder.extra.length;
  CAL.postCtx = median(folder.postCtx); CAL.n.postCtx = folder.postCtx.length;
  CAL.warmSys = median(folder.warm); CAL.n.warmSys = folder.warm.length;
}
// D-6 · D-7. sys 8단계 사다리: cold-self -> cold-key -> warm-key -> cold-project -> warm-project -> cold-folder -> warm-folder -> default.
// 최소 표본 n=1 (D-7). ctx 상한은 cold-self를 제외한 모든 칸에 적용된다. key / project 칸은 자기 자신의 표본을 빼고 봐야
// "동료가 있어 더 구체적인 값을 안다"는 뜻이 산다. 안 빼면 표본이 하나뿐이던 세션도 항상 자기 key 칸에서 자기 값을 되받아
// folder까지 내려갈 일이 없어져 사다리가 무의미해진다. folder는 그 반대로 기존 CAL.sys처럼 전체(자기 포함) 중앙값이다.
function resolveSys(s, ctx) {
  if (s.coldStartCw) return { sys: s.coldStartCw, source: 'cold-self' };
  const cap = v => Math.min(v, ctx);
  const bk = CAL.byKey.get(keyOf(s.projKey, s.cfgKey));
  let m;
  if (bk && (m = medianExcl(bk.cold, s.id)) != null) return { sys: cap(m), source: 'cold-key' };
  if (bk && (m = medianExcl(bk.warm, s.id)) != null) return { sys: cap(m), source: 'warm-key' };
  const bp = CAL.byProj.get(s.projKey);
  if (bp && (m = medianExcl(bp.cold, s.id)) != null) return { sys: cap(m), source: 'cold-project' };
  if (bp && (m = medianExcl(bp.warm, s.id)) != null) return { sys: cap(m), source: 'warm-project' };
  if ((m = median(CAL.folder.cold)) != null) return { sys: cap(m), source: 'cold-folder' };
  if ((m = median(CAL.folder.warm)) != null) return { sys: cap(m), source: 'warm-folder' };
  return { sys: cap(DEFAULTS.sys), source: 'default' };
}
// D-8. 압축 비용 고정 상수. 폴더 · 사용자가 무엇이든 이 값이다(CAL 실측과 분리)
const COMPACT = { summary: 20000, rewrite: 55000, regrowth: 60000 };
const STRONG_RATIO = 3; // D-10. 순이득이 압축 실비의 이 배수를 넘으면 톤을 강화한다(잠정치)
function compactAdvice(f, s, total, scale) {
  const lastRead = {}; for (const r of f.results) if (r.name === 'Read' && r.path) lastRead[r.path] = r.idx;
  let dupRead = 0, staleRead = 0, oldResults = 0, dupN = 0, staleN = 0, oldN = 0;
  for (const r of f.results) {
    if (r.name === 'Read' && r.path) {
      if (lastRead[r.path] > r.idx) { dupRead += r.chars; dupN++; }
      else if ((f.edited[r.path] || -1) > r.idx) { staleRead += r.chars; staleN++; }
    } else if (f.callIdx - r.idx > OLD_CALLS) { oldResults += r.chars; oldN++; }
  }
  const tok = c => Math.round(c * scale);
  const dead = tok(dupRead + staleRead + oldResults);
  const p = price(s.model || 'claude-sonnet-5');
  const postCtx = Math.min(total, s.sysTokens + COMPACT.summary);
  const perCallNow = total * p.in * p.read / 1e6, perCallAfter = postCtx * p.in * p.read / 1e6;
  const compactionCost = (COMPACT.summary * p.out + COMPACT.rewrite * p.in * 2 + COMPACT.regrowth * p.in * 2) / 1e6;
  const perCallSave = Math.max(0, perCallNow - perCallAfter);
  const breakEven = perCallSave > 0 ? Math.ceil(compactionCost / perCallSave) : Infinity;
  const callsPerTurn = s.prompts ? s.calls / s.prompts : 10;
  const horizon = 50;
  const saving = perCallSave * horizon - compactionCost;
  const recommend = total > 100000 && saving > compactionCost && (dead / total > 0.25 || breakEven <= 15); // saving must at least double the compaction cost
  return { dead, dupRead: tok(dupRead), staleRead: tok(staleRead), oldResults: tok(oldResults), dupN, staleN, oldN, deadPct: total ? dead / total : 0,
    perCallNow, perCallAfter, compactionCost, breakEven, callsPerTurn, horizon, saving, postCtx,
    summaryTokens: COMPACT.summary, rewriteTokens: COMPACT.rewrite, regrowthTokens: COMPACT.regrowth,
    recommend, strong: recommend && saving >= compactionCost * STRONG_RATIO };
}

const family = m => (m || '').startsWith('claude-fable') ? 'claude-fable-5' : m;

// ---- model comparison: what this session's actual tokens would have cost under each model's pricing
// D-13(질문 q1로 개정). "현재 모델"은 family()로 묶어 판정 — 세션이 실제 쓴 마지막 모델이 비교 목록의
// 대표 모델과 계열만 같으면(fable-5 실사용 -> fable-5-1 칸) "현재"로 표시한다. 배수가 1.00×가 아닐 수
// 있는데(단가가 다르면) 그대로 보여준다 — 이 카드 전체가 재미로 보는 추정치라는 문구를 화면에 남긴다(D-9 톤)
const COMPARE_MODELS = [
  ['claude-fable-5-1', 'fable'], ['claude-opus-5', 'opus'],
  ['claude-sonnet-5', 'sonnet'], ['claude-haiku-4-5-20251001', 'haiku'],
];
function costAsTok(tok, model) {
  const p = price(model);
  return (tok.in * p.in + tok.cw1h * p.in * 2 + (tok.cw5m + tok.cwOther) * p.in * 1.25
        + tok.cr * p.in * p.read + tok.out * p.out) / 1e6;
}
function modelCompare(s) {
  const breakdown = Object.entries(s.costByModel).map(([model, cost]) => ({ model, calls: s.modelCalls[model] || 0, cost })).sort((a, b) => b.cost - a.cost);
  const actual = s.cost;
  // D-14. 넷 다 항상 렌더한다 — 현재 모델 칸도 빼지 않는다
  const curFamily = family(s.model);
  const rows = COMPARE_MODELS.map(([model, label]) => {
    const cost = costAsTok(s.tok, model);
    return { model, label, cost, ratio: actual ? cost / actual : null, current: family(model) === curFamily };
  });
  return { actual, mixed: Object.keys(s.costByModel).length > 1, breakdown, rows };
}

// ---- model switch advice: is downgrading worth it, and how (continue / new session / compact then switch)
const SWITCH_MODELS = [['claude-fable-5', 'fable'], ['claude-opus-5', 'opus'], ['claude-sonnet-5', 'sonnet']]; // haiku deliberately excluded: never a real candidate

// ---- escalation advice: "I'm stuck, I want a stronger model" — how to do it without paying for the whole context twice
function escalationAdvice(s, total) {
  const cur = s.model; const pc = price(cur);
  const sys = s.sysTokens || CAL.sys, SUMMARY = CAL.summary, REGROWTH = CAL.regrowth;
  const used = {}; let allCalls = 0; for (const x of sessions.values()) for (const [m, n] of Object.entries(x.modelCalls)) { used[family(m)] = (used[family(m)] || 0) + n; allCalls += n; }
  const models = SWITCH_MODELS.filter(([m]) => m !== family(cur) && price(m).in > pc.in && (used[m] || 0) >= allCalls * 0.01).map(([m, label]) => {
    const p = price(m); const w = x => x * p.in * 2 / 1e6; const wc = x => x * pc.in * 2 / 1e6;
    const opts = [
      { name: 'effort 올리기 (모델 유지)', go: wc(total), back: 0, keep: true, note: '같은 모델에서 재작성만. 먼저 시도할 것' },
      { name: '옆 세션 상담', go: w(sys), back: 0, keep: true, note: '문제만 붙여넣고 답 받아오기. 이 세션은 TTL 안에 돌아오면 캐시 그대로' },
      { name: '압축 후 전환', go: (SUMMARY * pc.out + (sys + SUMMARY + REGROWTH) * p.in * 2) / 1e6, back: wc(sys + SUMMARY + REGROWTH), keep: false, note: '요약은 남음' },
      { name: '새 세션', go: w(sys + REGROWTH), back: wc(sys + REGROWTH), keep: false, note: '맥락 포기' },
      { name: '이어가기', go: w(total), back: wc(total), keep: true, note: '컨텍스트 전체를 두 번 다시 씀' },
    ].map(o => ({ ...o, total: o.go + o.back }));
    const cheapest = opts.slice(1).reduce((a, b) => b.total < a.total ? b : a); // excluding the effort step (not a model switch)
    return { model: m, label, options: opts, best: cheapest.name, bestCost: cheapest.total, inSession: opts[4].total, effortCost: opts[0].go };
  });
  return { models, ttlMin: s.ttlMin };
}

function scaledComp(f, total, sys) {
  const chars = f.comp; let sum = 0; for (const k of COMP_KEYS) sum += chars[k];
  const avail = Math.max(0, total - sys); const scale = sum ? avail / sum : 0;
  const out = { sys }; for (const k of COMP_KEYS) out[k] = Math.round(chars[k] * scale);
  const tools = Object.entries(f.toolChars).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, c]) => ({ name, tokens: Math.round(c * scale) }));
  return { comp: out, tools, scale };
}

function callCost(model, t) {
  const p = price(model);
  return (t.in * p.in + t.cw1h * p.in * 2 + t.cw5m * p.in * 1.25 + (t.cw - t.cw1h - t.cw5m) * p.in * 1.25 + t.cr * p.in * p.read + t.out * p.out) / 1e6;
}

function handleRecord(f, d) {
  // 재기록 구간: CC가 재개하며 이력을 다시 쓴 행은 uuid가 같다. 종류 불문 한 번만 센다.
  if (d.uuid) { if (f.uuidSeen.has(d.uuid)) return; f.uuidSeen.add(d.uuid); }
  if (d.sessionId) f.sessionId = d.sessionId;
  if (!f.sessionId) return;
  const s = session(f.sessionId);
  const ts = d.timestamp ? Date.parse(d.timestamp) : 0;
  if (ts) { if (!s.firstTs || ts < s.firstTs) s.firstTs = ts; if (ts > s.lastTs) s.lastTs = ts; }

  switch (d.type) {
    case 'custom-title': s.title = d.customTitle; return;
    case 'ai-title': if (!s.title) s.title = d.aiTitle; return;
    case 'mode': s.mode = d.mode; return;
    case 'system':
      if (d.subtype === 'compact_boundary') {
        s.compacts++; f.pending.push('compact');
        if (d.compactMetadata && d.compactMetadata.postTokens != null) f.compactPost = d.compactMetadata.postTokens; // D-9
      }
      return;
    case 'attachment':
      if (d.attachment && PREFIX_EVENTS.has(d.attachment.type)) f.pending.push('prefix:' + d.attachment.type);
      // D-1 · D-3. 첫 assistant 호출 전까지 MCP 구성 키 재료(서버 이름)를 모은다
      if (!f.cfgFrozen && d.attachment) {
        const a = d.attachment;
        if (a.type === 'mcp_instructions_delta' && Array.isArray(a.addedNames)) for (const n of a.addedNames) f.cfgNames.add(normName(n));
        else if (a.type === 'deferred_tools_delta' && Array.isArray(a.addedNames)) for (const sv of serverNamesFromToolNames(a.addedNames)) f.cfgNames.add(normName(sv));
      }
      if (!f.isSub && d.attachment) { const a = d.attachment; const v = a.content != null ? a.content : (a.text != null ? a.text : ''); f.comp.reminders += typeof v === 'string' ? v.length : JSON.stringify(v).length; } // hook stdout is not shown to the model
      return;
    case 'user': {
      if (d.cwd) s.cwd = d.cwd; if (d.entrypoint) s.entry = d.entrypoint;
      if (d.isCompactSummary) f.pending.push('compact');
      if (!f.isSub) f.lastUserTs = ts;
      const c = d.message && d.message.content;
      if (d.isMeta && RESUME_RE.test(markerText(c))) f.pending.push('resume');
      const human = !d.isMeta && !f.isSub && (typeof c === 'string' || (Array.isArray(c) && c.every(b => b.type === 'text' || b.type === 'image')));
      if (human) s.prompts++;
      if (!f.isSub && Array.isArray(c) && c.some(b => b.type === 'tool_result')) s.pendingAsk = false;
      if (!f.isSub && c !== undefined) {
        if (d.isCompactSummary) { f.comp = newComp(); f.toolChars = {}; f.results = []; f.edited = {}; f.comp.summary += blockLen(c); }
        else if (typeof c === 'string') { f.comp[d.isMeta ? 'reminders' : 'user'] += c.length; }
        else if (Array.isArray(c)) for (const b of c) {
          if (b.type === 'text') f.comp[d.isMeta ? 'reminders' : 'user'] += (b.text || '').length;
          else if (b.type === 'image') f.comp.images += IMAGE_CHARS;
          else if (b.type === 'tool_result') { const n = blockLen(b.content); f.comp.toolResult += n; const tn = f.toolNames[b.tool_use_id] || { name: '?' }; f.toolChars[tn.name] = (f.toolChars[tn.name] || 0) + n; f.results.push({ idx: f.callIdx, name: tn.name, path: tn.path, chars: n }); }
        }
      }
      return;
    }
    case 'assistant': {
      const m = d.message; if (!m || !m.usage || m.model === '<synthetic>') return;
      // D-3. 그 파일의 첫 유효 assistant 호출에서 구성 키 수집을 동결한다
      if (!f.cfgFrozen) f.cfgFrozen = true;
      if (Array.isArray(m.content)) for (const b of m.content) {
        if (b.type === 'tool_use') {
          s.lastTool = b.name; if (b.name === 'AskUserQuestion') { s.asks++; if (!f.isSub) s.pendingAsk = true; }
          if (!f.isSub) {
            const fp = b.input && b.input.file_path ? String(b.input.file_path).replace(/\\/g, '/').toLowerCase() : undefined;
            f.toolNames[b.id] = { name: b.name, path: fp }; f.comp.toolInput += JSON.stringify(b.input || {}).length;
            if ((b.name === 'Edit' || b.name === 'Write') && fp) f.edited[fp] = f.callIdx;
          }
          if (b.name === 'Bash' && /git commit/.test((b.input && b.input.command) || '')) s.commits++;
        }
        else if (b.type === 'text' && !f.isSub) f.comp.assistant += (b.text || '').length;
      }
      if (f.seen.has(m.id)) return; f.seen.add(m.id);
      const t = tokensOf(m.usage); const total = t.in + t.cw + t.cr;
      const cost = callCost(m.model, t);
      s.cost += cost; s.out += t.out; s.think += t.think; s.cacheRead += t.cr; s.cacheWrite += t.cw;
      s.tok.in += t.in; s.tok.cw1h += t.cw1h; s.tok.cw5m += t.cw5m; s.tok.cwOther += Math.max(0, t.cw - t.cw1h - t.cw5m); s.tok.cr += t.cr; s.tok.out += t.out;
      s.modelCalls[m.model] = (s.modelCalls[m.model] || 0) + 1;
      // D-13 · D-14. 모델별 실측 토큰·실비 누적 — modelCompare()의 breakdown 재료
      { const tm = s.tokByModel[m.model] = s.tokByModel[m.model] || { in: 0, cw1h: 0, cw5m: 0, cwOther: 0, cr: 0, out: 0 };
        tm.in += t.in; tm.cw1h += t.cw1h; tm.cw5m += t.cw5m; tm.cwOther += Math.max(0, t.cw - t.cw1h - t.cw5m); tm.cr += t.cr; tm.out += t.out;
        s.costByModel[m.model] = (s.costByModel[m.model] || 0) + cost; }
      { const pp = price(m.model); s.saved += t.cr * pp.in * (1 - pp.read) / 1e6; } // what caching saved vs. paying list price for those tokens
      if (ts) { const h = (new Date(ts).getUTCHours() + 9) % 24; if (h >= 19 || h < 6) s.lateCalls++; if (h < 6) s.nightCalls++; }
      let brokeNow = false;
      if (f.isSub) { s.subCalls++; s.subActive = ts; } else { s.calls++; }
      if (t.cw1h > 0) s.ttlMin = 60; else if (t.cw5m > 0 && t.cw1h === 0 && s.calls <= 1) s.ttlMin = 5;
      const prev = f.prev; const events = f.pending; f.pending = [];
      if (prev) {
        // tokens that should have been cache hits, capped at what was actually written this call (compaction shrinks the context)
        const prevCached = prev.total - prev.in;             // 직전 호출이 캐시에 남긴 프리픽스
        const rewrite = Math.min(Math.max(0, prevCached - t.cr), t.cw + t.in);
        if (rewrite > 2000) {
          const gapMin = (ts - prev.ts) / 60000;
          const shrink = prev.cr - t.cr;                     // 캐시 읽기 감소분(음수 가능)
          const grew = total - prev.total;                   // 컨텍스트 증감(음수 가능)
          const prefixIntact = t.cr >= prev.cr;
          let cause;
          if (m.model !== prev.model) cause = 'model_switch';
          else if (events.includes('compact')) cause = 'compact';
          else if (gapMin > (s.ttlMin === 60 ? 60 : 5)) cause = 'ttl_expiry';
          else if (events.includes('resume')) cause = 'session_resume';
          else if (shrink > 0 && Math.abs(rewrite - shrink) <= BP_SHRINK_SLACK && rewrite < BP_MAX_REWRITE) cause = 'breakpoint_shift';
          else if (d.effort !== prev.effort) cause = 'effort_change';
          else { const p = events.find(e => e.startsWith('prefix:')); cause = p ? p.slice(7) : 'unexplained'; }
          const p = price(m.model); const mult = t.cw1h > 0 ? 2 : 1.25;
          const extra = rewrite * p.in * (mult - p.read) / 1e6;
          if (!f.isSub && cause === 'compact') s.compactSamples.push({ rewrite, extra, ctx: total }); // D-9. 압축 직후 실측(표시 전용)
          if (!FREE_CAUSES.has(cause)) s.breakCost += extra;
          const bc = s.byCause[cause] = s.byCause[cause] || { n: 0, rewrite: 0, extra: 0 }; bc.n++; bc.rewrite += rewrite; bc.extra += extra;
          if (!FREE_CAUSES.has(cause) && !f.isSub) { brokeNow = true; s.lastAvoidableBreakTs = ts; }
          s.breaks.push({ ts, cause, rewrite, extra, model: m.model, from: prev.model, effort: prev.effort + '→' + d.effort, sub: f.isSub, ctx: total,
            prevIn: prev.in, prevCr: prev.cr, prevTotal: prev.total, curIn: t.in, curCw: t.cw, curCr: t.cr,
            cw1h: t.cw1h, cw5m: t.cw5m, shrink, grew, gapMin, prefixIntact, events });
          if (s.breaks.length > 60) s.breaks.shift();
        }
      }
      f.prev = { total, in: t.in, cr: t.cr, model: m.model, ts, effort: d.effort };
      if (!f.isSub) {
        if (brokeNow) s.streak = 0; else s.streak++; if (s.streak > s.bestStreak) s.bestStreak = s.streak;
        s.model = m.model; s.effort = d.effort || ''; s.skill = d.attributionSkill || ''; s.ctx = total; s.lastStop = m.stop_reason || '';
        s.lastCallStart = (f.lastUserTs && f.lastUserTs <= ts) ? f.lastUserTs : ts; s.lastCallEnd = ts;
        // system prompt + tools + CLAUDE.md: measurable only on a true cold start (first call, no cache read); resumed sessions get the measured sys ladder (D-6)
        if (!s.sysSet) {
          s.sysSet = true;
          s.projKey = projectKey(f.fp); s.cfgKey = [...f.cfgNames].sort().join('|'); // D-4 · D-1, 이 첫 호출 시점에 확정
          const cold = s.calls === 1 && t.cr === 0;
          if (cold) { s.coldStartCw = t.cw + t.in; s.sysTokens = s.coldStartCw; s.sysSource = 'cold-self'; }
          else { s.warmStartTotal = total; const r = resolveSys(s, total); s.sysTokens = r.sys; s.sysSource = r.source; }
          s.firstTotal = total;
        }
        if (s.calls === REGROWTH_CALLS + 1 && s.startRegrowth == null) s.startRegrowth = Math.max(0, total - s.firstTotal);
        if (events.includes('compact')) s.compactions.push({ at: s.calls, post: total, summary: f.compactPost != null ? f.compactPost : null, regrowth: null }); // D-9 · R-4: 실측 없으면 null
        for (const c of s.compactions) if (c.regrowth == null && s.calls === c.at + REGROWTH_CALLS) c.regrowth = Math.max(0, total - c.post);
        f.callIdx++;
        const sc = scaledComp(f, total, s.sysTokens); s.comp = sc.comp; s.toolTop = sc.tools; s.compScale = sc.scale;
        s.advice = compactAdvice(f, s, total, sc.scale);
        s.switch = escalationAdvice(s,total);
        s.series.push({ t: ts, ctx: total, cw: t.cw, cr: t.cr, m: m.model, c: [sc.comp.sys, ...COMP_KEYS.map(k => sc.comp[k])] });
        if (s.series.length > 4000) s.series.splice(0, s.series.length - 4000);
      }
      return;
    }
    default: return;
  }
}

function readFile(fp) {
  let f = files.get(fp);
  if (!f) { f = { fp, offset: 0, rest: '', sessionId: null, isSub: /[\\/]subagents[\\/]/.test(fp), seen: new Set(), uuidSeen: new Set(), prev: null, pending: [], lastUserTs: 0, comp: newComp(), toolChars: {}, toolNames: {}, results: [], edited: {}, callIdx: 0, cfgNames: new Set(), cfgFrozen: false, compactPost: null }; files.set(fp, f); }
  let st; try { st = fs.statSync(fp); } catch { return; }
  if (st.size < f.offset) { f.offset = 0; f.rest = ''; f.seen = new Set(); f.uuidSeen = new Set(); f.prev = null; f.comp = newComp(); f.toolChars = {}; f.toolNames = {}; f.results = []; f.edited = {}; f.callIdx = 0; f.cfgNames = new Set(); f.cfgFrozen = false; f.compactPost = null; } // truncated/rewritten
  if (st.size === f.offset) return;
  const fd = fs.openSync(fp, 'r'); const len = st.size - f.offset; const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, f.offset); fs.closeSync(fd); f.offset = st.size;
  const text = f.rest + buf.toString('utf8'); const lines = text.split('\n'); f.rest = lines.pop();
  for (const l of lines) { if (!l.trim()) continue; let d; try { d = JSON.parse(l); } catch { continue; } handleRecord(f, d); }
  version++;
}

function scan(dir) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) scan(p); else if (e.name.endsWith('.jsonl')) readFile(p); }
}

// ---------------- character state (see character-spec.md; first matching rule wins) ----------------
function charState(s, now) {
  const alive = now - s.lastCallStart < s.ttlMin * 60e3; const left = s.lastCallStart + s.ttlMin * 60e3 - now;
  const busy = s.lastStop === 'tool_use' && now - s.lastTs < 3 * 60e3;
  if (now - s.lastAvoidableBreakTs < 3 * 60e3) return 'broke';
  if (s.pendingAsk && now - s.lastTs < 6 * 3600e3) return 'asking';
  if (busy) return 'working';
  s.fullFlag = s.ctx >= 400000 || (s.fullFlag && s.ctx >= 380000);
  if (alive && s.fullFlag) return 'full';
  if (alive && left < 12 * 60e3) return 'sleepy';
  if (!alive) return s.ctx < (s.sysTokens || CAL.sys) + CAL.regrowth ? 'asleep' : 'amnesia';
  return 'idle';
}

// ---------------- snapshot ----------------
function snapshot() {
  const now = Date.now();
  const list = [...sessions.values()].filter(s => s.calls > 0).sort((a, b) => b.lastTs - a.lastTs).map(s => {
    const p = price(s.model);
    const continueThreshold = (s.sysTokens || CAL.sys) + CAL.regrowth;
    const riskUsd = s.ctx * p.in * 2 / 1e6;
    // D-12. freshCost: 새 세션에서 바닥+다시읽기까지 다시 쓰는 비용. costDelta 양수면 새 세션이 싸다
    const freshCost = continueThreshold * p.in * 2 / 1e6;
    return {
    id: s.id, title: s.title || '(untitled)', cwd: s.cwd, entry: s.entry, model: s.model, effort: s.effort, skill: s.skill,
    firstTs: s.firstTs, lastTs: s.lastTs, lastCallStart: s.lastCallStart, lastCallEnd: s.lastCallEnd, lastStop: s.lastStop, lastTool: s.lastTool,
    ctx: s.ctx, ttlMin: s.ttlMin, calls: s.calls, subCalls: s.subCalls, out: s.out, think: s.think, cacheRead: s.cacheRead, cacheWrite: s.cacheWrite,
    cost: s.cost, prompts: s.prompts, compacts: s.compacts, asks: s.asks, breakCost: s.breakCost,
    riskUsd, freshCost, costDelta: riskUsd - freshCost,
    tok: s.tok, mainModel: Object.entries(s.modelCalls).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || s.model,
    modelCompare: modelCompare(s),
    comp: s.comp, toolTop: s.toolTop, compScale: s.compScale, advice: s.advice || null, switch: s.switch || null, sysTokens: s.sysTokens, sysSource: s.sysSource, cfgKey: s.cfgKey, projKey: s.projKey, byCause: s.byCause,
    continueThreshold,
    saved: s.saved, commits: s.commits, lateCalls: s.lateCalls, nightCalls: s.nightCalls, streak: s.streak, bestStreak: s.bestStreak,
    charState: charState(s, now), // after TTL expiry: continuing beats a new session iff ctx < system floor + regrowth (price/horizon independent)
    busy: s.lastStop === 'tool_use' && now - s.lastTs < 3 * 60e3, subActive: now - s.subActive < 3 * 60e3,
  };});
  return { version, root: ROOT, now, calibration: CAL, sessions: list };
}
function detail(id) {
  const s = sessions.get(id); if (!s) return null;
  const pts = s.series; const step = Math.max(1, Math.ceil(pts.length / 600));
  const series = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  return { id, series, breaks: s.breaks.slice(-40) };
}

// ---------------- server ----------------
const clients = new Set();
function broadcast() { const data = 'data: ' + JSON.stringify(snapshot()) + '\n\n'; for (const res of clients) res.write(data); }
let debounce = null;
function onChange() { clearTimeout(debounce); debounce = setTimeout(() => { scan(ROOT); calibrate(); recomputeAdvice(); broadcast(); }, 150); }
// advice depends on calibration, which depends on all sessions: recompute after every scan
function recomputeAdvice() {
  for (const [fp, f] of files) {
    if (f.isSub || !f.prev || !f.sessionId) continue; const s = sessions.get(f.sessionId); if (!s || !s.calls) continue;
    // D-6. 보정이 스캔마다 달라지므로 cold-self가 아닌 세션은 매번 사다리를 다시 탄다
    const r = resolveSys(s, s.ctx); s.sysTokens = r.sys; s.sysSource = r.source;
    if (r.source !== 'cold-self') { const sc = scaledComp(f, s.ctx, s.sysTokens); s.comp = sc.comp; s.toolTop = sc.tools; s.compScale = sc.scale; }
    s.advice = compactAdvice(f, s, s.ctx, s.compScale); s.switch = escalationAdvice(s,s.ctx);
  }
}

const HTML_PATH = path.join(__dirname, 'index.html');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(HTML_PATH, 'utf8')); }
  if (url.pathname.startsWith('/img/')) {
    const name = path.basename(url.pathname); const fp = path.join(__dirname, 'img', name);
    const fb = path.join(__dirname, 'img', 'idle.png'); const file = fs.existsSync(fp) ? fp : fs.existsSync(fb) ? fb : null;
    if (!file) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' }); return res.end(fs.readFileSync(file));
  }
  if (url.pathname === '/api/state') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(snapshot())); }
  if (url.pathname === '/api/detail') { const d = detail(url.searchParams.get('id')); res.writeHead(d ? 200 : 404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(d || { error: 'no such session' })); }
  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: ' + JSON.stringify(snapshot()) + '\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  res.writeHead(404); res.end();
});

function reset() {
  files.clear(); sessions.clear(); version = 0;
  CAL.sys = DEFAULTS.sys; CAL.summary = DEFAULTS.summary; CAL.regrowth = DEFAULTS.regrowth;
  CAL.n = { sys: 0, summary: 0, regrowth: 0, rewrite: 0, extra: 0, postCtx: 0, warmSys: 0 };
  CAL.byKey = new Map(); CAL.byProj = new Map();
  CAL.folder = { cold: [], warm: [], summary: [], regrowth: [], rewrite: [], extra: [], postCtx: [] };
  CAL.cfgKeys = 0; CAL.noCfgKey = 0;
  CAL.rewrite = null; CAL.extra = null; CAL.postCtx = null; CAL.warmSys = null;
}
// target: 디렉터리 · 파일 · 그 배열. 항상 reset부터 한다.
function replay(target) {
  reset();
  for (const t of [].concat(target)) {
    const st = fs.statSync(t);
    if (st.isDirectory()) scan(t); else readFile(t);
  }
  calibrate(); recomputeAdvice();
  return { snapshot: snapshot(), sessions, files };
}

if (require.main === module) {
  console.log('[cc-monitor] scanning', ROOT);
  scan(ROOT); calibrate(); recomputeAdvice();
  console.log('[cc-monitor] sessions:', sessions.size, 'files:', files.size);
  console.log('[cc-monitor] calibration (folder medians): sys=' + CAL.sys + ' (n=' + CAL.n.sys + ') summary=' + CAL.summary + ' (n=' + CAL.n.summary + ') regrowth=' + CAL.regrowth + ' (n=' + CAL.n.regrowth + ')');
  console.log(`[cc-monitor] sys ladder: keys=${CAL.cfgKeys} noKey=${CAL.noCfgKey} coldFolder=${CAL.folder.cold.length} warmFolder=${CAL.folder.warm.length}`);
  for (const [key, b] of CAL.byKey) {
    const cm = median(b.cold.map(e => e.v)), wm = median(b.warm.map(e => e.v));
    console.log(`[cc-monitor]   key=${key.slice(0, 40)} cold n=${b.cold.length} med=${cm != null ? cm : '-'} warm n=${b.warm.length} med=${wm != null ? wm : '-'}`);
  }
  try { fs.watch(ROOT, { recursive: true }, onChange); console.log('[cc-monitor] watching (recursive)'); }
  catch (e) { console.log('[cc-monitor] recursive watch unavailable, polling every 2s'); setInterval(onChange, 2000); }
  setInterval(() => { if (clients.size) broadcast(); }, 15000); // keep busy/idle flags fresh
  server.listen(PORT, () => console.log('[cc-monitor] http://localhost:' + PORT));
}
module.exports = { reset, replay, snapshot, detail, sessions, files, price };
