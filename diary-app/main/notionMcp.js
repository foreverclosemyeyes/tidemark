// "노션으로 로그인": 관리자 권한 없이 Notion MCP(mcp.notion.com)에 OAuth 로 접속해서
// 업무 DB를 읽고 체크박스를 체크함. (Claude 가 노션에 연결할 때와 같은 방식)
'use strict';
const http = require('http');
const { URL } = require('url');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { auth } = require('@modelcontextprotocol/sdk/client/auth.js');

const SERVER = 'https://mcp.notion.com/mcp';
const RELOGIN = '노션 로그인이 풀렸어요. 다시 로그인해 주세요.';
const PORT = 47823;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;

// 토큰 갱신 요청이 겹치지 않게 하는 fetch.
// 노션은 갱신용 토큰(refresh_token)을 한 번 쓰면 새 것으로 바꿔 준다. 접속이 여럿(요청 + 알림 스트림)이라
// 토큰이 만료되는 순간 갱신 요청이 둘 나갈 수 있는데, 둘째는 '이미 쓴 토큰'이라 거절되고(invalid_grant)
// 그러면 로그인 자체가 지워진다. → 같은 토큰으로 하는 갱신은 한 번만 보내고, 그 답을 같이 쓴다.
function refreshOnce(baseFetch, note = () => {}) {
  const seen = new Map(); // refresh_token → 진행 중이거나 방금 끝난 갱신
  return async (url, init) => {
    const body = init && init.body;
    const params = body instanceof URLSearchParams ? body : typeof body === 'string' ? new URLSearchParams(body) : null;
    if (!params || params.get('grant_type') !== 'refresh_token') return baseFetch(url, init);
    const key = params.get('refresh_token');
    if (!seen.has(key)) {
      const job = baseFetch(url, init).then(async (res) => ({ status: res.status, type: res.headers.get('content-type') || 'application/json', body: await res.text() }));
      seen.set(key, job);
      // 성공한 답은 잠시 들고 있음 (조금 늦게 온 같은 요청에도 같은 새 토큰을 줌). 실패는 바로 잊음
      // 기록: 언제 갱신했고 됐는지, 안 됐으면 노션이 댄 이유 (토큰 값은 남기지 않음)
      job.then((r) => { let why = ''; if (r.status >= 400) { try { why = JSON.parse(r.body).error || ''; } catch { /* 글 답 */ } } note('notion token refresh', r.status, why); }, (e) => note('notion token refresh failed', String((e && e.message) || e)));
      job.then((r) => { if (r.status >= 400) seen.delete(key); else { const t = setTimeout(() => seen.delete(key), 5 * 60 * 1000); if (t.unref) t.unref(); } }, () => seen.delete(key));
    }
    const r = await seen.get(key);
    return new Response(r.body, { status: r.status, headers: { 'content-type': r.type } });
  };
}

class NotionMcp {
  /** @param {{load:()=>object, save:(o:object)=>void, open:(url:string)=>void, fetch?:Function}} io */
  constructor(io) {
    this.io = io;
    this.client = null;
    this.connecting = null;
    this.tools = null;
    this.verifier = null;
    this.loggingIn = false;
    this.note = io.log || (() => {});
    this.fetch = refreshOnce(io.fetch || ((...a) => fetch(...a)), this.note);
    const self = this;
    this.provider = {
      get redirectUrl() { return REDIRECT; },
      get clientMetadata() {
        return {
          client_name: '업무다이어리 (WorkDiary)',
          redirect_uris: [REDIRECT],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        };
      },
      clientInformation: () => self.io.load().client,
      saveClientInformation: (c) => self.io.save({ ...self.io.load(), client: c }),
      tokens: () => self.io.load().tokens,
      saveTokens: (t) => { const d = self.io.load(); delete d.expired; self.io.save({ ...d, tokens: t }); },
      // 브라우저는 사람이 '노션으로 로그인'을 눌렀을 때만 연다 (갱신에 잠깐 실패했다고 로그인 창이 불쑥 뜨지 않게)
      redirectToAuthorization: (url) => { if (self.loggingIn) self.io.open(url.toString()); },
      saveCodeVerifier: (v) => { self.verifier = v; },
      codeVerifier: () => self.verifier,
      invalidateCredentials: (scope) => {
        const d = self.io.load();
        self.note('notion credentials invalidated', scope, d.tokens ? 'had tokens' : 'no tokens', self.loggingIn ? 'during login' : '');
        if (scope === 'all' || scope === 'client') delete d.client;
        if (scope === 'all' || scope === 'tokens') {
          if (d.tokens && !self.loggingIn) d.expired = true; // 쓰던 로그인이 풀림 → '다시 로그인' 안내용 표시
          delete d.tokens;
        }
        self.io.save(d);
      },
    };
  }

