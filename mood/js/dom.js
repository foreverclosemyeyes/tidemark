// 화면 요소 도우미와 시트 열고 닫기
import { ui } from './state.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root) => (root || document).querySelector(sel);
export const app = $('#app'), sheet = $('#sheet');

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export const toTop = () => window.scrollTo(0, 0);

// 글을 클립보드에 복사한다 (권한이 없으면 예전 방식으로)
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return; } catch (e) { /* 아래 방식으로 다시 */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* 복사 불가 */ }
  ta.remove();
}

// 클래스를 뗐다 붙여서 CSS 애니메이션을 처음부터 다시 돌린다
function replay(el, cls, ms) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
// 화면 내용이 바뀔 때의 움직임. 'enter'는 살짝 떠오르기(탭), 'next'/'prev'는 옆에서 들어오기(날짜 넘기기)
export const enterApp = (how = 'enter') => replay(app, how, 380);
// 시트 안의 내용이 옆에서 들어오기 (처음 안내의 장 넘기기)
export const enterSheet = (how) => replay(sheet, how, 380);

// ---------- 시트 열고 닫기 ----------
const SHEET_OUT = 240;   // app.css의 sheet-out 시간과 같아야 한다
let closing;
// 닫혀 있다가 열릴 때만 아래에서 올라온다. 열린 채 다시 그릴 때는 그대로 둔다.
export function showSheet() {
  const wasClosed = sheet.hidden || sheet.classList.contains('leaving');
  clearTimeout(closing);
  sheet.classList.remove('leaving');
  sheet.hidden = false;
  sheet.scrollTop = 0;
  document.body.classList.add('locked');
  if (wasClosed) replay(sheet, 'entering', 360);
}
export function closeSheet() {
  ui.addingMed = false;
  ui.draft = null;
  ui.welcome = null;
  document.body.classList.remove('locked');
  sheet.classList.add('leaving');
  clearTimeout(closing);
  closing = setTimeout(() => { sheet.hidden = true; sheet.innerHTML = ''; sheet.classList.remove('leaving'); }, SHEET_OUT);
}
// 시트가 떠 있는지 (닫히는 중은 닫힌 것으로 본다)
export const sheetOpen = () => !sheet.hidden && !sheet.classList.contains('leaving');
