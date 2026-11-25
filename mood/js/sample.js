// 예시 기록: 흐름 화면을 미리 구경할 때만 쓴다 (기록이 3일 미만일 때). 저장하지 않고, 내 기록과 섞이지 않는다.
import { addDays, today } from './dates.js';
import { EN, T } from './i18n.js';

// 예시에 나오는 약: 3주 전에 먹기 시작했고 가끔 빼먹는다
const sampleMed = () => ({ name: EN ? 'Trintellix' : '브린텔릭스', dose: '10mg' });

// 오늘까지 26주치 (흐름의 6달 보기를 채운다). 일부러 눈에 보이는 패턴을 넣었다:
// 가라앉은 몇 주 뒤에 들뜬 6일(마지막 이틀은 정신병적 증상도), 카페인이 많은 날은 불안이 높고 그날 밤은 덜 잔다. 약은 3주 전부터.
function sampleEntries() {
  const t = today(), out = {};
  for (let i = 181; i >= 0; i--) {
    const date = addDays(t, -i), high = i < 6;
    const cafYesterday = (i + 1) % 5 === 2, movedYesterday = (i + 1) % 4 === 1;
    const period = i % 28 >= 16 && i % 28 <= 20, caf = i % 5 === 2;
    // 들뜨기 전 아흐레쯤(i 6~14)은 잠이 먼저 줄어 있다
    const sleepMin = high ? 290 : i <= 14 ? 350 : 440 - (cafYesterday ? 70 : 0) + (movedYesterday ? 40 : 0);
    out[date] = {
      date, mood: high ? 8 : (i > 120 ? 5 : i > 75 ? 6 : i > 20 ? 4 : 5) - (period ? 1 : 0), energy: high ? 9 : 4 + (i % 2), conf: high ? 8 : 5,
      sleepMin, tired: !high && sleepMin < 400, period, caffeine: caf ? 8 : 3, appetite: caf ? 3 : 6,
      meds: i <= 20 && i % 9 !== 4 ? [sampleMed()] : [],
      note: i === 2 ? T('할 일을 한꺼번에 많이 벌임') : i === 17 ? T('하루 종일 누워 있었음') : '',
      bed: high ? '23:30' : '00:40', dep: high ? 0 : i >= 20 ? 3 : 1, stress: caf ? 3 : i % 3, anx: caf ? 3 : 1, psy: i < 3 ? 1 : null, psych: i < 3 ? { voices: true } : undefined, si: 0, signs: high ? { racing: true, projects: i % 2 === 0 } : {},
    };
  }
  return out;
}

// 흐름 화면 예시: 위 기록에 약과 진료·약 변경 기록을 더한 것
export function sampleClinic() {
  const t = today(), med = sampleMed();
  return {
    entries: sampleEntries(), meds: [med],
    log: [{ date: addDays(t, -20), kind: 'med', text: `${med.name} ${med.dose} ${T('시작')}` }, { date: addDays(t, -13), kind: 'visit', text: T('2주 뒤에 다시 보기로 함') }],
  };
}
