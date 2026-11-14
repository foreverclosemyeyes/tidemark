// 초기 신호 · 인사이트 · 진료용 요약 계산 (전부 이 폰 안에서)
import { SIGNS, cafMg, customText, drinkText, fxName, fxNames, psyName, psyNames } from './constants.js';
import { addDays, durText, md, parse, today } from './dates.js';
import { F, T } from './i18n.js';
import { aided, medsFor, medsText } from './meds.js';
import { customDefs, db, itemOn } from './store.js';

// ---------- 초기 신호 · 인사이트 (전부 이 폰 안에서 계산) ----------
export const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function signals() {
  const out = [], t = today();
  const run = [];   // 오늘(없으면 어제)부터 거꾸로, 하루도 안 빠지고 이어진 기록
  for (let d = db.entries[t] ? t : addDays(t, -1); db.entries[d]; d = addDays(d, -1)) run.push(db.entries[d]);
  const count = (test) => { let n = 0; while (n < run.length && test(run[n])) n++; return n; };
  const sleeps = Object.values(db.entries).map((e) => e.sleepMin).filter((x) => x != null);
  const hi = count((e) => e.energy >= 7);
  if (hi >= 2 && sleeps.length >= 5) {
    const recent = run.slice(0, hi).map((e) => e.sleepMin).filter((x) => x != null);
    if (recent.length && avg(recent) < avg(sleeps) - 20) out.push(T('에너지와 수면 패턴이 달라지고 있어요. 지켜볼 만해요.'));
  }
  if (count((e) => e.mood >= 8 || e.energy >= 8) >= 4) out.push(T('들뜬 상태가 며칠째 이어지고 있어요. 진료 때 이야기해 보세요.'));
  if (count((e) => e.dep >= 3) >= 12) out.push(T('우울한 날이 2주 가까이 이어지고 있어요. 진료 때 이야기해 보세요.'));
  if (count((e) => e.si >= 1) >= 3) out.push(T('죽고 싶은 생각이 며칠째 이어지고 있어요. 진료 때 꼭 이야기해 보세요.'));
  return out;
}

// ---------- 종합 읽기: 최근 7일의 모습, 언제부터인지, 그 전에 무엇이 달랐는지 ----------
// 사용자가 요청했다: "경조증 같은 게 보인다" 같은, 증상들을 다 합쳐서 본 인사이트.
//
// 기준 숫자의 근거 (2026-11-13에 찾아 읽은 것. 원문 전체가 아니라 공개된 요약·초록·표로 확인했다):
//  [1] DSM-5-TR 조증·경조증 삽화: 기분이 들뜨거나 과민하고 활동·에너지가 늘어남. 경조증은 4일 이상, 조증은 1주 이상.
//      증상 7가지(부풀어 오른 자존감, 잠을 덜 자도 됨, 말이 많아짐, 생각이 빠름, 산만함, 목표 지향 활동 증가, 위험한 일에 몰두) 중 3가지 이상.
//  [2] DSM-5-TR 주요우울 삽화: 같은 2주 동안 9가지 증상 중 5가지 이상, 그중 하나는 우울한 기분이나 흥미 상실.
//  [3] DSM-5 혼재 양상: 한쪽 삽화 중에 반대쪽 증상이 3가지 이상.
//  [4] Jackson, Cavanagh, Scott (2003) J Affect Disord, 조증·우울 전조 체계적 고찰: 조증의 가장 뚜렷한 초기 증상은 수면 문제(중앙값 77%).
//      Van Meter 외 (2016) JAACAP 메타분석: 재발 전의 약한 증상은 평균 1.0±0.9개월 이어짐.
//  [5] Bauer 외 (2006) Bipolar Disord, (2008) Psychol Med: 하루 사이에 수면이 3시간 넘게 달라지면 큰 기분 변화가 뒤따르기도 함 (환자의 약 40%에서 하루 간격으로 관련).
//  [6] Mitchell 외 (2008) Bipolar Disord: 조울증의 우울은 과수면·식욕 증가·정신운동 지연·정신병적 증상이 조금 더 흔함. 이것만으로 가를 수는 없음(확률적 접근).
//  [7] Adult ADHD vs. bipolar disorder in the DSM-5 era (2014) J Psychiatr Pract: ADHD는 늘 이어지고 조울증은 삽화로 옴.
//      잠을 덜 자도 피곤하지 않은 것과 부풀어 오른 자신감은 ADHD의 모습이 아님.
//  [8] Birchwood 외 (1989, 2000), Eisner 외 (2013) Clin Psychol Rev: 정신병 재발 몇 주 전에 불안·불면 등이 먼저 나타남. 예측력은 보통 수준이고, 자기 평소와 견줄 때 더 나음.
//      Gleeson 외 (2023~24) 체계적 고찰(72편, 6,903명): 수면·기분·의심이 재발 전 신호로 다뤄짐. 스마트폰 기록 연구에서는 재발 전 100일에 걸쳐 서서히 늘어남.
// 최근 자료 (같은 날 더 찾아 읽은 것. 정신과 연구는 새 자료가 중요하다고 사용자가 짚음):
//  [9] Lim 외 (2024) npj Digital Medicine, 기분장애 168명의 수면·각성 기록: 다음 날 삽화를 가장 잘 예측한 것은 일주기 위상의 변화.
//      위상이 당겨지면 조증·경조증, 늦어지면 우울 삽화. (한 집단의 관찰 연구라 원인이라고 할 수는 없음)
//  [10] Esaki 외 (2023) Psychiatry Clin Neurosci, APPLE 코호트 조울증 외래 193명 2년 추적: 밤사이 총수면시간 변동이 클수록 재발까지의 기간이 짧음.
//       2025년 재발 메타분석(34편, 33,500명): 수면 문제가 재발 위험 요인(OR 3.69).
//  [11] Littlewood 외 (2018) Psychol Med, Brüdern 외 (2022) BMC Psychiatry, Kivelä 외 (2024) J Psychiatr Res: 잠이 짧거나 나빴던 다음 날 자살 생각이 더 심함 (반대 방향은 아님).
//       그래서 "죽고 싶은 생각이 있던 날의 전날 밤 잠" 비교는 흔한 예상대로 나와도 숨기지 않는다.
//  [12] Rhee 외 (2023) Psychol Med 스웨덴 전국 자료: 우울증에서 조울증으로 진단이 바뀌는 것을 가장 잘 예측한 것은 조울증 가족력, 입원 치료, 정신병적 증상.
//       Kessing 외 (2017) 메타분석: 진단이 바뀌는 비율은 첫해 3.9%, 5~10년째 연 0.8%. 일관된 예측 요인은 찾지 못함.
//  [13] Schiweck 외 (2021) 메타분석 (2023년 리뷰에서 인용): ADHD가 있는 성인 13명 중 1명쯤이 조울증도 있고, 조울증이 있는 사람 6명 중 1명쯤이 ADHD도 있음.
//  참고: 스마트폰으로 기분을 적는 것 자체가 경과를 좋게 한다는 증거는 아직 없다 (ISBD Big Data Task Force 2022). 이 앱은 진료 때 보여 줄 기록을 남기는 도구로 쓴다.
// 진단이 아니라, 그런 때 흔히 보이는 모습과 기록이 겹치는 점을 세어서 보여 주는 것이다. 문장도 "겹친다"까지만 말한다.

