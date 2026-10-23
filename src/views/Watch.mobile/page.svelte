<script lang="ts">
  /**
   * Плеер телефона — свой интерфейс поверх общего PlayerCore, как у TV (Watch.tv/page.svelte), но под пальцы:
   * касание — показать/скрыть панели, двойное касание по краю — перемотка, горизонтальный жест — перемотка
   * с превью, вертикальный справа — громкость, слева — яркость, удержание — 2×. Экран всегда альбомный.
   */
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { getWatchParams } from '../../router';
  import { navigate } from '../../stores/navigation';
  import { PlayerCore } from '../Watch/core/PlayerCore';
  import { getFluoPlayer, installWindowFluo } from '../../fluo';
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
  import { isCapacitorNative } from '../../native/anix-api-native';
  import { loadAppSettings } from '../../utils/app-settings';
  import { DEFAULT_PLAYER_HOTKEYS, formatSeekSeconds, normalizePlayerHotkeys } from '../../utils/player-hotkeys';
  import { bindNativeBackButton, pushBackHandler } from '../../platform/mobile-back';
  import {
    iconArrowLeft,
    iconPlay,
    iconPause,
    iconSettings,
    iconSkipBack,
    iconSkipForward,
    iconRotateCcw,
    iconRotateCw,
    iconListVideo,
    iconGauge,
    iconLock,
    iconLockOpen,
    iconVolume2,
    iconVolumeX,
    iconSun,
    iconX,
    iconCheck,
    iconFastRewindTime,
  } from '../../components/icons';

  type LoadState = 'loading' | 'ready' | 'error';
  type Episode = { position: number; name: string; url: string; iframe: boolean };
  type Sheet = 'episodes' | 'settings' | null;
  type Gesture = 'none' | 'seek' | 'volume' | 'brightness';

  const params = getWatchParams();
  const releaseId = params.get('releaseId') || '';
  const sourceId = params.get('sourceId') || '';
  const dubberId = params.get('dubberId') || '';
  const title = params.get('title') || 'Просмотр';
  const sourceName = params.get('sourceName') || '';
  const dubberName = params.get('dubberName') || '';
  let ep = $state(parseInt(params.get('ep') || '1', 10));

  const core = new PlayerCore();
  const fluo = getFluoPlayer();
  installWindowFluo();

  const VOLUME_KEY = 'anixapp_player_volume';
  const BRIGHTNESS_KEY = 'anixapp_player_brightness';
  const HIDE_MS = 3500;
  const DOUBLE_TAP_MS = 280;
  const LONG_PRESS_MS = 450;
  const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  let loadState = $state<LoadState>('loading');
  let errorText = $state('');
  let switching = $state(false);
  let firstFrame = $state(false);
  let useVideo = $state(true);
  let playUrl = $state('');
  let episodes = $state<Episode[]>([]);

  let paused = $state(true);
  let currentTime = $state(0);
  let duration = $state(0);
  let bufferedPct = $state(0);
  let volume = $state(100);
  let brightness = $state(1);
  let playbackRate = $state(1);
  let qualityMap = $state<Record<string, string>>({});
  let currentQuality = $state('auto');
  let seekStep = $state(DEFAULT_PLAYER_HOTKEYS.seekSeconds);
  let rewindStep = $state(DEFAULT_PLAYER_HOTKEYS.rewindSeconds);

  let controlsVisible = $state(true);
  let locked = $state(false);
  let sheet = $state<Sheet>(null);
  let skipMarks = $state<SkipMarks | null>(null);
  let skipDismissedKind = $state<SkipMarkKind | null>(null);

  // жесты
  let gesture = $state<Gesture>('none');
  let scrubTime = $state(0);
  let timelineDragging = $state(false);
  let boosted = $state(false);
  let tapSeek = $state<{ side: -1 | 1; total: number } | null>(null);
  let hudKind = $state<'volume' | 'brightness' | null>(null);

  let videoEl = $state<HTMLVideoElement | null>(null);
  let iframeEl = $state<HTMLIFrameElement | null>(null);
  let trackEl = $state<HTMLElement | null>(null);

  let episodeLoadGen = 0;
  let hideTimer = 0;
  let tickTimer = 0;
  let hudTimer = 0;
  let tapSeekTimer = 0;
  let firstFrameTimer = 0;

  const progressPct = $derived(duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0);
  const shownTime = $derived(gesture === 'seek' || timelineDragging ? scrubTime : currentTime);
  const shownPct = $derived(duration > 0 ? Math.min(100, (shownTime / duration) * 100) : 0);
  const currentEpIndex = $derived(episodes.findIndex((item) => item.position === ep));
  const prevEp = $derived(currentEpIndex > 0 ? episodes[currentEpIndex - 1]?.position ?? null : null);
  const nextEp = $derived(currentEpIndex >= 0 && currentEpIndex < episodes.length - 1 ? episodes[currentEpIndex + 1]?.position ?? null : null);
  const epLabel = $derived.by(() => {
    const item = episodes.find((row) => row.position === ep);
    if (!item) return `${ep} серия`;
    if (item.name?.trim()) return item.name.trim();
    const num = episodeDisplayNumber(item, episodes);
    return num != null ? `${num} серия` : 'Серия';
  });
  const subtitle = $derived([epLabel, dubberName, sourceName].filter(Boolean).join(' · '));
  const sausages = $derived(buildTimelineSausages(duration, skipMarks?.opening ?? null, skipMarks?.ending ?? null));
  const showLoading = $derived(loadState === 'loading' || switching || (loadState === 'ready' && useVideo && !firstFrame));
  const rateLabel = $derived(playbackRate === 1 ? '1×' : `${playbackRate}×`);
  const qualityShort = $derived(currentQuality === 'auto' ? 'Авто' : `${Number.parseInt(currentQuality, 10) || currentQuality}p`);
  const scrubDelta = $derived(scrubTime - currentTime);

  const skipPrompt = $derived.by((): SkipMarkKind | null => {
    if (!skipMarks || !useVideo || loadState !== 'ready' || switching) return null;
    if (skipMarkActive(currentTime, skipMarks.opening, 'opening')) return 'opening';
    if (skipMarkActive(currentTime, skipMarks.ending, 'ending')) return 'ending';
    return null;
  });
  const skipPromptVisible = $derived(skipPrompt && skipPrompt !== skipDismissedKind ? skipPrompt : null);
  const skipToNextEp = $derived(
    skipPrompt === 'ending' && endingIsAtEpisodeEnd(skipMarks?.ending, duration) ? nextEp : null,
  );

  $effect(() => {
    if (!skipPrompt || (skipDismissedKind && skipPrompt !== skipDismissedKind)) skipDismissedKind = null;
  });

  const qualityOptions = $derived.by(() => {
    const keys = Object.keys(qualityMap).sort((a, b) => Number.parseInt(b, 10) - Number.parseInt(a, 10));
    return [{ id: 'auto', label: 'Авто' }, ...keys.map((k) => ({ id: k, label: `${Number.parseInt(k, 10) || k}p` }))];
  });

  function formatTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }

  function positiveId(raw: string | number): number | null {
    const n = Number.parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // ── Панели ───────────────────────────────────────────────────────────────────────────────
  function scheduleHide() {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      hideTimer = 0;
      if (paused || sheet || timelineDragging || loadState !== 'ready') return;
      controlsVisible = false;
    }, HIDE_MS);
  }

  function showControls() {
    controlsVisible = true;
    scheduleHide();
  }

  function toggleControls() {
    if (controlsVisible) {
      controlsVisible = false;
      if (hideTimer) window.clearTimeout(hideTimer);
    } else {
      showControls();
    }
  }

  $effect(() => {
    // на паузе панели не прячутся; при старте воспроизведения — снова таймер
    if (!paused && controlsVisible) scheduleHide();
  });

  function openSheet(next: Sheet) {
    sheet = next;
    controlsVisible = true;
    if (hideTimer) window.clearTimeout(hideTimer);
  }

  function closeSheet() {
    sheet = null;
    showControls();
  }

  // ── Медиа ────────────────────────────────────────────────────────────────────────────────
  function bindCoreEls() {
    core.video = videoEl;
    core.canvas = null;
    core.iframe = iframeEl;
    fluo.bind({ video: videoEl, core });
  }

  $effect(() => {
    bindCoreEls();
  });

  function readNumber(key: string, fallback: number, min: number, max: number): number {
    try {
      const n = Number(localStorage.getItem(key));
      if (localStorage.getItem(key) != null && Number.isFinite(n) && n >= min && n <= max) return n;
    } catch { /* ignore */ }
    return fallback;
  }

  function applyVolume() {
    if (!videoEl) return;
    const linear = Math.max(0, Math.min(1, volume / 100));
    core.surround.setOutputLevel(linear);
    videoEl.muted = linear <= 0;
    videoEl.volume = linear;
  }

  function syncPlaybackState() {
    if (!videoEl || !useVideo) {
      paused = true;
      return;
    }
    paused = videoEl.paused;
    currentTime = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
    duration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
    bufferedPct = 0;
    if (duration > 0) {
      const ranges = videoEl.buffered;
      for (let i = 0; i < ranges.length; i += 1) {
        if (ranges.start(i) <= currentTime + 0.5 && ranges.end(i) >= currentTime) {
          bufferedPct = Math.min(100, (ranges.end(i) / duration) * 100);
          break;
        }
      }
      if (skipMarks) {
        const clamped = clampSkipMarksToDuration(skipMarks, duration);
        if (clamped !== skipMarks) skipMarks = clamped;
      }
    }
  }

  function startTicking() {
    if (tickTimer) return;
    // в Capacitor rAF на каждый кадр заметно грузит WebView — достаточно 4 раз в секунду
    tickTimer = window.setInterval(syncPlaybackState, isCapacitorNative() ? 250 : 200);
  }

  function stopTicking() {
    if (tickTimer) window.clearInterval(tickTimer);
    tickTimer = 0;
  }

  function markFirstFrame() {
    if (firstFrame) return;
    firstFrame = true;
    if (firstFrameTimer) window.clearTimeout(firstFrameTimer);
    firstFrameTimer = 0;
    showControls();
  }

  $effect(() => {
    const video = videoEl;
    if (!video) return;
    const onPlaying = () => markFirstFrame();
    const onTime = () => { if (video.currentTime > 0.05 && !video.paused) markFirstFrame(); };
    // автозапуск заблокирован — не держим загрузку вечно, показываем паузу
    const onLoaded = () => {
      if (firstFrame || firstFrameTimer) return;
      firstFrameTimer = window.setTimeout(() => { firstFrameTimer = 0; if (video.paused) markFirstFrame(); }, 3500);
    };
    const onEnded = () => { if (nextEp != null) void loadEpisode(nextEp); else showControls(); };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('ended', onEnded);
    };
  });

  function showError(embedUrl: string, text?: string) {
    loadState = 'error';
    errorText = text || userPlaybackError(embedUrl || core.origEpUrl);
    switching = false;
    controlsVisible = true;
    bindCoreEls();
    core.hideMedia();
  }

  function applyMedia(nextUrl: string, nextUseVideo: boolean, nextEpPos: number, seekTime?: number, initialPaused?: boolean) {
    playUrl = nextUrl;
    useVideo = nextUseVideo;
    ep = nextEpPos;
    if (seekTime == null || !nextUseVideo) {
      firstFrame = !nextUseVideo;
      if (firstFrameTimer) window.clearTimeout(firstFrameTimer);
      firstFrameTimer = 0;
    }
    bindCoreEls();
    loadState = 'ready';
    switching = false;

    const qs = new URLSearchParams({
      releaseId,
      sourceId,
      ep: String(nextEpPos),
      title,
      sourceName,
      ...(dubberId ? { dubberId } : {}),
      ...(dubberName ? { dubberName } : {}),
    });
    window.history.replaceState(null, '', `/watch?${qs.toString()}`);

    if (!nextUseVideo && !allowsIframeFallback(core.origEpUrl || nextUrl)) {
      showError(core.origEpUrl || nextUrl);
      return;
    }

    core.applySource({
      url: nextUrl,
      useVideo: nextUseVideo,
      ep: nextEpPos,
      title,
      sourceName,
      dubberId,
      seekTime,
      initialPaused,
      volume,
      muted: volume <= 0,
      releaseId,
      sourceId,
      syncPlaybackRate: () => { if (videoEl) videoEl.playbackRate = playbackRate; },
      onFallback: () => {
        switching = false;
        if (core.origEpUrl && allowsIframeFallback(core.origEpUrl)) {
          applyMedia(core.origEpUrl, false, nextEpPos, seekTime, initialPaused);
          return;
        }
        showError(core.origEpUrl || nextUrl);
      },
      onReresolve: (savedTime, wasPaused) => {
        const embed = core.origEpUrl;
        if (!embed) return;
        core.invalidateCache(embed);
        void core.resolve(embed, false).then((res) => {
          if (!res.useVideo || !res.playUrl) applyMedia(embed, false, nextEpPos, savedTime, wasPaused);
          else applyMedia(res.playUrl, true, nextEpPos, savedTime, wasPaused);
        }).catch(() => applyMedia(embed, false, nextEpPos, savedTime, wasPaused));
      },
      onWatchdogReresolve: async () => {
        const embed = core.origEpUrl;
        if (!embed) return null;
        core.invalidateCache(embed);
        const res = await core.resolve(embed, false, 3);
        return res.useVideo && res.playUrl ? { url: res.playUrl, useVideo: true } : null;
      },
    });

    applyVolume();
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

  async function loadEpisode(nextEpPos: number, seekTime?: number, initialPaused?: boolean) {
    const rId = positiveId(releaseId);
    const sId = positiveId(sourceId);
    const api = window.anixApi?.release;
    if (!api?.getEpisode || rId == null || sId == null) {
      showError('', 'Неверные параметры просмотра');
      return;
    }
    const myGen = ++episodeLoadGen;
    if (loadState === 'error') loadState = 'loading';
    switching = true;
    sheet = null;
    try {
      let episode: Episode | undefined = (await api.getEpisode(rId, sId, nextEpPos))?.episode;
      if (!episode?.url && dubberId) {
        const list = episodes.length ? episodes : await loadEpisodesList();
        episode = list.find((row) => row.position === nextEpPos);
      }
      if (!episode?.url) {
        showError('', 'Нет ссылки на видео');
        return;
      }
      core.setOrigEpisodeUrl(episode.url);
      const resolved = await core.resolve(episode.url, episode.iframe);
      if (myGen !== episodeLoadGen) return;
      skipDismissedKind = null;
      skipMarks = normalizeSkipMarks(resolved.skip);
      qualityMap = resolved.qualityMap ?? {};
      currentQuality = resolved.currentQuality || 'auto';
      applyMedia(resolved.playUrl, resolved.useVideo, nextEpPos, seekTime, initialPaused);
      void window.anixApi?.history?.markWatched?.(rId, sId, nextEpPos);
    } catch {
      if (myGen === episodeLoadGen) showError('', 'Не удалось загрузить серию');
    }
  }

  // ── Управление ───────────────────────────────────────────────────────────────────────────
  function togglePlay() {
    if (!useVideo || !videoEl) return;
    if (videoEl.paused) fluo.play({ origin: 'user' });
    else fluo.pause({ origin: 'user' });
    syncPlaybackState();
    showControls();
  }

  function seekTo(t: number) {
    if (!useVideo || !videoEl || !(videoEl.duration > 0)) return;
    fluo.setProgress(Math.max(0, Math.min(videoEl.duration - 0.1, t)), { origin: 'user' });
    syncPlaybackState();
  }

  function seekBy(sec: number) {
    seekTo((videoEl?.currentTime ?? 0) + sec);
  }

  function skipMark(kind: SkipMarkKind) {
    skipDismissedKind = kind;
    if (releaseId) setSkipAutoPref(releaseId, kind, 'auto');
    if (kind === 'ending' && skipToNextEp != null) {
      void loadEpisode(skipToNextEp);
      return;
    }
    const range = kind === 'opening' ? skipMarks?.opening : skipMarks?.ending;
    if (range) seekTo(range.end + 0.05);
  }

  function setRate(rate: number) {
    playbackRate = rate;
    if (videoEl) videoEl.playbackRate = rate;
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
  }

  function selectEpisode(position: number) {
    if (position === ep) closeSheet();
    else void loadEpisode(position);
  }

  /** Назад — шаг по истории (как WebPlayerShell), чтобы не плодить «релиз → плеер → релиз». */
  function goBack() {
    if (window.history.length > 1) window.history.back();
    else navigate(releaseId ? `/release/${releaseId}` : '/');
  }

  // ── Жесты по видео ───────────────────────────────────────────────────────────────────────
  let pStartX = 0;
  let pStartY = 0;
  let pStartTime = 0;
  let pStartValue = 0;
  let pZone: -1 | 0 | 1 = 0;
  let longPressTimer = 0;
  let lastTapAt = 0;
  let lastTapZone: -1 | 0 | 1 = 0;
  let controlsBeforeTap = true;
  let activePointer: number | null = null;

  function flashHud(kind: 'volume' | 'brightness') {
    hudKind = kind;
    if (hudTimer) window.clearTimeout(hudTimer);
    hudTimer = window.setTimeout(() => { hudKind = null; }, 700);
  }

  function onStagePointerDown(e: PointerEvent) {
    if (activePointer != null || loadState !== 'ready' || !useVideo) return;
    activePointer = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const w = window.innerWidth;
    pStartX = e.clientX;
    pStartY = e.clientY;
    pZone = e.clientX < w / 3 ? -1 : e.clientX > (w * 2) / 3 ? 1 : 0;
    gesture = 'none';
    if (locked) return;
    longPressTimer = window.setTimeout(() => {
      longPressTimer = 0;
      if (gesture !== 'none' || paused) return;
      boosted = true;
      if (videoEl) videoEl.playbackRate = 2;
    }, LONG_PRESS_MS);
  }

  function onStagePointerMove(e: PointerEvent) {
    if (e.pointerId !== activePointer || locked || boosted) return;
    const dx = e.clientX - pStartX;
    const dy = e.clientY - pStartY;
    if (gesture === 'none') {
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
      if (longPressTimer) window.clearTimeout(longPressTimer);
      longPressTimer = 0;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (!(duration > 0)) return;
        gesture = 'seek';
        pStartTime = currentTime;
        scrubTime = currentTime;
        controlsVisible = true;
      } else {
        gesture = e.clientX > window.innerWidth / 2 ? 'volume' : 'brightness';
        pStartValue = gesture === 'volume' ? volume : brightness;
      }
    }
    if (gesture === 'seek') {
      // вся ширина экрана ≈ 90 с: точно и без «улёта» на длинных сериях
      scrubTime = Math.max(0, Math.min(duration, pStartTime + (dx / window.innerWidth) * 90));
    } else if (gesture === 'volume') {
      volume = Math.round(Math.max(0, Math.min(100, pStartValue - (dy / (window.innerHeight * 0.7)) * 100)));
      applyVolume();
      flashHud('volume');
    } else if (gesture === 'brightness') {
      brightness = Math.max(0.15, Math.min(1, pStartValue - dy / (window.innerHeight * 0.7)));
      flashHud('brightness');
    }
  }

  function onStagePointerUp(e: PointerEvent) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (longPressTimer) window.clearTimeout(longPressTimer);
    longPressTimer = 0;

    if (boosted) {
      boosted = false;
      if (videoEl) videoEl.playbackRate = playbackRate;
      return;
    }
    if (gesture === 'seek') {
      seekTo(scrubTime);
      gesture = 'none';
      showControls();
      return;
    }
    if (gesture === 'volume' || gesture === 'brightness') {
      try {
        localStorage.setItem(VOLUME_KEY, String(volume));
        localStorage.setItem(BRIGHTNESS_KEY, String(brightness));
      } catch { /* ignore */ }
      gesture = 'none';
      return;
    }
    if (locked) {
      toggleControls();
      return;
    }
    onTap();
  }

  function onTap() {
    const now = Date.now();
    const isDouble = now - lastTapAt < DOUBLE_TAP_MS && pZone !== 0 && pZone === lastTapZone;
    const continuing = tapSeek && tapSeek.side === pZone && pZone !== 0;
    if (isDouble || continuing) {
      // двойное касание по краю — перемотка; панели остаются как были до первого касания
      controlsVisible = controlsBeforeTap;
      const side = pZone as -1 | 1;
      const total = (tapSeek?.side === side ? tapSeek.total : 0) + seekStep;
      tapSeek = { side, total };
      seekBy(side * seekStep);
      if (tapSeekTimer) window.clearTimeout(tapSeekTimer);
      tapSeekTimer = window.setTimeout(() => { tapSeek = null; }, 650);
      lastTapAt = now;
      return;
    }
    controlsBeforeTap = controlsVisible;
    lastTapAt = now;
    lastTapZone = pZone;
    toggleControls();
  }

  function onStagePointerCancel(e: PointerEvent) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    if (longPressTimer) window.clearTimeout(longPressTimer);
    if (boosted && videoEl) videoEl.playbackRate = playbackRate;
    boosted = false;
    gesture = 'none';
  }

  // ── Полоса перемотки ─────────────────────────────────────────────────────────────────────
  function timeAtClientX(x: number): number {
    const rect = trackEl?.getBoundingClientRect();
    if (!rect || !(rect.width > 0) || !(duration > 0)) return currentTime;
    return Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * duration;
  }

  function onTrackDown(e: PointerEvent) {
    if (!(duration > 0)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    timelineDragging = true;
    scrubTime = timeAtClientX(e.clientX);
    if (hideTimer) window.clearTimeout(hideTimer);
  }

  function onTrackMove(e: PointerEvent) {
    if (timelineDragging) scrubTime = timeAtClientX(e.clientX);
  }

  function onTrackUp() {
    if (!timelineDragging) return;
    timelineDragging = false;
    seekTo(scrubTime);
    showControls();
  }

  // ── Ориентация и системные панели ────────────────────────────────────────────────────────
  function setOrientation(mode: 'landscape' | 'portrait') {
    const plugin = (window as unknown as {
      Capacitor?: { Plugins?: { AnixPlayer?: { setOrientation?: (o: { mode: string }) => Promise<unknown> } } };
    }).Capacitor?.Plugins?.AnixPlayer;
    void plugin?.setOrientation?.({ mode })?.catch?.(() => {});
  }

  onMount(() => {
    volume = readNumber(VOLUME_KEY, 100, 0, 100);
    brightness = readNumber(BRIGHTNESS_KEY, 1, 0.15, 1);
    bindCoreEls();
    if (document.documentElement.classList.contains('mobile-native')) setOrientation('landscape');

    void loadAppSettings().then((s) => {
      const hk = normalizePlayerHotkeys(s.playerHotkeys);
      seekStep = hk.seekSeconds;
      rewindStep = hk.rewindSeconds;
    }).catch(() => {});

    const offBack = pushBackHandler(() => {
      if (sheet) closeSheet();
      else if (locked) showControls();
      else goBack();
      return true;
    });
    // плеер живёт вне MobileLayout, поэтому на системную кнопку подписывается сам
    let unbindNative = () => {};
    void bindNativeBackButton(goBack).then((fn) => { unbindNative = fn; });

    void (async () => {
      try { episodes = await loadEpisodesList(); } catch { /* ignore */ }
      await loadEpisode(ep);
    })();

    return () => {
      offBack();
      unbindNative();
      if (document.documentElement.classList.contains('mobile-native')) setOrientation('portrait');
      for (const t of [hideTimer, hudTimer, tapSeekTimer, firstFrameTimer, longPressTimer]) if (t) window.clearTimeout(t);
      stopTicking();
      core.destroy();
    };
  });

  onDestroy(stopTicking);
</script>

<div class="mw" class:mw--hidden={!controlsVisible && !sheet} role="application" aria-label="Плеер">
  <div class="mw__stage">
    <iframe
      bind:this={iframeEl}
      class="mw__iframe"
      src={!useVideo ? playUrl : ''}
      title="Видео"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      referrerpolicy="no-referrer-when-downgrade"
      hidden={useVideo || loadState !== 'ready' || switching}
    ></iframe>
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={videoEl}
      class="mw__video"
      playsinline
      crossorigin="anonymous"
      hidden={!useVideo || loadState === 'error' || switching}
    ></video>
    <div class="mw__dim" style:opacity={(1 - brightness) * 0.85} aria-hidden="true"></div>
  </div>

  <!-- слой жестов: под панелями, над видео -->
  {#if useVideo && loadState === 'ready'}
    <div
      class="mw__gestures"
      role="presentation"
      onpointerdown={onStagePointerDown}
      onpointermove={onStagePointerMove}
      onpointerup={onStagePointerUp}
      onpointercancel={onStagePointerCancel}
    ></div>
  {/if}

  {#if tapSeek}
    <div class="mw__ripple" class:mw__ripple--right={tapSeek.side > 0} aria-hidden="true">
      <span>{@html tapSeek.side > 0 ? iconRotateCw(26) : iconRotateCcw(26)}</span>
      <b>{tapSeek.side > 0 ? '+' : '−'}{tapSeek.total} с</b>
    </div>
  {/if}

  {#if boosted}
    <div class="mw__pill mw__pill--top" transition:fade={{ duration: 120 }}>2× {@html iconSkipForward(16)}</div>
  {/if}

  {#if gesture === 'seek'}
    <div class="mw__pill mw__pill--center" aria-live="polite">
      <b>{formatTime(scrubTime)}</b>
      <span>{scrubDelta >= 0 ? '+' : '−'}{formatTime(Math.abs(scrubDelta))}</span>
    </div>
  {/if}

  {#if hudKind}
    <div class="mw__hud" class:mw__hud--left={hudKind === 'brightness'} transition:fade={{ duration: 120 }}>
      <span class="mw__hud-icon">
        {@html hudKind === 'brightness' ? iconSun(20) : volume > 0 ? iconVolume2(20) : iconVolumeX(20)}
      </span>
      <span class="mw__hud-bar"><i style:height="{hudKind === 'brightness' ? brightness * 100 : volume}%"></i></span>
    </div>
  {/if}

  {#if showLoading}
    <div class="mw__loading" role="status" out:fade={{ duration: 250 }}>
      <span class="mw__spinner" aria-hidden="true"></span>
      <p class="mw__loading-title">{title}</p>
      <p class="mw__loading-sub">{switching && loadState === 'ready' ? 'Переключаем серию…' : subtitle || 'Загружаем серию…'}</p>
    </div>
  {/if}

  {#if loadState === 'error'}
    <div class="mw__error" role="alert">
      <p>{errorText}</p>
      <div class="mw__error-actions">
        <button type="button" class="mw__btn mw__btn--fill" onclick={() => void loadEpisode(ep)}>Повторить</button>
        <button type="button" class="mw__btn" onclick={goBack}>Назад</button>
      </div>
    </div>
  {/if}

  {#if locked}
    {#if controlsVisible}
      <button type="button" class="mw__unlock" onclick={() => { locked = false; showControls(); }} transition:fade={{ duration: 150 }}>
        {@html iconLockOpen(20)} <span>Разблокировать</span>
      </button>
    {/if}
  {:else if loadState === 'ready' || loadState === 'error'}
    <div class="mw__chrome" class:mw__chrome--off={!controlsVisible || gesture === 'volume' || gesture === 'brightness'}>
      <header class="mw__top">
        <button type="button" class="mw__icon" onclick={goBack} aria-label="Назад">{@html iconArrowLeft(24)}</button>
        <div class="mw__titles">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {#if useVideo}
          <button type="button" class="mw__icon" onclick={() => { locked = true; controlsVisible = false; }} aria-label="Заблокировать экран">{@html iconLock(22)}</button>
        {/if}
        <button type="button" class="mw__icon" onclick={() => openSheet('settings')} aria-label="Настройки">{@html iconSettings(22)}</button>
      </header>

      {#if loadState === 'ready' && useVideo && !showLoading}
        <div class="mw__center">
          <button type="button" class="mw__round" disabled={prevEp == null} onclick={() => prevEp != null && loadEpisode(prevEp)} aria-label="Предыдущая серия">
            {@html iconSkipBack(26)}
          </button>
          <button type="button" class="mw__round mw__round--seek" onclick={() => { seekBy(-seekStep); showControls(); }} aria-label="Назад на {seekStep} с">
            {@html iconRotateCcw(28)}<small>{seekStep}</small>
          </button>
          <button type="button" class="mw__round mw__round--play" onclick={togglePlay} aria-label={paused ? 'Воспроизвести' : 'Пауза'}>
            {@html paused ? iconPlay(38) : iconPause(38)}
          </button>
          <button type="button" class="mw__round mw__round--seek" onclick={() => { seekBy(seekStep); showControls(); }} aria-label="Вперёд на {seekStep} с">
            {@html iconRotateCw(28)}<small>{seekStep}</small>
          </button>
          <button type="button" class="mw__round" disabled={nextEp == null} onclick={() => nextEp != null && loadEpisode(nextEp)} aria-label="Следующая серия">
            {@html iconSkipForward(26)}
          </button>
        </div>

        <footer class="mw__bottom">
          {#if skipPromptVisible}
            <div class="mw__skip">
              <button type="button" class="mw__btn" onclick={() => { if (releaseId && skipPromptVisible) setSkipAutoPref(releaseId, skipPromptVisible, 'watch'); skipDismissedKind = skipPromptVisible; }}>
                Смотреть
              </button>
              <button type="button" class="mw__btn mw__btn--fill" onclick={() => skipPromptVisible && skipMark(skipPromptVisible)}>
                {skipToNextEp != null ? 'Следующая серия' : skipPromptVisible === 'ending' ? 'Пропустить эндинг' : 'Пропустить опенинг'}
              </button>
            </div>
          {/if}

          <div class="mw__timeline">
            <span class="mw__time">{formatTime(shownTime)}</span>
            <div
              class="mw__track-hit"
              role="slider"
              tabindex="0"
              aria-label="Позиция воспроизведения"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(shownTime)}
              onpointerdown={onTrackDown}
              onpointermove={onTrackMove}
              onpointerup={onTrackUp}
              onpointercancel={onTrackUp}
            >
              <div class="mw__track" class:mw__track--active={timelineDragging} bind:this={trackEl}>
                <div class="mw__track-buffered" style:width="{bufferedPct}%"></div>
                <div class="mw__track-segments" aria-hidden="true">
                  {#each sausages as s (s.id)}
                    <i class:op={s.kind === 'opening'} class:ed={s.kind === 'ending'} style:flex-grow={Math.max(s.widthPct, 0.35)}></i>
                  {/each}
                </div>
                <div class="mw__track-played" style:width="{shownPct}%"></div>
                <div class="mw__thumb" style:left="{shownPct}%">
                  {#if timelineDragging}<span class="mw__bubble">{formatTime(scrubTime)}</span>{/if}
                </div>
              </div>
            </div>
            <span class="mw__time mw__time--muted">{formatTime(duration)}</span>
          </div>

          <div class="mw__dock">
            <button type="button" class="mw__chip" onclick={() => openSheet('episodes')}>
              {@html iconListVideo(20)}<span>Серии</span>
            </button>
            <button type="button" class="mw__chip" onclick={() => { seekBy(rewindStep); showControls(); }}>
              {@html iconFastRewindTime(20)}<span>+{formatSeekSeconds(rewindStep)}</span>
            </button>
            <span class="mw__dock-gap"></span>
            <button type="button" class="mw__chip" onclick={() => openSheet('settings')}>
              {@html iconGauge(20)}<span>{rateLabel} · {qualityShort}</span>
            </button>
            {#if nextEp != null}
              <button type="button" class="mw__chip mw__chip--accent" onclick={() => nextEp != null && loadEpisode(nextEp)}>
                <span>Следующая</span>{@html iconSkipForward(18)}
              </button>
            {/if}
          </div>
        </footer>
      {/if}
    </div>
  {/if}

  {#if sheet}
    <button type="button" class="mw__scrim" aria-label="Закрыть" onclick={closeSheet} transition:fade={{ duration: 150 }}></button>
    <aside class="mw__sheet" role="dialog" aria-modal="true" aria-label={sheet === 'episodes' ? 'Серии' : 'Настройки'}>
      <header class="mw__sheet-head">
        <h2>{sheet === 'episodes' ? 'Серии' : 'Настройки'}</h2>
        <button type="button" class="mw__icon" onclick={closeSheet} aria-label="Закрыть">{@html iconX(22)}</button>
      </header>
      <div class="mw__sheet-body">
        {#if sheet === 'episodes'}
          {#each episodes as item (item.position)}
            {@const num = episodeDisplayNumber(item, episodes)}
            <button type="button" class="mw__row" class:mw__row--on={item.position === ep} onclick={() => selectEpisode(item.position)}>
              <span class="mw__row-num">{num ?? '•'}</span>
              <span class="mw__row-text">{item.name?.trim() || (num != null ? `${num} серия` : 'Серия')}</span>
              {#if item.position === ep}<span class="mw__row-now">Сейчас</span>{/if}
            </button>
          {:else}
            <p class="mw__empty">Список серий пуст</p>
          {/each}
        {:else}
          <h3 class="mw__sheet-label">Скорость</h3>
          <div class="mw__chips">
            {#each RATE_OPTIONS as r (r)}
              <button type="button" class="mw__opt" class:mw__opt--on={playbackRate === r} onclick={() => setRate(r)}>
                {r === 1 ? 'Обычная' : `${r}×`}
              </button>
            {/each}
          </div>
          <h3 class="mw__sheet-label">Качество</h3>
          {#each qualityOptions as q (q.id)}
            <button type="button" class="mw__row" class:mw__row--on={currentQuality === q.id} onclick={() => applyQuality(q.id)}>
              <span class="mw__row-text">{q.label}</span>
              {#if currentQuality === q.id}<span class="mw__row-check">{@html iconCheck(18)}</span>{/if}
            </button>
          {/each}
          <p class="mw__hint">
            Касание — показать панель · двойное касание по краю — ±{seekStep} с · свайп по горизонтали — перемотка ·
            свайп справа — громкость, слева — яркость · удержание — 2×
          </p>
        {/if}
      </div>
    </aside>
  {/if}
</div>

<style lang="scss">
  .mw {
    position: fixed;
    inset: 0;
    z-index: 100;
    overflow: hidden;
    background: #000;
    color: #fff;
    font-family: var(--m-font, system-ui, sans-serif);
    -webkit-user-select: none;
    user-select: none;
    touch-action: none;
  }

  .mw__stage { position: absolute; inset: 0; }
  .mw__video, .mw__iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; object-fit: contain; }
  .mw__video[hidden], .mw__iframe[hidden] { display: none; }
  .mw__dim { position: absolute; inset: 0; background: #000; pointer-events: none; }
  .mw__gestures { position: absolute; inset: 0; z-index: 1; touch-action: none; } // не наследуется — без него браузер забирает свайп

  // ── Панели ─────────────────────────────────────────────────────────────────────────────
  .mw__chrome {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    pointer-events: none;
    background:
      linear-gradient(to bottom, rgba(0, 0, 0, 0.65), transparent 28%),
      linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent 38%);
    transition: opacity 0.2s ease;
    > * { pointer-events: auto; }
    &--off { opacity: 0; > * { pointer-events: none; } }
  }

  .mw__top {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
  }
  .mw__titles {
    flex: 1;
    min-width: 0;
    padding: 0 8px;
    h1 { margin: 0; font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    p { margin: 2px 0 0; font-size: 13px; color: rgba(255, 255, 255, 0.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  }

  .mw__icon, .mw__round, .mw__chip, .mw__btn, .mw__row, .mw__opt, .mw__unlock, .mw__scrim {
    appearance: none;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    padding: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .mw__icon {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    &:active { background: rgba(255, 255, 255, 0.14); }
  }

  .mw__center {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: clamp(16px, 5vw, 44px);
  }
  .mw__round {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.35);
    &:active { background: rgba(255, 255, 255, 0.18); }
    &:disabled { opacity: 0.3; }
    small { position: absolute; font-size: 10px; font-weight: 700; padding-top: 2px; }
    &--play { width: 72px; height: 72px; background: rgba(255, 255, 255, 0.16); backdrop-filter: blur(6px); }
  }

  .mw__bottom {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 max(16px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }

  .mw__skip {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-bottom: 4px;
  }

  .mw__btn {
    height: 40px;
    padding: 0 18px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.16);
    font-size: 14px;
    font-weight: 500;
    backdrop-filter: blur(6px);
    &:active { background: rgba(255, 255, 255, 0.26); }
    &--fill { background: #fff; color: #111; &:active { background: #ddd; } }
  }

  .mw__timeline { display: flex; align-items: center; gap: 12px; }
  .mw__time {
    flex: none;
    min-width: 44px;
    font-size: 13px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    &--muted { color: rgba(255, 255, 255, 0.72); text-align: right; }
  }
  .mw__track-hit { flex: 1; min-width: 0; display: flex; align-items: center; height: 36px; touch-action: none; }
  .mw__track {
    position: relative;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.22);
    transition: height 0.12s ease;
    &--active { height: 6px; }
  }
  .mw__track-buffered, .mw__track-played { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; }
  .mw__track-buffered { background: rgba(255, 255, 255, 0.35); }
  .mw__track-played { background: var(--m-primary, #d0bcff); }
  .mw__track-segments {
    position: absolute;
    inset: 0;
    display: flex;
    gap: 2px;
    i { display: block; height: 100%; flex-basis: 0; }
    .op, .ed { background: rgba(255, 214, 102, 0.55); }
  }
  .mw__thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border-radius: 50%;
    background: var(--m-primary, #d0bcff);
    box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.25);
  }
  .mw__bubble {
    position: absolute;
    bottom: 22px;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 10px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.8);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }

  .mw__dock { display: flex; align-items: center; gap: 8px; }
  .mw__dock-gap { flex: 1; }
  .mw__chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 14px;
    border-radius: 19px;
    font-size: 14px;
    font-weight: 500;
    &:active { background: rgba(255, 255, 255, 0.14); }
    &--accent { background: rgba(255, 255, 255, 0.16); }
  }

  // ── Подсказки жестов ───────────────────────────────────────────────────────────────────
  .mw__ripple {
    position: absolute;
    z-index: 3;
    top: 0;
    bottom: 0;
    left: 0;
    width: 38%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 0 50% 50% 0 / 0 60% 60% 0;
    background: rgba(255, 255, 255, 0.1);
    pointer-events: none;
    b { font-size: 15px; }
    &--right { left: auto; right: 0; border-radius: 50% 0 0 50% / 60% 0 0 60%; }
  }
  .mw__pill {
    position: absolute;
    z-index: 4;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 20px;
    background: rgba(0, 0, 0, 0.7);
    font-size: 15px;
    font-weight: 600;
    pointer-events: none;
    &--top { top: max(16px, env(safe-area-inset-top)); }
    &--center { top: 50%; transform: translate(-50%, -50%); flex-direction: column; gap: 2px; padding: 12px 22px; b { font-size: 26px; } span { font-size: 14px; color: rgba(255, 255, 255, 0.75); } }
  }
  .mw__hud {
    position: absolute;
    z-index: 4;
    top: 50%;
    right: 12%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 14px 10px;
    border-radius: 22px;
    background: rgba(0, 0, 0, 0.6);
    pointer-events: none;
    &--left { right: auto; left: 12%; }
  }
  .mw__hud-bar {
    position: relative;
    width: 6px;
    height: 120px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.25);
    overflow: hidden;
    i { position: absolute; left: 0; right: 0; bottom: 0; background: #fff; }
  }

  // ── Загрузка, ошибка, блокировка ───────────────────────────────────────────────────────
  .mw__loading, .mw__error {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 24px;
    text-align: center;
    background: #000;
  }
  .mw__loading { pointer-events: none; }
  .mw__loading-title { margin: 14px 0 0; font-size: 17px; font-weight: 600; }
  .mw__loading-sub { margin: 0; font-size: 14px; color: rgba(255, 255, 255, 0.65); }
  .mw__spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--m-primary, #d0bcff);
    border-radius: 50%;
    animation: mw-spin 0.9s linear infinite;
  }
  @keyframes mw-spin { to { transform: rotate(360deg); } }
  .mw__error {
    background: rgba(0, 0, 0, 0.85);
    p { margin: 0 0 12px; max-width: 460px; font-size: 15px; line-height: 1.4; }
  }
  .mw__error-actions { display: flex; gap: 10px; }

  .mw__unlock {
    position: absolute;
    z-index: 5;
    left: 50%;
    bottom: max(24px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 20px;
    border-radius: 22px;
    background: rgba(0, 0, 0, 0.7);
    font-size: 15px;
    font-weight: 500;
  }

  // ── Шторки «Серии» / «Настройки» (справа, в альбомной ориентации) ──────────────────────
  .mw__scrim { position: absolute; inset: 0; z-index: 6; background: rgba(0, 0, 0, 0.45); }
  .mw__sheet {
    position: absolute;
    z-index: 7;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(380px, 62vw);
    display: flex;
    flex-direction: column;
    padding-right: env(safe-area-inset-right);
    background: rgba(24, 24, 24, 0.97);
    animation: mw-slide 0.2s ease;
  }
  @keyframes mw-slide { from { transform: translateX(40px); opacity: 0; } }
  .mw__sheet-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: max(8px, env(safe-area-inset-top)) 8px 4px 20px;
    h2 { margin: 0; font-size: 18px; font-weight: 600; }
  }
  .mw__sheet-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 0 16px; touch-action: pan-y; }
  .mw__sheet-label { margin: 14px 20px 8px; font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.6); text-transform: uppercase; letter-spacing: 0.04em; }
  .mw__chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px; }
  .mw__opt {
    height: 36px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    font-size: 14px;
    &--on { border-color: transparent; background: var(--m-primary, #d0bcff); color: var(--m-on-primary, #381e72); font-weight: 600; }
  }
  .mw__row {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 50px;
    padding: 0 20px;
    text-align: left;
    font-size: 15px;
    &:active { background: rgba(255, 255, 255, 0.08); }
    &--on { color: var(--m-primary, #d0bcff); font-weight: 600; }
  }
  .mw__row-num { flex: none; min-width: 28px; font-variant-numeric: tabular-nums; color: rgba(255, 255, 255, 0.55); }
  .mw__row--on .mw__row-num { color: inherit; }
  .mw__row-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw__row-now { flex: none; padding: 2px 8px; border-radius: 6px; background: rgba(208, 188, 255, 0.18); font-size: 12px; }
  .mw__row-check { flex: none; display: inline-flex; }
  .mw__empty { margin: 20px; color: rgba(255, 255, 255, 0.6); }
  .mw__hint { margin: 18px 20px 0; font-size: 12px; line-height: 1.5; color: rgba(255, 255, 255, 0.5); }
</style>
