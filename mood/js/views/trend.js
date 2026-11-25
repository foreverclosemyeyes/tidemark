// 흐름 화면: 고른 기간(주 / 월 / 3달 / 년)을 한 장으로 본다. 그림은 sheet.js가 그린다.
// 예전에는 항목마다 그래프 카드가 따로 있었고 달력도 있었는데, 길게 내려야 하고 서로 견줄 수 없어서 한 장으로 바꿨다 (사용자가 정함, 2026-11-25).
import { DISCLAIMER } from '../constants.js';
import { WD, addDays, ds, durText, longDate, md, monthTitle, parse, today, weekStart } from '../dates.js';
import { app } from '../dom.js';
import { EN, F, T } from '../i18n.js';
import { IC } from '../icons.js';
import { trend } from '../state.js';
import { itemOn } from '../store.js';
import { fontScale } from '../theme.js';
import { settingsButton } from './settings.js';
import { columns, few, flowSource, sheetHtml } from './sheet.js';

// 주와 월은 달력의 그 주·그 달이고, 3달과 년은 anchor가 든 주에서 끝나는 13주·52주다 (넘길 때는 4주·13주씩).
const LONG = { quarter: [13, 4], year: [52, 13] };   // [주 수, 넘기는 주 수]
export function trendRange(anchor) {
  if (trend.mode === 'week') return { start: weekStart(anchor), n: 7 };
  if (LONG[trend.mode]) return { start: addDays(weekStart(anchor), -7 * (LONG[trend.mode][0] - 1)), n: 7 * LONG[trend.mode][0] };
  const d = parse(anchor);
  return { start: ds(new Date(d.getFullYear(), d.getMonth(), 1)), n: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() };
}
function shiftAnchor(anchor, step) {
  if (trend.mode === 'week') return addDays(anchor, 7 * step);
  if (LONG[trend.mode]) return addDays(anchor, 7 * LONG[trend.mode][1] * step);
  const d = parse(anchor);
  return ds(new Date(d.getFullYear(), d.getMonth() + step, 1));
}
// 그쪽으로 넘길 수 있는지: 미래로는 못 간다 (3달·년은 끝나는 주가 이번 주를 넘지 않게)
export const canShift = (step) => (LONG[trend.mode] ? step < 0 || weekStart(trend.anchor) < weekStart(today())
  : trendRange(shiftAnchor(trend.anchor, step)).start <= today());
export function shiftTrend(step) { trend.anchor = shiftAnchor(trend.anchor, step); trend.pick = null; }

const MODES = () => [['week', EN ? 'Week' : T('주')], ['month', EN ? 'Month' : T('월')], ['quarter', EN ? '3 mo' : T('3달')], ['year', EN ? 'Year' : T('년')]];
const ym = (d) => (EN ? d.toLocaleString('en', { month: 'short', year: 'numeric' }) : `${d.getFullYear()}년 ${d.getMonth() + 1}월`);
const monthName = (d) => (EN ? d.toLocaleString('en', { month: 'short' }) : `${d.getMonth() + 1}월`);