// 들뜬 날 / 가라앉은 날로 보는 기준
const upDay = (e) => e.mood >= 7 || e.energy >= 8;
const downDay = (e) => (e.mood != null && e.mood <= 3) || e.dep >= 3;
const dayGap = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

// 기준에 맞는 날이 이어진 "시기"들을 찾는다. 하루쯤 빠지거나 안 맞아도 이어진 것으로 보고, 맞는 날이 3일 이상이어야 시기로 친다.
// [{ start, end, n: 맞는 날 수 }] (오래된 것부터)
function runs(entries, test) {
  const hits = Object.keys(entries).sort().filter((k) => test(entries[k])), out = [];
  hits.forEach((d) => {
    const last = out[out.length - 1];
    if (last && dayGap(last.end, d) <= 2) { last.end = d; last.n++; } else out.push({ start: d, end: d, n: 1 });
  });
  return out.filter((r) => r.n >= 3);
}

// 어떤 시기가 시작되기 전 2주가 평소(그 앞 4주)와 어떻게 달랐는지. mine이면 약 기록도 본다.
// 2주로 잡은 까닭: 재발 전에 나타나는 약한 증상은 평균 한 달쯤(0.5~1.3개월) 이어진다 [근거 4].
function before(entries, start, mine) {
  const pick = (from, to) => Object.keys(entries).filter((k) => k >= addDays(start, -from) && k <= addDays(start, -to)).map((k) => entries[k]);
  const win = pick(14, 1), base = pick(42, 15), vals = (list, key) => list.map((e) => e[key]).filter((x) => x != null);
  if (win.length < 4) return { points: [], lessSleep: false };
  const points = [], sw = vals(win, 'sleepMin'), sb = vals(base, 'sleepMin');
  const sleepDiff = sw.length && sb.length >= 3 ? Math.round(avg(sw) - avg(sb)) : 0;
  if (Math.abs(sleepDiff) >= 45) points.push(F(sleepDiff < 0 ? '잠이 평소보다 {0} 적었어요' : '잠이 평소보다 {0} 많았어요', durText(Math.abs(sleepDiff))));
  const missed = mine && db.meds.length ? win.filter((e) => !medsFor(e.date).length).length : 0;
  if (missed) points.push(F('약을 안 먹은 날이 {0}일 있었어요', missed));
  const cw = vals(win, 'caffeine'), cb = vals(base, 'caffeine');
  if (cw.length && cb.length >= 3 && avg(cw) >= avg(cb) + 2) points.push(T('카페인이 평소보다 많았어요'));
  // 내 항목 가운데 했음/안 했음 항목 (술, 운동처럼 사용자가 만든 것)
  if (mine) customDefs().filter((c) => c.type === 'check').forEach((c) => {
    const n = win.filter((e) => e.custom && e.custom[c.id]).length;
    if (n) points.push(F('“{0}” 한 날이 {1}일 있었어요', c.name, n));
  });
  const anxious = win.filter((e) => e.anx >= 2).length;
  if (anxious >= 3) points.push(F('불안이 보통 이상인 날이 {0}일 있었어요', anxious));
  if (win.some((e) => e.period)) points.push(T('생리 중이었어요'));
  return { points, lessSleep: sleepDiff <= -45 };
}

