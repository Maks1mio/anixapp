<script lang="ts">
  import UiV2Skeleton from './UiV2Skeleton.svelte';

  type Props = {
    lines?: number;
    class?: string;
  };

  let { lines = 12, class: className = '' }: Props = $props();
</script>

<div class="uiv2-api-panel-skeleton {className}" aria-busy="true" aria-label="Загрузка ответа API">
  {#each Array.from({ length: lines }) as _, i (i)}
    <div
      class="uiv2-api-panel-skeleton__line-wrap"
      class:uiv2-api-panel-skeleton__line-wrap--short={i % 4 === 3}
      class:uiv2-api-panel-skeleton__line-wrap--indent={i % 5 === 2}
    >
      <UiV2Skeleton tag="div" class="uiv2-api-panel-skeleton__line" rounded="sm" />
    </div>
  {/each}
</div>
