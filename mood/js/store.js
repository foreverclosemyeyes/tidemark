// 저장소: 기록은 이 기기의 localStorage에만 둔다
import { KEY, OLD_KEY } from './config.js';
import { toast } from './dom.js';
import { T } from './i18n.js';

// ---------- 저장소 (이 기기 안에만 저장) ----------
const blank = () => ({ version: 3, entries: {}, meds: [], taken: {}, settings: {} });
// 예전 기록을 지금 형식으로 옮긴다
export function migrate(data) {
  // 1 → 2: 식욕·카페인 3단계를 0~10 숫자로
  if ((data.version || 1) < 2) {
    Object.values(data.entries || {}).forEach((e) => {
      if (e.appetite != null) e.appetite = [2, 5, 8][e.appetite];
      if (e.caffeine != null) e.caffeine = [0, 4, 8][e.caffeine];
    });
    data.version = 2;
  }
  // 2 → 3: 술·운동 딱지(entry.tags)를 "내 항목"으로. 쓴 적이 있는 것만 했음/안 했음 항목으로 만들고 그날 값도 옮긴다.
  if (data.version < 3) {
    const names = { alcohol: '술', exercise: '운동' }, used = new Set();
    Object.values(data.entries || {}).forEach((e) => {
      Object.keys(e.tags || {}).forEach((k) => { if (e.tags[k] && names[k]) { used.add(k); (e.custom || (e.custom = {}))[k] = true; } });
      delete e.tags;
    });
    data.settings = data.settings || {};
    const list = data.settings.custom || (data.settings.custom = []);
    used.forEach((k) => { if (!list.some((c) => c.id === k)) list.push({ id: k, name: names[k], type: 'check' }); });
    data.version = 3;
  }
  return data;
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY));
    if (raw && typeof raw === 'object' && raw.entries) return migrate(Object.assign(blank(), raw, { version: raw.version || 1 }));
  } catch (e) { /* 처음 실행이거나 읽기 실패 */ }
  return blank();
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch (e) { toast(T('저장하지 못했어요. 저장 공간을 확인해 주세요.')); return false; }
}
export const db = load();

// 내 항목: 사용자가 설정에서 직접 만든 기록 항목들 [{ id, name, type, unit }]
export const customDefs = () => db.settings.custom || [];

// 병원·상담용 기능(증상·약 항목, 인사이트·진료 화면)을 쓰는지. 처음 열 때 묻고 설정에서 바꾼다.
// 한 번도 안 골랐으면 켜진 것으로 본다 (이 물음이 생기기 전부터 쓰던 사람은 그대로).
export const careOn = () => db.settings.care !== false;
// 아직 안 물어봤는지 (처음 안내가 뜬다. 이미 쓰던 사람에게도 한 번 묻는다)
export const careUnasked = () => db.settings.care == null;

// 설정에서 꺼 둔 기록 항목인지 (settings.off에 열쇠가 있으면 꺼진 것. 없으면 전부 켜짐)
export const itemOn = (key) => !(db.settings.off || []).includes(key);
