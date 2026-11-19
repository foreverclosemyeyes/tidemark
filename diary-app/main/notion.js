// 노션 API 연결 (읽기 + 체크박스 체크만 쓰기)
// - 진행 중 퀘스트: 담당자=나, 상태=진행중/시작 전
// - 운영성 업무 페이지: 본문의 칼럼 → 날짜 제목 → 체크박스(+하위 체크박스) 구조를 읽음
'use strict';

const API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03'; // data source API 를 쓰는 버전

class NotionError extends Error {
  constructor(message, { status, code, friendly } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.friendly = friendly || message;
  }
}

function friendlyMessage(status, code, message) {
  if (status === 401) return '노션 키가 올바르지 않아요. 설정 > 연결에서 키를 다시 확인해 주세요.';
  if (status === 404 || code === 'object_not_found')
    return '노션 DB를 찾을 수 없어요. 업무 DB 페이지의 ••• > 연결(Connections)에 내 통합을 추가했는지 확인해 주세요.';
  if (status === 403) return '이 통합에 권한이 없어요. 노션 통합 설정 > 기능에서 "콘텐츠 읽기"와 "콘텐츠 업데이트"를 켜 주세요.';
  if (status === 429) return '노션 요청이 많아 잠시 쉬는 중이에요. 곧 다시 시도할게요.';
  if (status >= 500) return '노션 서버가 잠시 응답하지 않아요. 곧 다시 시도할게요.';
  if (!status) return '인터넷 연결을 확인해 주세요.';
  return `노션 오류: ${message}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class NotionClient {
  constructor(token) {
    this.token = token;
    this.queue = Promise.resolve();
    this.lastCall = 0;
  }

  // 노션은 초당 약 3회 제한 → 요청을 줄 세워 간격을 둠
  request(method, path, body) {
    const run = async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const wait = Math.max(0, this.lastCall + 350 - Date.now());
        if (wait) await sleep(wait);
        this.lastCall = Date.now();
        let res;
        try {
          res = await fetch(API + path, {
            method,
            headers: {
              Authorization: `Bearer ${this.token}`,
              'Notion-Version': NOTION_VERSION,
              'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
          });
        } catch (e) {
          if (attempt < 3) { await sleep(1000 * (attempt + 1)); continue; }
          throw new NotionError(e.message, { friendly: friendlyMessage(0) });
        }
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get('retry-after')) || attempt + 1;
          if (attempt < 3) { await sleep(ra * 1000); continue; }
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new NotionError(json.message || `HTTP ${res.status}`, {
            status: res.status,
            code: json.code,
            friendly: friendlyMessage(res.status, json.code, json.message || ''),
          });
        }
        return json;
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async queryDataSource(dataSourceId, body) {
    const results = [];
    let cursor;
    do {
      const json = await this.request('POST', `/data_sources/${dataSourceId}/query`, {
        ...body,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      results.push(...json.results);
      cursor = json.has_more ? json.next_cursor : null;
    } while (cursor);
    return results;
  }

  async listChildren(blockId) {
    const results = [];
    let cursor;
    do {
      const q = `?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
      const json = await this.request('GET', `/blocks/${blockId}/children${q}`);
      results.push(...json.results);
      cursor = json.has_more ? json.next_cursor : null;
    } while (cursor);
    return results;
  }

  // 블록 트리를 통째로 읽음 (하위 페이지/DB 안으로는 들어가지 않음)
  async getBlockTree(blockId, depth = 0) {
    const blocks = await this.listChildren(blockId);
    for (const b of blocks) {
      if (b.has_children && depth < 6 && !['child_page', 'child_database'].includes(b.type)) {
        b.children = await this.getBlockTree(b.id, depth + 1);
      } else {
        b.children = [];
      }
    }
    return blocks;
  }

  // 체크박스 지우기 (노션 휴지통으로)
  deleteBlock(id) { return this.request('DELETE', `/blocks/${id}`); }

  // 체크박스 새로 넣기 (afterId 블록 바로 뒤)
  addTodo(parentId, afterId, text) {
    return this.request('PATCH', `/blocks/${parentId}/children`, {
      after: afterId,
      children: [{ object: 'block', type: 'to_do', to_do: { rich_text: [{ type: 'text', text: { content: text } }], checked: false } }],
    });
  }

  me() {
    return this.request('GET', '/users/me');
  }

  // 체크박스 켜기/끄기 (통합에 "콘텐츠 업데이트" 권한 필요)
  // 체크박스 글 바꾸기 (서식 없는 글로 다시 씀)
  setTodoText(blockId, text) {
    return this.request('PATCH', `/blocks/${blockId}`, { to_do: { rich_text: [{ type: 'text', text: { content: text } }] } });
  }

  setTodo(blockId, checked) {
    return this.request('PATCH', `/blocks/${blockId}`, { to_do: { checked: !!checked } });
  }
}

