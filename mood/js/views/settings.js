// 설정 화면
import { VERSION } from '../config.js';
import { CUSTOM_TYPES, DISCLAIMER, FONTS, ITEMS, SIZES } from '../constants.js';
import { esc, sheet, showSheet } from '../dom.js';
import { daysSinceBackup, remind } from '../files.js';
import { EN, F, T } from '../i18n.js';
import { IC } from '../icons.js';
import { hasPin } from '../lock.js';
import { medAddHtml, medKey } from '../meds.js';
import { standalone, ui } from '../state.js';
import { careOn, customDefs, db, itemOn } from '../store.js';
import { ACCENTS, accentKey, isLight } from '../theme.js';

// ---------- 설정·백업 ----------
// 설정은 기능별로 나눠 위쪽의 가로 탭으로 오간다 (지금 탭은 ui.setTab). 길게 한 줄로 늘어놓거나 접어 두면 찾기 불편하다고 해서 바꿨다.
// 탭마다 내용은 전부 그려 두고, 지금 탭이 아닌 것은 숨긴다.
const TABS = () => [['rec', T('기록')], ['look', T('화면')], ['remind', T('알림')], ['data', T('백업 · 잠금')], ['help', T('도움말')]];
const tabsHtml = () => `<div class="settabs" role="tablist">${TABS().map(([key, name]) =>
  `<button type="button" role="tab" data-act="setTab" data-g="${key}" aria-selected="${ui.setTab === key}">${name}</button>`).join('')}</div>`;
const group = (key, body) => `<div class="setpane" data-pane="${key}"${ui.setTab === key ? '' : ' hidden'}>${body}</div>`;

// 화면 머리말 오른쪽의 설정 단추 (네 탭 모두에 있다)
export const settingsButton = () => `<button class="icon-btn" data-act="settings" aria-label="${T('설정과 백업')}">${IC.sliders}</button>`;

