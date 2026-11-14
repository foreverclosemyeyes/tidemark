// 오늘 화면
import { DISCLAIMER, HELPLINE, LEVELS, SIGNS, SI_CARE_FROM, SYMPTOMS, cafMg, customText, drinkText, fxNames, nameOf, psyNames } from '../constants.js';
import { WD, addDays, durText, longDate, parse, today, weekStart } from '../dates.js';
import { app, esc } from '../dom.js';
import { backupDue, daysSinceBackup } from '../files.js';
import { F, T } from '../i18n.js';
import { IC } from '../icons.js';
import { doseRowsHtml, medsFor, medsText } from '../meds.js';
import { standalone, ui } from '../state.js';
import { careOn, customDefs, db, itemOn } from '../store.js';
import { moodFill, tone } from '../theme.js';
import { settingsButton } from './settings.js';

// ---------- 오늘 화면 ----------
// 목록 한 줄. focus를 주면 누를 수 있는 줄이 되고, 기록 화면이 그 항목만 띄운 채 열린다.
export const li = (left, right, focus) => (focus
  ? `<button class="li" data-act="record" data-focus="${focus}"><span class="lk">${left}</span><span class="lv">${right}</span></button>`
  : `<div class="li"><span class="lk">${left}</span><span class="lv">${right}</span></div>`);

export function viewToday() {
  const t = today(), sel = ui.selected, ws = weekStart(sel), e = db.entries[sel];

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i), en = db.entries[d], dt = parse(d);
    return `<button class="cday${d === sel ? ' sel' : ''}${d === t ? ' now' : ''}" data-act="pick" data-date="${d}" ${d > t ? 'disabled' : ''}
      aria-label="${longDate(d)}, ${en ? `${T('기분')} ${en.mood == null ? '–' : en.mood}` : T('기록 없음')}">
      <span class="cw">${WD()[dt.getDay()]}</span><span class="cdot${en && en.mood == null ? ' part' : ''}" ${en && en.mood != null ? `style="${moodFill(en.mood)}"` : ''}>${dt.getDate()}</span></button>`;
  }).join('');

  const hint = (!standalone() && !db.settings.hintClosed)
    ? `<div class="card hint"><div><b>${T('홈 화면에 추가해서 쓰세요.')}</b><br>${T('사파리 아래쪽 공유 버튼(네모에 화살표) → “홈 화면에 추가”를 누르면 앱처럼 열려요.')}</div>
       <button class="x" data-act="closeHint" aria-label="${T('닫기')}">✕</button></div>` : '';

  // 기록이 하나도 없을 때만: 이 앱이 무엇에 쓰는 것인지 한 줄과, 예시 요약으로 가는 단추
  const intro = !careOn() || Object.keys(db.entries).length ? '' : `<section class="card intro"><b>${T('매일 10초 적어 두면, 진료 날 한 장으로 보여 드려요.')}</b>
      <p>${T('기분 · 잠 · 약을 적어 두면 지난 몇 주가 그래프와 한 장짜리 요약으로 정리돼요. “그동안 어땠어요?”에 기억 대신 기록으로 답할 수 있어요.')}</p>
      <button class="mini" data-act="demoClinic">${T('예시 요약 보기')}</button></section>`;

  const since = daysSinceBackup();
  const backup = backupDue()
    ? `<div class="card hint"><div><b>${since == null ? T('아직 백업한 적이 없어요.') : F('백업한 지 {0}일 됐어요.', since)}</b><br>${T('기록은 이 폰에만 있어요. 백업 파일을 만들어 두면 폰을 바꿔도 안전해요.')}
         <button class="mini" data-act="export" style="display:block;margin-top:10px">${T('지금 백업하기')}</button></div>
       <button class="x" data-act="snoozeBackup" aria-label="${T('닫기')}">✕</button></div>` : '';

  app.innerHTML = `
    <header class="top">
      <div><div class="over">${sel === t ? longDate(sel) : T('지난 기록')}</div><h1>${sel === t ? T('오늘') : longDate(sel)}</h1></div>
      ${settingsButton()}
    </header>
    ${intro}${hint}${sel === t ? backup : ''}
    ${sel === t && e && e.si >= SI_CARE_FROM ? `<div class="card signal"><i></i><span>${F('죽고 싶은 생각이 강한 날이에요. 혼자 버티지 않아도 돼요. {0}에 전화하거나 다니는 병원에 연락해 보세요.',
    `<a href="tel:${HELPLINE}">${T('109 (자살예방상담전화, 24시간)')}</a>`)}</span></div>` : ''}
    <div class="weekbar">
      <button class="nav" data-act="week" data-step="-1" aria-label="${T('이전 주')}">‹</button>
      <div class="days">${days}</div>
      <button class="nav" data-act="week" data-step="1" aria-label="${T('다음 주')}" ${addDays(ws, 7) > t ? 'disabled' : ''}>›</button>
    </div>
    ${tilesHtml(e || {})}
    ${itemOn('meds') ? medCard(sel) : ''}
    ${detailHtml(e || {})}
    <button class="btn${e ? ' gray' : ''}" data-act="record">${e ? T('이어서 적기') : T('기록하기')}</button>
    ${sel !== t ? `<button class="btn plain" data-act="goToday">${T('오늘로 돌아가기')}</button>` : ''}
    <p class="foot">${DISCLAIMER}</p>`;
}