  loggedIn() { return !!(this.io.load().tokens); }
  // 로그인해서 쓰다가 풀린 상태 (직접 로그아웃한 것과 구분: 이때는 노션 없이 쓰기로 넘어가지 않고 다시 로그인을 안내)
  needsLogin() { const d = this.io.load(); return !d.tokens && !!d.expired; }

  // 브라우저로 노션 로그인 → 127.0.0.1 로 돌아온 code 를 받아 토큰으로 바꿈
  async login() {
    let server;
    const codePromise = new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        const u = new URL(req.url, REDIRECT);
        if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
        const code = u.searchParams.get('code');
        const err = u.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family:sans-serif;background:#111;color:#fff;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>${code ? '노션 연결 완료!' : '연결하지 못했어요'}</h2><p>이 창은 닫고 업무다이어리로 돌아가세요.</p></div></body></html>`);
        if (code) resolve(code); else reject(new Error(err || 'no code'));
      });
      server.on('error', reject);
      server.listen(PORT, '127.0.0.1');
      setTimeout(() => reject(Object.assign(new Error('timeout'), { friendly: '5분 안에 로그인이 끝나지 않았어요. 다시 해 주세요.' })), 5 * 60 * 1000);
    });
    this.loggingIn = true;
    try {
      const first = await auth(this.provider, { serverUrl: SERVER, fetchFn: this.fetch });
      if (first !== 'AUTHORIZED') {
        const code = await codePromise;
        if (await auth(this.provider, { serverUrl: SERVER, authorizationCode: code, fetchFn: this.fetch }) !== 'AUTHORIZED') return false;
      }
      this.drop();
      return true;
    } finally {
      this.loggingIn = false;
      codePromise.catch(() => {}); // 먼저 끝난 경우 남은 대기(5분 제한)가 오류로 새지 않게
      try { server && server.close(); } catch { /* 이미 닫힘 */ }
    }
  }

  logout() { this.io.save({}); this.drop(); this.tools = null; }

  // 쓰던 접속을 버림. 그냥 놓기만 하면 옛 접속의 알림 스트림이 살아서 혼자 토큰 갱신을 시도하므로 꼭 닫는다
  drop() {
    const old = this.client;
    this.client = null;
    if (old) Promise.resolve().then(() => old.close()).catch(() => {});
  }

  // 접속은 하나만: 동시에 여러 곳에서 불러도 같은 접속을 기다림
  connect() {
    if (this.client) return Promise.resolve(this.client);
    if (!this.connecting) {
      this.connecting = (async () => {
        const transport = new StreamableHTTPClientTransport(new URL(SERVER), { authProvider: this.provider, fetch: this.fetch });
        const client = new Client({ name: 'work-diary', version: '1.0.0' });
        try {
          await client.connect(transport);
          const { tools } = await client.listTools();
          this.tools = tools.map((t) => t.name);
        } catch (e) {
          Promise.resolve().then(() => client.close()).catch(() => {});
          throw e;
        }
        this.client = client;
        return client;
      })().finally(() => { this.connecting = null; });
    }
    return this.connecting;
  }

  tool(suffix) {
    const name = (this.tools || []).find((n) => n === suffix || n.endsWith(suffix) || n.endsWith(suffix.replace(/^notion-/, '')));
    if (!name) throw Object.assign(new Error(`tool ${suffix} not found`), { friendly: '노션 연결 도구를 찾지 못했어요. 다시 로그인해 주세요.' });
    return name;
  }

  async call(suffix, args) {
    if (!this.loggedIn()) throw wrap(new Error('unauthorized'), false);
    let client;
    try { client = await this.connect(); } catch (e) { throw wrap(e, this.loggedIn()); }
    let res;
    try { res = await client.callTool({ name: this.tool(suffix), arguments: args }); } catch (e) {
      if (this.client === client) this.drop(); // 다음에 다시 연결
      throw wrap(e, this.loggedIn());
    }
    const text = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    if (res.isError) throw Object.assign(new Error(text), { friendly: `노션 오류: ${text.slice(0, 120)}` });
    try { return JSON.parse(text); } catch { return text; }
  }

  async sql(dataSourceId, query) {
    const url = `collection://${dataSourceId}`;
    const r = await this.call('notion-query-data-sources', { data: { data_source_urls: [url], query: query.replaceAll('{T}', `"${url}"`) } });
    return (r && r.results) || [];
  }

  async fetchPage(id) {
    const r = await this.call('notion-fetch', { id });
    const text = typeof r === 'string' ? r : (r && r.text) || '';
    const m = text.match(/<content>\n?([\s\S]*?)\n?<\/content>/);
    return m ? m[1] : text;
  }

  async replaceText(pageId, oldStr, newStr) {
    return this.call('notion-update-page', { page_id: pageId, command: 'update_content', content_updates: [{ old_str: oldStr, new_str: newStr }], allow_async: false });
  }
}

