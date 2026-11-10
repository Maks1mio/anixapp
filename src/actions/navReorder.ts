/**
 * Перестановка разделов навигации: удержание поднимает иконку компактной плашкой, она идёт за пальцем
 * и меняется местами с разделом под ним, остальные не двигаются. Разделы ищутся по data-tab внутри node.
 */
import { tick } from 'svelte';

const LONG_PRESS_MS = 400;
/** Меньше порога жестов панели: удержание отменяется раньше, чем панель заберёт палец. */
const MOVE_CANCEL_PX = 6;
const SHIFT_MS = 200;
/** Поднятый раздел одного размера, откуда бы его ни взяли: плитка шире ячейки панели. */
const GHOST_W = 76;
const GHOST_H = 64;
const SETTLE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export interface NavReorderParams {
  onSwap: (id: string, targetId: string) => void;
  /** Раздел отпустили над свободной зоной (элемент с data-nav-drop, значение — какая это зона). */
  onZone?: (id: string, zone: string) => void;
  /** id поднятого раздела; null — опустили. Пока он поднят, остальные жесты панели молчат. */
  onLift: (id: string | null) => void;
  /**
   * Палец ушёл туда, где перестановка невозможна: значит, тянут саму панель, просто начали медленно.
   * Панель состоит из иконок, так что без этого такой жест всегда становился бы перестановкой.
   */
  isPanelPull?: (x: number, y: number, area: DOMRect) => boolean;
}

function tabOf(node: Element | null | undefined): HTMLElement | null {
  return node?.closest<HTMLElement>('[data-tab]') ?? null;
}