// 가운데(보통)에서 얼마나 위·아래인지 보여 주는 막대. pos는 0~1, 0.5가 가운데
export const level = (pos) => {
  const p = Math.max(0, Math.min(1, pos)) * 100, lo = Math.min(50, p), w = Math.abs(p - 50);
  return `<div class="lvl" aria-hidden="true"><i style="left:${lo.toFixed(1)}%;width:${w.toFixed(1)}%"></i><b style="left:${p.toFixed(1)}%"></b></div>`;
};
// 타일을 누르면 기록 화면의 그 항목으로 바로 간다. 아직 안 적은 항목도 칸은 그대로 있고 '기록 없음'으로 보인다.
// 네 칸의 높이가 늘 같도록 덧붙이는 말(수면의 "평소 −34분")은 줄을 더하지 않고 오른쪽 위 숫자 자리에 적는다.
export const tile = (focus, label, word, num, pos, color) => `<button class="tile" data-act="record" data-focus="${focus}"${color ? ` style="--tone:${color}"` : ''}>
  <div class="tl"><span>${label}</span><span${typeof num === 'string' ? ' class="sub"' : ''}>${num == null ? '' : num}</span></div>
  <div class="word${word ? '' : ' unset'}">${word || T('기록 없음')}</div>${pos == null ? '' : level(pos)}</button>`;
const scoreTile = (key, label, v) => tile(key, label, nameOf(key, v), v, v == null ? null : v / 10, tone(key, v));
export const bars = (v) => `<span class="bars">${[1, 2, 3, 4].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</span>`;

export function medCard(date) {
  if (!db.meds.length) return `<section class="card list"><button class="li add" data-act="medSetup">${IC.pill}&nbsp; ${T('먹는 약 등록하기')}</button></section>`;
  // 부작용은 약에 딸린 줄: 적은 것이 있으면 이름이 보이고, 없으면 흐린 "부작용 적기" 한 줄만 있다
  const fx = fxNames((db.entries[date] || {}).fx);
  const fxRow = !itemOn('fx') ? '' : fx.length ? li(T('부작용'), esc(fx.join(' · ')), 'fx')
    : `<button class="li add dim" data-act="record" data-focus="fx">${T('+ 부작용 적기')}</button>`;
  return `<section class="card list">${doseRowsHtml(medsFor(date))}${fxRow}</section>`;
}

export function tilesHtml(e) {
  const sleepBig = e.sleepMin == null ? ''
    : `${Math.floor(e.sleepMin / 60)}<small>${T('시간')}</small>${e.sleepMin % 60 ? ` ${e.sleepMin % 60}<small>${T('분')}</small>` : ''}`;
  // 수면은 내 평균과 비교 (기록이 3일 이상 쌓였을 때)
  const sleeps = Object.values(db.entries).map((x) => x.sleepMin).filter((x) => x != null);
  let pos = null, sub = '';
  if (e.sleepMin != null && sleeps.length >= 3) {
    const avg = sleeps.reduce((a, b) => a + b, 0) / sleeps.length, diff = Math.round(e.sleepMin - avg);
    pos = 0.5 + diff / 360;   // 막대 끝에서 끝이 ±3시간
    sub = Math.abs(diff) < 10 ? T('평소와 비슷') : F(diff > 0 ? '평소 +{0}' : '평소 −{0}', durText(Math.abs(diff)));
  }
  // 설정에서 꺼 둔 항목은 칸을 만들지 않는다
  const tiles = [
    ['mood', () => scoreTile('mood', T('기분'), e.mood)], ['energy', () => scoreTile('energy', T('에너지'), e.energy)],
    ['conf', () => scoreTile('conf', T('자신감'), e.conf)], ['sleep', () => tile('sleep', T('수면'), sleepBig, sub || null, pos)],
  ].filter(([k]) => itemOn(k)).map(([, html]) => html()).join('');
  return tiles ? `<div class="tiles">${tiles}</div>` : '';
}

