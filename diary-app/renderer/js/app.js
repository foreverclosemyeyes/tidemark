// 메인 화면
(function () {
  const $ = (s) => document.querySelector(s);
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => new Date(s + 'T00:00:00');
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const WD_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const STATS = ['지식', '배짱', '손재주', '친절', '매력'];
  const S = (key, text, cls) => D.theme.styledText(key, text, cls);

  const state = (D.state = {
    theme: D.clone(D.DEFAULT_THEME),
    data: { days: {}, quests: [], weeks: [] },
    today: iso(new Date()),
    selected: iso(new Date()),
    viewMonth: iso(new Date()).slice(0, 7),
    stats: {},
    settings: {},
    hasKeys: {},
    lastAssistant: null,
    chat: [],
  });

  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), ms);
  }
  D.toast = toast;

  function count(items) {
    let total = 0, done = 0;
    const walk = (l) => (l || []).forEach((i) => { total++; if (i.checked) done++; walk(i.children); });
    walk(items);
    return { total, done };
  }
  function dayInfo(date) { return state.data.days[date]; }
  function mondayOf(date) {
    const d = parse(date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function dday(q) {
    const target = q.end || q.start;
    if (!target) return null;
    return Math.round((parse(target) - parse(state.today)) / 86400000);
  }

  // ---------- 왼쪽 ----------
  function renderLeft() {
    const t = parse(state.today);
    const big = $('#big-date'); big.innerHTML = '';
    big.appendChild(S('bigDate', String(t.getDate())));
    $('#md-month').replaceChildren(S('monthDay', `${t.getMonth() + 1}월`));
    $('#md-day').replaceChildren(S('monthDay', `${WD[t.getDay()]}요일`));
    $('#md-year').replaceChildren(S('body', `${t.getFullYear()} ${WD_EN[t.getDay()]}`));

    // 이번 주 월~금
    const strip = $('#week-strip'); strip.innerHTML = '';
    const mon = mondayOf(state.today);
    for (let i = 0; i < 5; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      const di = iso(d);
      const info = dayInfo(di);
      const c = count(info && info.items);
      const cell = h('div', 'wk' + (di === state.today ? ' today' : '') + (di === state.selected ? ' sel' : ''));
      cell.append(h('div', 'wd', WD_EN[d.getDay()]), h('div', 'dn', String(d.getDate())));
      cell.append(h('div', 'cnt', c.total ? `${c.done}/${c.total} 완료` : '—'));
      const bar = h('div', 'bar'); const fill = h('i'); fill.style.width = c.total ? `${(c.done / c.total) * 100}%` : '0'; bar.append(fill);
      cell.append(bar);
      cell.onclick = () => select(di);
      strip.append(cell);
    }

    // 이번 달 달력
    const [y, m] = state.viewMonth.split('-').map(Number);
    $('#mc-title').replaceChildren(S('section', `${y}.${pad(m)}`));
    const grid = $('#mc-grid'); grid.innerHTML = '';
    ['월', '화', '수', '목', '금', '토', '일'].forEach((w) => grid.append(h('div', 'mc-wd', w)));
    const first = new Date(y, m - 1, 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const last = new Date(y, m, 0);
    const cells = Math.ceil((((first.getDay() + 6) % 7) + last.getDate()) / 7) * 7;
    for (let i = 0; i < cells; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const di = iso(d);
      const info = dayInfo(di);
      const c = count(info && info.items);
      const cls = ['mc-d'];
      if (d.getMonth() !== m - 1) cls.push('out');
      if (d.getDay() === 0 || d.getDay() === 6) cls.push('we');
      if (di === state.today) cls.push('today');
      if (di === state.selected) cls.push('sel');
      const cell = h('div', cls.join(' '));
      cell.append(h('span', null, String(d.getDate())));
      if (c.total) { const dot = h('i', 'dot' + (c.done < c.total ? ' part' : '')); cell.append(dot); cell.title = `${c.done}/${c.total} 완료`; }
      if (eventsOn(di).length) cell.classList.add('has-ev');
      cell.onclick = () => select(di);
      grid.append(cell);
    }
  }

  // ---------- 일정 (노션 기간) ----------
  const isMeet = (e) => (e.tags || []).some((t) => /meeting|seminar/i.test(t));
  function eventsOn(date) { return (state.data.events || []).filter((e) => e.start <= date && e.end >= date); }
  // 달력 칸마다 겹치지 않게 줄(lane) 배정
  function assignLanes(evs) {
    const lanes = [];
    const out = new Map();
    for (const e of [...evs].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end))) {
      let i = lanes.findIndex((end) => end < e.start);
      if (i < 0) { i = lanes.length; lanes.push(e.end); } else lanes[i] = e.end;
      out.set(e.id, i);
    }
    return out;
  }

  // ---------- 큰 달력 ----------
  const MON_EN = ['JaN', 'FeB', 'MaR', 'aPR', 'MaY', 'JuN', 'JuL', 'auG', 'SeP', 'oCT', 'NoV', 'DeC']; // 요일 머리글처럼 대소문자 섞기
  function jitter(seedStr, range) {
    let h = 0; for (const ch of seedStr) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const r1 = ((h >>> 0) % 1000) / 1000, r2 = ((((h >>> 0) / 1000) | 0) % 1000) / 1000;
    return { rot: (r1 * 2 - 1) * range, dy: (r2 * 2 - 1) * range * 1.6 };
  }
  function renderBigCal() {
    if (state.theme.layout.mode !== 'bigcal') return;
    const [y, m] = state.viewMonth.split('-').map(Number);
    const sel = parse(state.selected);
    $('#bc-month-label').replaceChildren(S('calHead', MON_EN[m - 1]), S('body', ` ${y}`, 'bc-year'));
    const vq = viewedQuest(); // 업무 체크리스트를 보는 중이면 날짜 대신 업무 이름
    $('#bc-tag').replaceChildren(S('body', vq ? vq.name : `${sel.getMonth() + 1}/${sel.getDate()} (${WD[sel.getDay()]})${state.selected === state.today ? '  TODAY' : ''}`));
    $('#bc-tag').title = vq ? vq.name : '';

    const head = $('#bc-head'); head.innerHTML = '';
    const grid = $('#bc-grid'); grid.innerHTML = '';
    const J = state.theme.layout.calJitter;
    ['SuN', 'MoN', 'TuE', 'WeD', 'THu', 'FRi', 'SaT'].forEach((w, i) => { // 레퍼런스처럼 대소문자 섞기
      const cell = h('div', 'bc-h' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''));
      const j = jitter('h' + w.toUpperCase(), J);
      cell.style.transform = `translateY(${j.dy.toFixed(1)}px) rotate(${j.rot.toFixed(1)}deg)`;
      cell.append(S('calHead', w));
      grid.append(cell); // 요일도 숫자와 같은 칸에 → 열이 딱 맞음
    });
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const lead = first.getDay();
    const MAX_LANES = 3;
    const monthEvents = (state.data.events || []).filter((e) => e.end >= iso(first) && e.start <= iso(last));
    const lanes = assignLanes(monthEvents);
    const cellOf = new Map();
    const rows = Math.ceil((lead + last.getDate()) / 7);
    for (let r = 0; r < rows; r++) {
      let todayCol = -1;
      for (let c = 0; c < 7; c++) {
        const dayNum = r * 7 + c - lead + 1;
        const cell = h('div', 'bc-d');
        if (dayNum < 1 || dayNum > last.getDate()) { cell.classList.add('out'); cell.append(S('calNum', '00')); grid.append(cell); continue; }
        const d = new Date(y, m - 1, dayNum);
        const di = iso(d);
        if (c === 0) cell.classList.add('sun');
        if (c === 6) cell.classList.add('sat');
        if (di === state.today) { cell.classList.add('today'); todayCol = c; }
        if (di === state.selected) cell.classList.add('sel');
        const j = jitter(di, J);
        const rs = 1; // 모든 줄 같은 크기
        cell.style.transform = `translateY(${j.dy.toFixed(1)}px) rotate(${j.rot.toFixed(1)}deg) scale(${rs.toFixed(3)})`;
        cell.style.transformOrigin = '50% 85%';
        cell.append(S('calNum', String(dayNum)));
        cellOf.set(di, { cell, row: r, col: c });
        const evs = eventsOn(di);
        const hidden = evs.filter((e) => lanes.get(e.id) >= MAX_LANES).length;
        if (evs.length) cell.title = evs.map((e) => `• ${e.name}`).join('\n');
        const cnt = count(dayInfo(di) && dayInfo(di).items);
        if (cnt.total) { cell.append(h('i', 'dot' + (cnt.done < cnt.total ? ' part' : ''))); cell.title = `${cnt.done}/${cnt.total} 완료` + (cell.title ? '\n' + cell.title : ''); }
        cell.onclick = () => select(di);
        grid.append(cell);
      }
      if (todayCol >= 0) {
        const line = h('div', 'bc-line');
        line.style.setProperty('--x', `${((todayCol + 0.5) / 7) * 100}%`);
        grid.append(line);
      }
    }
    drawEventLines(monthEvents, lanes, cellOf, MAX_LANES, y, m);
    fitBigCal();
  }

  // 일정 선: 칸이 흔들려 있어도 끊기지 않게 주(줄)마다 한 번에 곧게 그림
  function drawEventLines(evs, lanes, cellOf, maxLanes, y, m) {
    const grid = $('#bc-grid');
    const layer = h('div', 'bc-evlayer');
    grid.append(layer);
    const rowsInfo = new Map(); // row → {left, right, top}
    for (const { cell, row } of cellOf.values()) {
      const info = rowsInfo.get(row) || { left: Infinity, right: -Infinity, top: Infinity };
      info.left = Math.min(info.left, cell.offsetLeft);
      info.right = Math.max(info.right, cell.offsetLeft + cell.offsetWidth);
      info.top = Math.min(info.top, cell.offsetTop);
      info.h = Math.max(info.h || 0, cell.offsetHeight);
      rowsInfo.set(row, info);
    }
    const center = (cell) => cell.offsetLeft + cell.offsetWidth / 2;
    const first = iso(new Date(y, m - 1, 1)), last = iso(new Date(y, m, 0));
    const days = (a, b) => Math.round((parse(b) - parse(a)) / 86400000) + 1;
    // 7일보다 긴 업무 기간은 선으로 그리지 않음 (날짜를 누르면 일정 버튼에는 나옴)
    const candidates = evs.filter((e) => days(e.start, e.end) <= 7);
    // 주(줄)마다 하나만: 미팅·세미나 먼저, 그다음 오늘 이후 가장 먼저 끝나는 것
    const segs = new Map();
    for (const e of candidates) {
      const s0 = e.start < first ? first : e.start, e0 = e.end > last ? last : e.end;
      const byRow = new Map();
      for (let d = parse(s0); iso(d) <= e0; d.setDate(d.getDate() + 1)) {
        const c = cellOf.get(iso(d)); if (!c) continue;
        const list = byRow.get(c.row) || []; list.push({ ...c, date: iso(d) }); byRow.set(c.row, list);
      }
      for (const [row, list] of byRow) {
        const score = (isMeet(e) ? 0 : 10) + (e.end >= state.today ? 0 : 5) + days(e.start, e.end) / 10;
        const cur = segs.get(row);
        if (!cur || score < cur.score) segs.set(row, { e, list, score });
      }
    }
    for (const [row, { e, list }] of segs) {
      const info = rowsInfo.get(row);
      const a = list[0], b = list[list.length - 1];
      const isStart = a.date === e.start, isEnd = b.date === e.end;
      const x1 = isStart ? center(a.cell) : info.left - 6;
      const x2 = isEnd ? center(b.cell) : info.right + 6;
      const top = info.top + info.h - 20;
      const cls = isMeet(e) ? ' meet' : '';
      if (x2 > x1) { const ln = h('i', 'ev-line' + cls); Object.assign(ln.style, { left: `${x1}px`, width: `${x2 - x1}px`, top: `${top}px` }); layer.append(ln); }
      if (isStart) { const d = h('i', 'ev-dot' + cls); Object.assign(d.style, { left: `${x1}px`, top: `${top}px` }); layer.append(d); }
      if (isEnd && e.end !== e.start) { const d = h('i', 'ev-dot' + cls); Object.assign(d.style, { left: `${x2}px`, top: `${top}px` }); layer.append(d); }
    }
  }

  function fitBigCal() {
    const box = $('#bigcal'), inner = $('#bc-inner');
    if (!box || state.theme.layout.mode !== 'bigcal') return;
    inner.style.transform = 'none';
    const bw = box.clientWidth; let bh = box.clientHeight;
    // 스킨 대화 구도: 달력은 초상화 머리 바로 위까지만 (마지막 줄이 초상화 뒤로 숨지 않게)
    const figEl = $('#asst-figure');
    if (figEl && figEl.offsetHeight && !$('#assistant').hidden && !document.body.classList.contains('char-hidden')) {
      const fr = figEl.getBoundingClientRect();
      bh = Math.max(120, Math.min(bh, fr.top - box.getBoundingClientRect().top + fr.height * 0.2));
    }
    const iw = inner.scrollWidth, ih = inner.scrollHeight;
    if (!iw || !ih) return;
    const t = state.theme.layout.calTilt;
    const rad = Math.abs(t) * Math.PI / 180; // 기울인 만큼 커지는 크기도 계산
    const rw = iw * Math.cos(rad) + ih * Math.sin(rad), rh = iw * Math.sin(rad) + ih * Math.cos(rad);
    // 가로는 폭에 맞추고, 세로는 남는 높이만큼 최대 35%까지 길쭉하게 늘려서 왼쪽을 꽉 채움
    const fx = Math.min((bw * 1.04) / rw, bh / rh * 1.6);
    const tall = 1.25; // 세로로 살짝만 늘림 (줄 간격이 벌어지지 않게)
    void 0; // 스킨 대화 구도에선 달력을 더 길쭉하게 해서 말풍선 위 빈자리를 채움
    const fy = Math.min(bh / rh, fx * tall); // 세로로 너무 늘어나지 않게
    inner.style.transformOrigin = '50% 50%';
    const ty = (rh * fy - ih) / 2 + 2;
    inner.style.transform = `translate(${(bw - iw) / 2}px, ${ty}px) scale(${(fx * 0.99).toFixed(4)}, ${(fy * 0.99).toFixed(4)}) rotate(${t}deg)`;
  }
  window.addEventListener('resize', () => fitBigCal());
  D.fitBigCal = fitBigCal;

  // ---------- 오른쪽 ----------
  // '→' 를 누르면 뜨는 작은 메뉴: 내일 / 다음 주 월요일 / 날짜 고르기
  function moveMenu(anchor, item, row) {
    const old = $('.mv-menu'); if (old) old.remove();
    const fromQuest = !!state.questView; // 업무 체크리스트의 항목 (노션 업무 페이지의 것이든 이 컴퓨터의 것이든)
    const base = parse(fromQuest ? state.today : state.selected);
    const next = new Date(base); do { next.setDate(next.getDate() + 1); } while (next.getDay() === 0 || next.getDay() === 6); // 다음 평일
    const mon = new Date(base); do { mon.setDate(mon.getDate() + 1); } while (mon.getDay() !== 1);
    const label = (d) => `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`;
    const menu = h('div', 'mv-menu');
    const go = async (date) => {
      menu.remove(); row.classList.add('busy');
      const r = await window.diary.moveTodo(item.id, date);
      row.classList.remove('busy');
      toast(r.ok ? `${label(parse(date))}로 넘겼어요.${r.created ? ` 노션에 "${r.created}" 페이지를 새로 만들었어요.` : ''}` : r.message, r.ok ? (r.created ? 5000 : 2500) : 6000);
    };
    const opt = (text, date) => { const b = h('button', null, text); b.onclick = (e) => { e.stopPropagation(); go(date); }; return b; };
    menu.append(h('b', null, fromQuest ? '어느 날의 할 일로 보낼까요?' : '언제로 넘길까요?'));
    if (fromQuest) menu.append(opt(`오늘  ${label(base)}`, iso(base)));
    menu.append(opt(`다음 날  ${label(next)}`, iso(next)));
    if (iso(mon) !== iso(next)) menu.append(opt(`다음 주 월요일  ${label(mon)}`, iso(mon)));
    const pick = h('input'); pick.type = 'date';
    pick.min = iso(new Date(base.getFullYear(), base.getMonth(), base.getDate() + (fromQuest ? 0 : 1)));
    pick.max = iso(new Date(base.getFullYear() + 2, base.getMonth(), base.getDate()));
    pick.onclick = (e) => e.stopPropagation();
    // 연도를 한 자씩 치는 동안에도 change 가 오므로(0002년 …) 범위 안의 날짜일 때만 넘김
    pick.onchange = () => { if (pick.value >= pick.min && pick.value <= pick.max) go(pick.value); };
    const pr = h('label', 'mv-pick'); pr.append(h('span', null, '날짜 고르기'), pick); menu.append(pr);
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth))}px`;
    menu.style.top = `${Math.min(innerHeight - menu.offsetHeight - 8, r.bottom + 6)}px`;
    const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', close, true); } };
    setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
  }
  function todoNode(item) {
    const wrap = document.createDocumentFragment();
    const row = h('div', 'todo' + (item.checked ? ' done' : ''));
    row.append(h('span', 'box', item.checked ? '✓' : ''));
    row.append(S('checklist', item.text, 'txt'));
    row.querySelector('.txt').title = item.text;
    const own = isQuestTodo(item) || state.data.local; // 이 컴퓨터에만 있는 항목
    const del = h('button', 'todo-del', '×'); del.title = own ? '이 항목 지우기' : '이 체크리스트 지우기 (노션에서도 지워져요)';
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`"${item.text}"${item.children && item.children.length ? ' (하위 항목 포함)' : ''}을(를) 지울까요?${own ? '' : '\n노션에서도 지워져요.'}`)) return;
      row.classList.add('busy');
      const r = await window.diary.deleteTodo(item.id);
      if (!r.ok) { row.classList.remove('busy'); toast(r.message, 5000); }
    };
    // 글 고치기: ✎ 를 누르면 그 자리에서 고침 (Enter 저장, Esc 취소)
    const ed = h('button', 'todo-ed', '✎'); ed.title = '글 고치기';
    ed.onclick = (e) => {
      e.stopPropagation();
      if (row.querySelector('.todo-edit')) return;
      const txt = row.querySelector('.txt');
      const inp = h('input', 'todo-edit'); inp.type = 'text'; inp.value = item.text; inp.maxLength = 300;
      let done = false;
      const finish = async (save) => {
        if (done) return; done = true;
        const v = inp.value.replace(/\s+/g, ' ').trim();
        inp.replaceWith(txt);
        if (renderRecord.stale) renderRecord(); // 고치는 동안 미뤄 둔 화면 갱신
        if (!save || !v || v === item.text) return;
        row.classList.add('busy');
        const r = await window.diary.editTodo(item.id, v);
        row.classList.remove('busy');
        if (!r.ok) toast(r.message, 5000);
      };
      inp.onclick = (ev) => ev.stopPropagation();
      inp.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') finish(true); else if (ev.key === 'Escape') finish(false); };
      inp.onblur = () => finish(true);
      txt.replaceWith(inp); inp.focus(); inp.select();
    };
    row.append(ed);
    // 다른 날짜로 넘기기 (안 끝난 것만)
    if (!item.checked) {
      const mv = h('button', 'todo-mv', '→'); mv.title = state.questView ? '날짜의 할 일로 보내기' : '다른 날짜로 넘기기';
      mv.onclick = (e) => { e.stopPropagation(); moveMenu(mv, item, row); };
      row.append(mv);
    }
    row.append(del);
    row.title = item.checked ? `눌러서 체크 풀기${own ? '' : ' (노션에도 반영)'}` : `눌러서 완료 체크${own ? '' : ' (노션에도 반영)'}`;
    row.onclick = async () => {
      if (!item.checked && D.fx) D.fx.burst(row.querySelector('.box'));
      row.classList.add('busy');
      const r = await window.diary.toggleTodo(item.id, !item.checked);
      row.classList.remove('busy');
      if (!r.ok) toast(r.message, 5000);
    };
    wrap.append(row);
    if (item.children && item.children.length) {
      const ch = h('div', 'todo-children');
      item.children.forEach((c) => ch.append(todoNode(c)));
      wrap.append(ch);
    }
    return wrap;
  }

  // ---------- 업무별 체크리스트 ----------
  // 진행 중 업무를 누르면 기록 카드가 그 업무의 체크리스트로 바뀜. 날짜를 누르면 날짜 기록으로 돌아감.
  // 노션 업무는 그 업무 페이지 안의 체크박스와 맞춰 쓰고(누를 때 읽어 옴), 노션 없이 만든 내 업무는 이 컴퓨터에만 저장
  const qKey = (q) => String(q.id).replace(/-/g, '');
  const questTodos = (q) => (state.data.questTodos || {})[qKey(q)] || [];
  const isQuestTodo = (item) => String(item.id).startsWith('qt-');
  function viewedQuest() { return state.questView ? visibleQuests().find((q) => qKey(q) === state.questView) || null : null; }
  function openQuest(q) {
    const same = state.questView === qKey(q);
    state.questView = qKey(q);
    $('#record').dataset.tab = 'log';
    renderAll();
    if (D.fx && !same) D.fx.swap('#record', 1);
    window.diary.openQuest(q.id); // 노션 업무면 그 페이지의 체크리스트를 읽어 옴 (끝나면 화면이 다시 그려짐)
  }
  function closeQuest() { state.questView = null; renderAll(); if (D.fx) D.fx.swap('#record', -1); }

  let stampDay = null; // 도장을 마지막으로 그린 날짜(또는 업무)
  function renderRecord() {
    const sel = parse(state.selected);
    const isToday = state.selected === state.today;
    const quest = viewedQuest();
    if (!quest) state.questView = null; // 보던 업무가 끝났거나 숨겨짐
    $('#record').classList.toggle('quest-view', !!quest);
    const titleEl = S('section', quest ? '업무 기록' : isToday ? '오늘의 기록' : '그날의 기록'); // 날짜는 오른쪽 위 날짜표에만
    // 레퍼런스의 'Daily Log' 처럼 한 글자에 회색 블록
    if (!state.theme.text.section.perChar) {
      const t = titleEl.textContent, k = t.lastIndexOf('기');
      if (k >= 0) { titleEl.textContent = t.slice(0, k); const b = h('span', 'tl-box', '기'); titleEl.append(b, document.createTextNode(t.slice(k + 1))); }
    }
    $('#record-title').replaceChildren(titleEl);
    const info = quest ? { items: questTodos(quest), url: quest.url } : dayInfo(state.selected);
    const sub = $('#record-sub'); sub.replaceChildren();
    if (quest) {
      const back = h('button', 'q-back', '← 날짜 기록'); back.onclick = closeQuest;
      const d = dday(quest);
      sub.append(back, h('span', 'q-view-name', quest.name), h('span', 'q-view-due', quest.end ? `마감 ${quest.end.slice(5).replace('-', '/')} · ${d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${-d}`}` : '마감일 없음'));
    }
    const c = count(info && info.items);
    const rc = $('#record-count'); rc.innerHTML = '';
    if (c.total) {
      if (c.done < c.total) rc.append(h('span', 'prog', `${c.done}/${c.total}`));
    }
    const evBox = $('#record-events'); evBox.innerHTML = '';
    for (const e of quest ? [] : eventsOn(state.selected)) {
      const chip = h('button', 'ev-chip' + (isMeet(e) ? ' meet' : ''), `${e.name}${e.start !== e.end ? ` ${e.start.slice(5).replace('-', '/')}–${e.end.slice(5).replace('-', '/')}` : ''}`);
      chip.title = '노션에서 열기';
      chip.onclick = () => window.diary.open(e.url);
      evBox.append(chip);
    }
    // 기록 화면 아래: 진행 중 업무 (마감 가까운 순 5개)
    const rq = $('#record-quests'); rq.innerHTML = '';
    const qs = visibleQuests();
    if (qs.length) {
      const head = h('div', 'rq-head');
      const more = h('button', 'rq-more', `ALL ${qs.length} →`);
      more.onclick = () => { $('#record').dataset.tab = 'quests'; };
      head.append(h('b', null, '진행 중 업무'), more);
      rq.append(head);
      const box = h('div', 'rq-list scroll'); rq.append(box);
      for (const q of qs) {
        const d = dday(q);
        const row = h('div', 'rq-row' + (d !== null && d <= 3 ? ' soon' : '') + (d !== null && d < 0 ? ' over' : ''));
        row.append(h('span', 'rq-name', q.name), h('span', 'rq-dd', d === null ? '—' : d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${-d}`));
        row.title = '눌러서 이 업무의 체크리스트 보기';
        row.onclick = () => openQuest(q);
        box.append(row);
      }
    }
    // 도장: 보고 있던 날의 마지막 할 일을 방금 끝냈을 때만 '쾅' 찍힘.
    // 다른 날로 넘어가서 이미 다 끝난 날을 볼 때는 넘어오는 움직임 하나만 나오게 도장은 조용히 보여 줌
    const stamp = $('#record-stamp');
    const allDone = c.total > 0 && c.done === c.total;
    const view = state.questView || state.selected;
    const sameDay = stampDay === view; stampDay = view;
    if (allDone) {
      const slam = stamp.hidden && sameDay;
      stamp.replaceChildren(S('stamp', state.theme.layout.stampText || 'DONE!!'));
      stamp.classList.toggle('still', !slam);
      stamp.hidden = false;
      if (slam && D.fx) D.fx.thud('#record');
    } else stamp.hidden = true;
    const list = $('#record-list');
    // 글을 고치는 중이면 목록은 그대로 둠 (동기화가 와서 치던 글이 사라지지 않게). 고치기가 끝나면 다시 그림
    renderRecord.stale = !!list.querySelector('.todo-edit');
    if (renderRecord.stale) { /* 아래 버튼만 갱신 */ }
    else if (info && info.items.length) list.replaceChildren(...info.items.map(todoNode));
    else {
      list.innerHTML = '';
      const qs = quest && (state.data.questState || {})[qKey(quest)]; // 노션 업무일 때만 있음
      const msg = quest ? (qs && qs.error ? `⚠ ${qs.error}` : qs && qs.loading ? '노션에서 이 업무의 체크리스트를 불러오는 중…'
        : `이 업무에서 할 일을 아래 칸에 적어 보세요.\n(${qs ? '노션의 이 업무 페이지에 체크리스트로 들어가요' : '이 컴퓨터에만 저장돼요'})`)
        : state.data.local ? '아래 칸에 할 일을 적어 보세요.'
        : (sel.getDay() === 0 || sel.getDay() === 6) ? '주말이에요. 푹 쉬어요!' : '이 날짜의 체크리스트가 없어요.';
      const e = h('div', 'empty'); e.append(S('body', msg)); e.style.whiteSpace = 'pre-line';
      const skE = (state.theme.layout.skin || {}).empty;
      if (skE) { const im = h('img', 'empty-tag'); im.src = skE; e.prepend(im); }
      list.append(e);
    }
    const btn = $('#btn-open-notion');
    btn.hidden = quest ? !quest.url : !!state.data.local; // 열 노션 페이지가 없으면 숨김
    btn.disabled = !info;
    btn.onclick = () => info && window.diary.open(info.url);
    $('#btn-today').hidden = isToday && state.viewMonth === state.today.slice(0, 7);
  }

  const hiddenIds = () => new Set(state.settings.hiddenQuests || []);
  const visibleQuests = () => { const hid = hiddenIds(); return (state.data.quests || []).filter((q) => !hid.has(String(q.id).replace(/-/g, ''))); };
  D.visibleQuests = visibleQuests;
  async function hideQuest(q) {
    const list = [...hiddenIds(), String(q.id).replace(/-/g, '')];
    const names = { ...(state.settings.hiddenQuestNames || {}), [String(q.id).replace(/-/g, '')]: q.name };
    state.settings = await window.diary.setSettings({ hiddenQuests: list, hiddenQuestNames: names });
    renderQuests(); renderRecord();
    toast(`"${q.name}" 숨김 · SETTING > 연결 > 숨긴 업무에서 되돌릴 수 있어요`, 3500);
  }

  // 진행 중 업무 추가 칸: 이름 + 마감일(안 넣어도 됨). Enter 로 추가
  function questForm() {
    const f = h('form', 'q-form');
    const name = h('input'); name.type = 'text'; name.placeholder = '업무 이름 (Enter)'; name.maxLength = 200;
    const due = h('input'); due.type = 'date'; due.title = '마감일 (안 넣어도 돼요)';
    f.append(name, due);
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!name.value.trim()) return;
      name.disabled = due.disabled = true;
      const r = await window.diary.addQuest(name.value, due.value);
      if (r.ok) { renderQuests.adding = false; toast(r.notion ? '노션 업무 DB에 추가했어요.' : '추가했어요.'); renderQuests(); }
      else { name.disabled = due.disabled = false; toast(r.message, 5000); }
    };
    f.focusName = () => name.focus();
    return f;
  }

  function renderQuests() {
    const quests = visibleQuests();
    const head = $('#quest-title'); head.innerHTML = '';
    const add = h('button', 'q-add', renderQuests.adding ? '×' : '+');
    add.title = renderQuests.adding ? '닫기' : '업무 추가';
    add.onclick = () => { renderQuests.adding = !renderQuests.adding; renderQuests(); if (renderQuests.form) renderQuests.form.focusName(); };
    head.append(S('section', '진행 중 업무'), add);
    const list = $('#quest-list');
    // 추가 칸은 한 번 만든 것을 그대로 둠: 동기화로 다시 그려져도 치던 글과 커서가 남음
    const form = renderQuests.form = renderQuests.adding ? (renderQuests.form || questForm()) : null;
    [...list.children].forEach((c) => { if (c !== form) c.remove(); });
    if (form && form.parentNode !== list) list.prepend(form);
    if (!quests.length && !renderQuests.adding) {
      const e = h('div', 'empty'); e.append(S('body', '진행 중인 업무가 없어요.'));
      list.append(e);
    }
    for (const q of quests) {
      const d = dday(q);
      const row = h('div', 'quest' + (d !== null && d <= 3 ? ' soon' : '') + (d !== null && d < 0 ? ' over' : '') + (state.questView === qKey(q) ? ' cur' : ''));
      row.append(S('quest', q.name));
      const meta = h('div', 'meta');
      meta.append(h('span', 'st', q.status || ''), h('span', null, q.end ? `마감 ${q.end.slice(5).replace('-', '/')}` : '마감일 없음'));
      const tc = count(questTodos(q)); // 이 업무의 체크리스트 진행
      if (tc.total) meta.append(h('span', 'q-prog' + (tc.done === tc.total ? ' all' : ''), `☑ ${tc.done}/${tc.total}`));
      row.append(meta);
      row.append(h('div', 'dd', d === null ? '—' : d === 0 ? 'D-DAY' : d > 0 ? `D-${d}` : `D+${-d}`));
      row.title = '눌러서 이 업무의 체크리스트 보기';
      row.onclick = () => openQuest(q);
      const x = h('button', 'q-hide', '×'); x.title = q.url ? '이 업무 숨기기 (휴지통에 있는 업무 등)' : '이 업무 지우기';
      x.onclick = async (e) => { e.stopPropagation(); if (q.url) hideQuest(q); else { await window.diary.removeQuest(q.id); toast(`"${q.name}" 지웠어요.`); } };
      row.append(x);
      list.append(row);
    }
  }

  // ---------- 아래 ----------
  function renderAssistant() {
    const a = state.theme.assistant;
    // 렌(캐릭터)은 키가 없어도 보이고, 말풍선·답하는 칸은 Claude 키가 있을 때만
    const fc = a.faces || {};
    const hasFace = !!(a.image || Object.values(fc).some(Boolean));
    const free = !state.hasKeys.anthropic; // 무료 모드: 정해진 문장, 대화창 대신 Claude 열기
    $('#assistant').hidden = !!state.settings.hideChar; // HIDE: 캐릭터뿐 아니라 말풍선·답하는 칸까지 통째로 숨김
    $('#asst-col').hidden = false;
    document.body.classList.toggle('free-mode', free);
    document.body.classList.remove('char-only');
    $('#chat-form').hidden = free;
    $('#btn-chatlog').hidden = free;
    $('#btn-claude').textContent = free ? 'Claude 채팅 열기 ↗' : 'Claude에서 열기 ↗';
    D.face.mount();
    $('#btn-hidechar').classList.toggle('on', !!state.settings.hideChar);

    // 이름표: 레퍼런스처럼 한 글자만 검은 칸에 흰 글씨
    { const chars = [...a.name], k = chars.length > 3 ? 2 : Math.max(0, chars.length - 1);
      $('#asst-name').replaceChildren(...chars.map((ch, n) => h('span', n === k && ch.trim() ? 'inv' : null, ch))); }
    $('#asst-name').title = '눌러서 다음 비서로 바꾸기';
    $('#asst-name').style.cursor = 'pointer';
    $('#asst-name').onclick = () => {
      const ids = D.castIds(state.theme), cur = state.theme.castActive || 'ren';
      D.castSwitch(state.theme, ids[(ids.indexOf(cur) + 1) % ids.length]);
      window.diary.saveTheme(state.theme); renderAll();
      if (D.settings && D.settings.redraw) D.settings.redraw(); // 열려 있는 설정창도 새 비서 것으로
      toast(`비서: ${state.theme.assistant.name}`);
    };
    const msg = state.lastAssistant;
    $('#asst-copy').hidden = !(msg && msg.draft); // 남이 보낸 글에 대한 답장을 써 줬을 때만
    // 새 말이 오면 말풍선이 꼬리 쪽에서 '탁' 펼쳐짐
    const stamp = msg ? `${msg.at || ''}|${msg.thinking ? 't' : ''}|${a.name}` : a.name;
    if (stamp !== renderAssistant._stamp) {
      renderAssistant._stamp = stamp;
      const b = $('#asst-bubble'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    }
    const text = $('#asst-text');
    text.classList.toggle('thinking', !!(msg && msg.thinking));
    { const n = msg && msg.text ? msg.text.length : 0; text.dataset.len = n > 90 ? 'long' : n > 45 ? 'mid' : 'short'; } // 긴 말은 글씨를 줄이고 말풍선을 키움
    let span = text.querySelector('.el-bubble');
    if (!span) { span = S('bubble', ''); text.replaceChildren(span); }
    if (msg && msg.thinking) { span.textContent = '생각하는 중…'; D.face.setMood('closed'); }
    else if (!D.face.onMessage(msg, span) && !D.face.isTyping()) {
      text.replaceChildren(S('bubble', msg ? msg.text : (state.hasKeys.anthropic ? '오늘 업무를 같이 확인해 드릴게요. "지금 확인해줘"를 누르거나 아래에 물어보세요.' : '"지금 확인해줘"를 누르면 오늘 할 일을 짚어 드릴게요.')));
    }
    const meta = $('#asst-meta');
    if (msg && msg.at && !msg.thinking) {
      const t = new Date(msg.at);
      meta.textContent = `${pad(t.getHours())}:${pad(t.getMinutes())}${msg.note ? ' — ' + msg.note : ''}`;
    } else meta.textContent = '';
    $('#chk-hourly').checked = !!state.settings.hourly;
    $('#btn-claude').hidden = !(D.asstWork(state.theme, state.settings).claudeUrl || !state.hasKeys.anthropic);
  }

  // 대화 기록: 화면 전체를 덮는 로그 화면. 왼쪽에 제목·날짜, 오른쪽에 말한 사람 이름(주황) + 대사, 내 말은 들여쓰기
  function renderChat() {
    const list = $('#chat-list'); list.innerHTML = '';
    const fmtDay = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
    const partOf = (d) => { const hr = d.getHours(); return hr < 5 ? '심야' : hr < 12 ? '오전' : hr < 18 ? '오후' : hr < 22 ? '저녁' : '밤'; };
    const msgs = state.chat.filter((m) => !(m.auto && m.role === 'user'));
    const last = msgs.length ? new Date(msgs[msgs.length - 1].at) : new Date();
    $('#log-date').textContent = fmtDay(last);
    $('#log-part').textContent = partOf(last);
    if (!msgs.length) list.append(h('div', 'log-empty', '아직 대화가 없어요. 아래 칸에 말을 걸어 보세요.'));
    let day = '';
    msgs.forEach((m, k) => {
      const d = new Date(m.at), key = iso(d);
      if (key !== day) { day = key; list.append(h('div', 'log-day', fmtDay(d))); }
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (m.role === 'user') {
        const el = h('div', 'log-me'); el.append(h('span', null, m.text), h('time', null, time));
        list.append(el);
      } else {
        const el = h('div', 'log-it' + (k === msgs.length - 1 ? ' cur' : ''));
        const who = h('div', 'log-who'); who.append(h('i'), h('b', null, m.name || state.theme.assistant.name), h('time', null, time));
        el.append(who, h('p', null, m.text));
        list.append(el);
      }
    });
    list.scrollTop = list.scrollHeight;
    logBar();
  }
  // 대화 기록의 스크롤 막대: 지금 보고 있는 위치만큼 안쪽 칸을 옮김
  function logBar() {
    const list = $('#chat-list'), thumb = $('.log-bar b');
    const h = Math.min(1, list.clientHeight / Math.max(1, list.scrollHeight));
    thumb.style.setProperty('--h', `${Math.max(12, h * 100)}%`);
    thumb.style.setProperty('--t', `${(list.scrollTop / Math.max(1, list.scrollHeight)) * 100}%`);
  }
  function openChat(on) {
    const log = $('#chat-log');
    if (log.parentElement !== document.body) document.body.append(log); // 화면 전체를 덮도록 맨 바깥으로
    $('#chat-list').onscroll = logBar;
    log.hidden = !on;
    if (on) renderChat();
  }

  // 인간 파라미터: 큰 별 + 다섯 꼭짓점 이름표 + 등급 이름
  // 랭크 2·3·4·5 가 되는 누적 포인트 (처음부터 쌓은 전체). 페르소나 5 로열의 기준을 그대로 씀 — 능력치마다 다르다
  const LV = { 지식: [0, 34, 82, 126, 192], 배짱: [0, 11, 38, 68, 113], 손재주: [0, 12, 34, 60, 87], 친절: [0, 14, 47, 94, 136], 매력: [0, 6, 52, 92, 132] };
  const lvOf = (st, v) => { const L = LV[st]; return v >= L[4] ? 5 : v >= L[3] ? 4 : v >= L[2] ? 3 : v >= L[1] ? 2 : 1; };
  const RANKS = { // 페르소나 5 로열 등급 이름을 우리말로 옮긴 것
    지식: ['무지한', '배운', '학자다운', '백과사전급', '박학다식'],
    배짱: ['소심한', '대담한', '굳건한', '두려움 없는', '사자의 심장'],
    손재주: ['서툰', '쓸 만한', '능숙한', '달인', '경지에 이른'],
    친절: ['무난한', '사려 깊은', '공감하는', '헌신적인', '천사 같은'],
    매력: ['존재감 있는', '눈길 가는', '세련된', '카리스마', '댄디한'],
  };
  D.paramRank = (s, lv) => RANKS[s][lv - 1];
  // 능력치 하나의 '자람' 0~1: Lv1 시작 = 0, Lv5 = 1. 등급 사이에서도 조금씩 자람
  const growOf = (st, v) => { const lv = lvOf(st, v || 0), L = LV[st]; if (lv >= 5) return 1; return (lv - 1 + ((v || 0) - L[lv - 1]) / (L[lv] - L[lv - 1])) / 4; };
  // 가운데 별의 꼭짓점 10개: 능력치마다(위·오른쪽·오른쪽 아래·왼쪽 아래·왼쪽) 끝이 그 능력치만큼 뻗음
  function statStarPts(totals, cx, cy, rMin, rMax, inner = 0.42, extra = null) { // extra: 능력치별로 끝을 더 내미는 길이 (포인트업 연출용)
    const tip = STATS.map((st, i) => rMin + (rMax - rMin) * growOf(st, totals[st]) + (extra ? extra[i] : 0));
    return Array.from({ length: 10 }, (_, k) => {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const i = k >> 1;
      const rad = k % 2 ? Math.min(tip[i], tip[(i + 1) % 5]) * inner * 0.5 + rMin * inner * 0.5 : tip[i];
      return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    });
  }
  function monthTotals(dateISO) { // 이름은 그대로지만 이제 처음부터 dateISO 까지의 전체 누적
    const month = '';
    const totals = Object.fromEntries(STATS.map((s) => [s, 0]));
    for (const [date, v] of Object.entries(state.stats)) {
      if (date > dateISO) continue;
      STATS.forEach((s) => { totals[s] += v[s] || 0; });
    }
    return totals;
  }
  D.monthTotals = monthTotals;
  D.lvOf = lvOf;

  function starPoints(cx, cy, R, r, rot = 0) {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + rot + (k * Math.PI) / 5;
      const rad = k % 2 ? r : R;
      pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`);
    }
    return pts.join(' ');
  }
  function starSvg(totals) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 300 300');
    svg.classList.add('pstar');
    const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.append(e); return e; };
    const C = 150, CY = 158, ratio = 0.4;
    const pt = (k, R, r) => { const a = -Math.PI / 2 + (k * Math.PI) / 5; const rad = k % 2 ? r : R; return [C + Math.cos(a) * rad, CY + Math.sin(a) * rad]; };
    const poly = (R, r) => Array.from({ length: 10 }, (_, k) => pt(k, R, r).map((v) => v.toFixed(1)).join(',')).join(' ');
    const defs = el('defs', {});
    const g = el('radialGradient', { id: 'psg', cx: '50%', cy: '52%', r: '60%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#6a6a6a' }, g);
    el('stop', { offset: '100%', 'stop-color': '#2c2c2c' }, g);
    // 큰 별 + 꼭짓점별 밝은 면(입체)
    el('polygon', { points: poly(148, 148 * ratio), class: 'ps-big' });
    for (let k = 0; k < 10; k += 2) {
      const a = pt(k, 148, 148 * ratio), b = pt(k + 1, 148, 148 * ratio);
      el('polygon', { points: `${C},${CY} ${a.join(',')} ${b.join(',')}`, class: 'ps-facet' });
    }
    el('polygon', { points: poly(148, 148 * ratio), class: 'ps-big-edge' });
    // 가운데서 꼭짓점으로 점선
    // 겹 별 + 꼭짓점 점
    [104, 82, 60].forEach((R, i) => {
      el('polygon', { points: poly(R, R * ratio), class: 'ps-ring ps-ring' + i });
    });
    // 가운데 별: 능력치마다 그쪽 꼭짓점이 뻗어 나감 (Lv1 = 가장 안쪽, Lv5 = 바깥 겹 별까지)
    const sp = statStarPts(totals, C, CY, 24, 104);
    for (let k = 0; k < 10; k++) {
      const a = sp[k], b = sp[(k + 1) % 10];
      el('polygon', { points: `${C},${CY} ${a.map((v) => v.toFixed(1)).join(',')} ${b.map((v) => v.toFixed(1)).join(',')}`, class: k % 2 ? 'ps-core-a' : 'ps-core-b' });
    }
    el('polygon', { points: sp.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '), class: 'ps-core-edge' });
    return svg;
  }

  function renderStats() {
    const head = $('#stats-title'); head.innerHTML = '';
    const sel = parse(state.selected);
    const lg = h('small', 'stats-legend');
    lg.textContent = '전체 누적';
    head.append(S('section', '인간 파라미터'), lg);
    const totals = monthTotals(state.selected);
    const today = state.stats[state.selected] || {};
    const list = $('#stats-list'); list.innerHTML = '';
    const wrap = h('div', 'pwrap');
    wrap.append(starSvg(totals));
    // 꼭짓점 위치 (%): 위, 오른쪽, 오른쪽 아래, 왼쪽 아래, 왼쪽
    const POS = [[50, 4], [84, 36], [72, 92], [28, 92], [16, 36]];
    STATS.forEach((s, i) => {
      const lv = lvOf(s, totals[s]);
      const box = h('div', 'plabel');
      box.style.left = POS[i][0] + '%'; box.style.top = POS[i][1] + '%';
      const tag = h('div', 'ptag');
      tag.append(h('span', 'pname', s), h('b', 'plv', String(lv)));
      box.append(tag, h('div', 'prank', RANKS[s][lv - 1]));
      const t = today[s] || 0;
      const ctl = h('div', 'pctl');
      const minus = h('button', 'minus', '−'); minus.title = `${s} 하나 빼기 (고른 날)`;
      const num = h('span', 'pnum', `${totals[s]}${t ? ` (+${t})` : ''}`);
      const plus = h('button', 'plus', '+'); plus.title = `${s} +1 (고른 날)`;
      minus.onclick = () => bump(s, -1);
      plus.onclick = () => bump(s, 1);
      ctl.append(minus, num, plus);
      box.append(ctl);
      wrap.append(box);
    });
    list.append(wrap);
    // 다음 등급까지
    const nx = h('div', 'pnext');
    STATS.forEach((st) => {
      const v = totals[st], lv = lvOf(st, v);
      const lo = LV[st][lv - 1], hi = lv < 5 ? LV[st][lv] : null;
      const row = h('div', 'pn-row');
      row.append(h('b', null, st), h('span', 'pn-rank', `Lv.${lv} ${RANKS[st][lv - 1]}`));
      const bar = h('div', 'pn-bar'); const fill = h('i');
      fill.style.width = hi ? `${((v - lo) / (hi - lo)) * 100}%` : '100%';
      bar.append(fill);
      row.append(bar, h('span', 'pn-num', hi ? `${v}/${hi}` : 'MAX'));
      nx.append(row);
    });
    list.append(nx);
  }

  // POINT UP!! / RANK UP!! 알림
  // POINT UP 연출: 검은 사선 띠 → 큰 별과 다섯 능력치 → 음표가 날아와 가운데 별이 금색으로 → 'POINT UP!!' 이 회색→흰색→노랑
  const NS_SVG = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS_SVG, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const starPts = (R, r, rot = -90) => Array.from({ length: 10 }, (_, k) => { const a = ((rot + k * 36) * Math.PI) / 180, q = k % 2 ? r : R; return [q * Math.cos(a), q * Math.sin(a)]; });
  // 음표 (레퍼런스 영상의 모양): 검은 8분음표에 주황 테두리, 머리에는 이빨을 드러낸 흰 웃음
  const NOTE_FLAG = 'M46 3 L90 42 L95 80 L84 86 L90 106 L74 84 L79 72 L63 54 L57 50 L61 104 L41 100 Z';
  const NOTE_HEAD = { cx: 34, cy: 107, rx: 30, ry: 23, transform: 'rotate(-16 34 107)' };
  function noteSvg(cls) {
    const n = svgEl('svg', { viewBox: '0 0 100 140', class: cls });
    const shape = (g) => { g.append(svgEl('path', { d: NOTE_FLAG }), svgEl('ellipse', NOTE_HEAD)); return g; };
    n.append(
      shape(svgEl('g', { class: 'n-out' })), shape(svgEl('g', { class: 'n-in' })), // 테두리를 먼저 통째로 깔고 그 위에 검은 몸
      svgEl('path', { d: 'M4 103 C12 128 46 134 66 106 C48 119 22 117 4 103 Z', class: 'n-grin' }),
      svgEl('path', { d: 'M11 109 L17 122 L22 113 L28 126 L33 116 L39 127 L44 116 L50 123 L54 112 L60 114', class: 'n-teeth' }),
    );
    return n;
  }
  // 음표 수는 이번에 오른 양을 따름 (게임과 같이 조금 오르면 1개, 많이 오르면 3개까지): 1점 → 1개, 2점 → 2개, 3점 이상 → 3개
  const noteCount = (ups) => Math.max(1, Math.min(3, ups.reduce((n, c) => n + (c.delta || 1), 0)));
  // 포인트업·랭크업 앞머리: 캐릭터 머리 위에서 작은 음표들이 까딱거리다가 화면 밖으로 크게 튀어나감
  function noteIntro(count, rank) {
    return new Promise((resolve) => {
      const fig = $('#asst-figure img'), r = fig && !$('#assistant').hidden ? fig.getBoundingClientRect() : null;
      const on = r && r.width > 0, vh = innerHeight / 100;
      // 머리 위 한 점. 캐릭터가 없거나 숨겨져 있으면 화면 왼쪽 가운데쯤
      const hx = on ? r.left + r.width * 0.5 : innerWidth * 0.3, hy = on ? r.top + r.height * 0.2 : innerHeight * 0.5;
      const layer = h('div', 'nt');
      // 음표 수별 자리: [머리에서 x·y(vh), 크기(vh), 기울기, 날아갈 곳 x·y(vh), 커지는 배율]
      const SPOTS = {
        1: [[0, -6, 11, 4, 40, -90, 3.8]],
        2: [[-5, -3, 10, -12, -70, 62, 4.6], [5, -6, 10, 10, 100, 30, 4.4]],
        3: [[-7, -2, 9, -14, -70, 62, 4.6], [0, -8, 11, 6, 40, -90, 3.8], [7, -1, 8, 18, 100, 30, 5]],
      };
      SPOTS[count].forEach(([x, y, w, rot, fx, fy, fs], k) => {
        const n = noteSvg('nt-note');
        Object.assign(n.style, { left: `${hx + x * vh}px`, top: `${hy + y * vh}px`, width: `${w}vh` });
        [['--r', rot + 'deg'], ['--d', k * 90 + 'ms'], ['--fx', fx + 'vh'], ['--fy', fy + 'vh'], ['--fs', fs]].forEach(([prop, v]) => n.style.setProperty(prop, v));
        layer.append(n);
      });
      if (rank) { // 랭크업: 머리 위 음표 둘레에 알록달록한 작은 별
        const sp = h('div', 'nt-spk'); Object.assign(sp.style, { left: `${hx}px`, top: `${hy - 5 * vh}px` });
        sparkles(sp, 9, 120, 50); layer.append(sp);
      }
      document.body.append(layer);
      setTimeout(() => layer.classList.add('fly'), 1150);
      setTimeout(() => { layer.remove(); resolve(); }, 1850);
    });
  }

  // ===== 포인트업 / 랭크업 / 랭크 MAX 별 화면 =====
  // 참고 영상 세 개(포인트업 · 랭크 MAX 에서의 포인트업 · 랭크업)를 한 프레임(1/30초)씩 재서 그대로 옮긴 것.
  // 길이 단위: 별 그림 판(-100~100)의 1 = 영상(720p)의 3.744px.
  const STAR = {
    // 다섯 꼭짓점 [방향(도. 오른쪽이 0, 아래로 +), 랭크 5 고리에서의 길이]: 지식(위) · 배짱(오른쪽) · 손재주(오른쪽 아래) · 친절(왼쪽 아래) · 매력(왼쪽).
    // 게임의 별은 반듯한 오각별이 아니라 손으로 오린 듯 방향과 길이가 조금씩 다르다
    TIP: [[-83.0, 52.1], [-15.4, 61.0], [58.9, 60.3], [131.9, 63.8], [-161.4, 53.4]],
    // 꼭짓점 사이 오목한 곳 [방향, 랭크 1 고리에서의 거리, 랭크 5 고리에서의 거리] (i 번째 = 꼭짓점 i 와 i+1 사이)
    DIP: [[-50, 8.8, 25.8], [17, 8.5, 25.2], [99, 8.4, 25.9], [165, 9.1, 26.5], [-122, 8.3, 23.0]],
    F1: 0.353,                                   // 랭크 1 고리의 꼭짓점 = 랭크 5 의 0.353배. 랭크마다 같은 간격으로 늘어남
    BIG: 1.9, BIG_DIP: [47.1, 53.0, 51, 51, 48.5], // 바깥의 큰 회색 별
    // 딱지 자리 (판의 %): 랭크 5 꼭짓점의 조금 바깥
    LABEL: [[54.4, 16], [85.7, 41.9], [69, 81.5], [27.7, 80], [18.6, 40.4]],
  };
  const polar = (deg, r) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
  // 자람 g(0 = 랭크 1 … 1 = 랭크 5)에 해당하는 고리 별의 꼭짓점 i · 오목한 점 j
  const tipAt = (i, g) => polar(STAR.TIP[i][0], STAR.TIP[i][1] * (STAR.F1 + (1 - STAR.F1) * g));
  const dipAt = (j, g) => polar(STAR.DIP[j][0], STAR.DIP[j][1] + (STAR.DIP[j][2] - STAR.DIP[j][1]) * g);
  const ringPts = (g, m = 1) => STAR.TIP.flatMap((_, i) => [tipAt(i, g), dipAt(i, g)]).map((p) => [p[0] * m, p[1] * m]);
  // 두 직선(p1-p2, p3-p4)이 만나는 점
  function cross(p1, p2, p3, p4) {
    const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
    if (Math.abs(d) < 1e-6) return null;
    const a = p1[0] * p2[1] - p1[1] * p2[0], b = p3[0] * p4[1] - p3[1] * p4[0];
    return [(a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / d, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / d];
  }
  // 능력치별 자람 gs[5] 로 만든 금색 별 (꼭짓점 · 오목한 점 번갈아 10개).
  // 꼭짓점은 그 능력치의 자람만큼, 오목한 점은 양쪽 꼭짓점의 변(각자 자기 고리의 변)이 만나는 곳
  function goldPts(gs) {
    return STAR.TIP.flatMap((_, i) => {
      const j = (i + 1) % 5, a = gs[i], b = gs[j];
      const hit = Math.abs(a - b) < 1e-4 ? null : cross(tipAt(i, a), dipAt(i, a), tipAt(j, b), dipAt(i, b));
      const lo = dipAt(i, Math.min(a, b)), hi = dipAt(i, Math.max(a, b));
      const ok = hit && Math.hypot(...hit) >= Math.hypot(...lo) - 0.5 && Math.hypot(...hit) <= Math.hypot(...hi) + 0.5;
      return [tipAt(i, a), ok ? hit : dipAt(i, (a + b) / 2)];
    });
  }
  // 박자 (금색 별이 생기는 순간부터의 ms). SWELL = [ms, 크기 배율]
  const PU = {
    HIT: 775,   // 화면이 뜬 뒤 첫 음표가 별 가운데에 닿는 때 = 금색 별이 생기는 때
    FLY: 375,   // 음표가 출발해서 가운데에 닿기까지 (CSS puNote 0.52초의 72% 지점)
    BEATS: [0, 130, 200],
    point: { // 포인트업: 1.28배까지 부풀어 0.13초 버티고 두 프레임 만에 제 크기로. 그 뒤 글자(흐림 → 흰색 → 노랑)
      swell: [[0, 0], [33, 0.56], [67, 0.84], [100, 1.13], [133, 1.21], [167, 1.28], [300, 1.28], [333, 1.27], [367, 1.17], [400, 1]],
      gleam: 420, title: [430, 500, 767, 1567], end: 2700, word: 'POINT UP!!', skin: 'pointup',
    },
    max: { // 랭크 MAX 에서의 포인트업: 움직임은 같고, 글자가 별이 부푼 동안에 먼저 나옴
      swell: [[0, 0], [33, 0.56], [67, 0.83], [100, 1.13], [133, 1.21], [167, 1.21], [200, 1.24], [233, 1.25], [367, 1.27], [400, 1]],
      gleam: 420, title: [200, 300, 567, 1367], end: 2500, word: 'RANK MAX!', skin: 'rankmax',
    },
    rank: { // 랭크업: 1.22배로 0.5초 넘게 버팀. 오른 능력치의 꼭짓점이 하얗게 멀리 뻗었다가 새 길이로 돌아와 남고, 글자가 걷힐 때 금색이 됨
      swell: [[0, 0], [33, 0.53], [67, 0.98], [100, 1.1], [133, 1.17], [167, 1.22], [700, 1.22], [733, 1.15], [767, 1]],
      gleam: 800, title: [630, 733, 967, 1767], end: 3100, word: 'RANK UP!!', skin: 'rankup',
      beam: [[0, 0.9], [33, 2.07], [100, 2.25], [667, 2.28], [700, 1.69], [733, 1.17], [767, 1]], // 흰 뻗음의 길이 (새 꼭짓점 길이의 배)
      label: 230, settle: 1530, // 딱지의 랭크가 바뀌는 때, 흰 부분이 금색이 되는 때
    },
  };
  const keyAt = (keys, ms) => { // [ms, 값] 목록에서 ms 때의 값 (사이는 곧게 이음)
    if (ms <= keys[0][0]) return keys[0][1];
    for (let k = 1; k < keys.length; k++) if (ms <= keys[k][0]) { const [t0, v0] = keys[k - 1], [t1, v1] = keys[k]; return v0 + ((v1 - v0) * (ms - t0)) / (t1 - t0); }
    return keys[keys.length - 1][1];
  };

  // kind: 'point' | 'max' | 'rank'.  totals = 오른 뒤의 누적, was = 오르기 전의 누적
  function pointUpShow(ups, totals, was, kind) {
    const sk = state.theme.layout.skin || {}, V = PU[kind];
    const box = h('div', 'pu ' + kind);
    box.append(h('div', 'pu-dim'), h('div', 'pu-band'));
    const stage = h('div', 'pu-stage');
    const svg = svgEl('svg', { viewBox: '-100 -100 200 200', class: 'pu-star' });
    const P = (pts) => pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
    const add = (parent, tag, attrs) => parent.appendChild(svgEl(tag, attrs));
    // 큰 회색 별 → 랭크 고리 다섯 겹(검정·회색 번갈아, 바깥이 랭크 5) → 고리 꼭짓점의 작은 점(랭크 눈금)
    add(svg, 'polygon', { points: P(STAR.TIP.flatMap(([dir, len], i) => [polar(dir, len * STAR.BIG), polar(STAR.DIP[i][0], STAR.BIG_DIP[i])])), class: 'pu-big' });
    for (let k = 4; k >= 0; k--) add(svg, 'polygon', { points: P(ringPts(k / 4)), class: 'pu-tier ' + (k % 2 ? 'g' : 'k') });
    for (let k = 0; k < 5; k++) STAR.TIP.forEach((_, i) => { const [x, y] = tipAt(i, k / 4); add(svg, 'circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 0.7, class: 'pu-mark' }); });
    // 금색 별: 꼭짓점이 능력치마다 그만큼 뻗음. 랭크업은 오르기 전 모양으로 시작해서 끝에 새 모양이 됨
    const gNow = STATS.map((st) => growOf(st, totals[st] || 0)), gWas = STATS.map((st) => growOf(st, was[st] || 0));
    const rankI = kind === 'rank' ? STATS.findIndex((st) => lvOf(st, totals[st] || 0) > lvOf(st, was[st] || 0)) : -1;
    const beam = rankI >= 0 ? add(svg, 'polygon', { class: 'pu-beam' }) : null; // 금색 별 밑에 깔림 (밑동은 가려짐)
    const gold = add(svg, 'g', { class: 'pu-gold' });
    const faces = Array.from({ length: 10 }, (_, k) => add(gold, 'polygon', { class: k % 2 ? 'f1' : 'f2' }));
    const marks = add(gold, 'g', {});
    const drawGold = (gs, fresh = -1) => {
      const gp = goldPts(gs);
      // 면: 꼭짓점 i 의 양쪽. 시계 방향 쪽이 밝고 반대쪽이 어두움
      faces.forEach((f, k) => { const i = k >> 1; f.setAttribute('points', P(k % 2 ? [[0, 0], gp[2 * i], gp[2 * i + 1]] : [[0, 0], gp[(2 * i + 9) % 10], gp[2 * i]])); f.classList.toggle('new', i === fresh); });
      // 지나온 랭크의 눈금 점 (꼭짓점 가운데 줄 위)
      marks.replaceChildren();
      gs.forEach((g, i) => { for (let k = 0; k < 5; k++) if (k / 4 < g - 0.04) { const [x, y] = tipAt(i, k / 4); add(marks, 'circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 0.7, class: 'gm' }); } });
    };
    drawGold(rankI >= 0 ? gWas : gNow);
    // 가운데의 밝은 작은 별 (제 크기로 돌아온 뒤 번져 나옴)
    const core = ringPts(0, 0.72);
    core.forEach((pt, k) => add(gold, 'polygon', { points: P([[0, 0], pt, core[(k + 1) % 10]]), class: k % 2 ? 'g1' : 'g2' }));
    // 큰 별 다섯 끝의 어두운 그림: 안경(지식) · 번개(배짱) · 톱니(손재주) · 하트(친절) · 반짝임(매력)
    const ICONS = [
      'M-9 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 M1 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0 M-1 -1 h2',
      'M2 -9 L-5 1 H0 L-2 9 L6 -2 H1 Z',
      'M0 -8 L2 -5 L5 -6 L5 -2 L8 0 L5 2 L5 6 L2 5 L0 8 L-2 5 L-5 6 L-5 2 L-8 0 L-5 -2 L-5 -6 L-2 -5 Z M-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0',
      'M0 7 C-10 0 -8 -8 -3 -7 C-1 -7 0 -5 0 -4 C0 -5 1 -7 3 -7 C8 -8 10 0 0 7 Z',
      'M0 -9 L2 -2 L9 0 L2 2 L0 9 L-2 2 L-9 0 L-2 -2 Z',
    ];
    ICONS.forEach((d, i) => { const [x, y] = polar(STAR.TIP[i][0], STAR.TIP[i][1] * 1.52); add(svg, 'path', { d, class: 'pu-ico', 'fill-rule': 'evenodd', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(1.25)` }); });
    stage.append(svg);
    // 다섯 능력치 딱지
    const upped = new Set(ups.map((c) => c.stat));
    const labels = STATS.map((sName, i) => {
      const lab = h('div', 'pu-lab' + (upped.has(sName) ? ' up' : ''));
      lab.style.left = `${STAR.LABEL[i][0]}%`; lab.style.top = `${STAR.LABEL[i][1]}%`;
      lab.style.setProperty('--d', `${i * 45}ms`); lab.style.setProperty('--r', `${[-8, 6, -5, 7, -6][i]}deg`);
      const fill = (v) => { const lv = lvOf(sName, v || 0); const tag = h('b', null, sName); tag.append(h('i', null, lv >= 5 ? 'MAX' : String(lv))); lab.replaceChildren(tag, h('span', null, RANKS[sName][lv - 1] || '')); lab.classList.toggle('max', lv >= 5); };
      fill(i === rankI ? was[sName] : totals[sName]);
      stage.append(lab);
      return { el: lab, fill };
    });
    // 음표들이 화면 밖에서 크게 날아와 별 가운데에 납작하게 꽂힘 (첫 음표가 닿는 순간 금색 별이 생김)
    const notes = noteCount(ups);
    [[-120, 70, -28], [-115, -45, 22], [25, -125, -10]].slice(0, notes).forEach(([x, y, r], k) => {
      const n = noteSvg('pu-note');
      [['--x', x + 'vh'], ['--y', y + 'vh'], ['--r', r + 'deg'], ['--d', PU.HIT + PU.BEATS[k] - PU.FLY + 'ms']].forEach(([prop, v]) => n.style.setProperty(prop, v));
      stage.append(n);
    });
    // 랭크업: 음표 둘레에 알록달록한 작은 별들이 반짝임
    if (kind === 'rank') sparkles(stage, 14, PU.HIT - 260, 46);
    // 글자: 스킨 그림이 있으면 그 모양을(흰 그림을 틀로 써서 색을 입힘), 없으면 글자로
    const title = h('div', 'pup-title pu-title');
    if (sk[V.skin]) {
      title.classList.add('img');
      if (sk[V.skin + '-bg']) { const bg = h('i', 'pup-bg'); bg.style.setProperty('--m', `url("${sk[V.skin + '-bg']}")`); title.append(bg); }
      const fg = h('i', 'pup-fg'); fg.style.setProperty('--m', `url("${sk[V.skin]}")`); title.append(fg);
    } else Array.from(V.word).forEach((ch, k) => {
      const sp = h('span', ch === ' ' ? 'sp' : (k % 3 === 1 ? 'alt' : ''), ch);
      sp.style.setProperty('--r', `${[-6, 4, -3, 7, -5, 3, -8, 5, -2, 6][k % 10]}deg`);
      title.append(sp);
    });
    stage.append(title);
    box.append(stage);
    const what = ups.slice(-2).map((c) => c.text).filter(Boolean).join(' · ');
    if (what) box.append(h('div', 'pu-what', what));
    const timers = []; let raf = 0;
    const close = () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); box.classList.add('out'); setTimeout(() => box.remove(), 320); };
    box.onclick = close;
    document.body.append(box);
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const at = (ms, cls) => later(ms, () => box.classList.add(cls));
    void box.offsetWidth; // 처음 상태를 한 번 그린 뒤에 시작
    box.classList.add('in');
    const T = PU.HIT, span = V.swell[V.swell.length - 1][0];
    later(T, () => {
      gold.animate(V.swell.map(([ms, sc]) => ({ scale: String(sc), offset: ms / span })), { duration: span, fill: 'forwards' });
      if (!beam) return;
      // 흰 뻗음: 오른 능력치의 꼭짓점이 새 길이의 2배 넘게 뻗었다가, 별이 제 크기로 돌아올 때 새 길이로 줄어들어 남음
      const t0 = performance.now(), tipNew = tipAt(rankI, gNow[rankI]), end = V.beam[V.beam.length - 1][0];
      const base = [dipAt((rankI + 4) % 5, gWas[rankI]), dipAt(rankI, gWas[rankI])];
      const draw = () => {
        const ms = performance.now() - t0, m = keyAt(V.beam, ms);
        beam.setAttribute('points', P([base[0], [tipNew[0] * m, tipNew[1] * m], base[1]]));
        raf = ms < end && box.isConnected ? requestAnimationFrame(draw) : 0;
      };
      draw();
    });
    at(T, 'gold'); at(T + V.gleam, 'gleam');
    at(T + V.title[0], 't1'); at(T + V.title[1], 't2'); at(T + V.title[2], 't3'); at(T + V.title[3], 'tout');
    if (rankI >= 0) {
      later(T + V.label, () => { labels[rankI].fill(totals[STATS[rankI]]); labels[rankI].el.classList.add('pop'); });
      later(T + V.settle, () => { drawGold(gNow, rankI); box.classList.add('settled'); }); // 흰 부분이 금색으로
    }
    later(T + V.end, close);
  }
  // 알록달록한 작은 별들 (랭크업). 가운데 둘레에 흩어져 반짝이며 바깥으로 살짝 밀려남
  function sparkles(parent, count, startMs, spread) {
    const COLORS = ['#7df25c', '#ffd84a', '#ff7b9c', '#ffe98a'];
    for (let k = 0; k < count; k++) {
      const s = svgEl('svg', { viewBox: '-10 -10 20 20', class: 'pu-spk' });
      s.append(svgEl('polygon', { points: starPts(9, 3.8).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ') }));
      const a = Math.random() * Math.PI * 2, r = spread * (0.35 + Math.random() * 0.65);
      [['--x', `${(Math.cos(a) * r).toFixed(1)}%`], ['--y', `${(Math.sin(a) * r * 0.8 - 6).toFixed(1)}%`], ['--s', (0.5 + Math.random() * 0.8).toFixed(2)], ['--c', COLORS[k % COLORS.length]],
        ['--d', `${Math.round(startMs + Math.random() * 520)}ms`], ['--r', `${Math.round(Math.random() * 360)}deg`]].forEach(([prop, v]) => s.style.setProperty(prop, v));
      parent.append(s);
    }
  }

  let introUps = null; // 음표 앞머리가 도는 동안 들어온 포인트업을 모아 뒀다가 한 번에 보여 줌
  function pointUp(ups, afterIntro) {
    if (!ups.length) return;
    if (!afterIntro && D.fx && D.fx.on()) {
      if (introUps) { introUps.push(...ups); return; }
      introUps = [...ups];
      // 앞머리가 도는 동안 더 들어오면 별 화면의 음표 수에는 반영됨
      noteIntro(noteCount(ups), puKind(ups).kind === 'rank').then(() => { const all = introUps; introUps = null; pointUp(all, true); });
      return;
    }
    document.querySelectorAll('.pu').forEach((e) => e.remove());
    const { totals, was, kind } = puKind(ups);
    pointUpShow(ups, totals, was, kind);
  }
  // 이번에 오른 것(ups)으로 어떤 화면인지 정함: 랭크가 오른 능력치가 있으면 랭크업,
  // 오른 능력치가 모두 이미 MAX 였으면 'RANK MAX!', 아니면 포인트업. (totals = 오른 뒤, was = 오르기 전)
  function puKind(ups) {
    const totals = monthTotals(state.today);
    const was = { ...totals }; for (const c of ups) was[c.stat] = Math.max(0, (was[c.stat] || 0) - (c.delta || 1));
    const stats = [...new Set(ups.map((c) => c.stat))];
    const kind = stats.some((st) => lvOf(st, totals[st] || 0) > lvOf(st, was[st] || 0)) ? 'rank'
      : stats.every((st) => lvOf(st, was[st] || 0) >= 5) ? 'max' : 'point';
    return { totals, was, kind };
  }
  D.pointUp = pointUp;

  // ---------- 인간 파라미터 전체 화면 (레퍼런스 구성) ----------
  function bigStarSvg(totals) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-20 -20 640 620');
    svg.classList.add('ps2-star');
    const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
    const C = 300, CY = 318, ratio = 0.42;
    const pt = (k, R, r) => { const a = -Math.PI / 2 + (k * Math.PI) / 5; const rad = k % 2 ? r : R; return [C + Math.cos(a) * rad, CY + Math.sin(a) * rad]; };
    const poly = (R, r) => Array.from({ length: 10 }, (_, k) => pt(k, R, r).map((v) => v.toFixed(1)).join(',')).join(' ');
    el('polygon', { points: poly(300, 300 * ratio), class: 's-big' });
    // 겹 별: 회색 띠 + 검은 틈 (바깥 → 안)
    [[150, 'ring'], [132, 'gap'], [118, 'ring'], [100, 'gap'], [86, 'ring'], [68, 'gap']].forEach(([R, c]) => el('polygon', { points: poly(R, R * ratio), class: 's-' + c }));
    // 가운데 노란 별: 능력치마다 그쪽 꼭짓점이 뻗어 나감 (Lv1 = 가장 안쪽, Lv5 = 바깥 겹 별까지)
    const sp = statStarPts(totals, C, CY, 50, 150, 0.45);
    for (let k = 0; k < 10; k++) {
      const a = sp[k], b = sp[(k + 1) % 10];
      el('polygon', { points: `${C},${CY} ${a.map((v) => v.toFixed(1)).join(',')} ${b.map((v) => v.toFixed(1)).join(',')}`, class: k % 2 ? 's-core-a' : 's-core-b' });
    }
    return svg;
  }

  function openParams() {
    const old = document.querySelector('.ps2'); if (old) old.remove();
    D.fx && D.fx.wipe();
    const totals = monthTotals(state.today);
    const today = state.stats[state.today] || {};
    const scr = h('div', 'ps2');
    scr.append(h('div', 'ps2-band'));
    const stage = h('div', 'ps2-stage');
    stage.append(bigStarSvg(totals));
    // 꼭짓점 위치 (%): 위, 오른쪽, 오른쪽 아래, 왼쪽 아래, 왼쪽 — 레퍼런스처럼 꼭짓점 안쪽에
    const POS = [[50, 15], [79, 40], [68, 80], [32, 80], [21, 40]];
    STATS.forEach((st, i) => {
      const lv = lvOf(st, totals[st]);
      const box = h('div', 'ps2-label');
      box.style.left = POS[i][0] + '%'; box.style.top = POS[i][1] + '%';
      const tag = h('div', 'ps2-tag');
      tag.append(h('span', 'ps2-name', st), h('b', 'ps2-lv', String(lv)));
      box.append(tag, h('div', 'ps2-rank', RANKS[st][lv - 1]));
      const ctl = h('div', 'ps2-ctl');
      const minus = h('button', null, '−'), plus = h('button', 'plus', '+');
      minus.title = `${st} 하나 빼기`; plus.title = `${st} +1`;
      minus.onclick = (e) => { e.stopPropagation(); bump(st, -1, state.today); openParams(); };
      plus.onclick = (e) => { e.stopPropagation(); bump(st, 1, state.today); openParams(); };
      ctl.append(minus, h('span', null, `${totals[st]}${today[st] ? ` (+${today[st]})` : ''}`), plus);
      box.append(ctl);
      stage.append(box);
    });
    scr.append(stage);
    const head = h('div', 'ps2-head');
    head.append(h('b', null, '인간 파라미터'), h('span', null, '전체 누적 · 다음 랭크까지 꾸준히'));
    scr.append(head);
    const close = h('button', 'ps2-close', '닫기');
    close.onclick = () => scr.remove();
    scr.append(close);
    scr.addEventListener('keydown', (e) => { if (e.key === 'Escape') scr.remove(); });
    window.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { scr.remove(); window.removeEventListener('keydown', esc); } });
    document.body.append(scr);
    requestAnimationFrame(() => scr.classList.add('in'));
  }
  D.openParams = openParams;

  function bump(stat, delta, date = state.selected) {
    const d = (state.stats[date] = state.stats[date] || {});
    d[stat] = Math.max(0, (d[stat] || 0) + delta);
    window.diary.saveStats(state.stats);
    renderStats();
    if (delta > 0 && date <= state.today) pointUp([{ stat, delta: 1, text: '' }]); // 누적은 오늘까지만 세므로, 앞날에 적은 건 그날이 돼야 오름
  }

  async function relogin() {
    if (relogin.busy) return;
    relogin.busy = true;
    toast('브라우저에서 노션 "허용"을 눌러 주세요…', 9000);
    const r = await window.diary.notionLogin();
    relogin.busy = false;
    if (r.ok) { state.notionLogin = true; state.hasKeys.notion = true; toast('노션에 다시 연결했어요. 불러오는 중…'); }
    else toast(r.message, 6000);
  }
  function renderSync() {
    const el = $('#sync-status');
    const d = state.data;
    el.classList.toggle('err', !!d.error);
    $('#btn-refresh').classList.toggle('spin', !!d.syncing);
    let txt = '';
    if (d.error) txt = '⚠ ' + d.error;
    else if (d.syncing) txt = '동기화 중…';
    else if (d.lastSync) { const t = new Date(d.lastSync); txt = `마지막 동기화 ${pad(t.getHours())}:${pad(t.getMinutes())}`; }
    el.textContent = txt.length > 70 ? txt.slice(0, 70) + '…' : txt;
    el.title = d.error || '';
    // 기록 카드 아래 SYNC 글자: 노션 로그인이 풀리면 그 자리가 '다시 로그인' 버튼이 됨. 그 밖의 오류는 ⚠ 만 (자세한 건 마우스를 올리면)
    const rs = $('#record-sync');
    rs.classList.toggle('relogin', !!d.relogin);
    rs.title = d.error || '';
    if (d.relogin) { rs.textContent = '노션 다시 로그인 ↗'; rs.onclick = relogin; state.notionLogin = false; }
    else { rs.onclick = null; rs.textContent = d.lastSync ? `SYNC ${pad(new Date(d.lastSync).getHours())}:${pad(new Date(d.lastSync).getMinutes())}${d.error ? ' ⚠' : ''}` : ''; }
    if (d.relogin && !renderSync.told) toast('노션 로그인이 풀렸어요. 기록 카드 아래 "노션 다시 로그인"을 눌러 주세요.', 9000);
    renderSync.told = !!d.relogin;
    $('#btn-pin').classList.toggle('on', !!state.settings.alwaysOnTop);
  }

  // 큰 달력 레이아웃에서는 '진행 중 업무'·'인간 파라미터'를 노트 탭 안으로
  function arrange() {
    const big = state.theme.layout.mode === 'bigcal';
    const q = $('#quests'), st = $('#stats');
    if (big) {
      // 진행 중 업무는 노트 아래 따로 놓인 두 번째 종이
      if (q.previousElementSibling !== $('#record') || q.parentElement !== $('#right')) $('#record').after(q);
      if (st.parentElement !== $('.nb-pane[data-pane="params"]')) $('.nb-pane[data-pane="params"]').append(st);
    } else {
      if (q.parentElement !== $('#right')) $('#right').append(q);
      if (st.parentElement !== $('#bottom')) $('#bottom').append(st);
    }
  }
  D.arrange = arrange;

  function renderAll() {
    arrange();
    renderLeft(); renderBigCal(); renderRecord(); renderQuests(); renderAssistant(); renderStats(); renderSync();
    requestAnimationFrame(fitBigCal); // 아래 줄 높이가 바뀐 뒤 달력 크기 다시 맞춤
    D.bubble && D.bubble.update();
  }
  D.renderAll = renderAll;
  D.onFontsChanged = () => renderAll();

  function select(date) {
    const prev = state.selected;
    state.questView = null;
    state.selected = date;
    if (date.slice(0, 7) !== state.viewMonth) state.viewMonth = date.slice(0, 7);
    window.diary.setView({ selected: date, month: state.viewMonth });
    renderAll();
    if (D.fx && prev !== date) D.fx.swap('#record', date < prev ? -1 : 1);
  }
  function goToday() { select(state.today); }
  D.goToday = goToday;

  function shiftMonth(delta) {
    const [y, m] = state.viewMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    state.viewMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    window.diary.setView({ month: state.viewMonth });
    renderLeft(); renderBigCal(); renderRecord();
    D.fx && D.fx.swap('#bc-grid', delta);
  }

  function dayChanged(newToday) {
    if (newToday === state.today) return;
    state.today = newToday;
    state.selected = newToday;
    state.viewMonth = newToday.slice(0, 7);
    window.diary.setView({ selected: newToday, month: state.viewMonth });
    D.theme.renderBackground(state.theme);
    renderAll();
    D.cutscene && D.cutscene.maybePlay();
  }

  // ---------- 시작 ----------
  async function start() {
    const init = await window.diary.init();
    document.body.classList.toggle('mac', init.platform === 'darwin');
    state.platform = init.platform;
    state.version = init.version;
    state.settings = init.settings || {};
    state.notionCfg = init.notionCfg;
    state.hasKeys = init.hasKeys;
    state.notionLogin = init.notionLogin;
    state.stats = init.stats || {};
    state.lastAssistant = init.lastAssistant;
    state.chat = init.chat || [];
    state.memory = init.memory || {};
    state.data = init.data;
    state.today = init.data.today || state.today;
    state.selected = state.today;
    state.viewMonth = state.today.slice(0, 7);
    if (init.theme) { state.theme = D.mergeDefaults(D.DEFAULT_THEME, init.theme); if (D.migrateTheme(state.theme)) window.diary.saveTheme(state.theme); }
    // 예전 기본 말투(반말·명랑)를 쓰던 경우 새 기본 말투로 바꿔 줌
    if (state.theme.assistant.tone === '다정하고 씩씩한 반말. 짧고 명랑하게, 가끔 응원 한마디.') {
      state.theme.assistant.tone = D.DEFAULT_THEME.assistant.tone;
      if (state.theme.assistant.name === '모모') state.theme.assistant.name = D.DEFAULT_THEME.assistant.name;
      window.diary.saveTheme(state.theme);
    }
    // 캐릭터를 한 번 키워 줌 (기본 크기 그대로 쓰던 경우만)
    if (!state.theme.sizeBumped) {
      state.theme.sizeBumped = true;
      if (state.theme.assistant.size === 300) state.theme.assistant.size = 400;
      for (const c of Object.values(state.theme.cast || {})) if (c && c.size === 300) c.size = 400;
      window.diary.saveTheme(state.theme);
    }
    // 비서 4명 말투를 처음 한 번 맞춰 줌 (지금 비서 = 렌)
    if (!state.theme.castReady) {
      state.theme.castReady = true;
      if ((state.theme.castActive || 'ren') === 'ren') {
        state.theme.assistant.tone = D.CAST[0][2];
        state.theme.assistant.name = D.CAST[0][1];
      }
      window.diary.saveTheme(state.theme);
    }
    D.theme.apply(state.theme);
    renderAll();
    D.settings && D.settings.init();
    document.fonts.ready.then(() => (D.cutscene && D.cutscene.maybePlay())).then(() => D.fx && D.fx.intro());

    window.diary.onData((d) => { state.data = d; if (d.today && d.today !== state.today) dayChanged(d.today); renderAll(); });
    window.diary.onDayChanged(({ today }) => dayChanged(today));
    window.diary.onAssistant((m) => { state.lastAssistant = m; renderAssistant(); });
    window.diary.onSettings((s) => { state.settings = s; renderAssistant(); renderSync(); renderQuests(); D.settings && D.settings.refresh && D.settings.refresh(); });

    $('#btn-refresh').onclick = () => { window.diary.sync(true); };
    $('#btn-today').onclick = goToday;
    $('#mc-prev').onclick = () => shiftMonth(-1);
    $('#mc-next').onclick = () => shiftMonth(1);
    document.querySelectorAll('.nb-tabs button').forEach((b) => { b.onclick = () => { if (b.dataset.tab === 'params' && state.theme.layout.mode === 'bigcal') { openParams(); return; } $('#record').dataset.tab = b.dataset.tab; }; });
    $('#todo-add').onsubmit = async (e) => {
      e.preventDefault();
      const inp = $('#todo-add-input');
      const text = inp.value.trim(); if (!text) return;
      inp.disabled = true;
      const r = state.questView ? await window.diary.addQuestTodo(state.questView, text) : await window.diary.addTodo(state.selected, text);
      inp.disabled = false;
      if (r.ok) { inp.value = ''; inp.focus(); if (r.created) toast(`노션에 "${r.created}" 페이지를 새로 만들었어요. (상태: 시작 전)`, 5000); } else toast(r.message, 5000);
    };
    $('#bc-prev').onclick = () => shiftMonth(-1);
    $('#bc-next').onclick = () => shiftMonth(1);
    document.fonts.ready.then(fitBigCal);
    $('#btn-ask').onclick = () => window.diary.askAssistant();
    window.diary.onStats(({ stats, changes }) => {
      state.stats = stats;
      renderStats();
      const ups = changes.filter((c) => c.delta > 0 && c.date && c.date.slice(0, 7) === state.today.slice(0, 7));
      if (ups.length && ups.length <= 5) pointUp(ups);
    });
    const showUpdate = (u) => {
      state.update = u || {};
      const b = $('#btn-update');
      b.hidden = !(u && (u.available || u.installing));
      b.textContent = u && u.installing ? `UPDATING ${u.progress || 0}%` : `UPDATE ${u && u.latest ? 'v' + u.latest : ''}`;
      b.disabled = !!(u && u.installing);
      if (D.settings && D.settings.refresh) D.settings.refresh();
    };
    showUpdate(init.update);
    window.diary.onUpdate(showUpdate);
    $('#btn-update').onclick = async () => {
      if (!confirm(`새 버전(v${state.update.latest})으로 업데이트할까요?\n앱이 잠깐 꺼졌다가 다시 켜져요. 설정과 기록은 그대로예요.`)) return;
      const r = await window.diary.installUpdate();
      if (!r.ok) toast(r.message, 6000);
    };
    window.diary.onChat((list) => { state.chat = list; if (!$('#chat-log').hidden) renderChat(); });
    window.diary.onMemory((all) => { state.memory = all; if (D.settings && D.settings.refresh) D.settings.refresh(); });
    $('#chat-form').onsubmit = async (e) => {
      e.preventDefault();
      const input = $('#chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.disabled = true;
      await window.diary.chat(text);
      input.disabled = false;
      input.focus();
    };
    $('#btn-chatlog').onclick = () => openChat($('#chat-log').hidden);
    $('#btn-chat-close').onclick = () => openChat(false);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#chat-log').hidden) openChat(false); });
    $('#btn-chat-clear').onclick = async () => { if (confirm('비서와의 대화 기록을 지울까요?')) state.chat = await window.diary.clearChat(); renderChat(); };
    $('#asst-copy').onclick = async () => { const m = state.lastAssistant; if (m && m.draft) { await window.diary.copyText(m.draft); toast('답장을 복사했어요.'); } };
    $('#btn-claude').onclick = () => window.diary.open(D.asstWork(state.theme, state.settings).claudeUrl || 'https://claude.ai/new');
    $('#chk-hourly').onchange = (e) => window.diary.setSettings({ hourly: e.target.checked });
    $('#btn-pin').onclick = () => window.diary.setSettings({ alwaysOnTop: !state.settings.alwaysOnTop });
    const toggleChar = () => window.diary.setSettings({ hideChar: !state.settings.hideChar });
    $('#btn-hidechar').onclick = toggleChar;
    // 캐릭터 숨기기 단축키 (설정에서 고름, 기본: Option + H)
    const CHAR_KEYS = { 'alt+h': (e) => e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyH', 'alt+z': (e) => e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyZ',
      'backquote': (e) => !e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'Backquote', 'f8': (e) => e.code === 'F8', 'mod+shift+h': (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyH' };
    window.addEventListener('keydown', (e) => {
      const k = state.settings.charKey || 'alt+h';
      if (k === 'backquote' && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if ((CHAR_KEYS[k] || CHAR_KEYS['alt+h'])(e)) { e.preventDefault(); toggleChar(); }
    });

    // 자정 대비 2중 장치 + 배경 시간표(요일별/일정 시간마다)
    let lastBgKey = '';
    setInterval(() => {
      const t = iso(new Date());
      if (t !== state.today) dayChanged(t);
      const bg = D.theme.activeBg(state.theme);
      const key = JSON.stringify(bg).length + ':' + (bg.media ? bg.media.url : '') + ':' + bg.type;
      if (key !== lastBgKey) { lastBgKey = key; D.theme.renderBackground(state.theme); }
    }, 30 * 1000);
  }

  window.addEventListener('DOMContentLoaded', start);
})();