// stillLoggedIn: 오류가 난 뒤에도 로그인 정보가 남아 있는가. 남아 있으면 로그인이 풀린 게 아니라
// 갱신에 잠깐 실패한 것(네트워크·노션 서버)이라 다음 동기화 때 다시 된다
function wrap(e, stillLoggedIn = false) {
  if (e && e.friendly) return e;
  const msg = String((e && e.message) || e);
  if (/\b401\b|unauthor|invalid_token|invalid_grant/i.test(msg)) { // \b: 요청 번호 같은 긴 글자열 속의 401 은 아님
    return stillLoggedIn
      ? Object.assign(new Error(msg), { friendly: '노션에 잠깐 연결하지 못했어요. 곧 다시 시도해요.' })
      : Object.assign(new Error(msg), { friendly: RELOGIN, relogin: true });
  }
  if (/fetch failed|ENOTFOUND|ECONN/i.test(msg)) return Object.assign(new Error(msg), { friendly: '인터넷 연결을 확인해 주세요.' });
  return Object.assign(new Error(msg), { friendly: `노션 연결 오류: ${msg.slice(0, 120)}` });
}

// 항목 하나가 차지하는 마지막 줄: 그 줄 아래로 더 들여쓴 줄(하위 체크박스·메모·글머리 등)이 이어지는 데까지.
// 지우거나 옮길 때 하위 내용이 따로 떨어져 남지 않게 함
const indentOf = (ln) => ln.match(/^\s*/)[0].replace(/\t/g, '  ').length;
function subtreeEnd(lines, i) {
  let end = i;
  for (let k = i + 1; k < lines.length && lines[k].trim() && indentOf(lines[k]) > indentOf(lines[i]); k++) end = k;
  return end;
}

// ---------- 마크다운 체크리스트 파싱 ----------
const DATE_RE = /^\s*#{1,6}\s*(\d{1,2})\s*[/.월]\s*(\d{1,2})/;
const TODO_RE = /^(\s*)- \[( |x|X)\]\s?(.*)$/;
const pad = (n) => String(n).padStart(2, '0');

// 노션 마크다운은 글자 그대로의 기호 앞에 역슬래시를 붙여서 준다 (7\~9, \[가\]). 꾸밈 기호를 걷어 낼 때
// 그런 글자는 건드리지 않도록 잠깐 빼 두었다가, 마지막에 역슬래시 없이 되돌려 놓는다.
const ESCAPED = /\\([!-\/:-@\[-`{-~])/g;
function cleanText(s) {
  const kept = [];
  return String(s || '')
    .replace(ESCAPED, (_, c) => `\u0000${kept.push(c) - 1}\u0000`)
    .replace(/<mention-[^>]*>([^<]*)<\/mention-[^>]*>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => kept[i])
    .trim();
}

// 앱에서 적은 글을 노션 마크다운으로: 꾸밈으로 읽힐 수 있는 기호 앞에 역슬래시
const escapeText = (s) => String(s || '').replace(/([\\*_`~\[\]<])/g, '\\$1');

function resolveYear(month, refISO) {
  const [ry, rm] = refISO.split('-').map(Number);
  if (rm === 12 && month === 1) return ry + 1;
  if (rm === 1 && month === 12) return ry - 1;
  return ry;
}

