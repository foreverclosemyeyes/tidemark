// 진료 화면: 다음 진료일, 진료 때 말할 것, 진료용 요약 (최근 2주/4주를 한 장으로)
import { SHORT_SLEEP, summary } from '../analysis.js';
import { DISCLAIMER, LEVELS, SYMPTOMS, customLevel, customText, onlyOn } from '../constants.js';
import { durText, md, parse, today } from '../dates.js';
import { app, esc, sheet, showSheet } from '../dom.js';
import { F, T } from '../i18n.js';
import { IC } from '../icons.js';
import { sampleClinic } from '../sample.js';
import { clinicView, ui } from '../state.js';
import { customDefs, db, itemOn } from '../store.js';
import { tone } from '../theme.js';
import { settingsButton } from './settings.js';
import { li } from './today.js';
import { smoothPath } from './trend.js';

// 다음 진료일, 말할 것 목록, 진료·약 변경 기록.
// { next: 'YYYY-MM-DD' 또는 '', notes: ['…', …], log: [{ date, kind: 'visit'(진료 메모) | 'med'(약 바꾼 날), text }, …] (날짜순) }
export function clinicData() {
  const c = db.clinic || (db.clinic = { next: '', notes: [] });
  if (!c.log) c.log = [];
  return c;
}
// 기록이 아직 거의 없을 때(3일 미만) 예시 기록으로 미리 볼 수 있다. 보고 있으면 예시({ entries, meds, notes, log })를, 아니면 null을 준다.
const FEW = 3;
const few = () => Object.keys(db.entries).length < FEW;
export const clinicDemo = () => (ui.demo && few() ? sampleClinic() : null);
export const kindName = (kind) => (kind === 'med' ? T('약 변경') : T('진료'));
// 가장 최근에 다녀온 진료일 (없으면 '')
const lastVisit = () => { const v = clinicData().log.filter((x) => x.kind === 'visit' && x.date <= today()); return v.length ? v[v.length - 1].date : ''; };
// 요약 기간(주). "진료 후"를 골랐으면 지난 진료일이 들어가도록 주 단위로 올림한다 (최대 8주).
export function clinicWeeks() {
  if (clinicView.weeks !== 'since') return clinicView.weeks;
  const from = lastVisit();
  return from ? Math.max(1, Math.min(8, Math.ceil((1 - daysUntil(from)) / 7))) : 2;
}

export const shortDate = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const dateList = (list) => list.map(shortDate).join(', ');
const daysUntil = (date) => Math.round((parse(date) - parse(today())) / 86400000);
const one = (x) => (Math.round(x * 10) / 10).toFixed(1);

function nextText() {
  const { next } = clinicData();
  if (!next) return '';
  const left = daysUntil(next);
  return left > 0 ? F('진료까지 {0}일', left) : left === 0 ? T('오늘 진료') : '';
}

// 큰 그래프에 켜고 끌 수 있는 선들: [열쇠, 이름, 가장 높은 값]. 증상(0~4)은 그래프 높이에 맞춰 늘려 그린다.
// 0~10으로 적는 세 가지만 선으로 그린다. 증상(우울·불안 등)은 바로 아래 네모 줄에 있어서, 선으로 또 그리면 겹쳐서 난잡하다고 해서 뺐다 (2026-11-14).
// 설정에서 꺼 둔 항목은 뺀다.
export const lineDefs = () => [['mood', T('기분'), 10], ['energy', T('에너지'), 10], ['conf', T('자신감'), 10]].filter(([key]) => itemOn(key));

// 선은 색이 아니라 모양으로 구분한다: [굵기, 끊김 무늬]. 기분만 설정에서 고른 색의 굵은 실선이고, 나머지는 같은 색(--ink)이다.
const LINE_STYLE = { mood: [3, ''], energy: [1.6, ''], conf: [1.8, '7 5'] };
const lineColor = (key) => (key === 'mood' ? tone('mood', 10) || 'var(--ink)' : 'var(--ink)');
const lineAttrs = (key) => `fill="none" stroke-linejoin="round" stroke-linecap="round" style="stroke:${lineColor(key)}" stroke-width="${LINE_STYLE[key][0]}"${LINE_STYLE[key][1] ? ` stroke-dasharray="${LINE_STYLE[key][1]}"` : ''}`;
// 단추에 붙는 선 견본
export const lineSample = (key) => `<svg width="22" height="8" aria-hidden="true"><path d="M1.5,4H20.5" ${lineAttrs(key)}/></svg>`;

