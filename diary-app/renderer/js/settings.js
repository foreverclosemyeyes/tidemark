// 오른쪽 설정 패널: 연결 / 꾸미기 / 비서
(function () {
  const { h } = D.ctl;
  const C = D.ctl;
  const panel = document.getElementById('settings');
  const state = D.state;
  let tab = 'connect';
  let gmailCheck = null; // Gmail 연결 확인 결과 ({pending} 또는 {ok, message, detail})

  // ---------- 저장 / 실행 취소 ----------
  const history = { list: [], idx: -1 };
  let saveTimer = null, commitTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => window.diary.saveTheme(state.theme), 400);
  }
  function snapshotHistory() {
    const j = JSON.stringify(state.theme);
    if (history.list[history.idx] === j) return;
    history.list = history.list.slice(0, history.idx + 1);
    history.list.push(j);
    if (history.list.length > 150) history.list.shift();
    history.idx = history.list.length - 1;
    updateUndoButtons();
  }
  function commit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(snapshotHistory, 250);
    saveSoon();
  }
  function loadTheme(themeObj, { record = true } = {}) {
    state.theme = D.mergeDefaults(D.DEFAULT_THEME, themeObj);
    applyAll();
    if (record) commit(); else saveSoon();
    render();
  }
  function undo() {
    if (history.idx <= 0) return;
    history.idx--;
    loadTheme(JSON.parse(history.list[history.idx]), { record: false });
    updateUndoButtons();
  }
  function redo() {
    if (history.idx >= history.list.length - 1) return;
    history.idx++;
    loadTheme(JSON.parse(history.list[history.idx]), { record: false });
    updateUndoButtons();
  }
  function updateUndoButtons() {
    const u = panel.querySelector('#btn-undo'), r = panel.querySelector('#btn-redo');
    if (u) u.disabled = history.idx <= 0;
    if (r) r.disabled = history.idx >= history.list.length - 1;
  }

  let rafPending = false;
  function applyAll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      D.theme.apply(state.theme);
      D.renderAll();
    });
  }

  // 꾸밈값 읽기/쓰기 도우미
  const ctx = {
    get: (p) => D.getPath(state.theme, p),
    set: (p, v) => { D.setPath(state.theme, p, v); applyAll(); },
    commit,
    def: (p) => D.getPath(D.DEFAULT_THEME, p),
    rerender: () => render(),
  };

  // ---------- 패널 틀 ----------
  const TABS = [
    ['connect', '연결'], ['look', '꾸미기'], ['asst', '비서'],
  ];

  function open() {
    D.fx && D.fx.wipe();
    document.body.classList.add('settings-open');
    panel.setAttribute('aria-hidden', 'false');
    render();
  }
  function close() {
    document.body.classList.remove('settings-open');
    panel.setAttribute('aria-hidden', 'true');
  }

  function render() {
    const scroll = panel.querySelector('.set-body');
    const keep = scroll ? scroll.scrollTop : 0;
    const openSecs = [...panel.querySelectorAll('details.sec')].map((d) => d.open);
    panel.innerHTML = '';
    const head = h('div', 'set-head');
    head.append(h('div', 'set-title', '꾸미기 · 설정'));
    const acts = h('div', 'set-acts');
    const u = h('button', 'icon-btn sm', '↶'); u.id = 'btn-undo'; u.title = '실행 취소 (⌘/Ctrl+Z)'; u.onclick = undo;
    const r = h('button', 'icon-btn sm', '↷'); r.id = 'btn-redo'; r.title = '다시 실행 (⌘/Ctrl+Shift+Z)'; r.onclick = redo;
    const x = h('button', 'icon-btn sm', '✕'); x.title = '닫기'; x.onclick = close;
    acts.append(u, r, x);
    head.append(acts);
    panel.append(head);

    const tabs = h('div', 'set-tabs');
    for (const [k, t] of TABS) {
      const b = h('button', k === tab ? 'on' : '', t);
      b.onclick = () => { tab = k; render(); };
      tabs.append(b);
    }
    panel.append(tabs);

    const body = h('div', 'set-body scroll');
    panel.append(body);
    if (!TABS.some(([k]) => k === tab)) tab = 'connect';
    ({ connect: renderConnect, look: renderLook, asst: renderAsst })[tab](body);
    const secs = [...body.querySelectorAll('details.sec')];
    if (secs.length === openSecs.length) secs.forEach((d, i) => { d.open = openSecs[i]; });
    body.scrollTop = keep;
    updateUndoButtons();
  }

  const note = (text) => { const n = h('div', 'note'); n.innerHTML = text; return n; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); // note() 안에 끼워 넣는 값용
  const btn = (label, cls, fn) => { const b = h('button', 'btn ' + (cls || ''), label); b.onclick = fn; return b; };
  const linkBtn = (label, url) => btn(label, 'link', () => window.diary.open(url));

  // ---------- 연결 ----------
  function keyField(name, label, placeholder) {
    const wrap = h('div', 'key');
    const status = h('div', 'key-status ' + (state.hasKeys[name] ? 'ok' : ''), state.hasKeys[name] ? '● 저장됨 (암호화 보관)' : '○ 아직 없음');
    const input = h('input'); input.type = 'password'; input.placeholder = placeholder; input.autocomplete = 'off';
    const save = btn('저장', 'primary', async () => {
      if (!input.value.trim()) return D.toast('키를 붙여 넣어 주세요.');
      state.hasKeys = await window.diary.setSecret(name, input.value);
      input.value = '';
      D.renderAll();
      D.toast('저장했어요.');
      render();
    });
    const del = btn('지우기', '', async () => { state.hasKeys = await window.diary.setSecret(name, ''); D.renderAll(); render(); });
    const line = h('div', 'row-inline'); line.append(input, save, del);
    wrap.append(h('div', 'ctl-label', label), status, line);
    return wrap;
  }

  function renderConnect(body) {
    const n = C.section('노션 연결 (안 해도 쓸 수 있어요)', true);
    n.body.append(note(state.data.local ? '<b>지금은 노션 없이 쓰는 중이에요.</b> 체크리스트와 진행 중 업무는 이 컴퓨터에만 저장돼요. 노션과 맞춰 쓰려면 아래에서 연결하고, 맨 아래 <b>노션 대상</b>에 업무 DB와 내 사용자 id 를 넣으세요.' : '노션에 연결돼 있어요. 체크리스트와 진행 중 업무를 노션 업무 DB와 맞춰요.'));
    const lg = h('div', 'key');
    lg.append(h('div', 'ctl-label', '노션으로 로그인 (관리자 권한 없이 — 추천)'));
    lg.append(h('div', 'key-status ' + (state.notionLogin ? 'ok' : ''), state.notionLogin ? '● 로그인됨' : '○ 아직 안 함'));
    const lr = h('div', 'row-inline');
    if (!state.notionLogin) {
      lr.append(btn('노션으로 로그인', 'primary', async (ev) => {
        ev.target.textContent = '브라우저에서 허용을 눌러 주세요…';
        const r = await window.diary.notionLogin();
        if (r.ok) { state.notionLogin = true; state.hasKeys.notion = true; D.toast('노션 연결 완료! 불러오는 중…'); D.renderAll(); }
        else D.toast(r.message, 6000);
        render();
      }));
    } else {
      lr.append(btn('로그아웃', '', async () => { await window.diary.notionLogout(); state.notionLogin = false; render(); }));
    }
    lg.append(lr);
    n.body.append(lg, note('브라우저에서 노션 로그인 화면이 열리면 쓰는 워크스페이스를 고르고 <b>허용</b>을 누르세요. 회사에서 API 키를 만들 수 없을 때 쓰는 방법이에요. 아래 노션 키 칸은 비워 두면 돼요.'));
    n.body.append(keyField('notion', '노션 내부 통합 키', 'ntn_ 로 시작하는 키 붙여넣기'));
    const test = h('div', 'test-result');
    n.body.append(h('div', 'row-inline', null));
    n.body.lastChild.append(
      btn('연결 테스트', '', async () => { test.textContent = '확인 중…'; const r = await window.diary.testNotion(); test.textContent = r.message; test.className = 'test-result ' + (r.ok ? 'ok' : 'err'); }),
      btn('지금 새로고침', '', () => window.diary.sync(true)),
      linkBtn('통합 만들기 페이지 ↗', 'https://www.notion.so/profile/integrations'),
    );
    n.body.append(test);
    n.body.append(note('키 발급·DB 연결 방법은 <b>안내서(사용설명서.md)</b>의 "노션 연결하기"를 따라 하세요. 키는 이 컴퓨터의 보안 저장소로 암호화돼서 저장되고 화면에는 다시 보이지 않아요.'));

    const ids = C.section('노션 대상 (업무 DB · 내 사용자 id)');
    const fields = [['userId', '내 노션 user ID'], ['dataSourceId', 'data source ID'], ['databaseId', 'database ID']];
    const inputs = {};
    for (const [k, l] of fields) {
      const i = h('input'); i.type = 'text'; i.value = (state.notionCfg || {})[k] || '';
      inputs[k] = i;
      const r = h('div', 'ctl'); r.append(h('label', 'ctl-label', l), i, h('span')); ids.body.append(r);
    }
    ids.body.append(btn('저장하고 다시 불러오기', 'primary', async () => {
      const p = {}; for (const k in inputs) p[k] = inputs[k].value.trim();
      state.notionCfg = await window.diary.setNotionCfg(p); D.toast('저장했어요. 다시 불러오는 중…');
    }));

    const a = C.section('AI 비서 (Anthropic)', true);
    a.body.append(keyField('anthropic', 'Anthropic API 키', 'sk-ant- 로 시작하는 키 붙여넣기'));
    a.body.append(h('div', 'row-inline'));
    a.body.lastChild.append(linkBtn('키 발급 페이지 ↗', 'https://console.anthropic.com/settings/keys'), btn('지금 확인해줘', '', () => window.diary.askAssistant()));
    a.body.append(note('쓴 만큼 요금이 나가요(선불 크레딧). 가볍고 빠른 <b>Claude Haiku 5.5</b>를 쓰고, 매시간 체크를 켜도 한 달에 보통 <b>몇십 원~몇백 원</b> 수준이에요. <b>키 없이 Claude 구독으로 대화하기</b>: 이 맥에 Claude Code를 설치하고 로그인하면(사용설명서 4장), 렌이 구독으로 대답해요. 크레딧은 안 써요. 둘 다 없으면 렌은 정해진 문장으로만 말해요.'));

    // Gmail: 비서가 메일을 읽고 임시보관함에 초안을 씀 (보내기·지우기는 못 함)
    const gm = C.section('Gmail (비서가 메일 읽기 · 초안 쓰기)', true);
    const gmRow = h('div', 'ctl');
    const gmSw = h('label', 'switch'); const gmCb = h('input'); gmCb.type = 'checkbox'; gmCb.checked = !!state.settings.gmail;
    gmCb.onchange = async () => { state.settings = await window.diary.setSettings({ gmail: gmCb.checked }); };
    gmSw.append(gmCb, h('span'));
    gmRow.append(h('label', 'ctl-label', 'Gmail 사용'), gmSw, h('span'));
    const gmTest = h('div', 'test-result');
    const gmDetail = h('div', 'test-detail'); // 안 될 때: Claude Code 가 실제로 본 커넥터 목록 (원인 찾기용)
    const gmBtns = h('div', 'row-inline');
    gmBtns.append(
      btn('Gmail 연결 확인', '', async () => {
        if (gmailCheck && gmailCheck.pending) return;
        gmailCheck = { pending: true }; render();
        gmailCheck = await window.diary.checkGmail().catch((e) => ({ ok: false, message: 'Gmail 연결을 확인하지 못했어요.', detail: String((e && e.message) || e) }));
        render();
      }),
      linkBtn('claude.ai 커넥터 설정 ↗', 'https://claude.ai/customize/connectors'),
    );
    // 확인 결과는 창이 다시 그려져도(확인이 되면 설정이 저장되면서 다시 그려짐) 남아 있게 함
    if (gmailCheck && gmailCheck.pending) { gmBtns.firstChild.disabled = true; gmTest.textContent = '확인 중… (최근 메일 한 통을 읽어 봐요. 1분쯤 걸릴 수 있어요)'; }
    else if (gmailCheck) { gmTest.textContent = gmailCheck.message; gmTest.className = 'test-result ' + (gmailCheck.ok ? 'ok' : 'err'); gmDetail.textContent = gmailCheck.ok ? '' : (gmailCheck.detail || ''); }
    gm.body.append(gmRow, gmBtns, gmTest, gmDetail, note('켜 두면 비서에게 <b>"○○에게 온 메일 찾아 줘"</b>, <b>"답장 초안 써 줘"</b>처럼 말할 수 있어요. 비서는 메일을 <b>읽고 임시보관함에 초안만</b> 넣어요. <b>보내기·지우기는 못 하게 막아 뒀고</b>, 보내는 건 Gmail에서 직접 하세요. claude.ai 에 Gmail 커넥터가 연결돼 있고, 이 맥의 Claude Code가 같은 계정으로 로그인돼 있어야 해요.'));

    const up = C.section('업데이트', true);
    const u = state.update || {};
    up.body.append(note(`지금 버전: <b>v${state.version || '?'}</b>${u.latest ? ` · 최신: <b>v${u.latest}</b>` : ''}${u.available ? ' · <b style="color:#c62d0d">새 버전 있음</b>' : u.latest ? ' · 최신이에요' : ''}${u.error ? `<br>⚠ ${esc(u.error)}` : ''}`));
    up.body.append(keyField('github', 'GitHub 열쇠 (저장소가 비공개일 때만)', 'github_pat_ 로 시작하는 토큰 붙여넣기'));
    up.body.append(h('div', 'row-inline'));
    up.body.lastChild.append(
      btn('지금 확인', '', async () => { await window.diary.checkUpdate(); render(); }),
      ...(u.available ? [btn(`v${u.latest} 로 업데이트`, 'primary', () => document.getElementById('btn-update').click())] : []),
      linkBtn('열쇠 만들기 페이지 ↗', 'https://github.com/settings/personal-access-tokens/new'),
      btn('문제 기록 파일 보기', '', () => window.diary.showLog()),
    );
    up.body.append(note('새 버전이 있으면 위쪽에 <b>UPDATE</b> 버튼이 떠요. 누르면 받아서 바꿔 끼우고 다시 켜져요. 앱은 <b>응용 프로그램 폴더</b>에 있어야 해요.'));
    const g = C.section('일반', true);
    const sw = (key, label, desc) => {
      const r = h('div', 'ctl');
      const l = h('label', 'switch'); const cb = h('input'); cb.type = 'checkbox'; cb.checked = (key === 'autoStats' || key === 'autoZoom') ? state.settings[key] !== false : !!state.settings[key];
      cb.onchange = async () => { state.settings = await window.diary.setSettings({ [key]: cb.checked }); };
      l.append(cb, h('span'));
      const lab = h('label', 'ctl-label', label);
      if (desc) lab.title = desc;
      r.append(lab, l, h('span'));
      return r;
    };
    g.body.append(
      sw('autoLaunch', '컴퓨터 켜면 자동 실행', '로그인할 때 트레이에 조용히 켜져요'),
      sw('hourly', '매시간 체크 (평일 9~19시 정시)'),
      sw('alwaysOnTop', '항상 다른 창 위에 띄우기'),
      sw('autoZoom', '창을 줄이면 화면 전체를 같이 줄이기', '큰 창 화면 그대로 캐릭터·말풍선·달력이 같은 비율로 작아져요'),
      sw('autoStats', '인간 파라미터 자동으로 올리기', '체크리스트를 완료하면 일의 성격을 보고 파라미터 +1'),
    );
    g.body.append(h('div', 'row-inline'));
    g.body.lastChild.append(btn('인간 파라미터 처음부터 다시', 'danger', async () => {
      if (!confirm('인간 파라미터 점수를 모두 0으로 되돌릴까요?\n오늘부터 끝낸 일만 다시 쌓여요.')) return;
      state.stats = await window.diary.resetStats(); D.renderAll(); D.toast('처음부터 다시 시작해요.');
    }));
    g.body.append(note('창을 닫아도(✕) 앱은 메뉴 막대/트레이에 남아 정시 알림을 보내요. 완전히 끄려면 트레이 아이콘 → "완전히 종료".'));
    if (!state.settings.isPackaged) { /* 개발 실행에서는 자동 실행이 등록되지 않음 */ }
    const hq = C.section(`숨긴 업무 (${(state.settings.hiddenQuests || []).length})`);
    const names = state.settings.hiddenQuestNames || {};
    if (!(state.settings.hiddenQuests || []).length) hq.body.append(note('진행 중 업무 줄에 마우스를 올려 <b>×</b>를 누르면 여기로 숨겨져요. (휴지통에 넣은 노션 업무가 보일 때 쓰세요)'));
    for (const id of state.settings.hiddenQuests || []) {
      const r = h('div', 'row-inline');
      r.append(h('span', 'file-name', names[id] || id), btn('다시 보이기', 'sm', async () => {
        state.settings = await window.diary.setSettings({ hiddenQuests: (state.settings.hiddenQuests || []).filter((x) => x !== id) });
        D.renderAll(); render();
      }));
      hq.body.append(r);
    }
    ids.body.append(note('노션과 맞춰 쓸 때만 필요해요. 업무 DB에는 <b>Name · 상태 · 담당자 · 기간</b> 속성이 있어야 하고, 날짜별 체크리스트는 이름에 <b>"운영성 업무"</b>가 들어간 주간 페이지에서 읽어요. 비워 두면 노션 없이 이 컴퓨터에만 저장해요.'));
    body.append(n.el, ids.el, gm.el, hq.el, up.el, g.el);
  }

  // ---------- 꾸미기 ----------
  function renderLook(body) {
    // 한 번에 옮기기: 스킨·캐릭터 그림·색·배치를 파일 하나로 (새로 설치한 사람은 이 파일 하나만 넣으면 됨)
    const mv = C.section('꾸밈 한 번에 옮기기', true);
    const mvRow = h('div', 'row-inline');
    mvRow.append(
      btn('꾸밈 파일 가져오기', 'primary', async () => {
        const r = await window.diary.importPack(state.theme);
        if (r.ok) { loadTheme(r.theme); D.toast('꾸밈을 가져와서 적용했어요.'); } else if (r.message) D.toast(r.message, 6000);
      }),
      btn('내 꾸밈 내보내기', '', async () => {
        D.toast('파일을 만드는 중…');
        const r = await window.diary.exportPack(state.theme);
        if (r.ok) D.toast(`내보냈어요. (그림 ${r.images}장 포함)`);
      }),
    );
    mv.body.append(mvRow, note('스킨 그림, 캐릭터와 표정, 색, 배치를 <b>파일 하나(.diarypack)</b>로 주고받아요. 받은 사람은 <b>꾸밈 파일 가져오기</b> 한 번이면 같은 모습이 돼요. 업무 지침·Claude 채팅 주소·참고 문서 같은 개인 설정은 파일에 들어가지 않아요.'));
    body.append(mv.el);
    const pal = C.section('색 조합 (누르면 한 번에 바뀌어요)', true);
    const pg = h('div', 'pal-grid');
    D.PALETTES.forEach(([name, p], i) => {
      const b = h('button', 'pal');
      const sw = h('div', 'pal-sw');
      ['bg', 'panel', 'card', 'accent', 'param', 'sat'].forEach((k) => { const d = h('i'); d.style.background = p[k]; sw.append(d); });
      b.append(sw, h('span', null, name));
      b.onclick = () => {
        state.theme.colors = { ...state.theme.colors, ...D.paletteColors(i) };
        state.theme.text.stamp.color = { c: p.accent, a: 1 };
        applyAll(); commit(); render();
      };
      pg.append(b);
    });
    pal.body.append(pg, note('마음에 안 들면 위쪽 실행 취소(↶)로 되돌릴 수 있어요.'));
    body.append(pal.el);
    const c = C.section('색 하나씩', true);
    c.body.append(
      C.colorA(ctx, 'colors.bg', '배경'), C.colorA(ctx, 'colors.main', '메인 (글씨/선)'), C.colorA(ctx, 'colors.accent', '포인트'),
      C.colorA(ctx, 'colors.card', '카드'), C.colorA(ctx, 'colors.cardText', '카드 글씨'),
      C.colorA(ctx, 'colors.sun', '일요일'),
      C.colorA(ctx, 'colors.sat', '토요일'),
      C.colorA(ctx, 'colors.panel', '사선 면'),
      C.colorA(ctx, 'colors.param', '인간 파라미터 별'),
      C.colorA(ctx, 'colors.event', '일정 점·선'),
    );
    const mode = C.section('화면 · 연출 · 스킨', true);
    if (false) mode.body.append(C.select(ctx, 'layout.mode', '화면 구성', [['bigcal', '큰 달력 + 노트 카드'], ['classic', '큰 날짜 숫자 + 이번 주 띠']], () => render()));
    if (state.theme.layout.mode === 'bigcal') {
      mode.body.append(
        C.text(ctx, 'layout.stampText', '다 끝냈을 때 도장 글씨'),
        C.toggle(ctx, 'layout.cutOn', '하루 시작 컷 (날짜 바뀐 뒤 처음 켤 때)'),
        C.toggle(ctx, 'layout.fxOn', '화려한 연출 (등장·넘김·체크 효과)'),
        C.toggle(ctx, 'layout.soft', '화면 전체 아주 살짝 흐리게'),
      );
      // 스킨 그림 묶음: 파일 이름으로 자리를 찾음 (cut-city, cloud-1~3, wd-0~6, pointup, pointup-bg, rankup, rankup-bg, rankmax, rankmax-bg, bubble, reply)
      const SKIN_KEYS = ['cut-city', 'cloud-1', 'cloud-2', 'cloud-3', 'wd-0', 'wd-1', 'wd-2', 'wd-3', 'wd-4', 'wd-5', 'wd-6', 'pointup', 'pointup-bg', 'rankup', 'rankup-bg', 'rankmax', 'rankmax-bg', 'bubble', 'empty', 'mask', 'dagger', 'gatsu', 'app-icon',
        ...Array.from({ length: 10 }, (_, n) => [`digit-${n}`, `digit-${n}-red`, `digit-${n}-blue`]).flat()];
      const skin = state.theme.layout.skin || {};
      const nSkin = SKIN_KEYS.filter((k) => skin[k]).length;
      mode.body.append(btn(nSkin ? `스킨 그림 ${nSkin}/${SKIN_KEYS.length}장 적용 중 (더 불러오기)` : '스킨 그림 불러오기 (여러 장 한꺼번에 고르기)', '', async () => {
        const assets = await window.diary.pickAsset('image');
        const next = { ...(state.theme.layout.skin || {}) }; let n = 0;
        for (const a of assets) { const key = a.name.replace(/\.[a-z0-9]+$/i, '').toLowerCase(); if (SKIN_KEYS.includes(key)) { next[key] = a.url; n++; } }
        if (!n) return D.toast('스킨 그림 이름이 아니에요. (cut-city.png, wd-0.png, pointup.png …)', 5000);
        ctx.set('layout.skin', next); ctx.commit(); render(); D.toast(`스킨 그림 ${n}장을 넣었어요.`);
      }));
      if (nSkin) mode.body.append(btn('스킨 그림 전부 빼기', '', () => { ctx.set('layout.skin', {}); ctx.commit(); render(); }));
      // 하루 시작 컷 배경을 내 그림으로 (이 컴퓨터에만 저장됨)
      const ci = state.theme.layout.cutImage;
      mode.body.append(btn(ci ? `컷 배경 그림: ${ci.name} (바꾸기)` : '컷 배경을 내 그림으로 바꾸기', '', async () => {
        const [asset] = await window.diary.pickAsset('image');
        if (asset) { ctx.set('layout.cutImage', { url: asset.url, name: asset.name }); ctx.commit(); render(); }
      }));
      if (ci) mode.body.append(btn('컷 배경 그림 빼기 (기본 도시로)', '', () => { ctx.set('layout.cutImage', null); ctx.commit(); render(); }));
      const er = h('div', 'ctl');
      const sel = h('select');
      [['all', '내 업무 중 기간이 있는 것 전부'], ['tags', 'Tags가 meeting·seminar 인 것만']].forEach(([v, t]) => { const o = h('option', null, t); o.value = v; sel.append(o); });
      sel.value = state.settings.eventMode || 'all';
      sel.onchange = async () => { state.settings = await window.diary.setSettings({ eventMode: sel.value }); D.toast('일정을 다시 불러오는 중…'); };
      er.append(h('label', 'ctl-label', '달력 일정 점'), sel, h('span'));
      mode.body.append(er);
      mode.body.append(btn('하루 시작 컷 미리 보기', '', () => D.cutscene.play({ force: true })));
      mode.body.append(note('일정은 노션 "기간"으로 표시돼요. 하루짜리는 ○, 여러 날은 ○—○ 로 이어져요. Tags에 meeting·seminar 가 있으면 포인트 색이에요.'));
    }
    const l = C.section('배치 · 기울기', true);
    l.body.append(
      C.slider(ctx, 'layout.calTilt', '달력 영역 기울기', -20, 20, 0.5, '°'),
      C.slider(ctx, 'layout.cardTilt', '카드 기울기', -10, 10, 0.1, '°'),
    );
    const s = C.section('사선 띠 · 질감', true);
    s.body.append(
      C.toggle(ctx, 'layout.stripeOn', '사선 띠 보이기'),
      C.slider(ctx, 'layout.stripeAngle', '띠 각도', -80, 80, 0.5, '°'),
      C.slider(ctx, 'layout.stripeWidth', '띠 두께', 0, 700, 1, 'px'),
      C.slider(ctx, 'layout.stripePos', '띠 위치 (왼→오)', -20, 120, 0.5, '%'),
      C.slider(ctx, 'layout.stripeOpacity', '띠 진하기', 0, 100, 1, '%'),
      C.toggle(ctx, 'layout.textureOn', '질감 보이기'),
      C.slider(ctx, 'layout.texture', '질감 세기', 0, 100, 1, '%'),
    );
    body.append(mode.el);
  }

  // ---------- 비서 ----------
  function renderAsst(body) {
    // 캐릭터 고르기: 누르면 그 캐릭터의 이름·말투·그림으로 통째로 바뀜
    const who = C.section('비서 캐릭터 (누르면 바뀜 · 말풍선의 이름을 눌러도 다음 캐릭터로)', true);
    const row = h('div', 'cast-row');
    for (const id of D.castIds(state.theme)) {
      const on = (state.theme.castActive || 'ren') === id;
      const has = on ? !!(state.theme.assistant.faces || {}).base : !!((state.theme.cast || {})[id] && state.theme.cast[id].faces.base);
      row.append(btn(D.castName(state.theme, id) + (has ? '' : ' (그림 없음)'), on ? 'on' : '', () => { D.castSwitch(state.theme, id); commit(); D.renderAll(); render(); }));
    }
    who.body.append(row, btn('캐릭터 zip 넣기 (이름 · 말투 · 표정 6칸이 한 번에 세팅돼요. 여러 개도 가능)', '', async () => {
      const res = await window.diary.importCastZip();
      const ok = res.filter((r) => !r.error && r.count);
      if (!ok.length) { if (res.length) D.toast(res[0].error || 'zip 안에서 그림(png)을 못 찾았어요.', 6000); return; }
      let last = null;
      // 로열판 zip 은 그림이 뿌옇게 저장돼 있어서(감마 차이) 원래 색으로 맞춰 다시 저장
      const fixGamma = async (url) => {
        const b64 = await window.diary.readAsset(url.split('/').pop()); if (!b64) return url;
        const img = new Image(); await new Promise((ok2, no) => { img.onload = ok2; img.onerror = no; img.src = 'data:image/png;base64,' + b64; });
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0);
        const d = c2.getImageData(0, 0, cv.width, cv.height), p = d.data;
        const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(v / 255, 2.2));
        for (let k = 0; k < p.length; k += 4) { p[k] = lut[p[k]]; p[k + 1] = lut[p[k + 1]]; p[k + 2] = lut[p[k + 2]]; }
        c2.putImageData(d, 0, 0);
        const saved = await window.diary.writeAsset('fixed-' + url.split('/').pop().replace(/\.[a-z0-9]+$/i, '') + '.png', cv.toDataURL('image/png').split(',')[1]);
        return saved.url;
      };
      for (const r of ok) if (r.royal) { const done = new Map(); for (const k of Object.keys(r.faces)) { const u = r.faces[k].url; if (!done.has(u)) done.set(u, await fixGamma(u).catch(() => u)); r.faces[k] = { ...r.faces[k], url: done.get(u) }; } }
      for (const r of ok) last = D.castApplyZip(state.theme, r.label, r.faces);
      D.castSwitch(state.theme, last.id);
      commit(); D.renderAll(); render();
      D.toast(`${ok.map((r) => D.castFromLabel(r.label).name).join(', ')} 세팅 끝!`, 4000);
    }));
    body.append(who.el);
    // 모드: 같은 캐릭터의 다른 모습 (그림 한 장씩). 파일 이름으로 자리를 찾음: look-glasses / look-joker / look-hurt / look-plain / look-think
    const lk = C.section('모드 (같은 캐릭터의 다른 모습)', true);
    const looks = state.theme.assistant.looks || {};
    const haveLooks = D.LOOKS.filter(([id]) => looks[id]);
    const lrow = h('div', 'cast-row');
    const cur = state.theme.assistant.look || 'auto';
    const pickLook = (id) => { ctx.set('assistant.look', id); commit(); D.renderAll(); render(); };
    lrow.append(btn('자동 (상황 따라)', cur === 'auto' ? 'on' : '', () => pickLook('auto')), btn('원래 그림만', cur === 'off' ? 'on' : '', () => pickLook('off')));
    for (const [id, ko] of haveLooks) lrow.append(btn(ko, cur === id ? 'on' : '', () => pickLook(id)));
    lk.body.append(lrow, btn(haveLooks.length ? `모드 그림 ${haveLooks.length}/${D.LOOKS.length}장 (더 불러오기)` : '모드 그림 불러오기 (여러 장 한꺼번에)', '', async () => {
      const assets = await window.diary.pickAsset('image'); let n = 0;
      const next = { ...(state.theme.assistant.looks || {}) };
      for (const as of assets) { const m = as.name.toLowerCase().match(/^look-(glasses|joker|hurt|plain|think|glare)\./); if (m) { next[m[1]] = { url: as.url, name: as.name }; n++; } }
      if (!n) return D.toast('모드 그림 이름이 아니에요. (look-joker.png, look-think.png …)', 5000);
      ctx.set('assistant.looks', next); commit(); D.renderAll(); render(); D.toast(`모드 그림 ${n}장을 넣었어요.`);
    }));
    lk.body.append(note('자동: 생각하는 중엔 "생각 중", 진지할 땐 "조커", 지쳤을 땐 "다친 모습", 웃을 땐 "안경 벗음", 장난칠 땐 "안경 반사", 평소엔 원래 그림이 나와요.'));
    body.append(lk.el);
    const a = C.section('이름 · 말투', true);
    a.body.append(
      C.text(ctx, 'assistant.name', '비서 이름'),
      C.text(ctx, 'assistant.tone', '말투 · 성격', { multiline: true, placeholder: '예: 시크하지만 챙겨주는 존댓말, 짧게' }),
    );
    a.body.append(C.select(ctx, 'layout.dialog', '대화창 모양', [['angular', '각진 대화창'], ['flat', '네모 칸']]));
    const img = C.section('캐릭터 그림 (표정 6가지)', true);
    const grid = h('div', 'face-grid');
    const faces = state.theme.assistant.faces || {};
    if (!faces.base && state.theme.assistant.image) faces.base = state.theme.assistant.image;
    for (const [key, ko] of D.face.MOODS) {
      const cell = h('div', 'face-cell');
      const pic = h('div', 'face-pic');
      if (faces[key]) { const im = h('img'); im.src = faces[key].url; pic.append(im); } else pic.append(h('span', null, '+'));
      pic.title = `${ko} 표정 올리기`;
      pic.onclick = async () => {
        const [asset] = await window.diary.pickAsset('image');
        if (asset) { ctx.set(`assistant.faces.${key}`, { url: asset.url, name: asset.name }); commit(); render(); }
      };
      cell.append(pic, h('div', 'face-ko', ko));
      if (faces[key]) { const x = h('button', 'face-x', '×'); x.title = '빼기'; x.onclick = () => { ctx.set(`assistant.faces.${key}`, null); if (key === 'base') ctx.set('assistant.image', null); commit(); render(); }; cell.append(x); }
      grid.append(cell);
    }
    const r = h('div', 'row-inline');
    r.append(btn('여러 장 한 번에 올리기 (기본→말하기→웃음→윙크→진지→눈감음 순서)', '', async () => {
      const assets = await window.diary.pickAsset('image');
      assets.slice(0, 6).forEach((a, k) => ctx.set(`assistant.faces.${D.face.MOODS[k][0]}`, { url: a.url, name: a.name }));
      if (assets.length) { commit(); render(); }
    }));
    img.body.append(grid, r,
      C.slider(ctx, 'assistant.size', '그림 크기', 40, 600, 1, 'px'),
      C.slider(ctx, 'assistant.outline', '외곽선 두께', 0, 12, 0.5, 'px'),
      C.toggle(ctx, 'assistant.flip', '좌우 뒤집기'),
    );
    img.body.append(note('투명 배경 PNG를 추천해요. 말할 때는 기본↔말하기가 번갈아 나오고, 가끔 눈감음으로 깜빡여요. Claude가 대답에 맞춰 웃음·윙크·진지 표정을 골라요. 그림은 이 컴퓨터에만 저장돼요.'));
    const hide = C.section('회사에서 숨기기', true);
    const bk = h('select');
    [['CommandOrControl+Shift+X', '⌘/Ctrl + Shift + X'], ['CommandOrControl+Shift+Space', '⌘/Ctrl + Shift + Space'], ['CommandOrControl+Alt+Space', '⌘/Ctrl + Option(Alt) + Space'], ['', '쓰지 않음']].forEach(([v, t]) => { const o = h('option', null, t); o.value = v; bk.append(o); });
    bk.value = state.settings.bossKey ?? 'CommandOrControl+Shift+X';
    bk.onchange = async () => { state.settings = await window.diary.setSettings({ bossKey: bk.value }); D.toast(bk.value ? '단축키를 바꿨어요.' : '단축키를 껐어요.'); };
    const bkr = h('div', 'ctl'); bkr.append(h('label', 'ctl-label', '앱 창 바로 숨기기'), bk, h('span'));
    const ck = h('select');
    [['alt+h', 'Option + H (추천)'], ['alt+z', 'Option + Z'], ['backquote', '` (숫자 1 왼쪽 키)'], ['f8', 'F8'], ['mod+shift+h', '⌘ + Shift + H']].forEach(([v, t]) => { const o = h('option', null, t); o.value = v; ck.append(o); });
    ck.value = state.settings.charKey || 'alt+h';
    ck.onchange = async () => { state.settings = await window.diary.setSettings({ charKey: ck.value }); D.toast('캐릭터 숨기기 키를 바꿨어요.'); };
    const ckr = h('div', 'ctl'); ckr.append(h('label', 'ctl-label', '캐릭터 숨기기 키'), ck, h('span'));
    const hc = h('div', 'ctl'); const hl = h('label', 'switch'); const hcb = h('input'); hcb.type = 'checkbox'; hcb.checked = !!state.settings.hideChar;
    hcb.onchange = async () => { state.settings = await window.diary.setSettings({ hideChar: hcb.checked }); D.renderAll(); };
    hl.append(hcb, h('span')); hc.append(h('label', 'ctl-label', '캐릭터 숨기기'), hl, h('span'));
    hide.body.append(hc, ckr, bkr, note('• 위쪽 HIDE 버튼이나 위에서 고른 키(기본 Option + H): 캐릭터만 숨기기/보이기<br>• 위 단축키: 어떤 프로그램을 쓰고 있든 업무다이어리 창 전체를 바로 숨기고, 한 번 더 누르면 다시 보여요.'));

    // 아래 둘(모델, 지침·채팅 연결)은 지금 고른 비서에게만 적용됨. 비서를 바꾸면 그 비서의 값으로 바뀜
    const asstName = state.theme.assistant.name || '비서';
    const work = D.asstWork(state.theme, state.settings);
    const setWork = (patch) => { Object.assign(state.theme.assistant, patch); commit(); D.renderAll(); };
    const mdl = C.section(`${asstName} · 쓰는 Claude 모델`, true);
    const ms = h('select');
    [['opus', 'Opus 5.5 (가장 똑똑함 · 기본)'], ['sonnet', 'Sonnet 5.5 (빠르고 똑똑함)'], ['haiku', 'Haiku 5.5 (가장 빠르고 가벼움)']].forEach(([v, t]) => { const o = h('option', null, t); o.value = v; ms.append(o); });
    ms.value = work.model;
    ms.onchange = () => { setWork({ model: ms.value }); D.toast(`${asstName}의 모델을 바꿨어요.`); };
    const mr = h('div', 'ctl'); mr.append(h('label', 'ctl-label', '모델'), ms, h('span'));
    mdl.body.append(mr, note('Claude 구독으로 쓰면 고른 모델의 구독 사용량이 쓰여요. Opus는 대답이 조금 느릴 수 있어요(10~30초).'));
    body.append(mdl.el);
    const cl = C.section(`${asstName} · 업무 지침 · Claude 채팅 연결`, true);
    const ins = h('textarea'); ins.value = work.instructions;
    ins.placeholder = 'Claude의 "업무비서" 프로젝트 지침(또는 채팅에서 정해 둔 규칙)을 그대로 붙여 넣으세요.\n예: 나는 운영 담당이고, 매주 월요일엔 주간 보고를 먼저 챙긴다…';
    ins.style.minHeight = '140px';
    const url = h('input'); url.type = 'text'; url.value = work.claudeUrl;
    url.placeholder = 'https://claude.ai/project/… 또는 https://claude.ai/chat/…';
    const r1 = h('div', 'ctl'); r1.append(h('label', 'ctl-label', '업무비서 지침'), ins, h('span'));
    const r2 = h('div', 'ctl'); r2.append(h('label', 'ctl-label', 'Claude 채팅 주소'), url, h('span'));
    // 지침을 직접 쓰지 않고, 쓰던 claude.ai 채팅방에서 뽑아 오기
    const how = h('div', 'row-inline');
    how.append(btn('지침 뽑는 프롬프트 복사', '', async () => { await window.diary.copyText(D.INSTRUCTION_PROMPT); D.toast('복사했어요. 그 채팅방에 붙여 넣고, 나온 답을 아래 칸에 넣으세요.', 5000); }));
    cl.body.append(note('<b>쓰던 Claude 채팅에서 지침 뽑아 오기</b>: 아래 버튼으로 프롬프트를 복사해서 그 채팅방에 붙여 넣으면, 그 채팅 내용으로 지침을 정리해 줘요. 나온 답을 <b>업무비서 지침</b> 칸에 붙여 넣고 저장하세요. 맨 끝의 "확신 없었던 부분"은 읽어 보고 틀린 데만 고치고, 칸에는 넣지 마세요.'), how);
    // 참고 문서: 분량이 큰 인수인계 파일은 지침 칸 대신 파일로 넣음
    const docs = state.theme.assistant.docs || [];
    const total = docs.reduce((n, d) => n + (d.chars || 0), 0);
    const dl = h('div', 'doc-list');
    for (const d of docs) {
      const row = h('div', 'row-inline');
      row.append(h('span', 'file-name', `${d.name} · ${(d.chars || 0).toLocaleString()}자`), btn('빼기', 'sm', async () => {
        await window.diary.removeDoc(d.id);
        setWork({ docs: docs.filter((x) => x.id !== d.id) }); render();
      }));
      dl.append(row);
    }
    const addDoc = btn('참고 문서 넣기 (.md / .txt)', '', async () => {
      const picked = await window.diary.pickDocs();
      const bad = picked.filter((x) => x.error), ok = picked.filter((x) => !x.error);
      if (ok.length) setWork({ docs: [...docs, ...ok] });
      if (bad.length) D.toast(bad[0].error, 7000); else if (ok.length) D.toast(`${asstName}에게 문서 ${ok.length}개를 맡겼어요.`);
      render();
    });
    const r3 = h('div', 'ctl'); r3.append(h('label', 'ctl-label', '참고 문서'), dl, h('span'));
    const docNote = note(`<b>인수인계 파일처럼 분량이 큰 자료</b>는 여기에 파일로 넣으세요. ${esc(asstName)}가 답할 때마다 이 문서를 같이 읽어요. 글만 있는 파일(<b>.md, .txt</b>)이 돼요. 노션 페이지는 "내보내기 → Markdown"으로 받으면 되고, PDF·워드·한글 파일은 내용을 복사해 .txt 로 저장해 넣으세요.${total > D.DOCS_MAX ? `<br><b style="color:#ff6b57">지금 ${total.toLocaleString()}자예요. 앞에서부터 ${D.DOCS_MAX.toLocaleString()}자까지만 읽어요.</b>` : docs.length ? `<br>지금 ${total.toLocaleString()}자 / 한 번에 ${D.DOCS_MAX.toLocaleString()}자까지 읽어요. 문서가 길수록 대답이 조금 느려지고 사용량이 늘어요.` : ''}`);
    cl.body.append(r1, r3, h('div', 'row-inline'));
    cl.body.lastChild.append(addDoc, btn('인수인계 파일 만드는 프롬프트 복사', '', async () => { await window.diary.copyText(D.HANDOVER_PROMPT); D.toast('복사했어요. 그 채팅방에 붙여 넣고, 받은 .md 파일을 "참고 문서 넣기"로 넣으세요.', 6000); }));
    cl.body.append(docNote, r2, h('div', 'row-inline'));
    cl.body.lastChild.append(
      btn('저장', 'primary', async () => {
        const u = url.value.trim();
        if (u && !/^https:\/\/claude\.ai\//.test(u)) return D.toast('주소는 https://claude.ai/ 로 시작해야 해요.');
        setWork({ instructions: ins.value.trim(), claudeUrl: u });
        D.toast(`저장했어요. ${asstName}는 다음 대화부터 이 지침을 따라요.`);
      }),
      btn('Claude 채팅 열기 ↗', '', () => url.value.trim() && window.diary.open(url.value.trim())),
    );
    cl.body.append(note('<b>지침·채팅 주소·모델은 비서마다 따로</b> 저장돼요. 예를 들어 한 비서에는 A 업무 채팅의 지침과 주소를, 다른 비서에는 B 업무 채팅의 지침과 주소를 넣어 두고, 말풍선의 이름을 눌러 비서를 바꿔 가며 쓰면 돼요. 대화도 비서별로 따로 이어져요.'));
    cl.body.append(note('앱 안의 비서는 Claude(Haiku 5.5)가 이 지침과 오늘 노션 업무를 보고 대답해요. claude.ai 채팅방 자체와 대화 기록이 직접 이어지지는 않아요(Claude가 그걸 외부 앱에 열어 주지 않아요). 대신 지침을 똑같이 맞추고, "Claude에서 열기" 버튼으로 그 채팅방을 바로 열 수 있어요.'));
    // 기억해 둔 것: 대화 중에 "앞으로는 ~해 줘"라고 한 규칙을 비서가 적어 둔 목록 (비서별)
    const castId = state.theme.castActive || 'ren';
    const mem = (state.memory || {})[castId] || [];
    const ms2 = C.section(`${asstName} · 기억해 둔 것 (${mem.length})`, mem.length > 0);
    if (!mem.length) ms2.body.append(note('아직 없어요. 대화에서 <b>"앞으로는 ~해 줘"</b>, <b>"~는 꼭 확인해야 해"</b>처럼 말하면 비서가 여기에 적어 두고 계속 지켜요.'));
    for (const n of mem) {
      const row = h('div', 'row-inline');
      row.append(h('span', 'mem-text', n.text), btn('잊기', 'sm', async () => { state.memory = await window.diary.forgetMemory(castId, n.text); render(); }));
      ms2.body.append(row);
    }
    body.append(a.el, img.el, hide.el, cl.el, ms2.el);
  }

  // ---------- 시작 ----------
  function init() {
    document.getElementById('btn-settings').onclick = () => (document.body.classList.contains('settings-open') ? close() : open());
    snapshotHistory();
    if (!state.hasKeys.notion && !state.settings.welcomed) { tab = 'connect'; setTimeout(open, 400); window.diary.setSettings({ welcomed: true }).then((v) => { state.settings = v; }); }
    window.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
      if (typing) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === ',') { e.preventDefault(); open(); }
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('settings-open')) close(); });
  }

  D.settings = { init, open, close, redraw: () => { if (document.body.classList.contains('settings-open')) render(); }, refresh: () => { if (document.body.classList.contains('settings-open') && tab === 'connect' && !document.activeElement.matches('input')) render(); } };
})();
