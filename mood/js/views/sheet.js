// 흐름 한 장: 기분·에너지 선, 잠, 증상 띠를 같은 가로축에 위아래로 쌓은 그림. 한 줄로 내려 읽으면 같은 날(같은 주)이다.
// 흐름 화면(주·월·3달·년)과 종이용 요약이 이 그림 하나를 같이 쓴다.
// 항목마다 그래프가 따로 있고 진료 탭에 또 다른 그림이 있던 것이 보기 불편하다고 해서 하나로 모았다 (사용자가 정함, 2026-11-25).
// 정보는 줄였다: 선은 기분과 에너지만, 약은 띠 대신 "안 먹은 날"만 그래프 아래 점으로, 증상 띠는 그 기간에 있었던 것만 (스트레스·불안은 늘).
import { SYMPTOMS, customLevel } from '../constants.js';
import { addDays } from '../dates.js';
import { esc } from '../dom.js';
import { T } from '../i18n.js';
import { medsFor } from '../meds.js';
import { sampleClinic } from '../sample.js';
import { ui } from '../state.js';
import { customDefs, db, itemOn } from '../store.js';
import { tone } from '../theme.js';

// 점들을 부드러운 곡선으로 잇는다
// 꼭대기·바닥·평평한 구간에서는 기울기를 0으로 두어서(단조 3차 곡선), 선이 값 밖으로 튀지 않고
// 바닥에 닿을 때도 뾰족하게 꺾이지 않고 둥글게 내려앉는다.
export function smoothPath(pts) {
  if (!pts.length) return '';
  const n = pts.length, slope = [], tan = [];
  for (let i = 0; i < n - 1; i++) slope.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  for (let i = 0; i < n; i++) {
    const a = slope[i - 1], b = slope[i];
    if (a == null || b == null) tan.push(0);
    else if (a * b <= 0) tan.push(0);
    else {
      const h0 = pts[i][0] - pts[i - 1][0], h1 = pts[i + 1][0] - pts[i][0];
      tan.push(3 * (h0 + h1) / ((2 * h1 + h0) / a + (h1 + 2 * h0) / b));
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1], h = (p2[0] - p1[0]) / 3;
    d += `C${(p1[0] + h).toFixed(1)},${(p1[1] + tan[i] * h).toFixed(1)} ${(p2[0] - h).toFixed(1)},${(p2[1] - tan[i + 1] * h).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// 기록이 아직 거의 없을 때(3일 미만)는 예시 기록으로 미리 볼 수 있다
const FEW = 3;
export const few = () => Object.keys(db.entries).length < FEW;

// 그림에 쓸 기록: 내 기록, 또는 예시를 보고 있으면 예시. { demo, entries, log, missed(date): 약을 등록해 두고 그날 하나도 안 먹었는지 }
export function flowSource() {
  const demo = ui.demo && few() ? sampleClinic() : null;
  const entries = demo ? demo.entries : db.entries, meds = demo ? demo.meds : db.meds;
  const took = (d) => (demo ? (entries[d] || {}).meds || [] : medsFor(d)).length > 0;
  // 약을 처음 먹었다고 적은 날보다 앞의 날은 "안 먹은 날"로 세지 않는다 (약을 등록하기 전의 기록)
  const first = meds.length ? Object.keys(entries).sort().find(took) : null;
  return { demo: !!demo, entries, log: demo ? demo.log : (db.clinic || {}).log || [], missed: (d) => !!first && d > first && !!entries[d] && !took(d) };
}

const avg = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

// 그림의 칸들: start부터 span일씩 count칸 (span 1이면 하루 한 칸, 7이면 한 주 한 칸).
// 칸마다: 점수와 잠은 평균, 스트레스·불안은 평균(반올림), 죽고 싶은 생각·공황·정신병적 증상은 그 칸에서 가장 높았던 값, 생리·내 항목은 하루라도 있으면.
export function columns(start, count, span, src) {
  const customs = customDefs();
  return Array.from({ length: count }, (_, c) => {
    const dates = Array.from({ length: span }, (_, i) => addDays(start, c * span + i)), list = dates.map((d) => src.entries[d]).filter(Boolean);
    const mean = (key) => avg(list.map((e) => e[key]).filter((x) => x != null)), level = (key) => { const m = mean(key); return m == null ? 0 : Math.round(m); };
    const top = (f) => list.reduce((m, e) => Math.max(m, f(e) || 0), 0);
    return {
      start: dates[0], end: dates[span - 1], n: list.length, mood: mean('mood'), energy: mean('energy'), sleep: mean('sleepMin'),
      stress: level('stress'), anx: level('anx'), si: top((e) => e.si), panic: Math.min(4, top((e) => e.panic)), psy: top((e) => e.psy), period: list.some((e) => e.period) ? 3 : 0,
      custom: Object.fromEntries(customs.map((d) => [d.id, top((e) => customLevel(d, (e.custom || {})[d.id]))])),
      missed: dates.filter(src.missed).length, log: src.log.filter((x) => x.date >= dates[0] && x.date <= dates[span - 1]),
    };
  });
}

// cols: columns()가 준 칸들. width: 그림 전체 너비. labels: 아래에 적을 글 [[칸 번호, 글, 'mid'(칸 가운데) | 'left'(칸 왼쪽 끝)], …].
// guides: 세로 줄을 그을 칸 번호들 (주나 달이 바뀌는 자리). pick: 고른 칸 (없으면 null). scale: 글자 크기 배수.
export function sheetHtml({ cols, width, labels = [], guides = [], pick = null, scale = 1 }) {
  const n = cols.length, AX = Math.round(22 * scale), W = width - AX, col = W / n, cx = (i) => col * (i + 0.5);
  const fs = (10 * scale).toFixed(1), muted = 'style="fill:var(--muted)"', accent = tone('mood', 10) || 'var(--ink)';
  const svg = (h, inner, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">${inner}</svg>`;
  const vlines = (h) => guides.map((i) => `<line x1="${(col * i).toFixed(1)}" x2="${(col * i).toFixed(1)}" y1="0" y2="${h}" style="stroke:var(--line)" stroke-opacity=".6"/>`).join('')
    + (pick == null ? '' : `<line x1="${cx(pick).toFixed(1)}" x2="${cx(pick).toFixed(1)}" y1="0" y2="${h}" style="stroke:var(--muted)"/>`);
  const grid = (ticks, y) => ticks.map(([v, label]) => `<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" style="stroke:var(--line)"/>
    <text x="${W + 6}" y="${(y(v) + 3.5).toFixed(1)}" font-size="${fs}" ${muted}>${label}</text>`).join('');
  // 값이 있는 칸들을 잇는다. 하나뿐이면 점으로.
  const line = (key, y, width2, style) => {
    const pts = cols.map((c, i) => (c[key] == null ? null : [cx(i), y(c[key])])).filter(Boolean);
    return pts.length > 1 ? `<path d="${smoothPath(pts)}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${width2}" ${style}/>`
      : pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" ${style.replace('stroke', 'fill')}/>`).join('');
  };
  const xText = (y) => labels.map(([i, text, at]) => `<text x="${(at === 'mid' ? cx(i) : col * i).toFixed(1)}" y="${y}" font-size="${fs}"${at === 'mid' ? ' text-anchor="middle"' : ''} ${muted}>${text}</text>`).join('');

  // 1. 기분·에너지 (0~10). 그 아래 한 줄에 약을 안 먹은 날의 점. 약을 바꾼 날과 진료일은 세로선.
  const H = 120, yS = (v) => 6 + (1 - v / 10) * (H - 12), LANE = H + 9;
  const showMeds = itemOn('meds'), anyMissed = showMeds && cols.some((c) => c.missed), anyLog = cols.some((c) => c.log.length);
  const marks = cols.map((c, i) => c.log.map((x) => `<line x1="${cx(i).toFixed(1)}" x2="${cx(i).toFixed(1)}" y1="0" y2="${H}" style="stroke:var(--${x.kind === 'med' ? 'ink' : 'muted'})" stroke-opacity="${x.kind === 'med' ? 0.8 : 0.5}"${x.kind === 'med' ? '' : ' stroke-dasharray="3 3"'}/>`).join('')).join('');
  const dots = !anyMissed ? '' : cols.map((c, i) => (c.missed ? `<circle cx="${cx(i).toFixed(1)}" cy="${LANE}" r="${Math.max(1.6, Math.min(3, col * 0.3)).toFixed(1)}" fill="none" stroke-width="1.3" style="stroke:var(--ink)"/>` : '')).join('');
  const chart = svg(H + (anyMissed ? 18 : 6), `${vlines(H)}${grid([[0, '0'], [5, '5'], [10, '10']], yS)}${marks}
    ${itemOn('energy') ? line('energy', yS, 1.4, 'style="stroke:var(--ink)" stroke-opacity=".55"') : ''}${itemOn('mood') ? line('mood', yS, 2.6, `style="stroke:${accent}"`) : ''}${dots}`, 'flow-chart');
  const key = (mark, name) => `<span>${mark}${name}</span>`;
  const legend = [
    itemOn('mood') ? key(`<i style="background:${accent};height:3px"></i>`, T('기분')) : '', itemOn('energy') ? key('<i style="opacity:.55"></i>', T('에너지')) : '',
    anyMissed ? key('<i class="dot"></i>', T('약 안 먹은 날')) : '', anyLog ? key('<i class="bar"></i>', T('약 변경 · 진료')) : '',
  ].join('');

  // 2. 잠 (0~12시간)
  const SH = 54, yZ = (m) => 4 + (1 - Math.min(m, 720) / 720) * (SH - 8);
  const sleep = itemOn('sleep') ? `<div class="yrow"><span>${T('수면')}</span></div>${svg(SH, `${vlines(SH)}${grid([[0, '0'], [360, '6'], [720, '12']], yZ)}${line('sleep', yZ, 2, 'style="stroke:var(--ink)"')}`)}` : '';

  // 3. 띠: 칸마다 한 조각, 값이 클수록 진하다. 스트레스·불안은 늘 있고, 나머지는 이 기간에 한 번이라도 있었을 때만.
  const gap = col > 10 ? 3 : 1, cw = Math.max(1, col - gap);
  const strip = (name, levelOf) => `<div class="yrow"><span>${name}</span>${svg(12, cols.map((c, i) => { const v = levelOf(c); return `<rect x="${(col * i + gap / 2).toFixed(1)}" y="0" width="${cw.toFixed(1)}" height="12" rx="${Math.min(3, cw / 3).toFixed(1)}" ${v
    ? `style="fill:var(--ink)" fill-opacity="${[0, 0.3, 0.5, 0.75, 1][v]}"` : 'class="c0"'}/>`; }).join('') + (pick == null ? '' : `<line x1="${cx(pick).toFixed(1)}" x2="${cx(pick).toFixed(1)}" y1="0" y2="12" style="stroke:var(--muted)"/>`), 'flow-strip')}</div>`;
  const seen = (f) => cols.some((c) => f(c));
  const strips = [
    ...SYMPTOMS.filter(([k]) => itemOn(k) && (k !== 'si' || seen((c) => c.si))).map(([k, name]) => strip(name, (c) => c[k])),
    itemOn('panic') && seen((c) => c.panic) ? strip(T('공황'), (c) => c.panic) : '',
    itemOn('psy') && seen((c) => c.psy) ? strip(T('정신병적 증상'), (c) => c.psy) : '',
    itemOn('period') && seen((c) => c.period) ? strip(T('생리'), (c) => c.period) : '',
    ...customDefs().filter((d) => seen((c) => c.custom[d.id])).map((d) => strip(esc(d.name), (c) => c.custom[d.id])),
  ].join('');

  return `<div class="ylegend">${legend}</div>${chart}${sleep}${strips}${svg(Math.round(16 * scale), xText(Math.round(12 * scale)), 'flow-x')}`;
}
