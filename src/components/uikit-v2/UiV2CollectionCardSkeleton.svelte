<script lang="ts">
  import UiV2Skeleton from './UiV2Skeleton.svelte';

  type Props = {
    count?: number;
    class?: string;
  };

  let { count = 1, class: className = '' }: Props = $props();
</script>

<div class="uiv2-collection-skeleton-wrap {className}" aria-busy="true" aria-label="Загрузка коллекций">
  {#each Array.from({ length: count }) as _, i (i)}
    <article class="uiv2-collection-skeleton">
      <div class="uiv2-collection-skeleton__stack" aria-hidden="true">
        <UiV2Skeleton tag="div" class="uiv2-collection-skeleton__sheet uiv2-collection-skeleton__sheet--back" rounded="sm" />
        <UiV2Skeleton tag="div" class="uiv2-collection-skeleton__sheet uiv2-collection-skeleton__sheet--mid" rounded="sm" />
      </div>
      <div class="uiv2-collection-skeleton__card">
        <UiV2Skeleton tag="div" class="uiv2-collection-skeleton__media" rounded="none" />
        <div class="uiv2-collection-skeleton__footer">
          <UiV2Skeleton tag="div" class="uiv2-collection-skeleton__title" rounded="sm" />
          <UiV2Skeleton tag="div" class="uiv2-collection-skeleton__meta" rounded="sm" />
        </div>
      </div>
    </article>
  {/each}
</div>