export function openSettings() {
  const n = Object.keys(db.entries).length;
  const pick = (act, attr, on, label, style) => `<button class="li med" data-act="${act}" ${attr} aria-pressed="${on}"${style ? ` style="${style}"` : ''}>
    <span class="lk">${label}</span><span class="chk">✓</span></button>`;
  // 약마다: 이름·용량, 삭제, 그리고 알람 시각들 (캘린더 알림 파일에 들어간다)
  const meds = db.meds.map((m, mi) => `<div class="li col">
      <div class="slh"><span class="lk">${IC.pill}${esc(m.name)}<small>${esc(m.dose || '')}</small></span>
        <button class="txt dim" data-act="delMed" data-med="${esc(medKey(m))}">${T('삭제')}</button></div>
      <div class="doses alarms">${(m.alarms || []).map((time, i) => `<span class="dose"><input type="time" class="alarm-at" data-m="${mi}" data-i="${i}" value="${esc(time)}" aria-label="${T('알람 시각')}">
        <button type="button" data-act="alarmDel" data-m="${mi}" data-i="${i}" aria-label="${T('삭제')}">✕</button></span>`).join('')}
        <button type="button" class="mini" data-act="alarmAdd" data-m="${mi}">${T('+ 알람')}</button></div>
    </div>`).join('');
  sheet.innerHTML = `<div class="sheet-in" style="padding-bottom:calc(var(--safe-b) + 30px)">
    <div class="sheet-top">
      <span class="txt"></span>
      <div class="st"><b>${T('설정')}</b><span>${F('기록 {0}일', n)}</span></div>
      <button class="txt strong" data-act="close">${T('완료')}</button>
    </div>
    ${tabsHtml()}

    ${group('rec', `
    <section class="card list"><button type="button" class="li sw" data-act="care" aria-pressed="${careOn()}"><span class="lk">${T('병원 · 상담용 기능')}</span><i></i></button></section>
    <p class="secnote">${T('끄면 증상 · 약 · 부작용 항목과 인사이트 · 진료 화면이 숨겨져요. 적어 둔 기록은 지워지지 않고, 다시 켜면 그대로 나와요. 항목은 아래에서 하나씩 따로 켤 수도 있어요.')}</p>

    <div class="sec">${T('기록 항목')}</div>
    <section class="card list">${ITEMS.map(([k, label]) => `<button type="button" class="li sw" data-act="item" data-k="${k}" aria-pressed="${itemOn(k)}"><span class="lk">${label}</span><i></i></button>`).join('')}</section>
    <p class="secnote">${T('안 쓰는 항목을 끄면 기록·오늘·흐름·진료 화면에서 안 보여요. 이미 적어 둔 값은 지워지지 않고, 다시 켜면 그대로 나와요.')}</p>

    <div class="sec">${T('내 항목')}</div>
    <section class="card list">
      ${customDefs().map((c) => `<div class="li"><span class="lk">${esc(c.name)}<small>${CUSTOM_TYPES.find(([k]) => k === c.type)[1]}${c.unit ? ` · ${esc(c.unit)}` : ''}</small></span>
        <button class="txt dim" data-act="customDel" data-id="${esc(c.id)}">${T('삭제')}</button></div>`).join('')}
      <div class="li col">
        <input type="text" id="cu-name" maxlength="20" placeholder="${T('새 항목 이름 (예: 술, 운동, 걸음 수)')}" autocomplete="off">
        <div class="seg">${CUSTOM_TYPES.map(([k, label], i) => `<button type="button" data-act="customType" data-t="${k}" aria-pressed="${i === 0}">${label}</button>`).join('')}</div>
        <input type="text" id="cu-unit" maxlength="10" placeholder="${T('단위 (예: 잔, 분, 보)')}" autocomplete="off" hidden>
        <button class="mini" data-act="customAdd">${T('항목 추가')}</button>
      </div>
    </section>
    <p class="secnote">${T('내가 따로 적고 싶은 것을 만들 수 있어요. 했음 · 안 했음은 누르기만 하면 되고, 0~10 정도는 슬라이더로, 숫자는 단위와 함께 적어요.')}</p>

    <div class="sec" id="sec-meds">${T('자주 먹는 약')}</div>
    <section class="card list">${meds}${medAddHtml()}</section>
    `)}

    ${group('look', `
    <div class="sec">${T('언어 · Language')}</div>
    <section class="card list">${pick('lang', 'data-lang="ko"', !EN, '한국어')}${pick('lang', 'data-lang="en"', EN, 'English')}</section>

    <div class="sec">${T('화면 모드')}</div>
    <section class="card list">${[['auto', T('자동 (아이폰 설정 따라감)')], ['light', T('라이트')], ['dark', T('다크')]].map(([k, label]) =>
      pick('theme', `data-theme-pick="${k}"`, (db.settings.theme || 'dark') === k, label)).join('')}</section>

    <div class="sec">${T('색')}</div>
    <section class="card list">${pick('color', 'data-color-pick="off"', !accentKey(), T('흑백'))}${Object.keys(ACCENTS).map((k) =>
      pick('color', `data-color-pick="${k}"`, accentKey() === k, `<i class="sw-dot" style="background:rgb(${ACCENTS[k][isLight() ? 2 : 1]})"></i>${T(ACCENTS[k][0])}`)).join('')}</section>
    <p class="secnote">${T('기분·에너지·자신감이 낮은 날은 회색, 높을수록 고른 색으로 물들어요.')}</p>

    <div class="sec">${T('글씨체')}</div>
    <section class="card list">${Object.keys(FONTS).map((k) => pick('font', `data-font="${k}"`, (db.settings.font || 'system') === k,
      `${FONTS[k][0]}<small>${T('가나다 123')}</small>`, `font-family:${esc(FONTS[k][1])}`)).join('')}</section>

    <div class="sec">${T('글씨 크기')}</div>
    <section class="card list">${Object.keys(SIZES).map((k) => pick('size', `data-size="${k}"`, (db.settings.size || 'm') === k,
      `<span style="font-size:${15 * SIZES[k][1]}px">${SIZES[k][0]}</span>`)).join('')}</section>
    `)}

    ${group('remind', `
    <div class="sec">${T('알림')}</div>
    <section class="card list">
      <label class="li"><span class="lk">${T('기록 알림')}</span><input type="time" id="r-log" value="${esc(remind().log || '')}"></label>
      <button class="li add" data-act="ics">${T('캘린더에 알림 추가')}</button>
    </section>
    <p class="secnote">${T('아이폰 웹앱은 정해진 시간에 스스로 알림을 보낼 수 없어요. 대신 매일 반복되는 캘린더 알림 파일을 만들어 드려요. 약 알람은 아래 “자주 먹는 약”에서 약마다 정하고, 버튼을 누른 뒤 “캘린더에 추가”를 고르세요. 시간을 바꿨으면 캘린더에서 예전 Tidemark 알림을 지우고 다시 추가해 주세요.')}</p>
    `)}

    ${group('data', `
    <div class="sec">${T('백업')}</div>
    <section class="card list">
      <button class="li add" data-act="export">${T('백업 파일 내보내기')}</button>
      <button class="li add" data-act="import">${T('백업 파일 불러오기')}</button>
    </section>
    <p class="secnote">${daysSinceBackup() == null ? T('아직 백업한 적이 없어요.') : F('마지막 백업: {0}일 전.', daysSinceBackup())} ${T('기록은 이 아이폰 안에만 저장돼요. 폰을 바꾸거나 앱을 지우면 사라지니, 가끔 백업 파일을 만들어 “파일” 앱이나 iCloud에 넣어 두세요.')}</p>

    <div class="sec">${T('잠금')}</div>
    <section class="card list">${hasPin()
    ? `<button class="li add" data-act="pinSet">${T('비밀번호 바꾸기')}</button><button class="li add" data-act="pinOff">${T('잠금 끄기')}</button>`
    : `<button class="li add" data-act="pinSet">${T('비밀번호로 잠그기')}</button>`}</section>
    <p class="secnote">${T('앱을 열 때 숫자 4자리를 물어요. 옆 사람이 바로 못 보게 하는 가림막이고, 기록이 암호로 바뀌는 것은 아니에요. 비밀번호를 잊으면 되찾을 수 없어요.')}</p>
    `)}

    ${group('help', `
    <div class="sec">${T('홈 화면에 추가하는 방법')}</div>
    <section class="card"><ol class="steps">
      <li>${T('사파리에서 이 페이지를 엽니다.')}</li>
      <li>${T('아래쪽 공유 버튼(네모에 위쪽 화살표)을 누릅니다.')}</li>
      <li>${T('“홈 화면에 추가”를 누릅니다.')}</li>
    </ol></section>
    <p class="secnote">${DISCLAIMER} ${T('걱정되는 변화가 있으면 진료 때 이 기록을 보여 주며 이야기해 보세요.')}</p>

    <div class="sec">${T('방문 수 세기')}</div>
    <section class="card list"><button type="button" class="li sw" data-act="countToggle" aria-pressed="${!db.settings.noCount}"><span class="lk">${T('이 폰도 방문 수에 넣기')}</span><i></i></button></section>
    <p class="secnote">${T('몇 명이 쓰는지 알려고, 앱을 연 날에 하루 한 번 “열었다”는 신호만 보내요. 기록 내용은 보내지 않아요. 끄면 이 폰은 세지 않아요.')}</p>
    `)}

    <p class="foot" id="about">Tidemark ${VERSION} · ${standalone() ? T('홈 화면 앱') : T('브라우저')} · ${screen.width}×${screen.height} / ${innerWidth}×${innerHeight}</p>
  </div>`;
  showSheet();
}
