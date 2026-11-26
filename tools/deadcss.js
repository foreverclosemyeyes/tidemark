// app.css에서, 코드 어디에도 안 나오는 클래스만으로 된 규칙(한 줄짜리)을 찾아 지운다. --apply를 주면 지우고, 아니면 목록만.
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', 'mood') + path.sep;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const code = walk(R + 'js').map((f) => fs.readFileSync(f, 'utf8')).join('\n') + fs.readFileSync(R + 'index.html', 'utf8');
const used = (cls) => new RegExp(`(^|[^\\w-])${cls.replace(/[-]/g, '\\-')}([^\\w-]|$)`).test(code);
const lines = fs.readFileSync(R + 'app.css', 'utf8').split('\n');
const dead = [];
const out = lines.filter((line) => {
  const m = line.match(/^([^{@/]+)\{.*\}\s*$/);   // 한 줄짜리 규칙만
  if (!m) return true;
  const sels = m[1].split(',').map((x) => x.trim());
  // 선택자마다 들어 있는 클래스 가운데 하나라도 안 쓰이면 그 선택자는 죽은 것. 모든 선택자가 죽었을 때만 줄을 지운다.
  const isDead = (sel) => { const cls = [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((x) => x[1]); return cls.length > 0 && cls.some((c) => !used(c)); };
  if (sels.every(isDead)) { dead.push(line.slice(0, 90)); return false; }
  return true;
});
console.log(dead.join('\n')); console.log(dead.length, 'dead rules');
if (process.argv.includes('--apply')) fs.writeFileSync(R + 'app.css', out.join('\n'));
