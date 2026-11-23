// 주간 "N월 N주차 운영성 업무" 페이지 만들기.
//
// 아직 페이지가 없는 주(다음 주, 다다음 주 …)의 날짜에 할 일을 적으려고 하면, 노션 업무 DB 에
// 그 주의 페이지를 새로 만든다: 이름은 "N월 N주차 운영성 업무", 상태는 "시작 전", 기간은 월~금,
// 본문은 다른 주와 같은 양식(안내 칸 + 월·화·수 / 목·금 칼럼, 날짜 제목만 있고 체크리스트는 비어 있음).
//
// 노션 로그인(MCP) 쪽은 가장 최근 주 페이지를 '복제'한 뒤 이름·상태·기간과 칼럼 내용만 바꾼다
// (안내 칸 안의 표까지 그대로 따라오게 하려고). API 키 쪽은 복제 기능이 없어서 같은 구조를 새로 짓는다.
'use strict';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const NAME_KEY = '운영성 업무';
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (s) => new Date(s + 'T00:00:00');
const addDays = (s, n) => { const d = at(s); d.setDate(d.getDate() + n); return iso(d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const friendly = (message) => Object.assign(new Error(message), { friendly: message });
const bareId = (s) => String(s || '').replace(/-/g, '').toLowerCase();

// 그 날짜가 든 주(월~금). 주 이름은 월요일이 그 달의 몇 번째 월요일인지로 정한다
// (기존 페이지와 같은 규칙: 11/2~6 → 11월 1주차, 11/9~13 → 11월 2주차, 10/26~30 → 10월 4주차)
function weekOf(dateISO) {
  const d = at(dateISO);
  const monday = addDays(dateISO, -((d.getDay() + 6) % 7));
  const m = at(monday);
  const days = [0, 1, 2, 3, 4].map((k) => {
    const day = at(addDays(monday, k));
    return { iso: iso(day), label: `${day.getMonth() + 1}/${day.getDate()} (${WD[day.getDay()]})` };
  });
  return { monday, friday: days[4].iso, days, name: `${m.getMonth() + 1}월 ${Math.ceil(m.getDate() / 7)}주차 ${NAME_KEY}` };
}

// 만들어도 되는 날짜인가: 평일이고, 이번 주부터 앞으로 4주 안
function canCreate(dateISO, todayISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const wd = at(dateISO).getDay();
  if (wd === 0 || wd === 6) return false;
  const gap = Math.round((at(weekOf(dateISO).monday) - at(weekOf(todayISO).monday)) / (7 * 86400000));
  return gap >= 0 && gap <= 4;
}

// ---------- 노션 마크다운 (노션 로그인 쪽) ----------
const column = (ratio, label) => `<column ratio="${ratio}">\n#### ${label}\n\n<p />\n</column>`;
function columnsMarkdown(week) {
  const [mon, tue, wed, thu, fri] = week.days.map((d) => d.label);
  return [
    '<columns>', column('33.33', mon), column('33.33', tue), column('33.33', wed), '</columns>',
    '',
    '<columns>', column('50', thu), column('50', fri), '</columns>',
  ].join('\n');
}

// 복제해 온 페이지의 마크다운에서 칼럼 부분(첫 <columns> ~ 마지막 </columns>)만 새 주의 빈 양식으로 바꿈.
// 그 앞뒤(안내 칸과 그 안의 표)는 손대지 않는다.
function retemplate(md, week) {
  const a = md.indexOf('<columns>'), b = md.lastIndexOf('</columns>');
  if (a < 0 || b < a) return null;
  const end = b + '</columns>'.length;
  const neu = columnsMarkdown(week);
  return { old: md.slice(a, end), neu, full: md.slice(0, a) + neu + md.slice(end) };
}

// 복제 결과에서 새 페이지 id 를 찾음 (원본 id 가 아닌 첫 32자리 id)
function newPageId(result, sourceId) {
  const text = typeof result === 'string' ? result : JSON.stringify(result || {});
  const ids = text.match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi) || [];
  return ids.map(bareId).find((id) => id !== bareId(sourceId)) || null;
}

async function createViaMcp(mcp, cfg, week) {
  const T = '{T}', q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const exists = await mcp.sql(cfg.dataSourceId, `SELECT url FROM ${T} WHERE Name LIKE '%${NAME_KEY}%' AND "담당자" LIKE ${q(`%${cfg.userId}%`)} AND "date:기간:start" >= ${q(week.monday)} AND "date:기간:start" <= ${q(week.friday)} LIMIT 1`);
  if (exists.length) return { created: false };
  // 본보기: 내 페이지 중 가장 최근 주
  const src = await mcp.sql(cfg.dataSourceId, `SELECT url FROM ${T} WHERE Name LIKE '%${NAME_KEY}%' AND "담당자" LIKE ${q(`%${cfg.userId}%`)} AND "date:기간:start" < ${q(week.monday)} ORDER BY "date:기간:start" DESC LIMIT 1`);
  if (!src.length) throw friendly('본보기로 삼을 이전 주 운영성 업무 페이지를 못 찾았어요. 노션에서 한 번 직접 만들어 주세요.');
  const sourceId = bareId(String(src[0].url).split('/').pop().split('?')[0]);
  const id = newPageId(await mcp.call('notion-duplicate-page', { page_id: sourceId }), sourceId);
  if (!id) throw friendly('노션에서 페이지를 복제하지 못했어요.');
  // 복제는 뒤에서 천천히 끝난다 → 내용이 다 들어와서 더 바뀌지 않을 때까지 기다림
  let md = '', prev = null;
  for (let k = 0; k < 20; k++) {
    await sleep(2000);
    md = await mcp.fetchPage(id).catch(() => '');
    if (md.includes('</columns>') && md === prev) break;
    prev = md;
  }
  const t = retemplate(md, week);
  if (!t) throw friendly(`노션에 "${week.name}" 페이지를 복제했지만 내용이 아직 준비되지 않았어요. 잠시 뒤 노션에서 확인해 주세요.`);
  await mcp.call('notion-update-page', {
    page_id: id, command: 'update_properties', allow_async: false,
    properties: { Name: week.name, 상태: '시작 전', 'date:기간:start': week.monday, 'date:기간:end': week.friday, 'date:기간:is_datetime': 0, 'process(d)': null, 'workload(d)': null, 'init workload(d)': null },
  });
  await mcp.call('notion-update-page', { page_id: id, command: 'update_content', allow_async: false, content_updates: [{ old_str: t.old, new_str: t.neu }] });
  return { created: true, id };
}

// ---------- 노션 블록 (API 키 쪽) ----------
const text = (content) => [{ type: 'text', text: { content } }];
function blocks(week, { calloutIcon = { type: 'emoji', emoji: '👉' }, calloutColor = 'yellow_background', heading = 'heading_3' } = {}) {
  const col = (label) => ({ object: 'block', type: 'column', column: { children: [
    { object: 'block', type: heading, [heading]: { rich_text: text(label) } },
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [] } },
  ] } });
  const row = (labels) => ({ object: 'block', type: 'column_list', column_list: { children: labels.map(col) } });
  const labels = week.days.map((d) => d.label);
  return [
    { object: 'block', type: 'callout', callout: { rich_text: [], icon: calloutIcon, color: calloutColor } },
    row(labels.slice(0, 3)), row(labels.slice(3)),
  ];
}

