<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import CollectionCard from '../components/CollectionCard.svelte';
  import BookmarksToolbar from '../components/BookmarksToolbar.svelte';
  import { onMount, onDestroy } from 'svelte';
  import Tabs from '../components/Tabs.svelte';
  import { navigate } from '../stores/navigation';
  import { buildPosterUrl, resolveCdnAssetUrl } from '../utils/posterUrl';
  import { DEFAULT_BOOKMARK_SORT } from '../constants/bookmarkSort';
  import type { ReleaseCardData } from '../types/release';
  import { extractHistoryEpisodeInfo } from '../utils/historyFormat';

  import type { CollectionCardData } from '../components/CollectionCard.svelte';

  type TabId = 'collections' | 'history' | 'favorites' | 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped';

  const TABS: { id: TabId; label: string; type: number | null }[] = [
    { id: 'collections', label: 'Коллекции',   type: null },
    { id: 'history',     label: 'История',     type: null },
    { id: 'favorites',   label: 'Избранное',   type: null },
    { id: 'watching',    label: 'Смотрю',     type: 1 },
    { id: 'planned',     label: 'В планах',   type: 2 },
    { id: 'completed',   label: 'Просмотрено', type: 3 },
    { id: 'on_hold',     label: 'Отложено',   type: 4 },
    { id: 'dropped',     label: 'Брошено',    type: 5 },
  ];

  function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw =
      p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
      ?? (typeof raw.image === 'string' ? raw.image : undefined);
    const posterStr = typeof posterRaw === 'string' ? posterRaw : undefined;
    const poster = posterStr ? buildPosterUrl(posterStr) || undefined : undefined;
    const grade = typeof raw.grade === 'number' ? raw.grade : (typeof raw.rating === 'number' ? raw.rating : undefined);
    const statusObj = raw.status as { name?: string } | undefined;
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
      status: statusObj?.name,
      studio: (raw.studio as string) || undefined,
      category: (raw.category as { name?: string })?.name,
      releaseDate: (raw.release_date as string) || undefined,
      isFavorite: !!(raw.is_favorite),
      listStatus,
    };
  }

  function mapHistoryToReleaseCard(raw: Record<string, unknown>): ReleaseCardData {
    const lastEp = raw.last_view_episode as Record<string, unknown> | undefined;
    const { episodeLabel, dubberLabel } = extractHistoryEpisodeInfo(lastEp);
    const viewedAt = typeof raw.last_view_timestamp === 'number' ? raw.last_view_timestamp : undefined;
    return {
      ...mapReleaseToCardData(raw),
      historyView: {
        episodeLabel,
        dubberLabel,
        viewedAt,
      },
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

  function extractTotalCount(data: Record<string, unknown> | null | undefined, fallback: number): number {
    if (typeof data?.total_count === 'number') return data.total_count;
    return fallback;
  }

  let activeTab = $state<TabId>('collections');
  let items = $state<ReleaseCardData[]>([]);
  let collectionItems = $state<CollectionCardData[]>([]);
  let nextPage = $state(0);
  let hasMore = $state(true);
  let isLoadingMore = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let showEnd = $state(false);
  let errorMsg = $state('');
  let cachedProfileId = $state<number | null>(null);
  let totalCount = $state(0);
  let selectedSort = $state(DEFAULT_BOOKMARK_SORT);
  let randomLoading = $state(false);
  let wrapEl: HTMLElement | undefined = $state();

  const isCollectionsTab = $derived(activeTab === 'collections');
  const isHistoryTab = $derived(activeTab === 'history');
  const isReleaseListTab = $derived(!isCollectionsTab && !isHistoryTab);

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  function getScrollEl(): HTMLElement | null {
    return (wrapEl?.closest('.page__scroll') ?? document.getElementById('content')) as HTMLElement | null;
  }

  function tryLoadMoreIfNeeded() {
    const el = getScrollEl();
    if (!el || !hasMore || isLoadingMore) return;
    requestAnimationFrame(() => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 300 || el.scrollHeight <= el.clientHeight + 150) loadMore();
    });
  }

  function attachScroll() {
    const el = getScrollEl();
    if (!el) return;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || isLoadingMore) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 300) loadMore();
    };
    el.addEventListener('scroll', scrollListener);
  }

  function detachScroll() {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
    scrollEl = null;
    scrollListener = null;
  }

  async function ensureProfileId(): Promise<number | null> {
    if (typeof cachedProfileId === 'number') return cachedProfileId;
    if (!window.anixApi) return null;
    const selfRes = await window.anixApi.profile.self() as Record<string, unknown>;
    const profile = (selfRes?.profile ?? selfRes) as Record<string, unknown>;
    const profileId = profile?.id ?? profile?.['@id'];
    if (typeof profileId === 'number') cachedProfileId = profileId;
    return typeof profileId === 'number' ? profileId : null;
  }

  async function fetchPage(page: number): Promise<{ content: Record<string, unknown>[]; total: number }> {
    if (!window.anixApi) return { content: [], total: 0 };

    if (activeTab === 'collections') {
      const data = await window.anixApi.collection.favorites(page) as Record<string, unknown>;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      return { content, total: extractTotalCount(data, content.length) };
    }

    if (activeTab === 'history') {
      const data = await window.anixApi.history.all(page) as Record<string, unknown>;
      const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
      return { content, total: extractTotalCount(data, content.length) };
    }

    if (activeTab === 'favorites') {
      const data = await window.anixApi.favorites.all(page, selectedSort, 0, 0) as Record<string, unknown>;
      const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
      return { content, total: extractTotalCount(data, content.length) };
    }

    const tab = TABS.find((t) => t.id === activeTab)!;
    const profileId = await ensureProfileId();
    if (typeof profileId !== 'number') return { content: [], total: 0 };
    const data = await window.anixApi.profile.getBookmarks(profileId, tab.type!, page, selectedSort, 0, 0) as Record<string, unknown>;
    const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
    return { content, total: extractTotalCount(data, content.length) };
  }

  async function loadMore() {
    if (!window.anixApi || !hasMore || isLoadingMore) return;
    isLoadingMore = true;

    try {
      const { content, total } = await fetchPage(nextPage);
      if (isCollectionsTab) {
        collectionItems = [...collectionItems, ...content.map(mapCollectionToCardData)];
      } else if (isHistoryTab) {
        items = [...items, ...content.map(mapHistoryToReleaseCard)];
      } else {
        items = [...items, ...content.map(mapReleaseToCardData)];
      }
      if (typeof total === 'number' && total > 0) totalCount = total;
      hasMore = content.length > 0;
      nextPage += 1;
      showEnd = !hasMore;
      isLoadingMore = false;
      tryLoadMoreIfNeeded();
    } catch {
      isLoadingMore = false;
    }
  }

  async function loadTab(tabId: TabId, resetSort = false) {
    activeTab = tabId;
    if (resetSort) selectedSort = DEFAULT_BOOKMARK_SORT;
    nextPage = 0;
    hasMore = true;
    items = [];
    collectionItems = [];
    showEnd = false;
    totalCount = 0;
    loadState = 'loading';
    errorMsg = '';

    if (!window.anixApi) {
      errorMsg = 'API недоступно (только в Electron).';
      loadState = 'error';
      return;
    }

    try {
      const { content, total } = await fetchPage(0);
      if (!content.length) {
        loadState = 'empty';
        totalCount = total;
        return;
      }

      if (tabId === 'collections') {
        collectionItems = content.map(mapCollectionToCardData);
      } else if (tabId === 'history') {
        items = content.map(mapHistoryToReleaseCard);
      } else {
        items = content.map(mapReleaseToCardData);
      }
      totalCount = total;
      hasMore = content.length > 0;
      nextPage = 1;
      showEnd = !hasMore;
      loadState = 'ready';
      tryLoadMoreIfNeeded();
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  }

  function onSortChange(sort: number) {
    if (sort === selectedSort) return;
    selectedSort = sort;
    void loadTab(activeTab);
  }

  async function onRandom() {
    if (!window.anixApi || randomLoading || totalCount === 0) return;
    randomLoading = true;
    try {
      let res: Record<string, unknown> | undefined;
      if (activeTab === 'favorites') {
        res = await window.anixApi.release.randomFavorite(true) as Record<string, unknown>;
      } else {
        const tab = TABS.find((t) => t.id === activeTab);
        const profileId = await ensureProfileId();
        if (!tab?.type || typeof profileId !== 'number') return;
        res = await window.anixApi.release.randomProfileList(profileId, tab.type, true) as Record<string, unknown>;
      }
      const release = (res?.release ?? res) as Record<string, unknown> | undefined;
      const id = release?.id ?? release?.['@id'];
      if (typeof id === 'number') navigate(`/release/${id}`);
    } catch {
      /* ignore */
    } finally {
      randomLoading = false;
    }
  }

  async function onDeleteFromHistory(releaseId: number) {
    if (!window.anixApi) return;
    try {
      await window.anixApi.history.delete(releaseId);
      items = items.filter((item) => item.id !== releaseId);
      totalCount = Math.max(0, totalCount - 1);
      if (!items.length) loadState = 'empty';
    } catch {
      /* ignore */
    }
  }

  function onLayoutChanged() {
    if (!wrapEl) return;
    void loadTab(activeTab);
  }

  onMount(() => {
    requestAnimationFrame(attachScroll);
    void loadTab('collections');
    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });

  onDestroy(() => {
    detachScroll();
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });
</script>

<div class="view view-bookmarks" bind:this={wrapEl}>
  <Tabs
    tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
    activeId={activeTab}
    onChange={(id) => loadTab(id as TabId, true)}
  >
    {#snippet rightActions()}
      {#if isReleaseListTab && loadState !== 'loading'}
        <BookmarksToolbar
          {totalCount}
          sort={selectedSort}
          onSortChange={onSortChange}
          onRandom={onRandom}
          {randomLoading}
        />
      {/if}
    {/snippet}
  </Tabs>

  <div class="bookmarks__content">
    <div class="bookmarks__grid">
      {#if loadState === 'loading'}
        <div class="bookmarks__loading">Загрузка…</div>
      {:else if loadState === 'error'}
        <p class="bookmarks__error">{errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="bookmarks__empty">Здесь пока ничего нет.</p>
      {:else if isHistoryTab}
        <ReleaseCardsGrid items={items} variant="history" onDeleteFromHistory={onDeleteFromHistory} />
      {:else if isCollectionsTab}
        <div class="bookmarks__collections">
          {#each collectionItems as c (c.id)}
            <CollectionCard data={c} />
          {/each}
        </div>
      {:else}
        <ReleaseCardsGrid {items} />
      {/if}
    </div>
    {#if showEnd}
      <div class="bookmarks__more">это всё :)</div>
    {:else if isLoadingMore}
      <div class="bookmarks__more">Загрузка…</div>
    {/if}
  </div>
</div>
