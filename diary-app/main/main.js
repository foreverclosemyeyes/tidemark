// 업무다이어리 — 메인 프로세스
// 창/트레이/자동 실행/알림/노션 동기화/정시 비서/자정 날짜 넘김을 담당
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, Notification, shell, dialog, globalShortcut,
  nativeImage, protocol, net, session, powerMonitor, clipboard,
} = require('electron');

const { JsonStore } = require('./store');
const { Secrets } = require('./secrets');
const notion = require('./notion');
const assistant = require('./assistant');
const statsAuto = require('./stats');
const weekly = require('./weekly');
const QT = require('./questTodos');
const docsLib = require('./docs');
const packLib = require('./pack');
const updater = require('./updater');
const { NotionMcp, RELOGIN, parseMarkdown, parseFlat, reorderEdit, cleanText, escapeText, lastLine, markOf, locateMark } = require('./notionMcp');

// ---------- 오류 기록 (문제가 생기면 원인을 알 수 있게) ----------
let logFile = null;
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (a && a.stack) || (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  try { if (logFile) fs.appendFileSync(logFile, line); } catch { /* 기록 실패는 무시 */ }
}
const origError = console.error.bind(console);
console.error = (...a) => { origError(...a); log('ERROR', ...a); };
// 메인 프로세스 오류로 앱 전체가 꺼지지 않도록
process.on('uncaughtException', (e) => { log('uncaughtException', e); });
process.on('unhandledRejection', (e) => { log('unhandledRejection', e); });

const SYNC_MS = 2 * 60 * 1000;
// 노션 대상(업무 DB·내 사용자 id)은 설정 > 연결에서 넣음. 비어 있으면 노션 없이 이 컴퓨터에만 저장하는 모드로 동작
const DEFAULT_CFG = { databaseId: '', dataSourceId: '', userId: '' };
// 예전 판에는 아래 값이 기본값으로 박혀 있었음. 그때부터 쓰던 설치본이 끊기지 않게 한 번만 설정으로 옮겨 저장함.
// (새로 설치한 사람에게는 적용되지 않음. 옮긴 뒤에는 이 상수를 지워도 됨)
const LEGACY_CFG = { databaseId: 'ca74544b319f4aef888b8302b527232f', dataSourceId: '77d1be1a-43f1-4944-9e21-79f2de3301f0', userId: '387d872b-594c-813c-9970-0002e617b3d5' };