export function viewTrend() {
  const mode = trend.mode, r = trendRange(trend.anchor), src = flowSource(), byWeek = mode === 'year';
  const cols = byWeek ? columns(r.start, r.n / 7, 7, src) : columns(r.start, r.n, 1, src);
  const days = cols.reduce((n, c) => n + c.n, 0), sD = parse(r.start), eD = parse(addDays(r.start, r.n - 1));
  // 아래에 적을 글과 세로 줄: 주는 요일, 월은 7일마다 날짜, 3달·년은 달이 바뀌는 자리에 달 이름
  const newMonth = (i) => i > 0 && parse(cols[i].end).getMonth() !== parse(cols[i - 1].end).getMonth();
  const width = Math.max(200, Math.min(app.clientWidth, 480) - 32 - 32);
  // 맨 왼쪽 칸의 달 이름은 바로 옆에 다음 달 이름이 올 때는 뺀다 (글자가 겹친다)
  const firstMonth = cols.findIndex((_, i) => newMonth(i)), room = Math.ceil((byWeek ? 16 : 34) * fontScale() / (width / cols.length));
  const labels = mode === 'week' ? cols.map((c, i) => [i, WD()[parse(c.start).getDay()], 'mid'])
    : mode === 'month' ? cols.map((c, i) => [i, parse(c.start).getDate(), 'mid']).filter(([i]) => i % 7 === 0)
      : cols.map((c, i) => [i, byWeek ? parse(c.end).getMonth() + 1 : monthName(parse(c.end)), 'left']).filter(([i]) => (i === 0 ? firstMonth > room : newMonth(i)));
  const guides = mode === 'week' || mode === 'month' ? [] : cols.map((_, i) => i).filter(newMonth);
  // 날짜를 눌러 그날 값을 보는 것은 하루가 한 칸인 보기에서만
  const pick = byWeek ? null : trend.pick, pickDate = pick == null ? null : cols[pick].start, pickE = pickDate ? src.entries[pickDate] : null;
  const pickText = !pickE ? '' : [pickE.mood != null && itemOn('mood') ? `${T('기분')} ${pickE.mood}` : '', pickE.energy != null && itemOn('energy') ? `${T('에너지')} ${pickE.energy}` : '',
    pickE.sleepMin != null && itemOn('sleep') ? durText(pickE.sleepMin) : ''].filter(Boolean).join(' · ');
  const title = mode === 'week' ? `${md(sD)} – ${md(eD)}` : mode === 'month' ? monthTitle(sD) : `${ym(sD)} – ${ym(eD)}`;
  const foot = byWeek ? T('한 칸이 한 주예요. 선은 그 주의 평균이고, 띠는 진할수록 심했던 주예요. 아래 숫자는 달이에요.')
    : T('위아래로 같은 자리가 같은 날이에요. 띠는 진할수록 심했던 날이고, 날짜를 누르면 그날 값을 볼 수 있어요.');
  app.innerHTML = `
    <header class="top"><div><div class="over">${F('기록 {0}일', days)}</div><h1>${T('흐름')}</h1></div>
      <div class="top-r"><div class="segc four">${MODES().map(([m, name]) => `<button data-act="mode" data-mode="${m}" aria-pressed="${mode === m}">${name}</button>`).join('')}</div>${settingsButton()}</div></header>
    ${src.demo ? `<section class="card hint"><div><b>${T('예시 기록으로 그린 흐름이에요.')}</b><br>${T('매일 적어 두면 내 기록으로 이렇게 한 장에 보여요. 만들어 낸 예시라 저장되지 않아요.')}
        <button class="mini" data-act="demo" style="display:block;margin-top:10px">${T('예시 닫기')}</button></div></section>` : ''}
    <div class="pnav">
      <button data-act="shift" data-step="-1" aria-label="${T('이전')}">‹</button><span>${title}</span>
      <button data-act="shift" data-step="1" aria-label="${T('다음')}" ${canShift(1) ? '' : 'disabled'}>›</button></div>
    ${pickDate ? `<div class="pickbar"><span>${longDate(pickDate)}<small>${pickE ? pickText : T('기록 없음')}</small></span>
      ${src.demo ? '' : `<button class="mini" data-act="openDay" data-date="${pickDate}">${pickE ? T('기록 열기') : T('기록하기')}</button>`}</div>` : ''}
    <section class="card flow${byWeek ? '' : ' plot'}" data-n="${cols.length}" data-w="${width - Math.round(22 * fontScale())}">${sheetHtml({ cols, width, labels, guides, pick, scale: fontScale() })}</section>
    ${!src.demo && few() ? `<section class="card list"><button class="li add" data-act="demo">${IC.spark}&nbsp; ${T('예시로 미리 보기')}</button></section>` : ''}
    ${itemOn('note') && !src.demo ? `<section class="card list"><button class="li add" data-act="notes">${IC.note}&nbsp; ${T('메모 모아 보기')}</button></section>` : ''}
    <p class="foot">${foot}<br>${DISCLAIMER}</p>`;
}
