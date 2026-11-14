// 앱 전체를 아이폰 크기 화면으로 띄워서 주요 흐름이 깨지지 않았는지 확인한다.
// 실행: node mood/tests/smoke.js   (playwright가 설치된 환경에서)
// 고칠 때마다 돌리고, 기능을 더하면 여기에 확인을 한 줄 더한다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const KEY = 'tide.v1';
const HANGUL = /[가-힣]/;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let failed = 0;
const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail == null ? '' : ` — ${detail}`}`); };

// 오늘 기준 n일 전 날짜 (앱과 같은 방식: 기기 시각)
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// 최근 5일은 들뜨고 잠이 준 30일치 연습 기록
function seed() {
  const entries = {};
  for (let i = 1; i < 30; i++) {
    const hot = i < 6, date = dayAgo(i);
    entries[date] = { date, mood: hot ? 8 : (i % 7 < 2 ? 3 : 5), energy: hot ? 9 : i % 5, conf: hot ? 9 : 5, dep: hot ? 0 : (i % 7 < 2 ? 3 : 1), elev: hot ? 3 : 0, anx: 1,
      sleepMin: hot ? 270 : 430 + (i % 4) * 15, tired: !hot && i % 3 === 0, period: i >= 18 && i < 23, appetite: i % 4 === 0 ? 3 : 6, caffeine: i % 4 === 0 ? 8 : 3,
      meds: i % 5 ? [{ name: '브린텔릭스', dose: '10mg' }] : [], note: { 2: '저녁에 산책함', 9: '회의가 길었음' }[i] || '', signs: hot ? { racing: true, talkative: true } : {} };
  }
  return { version: 2, entries, meds: [{ name: '브린텔릭스', dose: '10mg' }], taken: {}, settings: { hintClosed: true } };
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ...devices['iPhone 14'], deviceScaleFactor: 1, colorScheme: 'dark' })).newPage();
  // 설정을 열고, 확인하기 쉽게 모든 탭의 내용을 한꺼번에 펼쳐 둔다 (탭을 오가는 것은 아래에서 따로 확인한다)
  const openSet = async () => {
    await page.click('#app .top [data-act=settings]');
    await page.evaluate(() => { if (!document.querySelector('#test-allpanes')) document.head.insertAdjacentHTML('beforeend', '<style id="test-allpanes">#sheet .setpane[hidden] { display: block !important; }</style>'); });
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  const store = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  // 따로 적지 않으면 처음 안내는 이미 지난 것으로 둔다 (care: true)
  const put = async (data) => { if (data.settings && !('care' in data.settings)) data.settings.care = true; await page.evaluate(([k, d]) => localStorage.setItem(k, JSON.stringify(d)), [KEY, data]); await page.reload(); };
  const text = (sel) => page.textContent(sel);
  const today = dayAgo(0);

  // 1. 처음 열기
  await page.goto(url);
  check('처음 열면 안내가 한 장 뜸', !!(await page.$('#sheet .welcome [data-act=welcomeNext]')));
  // 손가락으로 끌어서 넘기기: 끄는 동안 화면이 따라오고, 충분히 밀고 떼면 넘어간다
  const drag = (sel, dx, release = true) => page.evaluate(([q, d, up]) => {
    const el = document.querySelector(q), mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
    const fire = (type, x, list) => el.dispatchEvent(new TouchEvent(type, { touches: list ? [mk(x)] : [], changedTouches: [mk(x)], bubbles: true, cancelable: true }));
    fire('touchstart', 200, true);
    for (let i = 1; i <= 4; i++) fire('touchmove', 200 + d * i / 4, true);
    if (up) fire('touchend', 200 + d, false);
  }, [sel, dx, release]);
  await drag('#sheet .welcome', -150, false);
  check('안내를 끄는 동안 화면이 손가락을 따라옴', await page.evaluate(() => document.querySelector('#sheet').classList.contains('dragging') && document.querySelector('#sheet').style.getPropertyValue('--drag') === '-150.0px'));
  await page.evaluate(() => { const el = document.querySelector('#sheet .welcome'); el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [new Touch({ identifier: 1, target: el, clientX: 50, clientY: 300 })], bubbles: true })); });
  await page.waitForTimeout(450);
  check('안내를 왼쪽으로 밀면 둘째 장으로 넘어감', (await page.$$('#sheet [data-act=care][data-v]')).length === 2);
  await drag('#sheet .welcome', 150); await page.waitForTimeout(450);
  check('오른쪽으로 밀면 첫 장으로 돌아옴', !!(await page.$('#sheet [data-act=welcomeNext]')));
  await drag('#sheet .welcome', 150); await page.waitForTimeout(450);
  check('첫 장에서 더 뒤로는 안 넘어감', !!(await page.$('#sheet [data-act=welcomeNext]')) && !(await page.evaluate(() => document.querySelector('#sheet').classList.contains('dragging'))));
  await page.click('[data-act=welcomeNext]');
  check('안내 둘째 장에서 어떻게 쓸지 물어봄', (await page.$$('#sheet [data-act=care][data-v]')).length === 2);
  await page.click('#sheet [data-act=care][data-v="1"]');
  await page.waitForTimeout(350);
  check('고르면 안내가 닫히고 다시 안 뜸', (await store()).settings.care === true && await page.isHidden('#sheet'));
  await page.reload(); await page.waitForSelector('h1');
  check('다시 열어도 안내가 안 뜸', await page.isHidden('#sheet'));
  check('처음 열면 오늘 화면', (await text('h1')) === '오늘');
  check('빈 날에 기록하기 버튼', await page.isVisible('[data-act=record]'));
  check('빈 날에는 안 적은 항목이 작은 딱지로 모여 있음', (await page.$$('#app .chip.sm[data-focus]')).length >= 7 && (await page.$$('#app button.li[data-focus]')).length === 0 && (await text('#app [data-focus=appetite]')).includes('식욕'));
  await page.click('#app [data-focus=appetite]');
  check('줄을 누르면 그 항목만 뜸 (식욕)', (await text('.st b')) === '식욕' && (await page.$$('#f-appetite')).length === 1 && (await page.$$('#f-mood, [data-flag=period], [data-drink]')).length === 0);
  await page.click('.sheet-top [data-act=close]');
  check('배경 빛이 바탕색에 안 덮임 (body는 투명)', await page.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(document.body, '::before').backgroundImage.includes('gradient')));

  // 2. 기록하기: 만진 항목만 저장된다
  await page.click('.btn[data-act=record]');
  await page.click('.savebar [data-act=save]');
  check('아무것도 안 적으면 저장하지 않음', !(await store()) || !(await store()).entries[today]);
  check('처음에는 모든 칸이 기록 없음', (await text('#n-mood')) === '기록 없음' && (await text('#v-mood')) === '' && (await text('.tile .word')) === '기록 없음');
  check('보통 값에서는 체크리스트 숨김', await page.isHidden('#signs'));
  await page.fill('#f-mood', '8');
  check('기분 7 이상이면 체크리스트 표시', await page.isVisible('#signs'));
  check('기분 값에 이름이 붙음', (await text('#n-mood')) === '신남');
  await page.click('[data-sign=racing]');
  await page.click('[data-field=dep] [data-v="3"]');
  await page.click('[data-act=sleepOn]');
  await page.fill('#f-bed', '01:20'); await page.fill('#f-wake', '06:45');
  check('수면 시간 자동 계산', (await text('#v-sleep')) === '5시간 25분');
  await page.click('[data-drink=monster][data-d="1"]'); await page.click('[data-drink=coffee][data-d="1"]');
  check('카페인 합계', (await text('#v-caf')).includes('250mg'));
  await page.click('#meds [data-act=addMed]'); await page.fill('#med-name', '알');
  check('약 이름 후보', (await text('#med-sug')).includes('알프람'));
  await page.click('.sug[data-name="알프람"]'); await page.fill('#med-dose', '0.25'); await page.click('[data-act=saveMed]');
  check('용량에 숫자만 적으면 mg가 붙음', (await store()).meds[0].dose === '0.25mg');
  await page.click('#meds [data-act=doseAdd]');
  await page.fill('#f-note', '<b>메모</b>\n둘째 줄');
  await page.click('.savebar [data-act=save]');
  let e = (await store()).entries[today];
  check('기록 저장', e && e.mood === 8 && e.dep === 3 && e.sleepMin === 325 && e.signs.racing === true && e.caffeine === 6 && e.meds[0].name === '알프람', JSON.stringify(e));
  check('안 만진 항목은 빈 값으로 남음', e.energy === null && e.conf === null && e.appetite === null && e.si === null && e.anx === null, JSON.stringify(e));
  check('약을 체크하면 시각이 찍힘', /^\d\d:\d\d$/.test(e.meds[0].at), JSON.stringify(e.meds));
  check('메모는 여러 줄, 글자 그대로 표시', e.note === '<b>메모</b>\n둘째 줄' && (await page.$$('#app b >> text=메모')).length === 0 && (await text('#app .note')).includes('<b>메모</b>'));
  check('오늘 타일에 이름 표시', (await text('.tile .word')) === '신남');

  // 3. 오늘 화면에서 약 체크: 하루에 여러 번, 시각만 지우기, 기록 지우기
  await page.click('#app [data-act=doseAdd]');
  check('한 번 더 먹은 것 추가', (await store()).entries[today].meds.length === 2);
  await page.click('#app [data-act=doseTime] >> nth=1');
  e = (await store()).entries[today];
  check('시각을 누르면 시각만 지워짐', e.meds.length === 2 && e.meds[1].at === '' && e.meds[0].at !== '', JSON.stringify(e.meds));
  await page.click('#app [data-act=doseDel] >> nth=0');
  e = (await store()).entries[today];
  check('먹은 기록 지우기', e.meds.length === 1 && e.meds[0].at === '', JSON.stringify(e.meds));

  // 4. 수정: 값을 낮추면 체크리스트 내용은 버림
  await page.click('.btn[data-act=record]'); await page.fill('#f-mood', '3'); await page.click('.savebar [data-act=save]');
  e = (await store()).entries[today];
  check('낮춘 뒤 체크리스트 비움', e.mood === 3 && Object.keys(e.signs).length === 0);

  // 4-1. 이어서 적기: 나중에 다른 항목만 더해도 먼저 적은 것은 그대로다
  await page.click('.tile[data-focus=energy]');
  check('타일을 누르면 그 항목만 뜸', (await text('#n-energy')) === '기록 없음' && (await text('.st b')) === '에너지'
    && (await page.$$('#f-mood, #f-conf, #sleep, #meds, #f-note, [data-act=deleteEntry]')).length === 0);
  await page.click('#f-energy');   // 빈 슬라이더는 누르기만 해도 값이 생긴다
  check('빈 슬라이더를 누르면 값이 생김', (await text('#v-energy')) !== '');
  await page.click('[data-act=clearField][data-k=energy]');
  check('값 자리를 누르면 다시 기록 없음', (await text('#n-energy')) === '기록 없음');
  await page.fill('#f-energy', '6');
  await page.click('.savebar [data-act=save]');
  e = (await store()).entries[today];
  check('이어서 적은 것만 더해짐', e.mood === 3 && e.energy === 6 && e.sleepMin === 325 && e.dep === 3, JSON.stringify(e));

  // 4-1-1. 수면 지우기, 수면 타일로 바로 적기
  await page.click('.btn[data-act=record]'); await page.click('[data-act=sleepOff]');
  check('수면을 지우면 시각 칸이 사라짐', (await page.$$('#f-bed')).length === 0);
  await page.click('.savebar [data-act=save]');
  e = (await store()).entries[today];
  check('수면 없이 저장', e.bed === null && e.wake === null && e.sleepMin === null && e.mood === 3, JSON.stringify([e.bed, e.wake, e.sleepMin]));
  await page.click('.tile[data-focus=sleep]');
  check('수면 타일을 누르면 시각 칸이 바로 열림', await page.isVisible('#f-bed'));
  await page.click('.sheet-top [data-act=close]');
  await page.click('#app [data-focus=anx]');
  check('목록 줄을 누르면 그 항목만 뜸', (await text('.st b')) === '불안' && (await page.$$('[data-field=anx]')).length === 1 && (await page.$$('[data-field=dep]')).length === 0 && (await page.$$('#f-mood, #sleep')).length === 0);
  await page.click('[data-field=anx] [data-v="2"]');
  await page.click('.savebar [data-act=save]');
  e = (await store()).entries[today];
  check('한 항목만 고쳐도 나머지는 그대로', e.anx === 2 && e.dep === 3 && e.mood === 3 && e.energy === 6, JSON.stringify(e));
  check('죽고 싶은 생각을 안 적었으면 상담전화는 안 보임', (await page.$$('#app a[href="tel:109"]')).length === 0);
  await page.click('#app [data-focus=si]'); await page.click('[data-field=si] [data-v="3"]'); await page.click('.savebar [data-act=save]');
  check('죽고 싶은 생각이 높으면 오늘 화면에 상담전화가 보임', (await store()).entries[today].si === 3 && (await page.$$('#app a[href="tel:109"]')).length === 1);

  // 4-1-2. 약마다 알람 시각을 정하면 캘린더 알림 파일에 들어간다
  await openSet();
  await page.click('[data-act=alarmAdd]'); await page.click('[data-act=alarmAdd]');
  await page.fill('.alarm-at >> nth=0', '08:30'); await page.fill('.alarm-at >> nth=1', '21:00');
  check('약 알람 시각 저장', JSON.stringify((await store()).meds[0].alarms) === '["08:30","21:00"]');
  const [icsFile] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=ics]')]);
  const ics = fs.readFileSync(await icsFile.path(), 'utf8');
  check('알림 파일에 약 이름과 시각이 들어감', ics.includes('알프람 0.25mg 먹을 시간') && ics.includes('T083000') && ics.includes('T210000') && ics.includes('Tidemark 기록하기'), ics.slice(0, 200));
  await page.click('[data-act=alarmDel] >> nth=1');
  check('약 알람 지우기', (await store()).meds[0].alarms.length === 1);
  await page.click('[data-act=close]');

  // 4-2. 기록을 쓰기 전에도 약을 체크할 수 있고, 기록할 때 이어진다
  await put({ version: 2, entries: {}, meds: [{ name: '콘서타', dose: '27mg' }], taken: {}, settings: { hintClosed: true } });
  await page.click('#app [data-act=doseAdd]'); await page.click('#app [data-act=doseAdd]');
  check('기록 전 약 체크는 따로 저장', (await store()).taken[today].length === 2);
  await page.click('.btn[data-act=record]'); await page.click('.savebar [data-act=save]');
  const after = await store();
  check('기록하면 약 체크가 기록으로 옮겨짐', after.entries[today].meds.length === 2 && !after.taken[today]);

  // 4-3. 처음엔 시각이 찍히고, 누를 때마다 시각이 사라졌다 들어왔다 한다
  await put({ version: 2, entries: {}, meds: [{ name: '브린텔릭스', dose: '15mg' }], taken: {}, settings: { hintClosed: true } });
  await page.click('#app [data-act=doseAdd]');
  check('처음 누르면 시각이 찍힘', /^\d\d:\d\d$/.test((await store()).taken[today][0].at));
  await page.click('#app [data-act=doseTime]');
  check('한 번 더 누르면 시각이 사라지고 먹음만 남음', (await store()).taken[today][0].at === '' && (await text('#app .dose')).includes('먹음'));
  await page.click('#app [data-act=doseTime]');
  check('또 누르면 시각이 다시 들어감', /^\d\d:\d\d$/.test((await store()).taken[today][0].at));

  // 5. 쌓인 기록: 신호 · 인사이트 · 흐름
  await page.click('[data-tab=insight]');
  const mineBefore = JSON.stringify((await store()).entries);
  await page.click('[data-act=demo]');
  check('기록이 적을 때 예시로 인사이트를 미리 봄 (내 기록은 그대로)', (await page.$$('.state li')).length >= 2 && (await text('#app')).includes('예시 기록') && JSON.stringify((await store()).entries) === mineBefore);
  await page.click('[data-act=demo]');
  check('예시를 닫으면 원래 안내로 돌아옴', (await page.$$('.state')).length === 0 && (await text('#app')).includes('4일 이상 적으면'));
  await page.click('[data-tab=today]');
  await put(seed());
  check('오늘 화면에는 인사이트 배너를 띄우지 않음', (await page.$$('#app .signal')).length === 0);
  await page.click('[data-tab=insight]');
  check('인사이트는 짧게: 시기 목록·비교 목록은 없고 근거는 여섯 줄까지', !(await text('#app')).includes('지금까지의 시기') && (await page.$$('.li.cmp')).length === 0 && (await page.$$('.state li')).length <= 6);
  // 잠자는 시간대가 당겨진 기록을 넣으면 그 점을 짚어 준다 (최근 연구 반영)
  await page.evaluate(([k]) => { const d = JSON.parse(localStorage.getItem(k)); Object.keys(d.entries).sort().reverse().forEach((date, i) => { d.entries[date].bed = i < 5 ? '22:00' : '01:00'; }); localStorage.setItem(k, JSON.stringify(d)); }, [KEY]);
  await page.reload(); await page.waitForSelector('h1'); await page.click('[data-tab=insight]');
  check('최근 7일 읽기: 잠자는 시간대가 당겨진 것을 짚어 줌', (await text('.state')).includes('잠자는 시간대가 평소보다') && (await text('.state')).includes('당겨짐'));
  check('최근 7일 읽기: 언제부터 며칠째인지도 말함',(await text('.state .flow')).includes('일째') && (await text('.state .flow')).includes('경조증 기준 기간(4일)을 넘음'));
  check('최근 7일 읽기: 들뜬 날이 이어지면 겹치는 점을 근거와 함께 보여 줌', (await text('.state')).includes('경조증·조증 때의 모습과 많이 겹쳐요') && (await text('.state')).includes('경조증 기준 증상 7가지 중') && (await text('.state')).includes('진단이 아니에요'));
  await page.click('[data-tab=trend]');
  check('주 그래프', (await page.$$('.plot svg')).length >= 4);
  await page.click('[data-mode=month]');
  check('월 달력', (await page.$$('.cal .cday')).length >= 28);
  await page.click('.cal .cday:not([disabled])');
  check('날짜를 누르면 그날 표시', await page.isVisible('.pickbar'));

  // 5-1. 옆으로 밀어서 날짜 넘기기
  const swipe = (dx) => page.evaluate((d) => {
    const el = document.querySelector('#app'), mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(200)], changedTouches: [mk(200)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(200 + d)], bubbles: true }));
  }, dx);
  const monthBefore = await text('.pnav span');
  await swipe(120);
  check('흐름: 오른쪽으로 밀면 이전 달', (await text('.pnav span')) !== monthBefore);
  await swipe(-120); await swipe(-120);
  check('흐름: 미래로는 안 넘어감', (await text('.pnav span')) === monthBefore);
  await page.click('[data-tab=today]');
  await swipe(120);
  check('오늘: 오른쪽으로 밀면 어제', (await text('h1')) !== '오늘');
  await swipe(-120); await swipe(-120);
  check('오늘: 왼쪽으로 밀면 다시 오늘, 미래로는 안 감', (await text('h1')) === '오늘');
  await swipe(30);
  check('조금만 밀면 안 넘어감', (await text('h1')) === '오늘');

  // 5-2. 진료 탭: 다음 진료일, 말할 것, 요약
  await page.click('[data-tab=clinic]');
  check('진료용 요약에 그림과 눈에 띄는 날, 약이 나옴', (await page.$$('.sum-rows circle, .sum-rows path')).length === 0 && (await page.$$('.sum-fig path')).length === 2 && (await page.$$('.sum-rows rect')).length % 14 === 0 && (await page.$$('.sum-rows rect[style]')).length > 0
    && (await text('.sum-rows')).includes('우울') && (await text('.sum-rows')).includes('브린텔릭스') && (await text('#summary')).includes('5시간 미만'));
  const confOff = !(await text('.sum-fig')).includes('자신감');
  await page.click('.sum-tog[data-k=conf]');
  check('큰 그래프에서 선을 켜고 끔 (선은 기분·에너지·자신감 세 가지뿐)', confOff && (await text('.sum-fig')).includes('자신감') && (await page.getAttribute('.sum-tog[data-k=conf]', 'aria-pressed')) === 'true' && (await page.$$('.sum-tog')).length === 3);
  await page.click('.sum-tog[data-k=conf]');
  check('요약 그림이 카드 밖으로 안 넘침', await page.evaluate(() => [...document.querySelectorAll('#summary .card svg')].every((el) => el.getBoundingClientRect().right <= el.closest('.card').getBoundingClientRect().right)));
  await page.fill('#c-note', '약 먹으면 오후에 졸림'); await page.press('#c-note', 'Enter');
  check('말할 것 추가 (엔터)', (await store()).clinic.notes[0] === '약 먹으면 오후에 졸림' && (await text('#summary')).includes('약 먹으면 오후에 졸림'));
  await page.fill('#c-next', dayAgo(-3));
  check('다음 진료일까지 남은 날', (await text('.top .over')) === '진료까지 3일' && (await store()).clinic.next === dayAgo(-3));
  await page.click('[data-act=clinicWeeks][data-w="4"]');
  check('4주 요약', (await text('#summary')).includes('/ 28일'));
  check('4주 요약: 그래프와 네모 줄이 기간 전체로 한 장씩, 네모는 한 줄에 28칸이고 글자 없이 색만', (await page.$$('.sum-fig')).length === 1 && (await page.$$('.sum-rows')).length === 1
    && (await page.$$('.sum-rows rect')).length % 28 === 0 && (await page.$$('.sum-rows text[text-anchor=middle]')).length === 0);
  await page.click('[data-act=clinicWeeks][data-w="1"]');
  check('1주 요약: 요일이 적힌 네모가 날마다 한 칸', (await text('#summary')).includes('/ 7일') && (await page.$$('.sum-rows rect')).length % 7 === 0 && (await page.$$('.sum-rows rect + text')).length > 0);
  await page.click('[data-act=clinicWeeks][data-w="4"]');
  await page.click('[data-act=copySummary]');
  check('요약을 글로 복사', await page.waitForFunction(() => document.querySelector('#toast').textContent === '복사했어요', null, { timeout: 3000 }).then(() => true, () => false));
  await page.click('[data-act=clinicNoteDel]');
  check('말할 것 지우기', (await store()).clinic.notes.length === 0);

  // 5-2-0. 약 바꾼 날 · 진료 메모 · "진료 후" 기간 · 부작용과 술·운동
  await page.click('[data-act=clinicWeeks][data-w="1"]');
  await page.click('[data-act=logAdd][data-kind=med]');
  await page.fill('#l-text', '브린텔릭스 10mg → 15mg');
  await page.click('[data-act=logSave]');
  check('약 바꾼 날이 기록되고 그래프에 표시됨', (await store()).clinic.log[0].kind === 'med' && (await text('.sum-fig')).includes('약 변경') && (await text('#summary')).includes('10mg → 15mg'));
  check('진료 메모가 없으면 "진료 후" 단추가 없음', (await page.$$('[data-act=clinicWeeks][data-w=since]')).length === 0);
  await page.click('[data-act=logAdd][data-kind=visit]');
  await page.fill('#l-date', dayAgo(9)); await page.fill('#l-text', '2주 뒤에 다시');
  await page.click('[data-act=logSave]');
  await page.click('[data-act=clinicWeeks][data-w=since]');
  check('"진료 후"는 지난 진료일이 들어가는 주 단위 (9일 전 → 2주)', (await text('#summary')).includes('/ 14일') && (await store()).clinic.log[0].kind === 'visit');
  await page.click('[data-tab=today]'); await openSet();
  await page.fill('#cu-name', '술'); await page.click('[data-act=customAdd]');
  await page.fill('#cu-name', '걸음 수'); await page.click('[data-act=customType][data-t=number]'); await page.fill('#cu-unit', '보'); await page.click('[data-act=customAdd]');
  await page.click('.sheet-top [data-act=close]');
  const [cu1, cu2] = (await store()).settings.custom.map((c) => c.id);
  check('설정에서 내 항목을 만듦 (했음, 숫자와 단위)', (await store()).settings.custom.length === 2 && (await store()).settings.custom[1].unit === '보' && (await text(`#app [data-focus="c:${cu2}"]`)).includes('걸음 수'));
  await page.click('.btn[data-act=record]');
  await page.click('[data-act=fxToggle]'); await page.click('[data-fx=sleepy]');
  await page.fill('#fx-new', '발진'); await page.press('#fx-new', 'Enter');
  await page.click(`[data-custom="${cu1}"]`); await page.fill(`input[type=number][data-custom="${cu2}"]`, '7500'); await page.click('[data-psych=voices]'); await page.click('[data-psych=unreal]');
  await page.click('.savebar [data-act=save]');
  e = (await store()).entries[today];
  check('내 항목(했음, 숫자와 단위)이 저장되고 오늘 화면에 보임', e.custom[cu1] === true && e.custom[cu2] === 7500 && (await text('#app')).includes('7500 보'));
  check('부작용과 정신병적 증상이 저장되고 오늘 화면에 보임', e.psych.voices === true && e.psy === 2 && (await text('#app')).includes('환청 · 현실 같지 않음') && e.fx.sleepy === true && e.fx['c:발진'] === true && (await store()).settings.fxCustom[0] === '발진' && (await text('#app')).includes('졸림 · 발진'));
  await page.click('[data-tab=clinic]');
  check('진료 화면에 부작용과 내 항목이 네모 줄로 나옴', (await text('#summary')).includes('부작용') && (await page.$$eval('.sum-rows', (x) => x.map((el) => el.textContent).join(' '))).includes('걸음 수'));

  // 5-2-1. 설정에서 기록 항목 끄기: 화면에서만 빠지고 적어 둔 값은 남는다
  await page.click('[data-tab=today]'); await openSet();
  await page.click('[data-act=item][data-k=conf]'); await page.click('[data-act=item][data-k=anx]');
  await page.click('.sheet-top [data-act=close]');
  const entriesBefore = JSON.stringify((await store()).entries);
  check('끈 항목은 오늘 화면에 칸이 없음', (await page.$$('.tile[data-focus=conf]')).length === 0 && (await page.$$('.tile[data-focus=mood]')).length === 1);
  await page.click('.btn[data-act=record]');
  check('끈 항목은 기록 화면에 없음', (await page.$$('#f-conf, [data-field=anx]')).length === 0 && (await page.$$('#f-mood, [data-field=dep]')).length === 2);
  await page.click('.sheet-top [data-act=close]');
  check('끈 항목에 적어 둔 값은 그대로', JSON.stringify((await store()).entries) === entriesBefore && (await store()).settings.off.length === 2);
  await openSet();
  await page.click('[data-act=item][data-k=conf]'); await page.click('[data-act=item][data-k=anx]');
  await page.click('.sheet-top [data-act=close]');
  check('다시 켜면 칸이 돌아옴', (await page.$$('.tile[data-focus=conf]')).length === 1 && (await store()).settings.off.length === 0);

  // 5-3. 메모 모아 보기
  await page.click('[data-tab=trend]'); await page.click('[data-act=notes]');
  check('메모가 날짜별로 모임', (await page.$$('#notes-list .note')).length === 2);
  await page.fill('#q-notes', '산책');
  check('낱말로 찾기', (await page.$$('#notes-list .note')).length === 1);
  await page.click('#notes-list .note');
  check('메모를 누르면 그날로 감', (await text('h1')) !== '오늘' && (await text('#app .note')).includes('산책'));
  await page.click('[data-act=goToday]');

  // 5-4. 백업 챙기기
  check('백업한 적이 없으면 오늘 화면에 알림', await page.isVisible('#app [data-act=snoozeBackup]'));
  await page.click('#app [data-act=snoozeBackup]');
  check('닫으면 일주일 동안 안 보임', (await page.$$('#app [data-act=snoozeBackup]')).length === 0 && (await store()).settings.backupSnooze > today);

  // 6. 설정: 언어 · 화면 모드 · 색 · 글씨 크기
  await page.click('[data-tab=today]');
  await openSet(); await page.click('[data-lang=en]'); await page.waitForLoadState('load'); await page.waitForSelector('h1');
  check('영어로 전환', (await text('h1')) === 'Today');
  const left = (await page.evaluate(() => document.querySelector('#app').innerText)).split('\n').filter((s) => HANGUL.test(s) && !s.includes('브린텔릭스') && !s.includes('발진') && !/술|걸음 수|7500 보/.test(s));   // 사용자가 적은 약 이름·부작용·내 항목은 한글 그대로
  check('영어 화면에 한글이 남지 않음', left.length === 0, left.join(' | '));
  await openSet(); await page.click('[data-lang=ko]'); await page.waitForLoadState('load'); await page.waitForSelector('h1');
  await openSet(); await page.click('[data-theme-pick=light]');
  check('라이트 모드', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.click('[data-font=batang]');
  await page.waitForFunction(() => document.fonts.check('16px "Gowun Batang"', '가1'));
  check('글씨체를 고르면 본문과 큰 숫자에 적용', await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Gowun Batang')
    && getComputedStyle(document.documentElement).getPropertyValue('--round').includes('Gowun Batang')));
  await page.click('[data-font=system]');
  await page.click('[data-color-pick=off]'); await page.click('[data-size=xl]'); await page.click('[data-act=close]');
  check('아주 큰 글씨에서도 옆으로 안 넘침', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

  // 6-1. 홈 화면 앱 배치: 내용이 짧은 화면에서도 페이지가 기기 화면보다 길고, 탭바는 바닥에 그대로 붙어 있다
  await put({ version: 2, entries: {}, meds: [], taken: {}, settings: { hintClosed: true } });
  const edges = await page.evaluate(() => {
    const root = document.documentElement;
    root.classList.add('standalone');
    root.style.setProperty('--screen-h', `${innerHeight}px`);
    const out = [document.documentElement.scrollHeight > innerHeight, Math.round(document.querySelector('.tabbar').getBoundingClientRect().bottom), innerHeight];
    root.classList.remove('standalone');
    return out;
  });
  check('홈 화면 앱: 짧은 화면도 페이지가 화면보다 길고 탭바는 바닥', edges[0] && edges[1] === edges[2], edges.join(', '));
  await put(seed());

  // 7. 백업 내보내기 → 지우기 → 불러오기 (앱을 지웠다가 다시 깔았을 때와 같은 흐름)
  await page.evaluate(([k]) => { const d = JSON.parse(localStorage.getItem(k)); Object.assign(d.settings, { color: 'blue', use: ['depression', 'adhd'], fxCustom: ['발진'], custom: [{ id: 'walk', name: '걸음 수', type: 'number', unit: '보' }] }); d.clinic = { next: '', notes: ['잠 이야기'], log: [{ date: Object.keys(d.entries)[0], kind: 'med', text: '10mg → 15mg' }] }; localStorage.setItem(k, JSON.stringify(d)); }, [KEY]);
  await page.reload(); await page.waitForSelector('h1');
  await openSet();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#sheet [data-act=export]')]);
  const backup = fs.readFileSync(await dl.path());
  check('백업하면 날짜가 남고 알림이 사라짐', (await store()).settings.lastBackup === today && (await page.$$('#app [data-act=snoozeBackup]')).length === 0);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.setInputFiles('#importFile', { name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await page.waitForFunction((k) => localStorage.getItem(k) && Object.keys(JSON.parse(localStorage.getItem(k)).entries).length > 20, KEY);
  check('백업 불러오기', Object.keys((await store()).entries).length === 29);
  const back = await store();
  check('새 앱에 불러오면 약·내 항목·진료 기록·화면 설정·진단명도 돌아옴', back.meds.length === 1 && back.settings.custom[0].name === '걸음 수' && back.clinic.log[0].text === '10mg → 15mg' && back.clinic.notes[0] === '잠 이야기'
    && back.settings.color === 'blue' && back.settings.use.join() === 'depression,adhd' && back.settings.fxCustom[0] === '발진', JSON.stringify(back.settings));

  // 8. 예전(3단계) 기록 옮기기
  await put({ version: 1, entries: { [today]: { date: today, mood: 5, energy: 5, dep: 0, elev: 0, anx: 0, appetite: 2, caffeine: 1, meds: [], signs: {}, tags: { alcohol: true } } }, meds: [], settings: {} });
  await page.click('[data-act=record]'); await page.click('.savebar [data-act=save]');
  const moved = await store();
  check('예전 기록 변환', moved.version === 3 && moved.entries[today].custom.alcohol === true && moved.settings.custom[0].name === '술' && !moved.entries[today].tags && moved.entries[today].appetite === 8 && moved.entries[today].caffeine === 4, JSON.stringify(moved.entries[today]));

  // 9. 잠금: 비밀번호 정하기 → 다시 열면 가려짐 → 틀리면 그대로, 맞으면 열림 → 끄기
  const tap = async (digits) => { for (const k of digits) await page.click(`#lock [data-k="${k}"]`); await page.waitForTimeout(250); };
  await openSet(); await page.click('[data-act=pinSet]');
  await tap('1234'); await tap('1234');
  check('비밀번호 저장 (그대로 저장하지 않음)', !!(await store()).settings.pin && !(await store()).settings.pin.includes('1234'));
  await page.reload();
  check('다시 열면 잠금 화면', await page.isVisible('#lock'));
  await tap('0000');
  check('틀린 비밀번호로는 안 열림', await page.isVisible('#lock'));
  await tap('1234');
  check('맞는 비밀번호로 열림', await page.isHidden('#lock'));
  await openSet();
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#sheet [data-act=export]')]);
  check('백업 파일에는 비밀번호가 안 들어감', !fs.readFileSync(await dl2.path(), 'utf8').includes('"pin"'));
  await page.click('[data-act=pinOff]');
  check('잠금 끄기', !(await store()).settings.pin);

  // 9. 진단명: 여러 개 고를 수 있고, 고르기만 할 뿐 기록 항목·내 항목·기록은 건드리지 않는다
  const before9 = JSON.stringify([(await store()).entries, (await store()).settings.off || [], (await store()).settings.custom || []]);
  await page.click('[data-act=dx][data-p=depression]'); await page.click('[data-act=dx][data-p=adhd]');
  let st = (await store()).settings;
  check('진단명을 여러 개 고름 (처음부터 켜져 있는 조울증 + 우울증 + ADHD)', st.use.join() === 'bipolar,depression,adhd' && (await page.$$('[data-act=dx][aria-pressed=true]')).length === 3);
  check('진단명을 골라도 기록 항목·내 항목·기록은 그대로', JSON.stringify([(await store()).entries, st.off || [], st.custom || []]) === before9);
  await page.click('[data-act=dx][data-p=bipolar]');
  check('진단명을 다시 누르면 꺼짐', (await store()).settings.use.join() === 'depression,adhd');
  // 진단명은 참고일 뿐: 우울증·ADHD만 골랐어도 기록에 들뜬 시기가 보이면 그대로 말하고, 진단명에 없는 모습이라고 짚어 준다
  await page.click('[data-act=close]');
  await put(seed());
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('tide.v1')); d.settings.use = ['depression', 'adhd']; localStorage.setItem('tide.v1', JSON.stringify(d)); });
  await page.reload(); await page.waitForSelector('h1');
  await page.click('[data-tab=insight]');
  const stateText = await page.textContent('.state');
  check('우울증만 골랐어도 들뜬 모습을 걸러 내지 않고, 진단명에 없는 모습이라고 짚어 줌', /hypomania|경조증/.test(stateText) && /not among the chosen diagnoses|고른 진단명에 조울증은 없지만/.test(stateText));
  // 설정은 가로 탭으로 나뉘어 있고, 고른 탭의 내용만 보인다. 흐름·인사이트·진료 화면에서도 설정을 열 수 있다.
  await page.evaluate(() => { const st = document.querySelector('#test-allpanes'); if (st) st.remove(); });
  for (const tab of ['trend', 'insight', 'clinic']) {
    await page.click(`[data-tab=${tab}]`);
    await page.click('#app .top [data-act=settings]');
    check(`${tab} 화면에서도 설정이 열림`, (await page.$$('#sheet .settabs button')).length === 5);
    await page.click('#sheet [data-act=close]'); await page.waitForTimeout(300);
  }
  await page.click('[data-tab=today]'); await page.click('#app .top [data-act=settings]');
  check('설정을 열면 기록 탭만 보임', await page.isVisible('#sheet [data-act=dx]') && await page.isHidden('#sheet [data-act=export]'));
  await page.click('#sheet [data-act=setTab][data-g=data]');
  check('탭을 누르면 그 탭의 내용으로 바뀜', await page.isHidden('#sheet [data-act=dx]') && await page.isVisible('#sheet [data-act=export]'));
  await page.click('#sheet [data-act=setTab][data-g=rec]');
  // 약은 종류를 먼저 고르고, 영어 성분 이름으로도 찾을 수 있다
  await page.click('[data-act=addMed]');
  check('약을 더할 때 종류 일곱 가지가 먼저 보임', (await page.$$('#med-sug .sug.cat')).length === 7);
  await page.click('#med-sug [data-g=adhd]');
  check('종류를 누르면 그 종류의 약 목록이 나옴', /Concerta|콘서타/.test(await page.textContent('#med-sug')));
  await page.fill('#med-name', 'sertral');
  check('영어 성분 이름으로도 약을 찾음', (await page.$$('#med-sug [data-act=pickSug]')).length >= 1);
  await page.click('[data-act=close]');
  // 공황: 오늘 화면의 "+ 공황"은 바로 한 번을 적고, 그 뒤에는 줄을 눌러 횟수를 고친다
  await put({ version: 3, entries: {}, meds: [], taken: {}, clinic: { notes: [] }, settings: {} });
  await page.click('[data-act=panicAdd]');
  const panicOf = async () => Object.values((await store()).entries)[0].panic;
  check('"+ 공황"을 누르면 바로 한 번이 적힘', (await panicOf()) === 1 && !(await page.$('[data-act=panicAdd]')));
  await page.click('.li[data-focus=panic]'); await page.click('[data-panic="1"]'); await page.click('#sheet [data-act=save]');
  check('공황 줄을 눌러 횟수를 고침', (await panicOf()) === 2);
  // 진료 요약: 요일 글자는 네모가 큰 1주에서만 네모 안에 적는다
  await put(seed());
  await page.click('[data-tab=clinic]');
  const letters = async () => (await page.$$eval('#summary .sum-rows text', (els) => els.filter((x) => /^[SMTWF]$/.test(x.textContent)).length));
  await page.click('[data-act=clinicWeeks][data-w="1"]');
  const one = await letters();
  await page.click('[data-act=clinicWeeks][data-w="2"]');
  check('요일 글자는 1주 네모에만 있고 2주 네모에는 없음', one > 0 && (await letters()) === 0, one);
  await page.click('[data-tab=today]');

  // 진료 기록의 긴 글: 날짜가 글 옆에서 밀려 꺾이지 않고 글 위에 한 줄로 있다
  await page.evaluate((k) => { const d = JSON.parse(localStorage.getItem(k)); d.clinic = { notes: [], ...d.clinic, log: [{ date: '2026-11-14', kind: 'visit', text: '긴 진료 메모 '.repeat(12) }] }; localStorage.setItem(k, JSON.stringify(d)); }, KEY);
  await page.reload(); await page.waitForSelector('h1'); await page.click('[data-tab=clinic]');
  const dateBox = await page.$eval('.talk small', (x) => [x.getBoundingClientRect().height, parseFloat(getComputedStyle(x).lineHeight) || 20, x.getBoundingClientRect().width]);
  check('진료 기록의 날짜가 한 줄로 보임', dateBox[0] < dateBox[1] * 1.6 && dateBox[2] > 150, dateBox.join());
  await page.click('[data-tab=today]');

  // 인쇄용 한 장: 종이 크기에 맞춘 배치가 따로 채워지고, 화면에서는 안 보인다
  await page.click('[data-tab=clinic]');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  check('인쇄할 때 종이용 한 장이 채워짐 (머리말 · 숫자 칸 · 그림)', (await page.$$('#printout .po-stat')).length === 4 && !!(await page.$('#printout .po-head h1')) && !!(await page.$('#printout svg.sum-rows')));
  check('종이용 한 장은 화면에서는 안 보임', await page.$eval('#printout', (x) => getComputedStyle(x).display === 'none'));
  await page.emulateMedia({ media: 'print' });
  check('인쇄에서는 종이용 한 장만 보임', await page.evaluate(() => getComputedStyle(document.querySelector('#printout')).display === 'block' && getComputedStyle(document.querySelector('#app')).display === 'none'));
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  check('인쇄가 끝나면 종이용 한 장을 비움', (await page.innerHTML('#printout')) === '');
  await page.click('[data-tab=today]');

  // 처음 쓰는 사람: 오늘 화면에 이 앱이 무엇인지 한 줄이 있고, 예시 요약을 볼 수 있다. 예시는 저장되지 않는다.
  const kept = await store();
  // 이미 쓰던 사람(기록은 있고 고른 적은 없음)에게도 안내가 한 번 뜬다
  await put({ ...kept, settings: { ...kept.settings, care: null } });
  check('쓰던 사람에게도 안내가 한 번 뜸', !!(await page.$('#sheet .welcome')));
  await put({ version: 3, entries: {}, meds: [], taken: {}, clinic: { notes: [] }, settings: { care: null } });
  await page.click('[data-act=welcomeNext]');
  await page.click('#sheet [data-act=care][data-v="0"]');
  await page.waitForTimeout(350);
  let mode = (await store()).settings;
  check('"그냥 컨디션"을 고르면 증상·약 항목과 인사이트·진료 탭이 숨겨짐', mode.care === false && ['dep', 'si', 'meds'].every((k) => mode.off.includes(k))
    && (await page.$$('.tabbar button')).length === 2 && !(await page.$('[data-act=panicAdd]')) && !(await page.$('[data-act=medSetup]')) && !(await page.$('.intro')));
  await openSet();
  check('설정에서 병원 · 상담용 기능이 꺼져 있고 진단명은 안 보임', (await page.getAttribute('#sheet [data-act=care]', 'aria-pressed')) === 'false' && !(await page.$('[data-act=dx]')));
  await page.click('#sheet [data-act=care]');
  mode = (await store()).settings;
  check('설정에서 다시 켜면 항목과 탭이 돌아옴', mode.care === true && !mode.off.includes('dep') && (await page.$$('.tabbar button')).length === 4 && !!(await page.$('[data-act=dx]')));
  await page.click('[data-act=close]');
  check('병원 · 상담용으로 쓰면 기록이 없을 때 소개가 보임', !!(await page.$('.intro [data-act=demoClinic]')));
  await page.click('[data-act=demoClinic]');
  check('"예시 요약 보기"를 누르면 진료 화면이 예시 기록으로 열림', (await page.$$('#summary .sum-fig path')).length >= 2 && !!(await page.$('#summary svg.sum-rows')) && !(await page.$('#c-note')) && !(await page.$('[data-act=logAdd]')));
  check('예시는 저장되지 않음', Object.keys((await store()).entries).length === 0 && ((await store()).clinic.log || []).length === 0);
  await page.click('[data-act=demo]');
  check('예시를 닫으면 내 진료 화면으로 돌아옴', !!(await page.$('#c-note')) && !!(await page.$('#c-next')));
  await put(kept);
  check('기록이 있으면 소개와 예시 단추가 안 보임', !(await page.$('.intro')) && !(await page.$('[data-act=demo]')));

  // 오늘 화면을 끌면 내용이 따라오고, 조금만 밀고 떼면 날짜가 안 바뀌고 제자리로 돌아온다. 미래 쪽은 조금만 따라온다.
  await page.click('[data-tab=today]');
  const h1Before = await text('h1');
  await drag('#app .tiles', 40); await page.waitForTimeout(300);
  check('조금만 밀고 떼면 날짜가 그대로이고 제자리로 돌아옴', (await text('h1')) === h1Before && !(await page.evaluate(() => document.querySelector('#app').classList.contains('dragging'))));
  await drag('#app .tiles', -200, false);
  check('넘어갈 수 없는 쪽(내일)으로는 조금만 따라옴', await page.evaluate(() => document.querySelector('#app').style.getPropertyValue('--drag') === '-40.0px'));
  await page.evaluate(() => { const el = document.querySelector('#app .tiles'); el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [new Touch({ identifier: 1, target: el, clientX: 0, clientY: 300 })], bubbles: true })); });
  await page.waitForTimeout(300);
  check('내일로는 안 넘어감', (await text('h1')) === h1Before);
  await drag('#app .tiles', 200); await page.waitForTimeout(450);
  check('충분히 끌고 떼면 전날로 넘어감', (await text('h1')) !== h1Before);
  await page.click('[data-act=goToday]');

  // 오늘 화면의 네 칸은 수면에 "평소 …"가 붙어도 높이가 같다
  const tileH = await page.$$eval('.tile', (els) => els.map((x) => Math.round(x.getBoundingClientRect().height)));
  check('오늘 화면의 네 칸 높이가 모두 같음', tileH.length === 4 && new Set(tileH).size === 1 && !(await page.$('.tile .ts')), tileH.join());

  await page.click('.btn[data-act=record]');
  check('기록 화면의 저장 단추는 아래 하나뿐', (await page.$$('#sheet [data-act=save]')).length === 1);
  await page.click('.sheet-top [data-act=close]');
  check('화면 오류 없음', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