// 오늘의 나머지 항목들. 적은 항목만 줄로 보이고, 안 적은 항목은 맨 아래에 작은 "+ 이름" 딱지로 모아 둔다
// (줄마다 '기록 없음'을 늘어놓으니 너무 길고 피로하다고 해서 바꿨다, 2026-11-13).
// 줄이든 딱지든 누르면 그 항목 하나만 고치는 화면이 열린다. 설정에서 꺼 둔 항목은 만들지 않는다.
export function detailHtml(e) {
  const signs = SIGNS.filter(([k]) => e.signs && e.signs[k]).map(([, label]) => label);
  // 저장된 약 목록에 없는 약(목록에서 지운 약)만 여기 글로 보여 준다. 나머지는 위 약 카드에 있다.
  const extra = db.meds.length ? '' : esc(medsText(e.meds || []));
  const ten = (key, v) => `${nameOf(key, v)}<span class="of"> ${v}</span>`;
  const caffeine = e.drinks ? (cafMg(e.drinks) ? `${drinkText(e.drinks)}<span class="of"> · ${F('약 {0}mg', cafMg(e.drinks))}</span>` : nameOf('caffeine', 0))
    : e.caffeine != null ? ten('caffeine', e.caffeine) : '';
  // [누르면 열릴 항목, 켜져 있는지, 왼쪽 이름(아이콘 포함), 딱지에 쓸 이름, 값(안 적었으면 '')]
  const items = [
    ...SYMPTOMS.map(([k, label]) => [k, itemOn(k), label, label, e[k] == null ? '' : `${LEVELS[e[k]]}${bars(e[k])}`]),
    ['panic', itemOn('panic'), T('공황'), T('공황'), e.panic ? F('{0}번', e.panic) : ''],
    ['psy', itemOn('psy'), T('정신병적 증상'), T('정신병적 증상'), esc(psyNames(e.psych).join(' · ')) || (e.psy ? LEVELS[e.psy] : '')],
    ['period', itemOn('period'), `${IC.drop}${T('생리')}`, T('생리'), e.period ? T('생리 중') : ''],
    ['appetite', itemOn('appetite'), `${IC.fork}${T('식욕')}`, T('식욕'), e.appetite == null ? '' : ten('appetite', e.appetite)],
    ['caffeine', itemOn('caffeine'), `${IC.coffee}${T('카페인')}`, T('카페인'), caffeine],
    ...customDefs().map((c) => [`c:${c.id}`, true, esc(c.name), esc(c.name), esc(customText(c, (e.custom || {})[c.id]))]),
  ].filter(([, on]) => on);
  const rows = [
    ...items.filter(([, , , , value]) => value).map(([key, , left, , value]) => li(left, value, key)),
    e.tired && itemOn('sleep') ? li(`${IC.moon}${T('일어났을 때')}`, T('피곤'), 'sleep') : '',
    extra && itemOn('meds') ? li(`${IC.pill}${T('약')}`, extra) : '',
    signs.length ? li(T('체크'), signs.map(esc).join('<br>')) : '',
    e.note && itemOn('note') ? `<button class="li say note" data-act="record" data-focus="note">${esc(e.note)}</button>` : '',
  ].join('');
  const more = [...items.filter(([, , , , value]) => !value).map(([key, , , name]) => [key, name]), ...(!e.note && itemOn('note') ? [['note', T('메모')]] : [])]
    .map(([key, name]) => (key === 'panic' ? `<button class="chip sm" data-act="panicAdd">+ ${name}</button>` : `<button class="chip sm" data-act="record" data-focus="${key}">+ ${name}</button>`)).join('');
  return rows || more ? `<section class="card list">${rows}${more ? `<div class="li chips more">${more}</div>` : ''}</section>` : '';
}
