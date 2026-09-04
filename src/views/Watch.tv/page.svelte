<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { getWatchParams } from '../../router';
  import { navigate } from '../../stores/navigation';
  import { PlayerCore } from '../Watch/core/PlayerCore';
  import {
    webGpu,
    initWebGpuAvailability,
    getWebGpuUnavailableReason,
  } from '../../utils/webgpu-availability.svelte';
  import { allowsIframeFallback, userPlaybackError } from '../Watch/_utils';
  import {
    buildTimelineSausages,
    clampSkipMarksToDuration,
    endingIsAtEpisodeEnd,
    normalizeSkipMarks,
    skipMarkActive,
    type SkipMarkKind,
    type SkipMarks,
  } from '../Watch/_skipMarks';
  import { setSkipAutoPref } from '../Watch/_skipPrefs';
  import { episodeDisplayNumber } from '../../utils/episode-display';
  import { scheduleFocusTvOverlayContent, focusTvWatchPlay } from '../../services/tv-navigation';
  import { isCapacitorNative } from '../../native/anix-api-native';
  import {
    ANIME4K_INTENSITIES,
    ANIME4K_TARGET_RES,
    ANIME4K_TYPES,
    anime4kTargetHeight,
    anime4kTargetResMenuLabel,
    mapAnime4kPreset,
    normalizeAnime4kPreset,
    normalizeAnime4kTargetRes,
    type Anime4kIntensity,
    type Anime4kTargetRes,
    type Anime4kType,
  } from '../Watch/core/anime4k-presets';
  import {
    SURROUND_MODES,
    normalizeSurroundMode,
    surroundModeDisplayLabel,
    type SurroundMode,
  } from '../Watch/core/surround-audio';
  import {
    iconPlay,
    iconPause,
    iconSettings,
    iconFilm,
    iconChevronRight,
  } from '../../components/icons';

  type LoadState = 'idle' | 'loading' | 'ready' | 'error';
  type Episode = { position: number; name: string; url: string; iframe: boolean };

  const params = getWatchParams();
  const releaseId = params.get('releaseId') || '';
  const sourceId = params.get('sourceId') || '';
  const dubberId = params.get('dubberId') || '';
  let ep = $state(parseInt(params.get('ep') || '1', 10));
  const title = params.get('title') || 'Просмотр';
  const sourceName = params.get('sourceName') || '';
  const dubberName = params.get('dubberName') || '';

  const core = new PlayerCore();
  const a4kOk = $derived(webGpu.status === 'available');

  let loadState = $state<LoadState>('loading');
  let errorText = $state('');
  let overlayVisible = $state(true);
  let panelOpen = $state(false);
  let settingsOpen = $state(false);
  let useVideo = $state(true);
  let playUrl = $state('');
  let switching = $state(false);

  let episodes = $state<Episode[]>([]);
  let paused = $state(true);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(100);

  let videoEl = $state<HTMLVideoElement | null>(null);
  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let rootEl = $state<HTMLElement | null>(null);

  let episodeLoadGen = 0;
  let overlayTimer = 0;
  let tickTimer = 0;
  let tickInterval = 0;
  let skipMarks = $state<SkipMarks | null>(null);
  let skipDismissedKind = $state<SkipMarkKind | null>(null);
  let timelineFocused = $state(false);
  let seekPreviewPct = $state(0);
  let qualityMap = $state<Record<string, string>>({});
  let currentQuality = $state('auto');
  let playbackRate = $state(1);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let upscaleCanvasOn = $state(false);
  let upscaleCanvasEpoch = $state(0);
  let upscaleType = $state<Anime4kType>('off');
  let upscaleIntensity = $state<Anime4kIntensity>('optimal');
  let upscaleTargetRes = $state<Anime4kTargetRes>('1080');
  let upscaleEnabled = $state(false);
  let upscaleMode = $state(15);
  let surroundMode = $state<SurroundMode>('off');

  let upscaleStartGen = 0;
  let upscaleRestartTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let upscaleRestartTries = 0;
  let upscaleHoldForNewFrame = false;

  const RATE_OPTIONS = [
    { value: 0.5, label: '0.5' },
    { value: 0.75, label: '0.75' },
    { value: 1, label: 'Обычная' },
    { value: 1.25, label: '1.25' },
    { value: 1.5, label: '1.5' },
  ] as const;

  const AUDIO_PRESET_OPTIONS = SURROUND_MODES.filter((item) => item.id !== 'equalizer');

  const VOLUME_KEY = 'anixapp_player_volume';
  const PLAYER_SETTINGS_KEY = 'anixapp_player_settings';
  const SEEK_STEP = 10;
  const TIMELINE_STEP_SEC = 5;

  const progressPct = $derived(duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0);
  const currentEpIndex = $derived(episodes.findIndex((item) => item.position === ep));
  const hasPrevEp = $derived(currentEpIndex > 0);
  const hasNextEp = $derived(currentEpIndex >= 0 && currentEpIndex < episodes.length - 1);
  const prevEp = $derived(hasPrevEp ? episodes[currentEpIndex - 1]?.position ?? null : null);
  const nextEp = $derived(hasNextEp ? episodes[currentEpIndex + 1]?.position ?? null : null);
  const epLabel = $derived.by(() => {
    const item = episodes.find((row) => row.position === ep);
    if (!item) return `Серия ${ep}`;
    const num = episodeDisplayNumber(item, episodes);
    if (item.name?.trim()) return item.name.trim();
    return num != null ? `Серия ${num}` : 'Серия';
  });
  const topMetaLine = $derived.by(() => {
    return [epLabel, dubberName, sourceName].filter(Boolean).join(' · ');
  });
  const timeCurrent = $derived(formatTime(currentTime));
  const timeRemaining = $derived(formatTime(Math.max(0, duration - currentTime)));
  const sausages = $derived(buildTimelineSausages(duration, skipMarks?.opening ?? null, skipMarks?.ending ?? null));
  const thumbPct = $derived(timelineFocused ? seekPreviewPct : progressPct);
  const previewTime = $derived(formatTime((thumbPct / 100) * duration));

  const skipPrompt = $derived.by((): SkipMarkKind | null => {
    if (!skipMarks || !useVideo || loadState !== 'ready' || switching) return null;
    const t = currentTime;
    if (skipMarkActive(t, skipMarks.opening, 'opening')) return 'opening';
    if (skipMarkActive(t, skipMarks.ending, 'ending')) return 'ending';
    return null;
  });

  const skipPromptVisible = $derived.by(() => {
    if (!skipPrompt || skipPrompt === skipDismissedKind) return null;
    return skipPrompt;
  });

  const skipToNextEp = $derived.by(() => {
    if (skipPrompt !== 'ending' || !endingIsAtEpisodeEnd(skipMarks?.ending, duration)) return null;
    return nextEp;
  });

  const skipWatchLabel = $derived(skipPromptVisible === 'ending' ? 'Смотреть эндинг' : 'Смотреть опенинг');
  const skipGoLabel = $derived(
    skipToNextEp != null
      ? `Следующая серия ${episodeDisplayNumber(
          episodes.find((row) => row.position === skipToNextEp) ?? { position: skipToNextEp },
          episodes,
        ) ?? skipToNextEp}`
      : (skipPromptVisible === 'ending' ? 'Пропустить эндинг' : 'Пропустить опенинг'),
  );

  $effect(() => {
    if (!skipPrompt) {
      skipDismissedKind = null;
    } else if (skipDismissedKind && skipPrompt !== skipDismissedKind) {
      skipDismissedKind = null;
    }
  });

  const qualityOptions = $derived.by(() => {
    const keys = Object.keys(qualityMap).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
    const opts = [{ id: 'auto', label: 'Автонастройка' }];
    for (const key of keys) {
      opts.push({ id: key, label: qualityLabel(key) });
    }
    return opts;
  });

  function qualityLabel(key: string): string {
    const n = Number.parseInt(key, 10);
    if (n >= 1080) return `${n}p FullHD`;
    if (n > 0) return `${n}p`;
    return key;
  }

  function closeTransientPanels() {
    panelOpen = false;
    settingsOpen = false;
  }

  function formatTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function positiveId(raw: string | number): number | null {
    const n = Number.parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function bindCoreEls() {
    core.video = videoEl;
    core.canvas = canvasEl;
    core.iframe = iframeEl;
  }

  function savePlayerSettings(partial: Record<string, unknown>) {
    if (window.electron?.saveSettings) {
      void window.electron.saveSettings(partial);
      return;
    }
    try {
      const prev = JSON.parse(localStorage.getItem(PLAYER_SETTINGS_KEY) || '{}') as Record<string, unknown>;
      localStorage.setItem(PLAYER_SETTINGS_KEY, JSON.stringify({ ...prev, ...partial }));
    } catch { /* ignore */ }
  }

  function clearUpscaleRestartTimer() {
    if (upscaleRestartTimer) {
      clearTimeout(upscaleRestartTimer);
      upscaleRestartTimer = 0;
    }
  }

  function ensureVideoVisible() {
    upscaleCanvasOn = false;
    videoEl?.classList.remove('watch-page__video--hidden-for-upscale');
  }

  function stopUpscale() {
    upscaleStartGen++;
    core.stopUpscale();
    upscaleCanvasOn = false;
    videoEl?.classList.remove('watch-page__video--hidden-for-upscale');
    upscaleCanvasEpoch += 1;
  }

  async function startUpscale() {
    bindCoreEls();
    const gen = ++upscaleStartGen;
    if (!upscaleEnabled || !a4kOk) {
      if (gen === upscaleStartGen) stopUpscale();
      return;
    }
    if (!useVideo) return;
    await tick();
    if (gen !== upscaleStartGen) return;
    bindCoreEls();

    const video = videoEl;
    const canvas = canvasEl;
    if (!video || !canvas) return;
    if (gen !== upscaleStartGen) return;
    // Пока нет кадров — не прячем video под пустой canvas.
    if (video.videoWidth < 2 || video.videoHeight < 2) return;

    const wantH = anime4kTargetHeight(upscaleTargetRes);
    const layout = core.upscale.desiredLayout({
      video,
      canvas,
      aspectRatio: 'auto',
      targetHeight: wantH,
    });

    if (
      core.upscale.active
      && upscaleCanvasOn
      && layout
      && core.upscale.matchesConfig(
        video.videoWidth,
        video.videoHeight,
        upscaleMode,
        wantH,
        'auto',
        layout.bufferW,
        layout.bufferH,
      )
    ) {
      core.upscale.applyCssLayout(layout, canvas, 'auto');
      video.classList.add('watch-page__video--hidden-for-upscale');
      return;
    }

    const ok = await core.startUpscale(upscaleEnabled, upscaleMode, 'auto', wantH);
    if (gen !== upscaleStartGen) return;

    if (ok && core.upscale.active) {
      upscaleCanvasOn = true;
      await tick();
      if (gen !== upscaleStartGen) return;
      videoEl?.classList.add('watch-page__video--hidden-for-upscale');
    } else {
      ensureVideoVisible();
    }
  }

  function scheduleUpscaleRestart() {
    if (!upscaleEnabled || !a4kOk || !useVideo) {
      upscaleHoldForNewFrame = false;
      ensureVideoVisible();
      return;
    }
    upscaleHoldForNewFrame = false;
    if (upscaleRestartTimer) return;
    upscaleRestartTries = 0;

    const attempt = () => {
      upscaleRestartTimer = 0;
      if (!upscaleEnabled || !a4kOk || !useVideo) return;
      const video = videoEl;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth < 2) {
        if (upscaleRestartTries++ < 50) {
          upscaleRestartTimer = window.setTimeout(attempt, 100);
        }
        return;
      }
      void startUpscale().then(() => {
        if (core.upscale.active && upscaleCanvasOn) return;
        if (upscaleRestartTries++ < 12) {
          upscaleRestartTimer = window.setTimeout(attempt, 300);
          return;
        }
        ensureVideoVisible();
      });
    };

    upscaleRestartTimer = window.setTimeout(attempt, 450);
  }

  function holdUpscaleForNewSource() {
    if (!upscaleEnabled || !a4kOk) return;
    upscaleHoldForNewFrame = true;
    clearUpscaleRestartTimer();
    stopUpscale();
  }

  function applyAnime4kFromSettings(raw: Record<string, unknown>) {
    const preset = normalizeAnime4kPreset(raw);
    const mapped = mapAnime4kPreset(preset);
    const targetRes = normalizeAnime4kTargetRes(raw.upscaleTargetRes);
    upscaleType = preset.type;
    upscaleIntensity = preset.intensity;
    upscaleEnabled = mapped.enabled;
    upscaleMode = mapped.mode;
    upscaleTargetRes = targetRes;
    if (!mapped.enabled) {
      stopUpscale();
      return;
    }
    if (useVideo) scheduleUpscaleRestart();
  }

  function applyAnime4kPreset(type: Anime4kType, intensity: Anime4kIntensity) {
    if (!a4kOk && type !== 'off') return;
    const mapped = mapAnime4kPreset({ type, intensity });
    upscaleType = type;
    upscaleIntensity = intensity;
    upscaleEnabled = mapped.enabled;
    upscaleMode = mapped.mode;
    savePlayerSettings({
      upscaleEnabled: mapped.enabled,
      upscaleMode: mapped.mode,
      upscaleType: type,
      upscaleIntensity: intensity,
      upscaleTargetRes,
    });
    if (mapped.enabled) void startUpscale();
    else stopUpscale();
    showOverlay(false);
  }

  function applyAnime4kTargetRes(res: Anime4kTargetRes) {
    const next = normalizeAnime4kTargetRes(res);
    if (upscaleTargetRes === next) return;
    upscaleTargetRes = next;
    savePlayerSettings({
      upscaleEnabled,
      upscaleMode,
      upscaleType,
      upscaleIntensity,
      upscaleTargetRes: next,
    });
    if (upscaleEnabled && a4kOk) void startUpscale();
    showOverlay(false);
  }

  async function syncSurroundAudio() {
    if (!videoEl || !useVideo) return;
    if (isCapacitorNative() && surroundMode === 'off') return;
    try {
      await core.surround.setMode(surroundMode);
      await core.surround.attach(videoEl);
      applyVolumeToVideo();
      await core.surround.resume();
    } catch { /* ignore */ }
  }

  function applySurroundMode(mode: SurroundMode) {
    surroundMode = normalizeSurroundMode(mode);
    savePlayerSettings({ audioSurround: surroundMode });
    void syncSurroundAudio();
    showOverlay(false);
  }

  function loadPlayerSettings() {
    if (window.electron?.getSettings) {
      void window.electron.getSettings().then((settings) => {
        surroundMode = normalizeSurroundMode(settings?.audioSurround);
        if (a4kOk) applyAnime4kFromSettings(settings ?? {});
        if (videoEl && useVideo) void syncSurroundAudio();
      }).catch(() => {});
      return;
    }
    try {
      const raw = localStorage.getItem(PLAYER_SETTINGS_KEY);
      if (!raw) return;
      const settings = JSON.parse(raw) as Record<string, unknown>;
      surroundMode = normalizeSurroundMode(settings.audioSurround);
      if (a4kOk) applyAnime4kFromSettings(settings);
      if (videoEl && useVideo) void syncSurroundAudio();
    } catch { /* ignore */ }
  }

  function onUpscaleSettingsChanged(event: Event) {
    if (!a4kOk) return;
    applyAnime4kFromSettings((event as CustomEvent<Record<string, unknown>>).detail ?? {});
  }

  function onSurroundSettingsChanged(event: Event) {
    const mode = (event as CustomEvent<{ audioSurround?: unknown }>).detail?.audioSurround;
    if (mode == null) return;
    surroundMode = normalizeSurroundMode(mode);
    void syncSurroundAudio();
  }

  function onWindowResize() {
    if (!upscaleEnabled || !a4kOk || !videoEl || !canvasEl) return;
    if (core.upscale.active) {
      const layout = core.upscale.desiredLayout({
        video: videoEl,
        canvas: canvasEl,
        aspectRatio: 'auto',
        targetHeight: anime4kTargetHeight(upscaleTargetRes),
      });
      if (layout) core.upscale.applyCssLayout(layout, canvasEl, 'auto');
      return;
    }
    scheduleUpscaleRestart();
  }

  $effect(() => {
    bindCoreEls();
  });

  $effect(() => {
    const video = videoEl;
    if (!video) return;
    const onMeta = () => scheduleUpscaleRestart();
    const onData = () => {
      if (!upscaleHoldForNewFrame) scheduleUpscaleRestart();
    };
    const onPlay = () => {
      void syncSurroundAudio();
      scheduleUpscaleRestart();
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('loadeddata', onData);
    video.addEventListener('playing', onPlay);
    return () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('loadeddata', onData);
      video.removeEventListener('playing', onPlay);
    };
  });

  function readVolume(): number {
    try {
      const raw = localStorage.getItem(VOLUME_KEY);
      const n = raw != null ? Number(raw) : NaN;
      if (!Number.isNaN(n) && n >= 0 && n <= 100) return n;
    } catch { /* ignore */ }
    return 100;
  }

  function applyVolumeToVideo() {
    if (!videoEl) return;
    const muted = volume <= 0;
    const linear = muted ? 0 : volume / 100;
    core.surround.setOutputLevel(linear);
    videoEl.muted = muted;
    videoEl.volume = linear;
  }

  function showOverlay(autoHide = true) {
    overlayVisible = true;
    if (overlayTimer) window.clearTimeout(overlayTimer);
    if (autoHide && loadState === 'ready' && !panelOpen && !settingsOpen) {
      overlayTimer = window.setTimeout(() => {
        overlayVisible = false;
        void tick().then(() => focusTvWatchPlay());
      }, 5000);
    }
  }

  function hideOverlay() {
    overlayVisible = false;
    if (overlayTimer) window.clearTimeout(overlayTimer);
    void tick().then(() => focusTvWatchPlay());
  }

  function syncPlaybackState() {
    if (!videoEl || !useVideo) {
      paused = true;
      return;
    }
    paused = videoEl.paused;
    currentTime = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
    duration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
    if (skipMarks && duration > 0) {
      const clamped = clampSkipMarksToDuration(skipMarks, duration);
      if (clamped !== skipMarks) skipMarks = clamped;
    }
  }

  function applySkipMarks(raw: unknown) {
    skipDismissedKind = null;
    skipMarks = normalizeSkipMarks(raw);
    if (skipMarks && duration > 0) {
      skipMarks = clampSkipMarksToDuration(skipMarks, duration);
    }
  }

  function rememberSkipPref(kind: SkipMarkKind, pref: 'auto' | 'watch') {
    if (!releaseId) return;
    setSkipAutoPref(releaseId, kind, pref);
  }

  function confirmWatchSkip(kind: SkipMarkKind) {
    rememberSkipPref(kind, 'watch');
    skipDismissedKind = kind;
    showOverlay();
  }

  function skipMediaMark(kind: SkipMarkKind) {
    skipDismissedKind = kind;
    rememberSkipPref(kind, 'auto');

    if (kind === 'ending' && skipToNextEp != null) {
      void loadEpisode(skipToNextEp);
      return;
    }

    const range = kind === 'opening' ? skipMarks?.opening : skipMarks?.ending;
    if (!range || !videoEl) return;
    const dur = videoEl.duration;
    const target = Number.isFinite(dur) && dur > 0
      ? Math.min(range.end + 0.05, Math.max(0, dur - 0.05))
      : range.end;
    videoEl.currentTime = target;
    syncPlaybackState();
    showOverlay();
  }

  function seekToPct(pct: number) {
    if (!useVideo || !videoEl || !(videoEl.duration > 0)) return;
    const clamped = Math.max(0, Math.min(100, pct));
    videoEl.currentTime = (clamped / 100) * videoEl.duration;
    seekPreviewPct = clamped;
    syncPlaybackState();
    showOverlay();
  }

  function nudgeTimeline(dir: -1 | 1) {
    if (!(duration > 0)) return;
    const stepPct = Math.max(0.35, (TIMELINE_STEP_SEC / duration) * 100);
    seekPreviewPct = Math.max(0, Math.min(100, seekPreviewPct + dir * stepPct));
    showOverlay(false);
  }

  function onTimelineFocus() {
    timelineFocused = true;
    seekPreviewPct = progressPct;
    showOverlay(false);
  }

  function onTimelineBlur() {
    timelineFocused = false;
  }

  function onTimelinePointerDown(event: PointerEvent) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      return;
    }
    const el = event.currentTarget as HTMLElement;
    const track = el.querySelector('.tv-watch__track');
    const target = track instanceof HTMLElement ? track : el;
    const rect = target.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    seekToPct(pct);
  }

  function onTimelineKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      nudgeTimeline(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      nudgeTimeline(1);
      return;
    }
    if (event.key === 'Enter' || event.key === 'NumpadEnter') {
      event.preventDefault();
      event.stopImmediatePropagation();
      seekToPct(seekPreviewPct);
    }
  }

  function startTicking() {
    if (tickTimer || tickInterval) return;
    if (isCapacitorNative()) {
      syncPlaybackState();
      tickInterval = window.setInterval(syncPlaybackState, 250);
      return;
    }
    const loop = () => {
      syncPlaybackState();
      tickTimer = window.requestAnimationFrame(loop);
    };
    tickTimer = window.requestAnimationFrame(loop);
  }

  function stopTicking() {
    if (tickTimer) window.cancelAnimationFrame(tickTimer);
    tickTimer = 0;
    if (tickInterval) window.clearInterval(tickInterval);
    tickInterval = 0;
  }

  function showError(embedUrl: string, text?: string) {
    loadState = 'error';
    errorText = text || userPlaybackError(embedUrl || core.origEpUrl);
    switching = false;
    overlayVisible = true;
    bindCoreEls();
    core.hideMedia();
  }

  function applyMedia(
    nextUrl: string,
    nextUseVideo: boolean,
    nextEp: number,
    seekTime?: number,
    initialPaused?: boolean,
  ) {
    playUrl = nextUrl;
    useVideo = nextUseVideo;
    ep = nextEp;
    bindCoreEls();
    loadState = 'ready';
    switching = false;
    showOverlay();

    const qs = new URLSearchParams({
      releaseId,
      sourceId,
      ep: String(nextEp),
      title,
      sourceName,
      ...(dubberId ? { dubberId } : {}),
      ...(dubberName ? { dubberName } : {}),
    });
    const hash = window.location.hash || '';
    if (hash.startsWith('#/watch')) {
      window.history.replaceState(null, '', `#/watch?${qs.toString()}`);
    } else if (typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', `/watch?${qs.toString()}`);
    }

    if (!nextUseVideo && !allowsIframeFallback(core.origEpUrl || nextUrl)) {
      showError(core.origEpUrl || nextUrl);
      return;
    }

    holdUpscaleForNewSource();

    core.applySource({
      url: nextUrl,
      useVideo: nextUseVideo,
      ep: nextEp,
      title,
      sourceName,
      dubberId,
      seekTime,
      initialPaused,
      volume,
      muted: volume <= 0,
      releaseId,
      sourceId,
      syncPlaybackRate: () => {
        if (videoEl) videoEl.playbackRate = playbackRate;
      },
      onFallback: () => {
        switching = false;
        if (core.origEpUrl && allowsIframeFallback(core.origEpUrl)) {
          applyMedia(core.origEpUrl, false, nextEp, seekTime, initialPaused);
          return;
        }
        showError(core.origEpUrl || nextUrl);
      },
      onReresolve: (savedTime, wasPaused) => {
        const embed = core.origEpUrl;
        if (!embed) return;
        core.invalidateCache(embed);
        void core.resolve(embed, false).then((res) => {
          if (!res.useVideo || !res.playUrl) {
            applyMedia(embed, false, nextEp, savedTime, wasPaused);
            return;
          }
          applyMedia(res.playUrl, true, nextEp, savedTime, wasPaused);
        }).catch(() => applyMedia(embed, false, nextEp, savedTime, wasPaused));
      },
      onWatchdogReresolve: async () => {
        const embed = core.origEpUrl;
        if (!embed) return null;
        core.invalidateCache(embed);
        const res = await core.resolve(embed, false, 3);
        if (!res.useVideo || !res.playUrl) return null;
        return { url: res.playUrl, useVideo: true };
      },
    });

    applyVolumeToVideo();
    void syncSurroundAudio();
    scheduleUpscaleRestart();
    startTicking();
  }

  async function loadEpisodesList(): Promise<Episode[]> {
    const rId = positiveId(releaseId);
    const sId = positiveId(sourceId);
    const dId = positiveId(dubberId);
    const api = window.anixApi?.release;
    if (!api?.getEpisodes || rId == null || sId == null || dId == null) return [];
    const res = await api.getEpisodes(rId, dId, sId);
    return (res?.episodes ?? []).filter((row: Episode) => !!row?.url);
  }

  async function loadEpisode(nextEp: number, seekTime?: number, initialPaused?: boolean) {
    const rId = positiveId(releaseId);
    const sId = positiveId(sourceId);
    const api = window.anixApi?.release;
    if (!api?.getEpisode || rId == null || sId == null) {
      showError('', 'Неверные параметры просмотра');
      return;
    }

    const myGen = ++episodeLoadGen;
    loadState = loadState === 'error' ? 'loading' : loadState;
    switching = true;
    panelOpen = false;
    showOverlay(false);

    try {
      let episode: Episode | undefined;
      const res = await api.getEpisode(rId, sId, nextEp);
      episode = res?.episode;
      if (!episode?.url && api.getEpisodes && dubberId) {
        const list = episodes.length ? episodes : await loadEpisodesList();
        episode = list.find((row) => row.position === nextEp);
      }
      if (!episode?.url) {
        showError('', 'Нет ссылки на видео');
        return;
      }

      core.setOrigEpisodeUrl(episode.url);
      const resolved = await core.resolve(episode.url, episode.iframe);
      if (myGen !== episodeLoadGen) return;
      applySkipMarks(resolved.skip);
      qualityMap = resolved.qualityMap ?? {};
      currentQuality = resolved.currentQuality || 'auto';
      applyMedia(resolved.playUrl, resolved.useVideo, nextEp, seekTime, initialPaused);
      void window.anixApi?.history?.markWatched?.(rId, sId, nextEp);
    } catch {
      if (myGen !== episodeLoadGen) return;
      showError('', 'Не удалось загрузить серию');
    }
  }

  function togglePlay() {
    if (!useVideo || !videoEl) return;
    if (videoEl.paused) {
      void videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
    }
    syncPlaybackState();
    showOverlay();
  }

  function seekBy(seconds: number, showUi = true) {
    if (!useVideo || !videoEl || !Number.isFinite(videoEl.duration)) return;
    const next = Math.max(0, Math.min(videoEl.duration, videoEl.currentTime + seconds));
    videoEl.currentTime = next;
    syncPlaybackState();
    if (showUi) showOverlay();
  }

  function goBack() {
    if (releaseId) {
      navigate(`/release/${releaseId}`);
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate('/');
  }

  function openPanel() {
    closeTransientPanels();
    panelOpen = true;
    overlayVisible = true;
    if (overlayTimer) window.clearTimeout(overlayTimer);
    void tick().then(() => scheduleFocusTvOverlayContent(20));
  }

  function openSettings() {
    closeTransientPanels();
    settingsOpen = true;
    overlayVisible = true;
    if (overlayTimer) window.clearTimeout(overlayTimer);
    void tick().then(() => scheduleFocusTvOverlayContent(30));
  }

  function closeSettings() {
    settingsOpen = false;
    showOverlay();
    void tick().then(() => focusTvWatchPlay());
  }

  function applyPlaybackRate(rate: number) {
    playbackRate = rate;
    if (videoEl) videoEl.playbackRate = rate;
    showOverlay(false);
  }

  function applyQuality(qualityId: string) {
    currentQuality = qualityId;
    if (!useVideo || !videoEl) return;
    const url = qualityId === 'auto'
      ? Object.values(qualityMap).sort((a, b) => {
        const na = Number.parseInt(a.match(/(\d{3,4})p?/)?.[1] ?? '0', 10);
        const nb = Number.parseInt(b.match(/(\d{3,4})p?/)?.[1] ?? '0', 10);
        return nb - na;
      })[0]
      : qualityMap[qualityId];
    if (!url) return;
    const saved = videoEl.currentTime;
    const wasPaused = videoEl.paused;
    holdUpscaleForNewSource();
    playUrl = url;
    core.applySource({
      url,
      useVideo: true,
      ep,
      title,
      sourceName,
      dubberId,
      seekTime: saved,
      initialPaused: wasPaused,
      volume,
      muted: volume <= 0,
      releaseId,
      sourceId,
      syncPlaybackRate: () => { if (videoEl) videoEl.playbackRate = playbackRate; },
      onFallback: () => {},
      onReresolve: () => {},
      onWatchdogReresolve: async () => null,
    });
    void syncSurroundAudio();
    scheduleUpscaleRestart();
    showOverlay(false);
  }

  function closePanel() {
    panelOpen = false;
    showOverlay();
    void tick().then(() => focusTvWatchPlay());
  }

  function selectEpisode(position: number) {
    if (position === ep) {
      closePanel();
      return;
    }
    void loadEpisode(position);
  }

  function onPlayerChangeContent(event: Event) {
    const detail = (event as CustomEvent).detail as {
      releaseId?: string;
      sourceId?: string;
      ep?: string;
      title?: string;
      sourceName?: string;
      dubberId?: string;
    } | undefined;
    if (!detail?.releaseId || !detail.sourceId || !detail.ep) return;
    void loadEpisode(parseInt(detail.ep, 10));
  }

  function onHideChrome() {
    hideOverlay();
  }

  function onShowChrome() {
    showOverlay(false);
    void tick().then(() => focusTvWatchPlay());
  }

  function onExitPlayer() {
    goBack();
  }

  function onTvSeek(event: Event) {
    const detail = (event as CustomEvent<{ seconds?: number; showUi?: boolean }>).detail;
    if (typeof detail?.seconds !== 'number') return;
    seekBy(detail.seconds, detail.showUi ?? false);
  }

  function onRootKeydown(event: KeyboardEvent) {
    if (event.key === ' ' || event.key === 'MediaPlayPause') {
      if (panelOpen) return;
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === 'MediaFastForward') {
      event.preventDefault();
      seekBy(SEEK_STEP);
      return;
    }
    if (event.key === 'MediaRewind') {
      event.preventDefault();
      seekBy(-SEEK_STEP);
    }
  }

  onMount(() => {
    volume = readVolume();
    bindCoreEls();
    void initWebGpuAvailability(true).then(() => loadPlayerSettings());
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('player:changeContent', onPlayerChangeContent);
    window.addEventListener('tv-watch:hide-chrome', onHideChrome);
    window.addEventListener('tv-watch:show-chrome', onShowChrome);
    window.addEventListener('tv-watch:exit', onExitPlayer);
    window.addEventListener('tv-watch:close-settings', closeSettings);
    window.addEventListener('tv-watch:seek', onTvSeek);
    window.addEventListener('anix:upscaleChanged', onUpscaleSettingsChanged);
    window.addEventListener('anix:surroundChanged', onSurroundSettingsChanged);

    void (async () => {
      try {
        episodes = await loadEpisodesList();
      } catch { /* ignore */ }
      await loadEpisode(ep);
      await tick();
      focusTvWatchPlay();
    })();

    return () => {
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('player:changeContent', onPlayerChangeContent);
      window.removeEventListener('tv-watch:hide-chrome', onHideChrome);
      window.removeEventListener('tv-watch:show-chrome', onShowChrome);
      window.removeEventListener('tv-watch:exit', onExitPlayer);
      window.removeEventListener('tv-watch:close-settings', closeSettings);
      window.removeEventListener('tv-watch:seek', onTvSeek);
      window.removeEventListener('anix:upscaleChanged', onUpscaleSettingsChanged);
      window.removeEventListener('anix:surroundChanged', onSurroundSettingsChanged);
      clearUpscaleRestartTimer();
      stopUpscale();
      if (overlayTimer) window.clearTimeout(overlayTimer);
      stopTicking();
      core.destroy();
    };
  });

  onDestroy(() => {
    stopTicking();
  });
</script>

<div
  class="tv-watch"
  class:tv-watch--chrome-hidden={loadState === 'ready' && !overlayVisible && !panelOpen && !settingsOpen}
  class:tv-watch--error={loadState === 'error'}
  class:tv-watch--iframe={!useVideo}
  bind:this={rootEl}
  onpointerdown={() => showOverlay()}
  onkeydown={onRootKeydown}
  role="application"
  aria-label="Плеер"
>
  <div class="tv-watch__stage">
    <iframe
      bind:this={iframeEl}
      class="tv-watch__iframe"
      src={!useVideo ? playUrl : ''}
      title="Видео"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      referrerpolicy="no-referrer-when-downgrade"
      hidden={useVideo || loadState !== 'ready' || switching}
    ></iframe>

    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoEl}
      class="tv-watch__video"
      playsinline
      crossorigin="anonymous"
      hidden={!useVideo || loadState === 'error' || switching}
    ></video>

    {#key upscaleCanvasEpoch}
      <canvas
        bind:this={canvasEl}
        class="tv-watch__upscale-canvas watch-page__upscale-canvas"
        class:watch-page__upscale-canvas--on={upscaleCanvasOn && useVideo && loadState === 'ready' && !switching}
        aria-hidden="true"
      ></canvas>
    {/key}

    {#if loadState === 'loading' || switching}
      <div class="tv-watch__loading" role="status">
        <span class="tv-watch__spinner" aria-hidden="true"></span>
        <span>Загрузка…</span>
      </div>
    {/if}

    {#if loadState === 'error'}
      <div class="tv-watch__error" role="alert">
        <p class="tv-watch__error-title">{errorText}</p>
        <button type="button" class="tv-watch__btn tv-watch__btn--primary" onclick={() => void loadEpisode(ep)}>
          Повторить
        </button>
        <button type="button" class="tv-watch__btn" onclick={goBack}>Назад</button>
      </div>
    {/if}
  </div>

  {#if loadState === 'ready' || loadState === 'error'}
    <div class="tv-watch__overlay" class:tv-watch__overlay--hidden={!overlayVisible && !panelOpen && !settingsOpen}>
      {#if loadState === 'ready' && overlayVisible}
        <header class="tv-watch__top">
          <h1 class="tv-watch__top-title">{title}</h1>
          {#if topMetaLine}
            <p class="tv-watch__top-meta">{topMetaLine}</p>
          {/if}
        </header>
      {/if}

      {#if loadState === 'ready'}
        <div class="tv-watch__center">
          {#if useVideo}
            <button
              type="button"
              class="tv-watch__play"
              class:tv-watch__play--hidden={!overlayVisible && !panelOpen && !settingsOpen}
              aria-label={paused ? 'Воспроизвести' : 'Пауза'}
              onclick={togglePlay}
            >
              {#if paused}
                {@html iconPlay(34)}
              {:else}
                {@html iconPause(34)}
              {/if}
            </button>
          {/if}
        </div>

        <footer class="tv-watch__dock">
          {#if skipPromptVisible}
            <div class="tv-watch__skip-row">
              <button
                type="button"
                class="tv-watch__skip-btn tv-watch__skip-btn--ghost"
                onclick={() => skipPromptVisible && confirmWatchSkip(skipPromptVisible)}
              >
                {skipWatchLabel}
              </button>
              <button
                type="button"
                class="tv-watch__skip-btn tv-watch__skip-btn--accent"
                onclick={() => skipPromptVisible && skipMediaMark(skipPromptVisible)}
              >
                {skipGoLabel}
              </button>
            </div>
          {/if}

          <div class="tv-watch__scrub">
            <div class="tv-watch__scrub-times">
              <span>{timelineFocused ? previewTime : timeCurrent}</span>
              <span>−{timeRemaining}</span>
            </div>
            <button
              type="button"
              class="tv-watch__timeline"
              class:tv-watch__timeline--focused={timelineFocused}
              role="slider"
              aria-label="Позиция воспроизведения"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(thumbPct)}
              aria-valuetext={timelineFocused ? previewTime : timeCurrent}
              disabled={!useVideo || !(duration > 0)}
              onfocus={onTimelineFocus}
              onblur={onTimelineBlur}
              onkeydown={onTimelineKeydown}
              onpointerdown={onTimelinePointerDown}
              onclick={(event) => event.preventDefault()}
            >
              <div class="tv-watch__track">
                <div class="tv-watch__track-segments">
                  {#each sausages as s (s.id)}
                    <div
                      class="tv-watch__track-segment"
                      class:tv-watch__track-segment--opening={s.kind === 'opening'}
                      class:tv-watch__track-segment--ending={s.kind === 'ending'}
                      style:flex-grow={Math.max(s.widthPct, 0.35)}
                    ></div>
                  {/each}
                </div>
                <div class="tv-watch__track-played" style:width="{progressPct}%"></div>
                <div class="tv-watch__timeline-thumb" style:left="{thumbPct}%"></div>
              </div>
            </button>
          </div>

          <div class="tv-watch__dock-bar">
            <div class="tv-watch__dock-group">
              <button type="button" class="tv-watch__dock-btn" onclick={openPanel}>
                <span class="tv-watch__dock-icon" aria-hidden="true">{@html iconFilm(20)}</span>
                <span>Серии</span>
              </button>
            </div>
            <div class="tv-watch__dock-group tv-watch__dock-group--end">
              <button type="button" class="tv-watch__dock-btn tv-watch__dock-btn--icon" aria-label="Настройки" onclick={openSettings}>
                {@html iconSettings(22)}
              </button>
              <button
                type="button"
                class="tv-watch__dock-btn tv-watch__dock-btn--icon"
                aria-label="Следующая серия"
                onclick={() => nextEp != null && loadEpisode(nextEp)}
                disabled={!hasNextEp}
              >
                {@html iconChevronRight(24)}
              </button>
            </div>
          </div>
        </footer>
      {/if}
    </div>
  {/if}

  {#if settingsOpen}
    <div class="tv-watch__settings" role="dialog" aria-modal="true" aria-label="Настройки воспроизведения">
      <div class="tv-watch__settings-card">
        <div class="tv-watch__settings-col">
          <h3 class="tv-watch__settings-title">Качество</h3>
          <div class="tv-watch__settings-list">
            {#each qualityOptions as item (item.id)}
              <button
                type="button"
                class="tv-watch__settings-item"
                class:tv-watch__settings-item--active={currentQuality === item.id}
                onclick={() => applyQuality(item.id)}
              >
                {#if currentQuality === item.id}
                  <span class="tv-watch__settings-check" aria-hidden="true">✓</span>
                {/if}
                <span>{item.label}</span>
              </button>
            {/each}
          </div>
        </div>
        <div class="tv-watch__settings-col">
          <h3 class="tv-watch__settings-title">Скорость воспроизведения</h3>
          <div class="tv-watch__settings-list">
            {#each RATE_OPTIONS as item (item.value)}
              <button
                type="button"
                class="tv-watch__settings-item"
                class:tv-watch__settings-item--active={playbackRate === item.value}
                onclick={() => applyPlaybackRate(item.value)}
              >
                {#if playbackRate === item.value}
                  <span class="tv-watch__settings-check" aria-hidden="true">✓</span>
                {/if}
                <span>{item.label}</span>
              </button>
            {/each}
          </div>
        </div>
        <div class="tv-watch__settings-col tv-watch__settings-col--scroll">
          <h3 class="tv-watch__settings-title">Anime4K</h3>
          {#if !a4kOk}
            <p class="tv-watch__settings-note">
              {webGpu.status === 'pending'
                ? 'Проверка WebGPU…'
                : (getWebGpuUnavailableReason() ?? 'WebGPU недоступен на этом устройстве')}
            </p>
          {:else}
            <p class="tv-watch__settings-subtitle">Режим</p>
            <div class="tv-watch__settings-list">
              {#each ANIME4K_TYPES as item (item.id)}
                <button
                  type="button"
                  class="tv-watch__settings-item"
                  class:tv-watch__settings-item--active={upscaleType === item.id}
                  onclick={() => applyAnime4kPreset(item.id, upscaleIntensity)}
                >
                  {#if upscaleType === item.id}
                    <span class="tv-watch__settings-check" aria-hidden="true">✓</span>
                  {/if}
                  <span>{item.recommended ? `${item.label} ★` : item.label}</span>
                </button>
              {/each}
            </div>
            <p class="tv-watch__settings-subtitle">Нагрузка</p>
            <div class="tv-watch__settings-list">
              {#each ANIME4K_INTENSITIES as item (item.id)}
                <button
                  type="button"
                  class="tv-watch__settings-item"
                  class:tv-watch__settings-item--active={upscaleIntensity === item.id}
                  class:tv-watch__settings-item--disabled={upscaleType === 'off'}
                  disabled={upscaleType === 'off'}
                  onclick={() => applyAnime4kPreset(upscaleType, item.id)}
                >
                  {#if upscaleIntensity === item.id}
                    <span class="tv-watch__settings-check" aria-hidden="true">✓</span>
                  {/if}
                  <span>{item.label}</span>
                </button>
              {/each}
            </div>
            <p class="tv-watch__settings-subtitle">Разрешение</p>
            <div class="tv-watch__settings-list">
              {#each ANIME4K_TARGET_RES as item (item.id)}
                <button
                  type="button"
                  class="tv-watch__settings-item"
                  class:tv-watch__settings-item--active={upscaleTargetRes === item.id}
                  class:tv-watch__settings-item--disabled={upscaleType === 'off'}
                  disabled={upscaleType === 'off'}
                  onclick={() => applyAnime4kTargetRes(item.id)}
                >
                  {#if upscaleTargetRes === item.id}
                    <span class="tv-watch__settings-check" aria-hidden="true">✓</span>
                  {/if}
                  <span>{anime4kTargetResMenuLabel(item.id)}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="tv-watch__settings-col tv-watch__settings-col--scroll">
          <h3 class="tv-watch__settings-title">Звук</h3>
          <div class="tv-watch__settings-list">
            {#each AUDIO_PRESET_OPTIONS as item (item.id)}
              <button
                type="button"
                class="tv-watch__settings-item"
                class:tv-watch__settings-item--active={surroundMode === item.id}
                onclick={() => applySurroundMode(item.id)}
              >
                {#if surroundMode === item.id}
                  <span class="tv-watch__settings-check" aria-hidden="true">✓</span>
                {/if}
                <span>{surroundModeDisplayLabel(item.id, item.recommended)}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if panelOpen}
    <div class="tv-watch__panel" role="dialog" aria-modal="true" aria-label="Список серий">
      <header class="tv-watch__panel-head">
        <h2 class="tv-watch__panel-title">Серии</h2>
        <button type="button" class="tv-watch__btn tv-watch__btn--icon tv-watch__panel-close" aria-label="Закрыть" onclick={closePanel}>
          ✕
        </button>
      </header>
      <div class="tv-watch__panel-list">
        {#each episodes as item (item.position)}
          {@const num = episodeDisplayNumber(item, episodes)}
          <button
            type="button"
            class="tv-watch__ep-item"
            class:tv-watch__ep-item--active={item.position === ep}
            onclick={() => selectEpisode(item.position)}
          >
            <span class="tv-watch__ep-num">{num ?? '•'}</span>
            <span class="tv-watch__ep-name">{item.name?.trim() || (num != null ? `Серия ${num}` : 'Серия')}</span>
          </button>
        {:else}
          <p class="tv-watch__panel-empty">Список серий пуст</p>
        {/each}
      </div>
    </div>
  {/if}
</div>
