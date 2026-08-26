<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2Tabs, { type UiV2TabItem } from '../components/uikit-v2/UiV2Tabs.svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2Select, { type UiV2SelectOption } from '../components/uikit-v2/UiV2Select.svelte';
  import FeedArticleCard from '../components/feed/FeedArticleCard.svelte';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { navigate } from '../stores/navigation';
  import { FEED_DATE_OPTIONS, type FeedArticle, type FeedDateFilter } from '../types/feed';
  import { channelAvatarUrl } from '../utils/feed-article';
  import { iconNewspaper, iconRefreshCw } from '../components/icons';

  type FeedTab = 'my' | 'latest' | 'managed';
  type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'need-auth';

  interface EditorChannel {
    id: number;
    title: string;
    avatar?: string | null;
    subscriber_count?: number;
    is_blog?: boolean;
  }

  let tab = $state<FeedTab>('my');
  let dateFilter = $state<FeedDateFilter>(0);
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

  const tabs = $derived.by((): UiV2TabItem[] => [
    { id: 'my', label: 'Моя лента' },
    { id: 'latest', label: 'Свежее' },
    { id: 'managed', label: 'Управляемые' },
  ]);

  const dateOptions = $derived.by((): UiV2SelectOption[] =>
    FEED_DATE_OPTIONS.map((o) => ({ value: String(o.id), label: o.label })),
  );

  function normalizeArticles(raw: unknown): FeedArticle[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        const a = item as FeedArticle;
        if (!a || typeof a !== 'object' || !(Number(a.id) > 0)) return null;
        return a;
      })
      .filter((a): a is FeedArticle => a != null);
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
        ? await api.my(nextPage, { date: dateFilter })
        : await api.latest(nextPage);
      const list = normalizeArticles(res?.content);
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

  async function reload() {
    page = 0;
    await fetchPage(0, false);
  }

  function onTabChange(id: string) {
    if (id === 'my' || id === 'latest' || id === 'managed') {
      if (id === 'my' && !authed && !requireAuth()) return;
      tab = id;
      void reload();
    }
  }

  function onDateChange(value: string) {
    const n = Number(value) as FeedDateFilter;
    if (!Number.isFinite(n)) return;
    dateFilter = n;
    void reload();
  }

  function loadMore() {
    if (!hasMore || loadingMore || loadState === 'loading') return;
    void fetchPage(page + 1, true);
  }

  function onOpenArticle(article: FeedArticle) {
    navigate(`/article/${article.id}`);
  }

  function onOpenChannel(channelId: number) {
    if (channelId > 0) navigate(`/channel/${channelId}`);
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

  onMount(() => {
    const unsub = isAuthenticated.subscribe((v) => {
      authed = v;
    });
    void reload();
    return unsub;
  });
</script>

<div class="view view-feed">
  <header class="feed-page__header">
    <div class="feed-page__title-row">
      <span class="feed-page__icon" aria-hidden="true">{@html iconNewspaper(22)}</span>
      <h1 class="feed-page__title">Лента</h1>
    </div>
    <p class="feed-page__subtitle">Статьи каналов и блогов Anixart</p>
  </header>

  <div class="feed-page__tabs">
    <UiV2Tabs {tabs} activeId={tab} onChange={onTabChange} />
  </div>

  {#if tab === 'my'}
    <div class="feed-page__toolbar">
      <div class="feed-page__date">
        <UiV2Select
          label="Период"
          options={dateOptions}
          value={String(dateFilter)}
          onChange={onDateChange}
        />
      </div>
      <UiV2Button
        variant="ghost"
        size="sm"
        label="Обновить"
        disabled={loadState === 'loading'}
        onclick={() => void reload()}
      >
        {#snippet icon()}{@html iconRefreshCw(16)}{/snippet}
      </UiV2Button>
    </div>
  {:else if tab === 'latest' || tab === 'managed'}
    <div class="feed-page__toolbar feed-page__toolbar--end">
      <UiV2Button
        variant="ghost"
        size="sm"
        label="Обновить"
        disabled={loadState === 'loading' || managedBusy}
        onclick={() => void reload()}
      >
        {#snippet icon()}{@html iconRefreshCw(16)}{/snippet}
      </UiV2Button>
    </div>
  {/if}

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
            <div class="feed-article feed-article--skeleton" aria-hidden="true"></div>
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
          {#if managed.length === 0}
            <UiV2Card title="Нет управляемых каналов">
              <p class="feed-page__hint">
                Создайте блог или получите права редактора в канале — они появятся здесь.
              </p>
            </UiV2Card>
          {:else}
            <ul class="feed-managed__list">
              {#each managed as ch (ch.id)}
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
    {:else if loadState === 'need-auth'}
      <UiV2Card title="Нужен вход">
        <p class="feed-page__hint">
          Войдите в аккаунт Anixart, чтобы видеть статьи каналов, на которые вы подписаны.
        </p>
        <UiV2Button variant="primary" label="Войти" onclick={() => requireAuth()} />
      </UiV2Card>
    {:else if loadState === 'loading'}
      <div class="feed-page__list" aria-busy="true">
        {#each Array.from({ length: 4 }) as _, i (i)}
          <div class="feed-article feed-article--skeleton" aria-hidden="true"></div>
        {/each}
      </div>
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
        {#each articles as article (article.id)}
          <FeedArticleCard
            {article}
            onOpen={onOpenArticle}
            onChannel={onOpenChannel}
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
