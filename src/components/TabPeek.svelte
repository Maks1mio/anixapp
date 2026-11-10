<script lang="ts">
  /**
   * Соседняя вкладка на месте текущей: заранее отрисована, скрыта и проявляется при свайпе (actions/swipeTabs).
   * Должна лежать прямо внутри элемента с use:swipeTabs; неинтерактивна, на настоящую вкладку заменяется после свайпа.
   */
  import type { Snippet } from 'svelte';
  import { isMobileMode } from '../platform/mobile';

  interface Props {
    dir: 1 | -1;
    children?: Snippet;
  }
  let { dir, children }: Props = $props();
</script>

{#if isMobileMode()}
  <div class="tab-peek" data-tab-peek={dir} aria-hidden="true" inert>
    {@render children?.()}
  </div>
{/if}
