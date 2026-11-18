// 기록 화면
// 한 번에 다 적지 않아도 된다: 만진 항목만 저장되고, 안 만진 항목은 빈 값(null)으로 남는다.
// 아침에 수면만 적고 밤에 기분을 적는 식으로 같은 날을 여러 번 열어 이어 적을 수 있다.
import { DRINKS, LEVELS, PSYCH, SIDE_EFFECTS, SIGNS, SYMPTOMS, cafMg, cafScore, isHigh, nameOf, onlyOn } from '../constants.js';
import { durText, longDate, sleepMinutes } from '../dates.js';
import { $, closeSheet, esc, sheet, showSheet, toast } from '../dom.js';
import { F, T } from '../i18n.js';
import { IC } from '../icons.js';
import { doseRowsHtml, medAddHtml } from '../meds.js';
import { render } from '../render.js';
import { ui } from '../state.js';
import { customDefs, db, itemOn, save } from '../store.js';
import { tone } from '../theme.js';

// 0~10 슬라이더 항목. 처음에는 비어 있고(null), 슬라이더를 만지면 값이 생긴다.
export const SLIDERS = ['mood', 'energy', 'conf', 'appetite'];
const SLIDER_START = 5;   // 빈 항목의 손잡이가 놓여 있는 자리

// ---------- 초안 ----------
export function newDraft(date) {
  const old = db.entries[date];
  // 잠든·깬 시각은 가장 최근 기록을 기본값으로 보여 준다 (대부분 비슷하니까 덜 만져도 되게). 수면을 적겠다고 해야 저장된다.
  const last = Object.keys(db.entries).sort().reverse().map((k) => db.entries[k]).find((x) => x.bed && x.wake);
  const blank = {
    date, mood: null, energy: null, conf: null, appetite: null, stress: null, anx: null, si: null, panic: null,
    sleepSet: false, bed: last ? last.bed : '23:30', wake: last ? last.wake : '07:00', tired: false,
    period: false, drinks: {}, meds: (db.taken[date] || []).slice(), note: '', signs: {}, fx: {}, psych: {}, custom: {},
  };
  if (!old) return blank;
  const d = Object.assign(blank, JSON.parse(JSON.stringify(old)));
  d.sleepSet = !!(old.bed && old.wake);
  if (!d.sleepSet) { d.bed = blank.bed; d.wake = blank.wake; }
  d.drinks = d.drinks || {};
  d.signs = d.signs || {};
  d.fx = d.fx || {};
  d.psych = d.psych || {};
  d.fxOpen = !!onlyOn(d.fx);
  d.custom = d.custom || {};
  d.meds = d.meds || [];
  return d;
}

// ---------- 조각들 ----------
export const seg = (field, labels, value) => `<div class="seg" data-field="${field}">${
  labels.map((l, i) => `<button type="button" data-v="${i}" aria-pressed="${value === i}">${l}</button>`).join('')}</div>`;
export const cafHead = (dr) => (cafMg(dr) ? `${nameOf('caffeine', cafScore(dr))} · ${F('약 {0}mg', cafMg(dr))}` : '');
export const drinksHtml = (d) => `<div class="li col"><div class="slh"><span class="lk">${IC.coffee}${T('카페인')}</span><span class="nm" id="v-caf">${cafHead(d.drinks)}</span></div>
  <div class="steps">${DRINKS.map(([k, name]) => `<div class="step"><span>${name}</span>
    <button type="button" data-drink="${k}" data-d="-1" aria-label="${name} −">−</button><b id="c-${k}">${d.drinks[k] || 0}</b>
    <button type="button" data-drink="${k}" data-d="1" aria-label="${name} +">+</button></div>`).join('')}</div></div>`;
// 값 자리를 누르면 그 항목을 다시 비운다
export const slider = (id, icon, label, v, lo, hi) => `<div class="li sl" id="row-${id}">
  <div class="slh"><span class="lk"><span id="i-${id}">${icon}</span>${label}</span>
    <button type="button" class="slv" data-act="clearField" data-k="${id}" aria-label="${T('지우기')}"><span class="nm" id="n-${id}"></span><b id="v-${id}"></b></button></div>
  <input type="range" id="f-${id}" min="0" max="10" step="1" value="${v == null ? SLIDER_START : v}" aria-label="${label}">
  <div class="ends"><span>${lo}</span><span>${hi}</span></div></div>`;
