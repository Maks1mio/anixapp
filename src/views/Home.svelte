<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import Tabs from '../components/Tabs.svelte';
  import { buildPosterUrl } from '../utils/posterUrl';
  import type { ReleaseCardData } from '../types/release';
  import { fetchAnnouncements, type Announcement } from '../services/announcements';
  import AnnouncementBanner from '../components/AnnouncementBanner.svelte';

  type HomeTabId = 'latest' | 'ongoing' | 'announced' | 'completed' | 'movies';

  const HOME_TABS = [
    { id: 'latest' as HomeTabId,    label: 'Последние' },
    { id: 'ongoing' as HomeTabId,   label: 'Онгоинги' },
    { id: 'announced' as HomeTabId, label: 'Анонсы' },
    { id: 'completed' as HomeTabId, label: 'Завершенные' },
    { id: 'movies' as HomeTabId,    label: 'Фильмы' },
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
    const categoryObj = raw.category as { name?: string } | undefined;
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
      category: categoryObj?.name,
      releaseDate: (raw.release_date as string) || undefined,
      isFavorite: !!(raw.is_favorite),
      listStatus,
    };
  }

  let activeTab = $state<HomeTabId>('latest');
  let items = $state<ReleaseCardData[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let wrapEl: HTMLElement | undefined = $state();
  let announcements = $state<Announcement[]>([]);

  function getFilterArgs(tab: HomeTabId) {
    const base = { sort: 0, status_id: null as number | null, category_id: null as number | null };
    switch (tab) {
      case 'latest':    return { ...base, sort: 0 };
      case 'ongoing':   return { ...base, status_id: 2 };
      case 'announced': return { ...base, status_id: 3 };
      case 'completed': return { ...base, status_id: 1 };
      case 'movies':    return { ...base, category_id: 2 };
      default:          return base;
    }
  }

  async function loadPage() {
    if (!window.anixApi || isLoading || !hasMore) return;
    isLoading = true;
    const nextPage = page;
    if (nextPage === 0) loadState = 'loading';

    try {
      const data = await window.anixApi.release.filter(nextPage, getFilterArgs(activeTab), true) as any;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (!content.length) {
        hasMore = false;
        if (nextPage === 0) loadState = 'empty';
        return;
      }
      items = [...items, ...content.map(mapReleaseToCardData)];
      page = nextPage + 1;
      loadState = 'ready';
      requestAnimationFrame(checkIfNeedsMore);
    } catch (err) {
      if (nextPage === 0) {
        errorMsg = String(err);
        loadState = 'error';
      }
    } finally {
      isLoading = false;
    }
  }

  function checkIfNeedsMore() {
    if (!scrollEl || !hasMore || isLoading) return;
    const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    if (distance < 300) loadPage();
  }

  function attachScroll() {
    const el = wrapEl?.closest('.page__scroll') as HTMLElement | null
      ?? document.getElementById('content');
    if (!el) return;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || isLoading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 300) loadPage();
    };
    el.addEventListener('scroll', scrollListener);
  }

  function detachScroll() {
    if (scrollEl && scrollListener) {
      scrollEl.removeEventListener('scroll', scrollListener);
    }
    scrollEl = null;
    scrollListener = null;
  }

  function setActiveTab(tabId: HomeTabId) {
    if (tabId === activeTab) return;
    activeTab = tabId;
    page = 0;
    hasMore = true;
    items = [];
    loadState = 'loading';
    loadPage();
  }

  async function loadAnnouncements() {
    const list = await fetchAnnouncements();
    announcements = list;
  }

  async function handleRandom() {
    if (!window.anixApi) return;
    try {
      const data = await window.anixApi.release.random(true) as any;
      const release = data?.release as { id?: number } | undefined;
      if (release?.id) navigate(`/release/${release.id}`);
    } catch { /* ignore */ }
  }

  function onLayoutChanged() {
    // Re-render by forcing a state update (items reference stays same, Svelte re-renders)
    items = [...items];
  }

  onMount(() => {
    requestAnimationFrame(attachScroll);
    loadPage();
    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
    loadAnnouncements();
  });

  onDestroy(() => {
    detachScroll();
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });

  // Dynamic import of grid renderer (vanilla component)
</script>

<div class="view view-home" bind:this={wrapEl}>
  {#if announcements.length > 0}
    <div class="ann-list">
      {#each announcements as ann (ann.id)}
        <AnnouncementBanner announcement={ann} />
      {/each}
    </div>
  {/if}
  <Tabs
    tabs={HOME_TABS}
    activeId={activeTab}
    onChange={(id) => setActiveTab(id as HomeTabId)}
    rootClassName="bookmarks__tabs releases-type"
  >
    {#snippet rightActions()}
      <button
        type="button"
        class="btn btn-secondary home-toolbar__random"
        onclick={handleRandom}
      >
        Случайный релиз
      </button>
    {/snippet}
  </Tabs>

  <div class="home-content">
    <div class="home-list">
      {#if loadState === 'loading'}
        <div class="home-list__loading">Загрузка…</div>
      {:else if loadState === 'error'}
        <p class="home-list__error">Ошибка: {errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="home-list__empty">Здесь пока ничего нет.</p>
      {:else}
        <div class="bookmarks__grid">
          <ReleaseCardsGrid items={items} />
        </div>
      {/if}
    </div>
  </div>
</div>
