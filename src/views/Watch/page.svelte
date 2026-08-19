<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { getWatchParams } from '../../router';
  import { getCurrentRoomId, sendLobbyChat, isLobbyAwaitingPlayerSync } from '../../services/lobby-state';
  import { logLobbyAction, snapshotPlayback } from '../../services/lobby-action-log';
  import type { WatchState, EpisodeItem, DubberItem, LobbyActivityEntry, LobbyChatMessage, PopoverType, NextEpAltDub, DownloadedEpisodeItem, PlaybackAlt, SourceItem } from './_types';
  import { isHlsUrl, isDubberBlacklisted, lobbyActionText, allowsIframeFallback, userPlaybackError } from './_utils';
  import { normalizeSkipMarks, mergeSkipMarks, clampSkipMarksToDuration, skipMarkActive, endingIsAtEpisodeEnd, buildTimelineSausages, type SkipMarkKind, type SkipMarks } from './_skipMarks';
  import { getSkipAutoPref, setSkipAutoPref } from './_skipPrefs';
  import { pathToLocalMediaUrl } from '../../utils/local-media-url';
  import { sortDubbersPinnedFirst, readLastEpisodeTypeUpdateId } from '../../utils/dubber-meta';
  import { PlayerState } from './_usePlayer.svelte';
  import { LobbyState }  from './_useLobby.svelte';
  import { PlayerCore, gpuAvailable } from './core/PlayerCore';
  import { swapMediaSource } from './core/hls-engine';
  import {
    mapAnime4kPreset,
    normalizeAnime4kPreset,
    type Anime4kIntensity,
    type Anime4kType,
  } from './core/anime4k-presets';
  import SoloShell from './shells/SoloShell.svelte';
  import LobbyShell from './shells/LobbyShell.svelte';
  import LobbySidebar from './components/LobbySidebar.svelte';
  import LobbyActionLogPanel from './components/LobbyActionLogPanel.svelte';
  import LobbyChooserOverlay from './components/LobbyChooserOverlay.svelte';
  import type { PlayerChromeProps } from './shells/PlayerChrome.svelte';
  import { mapReleaseRawToCard } from '../../utils/release-card';
  import { resolveCdnAssetUrl, toPosterDisplayUrl } from '../../utils/posterUrl';
  import {
    DEFAULT_PLAYBACK_RATE,
    DEFAULT_PLAYER_HOTKEYS,
    PLAYBACK_RATE_WARN,
    clampPlaybackRate,
    formatPlaybackRate,
    normalizePlayerHotkeys,
    stepPlaybackRate,
    type PlayerHotkeysSettings,
  } from '../../utils/player-hotkeys';
  import {
    getPlayerViewportWidth,
    pickAdaptiveQuality,
  } from '../../utils/adaptive-quality';
  import { getLobbyProfile, leaveLobbyRoomFromUi, joinLobbyRoomAndOpenPlayer } from '../../utils/lobby-player';

  // ── URL params ─────────────────────────────────────────────────────────────
  const params          = getWatchParams();
  const releaseId       = params.get('releaseId') || params.get('viewId') || '';
  const initialSourceId = params.get('sourceId') || '';
  const initialEp       = parseInt(params.get('ep') || '1', 10);
  const initialTitle    = params.get('title') || 'Просмотр';
  const initialSrcName  = params.get('sourceName') || '';
  const initialDubId    = params.get('dubberId') || '';
  const initialLocalFile = params.get('localFile') || '';
  const playbackMode = params.get('playbackMode') || '';
  const initialLobbyCode = (params.get('lobby') || params.get('lobbyCode') || '').trim().toUpperCase();

  // ── Reactive state ─────────────────────────────────────────────────────────
  const player = new PlayerState();
  const lobby  = new LobbyState();
  const core   = new PlayerCore();
  let posterUrl = $state('');
  let posterReleaseId = '';

  let watchState: WatchState = $state({
    releaseId:  releaseId,
    sourceId:   initialSourceId,
    ep:         initialEp,
    title:      initialTitle,
    sourceName: initialSrcName,
    dubberName: '',
    dubberId:   initialDubId,
  });

  /** Кэш списка озвучек для панели (пересчитывается при смене релиза/серии) */
  let dubbersPickerCacheKey = '';
  let dubbersPickerCache: DubberItem[] = [];

  function invalidateDubbersPickerCache() {
    dubbersPickerCacheKey = '';
    dubbersPickerCache    = [];
  }

  function positiveId(value: string | number | null | undefined): number | null {
    const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function refreshDubberNameFromApi() {
    const rId = positiveId(watchState.releaseId);
    const did = watchState.dubberId;
    if (rId == null || !did || !(window as any).anixApi?.release?.getDubbers) return;
    (window as any).anixApi.release.getDubbers(rId).then((res: { types?: DubberItem[] }) => {
      const match = (res?.types ?? []).find(d => String(d.id) === did);
      if (match) watchState.dubberName = match.name;
    }).catch(() => {});
  }

  function applySourceNameFromList(list: SourceItem[]) {
    dubberSources = list;
    const match = list.find((s) => String(s.id) === String(watchState.sourceId));
    if (match?.name) watchState.sourceName = match.name;
  }

  function refreshSourceNameFromApi() {
    const rId = positiveId(watchState.releaseId);
    const dubId = positiveId(watchState.dubberId);
    const api = (window as any).anixApi?.release;
    if (rId == null || dubId == null || !api?.getDubberSources) return;
    api.getDubberSources(rId, dubId).then((res: { sources?: SourceItem[] }) => {
      applySourceNameFromList(res?.sources ?? []);
    }).catch(() => {});
  }

  /** Оставляем в выборе только озвучки, у которых есть текущая серия (как при переключении — первый источник). */
  async function filterDubbersForCurrentEp(
    all: DubberItem[],
    rId: number,
    ep: number,
    currentDubberId: string,
  ): Promise<DubberItem[]> {
    const api = (window as any).anixApi?.release;
    if (!api?.getDubberSources || !api?.getEpisode) return all;

    const results = await Promise.all(
      all.filter(d => !isDubberBlacklisted(d.name)).map(async (dub) => {
        if (String(dub.id) === currentDubberId) return dub;
        try {
          const srcRes = await api.getDubberSources(rId, dub.id);
          const first = srcRes?.sources?.[0];
          if (!first) return null;
          const epRes = await api.getEpisode(rId, first.id, ep);
          return epRes?.episode?.url ? dub : null;
        } catch {
          return null;
        }
      }),
    );
    return results.filter((d): d is DubberItem => d != null);
  }

  // ── Popovers ───────────────────────────────────────────────────────────────
  let popoverType    = $state<PopoverType>(null);
  let popoverLoading = $state(false);
  let episodes       = $state<EpisodeItem[]>([]);
  let dubbers        = $state<DubberItem[]>([]);
  let dubberSources  = $state<SourceItem[]>([]);
  let downloadedEpisodes = $state<DownloadedEpisodeItem[]>([]);
  let localPlaybackPath = $state('');
  let lastEpisodeTypeUpdateId = $state<number | null>(null);
  let playbackAlt = $state<PlaybackAlt | null>(null);
  let playbackAltGen = 0;
  let skipMarks = $state<SkipMarks | null>(null);
  let skipMarksCarry = $state<SkipMarks | null>(null);
  let skipMarksCarryKey = '';
  let skipDismissedKind = $state<SkipMarkKind | null>(null);
  let skipPrefTick = $state(0);
  let skipCountdownPct = $state(0);

  // ── Hotkeys + OSD ──────────────────────────────────────────────────────────
  let hotkeys = $state<PlayerHotkeysSettings>({ ...DEFAULT_PLAYER_HOTKEYS });
  let inLobby = $state(!!getCurrentRoomId());
  let sidebarOpen = $state(!!getCurrentRoomId());
  let actionLogOpen = $state(false);
  let chooserOpen = $state(false);
  let osdText = $state('');
  let osdWarn = $state(false);
  let osdTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cap quality by player window size (settings → playback, default off). */
  let adaptiveQualityByWindow = $state(false);
  /** Manual quality pick from UI — skip auto until next episode / setting toggle. */
  let qualityManualLock = $state(false);
  let adaptiveQualityTimer: ReturnType<typeof setTimeout> | null = null;

  function showOsd(text: string, opts?: { warn?: boolean }) {
    osdText = text;
    osdWarn = opts?.warn === true;
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(() => {
      osdText = '';
      osdWarn = false;
      osdTimer = null;
    }, 900);
  }

  function formatSeekDelta(seconds: number): string {
    const sign = seconds >= 0 ? '+' : '−';
    const abs = Math.abs(seconds);
    if (abs < 60) return `${sign}${abs} с`;
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    return s === 0 ? `${sign}${m}:00` : `${sign}${m}:${String(s).padStart(2, '0')}`;
  }

  function seekBySeconds(delta: number) {
    if (!videoEl || !player.useVideo || isNaN(videoEl.duration)) return;
    const next = Math.min(Math.max(0, videoEl.currentTime + delta), videoEl.duration);
    if (inLobbyRoom()) {
      player.currentTime = next;
      videoEl.currentTime = next;
      sendToLobby('seek', next);
      showOsd(formatSeekDelta(delta));
      showAndSchedule();
      return;
    }
    videoEl.currentTime = next;
    sendToLobby('seek');
    showOsd(formatSeekDelta(delta));
    showAndSchedule();
  }

  function isTypingTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    const tag = el?.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el?.isContentEditable;
  }

  // ── Episode nav derived ────────────────────────────────────────────────────
  const currentDubLabel = $derived((watchState.dubberName || watchState.sourceName || '').trim());
  const isLocalPlaybackMode = $derived(!!localPlaybackPath || watchState.sourceName === 'Скачано');
  const downloadedPositions = $derived(
    [...new Set(downloadedEpisodes.map((d) => d.episodePosition).filter((p) => p > 0))]
      .sort((a, b) => a - b),
  );
  const prevEpisodePosition = $derived.by(() => {
    if (!isLocalPlaybackMode) {
      const target = watchState.ep - 1;
      return target > 0 && (episodes.length === 0 || episodes.some((e) => e.position === target))
        ? target
        : null;
    }
    const available = downloadedPositions.filter((position) => position < watchState.ep);
    return available.length > 0 ? available[available.length - 1] : null;
  });
  const nextEpisodePosition = $derived.by(() => {
    if (!isLocalPlaybackMode) {
      const target = watchState.ep + 1;
      return episodes.length === 0 || episodes.some((e) => e.position === target)
        ? target
        : null;
    }
    return downloadedPositions.find((position) => position > watchState.ep) ?? null;
  });
  const hasPrevEp = $derived(prevEpisodePosition != null);
  const hasNextEp = $derived(nextEpisodePosition != null);

  /** Следующая серия недоступна в текущей озвучке, но есть в другой — самая популярная по view_count */
  let nextEpAltDub = $state<NextEpAltDub | null>(null);
  let nextEpAltGen = 0;

  function isVoiceoverDub(d: DubberItem): boolean {
    return !(d.type === 1 || /субтитр/i.test(d.name));
  }

  async function refreshNextEpisodeAlternative() {
    const gen = ++nextEpAltGen;
    if (isLocalPlaybackMode) {
      nextEpAltDub = null;
      return;
    }
    const nextEp = watchState.ep + 1;
    const rId = positiveId(watchState.releaseId);
    const currentDubId = watchState.dubberId;
    const api = (window as any).anixApi?.release;
    if (rId == null || !currentDubId || !api?.getDubbers || !api?.getDubberSources || !api?.getEpisode) {
      if (gen === nextEpAltGen) nextEpAltDub = null;
      return;
    }
    if (episodes.length === 0) {
      if (gen === nextEpAltGen) nextEpAltDub = null;
      return;
    }
    if (episodes.some(e => e.position === nextEp)) {
      if (gen === nextEpAltGen) nextEpAltDub = null;
      return;
    }
    try {
      const res = await api.getDubbers(rId);
      if (gen !== nextEpAltGen) return;
      const all = (res?.types ?? []).filter((d: DubberItem) => isVoiceoverDub(d) && !isDubberBlacklisted(d.name));
      type Cand = { dub: DubberItem; sourceId: number; sourceName: string };
      const candidates: Cand[] = [];
      await Promise.all(
        all
          .filter((d: DubberItem) => String(d.id) !== currentDubId)
          .map(async (dub: DubberItem) => {
            try {
              const srcRes = await api.getDubberSources(rId, dub.id);
              const first = srcRes?.sources?.[0];
              if (!first) return;
              const epRes = await api.getEpisode(rId, first.id, nextEp);
              if (epRes?.episode?.url) {
                candidates.push({ dub, sourceId: first.id, sourceName: first.name });
              }
            } catch {
              /* skip */
            }
          }),
      );
      if (gen !== nextEpAltGen) return;
      if (candidates.length === 0) {
        nextEpAltDub = null;
        return;
      }
      candidates.sort((a, b) => (b.dub.view_count ?? 0) - (a.dub.view_count ?? 0));
      const best = candidates[0];
      nextEpAltDub = {
        targetEp: nextEp,
        dubber: best.dub,
        sourceId: best.sourceId,
        sourceName: best.sourceName,
      };
    } catch {
      if (gen === nextEpAltGen) nextEpAltDub = null;
    }
  }

  $effect(() => {
    const _ = watchState.ep;
    const __ = watchState.dubberId;
    const ___ = watchState.releaseId;
    const ____ = episodes.length;
    const _____ = episodes.map(e => e.position).join(',');
    void refreshNextEpisodeAlternative();
  });

  // ── DOM refs ───────────────────────────────────────────────────────────────
  let playerWrapEl: HTMLElement;
  // svelte-ignore non_reactive_update
  let videoEl: HTMLVideoElement;
  // svelte-ignore non_reactive_update
  let canvasEl: HTMLCanvasElement;
  // svelte-ignore non_reactive_update
  let iframeEl: HTMLIFrameElement;

  // ── Overlay idle-hide ──────────────────────────────────────────────────────
  const IDLE_MS = 3000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function showOverlay() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    player.overlayVisible = true;
  }
  function scheduleHide() {
    if (popoverType != null) return; // не гасим интерфейс, пока открыты «Серии» / «Озвучка»
    if (skipPromptVisible && skipAutoPref === 'auto') {
      player.overlayVisible = true;
      return;
    }
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { player.overlayVisible = false; idleTimer = null; }, IDLE_MS);
  }
  function hideNow() {
    if (popoverType != null) return; // не гасим, пока открыты поповеры
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    player.overlayVisible = false;
  }
  function showAndSchedule() { showOverlay(); scheduleHide(); }

  function onPointerActivity(e: Event) {
    if (e instanceof PointerEvent && e.pointerType === 'touch' && e.type === 'pointermove') return;
    showAndSchedule();
  }

  $effect(() => {
    if (popoverType != null) {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      player.overlayVisible = true;
    }
  });

  function bindCoreEls() {
    core.video = videoEl ?? null;
    core.canvas = canvasEl
      ?? (playerWrapEl?.querySelector('.watch-page__upscale-canvas') as HTMLCanvasElement | null)
      ?? null;
    core.iframe = iframeEl ?? null;
  }

  /** Снять постер/«Загрузка…» и показать кадр. Плашку ошибки убираем только если серия реально идёт. */
  function revealPlayerMedia() {
    player.switching = false;
    if (player.loadState === 'error') {
      const v = videoEl;
      const live = !!(player.useVideo && v && (
        mediaHasRenderableFrame(v)
        || (v.readyState >= 2 && (v.currentTime > 0.1 || (Number.isFinite(v.duration) && v.duration > 1)))
      ));
      if (!live) return;
      player.loadState = 'ready';
      player.errorText = '';
      playbackAlt = null;
      return;
    }
    if (player.loadState === 'loading') player.loadState = 'ready';
  }

  function mediaHasRenderableFrame(el: HTMLVideoElement | null | undefined): boolean {
    if (!el) return false;
    return el.readyState >= 2 || (!el.paused && !el.ended && el.readyState >= 1);
  }

  let upscaleStartGen = 0;
  let upscaleHoldForNewFrame = false;
  let upscaleCanvasEpoch = $state(0);
  let upscaleRestartTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let upscaleRestartTries = 0;

  function clearUpscaleRestartTimer() {
    if (upscaleRestartTimer) {
      clearTimeout(upscaleRestartTimer);
      upscaleRestartTimer = 0;
    }
  }

  function holdUpscaleForNewSource(_expectTime = 0) {
    if (!player.upscaleEnabled || !gpuAvailable) return;
    upscaleHoldForNewFrame = true;
    clearUpscaleRestartTimer();
    stopUpscale();
  }

  function stopUpscale() {
    upscaleStartGen++;
    bindCoreEls();
    core.stopUpscale();
    player.upscaleCanvasOn = false;
    videoEl?.classList.remove('watch-page__video--hidden-for-upscale');
    upscaleCanvasEpoch += 1;
  }

  async function startUpscale() {
    bindCoreEls();
    const gen = ++upscaleStartGen;
    if (!player.upscaleEnabled || !gpuAvailable) {
      if (gen === upscaleStartGen) stopUpscale();
      return;
    }
    if (!player.useVideo) return;
    await tick();
    if (gen !== upscaleStartGen) return;
    bindCoreEls();
    const video = core.video;
    const canvas = core.canvas;
    if (!video || video.videoWidth < 2 || video.videoHeight < 2 || video.readyState < 2) return;
    if (!canvas) return;
    player.upscaleCanvasOn = true;
    await tick();
    if (gen !== upscaleStartGen) return;
    bindCoreEls();
    const ok = await core.startUpscale(player.upscaleEnabled, player.upscaleMode, player.aspectRatio);
    if (gen !== upscaleStartGen) return;
    player.upscaleCanvasOn = ok;
    if (!ok) videoEl?.classList.remove('watch-page__video--hidden-for-upscale');
  }

  /** После смены src всегда заново поднять Anime4K. Не блокируем start флагом hold. */
  function scheduleUpscaleRestart() {
    if (!player.upscaleEnabled || !gpuAvailable || !player.useVideo) {
      upscaleHoldForNewFrame = false;
      revealPlayerMedia();
      return;
    }
    revealPlayerMedia();
    upscaleHoldForNewFrame = false;
    if (upscaleRestartTimer) return;
    upscaleRestartTries = 0;
    const attempt = () => {
      upscaleRestartTimer = 0;
      if (!player.upscaleEnabled || !gpuAvailable || !player.useVideo) return;
      const v = videoEl;
      if (!v || v.videoWidth < 2 || v.readyState < 2) {
        if (upscaleRestartTries++ < 40) {
          upscaleRestartTimer = window.setTimeout(attempt, 120);
        }
        return;
      }
      void startUpscale().then(() => {
        if (core.upscale.active) return;
        if (upscaleRestartTries++ < 8) {
          upscaleRestartTimer = window.setTimeout(attempt, 250);
        }
      });
    };
    upscaleRestartTimer = window.setTimeout(attempt, 280);
  }

  function restartUpscaleIfFrameSizeChanged() {
    if (!player.upscaleEnabled || !gpuAvailable || !videoEl) return;
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (w < 2 || h < 2) return;
    if (core.upscale.active && core.upscale.inputWidth === w && core.upscale.inputHeight === h) return;
    upscaleHoldForNewFrame = false;
    scheduleUpscaleRestart();
  }

  /** Счётчик тиков rAF, когда canvas апскейла реально показан (прокси «кадров вывода») */
  let debugCanvasRafTicks = 0;

  function buildDebugHud(): string {
    const v = videoEl;
    if (!v) return '';
    const lines: string[] = [];
    const vw = v.videoWidth || 0;
    const vh = v.videoHeight || 0;
    const cw = Math.round(v.clientWidth);
    const ch = Math.round(v.clientHeight);
    lines.push(`Поток: ${vw}×${vh} · окно: ${cw}×${ch}`);
    const hls = (v as any)._hls as { levels?: Array<{ bitrate?: number; width?: number; height?: number }>; currentLevel?: number; loadLevel?: number } | undefined;
    if (hls?.levels?.length) {
      const ci = typeof hls.currentLevel === 'number' ? hls.currentLevel : -1;
      const loadLevel = typeof hls.loadLevel === 'number' ? hls.loadLevel : -1;
      const li = ci >= 0 ? ci : (loadLevel >= 0 ? loadLevel : -1);
      const lv = li >= 0 ? hls.levels[li] : null;
      if (lv) {
        const kbps = Math.round((lv.bitrate || 0) / 1000);
        lines.push(`HLS: ${kbps} kb/s · ${lv.width}×${lv.height} · ур. ${li}/${hls.levels.length - 1}${ci < 0 ? ' (auto)' : ''}`);
      } else {
        lines.push(`HLS: уровни ${hls.levels.length} · auto`);
      }
    }
    try {
      const q = (v as any).getVideoPlaybackQuality?.() as
        | { totalVideoFrames?: number; droppedVideoFrames?: number }
        | undefined;
      if (q && (q.totalVideoFrames != null || q.droppedVideoFrames != null)) {
        lines.push(`Кадры видео (decode): ${q.totalVideoFrames ?? '—'} · потери ${q.droppedVideoFrames ?? 0}`);
      }
    } catch {
      /* optional API */
    }
    if (canvasEl && player.upscaleCanvasOn && core.upscale.active) {
      lines.push(`Кадры вывода (canvas rAF): ${debugCanvasRafTicks}`);
    }
    const buf = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
    const dur = v.duration && isFinite(v.duration) ? v.duration : 0;
    const bufPct = dur > 0 ? Math.round((buf / dur) * 100) : 0;
    lines.push(`Буфер: ~${bufPct}% · ${v.paused ? 'пауза' : 'воспроизведение'} · ×${v.playbackRate.toFixed(2)}`);
    lines.push(`Состояние: readyState ${v.readyState} · network ${v.networkState}`);
    if (player.upscaleEnabled && gpuAvailable && canvasEl && player.upscaleCanvasOn && core.upscale.active) {
      lines.push(`Anime4K: активен · ${player.upscaleType} · canvas ${canvasEl.width}×${canvasEl.height}`);
    } else if (player.upscaleEnabled && gpuAvailable) {
      const err = core.upscale.lastError.trim();
      lines.push(
        err
          ? `Anime4K: ошибка · ${player.upscaleType} — ${err.slice(0, 120)}`
          : `Anime4K: запуск… · ${player.upscaleType}`,
      );
    } else {
      lines.push(`Anime4K: ${gpuAvailable ? 'выкл' : 'нет WebGPU'} · ${player.upscaleType}`);
    }
    lines.push(`WebGPU: ${gpuAvailable ? 'да' : 'нет'} · DPR ${typeof window !== 'undefined' ? window.devicePixelRatio : 1}`);
    return lines.join('\n');
  }

  let debugHudText = $state('');
  $effect(() => {
    if (!player.debugOverlay || !player.useVideo) {
      debugHudText = '';
      debugCanvasRafTicks = 0;
      return;
    }
    let rafId = 0;
    let alive = true;
    const rafStep = () => {
      if (!alive) return;
      rafId = requestAnimationFrame(() => {
        if (!alive) return;
        if (canvasEl && !canvasEl.hidden && core.upscale.active) debugCanvasRafTicks++;
        rafStep();
      });
    };
    rafStep();
    const id = window.setInterval(() => { debugHudText = buildDebugHud(); }, 300);
    debugHudText = buildDebugHud();
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      window.clearInterval(id);
    };
  });

  // ── Sync state ─────────────────────────────────────────────────────────────
  let isApplyingSync   = false;
  let applySyncTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSync: any = null;
  let preventAutoPause = false;
  let episodeLoadGen   = 0;
  /** Локальная смена качества/источника: игнорировать remote pause, иначе кадр замирает. */
  let localMediaSwap = false;
  /** Barrier-sync в окне плеера (WS в main — локальный флаг для sync_ready). */
  let lobbyBarrierPending = false;
  /** Зеркало main awaitingPlayerSync — приходит по IPC (модуль lobby-sync в player пустой). */
  let lobbySyncAwaiting = false;
  let pendingBarrierPlayback: Record<string, unknown> | null = null;
  /** Последнее намерение play/pause в лобби — чтобы video-события не слали эхо. */
  let lastLobbyPausedIntent: boolean | null = null;

  function needsLobbySyncReady(): boolean {
    return lobbyBarrierPending || lobbySyncAwaiting || isLobbyAwaitingPlayerSync();
  }

  function barrierTargetTime(): number | undefined {
    const p = pendingBarrierPlayback;
    return p && typeof p.currentTime === 'number' ? p.currentTime : undefined;
  }

  function maybeArmLobbySyncAfterLoad(playback?: Record<string, unknown> | null): void {
    if (!inLobbyRoom() || !needsLobbySyncReady()) return;
    if (player.loadState === 'error') {
      releaseLobbySyncAfterPlaybackError();
      return;
    }
    const ct = playback && typeof playback.currentTime === 'number'
      ? playback.currentTime
      : barrierTargetTime();
    queueMicrotask(() => armLobbyPlayerSyncedOnce(ct));
  }

  function inLobbyRoom(): boolean {
    return inLobby || !!getCurrentRoomId();
  }

  /** Снимок комнатного playback до смены озвучки/серии — чтобы игнорировать sync_resume с устаревшим состоянием сервера (до changeEpisode). */
  type LobbyStaleSnap = { releaseId: string; sourceId: string; ep: number; dubberId: string };
  let lobbyStalePlaybackBeforeSwitch: LobbyStaleSnap | null = null;

  function lobbyCaptureStalePlaybackSnapshot(): void {
    if (!inLobbyRoom()) {
      lobbyStalePlaybackBeforeSwitch = null;
      return;
    }
    lobbyStalePlaybackBeforeSwitch = {
      releaseId: String(watchState.releaseId),
      sourceId: String(watchState.sourceId),
      ep: Number(watchState.ep),
      dubberId: String(watchState.dubberId || ''),
    };
  }

  function lobbyPlaybackMatchesStaleSnap(p: Record<string, unknown>, s: LobbyStaleSnap): boolean {
    return (
      String(p.releaseId ?? '') === s.releaseId &&
      String(p.sourceId ?? '') === s.sourceId &&
      Number(p.ep) === s.ep &&
      String(p.dubberId ?? '') === s.dubberId
    );
  }

  type LobbyWaitOverlay = {
    mode: 'peer' | 'localBuffering';
    login?: string;
    avatar?: string | null;
    peerId?: string | null;
  } | null;
  let lobbyWaitOverlay = $state<LobbyWaitOverlay>(null);

  const VOLUME_KEY = 'anixapp_player_volume';
  const RATE_KEY = 'anixapp_player_playback_rate';

  function readStoredPlaybackRate(): number {
    try {
      const raw = localStorage.getItem(RATE_KEY);
      const n = raw != null ? Number(raw) : NaN;
      if (!isNaN(n)) return clampPlaybackRate(n);
    } catch {}
    return DEFAULT_PLAYBACK_RATE;
  }

  function writeStoredPlaybackRate(rate: number) {
    try { localStorage.setItem(RATE_KEY, String(clampPlaybackRate(rate))); } catch {}
  }

  function getPlaybackPayload() {
    return {
      releaseId:   watchState.releaseId,
      sourceId:    watchState.sourceId,
      ep:          String(watchState.ep),
      dubberId:    watchState.dubberId || undefined,
      dubberName:  watchState.dubberName || undefined,
      title:       watchState.title,
      sourceName:  watchState.sourceName,
      paused:      videoEl ? videoEl.paused : true,
      currentTime: videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : 0,
      duration:    videoEl && isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : undefined,
    };
  }

  /** Ошибка потока: не ждать canplay у скрытого <video>, иначе барьер комнаты стоит до 8–12 с. */
  function releaseLobbySyncAfterPlaybackError() {
    if (!inLobbyRoom()) return;
    pendingSync = null;
    localMediaSwap = false;
    lobbyBarrierPending = false;
    if (applySyncTimer) clearTimeout(applySyncTimer);
    applySyncTimer = window.setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 400);
    notifyLobbyPlayerSyncedIfReady();
  }

  /** После seek/load: sync_ready на сервер (окно плеера без WS — через IPC в главное окно). */
  function notifyLobbyPlayerSyncedIfReady() {
    const ct = videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : undefined;
    const el = (window as any).electron;
    if (el?.lobbyPlayerSynced) {
      logLobbyAction({ origin: 'local', action: 'player.sync_ready', via: 'player' });
      el.lobbyPlayerSynced(ct);
      return;
    }
    if (inLobbyRoom()) {
      logLobbyAction({ origin: 'local', action: 'player.sync_ready', via: 'player' });
      window.dispatchEvent(new CustomEvent('lobby:playerSynced', { detail: { currentTime: ct } }));
    }
  }

  function armLobbyPlayerSyncedOnce(targetTime?: number) {
    if (player.loadState === 'error' || videoEl?.hidden) {
      releaseLobbySyncAfterPlaybackError();
      return;
    }
    const wantTime = targetTime ?? (videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : undefined);
    const barrierStartedAt = Date.now();

    const markReady = () => {
      if (inLobbyRoom()) {
        localMediaSwap = false;
        lobbyBarrierPending = false;
      }
      if (applySyncTimer) clearTimeout(applySyncTimer);
      applySyncTimer = window.setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 400);
      notifyLobbyPlayerSyncedIfReady();
    };

    const attachReadyListeners = (el: HTMLVideoElement) => {
      let fired = false;
      let seekedOk = false;
      let canplayOk = false;
      const tryFire = () => {
        if (fired || !seekedOk || !canplayOk) return;
        if (wantTime != null && Math.abs(el.currentTime - wantTime) > 0.65) return;
        if (Date.now() - barrierStartedAt < 400) return;
        fired = true;
        el.removeEventListener('seeked', onSeeked);
        el.removeEventListener('canplay', onCanplay);
        markReady();
      };
      const onSeeked = () => { seekedOk = true; tryFire(); };
      const onCanplay = () => { canplayOk = true; tryFire(); };
      el.addEventListener('seeked', onSeeked);
      el.addEventListener('canplay', onCanplay);
      if (wantTime != null && Math.abs(el.currentTime - wantTime) <= 0.65) seekedOk = true;
      if (el.readyState >= 3) canplayOk = true;
      window.setTimeout(() => {
        if (!fired) {
          seekedOk = true;
          canplayOk = true;
          tryFire();
        }
      }, 12000);
    };

    const el = (window as any).electron;
    if (el?.lobbyPlayerSynced && videoEl) {
      attachReadyListeners(videoEl);
      return;
    }
    if (!inLobbyRoom() || !videoEl) return;
    attachReadyListeners(videoEl);
  }

  function notifyLobbyBufferingFromUi() {
    if (!inLobbyRoom()) return;
    const elE = (window as any).electron;
    if (elE?.lobbyNotifyBufferingStart) {
      elE.lobbyNotifyBufferingStart();
      return;
    }
    window.dispatchEvent(new CustomEvent('lobby:bufferingStartFromPlayer'));
  }

  function sendToLobby(action: 'play' | 'pause' | 'seek' | 'changeEpisode', ctOverride?: number) {
    const preview = ctOverride !== undefined ? { ...getPlaybackPayload(), currentTime: ctOverride } : getPlaybackPayload();
    if (inLobbyRoom() && !String(preview.releaseId ?? '').trim()) return;
    if (action === 'play') lastLobbyPausedIntent = false;
    if (action === 'pause') lastLobbyPausedIntent = true;
    const base = preview;
    const p = action === 'play'
      ? { ...base, paused: false }
      : action === 'pause'
        ? { ...base, paused: true }
        : base;
    if (inLobbyRoom()) {
      logLobbyAction({
        origin: 'local',
        action: `player.${action}`,
        playback: snapshotPlayback(p),
        via: 'player',
      });
    }
    if ((window as any).electron?.sendPlayerState) {
      (window as any).electron.sendPlayerState({ action, playback: p });
      return;
    }
    window.dispatchEvent(new CustomEvent('lobby:playerStateChanged', { detail: { action, playback: p } }));
  }

  function isSibnetSourceName(name: string): boolean {
    return /sibnet/i.test(name || '');
  }

  async function episodeHasUrl(rId: number, sourceId: number, ep: number): Promise<boolean> {
    const api = (window as any).anixApi?.release;
    if (!api?.getEpisode) return false;
    try {
      const epRes = await api.getEpisode(rId, sourceId, ep);
      return !!epRes?.episode?.url;
    } catch {
      return false;
    }
  }

  async function findPlaybackAlternative(ep: number): Promise<PlaybackAlt | null> {
    const api = (window as any).anixApi?.release;
    const rId = positiveId(watchState.releaseId);
    const currentSourceId = positiveId(watchState.sourceId) ?? 0;
    const currentDubberId = positiveId(watchState.dubberId) ?? 0;
    const skipSibnet = isSibnetSourceName(watchState.sourceName);
    if (!api?.getDubberSources || !api?.getEpisode || rId == null || !ep) return null;

    const pickFromSources = async (
      sources: Array<{ id: number; name: string }>,
      dubberId: number,
      dubberName: string,
      sameDubber: boolean,
    ): Promise<PlaybackAlt | null> => {
      const rest = sources.filter((s) => s.id !== currentSourceId);
      const preferred = skipSibnet ? rest.filter((s) => !isSibnetSourceName(s.name)) : rest;
      const pool = preferred.length ? preferred : rest.filter((s) => !isSibnetSourceName(s.name));
      for (const src of pool) {
        if (await episodeHasUrl(rId, src.id, ep)) {
          return {
            sourceId: src.id,
            sourceName: src.name,
            dubberId,
            dubberName,
            ep,
            sameDubber,
          };
        }
      }
      return null;
    };

    if (currentDubberId) {
      try {
        const srcRes = await api.getDubberSources(rId, currentDubberId);
        const same = await pickFromSources(
          srcRes?.sources ?? [],
          currentDubberId,
          watchState.dubberName || watchState.sourceName,
          true,
        );
        if (same) return same;
      } catch { /* other dubbers below */ }
    }

    if (!api.getDubbers) return null;
    try {
      const dubRes = await api.getDubbers(rId);
      const list = sortDubbersPinnedFirst(
        (dubRes?.types ?? []).filter((d: DubberItem) => !isDubberBlacklisted(d.name) && d.id !== currentDubberId),
      );
      for (const dub of list) {
        try {
          const srcRes = await api.getDubberSources(rId, dub.id);
          const alt = await pickFromSources(srcRes?.sources ?? [], dub.id, dub.name, false);
          if (alt) return alt;
        } catch { /* next dubber */ }
      }
    } catch { /* ignore */ }
    return null;
  }

  async function loadPlaybackAlternative(gen: number, ep: number) {
    const alt = await findPlaybackAlternative(ep);
    if (gen !== playbackAltGen || player.loadState !== 'error') return;
    playbackAlt = alt;
  }

  function acceptPlaybackAlt() {
    if (!playbackAlt) return;
    const alt = playbackAlt;
    playbackAlt = null;
    switchDubbing(alt.sourceId, alt.sourceName, alt.dubberId, alt.dubberName, alt.ep);
  }

  function playbackAltLabel(alt: PlaybackAlt): string {
    if (inLobbyRoom()) {
      if (alt.sameDubber) return `Переключить всех на ${alt.sourceName}`;
      return `Переключить всех в ${alt.dubberName}`;
    }
    if (alt.sameDubber) return `Смотреть на ${alt.sourceName}`;
    return `Смотреть в ${alt.dubberName}`;
  }

  function showPlayerError(embedUrl: string, text?: string) {
    playbackAlt = null;
    const gen = ++playbackAltGen;
    player.switching = false;
    player.useVideo = false;
    player.playUrl = '';
    player.overlayVisible = true;
    player.loadState = 'error';
    player.errorText = text || userPlaybackError(embedUrl || core.origEpUrl);
    bindCoreEls();
    upscaleHoldForNewFrame = false;
    clearUpscaleRestartTimer();
    core.hideMedia();
    releaseLobbySyncAfterPlaybackError();
    if (text !== 'Не удалось воспроизвести скачанный файл.') {
      void loadPlaybackAlternative(gen, watchState.ep);
    }
  }

  function applyVideoAndUI(
    pUrl: string, useVid: boolean, ep: number,
    titleStr: string, srcName: string, dubId: string,
    seekTime?: number, initialPaused?: boolean,
  ) {
    watchState.ep = ep; watchState.title = titleStr;
    watchState.sourceName = srcName; watchState.dubberId = dubId;

    const qs = new URLSearchParams({ releaseId: watchState.releaseId, sourceId: watchState.sourceId, ep: String(ep), title: titleStr, sourceName: srcName });
    if (dubId) qs.set('dubberId', dubId);
    if (typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
    }

    if (!useVid && !allowsIframeFallback(core.origEpUrl || pUrl)) {
      showPlayerError(core.origEpUrl || pUrl);
      return;
    }

    player.playUrl  = pUrl;
    player.useVideo = useVid;
    bindCoreEls();
    player.loadState = 'ready';
    holdUpscaleForNewSource(seekTime ?? 0);
    if (!useVid) {
      core.applySource({
        url: pUrl, useVideo: false, ep, title: titleStr, sourceName: srcName, dubberId: dubId,
        volume: player.volume, onFallback: () => {}, onReresolve: () => {},
        onWatchdogReresolve: async () => null, syncPlaybackRate: syncVideoPlaybackRate,
      });
      upscaleHoldForNewFrame = false;
      revealPlayerMedia();
      return;
    }

    core.applySource({
      url: pUrl,
      useVideo: useVid,
      ep,
      title: titleStr,
      sourceName: srcName,
      dubberId: dubId,
      seekTime,
      initialPaused,
      volume: player.volume,
      releaseId: watchState.releaseId,
      sourceId: watchState.sourceId,
      syncPlaybackRate: syncVideoPlaybackRate,
      onFallback: () => {
        player.switching = false;
        if (pUrl.startsWith('anix-local:')) {
          showPlayerError('', 'Не удалось воспроизвести скачанный файл.');
          return;
        }
        if (core.origEpUrl && allowsIframeFallback(core.origEpUrl)) {
          applyVideoAndUI(core.origEpUrl, false, ep, titleStr, srcName, dubId);
          return;
        }
        showPlayerError(core.origEpUrl || pUrl);
      },
      onReresolve: (savedTime, wasPaused) => {
        const curEpUrl = core.origEpUrl;
        if (!curEpUrl) return;
        core.invalidateCache(curEpUrl);
        core.resolve(curEpUrl, false).then(res => {
          if (!res.useVideo || !res.playUrl) {
            applyVideoAndUI(curEpUrl, false, ep, titleStr, srcName, dubId);
            return;
          }
          const resolved = applyQualityMap(res.qualityMap, res.currentQuality, res.playUrl);
          applyVideoAndUI(resolved.url, true, ep, titleStr, srcName, dubId, savedTime, wasPaused);
        }).catch(() => applyVideoAndUI(curEpUrl, false, ep, titleStr, srcName, dubId));
      },
      onWatchdogReresolve: async () => {
        const embedUrl = core.origEpUrl;
        if (!embedUrl) return null;
        core.invalidateCache(embedUrl);
        const res = await core.resolve(embedUrl, false, 3);
        if (!res.useVideo || !res.playUrl) return null;
        const resolved = applyQualityMap(res.qualityMap, res.currentQuality, res.playUrl);
        return { url: resolved.url, useVideo: true };
      },
    });
    if (seekTime != null && seekTime > 0) {
      const onSeeked = () => sendToLobby('seek');
      videoEl?.addEventListener('seeked', onSeeked, { once: true });
    }
    if (useVid) bindVideoElementListeners();
    scheduleUpscaleRestart();
    void prefetchNearby();
  }

  function setOrigEpisodeUrl(rawUrl: string) {
    core.setOrigEpisodeUrl(rawUrl);
  }

  function beginMediaCover(nextReleaseId?: string) {
    player.switching = true;
    try { videoEl?.pause(); } catch { /* ignore */ }
    holdUpscaleForNewSource(0);
    player.upscaleCanvasOn = false;
    const nextId = nextReleaseId != null ? String(nextReleaseId) : '';
    if (nextId && nextId !== posterReleaseId) {
      posterUrl = '';
      void loadReleasePoster(nextId);
    }
  }

  function loadEpisode(rId: number, sId: number, ep: number, titleStr: string, srcName: string, dubId: string, seekTime?: number, initialPaused?: boolean): Promise<void> {
    localPlaybackPath = '';
    const api = (window as any).anixApi?.release;
    if (!api?.getEpisode || positiveId(rId) == null || positiveId(sId) == null || positiveId(ep) == null) {
      return Promise.resolve();
    }
    const myGen = ++episodeLoadGen;
    playbackAlt = null;
    skipDismissedKind = null;
    const fromError = player.loadState === 'error';
    if (fromError) player.loadState = 'loading';
    player.switching = player.loadState === 'ready' || fromError || player.loadState === 'loading';
    if (player.switching) {
      try { videoEl?.pause(); } catch { /* ignore */ }
      holdUpscaleForNewSource(seekTime ?? 0);
    }
    if (String(rId) !== posterReleaseId) {
      posterUrl = '';
      void loadReleasePoster(String(rId));
    }
    void fetchEpisodesSilently();
    return api.getEpisode(rId, sId, ep).then(async (res: any) => {
      if (myGen !== episodeLoadGen) return;
      const episode = res?.episode;
      if (!episode?.url) {
        showPlayerError('', 'Нет ссылки на видео');
        return;
      }
      setOrigEpisodeUrl(episode.url);
      const { playUrl: pUrl, useVideo: uv, qualityMap, currentQuality: cq, skip } = await core.resolve(episode.url, episode.iframe);
      if (myGen !== episodeLoadGen) return;
      setSkipMarks(skip, { carry: true });
      const resolved = applyQualityMap(qualityMap, cq, pUrl, { resetManualLock: true });
      applyVideoAndUI(resolved.url, uv, ep, titleStr, srcName, dubId, seekTime, initialPaused);
      refreshSourceNameFromApi();
    }).catch(() => {
      if (myGen !== episodeLoadGen) return;
      if (mediaHasRenderableFrame(videoEl) || player.currentTime > 0.15 || (player.useVideo && !!player.playUrl)) {
        revealPlayerMedia();
        return;
      }
      player.switching = false;
      showPlayerError('', 'Не удалось загрузить серию');
    });
  }

  async function prefetchNearby() {
    const api = (window as any).anixApi?.release;
    const rId = positiveId(watchState.releaseId);
    const sId = positiveId(watchState.sourceId);
    if (!api?.getEpisode || rId == null || sId == null) return;
    const nextEp = watchState.ep + 1;
    try {
      const res = await api.getEpisode(rId, sId, nextEp);
      if (res?.episode?.url) core.prefetch(res.episode.url, !!res.episode.iframe);
    } catch {}
    const alt = nextEpAltDub;
    if (alt) {
      try {
        const res = await api.getEpisode(rId, alt.sourceId, alt.targetEp);
        if (res?.episode?.url) core.prefetch(res.episode.url, !!res.episode.iframe);
      } catch {}
    }
  }

  function goToEpisode(ep: number) {
    popoverType = null;
    invalidateDubbersPickerCache();
    const dl = downloadedEpisodes.find((d) => d.episodePosition === ep);
    if (isLocalPlaybackMode && dl) {
      void selectDownloadedEpisode(dl);
      return;
    }
    const inLobby = inLobbyRoom();
    if (inLobby) {
      lobbyCaptureStalePlaybackSnapshot();
      isApplyingSync = true;
      localMediaSwap = true;
    }
    watchState.ep = ep;
    if (inLobby) sendToLobby('changeEpisode', 0);
    loadEpisode(parseInt(watchState.releaseId, 10), parseInt(watchState.sourceId, 10), ep, watchState.title, watchState.sourceName, watchState.dubberId, 0, true)
      .then(() => {
        if (!inLobby) return;
        if (player.loadState === 'error') releaseLobbySyncAfterPlaybackError();
        else armLobbyPlayerSyncedOnce(0);
      })
      .catch(() => {
        if (inLobby) releaseLobbySyncAfterPlaybackError();
      });
  }

  /** @param episodeOverride — если задан и отличается от текущей серии, воспроизведение с начала новой серии */
  function switchDubbing(newSourceId: number, newSourceName: string, newDubberId: number, newDubberName: string, episodeOverride?: number) {
    popoverType = null;
    localPlaybackPath = '';
    const inLobby = inLobbyRoom();
    if (inLobby) lobbyCaptureStalePlaybackSnapshot();
    const targetEp = episodeOverride !== undefined ? episodeOverride : watchState.ep;
    const switchingEpisode = episodeOverride !== undefined && episodeOverride !== watchState.ep;
    const fromError = player.loadState === 'error';
    const liveTime = videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : undefined;
    const savedTime = switchingEpisode ? 0 : fromError ? (liveTime && liveTime > 0 ? liveTime : (player.currentTime || 0)) : liveTime;
    const wasPaused = switchingEpisode || fromError ? true : !!(videoEl?.paused);
    watchState.sourceId = String(newSourceId);
    watchState.sourceName = newSourceName;
    watchState.dubberId = String(newDubberId);
    watchState.dubberName = newDubberName;
    if (inLobby) {
      isApplyingSync = true;
      localMediaSwap = true;
    }
    loadEpisode(parseInt(watchState.releaseId, 10), newSourceId, targetEp, watchState.title, newSourceName, String(newDubberId), savedTime, wasPaused)
      .then(() => {
        fetchEpisodesSilently();
        if (!inLobby) return;
        sendToLobby('changeEpisode', switchingEpisode ? 0 : (savedTime ?? 0));
        if (player.loadState === 'error') releaseLobbySyncAfterPlaybackError();
        else armLobbyPlayerSyncedOnce(switchingEpisode ? 0 : savedTime);
      })
      .catch(() => {
        if (inLobby) releaseLobbySyncAfterPlaybackError();
      });
  }

  function goToNextEpisodeInAltDub(alt: NonNullable<typeof nextEpAltDub>) {
    invalidateDubbersPickerCache();
    switchDubbing(alt.sourceId, alt.sourceName, alt.dubber.id, alt.dubber.name, alt.targetEp);
  }

  // ── Popover openers ────────────────────────────────────────────────────────
  async function loadReleasePoster(rIdRaw: string) {
    const rId = positiveId(rIdRaw);
    if (rId == null) return;
    const token = String(rId);
    posterReleaseId = token;
    try {
      const infoRes = await (window as any).anixApi?.release?.info?.(rId);
      const raw = (infoRes?.release ?? infoRes) as Record<string, unknown> | undefined;
      if (!raw || posterReleaseId !== token) return;
      const card = mapReleaseRawToCard(raw);
      if (card.poster) posterUrl = toPosterDisplayUrl(card.poster, 'releaseHero');
    } catch { /* ignore */ }
  }

  async function fetchEpisodesSilently() {
    const rId = positiveId(watchState.releaseId);
    const dubIdNum = positiveId(watchState.dubberId);
    const sId = positiveId(watchState.sourceId);
    if (rId == null || dubIdNum == null || sId == null || !(window as any).anixApi?.release?.getEpisodes) return;
    try {
      const res = await (window as any).anixApi.release.getEpisodes(rId, dubIdNum, sId);
      episodes = res?.episodes ?? [];
    } catch {}
  }

  async function loadDownloadedEpisodes() {
    const rId = positiveId(watchState.releaseId);
    if (rId == null) {
      downloadedEpisodes = [];
      return;
    }
    try {
      const files = await window.electron?.listDownloadsByRelease?.(rId);
      if (!Array.isArray(files)) {
        downloadedEpisodes = [];
        return;
      }
      downloadedEpisodes = files.map((f) => {
        const ep = f.episodePosition ?? 0;
        const label = f.dubberName || f.sourceName || f.folder || 'Скачано';
        return {
          episodePosition: ep,
          filePath: f.path,
          label,
          name: ep > 0 ? `Серия ${ep}` : f.name,
        };
      });
    } catch {
      downloadedEpisodes = [];
    }
  }

  async function selectDownloadedEpisode(item: DownloadedEpisodeItem) {
    localPlaybackPath = item.filePath;
    popoverType = null;
    watchState.ep = item.episodePosition || watchState.ep;
    watchState.dubberId = '';
    watchState.dubberName = 'Скаченное';
    watchState.sourceName = 'Скачано';
    await startLocalFilePlayback(item.filePath, item.episodePosition || undefined);
  }

  async function selectDownloadedMode() {
    if (downloadedEpisodes.length === 0) await loadDownloadedEpisodes();
    const exact = downloadedEpisodes.find((item) => item.episodePosition === watchState.ep);
    const first = [...downloadedEpisodes]
      .filter((item) => item.episodePosition > 0)
      .sort((a, b) => a.episodePosition - b.episodePosition)[0];
    const target = exact || first;
    if (target) await selectDownloadedEpisode(target);
  }

  async function openSourcePopover() {
    if (popoverType === 'source') return;
    popoverType = 'source';
    if (isLocalPlaybackMode) {
      dubberSources = [];
      return;
    }
    const rId = positiveId(watchState.releaseId);
    const dubId = positiveId(watchState.dubberId);
    if (rId == null || dubId == null) {
      dubberSources = [];
      return;
    }
    popoverLoading = true;
    try {
      const res = await (window as any).anixApi.release.getDubberSources(rId, dubId);
      applySourceNameFromList((res?.sources ?? []) as SourceItem[]);
    } catch {
      dubberSources = [];
    }
    popoverLoading = false;
  }

  function selectSource(src: SourceItem) {
    const dubId = parseInt(watchState.dubberId, 10);
    if (!Number.isFinite(dubId)) return;
    switchDubbing(src.id, src.name, dubId, watchState.dubberName);
  }

  async function openSeriesPopover() {
    if (popoverType === 'series') return;
    popoverType = 'series';
    popoverLoading = true;
    await Promise.all([fetchEpisodesSilently(), loadDownloadedEpisodes()]);
    popoverLoading = false;
  }

  async function openDubbingPopover() {
    if (popoverType === 'dubbing') return;
    popoverType = 'dubbing';
    void loadDownloadedEpisodes();
    const key = `${watchState.releaseId}:${watchState.ep}`;
    if (dubbersPickerCacheKey === key && dubbersPickerCache.length > 0) {
      dubbers = dubbersPickerCache;
      if (lastEpisodeTypeUpdateId == null) {
        const rId = positiveId(watchState.releaseId);
        if (rId == null) return;
        void (window as any).anixApi.release.info?.(rId).then((infoRes: { release?: unknown }) => {
          lastEpisodeTypeUpdateId = readLastEpisodeTypeUpdateId(infoRes?.release ?? infoRes);
        }).catch(() => {});
      }
      return;
    }
    popoverLoading = true;
    try {
      const rId = positiveId(watchState.releaseId);
      if (rId == null) {
        popoverLoading = false;
        return;
      }
      const [res, infoRes] = await Promise.all([
        (window as any).anixApi.release.getDubbers(rId),
        (window as any).anixApi.release.info?.(rId).catch(() => null),
      ]);
      lastEpisodeTypeUpdateId = readLastEpisodeTypeUpdateId(infoRes?.release ?? infoRes);
      const all = sortDubbersPinnedFirst(
        (res?.types ?? []).filter((d: DubberItem) => !isDubberBlacklisted(d.name)),
      );
      dubbers = await filterDubbersForCurrentEp(all, rId, watchState.ep, watchState.dubberId);
      dubbers = sortDubbersPinnedFirst(dubbers);
      dubbersPickerCacheKey = key;
      dubbersPickerCache    = dubbers;
    } catch {}
    popoverLoading = false;
  }

  async function selectDubber(dubber: DubberItem) {
    const wasLocalPlayback = isLocalPlaybackMode;
    localPlaybackPath = '';
    if (String(dubber.id) === watchState.dubberId && !wasLocalPlayback) return;
    try {
      const rId = positiveId(watchState.releaseId);
      if (rId == null) return;
      const res = await (window as any).anixApi.release.getDubberSources(rId, dubber.id);
      const first = res?.sources?.[0];
      if (first) switchDubbing(first.id, first.name, dubber.id, dubber.name);
    } catch {}
  }

  async function togglePinDubber(dubber: DubberItem) {
    const api = (window as any).anixApi?.type;
    const rId = positiveId(watchState.releaseId);
    if (!api?.pin || !api?.unpin || rId == null) return;
    const nextPinned = !dubber.pinned;
    try {
      const res = nextPinned ? await api.pin(rId, dubber.id) : await api.unpin(rId, dubber.id);
      if (res && typeof res.code === 'number' && res.code !== 0) return;
      const patch = (list: DubberItem[]) =>
        sortDubbersPinnedFirst(list.map((d) => (d.id === dubber.id ? { ...d, pinned: nextPinned } : d)));
      dubbers = patch(dubbers);
      dubbersPickerCache = patch(dubbersPickerCache);
    } catch {
      /* ignore */
    }
  }

  // ── Player controls ────────────────────────────────────────────────────────
  function togglePlay() {
    if (!videoEl) return;
    const willPlay = videoEl.paused;
    if (inLobbyRoom()) {
      sendToLobby(willPlay ? 'play' : 'pause');
      isApplyingSync = true;
      preventAutoPause = true;
      if (willPlay) {
        void videoEl.play().then(() => { player.paused = false; }).catch(() => {});
      } else {
        videoEl.pause();
        player.paused = true;
      }
      window.setTimeout(() => {
        isApplyingSync = false;
        preventAutoPause = false;
      }, 280);
      showAndSchedule();
      return;
    }
    if (willPlay) videoEl.play().catch(() => {});
    else videoEl.pause();
    showAndSchedule();
  }

  function onSeek(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const pct = (e.clientX - el.getBoundingClientRect().left) / el.offsetWidth;
    if (videoEl && !isNaN(videoEl.duration)) {
      const targetTime = pct * videoEl.duration;
      if (inLobbyRoom()) {
        player.currentTime = targetTime;
        videoEl.currentTime = targetTime;
        isApplyingSync = true;
        sendToLobby('seek', targetTime);
        if (applySyncTimer) clearTimeout(applySyncTimer);
        applySyncTimer = window.setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 350);
        showAndSchedule();
        return;
      }
      videoEl.currentTime = targetTime;
      sendToLobby('seek');
    }
  }

  function onVolumeChange(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    setVolume(v);
  }

  function setVolume(v: number, opts?: { osd?: boolean }) {
    const next = Math.max(0, Math.min(100, Math.round(v)));
    player.volume = next;
    if (videoEl) {
      videoEl.volume = next / 100;
      if (next > 0 && player.muted) {
        player.muted = false;
        videoEl.muted = false;
      }
    }
    try { localStorage.setItem(VOLUME_KEY, String(next)); } catch {}
    if (opts?.osd) showOsd(`${next}%`);
  }

  function adjustVolume(direction: 1 | -1) {
    setVolume(player.volume + direction * 5, { osd: true });
    showAndSchedule();
  }

  function toggleMute() {
    player.muted = !player.muted;
    if (videoEl) videoEl.muted = player.muted;
  }

  function toggleFullscreen(opts?: { osd?: boolean }) {
    void (async () => {
      const next = await (window as any).electron?.togglePlayerFullScreen?.();
      if (typeof next === 'boolean') {
        player.isFullscreen = next;
      } else {
        player.isFullscreen = !player.isFullscreen;
      }
      if (opts?.osd) showOsd(player.isFullscreen ? 'Полный экран' : 'Обычный режим');
    })();
  }

  async function toggleAlwaysOnTop(opts?: { osd?: boolean }) {
    const next = await (window as any).electron?.togglePlayerAlwaysOnTop?.();
    const pinned = !!next;
    window.dispatchEvent(new CustomEvent('player-always-on-top', { detail: pinned }));
    if (opts?.osd) showOsd(pinned ? 'Поверх всех окон' : 'Окно откреплено');
  }

  function applyAnime4kPreset(type: Anime4kType, intensity: Anime4kIntensity) {
    if (!gpuAvailable && type !== 'off') return;
    const mapped = mapAnime4kPreset({ type, intensity });
    player.upscaleType = type;
    player.upscaleIntensity = intensity;
    player.upscaleEnabled = mapped.enabled;
    player.upscaleMode = mapped.mode;
    (window as any).electron?.saveSettings?.({
      upscaleEnabled: mapped.enabled,
      upscaleMode: mapped.mode,
      upscaleType: type,
      upscaleIntensity: intensity,
    });
    if (mapped.enabled) startUpscale(); else stopUpscale();
  }

  function applyAnime4kFromSettings(s: {
    upscaleEnabled?: boolean;
    upscaleMode?: number;
    upscaleType?: unknown;
    upscaleIntensity?: unknown;
  }) {
    const preset = normalizeAnime4kPreset(s);
    const mapped = mapAnime4kPreset(preset);
    const same =
      player.upscaleType === preset.type &&
      player.upscaleIntensity === preset.intensity &&
      player.upscaleEnabled === mapped.enabled &&
      player.upscaleMode === mapped.mode;
    if (same) return;
    player.upscaleType = preset.type;
    player.upscaleIntensity = preset.intensity;
    player.upscaleEnabled = mapped.enabled;
    player.upscaleMode = mapped.mode;
    if (mapped.enabled) startUpscale(); else stopUpscale();
  }

  function changePlaybackRate(rate: number, opts?: { osd?: boolean }) {
    if (inLobbyRoom()) {
      if (videoEl && videoEl.playbackRate !== 1) videoEl.playbackRate = 1;
      if (opts?.osd) showOsd('Скорость недоступна в совместном просмотре', { warn: true });
      return;
    }
    const next = clampPlaybackRate(rate);
    player.playbackRate = next;
    writeStoredPlaybackRate(next);
    if (videoEl) videoEl.playbackRate = next;
    if (opts?.osd) showOsd(formatPlaybackRate(next), { warn: next > PLAYBACK_RATE_WARN });
  }

  /** Re-apply saved speed after src/HLS reload (browser resets rate to 1). */
  function syncVideoPlaybackRate() {
    if (!videoEl) return;
    if (inLobbyRoom()) {
      videoEl.playbackRate = 1;
      return;
    }
    const rate = clampPlaybackRate(player.playbackRate);
    player.playbackRate = rate;
    videoEl.playbackRate = rate;
  }

  function enforceNormalRateInLobby() {
    if (!inLobbyRoom()) return;
    if (videoEl) videoEl.playbackRate = 1;
  }

  function restorePlaybackRateFromStore() {
    if (inLobbyRoom()) {
      enforceNormalRateInLobby();
      return;
    }
    player.playbackRate = readStoredPlaybackRate();
    syncVideoPlaybackRate();
  }

  function changeAspectRatio(aspect: string) {
    player.aspectRatio = aspect;
    if (canvasEl && aspect !== 'auto') {
      canvasEl.style.width = '';
      canvasEl.style.height = '';
    }
    if (player.upscaleEnabled && gpuAvailable) startUpscale();
  }

  function pickQualityForMap(
    qualityMap: Record<string, string>,
    fallbackQuality: string,
    fallbackUrl: string,
  ): { quality: string; url: string } {
    const fallback = {
      quality: fallbackQuality,
      url: (fallbackQuality && qualityMap[fallbackQuality]) || fallbackUrl,
    };
    if (!adaptiveQualityByWindow || qualityManualLock) return fallback;
    if (Object.keys(qualityMap).length === 0) return fallback;
    const picked = pickAdaptiveQuality(qualityMap, getPlayerViewportWidth());
    if (!picked || !qualityMap[picked]) return fallback;
    return { quality: picked, url: qualityMap[picked] };
  }

  function applyQualityMap(
    qualityMap: Record<string, string>,
    fallbackQuality: string,
    fallbackUrl: string,
    opts?: { resetManualLock?: boolean },
  ): { quality: string; url: string } {
    if (opts?.resetManualLock) qualityManualLock = false;
    player.availableQualities = qualityMap;
    const resolved = pickQualityForMap(qualityMap, fallbackQuality, fallbackUrl);
    player.currentQuality = resolved.quality;
    return resolved;
  }

  function scheduleAdaptiveQuality() {
    if (!adaptiveQualityByWindow || qualityManualLock) return;
    if (!player.useVideo || player.loadState !== 'ready') return;
    if (adaptiveQualityTimer) clearTimeout(adaptiveQualityTimer);
    adaptiveQualityTimer = setTimeout(() => {
      adaptiveQualityTimer = null;
      void applyAdaptiveQualityIfNeeded();
    }, 420);
  }

  async function applyAdaptiveQualityIfNeeded(opts?: { force?: boolean; osd?: boolean }) {
    if (!adaptiveQualityByWindow) return;
    if (qualityManualLock && !opts?.force) return;
    if (!player.useVideo || player.loadState !== 'ready') return;
    const map = player.availableQualities;
    if (Object.keys(map).length < 2) return;
    const picked = pickAdaptiveQuality(map, getPlayerViewportWidth());
    if (!picked || picked === player.currentQuality) return;
    await changeQuality(picked, { fromAdaptive: true, osd: opts?.osd });
  }

  /** Switch quality — reuse HLS instance, keep the current frame. */
  async function changeQuality(quality: string, opts?: { fromAdaptive?: boolean; osd?: boolean }) {
    const src = player.availableQualities[quality];
    if (!src || quality === player.currentQuality) return;

    if (!opts?.fromAdaptive) qualityManualLock = true;

    const savedTime    = videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : 0;
    const wasPaused    = videoEl?.paused ?? true;

    localMediaSwap = true;
    isApplyingSync = true;
    preventAutoPause = false;
    if (inLobbyRoom()) {
      logLobbyAction({
        origin: 'local',
        action: 'player.quality',
        via: 'player',
        detail: { quality },
      });
      notifyLobbyBufferingFromUi();
    }

    player.currentQuality = quality;
    if (opts?.osd) showOsd(`${quality.replace(/p$/i, '')}p`);
    if (!videoEl) {
      localMediaSwap = false;
      isApplyingSync = false;
      return;
    }
    bindCoreEls();
    holdUpscaleForNewSource(savedTime);

    const finishSwap = () => {
      preventAutoPause = false;
      upscaleHoldForNewFrame = false;
      syncVideoPlaybackRate();
      if (player.upscaleEnabled && gpuAvailable) startUpscale();
      if (inLobbyRoom()) {
        armLobbyPlayerSyncedOnce();
      } else {
        localMediaSwap = false;
        if (applySyncTimer) clearTimeout(applySyncTimer);
        applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 400);
      }
    };

    const doPlay = () => {
      if (!wasPaused) videoEl.play().catch(() => {});
    };

    const restoreTime = () => {
      if (savedTime > 0 && isFinite(videoEl.duration) && videoEl.duration > 0) {
        videoEl.currentTime = Math.min(savedTime, videoEl.duration);
      } else if (savedTime > 0) {
        videoEl.currentTime = savedTime;
      }
      syncVideoPlaybackRate();
      if (wasPaused) videoEl.pause(); else doPlay();
      seedPlayerTimeFromVideo();
    };

    swapMediaSource(videoEl, src, {
      onReady: () => {
        restoreTime();
        finishSwap();
      },
    });
    videoEl.addEventListener('loadedmetadata', () => {
      syncVideoPlaybackRate();
      seedPlayerTimeFromVideo();
    }, { once: true });
    videoEl.addEventListener('resize', () => {
      restartUpscaleIfFrameSizeChanged();
    }, { once: true });
    videoEl.addEventListener('playing', () => {
      player.paused = false;
      player.switching = false;
      syncVideoPlaybackRate();
      restartUpscaleIfFrameSizeChanged();
    }, { once: true });
    window.setTimeout(() => {
      if (localMediaSwap) {
        restoreTime();
        finishSwap();
      } else if (player.upscaleEnabled && !core.upscale.active && videoEl.videoWidth >= 2) {
        upscaleHoldForNewFrame = false;
        startUpscale();
      }
    }, 1200);
    if (!isHlsUrl(src)) {
      videoEl.addEventListener('loadeddata', () => {
        restoreTime();
        finishSwap();
      }, { once: true });
      syncVideoPlaybackRate();
      doPlay();
    }
  }

  function openSettingsPopover() {
    if (popoverType === 'settings') return;
    popoverType = 'settings';
  }

  function skipForward85() {
    if (videoEl && !isNaN(videoEl.duration)) {
      videoEl.currentTime = Math.min(videoEl.currentTime + 85, videoEl.duration);
      sendToLobby('seek');
    }
  }

  function skipCarryKey() {
    return `${watchState.releaseId}:${watchState.sourceId}`;
  }

  function setSkipMarks(raw: SkipMarks | null | undefined, opts?: { carry?: boolean }) {
    const key = skipCarryKey();
    if (skipMarksCarryKey !== key) {
      skipMarksCarry = null;
      skipMarksCarryKey = key;
    }
    const incoming = normalizeSkipMarks(raw);
    const next = opts?.carry ? mergeSkipMarks(incoming, skipMarksCarry) : incoming;
    skipMarksCarry = next;
    skipMarksCarryKey = key;
    skipMarks = clampSkipMarksToDuration(next, player.duration) ?? next;
  }

  $effect(() => {
    const dur = player.duration;
    const marks = skipMarks;
    if (!marks || !(dur > 2)) return;
    const clamped = clampSkipMarksToDuration(marks, dur);
    if (!clamped) {
      skipMarks = null;
      return;
    }
    if (
      clamped.opening?.start === marks.opening?.start &&
      clamped.opening?.end === marks.opening?.end &&
      clamped.ending?.start === marks.ending?.start &&
      clamped.ending?.end === marks.ending?.end
    ) return;
    skipMarks = clamped;
  });

  const skipPrompt = $derived.by((): SkipMarkKind | null => {
    if (!skipMarks || !player.useVideo || player.loadState !== 'ready' || player.switching) return null;
    const t = player.currentTime;
    if (lobbyWaitOverlay) return null;
    if (skipMarkActive(t, skipMarks.opening)) return 'opening';
    if (skipMarkActive(t, skipMarks.ending)) return 'ending';
    return null;
  });

  $effect(() => {
    if (!skipPrompt) skipDismissedKind = null;
    else if (skipDismissedKind && skipPrompt !== skipDismissedKind) skipDismissedKind = null;
  });

  const skipPromptVisible = $derived(skipPrompt && skipPrompt !== skipDismissedKind ? skipPrompt : null);

  const skipAutoPref = $derived.by((): 'auto' | 'watch' | null => {
    void skipPrefTick;
    if (!skipPromptVisible) return null;
    return getSkipAutoPref(watchState.releaseId, skipPromptVisible);
  });

  const skipToNextEpisode = $derived.by(() => {
    if (skipPrompt !== 'ending' || !endingIsAtEpisodeEnd(skipMarks?.ending, player.duration)) return null;
    if (nextEpisodePosition != null) return { ep: nextEpisodePosition, alt: false as const };
    if (nextEpAltDub) return { ep: nextEpAltDub.targetEp, alt: true as const };
    return null;
  });

  const sausages = $derived.by(() =>
    buildTimelineSausages(player.duration, skipMarks?.opening ?? null, skipMarks?.ending ?? null),
  );

  const SKIP_AUTO_MS = 7000;
  const WATCH_AUTO_MS = 10000;
  let skipCountdownKind = $state<SkipMarkKind | null>(null);
  let watchCountdownPct = $state(0);

  function confirmWatchSkip(kind: SkipMarkKind) {
    rememberSkipPref(kind, 'watch');
    skipDismissedKind = kind;
  }

  $effect(() => {
    const kind = skipPromptVisible;
    const autoSkip = skipAutoPref === 'auto';
    const autoWatch = !!kind && !autoSkip;

    if (kind !== skipCountdownKind) {
      skipCountdownKind = kind;
      skipCountdownPct = 0;
      watchCountdownPct = 0;
    }

    if (!kind) {
      skipCountdownPct = 0;
      watchCountdownPct = 0;
      return;
    }

    const paused = player.paused;
    const blocked = inLobby || player.switching || lobbyWaitOverlay != null;
    if (paused || blocked || !player.useVideo || player.loadState !== 'ready') return;

    if (autoSkip) {
      watchCountdownPct = 0;
      const range = untrack(() => (kind === 'opening' ? skipMarks?.opening : skipMarks?.ending) ?? null);
      const t = untrack(() => player.currentTime);
      const remainSec = range ? Math.max(0.5, range.end - t) : SKIP_AUTO_MS / 1000;
      const duration = Math.min(SKIP_AUTO_MS, Math.max(1500, remainSec * 1000));
      const elapsed0 = untrack(() => (skipCountdownPct / 100) * duration);
      const startedAt = performance.now() - elapsed0;
      let raf = 0;

      const tickFrame = (now: number) => {
        const elapsed = now - startedAt;
        skipCountdownPct = Math.min(100, (elapsed / duration) * 100);
        if (elapsed >= duration) {
          skipCountdownPct = 100;
          skipMediaMark(kind);
          return;
        }
        raf = requestAnimationFrame(tickFrame);
      };
      raf = requestAnimationFrame(tickFrame);
      player.overlayVisible = true;

      return () => {
        if (raf) cancelAnimationFrame(raf);
      };
    }

    if (autoWatch) {
      skipCountdownPct = 0;
      const duration = WATCH_AUTO_MS;
      const elapsed0 = untrack(() => (watchCountdownPct / 100) * duration);
      const startedAt = performance.now() - elapsed0;
      let raf = 0;

      const tickFrame = (now: number) => {
        const elapsed = now - startedAt;
        watchCountdownPct = Math.min(100, (elapsed / duration) * 100);
        if (elapsed >= duration) {
          watchCountdownPct = 100;
          confirmWatchSkip(kind);
          return;
        }
        raf = requestAnimationFrame(tickFrame);
      };
      raf = requestAnimationFrame(tickFrame);
      player.overlayVisible = true;

      return () => {
        if (raf) cancelAnimationFrame(raf);
      };
    }
  });

  function rememberSkipPref(kind: SkipMarkKind, pref: 'auto' | 'watch') {
    setSkipAutoPref(watchState.releaseId, kind, pref);
    skipPrefTick += 1;
  }

  function skipMediaMark(kind: SkipMarkKind) {
    const goNext = kind === 'ending' ? skipToNextEpisode : null;
    skipDismissedKind = kind;
    rememberSkipPref(kind, 'auto');
    if (goNext) {
      if (goNext.alt && nextEpAltDub) {
        goToNextEpisodeInAltDub(nextEpAltDub);
        return;
      }
      goToEpisode(goNext.ep);
      return;
    }
    const range = kind === 'opening' ? skipMarks?.opening : skipMarks?.ending;
    if (!range || !videoEl) return;
    const dur = videoEl.duration;
    const target = Number.isFinite(dur) && dur > 0
      ? Math.min(range.end + 0.05, Math.max(0, dur - 0.05))
      : range.end;
    player.currentTime = target;
    videoEl.currentTime = target;
    sendToLobby('seek', inLobbyRoom() ? target : undefined);
    showOsd(kind === 'opening' ? 'Опенинг пропущен' : 'Эндинг пропущен');
    showAndSchedule();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!player.useVideo || player.loadState !== 'ready') return;
    if (isTypingTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === hotkeys.playPauseCode) {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (e.code === hotkeys.seekBackCode) {
      e.preventDefault();
      seekBySeconds(-hotkeys.seekSeconds);
      return;
    }
    if (e.code === hotkeys.seekForwardCode) {
      e.preventDefault();
      seekBySeconds(hotkeys.seekSeconds);
      return;
    }
    if (e.code === hotkeys.volumeUpCode) {
      e.preventDefault();
      adjustVolume(1);
      return;
    }
    if (e.code === hotkeys.volumeDownCode) {
      e.preventDefault();
      adjustVolume(-1);
      return;
    }
    if (e.code === hotkeys.fullscreenCode) {
      e.preventDefault();
      toggleFullscreen({ osd: true });
      return;
    }
    if (e.code === hotkeys.alwaysOnTopCode) {
      e.preventDefault();
      void toggleAlwaysOnTop({ osd: true });
    }
  }

  function onWheel(e: WheelEvent) {
    if (!hotkeys.ctrlWheelSpeed) return;
    if (!e.ctrlKey && !e.metaKey) return;
    if (!player.useVideo || player.loadState !== 'ready') return;
    if (isTypingTarget(e.target)) return;
    e.preventDefault();
    if (inLobbyRoom()) {
      enforceNormalRateInLobby();
      showOsd('Скорость недоступна в совместном просмотре', { warn: true });
      showAndSchedule();
      return;
    }
    const direction: 1 | -1 = e.deltaY < 0 ? 1 : -1;
    changePlaybackRate(stepPlaybackRate(player.playbackRate, direction), { osd: true });
    showAndSchedule();
  }

  // ── Pending sync ───────────────────────────────────────────────────────────
  function applyRemotePlaybackSync(p: Record<string, unknown>, opts?: { barrier?: boolean }) {
    if (!videoEl || videoEl.hidden) {
      pendingSync = p;
      return;
    }
    isApplyingSync = true;
    preventAutoPause = true;
    const targetTime = typeof p.currentTime === 'number' ? p.currentTime : 0;
    const dur = videoEl.duration;
    const forceSeek = opts?.barrier === true;
    if (Number.isFinite(dur) && dur > 0) {
      const drift = Math.abs(videoEl.currentTime - targetTime);
      if (forceSeek || drift > 0.85) {
        videoEl.currentTime = Math.min(targetTime, dur);
      }
    } else if (targetTime > 0 && forceSeek) {
      videoEl.currentTime = targetTime;
    }
    if (opts?.barrier || p.paused) {
      lastLobbyPausedIntent = true;
      videoEl.pause();
      player.paused = true;
    } else {
      lastLobbyPausedIntent = false;
      void videoEl.play().then(() => { player.paused = false; }).catch(() => {});
    }
    seedPlayerTimeFromVideo();
    const guardMs = opts?.barrier ? 1200 : 700;
    if (applySyncTimer) clearTimeout(applySyncTimer);
    applySyncTimer = window.setTimeout(() => {
      if (!lobbyBarrierPending) {
        isApplyingSync = false;
        preventAutoPause = false;
      }
      applySyncTimer = null;
    }, guardMs);
  }

  function applyPendingSync() {
    if (!pendingSync || !videoEl || videoEl.readyState < 2) return;
    if (localMediaSwap) return;
    const p = pendingSync;
    pendingSync = null;
    applyRemotePlaybackSync(p);
  }

  function doAutoPlay() {
    if (localMediaSwap) return;
    if (pendingSync) { applyPendingSync(); return; }
    if (preventAutoPause || isApplyingSync) return;
    if (inLobbyRoom() && (player.paused || lastLobbyPausedIntent === true)) return;
    videoEl?.play().catch(() => {});
  }

  // ── ResizeObserver + window resize: пересчёт апскейла при смене размера окна
  let ro: ResizeObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let winResizeHandler: (() => void) | null = null;

  function scheduleUpscaleResize() {
    if (!player.upscaleEnabled || !gpuAvailable) return;
    if (localMediaSwap || upscaleHoldForNewFrame) return;
    if (!videoEl || videoEl.readyState < 1) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if (player.upscaleEnabled && videoEl?.readyState >= 1) startUpscale();
    }, 380);
  }

  function onPlayerAreaResize() {
    scheduleUpscaleResize();
    scheduleAdaptiveQuality();
  }

  function initResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    ro?.disconnect();
    ro = new ResizeObserver(() => onPlayerAreaResize());
    const wrap = document.querySelector('.watch-page__player-area')
      ?? document.querySelector('.watch-page__player-wrap');
    const area = (wrap instanceof HTMLElement ? wrap : null) ?? canvasEl?.parentElement;
    if (area) ro.observe(area);
    winResizeHandler = () => onPlayerAreaResize();
    window.addEventListener('resize', winResizeHandler);
  }

  async function startLocalFilePlayback(filePath: string, epOverride?: number) {
    localPlaybackPath = filePath;
    const fileUrl = pathToLocalMediaUrl(filePath);
    if (!fileUrl) {
      player.loadState = 'error';
      player.errorText = 'Файл не найден.';
      return;
    }
    if (epOverride != null && epOverride > 0) watchState.ep = epOverride;
    watchState.dubberId = '';
    watchState.dubberName = 'Скаченное';
    watchState.sourceName = 'Скачано';
    player.loadState = 'ready';
    setSkipMarks(null);
    await tick();
    applyVideoAndUI(fileUrl, true, watchState.ep, watchState.title, 'Скачано', watchState.dubberId);
    bindVideoElementListeners();
    showAndSchedule();
    void loadDownloadedEpisodes();
  }

  function readVideoBuffer(v: HTMLVideoElement) {
    const ranges: { start: number; end: number }[] = [];
    for (let i = 0; i < v.buffered.length; i++) {
      ranges.push({ start: v.buffered.start(i), end: v.buffered.end(i) });
    }
    player.bufferedRanges = ranges;
    player.bufferedEnd = ranges.length ? ranges[ranges.length - 1].end : 0;
  }

  function seedPlayerTimeFromVideo() {
    const v = videoEl;
    if (!v) return;
    if (isFinite(v.currentTime)) player.currentTime = v.currentTime;
    if (isFinite(v.duration) && v.duration > 0) player.duration = v.duration;
    player.paused = v.paused;
    readVideoBuffer(v);
  }

  let videoListenersAbort: AbortController | null = null;

  function bindVideoElementListeners() {
    const el = videoEl;
    if (!el) return;

    videoListenersAbort?.abort();
    videoListenersAbort = new AbortController();
    const { signal } = videoListenersAbort;

    const fromEvent = (e: Event): HTMLVideoElement | null =>
      (e.currentTarget instanceof HTMLVideoElement ? e.currentTarget : el);

    el.addEventListener('timeupdate', (e) => {
      const v = fromEvent(e);
      if (!v) return;
      player.currentTime = v.currentTime;
      player.duration    = v.duration || 0;
      readVideoBuffer(v);
      if (player.upscaleEnabled && gpuAvailable && player.useVideo && !core.upscale.active
        && v.readyState >= 2 && v.videoWidth >= 2 && player.loadState === 'ready' && !player.switching) {
        scheduleUpscaleRestart();
      }
      if ((player.switching || player.loadState === 'loading' || player.loadState === 'error') && mediaHasRenderableFrame(v)) {
        revealPlayerMedia();
      }
    }, { signal });
    el.addEventListener('play',  () => {
      if (isApplyingSync || localMediaSwap || preventAutoPause) return;
      if (inLobbyRoom() && lastLobbyPausedIntent === false) {
        player.paused = false;
        return;
      }
      player.paused = false;
      sendToLobby('play');
    }, { signal });
    el.addEventListener('pause', () => {
      if (isApplyingSync || localMediaSwap || preventAutoPause) return;
      if (inLobbyRoom() && lastLobbyPausedIntent === true) {
        player.paused = true;
        return;
      }
      player.paused = true;
      sendToLobby('pause');
    }, { signal });
    el.addEventListener('progress', (e) => {
      const v = fromEvent(e);
      if (v) readVideoBuffer(v);
    }, { signal });
    el.addEventListener('loadedmetadata', (e) => {
      const v = fromEvent(e);
      if (!v) return;
      player.duration = v.duration || 0;
      if (!upscaleHoldForNewFrame) revealPlayerMedia();
      try { (window as any).electron?.sendPlayerState?.(getPlaybackPayload()); } catch {}
      syncVideoPlaybackRate();
      if (!upscaleHoldForNewFrame && player.upscaleEnabled && gpuAvailable) startUpscale();
      if (pendingSync && !localMediaSwap) applyPendingSync();
      maybeArmLobbySyncAfterLoad(pendingBarrierPlayback);
    }, { signal });
    el.addEventListener('playing', () => {
      if (lastLobbyPausedIntent === true) return;
      player.paused = false;
      if (!upscaleHoldForNewFrame) revealPlayerMedia();
      if (!isApplyingSync) preventAutoPause = false;
      syncVideoPlaybackRate();
      if (!upscaleHoldForNewFrame && player.upscaleEnabled && gpuAvailable && !core.upscale.active) startUpscale();
    }, { signal });
    el.addEventListener('resize', () => {
      restartUpscaleIfFrameSizeChanged();
    }, { signal });
    el.addEventListener('loadeddata', () => {
      if (!upscaleHoldForNewFrame) revealPlayerMedia();
      seedPlayerTimeFromVideo();
      if (!upscaleHoldForNewFrame && player.upscaleEnabled && gpuAvailable && !core.upscale.active) startUpscale();
    }, { signal });
    el.addEventListener('canplay',    doAutoPlay, { once: true, signal });
    el.addEventListener('loadeddata', doAutoPlay, { once: true, signal });
    seedPlayerTimeFromVideo();
    setTimeout(doAutoPlay, 800);
    doAutoPlay();
    initResizeObserver();
  }

  // ── onMount ────────────────────────────────────────────────────────────────
  onMount(() => {
    try {
      const stored = localStorage.getItem(VOLUME_KEY);
      const v = stored != null ? Number(stored) : NaN;
      if (!isNaN(v) && v >= 0 && v <= 100) player.volume = v;
    } catch {}
    player.playbackRate = readStoredPlaybackRate();

    if ((window as any).electron?.getSettings) {
      (window as any).electron.getSettings().then((s: any) => {
        player.debugOverlay = s?.playerDebugOverlay === true;
        adaptiveQualityByWindow = s?.adaptiveQualityByWindow === true;
        hotkeys = normalizePlayerHotkeys(s?.playerHotkeys);
        if (gpuAvailable) {
          applyAnime4kFromSettings(s ?? {});
        }
        if (adaptiveQualityByWindow) scheduleAdaptiveQuality();
      }).catch(() => {});
    }

    inLobby = !!getCurrentRoomId();
    enforceNormalRateInLobby();

    if (initialLobbyCode && !getCurrentRoomId()) {
      void joinLobbyRoomAndOpenPlayer(initialLobbyCode).catch(() => {
        chooserOpen = true;
      });
    }

    if (releaseId) {
      void loadDownloadedEpisodes();
      void loadReleasePoster(releaseId);
    }

    if (initialLocalFile) {
      void loadDownloadedEpisodes();
      void startLocalFilePlayback(initialLocalFile, initialEp);
    } else if (playbackMode === 'local') {
      player.loadState = 'loading';
    } else if (!releaseId) {
      player.loadState = 'ready';
    } else if (!watchState.sourceId || !Number.isFinite(watchState.ep) || !(window as any).anixApi?.release?.getEpisode) {
      player.loadState = 'error';
      player.errorText = 'Неверные параметры просмотра.';
    } else {
    const rId = positiveId(releaseId);
    const sId = positiveId(watchState.sourceId);
    if (rId == null || sId == null) {
      player.loadState = 'error';
      player.errorText = 'Неверные параметры просмотра.';
    } else {
    ;(window as any).anixApi.release.getEpisode(
      rId, sId, watchState.ep,
    ).then(async (res: any) => {
      const episode = res?.episode;
      if (!episode?.url) { player.loadState = 'error'; player.errorText = 'Серия недоступна.'; return; }
      setOrigEpisodeUrl(episode.url);
      const { playUrl: pUrl, useVideo: uv, qualityMap, currentQuality: cq, skip } = await core.resolve(episode.url, episode.iframe);
      const resolved = applyQualityMap(qualityMap, cq, pUrl, { resetManualLock: true });
      setSkipMarks(skip, { carry: true });
      player.loadState = 'ready';
      await tick();
      applyVideoAndUI(resolved.url, uv, watchState.ep, watchState.title, watchState.sourceName, watchState.dubberId);
      refreshDubberNameFromApi();
      refreshSourceNameFromApi();
      fetchEpisodesSilently();

      if (uv) {
        bindVideoElementListeners();
      }
      showAndSchedule();
    }).catch(() => {
      if (mediaHasRenderableFrame(videoEl) || player.currentTime > 0.15 || (player.useVideo && !!player.playUrl)) {
        revealPlayerMedia();
        return;
      }
      player.switching = false;
      player.loadState = 'error';
      player.errorText = 'Ошибка загрузки серии.';
    });
    }
    }

    const handlers: [string, EventListener][] = [
      ['anix:upscaleChanged', ((e: CustomEvent) => {
        applyAnime4kFromSettings((e.detail ?? {}) as {
          upscaleEnabled?: boolean;
          upscaleMode?: number;
          upscaleType?: unknown;
          upscaleIntensity?: unknown;
        });
      }) as EventListener],

      ['anix:playerDebugChanged', ((e: CustomEvent) => {
        const d = e.detail as { playerDebugOverlay?: boolean };
        if (typeof d?.playerDebugOverlay === 'boolean') player.debugOverlay = d.playerDebugOverlay;
      }) as EventListener],

      ['anix:adaptiveQualityChanged', ((e: CustomEvent) => {
        const d = e.detail as { adaptiveQualityByWindow?: boolean };
        if (typeof d?.adaptiveQualityByWindow !== 'boolean') return;
        adaptiveQualityByWindow = d.adaptiveQualityByWindow;
        if (adaptiveQualityByWindow) {
          qualityManualLock = false;
          void applyAdaptiveQualityIfNeeded({ force: true, osd: true });
        }
      }) as EventListener],

      ['anix:playerHotkeysChanged', ((e: CustomEvent) => {
        hotkeys = normalizePlayerHotkeys(e.detail);
      }) as EventListener],

      ['lobby:wsJoined', (() => {
        inLobby = true;
        sidebarOpen = true;
        enforceNormalRateInLobby();
      }) as EventListener],

      ['lobby:left', (() => {
        inLobby = !!getCurrentRoomId();
        if (!inLobby) {
          sidebarOpen = false;
          lobby.resetRoom();
          restorePlaybackRateFromStore();
        }
      }) as EventListener],

      ['lobby:roomGone', (() => {
        inLobby = false;
        sidebarOpen = false;
        lobby.resetRoom();
        restorePlaybackRateFromStore();
      }) as EventListener],

      ['player:changeContent', ((e: CustomEvent) => {
        const p = e.detail as any;
        if (p?.localFile) {
          if (p.releaseId) beginMediaCover(String(p.releaseId));
          else beginMediaCover();
          watchState.title = p.title || watchState.title;
          watchState.sourceName = p.sourceName || watchState.sourceName;
          if (p.releaseId) watchState.releaseId = p.releaseId;
          if (p.sourceId) watchState.sourceId = p.sourceId;
          if (p.ep) watchState.ep = parseInt(p.ep, 10);
          if (p.dubberId) watchState.dubberId = p.dubberId;
          void startLocalFilePlayback(String(p.localFile), p.ep ? parseInt(p.ep, 10) : undefined);
          return;
        }
        if (!p?.releaseId || !p.sourceId || !p.ep) return;
        beginMediaCover(String(p.releaseId));
        watchState.releaseId  = p.releaseId;
        watchState.sourceId   = p.sourceId;
        watchState.ep         = parseInt(p.ep, 10);
        watchState.title      = p.title      || watchState.title;
        watchState.sourceName = p.sourceName || '';
        watchState.dubberId   = p.dubberId   || '';
        watchState.dubberName = p.dubberName != null && p.dubberName !== '' ? String(p.dubberName) : '';
        invalidateDubbersPickerCache();
        if (!watchState.dubberName && watchState.dubberId) refreshDubberNameFromApi();
        refreshSourceNameFromApi();
        if (p.local && !p.applyRoomPlayback) sendToLobby('changeEpisode', 0);
        isApplyingSync = true;
        const joinSeek = typeof p.currentTime === 'number' ? p.currentTime : (p.applyRoomPlayback ? 0 : undefined);
        loadEpisode(parseInt(p.releaseId, 10), parseInt(p.sourceId, 10), parseInt(p.ep, 10), p.title || watchState.title, p.sourceName || '', p.dubberId || '', p.applyRoomPlayback || p.local ? (joinSeek ?? 0) : joinSeek, p.applyRoomPlayback ? true : !!p.paused)
          .then(() => {
            fetchEpisodesSilently();
            maybeArmLobbySyncAfterLoad(p);
          })
          .catch(() => {});
        if (applySyncTimer) clearTimeout(applySyncTimer);
        applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 4000);
      }) as EventListener],

      ['player:applySync', ((e: CustomEvent) => {
        const p = e.detail as any;
        if (!p?.releaseId || !p.sourceId || !p.ep) return;
        if (localMediaSwap) {
          pendingSync = p;
          logLobbyAction({
            origin: 'server',
            action: 'player.applySync.queued',
            playback: snapshotPlayback(p),
            via: 'player',
            note: 'смена качества/источника',
          });
          return;
        }
        const same = watchState.releaseId === p.releaseId && watchState.sourceId === p.sourceId && watchState.ep === Number(p.ep) && (watchState.dubberId || '') === (p.dubberId || '');
        const remoteAction = p.action === 'play' || p.action === 'pause' || p.action === 'seek';
        const inBarrier = needsLobbySyncReady();
        if (same && (player.loadState === 'error' || videoEl?.hidden)) {
          releaseLobbySyncAfterPlaybackError();
          return;
        }
        if (same && remoteAction && videoEl && !videoEl.hidden) {
          applyRemotePlaybackSync(p, { barrier: inBarrier });
          if (inLobbyRoom() && inBarrier) {
            armLobbyPlayerSyncedOnce(typeof p.currentTime === 'number' ? p.currentTime : undefined);
          }
          return;
        }
        isApplyingSync = true;
        if (same && videoEl && !videoEl.hidden && videoEl.readyState >= 2) {
          applyRemotePlaybackSync(p);
        } else if (same && videoEl && videoEl.readyState < 2) {
          lobbyStalePlaybackBeforeSwitch = null;
          pendingSync = p;
        } else if (!same) {
          if (
            lobbyStalePlaybackBeforeSwitch &&
            lobbyPlaybackMatchesStaleSnap(p as Record<string, unknown>, lobbyStalePlaybackBeforeSwitch)
          ) {
            isApplyingSync = false;
            return;
          }
          lobbyStalePlaybackBeforeSwitch = null;
          beginMediaCover(String(p.releaseId));
          watchState.releaseId = p.releaseId; watchState.sourceId = p.sourceId;
          watchState.dubberName = p.dubberName != null && p.dubberName !== '' ? String(p.dubberName) : '';
          invalidateDubbersPickerCache();
          if (!watchState.dubberName && (p.dubberId || '')) refreshDubberNameFromApi();
          loadEpisode(parseInt(p.releaseId, 10), parseInt(p.sourceId, 10), parseInt(p.ep, 10), p.title || watchState.title, p.sourceName || watchState.sourceName, p.dubberId || '', typeof p.currentTime === 'number' ? p.currentTime : undefined, !!p.paused)
            .then(() => {
              fetchEpisodesSilently();
              maybeArmLobbySyncAfterLoad(p);
            })
            .catch(() => {});
        }
        if (applySyncTimer) clearTimeout(applySyncTimer);
        applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, pendingSync ? 3000 : 1500);
      }) as EventListener],

      ['lobby:barrierSync', ((e: CustomEvent) => {
        if (!inLobbyRoom()) return;
        lobbyBarrierPending = true;
        lobbySyncAwaiting = true;
        isApplyingSync = true;
        const d = e.detail as {
          playback?: Record<string, unknown> | null;
          reason?: 'join' | 'episode' | 'buffer';
          joinerPeerId?: string | null;
        } | null;
        const pb = d?.playback ?? null;
        const reason = d?.reason ?? 'buffer';
        pendingBarrierPlayback = pb;

        if (reason === 'join') {
          const sameIds = !!(pb?.releaseId
            && watchState.releaseId === String(pb.releaseId)
            && watchState.sourceId === String(pb.sourceId)
            && watchState.ep === Number(pb.ep)
            && (watchState.dubberId || '') === String(pb.dubberId || ''));
          const same = sameIds && !!videoEl && !videoEl.hidden;
          if (same) {
            lastLobbyPausedIntent = true;
            preventAutoPause = true;
            try { videoEl.pause(); } catch { /* ignore */ }
            player.paused = true;
            notifyLobbyPlayerSyncedIfReady();
          } else if (sameIds && player.loadState === 'error') {
            notifyLobbyPlayerSyncedIfReady();
          } else if (pb?.releaseId && pb.sourceId && pb.ep) {
            beginMediaCover(String(pb.releaseId));
            watchState.releaseId = String(pb.releaseId);
            watchState.sourceId = String(pb.sourceId);
            watchState.dubberName = pb.dubberName != null && pb.dubberName !== '' ? String(pb.dubberName) : '';
            invalidateDubbersPickerCache();
            if (!watchState.dubberName && (pb.dubberId || '')) refreshDubberNameFromApi();
            const seekTo = typeof pb.currentTime === 'number' ? pb.currentTime : 0;
            loadEpisode(parseInt(String(pb.releaseId), 10), parseInt(String(pb.sourceId), 10), parseInt(String(pb.ep), 10), String(pb.title || watchState.title), String(pb.sourceName || watchState.sourceName), String(pb.dubberId || ''), seekTo, true)
              .then(() => {
                fetchEpisodesSilently();
                maybeArmLobbySyncAfterLoad({ ...pb, currentTime: seekTo });
              })
              .catch(() => notifyLobbyPlayerSyncedIfReady());
          } else {
            try { videoEl?.pause(); } catch { /* ignore */ }
            armLobbyPlayerSyncedOnce(videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : undefined);
          }
          return;
        }

        const barrierSame = !!(pb?.releaseId && pb.sourceId && pb.ep
          && watchState.releaseId === String(pb.releaseId)
          && watchState.sourceId === String(pb.sourceId)
          && watchState.ep === Number(pb.ep)
          && (watchState.dubberId || '') === String(pb.dubberId || ''));
        if (barrierSame && videoEl && !videoEl.hidden) {
          applyRemotePlaybackSync(pb, { barrier: true });
          armLobbyPlayerSyncedOnce(typeof pb.currentTime === 'number' ? pb.currentTime : 0);
        } else if (pb?.releaseId && pb.sourceId && pb.ep && !barrierSame) {
          beginMediaCover(String(pb.releaseId));
          watchState.releaseId = String(pb.releaseId);
          watchState.sourceId = String(pb.sourceId);
          watchState.dubberName = pb.dubberName != null && pb.dubberName !== '' ? String(pb.dubberName) : '';
          invalidateDubbersPickerCache();
          if (!watchState.dubberName && (pb.dubberId || '')) refreshDubberNameFromApi();
          const seekTo = reason === 'episode' ? 0 : (typeof pb.currentTime === 'number' ? pb.currentTime : 0);
          loadEpisode(parseInt(String(pb.releaseId), 10), parseInt(String(pb.sourceId), 10), parseInt(String(pb.ep), 10), String(pb.title || watchState.title), String(pb.sourceName || watchState.sourceName), String(pb.dubberId || ''), seekTo, true)
            .then(() => {
              fetchEpisodesSilently();
              maybeArmLobbySyncAfterLoad({ ...pb, currentTime: seekTo });
            })
            .catch(() => {
              localMediaSwap = false;
              isApplyingSync = false;
              notifyLobbyPlayerSyncedIfReady();
            });
        } else {
          armLobbyPlayerSyncedOnce();
        }
      }) as EventListener],

      ['lobby:syncState', ((e: CustomEvent) => {
        const d = e.detail as { blocked?: boolean; awaiting?: boolean } | null;
        lobbySyncAwaiting = !!d?.awaiting;
        if (!d?.blocked && !d?.awaiting) {
          lobbyBarrierPending = false;
          pendingBarrierPlayback = null;
        }
      }) as EventListener],

      ['lobby:syncResume', (() => {
        lobbyBarrierPending = false;
        lobbySyncAwaiting = false;
        pendingBarrierPlayback = null;
        preventAutoPause = false;
        isApplyingSync = false;
      }) as EventListener],

      ['lobby:proposal', ((e: CustomEvent) => {
        const d = e.detail as any;
        if (!d) return;
        if (d.type === 'vote' && d.proposalId) {
          lobby.voteProposal = { proposalId: d.proposalId, proposerLogin: d.proposerLogin ?? 'Участник', playback: d.playback ?? {} };
          lobby.voteState    = 'vote';
        } else if (d.type === 'waiting') {
          lobby.waitingTitle = d.newPlayback?.title || 'новое аниме';
          lobby.voteState    = 'waiting';
        } else if (d.type === 'accepted') {
          lobby.showResult('Смена аниме одобрена!', 'accepted');
        } else if (d.type === 'rejected') {
          lobby.showResult(d.reason === 'timeout' ? 'Время голосования истекло' : 'Смена аниме отклонена', 'rejected');
        }
      }) as EventListener],

      ['lobby:participantsList', ((e: CustomEvent) => {
        lobby.participants = Array.isArray(e.detail) ? e.detail : [];
      }) as EventListener],

      ['lobby:activityFeed', ((e: CustomEvent) => {
        const d = e.detail as LobbyActivityEntry | null;
        if (!d?.type || !d.login) return;
        lobby.addLogEntry(d);
        lobby.addChat({
          id: `sys-${Date.now()}-${d.login}-${d.type}`,
          text: `${d.login} ${lobbyActionText(d.type)}`,
          login: d.login,
          avatar: d.avatar ?? null,
          ts: Date.now(),
          system: true,
        });
        if (d.type === 'left') {
          const pid = d.peerId != null ? String(d.peerId) : '';
          lobby.participants = pid
            ? lobby.participants.filter(p => String(p.peerId ?? p.id) !== pid)
            : lobby.participants.filter(p => p.login !== d.login);
        }
      }) as EventListener],

      ['lobby:session', ((e: CustomEvent) => {
        const session = e.detail as {
          inLobby?: boolean;
          roomCode?: string | null;
          participants?: unknown[];
        } | null;
        const next = !!session?.inLobby;
        inLobby = next;
        if (next) {
          sidebarOpen = true;
          chooserOpen = false;
          lobby.roomCode = String(session?.roomCode ?? '');
          if (Array.isArray(session?.participants)) {
            lobby.participants = session.participants as typeof lobby.participants;
          }
          enforceNormalRateInLobby();
        } else {
          sidebarOpen = false;
          lobby.resetRoom();
          restorePlaybackRateFromStore();
        }
      }) as EventListener],

      ['lobby:chat', ((e: CustomEvent) => {
        const msg = e.detail as LobbyChatMessage | null;
        if (!msg?.id || !msg.text) return;
        lobby.addChat(msg);
      }) as EventListener],

      ['lobby:playerWaitingOverlay', ((e: CustomEvent) => {
        const d = e.detail as LobbyWaitOverlay;
        lobbyWaitOverlay = d ?? null;
      }) as EventListener],
    ];

    handlers.forEach(([evt, fn]) => window.addEventListener(evt, fn));
    window.electron?.lobbyRequestSession?.();
    window.addEventListener('keydown', onKeyDown);
    const wheelOpts: AddEventListenerOptions = { passive: false };
    window.addEventListener('wheel', onWheel, wheelOpts);
    window.addEventListener('pointermove', onPointerActivity, true);
    window.addEventListener('pointerdown', onPointerActivity, true);
    document.addEventListener('mouseenter', showAndSchedule, true);

    return () => {
      videoListenersAbort?.abort();
      videoListenersAbort = null;
      handlers.forEach(([evt, fn]) => window.removeEventListener(evt, fn));
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel, wheelOpts);
      window.removeEventListener('pointermove', onPointerActivity, true);
      window.removeEventListener('pointerdown', onPointerActivity, true);
      document.removeEventListener('mouseenter', showAndSchedule, true);
      stopUpscale();
      core.destroy();
      ro?.disconnect();
      if (winResizeHandler) window.removeEventListener('resize', winResizeHandler);
      lobby.destroy();
      if (applySyncTimer)  clearTimeout(applySyncTimer);
      if (idleTimer)       clearTimeout(idleTimer);
      if (osdTimer)        clearTimeout(osdTimer);
      if (adaptiveQualityTimer) clearTimeout(adaptiveQualityTimer);
    };
  });

  const chromeProps = $derived({
    overlayVisible: player.overlayVisible,
    ep: watchState.ep,
    title: watchState.title,
    dubberName: watchState.dubberName,
    sourceName: watchState.sourceName,
    useVideo: player.useVideo,
    hasPrevEp,
    hasNextEp,
    prevEp: prevEpisodePosition,
    nextEp: nextEpisodePosition,
    nextEpAltDub: isLocalPlaybackMode ? null : nextEpAltDub,
    currentDubLabel,
    paused: player.paused,
    currentTime: player.currentTimeDisplay,
    totalTime: player.totalTimeDisplay,
    progressPct: player.progressPct,
    bufferedPct: player.bufferedPct,
    bufferedRanges: player.bufferedRangePcts,
    duration: player.duration,
    sausages,
    skipPrompt: skipPromptVisible,
    skipNextEp: skipToNextEpisode?.ep ?? null,
    skipCountdownPct,
    watchCountdownPct,
    muted: player.muted,
    volume: player.volume,
    isFullscreen: player.isFullscreen,
    episodes,
    dubbers,
    sources: dubberSources,
    downloadedEpisodes,
    downloadedPositions,
    localMode: isLocalPlaybackMode,
    currentDownloadedPath: localPlaybackPath,
    currentDubberId: watchState.dubberId,
    currentSourceId: watchState.sourceId,
    popoverType,
    popoverLoading,
    gpuAvailable,
    upscaleEnabled: player.upscaleEnabled,
    upscaleType: player.upscaleType,
    upscaleIntensity: player.upscaleIntensity,
    playbackRate: player.playbackRate,
    aspectRatio: player.aspectRatio,
    availableQualities: player.availableQualities,
    currentQuality: player.currentQuality,
    speedLocked: inLobby,
    lastEpisodeTypeUpdateId,
    seekSeconds: hotkeys.seekSeconds,
    onprevEp: () => { if (prevEpisodePosition != null) goToEpisode(prevEpisodePosition); },
    onnextEp: () => { if (nextEpisodePosition != null) goToEpisode(nextEpisodePosition); },
    onnextAltDub: goToNextEpisodeInAltDub,
    ontogglePlay: togglePlay,
    onplay: () => videoEl?.play().catch(() => {}),
    onseek: onSeek,
    ontoggleMute: toggleMute,
    onvolumechange: onVolumeChange,
    onchangeAnime4k: applyAnime4kPreset,
    onskipMark: () => { if (skipPromptVisible) skipMediaMark(skipPromptVisible); },
    onwatchSkip: () => {
      if (!skipPromptVisible) return;
      confirmWatchSkip(skipPromptVisible);
    },
    onopenSeries: openSeriesPopover,
    onopenDubbing: openDubbingPopover,
    onopenSource: openSourcePopover,
    onopenSettings: openSettingsPopover,
    onselectEp: goToEpisode,
    onselectDub: selectDubber,
    onselectSource: selectSource,
    onselectDownloadedMode: selectDownloadedMode,
    ontogglePinDub: togglePinDubber,
    onclosePopover: () => { popoverType = null; },
    onfullscreen: toggleFullscreen,
    onchangeRate: changePlaybackRate,
    onchangeAspect: changeAspectRatio,
    onchangeQuality: changeQuality,
    onseekBack: () => seekBySeconds(-hotkeys.seekSeconds),
    onseekForward: () => seekBySeconds(hotkeys.seekSeconds),
    inLobby,
    sidebarOpen,
    onopenLobby: () => {
      if (inLobby) {
        sidebarOpen = !sidebarOpen;
        if (!sidebarOpen) actionLogOpen = false;
      } else chooserOpen = true;
    },
  } satisfies PlayerChromeProps);
