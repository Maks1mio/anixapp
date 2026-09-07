<script lang="ts">
  import UiV2Button from './UiV2Button.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import { formatSubscriberLabel } from '../../utils/feed-article';

  export type UiV2FeedRecommendedItem = {
    id: number;
    title: string;
    avatar?: string | null;
    isVerified?: boolean;
    subscriberCount?: number;
  };

  type Props = {
    items: UiV2FeedRecommendedItem[];
    title?: string;
    initialCount?: number;
    onOpen?: (id: number) => void;
    class?: string;
  };

  let {
    items,
    title = 'Рекомендуем',
    initialCount = 5,
    onOpen,
    class: className = '',
  }: Props = $props();

  let expanded = $state(false);

  const visible = $derived(
    expanded ? items : items.slice(0, Math.max(1, initialCount)),
  );
  const canExpand = $derived(items.length > initialCount);
</script>

{#if items.length > 0}
  <section class="uiv2-feed-recommended {className}">
    <h2 class="uiv2-feed-recommended__title">{title}</h2>
    <ul class="uiv2-feed-recommended__list">
      {#each visible as item (item.id)}
        <li>
          <button
            type="button"
            class="uiv2-feed-recommended__item"
            onclick={() => onOpen?.(item.id)}
          >
            <span class="uiv2-feed-recommended__avatar" aria-hidden="true">
              <UserAvatar src={item.avatar} label={item.title} />
            </span>
            <span class="uiv2-feed-recommended__meta">
              <span class="uiv2-feed-recommended__name">
                {item.title}
                {#if item.isVerified}
                  <span class="uiv2-feed-post__verified" title="Подтверждённый канал" aria-hidden="true">✓</span>
                {/if}
              </span>
              <span class="uiv2-feed-recommended__subs">
                {formatSubscriberLabel(item.subscriberCount)}
              </span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
    {#if canExpand}
      <UiV2Button
        variant={expanded ? 'ghost' : 'chrome'}
        size="sm"
        block
        label={expanded ? 'Свернуть' : 'Показать ещё'}
        onclick={() => {
          expanded = !expanded;
        }}
      />
    {/if}
  </section>
{/if}
