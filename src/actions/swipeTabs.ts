/**
 * Перелистывание вкладок свайпом (телефон, планшет), как ViewPager: содержимое идёт за пальцем 1:1,
 * а рядом едет уже отрисованная соседняя вкладка — панели TabPeek внутри node (см. TabPeek.svelte).
 * Вертикальная прокрутка остаётся за браузером (touch-action: pan-y); жест в горизонтальных каруселях игнорируется.
 */
import { tick } from 'svelte';

interface SwipeTabsParams {
  /** dir = 1 — к следующей вкладке (свайп влево), -1 — к предыдущей. Вернуть false, если перейти нельзя. */
  onSwipe: (dir: 1 | -1) => boolean;
  enabled?: boolean;
  /** Текущая вкладка: при смене нажатием на вкладку список встаёт к началу, под панели. */
  activeId?: string;
}

const LOCK_PX = 10;
/** Перелистывает, если сдвинули на эту долю ширины или быстро смахнули. */
const COMMIT_RATIO = 0.25;
const COMMIT_VELOCITY = 0.35;
/** Сопротивление у крайней вкладки. */
const EDGE_RESISTANCE = 0.2;
const MIN_ANIM_MS = 120;
const MAX_ANIM_MS = 280;
const MIN_ANIM_SPEED = 1.6;
const EASING = 'cubic-bezier(0.22, 0.8, 0.3, 1)';

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
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let mode: 'idle' | 'pending' | 'horizontal' | 'vertical' = 'idle';
  let animating = false;
  let committing = false;
  /** Верх видимой области на момент жеста и был ли список прокручен за неё. */
  let visibleTop = 0;
  let listScrolled = false;

  const hasPeek = (dir: 1 | -1) => !!node.querySelector(`:scope > [data-tab-peek="${dir}"]`);
  const scroller = () => node.closest<HTMLElement>('.page__scroll');

  /** Нижний край закреплённых сверху панели и вкладок (или верх области прокрутки). */
  function measureVisibleTop(): number {
    const area = scroller();
    let top = area ? area.getBoundingClientRect().top : 0;
    const bars = [
      area?.querySelector<HTMLElement>(':scope > .m-topbar'),
      node.parentElement?.querySelector<HTMLElement>(':scope > .uiv2-tabs'),
    ];
    for (const bar of bars) {
      if (bar && getComputedStyle(bar).position === 'sticky') top = Math.max(top, bar.getBoundingClientRect().bottom);
    }
    return top;
  }

  function alignListTop(top: number) {
    const area = scroller();
    if (area) area.scrollTop += node.getBoundingClientRect().top - top;
  }

  function setOffset(px: number, ms = 0) {
    node.style.transition = ms ? `transform ${ms}ms ${EASING}` : 'none';
    node.style.transform = px ? `translate3d(${px}px, 0, 0)` : '';
  }

  function animateTo(px: number, done: () => void) {
    const distance = Math.abs(px - dx);
    const speed = Math.max(Math.abs(velocity), MIN_ANIM_SPEED);
    const ms = Math.min(MAX_ANIM_MS, Math.max(MIN_ANIM_MS, distance / speed));
    animating = true;
    setOffset(px, ms);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      node.removeEventListener('transitionend', onEnd);
      done();
    };
    const onEnd = (e: TransitionEvent) => { if (e.target === node) finish(); };
    node.addEventListener('transitionend', onEnd);
    window.setTimeout(finish, ms + 60);
  }

  function settle() {
    setOffset(0);
    node.style.willChange = '';
    delete node.dataset.tabSwiping;
    animating = false;
  }

  function onStart(e: TouchEvent) {
    if (current.enabled === false || animating || e.touches.length !== 1) return;
    if (insideHorizontalScroller(e.target, node)) return;
    startX = lastX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    lastT = e.timeStamp;
    dx = 0;
    velocity = 0;
    mode = 'pending';
  }

  function onMove(e: TouchEvent) {
    if (mode === 'idle' || mode === 'vertical') return;
    const pointX = e.touches[0].clientX;
    const x = pointX - startX;
    const y = e.touches[0].clientY - startY;
    if (mode === 'pending') {
      if (Math.abs(x) < LOCK_PX && Math.abs(y) < LOCK_PX) return;
      mode = Math.abs(x) > Math.abs(y) * 1.2 ? 'horizontal' : 'vertical';
      if (mode === 'vertical') return;
      // Соседняя вкладка начинается там же, где виден верх текущего списка
      visibleTop = measureVisibleTop();
      const top = node.getBoundingClientRect().top;
      listScrolled = top < visibleTop;
      node.style.setProperty('--tab-peek-top', `${Math.max(0, visibleTop - top)}px`);
      node.style.willChange = 'transform';
      node.dataset.tabSwiping = '';
    }
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (pointX - lastX) / dt;
    lastX = pointX;
    lastT = e.timeStamp;
    dx = hasPeek(x < 0 ? 1 : -1) ? x : x * EDGE_RESISTANCE;
    setOffset(dx);
  }

  function onEnd() {
    if (mode !== 'horizontal') {
      mode = 'idle';
      return;
    }
    mode = 'idle';
    const dir: 1 | -1 = dx < 0 ? 1 : -1;
    const width = node.clientWidth;
    const flung = Math.abs(velocity) > COMMIT_VELOCITY && Math.sign(velocity) === Math.sign(dx);
    if (!hasPeek(dir) || !(flung || Math.abs(dx) > width * COMMIT_RATIO)) {
      animateTo(0, settle);
      return;
    }
    animateTo(-dir * width, () => {
      committing = true;
      const moved = current.onSwipe(dir);
      // Снимаем сдвиг в тот же кадр, когда вкладка уже подменилась: панель и настоящий список совпадают
      void tick().then(() => {
        committing = false;
        if (!moved) {
          dx = -dir * width;
          animateTo(0, settle);
          return;
        }
        settle();
        if (listScrolled) alignListTop(visibleTop);
      });
    });
  }

  if (current.enabled !== false) node.style.touchAction = 'pan-y';
  node.style.position = 'relative';
  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchmove', onMove, { passive: true });
  node.addEventListener('touchend', onEnd);
  node.addEventListener('touchcancel', onEnd);

  return {
    update(next: SwipeTabsParams) {
      const tapped = next.activeId !== current.activeId && !committing && !animating;
      current = next;
      if (!tapped || next.enabled === false) return;
      void tick().then(() => {
        const top = measureVisibleTop();
        if (node.getBoundingClientRect().top < top) alignListTop(top);
      });
    },
    destroy() {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    },
  };
}
