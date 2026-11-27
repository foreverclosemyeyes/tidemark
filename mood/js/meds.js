// 약: 그날 먹은 약(먹을 때마다 한 줄, 시각 포함), 약 추가 입력
import { CATALOG, MED_GROUPS, SEDATIVE_GENERICS } from './constants.js';
import { addDays, ampm, nowTime } from './dates.js';
import { esc } from './dom.js';
import { EN, T } from './i18n.js';
import { IC } from './icons.js';
import { ui } from './state.js';
import { db, save } from './store.js';

export const medKey = (m) => `${m.name}|${m.dose || ''}`;

// 숫자만 적으면 mg를 붙인다 ("300" → "300mg"). 다른 단위를 직접 적었으면 그대로 둔다.
export const normDose = (raw) => { const s = raw.trim(); return /^\d+(\.\d+)?$/.test(s) ? `${s}mg` : s; };

// 그날 먹은 약 목록. 한 번 먹을 때마다 { name, dose, at: 'HH:MM' } 한 줄 (예전 기록은 at이 없다).
// 그날 기록이 있으면 기록 안에, 아직 없으면 따로(taken) 적어 둔다.
export const medsFor = (date) => (db.entries[date] ? db.entries[date].meds || [] : db.taken[date] || []);
export function setMeds(date, list) {
  if (db.entries[date]) { db.entries[date].meds = list; db.entries[date].updatedAt = new Date().toISOString(); } else db.taken[date] = list;
  save();
}
export function addDose(list, key) {
  const m = db.meds.concat(list).find((x) => medKey(x) === key);
  // 처음 체크할 때는 지금 시각이 같이 찍힌다
  if (m) list.push({ name: m.name, dose: m.dose, at: nowTime() });
}
// 전날 안정제·수면제를 먹었거나, 당일 새벽(06시 전)에 먹었으면 그날 밤 잠은 '약 먹고 잔 밤'으로 본다
const sedative = (m) => SEDATIVE_GENERICS.includes((CATALOG.find(([ko, , en]) => ko === m.name || en === m.name) || [])[1]);
export const aided = (e) => medsFor(addDays(e.date, -1)).some(sedative)
  || medsFor(e.date).some((m) => sedative(m) && m.at && m.at < '06:00');

// "콘서타 27mg (08:00, 13:00)" 같은 글
export function medsText(list) {
  const groups = new Map();
  list.forEach((m) => { const k = medKey(m); if (!groups.has(k)) groups.set(k, { m, at: [] }); groups.get(k).at.push(m.at || '?'); });
  return [...groups.values()].map(({ m, at }) => `${m.name}${m.dose ? ` ${m.dose}` : ''}${at.some((x) => x !== '?') || at.length > 1 ? ` (${at.join(', ')})` : ''}`).join(', ');
}

// 약마다 한 줄: 먹은 기록들과 '먹었어요' 버튼. 오늘 화면과 기록 화면이 같이 쓴다.
// 한 번 먹은 것까지는 한 줄에 들어가서 줄 높이가 안 바뀐다. 두 번째부터 아래 줄로 내려간다.
// 먹은 기록은 시각 또는 '✓ 먹음'(시각 없음)으로 보이고, 누르면 시각을 고르는 창이 떠서 먹은 시각을 고치거나 지울 수 있다
// (보이는 글자 위에 투명한 시각 입력 칸을 겹쳐 둔다. 누르면 시각이 지워지기만 하던 것을 사용자가 고칠 수 있게 해 달라고 함, 2026-11-27).
export function doseRowsHtml(list) {
  const all = db.meds.concat(list.filter((m, i) => !db.meds.some((x) => medKey(x) === medKey(m)) && list.findIndex((y) => medKey(y) === medKey(m)) === i));
  return all.map((m) => {
    const key = medKey(m), doses = list.map((x, i) => [x, i]).filter(([x]) => medKey(x) === key);
    return `<div class="li med-row${doses.length > 1 ? ' multi' : ''}">
      <span class="lk">${IC.pill}<span class="mn">${esc(m.name)}${m.dose ? `<small>${esc(m.dose)}</small>` : ''}</span></span>
      <span class="doses">${doses.map(([x, i]) => `<span class="dose"><label class="dose-now">${x.at ? ampm(x.at) : `✓ ${T('먹음')}`}
          <input type="time" data-dose="${i}" value="${esc(x.at || '')}" aria-label="${T('먹은 시각 고치기')}"></label>
        <button type="button" data-act="doseDel" data-i="${i}" aria-label="${T('삭제')}">✕</button></span>`).join('')}
        ${doses.length ? `<button type="button" class="take more" data-act="doseAdd" data-med="${esc(key)}" aria-label="${T('한 번 더')}">+</button>`
    : `<button type="button" class="take" data-act="doseAdd" data-med="${esc(key)}">${T('먹었어요')}</button>`}</span>
    </div>`;
  }).join('');
}

// 약 추가: 종류를 골라서 찾거나, 이름·성분을 치면 목록에서 골라 넣을 수 있다 (한국 이름·영어권 이름·성분 어느 것으로 쳐도 찾는다).
// 아무것도 안 쳤으면 종류 단추들이 뜨고, 종류를 누르면(ui.medGroup) 그 종류의 약들이 뜬다. 영어 화면에서는 영어권 이름으로 보인다.
export function sugHtml(q) {
  const have = new Set(db.meds.map((m) => m.name)), word = q.toLowerCase();
  const chip = ([ko, generic, en, genericEn]) => `<button type="button" class="sug" data-act="pickSug" data-name="${esc(EN ? en : ko)}">${esc(EN ? en : ko)}<small>${esc(EN ? genericEn : generic)}</small></button>`;
  const fresh = (list) => list.filter(([ko, , en]) => !have.has(ko) && !have.has(en));
  if (q) return fresh(CATALOG).filter((m) => m.some((x) => x.toLowerCase().includes(word))).slice(0, 14).map(chip).join('');
  const group = MED_GROUPS.find(([key]) => key === ui.medGroup);
  if (group) return `<button type="button" class="sug cat" data-act="medGroup" data-g="">‹ ${T('종류')}</button>${fresh(group[2]).map(chip).join('')}`;
  return MED_GROUPS.map(([key, name]) => `<button type="button" class="sug cat" data-act="medGroup" data-g="${key}">${name}</button>`).join('');
}
export function medAddHtml() {
  return ui.addingMed
    ? `<div class="li med-new">
         <input type="text" id="med-name" placeholder="${T('약 이름이나 성분')}" autocomplete="off" maxlength="30">
         <label class="unit"><input type="text" id="med-dose" inputmode="decimal" placeholder="${T('용량')}" autocomplete="off" maxlength="20"><span>mg</span></label>
         <div class="sugs" id="med-sug">${sugHtml('')}</div>
         <button type="button" class="btn gray" data-act="saveMed">${T('약 저장')}</button>
       </div>`
    : `<button type="button" class="li add" data-act="addMed">${T('+ 약 추가')}</button>`;
}