export const sw = (attr, on, label, icon) => `<button type="button" class="li sw" ${attr} aria-pressed="${!!on}"><span class="lk">${icon || ''}${label}</span><i></i></button>`;

// 여러 개를 누를 수 있는 딱지들 (부작용, 정신병적 증상). attr는 data-fx / data-psych
const chips = (attr, list, on) => `<div class="li chips">${list.map(([k, label]) => `<button type="button" class="chip" data-${attr}="${esc(k)}" aria-pressed="${!!on[k]}">${esc(label)}</button>`).join('')}</div>`;

// 내 항목 한 줄: 종류에 따라 스위치(했음) · 0~10 슬라이더 · 숫자 칸
const customRow = (c) => {
  const v = ui.draft.custom[c.id], name = esc(c.name);
  if (c.type === 'check') return sw(`data-custom="${esc(c.id)}"`, v === true, name);
  if (c.type === 'scale') {
    return `<div class="li sl"><div class="slh"><span class="lk">${name}</span>
      <button type="button" class="slv" data-act="customClear" data-k="${esc(c.id)}" aria-label="${T('지우기')}"><span class="nm${v == null ? ' unset' : ''}" id="cv-${esc(c.id)}">${v == null ? T('기록 없음') : v}</span></button></div>
      <input type="range" class="${v == null ? 'unset' : ''}" data-custom="${esc(c.id)}" min="0" max="10" step="1" value="${v == null ? SLIDER_START : v}" style="--v:${(v == null ? SLIDER_START : v) / 10}" aria-label="${name}"></div>`;
  }
  return `<label class="li"><span class="lk">${name}</span><span class="num"><input type="number" inputmode="decimal" step="any" data-custom="${esc(c.id)}" value="${v == null ? '' : v}" placeholder="–" aria-label="${name}">${c.unit ? `<small>${esc(c.unit)}</small>` : ''}</span></label>`;
};
// 저장할 때: 안 적은 것(빈 값, 꺼진 스위치)은 빼고, 하나도 없으면 undefined
const customValues = (bag) => {
  const keep = Object.keys(bag || {}).filter((k) => bag[k] != null && bag[k] !== false && bag[k] !== '');
  return keep.length ? Object.fromEntries(keep.map((k) => [k, bag[k]])) : undefined;
};

// 정신병적 증상: 그날 있었던 것을 누르는 딱지들과, 목록에 없는 것을 직접 적는 칸
export function psychHtml() {
  const d = ui.draft;
  const custom = [...new Set([...(db.settings.psyCustom || []), ...Object.keys(d.psych).filter((k) => k.startsWith('c:')).map((k) => k.slice(2))])];
  return `${chips('psych', [...PSYCH, ...custom.map((name) => [`c:${name}`, name])], d.psych)}
    <div class="li"><input type="text" id="psy-new" maxlength="20" placeholder="${T('목록에 없으면 직접 적기')}" autocomplete="off">
      <button type="button" class="mini" data-act="psyAdd">${T('추가')}</button></div>`;
}

// 부작용: 약 기록에 딸린 칸. 평소에는 "부작용이 있었어요" 스위치 한 줄만 있고, 켜면 딱지들과 직접 적는 칸이 펼쳐진다.
// (오늘 화면에서 부작용 줄을 눌러 들어온 경우에는 처음부터 펼쳐져 있다: draft.fxAlways)
export function fxHtml() {
  const d = ui.draft, open = d.fxAlways || d.fxOpen;
  const custom = [...new Set([...(db.settings.fxCustom || []), ...Object.keys(d.fx).filter((k) => k.startsWith('c:')).map((k) => k.slice(2))])];
  return `${d.fxAlways ? '' : sw('data-act="fxToggle"', open, T('부작용이 있었어요'))}${open ? `${chips('fx', [...SIDE_EFFECTS, ...custom.map((name) => [`c:${name}`, name])], d.fx)}
    <div class="li"><input type="text" id="fx-new" maxlength="20" placeholder="${T('목록에 없으면 직접 적기 (예: 발진)')}" autocomplete="off">
      <button type="button" class="mini" data-act="fxAdd">${T('추가')}</button></div>` : ''}`;
}

