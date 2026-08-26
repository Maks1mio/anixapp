<script lang="ts">
  import type { FeedArticle } from '../../types/feed';
  import {
    articleMediaItems,
    articlePreviewText,
    channelAvatarUrl,
    formatFeedRelativeTime,
  } from '../../utils/feed-article';
  import { iconMessageCircle, iconHeart } from '../icons';

  interface Props {
    article: FeedArticle;
    onOpen?: (article: FeedArticle) => void;
    onChannel?: (channelId: number) => void;
  }

  let { article, onOpen, onChannel }: Props = $props();

  const channel = $derived(article.channel ?? null);
  const title = $derived(channel?.title?.trim() || 'Канал');
  const avatar = $derived(channelAvatarUrl(channel?.avatar));
  const timeStr = $derived(formatFeedRelativeTime(article.creation_date ?? article.last_update_date));
  const preview = $derived(articlePreviewText(article));
  const media = $derived(articleMediaItems(article, 4));
  const comments = $derived(Math.max(0, Number(article.comment_count ?? 0)));
  const votes = $derived(Math.max(0, Number(article.vote_count ?? 0)));

  function openArticle() {
    onOpen?.(article);
  }

  function openChannel(e: MouseEvent) {
    e.stopPropagation();
    if (channel?.id) onChannel?.(channel.id);
  }
</script>

<article class="feed-article">
  <div class="feed-article__main">
    <header class="feed-article__head">
      <button
        type="button"
        class="feed-article__channel"
        onclick={openChannel}
        aria-label={`Канал ${title}`}
      >
        <span
          class="feed-article__avatar"
          class:feed-article__avatar--empty={!avatar}
          style={avatar ? `background-image:url('${avatar}')` : undefined}
          aria-hidden="true"
        ></span>
        <span class="feed-article__channel-meta">
          <span class="feed-article__channel-title">
            {title}
            {#if channel?.is_verified}
              <span class="feed-article__verified" title="Подтверждённый канал" aria-hidden="true">✓</span>
            {/if}
          </span>
          {#if timeStr}
            <span class="feed-article__time">{timeStr}</span>
          {/if}
        </span>
      </button>
    </header>

    <button type="button" class="feed-article__body-btn" onclick={openArticle}>
      {#if preview}
        <p class="feed-article__text">{preview}</p>
      {/if}

      {#if media.length === 1}
        <div class="feed-article__media" aria-hidden="true">
          {#if media[0].kind === 'video'}
            <video class="feed-article__media-img" src={media[0].url} muted playsinline preload="metadata"></video>
          {:else}
            <img class="feed-article__media-img" src={media[0].url} alt="" loading="lazy" decoding="async" />
          {/if}
        </div>
      {:else if media.length > 1}
        <div
          class="feed-article__gallery"
          class:feed-article__gallery--2={media.length === 2}
          class:feed-article__gallery--3={media.length === 3}
          class:feed-article__gallery--4={media.length >= 4}
          aria-hidden="true"
        >
          {#each media.slice(0, 4) as item, i (item.url + i)}
            <div class="feed-article__gallery-cell">
              {#if item.kind === 'video'}
                <video src={item.url} muted playsinline preload="metadata"></video>
              {:else}
                <img src={item.url} alt="" loading="lazy" decoding="async" />
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </button>

    <footer class="feed-article__foot">
      <span class="feed-article__stat" title="Оценки">
        {@html iconHeart(14)}
        {votes}
      </span>
      <span class="feed-article__stat" title="Комментарии">
        {@html iconMessageCircle(14)}
        {comments}
      </span>
    </footer>
  </div>
</article>
