<script lang="ts">
  import { onMount } from 'svelte';
  import type { FeedArticle } from '../../types/feed';
  import UiV2FeedPost, {
    type UiV2FeedPostLastComment,
  } from '../uikit-v2/UiV2FeedPost.svelte';
  import FeedArticleComments from './FeedArticleComments.svelte';
  import { feedArticleToUiV2FeedPost } from '../../utils/uikit-v2-feed-post';
  import { handleUserProfileClick } from '../../stores/user-profile';
  import {
    buildFeedArticleMenuItems,
    ensureFeedArticleMenuSession,
    getFeedArticleMenuSession,
  } from '../../utils/feed-article-menu';
  import { runFeedArticleMenuAction } from '../../utils/feed-article-menu-actions';
  import { loadArticleTopComment, setArticleTopCommentCache, clearArticleTopCommentCache } from '../../utils/feed-top-comment';
  import { channelAvatarUrl } from '../../utils/feed-article';
  import { showToast } from '../../stores/toast';

  interface Props {
    article: FeedArticle;
    /** Пост выбран в ленте — комментарии раскрыты. */
    selected?: boolean;
    onOpen?: (article: FeedArticle) => void;
    onDeselect?: () => void;
    onChannel?: (channelId: number) => void;
    onVote?: (article: FeedArticle, nextVote: 0 | 1 | 2) => void | Promise<void>;
    onSubscribe?: (channelId: number, nextSubscribed: boolean) => void | Promise<void>;
    onArticleChange?: (article: FeedArticle) => void;
    onArticleRemove?: (articleId: number) => void;
    /** Скрыть кнопку подписки (напр. страница канала). */
    hideSubscribe?: boolean;
    /** Закрепление в меню (страница канала). */
    menuPinAvailable?: boolean;
    /** Скрытие записи в меню (в ленте — да). */
    menuMuteAvailable?: boolean;
  }

  let {
    article,
    selected = false,
    onOpen,
    onDeselect,
    onChannel,
    onVote,
    onSubscribe,
    onArticleChange,
    onArticleRemove,
    hideSubscribe = false,
    menuPinAvailable = false,
    menuMuteAvailable = true,
  }: Props = $props();

  let voteBusy = $state(false);
  let subBusy = $state(false);
  let menuSessionTick = $state(0);
  let cardRoot = $state<HTMLDivElement | null>(null);
  let topCommentOverride = $state<UiV2FeedPostLastComment | null | undefined>(undefined);
  let expandedPayloadArticle = $state<FeedArticle | null>(null);
  let commentsOpen = $state(false);
  let commentsFocusWrite = $state(false);
  let selfAvatar = $state<string | null>(null);
  let commentCountOverride = $state<number | null>(null);

  const sourceArticle = $derived.by(() => {
    if (expandedPayloadArticle && expandedPayloadArticle.id === article.id) {
      return { ...article, payload: expandedPayloadArticle.payload };
    }
    return article;
  });
  const mappedPost = $derived(feedArticleToUiV2FeedPost(sourceArticle));
  const displayCommentCount = $derived(
    commentCountOverride ?? Math.max(0, Number(article.comment_count ?? 0)),
  );
  const post = $derived({
    ...mappedPost,
    commentCount: displayCommentCount,
    lastComment:
      topCommentOverride !== undefined ? topCommentOverride : mappedPost.lastComment,
  });
  const showSubscribe = $derived(!hideSubscribe && !!article.channel?.id && onSubscribe != null);
  const menuItems = $derived.by(() => {
    menuSessionTick;
    const session = getFeedArticleMenuSession();
    return buildFeedArticleMenuItems(article, {
      pinAvailable: menuPinAvailable,
      muteAvailable: menuMuteAvailable,
      privilegeLevel: session.privilegeLevel,
      reportReasons: session.reportReasons,
    });
  });

  $effect(() => {
    const el = cardRoot;
    const id = Number(article.id);
    const count = Math.max(0, Number(article.comment_count ?? 0));
    const existing = mappedPost.lastComment;
    if (!el || !(id > 0) || count <= 0 || existing || topCommentOverride !== undefined) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        void loadArticleTopComment(id).then((comment) => {
          topCommentOverride = comment;
        });
      },
      { rootMargin: '240px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  });

  $effect(() => {
    if (selected) {
      commentsOpen = true;
      commentsFocusWrite = false;
    } else {
      commentsOpen = false;
      commentsFocusWrite = false;
    }
  });

  onMount(() => {
    void ensureFeedArticleMenuSession().then(() => {
      menuSessionTick += 1;
    });
    void window.anixApi?.profile?.self?.().then((data: { profile?: { avatar?: string | null } }) => {
      selfAvatar = channelAvatarUrl(data?.profile?.avatar ?? null) || null;
    });
  });

  function applyPreviewComment(comment: UiV2FeedPostLastComment | null) {
    topCommentOverride = comment;
    setArticleTopCommentCache(Number(article.id), comment);
  }

  function openArticle() {
    onOpen?.(sourceArticle);
  }

  function openComments(mode: 'view' | 'write' = 'view') {
    commentsFocusWrite = mode === 'write';
    commentsOpen = true;
    queueMicrotask(() => {
      cardRoot
        ?.querySelector(`#feed-article-comments-${article.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function closeComments() {
    commentsOpen = false;
    commentsFocusWrite = false;
    const id = Number(article.id);
    const count = displayCommentCount;
    const hasPreview =
      topCommentOverride !== undefined
        ? !!topCommentOverride
        : !!mappedPost.lastComment;
    if (count > 0 && !hasPreview && id > 0) {
      clearArticleTopCommentCache(id);
      void loadArticleTopComment(id).then((comment) => {
        if (comment) applyPreviewComment(comment);
      });
    }
    if (selected) onDeselect?.();
  }

  async function loadFullPreview() {
    const id = Number(article.id);
    if (!(id > 0) || expandedPayloadArticle?.id === id) return;
    try {
      const res = await window.anixApi?.article?.info?.(id);
      const full = (res?.article ?? null) as FeedArticle | null;
      if (!full?.payload) return;
      const next = { ...article, payload: full.payload };
      expandedPayloadArticle = next;
      onArticleChange?.(next);
    } catch {
      /* кнопка останется, хвост просто не подгрузится */
    }
  }

  function openRepost() {
    const repost = article.repost_article;
    if (repost && Number(repost.id) > 0) onOpen?.(repost);
    else openArticle();
  }

  function openAuthor(_data: ReturnType<typeof feedArticleToUiV2FeedPost>, _e: MouseEvent) {
    const ch = article.channel;
    // Канал и блог — лента на /feed
    if (ch?.id) {
      onChannel?.(ch.id);
      return;
    }
    const profileId = Number(article.author?.id ?? 0);
    if (profileId > 0) handleUserProfileClick(profileId, _e);
  }

  function openSignedAuthor(authorId: number, e: MouseEvent) {
    handleUserProfileClick(authorId, e);
  }

  async function handleMenuSelect(id: string) {
    const result = await runFeedArticleMenuAction(id, article);
    if (result.kind === 'removed') {
      onArticleRemove?.(result.articleId);
      return;
    }
    if (result.kind === 'updated') {
      onArticleChange?.(result.article);
    }
  }
</script>

{#key article.id}
<div
  class="feed-article-card"
  class:feed-article-card--selected={selected}
  bind:this={cardRoot}
  data-feed-article-id={article.id}
>
  <UiV2FeedPost
    data={post}
    {showSubscribe}
    {menuItems}
    voteBusy={voteBusy}
    subscribeBusy={subBusy}
    commentsExpanded={commentsOpen}
    selfAvatar={selfAvatar}
    onclick={() => openArticle()}
    onAuthor={openAuthor}
    onSignedAuthor={openSignedAuthor}
    onChannel={onChannel}
    onRepostClick={() => openRepost()}
    onRepostChannel={onChannel}
    onMenuSelect={handleMenuSelect}
    onNeedMore={loadFullPreview}
    onOpenComments={openComments}
    onShare={async () => {
      showToast('Репост скоро будет доступен', 'info');
    }}
    onVote={async (_data, next) => {
      if (voteBusy || !onVote) return;
      voteBusy = true;
      try {
        await onVote(article, next);
      } finally {
        voteBusy = false;
      }
    }}
    onSubscribe={async (_channelId, next) => {
      const channelId = article.channel?.id;
      if (!channelId || subBusy || !onSubscribe) return;
      subBusy = true;
      try {
        await onSubscribe(channelId, next);
      } finally {
        subBusy = false;
      }
    }}
  />
  {#if commentsOpen}
    <FeedArticleComments
      articleId={Number(article.id)}
      totalCount={displayCommentCount}
      focusComposer={commentsFocusWrite}
      onClose={closeComments}
      onCountChange={(n) => {
        commentCountOverride = n;
      }}
      onPreviewCommentChange={applyPreviewComment}
    />
  {/if}
</div>
{/key}