// 최근 7일 읽기. 진단 기준의 틀을 빌려서 센다 (진단을 내리는 것이 아니라, 기준에 나오는 모습이 기록에 얼마나 있는지 세는 것).
//   들뜬 쪽: 기분과 에너지가 둘 다 높은 날이 대부분이고 [근거 1: 경조증·조증은 기분과 활동·에너지가 함께 올라감],
//            기준 증상 7가지 가운데 3가지 이상이 기록에 있을 때 [근거 1]
//   가라앉은 쪽: 우울한 날이 대부분이고, 이 앱으로 적는 기준 증상 6가지(전체 9가지 가운데) 중 3가지 이상이 있을 때 [근거 2: 9가지 중 5가지 이상, 2주]
//   섞인 모습: 한쪽이 뚜렷한데 반대쪽 증상이 3가지 이상 함께 있을 때 [근거 3: 혼재 양상은 반대쪽 증상 3가지 이상]
//   "거의 매일"은 7일 중 4일 이상으로 본다. 수면은 그 전 4주의 내 평균과 견준다 [근거 8: 자기 평소와 견줄 때 더 잘 맞음].
// 돌려주는 것: { kind: 'high' | 'low' | 'mixed' | 'up'(높지만 기준 증상은 적음) | 'down'(우울하지만 기준 증상은 적음) | 'even', title,
//   flow: 언제부터 며칠째인지·기준 기간과 견준 말·요 사흘 방향 (한 줄), lead: 시작되기 전 2주에 평소와 달랐던 것 (한 줄),
//   points: [근거 문장, …] (많아도 6줄), notes: [덧붙이는 말, …] (많아도 2개) }
// 최근 7일 중 4일 이상 적었을 때만 나온다 (모자라면 null).
export function recentState(entries = db.entries) {
  const t = today(), mine = entries === db.entries;
  const span = (from, to) => Object.keys(entries).sort().filter((k) => k > addDays(t, -from) && k <= addDays(t, -to)).map((k) => entries[k]);
  const now = span(7, 0), prior = span(35, 7);
  if (now.length < 4) return null;
  const vals = (list, key) => list.map((e) => e[key]).filter((x) => x != null);
  const n = (test) => now.filter(test).length, most = (test) => n(test) >= 4;
  const sleep = avg(vals(now, 'sleepMin')), base = vals(prior, 'sleepMin'), sleepDiff = sleep != null && base.length >= 3 ? Math.round(sleep - avg(base)) : null;
  const sign = (k) => n((e) => !!(e.signs && e.signs[k])) >= 2, label = (k) => SIGNS.find(([key]) => key === k)[1];

  // 들뜬 쪽: 기분·에너지(A), 기준 증상 7가지(B) [근거 1]
  const moodUp = n((e) => e.mood >= 7), energyUp = n((e) => e.energy >= 7), hasEnergy = now.some((e) => e.energy != null);
  const aHigh = moodUp >= 4 && (!hasEnergy || energyUp >= 4);
  const lessNeed = sign('lessSleep') || (sleepDiff != null && sleepDiff <= -60 && n((e) => e.tired) <= 1);   // 잠이 줄었는데 피곤하지 않음
  const grand = most((e) => e.conf >= 8);
  const B = [[T('자신감이 크게 높아짐'), grand], [label('lessSleep'), lessNeed], [label('talkative'), sign('talkative')], [label('racing'), sign('racing')],
    [label('distract'), sign('distract')], [label('projects'), sign('projects')], [label('impulsive'), sign('impulsive')]].filter(([, on]) => on).map(([name]) => name);
  // 가라앉은 쪽: 우울한 기분(A), 이 앱으로 적는 기준 증상 6가지 [근거 2]. 흥미 없음·몸이 느려짐·집중 어려움은 적는 칸이 없어서 못 센다.
  const depMood = most((e) => e.dep >= 2 || (e.mood != null && e.mood <= 3));
  const moreSleep = sleepDiff != null && sleepDiff >= 60, moreAppetite = most((e) => e.appetite >= 9);
  const D = [[T('우울한 기분'), depMood], [T('식욕이 크게 줄거나 늘어남'), most((e) => e.appetite != null && (e.appetite <= 2 || e.appetite >= 9))],
    [T('잠이 평소보다 한 시간 넘게 늘거나 줄어듦'), sleepDiff != null && Math.abs(sleepDiff) >= 60 && !lessNeed], [T('기운이 없음'), most((e) => e.energy != null && e.energy <= 3)],
    [T('자신감이 크게 낮아짐'), most((e) => e.conf != null && e.conf <= 2)], [T('죽고 싶은 생각'), n((e) => e.si >= 1) >= 2]].filter(([, on]) => on).map(([name]) => name);

  const isHigh = aHigh && B.length >= 3, isLow = depMood && D.length >= 3;
  const kind = (isHigh && (isLow || D.length >= 3)) || (isLow && B.length >= 3) ? 'mixed' : isHigh ? 'high' : isLow ? 'low' : aHigh ? 'up' : depMood ? 'down' : 'even';

  // 어느 쪽이든 함께 봐야 하는 것
  const also = [], add = (count, min, text) => { if (count >= min) also.push(F(text, count)); };
  const psyDays = n((e) => e.psy >= 1), anxDays = n((e) => e.anx >= 2);
  add(psyDays, 1, '정신병적 증상이 있던 날 {0}일');
  add(n((e) => e.panic > 0), 1, '공황이 있던 날 {0}일');
  add(anxDays, 3, '불안이 보통 이상인 날 {0}일');
  add(n((e) => e.sleepMin != null && e.sleepMin < SHORT_SLEEP), 2, '5시간 미만으로 잔 밤 {0}일');
  // 하루 사이에 잠이 3시간 넘게 달라진 날: 큰 기분 변화에 하루쯤 앞서 나타나기도 한다 [근거 5]
  const withSleep = span(8, 0).filter((e) => e.sleepMin != null);
  add(withSleep.filter((e, i) => i && dayGap(withSleep[i - 1].date, e.date) === 1 && Math.abs(e.sleepMin - withSleep[i - 1].sleepMin) > 180).length, 1, '하루 사이에 잠이 3시간 넘게 달라진 날 {0}일');
  // 잠자는 시간대(잠든 시각과 깬 시각의 한가운데)가 평소보다 당겨지거나 늦어졌는지:
  // 시간대가 당겨지면 조증·경조증, 늦어지면 우울 삽화가 뒤따르는 경우가 많았다 [근거 9]. "한 시간 이상"이라는 기준은 내가 정했다.
  const mid = (e) => { const [h, m] = e.bed.split(':').map(Number), bed = h * 60 + m + (h < 12 ? 1440 : 0); return bed + e.sleepMin / 2; };
  const timed = (list) => list.filter((e) => e.bed && e.sleepMin != null).map(mid), midNow = timed(now), midBase = timed(prior);
  if (midNow.length >= 3 && midBase.length >= 5) {
    const shift = Math.round(avg(midNow) - avg(midBase));
    if (Math.abs(shift) >= 60) also.push(F(shift < 0 ? '잠자는 시간대가 평소보다 {0} 당겨짐 (들뜬 시기 앞에 나타나기도 해요)' : '잠자는 시간대가 평소보다 {0} 늦어짐 (가라앉은 시기 앞에 나타나기도 해요)', durText(Math.abs(shift))));
  }
  // 밤마다 잠자는 시간이 들쭉날쭉한지: 밤사이 수면 시간의 변동이 큰 사람이 더 빨리 재발했다 [근거 10]. "90분 이상이고 평소의 1.5배"는 내가 정했다.
  const spread = (v) => { const m = avg(v); return Math.sqrt(avg(v.map((x) => (x - m) ** 2))); }, sleepNow = vals(now, 'sleepMin');
  if (sleepNow.length >= 4 && base.length >= 7 && spread(sleepNow) >= 90 && spread(sleepNow) >= spread(base) * 1.5) also.push(T('밤마다 잠자는 시간이 평소보다 들쭉날쭉함'));
  if (mine && db.meds.length) add(n((e) => !medsFor(e.date).length), 2, '약을 안 먹은 날 {0}일');

  // 화면에 나가는 글은 짧게 쓴다 (사용자가 인사이트가 너무 길다고 함, 2026-11-13): 결론 한 줄, 언제부터 한 줄, 근거 몇 줄.
  const title = {
    mixed: T('최근 7일은 들뜬 모습과 가라앉은 모습이 함께 보여요.'),
    high: T('최근 7일은 경조증·조증 때의 모습과 많이 겹쳐요.'),
    low: T('최근 7일은 우울 삽화 때의 모습과 많이 겹쳐요.'),
    up: T('최근 7일은 기분과 에너지가 높은 날이 많아요.'),
    down: T('최근 7일은 우울한 날이 많아요.'),
    even: anxDays >= 4 ? T('최근 7일은 불안이 높은 날이 많아요.') : T('최근 7일은 한쪽으로 뚜렷하게 기울지 않았어요.'),
  }[kind] + (psyDays ? T(' 정신병적 증상도 적혀 있어요.') : '');
  // 근거: 기준 증상을 몇 가지 셌는지와 그 이름, 그리고 함께 보이는 것 (많아도 여섯 줄)
  const points = [
    aHigh || B.length >= 2 ? F('경조증 기준 증상 7가지 중 {0}가지', B.length) + (B.length ? `: ${B.join(', ')}` : '') : '',
    depMood || D.length >= 2 ? F('우울 삽화 기준 증상 중 적는 6가지에서 {0}가지', D.length) + (D.length ? `: ${D.join(', ')}` : '') : '',
    ...also,
  ].filter(Boolean).slice(0, 6);

  // 언제부터인지 · 기준에 나오는 기간과 견주면 어떤지 · 요 사흘 방향, 그리고 시작되기 전 2주에 평소와 달랐던 것 (한 줄씩)
  let flow = '', lead = '', started = '';
  const up = kind === 'high' || kind === 'up', down = kind === 'low' || kind === 'down';
  if (up || down) {
    const all = runs(entries, up ? upDay : downDay), cur = all[all.length - 1];
    if (cur && dayGap(cur.end, t) <= 2) {
      const days = dayGap(cur.start, t) + 1, moods = vals(now, 'mood'), late = moods.slice(-3), early = moods.slice(0, -3);
      const turn = late.length === 3 && early.length >= 2 ? avg(late) - avg(early) : 0;
      const dir = turn >= 1 ? T(' · 요 사흘 기분이 더 오르는 중') : turn <= -1 ? T(' · 요 사흘 기분이 더 내리는 중') : '';
      // 진단 기준의 기간: 경조증 4일 이상, 조증 1주 이상 [근거 1], 우울 삽화 2주 이상 [근거 2]
      const length = up ? (days >= 7 ? T(' · 조증 기준 기간(1주)을 넘음') : days >= 4 ? T(' · 경조증 기준 기간(4일)을 넘음') : T(' · 경조증 기준 기간(4일)보다 짧음'))
        : days >= 14 ? T(' · 우울 삽화 기준 기간(2주)을 넘음') : T(' · 우울 삽화 기준 기간(2주)보다 짧음');
      flow = F('{0}쯤부터 {1}일째', md(parse(cur.start)), days) + length + dir;
      started = cur.start;
      const b = before(entries, cur.start, mine);
      if (b.points.length) lead = F('시작되기 전 2주: {0}', b.points.join(' · '));
    }
  }

  // 덧붙이는 말 (많아도 두 개): 비슷해 보이는 것들을 가르는 데 연구에서 쓰는 단서가 기록에 있으면 알려 준다. 어느 쪽이라고 정하지는 않는다.
  const notes = [];
  // ADHD와 들뜬 시기: ADHD는 늘 이어지고, 들뜬 시기는 어느 날부터 시작된다. 잠이 줄어도 피곤하지 않은 것과 부풀어 오른 자신감은 ADHD의 모습이 아니다 [근거 7, 13]
  // (진단명을 묻지 않으므로, 가르는 단서가 두 가지 이상 기록에 있을 때만 말한다)
  if (up) {
    const clues = [started && prior.filter(upDay).length <= prior.length / 4 ? T('어느 날부터 시작됨') : '', lessNeed ? T('잠이 줄었는데 피곤하지 않음') : '', grand ? T('자신감이 크게 높아짐') : ''].filter(Boolean);
    if (clues.length >= 2) notes.push(F('{0}은 ADHD보다 들뜬 시기에서 흔한 모습이에요.', clues.join(' · ')));
  }
  // 가라앉은 시기에 잠·식욕이 늘거나 정신병적 증상이 있는 것은 조울증의 우울에서 조금 더 흔하다. 그것만으로 가를 수는 없다 [근거 6, 12]
  if (down) {
    const clues = [moreSleep ? T('잠이 늘어남') : '', moreAppetite ? T('식욕이 늘어남') : '', psyDays ? T('정신병적 증상') : ''].filter(Boolean);
    if (clues.length) notes.push(F('가라앉은 시기의 {0}은 조울증의 우울에서 조금 더 흔해요. 진료 때 이야기해 보세요.', clues.join(' · ')));
  }
  // 조현병: 재발 몇 주 전에 불안과 잠 문제가 먼저 나타나기도 한다 [근거 8]
  if (Object.keys(entries).some((k) => entries[k].psy >= 1) && !psyDays && anxDays >= 3 && sleepDiff != null && sleepDiff <= -60) {
    notes.push(T('불안과 잠 문제가 함께 늘었어요. 정신병적 증상에 앞서 오기도 해요.'));
  }
  return { kind, title, flow, lead, points, notes: notes.slice(0, 2) };
}

