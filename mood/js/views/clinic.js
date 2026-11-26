// 진료 화면: 진료에 들고 갈 것들만 둔다. 다음 진료일, 진료 때 말할 것, 진료·약 변경 기록, 약을 바꾼 앞뒤, 최근 7일 읽기, 요약 내보내기(PDF·글).
// 그래프는 여기에 두지 않는다: 흐름 탭의 한 장(sheet.js)과 겹쳐서, 화면에서는 흐름에서 보고 PDF에만 같은 그림이 들어간다 (사용자가 정함, 2026-11-25).
import { aiKey, aiResult } from '../ai.js';
import { medChanges, recentState, summary } from '../analysis.js';
import { DISCLAIMER, LEVELS, customText } from '../constants.js';
import { durText, md, parse, today } from '../dates.js';
import { app, esc, sheet, showSheet } from '../dom.js';
import { F, T } from '../i18n.js';
import { IC } from '../icons.js';
import { clinicView, ui } from '../state.js';
import { customDefs, db } from '../store.js';
import { settingsButton } from './settings.js';

// 다음 진료일, 말할 것 목록, 진료·약 변경 기록.
// { next: 'YYYY-MM-DD' 또는 '', notes: ['…', …], log: [{ date, kind: 'visit'(진료 메모) | 'med'(약 바꾼 날), text }, …] (날짜순) }
export function clinicData() {
  const c = db.clinic || (db.clinic = { next: '', notes: [] });
  if (!c.log) c.log = [];
  return c;
}
export const kindName = (kind) => (kind === 'med' ? T('약 변경') : T('진료'));
// 가장 최근에 다녀온 진료일 (없으면 '')
const lastVisit = () => { const v = clinicData().log.filter((x) => x.kind === 'visit' && x.date <= today()); return v.length ? v[v.length - 1].date : ''; };
// 요약 기간(주). "진료 후"를 골랐으면 지난 진료일이 들어가도록 주 단위로 올림한다 (최대 8주).
export function clinicWeeks() {
  if (clinicView.weeks !== 'since') return clinicView.weeks;
  const from = lastVisit();
  return from ? Math.max(1, Math.min(8, Math.ceil((1 - daysUntil(from)) / 7))) : 2;
}

export const shortDate = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const dateList = (list) => list.map(shortDate).join(', ');
const daysUntil = (date) => Math.round((parse(date) - parse(today())) / 86400000);
const one = (x) => (Math.round(x * 10) / 10).toFixed(1);

function nextText() {
  const { next } = clinicData();
  if (!next) return '';
  const left = daysUntil(next);
  return left > 0 ? F('진료까지 {0}일', left) : left === 0 ? T('오늘 진료') : '';
}

// 요약에 들어갈 줄들: [이름, 내용]. 화면과 복사용 글이 같은 줄을 쓴다.
export function summaryRows(s) {
  const range = (st, fmt) => (st ? `${fmt(st.avg)} (${fmt(st.min)}–${fmt(st.max)})` : T('기록 없음'));
  const num = (x) => (Number.isInteger(x) ? String(x) : one(x));
  const dur = (m) => durText(Math.round(m));
  const flags = [
    [T('스트레스 높음 이상'), s.high.stress], [T('불안 높음 이상'), s.high.anx],
    [T('정신병적 증상'), s.high.psy], [T('죽고 싶은 생각'), s.high.si], [T('5시간 미만 수면'), s.shortSleep], [T('생리'), s.period],
  ].filter(([, list]) => list.length).map(([name, list]) => [name, `${F('{0}일', list.length)} · ${dateList(list)}`]);
  return {
    averages: [[T('기분'), range(s.mood, num)], [T('에너지'), range(s.energy, num)], [T('자신감'), range(s.conf, num)], [T('수면'), range(s.sleep, dur)]],
    flags,
    signs: s.signs.map(([label, c]) => [label, F('{0}일', c)]),
    meds: s.meds.map(([m, c]) => [`${m.name}${m.dose ? ` ${m.dose}` : ''}`, F('{0}일 중 {1}일', s.dates.length, c)]),
  };
}

