<script lang="ts">
  import type { EpisodeItem } from '../_types';

  interface Props {
    episodes:  EpisodeItem[];
    currentEp: number;
    loading:   boolean;
    onselect:  (ep: number) => void;
    onclose:   () => void;
  }

  let { episodes, currentEp, loading, onselect, onclose }: Props = $props();

  let search   = $state('');
  const filtered = $derived(
    search.trim() ? episodes.filter(e => String(e.position).includes(search.trim())) : episodes,
  );
</script>

<div class="watch-page__popover-panel watch-page__popover-panel--series">
  <div class="watch-page__popover-head">
    <h3 class="watch-page__popover-title">Серии</h3>
    <button type="button" class="watch-page__popover-close" aria-label="Закрыть" onclick={onclose}></button>
  </div>
  <div class="watch-page__popover-body">
    {#if loading}
      <div class="watch-page__popover-load">Загрузка…</div>
    {:else}
      <div class="watch-page__popover-search-wrap">
        <input
          type="text"
          inputmode="numeric"
          placeholder="Номер серии…"
          class="watch-page__popover-search"
          bind:value={search}
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => e.stopPropagation()}
        />
      </div>
      <div class="watch-page__popover-ep-grid">
        {#each filtered as ep (ep.position)}
          <button
            type="button"
            class="watch-page__popover-ep-cell
              {ep.position === currentEp ? 'watch-page__popover-ep-cell--active' : ''}
              {ep.is_watched ? 'watch-page__popover-ep-cell--watched' : ''}"
            onclick={() => onselect(ep.position)}
          >
            <span class="watch-page__popover-ep-num">{ep.position}</span>
            {#if ep.is_watched}<span class="watch-page__popover-ep-check">✓</span>{/if}
          </button>
        {/each}
        {#if filtered.length === 0}
          <div class="watch-page__popover-load">Нет результатов</div>
        {/if}
      </div>
    {/if}
  </div>
</div>
