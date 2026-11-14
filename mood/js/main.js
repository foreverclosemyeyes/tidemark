// 시작점: 누르기·입력 처리와 앱 시작
import { aiSummary } from './analysis.js';
import { addDays, today } from './dates.js';
import { $, app, closeSheet, copyText, enterApp, enterSheet, sheet, sheetOpen, toTop, toast } from './dom.js';
import { exportData, giveFile, hasAlarms, importData, makeIcs, remind, snoozeBackup } from './files.js';
import { F, T } from './i18n.js';
import { lockNow, removePin, setPin } from './lock.js';
import { addDose, medKey, medsFor, normDose, setMeds, sugHtml, toggleDoseTime } from './meds.js';
import { render } from './render.js';
import { onSwipe } from './swipe.js';
import { clinicView, standalone, trend, ui } from './state.js';
import { CARE_ITEMS } from './constants.js';
import { careOn, careUnasked, db, save } from './store.js';
import { applyFont, applyTheme, themeQuery } from './theme.js';
import { clinicData, clinicWeeks, openLog, summaryText } from './views/clinic.js';
import { notesListHtml, openNotes } from './views/notes.js';
import { SLIDERS, cafHead, fxHtml, medsHtml, psychHtml, openRecord, saveEntry, sleepHtml, syncForm } from './views/record.js';
import { printoutHtml } from './views/printout.js';
import { openWelcome } from './views/welcome.js';
import { openSettings } from './views/settings.js';
import { shiftAnchor, shiftTrend, trendRange } from './views/trend.js';

themeQuery.addEventListener('change', () => { applyTheme(); if (!sheetOpen()) render(); });

// 약 먹은 기록을 고칠 목록: 기록 화면이 열려 있으면 그 초안, 아니면 보고 있는 날짜의 저장된 목록
const doseList = () => (ui.draft ? ui.draft.meds : medsFor(ui.selected).map((m) => ({ ...m })));
function commitDoses(list) {
  if (ui.draft) { $('#meds').innerHTML = medsHtml(); return; }
  setMeds(ui.selected, list);
  render();
}

// 설정 화면을 스크롤 자리를 지킨 채 다시 그린다
// 인쇄할 한 장을 지금 기록으로 채운다 (단추를 누를 때와, 브라우저 메뉴로 인쇄할 때). 잠겨 있으면 비워 둔다.
function fillPrintout() {
  $('#printout').innerHTML = $('.lock') ? '' : printoutHtml(clinicWeeks());
}

function redrawSettings() {
  const y = sheet.scrollTop;
  openSettings();
  sheet.scrollTop = y;
}

