<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2Select, { type UiV2SelectOption } from '../components/uikit-v2/UiV2Select.svelte';
  import FeedArticleCard from '../components/feed/FeedArticleCard.svelte';
  import UiV2FeedPostSkeleton from '../components/uikit-v2/UiV2FeedPostSkeleton.svelte';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { navigate } from '../stores/navigation';
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
    formatSubscriberLabel,
    normalizeArticleVote,
  } from '../utils/feed-article';
  import UiV2FeedChannelCard from '../components/uikit-v2/UiV2FeedChannelCard.svelte';
  import UiV2FeedRecommended from '../components/uikit-v2/UiV2FeedRecommended.svelte';
  import {
    iconFlame,
    iconNewspaper,
    iconRefreshCw,
    iconSearch,
    iconSparkles,
    iconUsers,
    iconX,
  } from '../components/icons';

  type FeedTab = 'my' | 'latest' | 'managed';
  type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'need-auth';

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

  const dateOptions = $derived.by((): UiV2SelectOption[] =>
    FEED_DATE_OPTIONS.map((o) => ({ value: String(o.id), label: o.label })),
  );

  const asideChannel = $derived(
    sidebarChannel
    ?? (channelFilterId != null
      ? (subscriptions.find((c) => c.id === channelFilterId) ?? null)
      : null),
  );

  const mainTitle = $derived(
    searchMode
      ? 'Поиск'
      : tab === 'my'
        ? (channelFilterId != null
          ? (asideChannel?.title ?? subscriptions.find((c) => c.id === channelFilterId)?.title ?? 'Канал')
          : 'Моя лента')
        : tab === 'latest'
          ? 'Свежее'
          : 'Управляемые',
  );

  const recommendedChannels = $derived.by(() => {
    const skipId = asideChannel?.id ?? channelFilterId ?? 0;
    const seen = new Set<number>();
    const list: FeedChannel[] = [];
    const push = (ch: FeedChannel | null | undefined) => {
      if (!ch?.id || seen.has(ch.id) || ch.id === skipId) return;
      seen.add(ch.id);
      list.push(ch);
    };
    for (const a of articles) push(a.channel ?? undefined);
    for (const ch of subscriptions) push(ch);
    return list.slice(0, 8);
  });

  const searchNeedle = $derived(searchQuery.trim().toLowerCase());
  const searchMode = $derived(tab !== 'managed' && searchNeedle.length > 0);
  const searchPlaceholder = $derived(
    tab === 'managed' ? 'Поиск каналов…' : 'Поиск записей в ленте…',
  );
  const feedNoAside = $derived(
    tab === 'managed'
      || searchMode
      || !(asideChannel || recommendedChannels.length > 0),
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

  const visibleArticles = $derived(searchMode ? searchArticles : articles);
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
        const c = item as FeedChannel;
        if (!c || typeof c !== 'object' || !(Number(c.id) > 0)) return null;
        return {
          ...c,
          is_subscribed: c.is_subscribed !== false,
          subscriber_count: channelSubscriberCount(c),
        };
      })
      .filter((c): c is FeedChannel => c != null);
  }

  function withLocalSubscribeFlags(list: FeedArticle[]): FeedArticle[] {
    if (tab !== 'my') return list;
    const subIds = new Set(subscriptions.map((c) => c.id));
    return list.map((a) => {
      const ch = a.channel;
      if (!ch?.id) return a;
      if (ch.is_subscribed === true) return a;
      const known = subIds.has(ch.id) || channelFilterId === ch.id;
      return {
        ...a,
        channel: { ...ch, is_subscribed: known || ch.is_subscribed !== false },
      };
    });
  }

  async function loadSidebarChannel(channelId: number | null): Promise<void> {
    if (channelId == null || channelId <= 0) {
      sidebarChannel = null;
      return;
    }
    try {
      const res = await window.anixApi?.channel?.info?.(channelId);
      const ch = (res?.channel ?? null) as FeedChannel | null;
      sidebarChannel = ch?.id ? ch : null;
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

    if (tab === 'my' && !authed) {
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
      const res = tab === 'my'
        ? await api.my(nextPage, {
            date: dateFilter,
            ...(channelFilterId != null ? { channelId: channelFilterId } : {}),
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
    if (searchMode) {
      await fetchSearch(searchQuery.trim(), 0, false);
      return;
    }
    page = 0;
    await fetchPage(0, false);
  }

  function onTabChange(id: FeedTab) {
    if (id === 'my' && !authed && !requireAuth()) return;
    if (id === 'managed' && !authed && !requireAuth()) return;
    tab = id;
    if (id !== 'my') channelFilterId = null;
    void loadSidebarChannel(id === 'my' ? channelFilterId : null);
    void reload();
  }

  function onDateChange(value: string) {
    const n = Number(value) as FeedDateFilter;
    if (!Number.isFinite(n)) return;
    dateFilter = n;
    void reload();
  }

  function selectSubscription(channelId: number | null) {
    if (channelId != null && !authed && !requireAuth()) return;
    tab = 'my';
    channelFilterId = channelId;
    void loadSidebarChannel(channelId);
    void reload();
  }

  function onOpenArticle(article: FeedArticle) {
    navigate(`/article/${article.id}`);
  }

  function onOpenChannel(channelId: number) {
    if (channelId > 0) navigate(`/channel/${channelId}`);
  }

  async function onVoteArticle(article: FeedArticle, nextVote: 0 | 1 | 2) {
    if (!window.anixApi?.article?.vote) return;
    const prevVote = normalizeArticleVote(article.vote);
    if (prevVote === nextVote) return;
    articles = articles.map((a) => (a.id === article.id ? applyArticleVote(a, nextVote) : a));
    searchArticles = searchArticles.map((a) => (a.id === article.id ? applyArticleVote(a, nextVote) : a));
    try {
      await window.anixApi.article.vote(article.id, nextVote);
    } catch (err) {
      articles = articles.map((a) => (a.id === article.id ? applyArticleVote(a, prevVote) : a));
      searchArticles = searchArticles.map((a) => (a.id === article.id ? applyArticleVote(a, prevVote) : a));
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
    articles = articles.map((a) => {
      if (a.channel?.id !== channelId) return a;
      return { ...a, channel: { ...a.channel, is_subscribed: nextSubscribed } };
    });
    searchArticles = searchArticles.map((a) => {
      if (a.channel?.id !== channelId) return a;
      return { ...a, channel: { ...a.channel, is_subscribed: nextSubscribed } };
    });
    searchChannels = searchChannels.map((ch) => (
      ch.id === channelId ? { ...ch, is_subscribed: nextSubscribed } : ch
    ));
    searchBlogs = searchBlogs.map((ch) => (
      ch.id === channelId ? { ...ch, is_subscribed: nextSubscribed } : ch
    ));
    if (sidebarChannel?.id === channelId) {
      sidebarChannel = { ...sidebarChannel, is_subscribed: nextSubscribed };
    }
    if (nextSubscribed) {
      const fromArticle =
        articles.find((a) => a.channel?.id === channelId)?.channel
        ?? searchArticles.find((a) => a.channel?.id === channelId)?.channel
        ?? searchChannels.find((c) => c.id === channelId)
        ?? searchBlogs.find((c) => c.id === channelId);
      if (fromArticle && !subscriptions.some((c) => c.id === channelId)) {
        subscriptions = [...subscriptions, { ...fromArticle, is_subscribed: true }];
      }
    } else {
      subscriptions = subscriptions.filter((c) => c.id !== channelId);
      if (channelFilterId === channelId) channelFilterId = null;
    }

    try {
      if (nextSubscribed) await api.subscribe(channelId);
      else await api.unsubscribe(channelId);
    } catch (err) {
      articles = prevArticles;
      searchArticles = prevSearch;
      searchChannels = prevSearchChannels;
      searchBlogs = prevSearchBlogs;
      subscriptions = prevSubs;
      errorMsg = String(err);
    }
  }

  function onArticleRemove(articleId: number) {
    articles = articles.filter((a) => a.id !== articleId);
    searchArticles = searchArticles.filter((a) => a.id !== articleId);
  }

  function onArticleChange(next: FeedArticle) {
    articles = articles.map((a) => (a.id === next.id ? next : a));
    searchArticles = searchArticles.map((a) => (a.id === next.id ? next : a));
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
      if (newId > 0) navigate(`/channel/${newId}`);
    } catch (err) {
      errorMsg = String(err);
    } finally {
      createBusy = false;
    }
  }

  function applySearchTag(tag: string) {
    searchQuery = tag.replace(/^#/, '').trim();
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
    const unsub = isAuthenticated.subscribe((v) => {
      authed = v;
      if (v) void loadSubscriptions();
      else subscriptions = [];
    });
    void reload();
    return unsub;
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
    <nav class="feed-side__nav">
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
        class:feed-side__item--active={tab === 'my' && channelFilterId == null}
        onclick={() => onTabChange('my')}
      >
        <span class="feed-side__item-icon" aria-hidden="true">{@html iconNewspaper(18)}</span>
        <span class="feed-side__item-label">Моя лента</span>
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

    {#if authed}
      <div class="feed-side__section">
        <p class="feed-side__section-title">Подписки</p>
        {#if subscriptions.length === 0}
          <p class="feed-side__empty">Пока нет подписок</p>
        {:else}
          <ul class="feed-side__topics">
            <li>
              <button
                type="button"
                class="feed-side__topic"
                class:feed-side__topic--active={tab === 'my' && channelFilterId == null}
                onclick={() => selectSubscription(null)}
              >
                <span class="feed-side__topic-icon feed-side__topic-icon--all" aria-hidden="true">
                  {@html iconSparkles(14)}
                </span>
                <span class="feed-side__topic-label">Все подписки</span>
              </button>
            </li>
            {#each subscriptions as ch (ch.id)}
              <li>
                <button
                  type="button"
                  class="feed-side__topic"
                  class:feed-side__topic--active={tab === 'my' && channelFilterId === ch.id}
                  onclick={() => selectSubscription(ch.id)}
                >
                  <span
                    class="feed-side__topic-avatar"
                    class:feed-side__topic-avatar--empty={!channelAvatarUrl(ch.avatar)}
                    style={channelAvatarUrl(ch.avatar)
                      ? `background-image:url('${channelAvatarUrl(ch.avatar)}')`
                      : undefined}
                    aria-hidden="true"
                  ></span>
                  <span class="feed-side__topic-label">{ch.title || `Канал #${ch.id}`}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </aside>

  <div class="feed-main">
    <header class="feed-page__header">
      <div class="feed-page__title-row">
        <h1 class="feed-page__title">{mainTitle}</h1>
      </div>
      <div class="feed-page__toolbar">
        {#if tab === 'my' && !searchMode}
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
          disabled={loadState === 'loading' || managedBusy || searchBusy || searchLoadState === 'loading'}
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
                      onclick={() => navigate(`/channel/${ch.id}`)}
                    >
                      <span
                        class="feed-article__avatar"
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
            <section class="feed-search-section" aria-label="Каналы">
              <h2 class="feed-search-section__title">Каналы</h2>
              <div class="feed-search-carousel">
                {#each searchChannels as ch (ch.id)}
                  <button
                    type="button"
                    class="feed-search-person"
                    onclick={() => onOpenChannel(ch.id)}
                  >
                    <span
                      class="feed-search-person__avatar"
                      class:feed-search-person__avatar--empty={!channelAvatarUrl(ch.avatar)}
                      style={channelAvatarUrl(ch.avatar)
                        ? `background-image:url('${channelAvatarUrl(ch.avatar)}')`
                        : undefined}
                      aria-hidden="true"
                    ></span>
                    <span class="feed-search-person__name">{ch.title || `Канал #${ch.id}`}</span>
                    <span class="feed-search-person__meta">{formatSubscriberLabel(ch.subscriber_count)}</span>
                  </button>
                {/each}
              </div>
            </section>
          {/if}
          {#if searchBlogs.length > 0}
            <section class="feed-search-section" aria-label="Блоги">
              <h2 class="feed-search-section__title">Блоги</h2>
              <div class="feed-search-carousel">
                {#each searchBlogs as ch (ch.id)}
                  <button
                    type="button"
                    class="feed-search-person"
                    onclick={() => onOpenChannel(ch.id)}
                  >
                    <span
                      class="feed-search-person__avatar"
                      class:feed-search-person__avatar--empty={!channelAvatarUrl(ch.avatar)}
                      style={channelAvatarUrl(ch.avatar)
                        ? `background-image:url('${channelAvatarUrl(ch.avatar)}')`
                        : undefined}
                      aria-hidden="true"
                    ></span>
                    <span class="feed-search-person__name">{ch.title || `Блог #${ch.id}`}</span>
                    <span class="feed-search-person__meta">{formatSubscriberLabel(ch.subscriber_count)}</span>
                  </button>
                {/each}
              </div>
            </section>
          {/if}
          {#if searchArticles.length > 0}
            <section class="feed-search-section" aria-label="Записи">
              <h2 class="feed-search-section__title">Записи</h2>
              <div class="feed-page__list">
                {#each searchArticles as article (article.id)}
                  <FeedArticleCard
                    {article}
                    onOpen={onOpenArticle}
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
              onOpen={onOpenArticle}
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

  {#if tab !== 'managed' && !searchMode && (asideChannel || recommendedChannels.length > 0)}
    <aside class="feed-aside" aria-label="О канале">
      {#if asideChannel}
        <UiV2FeedChannelCard
          data={{
            id: asideChannel.id,
            title: asideChannel.title,
            description: asideChannel.description,
            avatar: channelAvatarUrl(asideChannel.avatar),
            cover: asideChannel.cover,
            isVerified: !!asideChannel.is_verified,
            isSubscribed: !!asideChannel.is_subscribed,
            subscriberCount: channelSubscriberCount(asideChannel),
            articleCount: asideChannel.article_count,
          }}
          onOpen={onOpenChannel}
          onSubscribe={onSubscribeChannel}
        />
      {/if}
      <UiV2FeedRecommended
        items={recommendedChannels.map((ch) => ({
          id: ch.id,
          title: ch.title || `Канал #${ch.id}`,
          avatar: channelAvatarUrl(ch.avatar),
          isVerified: !!ch.is_verified,
          subscriberCount: channelSubscriberCount(ch),
        }))}
        onOpen={onOpenChannel}
      />
    </aside>
  {/if}
  </div>
</div>
