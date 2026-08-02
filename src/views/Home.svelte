<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import HomeCustomFilterView from '../components/HomeCustomFilterView.svelte';
  import HomeDefaultTabModal from '../components/HomeDefaultTabModal.svelte';
  import HomeTabRenameModal from '../components/HomeTabRenameModal.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { requireAuth } from '../stores/auth';
  import Tabs, { type TabItem } from '../components/Tabs.svelte';
  import { iconHome, iconPencil, iconShuffle, iconSlidersHorizontal } from '../components/icons';
  import { openFloatingMenu } from '../components/dots-menu';
  import { buildPosterUrl } from '../utils/posterUrl';
  import type { ReleaseCardData } from '../types/release';
  import { fetchAnnouncements, type Announcement } from '../services/announcements';
  import AnnouncementBanner from '../components/AnnouncementBanner.svelte';
  import YearWrappedBanner from '../components/YearWrappedBanner.svelte';
  import { shouldShowWrappedBanner } from '../utils/yearWrapped';
  import { fetchWrappedBannerPosters } from '../views/Wrapped/shared/wrapped-load';
  import {
    isHomeCustomTabConfigured,
    loadHomeCustomTab,
    renameHomeCustomTab,
    saveHomeCustomTab,
    serializeHomeCustomTabData,
    setDefaultHomeTab,
    setSavedHomeActiveTab,
    toFilterRequest,
    type HomeCustomTabData,
  } from '../utils/homeCustomTab';

  import {
    DEFAULT_HOME_TAB,
    getHomeTabFilterArgs,
    HOME_TAB_DEFS,
    HOME_TAB_IDS,
    resolveHomeTab,
    type HomeTabId,
  } from '../data/homeTabs';
  import {
    buildViewStateKey,
    getViewState,
    saveViewStateWithScroll,
    restoreScrollTop,
    registerActiveScrollKey,
    flushActiveViewState,
    saveViewStateData,
    beginScrollRestore,
    logViewStateRestore,
    logViewStateMiss,
    type ViewStateEntry,
  } from '../stores/view-state';

  interface HomeViewState {
    activeTab: HomeTabId;
    items: ReleaseCardData[];
    page: number;
    hasMore: boolean;
    loadState: 'loading' | 'error' | 'empty' | 'ready' | 'unconfigured';
    errorMsg: string;
    customTabData: HomeCustomTabData;
  }

  const HOME_VIEW_KEY = (tab: HomeTabId = activeTab) => buildViewStateKey('/', { htab: tab });

  function findBestHomeCache(): ViewStateEntry<HomeViewState> | null {
    let best: ViewStateEntry<HomeViewState> | null = null;
    for (const tabId of HOME_TAB_IDS) {
      const entry = getViewState<HomeViewState>(HOME_VIEW_KEY(tabId));
      if (!entry?.data || entry.data.items.length === 0) continue;
      if (!best || entry.savedAt >= best.savedAt) best = entry;
    }
    return best;
  }

  function homeSnapshot(): HomeViewState {
    return {
      activeTab,
      items,
      page,
      hasMore,
      loadState,
      errorMsg,
      customTabData,
    };
  }

  function applyHomeSnapshot(s: HomeViewState) {
    items = s.items;
    page = s.page;
    hasMore = s.hasMore;
    loadState = s.loadState;
    errorMsg = s.errorMsg;
    customTabData = s.customTabData;
  }

  async function restoreHomeScroll(scrollTop: number) {
    if (scrollTop > 0) beginScrollRestore();
    requestAnimationFrame(() => {
      attachScroll();
      void restoreScrollTop(scrollTop, { maxWaitMs: 8000 });
    });
  }

  function onBeforeNavigate() {
    if (items.length > 0 || loadState === 'ready' || loadState === 'empty') {
      flushActiveViewState(homeSnapshot());
    }
  }

  let customTabData = $state<HomeCustomTabData>({ tabName: '', filter: null, activeTab: null });
  let customTabConfigured = $derived(isHomeCustomTabConfigured(customTabData));

  const homeTabs = $derived(
    HOME_TAB_DEFS.map((tab) => ({
      id: tab.id,
      label: tab.id === 'my'
        ? (customTabData.tabName.trim() || tab.label)
        : tab.label,
    })),
  );

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

  function resolveInitialTab(data: HomeCustomTabData): HomeTabId {
    return resolveHomeTab(data.activeTab);
  }

  let activeTab = $state<HomeTabId>(DEFAULT_HOME_TAB);
  let items = $state<ReleaseCardData[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready' | 'unconfigured'>('loading');
  let errorMsg = $state('');
  let randomLoading = $state(false);
  let filterModalOpen = $state(false);
  let defaultTabModalOpen = $state(false);
  let renameTabModalOpen = $state(false);
  let tabsSettingsBtn = $state<HTMLButtonElement | undefined>();
  let unregisterScrollKey: (() => void) | null = null;

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;
  let wrapEl: HTMLElement | undefined = $state();
  let announcements = $state<Announcement[]>([]);
  let showWrappedBanner = $state(shouldShowWrappedBanner());
  let wrappedPreviewPosters = $state<string[]>([]);

  const isMyTab = $derived(activeTab === 'my');
  const showMyTabEmpty = $derived(isMyTab && !customTabConfigured);

  function getFilterArgs(tab: HomeTabId): Record<string, unknown> {
    if (tab === 'my' && customTabData.filter) return toFilterRequest(customTabData.filter);
    return getHomeTabFilterArgs(tab);
  }

  async function loadPage() {
    if (!window.anixApi || isLoading || !hasMore) return;
    if (activeTab === 'my' && !customTabConfigured) {
      loadState = 'unconfigured';
      return;
    }

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

  function resetList() {
    page = 0;
    hasMore = true;
    items = [];
  }

  function setActiveTab(tabId: HomeTabId) {
    if (tabId === activeTab) return;
    if (tabId === 'my' && !requireAuth()) return;
    saveViewStateWithScroll(HOME_VIEW_KEY(activeTab), homeSnapshot());
    activeTab = tabId;
    void setSavedHomeActiveTab(tabId);

    const cached = getViewState<HomeViewState>(HOME_VIEW_KEY(tabId));
    if (cached?.data && cached.data.items.length > 0) {
      applyHomeSnapshot(cached.data);
      void restoreHomeScroll(cached.scrollTop);
      return;
    }

    resetList();
    if (tabId === 'my' && !customTabConfigured) {
      loadState = 'unconfigured';
      return;
    }
    loadState = 'loading';
    loadPage();
  }

  function openFilterModal() {
    if (!requireAuth()) return;
    filterModalOpen = true;
  }

  function openDefaultTabModal() {
    if (!requireAuth()) return;
    defaultTabModalOpen = true;
  }

  function openRenameTabModal() {
    if (!requireAuth()) return;
    renameTabModalOpen = true;
  }

  function handleTabsSettingsClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth()) return;
    const btn = tabsSettingsBtn;
    if (!btn) return;
    openFloatingMenu({
      anchor: btn,
      entries: [
        { id: 'default-tab', label: 'Изменить вкладку по умолч.', icon: iconHome(18) },
        { id: 'configure-my', label: 'Настроить мою вкладку', icon: iconSlidersHorizontal(18) },
      ],
      onSelect: (id) => {
        if (id === 'default-tab') openDefaultTabModal();
        else if (id === 'configure-my') openFilterModal();
      },
    });
  }

  function handleTabContextMenu(tab: TabItem, e: MouseEvent) {
    if (tab.id === 'my') {
      if (!requireAuth()) return;
      openFloatingMenu({
        x: e.clientX,
        y: e.clientY,
        entries: [
          { id: 'rename', label: 'Переименовать', icon: iconPencil(18) },
          { id: 'configure', label: 'Настроить вкладку', icon: iconSlidersHorizontal(18) },
          { id: 'set-default', label: 'Назначить по умолчанию', icon: iconHome(18) },
        ],
        onSelect: (id) => {
          if (id === 'rename') openRenameTabModal();
          else if (id === 'configure') openFilterModal();
          else if (id === 'set-default') void setDefaultHomeTab('my');
        },
      });
      return;
    }

    openFloatingMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [
        { id: 'set-default', label: 'Назначить по умолчанию', icon: iconHome(18) },
      ],
      onSelect: (id) => {
        if (id === 'set-default') void setDefaultHomeTab(tab.id);
      },
    });
  }

  async function onDefaultTabSave(tabId: string) {
    await setDefaultHomeTab(tabId);
    defaultTabModalOpen = false;
  }

  async function onRenameTabSave(name: string) {
    if (!name) return;
    await renameHomeCustomTab(name);
    renameTabModalOpen = false;
  }

  async function onFilterSave(data: HomeCustomTabData) {
    const saved = serializeHomeCustomTabData(data);
    await saveHomeCustomTab(saved);
    customTabData = saved;
    filterModalOpen = false;
    if (activeTab === 'my') {
      resetList();
      loadState = 'loading';
      loadPage();
    }
  }

  async function onCustomTabChanged() {
    customTabData = await loadHomeCustomTab();
    if (activeTab === 'my') {
      resetList();
      if (!isHomeCustomTabConfigured(customTabData)) {
        loadState = 'unconfigured';
      } else {
        loadState = 'loading';
        loadPage();
      }
    }
  }

  async function loadAnnouncements() {
    const list = await fetchAnnouncements();
    announcements = list;
  }

  async function handleRandom() {
    if (!window.anixApi || randomLoading) return;
    randomLoading = true;
    try {
      const data = await window.anixApi.release.random(true) as any;
      const release = data?.release as { id?: number } | undefined;
      if (release?.id) navigate(`/release/${release.id}`);
    } catch { /* ignore */ }
    finally {
      randomLoading = false;
    }
  }

  function onLayoutChanged() {
    items = [...items];
  }

  function onHomeCustomTabChangedEvent() {
    void onCustomTabChanged();
  }

  onMount(() => {
    window.addEventListener('anix:beforeNavigate', onBeforeNavigate);
    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
    window.addEventListener('anix:homeCustomTabChanged', onHomeCustomTabChangedEvent);
    void loadAnnouncements();
    if (showWrappedBanner) {
      void fetchWrappedBannerPosters(5).then((urls) => {
        if (urls.length) wrappedPreviewPosters = urls;
      });
    }

    const cached = findBestHomeCache();
    if (cached?.data && cached.data.items.length > 0) {
      activeTab = cached.data.activeTab;
      applyHomeSnapshot(cached.data);
      unregisterScrollKey = registerActiveScrollKey(() => HOME_VIEW_KEY());
      logViewStateRestore(HOME_VIEW_KEY(cached.data.activeTab), cached.scrollTop, cached.data);
      void restoreHomeScroll(cached.scrollTop);
      void loadHomeCustomTab().then((data) => {
        customTabData = data;
      });
      return;
    }

    unregisterScrollKey = registerActiveScrollKey(() => HOME_VIEW_KEY());

    void (async () => {
      customTabData = await loadHomeCustomTab();
      activeTab = resolveInitialTab(customTabData);
      logViewStateMiss(HOME_VIEW_KEY(activeTab), 'no-cached-items');
      requestAnimationFrame(attachScroll);
      if (activeTab === 'my' && !isHomeCustomTabConfigured(customTabData)) {
        loadState = 'unconfigured';
      } else {
        loadPage();
      }
    })();
  });

  onDestroy(() => {
    window.removeEventListener('anix:beforeNavigate', onBeforeNavigate);
    unregisterScrollKey?.();
    unregisterScrollKey = null;
    saveViewStateData(HOME_VIEW_KEY(activeTab), homeSnapshot());
    detachScroll();
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
    window.removeEventListener('anix:homeCustomTabChanged', onHomeCustomTabChangedEvent);
  });
