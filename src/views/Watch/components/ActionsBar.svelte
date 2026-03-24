<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { EpisodeItem, DubberItem } from '../_types';
  import EpisodesPopover from './EpisodesPopover.svelte';
  import DubbingPopover  from './DubbingPopover.svelte';

  interface Props {
    paused:          boolean;
    muted:           boolean;
    volume:          number;
    isFullscreen:    boolean;
    episodes:        EpisodeItem[];
    dubbers:         DubberItem[];
    currentEp:       number;
    currentDubberId: string;
    popoverType:     'series' | 'dubbing' | null;
    popoverLoading:  boolean;
    useVideo:        boolean;
    gpuAvailable:    boolean;
    upscaleEnabled:  boolean;
    ontogglePlay:    () => void;
    ontoggleMute:    () => void;
    onvolumechange:  (e: Event) => void;
    ontoggleUpscale: () => void;
    onskipOpening:   () => void;
    onopenSeries:    () => void;
    onopenDubbing:   () => void;
    onselectEp:      (ep: number) => void;
    onselectDub:     (dub: DubberItem) => void;
    onclosePopover:  () => void;
    onfullscreen:    () => void;
  }

  let {
    paused, muted, volume, isFullscreen,
    episodes, dubbers, currentEp, currentDubberId,
    popoverType, popoverLoading, useVideo, gpuAvailable, upscaleEnabled,
    ontogglePlay, ontoggleMute, onvolumechange, ontoggleUpscale, onskipOpening,
    onopenSeries, onopenDubbing, onselectEp, onselectDub,
    onclosePopover, onfullscreen,
  }: Props = $props();

  const sliderValue = $derived(muted ? 0 : volume);

  // ── Hover popover logic ────────────────────────────────────────────────────
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function enterTrigger(type: 'series' | 'dubbing') {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (popoverType !== type) {
      if (type === 'series') onopenSeries();
      else onopenDubbing();
    }
  }

  function enterPanel() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  }

  function leaveArea() {
    closeTimer = setTimeout(() => { closeTimer = null; onclosePopover(); }, 200);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="watch-page__btn-row">

  <!-- ── Left controls ──────────────────────────────────────────────────── -->
  <div class="watch-page__btns-left">

    <!-- Play / Pause -->
    <button type="button" class="watch-page__ctrl-btn"
      aria-label={paused ? 'Воспроизвести' : 'Пауза'}
      onclick={(e) => { e.stopPropagation(); ontogglePlay(); }}
    >
      {#if paused}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      {:else}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
        </svg>
      {/if}
    </button>

    <!-- Volume: expands on hover -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="watch-page__vol-wrap" onclick={(e) => e.stopPropagation()}>
      <button type="button" class="watch-page__vol-btn"
        aria-label={muted ? 'Включить звук' : 'Выключить звук'}
        onclick={ontoggleMute}
      >
        {#if muted}
          <!-- VolumeOff -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 9a5 5 0 0 1 .95 2.293"/><path d="M19.364 5.636a9 9 0 0 1 1.889 9.96"/>
            <path d="m2 2 20 20"/>
            <path d="m7 7-.587.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298V11"/>
            <path d="M9.828 4.172A.686.686 0 0 1 11 4.657v.686"/>
          </svg>
        {:else if volume === 0}
          <!-- VolumeX -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>
            <line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>
          </svg>
        {:else if volume < 33}
          <!-- Volume -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>
          </svg>
        {:else if volume < 66}
          <!-- Volume1 -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>
            <path d="M16 9a5 5 0 0 1 0 6"/>
          </svg>
        {:else}
          <!-- Volume2 -->
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>
            <path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>
          </svg>
        {/if}
      </button>
      <div class="watch-page__vol-slider-wrap">
        <input type="range" class="watch-page__vol-slider" min="0" max="100" value={sliderValue} oninput={onvolumechange} />
      </div>
    </div>

    <!-- +1:30 skip -->
    {#if useVideo}
      <button type="button" class="watch-page__ctrl-btn watch-page__ctrl-btn--text"
        onclick={(e) => { e.stopPropagation(); onskipOpening(); }}
      >
        <!-- RotateCw -->
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
        </svg>
        +1:30
      </button>
    {/if}

  </div>

  <!-- ── Right controls ─────────────────────────────────────────────────── -->
  <div class="watch-page__btns-right">

    <!-- Озвучка (hover-only, click disabled) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="watch-page__popover-anchor"
      onmouseenter={() => enterTrigger('dubbing')}
      onmouseleave={leaveArea}
    >
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        role="button"
        class="watch-page__ctrl-btn watch-page__ctrl-btn--text {popoverType === 'dubbing' ? 'watch-page__ctrl-btn--active' : ''}"
        style="cursor: default;"
      >
        <!-- MicVocal -->
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12"/>
          <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5"/>
          <circle cx="16" cy="7" r="5"/>
        </svg>
        Озвучка
      </div>

      {#if popoverType === 'dubbing'}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="watch-page__float-panel"
          onmouseenter={enterPanel}
          onmouseleave={leaveArea}
          in:scale={{ start: 0.94, duration: 160, opacity: 0 }}
          out:fade={{ duration: 120 }}
        >
          <DubbingPopover
            {dubbers}
            {currentDubberId}
            loading={popoverLoading}
            onselect={(dub) => { onselectDub(dub); onclosePopover(); }}
            onclose={onclosePopover}
          />
        </div>
      {/if}
    </div>

    <!-- Серии (hover-only, click disabled) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="watch-page__popover-anchor"
      onmouseenter={() => enterTrigger('series')}
      onmouseleave={leaveArea}
    >
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        role="button"
        class="watch-page__ctrl-btn watch-page__ctrl-btn--text {popoverType === 'series' ? 'watch-page__ctrl-btn--active' : ''}"
        style="cursor: default;"
      >
        <!-- GalleryVerticalEnd -->
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 2h10"/><path d="M5 6h14"/><rect width="18" height="12" x="3" y="10" rx="2"/>
        </svg>
        Серии
      </div>

      {#if popoverType === 'series'}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="watch-page__float-panel"
          onmouseenter={enterPanel}
          onmouseleave={leaveArea}
          in:scale={{ start: 0.94, duration: 160, opacity: 0 }}
          out:fade={{ duration: 120 }}
        >
          <EpisodesPopover
            {episodes}
            currentEp={currentEp}
            loading={popoverLoading}
            onselect={(ep) => { onselectEp(ep); onclosePopover(); }}
            onclose={onclosePopover}
          />
        </div>
      {/if}
    </div>

    <!-- Anime4K — Sparkles -->
    {#if gpuAvailable}
      <button
        type="button"
        class="watch-page__ctrl-btn {upscaleEnabled ? 'watch-page__ctrl-btn--upscale-on' : ''}"
        aria-label={upscaleEnabled ? 'Anime4K включён' : 'Anime4K выкл'}
        onclick={(e) => { e.stopPropagation(); ontoggleUpscale(); }}
      >
        <!-- Sparkles -->
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/>
          <path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>
        </svg>
      </button>
    {/if}

    <!-- Fullscreen — Maximize2 / Minimize2 -->
    <button
      type="button"
      class="watch-page__ctrl-btn"
      aria-label={isFullscreen ? 'Выйти из полного экрана' : 'Полный экран'}
      onclick={(e) => { e.stopPropagation(); onfullscreen(); }}
    >
      {#if isFullscreen}
        <!-- Minimize2 -->
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
          <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
        </svg>
      {:else}
        <!-- Maximize2 -->
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
          <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
        </svg>
      {/if}
    </button>

  </div>

</div>
