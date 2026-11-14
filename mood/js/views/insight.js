// 인사이트 화면: 최근 7일을 종합해서 읽은 것(짧게), 약을 바꾼 앞뒤 · 안 먹은 다음 날, 생리 전후, 한 해의 긴 흐름, 기분이 낮았던·높았던 날의 메모, AI로 가는 줄.
// 진료 탭에 이미 있는 것(기간 평균, 며칠 중 며칠)은 여기에 다시 넣지 않는다.
// 길게 늘어놓지 않는다: 평균끼리 견준 비교 목록은 뻔하거나 쓸모없다고 해서 뺐다 (사용자가 정함, 2026-11-13).
// 기록이 아직 적으면 예시 기록으로 어떤 것이 나오는지 미리 볼 수 있다 (ui.demo).
import { longFlow, medChanges, missedMeds, moodNotes, periodPhases, recentState } from '../analysis.js';
import { md, parse } from '../dates.js';
import { app, esc } from '../dom.js';
import { EN, F, T } from '../i18n.js';
import { IC } from '../icons.js';
import { sampleEntries } from '../sample.js';
import { ui } from '../state.js';
import { db, itemOn } from '../store.js';
import { tone } from '../theme.js';
import { settingsButton } from './settings.js';
import { smoothPath } from './trend.js';

const bullets = (list) => (list.length ? `<ul>${list.map((x) => `<li>${x}</li>`).join('')}</ul>` : '');
// 표 한 줄: 첫 칸은 이름, 나머지는 값
const tr = (cells, head) => `<div class="tr${head ? ' th' : ''}">${cells.map((c) => `<span>${c}</span>`).join('')}</div>`;

// 긴 흐름 그림: 주마다의 기분 평균을 한 줄로 잇는다 (적지 않은 주는 건너뛴다). 아래에 달을 적는다.
function flowSvg(weeks) {
  const width = Math.max(240, Math.min(app.clientWidth, 480) - 64), H = 110, L = 18, top = 6, pw = width - L - 4, n = weeks.length;
  const x = (i) => L + (n > 1 ? pw * i / (n - 1) : pw / 2), y = (v) => top + (1 - v / 10) * H;
  const grid = [0, 5, 10].map((v) => `<line x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)"/><text x="${L - 6}" y="${y(v) + 3.5}" font-size="10" text-anchor="end" style="fill:var(--muted)">${v}</text>`).join('');
  // 달이 바뀌는 주에 달 이름 (글자가 겹치지 않게 46px 이상 떨어진 것만)
  let last = -99;
  const months = weeks.map((w, i) => {
    const d = parse(w.start), first = i === 0 || parse(weeks[i - 1].start).getMonth() !== d.getMonth();
    if (!first || x(i) - last < 46) return '';
    last = x(i);
    return `<text x="${x(i).toFixed(1)}" y="${top + H + 14}" font-size="10" style="fill:var(--muted)">${EN ? d.toLocaleString('en', { month: 'short' }) : `${d.getMonth() + 1}월`}</text>`;
  }).join('');
  const pts = weeks.map((w, i) => (w.mood == null ? null : [x(i), y(w.mood)])).filter(Boolean), color = tone('mood', 10) || 'var(--ink)';
  return `<svg class="flow-fig" width="${width}" height="${top + H + 18}" viewBox="0 0 ${width} ${top + H + 18}" role="img" aria-label="${T('긴 흐름 · 주마다의 기분 평균')}">${grid}${months}
    <path d="${smoothPath(pts)}" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="stroke:${color}"/></svg>`;
}

export function viewInsight() {
  const n = Object.keys(db.entries).length, mine = recentState();
  const demo = ui.demo && !mine, state = demo ? recentState(sampleEntries()) : mine, changes = demo ? [] : medChanges();
  const src = demo ? sampleEntries() : db.entries, missed = demo ? null : missedMeds(), phases = itemOn('period') ? periodPhases(src) : null;
  const flow = longFlow(src), notes = itemOn('note') ? moodNotes(src) : { low: [], high: [] };
  const noteRows = (list) => list.map((e) => `<button class="li say note" data-act="openDay" data-date="${e.date}"><small>${md(parse(e.date))} · ${T('기분')} ${e.mood}</small>${esc(e.note)}</button>`).join('');
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
    ${changes.map((c) => `<div class="sec">${F('약을 바꾼 뒤 · {0}', md(parse(c.date)))}</div>
    <section class="card tbl">${c.text ? `<div class="tbl-t">${esc(c.text)}</div>` : ''}${tr(['', T('앞 2주'), F('뒤 {0}일', c.after)], true)}${c.rows.map((r) => tr(r)).join('')}</section>`).join('')}
    ${missed ? `<div class="sec">${T('약을 안 먹은 다음 날')}</div>
    <section class="card tbl">${tr(['', T('그 무렵 평소보다')], true)}${missed.rows.map((r) => tr(r)).join('')}</section>
    <p class="secnote">${F('최근 8주에 약을 안 먹은 날 {0}번의 다음 날을, 그 앞뒤 일주일의 약 먹은 날들과 견줬어요. 들뜬 시기는 뺐어요. 약 때문이라는 뜻은 아니에요.', missed.n)}</p>` : ''}
    ${phases ? `<div class="sec">${F('생리 전후 · 최근 {0}번', phases.cycles)}</div>
    <section class="card tbl cols5">${tr(['', T('전 5일'), T('생리 중'), T('뒤 5일'), T('그 밖')], true)}${phases.rows.map((r) => tr(r)).join('')}</section>
    <p class="secnote">${T('차이가 뚜렷한 항목만 평균으로 적었어요.')}</p>` : ''}
    ${flow ? `<div class="sec">${T('긴 흐름 · 주마다의 기분 평균')}</div><section class="card">${flowSvg(flow)}</section>` : ''}
    ${notes.low.length ? `<div class="sec">${T('기분이 낮았던 날의 메모')}</div><section class="card list">${noteRows(notes.low)}</section>` : ''}
    ${notes.high.length ? `<div class="sec">${T('기분이 높았던 날의 메모')}</div><section class="card list">${noteRows(notes.high)}</section>` : ''}
    <div class="sec">${T('더 보기')}</div>
    <section class="card list">
      <button class="li add" data-act="copyAi">${IC.spark}&nbsp; ${T('AI에게 물어볼 글 복사 (최근 4주)')}</button>
    </section>
    <p class="secnote">${T('복사한 글을 Claude나 ChatGPT 같은 AI 앱에 붙여 넣으면 기록 전체를 읽고 패턴을 정리해 줘요. 붙여 넣는 순간 그 기록은 해당 AI 서비스로 전송돼요.')}</p>`;
}
