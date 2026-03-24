<script lang="ts">
  import type { DubberItem } from '../_types';
  import Page from '../../../components/Page.svelte';

  interface Props {
    dubbers:         DubberItem[];
    currentDubberId: string;
    loading:         boolean;
    showClose?:      boolean;
    onselect:        (dub: DubberItem) => void;
    onclose:         () => void;
  }

  let { dubbers, currentDubberId, loading, showClose = false, onselect, onclose }: Props = $props();

  // Split: subtitle if type=1 OR name contains "субтитр" (case-insensitive)
  const isSub      = (d: DubberItem) => d.type === 1 || /субтитр/i.test(d.name);
  const subtitles  = $derived(dubbers.filter(isSub));
  const voiceovers = $derived(dubbers.filter(d => !isSub(d)));

  function fmtViews(n?: number): string {
    if (n == null || n === 0) return '';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1_000)     return Math.round(n / 1_000) + 'к';
    return String(n);
  }
</script>

<div class="watch-panel watch-panel--dubbing">
  <!-- Header -->
  <div class="watch-panel__header">
    <span class="watch-panel__title">Выбор</span>
    {#if showClose}
      <button type="button" class="watch-panel__icon-btn" onclick={onclose} aria-label="Закрыть">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    {/if}
  </div>

  {#if loading}
    <div class="watch-panel__loading">Загрузка…</div>
  {:else}
    <Page noPadding extraClass="watch-panel__scroll-page">

      <!-- Subtitles section -->
      {#if subtitles.length > 0}
        <div class="watch-panel__section">Субтитры</div>
        {#each subtitles as dub (dub.id)}
          {@const active = String(dub.id) === currentDubberId}
          {@const views  = fmtViews(dub.view_count)}
          <button
            type="button"
            class="watch-panel__dub-row {active ? 'watch-panel__dub-row--active' : ''}"
            onclick={(e) => { e.stopPropagation(); onselect(dub); }}
          >
            <span class="watch-panel__dub-av">
              {#if dub.icon}
                <img src={dub.icon} alt={dub.name} class="watch-panel__dub-img" />
              {:else}
                <span class="watch-panel__dub-av-placeholder">
                  {dub.name.charAt(0).toUpperCase()}
                </span>
              {/if}
            </span>
            <span class="watch-panel__dub-info">
              <span class="watch-panel__dub-name">{dub.name}</span>
              {#if dub.episode_count}
                <span class="watch-panel__dub-meta">{dub.episode_count} эпизодов</span>
              {/if}
            </span>
            {#if views}
              <span class="watch-panel__dub-views">{views}</span>
            {/if}
            <!-- Lucide: Eye -->
            <svg class="watch-panel__dub-eye" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        {/each}
      {/if}

      <!-- Voiceovers section -->
      {#if voiceovers.length > 0}
        <div class="watch-panel__section">Озвучки</div>
        {#each voiceovers as dub (dub.id)}
          {@const active = String(dub.id) === currentDubberId}
          {@const views  = fmtViews(dub.view_count)}
          <button
            type="button"
            class="watch-panel__dub-row {active ? 'watch-panel__dub-row--active' : ''}"
            onclick={(e) => { e.stopPropagation(); onselect(dub); }}
          >
            <span class="watch-panel__dub-av">
              {#if dub.icon}
                <img src={dub.icon} alt={dub.name} class="watch-panel__dub-img" />
              {:else}
                <span class="watch-panel__dub-av-placeholder">
                  {dub.name.charAt(0).toUpperCase()}
                </span>
              {/if}
            </span>
            <span class="watch-panel__dub-info">
              <span class="watch-panel__dub-name">{dub.name}</span>
              {#if dub.episode_count}
                <span class="watch-panel__dub-meta">{dub.episode_count} эпизодов</span>
              {/if}
            </span>
            {#if views}
              <span class="watch-panel__dub-views">{views}</span>
            {/if}
            <!-- Lucide: Eye -->
            <svg class="watch-panel__dub-eye" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        {/each}
      {/if}

      {#if dubbers.length === 0}
        <div class="watch-panel__empty">Озвучки не найдены</div>
      {/if}
    </Page>
  {/if}
</div>