protocol.registerSchemesAsPrivileged([
  { scheme: 'diary-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (process.env.DIARY_USER_DATA) app.setPath('userData', process.env.DIARY_USER_DATA);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let win = null;
let tray = null;
let quitting = false;
let store, cache, secrets, assetsDir;

// ---------- 날짜 도우미 ----------
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());

// ---------- 상태 ----------
const state = {
  today: todayISO(),
  viewMonth: todayISO().slice(0, 7), // 렌더러가 보고 있는 달
  selected: todayISO(),
  quests: [],
  events: [],
  weeks: [], // [{id,url,name,start,end,lastEdited,days}]
  lastSync: null,
  syncing: false,
  error: null,
  needsSetup: false,
  local: false, // 노션 없이 이 컴퓨터에만 저장하는 모드
};

function snapshot() {
  const days = {};
  for (const w of state.weeks) {
    for (const [date, items] of Object.entries(w.days || {})) {
      days[date] = { items, pageId: w.id, url: w.url, pageName: w.name };
    }
  }
  return {
    today: state.today,
    quests: (() => { const hid = new Set((store.get('settings', {}).hiddenQuests) || []); return state.quests.filter((q) => !hid.has(String(q.id).replace(/-/g, ''))); })(),
    // 업무별 체크리스트: 노션 업무는 그 페이지 안의 체크박스, 내 업무(노션 없이)는 이 컴퓨터에 저장한 것
    questTodos: { ...store.get('questTodos', {}), ...Object.fromEntries([...questLists].map(([k, l]) => [k, l.items || []])) },
    questState: Object.fromEntries([...questLists].map(([k, l]) => [k, { notion: true, loading: !!l.loading, error: l.error || null }])),
    events: state.events,
    weeks: state.weeks.map(({ days: _d, meta: _m, adders: _a, ...rest }) => rest),
    days,
    lastSync: state.lastSync,
    syncing: state.syncing,
    error: state.error,
    relogin: !!state.relogin, // 노션 로그인이 풀림 → 화면에서 바로 다시 로그인할 수 있게
    needsSetup: state.needsSetup,
    local: state.local,
  };
}

function push(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
const pushData = () => push('data', snapshot());

// ---------- 노션 동기화 ----------
function cfg() {
  return { ...DEFAULT_CFG, ...store.get('notionCfg', {}) };
}

// ---------- 노션 없이 쓰기 ----------
// 노션이 연결돼 있지 않거나 노션 대상이 정해지지 않았으면, 체크리스트와 진행 중 업무를 이 컴퓨터에만 저장한다.
const LOCAL_WEEK = 'local';
const newId = () => 'l' + crypto.randomBytes(6).toString('hex');
function notionReady() {
  const c = cfg();
  // 로그인이 풀린 상태(needsLogin)도 노션 쪽으로 침: 조용히 '노션 없이 쓰기'로 넘어가지 않고, 받아 둔 내용을 보여 주며 다시 로그인을 안내
  return !!(c.dataSourceId && c.userId) && (secrets.has('notion') || !!(mcp && (mcp.loggedIn() || mcp.needsLogin())));
}
const notConnected = () => (mcp && mcp.needsLogin() ? RELOGIN : '노션이 연결되지 않았어요.');
function loadLocal() {
  questLists.clear();
  Object.assign(state, {
    local: true, needsSetup: false, error: null, syncing: false, events: [],
    weeks: [{ id: LOCAL_WEEK, url: '', name: '내 체크리스트', start: '0000-01-01', end: '9999-12-31', days: store.get('localDays', {}) }],
    quests: store.get('localQuests', []),
    lastSync: new Date().toISOString(),
  });
}
function saveLocal() {
  if (!state.local) return;
  const w = state.weeks.find((x) => x.id === LOCAL_WEEK);
  if (w) store.set('localDays', w.days);
  store.set('localQuests', state.quests);
}
// 노션에 쓰지 않고 앱 안에서만 바꾸는 경우 (노션 없이 쓰기 + 화면 확인용 데모)
const offline = () => state.local || !!process.env.DIARY_DEMO;

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return [isoOf(first), isoOf(last)];
}

let syncPromise = null, syncAgain = false;
let lastSyncAt = 0;
// 동기화가 도는 중에 '지금 다시'(force)가 들어오면 버리지 않고 끝난 뒤 한 번 더 돈다.
// (돌고 있던 동기화는 방금 쓴 내용보다 먼저 읽어 간 것일 수 있어서, 그 결과로 화면이 되돌아가지 않게)
function sync(force = false) {
  if (syncPromise) { if (force) syncAgain = true; return syncPromise; }
  syncPromise = (async () => {
    do { syncAgain = false; await doSync(force); force = true; } while (syncAgain);
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

async function doSync(force) {
  if (process.env.DIARY_DEMO) { // 화면 확인용 가짜 데이터
    Object.assign(state, require('../test/demo-data.js')(state.today), { lastSync: new Date().toISOString(), error: null });
    lastSyncAt = Date.now();
    pushData();
    updateStats();
    return;
  }
  if (!notionReady()) { // 노션 없이 쓰기
    loadLocal();
    lastSyncAt = Date.now();
    pushData();
    updateStats();
    return;
  }
  state.local = false;
  const token = secrets.get('notion');
  if (!token) return syncViaMcp();
  state.needsSetup = false;
  state.syncing = true;
  pushData();
  lastSyncAt = Date.now();
  const client = new notion.NotionClient(token);
  const c = cfg();
  try {
    // 보고 있는 달 + 오늘이 있는 달을 모두 포함
    const months = new Set([state.viewMonth, state.today.slice(0, 7), ...extraMonths]);
    let start = '9999', end = '0000';
    for (const ym of months) {
      const [s, e] = monthRange(ym);
      if (s < start) start = s;
      if (e > end) end = e;
    }
    const [quests, pages, events] = await Promise.all([
      notion.fetchQuests(client, c),
      notion.fetchWeeklyPages(client, c, start, end),
      notion.fetchEvents(client, c, start, end, store.get('settings', {}).eventMode || 'all').catch((e) => { console.error('[events]', e); return state.events; }),
    ]);
    state.quests = quests;
    state.events = events;

    const prev = new Map(state.weeks.map((w) => [w.id, w]));
    const weeks = [];
    for (const p of pages) {
      const old = prev.get(p.id);
      const active = (p.start <= state.today && (p.end || p.start) >= state.today) ||
        (p.start <= state.selected && (p.end || p.start) >= state.selected);
      // 오늘/보고 있는 주는 매번 새로 읽고, 나머지는 노션에서 바뀌었을 때만 다시 읽음
      if (!force && !active && old && old.lastEdited === p.lastEdited && old.days) {
        weeks.push({ ...p, days: old.days, meta: old.meta });
        continue;
      }
      const tree = await client.getBlockTree(p.id);
      const meta = {};
      weeks.push({ ...p, days: notion.parseChecklist(tree, p.start, meta), meta });
    }
    state.weeks = weeks;
    applyPending();
    await refreshQuestLists();
    state.lastSync = new Date().toISOString();
    state.error = null; state.relogin = false;
    updateStats();
    cache.set('snapshot', { quests: state.quests, events: state.events, weeks: state.weeks, lastSync: state.lastSync });
  } catch (e) {
    state.error = e.friendly || e.message;
    console.error('[sync]', e);
  } finally {
    state.syncing = false;
    pushData();
  }
}

// ---------- 노션으로 로그인 (MCP) 경로 ----------
let mcp = null;
const extraMonths = new Set(); // 보고 있는 달이 아니어도 같이 불러올 달 (새로 만든 주 페이지가 든 달)
const mcpPages = new Map(); // pageId → { md, lastEdited, start }
let mcpAnchors = new Map();
const idOf = (url) => { const m = String(url || '').replace(/-/g, '').match(/([0-9a-f]{32})(?:[?#].*)?$/i); return m ? m[1] : url; };
const isoDay = (v) => (v ? String(v).slice(0, 10) : null);
const sqlStr = (v) => `'${String(v).replace(/'/g, "''")}'`;
function rowToPage(r) {
  return {
    id: idOf(r.url), url: r.url, name: cleanText(r.Name) || '(제목 없음)', status: r['상태'] || null,
    start: isoDay(r['date:기간:start']), end: isoDay(r['date:기간:end']) || isoDay(r['date:기간:start']),
    lastEdited: r['Last edited time'], tags: (() => { try { return JSON.parse(r.Tags || '[]'); } catch { return []; } })(),
  };
}

// 노션 로그인 쪽의 읽기(동기화)와 쓰기는 한 번에 하나씩 차례로 한다.
// 쓰기는 '이 글을 저 글로 바꿔라'(앞 줄들까지 포함한 글 덩어리) 방식이라, 겹치면 서로의 바꿀 글이 어긋난다.
let mcpQueue = Promise.resolve();
function mcpSerial(fn) {
  const job = mcpQueue.then(fn);
  mcpQueue = job.catch(() => {});
  return job;
}
// 쓰기 한 번: 줄을 선 뒤 pick() 으로 바꿀 글을 정하고, 쓰고 나면 그 페이지를 다시 풀어 목록·바꿀 글을 새로 맞춤
// 들고 있던 글이 노션의 실제 글과 달라져 있으면(노션에서 직접 고쳤거나 앞선 쓰기가 다르게 반영됨) 노션이 '그런 글 없음'으로 거절한다
// → 그 페이지를 새로 읽어 바꿀 글을 다시 정하고 한 번만 더 해 봄 (안 그러면 다음 맞추기 때까지 같은 실패가 되풀이됨)
function mcpWrite(pageId, pick) {
  const once = async () => {
    const r = pick();
    if (!r) return;
    const [old, neu] = r;
    await mcp.replaceText(pageId, old, neu);
    const cur = mcpPages.get(pageId);
    if (!cur) return;
    cur.md = cur.md.replace(old, () => neu);
    mcpReparse(pageId);
  };
  return mcpSerial(async () => {
    try { await once(); } catch (e) {
      const cur = mcpPages.get(pageId);
      if (!cur || !/No matches found/i.test(String(e && e.message))) throw e;
      console.error('[mcp write] stale text, refetching', pageId);
      cur.md = await mcp.fetchPage(pageId);
      mcpReparse(pageId);
      await once();
    }
  });
}
// 들고 있는 페이지 글을 다시 풀어서 그 주의 목록·바꿀 글을 새로 맞춤
function mcpReparse(pageId) {
  const cur = mcpPages.get(pageId);
  if (!cur) return;
  const parsed = cur.kind === 'quest' ? parseFlat(cur.md, pageId) : parseMarkdown(cur.md, pageId, cur.start);
  for (const [id, a] of [...mcpAnchors]) if (a.pageId === pageId) mcpAnchors.delete(id);
  parsed.anchors.forEach((v, k) => mcpAnchors.set(k, v));
  if (cur.kind === 'quest') { // 업무 페이지: 그 업무의 체크리스트
    questLists.set(pageId, { ...questLists.get(pageId), items: parsed.items, adder: parsed.adder, lastEdited: cur.lastEdited, live: true, error: null });
    applyPending(); saveQuestCache();
    return;
  }
  const w = state.weeks.find((x) => x.id === pageId);
  if (!w) return;
  w.days = parsed.days; w.adders = parsed.adders;
  applyPending();
}
// 체크가 가는 중인 항목의 번호가 밀렸으면(위 항목이 지워짐) 대기 목록도 새 번호로 옮김. 그 줄을 못 찾으면 대기에서 뺌
const pendingMarks = new Map(); // id → markOf() 로 기억해 둔 줄 (노션 로그인 쪽만)
function rekeyPending() {
  for (const [id, mark] of [...pendingMarks]) {
    let now = null;
    try { now = locateMark(mcpAnchors, mark).id; } catch { /* 이미 바뀌었거나 없어짐 */ }
    if (now === id) continue;
    const checked = pendingTodos.get(id);
    pendingTodos.delete(id); pendingMarks.delete(id);
    if (now && checked !== undefined) { mark.id = now; pendingTodos.set(now, checked); pendingMarks.set(now, mark); }
  }
}

const syncViaMcp = () => mcpSerial(readViaMcp);
async function readViaMcp() {
  if (!mcp.loggedIn()) { // 로그인이 풀림: 받아 둔 내용은 그대로 두고 안내만
    Object.assign(state, { needsSetup: false, syncing: false, error: RELOGIN, relogin: true });
    lastSyncAt = Date.now();
    pushData();
    return;
  }
  state.needsSetup = false;
  state.syncing = true;
  pushData();
  lastSyncAt = Date.now();
  const c = cfg();
  try {
    const months = new Set([state.viewMonth, state.today.slice(0, 7), ...extraMonths]);
    let start = '9999', end = '0000';
    for (const ym of months) { const [s0, e0] = monthRange(ym); if (s0 < start) start = s0; if (e0 > end) end = e0; }
    const me = sqlStr(`%${c.userId}%`);
    const cols = 'url, Name, "상태", Tags, "date:기간:start", "date:기간:end", "Last edited time"';
    const T = '{T}';
    const questRows = await mcp.sql(c.dataSourceId, `SELECT ${cols} FROM ${T} WHERE "담당자" LIKE ${me} AND "상태" IN ('진행중','시작 전')`);
    state.quests = questRows.map(rowToPage).filter((p) => !p.name.includes('운영성 업무'))
      .sort((a, b) => (a.end || '9999').localeCompare(b.end || '9999'));
    const weekRows = await mcp.sql(c.dataSourceId, `SELECT ${cols} FROM ${T} WHERE Name LIKE '%운영성 업무%' AND "담당자" LIKE ${me} AND "date:기간:start" <= ${sqlStr(end)} AND "date:기간:start" >= ${sqlStr(notion.shiftISO(start, -14))}`);
    const pages = weekRows.map(rowToPage).filter((p) => p.start && (p.end || p.start) >= start && p.start <= end).sort((a, b) => a.start.localeCompare(b.start));
    try {
      const evMode = store.get('settings', {}).eventMode || 'all';
      const evRows = await mcp.sql(c.dataSourceId, `SELECT ${cols} FROM ${T} WHERE "담당자" LIKE ${me} AND "date:기간:start" <= ${sqlStr(end)} AND "date:기간:start" >= ${sqlStr(notion.shiftISO(start, -90))}`);
      state.events = evRows.map(rowToPage)
        .filter((p) => p.start && (p.end || p.start) >= start && !p.name.includes('운영성 업무') && (evMode === 'all' || p.tags.some((t) => /meeting|seminar/i.test(t))))
        .map(({ id, url, name, status, start: s0, end: e0, tags }) => ({ id, url, name, status, start: s0, end: e0 || s0, tags }))
        .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
    } catch (e) { console.error('[mcp events]', e); }

    const weeks = [];
    const anchors = new Map();
    for (const p of pages) {
      const active = (p.start <= state.today && (p.end || p.start) >= state.today) || (p.start <= state.selected && (p.end || p.start) >= state.selected);
      let cached = mcpPages.get(p.id);
      if (!cached || active || cached.lastEdited !== p.lastEdited) {
        cached = { md: await mcp.fetchPage(p.id), lastEdited: p.lastEdited, start: p.start };
        mcpPages.set(p.id, cached);
      }
      const parsed = parseMarkdown(cached.md, p.id, p.start);
      parsed.anchors.forEach((v, k) => anchors.set(k, v));
      weeks.push({ ...p, days: parsed.days, adders: parsed.adders });
    }
    for (const [id, a] of mcpAnchors) if ((mcpPages.get(a.pageId) || {}).kind === 'quest') anchors.set(id, a); // 업무 페이지 것은 그대로
    mcpAnchors = anchors;
    state.weeks = weeks;
    applyPending();
    await refreshQuestLists();
    state.lastSync = new Date().toISOString();
    state.error = null; state.relogin = false;
    updateStats();
    cache.set('snapshot', { quests: state.quests, events: state.events, weeks: state.weeks, lastSync: state.lastSync });
  } catch (e) {
    state.error = e.friendly || e.message;
    state.relogin = !!e.relogin || mcp.needsLogin();
    console.error('[mcp sync]', e);
  } finally {
    state.syncing = false;
    pushData();
  }
}

// ---------- 비서 ----------
function persona() {
  const t = store.get('theme', null);
  const a = (t && t.assistant) || {};
  const st = store.get('settings', {});
  // 지침·Claude 채팅 주소·모델은 비서마다 따로. 그 비서에 정한 게 없으면 예전에 정해 둔 공통 값을 씀
  return {
    id: (t && t.castActive) || 'ren',
    name: a.name || '업무비서', tone: a.tone || '차분하고 간결한 존댓말',
    instructions: a.instructions != null ? a.instructions : st.assistantInstructions || '',
    claudeUrl: a.claudeUrl != null ? a.claudeUrl : st.claudeUrl || '',
    model: a.model || st.aiModel || 'opus',
    docs: docsLib.text(docsDir(), a.docs), // 이 비서에게 맡긴 참고 문서(인수인계 파일 등)의 내용
    memory: memoryOf((t && t.castActive) || 'ren').map((n) => `- ${n.text}`).join('\n'), // 사용자가 "앞으로는 이렇게 해 줘"라고 한 것들
  };
}
// 비서별로 기억해 둔 규칙. 대답 끝의 [기억: …] 줄에서 모음 (같은 문장은 한 번만, 비서당 40개까지)
function memoryOf(id) { return (store.get('asstMemory', {})[id]) || []; }
function remember(id, notes) {
  if (!notes || !notes.length) return;
  const all = store.get('asstMemory', {});
  const list = all[id] || [];
  for (const text of notes) if (!list.some((n) => n.text === text)) list.push({ text, at: new Date().toISOString() });
  all[id] = list.slice(-40);
  store.set('asstMemory', all);
  push('memory', all);
}
function docsDir() { return path.join(app.getPath('userData'), 'docs'); }

function currentContext() {
  const snap = snapshot();
  const day = snap.days[state.today];
  return assistant.buildContext({
    todayISO: state.today,
    now: new Date().toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', hour: 'numeric', minute: '2-digit' }),
    todayItems: day ? day.items : [],
    quests: snap.quests,
  });
}

// 대화 기록 (앱 안의 비서 대화. 정시 체크도 같은 대화에 이어서 쌓임)
function chatHistory() { return store.get('chat', []); }
// 지금 비서와 나눈 대화만 (비서마다 맡은 일이 달라서 서로의 대화가 섞이지 않게). 예전 기록(비서 표시 없음)은 모두에게 보임
function chatHistoryFor(id) { return chatHistory().filter((m) => !m.cast || m.cast === id); }
function addChat(...msgs) {
  const list = [...chatHistory(), ...msgs].slice(-200);
  store.set('chat', list);
  push('chat', list);
}

// auto: 매시간 자동 체크 (그 외에는 사용자가 '지금 확인해줘'를 누른 것)
async function runAssistant({ notify, auto = false }) {
  // 키가 없으면 무료 모드(정해진 문장)로 말함
  const ctx = currentContext();
  const who = persona(); // 묻는 순간의 비서 (대답을 기다리는 동안 비서를 바꿔도 이 비서의 대화로 남음)
  const st = store.get('settings', {});
  // Gmail 을 맡겨 뒀으면 할 일 리마인드 대신 메일함을 점검: 지난 점검 뒤(처음엔 최근 2시간)의 메일만
  const started = new Date().toISOString();
  const since = st.lastMailCheck && Date.now() - new Date(st.lastMailCheck) < 24 * 3600 * 1000 ? st.lastMailCheck : new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  if (!auto) push('assistant', { thinking: true }); // 자동 체크는 말할 게 있을 때만 나타남
  let msg;
  try {
    msg = await assistant.generate(secrets.get('anthropic'), who, ctx, chatHistoryFor(who.id), st.gmail ? { gmail: { server: st.gmailServer, since, alerts: store.get('mailAlerts', []) } } : {});
    if (st.gmail && msg.source === 'claude') setSettings({ lastMailCheck: started });
    remember(who.id, msg.notes);
    // 메일 점검에서 알린 내용을 적어 둠 → 다음 점검 때 같은 얘기를 반복하지 않게
    if (st.gmail && msg.source === 'claude' && !msg.nothing) store.set('mailAlerts', [...store.get('mailAlerts', []), { at: started, text: msg.text }].slice(-40));
  } catch (e) {
    console.error('[assistant]', e);
    if (auto) return null; // 자동 체크가 실패하면 조용히 넘어감 (다음 시간에 다시)
    msg = { ...assistant.fallbackMessage(ctx, who), note: assistant.friendlyError(e) };
  }
  if (auto && msg.source !== 'claude') return null; // Claude 없이 쓰는 경우: 정해진 문장으로 매시간 말 걸지 않음
  if (msg.nothing) {
    // 새로 말할 게 없음: 자동 체크면 아무것도 띄우지 않고, 직접 눌렀을 때만 한 줄로 알림
    if (auto) return null;
    msg = { text: st.gmail ? '지난 확인 뒤로 메일함에 따로 볼 건 없습니다.' : '지난번과 달라진 건 없습니다.', source: 'local', name: who.name };
  }
  msg.at = new Date().toISOString();
  store.set('lastAssistant', msg);
  push('assistant', msg);
  if (msg.source === 'claude') addChat({ role: 'user', text: assistant.CHECK_PROMPT, auto: true, at: msg.at, cast: who.id }, { role: 'assistant', text: msg.text, at: msg.at, name: msg.name, cast: who.id });
  if (notify && Notification.isSupported()) {
    const n = new Notification({ title: msg.name || who.name, body: msg.text, silent: false });
    n.on('click', showWindow);
    n.show();
  }
  return msg;
}

async function chatWithAssistant(text) {
  text = String(text || '').trim().slice(0, 4000);
  if (!text) return null;
  const at = new Date().toISOString();
  const who = persona();
  const history = chatHistoryFor(who.id);
  addChat({ role: 'user', text, at, cast: who.id });
  push('assistant', { thinking: true });
  let msg;
  try {
    const st = store.get('settings', {});
    msg = await assistant.chat(secrets.get('anthropic'), who, currentContext(), history, text, st.gmail ? { gmail: { server: st.gmailServer } } : {});
    remember(who.id, msg.notes);
  } catch (e) {
    console.error('[chat]', e);
    msg = { text: assistant.friendlyError(e), source: 'local', name: who.name, error: true };
  }
  msg.at = new Date().toISOString();
  addChat({ role: 'assistant', text: msg.text, at: msg.at, name: msg.name, cast: who.id, ...(msg.source === 'claude' && !msg.error ? {} : { local: true }) });
  store.set('lastAssistant', msg);
  push('assistant', msg);
  return msg;
}

// ---------- 능력치 자동 올리기 ----------
let statsBusy = Promise.resolve();
function updateStats() {
  statsBusy = statsBusy.then(async () => {
    if (store.get('settings', {}).autoStats === false) return;
    const doneItems = [];
    const loadedDates = new Set();
    const walk = (items, date) => (items || []).forEach((i) => {
      if (i.checked && i.text) doneItems.push({ id: i.id, text: i.text, date });
      walk(i.children, date);
    });
    if (!store.get('statsStart')) store.set('statsStart', state.today); // 이 날부터 끝낸 일만 점수
    const since = store.get('statsStart');
    for (const w of state.weeks) for (const [date, items] of Object.entries(w.days || {})) { if (date < since) continue; loadedDates.add(date); walk(items, date); }
    const stats = store.get('stats', {});
    const awards = store.get('statAwards', {});
    const changes = await statsAuto.award({ doneItems, awards, stats, apiKey: secrets.get('anthropic'), loadedDates });
    if (!changes.length) return;
    store.set('stats', stats);
    store.set('statAwards', awards);
    push('stats', { stats, changes: changes.slice(-5) });
  }).catch((e) => console.error('[stats]', e));
  return statsBusy;
}

// ---------- 체크박스 → 노션 ----------
const pendingTodos = new Map(); // blockId → checked (노션에 쓰는 중)
const questLists = new Map(); // 업무 key → { items, live(이번에 읽었나), lastEdited, loading, error, adder | add }
// 항목 하나를 id 로 찾음: 날짜 체크리스트(주간 페이지)와 업무 체크리스트(업무 페이지) 모두에서
function findItem(id) {
  const walk = (items, date) => {
    for (let k = 0; k < (items || []).length; k++) {
      if (items[k].id === id) return { item: items[k], list: items, index: k, date };
      const hit = walk(items[k].children, date);
      if (hit) return hit;
    }
    return null;
  };
  for (const w of state.weeks) for (const [date, items] of Object.entries(w.days || {})) { const hit = walk(items, date); if (hit) return hit; }
  for (const l of questLists.values()) { const hit = walk(l.items, null); if (hit) return hit; }
  return null;
}
function setLocalTodo(blockId, checked) {
  const f = findItem(blockId);
  if (f) f.item.checked = checked;
  return !!f;
}
function applyPending() { rekeyPending(); for (const [id, c] of pendingTodos) setLocalTodo(id, c); }

// ---------- 체크박스 지우기 ----------
async function deleteTodo(id) {
  if (QT.isId(id)) return questTodo((all) => QT.remove(all, id)) ? { ok: true } : gone;
  const removeLocal = () => { const f = findItem(id); if (f) f.list.splice(f.index, 1); };
  if (offline()) { removeLocal(); saveLocal(); pushData(); return { ok: true }; }
  try {
    const token = secrets.get('notion');
    if (token) await new notion.NotionClient(token).deleteBlock(id);
    else if (mcp && mcp.loggedIn()) {
      const mark = markOf(mcpAnchors, id);
      await mcpWrite(mark.pageId, () => { const a = locateMark(mcpAnchors, mark); return [a.delOld, a.delNew]; });
      pushData(); // 쓰고 나서 그 페이지를 다시 풀어 둔 상태
      return { ok: true };
    } else throw Object.assign(new Error('no notion'), { friendly: notConnected() });
    removeLocal(); pushData();
    sync(true);
    return { ok: true };
  } catch (e) {
    console.error('[delete todo]', e);
    return { ok: false, message: e.friendly || '노션에서 지우지 못했어요.' };
  }
}

// ---------- 체크리스트 글 고치기 ----------
async function editTodo(id, text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) return { ok: false, message: '내용을 적어 주세요.' };
  if (QT.isId(id)) return questTodo((all) => QT.edit(all, id, text)) ? { ok: true } : gone;
  const setLocal = () => { const f = findItem(id); if (f) f.item.text = text; return !!f; };
  if (offline()) { setLocal(); saveLocal(); pushData(); return { ok: true }; }
  try {
    const token = secrets.get('notion');
    if (token) await new notion.NotionClient(token).setTodoText(id, text);
    else if (mcp && mcp.loggedIn()) {
      const mark = markOf(mcpAnchors, id);
      await mcpWrite(mark.pageId, () => {
        const a = locateMark(mcpAnchors, mark);
        const m = lastLine(a.oldStr).match(/^(\s*- \[(?: |x|X)\]\s*)/);
        if (!m) throw Object.assign(new Error('bad line'), { friendly: '이 항목은 앱에서 고칠 수 없어요. 노션에서 고쳐 주세요.' });
        return [a.oldStr, a.oldStr.slice(0, a.oldStr.length - lastLine(a.oldStr).length) + m[1] + escapeText(text)];
      });
      pushData();
      return { ok: true };
    } else throw Object.assign(new Error('no notion'), { friendly: notConnected() });
    setLocal(); pushData();
    sync(true);
    return { ok: true };
  } catch (e) {
    console.error('[edit todo]', e);
    return { ok: false, message: e.friendly || '노션에서 고치지 못했어요.' };
  }
}

// ---------- 체크리스트 순서 바꾸기 ----------
// id 항목(하위 항목 포함)을 같은 목록의 refId 항목 앞/뒤로 옮김. 날짜 체크리스트든 업무 체크리스트든 같은 방식
async function reorderTodo(id, refId, after) {
  if (id === refId) return { ok: true };
  if (QT.isId(id)) return questTodo((all) => QT.move(all, id, refId, after)) ? { ok: true } : gone; // 이 컴퓨터에만 있는 업무 항목
  const a = findItem(id), b = findItem(refId);
  if (!a || !b) return gone;
  if (a.list !== b.list) return { ok: false, message: '같은 목록 안에서만 순서를 바꿀 수 있어요.' };
  const moveLocal = () => { a.list.splice(a.index, 1); const k = a.list.indexOf(b.item); a.list.splice(after ? k + 1 : k, 0, a.item); };
  if (offline()) { moveLocal(); saveLocal(); pushData(); return { ok: true }; }
  try {
    const token = secrets.get('notion');
    if (token) {
      for (const l of questLists.values()) l.live = false; // 업무 페이지의 항목이면 그 목록도 꼭 다시 읽게
      try { await moveBlockViaApi(new notion.NotionClient(token), a, b, after); } finally { await sync(true); } // 새로 만든 블록의 id 로 다시 읽음 (중간에 실패해도)
      return { ok: true };
    }
    if (!(mcp && mcp.loggedIn())) throw Object.assign(new Error('no notion'), { friendly: notConnected() });
    const ma = markOf(mcpAnchors, id), mb = markOf(mcpAnchors, refId);
    await mcpWrite(ma.pageId, () => {
      const edit = reorderEdit(mcpPages.get(ma.pageId).md, locateMark(mcpAnchors, ma).line, locateMark(mcpAnchors, mb).line, after);
      return edit ? [edit.old, edit.neu] : null;
    });
    pushData();
    return { ok: true };
  } catch (e) {
    console.error('[reorder todo]', e);
    return { ok: false, message: e.friendly || '노션에서 순서를 바꾸지 못했어요.' };
  }
}
// 노션 API 에는 블록을 옮기는 기능이 없다 → 같은 내용의 블록을 원하는 자리에 새로 만들고 원래 것을 지움.
// 하위 내용이 딸린 블록은 그 내용을 잃을 수 있어서 옮기지 않는다
async function moveBlockViaApi(client, a, b, after) {
  const read = async (id) => {
    const blk = await client.request('GET', `/blocks/${id}`);
    if (blk.has_children) throw Object.assign(new Error('has children'), { friendly: '하위 내용이 있는 항목은 노션에서 옮겨 주세요.' });
    return blk;
  };
  const cloneAfter = async (srcId, afterId) => {
    const blk = await read(srcId);
    const parentId = blk.parent[blk.parent.type];
    const res = await client.request('PATCH', `/blocks/${parentId}/children`, { after: afterId, children: [{ object: 'block', type: 'to_do', to_do: { rich_text: blk.to_do.rich_text, checked: blk.to_do.checked, color: blk.to_do.color } }] });
    await client.deleteBlock(srcId);
    return res.results[0].id;
  };
  if (after) return cloneAfter(a.item.id, b.item.id);
  const prev = b.list[b.index - 1];                       // 기준의 앞 = 그 앞 항목의 뒤
  if (prev && prev.id === a.item.id) return null;         // 이미 그 자리
  if (prev) return cloneAfter(a.item.id, prev.id);
  await read(b.item.id);                                  // 맨 앞으로는 기준도 새로 만들어야 하므로, 손대기 전에 옮길 수 있는지 먼저 확인
  const moved = await cloneAfter(a.item.id, b.item.id);   // 기준 뒤에 놓은 다음, 기준을 그 뒤로 보냄
  return cloneAfter(b.item.id, moved);
}

// ---------- 체크리스트를 다른 날짜로 넘기기 ----------
// 넘길 날짜에 먼저 적고(하위 항목 중 안 끝난 것도 같이), 다 적힌 뒤에 원래 것을 지움 → 중간에 실패해도 사라지지 않음
async function moveTodo(id, toDate) {
  if (QT.isId(id)) { // 업무 체크리스트의 항목을 그 날짜의 할 일로 보냄: 먼저 적고, 적힌 뒤에 뺌
    const f = QT.locate(store.get('questTodos', {}), id);
    if (!f) return gone;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return { ok: false, message: '넘길 날짜를 다시 골라 주세요.' };
    const r = await addTodo(toDate, f.item.text);
    if (!r.ok) return r;
    questTodo((all) => QT.remove(all, id));
    return { ok: true, count: 1, created: r.created };
  }
  const hit = findItem(id); // 날짜의 항목이든 업무 페이지의 항목이든
  const found = hit && hit.item, fromDate = hit && hit.date;
  if (!found) return { ok: false, message: '항목을 못 찾았어요. 새로고침 후 다시 해 주세요.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate) || toDate === fromDate) return { ok: false, message: '넘길 날짜를 다시 골라 주세요.' };
  const under = (x) => (x.children || []).filter((c) => !c.checked).flatMap((c) => [c.text, ...under(c)]); // 하위의 하위까지
  const texts = [found.text, ...under(found)];
  let created;
  for (const t of texts) {
    const r = await addTodo(toDate, t);
    if (!r.ok) return { ok: false, message: r.message };
    created = created || r.created; // 넘길 주의 페이지가 없어서 새로 만든 경우
  }
  const d = await deleteTodo(id);
  if (!d.ok) return { ok: false, message: `${toDate.slice(5).replace('-', '/')}에 적었지만 원래 항목은 못 지웠어요. 직접 지워 주세요.` };
  return { ok: true, count: texts.length, created };
}

// ---------- 주간 운영성 업무 페이지가 없으면 새로 만들기 ----------
// 이번 주~앞으로 4주 안의 평일인데 그 주 페이지가 아직 없을 때만. 같은 주를 동시에 두 번 만들지 않게 줄을 세움
const creatingWeeks = new Map(); // 월요일 날짜 → 진행 중인 작업
function ensureWeekPage(date) {
  if (!weekly.canCreate(date, state.today)) return Promise.resolve({ created: false });
  const week = weekly.weekOf(date);
  if (state.weeks.some((x) => x.start <= week.friday && (x.end || x.start) >= week.monday)) return Promise.resolve({ created: false });
  if (!creatingWeeks.has(week.monday)) {
    const job = (async () => {
      const token = secrets.get('notion');
      const r = token ? await weekly.createViaApi(new notion.NotionClient(token), cfg(), week)
        : mcp && mcp.loggedIn() ? await weekly.createViaMcp(mcp, cfg(), week)
          : { created: false };
      extraMonths.add(week.monday.slice(0, 7)); extraMonths.add(week.friday.slice(0, 7));
      await sync(true);
      return { ...r, name: week.name };
    })().finally(() => creatingWeeks.delete(week.monday));
    creatingWeeks.set(week.monday, job);
  }
  return creatingWeeks.get(week.monday);
}

// ---------- 진행 중 업무 추가 ----------
// 노션 연결 상태면 업무 DB 에 페이지를 만들고(상태 '진행중', 담당자 나, 마감일은 기간에), 아니면 이 컴퓨터에만 저장
async function addQuest(name, end) {
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  end = /^\d{4}-\d{2}-\d{2}$/.test(String(end || '')) ? String(end) : null;
  if (!name) return { ok: false, message: '업무 이름을 적어 주세요.' };
  if (offline()) {
    state.quests.push({ id: newId(), url: '', name, status: '진행중', start: end, end, tags: [], local: true });
    state.quests.sort((a, b) => (a.end || '9999').localeCompare(b.end || '9999'));
    saveLocal(); pushData();
    return { ok: true };
  }
  try {
    const token = secrets.get('notion');
    if (token) await notion.createTask(new notion.NotionClient(token), cfg(), { name, end });
    else {
      const c = cfg();
      // 내가 가장 최근에 만든 업무의 분류(Cell·우선순위)를 그대로 따름
      const like = await mcp.sql(c.dataSourceId, `SELECT Cell, "우선순위" FROM {T} WHERE "담당자" LIKE ${sqlStr(`%${c.userId}%`)} ORDER BY createdTime DESC LIMIT 1`).catch(() => []);
      const properties = { Name: name, 상태: '진행중', 담당자: [c.userId] };
      if (end) Object.assign(properties, { 'date:기간:start': end, 'date:기간:is_datetime': 0 });
      for (const k of ['Cell', '우선순위']) if (like[0] && like[0][k]) properties[k] = like[0][k];
      await mcp.call('notion-create-pages', { parent: { type: 'data_source_id', data_source_id: c.dataSourceId }, pages: [{ properties }], allow_async: false });
    }
    await sync(true);
    return { ok: true, notion: true };
  } catch (e) {
    console.error('[add quest]', e);
    return { ok: false, message: e.friendly || '노션에 업무를 추가하지 못했어요.' };
  }
}
function removeQuest(id) {
  if (!offline()) return { ok: false, message: '노션에 있는 업무는 노션에서 지워 주세요. (× 는 이 앱에서만 숨겨요)' };
  state.quests = state.quests.filter((q) => q.id !== id);
  questTodo((all) => { QT.drop(all, id); return true; });
  saveLocal(); pushData();
  return { ok: true };
}

// ---------- 업무별 체크리스트 ----------
// 노션 업무는 그 업무 페이지 안의 체크박스와 맞춰 쓴다 (읽기·추가·체크·고치기·지우기 모두 그 페이지에).
// 노션 없이 만든 내 업무는 이 컴퓨터에만 저장한다 (questTodo, id 가 'qt-' 로 시작).
function questTodo(change) {
  const all = store.get('questTodos', {});
  const out = change(all);
  if (out) { store.set('questTodos', all); pushData(); }
  return out;
}
const gone = { ok: false, message: '항목을 못 찾았어요.' };
const questOf = (key) => state.quests.find((q) => QT.keyOf(q.id) === key) || null;
const questIsNotion = (q) => !!(q && q.url) && !offline() && (secrets.has('notion') || !!(mcp && mcp.loggedIn()));
const saveQuestCache = () => cache.set('questItems', Object.fromEntries([...questLists].map(([k, l]) => [k, l.items || []])));

// 업무 페이지를 읽어 체크리스트를 채움. (노션 로그인 쪽은 mcpSerial 줄 안에서 불러야 함)
async function readQuest(key) {
  const q = questOf(key);
  if (!q) return;
  const token = secrets.get('notion');
  if (!token) {
    mcpPages.set(key, { md: await mcp.fetchPage(key), kind: 'quest', lastEdited: q.lastEdited });
    mcpReparse(key);
    return;
  }
  // API 키 쪽: 페이지 안의 체크박스 블록을 위에서부터 (상자·칼럼 안도). 새 항목은 마지막 체크박스 바로 뒤에 넣음
  const tree = await new notion.NotionClient(token).getBlockTree(q.id);
  const items = []; let add = { parentId: q.id };
  const walk = (blocks, parentId) => {
    for (const b of blocks || []) {
      if (b.type !== 'to_do') { walk(b.children, b.id); continue; }
      const item = notion.parseTodo(b);
      if (item) items.push(item);
      add = { parentId, afterId: b.id };
    }
  };
  walk(tree, q.id);
  questLists.set(key, { ...questLists.get(key), items, add, lastEdited: q.lastEdited, live: true, error: null });
  saveQuestCache();
}
// 업무 페이지에 체크박스 하나 추가 (readQuest 로 읽어 둔 뒤, 같은 줄 안에서)
async function writeQuestTodo(key, text, checked = false) {
  const l = questLists.get(key);
  const token = secrets.get('notion');
  if (token) {
    const client = new notion.NotionClient(token);
    const res = await client.addTodo(l.add.parentId, l.add.afterId, text);
    const made = res && res.results && res.results[0];
    if (checked && made) await client.setTodo(made.id, true);
    await readQuest(key);
    return;
  }
  const line = `- [${checked ? 'x' : ' '}] ${escapeText(text)}`;
  if (l.adder) { // 마지막 체크박스 바로 뒤에
    const neu = `${l.adder.old}\n${l.adder.indent}${line}`;
    await mcp.replaceText(key, l.adder.old, neu);
    const cur = mcpPages.get(key);
    cur.md = cur.md.replace(l.adder.old, () => neu);
    mcpReparse(key);
  } else { // 체크박스가 아직 없는 페이지: 맨 끝에 덧붙이고 다시 읽음
    await mcp.call('notion-update-page', { page_id: key, command: 'insert_content', content: line, position: { type: 'end' }, allow_async: false });
    await readQuest(key);
  }
}
// 읽고 쓰는 묶음을 차례에 맞춰 실행 (노션 로그인 쪽은 다른 읽기·쓰기와 한 줄로)
const questJob = (fn) => (secrets.get('notion') ? fn() : mcpSerial(fn));
const questLoads = new Map(); // 같은 업무를 동시에 두 번 읽지 않게
function loadQuest(key) {
  if (!questLoads.has(key)) {
    questLoads.set(key, questJob(async () => {
      await readQuest(key);
      // 예전에 이 컴퓨터에만 적어 둔 항목이 있으면 노션 페이지로 옮김 (옮긴 것부터 하나씩 지움)
      const all = store.get('questTodos', {});
      for (const it of [...(all[key] || [])]) {
        await writeQuestTodo(key, it.text, it.checked);
        QT.remove(all, it.id); store.set('questTodos', all);
      }
    }).finally(() => questLoads.delete(key)));
  }
  return questLoads.get(key);
}
// 업무를 눌러 체크리스트를 열 때: 노션 업무면 그 페이지를 읽어 옴
async function openQuest(questId) {
  const key = QT.keyOf(questId), q = questOf(key);
  if (!questIsNotion(q)) return { ok: true };
  questLists.set(key, { items: [], ...questLists.get(key), loading: true, error: null });
  pushData();
  try { await loadQuest(key); } catch (e) {
    console.error('[quest open]', e);
    questLists.set(key, { items: [], ...questLists.get(key), error: e.friendly || '노션에서 이 업무 페이지를 불러오지 못했어요.' });
  }
  const l = questLists.get(key); if (l) l.loading = false;
  pushData();
  return { ok: true };
}
// 동기화 때: 열어 본 업무 중 노션에서 바뀐 것만 다시 읽고, 끝난(목록에서 빠진) 업무는 정리
async function refreshQuestLists() {
  for (const [key, l] of [...questLists]) {
    const q = questOf(key);
    if (!q) { questLists.delete(key); mcpPages.delete(key); for (const [id, a] of [...mcpAnchors]) if (a.pageId === key) mcpAnchors.delete(id); continue; }
    if (l.live && l.lastEdited === q.lastEdited) continue;
    try { await readQuest(key); } catch (e) { console.error('[quest refresh]', e); }
  }
  saveQuestCache();
}
async function addQuestTodo(questId, text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) return { ok: false, message: '내용을 적어 주세요.' };
  const key = QT.keyOf(questId);
  if (!questIsNotion(questOf(key))) return questTodo((all) => QT.add(all, key, text)) ? { ok: true } : { ok: false, message: '내용을 적어 주세요.' };
  try {
    await questJob(async () => {
      if (!(questLists.get(key) || {}).live) await readQuest(key);
      await writeQuestTodo(key, text);
    });
    pushData();
    return { ok: true, notion: true };
  } catch (e) {
    console.error('[quest todo]', e);
    return { ok: false, message: e.friendly || '노션의 업무 페이지에 추가하지 못했어요.' };
  }
}

// ---------- 새 체크박스 추가 ----------
async function addTodo(date, text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) return { ok: false, message: '내용을 적어 주세요.' };
  const find = () => state.weeks.find((x) => x.days && (x.days[date] || (x.meta && x.meta[date]) || (x.adders && x.adders[date])));
  if (state.local) { // 노션 없이 쓰기: 어느 날짜에나 바로 적음
    const wk = state.weeks.find((x) => x.id === LOCAL_WEEK);
    (wk.days[date] = wk.days[date] || []).push({ id: newId(), text, checked: false, children: [] });
    saveLocal(); pushData();
    return { ok: true };
  }
  if (process.env.DIARY_DEMO) {
    let wk = state.weeks.find((x) => x.start <= date && (x.end || x.start) >= date), created;
    if (!wk && weekly.canCreate(date, state.today)) { // 데모: 노션 대신 화면 안에서만 새 주를 만듦
      const week = weekly.weekOf(date);
      wk = { id: 'demo-' + week.monday, url: '', name: week.name, status: '시작 전', start: week.monday, end: week.friday, days: {} };
      state.weeks.push(wk); created = week.name;
    }
    if (!wk) return { ok: false, message: '이 날짜의 운영성 업무 페이지가 없어요.' };
    (wk.days[date] = wk.days[date] || []).push({ id: newId(), text, checked: false, children: [] });
    pushData();
    return { ok: true, created };
  }
  let w = find(), created;
  try {
    if (!w) { const r = await ensureWeekPage(date); if (r.created) created = r.name; w = find(); }
  } catch (e) {
    console.error('[week page]', e);
    return { ok: false, message: e.friendly || '노션에 이 주의 운영성 업무 페이지를 만들지 못했어요.' };
  }
  if (!w) return { ok: false, message: created ? `노션에 "${created}" 페이지는 만들었는데 아직 불러오지 못했어요. 잠시 뒤 다시 적어 주세요.` : '이 날짜가 있는 운영성 업무 페이지를 못 찾았어요. 노션 페이지에 날짜 제목(예: 11/12 (목))이 있는지 확인해 주세요.' };
  try {
    const token = secrets.get('notion');
    if (token && w.meta && w.meta[date]) {
      await new notion.NotionClient(token).addTodo(w.meta[date].parentId, w.meta[date].afterId, text);
    } else if (!token && mcp && mcp.loggedIn() && w.adders && w.adders[date]) {
      const pageId = w.id;
      await mcpWrite(pageId, () => {
        const wk = state.weeks.find((x) => x.id === pageId); // 줄을 서 있는 동안 바뀌었을 수 있으니 지금 것으로
        const old = wk && wk.adders && wk.adders[date];
        if (!old) throw Object.assign(new Error('no section'), { friendly: '그 사이 내용이 바뀌었어요. 다시 해 주세요.' });
        const last = lastLine(old), md = escapeText(text);
        return [old, /^\s*- \[ \]\s*$/.test(last)
          ? old.slice(0, old.length - last.length) + last.replace(/- \[ \]\s*$/, () => `- [ ] ${md}`) // 비어 있는 체크박스 채우기
          : `${old}${/^\s*#/.test(last) ? '\n' : ''}\n- [ ] ${md}`];
      });
      pushData();
      return { ok: true, created };
    } else {
      return { ok: false, message: notConnected() };
    }
    await sync(true);
    return { ok: true, created };
  } catch (e) {
    console.error('[add todo]', e);
    return { ok: false, message: e.friendly || '노션에 추가하지 못했어요.' };
  }
}

async function toggleTodo(blockId, checked) {
  if (QT.isId(blockId)) return questTodo((all) => QT.toggle(all, blockId, checked)) ? { ok: true } : gone;
  setLocalTodo(blockId, checked);
  pendingTodos.set(blockId, checked);
  pushData();
  if (offline()) { pendingTodos.delete(blockId); saveLocal(); updateStats(); return { ok: true }; }
  let mark = null; // 노션 로그인 쪽: 누른 줄을 기억 (차례를 기다리는 동안 번호가 밀려도 그 줄을 따라감)
  const settle = () => { const id = mark ? mark.id : blockId; for (const k of [id, blockId]) { pendingTodos.delete(k); pendingMarks.delete(k); } return id; };
  try {
    const token = secrets.get('notion');
    if (!token && mcp && mcp.loggedIn()) {
      mark = markOf(mcpAnchors, blockId);
      pendingMarks.set(blockId, mark);
      await mcpWrite(mark.pageId, () => {
        const a = locateMark(mcpAnchors, mark);
        return /- \[x\]/i.test(lastLine(a.newStr)) === checked ? [a.oldStr, a.newStr] : null; // 이미 원하는 상태면 그대로
      });
      settle(); mcpReparse(mark.pageId); pushData(); // 대기를 걷어 낸 실제 내용으로
    } else if (!token) throw Object.assign(new Error('no key'), { friendly: notConnected() });
    else { await new notion.NotionClient(token).setTodo(blockId, checked); settle(); }
    updateStats();
    cache.set('snapshot', { quests: state.quests, events: state.events, weeks: state.weeks, lastSync: state.lastSync });
    return { ok: true };
  } catch (e) {
    console.error('[todo]', e);
    setLocalTodo(settle(), !checked); // 되돌리기
    if (mark) mcpReparse(mark.pageId);
    pushData();
    const msg = e.status === 403 || e.status === 404
      ? '노션에 체크하지 못했어요. 노션 통합 설정 > 기능에서 "콘텐츠 업데이트"를 켜 주세요.'
      : (e.friendly || '노션에 체크하지 못했어요.');
    return { ok: false, message: msg };
  }
}

// ---------- 시계 (자정 넘김 / 2분 새로고침 / 정시 체크) ----------
// 사람이 자리에 없는 동안은 뒤에서 노션과 맞추지 않는다: 잠듦 · 화면 잠김 · 30분 넘게 손을 안 댐이면 아무것도 안 하고,
// 5분 넘게 손을 안 댔으면 2분마다의 맞추기만 쉰다 (정시 알림은 자리에 있을 수 있으니 계속).
// 잠든 Mac 은 가끔 혼자 잠깐 깨는데, 그때 보낸 요청은 답이 오기 전에 다시 잠들어 끊기기 쉽다. 노션 로그인 갱신이 그렇게 끊기면
// 노션 쪽은 이미 새 토큰으로 바꿨는데 앱은 그 답을 못 받아서, 다음 갱신 때 '로그인이 풀림'이 된다 (문제 기록에서 확인한 순서).
const IDLE_SYNC_S = 5 * 60, IDLE_GONE_S = 30 * 60;
let asleep = false, locked = false;
function idleSeconds() { try { return powerMonitor.getSystemIdleTime(); } catch { return 0; } }

function tick() {
  const idle = idleSeconds();
  if (asleep || locked || idle >= IDLE_GONE_S) return; // 돌아오면(다음 15초 안에) 날짜 넘어감·맞추기를 이어서 함
  const now = new Date();
  const t = isoOf(now);
  if (t !== state.today) {
    const wasViewingToday = state.selected === state.today;
    state.today = t;
    if (wasViewingToday) state.selected = t;
    state.viewMonth = t.slice(0, 7);
    push('day-changed', { today: t });
    sync(true); // 월요일이면 여기서 새 주차 페이지를 다시 찾음
  } else if (idle < IDLE_SYNC_S && Date.now() - lastSyncAt >= SYNC_MS) {
    sync(false);
  }

  if (store.get('settings', {}).hourly) {
    const wd = now.getDay();
    const h = now.getHours();
    const key = `${t}-${h}`;
    if (wd >= 1 && wd <= 5 && h >= 9 && h <= 19 && now.getMinutes() < 3 && store.get('lastHourly') !== key) {
      store.set('lastHourly', key);
      sync(true).then(() => runAssistant({ notify: true, auto: true }));
    }
  }
}

// ---------- 창 / 트레이 ----------
function showWindow() {
  if (!win || win.isDestroyed()) createWindow(true);
  else { win.show(); win.focus(); }
  if (process.platform === 'darwin') app.dock && app.dock.show();
}

function createWindow(show) {
  const bounds = store.get('bounds', { width: 1180, height: 800 });
  const settings = store.get('settings', {});
  win = new BrowserWindow({
    ...bounds,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: '업무다이어리',
    backgroundColor: '#121212',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    alwaysOnTop: !!settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (show) win.show(); });
  const saveBounds = () => { if (!win.isMinimized() && !win.isMaximized()) store.set('bounds', win.getBounds()); };
  win.on('resize', saveBounds);
  win.on('resize', fitZoom);
  win.webContents.on('did-finish-load', fitZoom);
  win.on('move', saveBounds);
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
      if (process.platform === 'darwin' && app.dock) app.dock.hide();
      if (!store.get('closeHintShown')) {
        store.set('closeHintShown', true);
        new Notification({ title: '업무다이어리', body: '창을 닫아도 메뉴 막대(트레이)에서 계속 실행돼요. 정시 알림도 그대로 와요.' }).show();
      }
    }
  });
  // 화면이 죽으면 다시 그리기
  win.webContents.on('render-process-gone', (_e, d) => {
    log('render-process-gone', d);
    if (d.reason !== 'clean-exit' && !quitting) setTimeout(() => { if (win && !win.isDestroyed()) win.reload(); }, 1000);
  });
  win.webContents.on('unresponsive', () => log('renderer unresponsive'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
}

function createTray() {
  const iconName = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  let img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', iconName));
  if (process.platform === 'darwin') img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('업무다이어리');
  const menu = () => Menu.buildFromTemplate([
    { label: '다이어리 열기', click: showWindow },
    { label: '지금 확인해줘', click: () => runAssistant({ notify: true }) },
    { label: '노션 새로고침', click: () => sync(true) },
    ...(persona().claudeUrl ? [{ label: `Claude 채팅 열기 (${persona().name})`, click: () => shell.openExternal(persona().claudeUrl) }] : []),
    { type: 'separator' },
    {
      label: '매시간 체크', type: 'checkbox', checked: !!store.get('settings', {}).hourly,
      click: (item) => { setSettings({ hourly: item.checked }); },
    },
    { type: 'separator' },
    { label: '완전히 종료', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => { if (process.platform !== 'darwin') showWindow(); });
  tray.refreshMenu = () => tray.setContextMenu(menu());
}

// 앱 아이콘을 내 그림으로: 스킨 그림 중 'app-icon' 이 있으면 실행 중 독(Dock)/작업 표시줄 아이콘으로 씀
let appIconUrl = null;
function applyAppIcon() {
  try {
    const t = store.get('theme', null);
    const url = t && t.layout && t.layout.skin && t.layout.skin['app-icon'];
    if (url === appIconUrl) return;
    appIconUrl = url || null;
    const file = url ? path.join(assetsDir, path.basename(String(url))) : path.join(__dirname, '..', 'build', 'icon.png');
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) return;
    if (process.platform === 'darwin') { if (app.dock) app.dock.setIcon(img); }
    else if (win && !win.isDestroyed()) win.setIcon(img);
  } catch (e) { console.error('[app icon]', e); }
}

// 작은 창: 큰 창(1360x820 기준) 화면을 그대로 축소해서 보여 줌 → 캐릭터·말풍선·달력·노트가 같은 비율로 같이 작아짐
const ZOOM_BASE = { w: 1360, h: 820 };
function fitZoom() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  const on = store.get('settings', {}).autoZoom !== false;
  const f = on ? Math.max(0.5, Math.min(1, w / ZOOM_BASE.w, h / ZOOM_BASE.h)) : 1;
  if (Math.abs(win.webContents.getZoomFactor() - f) > 0.004) win.webContents.setZoomFactor(f);
  // 설정 창은 줄이지 않음 (글씨가 작아지면 안 읽힘): 줄인 만큼 되키우는 배율을 화면에 알려 줌
  win.webContents.executeJavaScript(`document.documentElement.style.setProperty('--unzoom', '${(1 / f).toFixed(4)}')`).catch(() => {});
}

function setSettings(partial) {
  const s = { ...store.get('settings', {}), ...partial };
  store.set('settings', s);
  if ('autoLaunch' in partial) applyAutoLaunch(!!partial.autoLaunch);
  if ('alwaysOnTop' in partial && win) win.setAlwaysOnTop(!!partial.alwaysOnTop);
  if ('eventMode' in partial) sync(true);
  if ('bossKey' in partial) applyBossKey(partial.bossKey);
  if ('autoZoom' in partial) fitZoom();
  if ('hiddenQuests' in partial) pushData(); // 숨긴 업무는 보낼 때 걸러지므로, 되돌리면 다시 보내야 보임
  if (tray && tray.refreshMenu) tray.refreshMenu();
  push('settings', s);
  return s;
}

// 회사용 숨기기 단축키: 어디서든 누르면 창을 숨기고, 다시 누르면 보여 줌
let bossKey = null;
function applyBossKey(key) {
  try { if (bossKey) globalShortcut.unregister(bossKey); } catch { /* 없음 */ }
  bossKey = null;
  if (!key) return;
  try {
    const ok = globalShortcut.register(key, () => {
      if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) {
        win.hide();
        if (process.platform === 'darwin' && app.dock) app.dock.hide();
      } else showWindow();
    });
    if (ok) bossKey = key; else log('bossKey register failed', key);
  } catch (e) { log('bossKey', e); }
}

function applyAutoLaunch(on) {
  if (!app.isPackaged) return; // 개발 중에는 등록하지 않음
  try {
    if (process.platform === 'darwin') app.setLoginItemSettings({ openAtLogin: on });
    else app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
  } catch (e) { log('autoLaunch', e); }
}

// ---------- 파일(글씨체/그림/동영상) ----------
const KIND_FILTERS = {
  image: [{ name: '그림', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  video: [{ name: '동영상', extensions: ['mp4', 'webm'] }],
  media: [{ name: '그림/동영상', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'] }],
};

function saveAsset(buffer, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16);
  const id = hash + ext;
  const file = path.join(assetsDir, id);
  if (!fs.existsSync(file)) fs.writeFileSync(file, buffer);
  return { id, name: originalName, url: `diary-asset://local/${id}` };
}

function registerIpc() {
  ipcMain.handle('init', async () => { await claudeReady.catch(() => null); return ({
    platform: process.platform,
    settings: store.get('settings', {}),
    notionCfg: cfg(),
    notionLogin: !!(mcp && mcp.loggedIn()),
    hasKeys: { notion: secrets.has('notion') || !!process.env.DIARY_DEMO || !!(mcp && mcp.loggedIn()), anthropic: secrets.has('anthropic') || !!claudeCli, github: secrets.has('github') },
    version: app.getVersion(),
    update: updateState,
    theme: store.get('theme', null),
    memory: store.get('asstMemory', {}),
    stats: store.get('stats', {}),
    lastAssistant: store.get('lastAssistant', null),
    chat: store.get('chat', []),
    data: snapshot(),
    isPackaged: app.isPackaged,
  }); });
  ipcMain.handle('settings:set', (_e, partial) => setSettings(partial));
  ipcMain.handle('notionCfg:set', (_e, partial) => {
    store.set('notionCfg', { ...store.get('notionCfg', {}), ...partial });
    state.weeks = [];
    sync(true);
    return cfg();
  });
  ipcMain.handle('secret:set', (_e, name, value) => {
    if (!['notion', 'anthropic', 'github'].includes(name)) return false;
    secrets.set(name, (value || '').trim());
    if (name === 'notion') sync(true);
    if (name === 'github') setTimeout(checkUpdate, 500);
    return { notion: secrets.has('notion') || !!(mcp && mcp.loggedIn()), anthropic: secrets.has('anthropic') || !!claudeCli, github: secrets.has('github') };
  });
  ipcMain.handle('notion:test', async () => {
    const token = secrets.get('notion');
    if (!token && mcp && mcp.loggedIn()) {
      try { await mcp.connect(); const r = await mcp.sql(cfg().dataSourceId, 'SELECT Name FROM {T} LIMIT 1'); return { ok: true, message: `연결 성공! (노션 로그인 · 업무 DB 읽기 확인${r.length ? '' : ' — 비어 있음'})` }; }
      catch (e) { return { ok: false, message: e.friendly || e.message }; }
    }
    if (!token) return { ok: false, message: '먼저 "노션으로 로그인"을 누르거나 노션 키를 저장해 주세요.' };
    const client = new notion.NotionClient(token);
    try {
      const me = await client.me();
      await client.request('GET', `/data_sources/${cfg().dataSourceId}`);
      return { ok: true, message: `연결 성공! (통합 이름: ${me.name || me.bot?.workspace_name || '확인됨'})` };
    } catch (e) {
      return { ok: false, message: e.friendly || e.message };
    }
  });
  ipcMain.handle('sync', (_e, force) => sync(!!force).then(snapshot));
  ipcMain.handle('view', (_e, { month, selected }) => {
    const before = state.viewMonth;
    if (month) state.viewMonth = month;
    if (selected) state.selected = selected;
    if (month && month !== before) sync(false);
    return true;
  });
  ipcMain.handle('update:check', () => checkUpdate());
  ipcMain.handle('claude:detect', async () => ({ path: await detectClaude() }));
  ipcMain.handle('notion:login', async () => {
    try { await mcp.login(); sync(true); return { ok: true, loggedIn: true }; }
    catch (e) { log('notion login', e); return { ok: false, message: e.friendly || '노션 로그인에 실패했어요. 다시 해 주세요.' }; }
  });
  ipcMain.handle('notion:logout', () => { mcp.logout(); mcpPages.clear(); mcpAnchors = new Map(); questLists.clear(); state.weeks = []; state.quests = []; state.events = []; sync(true); return { loggedIn: false }; });
  ipcMain.handle('update:install', () => installUpdate());
  ipcMain.handle('log:show', () => { if (logFile) shell.showItemInFolder(logFile); return !!logFile; });
  ipcMain.handle('assistant:ask', () => runAssistant({ notify: false }));
  ipcMain.handle('assistant:chat', (_e, text) => chatWithAssistant(text));
  // Gmail 연결 확인: 되면 찾은 커넥터 이름을 기억해 둠
  ipcMain.handle('gmail:check', async () => {
    const r = await assistant.checkGmail(persona(), store.get('settings', {}).gmailServer);
    if (r.ok) setSettings({ gmailServer: r.server });
    return r;
  });
  // 비서 참고 문서: 글 파일을 골라 앱 안에 복사 / 빼기
  ipcMain.handle('docs:pick', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: '글 파일', extensions: docsLib.EXTENSIONS }] });
    if (r.canceled) return [];
    return r.filePaths.map((f) => { try { return docsLib.save(docsDir(), f); } catch (e) { return { error: String(e.message || e) }; } });
  });
  ipcMain.handle('docs:remove', (_e, id) => { docsLib.remove(docsDir(), String(id)); return true; });
  ipcMain.handle('memory:forget', (_e, id, text) => {
    const all = store.get('asstMemory', {});
    all[String(id)] = (all[String(id)] || []).filter((n) => n.text !== text);
    store.set('asstMemory', all);
    return all;
  });
  // 꾸밈 묶음: 스킨·캐릭터 그림·색을 파일 하나로 내보내기 / 가져오기
  ipcMain.handle('pack:export', async (_e, theme) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: '업무다이어리 꾸밈.diarypack', filters: [{ name: '업무다이어리 꾸밈', extensions: ['diarypack'] }] });
    if (r.canceled || !r.filePath) return { ok: false };
    const p = packLib.build(theme, (id) => { const f = path.join(assetsDir, path.basename(id)); return fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : null; });
    fs.writeFileSync(r.filePath, JSON.stringify(p));
    return { ok: true, images: Object.keys(p.assets).length };
  });
  ipcMain.handle('pack:import', async (_e, current) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: '업무다이어리 꾸밈', extensions: ['diarypack'] }] });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    try {
      const theme = packLib.apply(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')), current, (id, data) => saveAsset(Buffer.from(data, 'base64'), id).url);
      return { ok: true, theme };
    } catch (e) { return { ok: false, message: String(e.message || '꾸밈 파일을 읽지 못했어요.') }; }
  });
  ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text || '')); return true; });
  ipcMain.handle('chat:clear', () => { store.set('chat', []); push('chat', []); return []; });
  ipcMain.handle('quest:add', (_e, name, end) => addQuest(name, end));
  ipcMain.handle('quest:remove', (_e, id) => removeQuest(String(id)));
  ipcMain.handle('quest:todo:add', (_e, questId, text) => addQuestTodo(String(questId), String(text)));
  ipcMain.handle('quest:open', (_e, questId) => openQuest(String(questId)));
  ipcMain.handle('todo:delete', (_e, id) => deleteTodo(String(id)));
  ipcMain.handle('todo:add', (_e, date, text) => addTodo(String(date), String(text)));
  ipcMain.handle('todo:move', (_e, id, date) => moveTodo(String(id), String(date)));
  ipcMain.handle('todo:reorder', (_e, id, refId, after) => reorderTodo(String(id), String(refId), !!after));
  ipcMain.handle('todo:edit', (_e, id, text) => editTodo(String(id), String(text)));
  ipcMain.handle('todo:toggle', (_e, id, checked) => toggleTodo(String(id), !!checked));
  ipcMain.handle('theme:save', (_e, theme) => { store.set('theme', theme); applyAppIcon(); return true; });
  ipcMain.handle('stats:save', (_e, stats) => { store.set('stats', stats); return true; });
  ipcMain.handle('stats:reset', () => { store.set('stats', {}); store.set('statAwards', {}); store.set('statsStart', state.today); return {}; });
  ipcMain.handle('open', (_e, url) => {
    url = String(url || '');
    // 노션 페이지 주소는 어디서나 열리는 www.notion.so/<id> 로 통일 (app.notion.com/<id> 는 '페이지 없음'이 뜸)
    if (/^https:\/\/([a-z0-9-]+\.)?notion\.(so|com|site)\//.test(url)) {
      const m = url.replace(/[?#].*$/, '').replace(/-/g, '').match(/([0-9a-f]{32})\/?$/i);
      if (m) url = `https://www.notion.so/${m[1]}`;
      return shell.openExternal(url);
    }
    if (/^https:\/\/(console\.anthropic\.com|platform\.claude\.com|claude\.ai|github\.com)\//.test(url)) shell.openExternal(url);
  });

  ipcMain.handle('asset:pick', async (_e, kind) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: KIND_FILTERS[kind] || KIND_FILTERS.media });
    if (r.canceled) return [];
    return r.filePaths.map((p) => ({ ...saveAsset(fs.readFileSync(p), path.basename(p)), kind }));
  });
  // 캐릭터 zip 하나로 표정 그림 6칸 채우기
  ipcMain.handle('cast:importZip', async () => {
    const { readZip, pickFaces, labelFromFile } = require('./zip');
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: '캐릭터 zip', extensions: ['zip'] }] });
    if (r.canceled) return [];
    const out = [];
    for (const file of r.filePaths) {
      try {
        const z = readZip(fs.readFileSync(file));
        if (z.entries.filter((e) => /\.png$/i.test(e.name)).every((e) => /(^|\/)cutin/i.test(e.name))) throw new Error('이 zip은 대화 컷인 그림이라 캐릭터 그림으로 쓸 수 없어요. 모드 그림(look-….png)을 써 주세요.');
        const picked = pickFaces(z.entries);
        const faces = {};
        for (const [mood, e] of Object.entries(picked)) { const a = saveAsset(z.read(e), path.basename(e.name)); faces[mood] = { url: a.url, name: a.name }; }
        out.push({ label: labelFromFile(path.basename(file)), faces, count: Object.keys(faces).length, royal: /royal/i.test(path.basename(file)) });
      } catch (err) { out.push({ label: path.basename(file), error: String(err.message || err) }); }
    }
    return out;
  });
  ipcMain.handle('asset:read', (_e, id) => {
    const file = path.join(assetsDir, path.basename(id));
    return fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : null;
  });
  ipcMain.handle('asset:write', (_e, name, b64) => saveAsset(Buffer.from(b64, 'base64'), name));
}