// ---------- 속성 읽기 ----------
const plain = (rich) => (rich || []).map((t) => t.plain_text || '').join('');

function findProp(props, name, type) {
  if (props[name] && (!type || props[name].type === type)) return props[name];
  if (type) return Object.values(props).find((p) => p.type === type);
  return undefined;
}

function pageSummary(page) {
  const props = page.properties || {};
  const title = findProp(props, 'Name', 'title');
  const status = findProp(props, '상태', 'status');
  const date = props['기간'] && props['기간'].type === 'date' ? props['기간'].date : null;
  return {
    id: page.id,
    url: page.url,
    name: title ? plain(title.title) : '(제목 없음)',
    status: status && status.status ? status.status.name : null,
    start: date ? (date.start || '').slice(0, 10) : null,
    end: date ? (date.end || date.start || '').slice(0, 10) || null : null,
    lastEdited: page.last_edited_time,
    tags: props.Tags && props.Tags.type === 'multi_select' ? props.Tags.multi_select.map((t) => t.name) : [],
  };
}

// ---------- 체크리스트 파싱 ----------
// 실제 페이지 구조 (2026-11 확인):
//   callout(안내, 인라인 DB 포함)
//   column_list > column > [heading "11/9 (월)", to_do, to_do(+하위 to_do), ..., 빈 paragraph]
//   column_list > column > ... (목/금)
const DATE_RE = /^\s*(\d{1,2})\s*[/.월]\s*(\d{1,2})\s*일?\s*(?:\(\s*[월화수목금토일]\s*\))?/;

function blockText(b) {
  const data = b[b.type];
  return data && data.rich_text ? plain(data.rich_text) : '';
}

function isHeadingLike(b) {
  return /^heading_\d$/.test(b.type) || ['paragraph', 'callout', 'quote', 'toggle'].includes(b.type) || b.type.startsWith('heading');
}

function parseTodo(b) {
  const text = blockText(b).trim();
  const children = (b.children || []).filter((c) => c.type === 'to_do').map(parseTodo).filter(Boolean);
  if (!text && children.length === 0) return null; // 빈 체크박스는 숨김
  return { id: b.id, text, checked: !!(b.to_do && b.to_do.checked), children };
}

