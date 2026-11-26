// 잠금: 앱을 열 때 숫자 4자리를 묻는다.
// 가벼운 가림막이다. 기록 자체는 암호화되지 않으므로, 폰을 다룰 줄 아는 사람까지 막지는 못한다.
// 비밀번호는 그대로 저장하지 않고 한 방향으로 섞은 값(해시)만 db.settings.pin 에 둔다.
import { AI_KEY, AI_OUT, KEY, OLD_KEY } from './config.js';
import { toast } from './dom.js';
import { T } from './i18n.js';
import { db, save } from './store.js';

const LENGTH = 4;
export const hasPin = () => !!db.settings.pin;

async function hash(pin) {
  if (!(window.crypto && crypto.subtle)) return `plain:${pin}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tide:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// mode: 'unlock'(열기) · 'new'(새 비밀번호) · 'again'(한 번 더 확인)
let overlay = null, mode = 'unlock', typed = '', first = '', message = '';

function draw() {
  const title = { unlock: T('비밀번호를 눌러 주세요'), new: T('새 비밀번호 4자리'), again: T('한 번 더 눌러 주세요') }[mode];
  overlay.innerHTML = `<div class="lock-in">
    <div class="lock-title">${title}</div>
    <div class="lock-msg">${message}</div>
    <div class="lock-dots">${Array.from({ length: LENGTH }, (_, i) => `<i class="${i < typed.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="lock-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
      <button type="button" class="lock-txt" data-k="${mode === 'unlock' ? 'forgot' : 'cancel'}">${mode === 'unlock' ? T('잊었어요') : T('취소')}</button>
      <button type="button" data-k="0">0</button>
      <button type="button" class="lock-txt" data-k="back" aria-label="${T('지우기')}">⌫</button></div>
  </div>`;
}

function open(next) {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'lock';
    overlay.className = 'lock';
    overlay.addEventListener('click', onTap);
    document.body.appendChild(overlay);
  }
  mode = next; typed = ''; first = ''; message = '';
  overlay.hidden = false;
  draw();
}
const close = () => { if (overlay) overlay.hidden = true; };

async function complete() {
  if (mode === 'unlock') {
    if ((await hash(typed)) === db.settings.pin) { close(); return; }
    message = T('맞지 않아요. 다시 눌러 주세요.');
  } else if (mode === 'new') {
    first = typed; mode = 'again';
  } else if (typed === first) {
    db.settings.pin = await hash(typed);
    save(); close(); toast(T('잠금을 켰어요'));
    return;
  } else {
    mode = 'new'; first = ''; message = T('두 번이 서로 달라요. 처음부터 다시 해 주세요.');
  }
  typed = '';
  draw();
}

function forgot() {
  // 비밀번호는 되찾을 방법이 없다. 남은 길은 이 폰의 기록을 지우고 새로 시작하는 것뿐이라 두 번 묻는다.
  if (!confirm(T('비밀번호는 되찾을 수 없어요.\n이 폰에 있는 기록을 모두 지우고 새로 시작할까요? 백업 파일이 있으면 나중에 불러올 수 있어요.'))) return;
  if (!confirm(T('정말 모든 기록을 지울까요? 되돌릴 수 없어요.'))) return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(OLD_KEY);
  localStorage.removeItem(AI_KEY);
  localStorage.removeItem(AI_OUT);
  location.reload();
}

function onTap(ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  const k = b.dataset.k;
  if (k === 'forgot') { forgot(); return; }
  if (k === 'cancel') { close(); return; }
  if (k === 'back') typed = typed.slice(0, -1);
  else if (typed.length < LENGTH) typed += k;
  message = '';
  draw();
  if (typed.length === LENGTH) setTimeout(complete, 120);   // 마지막 점이 채워지는 게 보이게 잠깐 둔다
}

// 잠금이 켜져 있으면 가림막을 띄운다 (앱을 열 때, 다른 앱으로 나갈 때)
export function lockNow() { if (hasPin()) open('unlock'); }
// 설정에서: 비밀번호 정하기·바꾸기, 잠금 끄기
export function setPin() { open('new'); }
export function removePin() { delete db.settings.pin; save(); }
