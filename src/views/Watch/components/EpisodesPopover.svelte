<script lang="ts">
  import type { EpisodeItem } from '../_types';
  import Page from '../../../components/Page.svelte';

  interface Props {
    episodes:   EpisodeItem[];
    currentEp:  number;
    loading:    boolean;
    showClose?: boolean;
    onselect:   (ep: number) => void;
    onclose:    () => void;
  }

  let { episodes, currentEp, loading, showClose = false, onselect, onclose }: Props = $props();

  let searchOpen = $state(false);
  let search     = $state('');

  const filtered = $derived(
    search.trim()
      ? episodes.filter(e => String(e.position).includes(search.trim()))
      : episodes,
  );

  function toggleSearch() {
    searchOpen = !searchOpen;
    if (!searchOpen) search = '';
  }

  /** True if ep.name is just a repetition of the episode number like "1069 серия" */
  function isRedundantName(ep: EpisodeItem): boolean {
    if (!ep.name) return true;
    const n = ep.name.trim().toLowerCase();
    // matches "1069 серия", "серия 1069", "1069", etc.
    return (
      n === String(ep.position) ||
      n === `${ep.position} серия` ||
      n === `серия ${ep.position}` ||
      n === `episode ${ep.position}` ||
      n === `ep ${ep.position}` ||
      n === `ep. ${ep.position}`
    );
  }
</script>

<div class="watch-panel watch-panel--episodes">
  <!-- Header -->
  <div class="watch-panel__header">
    <div class="watch-panel__header-left">
      <span class="watch-panel__title">
        {episodes.length > 0 ? `${episodes.length} серий` : 'Серии'}
      </span>
    </div>
    <div class="watch-panel__header-actions">
      <!-- Search toggle -->
      <button
        type="button"
        class="watch-panel__icon-btn {searchOpen ? 'watch-panel__icon-btn--active' : ''}"
        onclick={toggleSearch}
        aria-label="Поиск серии"
      >
        <!-- Lucide: Search -->
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
      </button>
      <!-- Close (optional) -->
      {#if showClose}
        <button type="button" class="watch-panel__icon-btn" onclick={onclose} aria-label="Закрыть">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Search input (collapsible) -->
  {#if searchOpen}
    <div class="watch-panel__search-wrap">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        inputmode="numeric"
        placeholder="Номер серии…"
        class="watch-panel__search"
        bind:value={search}
        autofocus
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      />
    </div>
  {/if}

  <!-- List -->
  {#if loading}
    <div class="watch-panel__loading">Загрузка…</div>
  {:else}
    <Page noPadding extraClass="watch-panel__scroll-page">
      {#each filtered as ep (ep.position)}
        <button
          type="button"
          class="watch-panel__ep-row {ep.position === currentEp ? 'watch-panel__ep-row--active' : ''}"
          onclick={(e) => { e.stopPropagation(); onselect(ep.position); }}
        >
          <span class="watch-panel__ep-icon">
            {#if ep.is_watched}
              <!-- CircleCheck (просмотрено) -->
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            {:else if ep.position === currentEp}
              <!-- CircleDot (текущая) -->
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            {:else}
              <!-- Circle пунктирный (не просмотрено) -->
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3.5 2.5" stroke-linecap="round">
                <circle cx="12" cy="12" r="10"/>
              </svg>
            {/if}
          </span>
          <span class="watch-panel__ep-label">
            Серия {ep.position}{!isRedundantName(ep) ? ` — ${ep.name}` : ''}
          </span>
        </button>
      {/each}

      {#if filtered.length === 0}
        <div class="watch-panel__empty">Нет результатов</div>
      {/if}
    </Page>
  {/if}
</div>
