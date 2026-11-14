// 파일: 캘린더 알림, 백업 내보내기·불러오기
import { addDays, parse, today } from './dates.js';
import { toast } from './dom.js';
import { F, T } from './i18n.js';
import { medKey } from './meds.js';
import { render } from './render.js';
import { db, migrate, save } from './store.js';
import { applyFont, applyTheme } from './theme.js';
import { openSettings } from './views/settings.js';

// 기록 알림 시각은 설정에, 약 알람 시각은 약마다(db.meds[i].alarms = ['09:00', ...]) 둔다
export const remind = () => (db.settings.remind || (db.settings.remind = { log: '21:30' }));
export const hasAlarms = () => !!remind().log || db.meds.some((m) => (m.alarms || []).some(Boolean));
// 매일 반복되는 캘린더 알림 파일(.ics)을 만든다
export function makeIcs() {
  const r = remind(), day = today().replace(/-/g, '');
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const url = location.href.split('#')[0];
  const ev = (uid, time, title) => (time ? ['BEGIN:VEVENT', `UID:${uid}@tide-app`, `DTSTAMP:${stamp}`, `DTSTART:${day}T${time.replace(':', '')}00`,
    'DURATION:PT5M', 'RRULE:FREQ=DAILY', `SUMMARY:${title}`, `URL:${url}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT'] : []);
  const medEvents = db.meds.flatMap((m, i) => [...new Set((m.alarms || []).filter(Boolean))].flatMap((time) =>
    ev(`med${i}-${time.replace(':', '')}`, time, F('{0} 먹을 시간', `${m.name}${m.dose ? ` ${m.dose}` : ''}`))));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tidemark//Reminders//KO', 'CALSCALE:GREGORIAN',
    ...ev('log', r.log, T('Tidemark 기록하기')), ...medEvents, 'END:VCALENDAR'].join('\r\n');
}

// 파일 건네기: 아이폰에서는 공유 창, 그 밖에는 내려받기
export async function giveFile(name, text, type) {
  try {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return true; }
  } catch (e) {
    if (e && e.name === 'AbortError') return false;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

export async function exportData() {
  const name = `tide-backup-${today()}.json`;
  // 잠금 비밀번호는 백업에 넣지 않는다 (다른 폰에서 불러왔을 때 잠겨 버리지 않게)
  const settings = Object.assign({}, db.settings);
  delete settings.pin;
  const text = JSON.stringify(Object.assign({ app: 'tide', exportedAt: new Date().toISOString() }, db, { settings }), null, 2);
  if (!(await giveFile(name, text, 'application/json'))) return;
  db.settings.lastBackup = today();
  delete db.settings.backupSnooze;
  save();
  render();
  toast(T('백업 파일을 만들었어요'));
}

// 백업 챙기기: 기록이 일주일치 넘게 쌓였는데 백업한 적이 없거나 2주가 넘었으면 오늘 화면에 한 줄 알려 준다
const BACKUP_EVERY = 14, BACKUP_SNOOZE = 7;
export const daysSinceBackup = () => (db.settings.lastBackup ? Math.round((parse(today()) - parse(db.settings.lastBackup)) / 86400000) : null);
export function backupDue() {
  const since = daysSinceBackup();
  if (Object.keys(db.entries).length < 7 || (since != null && since < BACKUP_EVERY)) return false;
  return !db.settings.backupSnooze || db.settings.backupSnooze <= today();
}
export function snoozeBackup() {
  db.settings.backupSnooze = addDays(today(), BACKUP_SNOOZE);
  save();
}

export function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let inc;
    try { inc = JSON.parse(reader.result); } catch (e) { inc = null; }
    const ok = inc && typeof inc.entries === 'object' && inc.entries &&
      Object.values(inc.entries).every((e) => e && (e.mood == null || typeof e.mood === 'number') && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''));
    if (!ok) { toast(T('이 앱의 백업 파일이 아니에요')); return; }
    migrate(inc);
    const n = Object.keys(inc.entries).length;
    if (!confirm(F('백업 파일에 {0}일치 기록이 있어요.\n지금 기록과 합칠까요? (같은 날짜는 더 최근에 수정한 쪽을 남겨요)', n))) return;
    // 기록이 하나도 없는 새 앱(지웠다가 다시 깔았거나 새 폰)에 불러올 때는 화면 설정과 직접 만든 목록도 백업에서 가져온다.
    // 이미 쓰던 앱에 합칠 때는 지금 설정을 그대로 둔다. 잠금 비밀번호는 백업에 없다.
    if (!Object.keys(db.entries).length && inc.settings && typeof inc.settings === 'object') {
      ['theme', 'color', 'font', 'size', 'remind', 'off', 'care', 'fxCustom', 'psyCustom'].forEach((k) => { if (inc.settings[k] != null) db.settings[k] = inc.settings[k]; });
      applyTheme(); applyFont();
    }
    Object.values(inc.entries).forEach((e) => {
      const cur = db.entries[e.date];
      if (!cur || (e.updatedAt || '') >= (cur.updatedAt || '')) db.entries[e.date] = e;
    });
    (Array.isArray(inc.meds) ? inc.meds : []).forEach((m) => {
      if (m && m.name && !db.meds.some((s) => medKey(s) === medKey(m))) db.meds.push({ name: String(m.name), dose: String(m.dose || ''), alarms: (Array.isArray(m.alarms) ? m.alarms : []).filter((t) => /^\d\d:\d\d$/.test(t)) });
    });
    Object.keys(inc.taken || {}).forEach((k) => { if (!db.taken[k] && !db.entries[k] && Array.isArray(inc.taken[k])) db.taken[k] = inc.taken[k]; });
    // 내 항목: 백업에 있는 항목 가운데 내게 없는 것만 더한다 (그래야 가져온 기록의 값이 화면에 보인다)
    const defs = db.settings.custom || (db.settings.custom = []);
    ((inc.settings && Array.isArray(inc.settings.custom)) ? inc.settings.custom : []).forEach((c) => {
      if (c && c.id && c.name && ['check', 'scale', 'number'].includes(c.type) && !defs.some((x) => x.id === c.id)) defs.push({ id: String(c.id), name: String(c.name), type: c.type, unit: String(c.unit || '') });
    });
    // 진료 탭: 말할 것은 없는 줄만 더하고, 다음 진료일은 비어 있을 때만 가져온다
    if (inc.clinic && typeof inc.clinic === 'object') {
      const mine = db.clinic || (db.clinic = { next: '', notes: [] });
      (Array.isArray(inc.clinic.notes) ? inc.clinic.notes : []).forEach((x) => { if (typeof x === 'string' && !mine.notes.includes(x)) mine.notes.push(x); });
      if (!mine.next && /^\d{4}-\d{2}-\d{2}$/.test(inc.clinic.next || '')) mine.next = inc.clinic.next;
      // 진료·약 변경 기록: 똑같은 줄이 없을 때만 더하고 날짜순으로 둔다
      const log = mine.log || (mine.log = []);
      (Array.isArray(inc.clinic.log) ? inc.clinic.log : []).forEach((x) => {
        if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') || !['visit', 'med'].includes(x.kind)) return;
        const item = { date: x.date, kind: x.kind, text: String(x.text || '') };
        if (!log.some((y) => y.date === item.date && y.kind === item.kind && y.text === item.text)) log.push(item);
      });
      log.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
    if (!save()) return;
    render();
    openSettings();
    toast(F('{0}일치 기록을 불러왔어요', n));
  };
  reader.readAsText(file);
}
