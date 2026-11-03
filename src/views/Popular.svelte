<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import UiV2Tabs from '../components/uikit-v2/UiV2Tabs.svelte';
  import UiV2Select from '../components/uikit-v2/UiV2Select.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2AnimeCardSkeleton from '../components/uikit-v2/UiV2AnimeCardSkeleton.svelte';
  import ReleaseCardUiV2 from '../components/ReleaseCardUiV2.svelte';
  import DiscoverHero from '../components/DiscoverHero.svelte';
  import { iconFlame, iconRotateCcw } from '../components/icons';
  import { browseCatalog } from '../services/catalog-search';
  import { toCdnProxyUrl, toPosterDisplayUrl } from '../utils/posterUrl';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import { mapCardData } from './Release/_utils';
  import type { ReleaseCardData } from '../types/release';
  import { toIpcArgs } from '../utils/ipc-args';
  import { DEFAULT_POPULAR_TAB } from '../data/popularTabs';
  import {
    DEFAULT_POPULAR_FILTERS,
    POPULAR_GENRE_OPTIONS,
    POPULAR_SEASON_OPTIONS,
    POPULAR_SOURCE_TABS,
    POPULAR_VIEW_TABS,
    describePopularFilters,
    effectivePopularFilters,
    isDefaultPopularFilters,
    loadPopularFilters,
    popularBrowseParams,
    popularFilterArgs,
    popularSortOptions,
    popularFiltersKey,
    popularYearOptions,
    savePopularFilters,
    withSource,
    type PopularFilters,
    type PopularSource,
    type PopularViewTab,
  } from '../data/popularFilters';
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
    activeTab: PopularViewTab;
    items: ReleaseCardData[];
    page: number;
    hasMore: boolean;
    loadState: 'loading' | 'error' | 'empty' | 'ready';
    errorMsg: string;
  }

  const POPULAR_VIEW_KEY = (tab: PopularViewTab = activeTab, f: PopularFilters = effectivePopularFilters(filters)) =>
    buildViewStateKey('/overview/popular', { ptab: tab, pf: popularFiltersKey(f) });

  function findBestPopularCache(): ViewStateEntry<PopularViewState> | null {
    let best: ViewStateEntry<PopularViewState> | null = null;
    for (const tab of POPULAR_VIEW_TABS) {
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

  let activeTab = $state<PopularViewTab>(DEFAULT_POPULAR_TAB);
  let filters = $state<PopularFilters>(loadPopularFilters());
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

  const tabs = POPULAR_VIEW_TABS.map((t) => ({ id: t.id, label: t.label }));
  const yearOptions = popularYearOptions();
  /** Фильтры, с которыми идёт запрос (у Anixart — всегда по умолчанию). */
  const applied = $derived(effectivePopularFilters(filters));
  const filtersSummary = $derived(describePopularFilters(applied));
  const filtersDirty = $derived(!isDefaultPopularFilters(applied));
  const sortOptions = popularSortOptions('anixapp');
  const sourceTabs = POPULAR_SOURCE_TABS.map((t) => ({ id: t.id, label: t.label }));
  /** Страница каталога AnixApp: меньше 25 в ответе — дальше нет. */
  const BROWSE_PAGE = 25;
  const PODIUM_SIZE = 3;

  const podium = $derived(items.slice(0, PODIUM_SIZE));
  const rest = $derived(items.slice(PODIUM_SIZE));
  const heroBackdrop = $derived(
    items[0]?.poster ? toPosterDisplayUrl(toCdnProxyUrl(items[0].poster), 'cardVertical') : null,
  );

  /** Растёт при смене вкладки или фильтров: ответ на старый запрос отбрасываем. */
  let loadGen = 0;

  async function loadPage() {
    if (!window.anixApi || isLoading || !hasMore) return;

    const gen = loadGen;
    isLoading = true;
    const nextPage = page;
    if (nextPage === 0 && loadState !== 'error') loadState = 'loading';

    try {
      let cards: ReleaseCardData[];
      if (applied.source === 'anixapp') {
        const res = await browseCatalog({
          ...popularBrowseParams(activeTab, applied),
          offset: nextPage * BROWSE_PAGE,
          limit: BROWSE_PAGE,
        });
        if (gen !== loadGen) return;
        cards = res.items;
        if (cards.length < BROWSE_PAGE) hasMore = false;
      } else {
        const data = await window.anixApi.release.filter(
          nextPage,
          toIpcArgs(popularFilterArgs(activeTab, applied)),
          true,
        ) as { content?: unknown[] };
        if (gen !== loadGen) return;
        cards = ((data?.content ?? []) as Record<string, unknown>[]).map(mapCardData);
      }
      if (!cards.length) {
        hasMore = false;
        if (nextPage === 0) loadState = 'empty';
        return;
      }
      const seen = new Set(items.map((i) => i.id));
      items = [...items, ...cards.filter((c) => !seen.has(c.id))];
      page = nextPage + 1;
      loadState = 'ready';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (gen !== loadGen) return;
      if (nextPage === 0) {
        errorMsg = headlineFromLoadError(err);
        loadState = 'error';
      }
    } finally {
      if (gen === loadGen) isLoading = false;
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
    detachScroll();
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
    loadGen += 1;
    isLoading = false;
    items = [];
    page = 0;
    hasMore = true;
    void loadPage();
  }

  /** Показать список для текущих вкладки и фильтров: из кеша или заново. */
  function showCurrent() {
    const cached = getViewState<PopularViewState>(POPULAR_VIEW_KEY(activeTab));
    if (cached?.data && cached.data.items.length > 0) {
      loadGen += 1;
      isLoading = false;
      applyPopularSnapshot(cached.data);
      void restorePopularScroll(cached.scrollTop);
      return;
    }

    resetAndLoad();
  }

  function onTabChange(id: string) {
    if (id === activeTab) return;
    saveViewStateWithScroll(POPULAR_VIEW_KEY(), popularSnapshot());
    activeTab = id as PopularViewTab;
    showCurrent();
  }

  function setFilters(next: PopularFilters) {
    if (popularFiltersKey(next) === popularFiltersKey(filters)) return;
    const sameList =
      popularFiltersKey(effectivePopularFilters(next)) === popularFiltersKey(effectivePopularFilters(filters));
    saveViewStateWithScroll(POPULAR_VIEW_KEY(), popularSnapshot());
    filters = next;
    savePopularFilters(next);
    if (!sameList) showCurrent();
  }

  function patchFilters(patch: Partial<PopularFilters>) {
    setFilters({ ...filters, ...patch });
  }

  function onSourceChange(id: string) {
    setFilters(withSource(filters, id as PopularSource));
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
    saveViewStateData(POPULAR_VIEW_KEY(), popularSnapshot());
    detachScroll();
  });
</script>

{#snippet filtersRow()}
      <div class="popular-filters">
        <UiV2Select
          class="popular-chip"
          panelClass="popular-chip__panel"
          ariaLabel="Сортировка"
          options={sortOptions}
          value={filters.sort}
          onChange={(v) => patchFilters({ sort: v as PopularFilters['sort'] })}
        />
        <span class="popular-filters__sep" aria-hidden="true"></span>
        <UiV2Select
          class="popular-chip {filters.year !== 'any' ? 'popular-chip--on' : ''}"
          panelClass="popular-chip__panel"
          ariaLabel="Год"
          options={yearOptions}
          value={filters.year}
          onChange={(v) => patchFilters({ year: v })}
        />
        <UiV2Select
          class="popular-chip {filters.season !== 'any' ? 'popular-chip--on' : ''}"
          panelClass="popular-chip__panel"
          ariaLabel="Сезон"
          options={POPULAR_SEASON_OPTIONS}
          value={filters.season}
          onChange={(v) => patchFilters({ season: v })}
        />
        <UiV2Select
          class="popular-chip {filters.genre !== 'any' ? 'popular-chip--on' : ''}"
          panelClass="popular-chip__panel"
          ariaLabel="Жанр"
          options={POPULAR_GENRE_OPTIONS}
          value={filters.genre}
          onChange={(v) => patchFilters({ genre: v })}
        />

        <div class="popular-filters__end">
          {#if filtersDirty}
            <UiV2Button
              label="Сбросить"
              size="sm"
              variant="ghost"
              onclick={() => setFilters({ ...DEFAULT_POPULAR_FILTERS, source: filters.source })}
            >
              {#snippet icon()}{@html iconRotateCcw(14)}{/snippet}
            </UiV2Button>
          {/if}
        </div>
      </div>
{/snippet}

<div class="view view-popular discover-page" bind:this={wrapEl}>
  <DiscoverHero
    title="Популярное"
    subtitle={filtersSummary || 'Топ релизов по категориям'}
    backdrop={heroBackdrop}
    below={filters.source === 'anixapp' ? filtersRow : undefined}
  >
    {#snippet actions()}
      <div class="popular-source">
        <span class="popular-source__label">Статистика</span>
        <UiV2Tabs
          tabs={sourceTabs}
          activeId={filters.source}
          onChange={onSourceChange}
          class="uiv2-tabs--static popular-tabs popular-source__tabs"
        />
      </div>
    {/snippet}

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
      {#if filtersDirty}
        <UiV2Button label="Сбросить фильтры" size="sm" onclick={() => setFilters({ ...DEFAULT_POPULAR_FILTERS, source: filters.source })} />
      {/if}
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
