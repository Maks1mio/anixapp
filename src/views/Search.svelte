<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import CollectionCard, { type CollectionCardData } from '../components/CollectionCard.svelte';
  import UiV2SearchFranchise, { type UiV2SearchFranchiseData } from '../components/uikit-v2/UiV2SearchFranchise.svelte';
  import UiV2FeedPersonTile from '../components/uikit-v2/UiV2FeedPersonTile.svelte';
  import UiV2AnimeCardSkeleton from '../components/uikit-v2/UiV2AnimeCardSkeleton.svelte';
  import UiV2CollectionCardSkeleton from '../components/uikit-v2/UiV2CollectionCardSkeleton.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import UiV2Tabs from '../components/uikit-v2/UiV2Tabs.svelte';
  import { replacePath } from '../stores/navigation';
  import { iconX } from '../components/icons';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { resolveBadgeName, resolveProfileBadgeUrl } from '../utils/badge';
  import { addSearchHistory } from '../utils/search-history';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import { mapCollectionCard } from '../utils/collection';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import {
    SEARCH_TABS,
    RELEASE_SEARCH_BY_OPTIONS,
    buildSearchRoute,
    type SearchTab,
  } from '../search-controller';
  import type { ReleaseCardData } from '../types/release';
  import {
    buildViewStateKey,
    getViewState,
    saveViewStateData,
    restoreScrollTop,
    registerActiveScrollKey,
    flushActiveViewState,
    beginScrollRestore,
  } from '../stores/view-state';

  type ProfileHit = {
    id: number;
    login: string;
    avatar: string | null;
    isOnline: boolean;
    badgeUrl: string | null;
    badgeName: string | null;
  };

  type LoadState = 'loading' | 'error' | 'empty' | 'ready';

  interface SearchViewState {
    page: number;
    hasMore: boolean;
    loadState: LoadState;
    releases: ReleaseCardData[];
    collections: CollectionCardData[];
    profiles: ProfileHit[];
    franchise: UiV2SearchFranchiseData | null;
  }

  interface Props {
    q?: string;
    tab?: SearchTab;
    searchBy?: number;
  }

  let { q = '', tab = 'releases', searchBy = 0 }: Props = $props();

  const query = $derived(q.trim());
  // Вкладка меняется без перемонтирования страницы — иначе у вкладок не играет анимация
  // svelte-ignore state_referenced_locally
  let activeTab = $state<SearchTab>(tab);
  const viewKey = () => buildViewStateKey('/search', { q: query, tab: activeTab, by: searchBy });
  /** Уже загруженные вкладки этого запроса. */
  const tabCache = new Map<SearchTab, SearchViewState>();

  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');
  let releases = $state<ReleaseCardData[]>([]);
  let collections = $state<CollectionCardData[]>([]);
  let profiles = $state<ProfileHit[]>([]);
  let franchise = $state<UiV2SearchFranchiseData | null>(null);

  let wrapEl = $state<HTMLElement | undefined>();
  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let unregisterScrollKey: (() => void) | null = null;
  let requestSeq = 0;

  const byLabel = $derived(
    RELEASE_SEARCH_BY_OPTIONS.find((o) => Number(o.value) === searchBy)?.label ?? '',
  );
  const itemCount = $derived(
    activeTab === 'releases' ? releases.length : activeTab === 'collections' ? collections.length : profiles.length,
  );

  function extractContent(data: unknown): unknown[] {
    const rec = data as { content?: unknown } | null;
    let source: unknown = rec?.content ?? data;
    if (source && !Array.isArray(source) && typeof source === 'object') {
      const obj = source as Record<string, unknown>;
      if (Array.isArray(obj.releases)) source = obj.releases;
      else if (Array.isArray(obj.collections)) source = obj.collections;
    }
    return Array.isArray(source) ? source : [];
  }

  function mapProfile(raw: Record<string, unknown>, root: unknown): ProfileHit | null {
    const id = Number(raw.id ?? 0);
    if (!(id > 0)) return null;
    return {
      id,
      login: typeof raw.login === 'string' && raw.login.trim() ? raw.login.trim() : `id${id}`,
      avatar: typeof raw.avatar === 'string' ? raw.avatar : null,
      isOnline: !!raw.is_online,
      badgeUrl: resolveProfileBadgeUrl(raw, root) ?? null,
      badgeName: resolveBadgeName(raw.badge) ?? null,
    };
  }

  function mapFranchise(data: unknown, content: unknown[]): UiV2SearchFranchiseData | null {
    const related = (data as { related?: Record<string, unknown> } | null)?.related;
    if (!related) return null;
    const first = content[0] as { id?: unknown } | undefined;
    const value: UiV2SearchFranchiseData = {
      images: Array.isArray(related.images) ? related.images.map(String) : [],
      name: String(related.name_ru ?? related.name ?? ''),
      releaseCount: typeof related.release_count === 'number' ? related.release_count : undefined,
      relatedId: typeof related.id === 'number' ? related.id : undefined,
      firstReleaseId: typeof first?.id === 'number' ? first.id : undefined,
    };
    return value.images.length || value.name ? value : null;
  }

  async function fetchPage(p: number): Promise<{ data: unknown; content: unknown[] }> {
    const api = window.anixApi?.search;
    if (!api) throw new Error('API поиска недоступно');
    const data = activeTab === 'releases'
      ? await api.releases(query, p, searchBy)
      : activeTab === 'collections'
        ? await api.collections(query, p)
        : await api.profiles(query, p);
    return { data, content: extractContent(data) };
  }

  async function loadPage() {
    if (!query || isLoading || !hasMore) return;
    const seq = ++requestSeq;
    const first = page === 0;
    isLoading = true;
    if (first) loadState = 'loading';
    try {
      const { data, content } = await fetchPage(page);
      if (seq !== requestSeq) return;

      if (activeTab === 'releases') {
        if (first && searchBy === 0) franchise = mapFranchise(data, content);
        const seen = new Set(releases.map((r) => r.id));
        const next = content
          .map((row) => mapReleaseRawToCard(row as Record<string, unknown>))
          .filter((r) => !seen.has(r.id));
        releases = [...releases, ...next];
      } else if (activeTab === 'collections') {
        const seen = new Set(collections.map((c) => c.id));
        const next = content
          .map((row) => mapCollectionCard(row as Record<string, unknown>))
          .filter((c) => c.id > 0 && !seen.has(c.id));
        collections = [...collections, ...next];
      } else {
        const seen = new Set(profiles.map((p) => p.id));
        const next = content
          .map((row) => mapProfile(row as Record<string, unknown>, data))
          .filter((p): p is ProfileHit => !!p && !seen.has(p.id));
        profiles = [...profiles, ...next];
      }

      if (first) addSearchHistory(query);
      page += 1;
      hasMore = content.length > 0;
      loadState = itemCount > 0 || franchise ? 'ready' : 'empty';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (seq !== requestSeq) return;
      if (first) {
        errorMsg = headlineFromLoadError(err);
        loadState = 'error';
      } else {
        hasMore = false;
      }
    } finally {
      if (seq === requestSeq) isLoading = false;
    }
  }

  function retry() {
    page = 0;
    hasMore = true;
    void loadPage();
  }

  function checkIfNeedsMore() {
    if (!scrollEl || !hasMore || isLoading || loadState !== 'ready') return;
    const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distance < 400) void loadPage();
  }

  function attachScroll() {
    if (scrollEl) return;
    const el = (wrapEl?.closest('.page__scroll') as HTMLElement | null)
      ?? document.getElementById('content');
    if (!el) return;
    scrollEl = el;
    scrollListener = () => checkIfNeedsMore();
    el.addEventListener('scroll', scrollListener, { passive: true });
  }

  function detachScroll() {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
    scrollEl = null;
    scrollListener = null;
  }

  function snapshot(): SearchViewState {
    return { page, hasMore, loadState, releases, collections, profiles, franchise };
  }

  function onBeforeNavigate() {
    if (loadState === 'ready') flushActiveViewState(snapshot());
  }

  function applySnapshot(snap: SearchViewState) {
    page = snap.page;
    hasMore = snap.hasMore;
    loadState = snap.loadState;
    releases = snap.releases;
    collections = snap.collections;
    profiles = snap.profiles;
    franchise = snap.franchise;
  }

  function showTab(next: SearchTab) {
    if (next === activeTab) return;
    if (loadState === 'ready') tabCache.set(activeTab, snapshot());
    requestSeq += 1;
    isLoading = false;
    errorMsg = '';
    activeTab = next;
    const cached = tabCache.get(next) ?? getViewState<SearchViewState>(viewKey())?.data;
    if (cached && cached.loadState === 'ready') {
      applySnapshot(cached);
      return;
    }
    applySnapshot({
      page: 0,
      hasMore: true,
      loadState: 'loading',
      releases: [],
      collections: [],
      profiles: [],
      franchise: null,
    });
    if (query) void loadPage();
  }

  function switchTab(id: string) {
    if (id === activeTab) return;
    // Сначала URL (beforeNavigate сохранит текущую вкладку под её ключом), потом смена вкладки
    replacePath(buildSearchRoute(query, id as SearchTab, id === 'releases' ? searchBy : 0));
    showTab(id as SearchTab);
  }

  // Назад/вперёд или внешний переход на другую вкладку того же запроса
  $effect(() => {
    const next = tab;
    untrack(() => showTab(next));
  });

  function switchSearchBy(value: string) {
    const by = Number(value) || 0;
    if (by === searchBy) return;
    replacePath(buildSearchRoute(query, 'releases', by));
  }

  onMount(() => {
    unregisterScrollKey = registerActiveScrollKey(viewKey);
    window.addEventListener('anix:beforeNavigate', onBeforeNavigate);

    const cached = getViewState<SearchViewState>(viewKey());
    if (cached?.data && cached.data.loadState === 'ready') {
      applySnapshot(cached.data);
      if (cached.scrollTop > 0) beginScrollRestore();
      requestAnimationFrame(() => {
        attachScroll();
        void restoreScrollTop(cached.scrollTop, { maxWaitMs: 5000 });
      });
      return;
    }

    requestAnimationFrame(attachScroll);
    if (query) void loadPage();
    else loadState = 'empty';
  });

  onDestroy(() => {
    window.removeEventListener('anix:beforeNavigate', onBeforeNavigate);
    unregisterScrollKey?.();
    if (loadState === 'ready') saveViewStateData(viewKey(), snapshot());
    detachScroll();
    requestSeq += 1;
  });
