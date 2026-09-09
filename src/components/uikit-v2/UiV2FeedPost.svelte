<script lang="ts">
  import UiV2FeedPostMediaView from './UiV2FeedPostMedia.svelte';
  import UiV2ArticleBlocks from './UiV2ArticleBlocks.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './UiV2PopupMenu.svelte';
  import UiV2RoundButton from './UiV2RoundButton.svelte';
  import UiV2Tooltip from './UiV2Tooltip.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import UserBadge from '../UserBadge.svelte';
  import {
    iconMoreHorizontal,
    iconRepost,
    iconThumbsUp,
    iconThumbsDown,
    iconPlus,
    iconPin,
  } from '../icons';
  import {
    ARTICLE_VOTE_MINUS,
    ARTICLE_VOTE_PLUS,
    normalizeArticleVote,
    type ArticleVoteValue,
  } from '../../utils/feed-article';
  import type { ArticleFormatBlock } from '../../utils/article-block-format';
  import { formatCommentsCountShort } from '../../utils/feed-top-comment';

  function ruRepostLabel(count: number): string {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    const abs = n % 100;
    const d = abs % 10;
    if (abs > 10 && abs < 20) return `${n} репостов`;
    if (d === 1) return `${n} репост`;
    if (d >= 2 && d <= 4) return `${n} репоста`;
    return `${n} репостов`;
  }

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

  export type UiV2FeedPostTextBlock = ArticleFormatBlock;

  export type UiV2FeedPostBodyBlock =
    | UiV2FeedPostTextBlock
    | { kind: 'media'; items: UiV2FeedPostMedia[] };

  export type UiV2FeedPostRepost = {
    channel: UiV2FeedPostChannel;
    timeStr?: string;
    headline?: string;
    preview?: string;
    beforeBlocks?: UiV2FeedPostTextBlock[];
    afterBlocks?: UiV2FeedPostTextBlock[];
    /** Текст и медиа репоста в исходном порядке. */
    bodyBlocks?: UiV2FeedPostBodyBlock[];
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

  export type UiV2FeedPostSignedAuthor = {
    id: number;
    login: string;
    avatar?: string | null;
  };

  export type UiV2FeedPostData = {
    id: number | string;
    channel: UiV2FeedPostChannel;
    timeStr?: string;
    headline?: string;
    preview?: string;
    /** Текст после медиа (fallback без structured blocks). */
    moreText?: string;
    /** Структурированные блоки до медиа (цитаты, списки, абзацы). */
    beforeBlocks?: UiV2FeedPostTextBlock[];
    /** Структурированные блоки после медиа. */
    afterBlocks?: UiV2FeedPostTextBlock[];
    /** Текст и медиа поста в исходном порядке блоков. */
    bodyBlocks?: UiV2FeedPostBodyBlock[];
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
    /** Подпись автора при is_signed. */
    signedAuthor?: UiV2FeedPostSignedAuthor | null;
    /** Закреплённый пост канала/блога. */
    isPinned?: boolean;
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
    onSignedAuthor?: (authorId: number, e: MouseEvent) => void;
    menuItems?: UiV2PopupMenuItem[];
    onMenuSelect?: (id: string) => void | Promise<void>;
    /** Подгрузить полный payload, если в ленте только превью. */
    onNeedMore?: () => void | Promise<void>;
    /** Раскрыты ли комментарии под постом. */
    commentsExpanded?: boolean;
    /** Аватар текущего пользователя для пустого превью. */
    selfAvatar?: string | null;
    /** Открыть комментарии под постом (`write` — сразу фокус в поле). */
    onOpenComments?: (mode?: 'view' | 'write') => void;
    class?: string;
  };

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
    onSignedAuthor,
    menuItems = [],
    onMenuSelect,
    onNeedMore,
    commentsExpanded = false,
    selfAvatar = null,
    onOpenComments,
    class: className = '',
  }: Props = $props();

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuPlacement = $state<'point' | 'anchor'>('anchor');
  let menuAnchorEl = $state<HTMLElement | null>(null);
  let moreBusy = $state(false);
  let fetchedMoreForId = $state<string | number | null>(null);

  const channel = $derived(data.channel);
  const displayName = $derived(channel.title?.trim() || 'Канал');
  const media = $derived(data.media ?? []);
  const votes = $derived(Number(data.voteCount ?? 0));
  const comments = $derived(Math.max(0, Number(data.commentCount ?? 0)));
  const shares = $derived(Math.max(0, Number(data.repostCount ?? 0)));
  const myVote = $derived(
    data.vote === ARTICLE_VOTE_PLUS || data.vote === ARTICLE_VOTE_MINUS
      ? data.vote
      : normalizeArticleVote(data.voted ? ARTICLE_VOTE_PLUS : 0),
  );
  const subscribed = $derived(!!channel.isSubscribed);
  const showFollowBadge = $derived(
    showSubscribe && !subscribed && !!channel.id && onSubscribe != null,
  );
  const hasMenu = $derived(menuItems.length > 0 && onMenuSelect != null);
  const headHasActions = $derived(hasMenu);
  const preview = $derived((data.preview ?? '').trim());
  const moreText = $derived((data.moreText ?? '').trim());
  const beforeBlocks = $derived(data.beforeBlocks ?? []);
  const afterBlocks = $derived(data.afterBlocks ?? []);
  const bodyBlocks = $derived(data.bodyBlocks ?? []);
  const hasBodyBlocks = $derived(bodyBlocks.length > 0);
  const hasStructuredBefore = $derived(beforeBlocks.length > 0);
  const hasStructuredAfter = $derived(afterBlocks.length > 0);
  const signedAuthor = $derived(data.signedAuthor ?? null);
  const showExpandControl = $derived(!!data.canExpand || moreBusy);
  const shownPreview = $derived(hasBodyBlocks || hasStructuredBefore ? '' : preview);
  const shownMoreText = $derived(hasBodyBlocks || hasStructuredAfter ? '' : moreText);
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
  const repostBefore = $derived(repost?.beforeBlocks ?? []);
  const repostAfter = $derived(repost?.afterBlocks ?? []);
  const repostBodyBlocks = $derived(repost?.bodyBlocks ?? []);
  const hasRepostBodyBlocks = $derived(repostBodyBlocks.length > 0);
  const hasRepostBlocks = $derived(
    hasRepostBodyBlocks || repostBefore.length > 0 || repostAfter.length > 0,
  );

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
    // Заглушка: создание репоста ещё не подключено.
  }

  async function togglePreview(e: MouseEvent) {
    e.stopPropagation();
    if (!onNeedMore || moreBusy) return;
    moreBusy = true;
    fetchedMoreForId = data.id;
    try {
      await onNeedMore();
    } finally {
      moreBusy = false;
    }
  }

  $effect(() => {
    const id = data.id;
    if (!data.canExpand || !onNeedMore) return;
    if (fetchedMoreForId === id) return;
    fetchedMoreForId = id;
    moreBusy = true;
    void Promise.resolve(onNeedMore()).finally(() => {
      moreBusy = false;
    });
  });

  function openComments(e: MouseEvent, mode: 'view' | 'write' = 'view') {
    e.stopPropagation();
    if (onOpenComments) {
      onOpenComments(mode);
      return;
    }
    openPost();
  }

  function openSignedAuthor(e: MouseEvent) {
    e.stopPropagation();
    if (signedAuthor?.id) onSignedAuthor?.(signedAuthor.id, e);
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
        class:uiv2-feed-post__avatar--channel={!channel.isBlog}
        aria-label={displayName}
        onclick={openAuthor}
      >
        <UserAvatar
          src={channel.avatar}
          label={displayName}
          shape={channel.isBlog ? 'circle' : 'channel'}
        />
      </button>
      {#if showFollowBadge}
        <UiV2Tooltip
          text="подписаться"
          tone="danger"
          placement="bottom"
          showDelay={80}
          class="uiv2-feed-post__follow-tip"
        >
          <button
            type="button"
            class="uiv2-feed-post__follow"
            aria-label="Подписаться"
            disabled={subscribeBusy}
            onclick={toggleSubscribe}
          >
            {@html iconPlus(12)}
          </button>
        </UiV2Tooltip>
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
      {#if data.isPinned || data.timeStr}
        <div class="uiv2-feed-post__meta">
          {#if data.isPinned}
            <span class="uiv2-feed-post__pinned" title="Закреплено">
              <span class="uiv2-feed-post__pinned-icon" aria-hidden="true">{@html iconPin(12)}</span>
              <span>Закреплено</span>
            </span>
          {/if}
          {#if data.isPinned && data.timeStr}
            <span class="uiv2-feed-post__meta-sep" aria-hidden="true">·</span>
          {/if}
          {#if data.timeStr}
            <time class="uiv2-feed-post__time">{data.timeStr}</time>
          {/if}
        </div>
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
    {#if hasBodyBlocks}
      {#if data.headline}
        <div class="uiv2-feed-post__text-copy">
          <p class="uiv2-feed-post__headline">{data.headline}</p>
        </div>
      {/if}
      {#each bodyBlocks as block, i (i)}
        {#if block.kind === 'media'}
          <UiV2FeedPostMediaView items={block.items} />
        {:else}
          <div class="uiv2-feed-post__text-copy">
            <UiV2ArticleBlocks blocks={[block]} />
          </div>
        {/if}
      {/each}
      {#if showExpandControl}
        <div class="uiv2-feed-post__text-copy">
          <button
            type="button"
            class="uiv2-feed-post__more-link"
            disabled={moreBusy}
            onclick={togglePreview}
          >
            {moreBusy ? 'Загрузка…' : 'Показать ещё'}
          </button>
        </div>
      {/if}
    {:else}
      {#if data.headline || hasStructuredBefore || shownPreview || showExpandControl}
        <div class="uiv2-feed-post__text-copy">
          {#if data.headline}
            <p class="uiv2-feed-post__headline">{data.headline}</p>
          {/if}
          {#if hasStructuredBefore}
            <UiV2ArticleBlocks blocks={beforeBlocks} />
          {:else if shownPreview}
            <p class="uiv2-feed-post__text">{shownPreview}</p>
          {/if}
          {#if showExpandControl}
            <button
              type="button"
              class="uiv2-feed-post__more-link"
              disabled={moreBusy}
              onclick={togglePreview}
            >
              {moreBusy ? 'Загрузка…' : 'Показать ещё'}
            </button>
          {/if}
        </div>
      {/if}

      {#if media.length > 0}
        <UiV2FeedPostMediaView items={media} />
      {/if}

      {#if hasStructuredAfter}
        <div class="uiv2-feed-post__text-copy">
          <UiV2ArticleBlocks blocks={afterBlocks} />
        </div>
      {:else if shownMoreText}
        <div class="uiv2-feed-post__text-copy">
          <p class="uiv2-feed-post__text">{shownMoreText}</p>
        </div>
      {/if}
    {/if}

    {#if signedAuthor?.login}
      <div class="uiv2-feed-post__signed" data-post-action>
        <span class="uiv2-feed-post__signed-label">Автор:</span>
        <button
          type="button"
          class="uiv2-feed-post__signed-name"
          onclick={openSignedAuthor}
        >{signedAuthor.login}</button>
      </div>
    {/if}

    {#if hasRepost}
      <div class="uiv2-feed-post__repost">
        {#if repost && !repost.missing}
          <button type="button" class="uiv2-feed-post__repost-meta" onclick={openRepostChannel}>
            <span class="uiv2-feed-post__repost-icon" aria-hidden="true">{@html iconRepost(14)}</span>
            <span
              class="uiv2-feed-post__repost-avatar"
              class:uiv2-feed-post__repost-avatar--channel={!repostChannel?.isBlog}
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
            {#if hasRepostBodyBlocks}
              {#each repostBodyBlocks as block, i (i)}
                {#if block.kind === 'media'}
                  <UiV2FeedPostMediaView items={block.items} />
                {:else}
                  <button type="button" class="uiv2-feed-post__repost-copy" onclick={openRepost}>
                    <UiV2ArticleBlocks blocks={[block]} />
                  </button>
                {/if}
              {/each}
            {:else if hasRepostBlocks}
              {#if repostBefore.length > 0}
                <button type="button" class="uiv2-feed-post__repost-copy" onclick={openRepost}>
                  <UiV2ArticleBlocks blocks={repostBefore} />
                </button>
              {/if}
              {#if repostMedia.length > 0}
                <UiV2FeedPostMediaView items={repostMedia} />
              {/if}
              {#if repostAfter.length > 0}
                <button type="button" class="uiv2-feed-post__repost-copy" onclick={openRepost}>
                  <UiV2ArticleBlocks blocks={repostAfter} />
                </button>
              {/if}
            {:else if repost?.preview}
              <button type="button" class="uiv2-feed-post__repost-copy" onclick={openRepost}>
                <p class="uiv2-feed-post__text">{repost.preview}</p>
              </button>
              {#if repostMedia.length > 0}
                <UiV2FeedPostMediaView items={repostMedia} />
              {/if}
            {:else if repostMedia.length > 0}
              <UiV2FeedPostMediaView items={repostMedia} />
            {/if}
          </div>
        {:else}
          <p class="uiv2-feed-post__repost-missing">Репост недоступен</p>
        {/if}
      </div>
    {/if}
  </div>

  <footer class="uiv2-feed-post__foot" data-post-action>
    <button
      type="button"
      class="uiv2-feed-post__repost-count"
      onclick={sharePost}
    >
      {@html iconRepost(16)}
      <span>{ruRepostLabel(shares)}</span>
    </button>
    <div
      class="uiv2-feed-post__votes"
      class:uiv2-feed-post__votes--plus={votes > 0}
      class:uiv2-feed-post__votes--minus={votes < 0}
    >
      <button
        type="button"
        class="uiv2-feed-post__vote"
        class:uiv2-feed-post__vote--down={myVote === ARTICLE_VOTE_MINUS}
        aria-pressed={myVote === ARTICLE_VOTE_MINUS}
        aria-label="Минус"
        disabled={voteBusy}
        onclick={(e) => setVote(e, ARTICLE_VOTE_MINUS)}
      >
        {@html iconThumbsDown(16)}
      </button>
      <span class="uiv2-feed-post__score {scoreClass}">{votes}</span>
      <button
        type="button"
        class="uiv2-feed-post__vote"
        class:uiv2-feed-post__vote--up={myVote === ARTICLE_VOTE_PLUS}
        aria-pressed={myVote === ARTICLE_VOTE_PLUS}
        aria-label="Плюс"
        disabled={voteBusy}
        onclick={(e) => setVote(e, ARTICLE_VOTE_PLUS)}
      >
        {@html iconThumbsUp(16)}
      </button>
    </div>
  </footer>

  {#if !commentsExpanded}
    <button
      type="button"
      class="uiv2-feed-post__comments-teaser"
      data-post-action
      aria-expanded="false"
      onclick={(e) => openComments(e, lastComment && comments > 0 ? 'view' : 'write')}
    >
      <span class="uiv2-feed-post__comments-teaser-head">
        <span class="uiv2-feed-post__comments-teaser-title">Комментарии</span>
        {#if comments > 0}
          <span class="uiv2-feed-post__comments-teaser-count">{formatCommentsCountShort(comments)}</span>
        {/if}
      </span>
      {#if lastComment && comments > 0}
        <span class="uiv2-feed-post__comments-teaser-preview">
          <span class="uiv2-feed-post__comments-teaser-avatar" aria-hidden="true">
            <UserAvatar src={lastComment.avatar} label={lastComment.author} />
          </span>
          <span class="uiv2-feed-post__comments-teaser-text" class:is-spoiler={lastComment.isSpoiler}>
            {lastComment.text}
          </span>
        </span>
      {:else if comments > 0}
        <span class="uiv2-feed-post__comments-teaser-preview uiv2-feed-post__comments-teaser-preview--write">
          <span class="uiv2-feed-post__comments-teaser-placeholder">Открыть комментарии</span>
        </span>
      {:else}
        <span class="uiv2-feed-post__comments-teaser-preview uiv2-feed-post__comments-teaser-preview--write">
          <span class="uiv2-feed-post__comments-teaser-avatar" aria-hidden="true">
            <UserAvatar src={selfAvatar} label="Вы" />
          </span>
          <span class="uiv2-feed-post__comments-teaser-placeholder">Написать комментарий</span>
        </span>
      {/if}
    </button>
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
