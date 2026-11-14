// 새 버전 받기 확인: 앱이 열린 채로 서버 파일이 바뀌면, 앱으로 돌아왔을 때 새 버전으로 다시 열리는지.
// GitHub Pages처럼 파일을 10분 동안 브라우저에 묵혀 두는 서버를 흉내 낸다.
// 실행: node mood/tests/update.js   (sw.js나 main.js의 '새 버전 받기'를 고쳤을 때 돌린다)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, devices } = require('playwright');

// 파일을 바꿔 봐야 하므로 임시 폴더에 복사해서 쓴다
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tide-update-'));
for (const name of ['index.html', 'app.css', 'sw.js', 'manifest.webmanifest', 'js', 'icons']) fs.cpSync(path.join(__dirname, '..', name), path.join(ROOT, name), { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
  fs.createReadStream(file).pipe(res);
});
const bump = (file, pattern) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(pattern, (_, head, n) => `${head}${Number(n) + 1}`));

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ...devices['iPhone 14'] })).newPage();
  const version = async () => {
    await page.click('[data-act=settings]');
    const text = await page.textContent('#about');
    await page.click('[data-act=close]');
    await page.waitForTimeout(350);
    return text.split(' · ')[0];
  };
  await page.goto(`http://localhost:${server.address().port}/`);
  // 처음 안내를 넘긴다
  await page.click('[data-act=welcomeNext]'); await page.click('#sheet [data-act=care][data-v="1"]'); await page.waitForTimeout(350);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const before = await version();

  bump(path.join(ROOT, 'js/config.js'), /(VERSION = )(\d+)/);
  bump(path.join(ROOT, 'sw.js'), /(tide-v)(\d+)/);
  const reloaded = page.waitForEvent('load', { timeout: 15000 });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // 앱으로 돌아온 것처럼
  await reloaded;
  await page.waitForSelector('h1');
  const after = await version();

  const ok = Number(after.split(' ')[1]) === Number(before.split(' ')[1]) + 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} 열린 채로 새 버전 받기: ${before} → ${after}`);
  await browser.close();
  server.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
})().catch((err) => { console.error(err.message); process.exit(1); });
