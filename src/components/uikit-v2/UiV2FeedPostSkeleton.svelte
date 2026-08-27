<script lang="ts">
  import UiV2Skeleton from './UiV2Skeleton.svelte';

  type Props = {
    count?: number;
    class?: string;
  };

  let { count = 1, class: className = '' }: Props = $props();
</script>

<div class="uiv2-feed-post-skeleton-wrap {className}" aria-busy="true" aria-label="Загрузка постов">
  {#each Array.from({ length: count }) as _, i (i)}
    <article class="uiv2-feed-post uiv2-feed-post--skeleton">
      <div class="uiv2-feed-post-skeleton__head">
        <UiV2Skeleton tag="div" class="uiv2-feed-post-skeleton__avatar" rounded="full" />
        <div class="uiv2-feed-post-skeleton__meta">
          <UiV2Skeleton tag="div" class="uiv2-feed-post-skeleton__line uiv2-feed-post-skeleton__line--title" rounded="sm" />
          <UiV2Skeleton tag="div" class="uiv2-feed-post-skeleton__line uiv2-feed-post-skeleton__line--time" rounded="sm" />
        </div>
        <div class="uiv2-feed-post-skeleton__body">
          <UiV2Skeleton tag="div" class="uiv2-feed-post-skeleton__line" rounded="sm" />
          <UiV2Skeleton tag="div" class="uiv2-feed-post-skeleton__line uiv2-feed-post-skeleton__line--short" rounded="sm" />
          <UiV2Skeleton tag="div" class="uiv2-feed-post-skeleton__media" rounded="lg" />
        </div>
        <div class="uiv2-feed-post-skeleton__foot">
          <UiV2Skeleton tag="div" class="uiv2-feed-post-skeleton__chip" rounded="sm" />
          <UiV2Skeleton tag="div" class="uiv2-feed-post-skeleton__chip" rounded="sm" />
        </div>
      </div>
    </article>
  {/each}
</div>
