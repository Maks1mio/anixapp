<script lang="ts">

  import { onMount } from 'svelte';

  import type { FeedArticle } from '../../types/feed';

  import UiV2FeedPost from '../uikit-v2/UiV2FeedPost.svelte';

  import { feedArticleToUiV2FeedPost } from '../../utils/uikit-v2-feed-post';

  import { handleUserProfileClick } from '../../stores/user-profile';

  import {

    buildFeedArticleMenuItems,

    ensureFeedArticleMenuSession,

    getFeedArticleMenuSession,

  } from '../../utils/feed-article-menu';

  import { runFeedArticleMenuAction } from '../../utils/feed-article-menu-actions';



  interface Props {

    article: FeedArticle;

    onOpen?: (article: FeedArticle) => void;

    onChannel?: (channelId: number) => void;

    onVote?: (article: FeedArticle, nextVote: 0 | 1) => void | Promise<void>;

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



  const post = $derived(feedArticleToUiV2FeedPost(article));

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



  onMount(() => {

    void ensureFeedArticleMenuSession().then(() => {

      menuSessionTick += 1;

    });

  });



  function openArticle() {

    onOpen?.(article);

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