export const medsHtml =() => doseRowsHtml(ui.draft.meds) + medAddHtml();
export const signsHtml = () => SIGNS.map(([k, label]) => sw(`data-sign="${k}"`, ui.draft.signs[k], label)).join('');

// 수면: 적겠다고 누르기 전에는 한 줄짜리 버튼만 보인다
export function sleepHtml() {
  const d = ui.draft;
  if (!d.sleepSet) return `<button type="button" class="li add" data-act="sleepOn">${IC.moon}&nbsp; ${T('지난밤 수면 적기')}</button>`;
  return `<label class="li"><span class="lk">${T('잠든 시각')}</span><input type="time" id="f-bed" value="${esc(d.bed || '')}"></label>
    <label class="li"><span class="lk">${T('깬 시각')}</span><input type="time" id="f-wake" value="${esc(d.wake || '')}"></label>
    <div class="li"><span class="lk">${T('수면 시간')}</span><span class="lv" id="v-sleep"></span></div>
    ${sw('data-flag="tired"', d.tired, T('일어났을 때 피곤함'))}
    <button type="button" class="li add dim" data-act="sleepOff">${T('수면 기록 지우기')}</button>`;
}

// ---------- 화면 ----------
// 한 항목만 고칠 때 보여 줄 것: 오늘 화면에서 누른 자리(focus) → [제목, 보여 줄 묶음들]
const FOCUS = {
  mood: () => [T('기분'), ['mood', 'signs']],
  energy: () => [T('에너지'), ['energy', 'signs']],
  conf: () => [T('자신감'), ['conf', 'signs']],
  sleep: () => [T('지난밤 수면'), ['sleep']],
  stress: () => [T('스트레스'), ['stress']],
  anx: () => [T('불안'), ['anx']],
  psy: () => [T('정신병적 증상'), ['psy']],
  si: () => [T('죽고 싶은 생각'), ['si']],
  panic: () => [T('공황'), ['panic']],
  period: () => [T('생리'), ['period']],
  appetite: () => [T('식욕'), ['appetite']],
  caffeine: () => [T('카페인'), ['caffeine']],
  fx: () => [T('부작용'), ['fx']],
  note: () => [T('메모'), ['note']],
};
const ALL = ['mood', 'energy', 'conf', 'signs', 'symptoms', 'psy', 'sleep', 'body', 'meds', 'fx', 'custom', 'note'];

