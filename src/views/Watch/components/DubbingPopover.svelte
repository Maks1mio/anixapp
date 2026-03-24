<script lang="ts">
  import type { DubberItem } from '../_types';

  interface Props {
    dubbers:         DubberItem[];
    currentDubberId: string;
    loading:         boolean;
    onselect:        (dub: DubberItem) => void;
    onclose:         () => void;
  }

  let { dubbers, currentDubberId, loading, onselect, onclose }: Props = $props();
</script>

<div class="watch-page__popover-panel watch-page__popover-panel--dubbing">
  <div class="watch-page__popover-head">
    <h3 class="watch-page__popover-title">Озвучка</h3>
    <button type="button" class="watch-page__popover-close" aria-label="Закрыть" onclick={onclose}></button>
  </div>
  <div class="watch-page__popover-body">
    {#if loading}
      <div class="watch-page__popover-load">Загрузка…</div>
    {:else}
      <div class="watch-page__popover-list">
        {#each dubbers as dub (dub.id)}
          {@const isActive = String(dub.id) === currentDubberId}
          <button
            type="button"
            class="watch-page__popover-item {isActive ? 'watch-page__popover-item--active' : ''}"
            onclick={() => onselect(dub)}
          >
            <span class="watch-page__popover-item-text">{dub.name}</span>
            {#if isActive}
              <span class="watch-page__popover-check">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
