<script lang="ts">
  import UiV2FeedPostMediaView from './UiV2FeedPostMedia.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './UiV2PopupMenu.svelte';
  import UiV2RoundButton from './UiV2RoundButton.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import UserBadge from '../UserBadge.svelte';
  import {
    iconMessageCircle,
    iconMoreHorizontal,
    iconRepost,
    iconChevronUp,
    iconChevronDown,
    iconPlus,
  } from '../icons';
  import { normalizeArticleVote, type ArticleVoteValue } from '../../utils/feed-article';
  import { ruCommentsLabel } from '../../utils/feed-top-comment';

  export type UiV2FeedPostMedia = {
    url: string;
    kind: 'image' | 'video' | 'gif';
  };

  export type UiV2FeedPostChannel = {
    id?: number;
    title: string;
    avatar?: string | null;
    badgeUrl?: string | null;
    badgeName?: string | null;
    isVerified?: boolean;
    isSubscribed?: boolean;
    isBlog?: boolean;
  };

  export type UiV2FeedPostRepost = {
    channel: UiV2FeedPostChannel;
    timeStr?: string;
    headline?: string;
    preview?: string;
    media?: UiV2FeedPostMedia[];
    missing?: boolean;
  };

  export type UiV2FeedPostLastComment = {
    author: string;
    avatar?: string | null;
    text: string;
    timeStr?: string;
    isSpoiler?: boolean;
    voteCount?: number;
  };

  export type UiV2FeedPostData = {
    id: number | string;
    channel: UiV2FeedPostChannel;
    timeStr?: string;
    headline?: string;
    preview?: string;
    /** Текст после медиа, скрытый за «Показать ещё». */
    moreText?: string;
    /** Есть скрытый хвост (в т.ч. когда API не прислал остальные блоки). */
    canExpand?: boolean;
    media?: UiV2FeedPostMedia[];
    tags?: string[];
    voteCount?: number;
    commentCount?: number;
    repostCount?: number;
    vote?: ArticleVoteValue;
    voted?: boolean;
    lastComment?: UiV2FeedPostLastComment | null;
    repost?: UiV2FeedPostRepost | null;
    containsRepost?: boolean;
  };

  type Props = {
    data: UiV2FeedPostData;
    showSubscribe?: boolean;
    voteBusy?: boolean;
    subscribeBusy?: boolean;
    onclick?: (data: UiV2FeedPostData) => void;
    onAuthor?: (data: UiV2FeedPostData, e: MouseEvent) => void;
    onChannel?: (channelId: number) => void;
    onVote?: (data: UiV2FeedPostData, nextVote: ArticleVoteValue) => void | Promise<void>;
    onSubscribe?: (channelId: number, nextSubscribed: boolean) => void | Promise<void>;
    onShare?: (data: UiV2FeedPostData) => void | Promise<void>;
    onRepostClick?: (data: UiV2FeedPostData) => void;
    onRepostChannel?: (channelId: number) => void;
    menuItems?: UiV2PopupMenuItem[];
    onMenuSelect?: (id: string) => void | Promise<void>;
    /** Подгрузить полный payload, если в ленте только превью. */
    onNeedMore?: () => void | Promise<void>;
    class?: string;
  };

  const PREVIEW_COLLAPSE_CHARS = 180;

  let {
    data,
    showSubscribe = false,
    voteBusy = false,
    subscribeBusy = false,
    onclick,
    onAuthor,
    onChannel,
    onVote,
    onSubscribe,
    onShare,
    onRepostClick,
    onRepostChannel,
    menuItems = [],
    onMenuSelect,
    onNeedMore,
    class: className = '',
  }: Props = $props();

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuPlacement = $state<'point' | 'anchor'>('anchor');
  let menuAnchorEl = $state<HTMLElement | null>(null);
  let previewExpanded = $state(false);
  let moreBusy = $state(false);
  let topCommentOpen = $state(true);

  const channel = $derived(data.channel);
  const displayName = $derived(channel.title?.trim() || 'Канал');
  const media = $derived(data.media ?? []);
  const tags = $derived(data.tags ?? []);
  const votes = $derived(Number(data.voteCount ?? 0));
  const comments = $derived(Math.max(0, Number(data.commentCount ?? 0)));
  const shares = $derived(Math.max(0, Number(data.repostCount ?? 0)));
  const myVote = $derived(
    data.vote === 1 || data.vote === 2
      ? data.vote
      : normalizeArticleVote(data.voted ? 1 : 0),
  );
  const subscribed = $derived(!!channel.isSubscribed);
  const showFollowBadge = $derived(
    showSubscribe && !subscribed && !!channel.id && onSubscribe != null,
  );
  const hasMenu = $derived(menuItems.length > 0 && onMenuSelect != null);
  const headHasActions = $derived(hasMenu);
  const preview = $derived((data.preview ?? '').trim());
  const moreText = $derived((data.moreText ?? '').trim());
  const canExpandPreview = $derived(
    !!data.canExpand || moreText.length > 0 || preview.length > PREVIEW_COLLAPSE_CHARS,
  );
  const shownPreview = $derived(
    preview.length > PREVIEW_COLLAPSE_CHARS && !previewExpanded
      ? `${preview.slice(0, PREVIEW_COLLAPSE_CHARS).trimEnd()}…`
      : preview,
  );
  const lastComment = $derived(data.lastComment ?? null);
  const scoreClass = $derived(
    votes > 0 ? 'is-plus' : votes < 0 ? 'is-minus' : '',
  );

  const repost = $derived(data.repost ?? null);
  const hasRepost = $derived(!!repost || !!data.containsRepost);
  const repostChannel = $derived(repost?.channel ?? null);
  const repostChannelTitle = $derived(repostChannel?.title?.trim() || 'Канал');
  const repostAvatar = $derived(repostChannel?.avatar?.trim() || '');
  const repostMedia = $derived(repost?.media ?? []);

  function openPost() {
    onclick?.(data);
  }

  function openAuthor(e: MouseEvent) {
    e.stopPropagation();
    if (onAuthor) {
      onAuthor(data, e);
      return;
    }
    if (channel.id) onChannel?.(channel.id);
  }

  function openRepost(e: MouseEvent) {
    e.stopPropagation();
    if (repost && !repost.missing) onRepostClick?.(data);
    else openPost();
  }

  function openRepostChannel(e: MouseEvent) {
    e.stopPropagation();
    if (repostChannel?.id) onRepostChannel?.(repostChannel.id);
  }

  async function setVote(e: MouseEvent, next: ArticleVoteValue) {
    e.stopPropagation();
    if (voteBusy || !onVote) {
      openPost();
      return;
    }
    const resolved = myVote === next ? 0 : next;
    await onVote(data, resolved);
  }

  async function toggleSubscribe(e: MouseEvent) {
    e.stopPropagation();
    if (!channel.id || subscribeBusy || !onSubscribe) return;
    await onSubscribe(channel.id, !subscribed);
  }

  async function sharePost(e: MouseEvent) {
    e.stopPropagation();
    if (onShare) {
      await onShare(data);
      return;
    }
    openPost();
  }

  async function togglePreview(e: MouseEvent) {
    e.stopPropagation();
    if (previewExpanded) {
      previewExpanded = false;
      return;
    }
    if (!moreText && onNeedMore) {
      moreBusy = true;
      try {
        await onNeedMore();
      } finally {
        moreBusy = false;
      }
    }
    previewExpanded = true;
  }

  function toggleTopComment(e: MouseEvent) {
    e.stopPropagation();
    topCommentOpen = !topCommentOpen;
  }

  function openMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    menuAnchorEl = btn;
    const r = btn.getBoundingClientRect();
    menuX = r.left + r.width / 2;
    menuY = r.bottom + 4;
    menuPlacement = 'anchor';
    menuOpen = true;
  }

  function onContextMenu(e: MouseEvent) {
    if (!hasMenu) return;
    e.preventDefault();
    e.stopPropagation();
    menuAnchorEl = null;
    menuX = e.clientX;
    menuY = e.clientY;
    menuPlacement = 'point';
    menuOpen = true;
  }

  async function handleMenuSelect(id: string) {
    menuOpen = false;
    await onMenuSelect?.(id);
  }

  function onOpenKeydown(e: KeyboardEvent) {
    if (!onclick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPost();
    }
  }

  function onCardClick(e: MouseEvent) {
    if (!onclick) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, [data-post-action], .uiv2-feed-post__repost')) return;
    openPost();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
<article
  class="uiv2-feed-post {className}"
  class:uiv2-feed-post--openable={!!onclick}
  oncontextmenu={onContextMenu}
  onclick={onCardClick}
  onkeydown={onOpenKeydown}
  tabindex={onclick ? 0 : undefined}
  role={onclick ? 'link' : undefined}
>
  <header
    class="uiv2-feed-post__head"
    class:uiv2-feed-post__head--with-menu={hasMenu}
  >
    <div class="uiv2-feed-post__avatar-wrap">
      <button
        type="button"
        class="uiv2-feed-post__avatar"
        aria-label={displayName}
        onclick={openAuthor}
      >
        <UserAvatar src={channel.avatar} label={displayName} />
      </button>
      {#if showFollowBadge}
        <button
          type="button"
          class="uiv2-feed-post__follow"
          aria-label="Подписаться"
          disabled={subscribeBusy}
          onclick={toggleSubscribe}
        >
          {@html iconPlus(12)}
        </button>
      {/if}
    </div>

    <div class="uiv2-feed-post__head-start">
      <button type="button" class="uiv2-feed-post__author" onclick={openAuthor}>
        {displayName}
        <UserBadge
          url={channel.badgeUrl}
          name={channel.badgeName}
          size="sm"
          class="uiv2-feed-post__badge"
        />
        {#if channel.isVerified}
          <span class="uiv2-feed-post__verified" title="Подтверждённый канал" aria-hidden="true">✓</span>
        {/if}
      </button>
      {#if data.timeStr}
        <time class="uiv2-feed-post__time">{data.timeStr}</time>
      {/if}
    </div>

    {#if headHasActions}
      <div class="uiv2-feed-post__head-actions" data-post-action>
        {#if hasMenu}
          <UiV2RoundButton
            size="sm"
            label="Ещё"
            class="uiv2-feed-post__more"
            ariaHaspopup="menu"
            ariaExpanded={menuOpen}
            onclick={openMenu}
          >
            {@html iconMoreHorizontal(16)}
          </UiV2RoundButton>
        {/if}
      </div>
    {/if}
  </header>

  <div class="uiv2-feed-post__body">
    {#if data.headline || shownPreview || canExpandPreview}
      <div class="uiv2-feed-post__text-copy">
        {#if data.headline}
          <p class="uiv2-feed-post__headline">{data.headline}</p>
        {/if}
        {#if shownPreview}
          <p class="uiv2-feed-post__text">{shownPreview}</p>
        {/if}
        {#if canExpandPreview}
          <button
            type="button"
            class="uiv2-feed-post__more-link"
            disabled={moreBusy}
            onclick={togglePreview}
          >
            {#if moreBusy}
              Загрузка…
            {:else}
              {previewExpanded ? 'Свернуть' : 'Показать ещё'}
            {/if}
          </button>
        {/if}
      </div>
    {/if}

        {#if !hasRepost && media.length > 0}
          <UiV2FeedPostMediaView items={media} />
        {/if}

    {#if previewExpanded && moreText}
      <div class="uiv2-feed-post__text-copy">
        <p class="uiv2-feed-post__text">{moreText}</p>
      </div>
    {/if}

    {#if hasRepost}
      <div class="uiv2-feed-post__repost">
        {#if repost && !repost.missing}
          <button type="button" class="uiv2-feed-post__repost-meta" onclick={openRepostChannel}>
            <span class="uiv2-feed-post__repost-icon" aria-hidden="true">{@html iconRepost(14)}</span>
            <span
              class="uiv2-feed-post__repost-avatar"
              class:uiv2-feed-post__repost-avatar--empty={!repostAvatar}
              style={repostAvatar ? `background-image:url('${repostAvatar}')` : undefined}
              aria-hidden="true"
            ></span>
            <span class="uiv2-feed-post__repost-title">{repostChannelTitle}</span>
            {#if repost.timeStr}
              <span class="uiv2-feed-post__repost-time">{repost.timeStr}</span>
            {/if}
          </button>
          <div class="uiv2-feed-post__repost-body">
            {#if repost.headline || repost.preview}
              <button type="button" class="uiv2-feed-post__repost-copy" onclick={openRepost}>
                {#if repost.headline}
                  <p class="uiv2-feed-post__headline uiv2-feed-post__headline--sm">{repost.headline}</p>
                {/if}
                {#if repost.preview}
                  <p class="uiv2-feed-post__text">{repost.preview}</p>
                {/if}
              </button>
            {/if}
            {#if repostMedia.length > 0}
              <UiV2FeedPostMediaView items={repostMedia} />
            {/if}
          </div>
        {:else}
          <p class="uiv2-feed-post__repost-missing">Репост недоступен</p>
        {/if}
      </div>
    {/if}

    {#if tags.length > 0}
      <ul class="uiv2-feed-post__tags" data-post-action>
        {#each tags as tag (tag)}
          <li>
            <span class="uiv2-feed-post__tag">#{tag}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="uiv2-feed-post__foot" data-post-action>
    <button type="button" class="uiv2-feed-post__comments" title="Комментарии" onclick={openPost}>
      {ruCommentsLabel(comments)}
    </button>
    <div class="uiv2-feed-post__foot-end">
      <button
        type="button"
        class="uiv2-feed-post__repost-count"
        title="Поделиться"
        onclick={sharePost}
      >
        {@html iconRepost(16)}
        <span>{shares}</span>
      </button>
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
          onclick={(e) => setVote(e, 1)}
        >
          {@html iconChevronUp(16)}
        </button>
        <span class="uiv2-feed-post__score {scoreClass}">{votes}</span>
        <button
          type="button"
          class="uiv2-feed-post__vote"
          class:uiv2-feed-post__vote--down={myVote === 2}
          title={myVote === 2 ? 'Убрать минус' : 'Минус'}
          aria-pressed={myVote === 2}
          aria-label="Минус"
          disabled={voteBusy}
          onclick={(e) => setVote(e, 2)}
        >
          {@html iconChevronDown(16)}
        </button>
      </div>
    </div>
  </footer>

  {#if lastComment && topCommentOpen}
    <div class="uiv2-feed-post__top-comment" data-post-action>
      <button type="button" class="uiv2-feed-post__top-comment-main" onclick={openPost}>
        <span class="uiv2-feed-post__top-comment-icon" aria-hidden="true">{@html iconMessageCircle(16)}</span>
        <span class="uiv2-feed-post__comment-avatar" aria-hidden="true">
          <UserAvatar src={lastComment.avatar} label={lastComment.author} />
        </span>
        <span class="uiv2-feed-post__top-comment-text" class:is-spoiler={lastComment.isSpoiler}>
          {lastComment.text}
        </span>
      </button>
      <button
        type="button"
        class="uiv2-feed-post__top-comment-toggle"
        title="Скрыть комментарий"
        aria-label="Скрыть топовый комментарий"
        onclick={toggleTopComment}
      >
        {@html iconChevronUp(16)}
      </button>
    </div>
  {:else if lastComment}
    <div class="uiv2-feed-post__top-comment uiv2-feed-post__top-comment--collapsed" data-post-action>
      <button
        type="button"
        class="uiv2-feed-post__top-comment-toggle"
        title="Показать топовый комментарий"
        aria-label="Показать топовый комментарий"
        onclick={toggleTopComment}
      >
        {@html iconChevronDown(16)}
      </button>
    </div>
  {/if}
</article>

<UiV2PopupMenu
  open={menuOpen}
  x={menuX}
  y={menuY}
  placement={menuPlacement}
  items={menuItems}
  anchor={menuAnchorEl}
  onClose={() => {
    menuOpen = false;
  }}
  onSelect={handleMenuSelect}
/>
