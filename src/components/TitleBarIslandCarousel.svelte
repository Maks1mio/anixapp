<script lang="ts">
  import type { Snippet } from 'svelte';
  import { iconChevronLeft, iconChevronRight } from './icons';

  type Props = {
    label: string;
    measureKey?: string;
    children: Snippet;
  };

  let { label, measureKey = '', children }: Props = $props();

  let scrollEl = $state<HTMLDivElement | null>(null);
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let hasOverflow = $state(false);

  const SCROLL_EDGE = 4;

  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  function updateScrollState() {
    const el = scrollEl;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    hasOverflow = overflow;
    canScrollLeft = overflow && scrollLeft > SCROLL_EDGE;
    canScrollRight = overflow && scrollLeft + clientWidth < scrollWidth - SCROLL_EDGE;
  }

  function getScrollStep(el: HTMLElement): number {
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return 280;
    const gap = parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap) || 0;
    const cardWidth = card.getBoundingClientRect().width;
    return Math.round(cardWidth * 2.5 + gap * 2);
  }

  let wheelRaf = 0;
  let wheelTarget = 0;

  function cancelWheelAnim() {
    if (!wheelRaf) return;
    cancelAnimationFrame(wheelRaf);
    wheelRaf = 0;
  }

  function clampScroll(el: HTMLElement, left: number): number {
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    return Math.max(0, Math.min(max, left));
  }

  function tickWheel() {
    const el = scrollEl;
    if (!el) {
      wheelRaf = 0;
      return;
    }
    wheelTarget = clampScroll(el, wheelTarget);
    const cur = el.scrollLeft;
    const dist = wheelTarget - cur;
    if (Math.abs(dist) < 0.4) {
      el.scrollLeft = wheelTarget;
      wheelRaf = 0;
      return;
    }
    el.scrollLeft = cur + dist * 0.2;
    wheelRaf = requestAnimationFrame(tickWheel);
  }

  function scrollByDir(dir: -1 | 1) {
    const el = scrollEl;
    if (!el) return;
    cancelWheelAnim();
    el.scrollBy({ left: dir * getScrollStep(el), behavior: 'smooth' });
  }

  function onStripWheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollWidth <= el.clientWidth + 1) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();

    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= el.clientWidth;

    if (prefersReducedMotion()) {
      cancelWheelAnim();
      el.scrollLeft = clampScroll(el, el.scrollLeft + delta);
      return;
    }

    if (!wheelRaf) wheelTarget = el.scrollLeft;
    wheelTarget = clampScroll(el, wheelTarget + delta);
    if (!wheelRaf) wheelRaf = requestAnimationFrame(tickWheel);
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

    const onScroll = () => updateScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      cancelWheelAnim();
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
  });
</script>

<div
  class="island-hcarousel feed-subs__carousel"
  class:feed-subs__carousel--overflow={hasOverflow}
  class:feed-subs__carousel--can-left={canScrollLeft}
  class:feed-subs__carousel--can-right={canScrollRight}
  aria-label={label}
>
  <div
    class="island-hcarousel__scroll feed-subs__scroll"
    bind:this={scrollEl}
    onwheel={onStripWheel}
  >
    {@render children()}
  </div>

  <div
    class="feed-subs__fade feed-subs__fade--left"
    class:feed-subs__fade--visible={canScrollLeft}
    aria-hidden={!canScrollLeft}
  >
    <button
      type="button"
      class="feed-subs__arrow"
      aria-label="Прокрутить влево"
      tabindex={canScrollLeft ? 0 : -1}
      disabled={!canScrollLeft}
      onclick={() => scrollByDir(-1)}
    >
      {@html iconChevronLeft(20)}
    </button>
  </div>
  <div
    class="feed-subs__fade feed-subs__fade--right"
    class:feed-subs__fade--visible={canScrollRight}
    aria-hidden={!canScrollRight}
  >
    <button
      type="button"
      class="feed-subs__arrow"
      aria-label="Прокрутить вправо"
      tabindex={canScrollRight ? 0 : -1}
      disabled={!canScrollRight}
      onclick={() => scrollByDir(1)}
    >
      {@html iconChevronRight(20)}
    </button>
  </div>
</div>
