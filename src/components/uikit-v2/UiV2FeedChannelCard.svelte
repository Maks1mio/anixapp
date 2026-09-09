<script lang="ts">
  import UiV2Button from './UiV2Button.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import { iconCheck } from '../icons';
  import { channelCoverUrl, formatCompactCount, ruSubscribersWord } from '../../utils/feed-article';

  export type UiV2FeedChannelCardData = {
    id: number;
    title: string;
    description?: string | null;
    avatar?: string | null;
    cover?: string | null;
    isVerified?: boolean;
    isSubscribed?: boolean;
    isBlog?: boolean;
    subscriberCount?: number;
    articleCount?: number;
  };

  type Props = {
    data: UiV2FeedChannelCardData;
    subscribeBusy?: boolean;
    actionLabel?: string;
    subscribedLabel?: string;
    onOpen?: (id: number) => void;
    onSubscribe?: (id: number, next: boolean) => void | Promise<void>;
    class?: string;
  };

  let {
    data,
    subscribeBusy = false,
    actionLabel = 'Подписаться',
    subscribedLabel = 'Вы подписаны',
    onOpen,
    onSubscribe,
    class: className = '',
  }: Props = $props();

  const cover = $derived(channelCoverUrl(data.cover));
  const title = $derived(data.title?.trim() || `Канал #${data.id}`);
  const subscribed = $derived(!!data.isSubscribed);
  const showAction = $derived(onSubscribe != null && data.id > 0);

  function open() {
    if (data.id > 0) onOpen?.(data.id);
  }

  async function toggleSubscribe(e: MouseEvent) {
    e.stopPropagation();
    if (!showAction || subscribeBusy) return;
    await onSubscribe?.(data.id, !subscribed);
  }
</script>

<section class="uiv2-feed-channel-card {className}">
  <button type="button" class="uiv2-feed-channel-card__hero" onclick={open}>
    <span
      class="uiv2-feed-channel-card__cover"
      class:uiv2-feed-channel-card__cover--empty={!cover}
      style={cover ? `background-image:url('${cover}')` : undefined}
      aria-hidden="true"
    ></span>
    <span
      class="uiv2-feed-channel-card__avatar"
      class:uiv2-feed-channel-card__avatar--blog={!!data.isBlog}
      aria-hidden="true"
    >
      <UserAvatar
        src={data.avatar}
        label={title}
        shape={data.isBlog ? 'circle' : 'channel'}
      />
    </span>
  </button>

  <div class="uiv2-feed-channel-card__body">
    <button type="button" class="uiv2-feed-channel-card__title" onclick={open}>
      {title}
      {#if data.isVerified}
        <span class="uiv2-feed-post__verified" title="Подтверждённый канал" aria-hidden="true">✓</span>
      {/if}
    </button>

    <div class="uiv2-feed-channel-card__stats">
      <span>
        <strong>{formatCompactCount(data.subscriberCount)}</strong>
        {ruSubscribersWord(data.subscriberCount)}
      </span>
      <span>
        <strong>{formatCompactCount(data.articleCount)}</strong>
        записей
      </span>
    </div>

    {#if data.description}
      <p class="uiv2-feed-channel-card__desc">{data.description}</p>
    {/if}

    {#if showAction}
      <UiV2Button
        variant={subscribed ? 'chrome' : 'primary'}
        size="md"
        block
        label={subscribed ? subscribedLabel : actionLabel}
        disabled={subscribeBusy}
        onclick={toggleSubscribe}
      >
        {#snippet icon()}
          {#if subscribed}{@html iconCheck(16)}{/if}
        {/snippet}
      </UiV2Button>
    {/if}
  </div>
</section>
