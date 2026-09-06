const TV_HOME_CAROUSEL_CARD_SEL =
  '.tv-home .uiv2-anime-card[role="button"], .tv-home .tv-category-see-all[role="button"]';
const TV_ROW_SCROLL_SEL = '.uiv2-carousel__scroll';
const RAIL_SEL = '.tv-layout__rail';

function getRailRight(): number {
  const rail = document.querySelector(RAIL_SEL);
  return rail?.getBoundingClientRect().right ?? 0;
}

/** Прокрутить горизонтальный ряд TV, чтобы карточка была видна целиком (+ чуть следующей). */
export function scrollTvCarouselItemIntoView(el: HTMLElement): void {
  const scroll = el.closest(TV_ROW_SCROLL_SEL);
  if (!(scroll instanceof HTMLElement)) return;

  const item = el.closest('.uiv2-carousel__item');
  const target = item instanceof HTMLElement ? item : el;
  const scrollRect = scroll.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const padLeft = 16;
  const padRight = 16;
  const railRight = getRailRight();
  const minLeft = railRight > 0 ? railRight + padLeft : scrollRect.left + padLeft;
  const maxRight = scrollRect.right - padRight;
  const gap = Number.parseFloat(getComputedStyle(scroll).gap) || 0;
  const peekNext = Math.min(targetRect.width * 0.28 + gap, 96);
  const canScrollMore = scroll.scrollLeft < scroll.scrollWidth - scroll.clientWidth - 2;

  let delta = 0;

  if (targetRect.right > maxRight) {
    delta = targetRect.right - maxRight;
    if (canScrollMore) delta += peekNext;
  } else if (targetRect.left < minLeft) {
    delta = targetRect.left - minLeft;
  } else if (targetRect.left < scrollRect.left + padLeft) {
    delta = targetRect.left - (scrollRect.left + padLeft);
  }

  if (Math.abs(delta) <= 1) return;

  const maxScroll = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
  const nextLeft = Math.max(0, Math.min(maxScroll, scroll.scrollLeft + delta));
  scroll.scrollTo({ left: nextLeft, behavior: 'smooth' });
}

function carouselCardFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const card = target.closest<HTMLElement>(TV_HOME_CAROUSEL_CARD_SEL);
  return card;
}

/** Наведение / фокус на карточке главной — подкрутить горизонтальный ряд. */
export function attachTvHomeCarouselScroll(root: ParentNode = document): () => void {
  const scope = root instanceof Document ? document : root;
  let lastCard: HTMLElement | null = null;
  let lastAt = 0;

  const schedule = (card: HTMLElement) => {
    const now = Date.now();
    if (card === lastCard && now - lastAt < 100) return;
    lastCard = card;
    lastAt = now;
    scrollTvCarouselItemIntoView(card);
  };

  const onMouseOver = (event: MouseEvent) => {
    const card = carouselCardFromTarget(event.target);
    if (!card) return;
    schedule(card);
  };

  const onFocusIn = (event: FocusEvent) => {
    const card = carouselCardFromTarget(event.target);
    if (!card) return;
    schedule(card);
  };

  scope.addEventListener('mouseover', onMouseOver, true);
  scope.addEventListener('focusin', onFocusIn, true);

  return () => {
    scope.removeEventListener('mouseover', onMouseOver, true);
    scope.removeEventListener('focusin', onFocusIn, true);
    lastCard = null;
  };
}
