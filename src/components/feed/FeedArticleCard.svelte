<script lang="ts">
  import { onMount } from 'svelte';
  import type { FeedArticle } from '../../types/feed';
  import UiV2FeedPost, {
    type UiV2FeedPostLastComment,
  } from '../uikit-v2/UiV2FeedPost.svelte';
  import { feedArticleToUiV2FeedPost } from '../../utils/uikit-v2-feed-post';
  import { handleUserProfileClick } from '../../stores/user-profile';
  import {
    buildFeedArticleMenuItems,
    ensureFeedArticleMenuSession,
    getFeedArticleMenuSession,
  } from '../../utils/feed-article-menu';
  import { runFeedArticleMenuAction } from '../../utils/feed-article-menu-actions';
  import { loadArticleTopComment } from '../../utils/feed-top-comment';

  interface Props {
    article: FeedArticle;
    onOpen?: (article: FeedArticle) => void;
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
    onOpen,
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

  const sourceArticle = $derived.by(() => {
    if (expandedPayloadArticle && expandedPayloadArticle.id === article.id) {
      return { ...article, payload: expandedPayloadArticle.payload };
    }
    return article;
  });
  const mappedPost = $derived(feedArticleToUiV2FeedPost(sourceArticle));
  const post = $derived({
    ...mappedPost,
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

  onMount(() => {
    void ensureFeedArticleMenuSession().then(() => {
      menuSessionTick += 1;
    });
  });

  function openArticle() {
    onOpen?.(sourceArticle);
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

  function openAuthor(_data: ReturnType<typeof feedArticleToUiV2FeedPost>, e: MouseEvent) {
    const ch = article.channel;
    if (ch?.is_blog && ch.id) {
      handleUserProfileClick(ch.id, e);
      return;
    }
    if (ch?.id) onChannel?.(ch.id);
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
<div class="feed-article-card" bind:this={cardRoot}>
  <UiV2FeedPost
    data={post}
    {showSubscribe}
    {menuItems}
    voteBusy={voteBusy}
    subscribeBusy={subBusy}
    onclick={() => openArticle()}
    onAuthor={openAuthor}
    onChannel={onChannel}
    onRepostClick={() => openRepost()}
    onRepostChannel={onChannel}
    onMenuSelect={handleMenuSelect}
    onNeedMore={loadFullPreview}
    onShare={async () => {
      await runFeedArticleMenuAction('share', article);
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
</div>
{/key}
