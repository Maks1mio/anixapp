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
  import type { WatchState, EpisodeItem, DubberItem, LobbyActivityEntry } from './_types';
  import { isHlsUrl, stripKodikQueryParams, resolveEpisodeUrl } from './_utils';
  import { PlayerState } from './_usePlayer.svelte';
  import { LobbyState }  from './_useLobby.svelte';
  import LobbyPanel      from './components/LobbyPanel.svelte';
  import LobbyVote       from './components/LobbyVote.svelte';
  import ControlsBar     from './components/ControlsBar.svelte';
  import ActionsBar      from './components/ActionsBar.svelte';

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
    dubberId:   initialDubId,
  });

  // ── Popovers ───────────────────────────────────────────────────────────────
  let popoverType    = $state<'series' | 'dubbing' | null>(null);
  let popoverLoading = $state(false);
  let episodes       = $state<EpisodeItem[]>([]);
  let dubbers        = $state<DubberItem[]>([]);

  // ── Episode nav derived ────────────────────────────────────────────────────
  const hasNextEp = $derived(
    episodes.length === 0 || episodes.some(e => e.position === watchState.ep + 1),
  );
  const hasPrevEp = $derived(
    watchState.ep > 1 && (episodes.length === 0 || episodes.some(e => e.position === watchState.ep - 1)),
  );

  // ── DOM refs ───────────────────────────────────────────────────────────────
  let playerWrapEl: HTMLElement;
  let videoEl: HTMLVideoElement;
  let canvasEl: HTMLCanvasElement;
  let iframeEl: HTMLIFrameElement;

  // ── Overlay idle-hide ──────────────────────────────────────────────────────
  const IDLE_MS = 3000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function showOverlay() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    player.overlayVisible = true;
  }
  function scheduleHide() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { player.overlayVisible = false; idleTimer = null; }, IDLE_MS);
  }
  function showAndSchedule() { showOverlay(); scheduleHide(); }

  // ── Upscale ────────────────────────────────────────────────────────────────
  const gpuAvailable = typeof navigator !== 'undefined' && typeof (navigator as any).gpu !== 'undefined';
  let upscaleStopFn: (() => void) | null = null;

  const upscaleModeMap: Record<number, any> = {
    0: DoG, 1: BilateralMean, 2: CNNM, 3: CNNSoftM, 4: CNNSoftVL,
    5: CNNVL, 6: CNNUL, 7: GANUUL,
    8: CNNx2M, 9: CNNx2VL, 10: DenoiseCNNx2VL, 11: CNNx2UL, 12: GANx3L, 13: GANx4UUL,
    14: ModeA, 15: ModeB, 16: ModeC, 17: ModeAA, 18: ModeBB, 19: ModeCA,
  };

  function stopUpscale() {
    if (upscaleStopFn) { try { upscaleStopFn(); } catch {} upscaleStopFn = null; }
    if (canvasEl) canvasEl.hidden = true;
    videoEl?.classList.remove('watch-page__video--hidden-for-upscale');
  }

  async function startUpscale() {
    if (!gpuAvailable || !player.upscaleEnabled || !canvasEl || !videoEl) return;
    stopUpscale();
    if (videoEl.readyState < 1) return;

    const videoW = videoEl.videoWidth  || videoEl.clientWidth  || 1920;
    const videoH = videoEl.videoHeight || videoEl.clientHeight || 1080;
    const aspect = videoW / videoH;
    const rect   = canvasEl.parentElement?.getBoundingClientRect();
    const dpr    = window.devicePixelRatio || 1;
    const dispW  = rect ? Math.round(rect.width  * dpr) : videoW;
    const dispH  = rect ? Math.round(rect.height * dpr) : videoH;

    let tW: number, tH: number;
    if (dispW / dispH > aspect) { tH = dispH; tW = Math.round(tH * aspect); }
    else                        { tW = dispW; tH = Math.round(tW / aspect); }
    tW = Math.max(videoW, tW);
    tH = Math.max(videoH, tH);

    canvasEl.width = tW; canvasEl.height = tH;

    const ModeClass = upscaleModeMap[player.upscaleMode] ?? ModeB;
    try {
      const stop = await anime4kRender({
        video: videoEl,
        canvas: canvasEl,
        pipelineBuilder: (device: GPUDevice, inputTexture: GPUTexture) => {
          const native = { width: videoEl.videoWidth || videoW, height: videoEl.videoHeight || videoH };
          const target = { width: canvasEl.width, height: canvasEl.height };
          return [new ModeClass({ device, inputTexture, nativeDimensions: native, targetDimensions: target }) as any];
        },
      });
      upscaleStopFn = stop as () => void;
      canvasEl.hidden = false;
      videoEl.classList.add('watch-page__video--hidden-for-upscale');
    } catch (err) {
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

  const VOLUME_KEY = 'anixapp_player_volume';

  function getPlaybackPayload() {
    return {
      releaseId:   watchState.releaseId,
      sourceId:    watchState.sourceId,
      ep:          String(watchState.ep),
      dubberId:    watchState.dubberId || undefined,
      title:       watchState.title,
      sourceName:  watchState.sourceName,
      paused:      videoEl ? videoEl.paused : true,
      currentTime: videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : 0,
      duration:    videoEl && isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : undefined,
    };
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
      hls.on(Hls.Events.MANIFEST_PARSED, () => doPlay());
      let attempts = 0;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && attempts++ < 3) hls.recoverMediaError();
          else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && attempts++ < 3) hls.startLoad();
          else fallback();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
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
    videoEl.addEventListener('playing', () => {
      const rId = parseInt(watchState.releaseId, 10);
      const sId = parseInt(watchState.sourceId, 10);
      (window as any).anixApi?.history?.add?.(rId, sId, ep);
      (window as any).anixApi?.history?.markWatched?.(rId, sId, ep).catch?.(() => {});
    }, { once: true });
  }

  function loadEpisode(rId: number, sId: number, ep: number, titleStr: string, srcName: string, dubId: string, seekTime?: number, initialPaused?: boolean) {
    if (!(window as any).anixApi?.release?.getEpisode) return;
    (window as any).anixApi.release.getEpisode(rId, sId, ep).then(async (res: any) => {
      const episode = res?.episode;
      if (!episode?.url) return;
      const { playUrl: pUrl, useVideo: uv } = await resolveEpisodeUrl(episode.url, episode.iframe);
      applyVideoAndUI(pUrl, uv, ep, titleStr, srcName, dubId, seekTime, initialPaused);
    }).catch(() => {});
  }

  function goToEpisode(ep: number) {
    popoverType = null;
    watchState.ep = ep;
    loadEpisode(parseInt(watchState.releaseId, 10), parseInt(watchState.sourceId, 10), ep, watchState.title, watchState.sourceName, watchState.dubberId);
    sendToLobby('changeEpisode', 0);
  }

  function switchDubbing(newSourceId: number, newSourceName: string, newDubberId: number) {
    popoverType = null;
    const savedTime = videoEl && !isNaN(videoEl.currentTime) ? videoEl.currentTime : undefined;
    const wasPaused = !!(videoEl?.paused);
    watchState.sourceId = String(newSourceId);
    watchState.sourceName = newSourceName;
    watchState.dubberId = String(newDubberId);
    sendToLobby('changeEpisode');
    isApplyingSync = true;
    loadEpisode(parseInt(watchState.releaseId, 10), newSourceId, watchState.ep, watchState.title, newSourceName, String(newDubberId), savedTime, wasPaused);
    if (applySyncTimer) clearTimeout(applySyncTimer);
    applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 4000);
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
    if (popoverType === 'series') { popoverType = null; return; }
    popoverType = 'series';
    if (episodes.length === 0) {
      popoverLoading = true;
      await fetchEpisodesSilently();
      popoverLoading = false;
    }
  }

  async function openDubbingPopover() {
    if (popoverType === 'dubbing') { popoverType = null; return; }
    popoverType = 'dubbing'; dubbers = []; popoverLoading = true;
    try {
      const res = await (window as any).anixApi.release.getDubbers(parseInt(watchState.releaseId, 10));
      dubbers = res?.types ?? [];
    } catch {}
    popoverLoading = false;
  }

  async function selectDubber(dubber: DubberItem) {
    if (String(dubber.id) === watchState.dubberId) return;
    try {
      const res = await (window as any).anixApi.release.getDubberSources(parseInt(watchState.releaseId, 10), dubber.id);
      const first = res?.sources?.[0];
      if (first) switchDubbing(first.id, first.name, dubber.id);
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

  // ── ResizeObserver for upscale ─────────────────────────────────────────────
  let ro: ResizeObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  function initResizeObserver() {
    if (!canvasEl?.parentElement || typeof ResizeObserver === 'undefined') return;
    ro = new ResizeObserver(() => {
      if (!player.upscaleEnabled || !upscaleStopFn) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { resizeTimer = null; if (player.upscaleEnabled) startUpscale(); }, 200);
    });
    ro.observe(canvasEl.parentElement);
  }

  // ── onMount ────────────────────────────────────────────────────────────────
  onMount(() => {
    try {
      const stored = localStorage.getItem(VOLUME_KEY);
      const v = stored != null ? Number(stored) : NaN;
      if (!isNaN(v) && v >= 0 && v <= 100) player.volume = v;
    } catch {}

    if (gpuAvailable && (window as any).electron?.getSettings) {
      (window as any).electron.getSettings().then((s: any) => {
        player.upscaleEnabled = s?.upscaleEnabled ?? false;
        player.upscaleMode    = s?.upscaleMode    ?? 15;
        if (player.upscaleEnabled && videoEl?.readyState >= 1) startUpscale();
      }).catch(() => {});
    }

    if (!releaseId || !watchState.sourceId || !watchState.ep || !(window as any).anixApi?.release?.getEpisode) {
      player.loadState = 'error';
      player.errorText = 'Неверные параметры просмотра.';
      return;
    }

    ;(window as any).anixApi.release.getEpisode(
      parseInt(releaseId, 10), parseInt(watchState.sourceId, 10), watchState.ep,
    ).then(async (res: any) => {
      const episode = res?.episode;
      if (!episode?.url) { player.loadState = 'error'; player.errorText = 'Серия недоступна.'; return; }
      origEpUrl = stripKodikQueryParams(episode.url.startsWith('http') ? episode.url : `https:${episode.url}`);
      const { playUrl: pUrl, useVideo: uv } = await resolveEpisodeUrl(episode.url, episode.iframe);
      player.loadState = 'ready';
      await tick();
      applyVideoAndUI(pUrl, uv, watchState.ep, watchState.title, watchState.sourceName, watchState.dubberId);
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

      ['player:changeContent', ((e: CustomEvent) => {
        const p = e.detail as any;
        if (!p?.releaseId || !p.sourceId || !p.ep) return;
        watchState.releaseId  = p.releaseId;
        watchState.sourceId   = p.sourceId;
        watchState.ep         = parseInt(p.ep, 10);
        watchState.title      = p.title      || watchState.title;
        watchState.sourceName = p.sourceName || '';
        watchState.dubberId   = p.dubberId   || '';
        if (p.local) sendToLobby('changeEpisode', typeof p.currentTime === 'number' ? p.currentTime : 0);
        isApplyingSync = true;
        loadEpisode(parseInt(p.releaseId, 10), parseInt(p.sourceId, 10), parseInt(p.ep, 10), p.title || watchState.title, p.sourceName || '', p.dubberId || '', typeof p.currentTime === 'number' ? p.currentTime : undefined, !!p.paused);
        if (applySyncTimer) clearTimeout(applySyncTimer);
        applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 4000);
      }) as EventListener],

      ['player:applySync', ((e: CustomEvent) => {
        const p = e.detail as any;
        if (!p?.releaseId || !p.sourceId || !p.ep) return;
        isApplyingSync = true;
        const same = watchState.releaseId === p.releaseId && watchState.sourceId === p.sourceId && watchState.ep === Number(p.ep) && (watchState.dubberId || '') === (p.dubberId || '');
        if (same && videoEl && !videoEl.hidden && videoEl.readyState >= 2) {
          videoEl.currentTime = Math.min(typeof p.currentTime === 'number' ? p.currentTime : 0, videoEl.duration || Infinity);
          if (p.paused && !videoEl.paused)     { videoEl.pause(); preventAutoPause = true; }
          else if (!p.paused && videoEl.paused)  videoEl.play().catch(() => {});
        } else if (same && videoEl && videoEl.readyState < 2) {
          pendingSync = p;
        } else if (!same) {
          watchState.releaseId = p.releaseId; watchState.sourceId = p.sourceId;
          loadEpisode(parseInt(p.releaseId, 10), parseInt(p.sourceId, 10), parseInt(p.ep, 10), p.title || watchState.title, p.sourceName || watchState.sourceName, p.dubberId || '', typeof p.currentTime === 'number' ? p.currentTime : undefined, !!p.paused);
        }
        if (applySyncTimer) clearTimeout(applySyncTimer);
        applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, pendingSync ? 3000 : 1500);
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
    ];

    handlers.forEach(([evt, fn]) => window.addEventListener(evt, fn));
    window.addEventListener('keydown', onKeyDown);

    return () => {
      handlers.forEach(([evt, fn]) => window.removeEventListener(evt, fn));
      window.removeEventListener('keydown', onKeyDown);
      stopUpscale();
      ro?.disconnect();
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
    bind:this={playerWrapEl}
    onmousemove={showAndSchedule}
    onmouseleave={scheduleHide}
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
          <video bind:this={videoEl} class="watch-page__video" playsinline hidden={!player.useVideo}></video>
          <canvas bind:this={canvasEl} class="watch-page__upscale-canvas" hidden></canvas>
        </div>

        <div class="watch-page__gui-overlay" class:watch-page__gui-overlay--hidden={!player.overlayVisible}>

          <!-- ── Top bar: prev | title | next ──────────────────────────── -->
          <div class="watch-page__top-bar">
            {#if hasPrevEp}
              <button
                type="button"
                class="watch-page__ep-nav"
                onclick={(e) => { e.stopPropagation(); goToEpisode(watchState.ep - 1); }}
              >
                <!-- Lucide: SkipBack -->
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="19 20 9 12 19 4 19 20"/>
                  <line x1="5" y1="19" x2="5" y2="5"/>
                </svg>
                Серия {watchState.ep - 1}
              </button>
            {:else}
              <div class="watch-page__ep-nav-placeholder"></div>
            {/if}

            <div class="watch-page__title-block">
              <h1 class="watch-page__title">{watchState.title}</h1>
              <div class="watch-page__title-meta">
                <span>{watchState.ep} Серия</span>
                {#if watchState.sourceName}
                  <span class="watch-page__title-sep"></span>
                  <span>{watchState.sourceName}</span>
                {/if}
              </div>
              {#if !player.useVideo}
                <p class="watch-page__dub-hint">Если не загружается — выберите другую озвучку.</p>
              {/if}
            </div>

            {#if hasNextEp}
              <button
                type="button"
                class="watch-page__ep-nav"
                onclick={(e) => { e.stopPropagation(); goToEpisode(watchState.ep + 1); }}
              >
                Серия {watchState.ep + 1}
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

          <!-- ── Tap layer (fills middle) ───────────────────────────────── -->
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div class="watch-page__tap-layer" onclick={togglePlay}></div>

          <!-- ── Lobby panel (absolute) ─────────────────────────────────── -->
          <LobbyPanel participants={lobby.participants} activityLog={lobby.activityLog} />

          <!-- ── Center play button (absolute) ─────────────────────────── -->
          <div class="watch-page__center-play" class:watch-page__center-play--hidden={!player.paused}>
            <button
              type="button"
              class="watch-page__center-play-btn"
              aria-label="Воспроизвести"
              onclick={() => videoEl?.play().catch(() => {})}
            >
              <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            </button>
          </div>

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
              ontogglePlay={togglePlay}
              ontoggleMute={toggleMute}
              onvolumechange={onVolumeChange}
              ontoggleUpscale={toggleUpscale}
              onskipOpening={skipOpening}
              onopenSeries={openSeriesPopover}
              onopenDubbing={openDubbingPopover}
              onselectEp={goToEpisode}
              onselectDub={selectDubber}
              onclosePopover={() => popoverType = null}
              onfullscreen={toggleFullscreen}
            />
          </div>

        </div>

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