let claudeCli = null;
let claudeReady = Promise.resolve(null);
async function detectClaude() {
  if (process.env.DIARY_DEMO) return null;
  assistant.resetCli();
  claudeCli = await assistant.findClaudeCli().catch(() => null);
  return claudeCli;
}

// ---------- 업데이트 ----------
let updateState = { current: app.getVersion(), available: false };
async function checkUpdate() {
  if (!app.isPackaged) { updateState = { current: app.getVersion(), available: false, note: '개발용 실행' }; push('update', updateState); return updateState; }
  try {
    updateState = { ...(await updater.check({ app, token: secrets.get('github') })), checkedAt: new Date().toISOString() };
  } catch (e) {
    log('update check', e);
    updateState = { current: app.getVersion(), available: false, error: e.friendly || e.message };
  }
  push('update', updateState);
  return updateState;
}
async function installUpdate() {
  try {
    push('update', { ...updateState, installing: true, progress: 0 });
    const r = await updater.install({ app, token: secrets.get('github'), workDir: path.join(app.getPath('userData'), 'update'),
      onProgress: (p) => push('update', { ...updateState, installing: true, progress: p }) });
    if (r.quit) { store.saveNow(); cache.saveNow(); quitting = true; setTimeout(() => app.quit(), 300); }
    return { ok: true };
  } catch (e) {
    log('update install', e);
    updateState = { ...updateState, installing: false, error: e.friendly || e.message };
    push('update', updateState);
    return { ok: false, message: updateState.error };
  }
}

