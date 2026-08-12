<script lang="ts">
  import UiV2Skeleton from './UiV2Skeleton.svelte';

  type Props = {
    count?: number;
    class?: string;
  };

  let { count = 6, class: className = '' }: Props = $props();
</script>

<div class="uiv2-reactions-skeleton {className}" aria-busy="true" aria-label="Загрузка реакций">
  {#each Array.from({ length: count }) as _, i (i)}
    <div class="uiv2-reactions-skeleton__row">
      <UiV2Skeleton tag="div" class="uiv2-reactions-skeleton__avatar" rounded="full" />
      <UiV2Skeleton tag="div" class="uiv2-reactions-skeleton__login" rounded="sm" />
      <UiV2Skeleton tag="div" class="uiv2-reactions-skeleton__vote" rounded="sm" />
    </div>
  {/each}
</div>
