<script lang="ts">
  import type { DubberItem, DownloadedEpisodeItem } from '../_types';
  import Page from '../../../components/Page.svelte';
  import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
  import { formatDubberQuality, isDubberNovelty, sortDubbersPinnedFirst } from '../../../utils/dubber-meta';
  import { iconPin } from '../../../components/icons';

  interface Props {
    dubbers:         DubberItem[];
    currentDubberId: string;
    loading:         boolean;
    lastEpisodeTypeUpdateId?: number | null;
    downloadedEpisodes?: DownloadedEpisodeItem[];
    currentDownloadedPath?: string;
    showClose?:      boolean;
    onselect:        (dub: DubberItem) => void;
    onselectDownloadedMode?: () => void;
    ontogglePin?:    (dub: DubberItem) => void | Promise<void>;
    onclose:         () => void;
  }

  let {
    dubbers, currentDubberId, loading,
    lastEpisodeTypeUpdateId = null,
    downloadedEpisodes = [],
    currentDownloadedPath = '',
    showClose = false,
    onselect, onselectDownloadedMode, ontogglePin, onclose,
  }: Props = $props();

  const isSub = (d: DubberItem) => d.type === 1 || d.is_sub === true || /субтитр/i.test(d.name);
  const subtitles  = $derived(sortDubbersPinnedFirst(dubbers.filter(isSub)));
  const voiceovers = $derived(sortDubbersPinnedFirst(dubbers.filter(d => !isSub(d))));

  function fmtViews(n?: number): string {
    if (n == null || n === 0) return '';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1_000)     return Math.round(n / 1_000) + 'к';
    return String(n);
  }
</script>

{#snippet dubRow(dub: DubberItem)}
  {@const active = String(dub.id) === currentDubberId}
  {@const views  = fmtViews(dub.view_count)}
  {@const qualityLabel = formatDubberQuality(dub.quality)}
  {@const pinned = dub.pinned === true}
  {@const isNew = isDubberNovelty(dub.id, lastEpisodeTypeUpdateId)}
  <div
    class="watch-panel__dub-row {active ? 'watch-panel__dub-row--active' : ''}{pinned ? ' watch-panel__dub-row--pinned' : ''}"
    role="button"
    tabindex="0"
    onclick={(e) => { e.stopPropagation(); onselect(dub); }}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onselect(dub);
      }
    }}
  >
    {#if ontogglePin}
      <button
        type="button"
        class="watch-panel__dub-pin{pinned ? ' watch-panel__dub-pin--active' : ''}"
        aria-label={pinned ? 'Открепить озвучку' : 'Закрепить озвучку'}
        title={pinned ? 'Открепить' : 'Закрепить'}
        onclick={(e) => { e.stopPropagation(); void ontogglePin(dub); }}
      >
        {@html iconPin(14)}
      </button>
    {:else if pinned}
      <span class="watch-panel__dub-pin watch-panel__dub-pin--active" aria-hidden="true">{@html iconPin(14)}</span>
    {/if}
    <span class="watch-panel__dub-av">
      {#if dub.icon}
        <img src={resolveCdnAssetUrl(dub.icon)} alt={dub.name} class="watch-panel__dub-img" />
      {:else}
        <span class="watch-panel__dub-av-placeholder">
          {dub.name.charAt(0).toUpperCase()}
        </span>
      {/if}
    </span>
    <span class="watch-panel__dub-info">
      <span class="watch-panel__dub-name-row">
        <span class="watch-panel__dub-name">{dub.name}</span>
        {#if isNew}
          <span class="watch-panel__dub-new">НОВИНКА</span>
        {/if}
      </span>
      <span class="watch-panel__dub-meta-row">
        {#if dub.episode_count}
          <span class="watch-panel__dub-meta">{dub.episode_count} эпизодов</span>
        {/if}
        {#if qualityLabel}
          <span class="watch-panel__dub-quality">{qualityLabel}</span>
        {/if}
      </span>
    </span>
    {#if views}
      <span class="watch-panel__dub-views">{views}</span>
    {/if}
    <svg class="watch-panel__dub-eye" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  </div>
{/snippet}

<div class="watch-panel watch-panel--dubbing">
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

      {#if downloadedEpisodes.length > 0}
        <div class="watch-panel__section">Скаченные</div>
        <button
          type="button"
          class="watch-panel__dub-row {currentDownloadedPath ? 'watch-panel__dub-row--active' : ''}"
          onclick={(e) => { e.stopPropagation(); onselectDownloadedMode?.(); }}
        >
          <span class="watch-panel__dub-av">
            <span class="watch-panel__dub-av-placeholder watch-panel__dub-av-placeholder--local">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </span>
          </span>
          <span class="watch-panel__dub-info">
            <span class="watch-panel__dub-name">Скаченное</span>
            <span class="watch-panel__dub-meta">
              {downloadedEpisodes.length}
              {downloadedEpisodes.length === 1 ? ' серия' : downloadedEpisodes.length < 5 ? ' серии' : ' серий'}
            </span>
          </span>
        </button>
      {/if}

      {#if subtitles.length > 0}
        <div class="watch-panel__section">Субтитры</div>
        {#each subtitles as dub (dub.id)}
          {@render dubRow(dub)}
        {/each}
      {/if}

      {#if voiceovers.length > 0}
        <div class="watch-panel__section">Озвучки</div>
        {#each voiceovers as dub (dub.id)}
          {@render dubRow(dub)}
        {/each}
      {/if}

      {#if dubbers.length === 0 && downloadedEpisodes.length === 0}
        <div class="watch-panel__empty">Озвучки не найдены</div>
      {/if}
    </Page>
  {/if}
</div>
