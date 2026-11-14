// 처음 한 번 뜨는 안내: 이 앱이 무엇인지 한 장, 그다음 어떻게 쓸지 고르기.
// 고르기 전까지(settings.care가 비어 있는 동안)는 앱을 열 때마다 다시 뜬다. 이미 쓰던 사람에게도 한 번 뜬다.
import { sheet, showSheet } from '../dom.js';
import { T } from '../i18n.js';
import { IC } from '../icons.js';
import { db } from '../store.js';

const dots = (step) => `<div class="wl-dots">${[0, 1].map((i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;

export function openWelcome(step = 0) {
  const row = (icon, title, text) => `<div class="li wl-row">${icon}<span><b>${title}</b><small>${text}</small></span></div>`;
  const way = (v, title, text) => `<button type="button" class="card grp" data-act="care" data-v="${v}"><span><b>${title}</b><small>${text}</small></span><i class="chev"></i></button>`;
  sheet.innerHTML = `<div class="sheet-in welcome">${step === 0 ? `
    <img class="wl-icon" src="icons/icon-192.png" alt="">
    <h2>Tidemark</h2>
    <p class="wl-sub">${T('매일 10초, 내 상태를 적어 두는 기록장')}</p>
    <section class="card list">
      ${row(IC.today, T('오늘'), T('기분 · 에너지 · 잠을 누르기만 해서 적어요.'))}
      ${row(IC.chart, T('흐름'), T('지난 날들을 그래프와 달력으로 봐요.'))}
      ${row(IC.doc, T('내 폰에만'), T('기록은 이 폰 안에만 저장돼요. 서버도 로그인도 없어요.'))}
    </section>
    ${dots(0)}
    <button class="btn" data-act="welcomeNext">${T('다음')}</button>` : `
    <h2>${T('어떻게 쓰실 건가요?')}</h2>
    <p class="wl-sub">${T('고른 쪽에 맞춰 화면을 정리해 드려요. 설정에서 언제든 바꿀 수 있어요.')}</p>
    ${way(1, T('병원이나 상담에 다니고 있어요'), T('증상 · 약 · 진료용 요약까지'))}
    ${way(0, T('그냥 내 컨디션을 적어 보고 싶어요'), T('기분 · 에너지 · 잠만 간단하게'))}
    ${Object.keys(db.entries).length ? `<p class="secnote">${T('적어 둔 기록은 어느 쪽을 골라도 그대로 있어요.')}</p>` : ''}
    ${dots(1)}`}
  </div>`;
  showSheet();
}
