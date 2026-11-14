// 인사이트 화면: 최근 7일을 종합해서 읽은 것(짧게), 약을 바꾼 앞뒤, AI로 가는 줄.
// 길게 늘어놓지 않는다: 평균끼리 견준 비교 목록은 뻔하거나 쓸모없다고 해서 뺐다 (사용자가 정함, 2026-11-13).
// 기록이 아직 적으면 예시 기록으로 어떤 것이 나오는지 미리 볼 수 있다 (ui.demo).
import { medChanges, numbers, recentState, shortSleepDays } from '../analysis.js';
import { md, parse } from '../dates.js';
import { app, esc } from '../dom.js';
import { F, T } from '../i18n.js';
import { IC } from '../icons.js';
import { sampleEntries } from '../sample.js';
import { ui } from '../state.js';
import { db } from '../store.js';
import { settingsButton } from './settings.js';

const bullets = (list) => (list.length ? `<ul>${list.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
// 표 한 줄: 첫 칸은 이름, 나머지는 값
const tr = (cells, head) => `<div class="tr${head ? ' th' : ''}">${cells.map((c) => `<span>${c}</span>`).join('')}</div>`;

export function viewInsight() {
  const n = Object.keys(db.entries).length, mine = recentState();
  const demo = ui.demo && !mine, state = demo ? recentState(sampleEntries()) : mine, changes = demo ? [] : medChanges();
  const src = demo ? sampleEntries() : db.entries, nums = numbers(src), sleepy = shortSleepDays(src);
  app.innerHTML = `
    <header class="top"><div><div class="over">${F('기록 {0}일', n)}</div><h1>${T('인사이트')}</h1></div>${settingsButton()}</header>
    <div class="sec">${demo ? T('예시 기록의 최근 7일') : T('최근 7일')}</div>
    ${state ? `<section class="card state"><b>${state.title}</b>
      ${state.flow ? `<div class="flow">${state.flow}</div>` : ''}
      ${bullets(state.points)}
      ${state.lead ? `<div class="flow">${state.lead}</div>` : ''}
      ${state.notes.map((x) => `<div class="beyond">${x}</div>`).join('')}
      <p>${demo ? T('만들어 낸 예시 기록이에요. 내 기록이 아니고 저장되지 않아요.') : T('진단이 아니에요. 진료 때 보여 주며 이야기해 보세요.')}</p></section>`
    : `<section class="card list"><div class="li say mut">${T('최근 7일 중 4일 이상 적으면 여기에 그 주를 읽은 내용이 나와요.')}</div></section>`}
    ${mine ? '' : `<section class="card list"><button class="li add${demo ? ' dim' : ''}" data-act="demo">${demo ? T('예시 닫기') : `${IC.spark}&nbsp; ${T('예시로 미리 보기')}`}</button></section>`}
    ${nums.length ? `<div class="sec">${T('숫자로 보기')}</div>
    <section class="card tbl nums">${tr(['', T('최근 7일'), T('그 전 4주')], true)}${nums.map((r) => tr(r)).join('')}</section>
    <p class="secnote">${T('평균 아래 작은 글씨는 가장 낮은 날–높은 날이에요. 해석 없이 숫자만 적었어요.')}</p>` : ''}
    ${sleepy ? `<div class="sec">${T('잠을 적게 잔 날 · 최근 8주')}</div>
    <section class="card tbl nums">${tr(['', F('적게 잔 날 {0}일', sleepy.short), F('그 밖 {0}일', sleepy.rest)], true)}${sleepy.rows.map((r) => tr(r)).join('')}</section>
    <p class="secnote">${T('내 평균보다 1시간 넘게 적게 자고 일어난 날을 나머지 날과 나란히 놓았어요.')}</p>` : ''}
    ${changes.map((c) => `<div class="sec">${F('약을 바꾼 뒤 · {0}', md(parse(c.date)))}</div>
    <section class="card tbl">${c.text ? `<div class="tbl-t">${esc(c.text)}</div>` : ''}${tr(['', T('앞 2주'), F('뒤 {0}일', c.after)], true)}${c.rows.map((r) => tr(r)).join('')}</section>`).join('')}
    <div class="sec">${T('더 보기')}</div>
    <section class="card list">
      <button class="li add" data-act="copyAi">${IC.spark}&nbsp; ${T('AI에게 물어볼 글 복사 (최근 4주)')}</button>
    </section>
    <p class="secnote">${T('복사한 글을 Claude나 ChatGPT 같은 AI 앱에 붙여 넣으면 기록 전체를 읽고 패턴을 정리해 줘요. 붙여 넣는 순간 그 기록은 해당 AI 서비스로 전송돼요.')}</p>`;
}
