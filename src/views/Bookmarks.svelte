<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import ReleaseCardsGridSkeleton from '../components/ReleaseCardsGridSkeleton.svelte';
  import UiV2CollectionCardSkeleton from '../components/uikit-v2/UiV2CollectionCardSkeleton.svelte';
  import CollectionCard from '../components/CollectionCard.svelte';
  import BookmarksToolbar from '../components/BookmarksToolbar.svelte';
  import { onMount, onDestroy } from 'svelte';
  import Tabs, { type TabItem } from '../components/Tabs.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../components/uikit-v2/UiV2PopupMenu.svelte';
  import { navigate } from '../stores/navigation';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { getSearchParams } from '../router';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import { getBookmarksSort, setBookmarksSort } from '../constants/bookmarkSort';
  import type { ReleaseCardData } from '../types/release';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import { extractHistoryEpisodeInfo } from '../utils/historyFormat';
  import { iconHome, iconSearch, iconX } from '../components/icons';
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

  function tabUsesSort(tabId: TabId): boolean {
    return tabId === 'favorites'
      || tabId === 'watching'
      || tabId === 'planned'
      || tabId === 'completed'
      || tabId === 'on_hold'
      || tabId === 'dropped';
  }

  function snapshotMatchesCurrentSort(s: BookmarksViewState): boolean {
    if (!tabUsesSort(s.activeTab)) return true;
    return s.selectedSort === getBookmarksSort();
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
    selectedSort = tabUsesSort(s.activeTab) ? getBookmarksSort() : s.selectedSort;
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
    const releaseRaw =
      raw.release && typeof raw.release === 'object'
        ? (raw.release as Record<string, unknown>)
        : raw;
    const voteRaw =
      typeof raw.my_vote === 'number'
        ? raw.my_vote
        : typeof raw.vote === 'number'
          ? raw.vote
          : typeof releaseRaw.my_vote === 'number'
            ? releaseRaw.my_vote
            : undefined;
    const myVote = typeof voteRaw === 'number' && voteRaw > 0 ? voteRaw : undefined;
    return {
      ...mapReleaseRawToCard(releaseRaw),
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
    if (typeof data?.total === 'number') return data.total as number;
    return fallback;
  }

  function releaseRawHaystack(raw: Record<string, unknown>): string {
    const release =
      raw.release && typeof raw.release === 'object'
        ? (raw.release as Record<string, unknown>)
        : raw;
    return [
      release.title_ru,
      release.title_original,
      release.title_alt,
      release.title,
      release.titleRu,
      release.titleEn,
      raw.title,
      raw.name,
    ]
      .filter((v) => typeof v === 'string' && v.trim())
      .join(' ')
      .toLowerCase();
  }

  function matchesSearchQuery(raw: Record<string, unknown>, q: string): boolean {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return releaseRawHaystack(raw).includes(needle);
  }

  type FetchPageResult = {
    content: Record<string, unknown>[];
    total: number;
    /** Все совпадения уже собраны — больше страниц нет */
    exhaustive?: boolean;
  };

  /** Обход всех страниц источника и фильтр по query (поиск по всему списку). */
  async function scanAllPagesForQuery(
    q: string,
    fetchSourcePage: (page: number) => Promise<{ content: Record<string, unknown>[]; total: number }>,
    pageSizeHint = 20,
  ): Promise<FetchPageResult> {
    const matches: Record<string, unknown>[] = [];
    const needle = q.trim().toLowerCase();
    let sourceTotal = 0;
    const maxPages = 300;

    for (let page = 0; page < maxPages; page++) {
      const { content, total } = await fetchSourcePage(page);
      if (total > 0) sourceTotal = total;
      if (!content.length) break;
      for (const raw of content) {
        if (matchesSearchQuery(raw, needle)) matches.push(raw);
      }
      if (content.length < pageSizeHint) break;
      if (sourceTotal > 0 && (page + 1) * pageSizeHint >= sourceTotal) break;
    }

    return { content: matches, total: matches.length, exhaustive: true };
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
  let selectedSort = $state(getBookmarksSort());
  let randomLoading = $state(false);
  let wrapEl: HTMLElement | undefined = $state();
  let unregisterScrollKey: (() => void) | null = null;
  let defaultBookmarksTab = $state(getDefaultBookmarksTab());
  let tabMenuOpen = $state(false);
  let tabMenuX = $state(0);
  let tabMenuY = $state(0);
  let tabMenuPlacement = $state<'point' | 'anchor'>('point');
  let tabMenuKind = $state<'context' | 'default-picker' | null>(null);
  let tabMenuTabId = $state<TabId | null>(null);
  let profileLogin = $state('');
  let profileAvatar = $state('');
  let searchInput = $state('');
  let searchQuery = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const tabMenuItems = $derived.by((): UiV2PopupMenuItem[] => {
    if (tabMenuKind === 'default-picker') {
      return SELF_TABS.map((tab) => ({
        id: `bookmark-default-${tab.id}`,
        label: tab.label,
        type: 'radio' as const,
        checked: defaultBookmarksTab === tab.id,
        keepOpen: true,
      }));
    }

    if (tabMenuKind === 'context' && tabMenuTabId) {
      return [{ id: 'set-default', label: 'Назначить по умолчанию', icon: iconHome(18) }];
    }

    return [];
  });

  function closeTabMenu() {
    tabMenuOpen = false;
    tabMenuKind = null;
    tabMenuTabId = null;
  }

  function handleTabMenuSelect(id: string) {
    if (id.startsWith('bookmark-default-')) return;

    if (id === 'set-default' && tabMenuTabId) {
      defaultBookmarksTab = setDefaultBookmarksTab(tabMenuTabId);
    }
    closeTabMenu();
  }

  function handleTabMenuCheckedChange(id: string, checked: boolean) {
    if (!checked || !id.startsWith('bookmark-default-')) return;
    defaultBookmarksTab = setDefaultBookmarksTab(id.slice('bookmark-default-'.length));
  }
  let selfProfileId = $state<number | null>(null);

  const isCollectionsTab = $derived(activeTab === 'collections');
  const isHistoryTab = $derived(activeTab === 'history');
  const isVotesTab = $derived(activeTab === 'votes');
  const isFavoritesTab = $derived(activeTab === 'favorites');
  const isReleaseListTab = $derived(!isCollectionsTab && !isHistoryTab && !isVotesTab);
  const activeTabMeta = $derived(TABS.find((t) => t.id === activeTab) ?? TABS[0]);
  const searchPlaceholder = $derived(`Поиск в «${activeTabMeta?.label ?? 'списке'}»`);
  const headerAvatarUrl = $derived(profileAvatar ? resolveCdnAssetUrl(profileAvatar) : '');
  const profileIdForPanel = $derived(
    isOtherProfile
      ? listUserId!
      : (cachedProfileId ?? selfProfileId ?? 0),
  );

  function clearSearchTimer() {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
  }

  function applySearchQuery(next: string, reload = true) {
    const normalized = next.trim();
    if (normalized === searchQuery) return;
    searchQuery = normalized;
    if (reload) void loadTab(activeTab, false, true);
  }

  function onSearchInput(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    searchInput = value;
    clearSearchTimer();
    searchTimer = setTimeout(() => {
      searchTimer = null;
      applySearchQuery(value, true);
    }, 320);
  }

  function clearSearch() {
    clearSearchTimer();
    searchInput = '';
    if (searchQuery) {
      searchQuery = '';
      void loadTab(activeTab, false, true);
    }
  }

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

  async function fetchPage(page: number): Promise<FetchPageResult> {
    if (!window.anixApi) return { content: [], total: 0, exhaustive: true };

    const q = searchQuery.trim();
    const api = window.anixApi;

    if (activeTab === 'collections') {
      if (q) {
        if (page > 0) return { content: [], total: 0, exhaustive: true };
        return scanAllPagesForQuery(q, async (p) => {
          const data = await api.collection.favorites(p) as Record<string, unknown>;
          const content = (data?.content ?? []) as Record<string, unknown>[];
          return { content, total: extractTotalCount(data, content.length) };
        });
      }
      const data = await api.collection.favorites(page) as Record<string, unknown>;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      return { content, total: extractTotalCount(data, content.length) };
    }

    if (activeTab === 'history') {
      if (q) {
        if (page > 0) return { content: [], total: 0, exhaustive: true };
        return scanAllPagesForQuery(q, async (p) => {
          const data = await api.history.all(p) as Record<string, unknown>;
          const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
          return { content, total: extractTotalCount(data, content.length) };
        });
      }
      const data = await api.history.all(page) as Record<string, unknown>;
      const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
      return { content, total: extractTotalCount(data, content.length) };
    }

    if (activeTab === 'votes') {
      const profileId = await ensureProfileId();
      if (typeof profileId !== 'number') return { content: [], total: 0, exhaustive: true };
      if (q) {
        if (page > 0) return { content: [], total: 0, exhaustive: true };
        return scanAllPagesForQuery(
          q,
          async (p) => {
            const data = await api.profile.getVotedReleases(profileId, p, 1) as Record<string, unknown>;
            const content = (data?.content ?? []) as Record<string, unknown>[];
            return { content, total: extractTotalCount(data, content.length) };
          },
          25,
        );
      }
      const data = await api.profile.getVotedReleases(profileId, page, 1) as Record<string, unknown>;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      return { content, total: extractTotalCount(data, content.length) };
    }

    if (activeTab === 'favorites') {
      if (q) {
        if (page > 0) return { content: [], total: 0, exhaustive: true };
        return scanAllPagesForQuery(q, async (p) => {
          const data = await api.favorites.all(p, selectedSort, 0, 0) as Record<string, unknown>;
          const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
          return { content, total: extractTotalCount(data, content.length) };
        });
      }
      const data = await api.favorites.all(page, selectedSort, 0, 0) as Record<string, unknown>;
      const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
      return { content, total: extractTotalCount(data, content.length) };
    }

    const tab = TABS.find((t) => t.id === activeTab)!;
    const profileId = await ensureProfileId();
    if (typeof profileId !== 'number' || tab.type == null) {
      return { content: [], total: 0, exhaustive: true };
    }

    // Свои статусные списки — серверный поиск по всему списку
    if (q && !isOtherProfile && typeof api.search?.profileList === 'function') {
      try {
        const data = await api.search.profileList(tab.type, q, page, 0) as Record<string, unknown>;
        const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
        return { content, total: extractTotalCount(data, content.length) };
      } catch {
        /* fallback ниже */
      }
    }

    // Поиск: обходим все страницы списка, а не только загруженные
    if (q) {
      if (page > 0) return { content: [], total: 0, exhaustive: true };
      return scanAllPagesForQuery(q, async (p) => {
        const data = await api.profile.getBookmarks(
          profileId,
          tab.type!,
          p,
          selectedSort,
          0,
          0,
        ) as Record<string, unknown>;
        const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
        return { content, total: extractTotalCount(data, content.length) };
      });
    }

    const data = await api.profile.getBookmarks(
      profileId,
      tab.type,
      page,
      selectedSort,
      0,
      0,
    ) as Record<string, unknown>;
    const content = (data?.content ?? data?.releases ?? []) as Record<string, unknown>[];
    return { content, total: extractTotalCount(data, content.length) };
  }

  async function loadMore() {
    if (!window.anixApi || !hasMore || isLoadingMore) return;
    isLoadingMore = true;

    try {
      const { content, total, exhaustive } = await fetchPage(nextPage);
      if (isCollectionsTab) {
        collectionItems = [...collectionItems, ...content.map(mapCollectionToCardData)];
      } else if (isHistoryTab) {
        items = [...items, ...content.map(mapHistoryToReleaseCard)];
      } else {
        items = [...items, ...content.map(mapReleaseToCardData)];
      }
      if (typeof total === 'number' && total > 0) totalCount = total;
      hasMore = exhaustive
        ? false
        : isVotesTab
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

    if (!force) {
      clearSearchTimer();
      searchInput = '';
      searchQuery = '';
    }

    if (!resetSort && !force) {
      const cached = getViewState<BookmarksViewState>(BOOKMARKS_VIEW_KEY());
      if (
        cached?.data
        && hasBookmarkItems(cached.data)
        && cached.data.activeTab === tabId
        && snapshotMatchesCurrentSort(cached.data)
      ) {
        applyBookmarksSnapshot(cached.data);
        restoreBookmarksScroll(cached.scrollTop);
        return;
      }
    }

    if (force) invalidateViewStatePrefix(listsBasePath());
    if (tabUsesSort(tabId)) selectedSort = getBookmarksSort();
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
      const { content, total, exhaustive } = await fetchPage(0);
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
      hasMore = exhaustive
        ? false
        : isVotesTab
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

  function applyListChangeToCurrentTab(releaseId: number, statusId: string | null) {
    const belongsHere = isReleaseListTab && statusId === activeTab;
    if (belongsHere) {
      items = items.map((item) => (
        item.id === releaseId ? { ...item, listStatus: statusId as ReleaseCardData['listStatus'] } : item
      ));
    } else {
      const next = items.filter((item) => item.id !== releaseId);
      if (next.length === items.length) return;
      items = next;
      totalCount = Math.max(0, totalCount - 1);
      if (!items.length) loadState = 'empty';
    }
    saveViewStateData(BOOKMARKS_VIEW_KEY(), bookmarksSnapshot());
  }

  function onBookmarksChanged(e: Event) {
    if (isOtherProfile) return;
    const detail = (e as CustomEvent<{
      kind?: 'favorites' | 'list' | 'collections';
      releaseId?: number;
      statusId?: number | string | null;
    }>).detail ?? {};

    if (detail.kind === 'list' && typeof detail.releaseId === 'number') {
      const statusId = typeof detail.statusId === 'string' ? detail.statusId : null;
      applyListChangeToCurrentTab(detail.releaseId, statusId);
      return;
    }

    void loadTab(activeTab, false, true);
  }

  function onSortChange(sort: number) {
    if (sort === selectedSort) return;
    selectedSort = setBookmarksSort(sort);
    void loadTab(activeTab, false, true);
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
    tryLoadMoreIfNeeded();
  }

  function handleTabsSettingsClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    tabMenuKind = 'default-picker';
    tabMenuTabId = null;
    tabMenuX = (rect.left + rect.right) / 2;
    tabMenuY = (rect.top + rect.bottom) / 2;
    tabMenuPlacement = 'anchor';
    tabMenuOpen = true;
  }

  function handleTabContextMenu(tab: TabItem, e: MouseEvent) {
    if (isOtherProfile) return;
    tabMenuKind = 'context';
    tabMenuTabId = tab.id as TabId;
    tabMenuX = e.clientX;
    tabMenuY = e.clientY;
    tabMenuPlacement = 'point';
    tabMenuOpen = true;
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

    if (!hasExplicitTab && !isListsPage && cached?.data && hasBookmarkItems(cached.data) && snapshotMatchesCurrentSort(cached.data)) {
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
    clearSearchTimer();
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
        {#if (isVotesTab || isFavoritesTab || isHistoryTab || isCollectionsTab) && loadState === 'ready' && totalCount > 0}
          <span class="bookmarks-toolbar__count" title="Всего в списке">{totalCount}</span>
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

  <label class="bookmarks__search">
    <span class="bookmarks__search-icon" aria-hidden="true">{@html iconSearch(18)}</span>
    <input
      class="bookmarks__search-input"
      type="search"
      enterkeyhint="search"
      autocomplete="off"
      spellcheck="false"
      placeholder={searchPlaceholder}
      value={searchInput}
      oninput={onSearchInput}
      aria-label={searchPlaceholder}
    />
    {#if searchInput}
      <button
        type="button"
        class="bookmarks__search-clear"
        aria-label="Очистить поиск"
        onclick={clearSearch}
      >
        {@html iconX(14)}
      </button>
    {/if}
  </label>

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
        {#if isCollectionsTab}
          <div class="bookmarks__collections">
            <UiV2CollectionCardSkeleton count={6} />
          </div>
        {:else}
          <ReleaseCardsGridSkeleton />
        {/if}
      {:else if loadState === 'error'}
        <p class="bookmarks__error">{errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="bookmarks__empty">{searchQuery ? 'Ничего не найдено.' : 'Здесь пока ничего нет.'}</p>
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
      {#if isCollectionsTab}
        <div class="bookmarks__collections">
          <UiV2CollectionCardSkeleton count={2} />
        </div>
      {:else}
        <ReleaseCardsGridSkeleton count={4} />
      {/if}
    {/if}
  </div>
</div>

<UiV2PopupMenu
  open={tabMenuOpen}
  x={tabMenuX}
  y={tabMenuY}
  placement={tabMenuPlacement}
  items={tabMenuItems}
  onClose={closeTabMenu}
  onSelect={handleTabMenuSelect}
  onCheckedChange={handleTabMenuCheckedChange}
/>