// ---------- 이벤트 ----------
const actions = {
  tab: (el) => { if (ui.tab === el.dataset.tab) return; ui.tab = el.dataset.tab; toTop(); render(); enterApp(); },
  color: (el) => { db.settings.color = el.dataset.colorPick; save(); applyTheme(); render(); openSettings(); },
  theme: (el) => { db.settings.theme = el.dataset.themePick; save(); applyTheme(); render(); openSettings(); },
  doseAdd: (el) => { const list = doseList(); addDose(list, el.dataset.med); commitDoses(list); },
  doseTime: (el) => { const list = doseList(); toggleDoseTime(list[Number(el.dataset.i)]); commitDoses(list); },
  doseDel: (el) => { const list = doseList(); list.splice(Number(el.dataset.i), 1); commitDoses(list); },
  ics: async () => {
    if (!hasAlarms()) { toast(T('알림 시간을 먼저 정해 주세요')); return; }
    await giveFile('tide-reminders.ics', makeIcs(), 'text/calendar');
  },
  // 기록 화면의 부작용 칸: 스위치로 펼치고 접기(접으면 고른 것도 비운다), 목록에 없는 것 직접 더하기
  fxToggle: () => {
    const d = ui.draft;
    d.fxOpen = !d.fxOpen;
    if (!d.fxOpen) d.fx = {};
    $('#fx').innerHTML = fxHtml();
  },
  fxAdd: () => {
    const name = $('#fx-new').value.trim();
    if (!name) return;
    const mine = db.settings.fxCustom || (db.settings.fxCustom = []);
    if (!mine.includes(name)) { mine.push(name); save(); }
    ui.draft.fx[`c:${name}`] = true;
    $('#fx').innerHTML = fxHtml();
  },
  // 내 항목: 0~10 값을 다시 비우기 (기록 화면), 새 항목 종류 고르기 · 더하기 · 지우기 (설정)
  customClear: (el) => {
    const k = el.dataset.k, input = sheet.querySelector(`input[type=range][data-custom="${k}"]`), out = $(`#cv-${k}`);
    ui.draft.custom[k] = null;
    input.classList.add('unset');
    out.textContent = T('기록 없음'); out.classList.add('unset');
  },
  customType: (el) => {
    document.querySelectorAll('[data-act=customType]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
    $('#cu-unit').hidden = el.dataset.t !== 'number';
  },
  customAdd: () => {
    const name = $('#cu-name').value.trim(), type = document.querySelector('[data-act=customType][aria-pressed=true]').dataset.t;
    if (!name) { toast(T('항목 이름을 적어 주세요')); return; }
    const list = db.settings.custom || (db.settings.custom = []);
    list.push({ id: `u${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name, type, unit: type === 'number' ? $('#cu-unit').value.trim() : '' });
    save(); render(); redrawSettings();
  },
  customDel: (el) => {
    if (!confirm(T('이 항목을 목록에서 지울까요? 이미 적어 둔 값은 기록에 남아 있지만 화면에는 안 보여요.'))) return;
    db.settings.custom = (db.settings.custom || []).filter((c) => c.id !== el.dataset.id);
    save(); render(); redrawSettings();
  },
  psyAdd: () => {
    const name = $('#psy-new').value.trim();
    if (!name) return;
    const mine = db.settings.psyCustom || (db.settings.psyCustom = []);
    if (!mine.includes(name)) { mine.push(name); save(); }
    ui.draft.psych[`c:${name}`] = true;
    $('#psych').innerHTML = psychHtml();
  },
  // 오늘 화면의 "+ 공황": 기록 화면을 열지 않고 바로 한 번을 더한다 (그날 기록이 없으면 그 한 줄만 있는 기록을 만든다)
  panicAdd: () => {
    const d = ui.selected, e = db.entries[d] || (db.entries[d] = { date: d, meds: (db.taken[d] || []).slice(), signs: {}, note: '' });
    delete db.taken[d];
    e.panic = (e.panic || 0) + 1;
    e.updatedAt = new Date().toISOString();
    save(); render();
    toast(F('공황 {0}번째를 적었어요', e.panic));
  },
  welcomeNext: () => welcomeTo(1),
  // 병원·상담용 기능 켜고 끄기 (처음 안내의 물음, 설정의 스위치). 딸린 기록 항목도 한꺼번에 켜고 끈다.
  care: (el) => {
    const on = el.dataset.v ? el.dataset.v === '1' : !careOn(), off = (db.settings.off || []).filter((k) => !CARE_ITEMS.includes(k));
    db.settings.care = on;
    db.settings.off = on ? off : [...off, ...CARE_ITEMS];
    if (!on) ui.tab = 'today';
    save(); render();
    if (el.dataset.v) closeSheet(); else redrawSettings();   // 처음 안내에서 골랐으면 안내를 닫는다
  },
  demo: () => { ui.demo = !ui.demo; render(); },
  // 처음 화면의 "예시 요약 보기": 진료 화면을 예시 기록으로 연다
  demoClinic: () => { ui.demo = true; ui.tab = 'clinic'; toTop(); render(); enterApp(); },
  // 설정: 기록 항목 켜고 끄기 (꺼진 항목의 열쇠를 settings.off에 모아 둔다)
  item: (el) => {
    const k = el.dataset.k, off = db.settings.off || [];
    db.settings.off = off.includes(k) ? off.filter((x) => x !== k) : [...off, k];
    save(); render(); redrawSettings();
  },
  // 설정: 약마다 알람 시각 더하기·지우기 (시각 고치기는 아래 input 처리에서)
  alarmAdd: (el) => { const m = db.meds[Number(el.dataset.m)]; m.alarms = (m.alarms || []).concat('09:00'); save(); redrawSettings(); },
  alarmDel: (el) => { db.meds[Number(el.dataset.m)].alarms.splice(Number(el.dataset.i), 1); save(); redrawSettings(); },
  copyAi: async () => { await copyText(aiSummary()); toast(T('복사했어요. AI 앱에 붙여 넣으세요')); },
  // 진료 탭
  clinicWeeks: (el) => { clinicView.weeks = el.dataset.w === 'since' ? 'since' : Number(el.dataset.w); render(); },
  // 진료 메모 · 약 바꾼 날: 적는 화면 열기, 저장(날짜순으로 끼워 넣음), 지우기
  logAdd: (el) => openLog(el.dataset.kind),
  logSave: (el) => {
    const date = $('#l-date').value, text = $('#l-text').value.trim(), kind = el.dataset.kind;
    if (!date) return;
    if (kind === 'med' && !text) { toast(T('무엇이 바뀌었는지 적어 주세요')); return; }
    const log = clinicData().log;
    log.push({ date, kind, text });
    log.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    save(); closeSheet(); render();
  },
  logDel: (el) => {
    clinicData().log.splice(Number(el.dataset.i), 1);
    if (clinicView.weeks === 'since') clinicView.weeks = 2;
    save(); render();
  },
  clinicLine: (el) => {
    const k = el.dataset.k, on = clinicView.lines;
    clinicView.lines = on.includes(k) ? on.filter((x) => x !== k) : [...on, k];
    render();
  },
  clinicNoteAdd: () => {
    const text = $('#c-note').value.trim();
    if (!text) return;
    clinicData().notes.push(text);
    save(); render();
    $('#c-note').focus();
  },
  clinicNoteDel: (el) => { clinicData().notes.splice(Number(el.dataset.i), 1); save(); render(); },
  printSummary: () => { fillPrintout(); window.print(); },
  copySummary: async () => { await copyText(summaryText(clinicWeeks())); toast(T('복사했어요')); },
  lang: (el) => { db.settings.lang = el.dataset.lang; if (save()) location.reload(); },
  size: (el) => { db.settings.size = el.dataset.size; save(); applyFont(); render(); openSettings(); },
  font: (el) => { db.settings.font = el.dataset.font; save(); applyFont(); openSettings(); },
  mode: (el) => { trend.mode = el.dataset.mode; trend.pick = null; if (trend.anchor > today()) trend.anchor = today(); render(); },
  shift: (el) => { shiftTrend(Number(el.dataset.step)); render(); },
  pickDay: (el) => { const i = Number(el.dataset.i); trend.pick = trend.pick === i ? null : i; render(); },
  openDay: (el) => { if (sheetOpen()) closeSheet(); ui.selected = el.dataset.date; ui.tab = 'today'; toTop(); render(); enterApp(); },
  notes: openNotes,
  pick: (el) => { ui.selected = el.dataset.date; render(); },
  week: (el) => {
    const next = addDays(ui.selected, 7 * Number(el.dataset.step));
    ui.selected = next > today() ? today() : next;
    render();
  },
  goToday: () => { ui.selected = today(); render(); },
  closeHint: () => { db.settings.hintClosed = true; save(); render(); },
  snoozeBackup: () => { snoozeBackup(); render(); },
  // 설정: 잠금. 비밀번호를 정하는 동안 설정 화면은 뒤에 그대로 있고, 끝나면 다시 그린다.
  pinSet: () => { closeSheet(); setPin(); },
  pinOff: () => { removePin(); redrawSettings(); toast(T('잠금을 껐어요')); },
  record: (el) => openRecord(ui.selected, el.dataset.focus),
  // 기록 화면: 수면 칸 펼치기·지우기, 슬라이더 값 다시 비우기
  sleepOn: () => { ui.draft.sleepSet = true; $('#sleep').innerHTML = sleepHtml(); syncForm(); },
  sleepOff: () => { ui.draft.sleepSet = false; ui.draft.tired = false; $('#sleep').innerHTML = sleepHtml(); },
  clearField: (el) => { ui.draft[el.dataset.k] = null; syncForm(); },
  settings: () => { ui.setTab = 'rec'; openSettings(); },
  setTab: (el) => { ui.setTab = el.dataset.g; openSettings(); },
  close: closeSheet,
  save: saveEntry,
  deleteEntry: () => {
    if (!confirm(T('이 날 기록을 삭제할까요?'))) return;
    delete db.entries[ui.draft.date];
    save(); closeSheet(); render(); toast(T('삭제했어요'));
  },
  addMed: () => {
    ui.addingMed = !ui.addingMed;
    ui.medGroup = '';
    if (ui.draft) $('#meds').innerHTML = medsHtml(); else redrawSettings();
    if (ui.addingMed) $('#med-name').focus();
  },
  medGroup: (el) => { ui.medGroup = el.dataset.g; $('#med-sug').innerHTML = sugHtml(''); },
  pickSug: (el) => { $('#med-name').value = el.dataset.name; $('#med-sug').innerHTML = ''; $('#med-dose').focus(); },
  medSetup: () => { ui.addingMed = true; ui.setTab = 'rec'; openSettings(); $('#sec-meds').scrollIntoView(); },
  saveMed: () => {
    const name = $('#med-name').value.trim(), dose = normDose($('#med-dose').value);
    if (!name) { toast(T('약 이름을 적어 주세요')); return; }
    const m = { name, dose };
    if (!db.meds.some((x) => medKey(x) === medKey(m))) { db.meds.push(m); save(); }
    ui.addingMed = false;
    if (ui.draft) $('#meds').innerHTML = medsHtml();
    else { render(); redrawSettings(); }
  },
  delMed: (el) => {
    db.meds = db.meds.filter((m) => medKey(m) !== el.dataset.med);
    save(); openSettings();
  },
  export: exportData,
  import: () => $('#importFile').click(),
};

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.dataset.act) { actions[t.dataset.act](t); return; }
  const d = ui.draft;
  if (!d) return;
  const segEl = t.closest('.seg');
  if (segEl) {                                   // 단계 버튼 (우울·고조·불안). 고른 것을 다시 누르면 빈 값으로 돌아간다
    const f = segEl.dataset.field, v = Number(t.dataset.v);
    d[f] = d[f] === v ? null : v;
    segEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === d[f])));
  } else if (t.dataset.panic) {                 // 공황 횟수
    d.panic = Math.max(0, Math.min(30, (d.panic || 0) + Number(t.dataset.panic)));
    $('#c-panic').textContent = d.panic;
  } else if (t.dataset.drink) {                  // 카페인 음료 개수
    const k = t.dataset.drink, n = Math.max(0, Math.min(9, (d.drinks[k] || 0) + Number(t.dataset.d)));
    if (n) d.drinks[k] = n; else delete d.drinks[k];
    $(`#c-${k}`).textContent = n;
    $('#v-caf').textContent = cafHead(d.drinks);
  } else if (t.dataset.flag) {                   // 스위치 (생리 중, 일어났을 때 피곤함)
    d[t.dataset.flag] = !d[t.dataset.flag];
    t.setAttribute('aria-pressed', String(!!d[t.dataset.flag]));
  } else if (t.dataset.sign) {                   // 조건부 체크리스트
    d.signs[t.dataset.sign] = !d.signs[t.dataset.sign];
    t.setAttribute('aria-pressed', String(!!d.signs[t.dataset.sign]));
  } else if (t.dataset.custom) {                // 내 항목 가운데 스위치 (했음 · 안 했음)
    d.custom[t.dataset.custom] = !d.custom[t.dataset.custom];
    t.setAttribute('aria-pressed', String(!!d.custom[t.dataset.custom]));
  } else if (t.dataset.fx || t.dataset.psych) {    // 딱지 (부작용, 정신병적 증상)
    const bag = t.dataset.fx ? d.fx : d.psych, k = t.dataset.fx || t.dataset.psych;
    bag[k] = !bag[k];
    t.setAttribute('aria-pressed', String(!!bag[k]));
  }
});

// 빈 슬라이더는 손을 대는 순간 값이 생긴다 (지금 손잡이 자리 그대로 두고 싶을 때도 한 번 누르면 된다)
sheet.addEventListener('pointerdown', (ev) => {
  const d = ui.draft, el = ev.target, k = el.id ? el.id.slice(2) : '';
  if (!d || el.type !== 'range' || !SLIDERS.includes(k) || d[k] != null) return;
  d[k] = Number(el.value);
  syncForm();
});

sheet.addEventListener('input', (ev) => {
  const d = ui.draft, el = ev.target;
  if (d && el.dataset.custom) {                  // 내 항목 가운데 0~10 슬라이더와 숫자 칸
    const k = el.dataset.custom;
    d.custom[k] = el.value === '' ? null : Number(el.value);
    if (el.type === 'range') {
      el.classList.remove('unset'); el.style.setProperty('--v', d.custom[k] / 10);
      const out = $(`#cv-${k}`); out.textContent = d.custom[k]; out.classList.remove('unset');
    }
    return;
  }
  if (el.id === 'med-name') { $('#med-sug').innerHTML = sugHtml(el.value.trim()); return; }
  if (el.id === 'q-notes') { $('#notes-list').innerHTML = notesListHtml(el.value); return; }
  if (el.id.startsWith('r-')) { remind()[el.id.slice(2)] = el.value; save(); return; }
  if (el.classList.contains('alarm-at')) { db.meds[Number(el.dataset.m)].alarms[Number(el.dataset.i)] = el.value; save(); return; }
  if (!d) return;
  const k = el.id.slice(2);
  if (SLIDERS.includes(k)) d[k] = Number(el.value);
  else if (el.id === 'f-bed') d.bed = el.value;
  else if (el.id === 'f-wake') d.wake = el.value;
  else if (el.id === 'f-note') d.note = el.value;
  else return;
  syncForm();
});

// 진료 탭: 다음 진료일을 고르면 바로 저장, 말할 것은 엔터로도 추가
app.addEventListener('change', (ev) => {
  if (ev.target.id !== 'c-next') return;
  clinicData().next = ev.target.value;
  save(); render();
});
app.addEventListener('keydown', (ev) => {
  if (ev.target.id === 'c-note' && ev.key === 'Enter' && !ev.isComposing) actions.clinicNoteAdd();
});

// 옆으로 밀면 날짜가 넘어간다: 오늘 탭은 하루씩, 흐름 탭은 한 주(한 달)씩. 미래로는 못 간다.
onSwipe(app, {
  can: (step) => (ui.tab === 'today' ? addDays(ui.selected, step) <= today()
    : ui.tab === 'trend' ? trendRange(shiftAnchor(trend.anchor, step)).start <= today() : false),
  go: (step) => {
    if (ui.tab === 'today') ui.selected = addDays(ui.selected, step); else shiftTrend(step);
    render();
    enterApp(step > 0 ? 'next' : 'prev');
  },
});
// 처음 안내도 옆으로 밀어 넘긴다 (다른 시트에서는 밀리지 않는다)
const WELCOME_LAST = 1;
function welcomeTo(step) {
  const from = ui.welcome;
  openWelcome(step);
  enterSheet(step > from ? 'next' : 'prev');
}
onSwipe(sheet, {
  can: (step) => ui.welcome != null && ui.welcome + step >= 0 && ui.welcome + step <= WELCOME_LAST,
  go: (step) => welcomeTo(ui.welcome + step),
});

// 흐름 그래프에서 날짜 칸을 누르면 그날 값을 보여 준다
app.addEventListener('click', (ev) => {
  const plot = ev.target.closest('.plot');
  if (!plot) return;
  const box = plot.querySelector('svg').getBoundingClientRect(), n = Number(plot.dataset.n);
  const i = Math.floor((ev.clientX - box.left) / (Number(plot.dataset.w) / n));
  if (i < 0 || i >= n || addDays(trendRange(trend.anchor).start, i) > today()) return;
  trend.pick = trend.pick === i ? null : i;
  render();
});
window.addEventListener('beforeprint', fillPrintout);
window.addEventListener('afterprint', () => { $('#printout').innerHTML = ''; });
window.addEventListener('resize', () => { if (ui.tab === 'trend' && !sheetOpen()) render(); });

$('#importFile').addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (f) importData(f);
});

