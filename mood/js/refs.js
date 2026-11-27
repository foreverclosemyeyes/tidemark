// 근거 노트: AI 분석이 같이 읽는, 미리 확인해 둔 진료 지침·문헌고찰 요약 (사용자가 요청, 2026-11-27).
// 분석할 때마다 웹에서 찾아보면 2~4분이 걸려서, 찾아 둔 것을 앱에 넣어 두고 그것을 바탕으로 쓰게 한다.
// 아래 내용은 REFS_DATE에 각 자료의 원문(또는 초록)을 직접 받아 읽고 확인한 것만 적었다. 기억으로 채우지 않는다.
// 고칠 때: 자료를 다시 찾아 읽고, 확인한 문장만 넣고, REFS_DATE를 그날로 바꾼다. 지침은 개정되므로 반년에 한 번쯤 다시 본다.
// 확인하지 못해 뺀 것: DSM-5-TR 원문(지침이 옮겨 적은 DSM-5 기준으로 대신함), 혼재성 양상의 증상 개수, 공황발작의 정식 정의(13개 중 4개), PMDD의 DSM 기준 전체.

export const REFS_DATE = '2026-11-27';

// [기관·자료 이름과 연도]를 문장 끝에 붙였다. AI는 이 이름과 연도로 출처를 적는다.
export const REFS = `조울(양극성) 삽화의 기준
- 조증 삽화(DSM-5): 비정상적으로 들뜨거나 과민한 기분과 함께 활동·에너지가 늘어난 상태가 하루 대부분, 거의 매일, 1주 이상 이어진다(입원이 필요하면 더 짧아도 됨). 여기에 자존감 팽창, 잠이 덜 필요함, 말이 많아짐, 생각이 빨리 달림, 산만함, 목표 지향 활동 증가나 초조, 위험한 일에 지나치게 빠짐 가운데 3가지 이상(기분이 과민하기만 하면 4가지)이 있어야 한다. [CANMAT·ISBD 양극성장애 지침 2018]
- 경조증(DSM-5): 기준은 조증과 비슷하되 평소와 다른 모습이 남의 눈에도 보이고 4일 이상 연달아 이어지며, 심한 기능 손상·입원·정신병적 증상은 없다. 2형 양극성장애는 경조증 삽화와 우울 삽화가 각각 한 번 이상 있고 조증 삽화는 없어야 한다. [CANMAT·ISBD 2018]
- 우울로 온 성인에게는 예전에 지나치게 활동적이거나 억제가 풀린 시기가 있었는지 묻고, 그것이 4일 이상 이어졌다면 전문 진료 의뢰를 고려한다. [NICE CG185, 2014·2025 개정]
- 주요우울 삽화(DSM-5): 같은 2주 동안 9가지 증상 중 5가지 이상(우울한 기분 또는 흥미·즐거움 상실 중 하나는 반드시 포함)이 하루 대부분, 거의 매일 있고 뚜렷한 고통이나 기능 저하가 있다. 9가지에는 수면 문제(불면·과수면), 피로, 정신운동 변화, 무가치감·죄책감, 집중 저하, 식욕·체중 변화, 죽음이나 자살에 대한 반복되는 생각이 들어간다. [NICE NG222, 2022]
- 보통의 기분 변화는 대개 며칠이 아니라 몇 시간 이어지고 행동·기능의 큰 변화가 따르지 않는다. 양극성의 기분 삽화는 며칠에서 몇 주 이어진다. [미국정신의학회(APA) 안내, 2024 검토]
- 혼재성 양상: DSM-5는 "혼재성 삽화" 대신 "혼재성 양상" 명시자를 두었고, 조증·경조증·우울 삽화 모두에 붙을 수 있다(우울 삽화에 기준 미만의 조증·경조증 증상이 같이 있는 경우 포함). [CANMAT·ISBD 2018; CANMAT 우울증 지침 2023]
- 혼재성 양상이 있는 우울 삽화는 단기 자살 위험이 특히 높은 시기로 기술된다. 양극성장애의 자살 사망·시도의 70% 이상이 우울 시기에 일어난다. [CANMAT·ISBD 2018]
- 급속 순환: 한 해에 기분 삽화가 4번 이상인 경과. 갑상선기능저하, 항우울제 사용, 물질 남용과 자주 같이 보인다. [CANMAT·ISBD 2018]
- 순환성 장애: 2년 이상, 삽화 기준에는 못 미치는 경조증·우울 증상의 시기가 절반 이상의 날에 있고 2달 넘게 없었던 적이 없다. [APA 안내, 2024 검토]
- 양극성장애가 있는 사람은 삶의 절반가량을 증상(특히 기준 미만의 우울 증상)과 함께 보내며, 남아 있는 증상은 다음 삽화의 위험을 높인다. [CANMAT·ISBD 2018]

조울의 앞선 신호, 잠, 생활 리듬
- 문헌고찰(17개 연구): 기분장애가 있는 사람의 80% 이상이 삽화에 앞선 신호를 하나 이상 알아챈다. 조증의 앞선 신호는 우울의 것보다 더 자주 알아채고, 가장 일관된 조증의 앞선 신호는 수면 변화(중앙값 77%)다. 우울의 앞선 신호는 일관되지 않다. 조증 전구기는 평균 20일보다 길었다. 전향 연구는 적다. [Jackson 등, J Affect Disord 2003]
- 재발 방지 계획에는 개인적 유발 요인과 재발의 조기 경고 신호를 담고, 심리 프로그램에는 기분·생각·행동의 자기 관찰을 넣는다. [NICE CG185]
- 조기 경고 신호를 알아채도록 가르치면 첫 재발까지의 시간이 길어졌다(위험비 0.57). 우울·경조증 증상 수준은 차이가 없었다. [Cochrane 2007]
- 삽화 사이 시기에도 양극성장애가 있는 성인은 대조군보다 잠이 나빴고, 잠드는 데 걸리는 시간, 자다 깨는 시간, 수면·기상 시각의 들쭉날쭉함이 가장 일관되게 달랐다. [Ng 등, Sleep Med Rev 2015 메타분석]
- 일주기 리듬의 흐트러짐은 양극성장애와 관련되지만 이 병에만 있는 것은 아니다(다른 정신과 상태에서도 보임). [ISBD 시간생물학 태스크포스 2022]
- 양극성장애 교육에는 우울·조증의 전구 증상 알아채기, 자고 일어나는 시각 고르게 하기, 규칙적 운동, 술·담배·카페인 같은 자극제 줄이기가 들어간다. [CANMAT·ISBD 2018] 규칙적인 잠, 신체 활동, 스트레스 줄이기, 기분 관찰이 도움이 된다. [WHO 2026]
- 밤마다 수면이 들쭉날쭉한 정도가 클수록 양극성·단극성 우울 증상, 스트레스, 불면 증상과 가장 일관되게 관련됐다. 다만 연구들이 체계적이지 않았다. [Bei 등, Sleep Med Rev 2016 문헌고찰]

항우울제와 기분 전환
- 항우울제를 먹는 중에 조증·경조증이 생기면 항우울제 중단을 고려한다. [NICE CG185] 1형 양극성 우울에 항우울제 단독은 쓰지 않는다. [CANMAT·ISBD 2018]
- 양극성장애에서 항우울제의 근거는 약하고, 큰 우려는 경조증·조증·혼재 상태로의 전환이다. SSRI와 부프로피온은 삼환계·SNRI보다 전환이 적을 수 있고, 전환은 2형보다 1형에서 더 잦고 심해 보인다. [ISBD 태스크포스 2013]
- 메타분석: 항우울제와 관련된 기분 상승은 단기 시험에서 1형 14.2%, 2형 7.1%였고, 2형 8.1% 대 주요우울장애 1.5%였다. 주요우울장애와 2형에서는 거의 경조증이었다. [Bond 등, J Clin Psychiatry 2008]
- 우울로 치료받던 사람에게 항우울제로 조증 증상이나 급속 순환이 생긴 것은 양극성을 의심할 단서 중 하나다. 다른 단서: 이른 발병, 자주 되풀이되는 우울, 양극성 가족력, 정신병적 양상, 과수면 같은 비전형 증상. [CANMAT·ISBD 2018]
- 혼재성 양상이 있는 우울에 항우울제를 시작할 때는 초조·자살 생각 증가 같은 활성화 부작용과 조증·경조증 전환을 가까이 살핀다. [CANMAT 2023]

기분 기록(자기 관찰)의 쓸모와 한계
- 기분과 잠·기능을 꾸준히 살피는 것이 권장되고, 날마다 적는 기분 일지는 재발의 조기 신호를 찾고 기분과 치료·생활 요인의 관계를 보는 데 도움이 될 수 있다. 다만 꾸준히 적는 것이 부담이 될 수 있다. [CANMAT·ISBD 2018]
- 문헌고찰(13개 연구): 전자 기기로 스스로 적은 기분은 임상가의 우울 척도와는 6개 연구 중 6개에서 맞았지만, 조증 척도와는 7개 중 2개에서만 맞았다. 스스로 적은 기분은 우울에는 타당해 보이나 조증에는 그렇지 않다. [BMC Psychiatry 2016]
- 2026년 문헌고찰(42개 연구): 스스로 입력하는 평가 일부는 임상 척도와 잘 맞았지만 측정 방식이 제각각이라 단정하기 어렵고, 자동으로 모으는 수동 측정의 타당도·신뢰도는 확립되지 않았다. [Int J Bipolar Disord 2026]
- 기분을 기록하는 일을 많은 사람이 도움이 된다고 느꼈지만, 부정적인 영향을 말한 사람도 많았다. [NPJ Digit Med 2025 메타종합]

우울증: 치료 반응을 보는 시간
- 항우울제는 듣는다면 보통 4주 안에 효과가 보인다. 첫 점검은 보통 2주 안, 18~25세이거나 자살 위험이 걱정되면 시작(또는 증량) 1주 뒤다. [NICE NG222]
- 치료 용량으로 4주가 지나도 전혀 반응이 없으면 이유와 다음 단계를 의논한다. [NICE NG222]
- 2~4주 안의 초기 호전(척도 20% 이상 감소)이 없으면 이후에도 반응이 없을 가능성이 높아, 4주까지 초기 호전이 없으면 증량이나 교체를 고려한다. 실제 진료에서는 항우울제 단독으로 8주 뒤 절반가량이 반응하고 3분의 1가량이 관해된다. [CANMAT 2023]
- 자료마다 표현이 다르다: NICE는 "4주 안", CANMAT은 2~4주, 메타분석 하나는 첫 2주의 호전이 이미 예측력이 있다고 본다. [NICE NG222; CANMAT 2023; Szegedi 등 2009]
- 갑자기 끊거나 빼먹거나 덜 먹으면 금단 증상(수면 문제 포함)이 생길 수 있고, 며칠 안에 나타나 보통 1~2주 안에 가라앉지만 심할 때도 있다. 재발은 약을 끊거나 줄이자마자 바로 오는 것이 보통은 아니다. [NICE NG222]
- 항우울제 초기에는 자살 생각·자해가 늘 수 있음을 염두에 둔다. [NICE NG222]
- 수면 문제는 우울 삽화의 흔한 증상이면서 우울이 생길 위험도 높인다. [CANMAT 2023] 우울하지 않은 사람도 불면이 있으면 우울이 생길 위험이 약 2배다. [Baglioni 등, J Affect Disord 2011 메타분석]
- 재발이 더 잦은 경우: 되풀이된 삽화(특히 최근 2년 안), 불완전한 반응이나 남은 증상, 회피·반추 같은 대처, 심한 우울, 이어지는 스트레스. 앞서 나빠지기 전에 있었던 불안이나 잠 문제 같은 경고 신호를 찾아 둔다. [NICE NG222]

약: 순응도와 바꾼 뒤 보는 시간 (양극성)
- 양극성장애 환자의 절반까지가 처방대로 약을 먹지 않고, 알아채지 못한 비순응은 "약이 안 듣는 것"으로 잘못 보일 수 있다. 리튬을 끊은 사람의 50~90%가 3~5달 안에 재발하며, 빨리 끊을수록 위험이 크다. [CANMAT·ISBD 2018]
- 조증: 항조증 약의 반응은 1~2주 안에 어느 정도 보인다. 양극성 우울: 2주 뒤의 초기 호전이 전체 반응을 꽤 예측하고, 없으면 반응이 없을 가능성이 높다(라모트리진은 천천히 올리므로 예외). 치료를 바꾸기 전에 용량과 순응도를 확인한다. [CANMAT·ISBD 2018]
- 치료 중에도 해마다 19~25%가 재발한다. 위험 요인: 이른 발병, 정신병적 양상, 급속 순환, 많은 과거 삽화, 불안·물질 사용 동반. 스트레스가 적고 사회적 지지가 있으면 보호가 된다. [CANMAT·ISBD 2018]

불안, 공황, 카페인
- 공황장애: 예기치 않은 공황발작이 되풀이되고, 또 올까 하는 걱정이나 피하려는 행동 변화가 1달 이상 이어진다. 공황발작 한 번이 곧 공황장애는 아니다. 발작은 몇 분에서 한 시간쯤 이어질 수 있고 자다가도 온다. [NIMH 2025; NICE CG113]
- 공황발작은 우울증이나 PTSD 같은 다른 상태에서도 올 수 있다. [APA 안내, 2026 검토]
- 공황장애에 새 약을 시작하면 2주 안에, 이어 4·6·12주에 효과와 부작용을 보고 12주에 효과를 판단한다. SSRI·SNRI는 초기에 불안·초조·수면 문제가 늘 수 있다. [NICE CG113, 2011·2020 개정]
- 메타분석(9개 연구): 공황장애 환자의 51.1%가 카페인 투여 뒤 공황발작을 겪었고 위약 뒤에는 없었다. 용량은 400~750mg(커피 5잔쯤)였고 480mg 미만은 잘 알려져 있지 않다. [Klevebrant·Frick, Gen Hosp Psychiatry 2022]
- 정신과 질환이 없는 사람에서도 카페인은 불안 증가와 관련됐고 400mg을 넘으면 더 컸다. [Front Psychol 2024 메타분석]
- 양극성장애에서 카페인: 지침은 줄이라고 하지만 근거는 결론적이지 않다. 카페인이 갑자기 늘어난 뒤 조증 증상이 올 수 있으나, 늘어난 섭취가 다가오는 조증의 결과나 전구 신호일 수도 있다. [Frigerio 등, Bipolar Disord 2021 문헌고찰]

생리 주기
- 월경전불쾌감장애(PMDD): 증상이 생리 전 마지막 주에 있고, 생리가 시작되고 며칠 안에 나아지기 시작해 생리 뒤 주에는 거의 없다. 진단에는 날마다 적은 기록으로의 전향적 확인이 필요하고, 원래 있던 우울·불안이 심해진 것은 구분해야 한다. [DSM-5 작업반, Epperson 등 2012]
- 월경전 장애는 최소 두 주기 동안 날마다 평가해 확인한다. [ISPMD 합의 2011·2016]
- 월경전 악화(PME): 원래 있던 정신과 질환이 황체기에 더 심해지는 것. 증상의 종류는 주기 내내 비슷하고 생리 전에 강도만 뚜렷이 커진다. [ISPMD 합의 2011]
- 전향 연구 35개의 문헌고찰: 생리 전후 악화의 근거가 뚜렷한 것은 정신병적 장애, 공황장애, 섭식장애, 우울증, 경계성 성격장애이고 불안은 덜 일관되며 양극성장애는 양상이 다르다. 전체 근거는 엇갈린다. [Nolan·Hughes, Arch Womens Ment Health 2022]
- 양극성장애에서 생리 전 악화가 있는 여성은 증상이 많고 재발이 잦은 경과를 보이기 쉽다. 양극성장애에 PMDD를 같이 진단하려면 안정기에 2달 이상 날마다 기록해 본다. [CANMAT·ISBD 2018]

죽고 싶은 생각
- 위험 평가 도구나 척도로 앞으로의 자살·자해를 예측하지 않고, 위험을 낮음·중간·높음으로 나누어 치료 여부를 정하지 않는다. 그 사람에게 필요한 것과 안전을 어떻게 도울지에 집중한다. [NICE NG225, 2022]
- 안전 계획은 본인과 함께 만든다: 힘들어지는 계기와 경고 신호, 나만의 대처법, 기댈 사람과 장소, 연락할 곳(야간 포함), 위험한 수단 멀리하기. 계획은 본인이 지닌다. [NICE NG225]
- 자살 생각을 물어본다고 해서 자살 생각이 늘었다는 연구는 없었고, 말하는 것이 오히려 줄일 수 있다. [Dazzi 등, Psychol Med 2014 문헌고찰]
- 메타분석(39개 연구): 수면 문제는 자살 생각·시도·자살의 위험 증가와 관련됐고, 우울을 감안해도 관련이 남았다. [Pigeon 등, J Clin Psychiatry 2012]

기분 기복처럼 보일 수 있는 다른 상태 (ADHD, 경계성 성격장애)
- 경계성 성격장애, 물질 사용 장애, ADHD의 증상은 경조증·조증과 많이 겹치고, 양극성장애로 잘못 진단되기도 하며 같이 있는 일도 잦다. [CANMAT·ISBD 2018; NICE CG185]
- ADHD는 이어지는 상태이고 양극성장애는 삽화로 온다. 산만함·과활동 같은 겹치는 증상은 들뜨거나 과민한 시기에 더 심해질 때만 조증·경조증 쪽으로 센다(소아·청소년 부분의 서술). [CANMAT·ISBD 2018]
- 성인 ADHD의 감정 증상은 일상 사건에 반응해 짧게 과장되게 변하고 몇 시간 안에 평소로 돌아오는 경향이 있다. 양극성의 우울·고양 같은 극단이 아니라, 조절이 서툰 보통 범위의 기분이다. [유럽 성인 ADHD 합의문 2019]
- 경계성 성격장애는 대인 관계 스트레스에 반응한 일시적인 기분 변화가 특징이고, 양극성장애는 지속되는 기분 변화와 관련된다. 경계성에서는 진짜 고양감이나 오래 잘 지내는 시기가 매우 드물다. 2형과 가르는 데는 가족력, 발달 과정, 경과, 기분 상태의 양상이 중요하고 충동성은 덜 가른다. [Paris·Black 2015; Bayes 등 2019; CANMAT·ISBD 2018]

술
- 술은 모든 용량에서 잠드는 시간을 줄이고 밤 전반의 잠을 깊게 하지만 후반의 잠을 흐트러뜨린다. [Ebrahim 등, Alcohol Clin Exp Res 2013 문헌고찰]
- 알코올 사용 장애와 주요우울증은 서로의 위험을 2배가량 높이고, 더 그럴듯한 방향은 알코올 사용 장애가 우울 위험을 높이는 쪽이다. [Boden·Fergusson, Addiction 2011 메타분석]
- 양극성장애에 물질 사용 장애가 같이 있으면 관해가 적고 입원과 자살 시도가 많다. 술·담배·약물이 치료 효과를 방해할 수 있음을 이야기한다. [CANMAT·ISBD 2018; NICE CG185]`;

