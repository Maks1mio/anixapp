<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2Select, { type UiV2SelectOption } from '../components/uikit-v2/UiV2Select.svelte';
  import FeedArticleCard from '../components/feed/FeedArticleCard.svelte';
  import UiV2FeedPostSkeleton from '../components/uikit-v2/UiV2FeedPostSkeleton.svelte';
  import { get } from 'svelte/store';
  import { isAuthenticated, authReady, requireAuth } from '../stores/auth';
  import { feedArticleFocusId, feedChannelFocusId, takeFeedArticleFocus, takeFeedChannelFocus } from '../stores/feed-focus';
  import { showToast } from '../stores/toast';
  import {
    beginScrollRestore,
    buildViewStateKey,
    getViewState,
    logViewStateMiss,
    logViewStateRestore,
    readScrollTop,
    registerActiveScrollKey,
    resetScrollTop,
    restoreScrollTop,
    saveViewStateData,
    saveViewStateWithScroll,
  } from '../stores/view-state';
  import {
    FEED_DATE_OPTIONS,
    type FeedArticle,
    type FeedChannel,
    type FeedDateFilter,
  } from '../types/feed';
  import {
    applyArticleVote,
    channelAvatarUrl,
    channelSubscriberCount,
    formatFeedRelativeTime,
    normalizeArticleVote,
  } from '../utils/feed-article';
  import { getSearchParams } from '../router';
  import {
    channelHasNewArticles,
    markChannelArticlesSeen,
    normalizeLastArticleDate,
  } from '../utils/channel-last-seen';
  import { sortSubscriptionsSmart } from '../utils/subscription-order';
  import {
    getSubscriptionPins,
    toggleSubscriptionPin,
  } from '../utils/subscription-pins';
  import {
    getFeedBrowseHistory,
    pushFeedBrowseChannel,
    pushFeedBrowsePost,
    type FeedBrowseHistoryItem,
  } from '../utils/feed-browse-history';
  import UiV2FeedRecommended from '../components/uikit-v2/UiV2FeedRecommended.svelte';
  import FeedComposePrompt from '../components/feed/FeedComposePrompt.svelte';
  import FeedArticleComposer from '../components/feed/FeedArticleComposer.svelte';
  import FeedSuggestionsNav from '../components/feed/FeedSuggestionsNav.svelte';
  import FeedSuggestionsModal from '../components/feed/FeedSuggestionsModal.svelte';
  import { openFeedComposerWindow, resolveFeedArticleForEdit } from '../utils/feed-composer-open';
  import {
    deleteFeedDraft,
    formatDraftTime,
    getFeedDraft,
    loadFeedDrafts,
    type FeedArticleDraft,
  } from '../utils/feed-article-drafts';
  import FeedSubsStrip from '../components/feed/FeedSubsStrip.svelte';
  import FeedHistoryMoment from '../components/feed/FeedHistoryMoment.svelte';
  import FeedChannelPanel from '../components/feed/FeedChannelPanel.svelte';
  import FeedDirectoryModal from '../components/feed/FeedDirectoryModal.svelte';
  import { openProfilePanel } from '../stores/profile-panel';
  import {
    iconArrowLeft,
    iconClock,
    iconClipboardList,
    iconFlame,
    iconNewspaper,
    iconPencil,
    iconPlus,
    iconPopular,
    iconRefreshCw,
    iconSearch,
    iconUsers,
    iconX,
  } from '../components/icons';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';

  type FeedTab = 'my' | 'latest' | 'managed' | 'history' | 'drafts' | 'search';
  type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'need-auth';

  type FeedPostViewSnapshot = {
    article: FeedArticle;
    channel: FeedChannel | null;
    moreArticles: FeedArticle[];
    morePage: number;
    moreHasMore: boolean;
    selectedArticleId: number | null;
    listScrollBeforePost: number;
  };

  type FeedListSnapshot = {
    tab: FeedTab;
    dateFilter: FeedDateFilter;
    channelFilterId: number | null;
    articles: FeedArticle[];
    page: number;
    hasMore: boolean;
    loadState: LoadState;
    errorMsg: string;
    managed: EditorChannel[];
    /** Открытый пост — восстановить при возврате на /feed. */
    postView?: FeedPostViewSnapshot | null;
  };

  const FEED_HISTORY_POST_KEY = 'anixFeedPostId';

  function FEED_VIEW_KEY() {
    return buildViewStateKey('/feed');
  }

  interface EditorChannel {
    id: number;
    title: string;
    avatar?: string | null;
    subscriber_count?: number;
    is_blog?: boolean;
  }

  let tab = $state<FeedTab>('my');
  let dateFilter = $state<FeedDateFilter>(0);
  let channelFilterId = $state<number | null>(null);
  let subscriptions = $state<FeedChannel[]>([]);
  let articles = $state<FeedArticle[]>([]);
  let page = $state(0);
  let hasMore = $state(false);
  let loadState = $state<LoadState>('idle');
  let loadingMore = $state(false);
  let errorMsg = $state('');
  let authed = $state(false);
  let managed = $state<EditorChannel[]>([]);
  let managedBusy = $state(false);
  let createBusy = $state(false);
  let composerOpen = $state(false);
  let composerChannelId = $state<number | null>(null);
  let composerRepost = $state<FeedArticle | null>(null);
  let composerEdit = $state<FeedArticle | null>(null);
  let composerDraftId = $state<string | null>(null);
  let composerDraft = $state<FeedArticleDraft | null>(null);
  let composerIsSuggestion = $state(false);
  let drafts = $state<FeedArticleDraft[]>([]);
  let selfAvatarUrl = $state('');
  let sidebarChannel = $state<FeedChannel | null>(null);
  let sidebarSuggestionCount = $state(0);
  let suggestionsModalOpen = $state(false);
  let searchQuery = $state('');
  let listFilterQuery = $state('');
  let searchInputEl = $state<HTMLInputElement | null>(null);
  let searchArticles = $state<FeedArticle[]>([]);
  let searchChannels = $state<FeedChannel[]>([]);
  let searchBlogs = $state<FeedChannel[]>([]);
  let searchTags = $state<string[]>([]);
  let searchPage = $state(0);
  let searchHasMore = $state(false);
  let searchBusy = $state(false);
  let searchLoadState = $state<LoadState>('idle');
  let searchError = $state('');
  let searchRequestId = 0;
  /** Инкремент после mark-seen — чтобы точки обновились. */
  let lastSeenTick = $state(0);
  /** Инкремент после pin/unpin. */
  let pinTick = $state(0);
  /** Инкремент после записи в историю сайдбара. */
  let historyTick = $state(0);
  let historyVisibleCount = $state(10);
  /** Модалка всех подписок. */
  let allSubsOpen = $state(false);
  let historyArticles = $state<Record<number, FeedArticle>>({});
  let historyArticleBusy = $state<Record<number, boolean>>({});
  let subscribeBusyId = $state<number | null>(null);
  let selectedArticleId = $state<number | null>(null);
  let focusArticle = $state<FeedArticle | null>(null);
  let focusChannel = $state<FeedChannel | null>(null);
  let moreArticles = $state<FeedArticle[]>([]);
  let moreBusy = $state(false);
  let morePage = $state(0);
  let moreHasMore = $state(false);
  let spotlightArticle = $state<FeedArticle | null>(null);
  let moreRequestId = 0;
  /** Скролл ленты до открытия поста — восстанавливаем по «назад». */
  let listScrollBeforePost = 0;
  let postViewHistoryPushed = false;
  let unregisterScrollKey: (() => void) | null = null;

  function feedListSnapshot(): FeedListSnapshot {
    const postView: FeedPostViewSnapshot | null =
      focusArticle && focusChannel
        ? {
            article: focusArticle,
            channel: focusChannel,
            moreArticles,
            morePage,
            moreHasMore,
            selectedArticleId,
            listScrollBeforePost,
          }
        : null;
    return {
      tab,
      dateFilter,
      channelFilterId,
      articles,
      page,
      hasMore,
      loadState,
      errorMsg,
      managed,
      postView,
    };
  }

  function isFeedTab(value: unknown): value is FeedTab {
    return (
      value === 'my'
      || value === 'latest'
      || value === 'managed'
      || value === 'history'
      || value === 'drafts'
      || value === 'search'
    );
  }

  function historyMomentMs(at: number): number {
    return at > 1e12 ? at : at * 1000;
  }

  function historyDayKey(at: number): string {
    const d = new Date(historyMomentMs(at));
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function historyDayLabel(at: number): string {
    const d = new Date(historyMomentMs(at));
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startToday - startThat) / 86_400_000);
    if (diffDays === 0) return 'Сегодня';
    if (diffDays === 1) return 'Вчера';
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  function applyFeedListSnapshot(s: FeedListSnapshot) {
    tab = isFeedTab(s.tab) ? s.tab : 'latest';
    dateFilter = s.dateFilter;
    channelFilterId = s.channelFilterId;
    articles = s.articles;
    page = s.page;
    hasMore = s.hasMore;
    loadState = s.loadState;
    errorMsg = s.errorMsg;
    managed = s.managed;
  }

  /** Восстановить открытый пост без нового pushState (возврат на /feed). */
  function restorePostViewFromSnapshot(post: FeedPostViewSnapshot) {
    focusArticle = post.article;
    focusChannel = post.channel;
    moreArticles = post.moreArticles ?? [];
    morePage = post.morePage ?? 0;
    moreHasMore = !!post.moreHasMore;
    selectedArticleId = post.selectedArticleId ?? post.article.id;
    listScrollBeforePost = post.listScrollBeforePost ?? 0;
    spotlightArticle = null;
    moreBusy = false;
    const prev = history.state && typeof history.state === 'object'
      ? (history.state as Record<string, unknown>)
      : {};
    history.replaceState({ ...prev, [FEED_HISTORY_POST_KEY]: post.article.id }, '');
    postViewHistoryPushed = true;
  }

  function historyHasFeedPost(): boolean {
    const st = history.state;
    return !!st && typeof st === 'object' && FEED_HISTORY_POST_KEY in st;
  }

  function stripFeedPostHistoryState() {
    if (!historyHasFeedPost()) return;
    const st = { ...(history.state as Record<string, unknown>) };
    delete st[FEED_HISTORY_POST_KEY];
    history.replaceState(Object.keys(st).length ? st : null, '');
    postViewHistoryPushed = false;
  }

  function scrollFeedToTop() {
    resetScrollTop();
  }

  const popularIconHtml = `<span class="feed-popular-icon">${iconPopular(20)}</span>`;
  const dateOptions = $derived.by((): UiV2SelectOption[] =>
    FEED_DATE_OPTIONS.map((o) => ({
      value: String(o.id),
      label: o.label,
      icon: o.popular ? popularIconHtml : undefined,
    })),
  );
  const dateFilterAria = $derived.by(() => {
    const opt = FEED_DATE_OPTIONS.find((o) => o.id === dateFilter);
    if (!opt || !opt.popular) return 'Сортировка: последнее';
    return `Сортировка: популярно за ${opt.label.toLowerCase()}`;
  });

  const asideChannel = $derived(
    sidebarChannel
    ?? (channelFilterId != null
      ? (subscriptions.find((c) => c.id === channelFilterId) ?? null)
      : null),
  );

  /** Просмотр поста: выбранная запись + остальные посты канала/блога ниже. */
  const postViewActive = $derived(!!focusArticle && !!focusChannel);
  const moreFromTitle = $derived(
    focusChannel?.is_blog ? 'Ещё от пользователя' : 'Ещё от сообщества',
  );

  const mainTitle = $derived(
    postViewActive
      ? (focusChannel?.title?.trim()
        || (focusChannel?.is_blog ? 'Блог' : 'Канал'))
      : tab === 'search'
        ? 'Поиск'
        : tab === 'my'
          ? (channelFilterId != null
            ? (asideChannel?.title ?? subscriptions.find((c) => c.id === channelFilterId)?.title ?? 'Канал')
            : 'Моя лента')
          : tab === 'latest'
            ? 'Свежее'
          : tab === 'history'
            ? 'История'
            : tab === 'drafts'
              ? 'Черновики'
              : 'Управляемые каналы',
  );

  const searchNeedle = $derived(searchQuery.trim().toLowerCase());
  const listFilterNeedle = $derived(listFilterQuery.trim().toLowerCase());
  /** Вкладка «Поиск» — API-поиск; на managed/history — локальный фильтр. */
  const searchMode = $derived(tab === 'search');
  const showDateFilter = $derived(
    tab === 'my' && !searchMode && !postViewActive,
  );

  const groupAsideChannel = $derived.by((): FeedChannel | null => {
    if (searchMode) return null;
    if (postViewActive && focusChannel && !focusChannel.is_blog) return focusChannel;
    if (
      tab === 'my'
      && !postViewActive
      && channelFilterId != null
      && asideChannel
      && !asideChannel.is_blog
    ) {
      return asideChannel;
    }
    return null;
  });
  const showGroupAside = $derived(groupAsideChannel != null);
  const hidePostSubscribe = $derived(showGroupAside);

  function pageableContent(raw: unknown): unknown[] {
    if (!raw || typeof raw !== 'object') return [];
    const content = (raw as { content?: unknown }).content;
    return Array.isArray(content) ? content : [];
  }

  function pageableTotalPages(raw: unknown): number {
    if (!raw || typeof raw !== 'object') return 0;
    return Number((raw as { total_page_count?: number }).total_page_count ?? 0);
  }

  function normalizeTags(raw: unknown): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of pageableContent(raw)) {
      const tag = String(item ?? '').replace(/^#/, '').trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
    }
    return out;
  }

  async function fetchSearch(query: string, nextPage: number, append: boolean): Promise<void> {
    const api = window.anixApi?.search?.feed;
    if (!api) {
      searchLoadState = 'error';
      searchError = 'API недоступно';
      return;
    }

    const requestId = ++searchRequestId;
    if (append) searchBusy = true;
    else {
      searchLoadState = 'loading';
      searchError = '';
    }

    try {
      const res = await api(query, nextPage, 0);
      if (requestId !== searchRequestId) return;
      const list = withLocalSubscribeFlags(normalizeArticles(pageableContent(res?.articles)));
      searchArticles = append ? [...searchArticles, ...list] : list;
      searchChannels = nextPage === 0 ? normalizeChannels(pageableContent(res?.channels)) : searchChannels;
      searchBlogs = nextPage === 0 ? normalizeChannels(pageableContent(res?.blogs)) : searchBlogs;
      searchTags = nextPage === 0 ? normalizeTags(res?.tags) : searchTags;
      searchPage = nextPage;
      const totalPages = pageableTotalPages(res?.articles);
      searchHasMore = totalPages > 0 ? nextPage + 1 < totalPages : list.length >= 10;
      const empty =
        searchArticles.length === 0
        && searchChannels.length === 0
        && searchBlogs.length === 0
        && searchTags.length === 0;
      searchLoadState = empty ? 'empty' : 'ready';
    } catch (err) {
      if (requestId !== searchRequestId) return;
      searchError = String(err);
      if (!append) {
        searchArticles = [];
        searchChannels = [];
        searchBlogs = [];
        searchTags = [];
        searchLoadState = 'error';
      }
    } finally {
      if (requestId === searchRequestId) searchBusy = false;
    }
  }

  function clearSearchResults() {
    searchRequestId += 1;
    searchArticles = [];
    searchChannels = [];
    searchBlogs = [];
    searchTags = [];
    searchPage = 0;
    searchHasMore = false;
    searchBusy = false;
    searchLoadState = 'idle';
    searchError = '';
  }

  const visibleArticles = $derived.by(() => {
    const base = searchMode ? searchArticles : articles;
    if (spotlightArticle && !base.some((a) => a.id === spotlightArticle!.id)) {
      return [spotlightArticle, ...base];
    }
    return base;
  });
  const visibleManaged = $derived(
    listFilterNeedle
      ? managed.filter((ch) => (ch.title || '').toLowerCase().includes(listFilterNeedle))
      : managed,
  );
  const visibleDrafts = $derived(
    listFilterNeedle
      ? drafts.filter((d) => {
          const hay = `${d.preview} ${d.channelId ?? ''}`.toLowerCase();
          return hay.includes(listFilterNeedle);
        })
      : drafts,
  );

  function draftDestinationTitle(draft: FeedArticleDraft): string {
    if (draft.channelId == null) return 'Канал не выбран';
    const ch = managed.find((c) => c.id === draft.channelId)
      ?? subscriptions.find((c) => c.id === draft.channelId);
    if (ch) return `${ch.is_blog ? 'Блог' : 'Канал'} · ${ch.title}`;
    return `Канал #${draft.channelId}`;
  }

  function normalizeArticles(raw: unknown): FeedArticle[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        const a = item as FeedArticle;
        if (!a || typeof a !== 'object' || !(Number(a.id) > 0)) return null;
        if (!a.channel || typeof a.channel !== 'object') return a;
        return {
          ...a,
          channel: {
            ...a.channel,
            subscriber_count: channelSubscriberCount(a.channel),
          },
        };
      })
      .filter((a): a is FeedArticle => a != null);
  }

  function normalizeChannels(raw: unknown): FeedChannel[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        const c = item as FeedChannel & { lastArticleDate?: unknown };
        if (!c || typeof c !== 'object' || !(Number(c.id) > 0)) return null;
        return {
          ...c,
          is_subscribed: c.is_subscribed !== false,
          subscriber_count: channelSubscriberCount(c),
          last_article_date: normalizeLastArticleDate(
            c.last_article_date ?? c.lastArticleDate,
          ),
        };
      })
      .filter((c): c is FeedChannel => c != null);
  }

  function subscriptionIsFresh(ch: FeedChannel): boolean {
    void lastSeenTick;
    return channelHasNewArticles(ch.id, ch.last_article_date);
  }

  /** Непрочитанные с пином, непрочитанные, пины, остальные. */
  const displaySubscriptions = $derived.by(() => {
    void lastSeenTick;
    void pinTick;
    const pins = getSubscriptionPins();
    return sortSubscriptionsSmart(
      subscriptions,
      (ch) => channelHasNewArticles(ch.id, ch.last_article_date),
      pins,
    );
  });

  function isLocalSubscription(channelId: number): boolean {
    return subscriptions.some((c) => c.id === channelId);
  }

  const browseHistory = $derived.by(() => {
    void historyTick;
    return getFeedBrowseHistory();
  });

  type SidePreviewAvatar = {
    key: string;
    avatar?: string | null;
    is_blog?: boolean;
    title: string;
    fresh?: boolean;
  };

  const feedNavAvatars = $derived.by((): SidePreviewAvatar[] => {
    void lastSeenTick;
    return displaySubscriptions
      .filter((ch) => channelHasNewArticles(ch.id, ch.last_article_date))
      .slice(0, 3)
      .map((ch) => ({
        key: `sub-${ch.id}`,
        avatar: ch.avatar,
        is_blog: ch.is_blog,
        title: ch.title || `Канал #${ch.id}`,
        fresh: true,
      }));
  });

  const historyNavAvatars = $derived.by((): SidePreviewAvatar[] => {
    const seen = new Set<string>();
    const out: SidePreviewAvatar[] = [];
    for (const item of browseHistory) {
      const key =
        item.kind === 'channel'
          ? `ch-${item.id}`
          : item.channelId
            ? `ch-${item.channelId}`
            : `post-${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        avatar: item.avatar,
        is_blog: item.is_blog,
        title: item.title,
      });
      if (out.length >= 3) break;
    }
    return out;
  });

  const historyItems = $derived.by(() => {
    const q = listFilterNeedle;
    const list = q
      ? browseHistory.filter((item) => item.title.toLowerCase().includes(q))
      : browseHistory;
    return [...list].sort((a, b) => (b.at || 0) - (a.at || 0));
  });

  const shownHistory = $derived(historyItems.slice(0, historyVisibleCount));
  const historyHasMore = $derived(historyItems.length > historyVisibleCount);
  const historyGroups = $derived.by(() => {
    const groups: { key: string; label: string; items: FeedBrowseHistoryItem[] }[] = [];
    for (const item of shownHistory) {
      const key = historyDayKey(item.at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(item);
      } else {
        groups.push({ key, label: historyDayLabel(item.at), items: [item] });
      }
    }
    return groups;
  });

  const pinnedIdSet = $derived.by(() => {
    void pinTick;
    return new Set(getSubscriptionPins());
  });

  const canWriteChannel = $derived(
    channelFilterId != null && (
      managed.some((c) => c.id === channelFilterId)
      || !!asideChannel?.is_administrator_or_higher
    ),
  );

  const canSuggestChannel = $derived.by(() => {
    if (channelFilterId == null || !asideChannel || asideChannel.is_blog) return false;
    if (canWriteChannel) return false;
    return !!asideChannel.is_article_suggestion_enabled;
  });

  const showChannelSuggestUi = $derived(
    tab === 'my'
    && channelFilterId != null
    && !postViewActive
    && !searchMode
    && asideChannel != null
    && !asideChannel.is_blog
    && (canWriteChannel || canSuggestChannel),
  );

  const composePromptPlaceholder = $derived(
    canSuggestChannel
      ? 'Предложите запись…'
      : canWriteChannel
        ? 'Добавить запись…'
        : 'Расскажите о чём-нибудь…',
  );

  const showComposePrompt = $derived(
    authed
    && !postViewActive
    && !searchMode
    && (
      ((tab === 'my' || tab === 'latest') && channelFilterId == null)
      || (showChannelSuggestUi && (canSuggestChannel || canWriteChannel))
    ),
  );

  const showSuggestionsNav = $derived(
    showChannelSuggestUi
    && sidebarSuggestionCount > 0
    && (canWriteChannel || canSuggestChannel),
  );

  const showFeedSubs = $derived(
    tab === 'my' && !postViewActive && !searchMode,
  );

  const feedSubsItems = $derived.by(() =>
    displaySubscriptions.map((ch) => ({
      id: ch.id,
      title: ch.title || `Канал #${ch.id}`,
      avatar: channelAvatarUrl(ch.avatar),
      isBlog: !!ch.is_blog,
      fresh: subscriptionIsFresh(ch),
      pinned: pinnedIdSet.has(ch.id),
    })),
  );

  const subsLoading = $derived(
    authed && displaySubscriptions.length === 0 && loadState === 'loading',
  );

  const composerChannels = $derived(
    managed.map((ch) => ({
      id: ch.id,
      title: ch.title || (ch.is_blog ? `Блог #${ch.id}` : `Канал #${ch.id}`),
      avatar: ch.avatar,
      is_blog: ch.is_blog,
    })),
  );

  function rememberBrowseChannel(channel: FeedChannel | null | undefined) {
    const id = Number(channel?.id ?? 0);
    if (!(id > 0)) return;
    pushFeedBrowseChannel(channel);
    historyTick += 1;
  }

  function rememberBrowsePost(article: FeedArticle | null | undefined) {
    if (!article?.id) return;
    pushFeedBrowsePost(article);
    historyTick += 1;
  }

  function onHistoryItemClick(item: FeedBrowseHistoryItem) {
    if (item.kind === 'channel') {
      openChannelFeed(item.id);
      return;
    }
    void selectArticleById(item.id);
  }

  async function loadHistoryArticles(ids: number[]): Promise<void> {
    const unique = [...new Set(ids.filter((id) => id > 0))];
    const missing = unique.filter((id) => !historyArticles[id] && !historyArticleBusy[id]);
    if (missing.length === 0) return;
    const nextBusy: Record<number, boolean> = { ...historyArticleBusy };
    for (const id of missing) nextBusy[id] = true;
    historyArticleBusy = nextBusy;

    await Promise.all(missing.map(async (id) => {
      try {
        const res = await window.anixApi?.article?.info?.(id);
        const full = (res?.article ?? null) as FeedArticle | null;
        if (full?.id) {
          historyArticles = { ...historyArticles, [id]: full };
        }
      } catch {
        /* запись могла быть удалена */
      } finally {
        const busy = { ...historyArticleBusy };
        delete busy[id];
        historyArticleBusy = busy;
      }
    }));
  }

  function loadMoreHistory() {
    historyVisibleCount += 10;
  }

  function markSubscriptionSeen(ch: FeedChannel | undefined | null) {
    if (!ch?.id) return;
    markChannelArticlesSeen(ch.id, ch.last_article_date ?? 0);
    lastSeenTick += 1;
  }

  function channelIsSubscribed(channelId: number, flag?: boolean | null): boolean {
    if (!(channelId > 0)) return flag === true;
    if (subscriptions.some((c) => c.id === channelId)) return true;
    return flag === true;
  }

  function mergeChannelSubscribeFlag(ch: FeedChannel): FeedChannel {
    return {
      ...ch,
      is_subscribed: channelIsSubscribed(ch.id, ch.is_subscribed),
    };
  }

  function withLocalSubscribeFlags(list: FeedArticle[]): FeedArticle[] {
    return list.map((a) => {
      const ch = a.channel;
      if (!ch?.id) return a;
      const subscribed = channelIsSubscribed(ch.id, ch.is_subscribed);
      if (subscribed === !!ch.is_subscribed) return a;
      return { ...a, channel: { ...ch, is_subscribed: subscribed } };
    });
  }

  function withFocusChannel(list: FeedArticle[]): FeedArticle[] {
    const ch = focusChannel;
    if (!ch?.id) return list;
    const subscribed = channelIsSubscribed(ch.id, ch.is_subscribed);
    return list.map((a) => ({
      ...a,
      channel: a.channel
        ? {
            ...ch,
            ...a.channel,
            is_subscribed: channelIsSubscribed(a.channel.id, a.channel.is_subscribed ?? subscribed),
          }
        : { ...ch, is_subscribed: subscribed },
    }));
  }

  async function loadFocusChannel(channelId: number, fallback?: FeedChannel | null): Promise<void> {
    if (!(channelId > 0)) {
      focusChannel = fallback ? mergeChannelSubscribeFlag(fallback) : null;
      return;
    }
    focusChannel = fallback?.id === channelId
      ? mergeChannelSubscribeFlag(fallback)
      : focusChannel?.id === channelId
        ? mergeChannelSubscribeFlag(focusChannel)
        : (fallback ? mergeChannelSubscribeFlag(fallback) : null);
    try {
      const res = await window.anixApi?.channel?.info?.(channelId);
      const ch = (res?.channel ?? null) as FeedChannel | null;
      if (ch?.id) focusChannel = mergeChannelSubscribeFlag(ch);
      else if (fallback?.id) focusChannel = mergeChannelSubscribeFlag(fallback);
    } catch {
      if (fallback?.id) focusChannel = mergeChannelSubscribeFlag(fallback);
    }
  }

  async function loadMoreFromChannel(
    channelId: number,
    excludeId: number,
    page = 0,
    append = false,
  ): Promise<void> {
    const req = ++moreRequestId;
    moreBusy = true;
    try {
      const res = await window.anixApi?.channel?.articles?.(channelId, page);
      if (req !== moreRequestId) return;
      const raw = withFocusChannel(
        normalizeArticles(res?.content).filter((a) => a.id !== excludeId),
      );
      const seen = new Set(append ? moreArticles.map((a) => a.id) : []);
      const list = raw.filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
      moreArticles = append ? [...moreArticles, ...list] : list;
      morePage = page;
      const totalPages = Number(res?.total_page_count ?? 0);
      moreHasMore = totalPages > 0 ? page + 1 < totalPages : list.length >= 10;
    } catch {
      if (req !== moreRequestId) return;
      if (!append) moreArticles = [];
      moreHasMore = false;
    } finally {
      if (req === moreRequestId) moreBusy = false;
    }
  }

  function discardPostView() {
    moreRequestId += 1;
    selectedArticleId = null;
    focusArticle = null;
    focusChannel = null;
    moreArticles = [];
    moreBusy = false;
    morePage = 0;
    moreHasMore = false;
    spotlightArticle = null;
    postViewHistoryPushed = false;
  }

  function persistFeedSnapshot() {
    saveViewStateWithScroll(FEED_VIEW_KEY(), feedListSnapshot());
  }

  function restoreListScrollAfterPost() {
    const scroll = listScrollBeforePost;
    void tick().then(() => {
      if (scroll > 0) {
        beginScrollRestore();
        void restoreScrollTop(scroll, { maxWaitMs: 5000 });
      } else {
        scrollFeedToTop();
      }
    });
  }

  /** Выход из поста в ленту с восстановлением позиции (кнопка «назад» / history.back). */
  function exitPostViewToFeed() {
    if (historyHasFeedPost()) {
      history.back();
      return;
    }
    discardPostView();
    persistFeedSnapshot();
    restoreListScrollAfterPost();
  }

  function onFeedPopState() {
    if (!postViewActive) return;
    if (historyHasFeedPost()) return;
    discardPostView();
    persistFeedSnapshot();
    restoreListScrollAfterPost();
  }

  function clearArticleFocus() {
    stripFeedPostHistoryState();
    discardPostView();
    persistFeedSnapshot();
  }

  function collapseSelectedComments() {
    selectedArticleId = null;
  }

  async function selectArticle(article: FeedArticle) {
    const id = Number(article.id);
    if (!(id > 0)) return;

    const entering = !postViewActive;
    const samePost = focusArticle?.id === id;

    if (entering) {
      listScrollBeforePost = readScrollTop();
      saveViewStateWithScroll(FEED_VIEW_KEY(), feedListSnapshot());
      const prev = history.state && typeof history.state === 'object' ? history.state as Record<string, unknown> : {};
      history.pushState({ ...prev, [FEED_HISTORY_POST_KEY]: id }, '');
      postViewHistoryPushed = true;
    } else if (!samePost && historyHasFeedPost()) {
      const prev = history.state && typeof history.state === 'object' ? history.state as Record<string, unknown> : {};
      history.replaceState({ ...prev, [FEED_HISTORY_POST_KEY]: id }, '');
    }

    focusArticle = article;
    selectedArticleId = id;

    const inList =
      articles.some((a) => a.id === id)
      || searchArticles.some((a) => a.id === id);
    spotlightArticle = inList ? null : article;

    const ch = article.channel ?? focusChannel;
    const channelId = Number(ch?.id ?? 0);
    rememberBrowsePost(article);
    if (!samePost) {
      focusChannel = ch;
      moreArticles = [];
      morePage = 0;
      moreHasMore = false;
      if (channelId > 0) {
        void loadFocusChannel(channelId, ch);
        void loadMoreFromChannel(channelId, id, 0, false);
      } else {
        moreBusy = false;
      }
    } else if (channelId > 0 && moreArticles.length === 0 && !moreBusy) {
      void loadMoreFromChannel(channelId, id, 0, false);
    }

    await tick();
    scrollFeedToTop();
  }

  async function selectArticleById(articleId: number) {
    const id = Number(articleId);
    if (!(id > 0)) return;
    const existing =
      focusArticle?.id === id
        ? focusArticle
        : moreArticles.find((a) => a.id === id)
          ?? articles.find((a) => a.id === id)
          ?? searchArticles.find((a) => a.id === id)
          ?? historyArticles[id]
          ?? (spotlightArticle?.id === id ? spotlightArticle : null);
    if (existing) {
      await selectArticle(existing);
      return;
    }
    try {
      const res = await window.anixApi?.article?.info?.(id);
      const full = (res?.article ?? null) as FeedArticle | null;
      if (full?.id) await selectArticle(full);
    } catch {
      /* deep link без записи — игнор */
    }
  }

  function loadMoreFocusChannel() {
    const channelId = Number(focusChannel?.id ?? 0);
    const excludeId = Number(focusArticle?.id ?? 0);
    if (!(channelId > 0) || !moreHasMore || moreBusy) return;
    void loadMoreFromChannel(channelId, excludeId, morePage + 1, true);
  }

  async function loadSidebarChannel(channelId: number | null): Promise<void> {
    if (channelId == null || channelId <= 0) {
      sidebarChannel = null;
      sidebarSuggestionCount = 0;
      suggestionsModalOpen = false;
      return;
    }
    try {
      const res = await window.anixApi?.channel?.info?.(channelId);
      const ch = (res?.channel ?? null) as FeedChannel | null;
      sidebarSuggestionCount = Math.max(0, Number(res?.suggestion_count ?? 0));
      sidebarChannel = ch?.id
        ? mergeChannelSubscribeFlag(ch)
        : (subscriptions.find((c) => c.id === channelId) ?? null);
    } catch {
      sidebarSuggestionCount = 0;
      sidebarChannel = subscriptions.find((c) => c.id === channelId) ?? null;
    }
  }

  async function loadSubscriptions(): Promise<void> {
    if (!authed || !window.anixApi?.channel?.subscriptions) {
      subscriptions = [];
      return;
    }
    try {
      const res = await window.anixApi.channel.subscriptions(0, { sort: 1 });
      subscriptions = normalizeChannels(res?.content);
    } catch {
      subscriptions = [];
    }
  }

  function patchChannelSubscribe(list: FeedChannel[], channelId: number, next: boolean): FeedChannel[] {
    return list.map((ch) => (
      ch.id === channelId ? { ...ch, is_subscribed: next } : ch
    ));
  }

  function patchChannelMuted(channelId: number, muted: boolean) {
    const patchCh = (ch: FeedChannel | null): FeedChannel | null => (
      ch && ch.id === channelId ? { ...ch, is_muted: muted } : ch
    );
    sidebarChannel = patchCh(sidebarChannel);
    if (focusChannel?.id === channelId) {
      focusChannel = { ...focusChannel, is_muted: muted };
    }
    subscriptions = subscriptions.map((ch) => (
      ch.id === channelId ? { ...ch, is_muted: muted } : ch
    ));
    if (muted) {
      articles = articles.filter((a) => a.channel?.id !== channelId);
      searchArticles = searchArticles.filter((a) => a.channel?.id !== channelId);
      moreArticles = moreArticles.filter((a) => a.channel?.id !== channelId);
    }
  }

  async function fetchPage(nextPage: number, append: boolean): Promise<void> {
    if (tab === 'search') {
      const q = searchQuery.trim();
      if (!q) {
        clearSearchResults();
        loadState = 'idle';
        hasMore = false;
        articles = [];
        return;
      }
      await fetchSearch(q, nextPage, append);
      return;
    }

    if (tab === 'history') {
      loadState = historyItems.length === 0 ? 'empty' : 'ready';
      hasMore = false;
      articles = [];
      return;
    }

    if (tab === 'drafts') {
      drafts = loadFeedDrafts();
      loadState = drafts.length === 0 ? 'empty' : 'ready';
      hasMore = false;
      articles = [];
      return;
    }

    const api = window.anixApi?.feed;
    if (!api) {
      loadState = 'error';
      errorMsg = 'API недоступно';
      return;
    }

    if (tab === 'managed') {
      if (!get(authReady)) {
        loadState = 'loading';
        return;
      }
      if (!authed) {
        loadState = 'need-auth';
        managed = [];
        return;
      }
      if (append) return;
      loadState = 'loading';
      errorMsg = '';
      managedBusy = true;
      try {
        const res = await window.anixApi?.channel?.editorAll?.();
        const list = Array.isArray(res?.channels) ? res.channels : [];
        managed = list.filter((c): c is EditorChannel => !!c && Number(c.id) > 0);
        loadState = managed.length === 0 ? 'empty' : 'ready';
      } catch (err) {
        errorMsg = String(err);
        managed = [];
        loadState = 'error';
      } finally {
        managedBusy = false;
      }
      return;
    }

    if (tab === 'my' && channelFilterId == null) {
      if (!get(authReady)) {
        loadState = 'loading';
        return;
      }
      if (!authed) {
        loadState = 'need-auth';
        articles = [];
        hasMore = false;
        return;
      }
    }

    if (append) loadingMore = true;
    else {
      loadState = 'loading';
      errorMsg = '';
    }

    try {
      let res: { content?: unknown; total_page_count?: number } | null | undefined;
      res = tab === 'my'
        ? await api.my(nextPage, {
            date: dateFilter,
            ...(channelFilterId != null ? { channelId: channelFilterId } : {}),
          })
        : await api.latest(nextPage);
      const list = withLocalSubscribeFlags(normalizeArticles(res?.content)).map((a) => (
        channelFilterId != null
          ? {
              ...a,
              channel: a.channel
                ? { ...a.channel, id: a.channel.id || channelFilterId }
                : a.channel,
            }
          : a
      ));
      articles = append ? [...articles, ...list] : list;
      page = nextPage;
      const totalPages = Number(res?.total_page_count ?? 0);
      hasMore = totalPages > 0
        ? nextPage + 1 < totalPages
        : list.length >= 10;
      loadState = articles.length === 0 ? 'empty' : 'ready';
    } catch (err) {
      errorMsg = String(err);
      if (!append) {
        articles = [];
        loadState = 'error';
      }
    } finally {
      loadingMore = false;
    }
  }

  function loadMore() {
    if (searchMode) {
      if (!searchHasMore || searchBusy || searchLoadState === 'loading') return;
      void fetchSearch(searchQuery.trim(), searchPage + 1, true);
      return;
    }
    if (!hasMore || loadingMore || loadState === 'loading') return;
    void fetchPage(page + 1, true);
  }

  async function reload() {
    if (postViewActive && focusChannel?.id && focusArticle?.id) {
      scrollFeedToTop();
      void loadFocusChannel(focusChannel.id, focusChannel);
      void loadMoreFromChannel(focusChannel.id, focusArticle.id, 0, false);
      return;
    }
    if (tab === 'search') {
      scrollFeedToTop();
      const q = searchQuery.trim();
      if (!q) {
        clearSearchResults();
        loadState = 'idle';
        return;
      }
      await fetchSearch(q, 0, false);
      return;
    }
    if (tab === 'history') {
      historyArticles = {};
      historyArticleBusy = {};
      historyVisibleCount = 10;
      scrollFeedToTop();
      loadState = historyItems.length === 0 ? 'empty' : 'ready';
      return;
    }
    if (tab === 'drafts') {
      drafts = loadFeedDrafts();
      scrollFeedToTop();
      loadState = drafts.length === 0 ? 'empty' : 'ready';
      return;
    }
    scrollFeedToTop();
    page = 0;
    await fetchPage(0, false);
  }

  function onTabChange(id: FeedTab) {
    if (id === 'my' && !authed && !requireAuth()) return;
    if (id === 'managed' && !authed && !requireAuth()) return;
    if (allSubsOpen) allSubsOpen = false;
    if (id === tab && !postViewActive && (id !== 'my' || channelFilterId == null)) {
      scrollFeedToTop();
      if (id === 'search') focusSearchInput();
      return;
    }
    clearArticleFocus();
    const leavingSearch = tab === 'search' && id !== 'search';
    tab = id;
    channelFilterId = null;
    if (id === 'history') historyVisibleCount = 10;
    if (leavingSearch) {
      searchQuery = '';
      clearSearchResults();
    }
    if (id !== 'managed' && id !== 'history' && id !== 'drafts') {
      listFilterQuery = '';
    }
    void loadSidebarChannel(null);
    scrollFeedToTop();
    void reload();
    if (id === 'search') {
      void tick().then(() => focusSearchInput());
    }
  }

  function focusSearchInput() {
    searchInputEl?.focus();
  }

  function enterSearchTab() {
    if (tab === 'search') {
      focusSearchInput();
      return;
    }
    clearArticleFocus();
    tab = 'search';
    channelFilterId = null;
    void loadSidebarChannel(null);
    scrollFeedToTop();
    void tick().then(() => focusSearchInput());
  }

  function onDateChange(value: string) {
    const n = Number(value) as FeedDateFilter;
    if (!Number.isFinite(n)) return;
    clearArticleFocus();
    allSubsOpen = false;
    dateFilter = n;
    scrollFeedToTop();
    void reload();
  }

  function openAllSubscriptions() {
    if (!authed && !requireAuth()) return;
    allSubsOpen = true;
  }

  function closeAllSubscriptions() {
    allSubsOpen = false;
  }

  function selectSubscription(channelId: number | null, toggle = true) {
    if (!authed && !requireAuth()) return;
    clearArticleFocus();
    allSubsOpen = false;
    tab = 'my';
    if (channelId == null) {
      channelFilterId = null;
      void loadSidebarChannel(null);
      scrollFeedToTop();
      void reload();
      return;
    }
    const nextId = toggle && channelFilterId === channelId ? null : channelId;
    channelFilterId = nextId;
    if (nextId != null) {
      const ch = subscriptions.find((c) => c.id === nextId) ?? null;
      markSubscriptionSeen(ch);
      if (ch) {
        rememberBrowseChannel(ch);
        if (!subscriptions.some((c) => c.id === ch.id)) {
          subscriptions = [...subscriptions, { ...ch, is_subscribed: true }];
        }
      }
    }
    void loadSidebarChannel(nextId);
    scrollFeedToTop();
    void reload();
  }

  /** Открыть ленту канала/блога на этой же странице (без /channel/:id). */
  function openChannelFeed(channelId: number) {
    if (!(channelId > 0)) return;
    clearArticleFocus();
    tab = 'my';
    channelFilterId = channelId;
    markSubscriptionSeen(subscriptions.find((c) => c.id === channelId));
    void loadSidebarChannel(channelId).then(() => {
      const ch =
        sidebarChannel?.id === channelId
          ? sidebarChannel
          : subscriptions.find((c) => c.id === channelId)
            ?? null;
      rememberBrowseChannel(
        ch ?? { id: channelId, title: `Канал #${channelId}` },
      );
    });
    scrollFeedToTop();
    void reload();
  }

  async function openChannelDestination(ch: FeedChannel) {
    const channelId = Number(ch.id ?? 0);
    if (!(channelId > 0)) return;

    if (ch.is_blog) {
      let profileId = Number(ch.blog_profile_id ?? 0);
      if (!(profileId > 0)) {
        try {
          const res = await window.anixApi?.channel?.info?.(channelId);
          const info = (res?.channel ?? null) as FeedChannel | null;
          profileId = Number(info?.blog_profile_id ?? 0);
          if (info?.id && sidebarChannel?.id === channelId) {
            sidebarChannel = { ...sidebarChannel, ...info };
          }
        } catch {
          /* ignore */
        }
      }
      if (profileId > 0) {
        openProfilePanel(profileId, { login: ch.title });
        return;
      }
      showToast('Профиль блога недоступен', 'err');
      return;
    }

    openChannelFeed(channelId);
  }

  function onOpenArticle(article: FeedArticle) {
    void selectArticle(article);
  }

  function onOpenChannel(channelId: number) {
    const fromArticles =
      articles.find((a) => a.channel?.id === channelId)?.channel
      ?? searchArticles.find((a) => a.channel?.id === channelId)?.channel
      ?? moreArticles.find((a) => a.channel?.id === channelId)?.channel
      ?? null;
    const ch =
      fromArticles
      ?? (focusChannel?.id === channelId ? focusChannel : null)
      ?? (sidebarChannel?.id === channelId ? sidebarChannel : null)
      ?? subscriptions.find((c) => c.id === channelId)
      ?? searchChannels.find((c) => c.id === channelId)
      ?? searchBlogs.find((c) => c.id === channelId)
      ?? null;
    if (ch) {
      void openChannelDestination(ch);
      return;
    }
    openChannelFeed(channelId);
  }

  async function onVoteArticle(article: FeedArticle, nextVote: 0 | 1 | 2) {
    if (!window.anixApi?.article?.vote) return;
    const prevVote = normalizeArticleVote(article.vote);
    if (prevVote === nextVote) return;
    const patch = (list: FeedArticle[]) =>
      list.map((a) => (a.id === article.id ? applyArticleVote(a, nextVote) : a));
    const unpatch = (list: FeedArticle[]) =>
      list.map((a) => (a.id === article.id ? applyArticleVote(a, prevVote) : a));
    articles = patch(articles);
    searchArticles = patch(searchArticles);
    moreArticles = patch(moreArticles);
    if (focusArticle?.id === article.id) focusArticle = applyArticleVote(focusArticle, nextVote);
    if (spotlightArticle?.id === article.id) spotlightArticle = applyArticleVote(spotlightArticle, nextVote);
    try {
      await window.anixApi.article.vote(article.id, nextVote);
    } catch (err) {
      articles = unpatch(articles);
      searchArticles = unpatch(searchArticles);
      moreArticles = unpatch(moreArticles);
      if (focusArticle?.id === article.id) focusArticle = applyArticleVote(focusArticle, prevVote);
      if (spotlightArticle?.id === article.id) spotlightArticle = applyArticleVote(spotlightArticle, prevVote);
      errorMsg = String(err);
    }
  }

  async function onSubscribeChannel(channelId: number, nextSubscribed: boolean) {
    if (!authed && !requireAuth()) return;
    const api = window.anixApi?.channel;
    if (!api?.subscribe || !api.unsubscribe) return;

    const prevArticles = articles;
    const prevSearch = searchArticles;
    const prevSearchChannels = searchChannels;
    const prevSearchBlogs = searchBlogs;
    const prevSubs = subscriptions;
    const prevFocus = focusChannel;
    const prevSidebar = sidebarChannel;
    const prevMore = moreArticles;
    const prevFocusArticle = focusArticle;
    const prevSpotlight = spotlightArticle;
    subscribeBusyId = channelId;

    const patchArticleChannel = (a: FeedArticle): FeedArticle => {
      if (a.channel?.id !== channelId) return a;
      return { ...a, channel: { ...a.channel, is_subscribed: nextSubscribed } };
    };

    articles = articles.map(patchArticleChannel);
    searchArticles = searchArticles.map(patchArticleChannel);
    moreArticles = moreArticles.map(patchArticleChannel);
    if (focusArticle?.channel?.id === channelId) {
      focusArticle = {
        ...focusArticle,
        channel: { ...focusArticle.channel!, is_subscribed: nextSubscribed },
      };
    }
    if (spotlightArticle) spotlightArticle = patchArticleChannel(spotlightArticle);
    searchChannels = patchChannelSubscribe(searchChannels, channelId, nextSubscribed);
    searchBlogs = patchChannelSubscribe(searchBlogs, channelId, nextSubscribed);
    if (sidebarChannel?.id === channelId) {
      sidebarChannel = { ...sidebarChannel, is_subscribed: nextSubscribed };
    }
    if (focusChannel?.id === channelId) {
      focusChannel = { ...focusChannel, is_subscribed: nextSubscribed };
    }
    if (nextSubscribed) {
      const fromArticle =
        articles.find((a) => a.channel?.id === channelId)?.channel
        ?? searchArticles.find((a) => a.channel?.id === channelId)?.channel
        ?? moreArticles.find((a) => a.channel?.id === channelId)?.channel
        ?? focusChannel
        ?? searchChannels.find((c) => c.id === channelId)
        ?? searchBlogs.find((c) => c.id === channelId);
      if (fromArticle && !subscriptions.some((c) => c.id === channelId)) {
        subscriptions = [...subscriptions, { ...fromArticle, is_subscribed: true }];
      } else {
        subscriptions = subscriptions.map((c) =>
          c.id === channelId ? { ...c, is_subscribed: true } : c,
        );
      }
    } else {
      subscriptions = subscriptions.filter((c) => c.id !== channelId);
      if (channelFilterId === channelId) channelFilterId = null;
      const fromContext =
        sidebarChannel?.id === channelId
          ? sidebarChannel
          : focusChannel?.id === channelId
            ? focusChannel
            : null;
      if (fromContext) rememberBrowseChannel({ ...fromContext, is_subscribed: false });
    }

    try {
      const res = nextSubscribed
        ? await api.subscribe(channelId)
        : await api.unsubscribe(channelId);
      const code = Number((res as { code?: number } | undefined)?.code ?? 0);
      // 0 = ok; subscribe: 2 = уже подписан; unsubscribe: 2 = уже не подписан
      const ok = code === 0 || code === 2;
      if (!ok) {
        const target =
          articles.find((a) => a.channel?.id === channelId)?.channel
          ?? moreArticles.find((a) => a.channel?.id === channelId)?.channel
          ?? focusChannel
          ?? subscriptions.find((c) => c.id === channelId);
        const isBlog = !!target?.is_blog;
        let msg: string;
        if (nextSubscribed) {
          if (code === 3) msg = 'Достигнут лимит подписок';
          else if (isBlog && code === 1) {
            msg = 'Anixart сейчас не принимает подписки на блоги (ошибка API)';
          } else {
            msg = `Не удалось подписаться (код ${code})`;
          }
        } else if (isBlog && code === 1) {
          msg = 'Anixart сейчас не принимает отписки от блогов (ошибка API)';
        } else {
          msg = `Не удалось отписаться (код ${code})`;
        }
        throw new Error(msg);
      }
      if (nextSubscribed) {
        void loadSubscriptions();
      }
    } catch (err) {
      articles = prevArticles;
      searchArticles = prevSearch;
      searchChannels = prevSearchChannels;
      searchBlogs = prevSearchBlogs;
      subscriptions = prevSubs;
      focusChannel = prevFocus;
      sidebarChannel = prevSidebar;
      moreArticles = prevMore;
      focusArticle = prevFocusArticle;
      spotlightArticle = prevSpotlight;
      const msg = err instanceof Error ? err.message : String(err);
      showToast(msg || 'Ошибка подписки', 'err');
      errorMsg = msg;
    } finally {
      subscribeBusyId = null;
    }
  }

  function onArticleRemove(articleId: number) {
    articles = articles.filter((a) => a.id !== articleId);
    searchArticles = searchArticles.filter((a) => a.id !== articleId);
    moreArticles = moreArticles.filter((a) => a.id !== articleId);
    if (spotlightArticle?.id === articleId) spotlightArticle = null;
    if (focusArticle?.id === articleId) {
      const next = moreArticles[0] ?? null;
      if (next) void selectArticle(next);
      else clearArticleFocus();
    }
  }

  function onArticleChange(next: FeedArticle) {
    articles = articles.map((a) => (a.id === next.id ? next : a));
    searchArticles = searchArticles.map((a) => (a.id === next.id ? next : a));
    moreArticles = moreArticles.map((a) => (a.id === next.id ? next : a));
    if (spotlightArticle?.id === next.id) spotlightArticle = next;
    if (focusArticle?.id === next.id) focusArticle = next;
  }

  async function ensureManagedLoaded(): Promise<void> {
    if (!authed || managed.length > 0 || managedBusy) return;
    managedBusy = true;
    try {
      const res = await window.anixApi?.channel?.editorAll?.();
      const list = Array.isArray(res?.channels) ? res.channels : [];
      managed = list.filter((c): c is EditorChannel => !!c && Number(c.id) > 0);
    } catch {
      /* ignore — композер покажет empty */
    } finally {
      managedBusy = false;
    }
  }

  async function loadSelfAvatar(): Promise<void> {
    if (!authed || !window.anixApi?.profile?.self) {
      selfAvatarUrl = '';
      return;
    }
    try {
      const res = await window.anixApi.profile.self();
      const avatar = String(res?.profile?.avatar ?? '').trim();
      selfAvatarUrl = avatar ? (resolveCdnAssetUrl(avatar) || avatar) : '';
    } catch {
      selfAvatarUrl = '';
    }
  }

  function refreshDrafts() {
    drafts = loadFeedDrafts();
    if (tab === 'drafts') {
      loadState = drafts.length === 0 ? 'empty' : 'ready';
    }
  }

  async function openComposer(
    preferredChannelId?: number | null,
    repost?: FeedArticle | null,
    draftId?: string | null,
    opts?: { isSuggestion?: boolean; editArticle?: FeedArticle | null },
  ) {
    if (!authed && !requireAuth()) return;
    const suggestion = !!opts?.isSuggestion;
    let editArticle = opts?.editArticle ?? null;
    if (editArticle) {
      editArticle = await resolveFeedArticleForEdit(editArticle);
    }
    composerIsSuggestion = suggestion;
    if (!suggestion && !editArticle) await ensureManagedLoaded();

    let targetId = preferredChannelId
      ?? (editArticle ? Number(editArticle.channel?.id ?? 0) || null : null)
      ?? channelFilterId
      ?? (managed[0]?.id ?? null);

    let channelsForComposer = composerChannels;
    if (suggestion) {
      const ch = asideChannel
        ?? subscriptions.find((c) => c.id === targetId)
        ?? null;
      const id = Number(ch?.id ?? targetId ?? 0);
      if (!(id > 0) || !ch || ch.is_blog || !ch.is_article_suggestion_enabled) {
        showToast('Предложения записей недоступны в этом канале', 'err');
        composerIsSuggestion = false;
        return;
      }
      targetId = id;
      channelsForComposer = [{
        id,
        title: ch.title || `Канал #${id}`,
        avatar: ch.avatar,
        is_blog: false,
      }];
    } else if (editArticle?.channel?.id) {
      const chId = Number(editArticle.channel.id);
      const existing = channelsForComposer.find((c) => c.id === chId);
      if (!existing) {
        channelsForComposer = [
          {
            id: chId,
            title: editArticle.channel.title || `Канал #${chId}`,
            avatar: editArticle.channel.avatar,
            is_blog: !!editArticle.channel.is_blog,
          },
          ...channelsForComposer,
        ];
      }
      targetId = chId;
    }

    composerChannelId = targetId;
    composerEdit = suggestion ? null : editArticle;
    composerRepost = suggestion || editArticle ? null : (repost ?? null);
    composerDraftId = editArticle ? null : (draftId ?? null);
    composerDraft = editArticle ? null : (draftId ? getFeedDraft(draftId) : null);
    if (composerDraft && composerChannelId == null) {
      composerChannelId = composerDraft.channelId;
    }
    const opened = await openFeedComposerWindow({
      channelId: composerChannelId,
      draftId: composerDraftId,
      repostArticle: composerRepost,
      editArticle: composerEdit,
      channels: channelsForComposer,
      isSuggestion: suggestion,
    });
    if (opened) {
      composerOpen = false;
      return;
    }
    // В Electron всегда отдельное окно; overlay — только без IPC (веб).
    if (window.electron?.openComposerWindow) {
      showToast('Не удалось открыть окно редактора', 'err');
      return;
    }
    composerOpen = true;
  }

  function closeComposer() {
    composerOpen = false;
    composerRepost = null;
    composerEdit = null;
    composerDraftId = null;
    composerDraft = null;
    composerIsSuggestion = false;
  }

  async function resumeDraft(id: string) {
    const draft = getFeedDraft(id);
    if (!draft) {
      refreshDrafts();
      return;
    }
    await openComposer(draft.channelId, draft.repostArticle, draft.id);
  }

  function removeDraft(id: string) {
    deleteFeedDraft(id);
    refreshDrafts();
  }

  async function onArticlePublished(articleId: number, channelId: number) {
    const wasSuggestion = composerIsSuggestion;
    composerIsSuggestion = false;
    if (wasSuggestion) {
      if (channelId > 0) void loadSidebarChannel(channelId);
      if (channelFilterId === channelId) {
        void reload();
      } else {
        openChannelFeed(channelId);
      }
      return;
    }
    if (articleId > 0) {
      await selectArticleById(articleId);
      return;
    }
    openChannelFeed(channelId);
  }

  async function createChannel() {
    if (!authed && !requireAuth()) return;
    const api = window.anixApi?.channel;
    if (!api?.createBlog) return;
    createBusy = true;
    errorMsg = '';
    try {
      const res = await api.createBlog();
      const newId = Number(res?.channel?.id ?? 0);
      await ensureManagedLoaded();
      if (tab === 'managed') await reload();
      else {
        const resAll = await window.anixApi?.channel?.editorAll?.();
        const list = Array.isArray(resAll?.channels) ? resAll.channels : [];
        managed = list.filter((c): c is EditorChannel => !!c && Number(c.id) > 0);
      }
      if (newId > 0) {
        showToast('Блог создан', 'ok');
        openChannelFeed(newId);
        void openComposer(newId);
      }
    } catch (err) {
      errorMsg = String(err);
      showToast(errorMsg || 'Не удалось создать блог', 'err');
    } finally {
      createBusy = false;
    }
  }

  function applySearchTag(tag: string) {
    searchQuery = tag.replace(/^#/, '').trim();
    if (tab !== 'search') enterSearchTab();
  }

  function applyFeedSearchFromRoute(detailQ?: string) {
    const q = String(detailQ ?? getSearchParams().get('q') ?? '').trim();
    if (!q) return;
    const wasSearch = tab === 'search';
    if (!wasSearch) {
      clearArticleFocus();
      tab = 'search';
      channelFilterId = null;
      void loadSidebarChannel(null);
    }
    if (searchQuery.trim() === q) {
      if (!wasSearch) void fetchSearch(q, 0, false);
      return;
    }
    searchQuery = q;
  }

  $effect(() => {
    const q = searchQuery.trim();
    const currentTab = tab;
    if (currentTab !== 'search') {
      if (currentTab === 'history') historyVisibleCount = 10;
      clearSearchResults();
      return;
    }
    if (!q) {
      clearSearchResults();
      loadState = 'idle';
      return;
    }
    const handle = setTimeout(() => {
      void fetchSearch(q, 0, false);
    }, 320);
    return () => clearTimeout(handle);
  });

  $effect(() => {
    if (tab !== 'history') return;
    const ids = shownHistory
      .filter((item) => item.kind === 'post')
      .map((item) => item.id);
    void loadHistoryArticles(ids);
  });

  onMount(() => {
    applyFeedSearchFromRoute();
    refreshDrafts();
    unregisterScrollKey = registerActiveScrollKey(() => FEED_VIEW_KEY());

    const onFeedSearch = ((e: CustomEvent<{ q?: string }>) => {
      applyFeedSearchFromRoute(e.detail?.q);
      scrollFeedToTop();
    }) as EventListener;
    const onNavigate = ((e: CustomEvent<string>) => {
      const route = String(e.detail ?? '');
      if (!route.startsWith('/feed')) return;
      const q = route.includes('?')
        ? new URLSearchParams(route.slice(route.indexOf('?') + 1)).get('q')
        : getSearchParams().get('q');
      applyFeedSearchFromRoute(q ?? undefined);
    }) as EventListener;
    const onBeforeNavigate = ((e: Event) => {
      const to = String((e as CustomEvent<{ to?: string }>).detail?.to ?? '');
      if (to.startsWith('/feed')) return;
      // Сохраняем и ленту, и открытый пост — при «назад» вернёмся в пост.
      saveViewStateWithScroll(FEED_VIEW_KEY(), feedListSnapshot());
    }) as EventListener;

    window.addEventListener('anix:feed-search', onFeedSearch);
    window.addEventListener('anix:navigate', onNavigate);
    window.addEventListener('anix:beforeNavigate', onBeforeNavigate);
    window.addEventListener('popstate', onFeedPopState);
    window.addEventListener('anix:feed-drafts-changed', refreshDrafts);
    const onComposerPublished = ((e: Event) => {
      refreshDrafts();
      const detail = (e as CustomEvent<{ articleId?: number; channelId?: number } | null>).detail;
      const articleId = Number(detail?.articleId ?? 0);
      const publishedChannelId = Number(detail?.channelId ?? 0);
      const wasSuggestion = composerIsSuggestion;
      composerIsSuggestion = false;
      if (wasSuggestion) {
        if (publishedChannelId > 0) {
          void loadSidebarChannel(publishedChannelId);
          if (channelFilterId === publishedChannelId) void reload();
          else openChannelFeed(publishedChannelId);
        }
        return;
      }
      if (articleId > 0) void selectArticleById(articleId);
      else if (publishedChannelId > 0) openChannelFeed(publishedChannelId);
    }) as EventListener;
    window.addEventListener('anix:composer-published', onComposerPublished);
    window.addEventListener('storage', refreshDrafts);

    const unsub = isAuthenticated.subscribe((v) => {
      const wasAuthed = authed;
      authed = v;
      if (v) {
        void loadSubscriptions();
        void loadSelfAvatar();
        void ensureManagedLoaded();
        if (!wasAuthed && (loadState === 'need-auth' || tab === 'my' || tab === 'managed')) {
          void reload();
        }
      } else {
        subscriptions = [];
        managed = [];
        selfAvatarUrl = '';
        composerOpen = false;
        composerRepost = null;
        composerEdit = null;
        composerDraftId = null;
        composerDraft = null;
        composerIsSuggestion = false;
      }
    });
    const unsubFocus = feedArticleFocusId.subscribe((id) => {
      if (id == null || !(id > 0)) return;
      takeFeedArticleFocus();
      void selectArticleById(id);
    });
    const unsubChannelFocus = feedChannelFocusId.subscribe((id) => {
      if (id == null || !(id > 0)) return;
      takeFeedChannelFocus();
      openChannelFeed(id);
    });

    const cached = getViewState<FeedListSnapshot>(FEED_VIEW_KEY());
    const cachedData = cached?.data;
    const canRestore =
      !!cachedData
      && (cachedData.loadState === 'ready' || cachedData.loadState === 'empty')
      && (
        cachedData.tab === 'history'
        || cachedData.tab === 'managed'
        || cachedData.tab === 'drafts'
        || (Array.isArray(cachedData.articles) && cachedData.articles.length > 0)
      );

    if (canRestore && cached?.data) {
      applyFeedListSnapshot(cached.data);
      logViewStateRestore(FEED_VIEW_KEY(), cached.scrollTop, cached.data);
      if (cached.data.channelFilterId != null) {
        void loadSidebarChannel(cached.data.channelFilterId);
      }

      const post = cached.data.postView;
      if (post?.article?.id) {
        restorePostViewFromSnapshot(post);
        requestAnimationFrame(() => {
          scrollFeedToTop();
        });
      } else if (cached.scrollTop > 0) {
        beginScrollRestore();
        requestAnimationFrame(() => {
          void restoreScrollTop(cached.scrollTop, { maxWaitMs: 6000 });
        });
      } else {
        scrollFeedToTop();
      }
    } else {
      logViewStateMiss(FEED_VIEW_KEY(), 'empty-or-missing');
      scrollFeedToTop();
      void reload();
    }

    return () => {
      unsub();
      unsubFocus();
      unsubChannelFocus();
      window.removeEventListener('anix:feed-search', onFeedSearch);
      window.removeEventListener('anix:navigate', onNavigate);
      window.removeEventListener('anix:beforeNavigate', onBeforeNavigate);
      window.removeEventListener('popstate', onFeedPopState);
      window.removeEventListener('anix:feed-drafts-changed', refreshDrafts);
      window.removeEventListener('anix:composer-published', onComposerPublished);
      window.removeEventListener('storage', refreshDrafts);
      unregisterScrollKey?.();
      unregisterScrollKey = null;
    };
  });

  onDestroy(() => {
    saveViewStateData(FEED_VIEW_KEY(), feedListSnapshot());
  });
</script>

<div class="view view-feed">
  <div class="view-feed__layout" class:view-feed__layout--no-aside={!showGroupAside}>
  <aside class="feed-side" aria-label="Навигация ленты">
    <nav class="feed-side__nav" aria-label="Разделы ленты">
      <button
        type="button"
        class="feed-side__item"
        class:feed-side__item--active={tab === 'my' && !postViewActive}
        aria-current={tab === 'my' && !postViewActive ? 'page' : undefined}
        aria-label={feedNavAvatars.length > 0
          ? `Моя лента, новые записи: ${feedNavAvatars.map((av) => av.title).join(', ')}`
          : 'Моя лента'}
        onclick={() => onTabChange('my')}
      >
        <span class="feed-side__item-icon" aria-hidden="true">{@html iconNewspaper(18)}</span>
        <span class="feed-side__item-label">Моя лента</span>
        {#if feedNavAvatars.length > 0}
          <span class="feed-side__avatar-stack" aria-hidden="true">
            {#each feedNavAvatars as av (av.key)}
              <span
                class="feed-side__avatar-stack-item"
                class:feed-side__avatar-stack-item--channel={!av.is_blog}
                class:feed-side__avatar-stack-item--empty={!channelAvatarUrl(av.avatar)}
                class:feed-side__avatar-stack-item--fresh={!!av.fresh}
                style={channelAvatarUrl(av.avatar)
                  ? `background-image:url('${channelAvatarUrl(av.avatar)}')`
                  : undefined}
                title={av.title}
              ></span>
            {/each}
          </span>
        {/if}
      </button>
      <button
        type="button"
        class="feed-side__item"
        class:feed-side__item--active={tab === 'latest'}
        aria-current={tab === 'latest' ? 'page' : undefined}
        onclick={() => onTabChange('latest')}
      >
        <span class="feed-side__item-icon" aria-hidden="true">{@html iconFlame(18)}</span>
        <span class="feed-side__item-label">Свежее</span>
      </button>
      <button
        type="button"
        class="feed-side__item"
        class:feed-side__item--active={tab === 'managed'}
        aria-current={tab === 'managed' ? 'page' : undefined}
        onclick={() => onTabChange('managed')}
      >
        <span class="feed-side__item-icon" aria-hidden="true">{@html iconUsers(18)}</span>
        <span class="feed-side__item-label">Управляемые</span>
      </button>
      <button
        type="button"
        class="feed-side__item"
        class:feed-side__item--active={tab === 'history' && !postViewActive}
        aria-current={tab === 'history' && !postViewActive ? 'page' : undefined}
        aria-label={historyNavAvatars.length > 0
          ? `История, недавно: ${historyNavAvatars.map((av) => av.title).join(', ')}`
          : 'История'}
        onclick={() => onTabChange('history')}
      >
        <span class="feed-side__item-icon" aria-hidden="true">{@html iconClock(18)}</span>
        <span class="feed-side__item-label">История</span>
        {#if historyNavAvatars.length > 0}
          <span class="feed-side__avatar-stack" aria-hidden="true">
            {#each historyNavAvatars as av (av.key)}
              <span
                class="feed-side__avatar-stack-item"
                class:feed-side__avatar-stack-item--channel={!av.is_blog}
                class:feed-side__avatar-stack-item--empty={!channelAvatarUrl(av.avatar)}
                style={channelAvatarUrl(av.avatar)
                  ? `background-image:url('${channelAvatarUrl(av.avatar)}')`
                  : undefined}
                title={av.title}
              ></span>
            {/each}
          </span>
        {/if}
      </button>
      <button
        type="button"
        class="feed-side__item"
        class:feed-side__item--active={tab === 'drafts' && !postViewActive}
        aria-current={tab === 'drafts' && !postViewActive ? 'page' : undefined}
        onclick={() => onTabChange('drafts')}
      >
        <span class="feed-side__item-icon" aria-hidden="true">{@html iconClipboardList(18)}</span>
        <span class="feed-side__item-label">Черновики</span>
        {#if drafts.length > 0}
          <span class="feed-side__item-count">{drafts.length}</span>
        {/if}
      </button>
      <button
        type="button"
        class="feed-side__item"
        class:feed-side__item--active={tab === 'search' && !postViewActive}
        aria-current={tab === 'search' && !postViewActive ? 'page' : undefined}
        onclick={() => onTabChange('search')}
      >
        <span class="feed-side__item-icon" aria-hidden="true">{@html iconSearch(18)}</span>
        <span class="feed-side__item-label">Поиск</span>
      </button>
    </nav>
  </aside>

  <div class="feed-main">
    <header class="feed-page__header">
      <div class="feed-page__title-row">
        {#if postViewActive}
          <button
            type="button"
            class="feed-page__back"
            aria-label="Назад"
            onclick={exitPostViewToFeed}
          >
            {@html iconArrowLeft(18)}
          </button>
        {/if}
        {#if showDateFilter}
          <h1 class="feed-page__title feed-page__title--sr">Моя лента</h1>
          <div class="feed-page__date">
            <UiV2Select
              appearance="title"
              ariaLabel={dateFilterAria}
              options={dateOptions}
              value={String(dateFilter)}
              onChange={onDateChange}
            />
          </div>
          {#if authed}
            <button
              type="button"
              class="feed-page__all"
              onclick={openAllSubscriptions}
              aria-label="Все подписки"
            >
              Все
            </button>
          {/if}
        {:else}
          <h1 class="feed-page__title">{mainTitle}</h1>
        {/if}
      </div>
      <div class="feed-page__toolbar">
        {#if (tab === 'managed' || tab === 'history' || tab === 'drafts') && !postViewActive}
          <label class="feed-page__search-field feed-page__search-field--compact">
            <span class="feed-page__search-icon" aria-hidden="true">{@html iconSearch(16)}</span>
            <input
              class="feed-page__search-input"
              type="search"
              autocomplete="off"
              spellcheck="false"
              placeholder={tab === 'managed' ? 'Поиск каналов…' : tab === 'drafts' ? 'Поиск черновиков…' : 'Поиск в истории…'}
              aria-label={tab === 'managed' ? 'Поиск каналов' : tab === 'drafts' ? 'Поиск черновиков' : 'Поиск в истории'}
              bind:value={listFilterQuery}
            />
            {#if listFilterQuery}
              <button
                type="button"
                class="feed-page__search-clear"
                aria-label="Очистить фильтр"
                onclick={() => { listFilterQuery = ''; }}
              >
                {@html iconX(14)}
              </button>
            {/if}
          </label>
        {/if}
        <UiV2Button
          variant="ghost"
          size="sm"
          label="Обновить"
          disabled={loadState === 'loading' || managedBusy || searchBusy || searchLoadState === 'loading' || moreBusy}
          onclick={() => void reload()}
        >
          {#snippet icon()}{@html iconRefreshCw(16)}{/snippet}
        </UiV2Button>
      </div>
    </header>

    {#if searchMode && !postViewActive}
      <div class="feed-page__search-inline">
        <label class="feed-page__search-field">
          <span class="feed-page__search-icon" aria-hidden="true">{@html iconSearch(18)}</span>
          <input
            class="feed-page__search-input"
            type="search"
            name="feed-search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Поиск записей, каналов и блогов…"
            aria-label="Поиск записей, каналов и блогов"
            bind:this={searchInputEl}
            bind:value={searchQuery}
          />
          {#if searchQuery}
            <button
              type="button"
              class="feed-page__search-clear"
              aria-label="Очистить поиск"
              onclick={() => { searchQuery = ''; }}
            >
              {@html iconX(14)}
            </button>
          {/if}
        </label>
      </div>
    {/if}

    {#if showFeedSubs}
      <FeedSubsStrip
        items={feedSubsItems}
        selectedId={channelFilterId}
        loading={subsLoading}
        onSelect={selectSubscription}
        onPin={(id) => {
          toggleSubscriptionPin(id);
          pinTick += 1;
        }}
      />
    {/if}

    {#if channelFilterId != null && tab === 'my' && !postViewActive && !searchMode && asideChannel}
      <div class="feed-channel-bar">
        <div class="feed-channel-bar__info">
          <span
            class="feed-channel-bar__avatar"
            class:feed-channel-bar__avatar--channel={!asideChannel.is_blog}
            class:feed-channel-bar__avatar--empty={!channelAvatarUrl(asideChannel.avatar)}
            style={channelAvatarUrl(asideChannel.avatar)
              ? `background-image:url('${channelAvatarUrl(asideChannel.avatar)}')`
              : undefined}
            aria-hidden="true"
          ></span>
          <span class="feed-channel-bar__meta">
            <span class="feed-channel-bar__title">
              {asideChannel.title || (asideChannel.is_blog ? 'Блог' : 'Группа')}
            </span>
            <span class="feed-channel-bar__sub">
              {channelSubscriberCount(asideChannel)} подп.
            </span>
          </span>
        </div>
        {#if asideChannel.is_blog || canWriteChannel}
        <div class="feed-channel-bar__actions">
          {#if asideChannel.is_blog}
            <UiV2Button
              variant="chrome"
              size="sm"
              label="Открыть профиль"
              onclick={() => void openChannelDestination(asideChannel)}
            />
          {/if}
          {#if canWriteChannel}
            <UiV2Button
              variant="primary"
              size="sm"
              label="Написать"
              onclick={() => void openComposer(channelFilterId)}
            >
              {#snippet icon()}{@html iconPencil(16)}{/snippet}
            </UiV2Button>
          {/if}
        </div>
        {/if}
      </div>
    {/if}

    {#if showComposePrompt}
      <FeedComposePrompt
        avatarUrl={selfAvatarUrl}
        placeholder={composePromptPlaceholder}
        onOpen={() => void openComposer(
          channelFilterId,
          null,
          null,
          { isSuggestion: canSuggestChannel },
        )}
      />
    {/if}

    {#if showSuggestionsNav}
      <FeedSuggestionsNav
        count={sidebarSuggestionCount}
        onOpen={() => { suggestionsModalOpen = true; }}
      />
    {/if}

    <div class="feed-page__body">
      {#if tab === 'drafts'}
        {#if visibleDrafts.length === 0}
          <UiV2Card title={listFilterNeedle ? 'Ничего не найдено' : 'Нет черновиков'}>
            <p class="feed-page__hint">
              {#if listFilterNeedle}
                По запросу «{listFilterQuery.trim()}» черновиков нет.
              {:else}
                Если закрыть редактор с незаконченным текстом, запись появится здесь.
              {/if}
            </p>
          </UiV2Card>
        {:else}
          <ul class="feed-drafts__list">
            {#each visibleDrafts as draft (draft.id)}
              <li class="feed-drafts__item">
                <div class="feed-drafts__body">
                  <p class="feed-drafts__title">{draft.preview || 'Черновик'}</p>
                  <p class="feed-drafts__meta">
                    {formatDraftTime(draft.updatedAt)}
                    {#if draft.repostArticle} · репост #{draft.repostArticle.id}{/if}
                    · {draftDestinationTitle(draft)}
                  </p>
                </div>
                <div class="feed-drafts__actions">
                  <UiV2Button
                    variant="primary"
                    size="sm"
                    label="Продолжить"
                    onclick={() => void resumeDraft(draft.id)}
                  />
                  <UiV2Button
                    variant="ghost"
                    size="sm"
                    label="Удалить"
                    onclick={() => removeDraft(draft.id)}
                  />
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      {:else if tab === 'managed'}
        {#if loadState === 'need-auth'}
          <UiV2Card title="Нужен вход">
            <p class="feed-page__hint">
              Войдите, чтобы видеть каналы, которыми вы управляете.
            </p>
            <UiV2Button variant="primary" label="Войти" onclick={() => requireAuth()} />
          </UiV2Card>
        {:else if loadState === 'loading'}
          <div class="feed-page__list" aria-busy="true">
            {#each Array.from({ length: 3 }) as _, i (i)}
              <UiV2FeedPostSkeleton count={3} />
            {/each}
          </div>
        {:else if loadState === 'error'}
          <UiV2Card title="Не удалось загрузить">
            <p class="feed-page__hint">{errorMsg || 'Попробуйте ещё раз.'}</p>
            <UiV2Button variant="primary" label="Повторить" onclick={() => void reload()} />
          </UiV2Card>
        {:else}
          <div class="feed-managed">
            <div class="feed-managed__intro">
              <div class="feed-managed__intro-text">
                <p class="feed-managed__lead">Каналы и блоги, которыми вы управляете</p>
                <p class="feed-page__hint feed-managed__hint">
                  Создайте блог или получите права редактора — здесь можно открыть ленту и написать запись.
                </p>
              </div>
              <div class="feed-managed__actions">
                <UiV2Button
                  variant="chrome"
                  label="Написать"
                  disabled={createBusy || managed.length === 0}
                  onclick={() => void openComposer(null)}
                >
                  {#snippet icon()}{@html iconPencil(16)}{/snippet}
                </UiV2Button>
                <UiV2Button
                  variant="primary"
                  label={createBusy ? 'Создание…' : 'Создать блог'}
                  disabled={createBusy}
                  onclick={() => void createChannel()}
                >
                  {#snippet icon()}{@html iconPlus(16)}{/snippet}
                </UiV2Button>
              </div>
            </div>
            {#if visibleManaged.length === 0}
              <UiV2Card title={listFilterNeedle ? 'Ничего не найдено' : 'Нет управляемых каналов'}>
                <p class="feed-page__hint">
                  {#if listFilterNeedle}
                    По запросу «{listFilterQuery.trim()}» каналов нет. Попробуйте другое слово.
                  {:else}
                    Создайте свой первый блог прямо сейчас — он появится здесь.
                  {/if}
                </p>
                {#if !listFilterNeedle}
                  <UiV2Button
                    variant="primary"
                    label={createBusy ? 'Создание…' : 'Создать блог'}
                    disabled={createBusy}
                    onclick={() => void createChannel()}
                  />
                {/if}
              </UiV2Card>
            {:else}
              <ul class="feed-managed__list">
                {#each visibleManaged as ch (ch.id)}
                  <li class="feed-managed__row">
                    <button
                      type="button"
                      class="feed-managed__item"
                      onclick={() => openChannelFeed(ch.id)}
                    >
                      <span
                        class="feed-article__avatar"
                        class:feed-article__avatar--channel={!ch.is_blog}
                        class:feed-article__avatar--empty={!channelAvatarUrl(ch.avatar)}
                        style={channelAvatarUrl(ch.avatar)
                          ? `background-image:url('${channelAvatarUrl(ch.avatar)}')`
                          : undefined}
                        aria-hidden="true"
                      ></span>
                      <span class="feed-managed__meta">
                        <span class="feed-managed__title">{ch.title || `Канал #${ch.id}`}</span>
                        <span class="feed-managed__sub">
                          {ch.is_blog ? 'Блог' : 'Канал'} · {ch.subscriber_count ?? 0} подп.
                        </span>
                      </span>
                    </button>
                    <div class="feed-managed__item-actions">
                      <UiV2Button
                        variant="ghost"
                        size="sm"
                        label="Написать"
                        onclick={() => void openComposer(ch.id)}
                      >
                        {#snippet icon()}{@html iconPencil(14)}{/snippet}
                      </UiV2Button>
                      <UiV2Button
                        variant="chrome"
                        size="sm"
                        label="Открыть"
                        onclick={() => openChannelFeed(ch.id)}
                      />
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      {:else if postViewActive && focusArticle}
        <div class="feed-page__list feed-page__list--post-view">
          <FeedArticleCard
            article={focusArticle}
            selected={selectedArticleId === focusArticle.id}
            onOpen={onOpenArticle}
            onDeselect={collapseSelectedComments}
            onChannel={onOpenChannel}
            onVote={onVoteArticle}
            onSubscribe={onSubscribeChannel}
            hideSubscribe={hidePostSubscribe}
            onArticleRemove={onArticleRemove}
            onArticleChange={onArticleChange}
            onRepost={(article) => void openComposer(null, article)}
            onEdit={(article) => void openComposer(null, null, null, { editArticle: article })}
          />
          {#if moreBusy && moreArticles.length === 0}
            <UiV2FeedPostSkeleton count={2} />
          {:else if moreArticles.length > 0}
            <h2 class="feed-post-view__more-title">{moreFromTitle}</h2>
            {#each moreArticles as article (article.id)}
              <FeedArticleCard
                {article}
                selected={selectedArticleId === article.id}
                onOpen={onOpenArticle}
                onDeselect={collapseSelectedComments}
                onChannel={onOpenChannel}
                onVote={onVoteArticle}
                onSubscribe={onSubscribeChannel}
            hideSubscribe={hidePostSubscribe}
                onArticleRemove={onArticleRemove}
                onArticleChange={onArticleChange}
                onRepost={(article) => void openComposer(null, article)}
            onEdit={(article) => void openComposer(null, null, null, { editArticle: article })}
              />
            {/each}
          {/if}
        </div>
        {#if moreHasMore}
          <div class="feed-page__more">
            <UiV2Button
              variant="chrome"
              label={moreBusy ? 'Загрузка…' : 'Ещё'}
              disabled={moreBusy}
              onclick={loadMoreFocusChannel}
            />
          </div>
        {/if}
      {:else if searchMode}
        {#if !searchNeedle}
          <UiV2Card title="Поиск по ленте">
            <p class="feed-page__hint">
              Введите запрос в поле выше — найдём записи, каналы и блоги.
            </p>
          </UiV2Card>
        {:else if searchLoadState === 'error' && searchArticles.length === 0 && searchChannels.length === 0}
          <UiV2Card title="Не удалось найти">
            <p class="feed-page__hint">{searchError || 'Попробуйте ещё раз.'}</p>
            <UiV2Button variant="primary" label="Повторить" onclick={() => void reload()} />
          </UiV2Card>
        {:else if (searchLoadState === 'loading' || searchLoadState === 'idle') && searchArticles.length === 0 && searchChannels.length === 0 && searchBlogs.length === 0 && searchTags.length === 0}
          <UiV2FeedPostSkeleton count={4} />
        {:else if searchLoadState === 'empty'}
          <UiV2Card title="Ничего не найдено">
            <p class="feed-page__hint">
              По запросу «{searchQuery.trim()}» нет записей, каналов и блогов.
            </p>
          </UiV2Card>
        {:else}
          {#if searchTags.length > 0}
            <section class="feed-search-section" aria-label="Актуальное">
              <h2 class="feed-search-section__title">Актуальное</h2>
              <div class="feed-search-tags">
                {#each searchTags as tag (tag)}
                  <button
                    type="button"
                    class="feed-search-tag"
                    onclick={() => applySearchTag(tag)}
                  >
                    #{tag}
                  </button>
                {/each}
              </div>
            </section>
          {/if}
          {#if searchChannels.length > 0}
            <UiV2FeedRecommended
              title="Каналы"
              avatarShape="channel"
              items={searchChannels.map((ch) => ({
                id: ch.id,
                title: ch.title || `Канал #${ch.id}`,
                avatar: channelAvatarUrl(ch.avatar),
                isVerified: !!ch.is_verified,
                subscriberCount: channelSubscriberCount(ch),
              }))}
              onOpen={onOpenChannel}
            />
          {/if}
          {#if searchBlogs.length > 0}
            <UiV2FeedRecommended
              title="Блоги"
              avatarShape="circle"
              items={searchBlogs.map((ch) => ({
                id: ch.id,
                title: ch.title || `Блог #${ch.id}`,
                avatar: channelAvatarUrl(ch.avatar),
                isVerified: !!ch.is_verified,
                subscriberCount: channelSubscriberCount(ch),
              }))}
              onOpen={onOpenChannel}
            />
          {/if}
          {#if searchArticles.length > 0}
            <section class="feed-search-section" aria-label="Записи">
              <h2 class="feed-search-section__title">Записи</h2>
              <div class="feed-page__list">
                {#each visibleArticles as article (article.id)}
                  <FeedArticleCard
                    {article}
                    selected={selectedArticleId === article.id}
                    onOpen={onOpenArticle}
                    onDeselect={collapseSelectedComments}
                    onChannel={onOpenChannel}
                    onVote={onVoteArticle}
                    onSubscribe={onSubscribeChannel}
            hideSubscribe={hidePostSubscribe}
                    onArticleRemove={onArticleRemove}
                    onArticleChange={onArticleChange}
                    onRepost={(article) => void openComposer(null, article)}
            onEdit={(article) => void openComposer(null, null, null, { editArticle: article })}
                  />
                {/each}
              </div>
            </section>
          {/if}
          {#if searchHasMore}
            <div class="feed-page__more">
              <UiV2Button
                variant="chrome"
                label={searchBusy ? 'Загрузка…' : 'Ещё'}
                disabled={searchBusy}
                onclick={loadMore}
              />
            </div>
          {/if}
        {/if}
      {:else if tab === 'history'}
        {#if historyItems.length === 0}
          <UiV2Card title={listFilterNeedle ? 'Ничего не найдено' : 'История пуста'}>
            <p class="feed-page__hint">
              {#if listFilterNeedle}
                По запросу «{listFilterQuery.trim()}» в истории нет записей.
              {:else}
                Открывайте каналы и записи — они появятся здесь.
              {/if}
            </p>
          </UiV2Card>
        {:else}
          <div class="feed-history">
            {#each historyGroups as group (group.key)}
              <section class="feed-history__day-group">
                <h2 class="feed-history__day">{group.label}</h2>
                {#each group.items as item (`${item.kind}-${item.id}-${item.at}`)}
                  {@const article = item.kind === 'post' ? historyArticles[item.id] : null}
                  {@const busy = item.kind === 'post' && !!historyArticleBusy[item.id]}
                  <article class="feed-history__item">
                    <p class="feed-history__when">
                      {item.kind === 'post' ? 'Просмотрено' : 'Открыто'}
                      {formatFeedRelativeTime(item.at)}
                    </p>
                    {#if article}
                      <FeedArticleCard
                        {article}
                        selected={selectedArticleId === article.id}
                        onOpen={onOpenArticle}
                        onDeselect={collapseSelectedComments}
                        onChannel={onOpenChannel}
                        onVote={onVoteArticle}
                        onSubscribe={onSubscribeChannel}
            hideSubscribe={hidePostSubscribe}
                        onArticleRemove={onArticleRemove}
                        onArticleChange={onArticleChange}
                        onRepost={(article) => void openComposer(null, article)}
            onEdit={(article) => void openComposer(null, null, null, { editArticle: article })}
                      />
                    {:else if busy}
                      <UiV2FeedPostSkeleton count={1} />
                    {:else}
                      <FeedHistoryMoment
                        title={item.title}
                        subtitle={item.kind === 'post'
                          ? 'Запись'
                          : (item.is_blog ? 'Блог' : 'Канал')}
                        avatar={item.avatar}
                        isBlog={!!item.is_blog}
                        isPost={item.kind === 'post'}
                        onOpen={() => onHistoryItemClick(item)}
                      />
                    {/if}
                  </article>
                {/each}
              </section>
            {/each}
          </div>
          {#if historyHasMore}
            <div class="feed-page__more">
              <UiV2Button
                variant="chrome"
                label="Ещё"
                onclick={loadMoreHistory}
              />
            </div>
          {/if}
        {/if}
      {:else if loadState === 'need-auth'}
        <UiV2Card title="Нужен вход">
          <p class="feed-page__hint">
            Войдите в аккаунт Anixart, чтобы видеть статьи каналов, на которые вы подписаны.
          </p>
          <UiV2Button variant="primary" label="Войти" onclick={() => requireAuth()} />
        </UiV2Card>
      {:else if loadState === 'loading'}
        <UiV2FeedPostSkeleton count={4} />
      {:else if loadState === 'error'}
        <UiV2Card title="Не удалось загрузить">
          <p class="feed-page__hint">{errorMsg || 'Попробуйте ещё раз.'}</p>
          <UiV2Button variant="primary" label="Повторить" onclick={() => void reload()} />
        </UiV2Card>
      {:else if loadState === 'empty'}
        <UiV2Card title={tab === 'my' ? 'Ой, а подписок-то нет!' : 'Похоже, нет ни одной записи'}>
          <p class="feed-page__hint">
            {#if tab === 'my'}
              Подпишитесь на каналы в Anixart — тогда их записи появятся здесь.
            {:else if tab === 'history'}
              Открывайте каналы и записи — они появятся здесь.
            {:else if tab === 'drafts'}
              Если закрыть редактор с незаконченным текстом, запись появится здесь.
            {:else}
              В свежей ленте пока пусто. Загляните позже.
            {/if}
          </p>
        </UiV2Card>
      {:else}
        <div class="feed-page__list">
          {#each visibleArticles as article (article.id)}
            <FeedArticleCard
              {article}
              selected={selectedArticleId === article.id}
              onOpen={onOpenArticle}
              onDeselect={collapseSelectedComments}
              onChannel={onOpenChannel}
              onVote={onVoteArticle}
              onSubscribe={onSubscribeChannel}
            hideSubscribe={hidePostSubscribe}
              onArticleRemove={onArticleRemove}
              onArticleChange={onArticleChange}
              onRepost={(article) => void openComposer(null, article)}
            onEdit={(article) => void openComposer(null, null, null, { editArticle: article })}
            />
          {/each}
        </div>
        {#if hasMore}
          <div class="feed-page__more">
            <UiV2Button
              variant="chrome"
              label={loadingMore ? 'Загрузка…' : 'Ещё'}
              disabled={loadingMore}
              onclick={loadMore}
            />
          </div>
        {/if}
      {/if}
    </div>
  </div>

  {#if showGroupAside && groupAsideChannel}
    <aside class="feed-aside" aria-label="О группе">
      <FeedChannelPanel
        channel={groupAsideChannel}
        canWrite={managed.some((c) => c.id === groupAsideChannel.id)}
        subscribeBusy={subscribeBusyId === groupAsideChannel.id}
        onSubscribe={onSubscribeChannel}
        onWrite={() => void openComposer(groupAsideChannel.id)}
        onMuted={(channelId) => patchChannelMuted(channelId, true)}
        onUnmuted={(channelId) => patchChannelMuted(channelId, false)}
      />
    </aside>
  {/if}

  </div>

  <FeedDirectoryModal
    open={allSubsOpen}
    kind="subscriptions"
    onClose={closeAllSubscriptions}
    onSelectChannel={(id) => selectSubscription(id, false)}
  />

  {#if channelFilterId != null && asideChannel}
    <FeedSuggestionsModal
      open={suggestionsModalOpen}
      channelId={channelFilterId}
      channelTitle={asideChannel.title || ''}
      onClose={() => { suggestionsModalOpen = false; }}
      onDeleted={() => {
        sidebarSuggestionCount = Math.max(0, sidebarSuggestionCount - 1);
        if (sidebarSuggestionCount === 0) suggestionsModalOpen = false;
      }}
    />
  {/if}

  <FeedArticleComposer
    open={composerOpen}
    channels={composerIsSuggestion && composerChannelId != null
      ? [{
          id: composerChannelId,
          title: asideChannel?.id === composerChannelId
            ? (asideChannel.title || `Канал #${composerChannelId}`)
            : (subscriptions.find((c) => c.id === composerChannelId)?.title || `Канал #${composerChannelId}`),
          avatar: asideChannel?.id === composerChannelId
            ? asideChannel.avatar
            : subscriptions.find((c) => c.id === composerChannelId)?.avatar,
          is_blog: false,
        }]
      : composerChannels}
    initialChannelId={composerChannelId}
    createBusy={createBusy}
    repostArticle={composerRepost}
    editArticle={composerEdit}
    draftId={composerDraftId}
    initialDraft={composerDraft}
    isSuggestion={composerIsSuggestion}
    onClose={closeComposer}
    onPublished={onArticlePublished}
    onCreateBlog={() => void createChannel()}
  />
</div>
