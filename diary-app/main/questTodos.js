// 진행 중 업무별 체크리스트. 업무를 누르면 그 업무만의 할 일 목록을 따로 적을 수 있다.
// 노션에는 쓰지 않고 이 컴퓨터에만 둔다 (업무 페이지 본문은 건드리지 않음).
// 모양: { [업무 id(하이픈 없는)]: [{ id: 'qt-…', text, checked }] }
'use strict';
const crypto = require('crypto');

const PREFIX = 'qt-';
const isId = (id) => String(id || '').startsWith(PREFIX);
const keyOf = (questId) => String(questId || '').replace(/-/g, '');
const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);

function locate(all, id) {
  for (const [key, list] of Object.entries(all || {})) {
    const index = (list || []).findIndex((x) => x.id === id);
    if (index >= 0) return { key, list, index, item: list[index] };
  }
  return null;
}
function add(all, questId, text) {
  const t = clean(text), key = keyOf(questId);
  if (!t || !key) return null;
  const item = { id: PREFIX + crypto.randomBytes(6).toString('hex'), text: t, checked: false };
  (all[key] = all[key] || []).push(item);
  return item;
}
function toggle(all, id, checked) { const f = locate(all, id); if (f) f.item.checked = !!checked; return !!f; }
function edit(all, id, text) { const f = locate(all, id), t = clean(text); if (f && t) f.item.text = t; return !!(f && t); }
function remove(all, id) {
  const f = locate(all, id);
  if (!f) return null;
  f.list.splice(f.index, 1);
  if (!f.list.length) delete all[f.key];
  return f.item;
}
// 같은 업무 안에서 순서 바꾸기: id 를 ref 의 앞/뒤로
function move(all, id, refId, after) {
  const f = locate(all, id), r = locate(all, refId);
  if (!f || !r || f.key !== r.key || id === refId) return false;
  f.list.splice(f.index, 1);
  const k = f.list.findIndex((x) => x.id === refId);
  f.list.splice(after ? k + 1 : k, 0, f.item);
  return true;
}
const drop = (all, questId) => { delete all[keyOf(questId)]; };

module.exports = { isId, keyOf, locate, add, toggle, edit, remove, move, drop };
