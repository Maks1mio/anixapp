/**
 * Перелистывание вкладок свайпом (телефон, планшет): соседняя вкладка лежит на месте текущей и проявляется
 * по мере перетаскивания, текущая в это же время гаснет — панели TabPeek внутри node (см. TabPeek.svelte).
 * Вертикальная прокрутка остаётся за браузером (touch-action: pan-y); жест в горизонтальных каруселях игнорируется.
 */
import { tick } from 'svelte';

interface SwipeTabsParams {
  /** dir = 1 — к следующей вкладке (свайп влево), -1 — к предыдущей. Вернуть false, если перейти нельзя. */
  onSwipe: (dir: 1 | -1) => boolean;
  /** false — без свайпа (ПК): остаётся только плавная смена содержимого при нажатии на вкладку. */
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
/** Вкладка сменяется полностью, когда палец прошёл эту долю ширины. */
const FADE_RATIO = 0.6;
/** Лёгкий ход за пальцем, чтобы смена ощущалась движением: доля пути у текущей, пиксели у входящей. */
const DRIFT_RATIO = 0.25;
const INCOMING_DRIFT_PX = 28;
/** Смена нажатием на вкладку. */
const TAP_FADE_MS = 220;
/** Вкладка сменяется в тот же момент; если не сменилась (например, нужен вход) — копия не нужна. */
const SNAPSHOT_TTL_MS = 100;

const snapshotTakers = new Set<(dir: 1 | -1) => void>();

/**
 * Вызывается панелью вкладок до смены вкладки: после смены старого содержимого в DOM уже нет,
 * а гаснуть при нажатии должно именно оно. dir — в какую сторону по списку вкладок идём.
 */
export function prepareTabFade(dir: 1 | -1): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const take of snapshotTakers) take(dir);
}

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
  /** Доля смены вкладки: 0 — видна текущая, 1 — соседняя. */
  let progress = 0;
  let mode: 'idle' | 'pending' | 'horizontal' | 'vertical' = 'idle';
  let animating = false;
  let committing = false;
  /** Верх видимой области на момент жеста и был ли список прокручен за неё. */
  let visibleTop = 0;
  let listScrolled = false;
  let snapshot: { overlay: HTMLElement; contentTop: number; dir: 1 | -1; timer: number } | null = null;
  let fadeOverlay: HTMLElement | null = null;
  let fadeAnimations: Animation[] = [];

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
    // Вкладки шапки раздела, закреплённые при прокрутке (DiscoverHero)
    const dock = area?.querySelector<HTMLElement>('.discover-hero-dock__bar--visible');
    if (dock) top = Math.max(top, dock.getBoundingClientRect().bottom);
    return top;
  }

  function alignListTop(top: number) {
    const area = scroller();
    if (area) area.scrollTop += node.getBoundingClientRect().top - top;
  }

  /** Значения читает mobile-overrides.scss; ms > 0 — плавно довести до них, 0 — идти за пальцем. */
  function applySwipe(dir: 1 | -1, ms = 0) {
    const { style } = node;
    style.setProperty('--tab-swipe-p', String(progress));
    style.setProperty('--tab-swipe-x', `${dx * (hasPeek(dir) ? DRIFT_RATIO : 1)}px`);
    style.setProperty('--tab-swipe-in-x', `${dir * (1 - progress) * INCOMING_DRIFT_PX}px`);
    style.setProperty('--tab-swipe-transition', ms ? `opacity ${ms}ms ${EASING}, transform ${ms}ms ${EASING}` : 'none');
  }

  function animateTo(target: number, dir: 1 | -1, done: () => void) {
    const distance = Math.abs(target - progress) * node.clientWidth * FADE_RATIO;
    const speed = Math.max(Math.abs(velocity), MIN_ANIM_SPEED);
    const ms = Math.min(MAX_ANIM_MS, Math.max(MIN_ANIM_MS, distance / speed));
    animating = true;
    progress = target;
    if (target === 0) dx = 0;
    applySwipe(dir, ms);
    window.setTimeout(done, ms + 30);
  }

  function settle() {
    for (const name of ['--tab-swipe-p', '--tab-swipe-x', '--tab-swipe-in-x', '--tab-swipe-transition']) {
      node.style.removeProperty(name);
    }
    delete node.dataset.tabSwiping;
    progress = 0;
    animating = false;
  }

  const isOwnContent = (el: Element) =>
    !(el instanceof HTMLElement) || (el.dataset.tabPeek === undefined && el !== fadeOverlay);

  function dropSnapshot() {
    if (snapshot) window.clearTimeout(snapshot.timer);
    snapshot = null;
  }

  function takeSnapshot(dir: 1 | -1) {
    dropSnapshot();
    if (animating || !node.getClientRects().length) return;
    // Копия самого node: те же классы и раскладка, что у настоящего содержимого
    const overlay = node.cloneNode(false) as HTMLElement;
    let contentTop = node.getBoundingClientRect().top;
    for (const child of node.children) {
      if (!isOwnContent(child)) continue;
      if (!overlay.childElementCount) contentTop = child.getBoundingClientRect().top;
      overlay.append(child.cloneNode(true));
    }
    overlay.removeAttribute('role');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;margin:0;box-sizing:border-box;overflow:hidden;pointer-events:none;';
    snapshot = {
      overlay,
      contentTop,
      dir,
      timer: window.setTimeout(dropSnapshot, SNAPSHOT_TTL_MS),
    };
  }

  function clearFade() {
    for (const animation of fadeAnimations) animation.cancel();
    fadeAnimations = [];
    fadeOverlay?.remove();
    fadeOverlay = null;
  }

  /** Список ушёл выше видимой области — ставим его под вкладки (на ПК положение оставляет экран). */
  function alignAfterTap() {
    if (current.enabled === false) return;
    const top = measureVisibleTop();
    if (node.getBoundingClientRect().top < top) alignListTop(top);
  }

  /** Копия старой вкладки гаснет на прежнем месте, новая проявляется под ней. */
  function playFade(snap: NonNullable<typeof snapshot>) {
    clearFade();
    alignAfterTap();
    const { overlay, dir } = snap;
    const incoming = [...node.children].filter(isOwnContent);
    overlay.style.maxHeight = '100dvh';
    node.append(overlay);
    fadeOverlay = overlay;
    // Копия ставится по замеру: прокрутка могла сброситься, а верхний отступ первого блока, который
    // на странице схлопывается с соседним, в копии остаётся внутри (подиум Популярного прыгал бы вниз)
    const copyTop = overlay.firstElementChild?.getBoundingClientRect().top ?? snap.contentTop;
    const offset = snap.contentTop - copyTop;
    overlay.style.top = `${offset}px`;
    overlay.style.maxHeight = `calc(100dvh + ${Math.abs(offset)}px)`;
    const timing = { duration: TAP_FADE_MS, easing: EASING };
    const shifted = (px: number) => `translate3d(${px}px, 0, 0)`;
    const out = overlay.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: shifted(-dir * INCOMING_DRIFT_PX) }],
      timing,
    );
    out.onfinish = clearFade;
    fadeAnimations = [
      out,
      ...incoming.map((el) => el.animate(
        [{ opacity: 0, transform: shifted(dir * INCOMING_DRIFT_PX) }, { opacity: 1, transform: 'none' }],
        timing,
      )),
    ];
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
      clearFade();
      // Соседняя вкладка начинается там же, где виден верх текущего списка
      visibleTop = measureVisibleTop();
      const top = node.getBoundingClientRect().top;
      listScrolled = top < visibleTop;
      node.style.setProperty('--tab-peek-top', `${Math.max(0, visibleTop - top)}px`);
    }
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (pointX - lastX) / dt;
    lastX = pointX;
    lastT = e.timeStamp;
    const dir: 1 | -1 = x < 0 ? 1 : -1;
    const peek = hasPeek(dir);
    dx = peek ? x : x * EDGE_RESISTANCE;
    progress = peek ? Math.min(1, Math.abs(x) / (node.clientWidth * FADE_RATIO)) : 0;
    node.dataset.tabSwiping = String(dir);
    applySwipe(dir);
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
      animateTo(0, dir, settle);
      return;
    }
    animateTo(1, dir, () => {
      committing = true;
      const moved = current.onSwipe(dir);
      // Снимаем наложение в тот же кадр, когда вкладка уже подменилась: панель и настоящий список совпадают
      void tick().then(() => {
        committing = false;
        if (!moved) {
          animateTo(0, dir, settle);
          return;
        }
        settle();
        // Экран мог сам вернуться к началу страницы: тогда список уже не выше видимой области
        if (listScrolled && node.getBoundingClientRect().top < visibleTop) alignListTop(visibleTop);
      });
    });
  }

  if (current.enabled !== false) node.style.touchAction = 'pan-y';
  node.style.position = 'relative';
  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchmove', onMove, { passive: true });
  node.addEventListener('touchend', onEnd);
  node.addEventListener('touchcancel', onEnd);
  snapshotTakers.add(takeSnapshot);

  return {
    update(next: SwipeTabsParams) {
      const tapped = next.activeId !== current.activeId && !committing && !animating;
      current = next;
      if (!tapped) return;
      void tick().then(() => {
        const snap = snapshot;
        dropSnapshot();
        if (snap) playFade(snap);
        else alignAfterTap();
      });
    },
    destroy() {
      snapshotTakers.delete(takeSnapshot);
      dropSnapshot();
      clearFade();
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    },
  };
}
