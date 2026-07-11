<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { navigate } from '../../stores/navigation';
  import { openWatchModal } from '../../stores/modals';
  import type { OverviewBanner } from '../../utils/overview';
  import {
    parseBannerReleaseId,
    resolveHeroBackdrop,
    getCachedHeroBackdrop,
  } from '../../utils/heroPlayback';
  import {
    resolveCustomBgUrl,
    resolveCustomVideoUrl,
    type OverviewOverride,
  } from '../../services/overview-overrides';
  import {
    clearSteamSlideMediaInflight,
    getSteamSlideMedia,
    getSteamSlideMediaInflight,
    setSteamSlideMedia,
    setSteamSlideMediaInflight,
    warmSteamImage,
    warmSteamVideo,
    type SteamSlideMediaCacheValue,
  } from '../../services/steam-carousel-cache';
  import { buildScreenshotUrl } from '../../utils/posterUrl';
  import { iconChevronLeft, iconChevronRight, iconPlay } from '../icons';

  interface Props {
    items: OverviewBanner[];
    overrides?: OverviewOverride[];
  }

  type SlideMedia = SteamSlideMediaCacheValue;

  let { items, overrides = [] }: Props = $props();

  const AUTO_ADVANCE_SEC = 8;
  const SLIDE_ANIM_MS = 520;
  const VIDEO_MUTED_STORAGE_KEY = 'anixapp.overviewSteam.muted';

  function readStoredVideoMuted(): boolean {
    try {
      const stored = window.localStorage.getItem(VIDEO_MUTED_STORAGE_KEY);
      if (stored === 'false') return false;
      if (stored === 'true') return true;
    } catch {
      /* ignore storage errors */
    }
    return true;
  }

  function storeVideoMuted(muted: boolean) {
    try {
      window.localStorage.setItem(VIDEO_MUTED_STORAGE_KEY, String(muted));
    } catch {
      /* ignore storage errors */
    }
  }

  let activeIndex = $state(0);
  let animDir = $state<0 | 1 | -1>(0);
  let animating = $state(false);
  let mediaHover = $state(false);
  let thumbPreview = $state('');
  let videoReady = $state(false);
  let autoPaused = $state(false);
  let videoMuted = $state(readStoredVideoMuted());
  let slideProgress = $state(0);
  let interfaceHidden = $state(false);

  let videoEl = $state<HTMLVideoElement | null>(null);
  let progressRaf: number | null = null;
  let progressElapsedMs = 0;
  let progressLastTs = 0;
  let animTimer: ReturnType<typeof setTimeout> | null = null;
  let interfaceIdleTimer: ReturnType<typeof setTimeout> | null = null;
  let hoverGen = 0;
  let carouselPointerInside = false;
  let carouselFocusInside = false;

  let slideMediaById = $state<Record<number, SlideMedia>>({});
  const appliedMediaKeys = new Map<number, string>();
  const requestedMediaKeys = new Map<number, string>();
  let lastCoverCatalogKey = '';

  const count = $derived(items.length);
  const activeBanner = $derived(items[activeIndex] ?? null);
  const prevBanner = $derived(count > 1 ? items[(activeIndex - 1 + count) % count] : null);
  const nextBanner = $derived(count > 1 ? items[(activeIndex + 1) % count] : null);

  const activeOverride = $derived(
    activeBanner ? overrides.find((o) => o.bannerId === activeBanner.id) ?? null : null
  );
  const activeMedia = $derived(activeBanner ? slideMediaById[activeBanner.id] : undefined);
  const hoverVideoUrl = $derived(resolveCustomVideoUrl(activeOverride));
  const displayPoster = $derived(
    thumbPreview || activeMedia?.poster || resolveCustomBgUrl(activeOverride) || activeBanner?.image || ''
  );
  const showVideo = $derived(
    mediaHover && Boolean(hoverVideoUrl) && videoReady && !thumbPreview
  );

  function resolveAbsoluteUrl(url: string | null | undefined): string {
    if (!url) return '';
    try {
      const absolute = new URL(url, window.location.href).href;
      if (absolute.startsWith('http://') || absolute.startsWith('https://')) return absolute;
    } catch {
      /* ignore */
    }
    return url;
  }

  async function loadSlideMedia(
    banner: OverviewBanner,
    overrideRows: OverviewOverride[] = overrides,
    warmVideo = true
  ): Promise<SlideMedia> {
    const override = overrideRows.find((o) => o.bannerId === banner.id) ?? null;
    const customBg = resolveCustomBgUrl(override);
    const customVideo = resolveCustomVideoUrl(override);
    const cacheKey = [
      banner.id,
      banner.image,
      customBg ?? '',
      customVideo ?? '',
      override?.assetVersion ?? '',
    ].join('|');
    requestedMediaKeys.set(banner.id, cacheKey);

    const cached = getSteamSlideMedia(cacheKey);
    if (cached) {
      void warmSteamImage(cached.poster);
      if (warmVideo && cached.video) void warmSteamVideo(cached.video);
      if (
        requestedMediaKeys.get(banner.id) === cacheKey
        && appliedMediaKeys.get(banner.id) !== cacheKey
      ) {
        appliedMediaKeys.set(banner.id, cacheKey);
        slideMediaById = { ...slideMediaById, [banner.id]: cached };
      }
      return cached;
    }

    const pending = getSteamSlideMediaInflight(cacheKey);
    if (pending) {
      const media = await pending;
      if (warmVideo && media.video) void warmSteamVideo(media.video);
      if (requestedMediaKeys.get(banner.id) === cacheKey) {
        appliedMediaKeys.set(banner.id, cacheKey);
        slideMediaById = { ...slideMediaById, [banner.id]: media };
      }
      return media;
    }

    const task = (async () => {
      const fallback = resolveAbsoluteUrl(banner.image);
      const releaseId = parseBannerReleaseId(banner);

      let poster = customBg || fallback;
      let screenshots: string[] = [];

      if (!customBg && releaseId) {
        const cachedBackdrop = getCachedHeroBackdrop(releaseId);
        poster = cachedBackdrop || (await resolveHeroBackdrop(releaseId, fallback));

        const api = window.anixApi?.release;
        if (api?.info) {
          try {
            const data = await api.info(releaseId, true);
            const release = data?.release as Record<string, unknown> | undefined;
            const shots = (release?.screenshot_images ?? release?.screenshots) as string[] | undefined;
            if (shots?.length) {
              screenshots = shots
                .slice(0, 4)
                .map((s) => buildScreenshotUrl(s))
                .filter(Boolean);
            }
          } catch {
            /* ignore */
          }
        }
      }

      const media: SlideMedia = {
        poster: resolveAbsoluteUrl(poster),
        video: customVideo,
        screenshots,
      };
      setSteamSlideMedia(cacheKey, media);
      if (requestedMediaKeys.get(banner.id) === cacheKey) {
        appliedMediaKeys.set(banner.id, cacheKey);
        slideMediaById = { ...slideMediaById, [banner.id]: media };
      }
      void warmSteamImage(media.poster);
      for (const screenshot of media.screenshots) void warmSteamImage(screenshot);
      if (warmVideo && media.video) void warmSteamVideo(media.video);
      return media;
    })().finally(() => {
      clearSteamSlideMediaInflight(cacheKey);
    });

    setSteamSlideMediaInflight(cacheKey, task);
    return task;
  }

  function preloadNeighbors(
    index = activeIndex,
    bannerItems: OverviewBanner[] = items,
    overrideRows: OverviewOverride[] = overrides
  ) {
    const itemCount = bannerItems.length;
    if (itemCount === 0) return;
    const indices = new Set([
      index,
      (index + 1) % itemCount,
      (index - 1 + itemCount) % itemCount,
    ]);
    for (const idx of indices) {
      const banner = bannerItems[idx];
      if (banner) void loadSlideMedia(banner, overrideRows);
    }
  }

  async function preloadAllCovers(
    bannerItems: OverviewBanner[],
    overrideRows: OverviewOverride[]
  ) {
    for (const banner of bannerItems) {
      const override = overrideRows.find((o) => o.bannerId === banner.id) ?? null;
      const customBg = resolveCustomBgUrl(override);
      if (banner.image) void warmSteamImage(resolveAbsoluteUrl(banner.image));
      if (customBg) void warmSteamImage(customBg);

      const releaseId = parseBannerReleaseId(banner);
      const cachedBackdrop = releaseId ? getCachedHeroBackdrop(releaseId) : undefined;
      if (cachedBackdrop) void warmSteamImage(cachedBackdrop);
    }

    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(4, bannerItems.length) },
      async () => {
        while (cursor < bannerItems.length) {
          const banner = bannerItems[cursor++];
          if (!banner) continue;
          await loadSlideMedia(banner, overrideRows, false);
        }
      }
    );
    await Promise.allSettled(workers);
  }

  function peekPoster(banner: OverviewBanner | null): string {
    if (!banner) return '';
    const override = overrides.find((o) => o.bannerId === banner.id) ?? null;
    const customBg = resolveCustomBgUrl(override);
    const cached = slideMediaById[banner.id];
    return cached?.poster || customBg || banner.image || '';
  }

  function resetHoverVideo() {
    hoverGen++;
    videoReady = false;
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    }
  }

  function clearInterfaceIdleTimer() {
    if (interfaceIdleTimer != null) {
      clearTimeout(interfaceIdleTimer);
      interfaceIdleTimer = null;
    }
  }

  function scheduleInterfaceHide() {
    clearInterfaceIdleTimer();
    if (!mediaHover || !hoverVideoUrl || !videoReady) return;
    interfaceIdleTimer = setTimeout(() => {
      interfaceIdleTimer = null;
      if (mediaHover && videoReady) interfaceHidden = true;
    }, 3000);
  }

  function revealInterface() {
    if (!mediaHover) return;
    interfaceHidden = false;
    scheduleInterfaceHide();
  }

  function onMediaEnter() {
    mediaHover = true;
    interfaceHidden = false;
    thumbPreview = '';
    const gen = ++hoverGen;
    const url = hoverVideoUrl;
    if (!url || !videoEl) return;
    const shouldMute = videoMuted;
    videoEl.muted = true;
    videoEl.src = url;
    videoEl.load();
    void videoEl.play().then(() => {
      if (gen === hoverGen && mediaHover) {
        videoEl!.muted = shouldMute;
        videoReady = true;
        scheduleInterfaceHide();
      }
    }).catch(() => {
      if (gen === hoverGen) videoReady = false;
    });
  }

  function onMediaLeave() {
    mediaHover = false;
    interfaceHidden = false;
    clearInterfaceIdleTimer();
    resetHoverVideo();
  }

  function syncAutoPaused() {
    autoPaused = carouselPointerInside || carouselFocusInside;
  }

  function pauseAutoAdvance() {
    carouselPointerInside = true;
    syncAutoPaused();
  }

  function resumeAutoAdvance() {
    carouselPointerInside = false;
    syncAutoPaused();
  }

  function pauseAutoAdvanceForFocus() {
    carouselFocusInside = true;
    syncAutoPaused();
  }

  function resumeAutoAdvanceAfterFocus() {
    carouselFocusInside = false;
    syncAutoPaused();
  }

  function toggleVideoSound() {
    revealInterface();
    videoMuted = !videoMuted;
    storeVideoMuted(videoMuted);
    if (videoEl) videoEl.muted = videoMuted;
  }

  function beginAnim(dir: 1 | -1, nextIndex: number) {
    if (animating || count <= 1) return;
    animating = true;
    animDir = dir;
    thumbPreview = '';
    resetHoverVideo();
    mediaHover = false;
    activeIndex = nextIndex;
    progressElapsedMs = 0;
    slideProgress = 0;

    if (animTimer != null) clearTimeout(animTimer);
    animTimer = setTimeout(() => {
      animTimer = null;
      animDir = 0;
      animating = false;
      preloadNeighbors();
    }, SLIDE_ANIM_MS);
  }

  function goTo(index: number) {
    if (count === 0 || animating) return;
    const next = ((index % count) + count) % count;
    if (next === activeIndex) return;

    const forward = (next - activeIndex + count) % count;
    const backward = (activeIndex - next + count) % count;
    const dir: 1 | -1 = forward <= backward ? 1 : -1;
    beginAnim(dir, next);
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
      if (window.electron?.openExternal) window.electron.openExternal(action);
      else window.open(action, '_blank', 'noopener,noreferrer');
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

  function startProgressTimer() {
    stopProgressTimer();
    progressLastTs = 0;

    const tick = (now: number) => {
      if (progressLastTs === 0) progressLastTs = now;
      const delta = Math.min(now - progressLastTs, 100);
      progressLastTs = now;

      if (!autoPaused && !animating && count > 1) {
        progressElapsedMs += delta;
        slideProgress = Math.min(1, progressElapsedMs / (AUTO_ADVANCE_SEC * 1000));
        if (progressElapsedMs >= AUTO_ADVANCE_SEC * 1000) {
          progressElapsedMs = 0;
          slideProgress = 0;
          goNext();
        }
      }

      progressRaf = requestAnimationFrame(tick);
    };

    progressRaf = requestAnimationFrame(tick);
  }

  function stopProgressTimer() {
    if (progressRaf != null) {
      cancelAnimationFrame(progressRaf);
      progressRaf = null;
    }
    progressLastTs = 0;
  }

  $effect(() => {
    const index = activeIndex;
    const bannerItems = items;
    const overrideRows = overrides;
    const coverCatalogKey = [
      ...bannerItems.map((banner) => `${banner.id}:${banner.image}`),
      ...overrideRows.map(
        (override) => `${override.bannerId}:${override.customBgUrl ?? ''}:${override.assetVersion ?? ''}`
      ),
    ].join('|');
    untrack(() => {
      preloadNeighbors(index, bannerItems, overrideRows);
      if (coverCatalogKey !== lastCoverCatalogKey) {
        lastCoverCatalogKey = coverCatalogKey;
        void preloadAllCovers(bannerItems, overrideRows);
      }
    });
  });

  onMount(() => {
    startProgressTimer();
    return () => stopProgressTimer();
  });

  onDestroy(() => {
    if (animTimer != null) clearTimeout(animTimer);
    clearInterfaceIdleTimer();
    stopProgressTimer();
    resetHoverVideo();
  });
</script>

{#if items.length > 0}
  <section
    class="steam-hero"
    class:steam-hero--paused={autoPaused}
    aria-label="Подборка"
    onmouseenter={pauseAutoAdvance}
    onmouseleave={resumeAutoAdvance}
    onfocusin={pauseAutoAdvanceForFocus}
    onfocusout={resumeAutoAdvanceAfterFocus}
  >
    <div class="steam-hero__frame">
      {#if count > 1}
        <button
          type="button"
          class="steam-hero__peek steam-hero__peek--left"
          aria-label="Предыдущий"
          onclick={goPrev}
          disabled={animating}
        >
          {#if peekPoster(prevBanner)}
            <img class="steam-hero__peek-img" src={peekPoster(prevBanner)} alt="" decoding="async" />
          {/if}
          <span class="steam-hero__peek-shade" aria-hidden="true"></span>
          {#if prevBanner?.title}
            <span class="steam-hero__peek-title">{prevBanner.title}</span>
          {/if}
          <span class="steam-hero__peek-arrow" aria-hidden="true">{@html iconChevronLeft(20)}</span>
        </button>
      {/if}

      <div
        class="steam-hero__main"
        class:steam-hero__main--anim-next={animDir === 1}
        class:steam-hero__main--anim-prev={animDir === -1}
      >
        {#if activeBanner}
          <article
            class="steam-hero__card"
            class:steam-hero__card--interface-hidden={interfaceHidden}
            role="group"
            aria-label={activeBanner.title || 'Баннер'}
            onmouseenter={onMediaEnter}
            onmouseleave={onMediaLeave}
            onmousemove={revealInterface}
          >
            <div
              class="steam-hero__media"
              role="img"
              aria-label={activeBanner.title || 'Баннер'}
            >
              {#if displayPoster}
                <img
                  class="steam-hero__media-backdrop"
                  src={displayPoster}
                  alt=""
                  decoding="async"
                  aria-hidden="true"
                />
                <img
                  class="steam-hero__poster"
                  class:steam-hero__poster--hidden={showVideo}
                  src={displayPoster}
                  alt=""
                  decoding="async"
                  fetchpriority="high"
                />
              {:else}
                <div class="steam-hero__poster steam-hero__poster--placeholder"></div>
              {/if}

              {#if hoverVideoUrl}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video
                  bind:this={videoEl}
                  class="steam-hero__video"
                  class:steam-hero__video--visible={showVideo}
                  muted={videoMuted}
                  playsinline
                  loop
                  preload="none"
                ></video>

                <button
                  type="button"
                  class="steam-hero__sound"
                  class:steam-hero__sound--visible={mediaHover}
                  aria-label={videoMuted ? 'Включить звук' : 'Выключить звук'}
                  aria-pressed={!videoMuted}
                  onpointerdown={(event) => event.stopPropagation()}
                  onclick={(event) => {
                    event.stopPropagation();
                    toggleVideoSound();
                  }}
                >
                  {#if videoMuted}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M11 5 6 9H3v6h3l5 4V5Z"></path>
                      <path d="m16 9 6 6M22 9l-6 6"></path>
                    </svg>
                  {:else}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M11 5 6 9H3v6h3l5 4V5Z"></path>
                      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"></path>
                    </svg>
                  {/if}
                </button>
              {/if}

              {#if hoverVideoUrl}
                <span class="steam-hero__media-hint" class:steam-hero__media-hint--hidden={showVideo}>
                  Наведите для превью
                </span>
              {/if}
            </div>

            <div class="steam-hero__panel">
              <div class="steam-hero__panel-body">
                {#if activeBanner.title}
                  <h2 class="steam-hero__title">{activeBanner.title}</h2>
                {/if}
                {#if activeBanner.description}
                  <p class="steam-hero__desc">{activeBanner.description}</p>
                {/if}

                {#if activeMedia?.screenshots?.length}
                  <div class="steam-hero__shots" role="list" aria-label="Скриншоты">
                    {#each activeMedia.screenshots as shot, i (shot)}
                      <button
                        type="button"
                        class="steam-hero__shot"
                        class:steam-hero__shot--active={thumbPreview === shot}
                        aria-label={`Скриншот ${i + 1}`}
                        onmouseenter={() => { thumbPreview = shot; resetHoverVideo(); mediaHover = false; }}
                        onmouseleave={() => { thumbPreview = ''; }}
                        onclick={() => openBanner(activeBanner)}
                      >
                        <img src={shot} alt="" loading="lazy" decoding="async" />
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="steam-hero__actions">
                <button
                  type="button"
                  class="steam-hero__btn steam-hero__btn--primary"
                  onclick={() => watchBanner(activeBanner)}
                >
                  <span class="steam-hero__btn-icon" aria-hidden="true">{@html iconPlay(16)}</span>
                  Смотреть
                </button>
                <button
                  type="button"
                  class="steam-hero__btn steam-hero__btn--ghost"
                  onclick={() => openBanner(activeBanner)}
                >
                  Подробнее
                </button>
              </div>
            </div>
          </article>
        {/if}
      </div>

      {#if count > 1}
        <button
          type="button"
          class="steam-hero__peek steam-hero__peek--right"
          aria-label="Следующий"
          onclick={goNext}
          disabled={animating}
        >
          {#if peekPoster(nextBanner)}
            <img class="steam-hero__peek-img" src={peekPoster(nextBanner)} alt="" decoding="async" />
          {/if}
          <span class="steam-hero__peek-shade" aria-hidden="true"></span>
          {#if nextBanner?.title}
            <span class="steam-hero__peek-title">{nextBanner.title}</span>
          {/if}
          <span class="steam-hero__peek-arrow" aria-hidden="true">{@html iconChevronRight(20)}</span>
        </button>
      {/if}
    </div>

    {#if count > 1}
      <div class="steam-hero__dots" role="tablist" aria-label="Слайды">
        {#each items as banner, i (banner.id)}
          <button
            type="button"
            role="tab"
            class="steam-hero__dot"
            class:steam-hero__dot--active={i === activeIndex}
            class:steam-hero__dot--paused={i === activeIndex && autoPaused}
            aria-label={`Слайд ${i + 1}`}
            aria-selected={i === activeIndex}
            onclick={() => goTo(i)}
            disabled={animating}
          >
            <span
              class="steam-hero__dot-fill"
              style:transform={i === activeIndex ? `scaleX(${slideProgress})` : 'scaleX(0)'}
            ></span>
          </button>
        {/each}
      </div>
    {/if}
  </section>
{/if}
