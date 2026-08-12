<script lang="ts">
  import UiV2AnimeCardSkeleton from './UiV2AnimeCardSkeleton.svelte';

  type Props = {
    count?: number;
    class?: string;
  };

  let { count = 8, class: className = '' }: Props = $props();
</script>

<div class="uiv2-carousel uiv2-carousel-skeleton {className}" aria-busy="true" aria-label="Загрузка карусели">
  <div class="uiv2-carousel__scroll">
    {#each Array.from({ length: count }) as _, i (i)}
      <div class="uiv2-carousel__item">
        <UiV2AnimeCardSkeleton variant="vertical" />
      </div>
    {/each}
  </div>
</div>