// 자정을 넘긴 뒤 앱으로 돌아오면 '오늘'을 새로 계산
let lastDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.hidden || today() === lastDay) return;
  if (ui.selected === lastDay) ui.selected = today();
  lastDay = today();
  if (!sheetOpen()) render();
});

// ---------- 시작 ----------
// 홈 화면 앱이면 기기 화면 높이를 CSS에 알려 준다 (페이지를 화면보다 길게 유지하는 데 쓴다. 이유는 app.css의 .standalone 설명)
if (standalone()) {
  document.documentElement.classList.add('standalone');
  document.documentElement.style.setProperty('--screen-h', `${Math.max(screen.height, screen.width)}px`);
}
applyTheme();
applyFont();
render();
if (careUnasked()) openWelcome();
// 잠금: 열 때 가리고, 다른 앱으로 나갈 때도 바로 가려서 앱 전환 화면에 기록이 비치지 않게 한다
lockNow();
document.addEventListener('visibilitychange', () => { if (document.hidden) lockNow(); });
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
// 새 버전 받기: 아이폰 홈 화면 앱은 껐다 켜도 예전 화면을 그대로 들고 있는 일이 많다.
// 앱으로 돌아올 때마다 새 버전이 있는지 확인하고, 새 버전이 자리 잡으면 화면을 한 번 다시 연다.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const sw = navigator.serviceWorker;
  let hadOld = !!sw.controller, reloaded = false;
  sw.addEventListener('controllerchange', () => {
    if (!hadOld) { hadOld = true; return; }   // 처음 설치는 다시 열 필요가 없다
    if (reloaded || sheetOpen()) return;      // 기록 화면을 쓰는 중이면 그대로 둔다 (다음에 열 때 반영)
    reloaded = true;
    location.reload();
  });
  sw.register('sw.js').then((reg) => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
}

// 부작용·정신병적 증상을 직접 적는 칸에서 엔터를 누르면 바로 더한다
sheet.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' || ev.isComposing) return;
  if (ev.target.id === 'fx-new') { ev.preventDefault(); actions.fxAdd(); }
  if (ev.target.id === 'psy-new') { ev.preventDefault(); actions.psyAdd(); }
});
