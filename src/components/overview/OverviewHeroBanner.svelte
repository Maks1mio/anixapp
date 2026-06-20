<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onDestroy, onMount } from 'svelte';
  import { navigate } from '../../stores/navigation';
  import { openWatchModal } from '../../stores/modals';
  import type { OverviewBanner } from '../../utils/overview';
  import {
    parseBannerReleaseId,
    resolveHeroBackdrop,
  } from '../../utils/heroPlayback';
  import { resolveUploadUrl, type OverviewOverride } from '../../services/overview-overrides';
  import { GPU_AVAILABLE, startAnime4kImageUpscale, startAnime4kUpscale, type Anime4kSession } from '../../utils/anime4kUpscale';
  import { iconChevronLeft, iconChevronRight, iconPause, iconPlay } from '../icons';

  interface Props {
    items: OverviewBanner[];
    overrides?: OverviewOverride[];
  }

  let { items, overrides = [] }: Props = $props();

  const IDLE_SLIDE_SEC = 5;
  const SLIDE_CROSSFADE_MS = 320;
  const POSTER_UPSCALE_DELAY_MS = 450;
  const CUSTOM_VIDEO_LOAD_TIMEOUT_MS = 15_000;
  const DEFAULT_VIDEO_DURATION_SEC = 30;
  const STORAGE_MUTED_KEY = 'anixapp.overviewHero.muted';
  const STORAGE_PAUSED_KEY = 'anixapp.overviewHero.paused';

  const customVideoFailedUrls = new Set<string>();
  const PROGRESS_RING_R = 16;
  const PROGRESS_RING_C = 2 * Math.PI * PROGRESS_RING_R;
  const initialMuted = readStoredBoolean(STORAGE_MUTED_KEY, true);
  const initialPlaybackPaused = readStoredBoolean(STORAGE_PAUSED_KEY, false);

  let activeIndex = $state(0);
  /** UI-only; не читать в $effect — иначе mute перезапускает слайд */
  let mutedUi = $state(initialMuted);
  let montageMuted = initialMuted;
  /** UI-only; логика — montagePlaybackPaused (не в $effect) */
  let playbackPausedUi = $state(initialPlaybackPaused);
  // svelte-ignore non_reactive_update
  let montagePlaybackPaused = initialPlaybackPaused;
  let videoVisible = $state(false);

  let stageEl = $state<HTMLElement | null>(null);
  let poolHostEl = $state<HTMLElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);

  let customVideoEl: HTMLVideoElement | null = null;
  let customVideoTimeHandler: (() => void) | null = null;
  let slideDurationSec = $state(DEFAULT_VIDEO_DURATION_SEC);
  let videoUpscaleSession: Anime4kSession | null = null;
  let posterUpscaleSession: Anime4kSession | null = null;
  let posterUpscaled = $state(false);
  let posterUpscaleGen = 0;
  let resizeObserver: ResizeObserver | null = null;
  let slideTimerRaf: number | null = null;
  let slideTimerStart = 0;
  let loadGen = 0;
  let slideTransitioning = $state(false);
  let upscaleMode = 15;
  let upscaleEnabled = GPU_AVAILABLE;

  let slideElapsed = $state(0);
  let heroImage = $state('');
  let posterCurrent = $state('');
  let posterPrev = $state('');
  let lastCatalogKey = '';
  let posterUpscaleTimer: ReturnType<typeof setTimeout> | null = null;
  let slideTransitionTimer: ReturnType<typeof setTimeout> | null = null;

  const overridesKey = $derived(
    overrides.map((o) => `${o.bannerId}:${o.customVideoUrl ?? ''}:${o.customBgUrl ?? ''}`).join(';')
  );
  const catalogKey = $derived(`${items.length}|${items[0]?.id ?? ''}|${overridesKey}`);

  const activeBanner = $derived(items[activeIndex] ?? null);
  const activeOverride = $derived(
    activeBanner ? overrides.find((o) => o.bannerId === activeBanner.id) ?? null : null
  );
  const showSlideTimer = $derived(videoVisible && !montagePlaybackPaused);
  const timerDurationSec = $derived(showSlideTimer ? slideDurationSec : IDLE_SLIDE_SEC);
  const slideProgress = $derived(Math.min(1, slideElapsed / timerDurationSec));
  const progressRingOffset = $derived(PROGRESS_RING_C * (1 - slideProgress));

  function readStoredBoolean(key: string, fallback: boolean): boolean {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === 'true') return true;
      if (raw === 'false') return false;
    } catch {
      /* ignore storage errors */
    }
    return fallback;
  }

  function writeStoredBoolean(key: string, value: boolean) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      /* ignore storage errors */
    }
  }

  function advanceAfterMediaEnd(gen: number) {
    if (gen !== loadGen || montagePlaybackPaused || !videoVisible) return;
    if (items.length > 1) goTo(activeIndex + 1);
  }

  function preloadVideoUrl(url: string) {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;
    video.load();
  }

  function preloadImageUrl(url: string | null | undefined) {
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }

  function schedulePosterUpscale() {
    if (posterUpscaleTimer != null) clearTimeout(posterUpscaleTimer);
    posterUpscaleTimer = setTimeout(() => {
      posterUpscaleTimer = null;
      if (!videoVisible && !montagePlaybackPaused && !slideTransitioning) {
        void ensurePosterUpscale();
      }
    }, POSTER_UPSCALE_DELAY_MS);
  }

  function finishSlideTransition() {
    if (slideTransitionTimer != null) {
      clearTimeout(slideTransitionTimer);
      slideTransitionTimer = null;
    }
    slideTransitioning = false;
    if (!videoVisible && !montagePlaybackPaused) schedulePosterUpscale();
  }

  function beginSlideTransition() {
    slideTransitioning = true;
    stopPosterUpscale();
    if (slideTransitionTimer != null) clearTimeout(slideTransitionTimer);
    slideTransitionTimer = setTimeout(finishSlideTransition, SLIDE_CROSSFADE_MS);
  }

  function stopSlideTimer() {
    if (slideTimerRaf != null) {
      cancelAnimationFrame(slideTimerRaf);
      slideTimerRaf = null;
    }
    slideTimerStart = 0;
  }

  function restartSlideTimer(onComplete: () => void) {
    stopSlideTimer();
    const playing = videoVisible && !montagePlaybackPaused;

    if (!playing) {
      slideElapsed = 0;
    }
    slideTimerStart = performance.now() - slideElapsed * 1000;

    const tick = () => {
      const isPlaying = videoVisible && !montagePlaybackPaused;
      const duration = isPlaying ? slideDurationSec : IDLE_SLIDE_SEC;

      if (isPlaying) {
        if (customVideoEl) slideElapsed = customVideoEl.currentTime;
      } else {
        slideElapsed = (performance.now() - slideTimerStart) / 1000;
      }

      if (slideElapsed >= duration) {
        slideTimerRaf = null;
        onComplete();
        return;
      }
      slideTimerRaf = requestAnimationFrame(tick);
    };
    slideTimerRaf = requestAnimationFrame(tick);
  }

  function attachCustomVideoTimeSync(video: HTMLVideoElement) {
    if (customVideoTimeHandler) {
      customVideoEl?.removeEventListener('timeupdate', customVideoTimeHandler);
    }
    customVideoTimeHandler = () => {
      if (!montagePlaybackPaused && videoVisible) slideElapsed = video.currentTime;
    };
    video.addEventListener('timeupdate', customVideoTimeHandler);
  }

  function detachCustomVideoTimeSync() {
    if (customVideoTimeHandler && customVideoEl) {
      customVideoEl.removeEventListener('timeupdate', customVideoTimeHandler);
    }
    customVideoTimeHandler = null;
  }

  function stopCustomVideo() {
    detachCustomVideoTimeSync();
    if (customVideoEl) {
      customVideoEl.pause();
      customVideoEl.removeAttribute('src');
      customVideoEl.load();
      customVideoEl.remove();
      customVideoEl = null;
    }
  }

  function stopVideo() {
    stopCustomVideo();
    stopAllUpscale();
    videoVisible = false;
  }

  function pauseVideoPlayback(): number {
    if (customVideoEl) {
      customVideoEl.pause();
      return customVideoEl.currentTime;
    }
    return slideElapsed;
  }

  function resumeVideoPlayback() {
    if (customVideoEl) {
      customVideoEl.currentTime = slideElapsed;
      void customVideoEl.play().then(() => {
        videoVisible = true;
        void ensureVideoUpscale();
      }).catch(() => { /* autoplay blocked */ });
    }
  }

  function stopVideoUpscale() {
    videoUpscaleSession?.stop();
    videoUpscaleSession = null;
  }

  function stopPosterUpscale() {
    posterUpscaleGen++;
    posterUpscaleSession?.stop();
    posterUpscaleSession = null;
    posterUpscaled = false;
  }

  function stopAllUpscale() {
    stopVideoUpscale();
    stopPosterUpscale();
  }

  function preloadNeighbors() {
    if (items.length === 0) return;
    const next = (activeIndex + 1) % items.length;
    const prev = (activeIndex - 1 + items.length) % items.length;
    for (const idx of [activeIndex, next, prev]) {
      const banner = items[idx];
      if (!banner) continue;
      const override = overrides.find((o) => o.bannerId === banner.id);
      preloadImageUrl(resolveUploadUrl(override?.customBgUrl ?? null) ?? banner.image);
      const customUrl = resolveUploadUrl(override?.customVideoUrl ?? null);
      if (customUrl && !customVideoFailedUrls.has(customUrl)) preloadVideoUrl(customUrl);
    }
  }

  async function ensureVideoUpscale() {
    if (!upscaleEnabled || !GPU_AVAILABLE || !canvasEl || !videoVisible) {
      stopVideoUpscale();
      return;
    }
    stopPosterUpscale();
    const video = customVideoEl;
    if (!video || video.readyState < 1) return;
    stopVideoUpscale();
    videoUpscaleSession = await startAnime4kUpscale({
      video,
      canvas: canvasEl,
      mode: upscaleMode,
      container: stageEl,
      fit: 'cover',
    });
  }

  async function ensurePosterUpscale() {
    if (slideTransitioning || !GPU_AVAILABLE || !canvasEl || !posterCurrent || videoVisible || montagePlaybackPaused) {
      stopPosterUpscale();
      return;
    }

    const gen = ++posterUpscaleGen;
    posterUpscaleSession?.stop();
    posterUpscaleSession = null;
    posterUpscaled = false;

    const session = await startAnime4kImageUpscale({
      imageUrl: posterCurrent,
      canvas: canvasEl,
      mode: upscaleMode,
      container: stageEl,
      fit: 'cover',
    });

    if (gen !== posterUpscaleGen || videoVisible || montagePlaybackPaused) {
      session?.stop();
      return;
    }

    posterUpscaleSession = session;
    posterUpscaled = session != null;
  }

  function onVideoFirstFrame(gen: number) {
    if (gen !== loadGen || montagePlaybackPaused) return;
    stopPosterUpscale();
    slideElapsed = 0;
    videoVisible = true;
    finishSlideTransition();
    restartSlideTimer(() => {
      if (gen === loadGen && items.length > 1) goTo(activeIndex + 1);
    });
    void ensureVideoUpscale();
  }

  async function fallbackFromCustomVideo(gen: number, url: string) {
    if (gen !== loadGen) return;
    customVideoFailedUrls.add(url);
    stopCustomVideo();
    videoVisible = false;
    finishSlideTransition();
    restartSlideTimer(() => {
      if (gen === loadGen && items.length > 1) goTo(activeIndex + 1);
    });
  }

  async function startCustomVideo(url: string, gen: number, atElapsed = 0) {
    if (!poolHostEl || gen !== loadGen || montagePlaybackPaused) return;
    if (customVideoFailedUrls.has(url)) return;

    stopCustomVideo();
    const video = document.createElement('video');
    video.src = url;
    video.muted = montageMuted;
    video.playsInline = true;
    video.loop = false;
    video.preload = 'auto';
    video.className = 'hero-media__custom-video';
    poolHostEl.appendChild(video);
    customVideoEl = video;
    attachCustomVideoTimeSync(video);

    let settled = false;
    const fail = () => {
      if (settled || gen !== loadGen) return;
      settled = true;
      clearTimeout(loadTimeout);
      void fallbackFromCustomVideo(gen, url);
    };

    const loadTimeout = window.setTimeout(() => {
      if (videoVisible || gen !== loadGen) return;
      fail();
    }, CUSTOM_VIDEO_LOAD_TIMEOUT_MS);

    video.onloadedmetadata = () => {
      if (gen !== loadGen) return;
      const dur = video.duration;
      if (Number.isFinite(dur) && dur > 0) slideDurationSec = dur;
    };

    video.onplaying = () => {
      if (gen !== loadGen) return;
      settled = true;
      clearTimeout(loadTimeout);
      onVideoFirstFrame(gen);
    };

    video.onerror = () => fail();

    video.onended = () => {
      if (gen !== loadGen || montagePlaybackPaused) return;
      advanceAfterMediaEnd(gen);
    };

    try {
      if (atElapsed > 0) video.currentTime = atElapsed % (video.duration || slideDurationSec);
      await video.play();
    } catch {
      fail();
    }
  }

  async function loadActiveSlide(gen: number) {
    stopVideo();
    stopSlideTimer();
    slideElapsed = 0;

    const banner = items[activeIndex];
    if (!banner) return;

    const override = overrides.find((o) => o.bannerId === banner.id) ?? null;
    slideDurationSec = DEFAULT_VIDEO_DURATION_SEC;

    restartSlideTimer(() => {
      if (gen === loadGen && items.length > 1) goTo(activeIndex + 1);
    });

    preloadNeighbors();

    if (montagePlaybackPaused) return;

    const customUrl = resolveUploadUrl(override?.customVideoUrl ?? null);
    if (customUrl && !customVideoFailedUrls.has(customUrl)) {
      await startCustomVideo(customUrl, gen, 0);
      if (gen !== loadGen) return;
      if (videoVisible || customVideoEl) return;
    }

    finishSlideTransition();
  }

  async function goTo(index: number) {
    if (items.length === 0 || slideTransitioning) return;
    const newIndex = ((index % items.length) + items.length) % items.length;
    if (newIndex === activeIndex) return;

    const gen = ++loadGen;
    beginSlideTransition();
    stopSlideTimer();
    videoVisible = false;
    stopVideoUpscale();

    activeIndex = newIndex;
    stopVideo();
    void loadActiveSlide(gen);
  }

  function goNext() {
    goTo(activeIndex + 1);
  }

  function goPrev() {
    goTo(activeIndex - 1);
  }

  function openBanner(banner: OverviewBanner) {
    const action = banner.action.trim();
    if (!action) return;
    if (banner.type === 1) {
      const rid = parseInt(action, 10);
      if (rid) navigate(`/release/${rid}`);
      return;
    }
    if (banner.type === 2) {
      window.electron?.openExternal?.(action);
      return;
    }
    if (banner.type === 3) {
      const cid = parseInt(action, 10);
      if (cid) navigate(`/collection/${cid}`);
    }
  }

  function watchBanner(banner: OverviewBanner) {
    const id = parseBannerReleaseId(banner);
    if (!id) return openBanner(banner);
    openWatchModal(id, banner.title || 'Просмотр');
  }

  function toggleMute() {
    montageMuted = !montageMuted;
    mutedUi = montageMuted;
    writeStoredBoolean(STORAGE_MUTED_KEY, montageMuted);
    if (customVideoEl) customVideoEl.muted = montageMuted;
  }

  function togglePlaybackPause() {
    montagePlaybackPaused = !montagePlaybackPaused;
    playbackPausedUi = montagePlaybackPaused;
    writeStoredBoolean(STORAGE_PAUSED_KEY, montagePlaybackPaused);

    if (montagePlaybackPaused) {
      slideElapsed = pauseVideoPlayback();
      videoVisible = false;
      stopVideoUpscale();
      void ensurePosterUpscale();
      restartSlideTimer(() => {
        if (items.length > 1) goTo(activeIndex + 1);
      });
      return;
    }

    if (customVideoEl) {
      resumeVideoPlayback();
    } else {
      const override = activeOverride;
      const customUrl = resolveUploadUrl(override?.customVideoUrl ?? null);
      if (customUrl && !customVideoFailedUrls.has(customUrl)) {
        void startCustomVideo(customUrl, loadGen, slideElapsed);
      }
    }

    restartSlideTimer(() => {
      if (items.length > 1) goTo(activeIndex + 1);
    });
  }

  function updatePosterImage(url: string) {
    if (!url) {
      posterPrev = '';
      posterCurrent = '';
      return;
    }
    if (posterCurrent && url !== posterCurrent) {
      const outgoing = posterCurrent;
      posterPrev = outgoing;
      posterCurrent = url;
      setTimeout(() => {
        if (posterPrev === outgoing) posterPrev = '';
      }, SLIDE_CROSSFADE_MS + 80);
      return;
    }
    posterCurrent = url;
  }

  $effect(() => {
    posterCurrent;
    videoVisible;
    upscaleMode;
    canvasEl;
    stageEl;
    if (slideTransitioning || videoVisible || montagePlaybackPaused) {
      if (posterUpscaleTimer != null) {
        clearTimeout(posterUpscaleTimer);
        posterUpscaleTimer = null;
      }
      return;
    }
    schedulePosterUpscale();
  });

  $effect(() => {
    const key = catalogKey;
    if (items.length === 0 || !poolHostEl) return;
    if (activeIndex >= items.length) activeIndex = 0;
    if (key === lastCatalogKey) return;
    lastCatalogKey = key;

    const gen = ++loadGen;
    void loadActiveSlide(gen);
  });

  $effect(() => {
    const banner = activeBanner;
    if (!banner) {
      heroImage = '';
      updatePosterImage('');
      return;
    }
    const override = overrides.find((o) => o.bannerId === banner.id);
    const customBg = resolveUploadUrl(override?.customBgUrl ?? null);
    const fallback = banner.image;
    const nextImage = customBg || fallback;
    heroImage = nextImage;
    updatePosterImage(nextImage);
    if (customBg) return;

    const id = parseBannerReleaseId(banner);
    if (!id) return;
    void resolveHeroBackdrop(id, fallback).then((url) => {
      if (activeBanner?.id === banner.id) {
        heroImage = url;
        updatePosterImage(url);
      }
    });
  });

  onMount(() => {
    void window.electron?.getSettings?.().then((s) => {
      const settings = s as { upscaleEnabled?: boolean; upscaleMode?: number };
      if (typeof settings.upscaleMode === 'number') upscaleMode = settings.upscaleMode;
      upscaleEnabled = settings.upscaleEnabled !== false && GPU_AVAILABLE;
    });

    if (stageEl) {
      resizeObserver = new ResizeObserver(() => {
        if (videoVisible) void ensureVideoUpscale();
        else void ensurePosterUpscale();
      });
      resizeObserver.observe(stageEl);
    }

    const onUpscaleChanged = (e: Event) => {
      const d = (e as CustomEvent).detail as { upscaleEnabled?: boolean; upscaleMode?: number };
      if (typeof d.upscaleMode === 'number') upscaleMode = d.upscaleMode;
      if (typeof d.upscaleEnabled === 'boolean') upscaleEnabled = d.upscaleEnabled && GPU_AVAILABLE;
      if (videoVisible) void ensureVideoUpscale();
      else void ensurePosterUpscale();
    };
    window.addEventListener('anix:upscaleChanged', onUpscaleChanged);

    return () => window.removeEventListener('anix:upscaleChanged', onUpscaleChanged);
  });

  onDestroy(() => {
    loadGen++;
    if (posterUpscaleTimer != null) clearTimeout(posterUpscaleTimer);
    if (slideTransitionTimer != null) clearTimeout(slideTransitionTimer);
    stopSlideTimer();
    stopVideo();
    resizeObserver?.disconnect();
  });
