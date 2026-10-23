/**
 * Перелистывание вкладок свайпом по содержимому (телефон), как ViewPager в Anixart:
 * содержимое едет за пальцем, при достаточном сдвиге уходит в сторону, а новая вкладка въезжает с другой.
 * Вертикальная прокрутка остаётся за браузером (touch-action: pan-y); жест в горизонтальных каруселях игнорируется.
 */
interface SwipeTabsParams {
  /** dir = 1 — к следующей вкладке (свайп влево), -1 — к предыдущей. Вернуть false, если вкладки нет. */
  onSwipe: (dir: 1 | -1) => boolean;
  enabled?: boolean;
}

const LOCK_PX = 12;
const COMMIT_PX = 72;
const FOLLOW = 0.4;
const ANIM_MS = 160;

function insideHorizontalScroller(target: EventTarget | null, root: HTMLElement): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== root) {
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 2) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function swipeTabs(node: HTMLElement, params: SwipeTabsParams) {
  let current = params;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let mode: 'idle' | 'pending' | 'horizontal' | 'vertical' = 'idle';
  let animating = false;

  function setOffset(px: number, transition = false) {
    node.style.transition = transition ? `transform ${ANIM_MS}ms ease, opacity ${ANIM_MS}ms ease` : 'none';
    node.style.transform = px ? `translate3d(${px}px, 0, 0)` : '';
    node.style.opacity = px ? String(Math.max(0.35, 1 - Math.abs(px) / node.clientWidth)) : '';
  }

  function onStart(e: TouchEvent) {
    if (current.enabled === false || animating || e.touches.length !== 1) return;
    if (insideHorizontalScroller(e.target, node)) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0;
    mode = 'pending';
  }

  function onMove(e: TouchEvent) {
    if (mode === 'idle' || mode === 'vertical') return;
    const x = e.touches[0].clientX - startX;
    const y = e.touches[0].clientY - startY;
    if (mode === 'pending') {
      if (Math.abs(x) < LOCK_PX && Math.abs(y) < LOCK_PX) return;
      mode = Math.abs(x) > Math.abs(y) * 1.4 ? 'horizontal' : 'vertical';
      if (mode === 'vertical') return;
    }
    dx = x;
    setOffset(dx * FOLLOW);
  }

  function onEnd() {
    if (mode !== 'horizontal') {
      mode = 'idle';
      return;
    }
    mode = 'idle';
    const dir: 1 | -1 = dx < 0 ? 1 : -1;
    if (Math.abs(dx) < COMMIT_PX) {
      setOffset(0, true);
      return;
    }
    animating = true;
    const w = node.clientWidth * 0.3;
    setOffset(-dir * w, true);
    window.setTimeout(() => {
      if (!current.onSwipe(dir)) {
        setOffset(0, true);
        window.setTimeout(() => { animating = false; }, ANIM_MS);
        return;
      }
      setOffset(dir * w);
      requestAnimationFrame(() => {
        setOffset(0, true);
        window.setTimeout(() => {
          node.style.transition = '';
          animating = false;
        }, ANIM_MS);
      });
    }, ANIM_MS);
  }

  node.style.touchAction = 'pan-y';
  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchmove', onMove, { passive: true });
  node.addEventListener('touchend', onEnd);
  node.addEventListener('touchcancel', onEnd);

  return {
    update(next: SwipeTabsParams) {
      current = next;
    },
    destroy() {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    },
  };
}
