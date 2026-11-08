<script lang="ts">
  /**
   * Соседняя вкладка за краем экрана: заранее отрисована и едет за пальцем при свайпе (actions/swipeTabs).
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
  <div class="tab-peek" class:tab-peek--next={dir > 0} class:tab-peek--prev={dir < 0} data-tab-peek={dir} aria-hidden="true" inert>
    {@render children?.()}
  </div>
{/if}