// ---------- 시작 ----------
app.on('second-instance', showWindow);
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch { /* 없음 */ } });
app.on('before-quit', () => { quitting = true; store && store.saveNow(); cache && cache.saveNow(); });
app.on('activate', showWindow);
app.on('window-all-closed', () => { /* 트레이에 남아 있음 */ });

app.whenReady().then(() => {
  try {
    fs.mkdirSync(app.getPath('logs'), { recursive: true });
    logFile = path.join(app.getPath('logs'), 'main.log');
    try { if (fs.statSync(logFile).size > 2e6) fs.renameSync(logFile, logFile + '.old'); } catch { /* 처음 */ }
  } catch { /* 기록 폴더 없음 */ }
  log('start', app.getVersion(), process.platform, process.arch, `electron ${process.versions.electron}`, require('os').release());
  app.on('child-process-gone', (_e, d) => log('child-process-gone', d));
  if (process.platform === 'win32') app.setAppUserModelId('com.workdiary.app');
  const ud = app.getPath('userData');
  store = new JsonStore(path.join(ud, 'diary-data.json'));
  cache = new JsonStore(path.join(ud, 'notion-cache.json'));
  if (!store.get('notionCfg', null) && ((cache.get('snapshot', null) || {}).weeks || []).some((w) => w && w.url)) store.set('notionCfg', LEGACY_CFG);
  secrets = new Secrets(path.join(ud, 'secrets.json'));
  secrets.onError = (name, e) => log('secret unreadable', name, String((e && e.message) || e));
  mcp = new NotionMcp({
    log,
    load: () => {
      try {
        const raw = secrets.get('notionMcp');
        if (raw) return JSON.parse(raw);
        // 저장은 돼 있는데 못 푼 경우(키체인 거부): 로그인돼 있던 것이면 '풀린 상태'로 봐서 다시 로그인을 안내.
        // 로그아웃했거나 로그인한 적이 없으면 그냥 없는 것 (노션 없이 쓰기를 가리지 않게)
        return secrets.unreadable.has('notionMcp') && store.get('notionSignedIn') ? { expired: true } : {};
      } catch { return {}; }
    },
    save: (o) => {
      const keep = o && Object.keys(o).length;
      secrets.set('notionMcp', keep ? JSON.stringify(o) : ''); // 남길 게 없으면 지움
      store.set('notionSignedIn', !!(o && o.tokens));          // 로그인 여부만 따로 적어 둠 (비밀 아님)
    },
    open: (url) => shell.openExternal(url),
  });
  if (store.get('notionSignedIn') === undefined && mcp.loggedIn()) store.set('notionSignedIn', true); // 이 표시가 생기기 전에 로그인한 경우
  // 개발 실행에서만: 가짜 노션을 붙여 쓰기 흐름(연달아 누르기 등)을 시험할 때 씀
  if (!app.isPackaged && process.env.DIARY_FAKE_MCP) mcp = require(process.env.DIARY_FAKE_MCP);
  assetsDir = path.join(ud, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  applyAppIcon();

  // 지난번 동기화 결과로 먼저 화면을 채움 (인터넷이 없어도 보임)
  for (const [k, items] of Object.entries(cache.get('questItems', {}))) questLists.set(k, { items });
  const snap = cache.get('snapshot');
  if (snap) { state.quests = snap.quests || []; state.events = snap.events || []; state.weeks = snap.weeks || []; state.lastSync = snap.lastSync; }

  protocol.handle('diary-asset', (req) => {
    const id = path.basename(decodeURIComponent(new URL(req.url).pathname));
    const file = path.join(assetsDir, id);
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers });
  });

  const allowed = ['notifications'];
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.includes(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => allowed.includes(perm));

  registerIpc();
  claudeReady = detectClaude();
  createTray();

  const settings = store.get('settings', null);
  if (!settings) setSettings({ autoLaunch: true, hourly: true, alwaysOnTop: false });
  else if (app.isPackaged) applyAutoLaunch(!!settings.autoLaunch);

  applyBossKey(store.get('settings', {}).bossKey ?? 'CommandOrControl+Shift+X');
  const startHidden = process.argv.includes('--hidden');
  createWindow(!startHidden);
  if (startHidden && process.platform === 'darwin' && app.dock) app.dock.hide();

  sync(true);
  setInterval(tick, 15 * 1000);
  setTimeout(checkUpdate, 8000);
  setInterval(checkUpdate, 6 * 60 * 60 * 1000);
  powerMonitor.on('suspend', () => { asleep = true; });
  powerMonitor.on('lock-screen', () => { locked = true; });
  powerMonitor.on('resume', () => { asleep = false; setTimeout(tick, 8000); }); // 깨어난 직후엔 인터넷이 아직 안 붙어 있을 수 있음
  powerMonitor.on('unlock-screen', () => { locked = false; setTimeout(tick, 8000); });
});
