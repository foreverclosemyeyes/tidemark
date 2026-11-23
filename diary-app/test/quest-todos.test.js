// 업무별 체크리스트(이 컴퓨터에만 저장) 테스트
'use strict';
const assert = require('assert');
const QT = require('../main/questTodos');

const all = {};
const a = QT.add(all, 'aaaa-bbbb', '  자료   모으기 ');
const b = QT.add(all, 'aaaabbbb', '초안 쓰기');           // 하이픈이 있든 없든 같은 업무
assert.strictEqual(a.text, '자료 모으기');
assert.ok(QT.isId(a.id) && !QT.isId('P:2026-11-19:1') && !QT.isId('lab12'));
assert.deepStrictEqual(Object.keys(all), ['aaaabbbb']);
assert.strictEqual(all.aaaabbbb.length, 2);
assert.strictEqual(QT.add(all, 'aaaabbbb', '   '), null, '빈 글은 안 넣음');
assert.ok(QT.toggle(all, a.id, true)); assert.strictEqual(all.aaaabbbb[0].checked, true);
assert.ok(QT.edit(all, b.id, '초안 쓰기 (2쪽)')); assert.strictEqual(all.aaaabbbb[1].text, '초안 쓰기 (2쪽)');
assert.ok(!QT.edit(all, b.id, '  '), '빈 글로는 안 고침');
assert.ok(!QT.toggle(all, 'qt-none', true));
assert.strictEqual(QT.remove(all, a.id).text, '자료 모으기');
assert.strictEqual(QT.remove(all, b.id).text, '초안 쓰기 (2쪽)');
assert.deepStrictEqual(all, {}, '마지막 항목을 지우면 업무 칸도 비움');
QT.add(all, 'q1', 'x'); QT.add(all, 'q2', 'y'); QT.drop(all, 'q1');
assert.deepStrictEqual(Object.keys(all), ['q2']);
// 순서 바꾸기
{
  const m = {}; const [x, y, z] = ['하나', '둘', '셋'].map((t) => QT.add(m, 'q', t)); const o = QT.add(m, 'other', '남');
  assert.ok(QT.move(m, z.id, x.id, false)); assert.deepStrictEqual(m.q.map((i) => i.text), ['셋', '하나', '둘']);
  assert.ok(QT.move(m, z.id, y.id, true)); assert.deepStrictEqual(m.q.map((i) => i.text), ['하나', '둘', '셋']);
  assert.ok(!QT.move(m, x.id, o.id, true), '다른 업무의 항목과는 못 바꿈'); assert.ok(!QT.move(m, x.id, x.id, true));
}
console.log('✓ 업무별 체크리스트 테스트 통과');
