// 옆으로 밀기: 책장을 넘기듯이 움직인다. 미는 동안 화면이 손가락과 똑같이 따라오고, 충분히 밀고 떼면
// 지금 화면이 옆으로 나가면서 새 화면이 바로 뒤따라 들어온다 (덜 밀면 제자리로 돌아온다).
// 거쳐 온 것 (2026-11-14): 흐려졌다 밝아지는 효과는 눈이 피로하다고 해서 뺐고, 손가락의 절반만 따라오다 화면이 툭 바뀌는 방식은
// 부자연스럽다고 했다. 그래서 밝기는 그대로 두고, 두 화면이 이어서 움직이게 했다.
// 세로 스크롤과 헷갈리지 않게, 처음 움직임이 가로일 때만 따라온다.
const MIN_X = 44;    // 이만큼은 밀어야 넘어간다
const FLICK_X = 20;  // 빠르게 휙 민 경우에는 이만큼만 밀어도 넘어간다
const FLICK_MS = 220;
const RATIO = 1.8;   // 가로가 세로보다 이 배수 이상 커야 한다
const LOCK = 10;     // 이만큼 움직인 뒤에 가로인지 세로인지 정한다
const EDGE = 0.15;   // 넘길 수 없는 쪽으로 따라오는 정도 (끝이라는 것을 알려 준다)
const SLIDE_MS = 280; // 넘어가는 시간 (app.css의 .sliding, .swipe-ghost 시간과 같아야 한다)
const BACK_MS = 220;  // 제자리로 돌아오는 시간 (app.css의 .settle)
const GAP = 16;       // 두 화면 사이의 틈

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 화면을 한 장 넘긴다: 지금 화면의 사본을 그 자리에 띄워 두고 go()로 새 화면을 그린 뒤, 사본은 옆으로 내보내고 새 화면은 반대쪽에서 들여온다.
// step: +1이면 왼쪽으로 넘어간다(다음), -1이면 오른쪽(이전). from: 이미 밀려 있던 거리 (손가락으로 끌다가 뗀 경우)
export function slide(el, step, go, from = 0) {
  if (calm()) { go(); return; }
  const box = el.getBoundingClientRect(), far = box.width + GAP, ghost = el.cloneNode(true);
  ghost.querySelectorAll('.tabbar').forEach((x) => x.remove());   // 아래 탭은 넘어가지 않는다
  ghost.className = `${el.className} swipe-ghost`;
  ghost.classList.remove('dragging', 'settle', 'sliding');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;margin:0;background:none;overflow:hidden;pointer-events:none;transform:translateX(${from}px)`;
  el.after(ghost);
  ghost.scrollTop = el.scrollTop;
  go();
  el.style.setProperty('--from', `${from + step * far}px`);
  el.classList.add('sliding');
  void ghost.offsetWidth;   // 처음 자리를 한 번 그리게 한 뒤에 움직인다
  ghost.style.transform = `translateX(${-step * far}px)`;
  setTimeout(() => { ghost.remove(); el.classList.remove('sliding'); el.style.removeProperty('--from'); }, SLIDE_MS + 20);
}

// can(step): 그쪽으로 넘어갈 수 있는지. go(step): 새 화면을 그린다 (움직임은 여기서 맡는다).
// 미는 동안의 거리는 el의 CSS 변수 --drag로 알려 주고, 실제로 움직이는 것은 app.css가 정한다.
export function onSwipe(el, { can, go }) {
  let start = null, startAt = 0, locked = false, busy = false, at = 0;
  const set = (x) => { at = x; el.style.setProperty('--drag', `${x.toFixed(1)}px`); };
  const clear = () => { el.classList.remove('dragging', 'settle'); el.style.removeProperty('--drag'); at = 0; };
  const hold = (ms) => { busy = true; setTimeout(() => { busy = false; }, ms); };
  const turn = (step) => { const from = at; clear(); hold(SLIDE_MS); slide(el, step, () => go(step), from); };
  const delta = (t) => [t.clientX - start.clientX, t.clientY - start.clientY];

  el.addEventListener('touchstart', (ev) => {
    // 슬라이더·시각 입력을 만지는 중에는 넘기지 않는다
    start = !busy && ev.touches.length === 1 && !ev.target.closest('input, textarea') ? ev.touches[0] : null;
    startAt = ev.timeStamp;
    locked = false;
  }, { passive: true });
  el.addEventListener('touchmove', (ev) => {
    if (!start) return;
    const [dx, dy] = delta(ev.touches[0]);
    if (!locked) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      // 세로로 움직이기 시작했거나, 어느 쪽으로도 넘길 수 없는 화면이면 따라가지 않는다
      if (Math.abs(dx) < Math.abs(dy) * RATIO || (!can(1) && !can(-1))) { start = null; return; }
      locked = true;
      el.classList.add('dragging');
    }
    if (ev.cancelable) ev.preventDefault();   // 가로로 미는 동안에는 세로로 스크롤하지 않는다
    set(dx * (can(dx < 0 ? 1 : -1) ? 1 : EDGE));
  }, { passive: false });
  el.addEventListener('touchend', (ev) => {
    if (!start) return;
    const [dx, dy] = delta(ev.changedTouches[0]), step = dx < 0 ? 1 : -1;
    start = null;
    const quick = ev.timeStamp - startAt <= FLICK_MS && Math.abs(dx) >= FLICK_X;
    const far = (Math.abs(dx) >= MIN_X || quick) && can(step);
    if (far && (locked || Math.abs(dx) >= Math.abs(dy) * RATIO)) turn(step);
    else if (locked) back();
  }, { passive: true });
  el.addEventListener('touchcancel', () => {
    if (start && locked) back();
    start = null;
  }, { passive: true });

  // 덜 밀고 뗐을 때: 제자리로 돌아온다
  function back() {
    hold(BACK_MS);
    el.classList.add('settle');
    set(0);
    setTimeout(clear, BACK_MS);
  }
}