// ---------- 숫자로 보기 ----------
// 해석 없이 숫자만: 최근 7일과 그 전 4주를 나란히 놓은 표 (사용자가 정량적이고 객관적인 정보를 원했다, 2026-11-14).
// 최근 7일 중 3일 이상 적었을 때만 나온다. 설정에서 꺼 둔 항목의 줄은 뺀다. [[이름, 최근 7일, 그 전 4주], …]
export function numbers(entries = db.entries) {
  const t = today(), mine = entries === db.entries;
  const span = (from, to) => Object.keys(entries).sort().filter((k) => k > addDays(t, -from) && k <= addDays(t, -to)).map((k) => entries[k]);
  const now = span(7, 0), base = span(35, 7);
  if (now.length < 3) return [];
  const vals = (list, key) => list.map((e) => e[key]).filter((x) => x != null);
  const one = (x) => x.toFixed(1), dur = (m) => durText(Math.round(m));
  // 평균 (가장 낮은 값–높은 값)
  const mean = (list, key, fmt) => {
    const v = vals(list, key), end = (x) => (fmt === one ? String(x) : fmt(x));   // 0~10 점수의 범위는 "4–6"처럼 소수점 없이
    return v.length ? `${fmt(avg(v))}<small>${end(Math.min(...v))}–${end(Math.max(...v))}</small>` : '–';
  };
  // 밤마다 잠이 얼마나 들쭉날쭉한지 (표준편차)
  const spread = (list) => { const v = vals(list, 'sleepMin'); if (v.length < 3) return '–'; const m = avg(v); return `±${dur(Math.sqrt(avg(v.map((x) => (x - m) ** 2))))}`; };
  // 잠든 시각의 평균 (자정을 넘긴 시각은 다음 날로 이어서 센다)
  const bed = (list) => {
    const v = list.filter((e) => e.bed).map((e) => { const [h, m] = e.bed.split(':').map(Number); return h * 60 + m + (h < 12 ? 1440 : 0); });
    if (v.length < 3) return '–';
    const a = Math.round(avg(v)) % 1440;
    return `${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  };
  // 그런 날이 며칠인지: "2/7일" (그 값을 적은 날 가운데)
  const days = (list, key, test) => { const v = list.filter((e) => e[key] != null); return v.length ? F('{0}/{1}일', v.filter(test).length, v.length) : '–'; };
  const took = (list) => (list.length ? F('{0}/{1}일', list.filter((e) => medsFor(e.date).length).length, list.length) : '–');
  const row = (on, name, f) => (on ? [[name, f(now), f(base)]] : []);
  return [
    ...row(itemOn('mood'), T('기분'), (l) => mean(l, 'mood', one)),
    ...row(itemOn('energy'), T('에너지'), (l) => mean(l, 'energy', one)),
    ...row(itemOn('conf'), T('자신감'), (l) => mean(l, 'conf', one)),
    ...row(itemOn('sleep'), T('잠'), (l) => mean(l, 'sleepMin', dur)),
    ...row(itemOn('sleep'), T('잠의 들쭉날쭉'), spread),
    ...row(itemOn('sleep'), T('잠든 시각'), bed),
    ...row(itemOn('sleep'), T('5시간 미만 밤'), (l) => days(l, 'sleepMin', (e) => e.sleepMin < SHORT_SLEEP)),
    ...row(itemOn('dep'), T('우울이 보통 이상'), (l) => days(l, 'dep', (e) => e.dep >= 2)),
    ...row(itemOn('anx'), T('불안이 보통 이상'), (l) => days(l, 'anx', (e) => e.anx >= 2)),
    ...row(itemOn('panic') && [...now, ...base].some((e) => e.panic), T('공황'), (l) => F('{0}번', l.reduce((n, e) => n + (e.panic || 0), 0))),
    ...row(itemOn('meds') && mine && db.meds.length > 0, T('약 먹은 날'), took),
    [T('적은 날'), F('{0}/{1}일', now.length, 7), F('{0}/{1}일', base.length, 28)],
  ].filter(([, a, b]) => a !== '–' || b !== '–');
}

// 잠을 적게 잔 날과 그 밖의 날: 최근 8주에서, 내 평균보다 1시간 넘게 적게 자고 일어난 날의 기분·에너지·불안을 나머지 날과 나란히 놓는다.
// 잠이 줄면 그날·다음 날의 기분과 죽고 싶은 생각이 나빠진다는 연구가 있다 [근거 11]. "1시간"과 "각각 4일·8일 이상"은 내가 정했다.
// 돌려주는 것: { short: 적게 잔 날 수, rest: 그 밖의 날 수, rows: [[이름, 적게 잔 날, 그 밖의 날], …] } 또는 null
export function shortSleepDays(entries = db.entries) {
  const t = today(), list = Object.keys(entries).filter((k) => k > addDays(t, -56) && k <= t).map((k) => entries[k]).filter((e) => e.sleepMin != null);
  if (list.length < 12) return null;
  const mean = avg(list.map((e) => e.sleepMin)), short = list.filter((e) => e.sleepMin < mean - 60), rest = list.filter((e) => e.sleepMin >= mean - 60);
  if (short.length < 4 || rest.length < 8) return null;
  const num = (l, key) => { const v = l.map((e) => e[key]).filter((x) => x != null); return v.length ? avg(v).toFixed(1) : '–'; };
  const days = (l, key, test) => { const v = l.filter((e) => e[key] != null); return v.length ? F('{0}/{1}일', v.filter(test).length, v.length) : '–'; };
  const row = (on, name, f) => (on ? [[name, f(short), f(rest)]] : []);
  const rows = [
    ...row(itemOn('mood'), T('기분'), (l) => num(l, 'mood')), ...row(itemOn('energy'), T('에너지'), (l) => num(l, 'energy')),
    ...row(itemOn('dep'), T('우울이 보통 이상'), (l) => days(l, 'dep', (e) => e.dep >= 2)), ...row(itemOn('anx'), T('불안이 보통 이상'), (l) => days(l, 'anx', (e) => e.anx >= 2)),
  ].filter(([, a, b]) => a !== '–' && b !== '–');
  return rows.length ? { short: short.length, rest: rest.length, rows } : null;
}

// ---------- 약을 바꾼 앞뒤 ----------
// 약을 바꾼 날(진료 화면에 적어 둔 것)의 앞 2주와 뒤 2주. 앞뒤로 각각 4일 이상 적었을 때만 나온다. (최근 것부터)
// [{ date, text, after: 뒤쪽에 적은 날 수, rows: [[항목, 앞, 뒤], …] }]
export function medChanges() {
  const t = today(), log = (db.clinic && db.clinic.log) || [];
  const pick = (from, to) => Object.keys(db.entries).filter((k) => k >= from && k <= to).map((k) => db.entries[k]);
  const dur = (m) => durText(Math.round(m)), num = (x) => x.toFixed(1);
  const cell = (list, key, fmt) => { const v = list.map((e) => e[key]).filter((x) => x != null); return v.length ? fmt(avg(v)) : '–'; };
  const count = (list, test) => F('{0}일 중 {1}일', list.length, list.filter(test).length);
  return log.filter((x) => x.kind === 'med' && x.date <= t).map((x) => {
    const b = pick(addDays(x.date, -14), addDays(x.date, -1)), last = addDays(x.date, 13), a = pick(x.date, last < t ? last : t);
    if (b.length < 4 || a.length < 4) return null;
    return {
      date: x.date, text: x.text, after: a.length,
      rows: [[T('기분'), cell(b, 'mood', num), cell(a, 'mood', num)], [T('에너지'), cell(b, 'energy', num), cell(a, 'energy', num)], [T('잠'), cell(b, 'sleepMin', dur), cell(a, 'sleepMin', dur)],
        [T('우울이 보통 이상'), count(b, (e) => e.dep >= 2), count(a, (e) => e.dep >= 2)], [T('불안이 보통 이상'), count(b, (e) => e.anx >= 2), count(a, (e) => e.anx >= 2)]],
    };
  }).filter(Boolean).reverse();
}

// AI 앱에 붙여 넣을 수 있는 최근 4주 요약 글
export function aiSummary() {
  const t = today(), lines = [];
  for (let i = 27; i >= 0; i--) {
    const d = addDays(t, -i), e = db.entries[d], meds = medsText(medsFor(d));
    if (!e) { if (meds) lines.push(`${d} | (기록 없음) | 약: ${meds}`); continue; }
    const signs = SIGNS.filter(([k]) => e.signs && e.signs[k]).map(([, l]) => l).join(', ');
    const val = (label, v, unit) => (v == null ? '' : `${label} ${v}${unit || ''}`);   // 안 적은 항목은 줄에서 뺀다
    lines.push([d, val('기분', e.mood), val('에너지', e.energy), val('자신감', e.conf), val('우울', e.dep, '/4'), val('불안', e.anx, '/4'), val('공황', e.panic, '번'), psyNames(e.psych).length ? `정신병적 증상: ${psyNames(e.psych).join(', ')}` : val('정신병적 증상', e.psy, '/4'), val('죽고 싶은 생각', e.si, '/4'),
      e.sleepMin != null ? `수면 ${Math.floor(e.sleepMin / 60)}시간 ${e.sleepMin % 60}분${aided(e) ? '(전날 안정제·수면제 복용)' : ''}` : '', e.tired ? '기상 시 피곤' : '', e.period ? '생리 중' : '',
      e.appetite != null ? `식욕 ${e.appetite}` : '', e.drinks ? `카페인 약 ${cafMg(e.drinks)}mg(${drinkText(e.drinks) || '없음'})` : e.caffeine != null ? `카페인 ${e.caffeine}/10` : '', `약: ${meds || '없음'}`, fxNames(e.fx).length ? `부작용: ${fxNames(e.fx).join(', ')}` : '', ...(e.custom ? customDefs().map((c) => (customText(c, e.custom[c.id]) ? `${c.name}: ${customText(c, e.custom[c.id])}` : '')) : []), signs ? `체크: ${signs}` : '', e.note ? `메모: ${e.note}` : '']
      .filter(Boolean).join(' | '));
  }
  return `아래는 내가 직접 적은 최근 4주 기분·수면·복약 기록이야 (기분·에너지·자신감·식욕·카페인은 0~10, 우울·불안·죽고 싶은 생각은 0~4).
진단은 하지 말고, 눈에 띄는 패턴과 진료 때 의사에게 이야기하거나 물어볼 만한 점을 쉬운 말로 정리해 줘.

${lines.join('\n') || '(기록 없음)'}`;
}

// ---------- 진료용 요약: 최근 n주를 숫자로 정리 (화면·글·인쇄가 같이 쓴다) ----------
export const SHORT_SLEEP = 300;   // 이 분(5시간)보다 짧게 잔 날을 따로 적는다
// demo를 주면({ entries, meds, log }) 내 기록 대신 그 예시 기록으로 만든다 (진료 화면의 "예시로 미리 보기").
export function summary(weeks, demo) {
  const n = weeks * 7, t = today();
  const dates = Array.from({ length: n }, (_, i) => addDays(t, i - n + 1));
  const entries = demo ? demo.entries : db.entries;
  const days = dates.map((d) => entries[d] || null), got = days.filter(Boolean);
  const takenOn = (d) => (demo ? (entries[d] || {}).meds || [] : medsFor(d));
  const same = (m) => (x) => x.name === m.name && (x.dose || '') === (m.dose || '');
  const stat = (key) => {
    const v = got.map((e) => e[key]).filter((x) => x != null);
    return v.length ? { avg: avg(v), min: Math.min(...v), max: Math.max(...v), n: v.length } : null;
  };
  // 그 항목이 from 단계 이상이었던 날짜들
  const when = (key, from) => got.filter((e) => e[key] != null && e[key] >= from).map((e) => e.date);
  return {
    weeks, dates, days, got,
    mood: stat('mood'), energy: stat('energy'), conf: stat('conf'), sleep: stat('sleepMin'),
    high: { dep: when('dep', 3), anx: when('anx', 3), psy: when('psy', 1), si: when('si', 1) },
    shortSleep: got.filter((e) => e.sleepMin != null && e.sleepMin < SHORT_SLEEP).map((e) => e.date),
    signs: SIGNS.map(([k, label]) => [label, got.filter((e) => e.signs && e.signs[k]).length]).filter(([, c]) => c),
    psych: [...new Set(got.flatMap((e) => Object.keys(e.psych || {}).filter((k) => e.psych[k])))].map((k) => [psyName(k), got.filter((e) => e.psych && e.psych[k]).length]),
    fx: [...new Set(got.flatMap((e) => Object.keys(e.fx || {}).filter((k) => e.fx[k])))].map((k) => [fxName(k), got.filter((e) => e.fx && e.fx[k]).length]),
    // 약마다 [약, 먹은 날 수, 날마다 먹었는지]
    meds: (demo ? demo.meds : db.meds).map((m) => { const on = dates.map((d) => takenOn(d).some(same(m))); return [m, on.filter(Boolean).length, on]; }),
    // 진료일과 약 바꾼 날
    log: demo ? demo.log : (db.clinic || {}).log || [],
    period: got.filter((e) => e.period).map((e) => e.date),
    notes: got.filter((e) => e.note).map((e) => [e.date, e.note]),
    signals: demo ? [] : signals(),
  };
}
