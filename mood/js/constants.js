// 고정 값: 단계 이름, 체크리스트, 약 목록, 음료, 글씨체
import { EN, T } from './i18n.js';

export const LEVELS = [T('없음'), T('약간'), T('보통'), T('높음'), T('매우 높음')];
// si(죽고 싶은 생각)는 진료 때 꼭 필요한 정보라 다른 증상과 같은 5단계로 적는다. 문구는 담담하게, 판단 없이.
// "고조(들뜸)"는 기분·에너지와 겹쳐서 뺐다 (2026-11-13). 예전 기록에 남아 있는 값(elev)은 쓰지 않고, 그 날을 다시 저장하면 빠진다.
export const SYMPTOMS = [['dep', T('우울')], ['anx', T('불안')], ['si', T('죽고 싶은 생각')]];
// 정신병적 증상은 단계가 아니라, 그날 있었던 것을 하나씩 눌러 적는다 (entry.psych = { 열쇠: true }). 목록에 없으면 직접 적는다 ('c:이름', settings.psyCustom).
// 그날 몇 가지였는지는 entry.psy(1~4, 없으면 null)에 같이 적어 둔다. 그림과 인사이트는 이 숫자를 쓴다.
export const PSYCH = [
  ['voices', T('환청')], ['visions', T('헛것이 보임')], ['persecuted', T('누가 해치려는 느낌')], ['reference', T('다 나와 관련된 느낌')],
  ['grand', T('내가 특별하다는 확신')], ['unreal', T('현실 같지 않음')], ['read', T('생각이 읽히는 느낌')], ['jumbled', T('생각이 뒤죽박죽')],
];
// 기록 항목: 설정에서 하나씩 끌 수 있다 (끄면 기록·오늘·흐름·진료 화면에서 안 보인다. 적어 둔 값은 지우지 않는다).
export const ITEMS = [
  ['mood', T('기분')], ['energy', T('에너지')], ['conf', T('자신감')], ['sleep', T('수면')],
  ['dep', T('우울')], ['anx', T('불안')], ['panic', T('공황')], ['psy', T('정신병적 증상')], ['si', T('죽고 싶은 생각')],
  ['period', T('생리')], ['appetite', T('식욕')], ['caffeine', T('카페인')], ['meds', T('약')],
  ['fx', T('부작용')], ['signs', T('들뜸 체크리스트')], ['note', T('메모')],
];
// 부작용: 그날 겪은 것을 눌러서 적는다 (entry.fx = { 열쇠: true })
// 목록에 없는 것은 직접 적어 넣을 수 있다: 열쇠가 'c:이름'이고, 적어 넣은 이름들은 settings.fxCustom에 남아 다음에도 딱지로 뜬다.
export const SIDE_EFFECTS = [
  ['sleepy', T('졸림')], ['nausea', T('메스꺼움')], ['dizzy', T('어지러움')], ['tremor', T('손 떨림')], ['drymouth', T('입 마름')], ['headache', T('두통')],
  ['rash', T('발진')], ['insomnia', T('잠이 안 옴')], ['restless', T('안절부절')], ['palpitation', T('두근거림')], ['constipation', T('변비')],
  ['appetiteUp', T('식욕 늘어남')], ['appetiteDown', T('식욕 줄어듦')],
];
// 부작용 열쇠의 이름, 그리고 그날 적은 부작용 이름들
const nameIn = (list) => (key) => (key.startsWith('c:') ? key.slice(2) : (list.find(([k]) => k === key) || [key, key])[1]);
const onKeys = (bag) => Object.keys(bag || {}).filter((k) => bag[k]);
export const fxName = nameIn(SIDE_EFFECTS), fxNames = (fx) => onKeys(fx).map(fxName);
// 정신병적 증상도 같은 방식
export const psyName = nameIn(PSYCH), psyNames = (psych) => onKeys(psych).map(psyName);
// 내 항목: 사용자가 설정에서 직접 만드는 기록 항목 (settings.custom = [{ id, name, type, unit }]). 그날 값은 entry.custom = { id: 값 }.
// type: 'check'(했음/안 했음 → true) · 'scale'(0~10) · 'number'(숫자, 단위는 unit)
export const CUSTOM_TYPES = [['check', T('했음 · 안 했음')], ['scale', T('0~10 정도')], ['number', T('숫자')]];
// 그날 값을 글로 (안 적었으면 '')
export const customText = (def, v) => (v == null || v === false || v === '' ? '' : def.type === 'check' ? T('했음') : def.type === 'number' ? `${v}${def.unit ? ` ${def.unit}` : ''}` : String(v));
// 네모 줄에 칠할 정도 (0~4): 했음은 3, 0~10은 높을수록 진하게, 숫자는 0보다 크면 3
export const customLevel = (def, v) => (v == null || v === false || v === '' ? 0 : def.type === 'scale' ? Math.ceil(v / 2.5) : v === true || v > 0 ? 3 : 0);
// 켜진 열쇠만 남긴다. 하나도 없으면 undefined (저장할 때 빈 칸을 남기지 않으려고)
export const onlyOn = (obj) => {
  const keys = Object.keys(obj || {}).filter((k) => obj[k]);
  return keys.length ? Object.fromEntries(keys.map((k) => [k, true])) : undefined;
};
// 죽고 싶은 생각이 이 단계(높음) 이상이면 오늘 화면에 상담전화를 조용히 보여 준다
export const SI_CARE_FROM = 3;
export const HELPLINE = '109';   // 자살예방상담전화 (한국, 24시간)
export const SIGNS = [
  ['lessSleep', T('적게 자도 안 피곤함')],
  ['talkative', T('말이 많아짐')],
  ['racing', T('생각이 빠르게 튐')],
  ['distract', T('주의가 쉽게 흩어짐')],
  ['projects', T('새로운 일·프로젝트에 몰두')],
  ['impulsive', T('충동적인 지출이나 결정')],
];
// 0~10 각 숫자에 붙는 이름
export const NAMES = EN ? {
  mood: ['Very low', 'Low', 'Down', 'A bit down', 'Slightly flat', 'Neutral', 'Slightly good', 'Good', 'Elevated', 'Very elevated', 'Extremely elevated'],
  energy: ['Empty', 'Almost none', 'Drained', 'Tired', 'A bit low', 'Normal', 'A bit lively', 'Energetic', 'Overflowing', 'Very high', 'Hard to contain'],
  appetite: ['None', 'Almost none', 'Poor', 'Low', 'A bit low', 'Normal', 'Good', 'Hearty', 'Strong', 'Constant', 'Insatiable'],
  caffeine: ['None', 'Very little', 'A little', 'A little', 'Moderate', 'Moderate', 'Quite a bit', 'A lot', 'A lot', 'Very high', 'Too much'],
  conf: ['Very withdrawn', 'Withdrawn', 'Unsure', 'A bit unsure', 'Slightly unsure', 'Normal', 'Slightly confident', 'Confident', 'Very confident', 'Can do anything', 'Unstoppable'],
} : {
  mood: ['바닥', '많이 우울', '우울', '가라앉음', '살짝 다운', '그럭저럭', '괜찮음', '좋음', '신남', '붕 뜸', '날아갈 듯'],
  energy: ['방전', '녹초', '기진맥진', '축 처짐', '좀 피곤', '보통', '괜찮음', '쌩쌩', '기운 넘침', '가만 못 있음', '멈출 수 없음'],
  appetite: ['전혀 없음', '거의 없음', '입맛 없음', '별로 안 당김', '조금 적음', '보통', '잘 먹음', '입맛 돎', '많이 당김', '계속 당김', '끝없이 당김'],
  caffeine: ['안 마심', '아주 조금', '조금', '조금', '적당히', '적당히', '꽤', '많이', '많이', '아주 많이', '과하게'],
  conf: ['완전 쭈그러듦', '많이 위축', '주눅 듦', '소심해짐', '살짝 자신 없음', '보통', '할 만함', '자신 있음', '자신만만', '뭐든 될 듯', '무적'],
};
export const nameOf = (key, v) => (v == null || !NAMES[key] ? '' : NAMES[key][Math.round(v)] || '');
// 정신건강의학과에서 자주 쓰는 약을 종류별로 묶은 것. 약 추가할 때 고르는 목록일 뿐, 복용 안내가 아니다.
// [열쇠, 종류 이름, [[한국에서 부르는 이름, 성분, 영어권 이름, 영어 성분], …]]
// 한국에 없는 약(애더럴, 바이반스 등)은 영어 이름을 소리 나는 대로 적었다. 영어 화면에서는 영어권 이름으로 보인다.
export const MED_GROUPS = [
  ['ad', T('항우울제'), [
    ['브린텔릭스', '보티옥세틴', 'Trintellix', 'vortioxetine'], ['렉사프로', '에스시탈로프람', 'Lexapro', 'escitalopram'], ['졸로푸트', '설트랄린', 'Zoloft', 'sertraline'],
    ['프로작', '플루옥세틴', 'Prozac', 'fluoxetine'], ['팍실', '파록세틴', 'Paxil', 'paroxetine'], ['세로자트', '파록세틴', 'Seroxat', 'paroxetine'], ['씨프람', '시탈로프람', 'Celexa', 'citalopram'],
    ['듀미록스', '플루복사민', 'Luvox', 'fluvoxamine'], ['이팩사', '벤라팍신', 'Effexor', 'venlafaxine'], ['프리스틱', '데스벤라팍신', 'Pristiq', 'desvenlafaxine'], ['심발타', '둘록세틴', 'Cymbalta', 'duloxetine'],
    ['익셀', '밀나시프란', 'Savella', 'milnacipran'], ['웰부트린', '부프로피온', 'Wellbutrin', 'bupropion'], ['레메론', '미르타자핀', 'Remeron', 'mirtazapine'], ['트리티코', '트라조돈', 'Desyrel', 'trazodone'],
    ['발독산', '아고멜라틴', 'Valdoxan', 'agomelatine'], ['스타브론', '티아넵틴', 'Stablon', 'tianeptine'], ['에나폰', '아미트립틸린', 'Elavil', 'amitriptyline'], ['센시발', '노르트립틸린', 'Pamelor', 'nortriptyline'],
    ['그로민', '클로미프라민', 'Anafranil', 'clomipramine'], ['비브리드', '빌라조돈', 'Viibryd', 'vilazodone'], ['스프라바토', '에스케타민', 'Spravato', 'esketamine'], ['오벨리티', '덱스트로메토르판·부프로피온', 'Auvelity', 'dextromethorphan-bupropion'],
  ]],
  ['anx', T('항불안제'), [
    ['알프람', '알프라졸람', 'Alpram', 'alprazolam'], ['자낙스', '알프라졸람', 'Xanax', 'alprazolam'], ['아티반', '로라제팜', 'Ativan', 'lorazepam'], ['리보트릴', '클로나제팜', 'Rivotril', 'clonazepam'],
    ['클로노핀', '클로나제팜', 'Klonopin', 'clonazepam'], ['바리움', '디아제팜', 'Valium', 'diazepam'], ['데파스', '에티졸람', 'Depas', 'etizolam'], ['그란닥신', '토피소팜', 'Grandaxin', 'tofisopam'],
    ['부스파', '부스피론', 'Buspar', 'buspirone'], ['인데놀', '프로프라놀롤', 'Inderal', 'propranolol'], ['유시락스', '히드록시진', 'Vistaril', 'hydroxyzine'],
  ]],
  ['sleep', T('수면제'), [
    ['스틸녹스', '졸피뎀', 'Stilnox', 'zolpidem'], ['앰비엔', '졸피뎀', 'Ambien', 'zolpidem'], ['졸피드', '졸피뎀', 'Zolpid', 'zolpidem'], ['할시온', '트리아졸람', 'Halcion', 'triazolam'],
    ['조피스타', '에스조피클론', 'Lunesta', 'eszopiclone'], ['사일레노', '독세핀', 'Silenor', 'doxepin'], ['서카딘', '멜라토닌', 'Circadin', 'melatonin'], ['벨솜라', '수보렉산트', 'Belsomra', 'suvorexant'],
    ['데이비고', '렘보렉산트', 'Dayvigo', 'lemborexant'], ['쿠비빅', '다리도렉산트', 'Quviviq', 'daridorexant'],
  ]],
  ['mood', T('기분조절제'), [
    ['리단', '리튬', 'Lithium', 'lithium'], ['데파코트', '발프로산', 'Depakote', 'valproate'], ['데파킨', '발프로산', 'Depakine', 'valproate'], ['오르필', '발프로산', 'Orfiril', 'valproate'],
    ['라믹탈', '라모트리진', 'Lamictal', 'lamotrigine'], ['테그레톨', '카르바마제핀', 'Tegretol', 'carbamazepine'], ['트리렙탈', '옥스카르바제핀', 'Trileptal', 'oxcarbazepine'], ['토파맥스', '토피라메이트', 'Topamax', 'topiramate'],
  ]],
  ['ap', T('항정신병약'), [
    ['아빌리파이', '아리피프라졸', 'Abilify', 'aripiprazole'], ['쎄로켈', '쿠에티아핀', 'Seroquel', 'quetiapine'], ['쿠에타핀', '쿠에티아핀', 'Quetapin', 'quetiapine'], ['자이프렉사', '올란자핀', 'Zyprexa', 'olanzapine'],
    ['리스페달', '리스페리돈', 'Risperdal', 'risperidone'], ['인베가', '팔리페리돈', 'Invega', 'paliperidone'], ['라투다', '루라시돈', 'Latuda', 'lurasidone'], ['렉설티', '브렉스피프라졸', 'Rexulti', 'brexpiprazole'],
    ['브레일라', '카리프라진', 'Vraylar', 'cariprazine'], ['캐플리타', '루마테페론', 'Caplyta', 'lumateperone'], ['클로자릴', '클로자핀', 'Clozaril', 'clozapine'], ['젤독스', '지프라시돈', 'Geodon', 'ziprasidone'],
    ['솔리안', '아미설프리드', 'Solian', 'amisulpride'], ['로도핀', '조테핀', 'Lodopin', 'zotepine'], ['할로페리돌', '할로페리돌', 'Haldol', 'haloperidol'],
    ['아빌리파이 메인테나', '아리피프라졸 주사', 'Abilify Maintena', 'aripiprazole injection'], ['인베가 서스티나', '팔리페리돈 주사', 'Invega Sustenna', 'paliperidone injection'],
  ]],
  ['adhd', T('ADHD 약'), [
    ['콘서타', '메틸페니데이트', 'Concerta', 'methylphenidate'], ['메디키넷', '메틸페니데이트', 'Medikinet', 'methylphenidate'], ['페니드', '메틸페니데이트', 'Penid', 'methylphenidate'],
    ['비스펜틴', '메틸페니데이트', 'Bisphentin', 'methylphenidate'], ['리탈린', '메틸페니데이트', 'Ritalin', 'methylphenidate'], ['포칼린', '덱스메틸페니데이트', 'Focalin', 'dexmethylphenidate'],
    ['애더럴', '암페타민', 'Adderall', 'amphetamine'], ['바이반스', '리스덱스암페타민', 'Vyvanse', 'lisdexamfetamine'], ['스트라테라', '아토목세틴', 'Strattera', 'atomoxetine'], ['큐엘브리', '빌록사진', 'Qelbree', 'viloxazine'],
    ['인튜니브', '구안파신', 'Intuniv', 'guanfacine'], ['켑베이', '클로니딘', 'Kapvay', 'clonidine'], ['프로비질', '모다피닐', 'Provigil', 'modafinil'], ['누비질', '아모다피닐', 'Nuvigil', 'armodafinil'],
  ]],
  ['etc', T('그 밖에'), [
    ['뉴론틴', '가바펜틴', 'Neurontin', 'gabapentin'], ['리리카', '프레가발린', 'Lyrica', 'pregabalin'], ['레비아', '날트렉손', 'Revia', 'naltrexone'], ['아캄프롤', '아캄프로세이트', 'Campral', 'acamprosate'],
  ]],
];
export const CATALOG = MED_GROUPS.flatMap(([, , list]) => list);
// 잠에 영향을 주는 약의 성분 (안정제·수면제). 전날 이런 약을 체크했으면 그날 밤 잠은 '약 먹고 잔 밤'으로 본다.
// 이름이 한국 이름이든 영어권 이름이든 성분으로 찾는다.
export const SEDATIVE_GENERICS = ['알프라졸람', '로라제팜', '클로나제팜', '디아제팜', '에티졸람', '졸피뎀', '트리아졸람', '에스조피클론', '독세핀', '멜라토닌', '수보렉산트', '렘보렉산트', '다리도렉산트'];
// 카페인은 마신 것을 개수로 적는다. mg는 대략적인 값 (제품·크기에 따라 다름).
export const DRINKS = [['monster', T('몬스터'), 100], ['coffee', T('커피'), 150], ['cola', T('콜라'), 35]];
export const cafMg = (dr) => DRINKS.reduce((sum, [k, , mg]) => sum + ((dr && dr[k]) || 0) * mg, 0);
export const cafScore = (dr) => Math.min(10, Math.round(cafMg(dr) / 40));   // 400mg 이상이면 10
export const drinkText = (dr) => DRINKS.filter(([k]) => dr && dr[k]).map(([k, name]) => `${name} ${dr[k]}`).join(' · ');
export const SIGN_THRESHOLD = 7;
export const isHigh = (d) => d.mood >= SIGN_THRESHOLD || d.energy >= SIGN_THRESHOLD || (d.conf != null && d.conf >= SIGN_THRESHOLD);
export const FONTS = {
  system: [T('기본'), '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif'],
  // 아래 셋은 앱에 넣어 둔 글꼴 파일(mood/fonts)을 쓴다. 고르면 그때 내려받는다.
  pretendard: ['Pretendard', '"Pretendard Variable", -apple-system, "Apple SD Gothic Neo", sans-serif'],
  dodum: [T('고운돋움'), '"Gowun Dodum", -apple-system, "Apple SD Gothic Neo", sans-serif'],
  batang: [T('고운바탕'), '"Gowun Batang", "AppleMyungjo", serif'],
};
export const SIZES = { s: [T('작게'), 1], m: [T('보통 '), 1.12], l: [T('크게'), 1.25], xl: [T('아주 크게'), 1.4] };

// 병원·상담에 다니는 사람에게만 필요한 기록 항목들. "병원 · 상담용 기능"을 끄면 같이 꺼지고, 켜면 같이 켜진다.
export const CARE_ITEMS = ['dep', 'anx', 'panic', 'psy', 'si', 'meds', 'fx', 'signs'];

export const DISCLAIMER = T('이 앱은 진단 도구가 아니에요. 내 상태를 기록해 두는 참고용이에요.');
