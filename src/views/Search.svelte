<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { navigate } from '../stores/navigation';
  import Tabs from '../components/Tabs.svelte';
  import { addSearchHistory } from '../utils/search-history';
  import { iconBookmark, iconFlag } from '../components/icons';
  import type { ReleaseCardData } from '../types/release';

  type SearchTab = 'releases' | 'profiles' | 'collections';

  interface Props {
    q?: string;
    tab?: SearchTab;
  }

  let { q = '', tab = 'releases' }: Props = $props();

  const POSTER_BASE = 'https://s.anixmirai.com/posters';

  function buildPosterUrl(value: string | undefined): string | undefined {
    if (!value || typeof value !== 'string') return undefined;
    const v = value.trim();
    if (!v) return undefined;
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    const id = v.endsWith('.jpg') || v.endsWith('.jpeg') || v.endsWith('.png') ? v : `${v}.jpg`;
    return `${POSTER_BASE}/${id}`;
  }

  function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
      ?? (typeof raw.image === 'string' ? raw.image : undefined);
    const poster = posterRaw ? buildPosterUrl(posterRaw) : undefined;
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

  const SEARCH_TABS = [
    { id: 'releases' as SearchTab,    label: 'Тайтлы' },
    { id: 'collections' as SearchTab, label: 'Коллекции' },
    { id: 'profiles' as SearchTab,    label: 'Пользователи' },
  ];

  let currentTab = $state<SearchTab>(tab);
  let currentQuery = $state(q);

  // Sync when parent navigates to a new search (different q/tab props).
  // Use untrack() to read currentQuery/currentTab without creating reactive
  // dependencies — otherwise setting them inside the effect would re-trigger it.
  $effect(() => {
    const newQ = q;
    const newTab = tab;
    const prevQ = untrack(() => currentQuery);
    const prevTab = untrack(() => currentTab);
    if (newQ !== prevQ || newTab !== prevTab) {
      currentQuery = newQ;
      currentTab = newTab ?? 'releases';
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
  let franchiseData = $state<FranchiseData | null>(null);

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let scrollAttached = false;
  let wrapEl: HTMLElement | undefined = $state();

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
        promise = window.anixApi.search.releases(q, pageToLoad);
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
    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
    window.addEventListener('anix:searchRequest', onSearchRequest);
    if (currentQuery) performSearch(false);
  });

  onDestroy(() => {
    detachScroll();
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
    window.removeEventListener('anix:searchRequest', onSearchRequest);
  });

  const pageTitle = $derived(currentQuery ? `Поиск: ${currentQuery}` : 'Поиск');
</script>

<div class="view view-search" bind:this={wrapEl}>
  <div class="search-page">
    <div class="view-header">
      <h1 class="view-header__title">{pageTitle}</h1>
    </div>

    <Tabs
      tabs={SEARCH_TABS}
      activeId={currentTab}
      onChange={(id) => applyTabChange(id as SearchTab)}
    />

    <div class="search-page__results">
      {#if loadState === 'hint'}
        <p class="search-page__hint">Введите запрос в поле выше и нажмите Enter</p>
      {:else if loadState === 'loading'}
        <div class="search-page__loading">Поиск…</div>
      {:else if loadState === 'error'}
        <p class="search-page__error">Ошибка: {errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="search-page__empty">Ничего не найдено</p>
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
                  <div class="search-franchise__thumb" style="background-image:url('{img}')"></div>
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
                onclick={() => navigate(`/profile/${p.id}`)}
              >
                <div
                  class="search-page__profile-avatar"
                  style={p.avatar ? `background-image:url('${p.avatar}')` : ''}
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
            {#each collectionResults as c}
              <article class="collection-card">
                <span class="collection-card__page collection-card__page--back-2" aria-hidden="true"></span>
                <span class="collection-card__page collection-card__page--back-1" aria-hidden="true"></span>
                <!-- svelte-ignore a11y_invalid_attribute -->
                <a
                  href="/collection/{c.id}"
                  class="collection-card__link"
                  onclick={(e) => { e.preventDefault(); navigate(`/collection/${c.id}`); }}
                >
                  <div class="collection-card__poster">
                    {#if c.image}
                      <img src={c.image} alt="" loading="lazy" />
                    {:else}
                      <div class="collection-card__poster-placeholder"></div>
                    {/if}
                    <div class="collection-card__badges">
                      {#if typeof c.notes_count === 'number'}
                        <div class="collection-card__badge">
                          <span class="collection-card__badge-icon">💬</span>
                          <span class="collection-card__badge-text">{c.notes_count}</span>
                        </div>
                      {/if}
                      {#if typeof c.bookmarks_count === 'number'}
                        <div class="collection-card__badge">
                          <span class="collection-card__badge-icon">{@html iconBookmark(14)}</span>
                          <span class="collection-card__badge-text">{c.bookmarks_count}</span>
                        </div>
                      {/if}
                      {#if typeof c.favorites_count === 'number'}
                        <div class="collection-card__badge collection-card__badge--favorites{c.is_favorite ? ' collection-card__badge--in-bookmarks' : ''}">
                          <span class="collection-card__badge-icon">{@html iconFlag(14, !!c.is_favorite)}</span>
                          <span class="collection-card__badge-text">{c.favorites_count}</span>
                        </div>
                      {/if}
                    </div>
                  </div>
                  <div class="collection-card__footer">
                    <h3 class="collection-card__title">{c.title || c.name || 'Без названия'}</h3>
                    {#if c.description}
                      <p class="collection-card__desc">{c.description}</p>
                    {/if}
                    {#if typeof c.release_count === 'number'}
                      <span class="collection-card__meta">{c.release_count} релизов</span>
                    {/if}
                  </div>
                </a>
              </article>
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
