const RAIL_SEL = '.tv-layout__rail';
const ITEM_SEL = '.uiv2-carousel__item';
const SCROLL_SEL = '.uiv2-carousel__scroll';

/** Затемняет тайтлы карточек, ушедших под левый TV-rail при горизонтальном скролле. */
export function tvCarouselLeftDim(carouselRoot: HTMLElement): { destroy(): void } {
  const scroll =
    carouselRoot.matches(SCROLL_SEL)
      ? carouselRoot
      : carouselRoot.querySelector<HTMLElement>(SCROLL_SEL);

  if (!scroll) {
    return { destroy() {} };
  }

  let frame = 0;

  function update() {
    frame = 0;
    const rail = document.querySelector(RAIL_SEL);
    const railRight = rail?.getBoundingClientRect().right ?? 0;

    scroll.querySelectorAll(ITEM_SEL).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const rect = node.getBoundingClientRect();
      const underRail = rect.right <= railRight + 2;
      node.toggleAttribute('data-tv-under-rail', underRail);
    });
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(update);
  }

  scroll.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });

  const ro = new ResizeObserver(schedule);
  ro.observe(scroll);
  if (scroll.parentElement) ro.observe(scroll.parentElement);

  const rail = document.querySelector(RAIL_SEL);
  if (rail) ro.observe(rail);

  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-tv-rail-expanded'],
  });

  schedule();

  return {
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      scroll.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      mo.disconnect();
      scroll.querySelectorAll(ITEM_SEL).forEach((node) => {
        node.removeAttribute('data-tv-under-rail');
      });
    },
  };
}
