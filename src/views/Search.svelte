<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import CollectionCard, { type CollectionCardData } from '../components/CollectionCard.svelte';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { handleUserProfileClick } from '../stores/user-profile';
  import Tabs from '../components/Tabs.svelte';
  import ScrollArea from '../components/ScrollArea.svelte';
  import { iconSearch } from '../components/icons';
  import { addSearchHistory, clearSearchHistory, getSearchHistory } from '../utils/search-history';
  import type { ReleaseCardData } from '../types/release';
  import { buildPosterUrl, resolveCdnAssetUrl } from '../utils/posterUrl';
  import {
    buildViewStateKey,
    getViewState,
    saveViewStateWithScroll,
    restoreScrollTop,
    registerActiveScrollKey,
    flushActiveViewState,
    saveViewStateData,
    beginScrollRestore,
  } from '../stores/view-state';

  type SearchTab = 'releases' | 'profiles' | 'collections';

  interface Props {
    q?: string;
    tab?: SearchTab;
    searchBy?: number;
  }

  let { q = '', tab = 'releases', searchBy = 0 }: Props = $props();

  function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
      ?? (typeof raw.image === 'string' ? raw.image : undefined);
    const poster = posterRaw ? buildPosterUrl(posterRaw) || undefined : undefined;
    const grade = typeof raw.grade === 'number' ? raw.grade : undefined;
    const profileListStatus = typeof raw.profile_list_status === 'number' ? raw.profile_list_status : undefined;
    let listStatus: ReleaseCardData['listStatus'];
    switch (profileListStatus) {
      case 1: listStatus = 'watching'; break;
      case 2: listStatus = 'planned'; break;
      case 3: listStatus = 'completed'; break;
      case 4: listStatus = 'on_hold'; break;
      case 5: listStatus = 'dropped'; break;
      default: listStatus = undefined;
    }
    return {
      id: raw.id as number | undefined,
      titleRu: (raw.title_ru ?? raw.titleRu) as string | undefined,
      titleEn: (raw.title_original ?? raw.titleEn) as string | undefined,
      titleAlt: (raw.title_alt as string) || undefined,
      description: (raw.description as string) || undefined,
      poster: poster || undefined,
      rating: grade,
      voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : undefined,
      episodesReleased: typeof raw.episodes_released === 'number' ? raw.episodes_released : undefined,
      episodesTotal: typeof raw.episodes_total === 'number' ? raw.episodes_total : undefined,
      year: typeof raw.year === 'string' ? raw.year : (typeof raw.year === 'number' ? String(raw.year) : undefined),
      country: (raw.country as string) || undefined,
      genres: (raw.genres as string) || undefined,
      status: (raw.status as { name?: string })?.name,
      studio: (raw.studio as string) || undefined,
      category: (raw.category as { name?: string })?.name,
      releaseDate: (raw.release_date as string) || undefined,
      isFavorite: !!(raw.is_favorite),
      listStatus,
    };
  }

  function mapCollectionToCardData(raw: Record<string, unknown>): CollectionCardData {
    return {
      id: raw.id as number,
      title: (raw.title ?? raw.name ?? 'Без названия') as string,
      image: resolveCdnAssetUrl(raw.image as string) || undefined,
      description: (raw.description as string) || undefined,
      releaseCount: typeof raw.release_count === 'number' ? raw.release_count : undefined,
      notesCount: typeof raw.notes_count === 'number' ? raw.notes_count : (typeof raw.comment_count === 'number' ? raw.comment_count : undefined),
      bookmarksCount: typeof raw.bookmarks_count === 'number' ? raw.bookmarks_count : undefined,
      favoritesCount: typeof raw.favorites_count === 'number' ? raw.favorites_count : undefined,
      isFavorite: !!(raw.is_favorite),
    };
  }

  const SEARCH_TABS = [
    { id: 'releases' as SearchTab,    label: 'Тайтлы' },
    { id: 'collections' as SearchTab, label: 'Коллекции' },
    { id: 'profiles' as SearchTab,    label: 'Пользователи' },
  ];

  // svelte-ignore state_referenced_locally
  let currentTab = $state<SearchTab>(tab);
  // svelte-ignore state_referenced_locally
  let currentQuery = $state(q);
  // svelte-ignore state_referenced_locally
  let inputValue = $state(q);
  let recentSearches = $state<string[]>(getSearchHistory());
  let searchFocused = $state(false);
  let historyIndex = $state(-1);
  let searchBlurTimer: ReturnType<typeof setTimeout> | null = null;
  const matchingRecentSearches = $derived.by(() => {
    const needle = inputValue.trim().toLocaleLowerCase('ru-RU');
    return recentSearches
      .filter((item) => !needle || item.toLocaleLowerCase('ru-RU').includes(needle));
  });

  const showSearchSuggest = $derived(
    searchFocused && (
      !inputValue.trim() || matchingRecentSearches.length > 0
    ),
  );

  $effect(() => {
    inputValue;
    if (historyIndex >= matchingRecentSearches.length) {
      historyIndex = -1;
    }
  });

  // svelte-ignore state_referenced_locally
  let currentSearchBy = $state(searchBy);

  // Sync when parent navigates to a new search (different q/tab props).
  // Use untrack() to read currentQuery/currentTab without creating reactive
  // dependencies — otherwise setting them inside the effect would re-trigger it.
  $effect(() => {
    const newQ = q;
    const newTab = tab;
    const newSearchBy = searchBy;
    const prevQ = untrack(() => currentQuery);
    const prevTab = untrack(() => currentTab);
    const prevSearchBy = untrack(() => currentSearchBy);
    if (newQ !== prevQ || newTab !== prevTab || newSearchBy !== prevSearchBy) {
      currentQuery = newQ;
      inputValue = newQ;
      currentTab = newTab ?? 'releases';
      currentSearchBy = newSearchBy ?? 0;
      currentPage = 0;
      hasMore = true;
      isLoading = false;
      releaseResults = [];
      profileResults = [];
      collectionResults = [];
      franchiseData = null;
      showEnd = false;
      if (newQ) performSearch(false);
      else loadState = 'hint';
    }
  });

  let currentPage = $state(0);
  let isLoading = $state(false);
  let hasMore = $state(true);
  let loadState = $state<'hint' | 'loading' | 'error' | 'empty' | 'ready'>('hint');
  let errorMsg = $state('');

  let releaseResults = $state<ReleaseCardData[]>([]);
  let profileResults = $state<any[]>([]);
  let collectionResults = $state<any[]>([]);
  let showEnd = $state(false);

  interface FranchiseData {
    images: string[];
    name: string;
    releaseCount?: number;
    relatedId?: number;
    firstReleaseId?: number;
  }

  interface SearchViewState {
    currentTab: SearchTab;
    currentQuery: string;
    currentSearchBy: number;
    currentPage: number;
    hasMore: boolean;
    loadState: 'hint' | 'loading' | 'error' | 'empty' | 'ready';
    errorMsg: string;
    releaseResults: ReleaseCardData[];
    profileResults: any[];
    collectionResults: any[];
    showEnd: boolean;
    franchiseData: FranchiseData | null;
  }

  const SEARCH_VIEW_KEY = () => buildViewStateKey('/search');

  function hasSearchResults(state: SearchViewState): boolean {
    if (state.currentTab === 'releases') return state.releaseResults.length > 0;
    if (state.currentTab === 'profiles') return state.profileResults.length > 0;
    return state.collectionResults.length > 0;
  }

  function searchSnapshot(): SearchViewState {
    return {
      currentTab,
      currentQuery,
      currentSearchBy,
      currentPage,
      hasMore,
      loadState,
      errorMsg,
      releaseResults,
      profileResults,
      collectionResults,
      showEnd,
      franchiseData,
    };
  }

  function onBeforeNavigate() {
    if (hasSearchResults(searchSnapshot())) flushActiveViewState(searchSnapshot());
  }

  let franchiseData = $state<FranchiseData | null>(null);

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let scrollAttached = false;
  let wrapEl: HTMLElement | undefined = $state();
  let unregisterScrollKey: (() => void) | null = null;

  function getScrollEl(): HTMLElement | null {
    return wrapEl?.closest('.page__scroll') as HTMLElement | null;
  }

  function attachInfiniteScroll() {
    if (scrollAttached) return;
    const el = getScrollEl();
    if (!el) return;
    scrollAttached = true;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || isLoading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 200) performSearch(true);
    };
    el.addEventListener('scroll', scrollListener);
  }

  function detachScroll() {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
    scrollEl = null;
    scrollListener = null;
    scrollAttached = false;
  }

  async function performSearch(append: boolean) {
    if (!window.anixApi || !currentQuery.trim()) return;
    if (isLoading || !hasMore) return;
    if (!append) addSearchHistory(currentQuery.trim());
    if (!append) recentSearches = getSearchHistory();
    isLoading = true;

    if (!append) {
      loadState = 'loading';
      currentPage = 0;
      hasMore = true;
      releaseResults = [];
      profileResults = [];
      collectionResults = [];
      franchiseData = null;
      showEnd = false;
    }

    const q = currentQuery.trim();
    const pageToLoad = currentPage;

    try {
      let promise: Promise<any>;
      if (currentTab === 'releases') {
        promise = window.anixApi.search.releases(q, pageToLoad, currentSearchBy);
      } else if (currentTab === 'profiles') {
        promise = window.anixApi.search.profiles(q, pageToLoad);
      } else {
        promise = window.anixApi.search.collections(q, pageToLoad);
      }

      const data = await promise;
      let contentSource: any = data?.content ?? data;
      if (contentSource && !Array.isArray(contentSource)) {
        if (Array.isArray(contentSource.releases)) contentSource = contentSource.releases;
        else if (Array.isArray(contentSource.collections)) contentSource = contentSource.collections;
      }
      const content = (Array.isArray(contentSource) ? contentSource : []) as any[];

      if (!content.length) {
        if (!append) loadState = 'empty';
        showEnd = true;
        hasMore = false;
        isLoading = false;
        return;
      }

      if (currentTab === 'releases') {
        // Extract franchise data on first page
        if (!append && data?.related) {
          const rel = data.related;
          franchiseData = {
            images: Array.isArray(rel.images) ? rel.images : [],
            name: rel.name_ru || rel.name || '',
            releaseCount: typeof rel.release_count === 'number' ? rel.release_count : undefined,
            relatedId: typeof rel.id === 'number' ? rel.id : undefined,
            firstReleaseId: content[0] && typeof content[0].id === 'number' ? content[0].id : undefined,
          };
        }
        releaseResults = append
          ? [...releaseResults, ...content.map(mapReleaseToCardData)]
          : content.map(mapReleaseToCardData);
      } else if (currentTab === 'profiles') {
        profileResults = append ? [...profileResults, ...content] : content;
      } else {
        collectionResults = append ? [...collectionResults, ...content] : content;
      }

      loadState = 'ready';
      currentPage += 1;
      isLoading = false;
      attachInfiniteScroll();
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
      isLoading = false;
    }
  }

  function applyTabChange(newTab: SearchTab) {
    if (currentTab === newTab) return;
    currentTab = newTab;
    currentPage = 0;
    hasMore = true;
    isLoading = false;
    scrollAttached = false;
    releaseResults = [];
    profileResults = [];
    collectionResults = [];
    franchiseData = null;
    navigate(currentQuery ? `/search?q=${encodeURIComponent(currentQuery)}&tab=${newTab}` : `/search?tab=${newTab}`);
    if (currentQuery) performSearch(false);
    else loadState = 'hint';
  }

  function runSearch(rawQuery: string) {
    const query = rawQuery.trim();
    inputValue = query;
    currentQuery = query;
    currentPage = 0;
    hasMore = true;
    isLoading = false;
    scrollAttached = false;
    releaseResults = [];
    profileResults = [];
    collectionResults = [];
    franchiseData = null;
    showEnd = false;

    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (currentTab !== 'releases') params.set('tab', currentTab);
    if (currentTab === 'releases' && currentSearchBy > 0) params.set('by', String(currentSearchBy));
    const queryString = params.toString();
    navigate(queryString ? `/search?${queryString}` : '/search');

    if (query) void performSearch(false);
    else loadState = 'hint';
  }

  function submitSearch(event: SubmitEvent) {
    event.preventDefault();
    searchFocused = false;
    runSearch(inputValue);
  }

  function clearRecentSearches() {
    clearSearchHistory();
    recentSearches = [];
  }

  function handleSearchFocus() {
    if (searchBlurTimer != null) clearTimeout(searchBlurTimer);
    recentSearches = getSearchHistory();
    searchFocused = true;
    historyIndex = -1;
  }

  function handleSearchInput() {
    if (searchBlurTimer != null) clearTimeout(searchBlurTimer);
    recentSearches = getSearchHistory();
    searchFocused = true;
  }

  function handleSearchBlur() {
    searchBlurTimer = setTimeout(() => {
      const input = document.getElementById('search-page-input');
      if (input === document.activeElement) return;
      searchFocused = false;
      historyIndex = -1;
      searchBlurTimer = null;
    }, 120);
  }

  function selectRecentSearch(query: string) {
    if (searchBlurTimer != null) clearTimeout(searchBlurTimer);
    searchFocused = false;
    historyIndex = -1;
    runSearch(query);
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    const items = matchingRecentSearches;
    if (!searchFocused || items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex = (historyIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      historyIndex = (historyIndex - 1 + items.length) % items.length;
    } else if (event.key === 'Enter' && historyIndex >= 0) {
      event.preventDefault();
      selectRecentSearch(items[historyIndex]);
    } else if (event.key === 'Escape') {
      historyIndex = -1;
    }
  }

  function onLayoutChanged() {
    if (!wrapEl || !currentQuery.trim()) return;
    isLoading = false;
    hasMore = true;
    currentPage = 0;
    performSearch(false);
  }

  function onSearchRequest(e: Event) {
    const detail = (e as CustomEvent<{ q: string; tab: SearchTab }>).detail ?? {};
    const newQ = detail.q ?? '';
    const newTab: SearchTab = (detail.tab as SearchTab) ?? 'releases';
    currentQuery = newQ;
    inputValue = newQ;
    currentTab = newTab;
    currentPage = 0;
    hasMore = true;
    isLoading = false;
    scrollAttached = false;
    releaseResults = [];
    profileResults = [];
    collectionResults = [];
    franchiseData = null;
    showEnd = false;
    if (newQ) performSearch(false);
    else loadState = 'hint';
  }

  onMount(() => {
    unregisterScrollKey = registerActiveScrollKey(() => SEARCH_VIEW_KEY());
    window.addEventListener('anix:beforeNavigate', onBeforeNavigate);
    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
    window.addEventListener('anix:searchRequest', onSearchRequest);

    const cached = getViewState<SearchViewState>(SEARCH_VIEW_KEY());
    if (
      cached?.data
      && hasSearchResults(cached.data)
      && cached.data.currentQuery === currentQuery
      && cached.data.currentTab === currentTab
      && cached.data.currentSearchBy === currentSearchBy
    ) {
      const s = cached.data;
      currentTab = s.currentTab;
      currentQuery = s.currentQuery;
      currentSearchBy = s.currentSearchBy;
      currentPage = s.currentPage;
      hasMore = s.hasMore;
      loadState = s.loadState;
      errorMsg = s.errorMsg;
      releaseResults = s.releaseResults;
      profileResults = s.profileResults;
      collectionResults = s.collectionResults;
      showEnd = s.showEnd;
      franchiseData = s.franchiseData;
      if (cached.scrollTop > 0) beginScrollRestore();
      requestAnimationFrame(() => {
        attachInfiniteScroll();
        void restoreScrollTop(cached.scrollTop, { maxWaitMs: 8000 });
      });
      return;
    }

    if (currentQuery) performSearch(false);
    else {
      requestAnimationFrame(() => {
        const input = document.getElementById('search-page-input') as HTMLInputElement | null;
        input?.focus();
        if (input === document.activeElement) handleSearchFocus();
      });
    }
  });

  onDestroy(() => {
    window.removeEventListener('anix:beforeNavigate', onBeforeNavigate);
    unregisterScrollKey?.();
    unregisterScrollKey = null;
    saveViewStateData(SEARCH_VIEW_KEY(), searchSnapshot());
    detachScroll();
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
    window.removeEventListener('anix:searchRequest', onSearchRequest);
    if (searchBlurTimer != null) clearTimeout(searchBlurTimer);
  });

</script>

<div class="view view-search" bind:this={wrapEl}>
  <div class="search-page">
    <header class="search-page__header">
      <div class="search-page__heading">
        <h1 class="search-page__title">Поиск</h1>
        <p class="search-page__subtitle">Тайтлы, коллекции и пользователи — в одном месте</p>
      </div>

      <div class="search-page__form-wrap">
        <form class="search-page__form" role="search" onsubmit={submitSearch}>
          <span class="search-page__form-icon" aria-hidden="true">{@html iconSearch(20)}</span>
          <input
            id="search-page-input"
            class="search-page__input"
            type="search"
            bind:value={inputValue}
            placeholder="Введите название, имя пользователя или коллекции"
            autocomplete="off"
            spellcheck={false}
            aria-label="Поисковый запрос"
            aria-expanded={showSearchSuggest}
            aria-controls="search-page-suggest"
            onfocus={handleSearchFocus}
            onblur={handleSearchBlur}
            oninput={handleSearchInput}
            onkeydown={handleSearchKeydown}
          />
          <button
            type="submit"
            class="search-page__submit"
            disabled={!inputValue.trim()}
          >
            Найти
          </button>
        </form>

        {#if showSearchSuggest}
          <div
            id="search-page-suggest"
            class="search-page__suggest"
            role="listbox"
            aria-label="Недавние запросы"
          >
            <div class="search-page__suggest-head">
              <span class="search-page__suggest-section">Недавние запросы</span>
              {#if recentSearches.length > 0}
                <button
                  type="button"
                  class="search-page__suggest-clear"
                  onmousedown={(event) => event.preventDefault()}
                  onclick={clearRecentSearches}
                >
                  Очистить
                </button>
              {/if}
            </div>

            {#if matchingRecentSearches.length > 0}
              <ScrollArea extraClass="search-page__suggest-scroll">
                {#each matchingRecentSearches as item, index (item)}
                  <button
                    type="button"
                    class="search-page__suggest-item"
                    class:search-page__suggest-item--active={historyIndex === index}
                    role="option"
                    aria-selected={historyIndex === index}
                    onmousedown={(event) => event.preventDefault()}
                    onclick={() => selectRecentSearch(item)}
                  >
                    {item}
                  </button>
                {/each}
              </ScrollArea>
            {:else}
              <div class="search-page__suggest-empty">Нет недавних запросов</div>
            {/if}
          </div>
        {/if}
      </div>
    </header>

    <div class="search-page__tabs-wrap">
      <Tabs
        tabs={SEARCH_TABS}
        activeId={currentTab}
        onChange={(id) => applyTabChange(id as SearchTab)}
        rootClassName="bookmarks__tabs search-page__tabs-bar"
      />
    </div>

    <div class="search-page__results">
      {#if loadState === 'hint'}
        <div class="search-page__state">
          <span class="search-page__state-icon" aria-hidden="true">{@html iconSearch(24)}</span>
          <p class="search-page__state-title">Начните поиск</p>
          <p class="search-page__hint">Введите запрос в поле выше</p>
        </div>
      {:else if loadState === 'loading'}
        <div class="search-page__state">
          <span class="search-page__loader" aria-hidden="true"></span>
          <p class="search-page__state-title">Ищем «{currentQuery}»</p>
        </div>
      {:else if loadState === 'error'}
        <div class="search-page__state search-page__state--error">
          <p class="search-page__state-title">Не удалось выполнить поиск</p>
          <p class="search-page__error">{errorMsg}</p>
          <button type="button" class="search-page__retry" onclick={() => runSearch(currentQuery)}>Повторить</button>
        </div>
      {:else if loadState === 'empty'}
        <div class="search-page__state">
          <p class="search-page__state-title">Ничего не найдено</p>
          <p class="search-page__empty">Попробуйте изменить запрос или выбрать другую вкладку</p>
        </div>
      {:else}
        {#if currentTab === 'releases'}
          {#if franchiseData}
            <button
              type="button"
              class="search-franchise"
              onclick={() => {
                const targetId = franchiseData?.relatedId ?? franchiseData?.firstReleaseId;
                if (targetId) navigate(`/release/${targetId}/related`);
              }}
            >
              <div class="search-franchise__thumbs">
                {#each franchiseData.images.slice(0, 3) as img}
                  <div class="search-franchise__thumb" style="background-image:url('{resolveCdnAssetUrl(img)}')"></div>
                {/each}
              </div>
              <div class="search-franchise__content">
                <span class="search-franchise__title">{franchiseData.name || 'Франшиза'}</span>
                <span class="search-franchise__meta">
                  {#if typeof franchiseData.releaseCount === 'number' && franchiseData.releaseCount > 0}
                    {franchiseData.releaseCount} релизов во франшизе
                  {:else}
                    Релизы во франшизе
                  {/if}
                </span>
              </div>
              <span class="search-franchise__action">Перейти</span>
            </button>
          {/if}
          <div class="search-page__results--wide" data-search-rel="releases">
            <ReleaseCardsGrid items={releaseResults} />
          </div>
        {:else if currentTab === 'profiles'}
          <div class="search-page__profiles" data-search-rel="profiles">
            {#each profileResults as p}
              <button
                type="button"
                class="search-page__profile"
                onclick={(event) => handleUserProfileClick(p.id, event)}
              >
                <div
                  class="search-page__profile-avatar"
                  style={p.avatar ? `background-image:url('${resolveCdnAssetUrl(p.avatar)}')` : ''}
                ></div>
                <div class="search-page__profile-info">
                  <span class="search-page__profile-name">{p.login || ''}</span>
                  {#if p.status}
                    <span class="search-page__profile-status">{p.status}</span>
                  {/if}
                </div>
                {#if p.is_online}
                  <span class="search-page__profile-online"></span>
                {/if}
              </button>
            {/each}
          </div>
        {:else}
          <div class="search-page__collections search-page__collections-grid" data-search-rel="collections">
            {#each collectionResults as c (c.id)}
              <CollectionCard data={mapCollectionToCardData(c)} />
            {/each}
          </div>
        {/if}
      {/if}

      {#if showEnd && loadState === 'ready'}
        <div class="search-page__end">это всё :)</div>
      {:else if isLoading && loadState === 'ready'}
        <div class="search-page__loading">Загрузка…</div>
      {/if}
    </div>
  </div>
</div>
