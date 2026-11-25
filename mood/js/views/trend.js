// 흐름 화면 (주 / 월 / 년)
import { DISCLAIMER, LEVELS, SYMPTOMS, nameOf } from '../constants.js';
import { WD, addDays, ds, durText, longDate, md, monthTitle, parse, today, weekStart } from '../dates.js';
import { app, esc } from '../dom.js';
import { EN, F, T } from '../i18n.js';
import { IC } from '../icons.js';
import { medKey, medsFor } from '../meds.js';
import { trend } from '../state.js';
import { db, itemOn } from '../store.js';
import { fontScale, moodFill, tone } from '../theme.js';
import { settingsButton } from './settings.js';

const YEAR_WEEKS = 52, YEAR_STEP = 13;   // 년 보기: 52주를 한 장에, 넘길 때는 석 달(13주)씩
// 주·월 보기의 범위. 년 보기는 anchor가 든 주에서 끝나는 52주.
export function trendRange(anchor) {
  if (trend.mode === 'week') return { start: weekStart(anchor), n: 7 };
  if (trend.mode === 'year') return { start: addDays(weekStart(anchor), -7 * (YEAR_WEEKS - 1)), n: 7 * YEAR_WEEKS };
  const d = parse(anchor);
  return { start: ds(new Date(d.getFullYear(), d.getMonth(), 1)), n: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() };
}
export function shiftAnchor(anchor, step) {
  if (trend.mode === 'week') return addDays(anchor, 7 * step);
  if (trend.mode === 'year') return addDays(anchor, 7 * YEAR_STEP * step);
  const d = parse(anchor);
  return ds(new Date(d.getFullYear(), d.getMonth() + step, 1));
}
// 그쪽으로 넘길 수 있는지: 미래로는 못 간다 (년 보기는 끝나는 주가 이번 주를 넘지 않게)
export const canShift = (step) => (trend.mode === 'year' ? step < 0 || weekStart(trend.anchor) < weekStart(today())
  : trendRange(shiftAnchor(trend.anchor, step)).start <= today());
