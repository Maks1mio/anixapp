<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import UiV2Tabs from '../components/uikit-v2/UiV2Tabs.svelte';
  import UiV2AnimeCardSkeleton from '../components/uikit-v2/UiV2AnimeCardSkeleton.svelte';
  import ReleaseCardUiV2 from '../components/ReleaseCardUiV2.svelte';
  import DiscoverHero from '../components/DiscoverHero.svelte';
  import { iconFlame } from '../components/icons';
  import { toCdnProxyUrl, toPosterDisplayUrl } from '../utils/posterUrl';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import { mapCardData } from './Release/_utils';
  import type { ReleaseCardData } from '../types/release';
  import { toIpcArgs } from '../utils/ipc-args';
  import {
    DEFAULT_POPULAR_TAB,
    getPopularTabFilterArgs,
    POPULAR_TAB_DEFS,
    type PopularTabId,
  } from '../data/popularTabs';
  import {
    buildViewStateKey,
    getViewState,
    saveViewStateWithScroll,
    restoreScrollTop,
    registerActiveScrollKey,
    flushActiveViewState,
    saveViewStateData,
    beginScrollRestore,
    type ViewStateEntry,
  } from '../stores/view-state';

  interface PopularViewState {
    activeTab: PopularTabId;
    items: ReleaseCardData[];
    page: number;
    hasMore: boolean;
    loadState: 'loading' | 'error' | 'empty' | 'ready';
    errorMsg: string;
  }

  const POPULAR_VIEW_KEY = (tab: PopularTabId = activeTab) => buildViewStateKey('/overview/popular', { ptab: tab });

  function findBestPopularCache(): ViewStateEntry<PopularViewState> | null {
    let best: ViewStateEntry<PopularViewState> | null = null;
    for (const tab of POPULAR_TAB_DEFS) {
      const entry = getViewState<PopularViewState>(POPULAR_VIEW_KEY(tab.id));
      if (!entry?.data || entry.data.items.length === 0) continue;
      if (!best || entry.savedAt >= best.savedAt) best = entry;
    }
    return best;
  }

  function popularSnapshot(): PopularViewState {
    return { activeTab, items, page, hasMore, loadState, errorMsg };
  }

  function applyPopularSnapshot(s: PopularViewState) {
    items = s.items;
    page = s.page;
    hasMore = s.hasMore;
    loadState = s.loadState;
    errorMsg = s.errorMsg;
  }

  async function restorePopularScroll(scrollTop: number) {
    if (scrollTop > 0) beginScrollRestore();
    requestAnimationFrame(() => {
      attachScroll();
      void restoreScrollTop(scrollTop, { maxWaitMs: 8000 });
    });
  }

  function onBeforeNavigate() {
    if (items.length > 0) flushActiveViewState(popularSnapshot());
  }

  let activeTab = $state<PopularTabId>(DEFAULT_POPULAR_TAB);
  let items = $state<ReleaseCardData[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');

  let wrapEl: HTMLElement | undefined = $state();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let unregisterScrollKey: (() => void) | null = null;

  const tabs = POPULAR_TAB_DEFS.map((t) => ({ id: t.id, label: t.label }));
  const PODIUM_SIZE = 3;

  const podium = $derived(items.slice(0, PODIUM_SIZE));
  const rest = $derived(items.slice(PODIUM_SIZE));
  const heroBackdrop = $derived(
    items[0]?.poster ? toPosterDisplayUrl(toCdnProxyUrl(items[0].poster), 'cardVertical') : null,
  );

  async function loadPage() {
    if (!window.anixApi || isLoading || !hasMore) return;

    isLoading = true;
    const nextPage = page;
    if (nextPage === 0 && loadState !== 'error') loadState = 'loading';

    try {
      const data = await window.anixApi.release.filter(
        nextPage,
        toIpcArgs(getPopularTabFilterArgs(activeTab)),
        true,
      ) as { content?: unknown[] };
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (!content.length) {
        hasMore = false;
        if (nextPage === 0) loadState = 'empty';
        return;
      }
      items = [...items, ...content.map(mapCardData)];
      page = nextPage + 1;
      loadState = 'ready';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (nextPage === 0) {
        errorMsg = headlineFromLoadError(err);
        loadState = 'error';
      }
    } finally {
      isLoading = false;
    }
  }

  function checkIfNeedsMore() {
    if (!scrollEl || !hasMore || isLoading) return;
    const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distance < 300) void loadPage();
  }

  function attachScroll() {
    const el = wrapEl?.closest('.page__scroll') as HTMLElement | null
      ?? document.getElementById('content');
    if (!el) return;
    scrollEl = el;
    scrollListener = () => checkIfNeedsMore();
    el.addEventListener('scroll', scrollListener);
  }

  function detachScroll() {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
    scrollEl = null;
    scrollListener = null;
  }

  function resetAndLoad() {
    items = [];
    page = 0;
    hasMore = true;
    void loadPage();
  }

  function onTabChange(id: string) {
    if (id === activeTab) return;
    saveViewStateWithScroll(POPULAR_VIEW_KEY(activeTab), popularSnapshot());
    activeTab = id as PopularTabId;

    const cached = getViewState<PopularViewState>(POPULAR_VIEW_KEY(activeTab));
    if (cached?.data && cached.data.items.length > 0) {
      applyPopularSnapshot(cached.data);
      void restorePopularScroll(cached.scrollTop);
      return;
    }

    resetAndLoad();
  }

  onMount(() => {
    unregisterScrollKey = registerActiveScrollKey(() => POPULAR_VIEW_KEY());
    window.addEventListener('anix:beforeNavigate', onBeforeNavigate);

    const cached = findBestPopularCache();
    if (cached?.data && cached.data.items.length > 0) {
      activeTab = cached.data.activeTab;
      applyPopularSnapshot(cached.data);
      void restorePopularScroll(cached.scrollTop);
      return;
    }

    requestAnimationFrame(attachScroll);
    void loadPage();
  });

  onDestroy(() => {
    window.removeEventListener('anix:beforeNavigate', onBeforeNavigate);
    unregisterScrollKey?.();
    unregisterScrollKey = null;
    saveViewStateData(POPULAR_VIEW_KEY(activeTab), popularSnapshot());
    detachScroll();
  });
