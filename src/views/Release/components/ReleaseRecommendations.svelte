<script lang="ts">
  import { iconChevronLeft, iconChevronRight } from '../../../components/icons';
  import RecommendedReleaseCard from '../../../components/RecommendedReleaseCard.svelte';
  import type { ReleaseCardData } from '../../../types/release';

  interface Props {
    items: ReleaseCardData[];
  }

  let { items }: Props = $props();

  let sectionEl = $state<HTMLElement | undefined>();
  let panelEl = $state<HTMLElement | undefined>();
  let scrollEl = $state<HTMLDivElement | undefined>();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let hasOverflow = $state(false);
  let bgVisible = $state(false);
  let bgTop = $state(0);
  let bgWidth = $state(0);
  let bgHeight = $state(0);

  const SCROLL_EDGE = 4;

  function getScrollEl(): HTMLElement | null {
    return sectionEl?.closest('.page__scroll') as HTMLElement | null;
  }

  function syncPanelBg() {
    const scroll = getScrollEl();
    const panel = panelEl;
    if (!scroll || !panel) {
      bgVisible = false;
      return;
    }

    const scrollRect = scroll.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    bgTop = panelRect.top - scrollRect.top + scroll.scrollTop;
    bgWidth = scroll.offsetWidth;
    bgHeight = panel.offsetHeight;
    bgVisible = true;
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
    items.length;
    const panel = panelEl;
    const scroll = getScrollEl();
    if (!panel || !scroll) {
      bgVisible = false;
      return;
    }

    const update = () => requestAnimationFrame(syncPanelBg);

    update();
    const ro = new ResizeObserver(update);
    ro.observe(panel);
    ro.observe(scroll);

    scroll.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      scroll.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  });

  $effect(() => {
    items.length;
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
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
  });
</script>

{#if items.length > 0}
  <div class="release-page__section release-page__recommended" bind:this={sectionEl}>
    {#if bgVisible}
      <div
        class="release-page__section-bg"
        aria-hidden="true"
        style:top="{bgTop}px"
        style:width="{bgWidth}px"
        style:height="{bgHeight}px"
      ></div>
    {/if}

    <div class="release-page__recommended-panel" bind:this={panelEl}>
      <h2 class="release-page__block-title">Рекомендуем также</h2>

      <div
        class="release-page__recommended-nav"
        class:release-page__recommended-nav--overflow={hasOverflow}
        class:release-page__recommended-nav--can-left={canScrollLeft}
        class:release-page__recommended-nav--can-right={canScrollRight}
      >
        <div class="release-page__recommended-scroll" bind:this={scrollEl}>
          {#each items as item (item.id)}
            <RecommendedReleaseCard data={item} />
          {/each}
        </div>

        <div
          class="release-page__recommended-fade release-page__recommended-fade--left"
          class:release-page__recommended-fade--visible={canScrollLeft}
          aria-hidden={!canScrollLeft}
        >
          <button
            type="button"
            class="release-page__recommended-arrow release-page__recommended-arrow--left"
            aria-label="Прокрутить назад"
            tabindex={canScrollLeft ? 0 : -1}
            onclick={() => scrollByDir(-1)}
          >
            {@html iconChevronLeft(22)}
          </button>
        </div>

        <div
          class="release-page__recommended-fade release-page__recommended-fade--right"
          class:release-page__recommended-fade--visible={canScrollRight}
          aria-hidden={!canScrollRight}
        >
          <button
            type="button"
            class="release-page__recommended-arrow release-page__recommended-arrow--right"
            aria-label="Прокрутить вперёд"
            tabindex={canScrollRight ? 0 : -1}
            onclick={() => scrollByDir(1)}
          >
            {@html iconChevronRight(22)}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
