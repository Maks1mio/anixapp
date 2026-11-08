<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick, untrack } from 'svelte';
  import { iconChevronLeft, iconChevronRight } from '../icons';
  import { prepareTabFade } from '../../actions/swipeTabs';

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

  let rootEl = $state<HTMLDivElement | undefined>();
  let stuck = $state(false);
  let scrollEl = $state<HTMLDivElement | undefined>();
  let navEl = $state<HTMLDivElement | undefined>();
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let hasOverflow = $state(false);
  let indicatorX = $state(0);
  let indicatorW = $state(0);
  let indicatorVisible = $state(false);
  let indicatorAnimated = $state(false);
  /** Фаза «растяжки» пилюли между старой и новой вкладкой. */
  let indicatorStretch = $state(false);
  let prevActiveId: string | null = null;
  let stretchTimer: ReturnType<typeof setTimeout> | null = null;

  const SCROLL_EDGE = 4;
  const STRETCH_MS = 160;
  const LIST_MOVE_MS = 260;
  const LIST_FADE_MS = 180;
  const LIST_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

  /** Смена набора вкладок (другой источник, настройка): что было в полосе до обновления DOM. */
  const tabsKey = $derived(tabs.map((tab) => tab.id).join('|'));
  let prevTabsKey: string | null = null;
  let listChange: { lefts: Map<string, number>; leaving: HTMLElement[] } | null = null;

  function tabButtons(): HTMLElement[] {
    return scrollEl ? [...scrollEl.querySelectorAll<HTMLElement>('.uiv2-tabs__tab[data-tab]')] : [];
  }

  function captureTabList() {
    const nextIds = new Set(tabs.map((tab) => tab.id));
    const lefts = new Map<string, number>();
    const leaving: HTMLElement[] = [];
    for (const button of tabButtons()) {
      const id = button.dataset.tab ?? '';
      lefts.set(id, button.offsetLeft);
      if (nextIds.has(id)) continue;
      // Настоящая кнопка исчезнет вместе с DOM: гаснет её копия на прежнем месте
      const ghost = button.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('data-tab');
      ghost.removeAttribute('role');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.tabIndex = -1;
      ghost.classList.remove('uiv2-tabs__tab--active');
      ghost.style.cssText = `position:absolute;left:${button.offsetLeft}px;top:0;pointer-events:none;`;
      leaving.push(ghost);
    }
    listChange = { lefts, leaving };
  }

  /** Оставшиеся вкладки едут на новые места, новые проявляются, ушедшие гаснут. */
  function playTabList(change: NonNullable<typeof listChange>) {
    for (const button of tabButtons()) {
      const before = change.lefts.get(button.dataset.tab ?? '');
      if (before === undefined) {
        button.animate(
          [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }],
          { duration: LIST_MOVE_MS, easing: LIST_EASING },
        );
      } else if (before !== button.offsetLeft) {
        button.animate(
          [{ transform: `translateX(${before - button.offsetLeft}px)` }, { transform: 'none' }],
          { duration: LIST_MOVE_MS, easing: LIST_EASING },
        );
      }
    }
    for (const ghost of change.leaving) {
      // Копия живёт доли секунды в конце полосы и не пересекается с узлами, которыми управляет Svelte
      // eslint-disable-next-line svelte/no-dom-manipulating
      scrollEl?.append(ghost);
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LIST_FADE_MS, easing: 'ease-out' }).onfinish = () => ghost.remove();
    }
  }

  $effect.pre(() => {
    const key = tabsKey;
    untrack(() => {
      if (prevTabsKey !== null && prevTabsKey !== key && !prefersReducedMotion()) captureTabList();
      prevTabsKey = key;
    });
  });

  $effect(() => {
    void tabsKey;
    untrack(() => {
      const change = listChange;
      listChange = null;
      if (change) playTabList(change);
    });
  });

  /** Полоса закрепилась: страница прокручена и вкладки дошли до своего места у верхнего края. */
  $effect(() => {
    const root = rootEl;
    const scroller = root?.closest<HTMLElement>('.page__scroll, [data-page-scroll]');
    if (!root || !scroller || className.includes('uiv2-tabs--static')) return;
    const update = () => {
      const stickyTop = Number.parseFloat(getComputedStyle(root).top) || 0;
      const edge = scroller.getBoundingClientRect().top + stickyTop;
      stuck = scroller.scrollTop > 0 && root.getBoundingClientRect().top <= edge + 1;
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  });

  function activeTabEl(): HTMLElement | null {
    const el = scrollEl;
    if (!el) return null;
    return el.querySelector(`[data-tab="${activeId}"]`) as HTMLElement | null;
  }

  function prefersReducedMotion(): boolean {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  /** Пилюля живёт внутри скролла — координаты от начала ленты, скролл её не двигает. */
  function updateIndicator(stretch = false) {
    const tab = activeTabEl();
    if (!tab) {
      indicatorVisible = false;
      return;
    }
    const x = tab.offsetLeft;
    const w = tab.offsetWidth;
    if (stretchTimer) {
      clearTimeout(stretchTimer);
      stretchTimer = null;
    }
    if (stretch && indicatorVisible && indicatorAnimated && !prefersReducedMotion()) {
      // Сначала тянемся от старой вкладки до новой, затем сжимаемся на новой
      const left = Math.min(indicatorX, x);
      const right = Math.max(indicatorX + indicatorW, x + w);
      indicatorStretch = true;
      indicatorX = left;
      indicatorW = right - left;
      stretchTimer = setTimeout(() => {
        stretchTimer = null;
        indicatorStretch = false;
        const cur = activeTabEl();
        indicatorX = cur?.offsetLeft ?? x;
        indicatorW = cur?.offsetWidth ?? w;
      }, STRETCH_MS);
      return;
    }
    indicatorStretch = false;
    indicatorX = x;
    indicatorW = w;
    indicatorVisible = w > 0;
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
    const from = tabs.findIndex((item) => item.id === activeId);
    prepareTabFade(tabs.indexOf(tab) >= from ? 1 : -1);
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
    // без подписки на activeId — смену вкладки анимирует эффект ниже
    untrack(() => updateIndicator());
    const ro = new ResizeObserver(() => {
      updateScrollState();
      if (!stretchTimer) updateIndicator();
    });
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
      if (stretchTimer) clearTimeout(stretchTimer);
    };
  });

  $effect(() => {
    const id = activeId;
    tabs.length;
    const el = scrollEl;
    if (!el) return;
    const changed = prevActiveId !== null && prevActiveId !== id;
    prevActiveId = id;
    void tick().then(() => {
      updateScrollState();
      updateIndicator(changed);
      scrollActiveTabIntoView();
    });
  });
</script>

<div class="uiv2-tabs {className}" class:uiv2-tabs--stuck={stuck} bind:this={rootEl}>
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
        <span
          class="uiv2-tabs__indicator"
          class:uiv2-tabs__indicator--visible={indicatorVisible}
          class:uiv2-tabs__indicator--animated={indicatorAnimated}
          class:uiv2-tabs__indicator--stretch={indicatorStretch}
          style={`transform: translateX(${indicatorX}px); width: ${indicatorW}px;`}
          aria-hidden="true"
        ></span>
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

</div>