// 메신저나 메모 앱에 붙여 넣을 수 있는 글
export function summaryText(weeks) {
  const s = summary(weeks), r = summaryRows(s), talk = clinicData().notes;
  const part = (title, rows) => (rows.length ? [`\n[${title}]`, ...rows.map(([k, v]) => `${k}: ${v}`)] : []);
  return [
    `${T('진료용 요약')} · ${md(parse(s.dates[0]))} – ${md(parse(s.dates[s.dates.length - 1]))} · ${F('기록 {0}일 / {1}일', s.got.length, s.dates.length)}`,
    ...(talk.length ? [`\n[${T('진료 때 말할 것')}]`, ...talk.map((x) => `- ${x}`)] : []),
    ...part(T('평균 (가장 낮은 날–가장 높은 날)'), r.averages), ...part(T('눈에 띄는 날'), r.flags),
    ...(s.signals.length ? [`\n[${T('지금 떠 있는 신호')}]`, ...s.signals.map((x) => `- ${x}`)] : []),
    ...part(T('기분이 높았던 날 체크한 항목'), r.signs), ...part(T('정신병적 증상'), s.psych.map(([name, c]) => [name, F('{0}일', c)])), ...part(T('부작용'), s.fx.map(([name, c]) => [name, F('{0}일', c)])), ...part(T('약 먹은 날'), r.meds),
    ...part(T('내 항목'), customDefs().map((c) => [c.name, s.got.filter((e) => customText(c, (e.custom || {})[c.id])).map((e) => `${shortDate(e.date)} ${customText(c, e.custom[c.id])}`).join(', ')]).filter(([, v]) => v)),
    ...part(T('진료 · 약 변경 기록'), s.log.filter((x) => x.date >= s.dates[0]).map((x) => [`${shortDate(x.date)} ${kindName(x.kind)}`, x.text || '–'])),
    ...(s.notes.length ? [`\n[${T('메모')}]`, ...s.notes.map(([d, note]) => `${shortDate(d)} ${note}`)] : []),
    `\n${F('증상은 {0}~{1} 다섯 단계로 적은 것', LEVELS[0], LEVELS[4])}. ${DISCLAIMER}`,
  ].join('\n');
}