</script>

{#snippet byFilter()}
  <button
    type="button"
    class="search-v2__filter"
    aria-label="Сбросить поиск по полю"
    onclick={() => switchSearchBy('0')}
  >
    по полю «{byLabel.toLowerCase()}»
    <span aria-hidden="true">{@html iconX(12)}</span>
  </button>
{/snippet}

<div class="view view-search-v2 discover-page" bind:this={wrapEl}>
  <header class="search-v2__head">
    <span class="search-v2__eyebrow">{query ? 'Поиск' : 'Поиск по Anixart'}</span>
    <h1 class="search-v2__title">{query || 'Что ищем?'}</h1>
    {#if !query}
      <p class="search-v2__hint">Введите запрос в строке поиска сверху</p>
    {/if}
  </header>

  {#if query}
    <!-- Пустой слот справа съедал бы ширину капсулы — передаём его только с фильтром -->
    <UiV2Tabs
      class="search-v2__tabs"
      tabs={SEARCH_TABS}
      activeId={activeTab}
      onChange={switchTab}
      rightActions={activeTab === 'releases' && searchBy > 0 ? byFilter : undefined}
    />

    {#if loadState === 'loading'}
      {#if activeTab === 'collections'}
        <div class="collections-feed" aria-busy="true">
          <UiV2CollectionCardSkeleton count={6} />
        </div>
      {:else if activeTab === 'profiles'}
        <div class="search-v2__people" aria-busy="true">
          {#each Array.from({ length: 12 }) as _, i (i)}
            <div class="search-v2__person-skeleton"></div>
          {/each}
        </div>
      {:else}
        <div class="search-v2__skeleton-grid" aria-busy="true">
          {#each Array.from({ length: 8 }) as _, i (i)}
            <UiV2AnimeCardSkeleton />
          {/each}
        </div>
      {/if}
    {:else if loadState === 'error'}
      <UiV2ContentRetryOverlay message={errorMsg} onRetry={retry} />
    {:else if loadState === 'empty'}
      <div class="discover-page__empty">Ничего не найдено — попробуйте другой запрос или вкладку</div>
    {:else if activeTab === 'releases'}
      {#if franchise}
        <UiV2SearchFranchise class="search-v2__franchise" data={franchise} />
      {/if}
      {#if releases.length}
        <ReleaseCardsGrid items={releases} />
      {/if}
    {:else if activeTab === 'collections'}
      <div class="collections-feed">
        {#each collections as item (item.id)}
          <CollectionCard data={item} variant="grid" />
        {/each}
      </div>
    {:else}
      <div class="search-v2__people">
        {#each profiles as p (p.id)}
          <UiV2FeedPersonTile
            class="search-v2__person"
            title={p.login}
            avatar={p.avatar}
            showDot={p.isOnline}
            badgeUrl={p.badgeUrl}
            badgeName={p.badgeName}
            profileId={p.id}
            onclick={(e) => handleUserProfileClick(p.id, e)}
          />
        {/each}
      </div>
    {/if}

    {#if isLoading && loadState === 'ready'}
      <div class="discover-page__loading discover-page__loading--inline">Загрузка…</div>
    {/if}
  {/if}
</div>
