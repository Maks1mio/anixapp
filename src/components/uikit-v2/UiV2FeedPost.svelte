<script lang="ts">
  import UiV2Button from './UiV2Button.svelte';
  import UiV2FeedPostMedia from './UiV2FeedPostMedia.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './UiV2PopupMenu.svelte';
  import UiV2RoundButton from './UiV2RoundButton.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import UserBadge from '../UserBadge.svelte';
  import { iconMessageCircle, iconHeart, iconShare, iconMoreHorizontal } from '../icons';

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

  export type UiV2FeedPostData = {
    id: number | string;
    channel: UiV2FeedPostChannel;
    timeStr?: string;
    headline?: string;
    preview?: string;
    media?: UiV2FeedPostMedia[];
    voteCount?: number;
    commentCount?: number;
    voted?: boolean;
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
    onVote?: (data: UiV2FeedPostData, nextVote: 0 | 1) => void | Promise<void>;
    onSubscribe?: (channelId: number, nextSubscribed: boolean) => void | Promise<void>;
    onRepostClick?: (data: UiV2FeedPostData) => void;
    onRepostChannel?: (channelId: number) => void;
    menuItems?: UiV2PopupMenuItem[];
    onMenuSelect?: (id: string) => void | Promise<void>;
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
    onRepostClick,
    onRepostChannel,
    menuItems = [],
    onMenuSelect,
    class: className = '',
  }: Props = $props();

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuPlacement = $state<'point' | 'anchor'>('anchor');
  let menuAnchorEl = $state<HTMLElement | null>(null);

  const channel = $derived(data.channel);
  const displayName = $derived(channel.title?.trim() || 'Канал');
  const media = $derived(data.media ?? []);
  const votes = $derived(Math.max(0, Number(data.voteCount ?? 0)));
  const comments = $derived(Math.max(0, Number(data.commentCount ?? 0)));
  const voted = $derived(!!data.voted);
  const subscribed = $derived(!!channel.isSubscribed);
  const showSubscribeBtn = $derived(
    showSubscribe && !!channel.id && onSubscribe != null,
  );
  const hasMenu = $derived(menuItems.length > 0 && onMenuSelect != null);
  const headHasActions = $derived(showSubscribeBtn || hasMenu);

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

  async function toggleVote(e: MouseEvent) {
    e.stopPropagation();
    if (voteBusy || !onVote) {
      openPost();
      return;
    }
    await onVote(data, voted ? 0 : 1);
  }

  async function toggleSubscribe(e: MouseEvent) {
    e.stopPropagation();
    if (!channel.id || subscribeBusy || !onSubscribe) return;
    await onSubscribe(channel.id, !subscribed);
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

<article
  class="uiv2-feed-post {className}"
  class:uiv2-feed-post--openable={!!onclick}
  oncontextmenu={onContextMenu}
  onclick={onCardClick}
  onkeydown={onOpenKeydown}
  tabindex={onclick ? 0 : undefined}
  role={onclick ? 'link' : undefined}
>
  <div class="uiv2-feed-post__layout">
    <button
      type="button"
      class="uiv2-feed-post__avatar"
      aria-label={displayName}
      onclick={openAuthor}
    >
      <UserAvatar src={channel.avatar} label={displayName} />
    </button>

    <div class="uiv2-feed-post__column">
      <header
        class="uiv2-feed-post__head"
        class:uiv2-feed-post__head--with-sub={showSubscribeBtn}
        class:uiv2-feed-post__head--with-menu={hasMenu}
      >
        <div class="uiv2-feed-post__head-start">
          <div class="uiv2-feed-post__head-line">
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
          </div>
          {#if data.timeStr}
            <time class="uiv2-feed-post__time">{data.timeStr}</time>
          {/if}
        </div>

        {#if headHasActions}
          <div class="uiv2-feed-post__head-actions" data-post-action>
            {#if showSubscribeBtn}
              <UiV2Button
                size="sm"
                variant={subscribed ? 'chrome' : 'primary'}
                label={subscribed ? 'Вы подписаны' : 'Подписаться'}
                disabled={subscribeBusy}
                onclick={toggleSubscribe}
              />
            {/if}
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
        {#if data.headline || data.preview}
          <div class="uiv2-feed-post__text-copy">
            {#if data.headline}
              <p class="uiv2-feed-post__headline">{data.headline}</p>
            {/if}
            {#if data.preview}
              <p class="uiv2-feed-post__text">{data.preview}</p>
            {/if}
          </div>
        {/if}

        {#if !hasRepost && media.length > 0}
          <UiV2FeedPostMedia items={media} />
        {/if}

        {#if hasRepost}
          <div class="uiv2-feed-post__repost">
            {#if repost && !repost.missing}
              <button type="button" class="uiv2-feed-post__repost-meta" onclick={openRepostChannel}>
                <span class="uiv2-feed-post__repost-icon" aria-hidden="true">{@html iconShare(14)}</span>
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
              <button type="button" class="uiv2-feed-post__repost-body" onclick={openRepost}>
                {#if repost.headline}
                  <p class="uiv2-feed-post__headline uiv2-feed-post__headline--sm">{repost.headline}</p>
                {/if}
                {#if repost.preview}
                  <p class="uiv2-feed-post__text">{repost.preview}</p>
                {/if}
                {#if repostMedia.length > 0}
                  <UiV2FeedPostMedia items={repostMedia} />
                {/if}
              </button>
            {:else}
              <p class="uiv2-feed-post__repost-missing">Репост недоступен</p>
            {/if}
          </div>
        {/if}
      </div>

      <footer class="uiv2-feed-post__foot" data-post-action>
        <button
          type="button"
          class="uiv2-feed-post__stat"
          class:uiv2-feed-post__stat--active={voted}
          title={voted ? 'Убрать оценку' : 'Оценить'}
          disabled={voteBusy}
          onclick={toggleVote}
        >
          {@html iconHeart(15)}
          <span>{votes}</span>
        </button>
        <button type="button" class="uiv2-feed-post__stat" title="Комментарии" onclick={openPost}>
          {@html iconMessageCircle(15)}
          <span>{comments}</span>
        </button>
      </footer>
    </div>
  </div>
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
