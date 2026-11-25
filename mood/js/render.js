// 지금 탭을 그린다
import { app } from './dom.js';
import { T } from './i18n.js';
import { IC } from './icons.js';
import { ui } from './state.js';
import { careOn } from './store.js';
import { viewClinic } from './views/clinic.js';
import { viewToday } from './views/today.js';
import { viewTrend } from './views/trend.js';

const TABS = [
  ['today', viewToday, () => IC.today, () => T('오늘')],
  ['trend', viewTrend, () => IC.chart, () => T('흐름')],
  ['clinic', viewClinic, () => IC.doc, () => T('진료')],
];

// 병원·상담용 기능을 꺼 두면 진료 탭은 없다
const CARE_TABS = ['clinic'];

export function render() {
  const tabs = TABS.filter(([key]) => careOn() || !CARE_TABS.includes(key));
  (tabs.find(([key]) => key === ui.tab) || tabs[0])[1]();
  app.insertAdjacentHTML('beforeend', `<nav class="tabbar">${tabs.map(([key, , icon, name]) =>
    `<button data-act="tab" data-tab="${key}" aria-pressed="${ui.tab === key}">${icon()}<span>${name()}</span></button>`).join('')}</nav>`);
}
