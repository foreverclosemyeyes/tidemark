// 진료용 요약 한 장. 두 가지 모양으로 낸다: 폰에서 의사에게 바로 보여 주는 화면(openSummary)과, 종이·PDF용 한 장(printoutHtml).
// 읽는 사람은 의사다 (진료 몇 분 안에 훑어본다). 담는 것: 본인이 말하고 싶은 것, 그림, 약, 눈에 띄는 날, 메모.
// 평균 숫자 칸과 진료·약 변경 기록은 넣지 않는다 (숫자는 그림에서 보이고, 변경 기록은 의사가 이미 갖고 있다고 사용자가 뺌, 2026-11-27).
// 그림은 흐름 탭과 같은 한 장(sheet.js)이다. 앱이 풀이한 글(신호·읽기)은 넣지 않고 적은 것만 넣는다.
import { summary } from '../analysis.js';
import { DISCLAIMER, LEVELS } from '../constants.js';
import { longDate, md, parse, today } from '../dates.js';
import { esc, sheet, showSheet } from '../dom.js';
import { F, T } from '../i18n.js';
import { itemOn } from '../store.js';
import { fontScale } from '../theme.js';
import { clinicData, shortDate, summaryRows } from './clinic.js';
import { columns, flowSource, sheetHtml } from './sheet.js';

const PAGE = 600;   // 종이의 그림 너비 (가로 A4의 왼쪽 단 너비쯤). 그림은 단 너비에 맞춰 늘거나 준다.
const DAILY = 10;   // 이 날 수까지는 날마다 날짜를 적고, 넘으면 월요일마다 적는다

// 두 모양이 같이 쓰는 내용. days: 오늘까지 며칠을 담을지. since: "지난 진료부터"로 뽑을 때 그 진료일 (아니면 ''). width·scale: 그림 너비와 글자 크기 배수.
// 돌려주는 것: { period(기간 글), figure(sheetHtml의 결과), talk(말하고 싶은 것들), blocks: [[제목, 줄들]] (줄은 [왼쪽, 오른쪽] 또는 [날짜, 글, 'note']) }
function parts(days, since, width, scale) {
  const s = summary(days), r = summaryRows(s);
  // 하루가 한 칸. 월요일마다 날짜를 적고 세로 줄을 긋는다 (짧은 기간은 날마다 날짜).
  const cols = columns(s.dates[0], s.dates.length, 1, flowSource());
  const daily = days <= DAILY, mondays = cols.map((_, i) => i).filter((i) => parse(cols[i].start).getDay() === 1);
  const labels = (daily ? cols.map((_, i) => i) : mondays).map((i) => [i, shortDate(cols[i].start), daily ? 'mid' : 'left']);
  const count = ([name, n]) => [esc(name), F('{0}일', n)];
  const first = md(parse(s.dates[0])), last = md(parse(s.dates[s.dates.length - 1]));
  return {
    period: `${since ? F('지난 진료 {0} → 오늘 {1}', first, last) : `${first} – ${last}`} · ${F('기록 {0}일 / {1}일', s.got.length, s.dates.length)}`,
    figure: sheetHtml({ cols, width, scale, labels, guides: daily ? [] : mondays.filter(Boolean), colors: true, tall: true, callouts: true }),
    talk: clinicData().notes,
    blocks: [
      [T('약 (먹은 날)'), itemOn('meds') ? r.meds.map(([name, v]) => [esc(name), v]) : []],
      [T('부작용'), itemOn('fx') ? s.fx.map(count) : []],
      [T('눈에 띄는 날'), r.flags],
      [T('정신병적 증상'), itemOn('psy') ? s.psych.map(count) : []],
      [T('기분이 높았던 날 체크한 항목'), s.signs.map(count)],
      [T('메모'), s.notes.map(([d, note]) => [shortDate(d), esc(note), 'note'])],
    ].filter(([, rows]) => rows.length),
  };
}
const footText = () => `${T('본인이 휴대폰에 날마다 직접 적은 기록이에요 · 위아래로 같은 자리가 같은 날 · 증상은 높이 솟을수록 심했던 날')} · ${F('증상은 {0}~{1} 다섯 단계로 적은 것', LEVELS[0], LEVELS[4])}. ${DISCLAIMER}`;

// 종이·PDF용: 가로 A4에 왼쪽 그림, 오른쪽 글
export function printoutHtml(days, since) {
  const p = parts(days, since, PAGE, 1);
  const block = ([title, rows]) => `<section class="po-block"><h3>${title}</h3>${rows.map(([a, b, kind]) => (kind === 'note'
    ? `<div class="po-line"><small>${a}</small>${b}</div>` : `<div class="po-row"><span>${a}</span><span>${b}</span></div>`)).join('')}</section>`;
  return `
    <header class="po-head"><div><h1>${T('진료용 요약')}</h1><p>${p.period}</p></div>
      <div class="po-brand">Tidemark<small>${longDate(today())}</small></div></header>
    <div class="po-main">
      <div class="po-figs"><div class="flowkeys">${p.figure.keys}</div>${p.figure.body}</div>
      <div class="po-side">
        ${p.talk.length ? `<section class="po-talk"><h3>${T('진료 때 말하고 싶은 것')}</h3><ol>${p.talk.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>` : ''}
        ${p.blocks.map(block).join('')}
      </div>
    </div>
    <footer class="po-foot">${footText()}</footer>`;
}

// 폰에서 의사에게 바로 보여 주는 화면 (뽑기 번거로워서 폰으로 보여 드린다고 사용자가 요청, 2026-11-27). 종이와 같은 내용을 한 줄로 세운다.
// 딱지는 무엇이 그려져 있는지만 알려 준다 (여기서는 눌러도 꺼지지 않는다. 끄는 것은 흐름 탭에서).
export function openSummary(days, since) {
  const scale = fontScale(), p = parts(days, since, Math.max(200, Math.min(sheet.clientWidth || window.innerWidth, 480) - 32 - 32), scale);
  const block = ([title, rows]) => `<div class="sec">${title}</div><section class="card list">${rows.map(([a, b, kind]) => (kind === 'note'
    ? `<div class="li say note"><small>${a}</small>${b}</div>` : `<div class="li"><span class="lk">${a}</span><span class="lv">${b}</span></div>`)).join('')}</section>`;
  sheet.innerHTML = `<div class="sheet-in show">
    <div class="sheet-top">
      <button class="txt" data-act="close">${T('닫기')}</button>
      <div class="st"><b>${T('진료용 요약')}</b></div>
      <button class="txt" data-act="printSummary">PDF</button>
    </div>
    <p class="secnote top-note">${p.period}</p>
    ${p.talk.length ? `<div class="sec">${T('진료 때 말하고 싶은 것')}</div><section class="card list">${p.talk.map((x, i) => `<div class="li say"><b>${i + 1}.</b> ${esc(x)}</div>`).join('')}</section>` : ''}
    ${p.figure.body ? `<div class="flowkeys">${p.figure.keys}</div><section class="card flow">${p.figure.body}</section>` : ''}
    ${p.blocks.map(block).join('')}
    <p class="foot">${footText()}</p>
  </div>`;
  showSheet();
}