export function shiftTrend(step) { trend.anchor = shiftAnchor(trend.anchor, step); trend.pick = null; }
export const mean = (list, key) => {
  const v = list.map((e) => e[key]).filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
export const rangeEntries = (r) => Array.from({ length: r.n }, (_, i) => db.entries[addDays(r.start, i)] || null);

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

// 년 보기: 한 해를 주 단위로 줄여서 한 장에 그린다. 조울의 삽화는 몇 달씩 이어져서 주·월 그래프로는 안 보인다 (사용자가 요청, 2026-11-25).
// 기분·에너지 선, 잠, 증상·생리·약 띠를 모두 같은 가로축(한 칸 = 한 주)에 맞춰 위아래로 쌓아서, 한 줄로 내려 읽으면 같은 주다.
// 주마다: 점수와 잠은 평균, 스트레스·불안은 평균(반올림), 죽고 싶은 생각·공황·정신병적 증상은 그 주에 가장 높았던 값, 약은 적은 날의 절반 이상 먹었으면 진하게.
function viewYear() {
  const r = trendRange(trend.anchor), FS = fontScale();
  const weeks = Array.from({ length: YEAR_WEEKS }, (_, w) => {
    const start = addDays(r.start, 7 * w), list = [0, 1, 2, 3, 4, 5, 6].map((i) => db.entries[addDays(start, i)]).filter(Boolean);
    const top = (key) => list.reduce((m, e) => Math.max(m, e[key] || 0), 0), avgOf = (key) => { const v = mean(list, key); return v == null ? 0 : Math.round(v); };
    return { start, list, mood: mean(list, 'mood'), energy: mean(list, 'energy'), sleep: mean(list, 'sleepMin'), stress: avgOf('stress'), anx: avgOf('anx'),
      si: top('si'), panic: Math.min(4, top('panic')), psy: top('psy'), period: list.some((e) => e.period) ? 3 : 0 };
  });
  const got = weeks.filter((w) => w.list.length).length, days = weeks.reduce((n, w) => n + w.list.length, 0);
  const AX = Math.round(22 * FS), W = Math.max(160, Math.min(app.clientWidth, 480) - 32 - 32 - AX), col = W / YEAR_WEEKS, cx = (i) => col * (i + 0.5);
  const fs10 = (10 * FS).toFixed(1), muted = 'style="fill:var(--muted)"';
  // 달이 바뀌는 주 아래에 달 숫자 (1월에는 해도 같이)
  const months = (y) => weeks.map((w, i) => {
    const d = parse(addDays(w.start, 6));
    if (i && parse(addDays(weeks[i - 1].start, 6)).getMonth() === d.getMonth()) return '';
    return `<text x="${(col * i).toFixed(1)}" y="${y}" font-size="${fs10}" ${muted}>${d.getMonth() + 1}</text>`;
  }).join('');
  const monthLines = (h) => weeks.map((w, i) => (i && parse(addDays(weeks[i - 1].start, 6)).getMonth() !== parse(addDays(w.start, 6)).getMonth()
    ? `<line x1="${(col * i).toFixed(1)}" x2="${(col * i).toFixed(1)}" y1="0" y2="${h}" style="stroke:var(--line)" stroke-opacity=".5"/>` : '')).join('');
  const grid = (ticks, y) => ticks.map(([v, label]) => `<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" style="stroke:var(--line)"/>
    <text x="${W + 6}" y="${(y(v) + 3.5).toFixed(1)}" font-size="${fs10}" ${muted}>${label}</text>`).join('');
  const line = (key, y, attrs) => { const pts = weeks.map((w, i) => (w[key] == null ? null : [cx(i), y(w[key])])).filter(Boolean); return pts.length > 1 ? `<path d="${smoothPath(pts)}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>` : ''; };
  const H = 120, yS = (v) => 6 + (1 - v / 10) * (H - 12), SH = 54, yZ = (m) => 4 + (1 - Math.min(m, 720) / 720) * (SH - 8);
  const accent = tone('mood', 10) || 'var(--ink)';
  const chart = `<svg width="${W + AX}" height="${H + 16}">${monthLines(H)}${grid([[0, '0'], [5, '5'], [10, '10']], yS)}
    ${itemOn('energy') ? line('energy', yS, 'stroke-width="1.4" style="stroke:var(--ink)" stroke-opacity=".55"') : ''}${itemOn('mood') ? line('mood', yS, `stroke-width="2.6" style="stroke:${accent}"`) : ''}${months(H + 12)}</svg>`;
  const sleep = `<svg width="${W + AX}" height="${SH}">${monthLines(SH)}${grid([[0, '0'], [360, '6'], [720, '12']], yZ)}${line('sleep', yZ, 'stroke-width="2" style="stroke:var(--ink)"')}</svg>`;
  // 띠 한 줄: 주마다 한 칸, 값이 클수록 진하다
  const strip = (name, levelOf) => {
    const vals = weeks.map(levelOf);
    return `<div class="yrow"><span>${name}</span><svg width="${W}" height="12">${vals.map((v, i) => `<rect x="${(col * i + 0.5).toFixed(1)}" y="0" width="${Math.max(1, col - 1).toFixed(1)}" height="12" rx="1.5" ${v
      ? `style="fill:var(--ink)" fill-opacity="${[0, 0.3, 0.5, 0.75, 1][v]}"` : 'class="c0"'}/>`).join('')}</svg></div>`;
  };
  const medLevel = (m) => (w) => { const n = w.list.filter((e) => medsFor(e.date).some((x) => medKey(x) === medKey(m))).length; return !n ? 0 : n >= w.list.length / 2 ? 3 : 1; };
  const strips = [
    ...SYMPTOMS.filter(([k]) => itemOn(k)).map(([k, name]) => strip(name, (w) => w[k])),
    itemOn('panic') && weeks.some((w) => w.panic) ? strip(T('공황'), (w) => w.panic) : '',
    itemOn('psy') && weeks.some((w) => w.psy) ? strip(T('정신병적 증상'), (w) => w.psy) : '',
    itemOn('period') && weeks.some((w) => w.period) ? strip(T('생리'), (w) => w.period) : '',
    ...(itemOn('meds') ? db.meds.map((m) => strip(esc(`${m.name}${m.dose ? ` ${m.dose}` : ''}`), medLevel(m))) : []),
  ].join('');
  const sD = parse(r.start), eD = parse(addDays(r.start, r.n - 1));
  const ym = (d) => (EN ? d.toLocaleString('en', { month: 'short', year: 'numeric' }) : `${d.getFullYear()}년 ${d.getMonth() + 1}월`);
  app.innerHTML = `
    ${trendHead(F('기록 {0}일 · {1}주', days, got))}
    <div class="pnav">
      <button data-act="shift" data-step="-1" aria-label="${T('이전')}">‹</button><span>${ym(sD)} – ${ym(eD)}</span>
      <button data-act="shift" data-step="1" aria-label="${T('다음')}" ${canShift(1) ? '' : 'disabled'}>›</button></div>
    ${got < 4 ? `<section class="card list"><div class="li say mut">${T('기록이 4주 이상 쌓이면 한 해의 흐름이 여기에 한 장으로 보여요.')}</div></section>` : `<section class="card mcard year">
      <div class="ylegend">${itemOn('mood') ? `<span><i style="background:${accent};height:3px"></i>${T('기분')}</span>` : ''}${itemOn('energy') ? `<span><i style="opacity:.55"></i>${T('에너지')}</span>` : ''}</div>
      ${chart}
      ${itemOn('sleep') ? `<div class="yrow"><span>${T('수면')}</span></div>${sleep}` : ''}
      ${strips}
      <svg width="${W}" height="16">${months(12)}</svg>
    </section>`}
    <p class="foot">${T('한 칸이 한 주예요. 선은 그 주의 평균이고, 띠는 진할수록 심했던 주예요. 아래 숫자는 달이에요.')}<br>${DISCLAIMER}</p>`;
}

// 흐름 화면의 머리말: 주 / 월 / 년 고르기와 설정 단추
function trendHead(over) {
  const seg = (mode, name) => `<button data-act="mode" data-mode="${mode}" aria-pressed="${trend.mode === mode}">${name}</button>`;
  return `<header class="top"><div><div class="over">${over}</div><h1>${T('흐름')}</h1></div>
      <div class="top-r"><div class="segc">${seg('week', EN ? 'Week' : T('주'))}${seg('month', EN ? 'Month' : T('월'))}${seg('year', EN ? 'Year' : T('년'))}</div>${settingsButton()}</div></header>`;
}

export function viewTrend() {
  if (trend.mode === 'year') { viewYear(); return; }
  const C = document.documentElement.dataset.theme === 'light'
    ? { ink: '#3a3a3c', ring: '#fff', grid: 'rgba(60,60,67,.1)', muted: '#7c7c82', faint: '#b0b0b6' }
    : { ink: '#fff', ring: '#1c1c1e', grid: 'rgba(255,255,255,.1)', muted: '#9a9aa0', faint: '#6a6a70' };
  const t = today(), r = trendRange(trend.anchor), prev = trendRange(shiftAnchor(trend.anchor, -1));
  const days = rangeEntries(r), got = days.filter(Boolean), before = rangeEntries(prev).filter(Boolean);
  const isWeek = trend.mode === 'week';
  const sD = parse(r.start), eD = parse(addDays(r.start, r.n - 1));
  const title = isWeek
    ? `${md(sD)} – ${md(eD)}`
    : monthTitle(sD);
  const word = isWeek ? T('지난주') : T('지난달');
  const pick = trend.pick, pickDate = pick == null ? null : addDays(r.start, pick), pickE = pickDate ? db.entries[pickDate] : null;
  const pickLabel = pickDate ? longDate(pickDate) : '';

  // 크기: 화면 여백(16×2)과 카드 안쪽 여백(16×2)을 빼고, 오른쪽에 눈금 숫자 자리를 남긴 뒤 날짜 수로 나눈다.
  // app.css의 #app, .mcard 좌우 여백을 바꾸면 여기 숫자도 같이 바꾼다.
  const FS = fontScale(), AX = Math.round(26 * FS), W = Math.max(160, Math.min(app.clientWidth, 480) - 32 - 32 - AX), col = W / r.n;
  const cx = (i) => col * (i + 0.5);
  const TOP = 8, BOT = 104, H = 124;
  const xLabelsAt = (y) => days.map((_, i) => {
    const d = addDays(r.start, i), dt = parse(d);
    if (!isWeek && (dt.getDate() - 1) % 7 !== 0) return '';
    return `<text x="${cx(i).toFixed(1)}" y="${y}" text-anchor="middle" font-size="${(10 * FS).toFixed(1)}" fill="${d === t ? C.ink : C.muted}">${isWeek ? WD()[dt.getDay()] : dt.getDate()}</text>`;
  }).join('');
  const grid = (ticks, y) => ticks.map(([v, label]) => `<line x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${C.grid}"/>
    <text x="${W + 6}" y="${(y(v) + 3.5).toFixed(1)}" font-size="${(10 * FS).toFixed(1)}" fill="${C.faint}">${label}</text>`).join('');
  const plot = (inner) => `<div class="plot" data-n="${r.n}" data-w="${W}"><svg width="${W + AX}" height="${H}">${inner}${xLabelsAt(H - 4)}</svg></div>`;

  // 카드 머리: 평소에는 평균, 날짜를 누르면 그날 값
  const fmtSleep = (m) => `${Math.floor(m / 60)}<small>${T('시간')}</small> ${Math.round(m % 60)}<small>${T('분')}</small>`;
  const head = (key, icon, name, isSleep) => {
    let big, sub;
    if (pickDate) {
      const v = pickE ? pickE[key] : null;
      big = v == null ? '–' : isSleep ? fmtSleep(v) : v;
      sub = nameOf(key, v) || pickLabel;
    } else {
      const a = mean(got, key), b = mean(before, key);
      big = a == null ? '–' : isSleep ? fmtSleep(a) : a.toFixed(1);
      sub = T('평균');
      if (a != null && b != null) {
        const diff = a - b, mag = isSleep ? `${Math.round(Math.abs(diff))}${T('분')}` : Math.abs(diff).toFixed(1);
        sub += Math.abs(diff) < (isSleep ? 5 : 0.05) ? ` · ${F('{0}와 비슷', word)}` : ` · ${F('{0}보다 {1} {2}', word, diff > 0 ? '↑' : '↓', mag)}`;
      }
    }
    return `<div class="mt">${icon}${name}</div><div class="mv"><b>${big}</b><span>${sub}</span></div>`;
  };

  const lineCard = (key, name, max, ticks, headHtml) => {
    const y = (v) => TOP + (1 - v / max) * (BOT - TOP), ink = tone(key, 10) || C.ink;
    const pts = [];
    days.forEach((e, i) => { if (e && e[key] != null) pts.push([cx(i), y(e[key]), i]); });
    let out = `<defs><linearGradient id="g-${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ink}" stop-opacity=".26"/><stop offset="1" stop-color="${ink}" stop-opacity="0"/></linearGradient></defs>`;
    out += grid(ticks, y);
    if (pts.length > 1) {
      const d = smoothPath(pts);
      out += `<path d="${d}L${pts[pts.length - 1][0].toFixed(1)},${BOT}L${pts[0][0].toFixed(1)},${BOT}Z" fill="url(#g-${key})"/>
        <path d="${d}" fill="none" stroke="${ink}" stroke-width="${isWeek ? 2.5 : 2}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (isWeek || pts.length === 1) pts.forEach((p) => { out += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${ink}" stroke="${C.ring}" stroke-width="2"/>`; });
    if (pick != null) {
      out += `<line x1="${cx(pick).toFixed(1)}" x2="${cx(pick).toFixed(1)}" y1="${TOP - 4}" y2="${BOT}" stroke="${C.muted}"/>`;
      const p = pts.find((q) => q[2] === pick);
      if (p) out += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5.5" fill="${ink}" stroke="${C.ring}" stroke-width="2.5"/>`;
    }
    return `<section class="card mcard">${headHtml}${plot(out)}</section>`;
  };
  // 기분·에너지·자신감 (0~10)
  const scoreCard = (key, icon, name) => lineCard(key, name, 10, [[0, '0'], [5, '5'], [10, '10']], head(key, icon, name));

  const sleepCard = () => {
    const MAX = 12 * 60, y = (m) => TOP + (1 - Math.min(m, MAX) / MAX) * (BOT - TOP);
    const bw = isWeek ? 20 : Math.max(3, col - 3), rx = Math.min(bw / 2, 5);
    const all = mean(Object.values(db.entries), 'sleepMin');
    let out = grid([[0, '0'], [360, '6'], [720, T('12시간')]], y);
    days.forEach((e, i) => {
      if (!e || e.sleepMin == null) return;
      const top = Math.min(y(e.sleepMin), BOT - 3);
      out += `<rect x="${(cx(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(BOT - top).toFixed(1)}" rx="${rx.toFixed(1)}"
        fill="${pick == null || pick === i ? C.ink : C.faint}"/>`;
    });
    if (all != null) out += `<line x1="0" x2="${W}" y1="${y(all).toFixed(1)}" y2="${y(all).toFixed(1)}" stroke="${C.muted}" stroke-dasharray="2 4" stroke-linecap="round"/>`;
    return `<section class="card mcard">${head('sleepMin', IC.moon, T('수면'), true)}${plot(out)}
      <div class="mnote">${T('점선은 지금까지의 내 평균 수면')}${all != null ? ` (${durText(Math.round(all))})` : ''}</div></section>`;
  };

  // 월: 기분 달력
  const calendar = () => {
    const lead = (sD.getDay() + 6) % 7;
    const cells = Array.from({ length: lead }, () => '<span></span>').concat(days.map((e, i) => {
      const d = addDays(r.start, i);
      return `<button class="cday${pick === i ? ' sel' : ''}${d === t ? ' now' : ''}" data-act="pickDay" data-i="${i}" ${d > t ? 'disabled' : ''}
        aria-label="${longDate(d)}, ${e ? `${T('기분')} ${e.mood == null ? '–' : e.mood}` : T('기록 없음')}">
        <span class="cdot${e && e.mood == null ? ' part' : ''}" ${e && e.mood != null ? `style="${moodFill(e.mood)}"` : ''}>${parse(d).getDate()}</span>${e && e.period ? '<i></i>' : ''}</button>`;
    })).join('');
    const scale = [0, 2.5, 5, 7.5, 10].map((v) => `<i style="${moodFill(v)}"></i>`).join('');
    return `<section class="card mcard"><div class="mt">${IC.today}${T('기분 달력')}</div>
      <div class="cal">${[1, 2, 3, 4, 5, 6, 0].map((i) => WD()[i]).map((w) => `<span class="cw">${w}</span>`).join('')}${cells}</div>
      <div class="mnote calkey"><span>${T('가라앉음')} ${scale} ${T('들뜸')}</span><span><i class="pdot"></i> ${T('생리')}</span></div></section>`;
  };

  // 증상(스트레스·불안)은 기분과 같은 선 그래프로, 0(없음)~4(매우 높음)
  // 평소에는 이름만 보이고, 날짜를 누르면 그날 단계가 나온다
  const symCard = (key, name) => lineCard(key, name, 4, [[0, ''], [2, ''], [4, '']],
    `<div class="mt">${name}</div>${pickDate ? `<div class="mv"><b>${pickE && pickE[key] != null ? LEVELS[pickE[key]] : '–'}</b><span>${pickLabel}</span></div>` : '<div class="mv"></div>'}`);

  // 죽고 싶은 생각 · 정신병적 증상 · 생리: 선 그래프나 띠 대신 날마다 네모 한 칸. 있던 날만 칠하고, 단계가 높을수록 진하다.
  // 주 보기에서는 네모 안에 요일(영어 한 글자)을 적고, 월 보기에서는 칸이 좁아서 글자를 뺀다. 위 그래프와 날짜 자리가 같다.
  const guide = (h) => (pick == null ? '' : `<line x1="${cx(pick).toFixed(1)}" x2="${cx(pick).toFixed(1)}" y1="0" y2="${h}" stroke="${C.muted}"/>`);
  const sq = Math.max(4, Math.min(col - 3, 30));
  const squaresRow = (name, levelOf, textOf) => {
    const vals = days.map((e) => (e ? levelOf(e) : 0)), count = vals.filter(Boolean).length;
    const cells = vals.map((v, i) => `<rect x="${(cx(i) - sq / 2).toFixed(1)}" y="2" width="${sq.toFixed(1)}" height="${sq.toFixed(1)}" rx="${(sq * 0.28).toFixed(1)}" ${v ? `style="fill:var(--ink)" fill-opacity="${[0, 0.3, 0.5, 0.75, 1][v]}"` : 'class="c0"'}/>${
      sq >= 14 ? `<text x="${cx(i).toFixed(1)}" y="${(sq / 2 + 6.6).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="600" style="fill:${v >= 3 ? 'var(--ink-inv)' : v ? 'var(--text)' : 'var(--faint)'}">${'SMTWTFS'[parse(addDays(r.start, i)).getDay()]}</text>` : ''}`).join('');
    return `<div class="srow"><div class="sh"><span>${name}</span><span>${pickDate ? (pickE ? textOf(pickE) : '–') : count ? F('{0}일', count) : T('없음')}</span></div><svg width="${W}" height="${(sq + 4).toFixed(1)}">${cells}${guide(sq + 4)}</svg></div>`;
  };
  const marks = () => {
    const rows = [
      itemOn('si') ? squaresRow(T('죽고 싶은 생각'), (e) => e.si || 0, (e) => (e.si != null ? LEVELS[e.si] : '–')) : '',
      itemOn('panic') ? squaresRow(T('공황'), (e) => Math.min(4, e.panic || 0), (e) => (e.panic ? F('{0}번', e.panic) : '–')) : '',
      itemOn('psy') ? squaresRow(T('정신병적 증상'), (e) => e.psy || 0, (e) => (e.psy ? F('{0}가지', e.psy) : '–')) : '',
      itemOn('period') ? squaresRow(T('생리'), (e) => (e.period ? 3 : 0), (e) => (e.period ? T('생리 중') : '–')) : '',
    ].join('');
    return rows ? `<section class="card mcard"><div class="plot strips" data-n="${r.n}" data-w="${W}">${rows}${sq >= 14 ? '' : `<svg width="${W}" height="18">${xLabelsAt(13)}</svg>`}</div></section>` : '';
  };

  app.innerHTML = `
    ${trendHead(F('기록 {0}일 / {1}일', got.length, r.n))}
    <div class="pnav">
      <button data-act="shift" data-step="-1" aria-label="${T('이전')}">‹</button><span>${title}</span>
      <button data-act="shift" data-step="1" aria-label="${T('다음')}" ${canShift(1) ? '' : 'disabled'}>›</button></div>
    ${pickDate ? `<div class="pickbar"><span>${pickLabel}${pickE ? '' : T(' · 기록 없음')}</span><button class="mini" data-act="openDay" data-date="${pickDate}">${pickE ? T('기록 열기') : T('기록하기')}</button></div>` : ''}
    ${isWeek ? '' : calendar()}
    ${[['mood', IC.face(5), T('기분')], ['energy', IC.battery(6), T('에너지')], ['conf', IC.star, T('자신감')]].filter(([k]) => itemOn(k)).map(([k, icon, name]) => scoreCard(k, icon, name)).join('')}
    ${itemOn('sleep') ? sleepCard() : ''}
    ${SYMPTOMS.filter(([k]) => k !== 'si' && itemOn(k)).map(([k, name]) => symCard(k, name)).join('')}
    ${marks()}
    ${itemOn('note') ? `<section class="card list"><button class="li add" data-act="notes">${IC.note}&nbsp; ${T('메모 모아 보기')}</button></section>` : ''}
    <p class="foot">${T('그래프나 달력에서 날짜를 누르면 그날 값을 볼 수 있어요.')}<br>${DISCLAIMER}</p>`;
}
