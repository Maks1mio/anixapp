const RAIL_SEL = '.tv-layout__rail';
const SCROLL_SEL = '.tv-home .uiv2-carousel__scroll';
const ITEM_SEL = '.uiv2-carousel__item';

function getRailRight(): number {
  const rail = document.querySelector(RAIL_SEL);
  return rail?.getBoundingClientRect().right ?? 0;
}

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/** 0 = полностью видно, 1 = максимальное затемнение под меню */
function railDimStrength(rect: DOMRect, railRight: number): number {
  if (rect.right <= 0 || railRight <= 0) return 0;
  if (rect.left >= railRight + 20) return 0;

  const fadeSpan = Math.max(rect.width * 0.9, 80);
  const raw = (railRight - rect.left + 12) / fadeSpan;
  return smoothstep(Math.max(0, Math.min(1, raw)));
}

function applyRailDim(item: HTMLElement, card: HTMLElement | null, strength: number): void {
  const value = strength.toFixed(3);
  item.style.setProperty('--tv-rail-dim', value);
  card?.style.setProperty('--tv-rail-dim', value);
}

function updateScroll(scroll: HTMLElement): void {
  const railRight = getRailRight();
  scroll.querySelectorAll<HTMLElement>(ITEM_SEL).forEach((item) => {
    const card = item.querySelector<HTMLElement>('.uiv2-anime-card, .tv-category-see-all');
    const target = card ?? item;
    const strength = railDimStrength(target.getBoundingClientRect(), railRight);
    applyRailDim(item, card, strength);
  });
}

function updateAll(scrolls: Set<HTMLElement>): void {
  scrolls.forEach(updateScroll);
}

export function attachTvHomeRailTitleDim(root: ParentNode = document): () => void {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('tv-android')) {
    return () => {};
  }

  const scrolls = new Set<HTMLElement>();
  let raf = 0;

  const scheduleUpdate = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      updateAll(scrolls);
    });
  };

  const onScroll = () => scheduleUpdate();

  const bindScroll = (el: HTMLElement) => {
    if (scrolls.has(el)) return;
    scrolls.add(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    updateScroll(el);
  };

  const scan = () => {
    const scope = root instanceof Document ? document : root;
    scope.querySelectorAll<HTMLElement>(SCROLL_SEL).forEach(bindScroll);
    scheduleUpdate();
  };

  const mo = new MutationObserver(scan);
  mo.observe(root instanceof Document ? document.body : (root as Node), {
    childList: true,
    subtree: true,
  });

  const ro = new ResizeObserver(scheduleUpdate);
  ro.observe(document.documentElement);
  const rail = document.querySelector(RAIL_SEL);
  if (rail) ro.observe(rail);

  const railExpandObs = new MutationObserver(scheduleUpdate);
  railExpandObs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-tv-rail-expanded'],
  });

  const focusObs = new MutationObserver(scheduleUpdate);
  focusObs.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-tv-focus'],
  });

  window.addEventListener('resize', scan, { passive: true });
  scan();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    mo.disconnect();
    ro.disconnect();
    railExpandObs.disconnect();
    focusObs.disconnect();
    window.removeEventListener('resize', scan);
    scrolls.forEach((el) => {
      el.removeEventListener('scroll', onScroll);
      el.querySelectorAll<HTMLElement>(ITEM_SEL).forEach((item) => {
        item.style.removeProperty('--tv-rail-dim');
        item.querySelector<HTMLElement>('.uiv2-anime-card, .tv-category-see-all')
          ?.style.removeProperty('--tv-rail-dim');
      });
    });
    scrolls.clear();
  };
}