const bullets = (list) => (list.length ? `<ul>${list.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
// 표 한 줄: 첫 칸은 이름, 나머지는 값
const tr = (cells, head) => `<div class="tr${head ? ' th' : ''}">${cells.map((c) => `<span>${c}</span>`).join('')}</div>`;

// AI가 쓴 글을 화면에 옮긴다: "## " 로 시작하는 줄은 제목, "- " 로 시작하는 줄은 목록, 나머지는 문단. 글자는 전부 그대로 보여 준다 (HTML로 읽지 않는다).
function aiHtml(text) {
  let html = '', list = false;
  const close = () => { if (list) { html += '</ul>'; list = false; } };
  text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    if (l.startsWith('## ')) { close(); html += `<h3>${esc(l.slice(3))}</h3>`; } else if (l.startsWith('- ')) { if (!list) { html += '<ul>'; list = true; } html += `<li>${esc(l.slice(2))}</li>`; } else { close(); html += `<p>${esc(l)}</p>`; }
  });
  close();
  return html;
}

export function viewClinic() {
  const c = clinicData(), pick = clinicView.weeks, state = recentState(), changes = medChanges(), out = aiResult();
  const del = (act, i) => `<button class="txt dim" data-act="${act}" data-i="${i}" aria-label="${T('삭제')}">✕</button>`;
  const range = (w, label) => `<button data-act="clinicWeeks" data-w="${w}" aria-pressed="${pick === w}">${label}</button>`;
  app.innerHTML = `
    <header class="top"><div><div class="over">${nextText() || T('진료에 들고 갈 것들')}</div><h1>${T('진료')}</h1></div>${settingsButton()}</header>

    <section class="card list">
      <label class="li"><span class="lk">${T('다음 진료일')}</span><input type="date" id="c-next" value="${esc(c.next || '')}"></label>
    </section>

    <div class="sec">${T('진료 때 말할 것')}</div>
    <section class="card list" id="talk">
      ${c.notes.map((x, i) => `<div class="li"><span class="lk talk">${esc(x)}</span>${del('clinicNoteDel', i)}</div>`).join('')}
      <div class="li"><input type="text" id="c-note" maxlength="200" placeholder="${T('생각날 때 한 줄씩 적어 두기')}" autocomplete="off">
        <button class="mini" data-act="clinicNoteAdd">${T('추가')}</button></div>
    </section>

    <div class="sec">${T('진료 · 약 변경 기록')}</div>
    <section class="card list" id="log">
      ${c.log.map((x, i) => `<div class="li"><span class="lk talk"><small>${shortDate(x.date)} · ${kindName(x.kind)}</small>${esc(x.text)}</span>${del('logDel', i)}</div>`).reverse().join('')}
      <div class="li logadd"><button class="mini" data-act="logAdd" data-kind="visit">${T('+ 진료 메모')}</button>
        <button class="mini" data-act="logAdd" data-kind="med">${T('+ 약 바꾼 날')}</button></div>
    </section>

    <div class="sec">${T('요약 내보내기')}</div>
    <div class="seg exp">${range(1, T('1주'))}${range(2, T('2주'))}${range(4, T('4주'))}${lastVisit() ? range('since', T('진료 후')) : ''}</div>
    <div class="pair">
      <button class="btn" data-act="printSummary">${T('PDF · 인쇄')}</button>
      <button class="btn gray" data-act="copySummary">${T('글로 복사')}</button>
    </div>
    <p class="secnote" style="margin-top:10px">${T('PDF에는 흐름 그림과 위에 적은 것들이 한 장으로 들어가요. “PDF · 인쇄”를 누르면 아이폰 인쇄 화면이 뜨고, 미리보기를 두 손가락으로 벌린 뒤 공유 버튼을 누르면 저장하거나 보낼 수 있어요.')}</p>

    ${changes.map((ch) => `<div class="sec">${F('약을 바꾼 뒤 · {0}', md(parse(ch.date)))}</div>
    <section class="card tbl">${ch.text ? `<div class="tbl-t">${esc(ch.text)}</div>` : ''}${tr(['', T('앞 2주'), F('뒤 {0}일', ch.after)], true)}${ch.rows.map((r) => tr(r)).join('')}</section>`).join('')}

    ${state ? `<div class="sec">${T('최근 7일')}</div>
    <section class="card state"><b>${state.title}</b>
      ${state.flow ? `<div class="flow">${state.flow}</div>` : ''}
      ${bullets(state.points)}
      ${state.lead ? `<div class="flow">${state.lead}</div>` : ''}
      ${state.notes.map((x) => `<div class="beyond">${x}</div>`).join('')}
      <p>${T('진단이 아니에요. 진료 때 보여 주며 이야기해 보세요.')}</p></section>` : ''}

    <div class="sec">${T('AI 분석')}</div>
    ${aiKey() ? `<button class="btn" data-act="aiRun"${ui.aiBusy ? ' disabled' : ''}>${ui.aiBusy ? T('기록을 읽는 중이에요… 1~2분 걸려요') : out ? T('AI 분석 다시 받기') : T('AI 분석 받기')}</button>
    ${ui.aiError ? `<section class="card hint" style="margin-top:12px"><div>${esc(ui.aiError)}</div></section>` : ''}
    ${out ? `<section class="card ai" style="margin-top:12px"><div class="ai-date">${F('{0}에 받은 분석', md(parse(out.date)))}</div>${aiHtml(out.text)}
      ${out.cut ? `<p class="mut">${T('글이 길어서 여기서 잘렸어요.')}</p>` : ''}</section>` : ''}` : ''}
    <section class="card list" style="margin-top:12px">
      <button class="li add" data-act="aiKeyOpen">${IC.spark}&nbsp; ${aiKey() ? T('API 키 바꾸기 · 지우기') : T('AI 분석을 쓰려면 API 키 넣기')}</button>
      <button class="li add" data-act="copyAi">${IC.note}&nbsp; ${T('AI에게 물어볼 글 복사 (최근 8주)')}</button>
    </section>
    <p class="secnote">${T('“AI 분석 받기”를 누르면 최근 6달의 기록과 메모가 Anthropic(Claude)으로 전송되고, AI가 기록 전체를 읽고 쓴 풀이가 여기에 떠요. 누를 때만 전송돼요. 내 API 키로 부르는 것이라 한 번에 몇백 원쯤 들어요.')}
      ${T('AI는 의사가 아니에요. 정신과 진료 지식을 바탕으로 읽으라고 시켰을 뿐이라, 풀이는 진단이 아니고 틀릴 수 있어요. 진료 때 이야기할 거리로 써 주세요.')}</p>
    <p class="foot">${DISCLAIMER}</p>`;
}

// 진료 메모 / 약 바꾼 날을 적는 화면
export function openLog(kind) {
  sheet.innerHTML = `<div class="sheet-in">
    <div class="sheet-top">
      <button class="txt" data-act="close">${T('취소')}</button>
      <div class="st"><b>${kind === 'med' ? T('약 바꾼 날') : T('진료 메모')}</b></div>
      <button class="txt strong" data-act="logSave" data-kind="${kind}">${T('저장')}</button>
    </div>
    <section class="card list">
      <label class="li"><span class="lk">${T('날짜')}</span><input type="date" id="l-date" value="${today()}" max="${today()}"></label>
      <div class="li"><textarea id="l-text" rows="4" maxlength="500" placeholder="${kind === 'med' ? T('예: 브린텔릭스 10mg → 15mg') : T('의사가 한 말, 바뀐 처방, 다음에 할 것')}"></textarea></div>
    </section>
    <p class="secnote">${kind === 'med' ? T('흐름 그래프의 그날 자리에 세로선으로 표시돼요.') : T('적어 두면 요약을 “진료 후” 기간으로 뽑을 수 있어요.')}</p>
  </div>`;
  showSheet();
}

// API 키를 넣고 바꾸고 지우는 화면
export function openAiKey() {
  const has = !!aiKey();
  sheet.innerHTML = `<div class="sheet-in">
    <div class="sheet-top">
      <button class="txt" data-act="close">${T('취소')}</button>
      <div class="st"><b>${T('API 키')}</b></div>
      <button class="txt strong" data-act="aiKeySave">${T('저장')}</button>
    </div>
    <section class="card list">
      <div class="li"><input type="password" id="ai-key" placeholder="sk-ant-…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(aiKey())}"></div>
      ${has ? `<button class="li add" data-act="aiKeyDel">${T('키와 받은 분석 지우기')}</button>` : ''}
    </section>
    <p class="secnote">${T('Anthropic 콘솔(platform.claude.com)에 가입해 결제 수단을 넣고, API keys에서 키를 만들어 여기에 붙여 넣어요. 키를 만들 때 워크스페이스를 하나 골라 주세요.')}
      ${T('키는 이 폰에만 저장되고 백업 파일에는 들어가지 않아요. 쓴 만큼 내 계정에서 돈이 나가요.')}</p>
  </div>`;
  showSheet();
}
