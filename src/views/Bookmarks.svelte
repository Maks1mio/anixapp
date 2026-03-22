<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import { onMount, onDestroy } from 'svelte';
  import Tabs from '../components/Tabs.svelte';
  import { buildPosterUrl } from '../utils/posterUrl';
  import type { ReleaseCardData } from '../types/release';

  type TabId = 'favorites' | 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped';

  const TABS: { id: TabId; label: string; type: number | null }[] = [
    { id: 'favorites',  label: 'Избранное',   type: null },
    { id: 'watching',   label: 'Смотрю',       type: 1 },
    { id: 'planned',    label: 'В планах',     type: 2 },
    { id: 'completed',  label: 'Просмотрено',  type: 3 },
    { id: 'on_hold',    label: 'Отложено',     type: 4 },
    { id: 'dropped',    label: 'Брошено',      type: 5 },
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

  let activeTab = $state<TabId>('favorites');
  let items = $state<ReleaseCardData[]>([]);
  let nextPage = $state(1);
  let hasMore = $state(true);
  let isLoadingMore = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let showEnd = $state(false);
  let errorMsg = $state('');
  let cachedProfileId = $state<number | null>(null);
  let wrapEl: HTMLElement | undefined = $state();

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

  async function loadMore() {
    if (!window.anixApi || !hasMore || isLoadingMore) return;
    const tab = TABS.find(t => t.id === activeTab)!;
    isLoadingMore = true;

    const onLoaded = (content: Record<string, unknown>[]) => {
      items = [...items, ...content.map(mapReleaseToCardData)];
      hasMore = content.length > 0;
      nextPage += 1;
      showEnd = !hasMore;
      isLoadingMore = false;
      tryLoadMoreIfNeeded();
    };

    try {
      if (tab.id === 'favorites') {
        const data = await window.anixApi.favorites.all(nextPage) as any;
        onLoaded((data?.content ?? data?.releases ?? []) as Record<string, unknown>[]);
      } else {
        const profileId = cachedProfileId;
        if (typeof profileId !== 'number') { isLoadingMore = false; return; }
        const data = await window.anixApi.profile.getBookmarks(profileId, tab.type!, nextPage) as any;
        onLoaded((data?.content ?? data?.releases ?? []) as Record<string, unknown>[]);
      }
    } catch {
      isLoadingMore = false;
    }
  }

  async function loadTab(tabId: TabId) {
    activeTab = tabId;
    nextPage = 1;
    hasMore = true;
    items = [];
    showEnd = false;
    loadState = 'loading';
    errorMsg = '';

    if (!window.anixApi) {
      errorMsg = 'API недоступно (только в Electron).';
      loadState = 'error';
      return;
    }

    const tab = TABS.find(t => t.id === tabId)!;

    try {
      if (tab.id === 'favorites') {
        const data = await window.anixApi.favorites.all(0) as any;
        const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
        if (!content.length) { loadState = 'empty'; return; }
        items = content.map(mapReleaseToCardData);
        hasMore = content.length > 0;
        showEnd = !hasMore;
        loadState = 'ready';
        tryLoadMoreIfNeeded();
      } else {
        const selfRes = await window.anixApi.profile.self() as any;
        const profile = selfRes?.profile ?? selfRes;
        const profileId = profile?.id ?? profile?.['@id'];
        if (typeof profileId !== 'number') {
          errorMsg = 'Не удалось определить профиль.';
          loadState = 'error';
          return;
        }
        cachedProfileId = profileId;
        const data = await window.anixApi.profile.getBookmarks(profileId, tab.type!, 0) as any;
        const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
        if (!content.length) { loadState = 'empty'; return; }
        items = content.map(mapReleaseToCardData);
        hasMore = content.length > 0;
        showEnd = !hasMore;
        loadState = 'ready';
        tryLoadMoreIfNeeded();
      }
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  }

  function onLayoutChanged() {
    if (!wrapEl) return;
    loadTab(activeTab);
  }

  onMount(() => {
    requestAnimationFrame(attachScroll);
    loadTab('favorites');
    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });

  onDestroy(() => {
    detachScroll();
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });
</script>

<div class="view view-bookmarks" bind:this={wrapEl}>
  <Tabs
    tabs={TABS.map(t => ({ id: t.id, label: t.label }))}
    activeId={activeTab}
    onChange={(id) => loadTab(id as TabId)}
  />

  <div class="bookmarks__content">
    <div class="bookmarks__grid">
      {#if loadState === 'loading'}
        <div class="bookmarks__loading">Загрузка…</div>
      {:else if loadState === 'error'}
        <p class="bookmarks__error">{errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="bookmarks__empty">Здесь пока ничего нет.</p>
      {:else}
        <ReleaseCardsGrid items={items} />
      {/if}
    </div>
    {#if showEnd}
      <div class="bookmarks__more">это всё :)</div>
    {:else if isLoadingMore}
      <div class="bookmarks__more">Загрузка…</div>
    {/if}
  </div>
</div>