// 이어진 날짜는 묶어서 적는다: 11/9–11/13, 11/20
function dateRanges(list) {
  const runs = [];
  list.forEach((d) => {
    const last = runs[runs.length - 1];
    if (last && Math.round((parse(d) - parse(last[1])) / 86400000) === 1) last[1] = d; else runs.push([d, d]);
  });
  return runs.map(([a, b]) => (a === b ? shortDate(a) : `${shortDate(a)}–${shortDate(b)}`)).join(', ');
}

// 요약에 들어가는 그림 세 장: 큰 그래프(켜 둔 선들, 선 끝에 이름) · 수면(곡선) · 네모 줄들(증상, 부작용, 내 항목, 약, 생리).
// 셋 다 같은 너비와 여백으로 그려서, 위아래로 같은 자리가 같은 날이다 (약을 안 먹은 날의 기분·증상이 한 줄로 이어져 보인다).
// 선은 전부 부드러운 실선이다. 색은 CSS 변수를 따라가서 다크·라이트·인쇄에서 그대로 읽힌다.
// show: 기간 전체에서 한 번이라도 있었던 것만 줄을 만든다 { fx: 부작용이 있었는지, custom: [값이 있었던 내 항목들] }
// flat: 종이용. 네모 대신 하루 너비를 꽉 채운 낮은 칸으로 그려서 줄이 촘촘한 띠처럼 보이고 한 장에 다 들어간다.
export function figures(s, width, SH, show, flat = false) {
  // 오른쪽에는 선 끝 이름이 들어갈 자리를 둔다 (이름이 긴 "죽고 싶은 생각"을 켰을 때만 넓게)
  const n = s.dates.length, L = 18, R = 44, pw = width - L - R, col = pw / n;
  const cx = (i) => L + col * (i + 0.5);
  const ink = 'style="fill:var(--ink)"', mutedText = 'style="fill:var(--muted)"';
  // 날짜를 적을 자리: 첫날과 월요일들. 첫날 바로 뒤(사흘 안)에 월요일이 오면 글자가 겹치니 첫날은 뺀다 (여러 주를 그릴 때).
  const mondays = s.dates.map((d, i) => (parse(d).getDay() === 1 ? i : -1)).filter((i) => i > 0);
  const marks = n > 7 && mondays.length && mondays[0] <= 3 ? mondays : [0, ...mondays];
  let out = '', y = 6;

  // 지금까지 그린 것을 그림 한 장으로 마무리하고 다음 장을 시작한다
  const take = (id, height) => {
    const svg = `<svg class="${id}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${out}</svg>`;
    out = ''; y = 12;
    return svg;
  };
  const head = (left, right) => {
    out += `<text x="${L}" y="${y}" font-size="12.5" font-weight="600" ${ink}>${left}</text>`;
    if (right) out += `<text x="${width}" y="${y}" font-size="11.5" text-anchor="end" ${mutedText}>${right}</text>`;
  };
  // 주마다(월요일) 세로줄: 그림이 있는 칸 안에만 긋는다
  // (한 주만 그릴 때는 긋지 않는다: 주 한가운데에 뜬금없는 세로줄로 보인다)
  const weekLines = (y1, y2) => (n > 7 ? marks.filter(Boolean) : []).forEach((i) => {
    out += `<line x1="${(L + col * i).toFixed(1)}" x2="${(L + col * i).toFixed(1)}" y1="${y1}" y2="${y2}" style="stroke:var(--line)"/>`;
  });
  const dateLabels = (at) => marks.forEach((i) => {
    out += `<text x="${(L + col * i + 2).toFixed(1)}" y="${at}" font-size="10" ${mutedText}>${shortDate(s.dates[i])}</text>`;
  });
  const points = (key, yOf) => s.days.map((e, i) => (e && e[key] != null ? [cx(i), yOf(e[key])] : null)).filter(Boolean);
  // 값이 있는 날들을 부드러운 곡선으로 잇는다 (하루뿐이면 점 하나). area가 있으면 곡선 아래를 옅게 채운다.
  const curve = (pts, color, attrs, areaTo) => {
    if (pts.length < 2) { pts.forEach((p) => { out += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" style="fill:${color}"/>`; }); return; }
    const d = smoothPath(pts);
    if (areaTo) out += `<path d="${d}L${pts[pts.length - 1][0].toFixed(1)},${areaTo}L${pts[0][0].toFixed(1)},${areaTo}Z" style="fill:var(--fill)" stroke="none"/>`;
    out += `<path d="${d}" ${attrs}/>`;
  };
  const floor = (at) => { out += `<line x1="${L}" x2="${L + pw}" y1="${at}" y2="${at}" style="stroke:var(--line)"/>`; };

  // 1. 큰 그래프: 켜 둔 선들을 한 축 위에. 선 끝에 이름을 적는다 (겹치면 아래로 민다).
  const top = y, sy = (v) => top + (1 - v / 10) * SH;
  [0, 5, 10].forEach((v) => { floor(sy(v)); out += `<text x="${L - 6}" y="${sy(v) + 3.5}" font-size="10" text-anchor="end" ${mutedText}>${v}</text>`; });
  weekLines(top, top + SH);
  const ends = [];
  lineDefs().filter(([key]) => clinicView.lines.includes(key)).reverse().forEach(([key, name, max]) => {
    const pts = points(key, (v) => sy(v / max * 10));
    if (!pts.length) return;
    curve(pts, lineColor(key), lineAttrs(key));
    ends.push({ name, color: lineColor(key), x: pts[pts.length - 1][0] + 7, y: pts[pts.length - 1][1] + 3.5, bold: key === 'mood' });
  });
  ends.sort((a, b) => a.y - b.y).forEach((e, i) => {
    if (i && e.y < ends[i - 1].y + 12) e.y = ends[i - 1].y + 12;
    out += `<text x="${e.x.toFixed(1)}" y="${e.y.toFixed(1)}" font-size="10.5" font-weight="${e.bold ? 700 : 500}" style="fill:${e.color}">${e.name}</text>`;
  });
  // 진료일과 약 바꾼 날: 그날 자리에 세로선과 이름
  s.log.forEach((x) => {
    const i = s.dates.indexOf(x.date);
    if (i < 0) return;
    out += `<line x1="${cx(i).toFixed(1)}" x2="${cx(i).toFixed(1)}" y1="${top}" y2="${top + SH}" style="stroke:var(--${x.kind === 'med' ? 'ink' : 'muted'})"/>
      <text x="${(cx(i) + 4).toFixed(1)}" y="${top + 9}" font-size="9.5" ${x.kind === 'med' ? ink : mutedText}>${kindName(x.kind)}</text>`;
  });
  dateLabels(top + SH + 13);
  const chart = take('sum-fig', top + SH + 18);

  // 2. 수면 (0~12시간): 5시간 높이에 기준선을 그어서 그 아래로 내려간 밤이 보이게 하고, 그 날짜를 글로도 적는다
  head(`${T('수면')}${s.sleep ? ` ${durText(Math.round(s.sleep.avg))}` : ''}`, s.shortSleep.length ? F('5시간 미만 {0}일', s.shortSleep.length) : '');
  const BH = 64, sTop = y + 12, base = sTop + BH, slY = (m) => base - Math.min(m, 720) / 720 * BH;
  [0, 6, 12].forEach((h) => { floor(slY(h * 60)); out += `<text x="${L - 6}" y="${slY(h * 60) + 3.5}" font-size="10" text-anchor="end" ${mutedText}>${h}</text>`; });
  weekLines(sTop, base);
  curve(points('sleepMin', slY), 'var(--ink)', 'fill="none" stroke-linejoin="round" stroke-linecap="round" style="stroke:var(--ink)" stroke-width="2"', base);
  out += `<line x1="${L}" x2="${L + pw}" y1="${slY(SHORT_SLEEP)}" y2="${slY(SHORT_SLEEP)}" style="stroke:var(--muted)"/><text x="${L + pw + 7}" y="${slY(SHORT_SLEEP) + 3.5}" font-size="10.5" ${mutedText}>${T('5시간')}</text>`;
  y = base + 6;
  if (s.shortSleep.length) {
    y += 12;
    out += `<text x="${L}" y="${y}" font-size="11" ${mutedText}>${T('5시간 미만인 밤')} ${dateRanges(s.shortSleep)}</text>`;
    y += 4;
  }
  const sleep = take('sum-sleep', y);

  // 3. 증상: 날마다 요일(영어 한 글자, 사용자가 고름)이 적힌 네모 한 칸, 그런 날은 색칠 (단계가 높을수록 진하게). 위 그래프와 같은 날짜 자리에 놓인다.
  // 칸 크기는 하루 너비를 따라간다 (옆 칸과 살짝만 떨어지게). 1주는 30, 2주는 15쯤, 4주는 7쯤.
  // 요일 글자는 1주 보기처럼 칸이 넉넉할 때만 넣는다. 2주·4주는 색으로만 보이게 한다 (작은 글자가 지저분하다고 함).
  const sq = Math.max(4, Math.min(col - Math.max(2, col * 0.18), 30)), letter = !flat && n <= 7 && sq >= 24 ? 13 : 0;
  const bw = flat ? col - 3 : sq, bh = flat ? 12 : sq, br = flat ? 3.5 : sq * 0.28;
  // vals: 날마다의 정도(0~4), right: 오른쪽에 적을 글 (안 주면 며칠인지)
  const squaresOf = (name, vals, right) => {
    const count = vals.filter(Boolean).length;
    head(name, right || (count ? F('{0}일', count) : T('없음')));
    s.dates.forEach((d, i) => {
      const v = vals[i], x = cx(i) - bw / 2, top = y + (flat ? 8 : 13);
      out += `<rect x="${x.toFixed(1)}" y="${top}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${br.toFixed(1)}" ${v ? `style="fill:var(--ink)" fill-opacity="${[0, 0.3, 0.5, 0.75, 1][v]}"` : 'class="c0"'}/>`;
      if (letter) out += `<text x="${cx(i).toFixed(1)}" y="${(top + sq / 2 + letter * 0.36).toFixed(1)}" text-anchor="middle" font-size="${letter}" font-weight="600" style="fill:${v >= 3 ? 'var(--ink-inv)' : v ? 'var(--text)' : 'var(--faint)'}">${'SMTWTFS'[parse(d).getDay()]}</text>`;
    });
    y += flat ? 8 + bh + 17 : 13 + sq + 22;
  };
  const squares = (name, levelOf) => squaresOf(name, s.days.map((e) => (e ? levelOf(e) : 0)));
  SYMPTOMS.filter(([k]) => itemOn(k)).forEach(([k, name]) => squares(name, (e) => e[k] || 0));
  if (itemOn('panic') && s.got.some((e) => e.panic)) squares(T('공황'), (e) => Math.min(4, e.panic || 0));   // 횟수가 많을수록 진하다
  if (itemOn('psy')) squares(T('정신병적 증상'), (e) => e.psy || 0);   // 그날 몇 가지였는지에 따라 진해진다
  // 부작용(하나라도 있던 날)과 내 항목도 같은 네모 줄로
  if (itemOn('fx') && show.fx) squares(T('부작용'), (e) => (onlyOn(e.fx) ? 3 : 0));
  show.custom.forEach((c) => squares(esc(c.name), (e) => customLevel(c, (e.custom || {})[c.id])));

  // 4. 약 · 생리도 같은 네모 줄: 먹은 날(생리 중인 날)만 칠한다. ○ ×로 그렸더니 ×가 줄줄이 늘어서 난잡하다고 해서 바꿨다 (2026-11-14).
  if (itemOn('meds')) s.meds.forEach(([m, count, on]) => {
    squaresOf(esc(`${m.name}${m.dose ? ` ${m.dose}` : ''}`), on.map((took) => (took ? 3 : 0)), F('{0}일 중 {1}일', n, count));
  });
  if (itemOn('period') && s.period.length) squares(T('생리'), (e) => (e.period ? 3 : 0));
  if (!out) return { chart, sleep, rows: '' };
  dateLabels(y - 5);
  return { chart, sleep, rows: take('sum-rows', y + 1) };
}

// 요약에 들어갈 줄들: [이름, 내용]. 화면과 복사용 글이 같은 줄을 쓴다.
export function summaryRows(s) {
  const range = (st, fmt) => (st ? `${fmt(st.avg)} (${fmt(st.min)}–${fmt(st.max)})` : T('기록 없음'));
  const num = (x) => (Number.isInteger(x) ? String(x) : one(x));
  const dur = (m) => durText(Math.round(m));
  const flags = [
    [T('우울 높음 이상'), s.high.dep], [T('불안 높음 이상'), s.high.anx],
    [T('정신병적 증상'), s.high.psy], [T('죽고 싶은 생각'), s.high.si], [T('5시간 미만 수면'), s.shortSleep], [T('생리'), s.period],
  ].filter(([, list]) => list.length).map(([name, list]) => [name, `${F('{0}일', list.length)} · ${dateList(list)}`]);
  return {
    averages: [[T('기분'), range(s.mood, num)], [T('에너지'), range(s.energy, num)], [T('자신감'), range(s.conf, num)], [T('수면'), range(s.sleep, dur)]],
    flags,
    signs: s.signs.map(([label, c]) => [label, F('{0}일', c)]),
    meds: s.meds.map(([m, c]) => [`${m.name}${m.dose ? ` ${m.dose}` : ''}`, F('{0}일 중 {1}일', s.dates.length, c)]),
  };
}

// 요약 본문: 그림 세 장을 한 카드에 쌓고, 체크 항목·신호·메모를 카드로 나눠 놓는다 (인쇄용 한 장은 printout.js가 따로 짠다)
function summaryHtml(weeks) {
  const s = summary(weeks, clinicDemo());
  const width = Math.max(240, Math.min(app.clientWidth, 480) - 32 - 32);
  // 큰 그래프의 선을 켜고 끄는 단추: 기분·에너지·자신감은 평균을 옆에 적는다
  const toggles = lineDefs().map(([key, name, max]) => `<button class="sum-tog" data-act="clinicLine" data-k="${key}" aria-pressed="${clinicView.lines.includes(key)}">${lineSample(key)}${name}${max === 10 && s[key] ? ` <b>${one(s[key].avg)}</b>` : ''}</button>`).join('');
  const show = { fx: s.fx.length > 0, custom: customDefs().filter((c) => s.got.some((e) => customLevel(c, (e.custom || {})[c.id]))) };
  const count = ([name, c]) => li(esc(name), F('{0}일', c));
  // 그래프·수면·네모 줄을 전부 고른 기간 전체로 한 카드에 그린다. 위아래로 같은 자리가 같은 날이다.
  // (한때 2주·4주를 주마다 카드로 쪼갰는데, 사용자가 한 줄에 14칸·28칸으로 이어서 보는 쪽을 골랐다, 2026-11-13)
  const fig = figures(s, width, 150, show);
  const cards = `<section class="card sum-stack">${toggles ? fig.chart : ''}${itemOn('sleep') ? fig.sleep : ''}${fig.rows}</section>`;
  const signs = s.signs.map(([name, c]) => li(esc(name), F('{0}일', c)));
  const says = (title, rows) => (rows.length ? `<div class="sec">${title}</div><section class="card list">${rows.join('')}</section>` : '');
  return `
    <div class="sec">${md(parse(s.dates[0]))} – ${md(parse(s.dates[s.dates.length - 1]))} · ${F('기록 {0}일 / {1}일', s.got.length, s.dates.length)}</div>
    ${toggles ? `<div class="sum-togs">${toggles}</div>` : ''}
    ${cards}
    <p class="secnote">${T('위아래로 같은 자리가 같은 날이에요 · 증상 네모는 진할수록 심한 날 · 약은 먹은 날만 칠해져요')}</p>
    ${says(T('기분이 높았던 날 체크한 항목'), signs)}
    ${itemOn('psy') ? says(T('정신병적 증상'), s.psych.map(count)) : ''}
    ${itemOn('fx') ? says(T('부작용'), s.fx.map(count)) : ''}
    ${says(T('지금 떠 있는 신호'), s.signals.map((x) => `<div class="li say">${esc(x)}</div>`))}
    ${says(T('메모'), s.notes.map(([d, note]) => `<div class="li say note"><small>${shortDate(d)}</small> ${esc(note)}</div>`))}
    <p class="foot">${DISCLAIMER}</p>`;
}

// 메신저나 메모 앱에 붙여 넣을 수 있는 글
export function summaryText(weeks) {
  const demo = clinicDemo(), s = summary(weeks, demo), r = summaryRows(s), talk = (demo || clinicData()).notes;
  const part = (title, rows) => (rows.length ? [`\n[${title}]`, ...rows.map(([k, v]) => `${k}: ${v}`)] : []);
  return [
    `${T('진료용 요약')} · ${md(parse(s.dates[0]))} – ${md(parse(s.dates[s.dates.length - 1]))} · ${F('기록 {0}일 / {1}일', s.got.length, s.dates.length)}`,
    ...(talk.length ? [`\n[${T('진료 때 말할 것')}]`, ...talk.map((x) => `- ${x}`)] : []),
    ...part(T('평균 (가장 낮은 날–가장 높은 날)'), r.averages), ...part(T('눈에 띄는 날'), r.flags),
    ...(s.signals.length ? [`\n[${T('지금 떠 있는 신호')}]`, ...s.signals.map((x) => `- ${x}`)] : []),
    ...part(T('기분이 높았던 날 체크한 항목'), r.signs), ...part(T('정신병적 증상'), s.psych.map(([name, c]) => [name, F('{0}일', c)])), ...part(T('부작용'), s.fx.map(([name, c]) => [name, F('{0}일', c)])), ...part(T('약 먹은 날'), r.meds),
    ...part(T('내 항목'), customDefs().map((c) => [c.name, s.got.filter((e) => customText(c, (e.custom || {})[c.id])).map((e) => `${shortDate(e.date)} ${customText(c, e.custom[c.id])}`).join(', ')]).filter(([, v]) => v)),
    ...part(T('진료 · 약 변경 기록'), s.log.filter((x) => x.date >= s.dates[0]).map((x) => [`${shortDate(x.date)} ${kindName(x.kind)}`, x.text || '–'])),
    ...(s.notes.length ? [`\n[${T('메모')}]`, ...s.notes.map(([d, note]) => `${shortDate(d)} ${note}`)] : []),
    `\n${F('증상은 {0}~{1} 다섯 단계로 적은 것', LEVELS[0], LEVELS[4])}. ${DISCLAIMER}`,
  ].join('\n');
}

export function viewClinic() {
  const demo = clinicDemo(), c = demo || clinicData(), weeks = clinicWeeks(), pick = clinicView.weeks;
  // 예시를 볼 때는 고치는 단추와 입력 칸을 빼고 보여 주기만 한다
  const del = (act, i) => (demo ? '' : `<button class="txt dim" data-act="${act}" data-i="${i}" aria-label="${T('삭제')}">✕</button>`);
  const range = (w, label) => `<button data-act="clinicWeeks" data-w="${w}" aria-pressed="${pick === w}">${label}</button>`;
  app.innerHTML = `
    <header class="top"><div><div class="over">${nextText() || T('의사에게 보여 줄 것들')}</div><h1>${T('진료')}</h1></div>
      <div class="top-r"><div class="segc">${range(1, T('1주'))}${range(2, T('2주'))}${range(4, T('4주'))}${lastVisit() ? range('since', T('진료 후')) : ''}</div>${settingsButton()}</div></header>

    ${demo ? `<section class="card hint"><div><b>${T('예시 기록으로 만든 진료용 요약이에요.')}</b><br>${T('매일 적어 두면 내 기록으로 이렇게 정리돼요. 만들어 낸 예시라 저장되지 않아요.')}
        <button class="mini" data-act="demo" style="display:block;margin-top:10px">${T('예시 닫기')}</button></div></section>`
    : `<section class="card list">
      <label class="li"><span class="lk">${T('다음 진료일')}</span><input type="date" id="c-next" value="${esc(c.next || '')}"></label>
      ${few() ? `<button class="li add" data-act="demo">${IC.spark}&nbsp; ${T('예시로 미리 보기')}</button>` : ''}
    </section>`}

    <div id="summary">
      <div class="sec">${T('진료 때 말할 것')}</div>
      <section class="card list">
        ${c.notes.map((x, i) => `<div class="li"><span class="lk talk">${esc(x)}</span>${del('clinicNoteDel', i)}</div>`).join('')}
        ${demo ? '' : `<div class="li"><input type="text" id="c-note" maxlength="200" placeholder="${T('생각날 때 한 줄씩 적어 두기')}" autocomplete="off">
          <button class="mini" data-act="clinicNoteAdd">${T('추가')}</button></div>`}
      </section>
      <div class="sec">${T('진료 · 약 변경 기록')}</div>
      <section class="card list">
        ${c.log.map((x, i) => `<div class="li"><span class="lk talk"><small>${shortDate(x.date)} · ${kindName(x.kind)}</small>${esc(x.text)}</span>${del('logDel', i)}</div>`).reverse().join('')}
        ${demo ? '' : `<div class="li logadd"><button class="mini" data-act="logAdd" data-kind="visit">${T('+ 진료 메모')}</button>
          <button class="mini" data-act="logAdd" data-kind="med">${T('+ 약 바꾼 날')}</button></div>`}
      </section>
      ${summaryHtml(weeks)}
    </div>

    <div class="pair">
      <button class="btn" data-act="printSummary">${T('PDF · 인쇄')}</button>
      <button class="btn gray" data-act="copySummary">${T('글로 복사')}</button>
    </div>
    <p class="secnote" style="margin-top:12px">${T('“PDF · 인쇄”를 누르면 아이폰 인쇄 화면이 떠요. 미리보기를 두 손가락으로 벌린 뒤 공유 버튼을 누르면 PDF로 저장하거나 보낼 수 있어요.')}</p>`;
}

// 진료 메모 / 약 바꾼 날을 적는 화면
export function openLog(kind) {
  sheet.innerHTML = `<div class="sheet-in">
    <div class="sheet-top">
      <button class="txt" data-act="close">${T('취소')}</button>
      <div class="st"><b>${kind === 'med' ? T('약 바꾼 날') : T('진료 메모')}</b></div>
      <button class="txt strong" data-act="logSave" data-kind="${kind}">${T('저장')}</button>
    </div>
    <section class="card list">
      <label class="li"><span class="lk">${T('날짜')}</span><input type="date" id="l-date" value="${today()}" max="${today()}"></label>
      <div class="li"><textarea id="l-text" rows="4" maxlength="500" placeholder="${kind === 'med' ? T('예: 브린텔릭스 10mg → 15mg') : T('의사가 한 말, 바뀐 처방, 다음에 할 것')}"></textarea></div>
    </section>
    <p class="secnote">${kind === 'med' ? T('진료 화면 그래프의 그날 자리에 세로선으로 표시돼요.') : T('적어 두면 “진료 후” 기간으로 지난 진료부터의 흐름을 볼 수 있어요.')}</p>
  </div>`;
  showSheet();
}