// 화면에 보여 줄 자료 목록 (노트에 쓴 것만). 논문은 PubMed·PMC 주소로 적는다.
const pm = (id) => `https://pubmed.ncbi.nlm.nih.gov/${id}/`, pmc = (id) => `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`;
export const REFS_SOURCES = [
  { title: 'NICE CG185 · Bipolar disorder: assessment and management (2014, 2025 개정)', url: 'https://www.nice.org.uk/guidance/cg185/chapter/Recommendations' },
  { title: 'NICE NG222 · Depression in adults: treatment and management (2022)', url: 'https://www.nice.org.uk/guidance/ng222/chapter/Recommendations' },
  { title: 'NICE NG225 · Self-harm: assessment, management and preventing recurrence (2022)', url: 'https://www.nice.org.uk/guidance/ng225/chapter/Recommendations' },
  { title: 'NICE CG113 · Generalised anxiety disorder and panic disorder in adults (2011, 2020 개정)', url: 'https://www.nice.org.uk/guidance/cg113/chapter/Recommendations' },
  { title: 'CANMAT · ISBD 2018 guidelines for the management of patients with bipolar disorder', url: pmc('PMC5947163') },
  { title: 'CANMAT 2023 Update on Clinical Guidelines for Management of Major Depressive Disorder in Adults', url: pmc('PMC11351064') },
  { title: 'ISBD task force report on antidepressant use in bipolar disorders (2013)', url: pm(24030475) },
  { title: 'ISBD task force on chronobiology: circadian rhythm disruption in bipolar disorder (2022)', url: pmc('PMC9149148') },
  { title: 'WHO fact sheet · Bipolar disorder (2026)', url: 'https://www.who.int/news-room/fact-sheets/detail/bipolar-disorder' },
  { title: 'American Psychiatric Association · What Are Bipolar Disorders? (2024 검토)', url: 'https://www.psychiatry.org/patients-families/bipolar-disorders/what-are-bipolar-disorders' },
  { title: 'American Psychiatric Association · What are Anxiety Disorders? (2026 검토)', url: 'https://www.psychiatry.org/patients-families/anxiety-disorders/what-are-anxiety-disorders' },
  { title: 'NIMH · Panic Disorder: When Fear Overwhelms (2025)', url: 'https://www.nimh.nih.gov/health/publications/panic-disorder-when-fear-overwhelms' },
  { title: 'Jackson 등 · A systematic review of manic and depressive prodromes (2003)', url: pm(12738039) },
  { title: 'Cochrane · Interventions for helping people recognise early signs of recurrence in bipolar disorder (2007)', url: pm(17253526) },
  { title: 'Ng 등 · Sleep-wake disturbance in interepisode bipolar disorder: meta-analysis (2015)', url: pm(25060968) },
  { title: 'Bei 등 · Daily intraindividual variability of sleep/wake patterns: systematic review (2016)', url: pm(26588182) },
  { title: 'Bond 등 · Antidepressant-associated mood elevations: meta-analysis (2008)', url: pm(19192442) },
  { title: 'Electronic self-monitoring of mood in bipolar disorder: systematic review (BMC Psychiatry 2016)', url: pmc('PMC4714425') },
  { title: 'Ambulatory assessment and mood monitoring in bipolar disorder: systematic review (Int J Bipolar Disord 2026)', url: pmc('PMC12852565') },
  { title: 'User experience of mood monitoring in depression: meta-synthesis (NPJ Digit Med 2025)', url: pmc('PMC12672782') },
  { title: 'Szegedi 등 · Early improvement in the first 2 weeks as a predictor of treatment outcome (2009)', url: pm(19254516) },
  { title: 'Baglioni 등 · Insomnia as a predictor of depression: meta-analysis (2011)', url: pm(21300408) },
  { title: 'Klevebrant · Frick · Caffeine, anxiety and panic attacks in panic disorder: meta-analysis (2022)', url: pm(34871964) },
  { title: 'Caffeine intake and anxiety: a meta-analysis (Front Psychol 2024)', url: pmc('PMC10867825') },
  { title: 'Frigerio 등 · Caffeine consumption in bipolar disorder: systematic review (2021)', url: pm(32949106) },
  { title: 'Epperson 등 · Premenstrual dysphoric disorder: evidence for a new category for DSM-5 (2012)', url: pmc('PMC3462360') },
  { title: 'ISPMD Montreal consensus on premenstrual disorders (2011)', url: pmc('PMC4134928') },
  { title: 'ISPMD fourth consensus: standards for diagnosis and management (2016)', url: pm(27378473) },
  { title: 'Nolan · Hughes · Premenstrual exacerbation of mental health disorders: systematic review (2022)', url: pm(35867164) },
  { title: 'Dazzi 등 · Does asking about suicide induce suicidal ideation? (2014)', url: pm(24998511) },
  { title: 'Pigeon 등 · Sleep disturbance and suicidal thoughts and behaviors: meta-analysis (2012)', url: pm(23059158) },
  { title: 'Kooij 등 · Updated European Consensus Statement on adult ADHD (2019)', url: 'https://www.cambridge.org/core/product/identifier/S092493380000910X/type/journal_article' },
  { title: 'Paris · Black · Borderline personality disorder and bipolar disorder (2015)', url: pm(25536097) },
  { title: 'Bayes 등 · Differential diagnosis of bipolar II disorder and borderline personality disorder (2019)', url: pm(31749106) },
  { title: 'Ebrahim 등 · Alcohol and sleep I: effects on normal sleep (2013)', url: pm(23347102) },
  { title: 'Boden · Fergusson · Alcohol and depression (2011)', url: pm(21382111) },
];