</script>

<div class="view view-popular discover-page" bind:this={wrapEl}>
  <DiscoverHero title="Популярное" subtitle="Топ релизов по категориям" backdrop={heroBackdrop}>
    <UiV2Tabs {tabs} activeId={activeTab} onChange={onTabChange} class="uiv2-tabs--static popular-tabs" />
  </DiscoverHero>

  {#if loadState === 'loading' && items.length === 0}
    <div class="popular-podium popular-podium--skeleton" aria-busy="true">
      {#each [2, 1, 3] as place (place)}
        <div class="popular-podium__place popular-podium__place--{place}">
          <UiV2AnimeCardSkeleton variant="vertical" />
          <div class="popular-podium__step"></div>
        </div>
      {/each}
    </div>
  {:else if loadState === 'error'}
    <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadPage()} />
  {:else if loadState === 'empty'}
    <div class="discover-empty">
      <span class="discover-empty__icon" aria-hidden="true">{@html iconFlame(26)}</span>
      <p class="discover-empty__title">Ничего не найдено</p>
    </div>
  {:else}
    <ol class="popular-podium">
      {#each podium as item, index (item.id)}
        <li class="popular-podium__place popular-podium__place--{index + 1}">
          <ReleaseCardUiV2 data={item} variant="vertical" />
          <div class="popular-podium__step">
            <span class="popular-podium__rank">{index + 1}</span>
          </div>
        </li>
      {/each}
    </ol>

    {#if rest.length}
      <ol class="popular-list" start={PODIUM_SIZE + 1}>
        {#each rest as item, index (item.id)}
          <li class="popular-row">
            <span class="popular-row__rank">{index + PODIUM_SIZE + 1}</span>
            <div class="popular-row__card">
              <ReleaseCardUiV2 data={item} variant="horizontal" compact />
            </div>
          </li>
        {/each}
      </ol>
    {/if}
    {#if isLoading}
      <div class="popular-list" aria-busy="true">
        {#each [0, 1] as i (i)}
          <div class="popular-row popular-row--skeleton">
            <UiV2AnimeCardSkeleton variant="horizontal" />
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
