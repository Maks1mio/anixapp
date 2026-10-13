/** FLIP invert→play + height без вспышки height:auto.
 *  scale — только у [data-pp-flip-scale] (кнопки); аватар скеилится CSS transition. */

export type FlipSnapshot = { el: HTMLElement; rect: DOMRect; scale: boolean }[];

export const PROFILE_LAYOUT_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';
export const PROFILE_LAYOUT_MS = 520;

export function captureFlip(root: ParentNode, selector = '[data-pp-flip]'): FlipSnapshot {
  return [...root.querySelectorAll<HTMLElement>(selector)].map((el) => ({
    el,
    rect: el.getBoundingClientRect(),
    scale: el.hasAttribute('data-pp-flip-scale'),
  }));
}

export function unlockHeight(el: HTMLElement): void {
  el.style.height = '';
  el.style.maxHeight = '';
  el.style.overflow = '';
  el.style.transition = '';
  delete el.dataset.ppHeightTo;
}

/** Сбросить все FLIP-трансформы (после обрыва / instant layout). */
export function clearAllFlips(root: ParentNode, selector = '[data-pp-flip]'): void {
  for (const node of root.querySelectorAll<HTMLElement>(selector)) {
    for (const anim of node.getAnimations()) {
      if (anim.id === 'pp-flip') anim.cancel();
    }
    node.style.transition = 'none';
    node.style.transform = '';
  }
}

function clearFlipStyles(node: HTMLElement): void {
  node.style.transition = '';
  node.style.transform = '';
}

/** Мгновенный invert (до paint), затем play в следующем кадре. */
export function playFlip(
  snapshot: FlipSnapshot,
  opts?: { duration?: number; easing?: string },
): void {
  const duration = opts?.duration ?? PROFILE_LAYOUT_MS;
  const easing = opts?.easing ?? PROFILE_LAYOUT_EASING;
  const plays: { el: HTMLElement; scale: boolean }[] = [];

  for (const { el, rect: first, scale } of snapshot) {
    if (!el.isConnected) continue;

    for (const anim of el.getAnimations()) {
      if (anim.id === 'pp-flip') anim.cancel();
    }
    clearFlipStyles(el);

    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = scale && last.width > 0 ? first.width / last.width : 1;
    const sy = scale && last.height > 0 ? first.height / last.height : 1;

    if (
      Math.abs(dx) < 0.5 &&
      Math.abs(dy) < 0.5 &&
      Math.abs(sx - 1) < 0.005 &&
      Math.abs(sy - 1) < 0.005
    ) {
      continue;
    }

    el.style.transition = 'none';
    el.style.transform = scale
      ? `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
      : `translate(${dx}px, ${dy}px)`;
    plays.push({ el, scale });
  }

  if (!plays.length) return;

  void document.body.offsetHeight;

  requestAnimationFrame(() => {
    for (const { el, scale } of plays) {
      if (!el.isConnected) continue;
      el.style.transition = `transform ${duration}ms ${easing}`;
      el.style.transform = scale ? 'translate(0px, 0px) scale(1, 1)' : 'translate(0px, 0px)';

      const onEnd = (e: TransitionEvent) => {
        if (e.target !== el || e.propertyName !== 'transform') return;
        el.removeEventListener('transitionend', onEnd);
        clearFlipStyles(el);
      };
      el.addEventListener('transitionend', onEnd);
    }
  });
}

/** Залочить текущую визуальную высоту и вернуть натуральный scrollHeight нового layout. */
export function lockHeightAndMeasure(el: HTMLElement, heightFrom: number): number {
  el.style.transition = 'none';
  el.style.overflow = 'hidden';
  el.style.height = `${heightFrom}px`;
  void el.offsetHeight;
  return el.scrollHeight;
}

/** Плавно сменить высоту с уже залоченного heightFrom на heightTo. */
export function playHeightTo(
  el: HTMLElement,
  heightTo: number,
  opts?: { duration?: number; easing?: string; token?: string },
): void {
  const duration = opts?.duration ?? PROFILE_LAYOUT_MS;
  const easing = opts?.easing ?? PROFILE_LAYOUT_EASING;
  const token = opts?.token ?? String(heightTo);
  const heightFrom = el.getBoundingClientRect().height;

  if (Math.abs(heightFrom - heightTo) < 1) {
    unlockHeight(el);
    return;
  }

  el.dataset.ppHeightTo = token;

  requestAnimationFrame(() => {
    if (el.dataset.ppHeightTo !== token) return;
    el.style.transition = `height ${duration}ms ${easing}`;
    el.style.height = `${heightTo}px`;

    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== 'height') return;
      el.removeEventListener('transitionend', onEnd);
      if (el.dataset.ppHeightTo !== token) return;
      unlockHeight(el);
    };
    el.addEventListener('transitionend', onEnd);
  });
}
