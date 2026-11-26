// i18n 표 정리: 새 문장을 더하고, 코드 어디에도 안 나오는 열쇠를 찾아 알려 준다 (--prune을 주면 지운다)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'mood', 'js') + path.sep;
const add = JSON.parse(fs.readFileSync(path.join(__dirname, 'add.json'), 'utf8'));
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const code = walk(root).filter((f) => f.endsWith('.js') && !f.endsWith('i18n.js')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
let lines = fs.readFileSync(root + 'i18n.js', 'utf8').split('\n');
const keyOf = (line) => { const m = line.match(/^ {2}'((?:[^'\\]|\\.)*)': /); return m ? m[1].replace(/\\'/g, "'") : null; };
const have = new Set(lines.map(keyOf).filter(Boolean));
const fresh = Object.keys(add).filter((k) => !have.has(k)).map((k) => `  '${k}': '${add[k].replace(/'/g, "\\'")}',`);
const at = lines.findIndex((l) => l.startsWith("  '설정': "));   // 새 문장은 이 줄 바로 아래에 넣는다
if (at < 0) throw new Error('anchor');
lines.splice(at + 1, 0, ...fresh);
const unused = lines.map(keyOf).filter((k) => k && !code.includes(k));
if (process.argv.includes('--prune')) lines = lines.filter((l) => { const k = keyOf(l); return !(k && unused.includes(k)); });
fs.writeFileSync(root + 'i18n.js', lines.join('\n'));
console.log(`added ${fresh.length}, unused ${unused.length}${process.argv.includes('--prune') ? ' (removed)' : ''}`);
unused.slice(0, 60).forEach((k) => console.log(' -', k.slice(0, 60)));
