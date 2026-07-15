<script lang="ts">
  import { iconChevronLeft, iconChevronRight } from '../../../components/icons';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    /** Re-run scroll measurements when content changes */
    measureKey?: unknown;
    navClass?: string;
    scrollClass?: string;
    initialScrollLeft?: number;
    onScrollLeftChange?: (left: number) => void;
  }

  let {
    children,
    measureKey,
    navClass = '',
    scrollClass = '',
    initialScrollLeft = 0,
    onScrollLeftChange,
  }: Props = $props();

  let scrollEl = $state<HTMLDivElement | undefined>();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let hasOverflow = $state(false);
  let initialScrollApplied = false;

  const SCROLL_EDGE = 4;

  function updateScrollState() {
    const el = scrollEl;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    hasOverflow = overflow;
    canScrollLeft = overflow && scrollLeft > SCROLL_EDGE;
    canScrollRight = overflow && scrollLeft + clientWidth < scrollWidth - SCROLL_EDGE;
  }

  function getScrollStep(el: HTMLDivElement): number {
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return 200;
    const gap = parseFloat(getComputedStyle(el).gap) || 0;
    const cardWidth = card.getBoundingClientRect().width;
    return Math.round(cardWidth * 2 + gap);
  }

  function scrollByDir(dir: -1 | 1) {
    const el = scrollEl;
    if (!el) return;
    el.scrollBy({ left: dir * getScrollStep(el), behavior: 'smooth' });
  }

  $effect(() => {
    measureKey;
    const el = scrollEl;
    if (!el) return;

    const update = () => {
      requestAnimationFrame(updateScrollState);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);

    const onScroll = () => {
      updateScrollState();
      onScrollLeftChange?.(el.scrollLeft);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);

    if (!initialScrollApplied && initialScrollLeft > 0) {
      requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollLeft = initialScrollLeft;
        initialScrollApplied = true;
      });
    }

    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
  });
</script>

<div
  class="release-page__carousel-nav {navClass}"
  class:release-page__carousel-nav--overflow={hasOverflow}
  class:release-page__carousel-nav--can-left={canScrollLeft}
  class:release-page__carousel-nav--can-right={canScrollRight}
>
  <div class="release-page__carousel-scroll {scrollClass}" bind:this={scrollEl}>
    {@render children()}
  </div>

  <div
    class="release-page__carousel-fade release-page__carousel-fade--left"
    class:release-page__carousel-fade--visible={canScrollLeft}
    aria-hidden={!canScrollLeft}
  >
    <button
      type="button"
      class="release-page__carousel-arrow release-page__carousel-arrow--left"
      aria-label="Прокрутить назад"
      tabindex={canScrollLeft ? 0 : -1}
      onclick={() => scrollByDir(-1)}
    >
      {@html iconChevronLeft(22)}
    </button>
  </div>

  <div
    class="release-page__carousel-fade release-page__carousel-fade--right"
    class:release-page__carousel-fade--visible={canScrollRight}
    aria-hidden={!canScrollRight}
  >
    <button
      type="button"
      class="release-page__carousel-arrow release-page__carousel-arrow--right"
      aria-label="Прокрутить вперёд"
      tabindex={canScrollRight ? 0 : -1}
      onclick={() => scrollByDir(1)}
    >
      {@html iconChevronRight(22)}
    </button>
  </div>
</div>