function toISO(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function resolveYear(month, refISO) {
  const [ry, rm] = refISO.split('-').map(Number);
  if (rm === 12 && month === 1) return ry + 1;
  if (rm === 1 && month === 12) return ry - 1;
  return ry;
}

// 기간 시작일부터 평일만 나열 (칼럼에 날짜 제목이 없을 때 대비책)
function workdaysFrom(startISO, count) {
  const out = [];
  const d = new Date(startISO + 'T00:00:00');
  while (out.length < count) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) out.push(toISO(d.getFullYear(), d.getMonth() + 1, d.getDate()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * 블록 트리 → { 'YYYY-MM-DD': [ {id,text,checked,children:[...]}, ... ] }
 */
function parseChecklist(blocks, refStartISO, meta = {}) {
  const days = {};
  const columns = []; // [{ date|null, items }]

  // 칼럼이 아닌 곳(페이지 바로 아래)에 있는 날짜 제목/체크박스도 처리
  const loose = { date: null, items: [] };

  function walkContainer(list, ctx) {
    for (const b of list) {
      if (b.type === 'column_list') {
        for (const col of b.children || []) {
          if (col.type !== 'column') continue;
          const c = { date: null, sections: [], current: null };
          walkColumn(col.children || [], c, col.id);
          columns.push(c);
        }
      } else if (b.type === 'to_do') {
        const t = parseTodo(b);
        if (t) ctx.items.push({ date: ctx.date, item: t });
      } else if (b.type === 'child_database' || b.type === 'child_page') {
        continue;
      } else {
        const text = blockText(b);
        const m = isHeadingLike(b) && text.match(DATE_RE);
        if (m) ctx.date = toISO(resolveYear(+m[1], refStartISO), +m[1], +m[2]);
        else if (b.children && b.children.length && b.type !== 'to_do') walkContainer(b.children, ctx);
      }
    }
  }

  function walkColumn(list, c, parentId) {
    for (const b of list) {
      if (b.type === 'to_do') {
        if (!c.current) { c.current = { date: null, items: [], parentId, afterId: null }; c.sections.push(c.current); }
        if (c.current.parentId === parentId) c.current.afterId = b.id; // 새 체크박스를 넣을 자리
        const t = parseTodo(b);
        if (!t) continue;
        c.current.items.push(t);
      } else if (b.type === 'column_list') {
        walkContainer([b], loose);
      } else {
        const text = blockText(b);
        const m = isHeadingLike(b) && text.match(DATE_RE);
        if (m) {
          c.current = { date: toISO(resolveYear(+m[1], refStartISO), +m[1], +m[2]), items: [], parentId, afterId: b.id };
          c.sections.push(c.current);
        } else if (b.children && b.children.length && !['child_database', 'child_page'].includes(b.type)) {
          walkColumn(b.children, c, b.id);
        }
      }
    }
  }

  walkContainer(blocks, loose);

  // 날짜 제목이 없는 칼럼은 칼럼 순서대로 평일을 배정
  const fallback = refStartISO ? workdaysFrom(refStartISO, Math.max(columns.length, 5)) : [];
  columns.forEach((c, idx) => {
    for (const s of c.sections) {
      const date = s.date || fallback[idx];
      if (!date) continue;
      (days[date] = days[date] || []).push(...s.items);
      if (s.parentId && s.afterId) meta[date] = { parentId: s.parentId, afterId: s.afterId };
    }
  });
  for (const { date, item } of loose.items) {
    if (!date) continue;
    (days[date] = days[date] || []).push(item);
  }
  return days;
}

function countItems(items) {
  let total = 0, done = 0;
  const walk = (list) => list.forEach((i) => { total++; if (i.checked) done++; walk(i.children || []); });
  walk(items || []);
  return { total, done };
}

// ---------- 고수준 함수 ----------
const DONE_STATUSES = ['진행중', '시작 전'];

async function fetchQuests(client, cfg) {
  const pages = await client.queryDataSource(cfg.dataSourceId, {
    filter: {
      and: [
        { property: '담당자', people: { contains: cfg.userId } },
        { or: DONE_STATUSES.map((s) => ({ property: '상태', status: { equals: s } })) },
      ],
    },
  });
  return pages
    .map(pageSummary)
    .filter((p) => !p.name.includes('운영성 업무'))
    .sort((a, b) => (a.end || '9999').localeCompare(b.end || '9999'));
}

// 이번 달(앞뒤 주 포함)에 걸친 운영성 업무 페이지 찾기
async function fetchWeeklyPages(client, cfg, rangeStart, rangeEnd) {
  const pages = await client.queryDataSource(cfg.dataSourceId, {
    filter: {
      and: [
        { property: 'Name', title: { contains: '운영성 업무' } },
        { property: '기간', date: { on_or_before: rangeEnd } },
        { property: '기간', date: { on_or_after: shiftISO(rangeStart, -14) } },
      ],
    },
  });
  return pages
    .map(pageSummary)
    .filter((p) => p.start && (p.end || p.start) >= rangeStart && p.start <= rangeEnd)
    .sort((a, b) => a.start.localeCompare(b.start));
}

// 달력에 점으로 표시할 일정: 기본은 Tags 가 meeting/seminar 인 내 페이지, 'all' 이면 기간이 있는 내 업무 전부
async function fetchEvents(client, cfg, rangeStart, rangeEnd, mode = 'tags') {
  const and = [
    { property: '담당자', people: { contains: cfg.userId } },
    { property: '기간', date: { on_or_before: rangeEnd } },
    { property: '기간', date: { on_or_after: shiftISO(rangeStart, -90) } },
  ];
  if (mode !== 'all') and.push({ or: [{ property: 'Tags', multi_select: { contains: 'meeting' } }, { property: 'Tags', multi_select: { contains: 'seminar' } }] });
  const pages = await client.queryDataSource(cfg.dataSourceId, { filter: { and } });
  return pages
    .map(pageSummary)
    .filter((p) => p.start && (p.end || p.start) >= rangeStart && !p.name.includes('운영성 업무'))
    .map(({ id, url, name, status, start, end, tags }) => ({ id, url, name, status, start, end: end || start, tags }))
    .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
}

// 진행 중 업무 하나 만들기: 상태 '진행중', 담당자 나, 마감일은 기간에. 분류(Cell·우선순위)는 내가 가장 최근에 만든 업무를 따름
async function createTask(client, cfg, { name, end }) {
  const recent = await client.request('POST', `/data_sources/${cfg.dataSourceId}/query`, {
    filter: { property: '담당자', people: { contains: cfg.userId } }, sorts: [{ timestamp: 'created_time', direction: 'descending' }], page_size: 1,
  }).catch(() => ({ results: [] }));
  const like = (recent.results[0] && recent.results[0].properties) || {};
  const properties = {
    Name: { title: [{ type: 'text', text: { content: name } }] },
    상태: { status: { name: '진행중' } },
    담당자: { people: [{ id: cfg.userId }] },
  };
  if (end) properties['기간'] = { date: { start: end } };
  for (const k of ['Cell', '우선순위']) if (like[k] && like[k].select) properties[k] = { select: { name: like[k].select.name } };
  return client.request('POST', '/pages', { parent: { type: 'data_source_id', data_source_id: cfg.dataSourceId }, properties });
}

function shiftISO(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

module.exports = {
  NotionClient,
  parseTodo,
  NotionError,
  parseChecklist,
  countItems,
  pageSummary,
  fetchQuests,
  fetchWeeklyPages,
  fetchEvents,
  createTask,
  shiftISO,
  toISO,
};
