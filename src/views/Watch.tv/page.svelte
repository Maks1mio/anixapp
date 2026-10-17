<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
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
  import { scheduleFocusTvOverlayContent, focusTvWatchPlay } from '../../services/tv-navigation';
  import { getTvWatchArt } from '../../services/tv-release-transition';
  import { toPosterDisplayUrl } from '../../utils/posterUrl';
  import { fade } from 'svelte/transition';
  import { isCapacitorNative } from '../../native/anix-api-native';
  import {
    iconPlay,
    iconPause,
    iconSettings,
    iconFilm,
    iconChevronRight,
    iconX,
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

  /** Тот же арт, что в hero страницы тайтла, — экран загрузки продолжает страницу. */
  const loadingArt = toPosterDisplayUrl(getTvWatchArt(Number(releaseId)), 'releaseHero');

  const core = new PlayerCore();
  const fluo = getFluoPlayer();
  installWindowFluo();

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
  /** Пошли первые кадры: до этого держим экран загрузки, а не чёрный плеер. */
  let firstFrame = $state(false);
  let firstFrameTimer = 0;
  let bufferedPct = $state(0);
  let seekPreviewPct = $state(0);
  /** Пользователь двигает ◀ ▶ — бегунок «отцеплен» от воспроизведения до OK / «Назад». */
  let scrubbing = $state(false);
  let qualityMap = $state<Record<string, string>>({});
  let currentQuality = $state('auto');
  let playbackRate = $state(1);

  const RATE_OPTIONS = [
    { value: 0.5, label: '0.5' },
    { value: 0.75, label: '0.75' },
    { value: 1, label: 'Обычная' },
    { value: 1.25, label: '1.25' },
    { value: 1.5, label: '1.5' },
  ] as const;

  const VOLUME_KEY = 'anixapp_player_volume';
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
  const nextEpLabel = $derived.by(() => {
    if (nextEp == null) return '';
    const row = episodes.find((item) => item.position === nextEp);
    const num = row ? episodeDisplayNumber(row, episodes) : nextEp;
    return num != null ? `${num} серия` : 'Следующая';
  });
  const rateLabel = $derived(playbackRate === 1 ? '1×' : `${playbackRate}×`);
  const qualityShort = $derived(currentQuality === 'auto' ? 'Авто' : `${Number.parseInt(currentQuality, 10) || currentQuality}p`);
  const timeCurrent = $derived(formatTime(currentTime));
  const timeRemaining = $derived(formatTime(Math.max(0, duration - currentTime)));
  const sausages = $derived(buildTimelineSausages(duration, skipMarks?.opening ?? null, skipMarks?.ending ?? null));
  // В фокусе бегунок «замирает» на точке, где встал фокус; ◀ ▶ двигают его от неё.
  const thumbPct = $derived(timelineFocused ? seekPreviewPct : progressPct);
  const awaitingFirstFrame = $derived(loadState === 'ready' && useVideo && !firstFrame && !switching);
  const showLoading = $derived(loadState === 'loading' || switching || awaitingFirstFrame);
  /** Перемотка выбрана, но ещё не подтверждена OK — разница с текущей позицией. */
  const scrubDeltaSec = $derived(timelineFocused ? ((seekPreviewPct - progressPct) / 100) * duration : 0);
  const scrubDeltaLabel = $derived.by(() => {
    if (Math.abs(scrubDeltaSec) < 1) return '';
    return `${scrubDeltaSec > 0 ? '+' : '−'}${formatTime(Math.abs(scrubDeltaSec))}`;
  });
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
    // TV: без Anime4K — canvas апскейла не нужен.
    core.canvas = null;
    core.iframe = iframeEl;
    fluo.bind({ video: videoEl, core });
  }

  $effect(() => {
    bindCoreEls();
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

  /**
   * Автоскрытие интерфейса — одно правило для всех случаев:
   * любое нажатие пульта перезапускает таймер; при воспроизведении интерфейс
   * гаснет через 4 с, на паузе — через 8 с. Не прячем, пока открыты «Серии» /
   * «Настройки», идёт загрузка, висит кнопка пропуска или выбрана, но не
   * подтверждена перемотка.
   */
  const HIDE_PLAYING_MS = 4000;
  const HIDE_PAUSED_MS = 8000;

  function canAutoHide(): boolean {
    if (loadState !== 'ready' || switching || !firstFrame) return false;
    if (panelOpen || settingsOpen || skipPromptVisible) return false;
    if (scrubbing) return false;
    return true;
  }

  function scheduleHide() {
    if (overlayTimer) window.clearTimeout(overlayTimer);
    overlayTimer = 0;
    if (!overlayVisible) return;
    overlayTimer = window.setTimeout(() => {
      overlayTimer = 0;
      if (!canAutoHide()) {
        scheduleHide();
        return;
      }
      hideOverlay();
    }, paused ? HIDE_PAUSED_MS : HIDE_PLAYING_MS);
  }

  function showOverlay(_autoHide = true) {
    overlayVisible = true;
    scheduleHide();
  }

  function onPlayerActivity() {
    if (overlayVisible) scheduleHide();
  }

  function markFirstFrame() {
    if (firstFrame) return;
    firstFrame = true;
    if (firstFrameTimer) window.clearTimeout(firstFrameTimer);
    firstFrameTimer = 0;
    showOverlay();
    void tick().then(() => focusTvWatchPlay());
  }

  $effect(() => {
    const video = videoEl;
    if (!video) return;
    const onPlaying = () => markFirstFrame();
    const onTime = () => {
      if (video.currentTime > 0.05 && !video.paused) markFirstFrame();
    };
    // Автозапуск заблокирован — не держим загрузку вечно, показываем паузу.
    const onLoaded = () => {
      if (firstFrame || firstFrameTimer) return;
      firstFrameTimer = window.setTimeout(() => {
        firstFrameTimer = 0;
        if (video.paused) markFirstFrame();
      }, 3500);
    };
    // Пересчёт размеров видео-слоя при смене кадра/окна (см. .tv-watch__video в tv.scss).
    const relayout = () => {
      video.style.width = 'calc(100% - 1px)';
      window.requestAnimationFrame(() => { video.style.width = ''; });
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('resize', relayout);
    video.addEventListener('playing', relayout);
    window.addEventListener('resize', relayout);
    return () => {
      video.removeEventListener('resize', relayout);
      video.removeEventListener('playing', relayout);
      window.removeEventListener('resize', relayout);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadeddata', onLoaded);
    };
  });

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
    bufferedPct = 0;
    if (duration > 0) {
      const ranges = videoEl.buffered;
      for (let i = 0; i < ranges.length; i += 1) {
        if (ranges.start(i) <= currentTime + 0.5 && ranges.end(i) >= currentTime) {
          bufferedPct = Math.min(100, (ranges.end(i) / duration) * 100);
          break;
        }
      }
    }
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
    scrubbing = false;
    syncPlaybackState();
    showOverlay();
  }

  function nudgeTimeline(dir: -1 | 1) {
    if (!(duration > 0)) return;
    scrubbing = true;
    const stepPct = Math.max(0.35, (TIMELINE_STEP_SEC / duration) * 100);
    seekPreviewPct = Math.max(0, Math.min(100, seekPreviewPct + dir * stepPct));
    showOverlay(false);
  }

  function onTimelineFocus() {
    timelineFocused = true;
    scrubbing = false;
    seekPreviewPct = progressPct;
    showOverlay(false);
  }

  function onTimelineBlur() {
    timelineFocused = false;
    scrubbing = false;
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
      // Точка разошлась с видео (перемотали или видео ушло вперёд) — переходим в неё;
      // совпадает — OK работает как пауза/плей.
      if (scrubbing || Math.abs(scrubDeltaSec) >= 1) seekToPct(seekPreviewPct);
      else togglePlay();
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
    if (seekTime == null || !nextUseVideo) {
      firstFrame = !nextUseVideo;
      if (firstFrameTimer) window.clearTimeout(firstFrameTimer);
      firstFrameTimer = 0;
    }
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
    if (videoEl.paused) fluo.play({ origin: 'user' });
    else fluo.pause({ origin: 'user' });
    syncPlaybackState();
    showOverlay();
  }

  function seekBy(seconds: number, showUi = true) {
    if (!useVideo || !videoEl || !Number.isFinite(videoEl.duration)) return;
    const next = Math.max(0, Math.min(videoEl.duration, videoEl.currentTime + seconds));
    fluo.setProgress(next, { origin: 'user' });
    syncPlaybackState();
    if (showUi) showOverlay();
  }

  function goBack() {
    // Возврат из плеера: шагаем назад по истории, чтобы попасть на уже
    // открытую страницу тайтла. Иначе пушится новая запись /release/:id и
    // следующий «Назад» снова возвращает в плеер.
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    if (releaseId) {
      navigate(`/release/${releaseId}`);
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
    if (scrubbing || (timelineFocused && Math.abs(scrubDeltaSec) >= 1)) {
      scrubbing = false;
      seekPreviewPct = progressPct;
      showOverlay();
      return;
    }
    // Пока грузится или ошибка — прятать нечего: «Назад» выходит из плеера.
    if (loadState !== 'ready' || switching || awaitingFirstFrame) {
      goBack();
      return;
    }
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
    window.addEventListener('keydown', onPlayerActivity, true);
    window.addEventListener('player:changeContent', onPlayerChangeContent);
    window.addEventListener('tv-watch:hide-chrome', onHideChrome);
    window.addEventListener('tv-watch:show-chrome', onShowChrome);
    window.addEventListener('tv-watch:exit', onExitPlayer);
    window.addEventListener('tv-watch:close-settings', closeSettings);
    window.addEventListener('tv-watch:seek', onTvSeek);

    void (async () => {
      try {
        episodes = await loadEpisodesList();
      } catch { /* ignore */ }
      await loadEpisode(ep);
      await tick();
      focusTvWatchPlay();
    })();

    return () => {
      window.removeEventListener('keydown', onPlayerActivity, true);
      if (firstFrameTimer) window.clearTimeout(firstFrameTimer);
      window.removeEventListener('player:changeContent', onPlayerChangeContent);
      window.removeEventListener('tv-watch:hide-chrome', onHideChrome);
      window.removeEventListener('tv-watch:show-chrome', onShowChrome);
      window.removeEventListener('tv-watch:exit', onExitPlayer);
      window.removeEventListener('tv-watch:close-settings', closeSettings);
      window.removeEventListener('tv-watch:seek', onTvSeek);
      if (overlayTimer) window.clearTimeout(overlayTimer);
      stopTicking();
      core.destroy();
    };
  });

  onDestroy(() => {
    stopTicking();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="tv-watch"
  class:tv-watch--chrome-hidden={loadState === 'ready' && !awaitingFirstFrame && !overlayVisible && !panelOpen && !settingsOpen}
  class:tv-watch--error={loadState === 'error'}
  class:tv-watch--iframe={!useVideo}
  bind:this={rootEl}
  role="application"
  aria-label="Плеер"
  onpointerdown={() => showOverlay()}
  onkeydown={onRootKeydown}
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

    {#if showLoading}
      <div class="tv-watch__loading" role="status" out:fade={{ duration: 380 }}>
        {#if loadingArt}
          <div class="tv-watch__loading-art" aria-hidden="true">
            <img src={loadingArt} alt="" decoding="async" />
            <div class="tv-watch__loading-scrim"></div>
          </div>
        {/if}
        <div class="tv-watch__loading-main">
          <p class="tv-watch__loading-title">{title}</p>
          <p class="tv-watch__loading-meta">{topMetaLine}</p>
          <div class="tv-watch__loading-status">
            <span class="tv-watch__spinner" aria-hidden="true"></span>
            <span>{switching && loadState === 'ready' ? 'Переключаем серию…' : 'Загружаем серию…'}</span>
          </div>
        </div>
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

  {#if loadState === 'ready' && paused && !overlayVisible && !panelOpen && !settingsOpen && !showLoading}
    <div class="tv-watch__paused-badge" aria-hidden="true">{@html iconPause(22)} Пауза</div>
  {/if}

  {#if (loadState === 'ready' && !awaitingFirstFrame) || loadState === 'error'}
    <div class="tv-watch__overlay" class:tv-watch__overlay--hidden={!overlayVisible && !panelOpen && !settingsOpen}>
      {#if loadState === 'ready' && overlayVisible}
        <header class="tv-watch__top">
          <h1 class="tv-watch__top-title">{title}</h1>
          <div class="tv-watch__top-chips">
            <span class="tv-watch__chip tv-watch__chip--accent">{epLabel}</span>
            {#if dubberName}<span class="tv-watch__chip">{dubberName}</span>{/if}
            {#if sourceName}<span class="tv-watch__chip">{sourceName}</span>{/if}
          </div>
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

          <div class="tv-watch__scrub" class:tv-watch__scrub--active={timelineFocused}>
            <button
              type="button"
              class="tv-watch__timeline"
              class:tv-watch__timeline--focused={timelineFocused}
              role="slider"
              aria-label="Позиция воспроизведения"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(thumbPct)}
              aria-valuetext={scrubbing ? previewTime : timeCurrent}
              disabled={!useVideo || !(duration > 0)}
              onfocus={onTimelineFocus}
              onblur={onTimelineBlur}
              onkeydown={onTimelineKeydown}
              onpointerdown={onTimelinePointerDown}
              onclick={(event) => event.preventDefault()}
            >
              <div class="tv-watch__track">
                <div class="tv-watch__track-buffered" style:width="{bufferedPct}%"></div>
                <div class="tv-watch__track-segments" aria-hidden="true">
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
                {#if timelineFocused && Math.abs(scrubDeltaSec) >= 1}
                  <div
                    class="tv-watch__track-scrub"
                    style:left="{Math.min(progressPct, thumbPct)}%"
                    style:width="{Math.abs(thumbPct - progressPct)}%"
                  ></div>
                {/if}
                <div class="tv-watch__timeline-thumb" style:left="{thumbPct}%">
                  {#if timelineFocused}
                    <span class="tv-watch__thumb-bubble">
                      <b>{previewTime}</b>
                      {#if scrubDeltaLabel}<span>{scrubDeltaLabel}</span>{/if}
                    </span>
                  {/if}
                </div>
              </div>
            </button>

            <div class="tv-watch__scrub-times">
              <span class="tv-watch__time">{timeCurrent}</span>
              <span class="tv-watch__scrub-hint">
                {#if scrubbing || Math.abs(scrubDeltaSec) >= 1}
                  <kbd>OK</kbd> перейти · <kbd>Назад</kbd> отмена
                {:else if timelineFocused}
                  <kbd>◀</kbd><kbd>▶</kbd> перемотка · <kbd>OK</kbd> пауза
                {/if}
              </span>
              <span class="tv-watch__time tv-watch__time--muted">{formatTime(duration)}</span>
            </div>
          </div>

          <div class="tv-watch__dock-bar">
            <div class="tv-watch__dock-group">
              <button type="button" class="tv-watch__dock-btn" onclick={openPanel}>
                <span class="tv-watch__dock-icon" aria-hidden="true">{@html iconFilm(22)}</span>
                <span class="tv-watch__dock-text">
                  <span class="tv-watch__dock-label">Серии</span>
                  <span class="tv-watch__dock-value">{epLabel}</span>
                </span>
              </button>
              {#if hasNextEp}
                <button
                  type="button"
                  class="tv-watch__dock-btn"
                  aria-label="Следующая серия"
                  onclick={() => nextEp != null && loadEpisode(nextEp)}
                >
                  <span class="tv-watch__dock-text">
                    <span class="tv-watch__dock-label">Следующая</span>
                    <span class="tv-watch__dock-value">{nextEpLabel}</span>
                  </span>
                  <span class="tv-watch__dock-icon" aria-hidden="true">{@html iconChevronRight(24)}</span>
                </button>
              {/if}
            </div>
            <div class="tv-watch__dock-group tv-watch__dock-group--end">
              <button type="button" class="tv-watch__dock-btn" aria-label="Настройки" onclick={openSettings}>
                <span class="tv-watch__dock-icon" aria-hidden="true">{@html iconSettings(22)}</span>
                <span class="tv-watch__dock-text">
                  <span class="tv-watch__dock-label">Настройки</span>
                  <span class="tv-watch__dock-value">{qualityShort} · {rateLabel}</span>
                </span>
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
        <h2 class="tv-watch__panel-title">Настройки</h2>
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
                <span>{item.label}</span>
              </button>
            {/each}
          </div>
        </div>
        <div class="tv-watch__settings-col">
          <h3 class="tv-watch__settings-title">Скорость</h3>
          <div class="tv-watch__settings-list">
            {#each RATE_OPTIONS as item (item.value)}
              <button
                type="button"
                class="tv-watch__settings-item"
                class:tv-watch__settings-item--active={playbackRate === item.value}
                onclick={() => applyPlaybackRate(item.value)}
              >
                <span>{item.label}</span>
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
          {@html iconX(22)}
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
            {#if item.position === ep}
              <span class="tv-watch__ep-now">Сейчас</span>
            {/if}
          </button>
        {:else}
          <p class="tv-watch__panel-empty">Список серий пуст</p>
        {/each}
      </div>
    </div>
  {/if}
</div>