</script>

<div class="view view-watch">
  <div
    class="watch-page watch-page--anidesk {!player.useVideo ? 'watch-page--iframe-mode' : ''}"
    class:watch-page--chrome-hidden={player.loadState === 'ready' && !player.overlayVisible}
    class:watch-page--error={player.loadState === 'error'}
    class:watch-page--lobby={inLobby}
    class:watch-page--lobby-sidebar={inLobby && sidebarOpen}
    class:watch-page--lobby-log={inLobby && sidebarOpen && actionLogOpen}
    bind:this={playerWrapEl}
    onpointermove={onPointerActivity}
    onpointerdown={onPointerActivity}
    onmouseenter={showAndSchedule}
    role="presentation"
  >
    <div class="watch-page__player-wrap">
      <div class="watch-page__player-area">
        <!-- svelte-ignore a11y_missing_attribute -->
        <iframe
          bind:this={iframeEl}
          class="watch-page__iframe"
          src={!player.useVideo ? player.playUrl : ''}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerpolicy="no-referrer-when-downgrade"
          hidden={player.useVideo || player.loadState !== 'ready' || player.switching || !watchState.releaseId}
          title="Видео плеер"
        ></iframe>
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={videoEl}
          class="watch-page__video {player.aspectRatio !== 'auto' ? `watch-page__video--ratio watch-page__video--ratio-${player.aspectRatio.replace('/', '-')}` : ''}"
          playsinline
          crossorigin="anonymous"
          hidden={!player.useVideo || player.loadState === 'error' || player.switching || player.loadState === 'loading'}
        ></video>
        {#key upscaleCanvasEpoch}
          <canvas
            bind:this={canvasEl}
            class="watch-page__upscale-canvas {player.aspectRatio !== 'auto' ? `watch-page__upscale-canvas--ratio watch-page__upscale-canvas--ratio-${player.aspectRatio.replace('/', '-')}` : ''}"
            class:watch-page__upscale-canvas--on={player.upscaleCanvasOn && !player.switching}
          ></canvas>
        {/key}

        {#if player.loadState === 'loading' || player.switching}
          <div class="watch-page__poster-layer" aria-hidden="true">
            {#if posterUrl}
              <img class="watch-page__poster-img" src={posterUrl} alt="" />
            {/if}
          </div>
          <div class="watch-page__player-loading" role="status">Загрузка…</div>
        {:else if !watchState.releaseId}
          <div class="watch-page__lobby-idle" role="status">
            <p class="watch-page__lobby-idle-title">Совместный просмотр</p>
            <p class="watch-page__lobby-idle-hint">Выберите аниме в приложении — оно откроется у всех в комнате</p>
          </div>
        {/if}

        {#if inLobby && lobbyWaitOverlay && player.loadState !== 'error'}
          <div class="watch-page__lobby-wait" role="status" aria-live="polite">
            {#if lobbyWaitOverlay.mode === 'peer'}
              <div class="watch-page__lobby-wait-row">
                {#if lobbyWaitOverlay.avatar}
                  <img
                    class="watch-page__lobby-wait-avatar"
                    src={resolveCdnAssetUrl(lobbyWaitOverlay.avatar)}
                    alt=""
                    referrerpolicy="no-referrer"
                  />
                {/if}
                <span class="watch-page__lobby-wait-text">
                  Ожидаем пользователя <strong>{lobbyWaitOverlay.login ?? 'Участник'}</strong>
                </span>
              </div>
              <p class="watch-page__lobby-wait-hint">Загрузка потока…</p>
            {:else if lobbyWaitOverlay.mode === 'localBuffering'}
              <p class="watch-page__lobby-wait-title">Загружаем поток…</p>
              <p class="watch-page__lobby-wait-hint">Синхронизация с комнатой</p>
            {/if}
          </div>
        {/if}
      </div>

      {#if player.loadState === 'error'}
        <div class="watch-page__player-error" role="alert">
          <p class="watch-page__player-error-title">{player.errorText}</p>
          {#if playbackAlt}
            <p class="watch-page__player-error-hint">
              {#if inLobby}
                {playbackAlt.sameDubber
                  ? `Есть та же серия на ${playbackAlt.sourceName} — переключит у всех в комнате`
                  : `Есть та же серия в озвучке ${playbackAlt.dubberName} — переключит у всех в комнате`}
              {:else}
                {playbackAlt.sameDubber
                  ? `Есть та же серия на ${playbackAlt.sourceName}`
                  : `Есть та же серия в озвучке ${playbackAlt.dubberName}`}
              {/if}
            </p>
            <button
              type="button"
              class="watch-page__player-error-btn"
              onclick={acceptPlaybackAlt}
            >
              {playbackAltLabel(playbackAlt)}
            </button>
          {:else}
            <p class="watch-page__player-error-hint">
              {inLobby ? 'Выберите другую озвучку — смена будет у всех в комнате' : 'Выберите другую озвучку'}
            </p>
          {/if}
        </div>
      {/if}

      {#if player.loadState === 'ready' || player.loadState === 'error'}
        {#if inLobby}
          <LobbyShell
            {...chromeProps}
            overlayVisible={player.overlayVisible}
            participants={lobby.participants}
            activityLog={lobby.activityLog}
            voteState={lobby.voteState}
            voteProposal={lobby.voteProposal}
            waitingTitle={lobby.waitingTitle}
            resultText={lobby.resultText}
            resultType={lobby.resultType}
            onvote={(id, accept) => lobby.handleVote(id, accept)}
          />
        {:else}
          <SoloShell {...chromeProps} overlayVisible={player.overlayVisible} />
        {/if}
      {/if}

      {#if player.debugOverlay && player.useVideo}
        <pre class="watch-page__debug-hud">{debugHudText}</pre>
      {/if}

      {#if osdText}
        <div
          class="watch-page__osd"
          class:watch-page__osd--warn={osdWarn}
          role="status"
          aria-live="polite"
        >{osdText}</div>
      {/if}

      <div
        class="watch-page__chrome-hotspot"
        aria-hidden="true"
        onclick={() => { showAndSchedule(); togglePlay(); }}
      ></div>
    </div>

    {#if inLobby}
      <LobbySidebar
        roomCode={lobby.roomCode}
        participants={lobby.participants}
        messages={lobby.chatMessages}
        actionLogOpen={actionLogOpen}
        collapsed={!sidebarOpen}
        ontogglelog={() => { actionLogOpen = !actionLogOpen; }}
        onleave={() => {
          if (window.electron?.lobbyLeaveFromPlayer) window.electron.lobbyLeaveFromPlayer();
          else void leaveLobbyRoomFromUi();
        }}
        onsend={(text) => {
          if (window.electron?.lobbyChatFromPlayer) {
            window.electron.lobbyChatFromPlayer(text);
            return;
          }
          const profile = getLobbyProfile();
          sendLobbyChat({ text, login: profile.login, avatar: profile.avatar });
        }}
      />
      {#if actionLogOpen && sidebarOpen}
        <LobbyActionLogPanel onclose={() => { actionLogOpen = false; }} />
      {/if}
    {/if}
  </div>
</div>

{#if chooserOpen}
  <LobbyChooserOverlay onClose={() => { chooserOpen = false; }} getPlayback={getPlaybackPayload} />
{/if}
