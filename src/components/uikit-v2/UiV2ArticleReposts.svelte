<script lang="ts">
  import UserAvatar from '../UserAvatar.svelte';
  import UiV2ScrollArea from './UiV2ScrollArea.svelte';
  import UiV2ReactionsSkeleton from './UiV2ReactionsSkeleton.svelte';
  import type { FeedArticle } from '../../types/feed';
  import { channelAvatarUrl, formatFeedRelativeTime } from '../../utils/feed-article';

  type Props = {
    articleId: number;
    /** Клик по репосту — открыть запись-репост. */
    onOpen?: (article: FeedArticle) => void;
  };

  let { articleId, onOpen }: Props = $props();

  let loadState = $state<'loading' | 'ready' | 'error'>('loading');
  let errorText = $state('');
  let reposts = $state<FeedArticle[]>([]);

  async function load(id: number) {
    const api = window.anixApi?.article?.reposts;
    if (!api) {
      loadState = 'error';
      errorText = 'API репостов недоступно';
      return;
    }
    loadState = 'loading';
    try {
      const res = await api(id, 0);
      const content = Array.isArray(res?.content) ? res.content : [];
      reposts = content.filter((item): item is FeedArticle => (
        !!item && typeof item === 'object' && Number((item as FeedArticle).id) > 0
      ));
      loadState = 'ready';
    } catch (e) {
      loadState = 'error';
      errorText = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    if (articleId > 0) void load(articleId);
  });
</script>

<div class="uiv2-reactions uiv2-reactions--auto" role="group" aria-label="Репосты">
  <div class="uiv2-reactions__body">
    <UiV2ScrollArea axis="y" class="uiv2-reactions__scroll">
      {#if loadState === 'loading'}
        <UiV2ReactionsSkeleton count={4} />
      {:else if loadState === 'error'}
        <p class="uiv2-reactions__state uiv2-reactions__state--error">{errorText}</p>
      {:else if reposts.length === 0}
        <p class="uiv2-reactions__state">Пока никто не репостнул</p>
      {:else}
        <ul class="uiv2-reactions__list">
          {#each reposts as repost (repost.id)}
            {@const ch = repost.channel}
            {@const title = ch?.title?.trim() || (ch?.is_blog ? 'Блог' : 'Канал')}
            <li>
              <button
                type="button"
                class="uiv2-reactions__row"
                onclick={(e) => {
                  e.stopPropagation();
                  onOpen?.(repost);
                }}
              >
                <span class="uiv2-reactions__avatar">
                  <UserAvatar
                    src={channelAvatarUrl(ch?.avatar)}
                    label={title}
                    shape={ch?.is_blog ? 'circle' : 'channel'}
                  />
                </span>
                <span class="uiv2-reactions__login">{title}</span>
                <span class="uiv2-reactions__meta">{formatFeedRelativeTime(repost.creation_date)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </UiV2ScrollArea>
  </div>
</div>
