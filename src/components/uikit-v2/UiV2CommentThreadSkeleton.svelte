<script lang="ts">
  import UiV2Skeleton from './UiV2Skeleton.svelte';

  type Props = {
    count?: number;
    nested?: boolean;
    class?: string;
  };

  let { count = 4, nested = false, class: className = '' }: Props = $props();
</script>

<div
  class="uiv2-comments uiv2-comment-thread-skeleton"
  class:uiv2-comments--nested={nested}
  class:uiv2-comment-thread-skeleton--nested={nested}
  aria-busy="true"
  aria-label="Загрузка комментариев"
>
  {#each Array.from({ length: count }) as _, i (i)}
    <article class="uiv2-comment uiv2-comment-thread-skeleton__item" class:uiv2-comment--nested={nested}>
      <UiV2Skeleton tag="div" class="uiv2-comment-thread-skeleton__avatar" rounded="full" />
      <div class="uiv2-comment-thread-skeleton__main">
        <div class="uiv2-comment-thread-skeleton__head">
          <UiV2Skeleton tag="div" class="uiv2-comment-thread-skeleton__author" rounded="sm" />
          <UiV2Skeleton tag="div" class="uiv2-comment-thread-skeleton__time" rounded="sm" />
        </div>
        <UiV2Skeleton tag="div" class="uiv2-comment-thread-skeleton__line" rounded="sm" />
        <UiV2Skeleton tag="div" class="uiv2-comment-thread-skeleton__line uiv2-comment-thread-skeleton__line--mid" rounded="sm" />
        <UiV2Skeleton tag="div" class="uiv2-comment-thread-skeleton__line uiv2-comment-thread-skeleton__line--short" rounded="sm" />
        <div class="uiv2-comment-thread-skeleton__actions">
          <UiV2Skeleton tag="div" class="uiv2-comment-thread-skeleton__action" rounded="pill" />
          <UiV2Skeleton tag="div" class="uiv2-comment-thread-skeleton__action" rounded="pill" />
        </div>
      </div>
    </article>
  {/each}
</div>
