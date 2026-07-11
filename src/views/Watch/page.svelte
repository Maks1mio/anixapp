<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Hls from 'hls.js';
  import {
    DoG, BilateralMean, CNNM, CNNSoftM, CNNSoftVL, CNNVL, CNNUL, GANUUL,
    CNNx2M, CNNx2VL, DenoiseCNNx2VL, CNNx2UL, GANx3L, GANx4UUL,
    ModeA, ModeB, ModeC, ModeAA, ModeBB, ModeCA,
    render as anime4kRender,
  } from 'anime4k-webgpu';
  import { getWatchParams } from '../../router';
  import { getCurrentRoomId } from '../../services/lobby-state';
  import type { WatchState, EpisodeItem, DubberItem, LobbyActivityEntry, PopoverType, NextEpAltDub } from './_types';
  import { isHlsUrl, stripKodikQueryParams, resolveEpisodeUrl, resolveEpisodeUrlWithRetry, isDubberBlacklisted } from './_utils';
  import { PlayerState } from './_usePlayer.svelte';
  import { LobbyState }  from './_useLobby.svelte';
  import LobbyPanel      from './components/LobbyPanel.svelte';
  import LobbyVote       from './components/LobbyVote.svelte';
  import ControlsBar     from './components/ControlsBar.svelte';
  import ActionsBar      from './components/ActionsBar.svelte';
  import TopBar          from './components/TopBar.svelte';
  import CenterPlay      from './components/CenterPlay.svelte';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';

  // WebGPU types fallback:
  // В некоторых конфигурациях TS не подтягивает типы WebGPU (GPUDevice/navigator.gpu),
  // хотя рантайм их поддерживает. Чтобы не ломать сборку, даём минимальные типы.
  // При наличии @webgpu/types этот alias будет не нужен, но и не мешает.
  type GPUDevice = {
    destroy?: () => void;
  } & Record<string, unknown>;

  // ── URL params ─────────────────────────────────────────────────────────────
  const params          = getWatchParams();
  const releaseId       = params.get('releaseId') || params.get('viewId') || '';
  const initialSourceId = params.get('sourceId') || '';
  const initialEp       = parseInt(params.get('ep') || '1', 10);
  const initialTitle    = params.get('title') || 'Просмотр';
  const initialSrcName  = params.get('sourceName') || '';
  const initialDubId    = params.get('dubberId') || '';

  // ── Reactive state ─────────────────────────────────────────────────────────
  const player = new PlayerState();
  const lobby  = new LobbyState();

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

  function refreshDubberNameFromApi() {
    const rId = parseInt(watchState.releaseId, 10);
    const did = watchState.dubberId;
    if (!did || !(window as any).anixApi?.release?.getDubbers) return;
    (window as any).anixApi.release.getDubbers(rId).then((res: { types?: DubberItem[] }) => {
      const match = (res?.types ?? []).find(d => String(d.id) === did);
      if (match) watchState.dubberName = match.name;
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

  // ── Episode nav derived ────────────────────────────────────────────────────
  const hasNextEp = $derived(
    episodes.length === 0 || episodes.some(e => e.position === watchState.ep + 1),
  );
  const hasPrevEp = $derived(
    watchState.ep > 0 && (episodes.length === 0 || episodes.some(e => e.position === watchState.ep - 1)),
  );

  /** Подпись «в озвучке (…)» для кнопки следующей серии */
  const currentDubLabel = $derived((watchState.dubberName || watchState.sourceName || '').trim());

  /** Следующая серия недоступна в текущей озвучке, но есть в другой — самая популярная по view_count */
  let nextEpAltDub = $state<NextEpAltDub | null>(null);
  let nextEpAltGen = 0;

  function isVoiceoverDub(d: DubberItem): boolean {
    return !(d.type === 1 || /субтитр/i.test(d.name));
  }

  async function refreshNextEpisodeAlternative() {
    const gen = ++nextEpAltGen;
    const nextEp = watchState.ep + 1;
    const rId = parseInt(watchState.releaseId, 10);
    const currentDubId = watchState.dubberId;
    const api = (window as any).anixApi?.release;
    if (!rId || !currentDubId || !api?.getDubbers || !api?.getDubberSources || !api?.getEpisode) {
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
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { player.overlayVisible = false; idleTimer = null; }, IDLE_MS);
  }
  function hideNow() {
    if (popoverType != null) return; // не гасим, пока открыты поповеры
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    player.overlayVisible = false;
  }
  function showAndSchedule() { showOverlay(); scheduleHide(); }

  $effect(() => {
    if (popoverType != null) {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      player.overlayVisible = true;
    }
  });

  // ── Upscale ────────────────────────────────────────────────────────────────
  const gpuAvailable = typeof navigator !== 'undefined' && typeof (navigator as any).gpu !== 'undefined';
  let upscaleStopFn: (() => void) | null = null;
  /** GPU-устройство, перехваченное из anime4k-webgpu — чистим при stopUpscale */
  let _capturedGpuDevice: GPUDevice | null = null;
  /** Флаг: если true — requestVideoFrameCallback-loop внутри anime4k не будет продолжаться */
  let _upscaleRenderStopped = false;
  /** Счётчик запусков: отменяет устаревший anime4kRender при очередном resize/повторном старте */
  let upscaleRunId = 0;
  let upscaleLastError = $state('');

  const upscaleModeMap: Record<number, any> = {
    0: DoG, 1: BilateralMean, 2: CNNM, 3: CNNSoftM, 4: CNNSoftVL,
    5: CNNVL, 6: CNNUL, 7: GANUUL,
    8: CNNx2M, 9: CNNx2VL, 10: DenoiseCNNx2VL, 11: CNNx2UL, 12: GANx3L, 13: GANx4UUL,
    14: ModeA, 15: ModeB, 16: ModeC, 17: ModeAA, 18: ModeBB, 19: ModeCA,
  };

  function stopUpscale() {
    // 1. Останавливаем render-loop (флаг проверяется в обёртке requestVideoFrameCallback)
    _upscaleRenderStopped = true;
    // 2. Вызываем stop-callback библиотеки (если есть)
    if (upscaleStopFn) { try { upscaleStopFn(); } catch {} upscaleStopFn = null; }
    // 3. Уничтожаем GPU-устройство — освобождаем всю GPU-память (текстуры, буферы, пайплайны)
    if (_capturedGpuDevice) {
      try { _capturedGpuDevice.destroy?.(); } catch {}
      _capturedGpuDevice = null;
    }
    // 4. Сбрасываем canvas
    if (canvasEl) {
      canvasEl.hidden = true;
      canvasEl.width = 1;
      canvasEl.height = 1;
      canvasEl.style.width = '';
      canvasEl.style.height = '';
    }
    videoEl?.classList.remove('watch-page__video--hidden-for-upscale');
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
    const hls = (v as any)._hls as Hls | undefined;
    if (hls?.levels?.length) {
      const ci = hls.currentLevel;
      const li = ci >= 0 ? ci : (typeof hls.loadLevel === 'number' && hls.loadLevel >= 0 ? hls.loadLevel : -1);
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
    if (canvasEl && !canvasEl.hidden && upscaleStopFn) {
      lines.push(`Кадры вывода (canvas rAF): ${debugCanvasRafTicks}`);
    }
    const buf = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
    const dur = v.duration && isFinite(v.duration) ? v.duration : 0;
    const bufPct = dur > 0 ? Math.round((buf / dur) * 100) : 0;
    lines.push(`Буфер: ~${bufPct}% · ${v.paused ? 'пауза' : 'воспроизведение'} · ×${v.playbackRate.toFixed(2)}`);
    lines.push(`Состояние: readyState ${v.readyState} · network ${v.networkState}`);
    if (player.upscaleEnabled && gpuAvailable && canvasEl && !canvasEl.hidden && upscaleStopFn) {
      lines.push(`Anime4K: активен · режим ${player.upscaleMode} · canvas ${canvasEl.width}×${canvasEl.height}`);
    } else if (player.upscaleEnabled && gpuAvailable) {
      const err = upscaleLastError.trim();
      lines.push(
        err
          ? `Anime4K: ошибка · режим ${player.upscaleMode} — ${err.slice(0, 120)}`
          : `Anime4K: запуск… · режим ${player.upscaleMode}`,
      );
    } else {
      lines.push(`Anime4K: ${gpuAvailable ? 'выкл' : 'нет WebGPU'} · режим ${player.upscaleMode}`);
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
        if (canvasEl && !canvasEl.hidden && upscaleStopFn) debugCanvasRafTicks++;
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

  async function startUpscale() {
    if (!gpuAvailable || !player.upscaleEnabled || !canvasEl || !videoEl) return;
    stopUpscale();
    if (videoEl.readyState < 1) return;

    const myRun = ++upscaleRunId;
    _upscaleRenderStopped = false;

    const videoW = videoEl.videoWidth  || 1920;
    const videoH = videoEl.videoHeight || 1080;
    const aspect = videoW / videoH;

    // Размер контейнера в CSS-пикселях (без DPR — экономит GPU-память)
    const rect = canvasEl.parentElement?.getBoundingClientRect();
    const containerW = rect ? Math.round(rect.width)  : 1920;
    const containerH = rect ? Math.round(rect.height) : 1080;

    // Размер области отрисовки с учётом aspect ratio (letterbox)
    let cssW: number, cssH: number;
    if (containerW / containerH > aspect) {
      cssH = containerH;
      cssW = Math.round(cssH * aspect);
    } else {
      cssW = containerW;
      cssH = Math.round(cssW / aspect);
    }

    // Буфер WebGPU: не больше 2× от нативного разрешения видео и не больше контейнера
    const maxBufferW = Math.min(videoW * 2, cssW);
    const maxBufferH = Math.min(videoH * 2, cssH);
    let tW: number, tH: number;
    if (maxBufferW / maxBufferH > aspect) {
      tH = maxBufferH; tW = Math.round(tH * aspect);
    } else {
      tW = maxBufferW; tH = Math.round(tW / aspect);
    }
    tW = Math.max(videoW, tW);
    tH = Math.max(videoH, tH);

    canvasEl.width  = tW;
    canvasEl.height = tH;
    canvasEl.style.width  = cssW + 'px';
    canvasEl.style.height = cssH + 'px';

    // ── Перехват: anime4k-webgpu создаёт GPUDevice и render-loop внутри,
    // но не предоставляет cleanup. Мы оборачиваем requestVideoFrameCallback
    // и navigator.gpu чтобы перехватить ресурсы и мочь убить их при stop.
    const origRVFC = videoEl.requestVideoFrameCallback.bind(videoEl);
    let latestRvfcId: number | null = null;
    videoEl.requestVideoFrameCallback = (cb: VideoFrameRequestCallback): number => {
      const wrapped: VideoFrameRequestCallback = (now, meta) => {
        if (_upscaleRenderStopped) return; // цепочка прервана
        cb(now, meta);
      };
      const id = origRVFC(wrapped);
      latestRvfcId = id;
      return id;
    };

    const navAny = navigator as any;
    const gpuAny = navAny.gpu;
    if (!gpuAny?.requestAdapter) throw new Error('WebGPU: navigator.gpu.requestAdapter is unavailable');

    const origRequestAdapter = gpuAny.requestAdapter.bind(gpuAny);
    gpuAny.requestAdapter = async (...args: any[]) => {
      const adapter = await origRequestAdapter(...args);
      if (!adapter) return adapter;
      const origRD = adapter.requestDevice.bind(adapter);
      adapter.requestDevice = async (...dArgs: any[]) => {
        const device = await origRD(...dArgs);
        _capturedGpuDevice = device;
        return device;
      };
      return adapter;
    };

    const ModeClass = upscaleModeMap[player.upscaleMode] ?? ModeB;
    try {
      upscaleLastError = '';
      await anime4kRender({
        video: videoEl,
        canvas: canvasEl,
        pipelineBuilder: (device: any, inputTexture: any) => {
          const native = { width: videoEl.videoWidth || videoW, height: videoEl.videoHeight || videoH };
          const target = { width: canvasEl.width, height: canvasEl.height };
          return [new ModeClass({ device, inputTexture, nativeDimensions: native, targetDimensions: target }) as any];
        },
      });

      // Восстанавливаем оригинальные методы
      videoEl.requestVideoFrameCallback = origRVFC;
      gpuAny.requestAdapter = origRequestAdapter;

      if (myRun !== upscaleRunId) {
        // Устаревший запуск — чистим
        _upscaleRenderStopped = true;
        if (latestRvfcId !== null) try { videoEl.cancelVideoFrameCallback(latestRvfcId); } catch {}
        if (_capturedGpuDevice) { try { _capturedGpuDevice.destroy?.(); } catch {} _capturedGpuDevice = null; }
        return;
      }

      upscaleStopFn = () => {
        _upscaleRenderStopped = true;
        if (latestRvfcId !== null) {
          try { videoEl.cancelVideoFrameCallback(latestRvfcId); } catch {}
        }
      };
      canvasEl.hidden = false;
      videoEl.classList.add('watch-page__video--hidden-for-upscale');
      debugCanvasRafTicks = 0;
    } catch (err) {
      // Восстанавливаем оригинальные методы при ошибке тоже
      videoEl.requestVideoFrameCallback = origRVFC;
      gpuAny.requestAdapter = origRequestAdapter;
      const msg = err instanceof Error ? err.message : String(err);
      upscaleLastError = msg || 'unknown';
      console.warn('[Anime4K]', err);
      stopUpscale();
    }
  }

  // ── Sync state ─────────────────────────────────────────────────────────────
  let isApplyingSync   = false;
  let applySyncTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSync: any = null;
  let preventAutoPause = false;
  let stallCheckTimer: ReturnType<typeof setInterval> | null = null;
  let origEpUrl        = '';
  let episodeLoadGen   = 0;

  /** Снимок комнатного playback до смены озвучки/серии — чтобы игнорировать sync_resume с устаревшим состоянием сервера (до changeEpisode). */
  type LobbyStaleSnap = { releaseId: string; sourceId: string; ep: number; dubberId: string };
  let lobbyStalePlaybackBeforeSwitch: LobbyStaleSnap | null = null;

  function lobbyCaptureStalePlaybackSnapshot(): void {
    if (!getCurrentRoomId()) {
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

  // ── Playback watchdog ─────────────────────────────────────────────────────
  // Catches silent HLS failures: manifest loads but segments never arrive,
  // so the video stays at 0:00 forever without any error event.
  // Retries indefinitely ("до талого") — only stops when video actually plays
  // or the user switches episode/source (generation counter changes).
  let wdTimer: ReturnType<typeof setTimeout> | null = null;
  let wdGen   = 0;   // incremented per applyVideoAndUI call — stale callbacks exit early
  const WD_DELAY_MS      = 5_000;  // ms without `playing` before first trigger
  const WD_RETRY_DELAY_MS = 4_000; // ms between subsequent retry attempts

  function wdClear() {
    if (wdTimer) { clearTimeout(wdTimer); wdTimer = null; }
  }

  const VOLUME_KEY = 'anixapp_player_volume';

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

  /** После seek/load: sync_ready на сервер (окно плеера без WS — через IPC в главное окно). */
  function notifyLobbyPlayerSyncedIfReady() {
    const el = (window as any).electron;
    if (el?.lobbyPlayerSynced) {
      el.lobbyPlayerSynced();
      return;
    }
    if (getCurrentRoomId()) {
      window.dispatchEvent(new CustomEvent('lobby:playerSynced'));
    }
  }

  function armLobbyPlayerSyncedOnce() {
    const el = (window as any).electron;
    if (el?.lobbyPlayerSynced && videoEl) {
      let fired = false;
      const onReady = () => {
        if (fired) return;
        fired = true;
        videoEl!.removeEventListener('seeked', onReady);
        videoEl!.removeEventListener('canplay', onReady);
        videoEl!.removeEventListener('playing', onReady);
        notifyLobbyPlayerSyncedIfReady();
      };
      videoEl.addEventListener('seeked', onReady);
      videoEl.addEventListener('canplay', onReady);
      videoEl.addEventListener('playing', onReady);
      return;
    }
    if (!getCurrentRoomId() || !videoEl) return;
    let fired = false;
    const onReady = () => {
      if (fired) return;
      fired = true;
      videoEl.removeEventListener('seeked', onReady);
      videoEl.removeEventListener('canplay', onReady);
      videoEl.removeEventListener('playing', onReady);
      notifyLobbyPlayerSyncedIfReady();
    };
    videoEl.addEventListener('seeked', onReady);
    videoEl.addEventListener('canplay', onReady);
    videoEl.addEventListener('playing', onReady);
  }

  function sendToLobby(action: 'play' | 'pause' | 'seek' | 'changeEpisode', ctOverride?: number) {
    if (isApplyingSync || !(window as any).electron?.sendPlayerState) return;
    const p = ctOverride !== undefined ? { ...getPlaybackPayload(), currentTime: ctOverride } : getPlaybackPayload();
    (window as any).electron.sendPlayerState({ action, playback: p });
  }

  // ── Video playback ─────────────────────────────────────────────────────────
  function applyVideoAndUI(
    pUrl: string, useVid: boolean, ep: number,
    titleStr: string, srcName: string, dubId: string,
    seekTime?: number, initialPaused?: boolean,
  ) {
    watchState.ep = ep; watchState.title = titleStr;
    watchState.sourceName = srcName; watchState.dubberId = dubId;

    // ── Watchdog bookkeeping ─────────────────────────────────────────────────
    wdClear();
    const myGen = ++wdGen;

    const qs = new URLSearchParams({ releaseId: watchState.releaseId, sourceId: watchState.sourceId, ep: String(ep), title: titleStr, sourceName: srcName });
    if (dubId) qs.set('dubberId', dubId);
    if (typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', `${window.location.pathname}?${qs}`);
    }

    player.playUrl  = pUrl;
    player.useVideo = useVid;
    if (!useVid) return;

    if (stallCheckTimer) { clearInterval(stallCheckTimer); stallCheckTimer = null; }
    const hlsInst = (videoEl as any)?._hls as Hls | undefined;
    if (hlsInst) { hlsInst.destroy(); (videoEl as any)._hls = undefined; }

    videoEl.hidden = false;
    if (iframeEl) iframeEl.hidden = true;
    videoEl.src = '';
    if (player.volume !== undefined) videoEl.volume = player.volume / 100;

    const doPlay = () => { if (!initialPaused) videoEl.play().catch(() => {}); };

    if (seekTime != null && seekTime > 0) {
      const restoreTime = () => {
        videoEl.currentTime = Math.min(seekTime, videoEl.duration || Infinity);
        if (initialPaused) videoEl.pause();
        sendToLobby('seek');
      };
      videoEl.addEventListener('loadeddata', restoreTime, { once: true });
      videoEl.addEventListener('canplay',    restoreTime, { once: true });
    }

    const fallback = () => {
      if (origEpUrl) applyVideoAndUI(origEpUrl, false, ep, titleStr, srcName, dubId);
    };

    if (isHlsUrl(pUrl) && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(pUrl);
      hls.attachMedia(videoEl);
      (videoEl as any)._hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        doPlay();
        // Restore playback rate after HLS loads
        if (player.playbackRate !== 1) videoEl.playbackRate = player.playbackRate;
      });
      let attempts = 0;
      let reResolveAttempts = 0;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && attempts++ < 3) {
          hls.recoverMediaError();
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && attempts < 3) {
          attempts++;
          hls.startLoad(); // try resume current URL first
        } else if (reResolveAttempts++ < 2) {
          // URL may have expired — re-resolve fresh direct link and restart
          const curEpUrl = origEpUrl;
          if (!curEpUrl) { fallback(); return; }
          const savedTime = videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : 0;
          const wasPaused = videoEl?.paused ?? false;
          resolveEpisodeUrlWithRetry(curEpUrl, false).then(res => {
            if (!res.useVideo || !res.playUrl) { fallback(); return; }
            player.availableQualities = res.qualityMap;
            player.currentQuality     = res.currentQuality;
            // Cleanly restart playback with new URL (applyVideoAndUI destroys existing HLS)
            applyVideoAndUI(res.playUrl, true, ep, titleStr, srcName, dubId, savedTime, wasPaused);
          }).catch(fallback);
        } else {
          fallback();
        }
      });
      let lastStall = -1;
      stallCheckTimer = setInterval(() => {
        if (videoEl.paused || videoEl.ended || videoEl.hidden) { lastStall = -1; return; }
        const ct = videoEl.currentTime;
        if (lastStall >= 0 && ct === lastStall) { try { hls.startLoad(ct); } catch {} }
        lastStall = ct;
      }, 5000);
    } else {
      videoEl.src = pUrl;
      doPlay();
    }

    videoEl.addEventListener('error', fallback, { once: true });

    // On first `playing`: cancel watchdog, record history
    videoEl.addEventListener('playing', () => {
      if (myGen === wdGen) wdClear();
      const rId = parseInt(watchState.releaseId, 10);
      const sId = parseInt(watchState.sourceId, 10);
      (window as any).anixApi?.history?.add?.(rId, sId, ep);
      (window as any).anixApi?.history?.markWatched?.(rId, sId, ep).catch?.(() => {});
    }, { once: true });

    // Watchdog: if video doesn't start within WD_DELAY_MS, keep re-resolving the URL
    // indefinitely ("до талого") until it succeeds. Only stops when:
    //   • video actually plays (playing event above clears wdTimer)
    //   • user navigates away (myGen !== wdGen exits the callback)
    if (!initialPaused) {
      const scheduleWd = (delay: number) => {
        wdTimer = setTimeout(async () => {
          wdTimer = null;
          if (myGen !== wdGen) return;                      // superseded by newer load
          if (!videoEl || videoEl.currentTime > 0) return; // already playing fine
          const embedUrl = origEpUrl;
          if (!embedUrl) return;
          try {
            const res = await resolveEpisodeUrlWithRetry(embedUrl, false, 3);
            if (myGen !== wdGen) return; // superseded while awaiting resolve
            if (res.useVideo && res.playUrl) {
              player.availableQualities = res.qualityMap;
              player.currentQuality     = res.currentQuality;
              // applyVideoAndUI increments wdGen and arms its own watchdog —
              // the retry loop continues naturally until video actually plays.
              applyVideoAndUI(res.playUrl, true, ep, titleStr, srcName, dubId);
            } else {
              // URL resolve failed — schedule another attempt after short delay
              if (myGen === wdGen) scheduleWd(WD_RETRY_DELAY_MS);
            }
          } catch {
            // Network error — schedule another attempt after short delay
            if (myGen === wdGen) scheduleWd(WD_RETRY_DELAY_MS);
          }
        }, delay);
      };
      scheduleWd(WD_DELAY_MS);
    }
  }

  function setOrigEpisodeUrl(rawUrl: string) {
    origEpUrl = stripKodikQueryParams(rawUrl.startsWith('http') ? rawUrl : `https:${rawUrl}`);
  }

  function loadEpisode(rId: number, sId: number, ep: number, titleStr: string, srcName: string, dubId: string, seekTime?: number, initialPaused?: boolean): Promise<void> {
    const api = (window as any).anixApi?.release;
    if (!api?.getEpisode) return Promise.resolve();
    const myGen = ++episodeLoadGen;
    return api.getEpisode(rId, sId, ep).then(async (res: any) => {
      if (myGen !== episodeLoadGen) return;
      const episode = res?.episode;
      if (!episode?.url) return;
      setOrigEpisodeUrl(episode.url);
      const { playUrl: pUrl, useVideo: uv, qualityMap, currentQuality: cq } = await resolveEpisodeUrlWithRetry(episode.url, episode.iframe);
      if (myGen !== episodeLoadGen) return;
      player.availableQualities = qualityMap;
      player.currentQuality = cq;
      applyVideoAndUI(pUrl, uv, ep, titleStr, srcName, dubId, seekTime, initialPaused);
    }).catch(() => {});
  }

  function goToEpisode(ep: number) {
    popoverType = null;
    invalidateDubbersPickerCache();
    if (getCurrentRoomId()) {
      lobbyCaptureStalePlaybackSnapshot();
      const elE = (window as any).electron;
      if (elE?.lobbyNotifyBufferingStart) elE.lobbyNotifyBufferingStart();
    }
    watchState.ep = ep;
    loadEpisode(parseInt(watchState.releaseId, 10), parseInt(watchState.sourceId, 10), ep, watchState.title, watchState.sourceName, watchState.dubberId);
    sendToLobby('changeEpisode', 0);
  }

  /** @param episodeOverride — если задан и отличается от текущей серии, воспроизведение с начала новой серии */
  function switchDubbing(newSourceId: number, newSourceName: string, newDubberId: number, newDubberName: string, episodeOverride?: number) {
    popoverType = null;
    if (getCurrentRoomId()) lobbyCaptureStalePlaybackSnapshot();
    const targetEp = episodeOverride !== undefined ? episodeOverride : watchState.ep;
    const switchingEpisode = episodeOverride !== undefined && episodeOverride !== watchState.ep;
    const savedTime = switchingEpisode ? undefined : (videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : undefined);
    const wasPaused = switchingEpisode ? false : !!(videoEl?.paused);
    watchState.sourceId = String(newSourceId);
    watchState.sourceName = newSourceName;
    watchState.dubberId = String(newDubberId);
    watchState.dubberName = newDubberName;
    const elE = (window as any).electron;
    if (elE?.lobbyNotifyBufferingStart) elE.lobbyNotifyBufferingStart();
    sendToLobby('changeEpisode');
    isApplyingSync = true;
    loadEpisode(parseInt(watchState.releaseId, 10), newSourceId, targetEp, watchState.title, newSourceName, String(newDubberId), savedTime, wasPaused)
      .then(() => fetchEpisodesSilently())
      .catch(() => {});
    if (applySyncTimer) clearTimeout(applySyncTimer);
    applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 4000);
  }

  function goToNextEpisodeInAltDub(alt: NonNullable<typeof nextEpAltDub>) {
    invalidateDubbersPickerCache();
    switchDubbing(alt.sourceId, alt.sourceName, alt.dubber.id, alt.dubber.name, alt.targetEp);
  }

  // ── Popover openers ────────────────────────────────────────────────────────
  async function fetchEpisodesSilently() {
    const dubIdNum = watchState.dubberId ? parseInt(watchState.dubberId, 10) : 0;
    if (!dubIdNum || !(window as any).anixApi?.release?.getEpisodes) return;
    try {
      const res = await (window as any).anixApi.release.getEpisodes(
        parseInt(watchState.releaseId, 10), dubIdNum, parseInt(watchState.sourceId, 10),
      );
      episodes = res?.episodes ?? [];
    } catch {}
  }

  async function openSeriesPopover() {
    if (popoverType === 'series') return; // already open — hover handles close
    popoverType = 'series';
    popoverLoading = true;
    await fetchEpisodesSilently();
    popoverLoading = false;
  }

  async function openDubbingPopover() {
    if (popoverType === 'dubbing') return; // already open — hover handles close
    popoverType = 'dubbing';
    const key = `${watchState.releaseId}:${watchState.ep}`;
    if (dubbersPickerCacheKey === key && dubbersPickerCache.length > 0) {
      dubbers = dubbersPickerCache;
      return;
    }
    popoverLoading = true;
    try {
      const rId = parseInt(watchState.releaseId, 10);
      const res = await (window as any).anixApi.release.getDubbers(rId);
      const all = (res?.types ?? []).filter((d: DubberItem) => !isDubberBlacklisted(d.name));
      dubbers = await filterDubbersForCurrentEp(all, rId, watchState.ep, watchState.dubberId);
      dubbersPickerCacheKey = key;
      dubbersPickerCache    = dubbers;
    } catch {}
    popoverLoading = false;
  }

  async function selectDubber(dubber: DubberItem) {
    if (String(dubber.id) === watchState.dubberId) return;
    try {
      const res = await (window as any).anixApi.release.getDubberSources(parseInt(watchState.releaseId, 10), dubber.id);
      const first = res?.sources?.[0];
      if (first) switchDubbing(first.id, first.name, dubber.id, dubber.name);
    } catch {}
  }

  // ── Player controls ────────────────────────────────────────────────────────
  function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) videoEl.play().catch(() => {});
    else videoEl.pause();
    showAndSchedule();
  }

  function onSeek(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const pct = (e.clientX - el.getBoundingClientRect().left) / el.offsetWidth;
    if (videoEl && !isNaN(videoEl.duration)) {
      videoEl.currentTime = pct * videoEl.duration;
      sendToLobby('seek');
    }
  }

  function onVolumeChange(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    player.volume = v;
    if (videoEl) videoEl.volume = v / 100;
    try { localStorage.setItem(VOLUME_KEY, String(Math.round(v))); } catch {}
  }

  function toggleMute() {
    player.muted = !player.muted;
    if (videoEl) videoEl.muted = player.muted;
  }

  function toggleFullscreen() {
    (window as any).electron?.togglePlayerFullScreen?.();
    player.isFullscreen = !player.isFullscreen;
  }

  function toggleUpscale() {
    if (!gpuAvailable) return;
    player.upscaleEnabled = !player.upscaleEnabled;
    (window as any).electron?.saveSettings?.({ upscaleEnabled: player.upscaleEnabled, upscaleMode: player.upscaleMode });
    if (player.upscaleEnabled) startUpscale(); else stopUpscale();
  }

  function changePlaybackRate(rate: number) {
    player.playbackRate = rate;
    if (videoEl) videoEl.playbackRate = rate;
  }

  function changeAspectRatio(aspect: string) {
    player.aspectRatio = aspect;
  }

  /** Switch to a different quality URL (e.g. "720", "480") — recreates HLS */
  async function changeQuality(quality: string) {
    const src = player.availableQualities[quality];
    if (!src || quality === player.currentQuality) return;

    const elE = (window as any).electron;
    if (elE?.lobbyNotifyBufferingStart) elE.lobbyNotifyBufferingStart();

    const savedTime    = videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : 0;
    const wasPaused    = videoEl?.paused ?? true;

    // Destroy existing HLS
    const hlsInst = (videoEl as any)?._hls as Hls | undefined;
    if (hlsInst) { hlsInst.destroy(); (videoEl as any)._hls = undefined; }

    player.currentQuality = quality;

    if (!videoEl) return;
    videoEl.src = '';

    const doPlay = () => {
      if (!wasPaused) videoEl.play().catch(() => {});
    };

    const restoreTime = () => {
      if (savedTime > 0) videoEl.currentTime = Math.min(savedTime, videoEl.duration || Infinity);
      if (wasPaused) videoEl.pause(); else doPlay();
    };

    if (isHlsUrl(src) && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(videoEl);
      (videoEl as any)._hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        restoreTime();
        if (player.playbackRate !== 1) videoEl.playbackRate = player.playbackRate;
        notifyLobbyPlayerSyncedIfReady();
      });
      // Перезапускаем апскейл после загрузки нового потока — размеры кадра могли измениться
      videoEl.addEventListener('loadedmetadata', () => {
        if (player.upscaleEnabled && gpuAvailable) startUpscale();
      }, { once: true });
    } else {
      videoEl.src = src;
      videoEl.addEventListener('loadeddata', (e) => {
        restoreTime();
        if (player.upscaleEnabled && gpuAvailable) startUpscale();
        notifyLobbyPlayerSyncedIfReady();
      }, { once: true });
      doPlay();
    }
  }

  function openSettingsPopover() {
    if (popoverType === 'settings') return;
    popoverType = 'settings';
  }

  function skipOpening() {
    if (videoEl && !isNaN(videoEl.duration)) {
      videoEl.currentTime = Math.min(videoEl.currentTime + 85, videoEl.duration);
      sendToLobby('seek');
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space' || e.key === ' ') {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      e.preventDefault();
      togglePlay();
    }
  }

  // ── Pending sync ───────────────────────────────────────────────────────────
  function applyPendingSync() {
    if (!pendingSync || !videoEl || videoEl.readyState < 2) return;
    const p = pendingSync; pendingSync = null;
    videoEl.currentTime = Math.min(typeof p.currentTime === 'number' ? p.currentTime : 0, videoEl.duration || Infinity);
    if (p.paused && !videoEl.paused)     { videoEl.pause(); preventAutoPause = true; }
    else if (!p.paused && videoEl.paused)  videoEl.play().catch(() => {});
    if (applySyncTimer) clearTimeout(applySyncTimer);
    applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 2000);
  }

  function doAutoPlay() {
    if (pendingSync) { applyPendingSync(); return; }
    if (preventAutoPause || isApplyingSync) return;
    videoEl?.play().catch(() => {});
  }

  // ── ResizeObserver + window resize: пересчёт апскейла при смене размера окна
  let ro: ResizeObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  let winResizeHandler: (() => void) | null = null;

  function scheduleUpscaleResize() {
    if (!player.upscaleEnabled || !gpuAvailable) return;
    if (!videoEl || videoEl.readyState < 1) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if (player.upscaleEnabled && videoEl?.readyState >= 1) startUpscale();
    }, 380);
  }

  function initResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    ro?.disconnect();
    ro = new ResizeObserver(() => scheduleUpscaleResize());
    const area = canvasEl?.parentElement;
    if (area) ro.observe(area);
    winResizeHandler = () => scheduleUpscaleResize();
    window.addEventListener('resize', winResizeHandler);
  }

  // ── onMount ────────────────────────────────────────────────────────────────
  onMount(() => {
    try {
      const stored = localStorage.getItem(VOLUME_KEY);
      const v = stored != null ? Number(stored) : NaN;
      if (!isNaN(v) && v >= 0 && v <= 100) player.volume = v;
    } catch {}

    if ((window as any).electron?.getSettings) {
      (window as any).electron.getSettings().then((s: any) => {
        player.debugOverlay = s?.playerDebugOverlay === true;
        if (gpuAvailable) {
          player.upscaleEnabled = s?.upscaleEnabled ?? false;
          player.upscaleMode    = s?.upscaleMode    ?? 15;
          if (player.upscaleEnabled && videoEl?.readyState >= 1) startUpscale();
        }
      }).catch(() => {});
    }

    if (!releaseId || !watchState.sourceId || !Number.isFinite(watchState.ep) || !(window as any).anixApi?.release?.getEpisode) {
      player.loadState = 'error';
      player.errorText = 'Неверные параметры просмотра.';
      return;
    }

    ;(window as any).anixApi.release.getEpisode(
      parseInt(releaseId, 10), parseInt(watchState.sourceId, 10), watchState.ep,
    ).then(async (res: any) => {
      const episode = res?.episode;
      if (!episode?.url) { player.loadState = 'error'; player.errorText = 'Серия недоступна.'; return; }
      setOrigEpisodeUrl(episode.url);
      const { playUrl: pUrl, useVideo: uv, qualityMap, currentQuality: cq } = await resolveEpisodeUrlWithRetry(episode.url, episode.iframe);
      player.availableQualities = qualityMap;
      player.currentQuality = cq;
      player.loadState = 'ready';
      await tick();
      applyVideoAndUI(pUrl, uv, watchState.ep, watchState.title, watchState.sourceName, watchState.dubberId);
      refreshDubberNameFromApi();
      fetchEpisodesSilently();

      if (uv) {
        videoEl.addEventListener('timeupdate', () => {
          player.currentTime = videoEl.currentTime;
          player.duration    = videoEl.duration || 0;
          player.bufferedEnd = videoEl.buffered.length ? videoEl.buffered.end(videoEl.buffered.length - 1) : 0;
        });
        videoEl.addEventListener('play',  () => { player.paused = false; sendToLobby('play'); });
        videoEl.addEventListener('pause', () => { player.paused = true;  sendToLobby('pause'); });
        videoEl.addEventListener('loadedmetadata', () => {
          player.duration = videoEl.duration || 0;
          try { (window as any).electron?.sendPlayerState?.(getPlaybackPayload()); } catch {}
          if (player.upscaleEnabled && gpuAvailable) startUpscale();
          if (pendingSync) applyPendingSync();
        });
        videoEl.addEventListener('canplay',    doAutoPlay, { once: true });
        videoEl.addEventListener('loadeddata', doAutoPlay, { once: true });
        setTimeout(doAutoPlay, 800);
        doAutoPlay();
        initResizeObserver();
      }
      showAndSchedule();
    }).catch(() => { player.loadState = 'error'; player.errorText = 'Ошибка загрузки серии.'; });

    const handlers: [string, EventListener][] = [
      ['anix:upscaleChanged', ((e: CustomEvent) => {
        const d = e.detail as any;
        if (typeof d.upscaleEnabled === 'boolean') player.upscaleEnabled = d.upscaleEnabled;
        if (typeof d.upscaleMode    === 'number')  player.upscaleMode    = d.upscaleMode;
        if (player.upscaleEnabled) startUpscale(); else stopUpscale();
      }) as EventListener],

      ['anix:playerDebugChanged', ((e: CustomEvent) => {
        const d = e.detail as { playerDebugOverlay?: boolean };
        if (typeof d?.playerDebugOverlay === 'boolean') player.debugOverlay = d.playerDebugOverlay;
      }) as EventListener],

      ['player:changeContent', ((e: CustomEvent) => {
        const p = e.detail as any;
        if (!p?.releaseId || !p.sourceId || !p.ep) return;
        watchState.releaseId  = p.releaseId;
        watchState.sourceId   = p.sourceId;
        watchState.ep         = parseInt(p.ep, 10);
        watchState.title      = p.title      || watchState.title;
        watchState.sourceName = p.sourceName || '';
        watchState.dubberId   = p.dubberId   || '';
        watchState.dubberName = p.dubberName != null && p.dubberName !== '' ? String(p.dubberName) : '';
        invalidateDubbersPickerCache();
        if (!watchState.dubberName && watchState.dubberId) refreshDubberNameFromApi();
        if (p.local) sendToLobby('changeEpisode', typeof p.currentTime === 'number' ? p.currentTime : 0);
        isApplyingSync = true;
        loadEpisode(parseInt(p.releaseId, 10), parseInt(p.sourceId, 10), parseInt(p.ep, 10), p.title || watchState.title, p.sourceName || '', p.dubberId || '', typeof p.currentTime === 'number' ? p.currentTime : undefined, !!p.paused)
          .then(() => fetchEpisodesSilently())
          .catch(() => {});
        if (applySyncTimer) clearTimeout(applySyncTimer);
        applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 4000);
        armLobbyPlayerSyncedOnce();
      }) as EventListener],

      ['player:applySync', ((e: CustomEvent) => {
        const p = e.detail as any;
        if (!p?.releaseId || !p.sourceId || !p.ep) return;
        isApplyingSync = true;
        const same = watchState.releaseId === p.releaseId && watchState.sourceId === p.sourceId && watchState.ep === Number(p.ep) && (watchState.dubberId || '') === (p.dubberId || '');
        if (same && videoEl && !videoEl.hidden && videoEl.readyState >= 2) {
          lobbyStalePlaybackBeforeSwitch = null;
          videoEl.currentTime = Math.min(typeof p.currentTime === 'number' ? p.currentTime : 0, videoEl.duration || Infinity);
          if (p.paused && !videoEl.paused)     { videoEl.pause(); preventAutoPause = true; }
          else if (!p.paused && videoEl.paused)  videoEl.play().catch(() => {});
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
          watchState.releaseId = p.releaseId; watchState.sourceId = p.sourceId;
          watchState.dubberName = p.dubberName != null && p.dubberName !== '' ? String(p.dubberName) : '';
          invalidateDubbersPickerCache();
          if (!watchState.dubberName && (p.dubberId || '')) refreshDubberNameFromApi();
          loadEpisode(parseInt(p.releaseId, 10), parseInt(p.sourceId, 10), parseInt(p.ep, 10), p.title || watchState.title, p.sourceName || watchState.sourceName, p.dubberId || '', typeof p.currentTime === 'number' ? p.currentTime : undefined, !!p.paused)
            .then(() => fetchEpisodesSilently())
            .catch(() => {});
        }
        if (applySyncTimer) clearTimeout(applySyncTimer);
        applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, pendingSync ? 3000 : 1500);
        armLobbyPlayerSyncedOnce();
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
        if (d.type === 'left') {
          lobby.participants = lobby.participants.filter(p => p.login !== d.login);
        }
      }) as EventListener],

      ['lobby:playerWaitingOverlay', ((e: CustomEvent) => {
        const d = e.detail as LobbyWaitOverlay;
        lobbyWaitOverlay = d ?? null;
      }) as EventListener],
    ];

    handlers.forEach(([evt, fn]) => window.addEventListener(evt, fn));
    window.addEventListener('keydown', onKeyDown);

    return () => {
      handlers.forEach(([evt, fn]) => window.removeEventListener(evt, fn));
      window.removeEventListener('keydown', onKeyDown);
      stopUpscale();
      ro?.disconnect();
      if (winResizeHandler) window.removeEventListener('resize', winResizeHandler);
      lobby.destroy();
      if (stallCheckTimer) clearInterval(stallCheckTimer);
      if (applySyncTimer)  clearTimeout(applySyncTimer);
      if (idleTimer)       clearTimeout(idleTimer);
      const hlsInst = (videoEl as any)?._hls as Hls | undefined;
      if (hlsInst) hlsInst.destroy();
    };
  });
