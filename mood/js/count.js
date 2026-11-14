// 방문 수 세기: 앱을 연 날에 하루 한 번 "열었다"는 신호만 GoatCounter로 보낸다 (사용자가 몇 명이 쓰는지 보고 싶어 해서 넣음, 2026-11-14).
// 기록 내용은 보내지 않는다. 남의 스크립트를 앱에 불러오지 않고(불러오면 폰에 저장된 기록을 읽을 수 있다) 1×1 그림 요청만 보낸다.
// 앱 주인의 폰은 뺄 수 있다: 설정 맨 아래의 버전 글자를 다섯 번 누르면 settings.noCount가 켜진다 (화면에 스위치는 없다).
import { COUNT_HOST, COUNT_KEY, COUNT_URL } from './config.js';
import { today } from './dates.js';
import { db } from './store.js';

// host: 지금 주소. 실제로 배포된 주소에서만 센다 (내 컴퓨터에서 시험할 때는 세지 않는다).
export function countVisit(host = location.hostname) {
  if (host !== COUNT_HOST || db.settings.noCount || !navigator.onLine) return;
  try {
    if (localStorage.getItem(COUNT_KEY) === today()) return;
    localStorage.setItem(COUNT_KEY, today());
  } catch (e) { return; }
  new Image().src = `${COUNT_URL}?p=${encodeURIComponent('/mood/')}&rnd=${Date.now()}`;
}