</script>

{#if items.length > 0}
  <section class="overview-hero" aria-label="Подборка">
    <div
      class="overview-hero__stage"
      class:overview-hero__stage--playback={videoVisible && !montagePlaybackPaused}
      class:overview-hero__stage--transitioning={slideTransitioning}
      bind:this={stageEl}
    >
      <div class="overview-hero__media hero-media">
        {#if posterPrev}
          <img
            class="hero-media__poster hero-media__poster-layer hero-media__poster-layer--outgoing"
            src={posterPrev}
            alt=""
            decoding="async"
          />
        {/if}
        {#if posterCurrent}
          <img
            class="hero-media__poster hero-media__poster-layer"
            class:hero-media__poster-layer--incoming={posterPrev !== ''}
            class:hero-media__poster--hidden={videoVisible}
            class:hero-media__poster--upscaled={posterUpscaled}
            src={posterCurrent}
            alt=""
            decoding="async"
          />
        {:else}
          <div class="hero-media__poster hero-media__poster--placeholder hero-media__poster-layer" class:hero-media__poster--hidden={videoVisible}></div>
        {/if}

        <div class="hero-media__pool" bind:this={poolHostEl} class:hero-media__pool--visible={videoVisible}></div>

        <canvas
          bind:this={canvasEl}
          class="hero-media__canvas"
          class:hero-media__canvas--poster={posterUpscaled}
          hidden
          aria-hidden="true"
        ></canvas>
      </div>

      <div class="overview-hero__chrome">
      <div class="overview-hero__shade" aria-hidden="true"></div>

      <div class="overview-hero__content-wrap">
        {#key activeIndex}
          <div
            class="overview-hero__content"
            in:fade={{ duration: 200 }}
            out:fade={{ duration: 140 }}
          >
            {#if activeBanner?.title}
              <h2 class="overview-hero__title">{activeBanner.title}</h2>
            {/if}
            {#if activeBanner?.description}
              <p class="overview-hero__desc">{activeBanner.description}</p>
            {/if}

            <div class="overview-hero__actions">
              {#if activeBanner}
                <button type="button" class="overview-hero__btn overview-hero__btn--primary" onclick={() => watchBanner(activeBanner)}>
                  <span class="overview-hero__btn-icon" aria-hidden="true">{@html iconPlay(18)}</span>
                  Смотреть
                </button>
                <button type="button" class="overview-hero__btn overview-hero__btn--ghost" onclick={() => openBanner(activeBanner)}>
                  Подробнее
                </button>
              {/if}
            </div>
          </div>
        {/key}
      </div>

      {#if items.length > 1}
        <button type="button" class="overview-hero__arrow overview-hero__arrow--left" aria-label="Предыдущий" onclick={goPrev}>
          {@html iconChevronLeft(22)}
        </button>
        <button type="button" class="overview-hero__arrow overview-hero__arrow--right" aria-label="Следующий" onclick={goNext}>
          {@html iconChevronRight(22)}
        </button>
      {/if}

      <div class="overview-hero__media-controls">
        <div class="overview-hero__controls-row">
          <button
            type="button"
            class="overview-hero__ctrl-btn"
            class:overview-hero__ctrl-btn--progress={showSlideTimer}
            aria-label={playbackPausedUi ? 'Продолжить воспроизведение' : 'Пауза'}
            onclick={togglePlaybackPause}
          >
            {#if showSlideTimer}
              <svg class="overview-hero__progress-ring" viewBox="0 0 36 36" aria-hidden="true">
                <circle class="overview-hero__progress-bg" cx="18" cy="18" r={PROGRESS_RING_R} />
                <circle
                  class="overview-hero__progress-fill"
                  cx="18"
                  cy="18"
                  r={PROGRESS_RING_R}
                  style="stroke-dasharray: {PROGRESS_RING_C}; stroke-dashoffset: {progressRingOffset}"
                />
              </svg>
            {/if}
            <span class="overview-hero__ctrl-icon">
              {#if playbackPausedUi}
                {@html iconPlay(16)}
              {:else}
                {@html iconPause(16)}
              {/if}
            </span>
          </button>

          <button
            type="button"
            class="overview-hero__ctrl-btn"
            aria-label={mutedUi ? 'Включить звук' : 'Выключить звук'}
            onclick={toggleMute}
          >
            {#if mutedUi}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>
              </svg>
            {:else}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              </svg>
            {/if}
          </button>
        </div>

        {#if items.length > 1}
          <div class="overview-hero__dots" role="tablist" aria-label="Слайды">
            {#each items as banner, i (banner.id)}
              <button
                type="button"
                class="overview-hero__dot"
                class:overview-hero__dot--active={i === activeIndex}
                aria-label={`Слайд ${i + 1}`}
                onclick={() => goTo(i)}
              ></button>
            {/each}
          </div>
        {/if}
      </div>
      </div>
    </div>
  </section>
{/if}
