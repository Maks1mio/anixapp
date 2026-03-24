<script lang="ts">
  import type { NextEpAltDub } from '../_types';

  interface Props {
    ep:             number;
    title:          string;
    dubberName:     string;
    sourceName:     string;
    useVideo:       boolean;
    hasPrevEp:      boolean;
    hasNextEp:      boolean;
    nextEpAltDub:   NextEpAltDub | null;
    currentDubLabel: string;
    onprevEp:       () => void;
    onnextEp:       () => void;
    onnextAltDub:   (alt: NextEpAltDub) => void;
  }

  let {
    ep, title, dubberName, sourceName, useVideo,
    hasPrevEp, hasNextEp, nextEpAltDub, currentDubLabel,
    onprevEp, onnextEp, onnextAltDub,
  }: Props = $props();
</script>

<div class="watch-page__top-bar">
  {#if hasPrevEp}
    <button
      type="button"
      class="watch-page__ep-nav watch-page__ep-nav--alt-next watch-page__ep-nav--alt-prev"
      onclick={(e) => { e.stopPropagation(); onprevEp(); }}
    >
      <!-- Lucide: SkipBack -->
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="19 20 9 12 19 4 19 20"/>
        <line x1="5" y1="19" x2="5" y2="5"/>
      </svg>
      <span class="watch-page__ep-nav-alt-inner">
        <span class="watch-page__ep-nav-main">Серия {ep - 1}</span>
        {#if currentDubLabel}
          <span class="watch-page__ep-nav-sub">в озвучке ({currentDubLabel})</span>
        {/if}
      </span>
    </button>
  {:else}
    <div class="watch-page__ep-nav-placeholder"></div>
  {/if}

  <div class="watch-page__title-block">
    <h1 class="watch-page__title">{title}</h1>
    <div class="watch-page__title-meta">
      <span>{ep} Серия</span>
      {#if dubberName || sourceName}
        <span class="watch-page__title-sep"></span>
        <span>{dubberName || sourceName}</span>
      {/if}
    </div>
    {#if !useVideo}
      <p class="watch-page__dub-hint">Если не загружается — выберите другую озвучку.</p>
    {/if}
  </div>

  {#if hasNextEp}
    <button
      type="button"
      class="watch-page__ep-nav watch-page__ep-nav--alt-next"
      onclick={(e) => { e.stopPropagation(); onnextEp(); }}
    >
      <span class="watch-page__ep-nav-alt-inner">
        <span class="watch-page__ep-nav-main">Серия {ep + 1}</span>
        {#if currentDubLabel}
          <span class="watch-page__ep-nav-sub">в озвучке ({currentDubLabel})</span>
        {/if}
      </span>
      <!-- Lucide: SkipForward -->
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 4 15 12 5 20 5 4"/>
        <line x1="19" y1="5" x2="19" y2="19"/>
      </svg>
    </button>
  {:else if nextEpAltDub}
    {@const alt = nextEpAltDub}
    <button
      type="button"
      class="watch-page__ep-nav watch-page__ep-nav--alt-next"
      onclick={(e) => { e.stopPropagation(); onnextAltDub(alt); }}
    >
      <span class="watch-page__ep-nav-alt-inner">
        <span class="watch-page__ep-nav-main">Серия {alt.targetEp}</span>
        <span class="watch-page__ep-nav-sub">в озвучке ({alt.dubber.name})</span>
      </span>
      <!-- Lucide: SkipForward -->
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 4 15 12 5 20 5 4"/>
        <line x1="19" y1="5" x2="19" y2="19"/>
      </svg>
    </button>
  {:else}
    <div class="watch-page__ep-nav-placeholder"></div>
  {/if}
</div>