export function navReorder(node: HTMLElement, params: NavReorderParams) {
  let current = params;
  let pointerId: number | null = null;
  let pressTimer = 0;
  let startX = 0;
  let startY = 0;
  let ghost: HTMLElement | null = null;
  let liftedId: string | null = null;
  /** С кем сейчас поменян поднятый раздел: новый обмен сначала возвращает прошлый, иначе порядок перемешается. */
  let swappedWith: string | null = null;
  let overZone: HTMLElement | null = null;
  let shiftLockedUntil = 0;
  let swallowClick = false;

  function tabRects(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    for (const el of node.querySelectorAll<HTMLElement>('[data-tab]')) {
      rects.set(el.dataset.tab!, el.getBoundingClientRect());
    }
    return rects;
  }

  function moveGhost(x: number, y: number) {
    if (ghost) ghost.style.transform = `translate(${x - startX}px, ${y - startY}px)`;
  }

  function lift(item: HTMLElement) {
    if (pointerId == null) return;
    try {
      node.setPointerCapture(pointerId);
    } catch {
      pointerId = null; // палец уже убрали
      return;
    }
    liftedId = item.dataset.tab!;
    const rect = item.getBoundingClientRect();
    ghost = item.cloneNode(true) as HTMLElement;
    ghost.classList.add('m-nav-ghost');
    ghost.removeAttribute('data-tab');
    const left = startX - GHOST_W / 2;
    const top = startY - GHOST_H / 2;
    ghost.style.left = `${left}px`;
    ghost.style.top = `${top}px`;
    ghost.style.width = `${GHOST_W}px`;
    ghost.style.height = `${GHOST_H}px`;
    (node.closest('.m-app') ?? document.body).append(ghost);
    ghost.animate(
      {
        left: [`${rect.left}px`, `${left}px`],
        top: [`${rect.top}px`, `${top}px`],
        width: [`${rect.width}px`, `${GHOST_W}px`],
        height: [`${rect.height}px`, `${GHOST_H}px`],
      },
      { duration: 180, easing: SETTLE_EASING },
    );
    ghost.animate({ scale: [1, 1.08] }, { duration: 160, easing: 'ease-out', fill: 'forwards' });
    navigator.vibrate?.(12);
    const lifted = liftedId;
    // Свободная ячейка сужает соседей: они подвигаются плавно
    void withFlip(() => current.onLift(lifted));
  }

  /** Применяет изменение и плавно переводит разделы с прежних мест на новые. */
  async function withFlip(change: () => void) {
    const before = tabRects();
    change();
    await tick();
    for (const el of node.querySelectorAll<HTMLElement>('[data-tab]')) {
      const was = before.get(el.dataset.tab!);
      if (!was) continue;
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (dx === 0 && dy === 0) continue;
      el.animate(
        { transform: [`translate(${dx}px, ${dy}px)`, 'none'] },
        { duration: SHIFT_MS, easing: SETTLE_EASING },
      );
    }
  }

  function markZone(zone: HTMLElement | null) {
    if (zone === overZone) return;
    overZone?.removeAttribute('data-over');
    zone?.setAttribute('data-over', '');
    overZone = zone;
  }

  function shiftOver(x: number, y: number) {
    const lifted = liftedId;
    if (!lifted) return;
    const under = document.elementFromPoint(x, y);
    const zone = under?.closest<HTMLElement>('[data-nav-drop]');
    const inZone = !!zone && node.contains(zone);
    markZone(inZone ? zone : null);
    if (performance.now() < shiftLockedUntil) return;
    if (inZone) {
      if (swappedWith) {
        const previous = swappedWith;
        swappedWith = null;
        shiftLockedUntil = performance.now() + SHIFT_MS;
        void withFlip(() => current.onSwap(lifted, previous));
      }
      return;
    }
    const target = tabOf(under);
    if (!target || !node.contains(target) || target.dataset.tab === lifted) return;
    shiftLockedUntil = performance.now() + SHIFT_MS;
    const targetId = target.dataset.tab!;
    void withFlip(() => {
      if (swappedWith) current.onSwap(lifted, swappedWith);
      // Палец вернулся на исходное место: там сейчас стоит тот, с кем поменялись, обмен просто отменяется
      if (targetId === swappedWith) {
        swappedWith = null;
      } else {
        current.onSwap(lifted, targetId);
        swappedWith = targetId;
      }
    });
  }

  async function drop() {
    const id = liftedId;
    const flying = ghost;
    liftedId = null;
    ghost = null;
    swallowClick = true;
    const zone = overZone?.dataset.navDrop;
    markZone(null);
    if (!id || !flying) return;
    swappedWith = null;
    if (zone) await withFlip(() => current.onZone?.(id, zone));
    const home = node.querySelector<HTMLElement>(`[data-tab="${CSS.escape(id)}"]`)?.getBoundingClientRect();
    const landing = flying.animate(
      {
        ...(home && { left: `${home.left}px`, top: `${home.top}px`, width: `${home.width}px`, height: `${home.height}px` }),
        transform: 'none',
        scale: 1,
      },
      { duration: 180, easing: SETTLE_EASING, fill: 'forwards' },
    );
    landing.onfinish = () => {
      flying.remove();
      void withFlip(() => current.onLift(null));
    };
    landing.oncancel = landing.onfinish;
  }

  /** Отдаёт жест панели: копия исчезает, раздел возвращается на место. */
  function releaseToPanel() {
    if (liftedId && swappedWith) current.onSwap(liftedId, swappedWith);
    swappedWith = null;
    markZone(null);
    ghost?.remove();
    ghost = null;
    liftedId = null;
    pointerId = null;
    swallowClick = true;
    current.onLift(null);
  }

  function onDown(e: PointerEvent) {
    swallowClick = false;
    if (e.button !== 0 || liftedId) return;
    const item = tabOf(e.target as Element);
    if (!item) return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    pressTimer = window.setTimeout(() => lift(item), LONG_PRESS_MS);
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (!liftedId) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_CANCEL_PX) {
        window.clearTimeout(pressTimer);
        pointerId = null;
      }
      return;
    }
    if (current.isPanelPull?.(e.clientX, e.clientY, node.getBoundingClientRect())) {
      releaseToPanel();
      return;
    }
    moveGhost(e.clientX, e.clientY);
    shiftOver(e.clientX, e.clientY);
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    window.clearTimeout(pressTimer);
    if (liftedId) void drop();
  }

  function onClick(e: MouseEvent) {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  function onContextMenu(e: Event) {
    if (tabOf(e.target as Element)) e.preventDefault();
  }

  node.addEventListener('pointerdown', onDown);
  // На window и в фазе перехвата: панель может захватить палец себе, и до node события уже не дойдут
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  node.addEventListener('click', onClick, true);
  node.addEventListener('contextmenu', onContextMenu);
  return {
    update(next: NavReorderParams) {
      current = next;
    },
    destroy() {
      window.clearTimeout(pressTimer);
      ghost?.remove();
      node.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      node.removeEventListener('click', onClick, true);
      node.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
