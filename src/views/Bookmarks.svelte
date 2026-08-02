<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import CollectionCard from '../components/CollectionCard.svelte';
  import BookmarksToolbar from '../components/BookmarksToolbar.svelte';
  import HomeDefaultTabModal from '../components/HomeDefaultTabModal.svelte';
  import { onMount, onDestroy } from 'svelte';
  import Tabs, { type TabItem } from '../components/Tabs.svelte';
  import { navigate } from '../stores/navigation';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { getSearchParams } from '../router';
  import { buildPosterUrl, resolveCdnAssetUrl } from '../utils/posterUrl';
  import { DEFAULT_BOOKMARK_SORT } from '../constants/bookmarkSort';
  import type { ReleaseCardData } from '../types/release';
  import { extractHistoryEpisodeInfo } from '../utils/historyFormat';
  import { iconHome } from '../components/icons';
  import { openFloatingMenu } from '../components/dots-menu';
  import {
    getDefaultBookmarksTab,
    resolveBookmarksTab,
    setDefaultBookmarksTab,
    type BookmarksTabId,
  } from '../prefs';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';
  import {
    buildViewStateKey,
    getViewState,
    saveViewStateWithScroll,
    restoreScrollTop,
    invalidateViewStatePrefix,
    registerActiveScrollKey,
    flushActiveViewState,
    saveViewStateData,
    beginScrollRestore,
  } from '../stores/view-state';

  type TabId = BookmarksTabId;

  interface Props {
    /** Чужой профиль — списки/оценки этого пользователя */
    id?: number;
    /** Стартовая вкладка (например votes с /profile/:id/votes) */
    initialTab?: TabId;
    /** Только оценки + статусы (страница /profile/lists) */
    listsOnly?: boolean;
  }

  let { id: routeProfileId, initialTab, listsOnly = false }: Props = $props();

  function readUserFromRoute(route?: string): number | undefined {
    const q = route
      ? (route.includes('?') ? route.slice(route.indexOf('?') + 1) : '')
      : getSearchParams().toString();
    const user = Number.parseInt(new URLSearchParams(q).get('user') || '', 10);
    return Number.isFinite(user) && user > 0 ? user : undefined;
  }

  function navigateDetailToPath(detail: unknown): string {
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && 'to' in detail) {
      return String((detail as { to: unknown }).to ?? '');
    }
    return '';
  }

  /** Активный «чей список»: prop, ?user= или переключение по navigate */
  let listUserId = $state<number | undefined>(
    typeof routeProfileId === 'number' && routeProfileId > 0
      ? routeProfileId
      : readUserFromRoute(),
  );

  interface BookmarksViewState {
    activeTab: TabId;
    items: ReleaseCardData[];
    collectionItems: CollectionCardData[];
    nextPage: number;
    hasMore: boolean;
    loadState: 'loading' | 'error' | 'empty' | 'ready';
    showEnd: boolean;
    errorMsg: string;
    selectedSort: number;
    totalCount: number;
    cachedProfileId: number | null;
    profileLogin: string;
    profileAvatar: string;
  }

  const STATUS_TO_TAB: Record<string, TabId> = {
    '1': 'watching',
    '2': 'planned',
    '3': 'completed',
    '4': 'on_hold',
    '5': 'dropped',
  };

  const SELF_TABS: { id: TabId; label: string; desc: string; type: number | null }[] = [
    { id: 'watching',    label: 'Смотрю',      desc: 'Сейчас в просмотре', type: 1 },
    { id: 'planned',     label: 'В планах',    desc: 'Запланированные релизы', type: 2 },
    { id: 'completed',   label: 'Просмотрено', desc: 'Завершённые релизы', type: 3 },
    { id: 'on_hold',     label: 'Отложено',    desc: 'Отложенные релизы', type: 4 },
    { id: 'dropped',     label: 'Брошено',     desc: 'Брошенные релизы', type: 5 },
    { id: 'collections', label: 'Коллекции',   desc: 'Избранные коллекции', type: null },
    { id: 'history',     label: 'История',     desc: 'Недавно просмотренные релизы', type: null },
    { id: 'votes',       label: 'Оценки',      desc: 'Релизы с вашей оценкой', type: null },
    { id: 'favorites',   label: 'Избранное',   desc: 'Релизы в избранном', type: null },
  ];

  const OTHER_TABS = SELF_TABS.filter((t) =>
    t.id === 'votes' || t.type != null,
  );

  const isOtherProfile = $derived(typeof listUserId === 'number' && listUserId > 0);
  /** Страница списков профиля: оценки + статусы (без коллекций/истории/избранного) */
  const isListsPage = $derived(listsOnly || isOtherProfile);
  const TABS = $derived(isListsPage ? OTHER_TABS : SELF_TABS);
  const DEFAULT_TAB_OPTIONS = $derived(SELF_TABS.map((t) => ({ id: t.id, label: t.label, desc: t.desc })));

  const BOOKMARKS_VIEW_KEY = () =>
    buildViewStateKey(
      isOtherProfile
        ? `/bookmarks?user=${listUserId}`
        : listsOnly
          ? '/profile/lists'
          : '/bookmarks',
    );

  function bookmarksSnapshot(): BookmarksViewState {
    return {
      activeTab,
      items,
      collectionItems,
      nextPage,
      hasMore,
      loadState,
      showEnd,
      errorMsg,
      selectedSort,
      totalCount,
      cachedProfileId,
      profileLogin,
      profileAvatar,
    };
  }

  function applyBookmarksSnapshot(s: BookmarksViewState) {
    activeTab = s.activeTab;
    items = s.items;
    collectionItems = s.collectionItems;
    nextPage = s.nextPage;
    hasMore = s.hasMore;
    loadState = s.loadState;
    showEnd = s.showEnd;
    errorMsg = s.errorMsg;
    selectedSort = s.selectedSort;
    totalCount = s.totalCount;
    cachedProfileId = s.cachedProfileId;
    profileLogin = s.profileLogin;
    profileAvatar = s.profileAvatar;
  }

  function hasBookmarkItems(s: BookmarksViewState): boolean {
    return s.items.length > 0 || s.collectionItems.length > 0;
  }

  function restoreBookmarksScroll(scrollTop: number) {
    if (scrollTop > 0) beginScrollRestore();
    requestAnimationFrame(() => {
      attachScroll();
      void restoreScrollTop(scrollTop, { maxWaitMs: 8000 });
    });
  }

  function onBeforeNavigate() {
    if (items.length > 0 || collectionItems.length > 0) {
      flushActiveViewState(bookmarksSnapshot());
    }
  }

  function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw =
      p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' && raw.poster !== 'string' ? raw.poster : undefined)
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
    const myVote = typeof raw.my_vote === 'number' && raw.my_vote > 0 ? raw.my_vote : undefined;
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
      myVote,
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
  let unregisterScrollKey: (() => void) | null = null;
  let defaultTabModalOpen = $state(false);
  let defaultBookmarksTab = $state(getDefaultBookmarksTab());
  let profileLogin = $state('');
  let profileAvatar = $state('');
  let selfProfileId = $state<number | null>(null);

  const isCollectionsTab = $derived(activeTab === 'collections');
  const isHistoryTab = $derived(activeTab === 'history');
  const isVotesTab = $derived(activeTab === 'votes');
  const isReleaseListTab = $derived(!isCollectionsTab && !isHistoryTab && !isVotesTab);
  const headerAvatarUrl = $derived(profileAvatar ? resolveCdnAssetUrl(profileAvatar) : '');
  const profileIdForPanel = $derived(
    isOtherProfile
      ? listUserId!
      : (cachedProfileId ?? selfProfileId ?? 0),
  );

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
    if (isOtherProfile && typeof listUserId === 'number') return listUserId;
    if (typeof cachedProfileId === 'number') return cachedProfileId;
    if (!window.anixApi) return null;
    const selfRes = await window.anixApi.profile.self() as Record<string, unknown>;
    const profile = (selfRes?.profile ?? selfRes) as Record<string, unknown>;
    const profileId = profile?.id ?? profile?.['@id'];
    if (typeof profileId === 'number') {
      cachedProfileId = profileId;
      selfProfileId = profileId;
      if (!profileLogin && typeof profile.login === 'string') profileLogin = profile.login;
      if (!profileAvatar && typeof profile.avatar === 'string') profileAvatar = profile.avatar;
    }
    return typeof profileId === 'number' ? profileId : null;
  }

  async function loadProfileHeader() {
    if (!window.anixApi) return;
    try {
      if (isOtherProfile && typeof listUserId === 'number') {
        const info = await window.anixApi.profile.info(listUserId) as {
          profile?: { id?: number; login?: string; avatar?: string };
          is_my_profile?: boolean;
        };
        const p = info?.profile;
        cachedProfileId = p?.id ?? listUserId;
        profileLogin = p?.login ?? '';
        profileAvatar = p?.avatar ?? '';
        return;
      }
      const self = await window.anixApi.profile.self() as {
        profile?: { id?: number; login?: string; avatar?: string };
      };
      const p = self?.profile;
      if (typeof p?.id === 'number') {
        cachedProfileId = p.id;
        selfProfileId = p.id;
      }
      profileLogin = p?.login ?? '';
      profileAvatar = p?.avatar ?? '';
    } catch {
      /* ignore */
    }
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

    if (activeTab === 'votes') {
      const profileId = await ensureProfileId();
      if (typeof profileId !== 'number') return { content: [], total: 0 };
      const data = await window.anixApi.profile.getVotedReleases(profileId, page, 1) as Record<string, unknown>;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      return { content, total: extractTotalCount(data, content.length) };
    }

    if (activeTab === 'favorites') {
      const data = await window.anixApi.favorites.all(page, selectedSort, 0, 0) as Record<string, unknown>;
      const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
      return { content, total: extractTotalCount(data, content.length) };
    }

    const tab = TABS.find((t) => t.id === activeTab)!;
    const profileId = await ensureProfileId();
    if (typeof profileId !== 'number' || tab.type == null) return { content: [], total: 0 };
    const data = await window.anixApi.profile.getBookmarks(profileId, tab.type, page, selectedSort, 0, 0) as Record<string, unknown>;
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
      hasMore = isVotesTab
        ? content.length >= 25 && !(total > 0 && (nextPage + 1) * 25 >= total)
        : content.length > 0;
      nextPage += 1;
      showEnd = !hasMore;
      isLoadingMore = false;
      tryLoadMoreIfNeeded();
    } catch {
      isLoadingMore = false;
    }
  }

  function listsBasePath(): string {
    if (listsOnly) return '/profile/lists';
    return '/bookmarks';
  }

  function syncTabToUrl(tabId: TabId) {
    let path: string;
    if (listsOnly) {
      path = `/profile/lists?tab=${encodeURIComponent(tabId)}`;
    } else if (isOtherProfile && typeof listUserId === 'number') {
      path = `/bookmarks?tab=${encodeURIComponent(tabId)}&user=${listUserId}`;
    } else {
      const qs = tabId === 'collections' ? '' : `?tab=${encodeURIComponent(tabId)}`;
      path = `/bookmarks${qs}`;
    }
    if (window.location.protocol === 'file:') {
      const hash = `#${path}`;
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', hash);
      }
      return;
    }
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== path) {
      window.history.replaceState(null, '', path);
    }
  }

  function tabFromLocationOrNav(detail?: string): TabId | null {
    let tabParam: string | null = null;
    if (detail) {
      const q = detail.includes('?') ? detail.slice(detail.indexOf('?') + 1) : '';
      tabParam = new URLSearchParams(q).get('tab');
    } else {
      tabParam = getSearchParams().get('tab');
    }
    if (tabParam && TABS.some((t) => t.id === tabParam)) return tabParam as TabId;
    return null;
  }

  async function switchListUser(nextUserId: number | undefined, tab: TabId | null) {
    const sameUser = nextUserId === listUserId;
    if (sameUser) {
      if (tab && tab !== activeTab) void loadTab(tab);
      return;
    }

    if (items.length > 0 || collectionItems.length > 0) {
      saveViewStateWithScroll(BOOKMARKS_VIEW_KEY(), bookmarksSnapshot());
    }

    listUserId = nextUserId;
    cachedProfileId = typeof nextUserId === 'number' ? nextUserId : null;
    profileLogin = '';
    profileAvatar = '';
    await loadProfileHeader();

    const nextTab = tab
      ?? (nextUserId != null ? 'votes' : resolveBookmarksTab(getDefaultBookmarksTab()));
    void loadTab(nextTab, true, true);
  }

  function onExternalNavigate(e: Event) {
    const to = navigateDetailToPath((e as CustomEvent).detail);
    // Списки через Закладки (свои и чужие по ?user=)
    if (to === '/bookmarks' || to.startsWith('/bookmarks?')) {
      const nextUserId = readUserFromRoute(to);
      const tab = tabFromLocationOrNav(to);
      void switchListUser(
        nextUserId,
        tab ?? (nextUserId != null ? 'votes' : resolveBookmarksTab(getDefaultBookmarksTab())),
      );
      return;
    }
    // Legacy: /profile/:id/lists и /profile/lists
    if (listsOnly && to.startsWith('/profile/lists')) {
      const tab = tabFromLocationOrNav(to);
      if (tab && tab !== activeTab) void loadTab(tab);
      return;
    }
    const legacy = to.match(/^\/profile\/(\d+)\/lists/);
    if (legacy) {
      const uid = Number.parseInt(legacy[1], 10);
      void switchListUser(
        Number.isFinite(uid) && uid > 0 ? uid : undefined,
        tabFromLocationOrNav(to) ?? 'votes',
      );
    }
  }

  async function loadTab(tabId: TabId, resetSort = false, force = false) {
    if (!TABS.some((t) => t.id === tabId)) {
      tabId = TABS[0]?.id ?? 'watching';
    }

    if (tabId !== activeTab && (items.length > 0 || collectionItems.length > 0)) {
      saveViewStateWithScroll(BOOKMARKS_VIEW_KEY(), bookmarksSnapshot());
    }

    activeTab = tabId;
    syncTabToUrl(tabId);

    if (!resetSort && !force) {
      const cached = getViewState<BookmarksViewState>(BOOKMARKS_VIEW_KEY());
      if (cached?.data && hasBookmarkItems(cached.data) && cached.data.activeTab === tabId) {
        applyBookmarksSnapshot(cached.data);
        restoreBookmarksScroll(cached.scrollTop);
        return;
      }
    }

    if (force) invalidateViewStatePrefix(listsBasePath());

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
      hasMore = isVotesTab
        ? content.length >= 25 && !(total > 0 && 25 >= total)
        : content.length > 0;
      nextPage = 1;
      showEnd = !hasMore;
      loadState = 'ready';
      tryLoadMoreIfNeeded();
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  }

  function onBookmarksChanged() {
    if (isOtherProfile) return;
    void loadTab(activeTab, false, true);
  }

  function onSortChange(sort: number) {
    if (sort === selectedSort) return;
    selectedSort = sort;
    void loadTab(activeTab);
  }

  async function onRandom() {
    if (!window.anixApi || randomLoading || totalCount === 0 || isVotesTab) return;
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
      const rid = release?.id ?? release?.['@id'];
      if (typeof rid === 'number') navigate(`/release/${rid}`);
    } catch {
      /* ignore */
    } finally {
      randomLoading = false;
    }
  }

  async function onDeleteFromHistory(releaseId: number) {
    if (!window.anixApi || isOtherProfile) return;
    try {
      await window.anixApi.history.delete(releaseId);
      items = items.filter((item) => item.id !== releaseId);
      totalCount = Math.max(0, totalCount - 1);
      if (!items.length) loadState = 'empty';
      invalidateViewStatePrefix('/bookmarks');
    } catch {
      /* ignore */
    }
  }

  function onLayoutChanged() {
    if (!wrapEl) return;
    void loadTab(activeTab);
  }

  function openDefaultTabModal() {
    defaultTabModalOpen = true;
  }

  function handleTabsSettingsClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    openDefaultTabModal();
  }

  function handleTabContextMenu(tab: TabItem, e: MouseEvent) {
    if (isOtherProfile) return;
    openFloatingMenu({
      x: e.clientX,
      y: e.clientY,
      entries: [
        { id: 'set-default', label: 'Назначить по умолчанию', icon: iconHome(18) },
      ],
      onSelect: (menuId) => {
        if (menuId === 'set-default') {
          defaultBookmarksTab = setDefaultBookmarksTab(tab.id);
        }
      },
    });
  }

  function onDefaultTabSave(tabId: string) {
    defaultBookmarksTab = setDefaultBookmarksTab(tabId);
    defaultTabModalOpen = false;
  }

  function resolveInitialBookmarksTab(): TabId {
    if (initialTab && TABS.some((t) => t.id === initialTab)) return initialTab;
    const params = getSearchParams();
    const tabParam = params.get('tab');
    if (tabParam && TABS.some((t) => t.id === tabParam)) return tabParam as TabId;
    const statusParam = params.get('status');
    if (statusParam && STATUS_TO_TAB[statusParam] && TABS.some((t) => t.id === STATUS_TO_TAB[statusParam])) {
      return STATUS_TO_TAB[statusParam];
    }
    if (isListsPage) return 'votes';
    return resolveBookmarksTab(getDefaultBookmarksTab());
  }

  onMount(() => {
    unregisterScrollKey = registerActiveScrollKey(() => BOOKMARKS_VIEW_KEY());
    window.addEventListener('anix:beforeNavigate', onBeforeNavigate);
    window.addEventListener('anix:bookmarksChanged', onBookmarksChanged);
    window.addEventListener('anix:navigate', onExternalNavigate);
    defaultBookmarksTab = getDefaultBookmarksTab();

    void loadProfileHeader();

    const params = getSearchParams();
    const tabParam = params.get('tab');
    const statusParam = params.get('status');
    const hasExplicitTab = !!(
      initialTab
      || (tabParam && TABS.some((t) => t.id === tabParam))
      || (statusParam && STATUS_TO_TAB[statusParam])
    );
    const cached = getViewState<BookmarksViewState>(BOOKMARKS_VIEW_KEY());

    if (!hasExplicitTab && !isListsPage && cached?.data && hasBookmarkItems(cached.data)) {
      applyBookmarksSnapshot(cached.data);
      restoreBookmarksScroll(cached.scrollTop);
      window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
      return;
    }

    requestAnimationFrame(attachScroll);
    void loadTab(resolveInitialBookmarksTab());
    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });

  onDestroy(() => {
    window.removeEventListener('anix:beforeNavigate', onBeforeNavigate);
    window.removeEventListener('anix:bookmarksChanged', onBookmarksChanged);
    window.removeEventListener('anix:navigate', onExternalNavigate);
    unregisterScrollKey?.();
    unregisterScrollKey = null;
    saveViewStateData(BOOKMARKS_VIEW_KEY(), bookmarksSnapshot());
    detachScroll();
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });
</script>

