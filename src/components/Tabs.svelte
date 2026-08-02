<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import { iconChevronLeft, iconChevronRight } from './icons';

  export interface TabItem {
    id: string;
    label: string;
    badge?: number | string;
    /** Вертикальный разделитель перед вкладкой */
    dividerBefore?: boolean;
  }

  interface Props {
    tabs: TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    rootClassName?: string;
    leftActions?: Snippet;
    rightActions?: Snippet;
    onTabContextMenu?: (tab: TabItem, event: MouseEvent) => void;
  }

  let { tabs, activeId, onChange, rootClassName = 'bookmarks__tabs', leftActions, rightActions, onTabContextMenu }: Props = $props();

  let scrollEl = $state<HTMLDivElement | undefined>();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let hasOverflow = $state(false);

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

  function scrollActiveTabIntoView() {
    const el = scrollEl;
    if (!el) return;
    const active = el.querySelector('.bookmarks__tab--active') as HTMLElement | null;
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

  function handleTabClick(tab: TabItem) {
    if (tab.id === activeId) return;
    onChange(tab.id);
  }

  $effect(() => {
    const el = scrollEl;
    if (!el) return;
    updateScrollState();
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    const onScroll = () => updateScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
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

  function handleTabContextMenu(tab: TabItem, e: MouseEvent) {
    e.preventDefault();
    onTabContextMenu?.(tab, e);
  }
</script>

<div class={rootClassName}>
  {#if leftActions}
    <div class="bookmarks__tabs-left">
      {@render leftActions()}
    </div>
  {/if}
  <div
    class="bookmarks__tabs-nav"
    class:bookmarks__tabs-nav--overflow={hasOverflow}
    class:bookmarks__tabs-nav--can-left={canScrollLeft}
    class:bookmarks__tabs-nav--can-right={canScrollRight}
  >
    <div class="bookmarks__tabs-scroll" bind:this={scrollEl}>
      {#each tabs as tab (tab.id)}
        {#if tab.dividerBefore}
          <span class="bookmarks__tabs-divider" aria-hidden="true"></span>
        {/if}
        <button
          type="button"
          class="bookmarks__tab{tab.id === activeId ? ' bookmarks__tab--active' : ''}"
          data-tab={tab.id}
          onclick={() => handleTabClick(tab)}
          oncontextmenu={(e) => handleTabContextMenu(tab, e)}
        >
          {tab.label}
          {#if tab.badge != null}
            <span class="profile-more__friends-count">{tab.badge}</span>
          {/if}
        </button>
      {/each}
    </div>

    <div
      class="bookmarks__tabs-fade bookmarks__tabs-fade--left"
      class:bookmarks__tabs-fade--visible={canScrollLeft}
      aria-hidden={!canScrollLeft}
    >
      <button
        type="button"
        class="bookmarks__tabs-arrow bookmarks__tabs-arrow--left"
        aria-label="Прокрутить назад"
        tabindex={canScrollLeft ? 0 : -1}
        onclick={() => scrollByDir(-1)}
      >
        {@html iconChevronLeft(18)}
      </button>
    </div>

    <div
      class="bookmarks__tabs-fade bookmarks__tabs-fade--right"
      class:bookmarks__tabs-fade--visible={canScrollRight}
      aria-hidden={!canScrollRight}
    >
      <button
        type="button"
        class="bookmarks__tabs-arrow bookmarks__tabs-arrow--right"
        aria-label="Прокрутить вперёд"
        tabindex={canScrollRight ? 0 : -1}
        onclick={() => scrollByDir(1)}
      >
        {@html iconChevronRight(18)}
      </button>
    </div>
  </div>
  {#if rightActions}
    <div class="bookmarks__tabs-actions">
      {@render rightActions()}
    </div>
  {/if}
</div>