// focus가 있으면 그 항목만 뜨고(다른 값은 그대로 보존), 없으면 전체가 뜬다.
export function openRecord(date, focus) {
  ui.draft = newDraft(date);
  ui.addingMed = false;
  const d = ui.draft, isEdit = !!db.entries[date];
  // 오늘 화면에서 내 항목 한 줄을 눌렀으면 focus가 'c:항목id'로 온다
  const mine = customDefs().find((c) => `c:${c.id}` === focus);
  const [title, show] = FOCUS[focus] ? FOCUS[focus]() : mine ? [esc(mine.name), [focus]] : [isEdit ? T('기록 수정') : T('기록하기'), ALL];
  const only = !!FOCUS[focus] || !!mine;
  d.fxAlways = focus === 'fx';
  if (focus === 'sleep') d.sleepSet = true;

  const sliders = {
    mood: slider('mood', '', T('기분'), d.mood, T('가라앉음'), T('들뜸')),
    energy: slider('energy', '', T('에너지'), d.energy, T('바닥'), T('넘침')),
    conf: slider('conf', IC.star, T('자신감'), d.conf, T('위축'), T('넘침')),
  };
  // 설정에서 꺼 둔 항목은 칸을 만들지 않는다 (그 항목에 적어 둔 값은 건드리지 않고 그대로 저장된다)
  const scores = show.filter((k) => sliders[k] && itemOn(k));
  const sec = (name) => (only ? '' : `<div class="sec">${name}</div>`);   // 한 항목만 뜰 때는 화면 제목이 이름을 대신한다
  const group = (name, rows, id) => (rows ? `${sec(name)}<section class="card list"${id ? ` id="${id}"` : ''}>${rows}</section>` : '');
  // 증상과 몸 항목은 전체 화면에서는 묶음으로, 오늘 화면에서 한 줄을 눌렀을 때는 그 한 줄만 뜬다
  const symRow = ([k, label]) => `<div class="li col"><span class="lk">${label}</span>${seg(k, LEVELS, d[k])}</div>`;
  const bodyRow = {
    period: () => sw('data-flag="period"', d.period, T('생리 중'), IC.drop),
    appetite: () => slider('appetite', IC.fork, T('식욕'), d.appetite, T('없음'), T('많음')),
    caffeine: () => drinksHtml(d),
  };
  // 공황은 그날 몇 번이었는지 센다 (entry.panic, 없으면 null). 오늘 화면의 "+ 공황"을 누르면 바로 한 번이 더해진다.
  const panicRow = `<div class="li col"><div class="steps"><div class="step"><span>${T('공황 (오늘 몇 번)')}</span>
    <button type="button" data-panic="-1" aria-label="${T('공황')} −">−</button><b id="c-panic">${d.panic || 0}</b>
    <button type="button" data-panic="1" aria-label="${T('공황')} +">+</button></div></div></div>`;
  const one = (row) => `<section class="card list">${row}</section>`;
  const parts = {
    signs: !itemOn('signs') ? '' : `<div id="signs" hidden><div class="sec">${T('오늘 이런 점이 있었나요?')}</div><section class="card list">${signsHtml()}</section></div>`,
    symptoms: group(T('증상'), SYMPTOMS.filter(([k]) => itemOn(k)).map(symRow).join('') + (itemOn('panic') ? panicRow : '')),
    panic: one(panicRow),
    sleep: group(T('지난밤 수면'), itemOn('sleep') ? sleepHtml() : '', 'sleep'),
    body: group(T('몸'), Object.keys(bodyRow).filter(itemOn).map((k) => bodyRow[k]()).join('')),
    ...Object.fromEntries(SYMPTOMS.map((s) => [s[0], one(symRow(s))])),
    ...Object.fromEntries(Object.keys(bodyRow).map((k) => [k, one(bodyRow[k]())])),
    psy: group(T('정신병적 증상'), itemOn('psy') ? psychHtml() : '', 'psych'),
    meds: group(T('오늘 먹은 약'), itemOn('meds') ? medsHtml() : '', 'meds'),
    fx: itemOn('fx') ? `<section class="card list" id="fx">${fxHtml()}</section>` : '',
    custom: group(T('내 항목'), customDefs().map(customRow).join('')),
    ...Object.fromEntries(customDefs().map((c) => [`c:${c.id}`, one(customRow(c))])),
    note: group(T('메모'), itemOn('note') ? `<div class="li"><textarea id="f-note" rows="4" maxlength="1000" placeholder="${T('오늘 있었던 일이나 느낀 점')}">${esc(d.note || '')}</textarea></div>` : ''),
  };

  sheet.innerHTML = `<div class="sheet-in">
    <div class="sheet-top">
      <button class="txt" data-act="close">${T('취소')}</button>
      <div class="st"><b>${title}</b><span>${longDate(date)}</span></div>
      <span class="txt"></span>
    </div>
    ${only ? '' : `<p class="secnote top-note">${T('적고 싶은 것만 적으면 돼요. 나머지는 나중에 이어서 적을 수 있어요.')}</p>`}
    ${scores.length ? `<section class="card list">${scores.map((k) => sliders[k]).join('')}</section>` : ''}
    ${show.filter((k) => parts[k]).map((k) => parts[k]).join('')}
    ${isEdit && !only ? `<button class="btn plain danger" data-act="deleteEntry">${T('이 날 기록 삭제')}</button>` : ''}
    <div class="savebar"><button class="btn" data-act="save">${T('저장')}</button></div>
  </div>`;
  showSheet();
  syncForm();
}

