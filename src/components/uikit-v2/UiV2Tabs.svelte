<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import { iconChevronLeft, iconChevronRight } from '../icons';

  export interface UiV2TabItem {
    id: string;
    label: string;
    badge?: number | string;
    /** Вертикальный разделитель перед вкладкой */
    dividerBefore?: boolean;
  }

  type Props = {
    tabs: UiV2TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    leftActions?: Snippet;
    rightActions?: Snippet;
    onTabContextMenu?: (tab: UiV2TabItem, event: MouseEvent) => void;
    class?: string;
  };

  let {
    tabs,
    activeId,
    onChange,
    leftActions,
    rightActions,
    onTabContextMenu,
    class: className = '',
  }: Props = $props();

  let scrollEl = $state<HTMLDivElement | undefined>();
  let navEl = $state<HTMLDivElement | undefined>();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let hasOverflow = $state(false);
  let indicatorX = $state(0);
  let indicatorW = $state(0);
  let indicatorVisible = $state(false);
  let indicatorAnimated = $state(false);

  const SCROLL_EDGE = 4;

  function activeTabEl(): HTMLElement | null {
    const el = scrollEl;
    if (!el) return null;
    return el.querySelector(`[data-tab="${activeId}"]`) as HTMLElement | null;
  }

  function updateIndicator() {
    const el = scrollEl;
    const nav = navEl;
    const tab = activeTabEl();
    if (!el || !nav || !tab) {
      indicatorVisible = false;
      return;
    }

    indicatorX = nav.offsetLeft + tab.offsetLeft - el.scrollLeft;
    indicatorW = tab.offsetWidth;
    indicatorVisible = indicatorW > 0;
  }

  function updateScrollState() {
    const el = scrollEl;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    hasOverflow = overflow;
    canScrollLeft = overflow && scrollLeft > SCROLL_EDGE;
    canScrollRight = overflow && scrollLeft + clientWidth < scrollWidth - SCROLL_EDGE;
    updateIndicator();
  }

  function scrollActiveTabIntoView() {
    const el = scrollEl;
    if (!el) return;
    const active = activeTabEl();
    if (!active) return;

    const fadePad = 28;
    const margin = 4;
    const tabLeft = active.offsetLeft;
    const tabRight = tabLeft + active.offsetWidth;
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;

    const fullyVisible =
      tabLeft >= viewLeft + fadePad + margin &&
      tabRight <= viewRight - fadePad - margin;
    if (fullyVisible) return;

    el.scrollTo({ left: Math.max(0, tabLeft - fadePad - margin), behavior: 'smooth' });
  }

  function scrollByDir(dir: -1 | 1) {
    const el = scrollEl;
    if (!el) return;
    const fadePad = 56;
    const step = Math.max(140, el.clientWidth - fadePad);
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  function handleTabClick(tab: UiV2TabItem) {
    if (tab.id === activeId) return;
    onChange(tab.id);
  }

  function handleTabContextMenu(tab: UiV2TabItem, e: MouseEvent) {
    e.preventDefault();
    onTabContextMenu?.(tab, e);
  }

  $effect(() => {
    const el = scrollEl;
    const nav = navEl;
    tabs.length;
    if (!el || !nav) return;
    updateScrollState();
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    ro.observe(nav);
    for (const tab of el.querySelectorAll('.uiv2-tabs__tab')) {
      ro.observe(tab);
    }
    const onScroll = () => updateScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    requestAnimationFrame(() => {
      indicatorAnimated = true;
    });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  });

  $effect(() => {
    activeId;
    tabs.length;
    const el = scrollEl;
    if (!el) return;
    void tick().then(() => {
      updateScrollState();
      scrollActiveTabIntoView();
    });
  });
</script>

<div class="uiv2-tabs {className}">
  <div class="uiv2-tabs__row">
    {#if leftActions}
      <div class="uiv2-tabs__side uiv2-tabs__side--left">
        {@render leftActions()}
      </div>
    {/if}

    <div
      class="uiv2-tabs__nav"
      bind:this={navEl}
      class:uiv2-tabs__nav--overflow={hasOverflow}
      class:uiv2-tabs__nav--can-left={canScrollLeft}
      class:uiv2-tabs__nav--can-right={canScrollRight}
    >
      <div class="uiv2-tabs__scroll" bind:this={scrollEl} role="tablist">
        {#each tabs as tab (tab.id)}
          {#if tab.dividerBefore}
            <span class="uiv2-tabs__divider" aria-hidden="true"></span>
          {/if}
          <button
            type="button"
            role="tab"
            class="uiv2-tabs__tab"
            class:uiv2-tabs__tab--active={tab.id === activeId}
            aria-selected={tab.id === activeId}
            data-tab={tab.id}
            onclick={() => handleTabClick(tab)}
            oncontextmenu={(e) => handleTabContextMenu(tab, e)}
          >
            <span class="uiv2-tabs__tab-label">{tab.label}</span>
            {#if tab.badge != null}
              <span class="uiv2-tabs__badge">{tab.badge}</span>
            {/if}
          </button>
        {/each}
      </div>

      <div
        class="uiv2-tabs__fade uiv2-tabs__fade--left"
        class:uiv2-tabs__fade--visible={canScrollLeft}
        aria-hidden={!canScrollLeft}
      >
        <button
          type="button"
          class="uiv2-tabs__arrow"
          aria-label="Прокрутить назад"
          tabindex={canScrollLeft ? 0 : -1}
          onclick={() => scrollByDir(-1)}
        >
          {@html iconChevronLeft(18)}
        </button>
      </div>

      <div
        class="uiv2-tabs__fade uiv2-tabs__fade--right"
        class:uiv2-tabs__fade--visible={canScrollRight}
        aria-hidden={!canScrollRight}
      >
        <button
          type="button"
          class="uiv2-tabs__arrow"
          aria-label="Прокрутить вперёд"
          tabindex={canScrollRight ? 0 : -1}
          onclick={() => scrollByDir(1)}
        >
          {@html iconChevronRight(18)}
        </button>
      </div>
    </div>

    {#if rightActions}
      <div class="uiv2-tabs__side uiv2-tabs__side--right">
        {@render rightActions()}
      </div>
    {/if}
  </div>

  <div class="uiv2-tabs__track" aria-hidden="true">
    <span
      class="uiv2-tabs__indicator"
      class:uiv2-tabs__indicator--visible={indicatorVisible}
      class:uiv2-tabs__indicator--animated={indicatorAnimated}
      style={`transform: translateX(${indicatorX}px); width: ${indicatorW}px;`}
    ></span>
  </div>
</div>
