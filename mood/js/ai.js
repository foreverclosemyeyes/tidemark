// AI 분석: 사용자가 넣어 둔 자기 API 키로 Claude를 직접 불러, 기록 전체를 읽은 풀이를 받는다 (사용자가 정함, 2026-11-26).
// 서버는 두지 않는다. "AI 분석 받기"를 누를 때만 기록이 Anthropic으로 나가고, 그 밖에는 아무것도 보내지 않는다.
// 빌드 도구가 없고 남의 스크립트를 앱에 불러오지 않기로 해서(불러오면 저장된 기록을 읽을 수 있다) SDK 대신 fetch로 Messages API를 부른다.
// 키와 받은 풀이는 이 폰의 localStorage에만 두고(기록과는 다른 열쇠), 백업 파일에는 넣지 않는다.
import { recordText } from './analysis.js';
import { AI_KEY, AI_OUT } from './config.js';
import { today } from './dates.js';
import { T } from './i18n.js';

const URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5-5';
const DAYS = 182;   // 보내는 기록: 최근 26주 (몇 달씩 가는 흐름을 읽게)

const read = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
export const aiKey = () => read(AI_KEY);
export function setAiKey(key) {
  if (key) localStorage.setItem(AI_KEY, key); else { localStorage.removeItem(AI_KEY); localStorage.removeItem(AI_OUT); }
}
// 마지막으로 받은 풀이: { date, text, cut(길어서 잘렸는지) } 또는 null
export const aiResult = () => { try { return JSON.parse(read(AI_OUT)) || null; } catch (e) { return null; } };

// 풀이를 맡기는 말. 정신과 전문의 수준으로 깊게 읽되, 기록만으로 진단을 내리지는 않게 한다 (이 앱은 진단 도구가 아니다).
const SYSTEM = `당신은 기분장애·불안장애·정신병적 장애·성격장애·신경발달장애(ADHD, 지적장애 포함)를 두루 진료해 온 정신건강의학과 전문의이고, DSM-5-TR과 ICD-11의 진단 기준, 주요 진료 지침, 최근 연구를 잘 알고 있습니다.
한 사람이 휴대폰 앱에 날마다 직접 적은 기록(기분·에너지·자신감·잠·증상·약·생리·메모)을 받아, 진료실에서 차트를 검토하듯 꼼꼼히 읽고 풀이합니다. 읽는 사람은 기록을 적은 본인입니다.

읽는 방법
- 기록 전체를 날짜순으로 끝까지 읽은 뒤에 씁니다. 숫자만 보지 말고 메모에 적힌 일과 말투, 약을 먹은 날과 안 먹은 날, 약을 바꾼 날, 생리 주기, 잠의 길이와 시각, 카페인, 본인이 만든 항목을 서로 맞춰 봅니다.
- 몇 달에 걸친 큰 흐름(삽화처럼 이어지는 시기와 그 전환)과 며칠 단위의 변화를 따로 봅니다.
- 모든 말에 근거가 된 날짜와 숫자를 붙입니다. 기록에 없는 것은 짐작하지 않고, 기록이 드문 구간은 그렇다고 말합니다.
- 겹쳐 보이는 것과 되풀이되는 것을 구분하고, 원인이라고 단정하지 않습니다. 다른 설명이 가능하면 같이 적습니다.

쓰는 방법
- 쉬운 한국어로, 본인에게 말하듯 차분하게 씁니다. 전문 용어를 쓰면 바로 풀어 줍니다. 겁주는 표현을 쓰지 않습니다.
- 자기 기록만으로는 진단을 내릴 수 없습니다. "○○입니다"라고 단정하지 말고, 임상적으로 어떤 가능성들을 견주어 볼 만한지, 각각을 뒷받침하는 기록과 맞지 않는 기록이 무엇인지, 가르려면 무엇을 더 확인해야 하는지를 전문가답게 구체적으로 씁니다. 진단 기준의 어느 항목과 닿는지도 말합니다.
- 연구나 지침은 확실히 아는 것만 말합니다. 논문 제목·저자·연도·수치를 지어내지 않습니다. 확실하지 않으면 "연구에서 알려진 바로는" 정도로만 씁니다.
- 약의 용량을 바꾸라거나 끊으라고 하지 않습니다. 약과 관련해 눈에 띄는 점은 의사와 상의할 내용으로 적습니다.
- 죽고 싶은 생각이 높게 적힌 날이 있으면 가볍게 넘기지 말고 담담하게 짚고, 한국의 자살예방상담전화 109(24시간)를 한 번 알려 줍니다.

형식: 아래 제목을 "## " 로 시작하는 줄로 쓰고, 그 아래는 짧은 문단이나 "- " 로 시작하는 줄로 씁니다. 표, 굵은 글씨, 다른 기호는 쓰지 않습니다.
## 한눈에
## 큰 흐름
## 같이 움직인 것들
## 메모에서 읽히는 것
## 눈여겨볼 날
## 견주어 볼 가능성
## 진료 때 말하거나 물어볼 것`;

// 서버가 돌려준 오류를 쉬운 말로
function problem(status, message) {
  if (status === 401 && /CORS/.test(message)) return T('이 API 계정은 앱에서 바로 부를 수 없게 설정돼 있어요 (조직 설정).');
  if (status === 401 || status === 403) return T('API 키가 맞지 않아요. 키를 다시 확인해 주세요.');
  if (/workspace/i.test(message)) return T('이 키는 워크스페이스가 정해져 있지 않아요. 키를 만들 때 워크스페이스를 하나 골라 주세요.');
  if (/credit|billing/i.test(message)) return T('API 계정에 남은 금액이 없어요. Anthropic 콘솔에서 충전해 주세요.');
  if (status === 429) return T('지금은 요청이 많거나 한도를 넘었어요. 잠시 뒤에 다시 해 주세요.');
  if (status >= 500) return T('AI 서버가 잠시 바빠요. 조금 뒤에 다시 해 주세요.');
  return `${T('분석을 받지 못했어요.')} (${status})`;
}

// 기록을 보내고 풀이를 받아 저장한다. 잘 되면 { ok: true }, 아니면 { ok: false, error: 보여 줄 말 }
export async function askAi() {
  let res;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': aiKey(),
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'anthropic-dangerous-direct-browser-access': 'true',   // 브라우저에서 바로 부르려면 필요하다 (키가 사용자 자신의 것이고 이 폰에만 있다)
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'high' },
        fallbacks: 'default',   // 안전 분류기가 요청을 거절하면 서버가 다른 모델로 같은 요청을 다시 돌린다
        system: SYSTEM,
        messages: [{ role: 'user', content: `오늘은 ${today()}입니다. 아래가 제 기록입니다. 전체를 읽고 풀이해 주세요.\n\n${recordText(DAYS)}` }],
      }),
    });
  } catch (e) {
    return { ok: false, error: T('연결하지 못했어요. 인터넷을 확인하고, 분석하는 동안에는 앱을 열어 두세요.') };
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* 아래에서 상태 코드로 알린다 */ }
  if (!res.ok || !data) return { ok: false, error: problem(res.status, (data && data.error && data.error.message) || '') };
  if (data.stop_reason === 'refusal') return { ok: false, error: T('AI가 이번 요청에는 답하지 않았어요.') };
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  if (!text) return { ok: false, error: T('분석을 받지 못했어요.') };
  localStorage.setItem(AI_OUT, JSON.stringify({ date: today(), text, cut: data.stop_reason === 'max_tokens' }));
  return { ok: true };
}