function workdaysFrom(startISO, count) {
  const out = [];
  const d = new Date(startISO + 'T00:00:00');
  while (out.length < count) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * 노션 마크다운 → { days: {'YYYY-MM-DD': [item]}, anchors: Map(id → {pageId, oldStr, newStr}) }
 * item: {id, text, checked, children}
 */
function parseMarkdown(md, pageId, startISO) {
  const lines = md.split('\n');
  const days = {};
  const anchors = new Map();
  const sections = {}; // 날짜 → { start, last } (줄 번호)
  const fallback = startISO ? workdaysFrom(startISO, 10) : [];
  let col = -1, date = null, secStart = 0, stack = [], counter = {};
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\s*<column\b/.test(ln)) { col++; date = null; secStart = i; stack = []; continue; }
    const dm = ln.match(DATE_RE);
    if (dm) {
      const y = resolveYear(+dm[1], startISO || `${new Date().getFullYear()}-01-01`);
      date = `${y}-${pad(+dm[1])}-${pad(+dm[2])}`;
      secStart = i; stack = [];
      sections[date] = { start: i, last: i };
      continue;
    }
    const tm = ln.match(TODO_RE);
    if (!tm) continue;
    const d = date || (col >= 0 ? fallback[col] : null);
    if (!d) continue;
    if (!sections[d]) sections[d] = { start: secStart, last: i };
    sections[d].last = i;
    const indent = tm[1].replace(/\t/g, '  ').length;
    const text = cleanText(tm[3]);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (!text) continue; // 빈 체크박스는 숨김
    counter[d] = (counter[d] || 0) + 1;
    const id = `${pageId}:${d}:${counter[d]}`;
    const item = { id, text, checked: tm[2] !== ' ', children: [] };
    const block = lines.slice(secStart, i + 1);
    const toggled = ln.replace(/- \[( |x|X)\]/, tm[2] === ' ' ? '- [x]' : '- [ ]');
    // 지우기용: 이 항목과 그 아래 하위 항목 줄까지
    const endL = subtreeEnd(lines, i);
    const delBlock = lines.slice(secStart, endL + 1);
    anchors.set(id, { id, pageId, line: i, oldStr: block.join('\n'), newStr: [...block.slice(0, -1), toggled].join('\n'),
      delOld: delBlock.join('\n'), delNew: lines.slice(secStart, i).join('\n') });
    if (stack.length) stack[stack.length - 1].item.children.push(item);
    else (days[d] = days[d] || []).push(item);
    stack.push({ indent, item });
  }
  // 새 체크박스 넣기용: 그 날짜 구역(제목~마지막 체크박스)을 찾아 바꿀 문자열
  const adders = {};
  for (const [d, sec] of Object.entries(sections)) adders[d] = lines.slice(sec.start, sec.last + 1).join('\n');
  return { days, anchors, adders };
}

// ---------- 업무 페이지의 체크리스트 ----------
// 업무(태스크) 페이지에는 날짜 구역이 없다 → 페이지 안의 체크박스를 위에서부터 전부 모은다 (들여쓴 것은 하위 항목).
// 바꿀 글(old_str)은 그 줄에서 시작해, 페이지에서 딱 한 번만 나올 때까지 위 줄을 덧붙여 만든다 (같은 글의 줄이 여럿이어도 안전).
// 돌려주는 것: { items, anchors, adder }  adder = 새 체크박스를 붙일 자리 { old: 마지막 체크박스까지의 글, indent: 새 줄의 들여쓰기 }.
// 체크박스가 하나도 없으면 null (그때는 페이지 끝에 덧붙임)
function parseFlat(md, pageId) {
  const lines = String(md || '').split('\n');
  const times = (str) => md.split(str).length - 1;
  const block = (from, to) => { // from 줄에서 위로 넓혀 가며 한 번만 나오는 덩어리
    let start = from, str = lines.slice(start, to + 1).join('\n');
    while (start > 0 && times(str) > 1) { start--; str = lines.slice(start, to + 1).join('\n'); }
    return { start, str };
  };
  const items = [], anchors = new Map();
  let stack = [], n = 0, tail = -1, fenced = false; // tail = 마지막 체크박스 줄 (빈 체크박스 포함, 코드 상자 안은 제외)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { fenced = !fenced; continue; }
    const tm = !fenced && lines[i].match(TODO_RE);
    if (!tm) continue;
    tail = i;
    const indent = tm[1].replace(/\t/g, '  ').length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const text = cleanText(tm[3]);
    if (!text) continue; // 빈 체크박스는 숨김
    const id = `${pageId}:q:${++n}`;
    const item = { id, text, checked: tm[2] !== ' ', children: [] };
    const one = block(i, i);
    const toggled = lines[i].replace(/- \[( |x|X)\]/, tm[2] === ' ' ? '- [x]' : '- [ ]');
    // 지우기: 하위 체크박스 줄까지. 지운 자리에 남길 글이 있도록 가능하면 바로 윗줄(없으면 아랫줄)을 끼워서 바꾼다
    const endL = subtreeEnd(lines, i);
    let delOld, delNew;
    if (i > 0) { const d = block(i - 1, endL); delOld = d.str; delNew = lines.slice(d.start, i).join('\n'); }
    else if (endL + 1 < lines.length) { delOld = lines.slice(0, endL + 2).join('\n'); delNew = lines[endL + 1]; }
    else { delOld = lines.slice(0, endL + 1).join('\n'); delNew = ''; }
    anchors.set(id, { id, pageId, line: i, oldStr: one.str, newStr: one.str.slice(0, one.str.length - lines[i].length) + toggled, delOld, delNew });
    if (stack.length) stack[stack.length - 1].item.children.push(item); else items.push(item);
    stack.push({ indent, item });
  }
  // 새 체크박스 자리: 마지막 체크박스 줄(빈 체크박스 포함)의 바로 뒤.
  // 들여쓰기는 그 체크박스 묶음에서 가장 바깥 것에 맞춤 (하위 항목 뒤에 붙여도 하위로 들어가지 않고, 같은 상자 안에 머물게)
  if (tail < 0) return { items, anchors, adder: null };
  let indent = lines[tail].match(/^\s*/)[0];
  for (let k = tail - 1; k >= 0 && TODO_RE.test(lines[k]); k--) { const ws = lines[k].match(/^\s*/)[0]; if (ws.length < indent.length) indent = ws; }
  return { items, anchors, adder: { old: block(tail, tail).str, indent } };
}

