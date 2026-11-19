// 화면(렌더러)에 안전하게 노출하는 기능 목록. API 키 값은 절대 화면으로 넘기지 않음.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('diary', {
  init: () => ipcRenderer.invoke('init'),
  setSettings: (p) => ipcRenderer.invoke('settings:set', p),
  setNotionCfg: (p) => ipcRenderer.invoke('notionCfg:set', p),
  setSecret: (name, value) => ipcRenderer.invoke('secret:set', name, value),
  testNotion: () => ipcRenderer.invoke('notion:test'),
  notionLogin: () => ipcRenderer.invoke('notion:login'),
  showLog: () => ipcRenderer.invoke('log:show'),
  detectClaude: () => ipcRenderer.invoke('claude:detect'),
  notionLogout: () => ipcRenderer.invoke('notion:logout'),
  sync: (force) => ipcRenderer.invoke('sync', force),
  setView: (v) => ipcRenderer.invoke('view', v),
  askAssistant: () => ipcRenderer.invoke('assistant:ask'),
  chat: (text) => ipcRenderer.invoke('assistant:chat', text),
  clearChat: () => ipcRenderer.invoke('chat:clear'),
  checkGmail: () => ipcRenderer.invoke('gmail:check'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  pickDocs: () => ipcRenderer.invoke('docs:pick'),
  exportPack: (theme) => ipcRenderer.invoke('pack:export', theme),
  importPack: (current) => ipcRenderer.invoke('pack:import', current),
  forgetMemory: (id, text) => ipcRenderer.invoke('memory:forget', id, text),
  onMemory: on('memory'),
  removeDoc: (id) => ipcRenderer.invoke('docs:remove', id),
  toggleTodo: (id, checked) => ipcRenderer.invoke('todo:toggle', id, checked),
  addTodo: (date, text) => ipcRenderer.invoke('todo:add', date, text),
  deleteTodo: (id) => ipcRenderer.invoke('todo:delete', id),
  moveTodo: (id, date) => ipcRenderer.invoke('todo:move', id, date),
  editTodo: (id, text) => ipcRenderer.invoke('todo:edit', id, text),
  addQuest: (name, end) => ipcRenderer.invoke('quest:add', name, end),
  removeQuest: (id) => ipcRenderer.invoke('quest:remove', id),
  addQuestTodo: (questId, text) => ipcRenderer.invoke('quest:todo:add', questId, text),
  openQuest: (questId) => ipcRenderer.invoke('quest:open', questId),
  saveTheme: (t) => ipcRenderer.invoke('theme:save', t),
  saveStats: (s) => ipcRenderer.invoke('stats:save', s),
  resetStats: () => ipcRenderer.invoke('stats:reset'),
  open: (url) => ipcRenderer.invoke('open', url),
  pickAsset: (kind) => ipcRenderer.invoke('asset:pick', kind),
  importCastZip: () => ipcRenderer.invoke('cast:importZip'),
  readAsset: (id) => ipcRenderer.invoke('asset:read', id),
  writeAsset: (name, b64) => ipcRenderer.invoke('asset:write', name, b64),
  onData: on('data'),
  onDayChanged: on('day-changed'),
  onAssistant: on('assistant'),
  onSettings: on('settings'),
  onChat: on('chat'),
  onStats: on('stats'),
  onUpdate: on('update'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
