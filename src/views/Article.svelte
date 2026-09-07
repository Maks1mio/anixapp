<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../stores/navigation';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import type { FeedArticle } from '../types/feed';
  import {
    articleRenderBlocks,
    applyArticleVote,
    articleTags,
    channelAvatarUrl,
    formatFeedRelativeTime,
    normalizeArticleVote,
    type RenderBlock,
  } from '../utils/feed-article';
  import UiV2FeedChannelCard from '../components/uikit-v2/UiV2FeedChannelCard.svelte';
  import { iconArrowLeft, iconChevronDown, iconChevronUp, iconMessageCircle, iconRepost } from '../components/icons';

  interface Props {
    id: number;
  }

  let { id }: Props = $props();

  type LoadState = 'loading' | 'ready' | 'error';

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');
  let article = $state<FeedArticle | null>(null);
  let voteBusy = $state(false);

  const blocks = $derived(article ? articleRenderBlocks(article) : [] as RenderBlock[]);
  const channel = $derived(article?.channel ?? null);
  const timeStr = $derived(formatFeedRelativeTime(article?.creation_date ?? article?.last_update_date));
  const avatar = $derived(channelAvatarUrl(channel?.avatar));
  const myVote = $derived(normalizeArticleVote(article?.vote));
  const tags = $derived(article ? articleTags(article) : []);
  const votes = $derived(Number(article?.vote_count ?? 0));
  const comments = $derived(Math.max(0, Number(article?.comment_count ?? 0)));
  const shares = $derived(Math.max(0, Number(article?.repost_count ?? 0)));

  async function load() {
    loadState = 'loading';
    errorMsg = '';
    try {
      const res = await window.anixApi?.article?.info?.(id);
      const a = (res?.article ?? null) as FeedArticle | null;
      if (!a?.id) {
        loadState = 'error';
        errorMsg = 'Запись не найдена';
        article = null;
        return;
      }
      article = a;
      loadState = 'ready';
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  }

  async function setVote(next: 0 | 1 | 2) {
    if (!article || voteBusy || !window.anixApi?.article?.vote) return;
    const prev = myVote;
    const resolved = prev === next ? 0 : next;
    voteBusy = true;
    const snapshot = article;
    article = applyArticleVote(article, resolved);
    try {
      await window.anixApi.article.vote(article.id, resolved);
    } catch (err) {
      article = snapshot;
      errorMsg = String(err);
    } finally {
      voteBusy = false;
    }
  }

  function openChannel() {
    if (channel?.id) navigate(`/channel/${channel.id}`);
  }

  function openExternal(url: string) {
    if (window.electron?.openExternal) {
      void window.electron.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onMount(() => {
    void load();
  });
</script>

<div class="view view-article">
  <div class="article-page__bar">
    <UiV2Button
      label="Назад"
      size="sm"
      variant="ghost"
      onclick={() => history.length > 1 ? history.back() : navigate('/feed')}
    >
      {#snippet icon()}{@html iconArrowLeft(16)}{/snippet}
    </UiV2Button>
  </div>

  {#if loadState === 'loading'}
    <div class="article-page__skel" aria-busy="true"></div>
  {:else if loadState === 'error'}
    <UiV2Card title="Ошибка">
      <p class="feed-page__hint">{errorMsg || 'Не удалось загрузить запись.'}</p>
      <UiV2Button label="Повторить" variant="primary" onclick={() => void load()} />
    </UiV2Card>
  {:else if article}
    <div class="article-page__main">
    <header class="article-page__head">
      <button type="button" class="feed-article__channel" onclick={openChannel}>
        <span
          class="feed-article__avatar"
          class:feed-article__avatar--empty={!avatar}
          style={avatar ? `background-image:url('${avatar}')` : undefined}
          aria-hidden="true"
        ></span>
        <span class="feed-article__channel-meta">
          <span class="feed-article__channel-title">
            {channel?.title || 'Канал'}
            {#if channel?.is_verified}
              <span class="feed-article__verified" aria-hidden="true">✓</span>
            {/if}
          </span>
          {#if timeStr}
            <span class="feed-article__time">{timeStr}</span>
          {/if}
        </span>
      </button>
    </header>

    <div class="article-page__content">
      {#each blocks as block, i (i)}
        {#if block.kind === 'text'}
          {#if block.level && block.level <= 2}
            <h2 class="article-page__h">{block.text}</h2>
          {:else if block.level}
            <h3 class="article-page__h3">{block.text}</h3>
          {:else}
            <p class="article-page__p">{block.text}</p>
          {/if}
        {:else if block.kind === 'quote'}
          <blockquote class="article-page__quote">
            <p>{block.text}</p>
            {#if block.caption}<cite>{block.caption}</cite>{/if}
          </blockquote>
        {:else if block.kind === 'list'}
          <ul class="article-page__list">
            {#each block.items as item}
              <li>{item}</li>
            {/each}
          </ul>
        {:else if block.kind === 'media'}
          <div class="article-page__media">
            {#each block.items as item}
              {#if item.kind === 'video'}
                <video src={item.url} controls playsinline preload="metadata"></video>
              {:else}
                <img src={item.url} alt="" loading="lazy" decoding="async" />
              {/if}
            {/each}
          </div>
        {:else if block.kind === 'embed'}
          <button
            type="button"
            class="article-page__embed"
            onclick={() => block.url && openExternal(block.url)}
          >
            {#if block.image}
              <img src={block.image} alt="" loading="lazy" />
            {/if}
            <span class="article-page__embed-body">
              {#if block.siteName}<span class="article-page__embed-site">{block.siteName}</span>{/if}
              {#if block.title}<strong>{block.title}</strong>{/if}
              {#if block.description}<span>{block.description}</span>{/if}
            </span>
          </button>
        {/if}
      {/each}
    </div>

    {#if tags.length > 0}
      <ul class="uiv2-feed-post__tags">
        {#each tags as tag (tag)}
          <li><span class="uiv2-feed-post__tag">#{tag}</span></li>
        {/each}
      </ul>
    {/if}

    <footer class="uiv2-feed-post__foot article-page__feed-foot">
      <div class="uiv2-feed-post__actions">
        <span class="uiv2-feed-post__stat">
          {@html iconMessageCircle(16)}
          <span>{comments}</span>
        </span>
        <span class="uiv2-feed-post__stat">
          {@html iconRepost(16)}
          <span>{shares}</span>
        </span>
      </div>
      <div
        class="uiv2-feed-post__votes"
        class:uiv2-feed-post__votes--plus={votes > 0}
        class:uiv2-feed-post__votes--minus={votes < 0}
      >
        <button
          type="button"
          class="uiv2-feed-post__vote"
          class:uiv2-feed-post__vote--up={myVote === 1}
          title={myVote === 1 ? 'Убрать плюс' : 'Плюс'}
          aria-pressed={myVote === 1}
          aria-label="Плюс"
          disabled={voteBusy}
          onclick={() => void setVote(1)}
        >
          {@html iconChevronUp(16)}
        </button>
        <span class="uiv2-feed-post__score">{votes}</span>
        <button
          type="button"
          class="uiv2-feed-post__vote"
          class:uiv2-feed-post__vote--down={myVote === 2}
          title={myVote === 2 ? 'Убрать минус' : 'Минус'}
          aria-pressed={myVote === 2}
          aria-label="Минус"
          disabled={voteBusy}
          onclick={() => void setVote(2)}
        >
          {@html iconChevronDown(16)}
        </button>
      </div>
    </footer>
    </div>

    {#if channel}
      <aside class="article-page__aside" aria-label="О канале">
        <UiV2FeedChannelCard
          data={{
            id: channel.id,
            title: channel.title,
            description: channel.description,
            avatar,
            cover: channel.cover,
            isVerified: !!channel.is_verified,
            isSubscribed: !!channel.is_subscribed,
            subscriberCount: channel.subscriber_count,
            articleCount: channel.article_count,
          }}
          onOpen={(channelId) => navigate(`/channel/${channelId}`)}
        />
      </aside>
    {/if}
  {/if}
</div>
