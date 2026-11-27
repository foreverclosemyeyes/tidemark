// 진료용 요약을 종이 한 장(A4)에 맞춰 짠 것. "PDF · 인쇄"를 누르거나 브라우저에서 인쇄할 때만 쓰인다.
// 읽는 사람은 의사다 (진료 몇 분 안에 훑어본다). 그래서 위에서부터: 본인이 말하고 싶은 것 → 숫자(그 전 기간과 나란히) → 그림 → 약 → 눈에 띄는 날 → 메모.
// 그림은 흐름 탭과 같은 한 장(sheet.js)을 종이 너비로 그린다. 앱이 풀이한 글(신호·읽기)은 넣지 않고 적은 것만 넣는다 (사용자가 요청, 2026-11-27).
import { summary } from '../analysis.js';
import { DISCLAIMER, LEVELS } from '../constants.js';
import { durText, longDate, md, parse, today } from '../dates.js';
import { esc } from '../dom.js';
import { F, T } from '../i18n.js';
import { itemOn } from '../store.js';
import { clinicData, kindName, shortDate, summaryRows } from './clinic.js';
import { columns, flowSource, sheetHtml } from './sheet.js';

const PAGE = 680;   // 그림 너비 (A4에서 여백을 뺀 너비쯤). 그림은 종이 너비에 맞춰 늘거나 준다.
const DAILY = 10;   // 이 날 수까지는 날마다 날짜를 적고, 넘으면 월요일마다 적는다
const one = (x) => (Math.round(x * 10) / 10).toFixed(1);

// days: 오늘까지 며칠을 담을지. since: "지난 진료부터"로 뽑을 때 그 진료일 (아니면 '')
export function printoutHtml(days, since) {
  const s = summary(days), r = summaryRows(s), c = clinicData();
  // 하루가 한 칸. 월요일마다 날짜를 적고 세로 줄을 긋는다 (짧은 기간은 날마다 날짜).
  const cols = columns(s.dates[0], s.dates.length, 1, flowSource());
  const daily = days <= DAILY, mondays = cols.map((_, i) => i).filter((i) => parse(cols[i].start).getDay() === 1);
  const labels = (daily ? cols.map((_, i) => i) : mondays).map((i) => [i, shortDate(cols[i].start), daily ? 'mid' : 'left']);
  const sheet = sheetHtml({ cols, width: PAGE, labels, guides: daily ? [] : mondays.filter(Boolean), colors: true, tall: true });
  // 맨 위 숫자 칸: 평균을 크게, 그 아래 가장 낮은 날–높은 날과 바로 앞 같은 길이 기간의 평균
  const stat = (name, st, fmt) => `<div class="po-stat"><span>${name}</span><b>${st ? fmt(st.avg) : '–'}</b><small>${st ? `${fmt(st.min)} – ${fmt(st.max)}` : T('기록 없음')}</small>${
    st && st.prev != null ? `<small>${F('그 전 {0}', fmt(st.prev))}</small>` : ''}</div>`;
  const num = (x) => (Number.isInteger(x) ? String(x) : one(x)), dur = (m) => durText(Math.round(m));
  const stats = [['mood', T('기분')], ['energy', T('에너지')], ['conf', T('자신감')]].filter(([k]) => itemOn(k)).map(([k, name]) => stat(name, s[k], num)).join('')
    + (itemOn('sleep') ? stat(T('수면'), s.sleep, dur) : '');
  // 글로 된 부분: 제목과 줄들. 줄은 [왼쪽, 오른쪽] 또는 글 한 줄
  const block = (title, rows) => (rows.length ? `<section class="po-block"><h3>${title}</h3>${rows.map((x) => (Array.isArray(x)
    ? `<div class="po-row"><span>${x[0]}</span><span>${x[1]}</span></div>` : `<div class="po-line">${x}</div>`)).join('')}</section>` : '');
  const count = ([name, n]) => [esc(name), F('{0}일', n)];
  const log = c.log.filter((x) => x.date >= s.dates[0]);
  const first = md(parse(s.dates[0])), last = md(parse(s.dates[s.dates.length - 1]));
  return `
    <header class="po-head"><div><h1>${T('진료용 요약')}</h1>
      <p>${since ? F('지난 진료 {0} → 오늘 {1}', first, last) : `${first} – ${last}`} · ${F('기록 {0}일 / {1}일', s.got.length, s.dates.length)}</p></div>
      <div class="po-brand">Tidemark<small>${longDate(today())}</small></div></header>
    ${c.notes.length ? `<section class="po-talk"><h3>${T('진료 때 말하고 싶은 것')}</h3><ol>${c.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>` : ''}
    ${stats ? `<div class="po-stats">${stats}</div>` : ''}
    <div class="po-figs"><div class="flowkeys">${sheet.keys}</div>${sheet.body}</div>
    <div class="po-cols">
      ${itemOn('meds') ? block(T('약 (먹은 날)'), r.meds.map(([name, v]) => [esc(name), v])) : ''}
      ${block(T('진료 · 약 변경 기록'), log.map((x) => `<small>${shortDate(x.date)} · ${kindName(x.kind)}</small>${esc(x.text || '')}`))}
      ${itemOn('fx') ? block(T('부작용'), s.fx.map(count)) : ''}
      ${block(T('눈에 띄는 날'), r.flags)}
      ${itemOn('psy') ? block(T('정신병적 증상'), s.psych.map(count)) : ''}
      ${block(T('기분이 높았던 날 체크한 항목'), s.signs.map(count))}
      ${block(T('메모'), s.notes.map(([d, note]) => `<small>${shortDate(d)}</small>${esc(note)}`))}
    </div>
    <footer class="po-foot">${T('본인이 휴대폰에 날마다 직접 적은 기록이에요 · 위아래로 같은 자리가 같은 날 · 증상은 높이 솟을수록 심했던 날')}<br>
      ${T('“그 전”은 바로 앞의 같은 길이 기간의 평균')} · ${F('증상은 {0}~{1} 다섯 단계로 적은 것', LEVELS[0], LEVELS[4])}. ${DISCLAIMER}</footer>`;
}
