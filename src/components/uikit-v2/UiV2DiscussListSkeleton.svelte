<script lang="ts">
  import UiV2Skeleton from './UiV2Skeleton.svelte';

  type Props = {
    count?: number;
    class?: string;
  };

  let { count = 5, class: className = '' }: Props = $props();
</script>

<div class="uiv2-discuss-skeleton {className}" aria-busy="true" aria-label="Загрузка списка">
  {#each Array.from({ length: count }) as _, i (i)}
    <div class="uiv2-discuss-skeleton__row">
      <UiV2Skeleton tag="div" class="uiv2-discuss-skeleton__poster" rounded="lg" />
      <div class="uiv2-discuss-skeleton__body">
        <UiV2Skeleton tag="div" class="uiv2-discuss-skeleton__title" rounded="sm" />
        <UiV2Skeleton tag="div" class="uiv2-discuss-skeleton__meta" rounded="sm" />
        <UiV2Skeleton tag="div" class="uiv2-discuss-skeleton__comments" rounded="sm" />
      </div>
    </div>
  {/each}
</div>