</script>

<div class="view view-watch">
  <div
    class="watch-page watch-page--anidesk {!player.useVideo ? 'watch-page--iframe-mode' : ''}"
    class:watch-page--chrome-hidden={player.loadState === 'ready' && !player.overlayVisible}
    bind:this={playerWrapEl}
    onmousemove={showAndSchedule}
    onmouseleave={hideNow}
    role="presentation"
  >
    <div class="watch-page__player-wrap">

      {#if player.loadState === 'loading'}
        <div class="watch-page__player-loading">Загрузка…</div>
      {:else if player.loadState === 'error'}
        <div class="watch-page__player-error">{player.errorText}</div>
      {:else}

        <div class="watch-page__player-area">
          <!-- svelte-ignore a11y_missing_attribute -->
          <iframe
            bind:this={iframeEl}
            class="watch-page__iframe"
            src={!player.useVideo ? player.playUrl : ''}
            allow="autoplay; fullscreen"
            hidden={player.useVideo}
            title="Видео плеер"
          ></iframe>
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoEl}
            class="watch-page__video {player.aspectRatio !== 'auto' ? `watch-page__video--ratio watch-page__video--ratio-${player.aspectRatio.replace('/', '-')}` : ''}"
            playsinline
            crossorigin="anonymous"
            hidden={!player.useVideo}
          ></video>
          <canvas bind:this={canvasEl} class="watch-page__upscale-canvas" hidden></canvas>

          {#if lobbyWaitOverlay}
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

        <div class="watch-page__gui-overlay" class:watch-page__gui-overlay--hidden={!player.overlayVisible}>

          <!-- ── Top bar: prev | title | next ──────────────────────────── -->
          <TopBar
            ep={watchState.ep}
            title={watchState.title}
            dubberName={watchState.dubberName}
            sourceName={watchState.sourceName}
            useVideo={player.useVideo}
            {hasPrevEp}
            {hasNextEp}
            {nextEpAltDub}
            {currentDubLabel}
            onprevEp={() => goToEpisode(watchState.ep - 1)}
            onnextEp={() => goToEpisode(watchState.ep + 1)}
            onnextAltDub={goToNextEpisodeInAltDub}
          />

          <!-- ── Tap layer (fills middle) ───────────────────────────────── -->
          <div
            class="watch-page__tap-layer"
            role="button"
            tabindex="0"
            onclick={togglePlay}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                togglePlay();
              }
            }}
          ></div>

          <!-- ── Lobby panel (absolute) ─────────────────────────────────── -->
          <LobbyPanel participants={lobby.participants} activityLog={lobby.activityLog} />

          <!-- ── Center play button (absolute) ─────────────────────────── -->
          <CenterPlay
            paused={player.paused}
            onplay={() => videoEl?.play().catch(() => {})}
          />

          <!-- ── Bottom controls ────────────────────────────────────────── -->
          <div class="watch-page__bottom-controls">
            <ControlsBar
              currentTime={player.currentTimeDisplay}
              totalTime={player.totalTimeDisplay}
              progressPct={player.progressPct}
              bufferedPct={player.bufferedPct}
              onseek={onSeek}
            />
            <ActionsBar
              paused={player.paused}
              muted={player.muted}
              volume={player.volume}
              isFullscreen={player.isFullscreen}
              {episodes}
              {dubbers}
              currentEp={watchState.ep}
              currentDubberId={watchState.dubberId}
              {popoverType}
              {popoverLoading}
              useVideo={player.useVideo}
              {gpuAvailable}
              upscaleEnabled={player.upscaleEnabled}
              playbackRate={player.playbackRate}
              aspectRatio={player.aspectRatio}
              availableQualities={player.availableQualities}
              currentQuality={player.currentQuality}
              ontogglePlay={togglePlay}
              ontoggleMute={toggleMute}
              onvolumechange={onVolumeChange}
              ontoggleUpscale={toggleUpscale}
              onskipOpening={skipOpening}
              onopenSeries={openSeriesPopover}
              onopenDubbing={openDubbingPopover}
              onopenSettings={openSettingsPopover}
              onselectEp={goToEpisode}
              onselectDub={selectDubber}
              onclosePopover={() => popoverType = null}
              onfullscreen={toggleFullscreen}
              onchangeRate={changePlaybackRate}
              onchangeAspect={changeAspectRatio}
              onchangeQuality={changeQuality}
            />
          </div>

        </div>

        {#if player.debugOverlay && player.useVideo}
          <pre class="watch-page__debug-hud">{debugHudText}</pre>
        {/if}

      {/if}
    </div>

    <LobbyVote
      status={lobby.voteState}
      proposal={lobby.voteProposal}
      waitingTitle={lobby.waitingTitle}
      resultText={lobby.resultText}
      resultType={lobby.resultType}
      onvote={(id, accept) => lobby.handleVote(id, accept)}
    />

  </div>
</div>
