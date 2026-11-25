// 화면 상태
import { today } from './dates.js';

// ---------- 화면 상태 ----------
// medGroup: 약을 더할 때 고른 종류 (없으면 ''), demo: 흐름 화면에서 예시 기록을 보고 있는지, setTab: 설정에서 보고 있는 탭, welcome: 처음 안내의 몇째 장인지 (안 떠 있으면 null)
export const ui = { tab: 'today', selected: today(), draft: null, addingMed: false, medGroup: '', demo: false, setTab: 'rec', welcome: null };
export const standalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// ---------- 흐름 화면 (mode: 'week' | 'month' | 'half' | 'year', pick: 고른 칸) ----------
export const trend = { mode: 'week', anchor: today(), pick: null };

// ---------- 진료 화면 (요약을 내보낼 기간: 1 / 2 / 4주 또는 'since' = 지난 진료 후) ----------
export const clinicView = { weeks: 2 };