</script>

<div class="view view-home" bind:this={wrapEl}>
  {#if showWrappedBanner}
    <YearWrappedBanner previewPosters={wrappedPreviewPosters} />
  {/if}
  {#if announcements.length > 0}
    <div class="ann-list">
      {#each announcements as ann (ann.id)}
        <AnnouncementBanner announcement={ann} />
      {/each}
    </div>
  {/if}
  <Tabs
    tabs={homeTabs}
    activeId={activeTab}
    onChange={(id) => setActiveTab(id as HomeTabId)}
    onTabContextMenu={handleTabContextMenu}
    rootClassName="bookmarks__tabs releases-type"
  >
    {#snippet leftActions()}
      <button
        type="button"
        class="bookmarks-toolbar__icon-btn bookmarks__tabs-settings"
        title="Настройки вкладок"
        aria-label="Настройки вкладок"
        aria-haspopup="menu"
        bind:this={tabsSettingsBtn}
        onclick={handleTabsSettingsClick}
      >
        {@html iconSlidersHorizontal(18)}
      </button>
    {/snippet}
    {#snippet rightActions()}
      <div class="bookmarks-toolbar">
        <button
          type="button"
          class="bookmarks-toolbar__icon-btn"
          title="Случайный релиз"
          aria-label="Случайный релиз"
          disabled={randomLoading}
          onclick={handleRandom}
        >
          {@html iconShuffle(18)}
        </button>
      </div>
    {/snippet}
  </Tabs>

  <div class="home-content">
    <div class="home-list">
      {#if loadState === 'unconfigured' || showMyTabEmpty}
        <div class="home-my-tab-empty">
          <div class="home-my-tab-empty__icon" aria-hidden="true">👋</div>
          <h2 class="home-my-tab-empty__title">Это ваша вкладка</h2>
          <p class="home-my-tab-empty__text">
            Настройте её под себя и укажите, что хотели бы здесь видеть
          </p>
          <button type="button" class="btn btn-secondary home-my-tab-empty__btn" onclick={openFilterModal}>
            Настроить
          </button>
        </div>
      {:else if loadState === 'loading'}
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

{#if filterModalOpen}
  <HomeCustomFilterView
    initial={customTabData}
    onSave={onFilterSave}
    onClose={() => { filterModalOpen = false; }}
  />
{/if}

{#if defaultTabModalOpen}
  <HomeDefaultTabModal
    options={[...HOME_TAB_DEFS]}
    value={resolveHomeTab(customTabData.activeTab ?? activeTab)}
    onSave={onDefaultTabSave}
    onClose={() => { defaultTabModalOpen = false; }}
  />
{/if}

{#if renameTabModalOpen}
  <HomeTabRenameModal
    initialName={customTabData.tabName.trim() || 'Моя вкладка'}
    onSave={onRenameTabSave}
    onClose={() => { renameTabModalOpen = false; }}
  />
{/if}