<div class="view view-bookmarks" bind:this={wrapEl}>
  <div class="bookmarks__user-header">
    <button
      type="button"
      class="bookmarks__user"
      onclick={(e) => handleUserProfileClick(profileIdForPanel, e)}
      title="Открыть профиль"
    >
      <span
        class="bookmarks__user-avatar"
        style={headerAvatarUrl ? `background-image:url('${headerAvatarUrl}')` : undefined}
        aria-hidden="true"
      ></span>
      <span class="bookmarks__user-name">{profileLogin || (isOtherProfile ? 'Профиль' : 'Мои списки')}</span>
    </button>

    <div class="bookmarks__user-actions">
      {#if isReleaseListTab && loadState !== 'loading'}
        <BookmarksToolbar
          {totalCount}
          sort={selectedSort}
          onSortChange={onSortChange}
          onRandom={onRandom}
          {randomLoading}
        >
          {#snippet leadingActions()}
            {#if !isListsPage}
              <button
                type="button"
                class="bookmarks-toolbar__icon-btn"
                title="Изменить вкладку по умолчанию"
                aria-label="Изменить вкладку по умолчанию"
                onclick={handleTabsSettingsClick}
              >
                {@html iconHome(18)}
              </button>
            {/if}
          {/snippet}
        </BookmarksToolbar>
      {:else}
        {#if isVotesTab && loadState === 'ready' && totalCount > 0}
          <span class="bookmarks-toolbar__count">{totalCount} всего</span>
        {/if}
        {#if !isListsPage}
          <button
            type="button"
            class="bookmarks-toolbar__icon-btn"
            title="Изменить вкладку по умолчанию"
            aria-label="Изменить вкладку по умолчанию"
            onclick={handleTabsSettingsClick}
          >
            {@html iconHome(18)}
          </button>
        {/if}
      {/if}
    </div>
  </div>

  <Tabs
    tabs={TABS.map((t) => ({
      id: t.id,
      label: t.label,
      dividerBefore: isListsPage ? t.id === 'votes' : t.id === 'collections',
    }))}
    activeId={activeTab}
    onChange={(tabId) => loadTab(tabId as TabId)}
    onTabContextMenu={isListsPage ? undefined : handleTabContextMenu}
  />

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

{#if defaultTabModalOpen && !isListsPage}
  <HomeDefaultTabModal
    options={DEFAULT_TAB_OPTIONS}
    value={resolveBookmarksTab(defaultBookmarksTab)}
    subtitle="Выбранная вкладка будет открываться при переходе в закладки"
    onSave={onDefaultTabSave}
    onClose={() => { defaultTabModalOpen = false; }}
  />
{/if}
