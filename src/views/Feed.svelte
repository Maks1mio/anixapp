<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2Select, { type UiV2SelectOption } from '../components/uikit-v2/UiV2Select.svelte';
  import FeedArticleCard from '../components/feed/FeedArticleCard.svelte';
  import UiV2FeedPostSkeleton from '../components/uikit-v2/UiV2FeedPostSkeleton.svelte';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { navigate } from '../stores/navigation';
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
    getFeedSideCollapse,
    pushFeedBrowseChannel,
    pushFeedBrowsePost,
    setFeedSideCollapse,
    type FeedBrowseHistoryItem,
  } from '../utils/feed-browse-history';
  import UiV2FeedChannelCard from '../components/uikit-v2/UiV2FeedChannelCard.svelte';
  import UiV2FeedRecommended from '../components/uikit-v2/UiV2FeedRecommended.svelte';
  import {
    iconArrowLeft,
    iconChevronDown,
    iconClock,
    iconFlame,
    iconNewspaper,
    iconPin,
    iconRefreshCw,
    iconSearch,
    iconUsers,
    iconX,
  } from '../components/icons';

  type FeedTab = 'my' | 'latest' | 'managed';
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

  let tab = $state<FeedTab>('latest');
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
  let sidebarChannel = $state<FeedChannel | null>(null);
  let searchQuery = $state('');
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
  let recommendChannels = $state<FeedChannel[]>([]);
  let recommendBlogs = $state<FeedChannel[]>([]);
  /** Инкремент после mark-seen — чтобы точки обновились. */
  let lastSeenTick = $state(0);
  /** Инкремент после pin/unpin. */
  let pinTick = $state(0);
  /** Инкремент после записи в историю сайдбара. */
  let historyTick = $state(0);
  let feedCollapsed = $state(false);
  let historyCollapsed = $state(false);
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

  function applyFeedListSnapshot(s: FeedListSnapshot) {
    tab = s.tab;
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

  const dateOptions = $derived.by((): UiV2SelectOption[] =>
    FEED_DATE_OPTIONS.map((o) => ({ value: String(o.id), label: o.label })),
  );

  const asideChannel = $derived(
    sidebarChannel
    ?? (channelFilterId != null
      ? (subscriptions.find((c) => c.id === channelFilterId) ?? null)
      : null),
  );

  const displayAsideChannel = $derived(focusChannel ?? asideChannel);
  /** Просмотр поста: выбранная запись + остальные посты канала/блога ниже. */
  const postViewActive = $derived(!!focusArticle && !!focusChannel);
  const moreFromTitle = $derived(
    focusChannel?.is_blog ? 'Ещё от пользователя' : 'Ещё от сообщества',
  );

  const mainTitle = $derived(
    postViewActive
      ? (focusChannel?.title?.trim()
        || (focusChannel?.is_blog ? 'Блог' : 'Канал'))
      : searchMode
        ? 'Поиск'
        : tab === 'my'
          ? (channelFilterId != null
            ? (asideChannel?.title ?? subscriptions.find((c) => c.id === channelFilterId)?.title ?? 'Канал')
            : 'Лента')
          : tab === 'latest'
            ? 'Свежее'
            : 'Управляемые',
  );

  const recommendChannelsMapped = $derived(
    recommendChannels.map((ch) => ({
      id: ch.id,
      title: ch.title || `Канал #${ch.id}`,
      avatar: channelAvatarUrl(ch.avatar),
      isVerified: !!ch.is_verified,
      isSubscribed: !!ch.is_subscribed,
      subscriberCount: channelSubscriberCount(ch),
    })),
  );
  const recommendBlogsMapped = $derived(
    recommendBlogs.map((ch) => ({
      id: ch.id,
      title: ch.title || `Блог #${ch.id}`,
      avatar: channelAvatarUrl(ch.avatar),
      isVerified: !!ch.is_verified,
      isSubscribed: !!ch.is_subscribed,
      subscriberCount: channelSubscriberCount(ch),
    })),
  );
  const hasAsideLists = $derived(
    recommendChannelsMapped.length > 0 || recommendBlogsMapped.length > 0,
  );

  const searchNeedle = $derived(searchQuery.trim().toLowerCase());
  const searchMode = $derived(tab !== 'managed' && searchNeedle.length > 0);
  const searchPlaceholder = $derived(
    tab === 'managed' ? 'Поиск каналов…' : 'Поиск записей в ленте…',
  );
  const feedNoAside = $derived(
    tab === 'managed'
      || (!postViewActive && searchMode)
      || (!postViewActive && !(asideChannel || hasAsideLists)),
  );

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
    searchNeedle
      ? managed.filter((ch) => (ch.title || '').toLowerCase().includes(searchNeedle))
      : managed,
  );

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

  /** Закрепы сверху, затем свежие. Только подписки. */
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
  };

  const feedCollapsedAvatars = $derived(
    displaySubscriptions.slice(0, 3).map((ch) => ({
      key: `sub-${ch.id}`,
      avatar: ch.avatar,
      is_blog: ch.is_blog,
      title: ch.title || `Канал #${ch.id}`,
    })),
  );

  const historyCollapsedAvatars = $derived.by((): SidePreviewAvatar[] => {
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

  const pinnedIdSet = $derived.by(() => {
    void pinTick;
    return new Set(getSubscriptionPins());
  });

  const subscriptionSelected = $derived(
    tab === 'my'
      && channelFilterId != null
      && isLocalSubscription(channelFilterId),
  );
  const historyChannelSelected = $derived(
    !postViewActive && tab === 'my' && channelFilterId != null,
  );
  const historyPostSelected = $derived(
    postViewActive && !!focusArticle?.id,
  );
  const historySelected = $derived(historyChannelSelected || historyPostSelected);

  function subscriptionIsPinned(channelId: number): boolean {
    return pinnedIdSet.has(channelId);
  }

  function onTogglePin(e: MouseEvent, channelId: number) {
    e.stopPropagation();
    e.preventDefault();
    toggleSubscriptionPin(channelId);
    pinTick += 1;
  }

  function persistSideCollapse() {
    setFeedSideCollapse({ feed: feedCollapsed, history: historyCollapsed });
  }

  function toggleFeedCollapsed(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    feedCollapsed = !feedCollapsed;
    persistSideCollapse();
  }

  function toggleHistoryCollapsed(e?: MouseEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    historyCollapsed = !historyCollapsed;
    persistSideCollapse();
  }

  function rememberBrowseChannel(channel: FeedChannel | null | undefined) {
    const id = Number(channel?.id ?? 0);
    if (!(id > 0)) return;
    const guest = !isLocalSubscription(id);
    pushFeedBrowseChannel(channel);
    historyTick += 1;
    if (guest && historyCollapsed) {
      historyCollapsed = false;
      persistSideCollapse();
    }
  }

  function rememberBrowsePost(article: FeedArticle | null | undefined) {
    if (!article?.id) return;
    pushFeedBrowsePost(article);
    const ch = article.channel;
    const channelId = Number(ch?.id ?? 0);
    if (channelId > 0) {
      pushFeedBrowseChannel(ch);
    }
    historyTick += 1;
  }

  function historyItemActive(item: FeedBrowseHistoryItem): boolean {
    if (item.kind === 'post') {
      return postViewActive && focusArticle?.id === item.id;
    }
    return (
      !postViewActive
      && tab === 'my'
      && channelFilterId === item.id
    );
  }

  function onHistoryItemClick(item: FeedBrowseHistoryItem) {
    if (item.kind === 'channel') {
      openChannelFeed(item.id);
      return;
    }
    void selectArticleById(item.id);
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
      return;
    }
    try {
      const res = await window.anixApi?.channel?.info?.(channelId);
      const ch = (res?.channel ?? null) as FeedChannel | null;
      sidebarChannel = ch?.id
        ? mergeChannelSubscribeFlag(ch)
        : (subscriptions.find((c) => c.id === channelId) ?? null);
    } catch {
      sidebarChannel = subscriptions.find((c) => c.id === channelId) ?? null;
    }
  }

  async function loadSubscriptions(): Promise<void> {
    if (!authed || !window.anixApi?.channel?.subscriptions) {
      subscriptions = [];
      return;
    }
    try {
      const res = await window.anixApi.channel.subscriptions(0);
      subscriptions = normalizeChannels(res?.content);
    } catch {
      subscriptions = [];
    }
  }

  async function loadRecommendations(): Promise<void> {
    const api = window.anixApi?.channel?.recommendations;
    if (!api) {
      recommendChannels = [];
      recommendBlogs = [];
      return;
    }
    try {
      const [channelsRes, blogsRes] = await Promise.all([
        api(0, { isBlog: false, excludeSubscribed: true }),
        api(0, { isBlog: true, excludeSubscribed: true }),
      ]);
      recommendChannels = normalizeChannels(channelsRes?.content).slice(0, 12);
      recommendBlogs = normalizeChannels(blogsRes?.content).slice(0, 12);
    } catch {
      recommendChannels = [];
      recommendBlogs = [];
    }
  }

  function patchChannelSubscribe(list: FeedChannel[], channelId: number, next: boolean): FeedChannel[] {
    return list.map((ch) => (
      ch.id === channelId ? { ...ch, is_subscribed: next } : ch
    ));
  }

  async function fetchPage(nextPage: number, append: boolean): Promise<void> {
    const api = window.anixApi?.feed;
    if (!api) {
      loadState = 'error';
      errorMsg = 'API недоступно';
      return;
    }

    if (tab === 'managed') {
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

    if (tab === 'my' && !authed && channelFilterId == null) {
      loadState = 'need-auth';
      articles = [];
      hasMore = false;
      return;
    }

    if (append) loadingMore = true;
    else {
      loadState = 'loading';
      errorMsg = '';
    }

    try {
      let res: { content?: unknown; total_page_count?: number } | null | undefined;
      if (tab === 'my' && channelFilterId != null) {
        const channelApi = window.anixApi?.channel;
        if (!channelApi?.articles) {
          loadState = 'error';
          errorMsg = 'API недоступно';
          return;
        }
        res = await channelApi.articles(channelFilterId, nextPage);
        const list = withLocalSubscribeFlags(normalizeArticles(res?.content)).map((a) => ({
          ...a,
          channel: a.channel
            ? {
                ...a.channel,
                id: a.channel.id || channelFilterId,
              }
            : a.channel,
        }));
        articles = append ? [...articles, ...list] : list;
        page = nextPage;
        const totalPages = Number(res?.total_page_count ?? 0);
        hasMore = totalPages > 0
          ? nextPage + 1 < totalPages
          : list.length >= 10;
        loadState = articles.length === 0 ? 'empty' : 'ready';
        return;
      }

      res = tab === 'my'
        ? await api.my(nextPage, {
            date: dateFilter,
          })
        : await api.latest(nextPage);
      const list = withLocalSubscribeFlags(normalizeArticles(res?.content));
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
    if (searchMode) {
      scrollFeedToTop();
      await fetchSearch(searchQuery.trim(), 0, false);
      return;
    }
    scrollFeedToTop();
    page = 0;
    await fetchPage(0, false);
  }

  function onTabChange(id: FeedTab) {
    if (id === 'my' && !authed && !requireAuth()) return;
    if (id === 'managed' && !authed && !requireAuth()) return;
    if (id === tab && !postViewActive && channelFilterId == null) {
      scrollFeedToTop();
      return;
    }
    clearArticleFocus();
    tab = id;
    channelFilterId = null;
    void loadSidebarChannel(null);
    scrollFeedToTop();
    void reload();
  }

  function onDateChange(value: string) {
    const n = Number(value) as FeedDateFilter;
    if (!Number.isFinite(n)) return;
    clearArticleFocus();
    dateFilter = n;
    scrollFeedToTop();
    void reload();
  }

  function selectSubscription(channelId: number) {
    if (!authed && !requireAuth()) return;
    clearArticleFocus();
    tab = 'my';
    const nextId = channelFilterId === channelId ? null : channelId;
    channelFilterId = nextId;
    if (nextId != null) {
      const ch = subscriptions.find((c) => c.id === nextId);
      markSubscriptionSeen(ch);
      if (ch) rememberBrowseChannel(ch);
      if (feedCollapsed) {
        feedCollapsed = false;
        persistSideCollapse();
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

  function onOpenArticle(article: FeedArticle) {
    void selectArticle(article);
  }

  function onOpenChannel(channelId: number) {
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
    const prevRecChannels = recommendChannels;
    const prevRecBlogs = recommendBlogs;
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
    recommendChannels = patchChannelSubscribe(recommendChannels, channelId, nextSubscribed);
    recommendBlogs = patchChannelSubscribe(recommendBlogs, channelId, nextSubscribed);
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
        ?? searchBlogs.find((c) => c.id === channelId)
        ?? recommendChannels.find((c) => c.id === channelId)
        ?? recommendBlogs.find((c) => c.id === channelId);
      if (fromArticle && !subscriptions.some((c) => c.id === channelId)) {
        subscriptions = [...subscriptions, { ...fromArticle, is_subscribed: true }];
      } else {
        subscriptions = subscriptions.map((c) =>
          c.id === channelId ? { ...c, is_subscribed: true } : c,
        );
      }
      if (feedCollapsed) {
        feedCollapsed = false;
        persistSideCollapse();
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
          ?? subscriptions.find((c) => c.id === channelId)
          ?? recommendBlogs.find((c) => c.id === channelId)
          ?? recommendChannels.find((c) => c.id === channelId);
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
        recommendChannels = recommendChannels.filter((c) => c.id !== channelId);
        recommendBlogs = recommendBlogs.filter((c) => c.id !== channelId);
        void loadSubscriptions();
      }
    } catch (err) {
      articles = prevArticles;
      searchArticles = prevSearch;
      searchChannels = prevSearchChannels;
      searchBlogs = prevSearchBlogs;
      subscriptions = prevSubs;
      recommendChannels = prevRecChannels;
      recommendBlogs = prevRecBlogs;
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

  async function createChannel() {
    if (!authed && !requireAuth()) return;
    const api = window.anixApi?.channel;
    if (!api?.createBlog) return;
    createBusy = true;
    errorMsg = '';
    try {
      const res = await api.createBlog();
      const newId = Number(res?.channel?.id ?? 0);
      await reload();
      if (newId > 0) openChannelFeed(newId);
    } catch (err) {
      errorMsg = String(err);
    } finally {
      createBusy = false;
    }
  }

  function applySearchTag(tag: string) {
    searchQuery = tag.replace(/^#/, '').trim();
  }

  function applyFeedSearchFromRoute(detailQ?: string) {
    const q = String(detailQ ?? getSearchParams().get('q') ?? '').trim();
    if (!q) return;
    if (searchQuery.trim() === q) return;
    searchQuery = q;
  }

  $effect(() => {
    const q = searchQuery.trim();
    const currentTab = tab;
    if (currentTab === 'managed' || !q) {
      clearSearchResults();
      return;
    }
    const handle = setTimeout(() => {
      void fetchSearch(q, 0, false);
    }, 320);
    return () => clearTimeout(handle);
  });

  onMount(() => {
    const collapse = getFeedSideCollapse();
    feedCollapsed = collapse.feed;
    historyCollapsed = collapse.history;

    applyFeedSearchFromRoute();
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

    const unsub = isAuthenticated.subscribe((v) => {
      authed = v;
      if (v) {
        void loadSubscriptions();
        void loadRecommendations();
      } else {
        subscriptions = [];
        void loadRecommendations();
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
    const canRestore =
      !!cached?.data
      && Array.isArray(cached.data.articles)
      && cached.data.articles.length > 0
      && (cached.data.loadState === 'ready' || cached.data.loadState === 'empty');

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
    void loadRecommendations();

    return () => {
      unsub();
      unsubFocus();
      unsubChannelFocus();
      window.removeEventListener('anix:feed-search', onFeedSearch);
      window.removeEventListener('anix:navigate', onNavigate);
      window.removeEventListener('anix:beforeNavigate', onBeforeNavigate);
      window.removeEventListener('popstate', onFeedPopState);
      unregisterScrollKey?.();
      unregisterScrollKey = null;
    };
  });

  onDestroy(() => {
    saveViewStateData(FEED_VIEW_KEY(), feedListSnapshot());
  });
</script>

<div class="view view-feed">
  <div
    class="feed-page__search"
    class:feed-page__search--no-aside={feedNoAside}
  >
    <div class="feed-page__search-inner">
      <label class="feed-page__search-field">
        <span class="feed-page__search-icon" aria-hidden="true">{@html iconSearch(18)}</span>
        <input
          class="feed-page__search-input"
          type="search"
          name="feed-search"
          autocomplete="off"
          spellcheck="false"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          bind:value={searchQuery}
        />
        {#if searchQuery}
          <button
            type="button"
            class="feed-page__search-clear"
            aria-label="Очистить поиск"
            onclick={() => {
              searchQuery = '';
            }}
          >
            {@html iconX(14)}
          </button>
        {/if}
      </label>
    </div>
  </div>

  <div
    class="view-feed__layout"
    class:view-feed__layout--no-aside={feedNoAside}
  >
  <aside class="feed-side" aria-label="Навигация ленты">
    <nav class="feed-side__nav" aria-label="Разделы ленты">
      <button
        type="button"
        class="feed-side__item"
        class:feed-side__item--active={tab === 'latest'}
        onclick={() => onTabChange('latest')}
      >
        <span class="feed-side__item-icon" aria-hidden="true">{@html iconFlame(18)}</span>
        <span class="feed-side__item-label">Свежее</span>
      </button>
      <button
        type="button"
        class="feed-side__item"
        class:feed-side__item--active={tab === 'managed'}
        onclick={() => onTabChange('managed')}
      >
        <span class="feed-side__item-icon" aria-hidden="true">{@html iconUsers(18)}</span>
        <span class="feed-side__item-label">Управляемые</span>
      </button>
    </nav>

    <section class="feed-side__group" aria-label="Лента">
      <div class="feed-side__group-head">
        <button
          type="button"
          class="feed-side__item feed-side__item--group"
          class:feed-side__item--active={tab === 'my' && channelFilterId == null && !postViewActive}
          class:feed-side__item--dim={subscriptionSelected || historySelected}
          onclick={() => onTabChange('my')}
        >
          <span class="feed-side__item-icon" aria-hidden="true">{@html iconNewspaper(18)}</span>
          <span class="feed-side__item-label">Лента</span>
          {#if feedCollapsed && feedCollapsedAvatars.length > 0}
            <span class="feed-side__avatar-stack" aria-hidden="true">
              {#each feedCollapsedAvatars as av (av.key)}
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
          class="feed-side__collapse"
          class:feed-side__collapse--on={!feedCollapsed}
          title={feedCollapsed ? 'Показать ленту' : 'Скрыть ленту'}
          aria-label={feedCollapsed ? 'Показать ленту' : 'Скрыть ленту'}
          aria-expanded={!feedCollapsed}
          onclick={toggleFeedCollapsed}
        >
          {@html iconChevronDown(16)}
        </button>
      </div>

      {#if !feedCollapsed}
        {#if authed}
          {#if displaySubscriptions.length === 0}
            <p class="feed-side__empty">Пока нет подписок</p>
          {:else}
            <ul class="feed-side__topics" class:feed-side__topics--has-selection={subscriptionSelected}>
              {#each displaySubscriptions as ch (ch.id)}
                {@const pinned = subscriptionIsPinned(ch.id)}
                <li class="feed-side__topic-row">
                  <button
                    type="button"
                    class="feed-side__topic"
                    class:feed-side__topic--active={tab === 'my' && channelFilterId === ch.id && !postViewActive}
                    class:feed-side__topic--dim={subscriptionSelected && channelFilterId !== ch.id}
                    onclick={() => selectSubscription(ch.id)}
                    aria-pressed={tab === 'my' && channelFilterId === ch.id && !postViewActive}
                    aria-label={subscriptionIsFresh(ch)
                      ? `${ch.title || `Канал #${ch.id}`}, есть новое`
                      : undefined}
                  >
                    <span
                      class="feed-side__topic-avatar"
                      class:feed-side__topic-avatar--channel={!ch.is_blog}
                      class:feed-side__topic-avatar--empty={!channelAvatarUrl(ch.avatar)}
                      class:feed-side__topic-avatar--fresh={subscriptionIsFresh(ch)}
                      style={channelAvatarUrl(ch.avatar)
                        ? `background-image:url('${channelAvatarUrl(ch.avatar)}')`
                        : undefined}
                      aria-hidden="true"
                    ></span>
                    <span class="feed-side__topic-label">{ch.title || `Канал #${ch.id}`}</span>
                  </button>
                  <button
                    type="button"
                    class="feed-side__topic-pin"
                    class:feed-side__topic-pin--on={pinned}
                    class:feed-side__topic-pin--dim={subscriptionSelected && channelFilterId !== ch.id}
                    title={pinned ? 'Открепить' : 'Закрепить'}
                    aria-label={pinned ? 'Открепить' : 'Закрепить'}
                    aria-pressed={pinned}
                    onclick={(e) => onTogglePin(e, ch.id)}
                  >
                    {@html iconPin(14)}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {:else}
          <p class="feed-side__empty">Войдите, чтобы видеть подписки</p>
        {/if}
      {/if}
    </section>

    <section class="feed-side__group" aria-label="История">
      <div class="feed-side__group-head">
        <button
          type="button"
          class="feed-side__item feed-side__item--group"
          class:feed-side__item--dim={subscriptionSelected && !historySelected}
          onclick={(e) => toggleHistoryCollapsed(e)}
        >
          <span class="feed-side__item-icon" aria-hidden="true">{@html iconClock(18)}</span>
          <span class="feed-side__item-label">История</span>
          {#if historyCollapsed && historyCollapsedAvatars.length > 0}
            <span class="feed-side__avatar-stack" aria-hidden="true">
              {#each historyCollapsedAvatars as av (av.key)}
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
          class="feed-side__collapse"
          class:feed-side__collapse--on={!historyCollapsed}
          title={historyCollapsed ? 'Показать историю' : 'Скрыть историю'}
          aria-label={historyCollapsed ? 'Показать историю' : 'Скрыть историю'}
          aria-expanded={!historyCollapsed}
          onclick={(e) => toggleHistoryCollapsed(e)}
        >
          {@html iconChevronDown(16)}
        </button>
      </div>

      {#if !historyCollapsed}
        {#if browseHistory.length === 0}
          <p class="feed-side__empty">Пока пусто</p>
        {:else}
          <ul class="feed-side__topics" class:feed-side__topics--has-selection={historySelected}>
            {#each browseHistory as item (`${item.kind}-${item.id}`)}
              {@const active = historyItemActive(item)}
              <li class="feed-side__topic-row feed-side__topic-row--history">
                <button
                  type="button"
                  class="feed-side__topic"
                  class:feed-side__topic--active={active}
                  class:feed-side__topic--dim={historySelected && !active}
                  class:feed-side__topic--post={item.kind === 'post'}
                  onclick={() => onHistoryItemClick(item)}
                  aria-pressed={active}
                  aria-label={item.kind === 'post'
                    ? `Пост: ${item.title}`
                    : item.title}
                >
                  <span
                    class="feed-side__topic-avatar"
                    class:feed-side__topic-avatar--channel={!item.is_blog}
                    class:feed-side__topic-avatar--empty={!channelAvatarUrl(item.avatar)}
                    class:feed-side__topic-avatar--post={item.kind === 'post'}
                    style={channelAvatarUrl(item.avatar)
                      ? `background-image:url('${channelAvatarUrl(item.avatar)}')`
                      : undefined}
                    aria-hidden="true"
                  ></span>
                  <span class="feed-side__topic-label">{item.title}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </section>
  </aside>

  <div class="feed-main">
    <header class="feed-page__header">
      <div class="feed-page__title-row">
        {#if postViewActive}
          <button
            type="button"
            class="feed-page__back"
            aria-label="Назад к ленте"
            onclick={exitPostViewToFeed}
          >
            {@html iconArrowLeft(18)}
          </button>
        {/if}
        <h1 class="feed-page__title">{mainTitle}</h1>
      </div>
      <div class="feed-page__toolbar">
        {#if tab === 'my' && !searchMode && !postViewActive}
          <div class="feed-page__date">
            <UiV2Select
              label="Период"
              options={dateOptions}
              value={String(dateFilter)}
              onChange={onDateChange}
            />
          </div>
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

    <div class="feed-page__body">
      {#if tab === 'managed'}
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
            <div class="feed-managed__actions">
              <UiV2Button
                variant="primary"
                label={createBusy ? 'Создание…' : 'Создать блог'}
                disabled={createBusy}
                onclick={() => void createChannel()}
              />
            </div>
            {#if visibleManaged.length === 0}
              <UiV2Card title={searchNeedle ? 'Ничего не найдено' : 'Нет управляемых каналов'}>
                <p class="feed-page__hint">
                  {#if searchNeedle}
                    По запросу «{searchQuery.trim()}» каналов нет. Попробуйте другое слово.
                  {:else}
                    Создайте блог или получите права редактора в канале — они появятся здесь.
                  {/if}
                </p>
              </UiV2Card>
            {:else}
              <ul class="feed-managed__list">
                {#each visibleManaged as ch (ch.id)}
                  <li>
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
            onArticleRemove={onArticleRemove}
            onArticleChange={onArticleChange}
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
                onArticleRemove={onArticleRemove}
                onArticleChange={onArticleChange}
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
        {#if searchLoadState === 'error' && searchArticles.length === 0 && searchChannels.length === 0}
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
                    onArticleRemove={onArticleRemove}
                    onArticleChange={onArticleChange}
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
              onArticleRemove={onArticleRemove}
              onArticleChange={onArticleChange}
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

  {#if tab !== 'managed' && (postViewActive || (!searchMode && (asideChannel || hasAsideLists)))}
    <aside class="feed-aside" aria-label={postViewActive ? 'О канале' : 'Каналы и блоги'}>
      {#if displayAsideChannel}
        <UiV2FeedChannelCard
          data={{
            id: displayAsideChannel.id,
            title: displayAsideChannel.title,
            description: displayAsideChannel.description,
            avatar: channelAvatarUrl(displayAsideChannel.avatar),
            cover: displayAsideChannel.cover,
            isVerified: !!displayAsideChannel.is_verified,
            isSubscribed: channelIsSubscribed(
              displayAsideChannel.id,
              displayAsideChannel.is_subscribed,
            ),
            isBlog: !!displayAsideChannel.is_blog,
            subscriberCount: channelSubscriberCount(displayAsideChannel),
            articleCount: displayAsideChannel.article_count,
          }}
          onOpen={onOpenChannel}
          onSubscribe={onSubscribeChannel}
          subscribeBusy={subscribeBusyId === displayAsideChannel.id}
        />
      {/if}

      {#if !postViewActive}
        <UiV2FeedRecommended
          title="Каналы"
          avatarShape="channel"
          items={recommendChannelsMapped}
          onOpen={onOpenChannel}
        />
        <UiV2FeedRecommended
          title="Блоги"
          avatarShape="circle"
          items={recommendBlogsMapped}
          onOpen={onOpenChannel}
        />
      {/if}
    </aside>
  {/if}
  </div>
</div>
