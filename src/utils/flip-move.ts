/** FLIP для шапки профиля. Корректно переживает реверс на лету. */

export type FlipSnapshot = { el: HTMLElement; rect: DOMRect }[];

const EASING = 'cubic-bezier(0.22, 1.05, 0.36, 1)';

export function captureFlip(root: ParentNode, selector = '[data-pp-flip]'): FlipSnapshot {
  return [...root.querySelectorAll<HTMLElement>(selector)].map((el) => ({
    el,
    rect: el.getBoundingClientRect(),
  }));
}

/** Снять залоченную высоту. */
export function unlockHeight(el: HTMLElement): void {
  for (const anim of el.getAnimations()) {
    if (anim.id === 'pp-height') anim.cancel();
  }
  el.style.height = '';
  el.style.maxHeight = '';
  el.style.overflow = '';
  el.style.transition = '';
}

export function playFlip(
  snapshot: FlipSnapshot,
  opts?: { duration?: number; easing?: string },
): void {
  const duration = opts?.duration ?? 480;
  const easing = opts?.easing ?? EASING;

  for (const { el, rect: first } of snapshot) {
    if (!el.isConnected) continue;

    for (const anim of el.getAnimations()) {
      if (anim.id === 'pp-flip') anim.cancel();
    }
    if (el.style.transform) el.style.transform = '';

    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

    const anim = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0px, 0px)' },
      ],
      { duration, easing, fill: 'both', id: 'pp-flip' },
    );

    anim.finished
      .then(() => {
        try {
          anim.cancel();
        } catch {
          /* ignore */
        }
        if (el.style.transform) el.style.transform = '';
      })
      .catch(() => {
        /* interrupted */
      });
  }
}