async function createViaApi(client, cfg, week) {
  const title = { property: 'Name', title: { contains: NAME_KEY } };
  const exists = await client.queryDataSource(cfg.dataSourceId, { filter: { and: [title, { property: '담당자', people: { contains: cfg.userId } }, { property: '기간', date: { on_or_after: week.monday } }, { property: '기간', date: { on_or_before: week.friday } }] } });
  if (exists.length) return { created: false };
  const before = await client.queryDataSource(cfg.dataSourceId, {
    filter: { and: [title, { property: '담당자', people: { contains: cfg.userId } }, { property: '기간', date: { before: week.monday } }, { property: '기간', date: { on_or_after: addDays(week.monday, -90) } }] },
    sorts: [{ property: '기간', direction: 'descending' }],
  });
  const src = before[0];
  if (!src) throw friendly('본보기로 삼을 이전 주 운영성 업무 페이지를 못 찾았어요. 노션에서 한 번 직접 만들어 주세요.');
  // 본보기 페이지의 속성(담당자·Cell·우선순위·Roadmap)과 모양(아이콘, 안내 칸, 제목 종류)을 그대로 따름
  const p = src.properties || {};
  const properties = {
    Name: { title: text(week.name) },
    상태: { status: { name: '시작 전' } },
    기간: { date: { start: week.monday, end: week.friday } },
    담당자: { people: ((p['담당자'] && p['담당자'].people) || [{ id: cfg.userId }]).map((u) => ({ id: u.id })) },
  };
  for (const k of ['Cell', '우선순위']) if (p[k] && p[k].select) properties[k] = { select: { name: p[k].select.name } };
  if (p.Roadmap && p.Roadmap.relation && p.Roadmap.relation.length) properties.Roadmap = { relation: p.Roadmap.relation.map((r) => ({ id: r.id })) };
  const look = {};
  try {
    const top = await client.listChildren(src.id);
    const callout = top.find((b) => b.type === 'callout');
    if (callout) { look.calloutIcon = callout.callout.icon || undefined; look.calloutColor = callout.callout.color; }
  } catch { /* 모양은 기본값으로 */ }
  const page = await client.request('POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: cfg.dataSourceId },
    ...(src.icon && ['emoji', 'external'].includes(src.icon.type) ? { icon: src.icon } : {}),
    properties,
    children: blocks(week, look),
  });
  return { created: true, id: page.id };
}

module.exports = { weekOf, canCreate, columnsMarkdown, retemplate, newPageId, blocks, createViaMcp, createViaApi };