// 값에 따라 숫자·이름·아이콘·체크리스트·수면 시간을 바로 갱신
export function syncForm() {
  const d = ui.draft;
  if (!d) return;
  // 한 항목만 띄운 화면에서는 나머지 칸이 없다. 화면에 있는 것만 갱신한다.
  SLIDERS.forEach((k) => {
    const v = d[k], input = $(`#f-${k}`), col = tone(k, v);
    if (!input) return;
    $(`#v-${k}`).textContent = v == null ? '' : v;
    $(`#n-${k}`).textContent = v == null ? T('기록 없음') : nameOf(k, v);
    $(`#n-${k}`).classList.toggle('unset', v == null);
    input.classList.toggle('unset', v == null);
    input.style.setProperty('--v', (v == null ? SLIDER_START : v) / 10);
    if (col) input.style.setProperty('--tone', col); else input.style.removeProperty('--tone');
  });
  const put = (sel, fn) => { const el = $(sel); if (el) fn(el); };
  put('#i-mood', (el) => { el.innerHTML = IC.face(d.mood == null ? SLIDER_START : d.mood); });
  put('#i-energy', (el) => { el.innerHTML = IC.battery(d.energy == null ? SLIDER_START : d.energy); });
  put('#signs', (el) => { el.hidden = !isHigh(d); });
  put('#v-sleep', (el) => { el.textContent = durText(sleepMinutes(d.bed, d.wake)); });
}

// 적은 것이 하나라도 있는지
const hasContent = (d) => SLIDERS.some((k) => d[k] != null) || SYMPTOMS.some(([k]) => d[k] != null) || d.sleepSet || d.period
  || cafMg(d.drinks) > 0 || d.meds.length > 0 || !!onlyOn(d.fx) || !!onlyOn(d.psych) || d.panic > 0 || !!customValues(d.custom) || !!(d.note || '').trim();

export function saveEntry() {
  const d = ui.draft, prev = db.entries[d.date];
  if (!prev && !hasContent(d)) { toast(T('적은 내용이 없어요')); return; }
  const signs = {};
  if (isHigh(d)) SIGNS.forEach(([k]) => { if (d.signs[k]) signs[k] = true; });
  const hasDrinks = Object.keys(d.drinks).length > 0;
  // 음료를 안 적었으면 카페인은 빈 값. 다만 예전(슬라이더) 방식으로 적어 둔 값은 그대로 둔다.
  const keepOldCaf = !!prev && !prev.drinks && !hasDrinks;
  // 수면을 안 적었으면 빈 값. 다만 시각 없이 수면 시간만 있던 예전 기록은 그대로 둔다.
  const keepOldSleep = !d.sleepSet && !!prev && !prev.bed && prev.sleepMin != null;
  db.entries[d.date] = {
    date: d.date, mood: d.mood, energy: d.energy, conf: d.conf, stress: d.stress, anx: d.anx, si: d.si,
    ...(d.dep != null ? { dep: d.dep } : {}),   // 예전에 적어 둔 우울 값은 그대로 지닌다
    panic: d.panic || null, psych: onlyOn(d.psych), psy: onlyOn(d.psych) ? Math.min(4, Object.keys(onlyOn(d.psych)).length) : null,
    bed: d.sleepSet ? d.bed || null : null, wake: d.sleepSet ? d.wake || null : null,
    sleepMin: d.sleepSet ? sleepMinutes(d.bed, d.wake) : keepOldSleep ? prev.sleepMin : null,
    tired: d.sleepSet && !!d.tired, period: !!d.period, appetite: d.appetite,
    caffeine: keepOldCaf ? prev.caffeine : hasDrinks ? cafScore(d.drinks) : null, drinks: hasDrinks ? d.drinks : undefined,
    meds: d.meds, fx: onlyOn(d.fx), custom: customValues(d.custom), note: (d.note || '').trim(), signs, updatedAt: new Date().toISOString(),
  };
  delete db.taken[d.date];
  if (!save()) return;
  closeSheet();
  render();
  toast(T('저장했어요'));
}
