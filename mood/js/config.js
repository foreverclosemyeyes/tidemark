// 저장 열쇠 이름과 앱 버전
// 앱 이름은 Tidemark로 바뀌었지만 열쇠는 그대로 둔다 (바꾸면 쓰던 사람의 기록이 안 보이게 된다)
export const KEY = 'tide.v1', OLD_KEY = 'harugyeol.v1';

// 설정 화면 맨 아래에 보이는 번호. 올릴 때마다 sw.js의 CACHE 숫자와 같이 하나 올린다.
export const VERSION = 125;

// 방문 수 세기 (count.js): 신호를 받는 주소, 세는 배포 주소, 오늘 이미 보냈는지 적어 두는 열쇠
export const COUNT_URL = 'https://tide-mark.goatcounter.com/count', COUNT_HOST = 'foreverclosemyeyes.github.io', COUNT_KEY = 'tide.count';

// AI 분석 (ai.js): 사용자가 넣은 API 키와 마지막으로 받은 풀이를 두는 열쇠. 기록(KEY)과 따로 두어서 백업 파일에 들어가지 않는다.
export const AI_KEY = 'tide.aikey', AI_OUT = 'tide.ai';