// ---------- 순서 바꾸기 ----------
// 체크박스 하나(하위 줄 포함)를 같은 목록의 다른 체크박스 앞/뒤로 옮기는 '바꿀 글'을 만든다.
// aLine = 옮길 항목의 줄 번호, bLine = 기준 항목의 줄 번호 (parse 가 anchors 에 넣어 둔 line), after = 기준의 뒤로?
// 돌려주는 { old, neu }: 두 항목을 모두 덮는 구간(페이지에서 한 번만 나오게 위로 넓힘)과 순서를 바꾼 결과. 옮길 게 없으면 null
function reorderEdit(md, aLine, bLine, after) {
  const lines = md.split('\n');
  const span = (start) => [start, subtreeEnd(lines, start)]; // 그 항목과 그 아래 더 들여쓴 줄들
  const [a0, a1] = span(aLine), [b0, b1] = span(bLine);
  if (a0 === b0 || (a0 > b0 && a0 <= b1) || (b0 > a0 && b0 <= a1)) return null; // 자기 자신이나 자기 하위로는 못 옮김
  const lo = Math.min(a0, b0), hi = Math.max(a1, b1);
  const region = lines.slice(lo, hi + 1), block = lines.slice(a0, a1 + 1);
  region.splice(a0 - lo, block.length);
  const at = b0 - lo - (a0 < b0 ? block.length : 0);
  region.splice(after ? at + (b1 - b0 + 1) : at, 0, ...block);
  let start = lo, old = lines.slice(start, hi + 1).join('\n');
  while (start > 0 && md.split(old).length - 1 > 1) { start--; old = lines.slice(start, hi + 1).join('\n'); }
  const neu = [...lines.slice(start, lo), ...region].join('\n');
  return old === neu ? null : { old, neu };
}

// ---------- 바꿀 줄 다시 찾기 ----------
// 항목 id 는 '그 날짜의 몇 번째'라서, 위 항목이 지워지면 번호가 밀린다. 누른 순간의 그 줄을 기억해 두었다가(markOf)
// 실제로 쓸 차례가 왔을 때 같은 줄을 다시 찾는다(locateMark). 못 찾거나 같은 줄이 여럿이면 엉뚱한 줄을 건드리지 않고 그만둔다.
const lastLine = (str) => str.slice(str.lastIndexOf('\n') + 1);
function markOf(anchors, id) {
  const a = anchors.get(id);
  if (!a) throw Object.assign(new Error('no anchor'), { friendly: '잠시 후 다시 해 주세요. (노션 내용을 다시 불러오는 중)' });
  return { id, pageId: a.pageId, line: lastLine(a.oldStr), day: id.slice(0, id.lastIndexOf(':') + 1) };
}
function locateMark(anchors, mark) {
  const a = anchors.get(mark.id);
  if (a && lastLine(a.oldStr) === mark.line) return a;
  const same = [...anchors].filter(([id, x]) => id.startsWith(mark.day) && lastLine(x.oldStr) === mark.line);
  if (same.length === 1) return same[0][1];
  throw Object.assign(new Error('anchor moved'), { friendly: '그 사이 내용이 바뀌었어요. 다시 해 주세요.' });
}

module.exports = { NotionMcp, refreshOnce, RELOGIN, parseMarkdown, parseFlat, reorderEdit, cleanText, escapeText, lastLine, markOf, locateMark, REDIRECT };
