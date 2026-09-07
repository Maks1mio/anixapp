<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import FeedArticleCard from '../components/feed/FeedArticleCard.svelte';
  import UiV2FeedChannelCard from '../components/uikit-v2/UiV2FeedChannelCard.svelte';
  import type { FeedArticle, FeedChannel } from '../types/feed';
  import {
    applyArticleVote,
    channelAvatarUrl,
    normalizeArticleVote,
  } from '../utils/feed-article';
  import { iconArrowLeft, iconRefreshCw } from '../components/icons';

  interface Props {
    id: number;
  }

  let { id }: Props = $props();

  type LoadState = 'loading' | 'ready' | 'error';

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');
  let channel = $state<FeedChannel | null>(null);
  let articles = $state<FeedArticle[]>([]);
  let page = $state(0);
  let hasMore = $state(false);
  let loadingMore = $state(false);
  let subBusy = $state(false);
  let authed = $state(false);

  const avatar = $derived(channelAvatarUrl(channel?.avatar));
  const subscribed = $derived(!!channel?.is_subscribed);

  function normalizeArticles(raw: unknown): FeedArticle[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is FeedArticle => {
      const a = item as FeedArticle;
      return !!a && typeof a === 'object' && Number(a.id) > 0;
    });
  }

  async function loadChannel() {
    const res = await window.anixApi?.channel?.info?.(id);
    const ch = (res?.channel ?? null) as FeedChannel | null;
    if (!ch?.id) throw new Error('Канал не найден');
    channel = ch;
  }

  async function loadArticles(nextPage: number, append: boolean) {
    if (append) loadingMore = true;
    const res = await window.anixApi?.channel?.articles?.(id, nextPage);
    const list = normalizeArticles(res?.content).map((a) => ({
      ...a,
      channel: {
        ...(a.channel ?? { id, title: channel?.title ?? '' }),
        id: a.channel?.id ?? id,
        is_subscribed: channel?.is_subscribed ?? a.channel?.is_subscribed,
      },
    }));
    articles = append ? [...articles, ...list] : list;
    page = nextPage;
    const totalPages = Number(res?.total_page_count ?? 0);
    hasMore = totalPages > 0 ? nextPage + 1 < totalPages : list.length >= 10;
  }

  async function reload() {
    loadState = 'loading';
    errorMsg = '';
    try {
      await loadChannel();
      await loadArticles(0, false);
      loadState = 'ready';
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    } finally {
      loadingMore = false;
    }
  }

  async function toggleSubscribe() {
    if (!channel || subBusy) return;
    if (!authed && !requireAuth()) return;
    const api = window.anixApi?.channel;
    if (!api?.subscribe || !api.unsubscribe) return;
    subBusy = true;
    const next = !subscribed;
    try {
      if (subscribed) await api.unsubscribe(channel.id);
      else await api.subscribe(channel.id);
      channel = { ...channel, is_subscribed: next };
      articles = articles.map((a) => ({
        ...a,
        channel: a.channel ? { ...a.channel, is_subscribed: next } : a.channel,
      }));
    } catch (err) {
      errorMsg = String(err);
    } finally {
      subBusy = false;
    }
  }

  async function onVoteArticle(article: FeedArticle, nextVote: 0 | 1 | 2) {
    if (!window.anixApi?.article?.vote) return;
    const prevVote = normalizeArticleVote(article.vote);
    if (prevVote === nextVote) return;
    articles = articles.map((a) => (a.id === article.id ? applyArticleVote(a, nextVote) : a));
    try {
      await window.anixApi.article.vote(article.id, nextVote);
    } catch (err) {
      articles = articles.map((a) => (a.id === article.id ? applyArticleVote(a, prevVote) : a));
      errorMsg = String(err);
    }
  }

  function openArticle(article: FeedArticle) {
    navigate(`/article/${article.id}`);
  }

  function onArticleRemove(articleId: number) {
    articles = articles.filter((a) => a.id !== articleId);
  }

  function onArticleChange(next: FeedArticle) {
    articles = articles.map((a) => (a.id === next.id ? next : a));
  }

  onMount(() => {
    const unsub = isAuthenticated.subscribe((v) => {
      authed = v;
    });
    void reload();
    return unsub;
  });
</script>

<div class="view view-channel">
  <div class="article-page__bar">
    <UiV2Button
      label="Назад"
      size="sm"
      variant="ghost"
      onclick={() => (history.length > 1 ? history.back() : navigate('/feed'))}
    >
      {#snippet icon()}{@html iconArrowLeft(16)}{/snippet}
    </UiV2Button>
    <UiV2Button
      label="Обновить"
      size="sm"
      variant="ghost"
      disabled={loadState === 'loading'}
      onclick={() => void reload()}
    >
      {#snippet icon()}{@html iconRefreshCw(16)}{/snippet}
    </UiV2Button>
  </div>

  {#if loadState === 'loading'}
    <div class="article-page__skel" aria-busy="true"></div>
  {:else if loadState === 'error'}
    <UiV2Card title="Ошибка">
      <p class="feed-page__hint">{errorMsg || 'Не удалось загрузить канал.'}</p>
      <UiV2Button label="Повторить" variant="primary" onclick={() => void reload()} />
    </UiV2Card>
  {:else if channel}
    <div class="channel-page__main">
      <h1 class="feed-page__title">Все записи</h1>
      {#if errorMsg}
        <p class="feed-page__hint" role="status">{errorMsg}</p>
      {/if}

      {#if articles.length === 0}
        <UiV2Card title="Пока пусто">
          <p class="feed-page__hint">В этом канале ещё нет записей.</p>
        </UiV2Card>
      {:else}
        <div class="feed-page__list">
          {#each articles as article (article.id)}
            <FeedArticleCard
              {article}
              onOpen={openArticle}
              hideSubscribe
              menuPinAvailable
              onVote={onVoteArticle}
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
              onclick={() => void loadArticles(page + 1, true)}
            />
          </div>
        {/if}
      {/if}
    </div>

    <aside class="channel-page__aside" aria-label="О канале">
      <UiV2FeedChannelCard
        data={{
          id: channel.id,
          title: channel.title,
          description: channel.description,
          avatar: avatar,
          cover: channel.cover,
          isVerified: !!channel.is_verified,
          isSubscribed: subscribed,
          subscriberCount: channel.subscriber_count,
          articleCount: channel.article_count ?? articles.length,
        }}
        subscribeBusy={subBusy}
        onSubscribe={async (_id, _next) => {
          await toggleSubscribe();
        }}
      />
    </aside>
  {/if}
</div>
