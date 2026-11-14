// 옆으로 밀기: 손가락을 가로로 밀면 화면이 손가락을 따라오고, 충분히 밀고 떼면 넘어간다 (덜 밀면 제자리로 돌아온다).
// 세로 스크롤과 헷갈리지 않게, 처음 움직임이 가로일 때만 따라온다.
const MIN_X = 56;    // 이만큼은 밀어야 넘어간다
const RATIO = 1.8;   // 가로가 세로보다 이 배수 이상 커야 한다
const LOCK = 10;     // 이만큼 움직인 뒤에 가로인지 세로인지 정한다
const OUT_MS = 150;  // 넘어갈 때 밀려 나가는 시간 (app.css의 .settle 시간보다 짧지 않게)
const BACK_MS = 220; // 제자리로 돌아오는 시간

// can(step): 그쪽으로 넘어갈 수 있는지. go(step): 넘긴다. step은 왼쪽으로 밀면 +1(다음), 오른쪽으로 밀면 -1(이전).
// 밀리는 정도는 el의 CSS 변수 --drag(가로 이동), --drag-o(투명도)로 알려 주고, 실제로 움직이는 것은 app.css가 정한다.
export function onSwipe(el, { can, go }) {
  let start = null, locked = false, busy = false;
  const set = (x, o) => { el.style.setProperty('--drag', `${x.toFixed(1)}px`); el.style.setProperty('--drag-o', o.toFixed(2)); };
  const clear = () => {
    el.classList.remove('dragging', 'settle');
    el.style.removeProperty('--drag');
    el.style.removeProperty('--drag-o');
    busy = false;
  };
  const delta = (t) => [t.clientX - start.clientX, t.clientY - start.clientY];
  // 손을 뗀 뒤: 넘어가면 밀던 쪽으로 마저 나간 다음 새 화면을 그리고, 아니면 제자리로 돌아온다
  const settle = (step, pass) => {
    busy = true;
    el.classList.add('settle');
    if (pass) set(-step * window.innerWidth * 0.5, 0); else set(0, 1);
    setTimeout(() => { clear(); if (pass) go(step); }, pass ? OUT_MS : BACK_MS);
  };

  el.addEventListener('touchstart', (ev) => {
    // 슬라이더·시각 입력을 만지는 중에는 넘기지 않는다
    start = !busy && ev.touches.length === 1 && !ev.target.closest('input, textarea') ? ev.touches[0] : null;
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
    // 넘어갈 수 없는 쪽으로는 조금만 따라오게 해서 끝이라는 것을 알려 준다
    const x = can(dx < 0 ? 1 : -1) ? dx : dx * 0.2;
    set(x, 1 - Math.min(Math.abs(x) / window.innerWidth, 1) * 0.6);
  }, { passive: false });
  el.addEventListener('touchend', (ev) => {
    if (!start) return;
    const [dx, dy] = delta(ev.changedTouches[0]), step = dx < 0 ? 1 : -1;
    start = null;
    const far = Math.abs(dx) >= MIN_X && can(step);
    if (locked) settle(step, far);
    else if (far && Math.abs(dx) >= Math.abs(dy) * RATIO) go(step);   // 움직임 없이 휙 넘긴 경우
  }, { passive: true });
  el.addEventListener('touchcancel', () => {
    if (start && locked) settle(1, false);
    start = null;
  }, { passive: true });
}
