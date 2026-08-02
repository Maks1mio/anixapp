<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import Hls from 'hls.js';
  import { isHlsUrl } from '../../views/Watch/_utils';
  import type { VideoSegment } from '../../services/overview-overrides';
  import {
    formatTimeSec,
    renderOverviewVideo,
    saveOverviewSegments,
    segmentsTotalDuration,
    uploadOverviewSourceFromUrl,
    uploadOverviewSourceVideo,
  } from '../../services/overview-admin-api';
  import { resolveUploadUrl, junctionCrossfade, maxJunctionCrossfade, segmentDuration } from '../../services/overview-overrides';
  import {
    listDubberSources,
    listReleaseDubbers,
    resolveEpisodePlayback,
    type DubberOption,
    type EpisodePlayback,
    type SourceOption,
  } from '../../utils/episodeSource';
  import { setAdminToken } from '../../services/admin-api';
  import { getAnixbackOrigin, initAnixbackEndpoint } from '../../services/anixback-endpoint';
  import {
    buildMontageBeats,
    MONTAGE_CLIP_COUNT,
    MONTAGE_TOTAL_SEC,
  } from '../../utils/heroMontage';

  export interface OverviewEditorPayload {
    bannerId: number;
    releaseId: number | null;
    title: string;
    segments: VideoSegment[];
    sourceVideoUrl: string | null;
    adminToken: string;
    crossfade?: number;
  }

  type SourceMode = 'episode' | 'upload' | 'server';
  type DragKind =
    | 'playhead'
    | 'sel-start'
    | 'sel-end'
    | 'sel-move'
    | 'seg-start'
    | 'seg-end'
    | 'seg-move'
    | 'transition'
    | null;
  type PlaybackMode = 'idle' | 'preview';

  const HANDLE_HIT_PX = 14;
  const MIN_SEG_DUR = 0.25;
  const MIN_VIEW_SPAN = 1.5;
  const ZOOM_WHEEL_FACTOR = 1.14;

  const HLS_OPTS: Partial<Hls['config']> = {
    enableWorker: true,
    startFragPrefetch: true,
    maxBufferLength: 40,
    maxMaxBufferLength: 80,
    backBufferLength: 30,
  };

  let payload = $state<OverviewEditorPayload | null>(null);
  let loadState = $state<'loading' | 'ready' | 'error'>('loading');
  let loadError = $state('');

  let sourceMode = $state<SourceMode>('episode');
  let dubbers = $state<DubberOption[]>([]);
  let sources = $state<SourceOption[]>([]);
  let selectedDubberId = $state<number | null>(null);
  let selectedSourceId = $state<number | null>(null);
  let episodePlayback = $state<EpisodePlayback | null>(null);
  let localFileUrl = $state<string | null>(null);
  let localFile: File | null = null;
  let serverSourceUrl = $state<string | null>(null);

  let segments = $state<VideoSegment[]>([]);
  let crossfade = $state(0.5);
  let fadeIn = $state(false);
  let fadeOut = $state(false);
  let randomCount = $state(MONTAGE_CLIP_COUNT);
  let randomMinLen = $state(MONTAGE_TOTAL_SEC / MONTAGE_CLIP_COUNT);
  let randomMaxLen = $state(MONTAGE_TOTAL_SEC / MONTAGE_CLIP_COUNT + 1);

  let videoEl = $state<HTMLVideoElement | null>(null);
  let videoElB = $state<HTMLVideoElement | null>(null);
  let trackEl = $state<HTMLDivElement | null>(null);
  let previewTimelineEl = $state<HTMLDivElement | null>(null);
  let duration = $state(0);
  let currentTime = $state(0);
  let selStart = $state(0);
  let selEnd = $state(10);
  let thumbs = $state<string[]>([]);
  let busy = $state(false);
  let statusMsg = $state('');

  let sourceLoading = $state(false);
  let buildingFilmstrip = $state(false);
  let videoReady = $state(false);
  let loadProgress = $state('');

  let playbackMode = $state<PlaybackMode>('idle');
  let previewSegIndex = $state(0);
  let previewPlaying = $state(false);
  let previewMontageTime = $state(0);
  let previewOpacityA = $state(1);
  let previewOpacityB = $state(0);
  let previewPausedElapsed = 0;
  let previewClockStart = 0;
  let currentSourceUrl = '';

  let activeSegIndex = $state<number | null>(null);
  let dragKind: DragKind = null;
  let dragAnchorTime = 0;
  let dragAnchorStart = 0;
  let dragAnchorEnd = 0;
  let dragSegIndex = -1;
  let transitionDragIndex = -1;
  let transitionDragStartX = 0;
  let transitionDragStartCf = 0;
  let activeTransitionIndex = $state<number | null>(null);
  let dragTooltipTime = $state<number | null>(null);
  let previewRaf: number | null = null;
  let hls: Hls | null = null;
  let hlsB: Hls | null = null;

  let viewStart = $state(0);
  let viewSpan = $state(0);

  const editorLocked = $derived(sourceLoading || buildingFilmstrip || !videoReady);
  const resultDuration = $derived(segmentsTotalDuration(segments, crossfade));
  const timelineZoom = $derived(viewSpan > 0 && duration > 0 ? duration / viewSpan : 1);
  const filmstripLeftPct = $derived(viewSpan > 0 ? -(viewStart / viewSpan) * 100 : 0);
  const filmstripWidthPct = $derived(viewSpan > 0 && duration > 0 ? (duration / viewSpan) * 100 : 100);
  const selLeftPct = $derived(timeToViewPct(selStart));
  const selWidthPct = $derived(viewSpan > 0 ? ((selEnd - selStart) / viewSpan) * 100 : 0);
  const playheadPct = $derived(timeToViewPct(currentTime));

  function destroyHls() {
    hls?.destroy();
    hls = null;
  }

  function destroyHlsB() {
    hlsB?.destroy();
    hlsB = null;
  }

  async function attachMediaToVideo(
    video: HTMLVideoElement,
    url: string,
    existing: Hls | null
  ): Promise<Hls | null> {
    existing?.destroy();
    if (isFilmstripSafeSource(url)) {
      video.crossOrigin = 'anonymous';
    } else {
      video.removeAttribute('crossorigin');
    }
    if (isHlsUrl(url) && Hls.isSupported()) {
      const instance = new Hls(HLS_OPTS);
      instance.loadSource(url);
      instance.attachMedia(video);
      await new Promise<void>((resolve, reject) => {
        const onReady = () => resolve();
        instance.on(Hls.Events.MANIFEST_PARSED, onReady);
        instance.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) instance.recoverMediaError();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            instance.recoverMediaError();
            return;
          }
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            instance.startLoad();
            return;
          }
          reject(new Error('HLS error'));
        });
      });
      await waitCanPlayThrough(video);
      return instance;
    }
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('video load failed'));
    });
    await waitCanPlayThrough(video);
    return null;
  }

  function waitCanPlayThrough(video: HTMLVideoElement, timeoutMs = 20000): Promise<void> {
    if (video.readyState >= 3) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener('canplaythrough', done);
        video.removeEventListener('canplay', done);
        video.removeEventListener('loadeddata', done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      video.addEventListener('canplaythrough', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
      video.addEventListener('loadeddata', done, { once: true });
    });
  }

  async function primeVideoFrame(video: HTMLVideoElement) {
    const target = Math.min(0.15, Math.max(0, (video.duration || 10) * 0.001));
    try {
      video.pause();
      video.currentTime = target;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked, { once: true });
        setTimeout(resolve, 2000);
      });
      await video.play();
      await new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()));
      });
      video.pause();
      currentTime = video.currentTime;
    } catch {
      currentTime = video.currentTime;
    }
  }

  async function attachVideoSource(url: string) {
    if (!videoEl) await tick();
    if (!videoEl) throw new Error('Видеоплеер не готов');
    sourceLoading = true;
    videoReady = false;
    buildingFilmstrip = false;
    stopPreview();
    loadProgress = 'Подключение…';
    currentSourceUrl = url;

    destroyHls();
    destroyHlsB();
    if (isHlsUrl(url) && Hls.isSupported()) {
      hls = await attachMediaToVideo(videoEl, url, null);
      loadProgress = 'Буферизация серии…';
    } else {
      if (isFilmstripSafeSource(url)) {
        videoEl.crossOrigin = 'anonymous';
      } else {
        videoEl.removeAttribute('crossorigin');
      }
      videoEl.src = url;
      loadProgress = 'Загрузка файла…';
      await new Promise<void>((resolve, reject) => {
        videoEl!.onloadedmetadata = () => resolve();
        videoEl!.onerror = () => reject(new Error('video load failed'));
      });
      await waitCanPlayThrough(videoEl);
    }

    duration = videoEl.duration || 0;
    selEnd = Math.min(10, duration || 10);
    selStart = 0;
    viewStart = 0;
    viewSpan = duration;

    loadProgress = 'Подготовка кадра…';
    await primeVideoFrame(videoEl);

    videoReady = true;
    sourceLoading = false;
    loadProgress = '';

    buildingFilmstrip = true;
    try {
      await buildFilmstrip(url);
    } catch {
      thumbs = buildPlaceholderFilmstrip();
    }
    buildingFilmstrip = false;
  }

  function isFilmstripSafeSource(url: string): boolean {
    if (!url || url.startsWith('blob:')) return true;
    try {
      const origin = new URL(url).origin;
      if (origin === window.location.origin) return true;
      if (origin === new URL(getAnixbackOrigin()).origin) return true;
    } catch {
      return false;
    }
    return false;
  }

  function buildPlaceholderFilmstrip(count = 14): string[] {
    const out: string[] = [];
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    if (!ctx) return out;
    for (let i = 0; i < count; i++) {
      const hue = (i * 17) % 360;
      const g = ctx.createLinearGradient(0, 0, 160, 90);
      g.addColorStop(0, `hsl(${hue} 28% 14%)`);
      g.addColorStop(1, `hsl(${(hue + 36) % 360} 24% 20%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 160, 90);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, 54, 160, 36);
      out.push(canvas.toDataURL('image/jpeg', 0.55));
    }
    return out;
  }

  async function buildFilmstrip(sourceUrl: string) {
    if (!videoEl || !duration) return;
    const count = 14;
    if (!isFilmstripSafeSource(sourceUrl)) {
      thumbs = buildPlaceholderFilmstrip(count);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      thumbs = buildPlaceholderFilmstrip(count);
      return;
    }

    const out: string[] = [];
    const wasPaused = videoEl.paused;
    const saved = videoEl.currentTime;
    let tainted = false;

    for (let i = 0; i < count; i++) {
      if (tainted) {
        out.push(buildPlaceholderFilmstrip(1)[0]!);
        continue;
      }
      const t = (duration / count) * i;
      videoEl.currentTime = t;
      await new Promise<void>((r) => { videoEl!.onseeked = () => r(); });
      try {
        ctx.drawImage(videoEl, 0, 0, 160, 90);
        out.push(canvas.toDataURL('image/jpeg', 0.55));
      } catch {
        tainted = true;
        out.push(buildPlaceholderFilmstrip(1)[0]!);
      }
    }

    videoEl.currentTime = saved;
    if (!wasPaused && playbackMode === 'idle') void videoEl.play();
    thumbs = out;
  }

  function smoothstep(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  function montageTimeAt(segIndex: number, sourceTime: number): number {
    let t = 0;
    for (let i = 0; i < segIndex; i++) {
      t += segmentDuration(segments[i]!);
      t -= junctionCrossfade(segments[i]!, crossfade);
    }
    const seg = segments[segIndex];
    if (seg) t += Math.max(0, sourceTime - seg.start);
    return Math.max(0, t);
  }

  function montageStarts(): number[] {
    const starts = [0];
    for (let i = 0; i < segments.length - 1; i++) {
      starts.push(
        starts[i]! + segmentDuration(segments[i]!) - junctionCrossfade(segments[i]!, crossfade)
      );
    }
    return starts;
  }

  interface PreviewMixState {
    montageTime: number;
    segA: number;
    segB: number | null;
    timeA: number;
    timeB: number | null;
    opacityA: number;
    opacityB: number;
  }

  function computePreviewMix(elapsed: number): PreviewMixState {
    const starts = montageStarts();
    const e = Math.max(0, Math.min(elapsed, resultDuration));

    for (let i = 0; i < segments.length - 1; i++) {
      const cf = junctionCrossfade(segments[i]!, crossfade);
      if (cf <= 0) continue;
      const overlapStart = starts[i]! + segmentDuration(segments[i]!) - cf;
      const overlapEnd = overlapStart + cf;
      if (e >= overlapStart && e < overlapEnd) {
        const p = smoothstep((e - overlapStart) / cf);
        const segA = segments[i]!;
        const segB = segments[i + 1]!;
        return {
          montageTime: e,
          segA: i,
          segB: i + 1,
          timeA: segA.start + (e - starts[i]!),
          timeB: segB.start + (e - starts[i + 1]!),
          opacityA: 1 - p,
          opacityB: p,
        };
      }
    }

    let solo = 0;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (e >= starts[i]!) {
        solo = i;
        break;
      }
    }
    const seg = segments[solo]!;
    return {
      montageTime: e,
      segA: solo,
      segB: null,
      timeA: seg.start + (e - starts[solo]!),
      timeB: null,
      opacityA: 1,
      opacityB: 0,
    };
  }

  function applyPreviewMix(mix: PreviewMixState) {
    previewMontageTime = mix.montageTime;
    previewSegIndex = mix.segB != null && mix.opacityB >= mix.opacityA ? mix.segB : mix.segA;
    currentTime = mix.segB != null && mix.opacityB >= mix.opacityA ? mix.timeB! : mix.timeA;
    previewOpacityA = mix.opacityA;
    previewOpacityB = mix.opacityB;

    const drive = (video: HTMLVideoElement | null, time: number, opacity: number) => {
      if (!video) return;
      if (opacity > 0.02) {
        if (Math.abs(video.currentTime - time) > 0.15) video.currentTime = time;
        video.volume = Math.min(1, opacity);
        video.muted = opacity < 0.04;
        if (previewPlaying && video.paused) void video.play().catch(() => {});
      } else {
        video.muted = true;
        video.volume = 0;
        if (!video.paused) video.pause();
      }
    };

    if (mix.segB != null && mix.timeB != null) {
      drive(videoEl, mix.timeA, mix.opacityA);
      drive(videoElB, mix.timeB, mix.opacityB);
    } else {
      drive(videoEl, mix.timeA, 1);
      drive(videoElB, 0, 0);
    }
  }

  function stopPreviewRaf() {
    if (previewRaf != null) cancelAnimationFrame(previewRaf);
    previewRaf = null;
  }

  function tickPreview() {
    if (playbackMode !== 'preview') return;
    const elapsed = previewPlaying
      ? (performance.now() - previewClockStart) / 1000
      : previewPausedElapsed;
    if (elapsed >= resultDuration - 0.02) {
      stopPreview();
      return;
    }
    applyPreviewMix(computePreviewMix(elapsed));

    if (previewPlaying && videoElB) {
      const starts = montageStarts();
      for (let i = 0; i < segments.length - 1; i++) {
        const cf = junctionCrossfade(segments[i]!, crossfade);
        if (cf <= 0) continue;
        const overlapStart = starts[i]! + segmentDuration(segments[i]!) - cf;
        if (elapsed >= overlapStart - 0.45 && elapsed < overlapStart) {
          const next = segments[i + 1]!;
          if (Math.abs(videoElB.currentTime - next.start) > 0.1) {
            videoElB.currentTime = next.start;
          }
          break;
        }
      }
    }

    if (previewPlaying) previewRaf = requestAnimationFrame(tickPreview);
  }

  async function ensurePreviewVideoB() {
    if (!videoElB || !currentSourceUrl) return;
    destroyHlsB();
    hlsB = await attachMediaToVideo(videoElB, currentSourceUrl, null);
  }

  function onVideoTimeUpdate() {
    if (!videoEl || playbackMode === 'preview') return;
    currentTime = videoEl.currentTime;
  }

  async function loadEpisodeOptions() {
    if (!payload?.releaseId) return;
    dubbers = await listReleaseDubbers(payload.releaseId);
    if (dubbers.length === 0) throw new Error('Нет озвучек для этого релиза');
    selectedDubberId = dubbers[0]!.id;
    await onDubberChange();
  }

  async function onDubberChange() {
    if (!payload?.releaseId || !selectedDubberId) return;
    sources = await listDubberSources(payload.releaseId, selectedDubberId);
    selectedSourceId = sources[0]?.id ?? null;
    await loadEpisodeVideo();
  }

  async function loadEpisodeVideo() {
    if (!payload?.releaseId || !selectedDubberId || !selectedSourceId) return;
    statusMsg = 'Загрузка 1 серии…';
    episodePlayback = await resolveEpisodePlayback(
      payload.releaseId,
      selectedDubberId,
      selectedSourceId,
      1
    );
    if (!episodePlayback?.playUrl) throw new Error('Не удалось получить видео 1 серии');
    await attachVideoSource(episodePlayback.playUrl);
    statusMsg = `${episodePlayback.dubberName} · ${episodePlayback.sourceName}`;
  }

  async function onLocalFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (localFileUrl) URL.revokeObjectURL(localFileUrl);
    localFile = file;
    localFileUrl = URL.createObjectURL(file);
    sourceMode = 'upload';
    await attachVideoSource(localFileUrl);
    statusMsg = file.name;
  }

  function clampView() {
    if (!duration || viewSpan <= 0) return;
    viewSpan = Math.max(MIN_VIEW_SPAN, Math.min(duration, viewSpan));
    viewStart = Math.max(0, Math.min(viewStart, duration - viewSpan));
  }

  function timeToViewPct(t: number): number {
    if (!viewSpan) return 0;
    return ((t - viewStart) / viewSpan) * 100;
  }

  function resetTimelineZoom() {
    viewStart = 0;
    viewSpan = duration;
  }

  function zoomToRange(start: number, end: number, paddingRatio = 0.08) {
    if (!duration) return;
    const len = Math.max(MIN_VIEW_SPAN, end - start);
    const pad = len * paddingRatio;
    viewSpan = Math.min(duration, len + pad * 2);
    viewStart = Math.max(0, start - pad);
    if (viewStart + viewSpan > duration) viewStart = Math.max(0, duration - viewSpan);
    clampView();
  }

  function onTimelineWheel(e: WheelEvent) {
    if (editorLocked || !duration || !trackEl || viewSpan <= 0) return;
    e.preventDefault();

    const rect = trackEl.getBoundingClientRect();
    const mouseRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const timeAtMouse = viewStart + mouseRatio * viewSpan;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;

    if (e.shiftKey) {
      const panSec = (delta / 1000) * viewSpan * 18;
      viewStart += panSec;
      clampView();
      return;
    }

    const zoomFactor = delta < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
    let newSpan = viewSpan / zoomFactor;
    newSpan = Math.max(MIN_VIEW_SPAN, Math.min(duration, newSpan));
    let newStart = timeAtMouse - mouseRatio * newSpan;
    newStart = Math.max(0, Math.min(newStart, duration - newSpan));
    viewStart = newStart;
    viewSpan = newSpan;
  }

  function timeFromClientX(clientX: number): number {
    if (!trackEl || !duration || viewSpan <= 0) return 0;
    const rect = trackEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return viewStart + ratio * viewSpan;
  }

  function clampSegBounds(start: number, end: number): [number, number] {
    const len = Math.max(MIN_SEG_DUR, end - start);
    let s = Math.max(0, start);
    let e = Math.min(duration, s + len);
    if (e - s < MIN_SEG_DUR) s = Math.max(0, e - MIN_SEG_DUR);
    return [s, e];
  }

  function updateSegmentBounds(index: number, start: number, end: number) {
    const [s, e] = clampSegBounds(start, end);
    segments = segments.map((seg, i) => (i === index ? { ...seg, start: s, end: e } : seg));
    selStart = s;
    selEnd = e;
  }

  function sortSegments() {
    const ref = dragSegIndex >= 0 ? segments[dragSegIndex] : null;
    segments = [...segments].sort((a, b) => a.start - b.start);
    if (ref) {
      const idx = segments.findIndex((s) => s.start === ref.start && s.end === ref.end);
      if (idx >= 0) {
        activeSegIndex = idx;
        dragSegIndex = idx;
      }
    }
  }

  function selectSegment(index: number) {
    activeSegIndex = index;
    const seg = segments[index];
    if (seg) {
      selStart = seg.start;
      selEnd = seg.end;
      seek(seg.start);
    }
  }

  function clearSegmentSelection() {
    activeSegIndex = null;
  }

  function beginDrag(kind: DragKind, e: PointerEvent) {
    if (!trackEl) return;
    dragKind = kind;
    dragAnchorTime = timeFromClientX(e.clientX);
    dragAnchorStart = selStart;
    dragAnchorEnd = selEnd;
    trackEl.setPointerCapture(e.pointerId);
  }

  function onTrackPointerDown(e: PointerEvent) {
    if (editorLocked || !trackEl || !duration) return;
    if ((e.target as HTMLElement).closest(
      '.ove-timeline__handle, .ove-timeline__selection, .ove-timeline__fragment, .ove-timeline__frag-handle'
    )) return;

    stopPreview();
    clearSegmentSelection();
    beginDrag('playhead', e);
    seek(timeFromClientX(e.clientX));
  }

  function onSelStartDown(e: PointerEvent) {
    if (editorLocked) return;
    e.stopPropagation();
    stopPreview();
    clearSegmentSelection();
    beginDrag('sel-start', e);
    dragTooltipTime = selStart;
    seek(selStart);
  }

  function onSelEndDown(e: PointerEvent) {
    if (editorLocked) return;
    e.stopPropagation();
    stopPreview();
    clearSegmentSelection();
    beginDrag('sel-end', e);
    dragTooltipTime = selEnd;
    seek(selEnd);
  }

  function onSelMoveDown(e: PointerEvent) {
    if (editorLocked) return;
    e.stopPropagation();
    stopPreview();
    clearSegmentSelection();
    beginDrag('sel-move', e);
    dragAnchorStart = selStart;
    dragAnchorEnd = selEnd;
    dragTooltipTime = selStart;
  }

  function onSegEdgeDown(e: PointerEvent, index: number, edge: 'start' | 'end') {
    if (editorLocked) return;
    e.stopPropagation();
    stopPreview();
    selectSegment(index);
    const seg = segments[index];
    if (!seg) return;
    dragSegIndex = index;
    dragAnchorStart = seg.start;
    dragAnchorEnd = seg.end;
    beginDrag(edge === 'start' ? 'seg-start' : 'seg-end', e);
    dragTooltipTime = edge === 'start' ? seg.start : seg.end;
    seek(edge === 'start' ? seg.start : seg.end);
  }

  function onFragPointerDown(e: PointerEvent, index: number) {
    if (editorLocked) return;
    e.stopPropagation();
    stopPreview();
    selectSegment(index);
    const seg = segments[index];
    if (!seg || !trackEl) return;

    const rect = trackEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startPx = (timeToViewPct(seg.start) / 100) * rect.width;
    const endPx = (timeToViewPct(seg.end) / 100) * rect.width;

    dragSegIndex = index;
    dragAnchorStart = seg.start;
    dragAnchorEnd = seg.end;

    if (Math.abs(x - startPx) < HANDLE_HIT_PX) {
      beginDrag('seg-start', e);
      dragTooltipTime = seg.start;
      seek(seg.start);
    } else if (Math.abs(x - endPx) < HANDLE_HIT_PX) {
      beginDrag('seg-end', e);
      dragTooltipTime = seg.end;
      seek(seg.end);
    } else {
      beginDrag('seg-move', e);
      dragTooltipTime = seg.start;
    }
  }

  function onTrackPointerMove(e: PointerEvent) {
    if (!dragKind || !duration || editorLocked) return;
    const t = timeFromClientX(e.clientX);
    const dt = t - dragAnchorTime;

    if (dragKind === 'playhead') {
      seek(t);
      return;
    }

    if (dragKind === 'sel-start') {
      selStart = Math.max(0, Math.min(t, selEnd - MIN_SEG_DUR));
      dragTooltipTime = selStart;
      seek(selStart);
    } else if (dragKind === 'sel-end') {
      selEnd = Math.min(duration, Math.max(t, selStart + MIN_SEG_DUR));
      dragTooltipTime = selEnd;
      seek(selEnd);
    } else if (dragKind === 'sel-move') {
      const len = dragAnchorEnd - dragAnchorStart;
      let s = dragAnchorStart + dt;
      s = Math.max(0, Math.min(s, duration - len));
      selStart = s;
      selEnd = s + len;
      dragTooltipTime = selStart;
      seek(selStart);
    } else if (dragKind === 'seg-start' && dragSegIndex >= 0) {
      const end = dragAnchorEnd;
      const start = Math.max(0, Math.min(t, end - MIN_SEG_DUR));
      updateSegmentBounds(dragSegIndex, start, end);
      dragTooltipTime = start;
      seek(start);
    } else if (dragKind === 'seg-end' && dragSegIndex >= 0) {
      const start = dragAnchorStart;
      const end = Math.min(duration, Math.max(t, start + MIN_SEG_DUR));
      updateSegmentBounds(dragSegIndex, start, end);
      dragTooltipTime = end;
      seek(end);
    } else if (dragKind === 'seg-move' && dragSegIndex >= 0) {
      const len = dragAnchorEnd - dragAnchorStart;
      let s = dragAnchorStart + dt;
      s = Math.max(0, Math.min(s, duration - len));
      updateSegmentBounds(dragSegIndex, s, s + len);
      dragTooltipTime = s;
      seek(s);
    }
  }

  function onTrackPointerUp() {
    if (dragKind?.startsWith('seg-')) sortSegments();
    dragKind = null;
    dragSegIndex = -1;
    dragTooltipTime = null;
  }

  function setJunctionCrossfade(index: number, value: number) {
    const seg = segments[index];
    const next = segments[index + 1];
    if (!seg || !next) return;
    const cf = Math.max(0, Math.min(maxJunctionCrossfade(seg, next), value));
    segments = segments.map((s, i) => (i === index ? { ...s, crossfadeAfter: cf } : s));
  }

  function onTransitionPointerDown(e: PointerEvent, index: number) {
    if (editorLocked || !previewTimelineEl) return;
    e.stopPropagation();
    e.preventDefault();
    activeTransitionIndex = index;
    transitionDragIndex = index;
    transitionDragStartX = e.clientX;
    transitionDragStartCf = junctionCrossfade(segments[index]!, crossfade);
    previewTimelineEl.setPointerCapture(e.pointerId);
  }

  function onPreviewTimelineMove(e: PointerEvent) {
    if (transitionDragIndex < 0 || !previewTimelineEl) return;
    const rect = previewTimelineEl.getBoundingClientRect();
    const total = resultDuration;
    if (total <= 0) return;
    const dSec = ((e.clientX - transitionDragStartX) / rect.width) * total;
    setJunctionCrossfade(transitionDragIndex, transitionDragStartCf + dSec);
  }

  function onPreviewTimelineUp() {
    transitionDragIndex = -1;
  }

  interface MontageBlockLayout {
    index: number;
    leftPct: number;
    widthPct: number;
    zIndex: number;
  }

  interface MontageTransitionLayout {
    junctionIndex: number;
    leftPct: number;
    widthPct: number;
    crossfadeSec: number;
  }

  function buildMontageLayout(): { blocks: MontageBlockLayout[]; transitions: MontageTransitionLayout[] } {
    const total = resultDuration;
    if (total <= 0 || segments.length === 0) {
      return { blocks: [], transitions: [] };
    }

    const blocks: MontageBlockLayout[] = [];
    const transitions: MontageTransitionLayout[] = [];
    let cursor = 0;

    for (let i = 0; i < segments.length; i++) {
      const dur = segmentDuration(segments[i]!);
      const widthPct = (dur / total) * 100;
      blocks.push({ index: i, leftPct: cursor, widthPct, zIndex: i + 1 });

      if (i < segments.length - 1) {
        const cf = junctionCrossfade(segments[i]!, crossfade);
        const overlapPct = (cf / total) * 100;
        transitions.push({
          junctionIndex: i,
          leftPct: cursor + widthPct - overlapPct,
          widthPct: overlapPct,
          crossfadeSec: cf,
        });
        cursor += widthPct - overlapPct;
      } else {
        cursor += widthPct;
      }
    }

    return { blocks, transitions };
  }

  const montageLayout = $derived(buildMontageLayout());

  function segLeftPct(seg: VideoSegment): number {
    return timeToViewPct(seg.start);
  }

  function segWidthPct(seg: VideoSegment): number {
    return viewSpan > 0 ? ((seg.end - seg.start) / viewSpan) * 100 : 0;
  }

  function segOverlapExtendPct(index: number): number {
    if (index >= segments.length - 1 || viewSpan <= 0) return 0;
    const seg = segments[index]!;
    const next = segments[index + 1]!;
    const cf = Math.min(junctionCrossfade(seg, crossfade), segmentDuration(seg) / 2, segmentDuration(next) / 2);
    return (cf / viewSpan) * 100;
  }

  function seek(t: number) {
    if (!videoEl) return;
    videoEl.currentTime = t;
    currentTime = t;
    if (playbackMode === 'idle' && videoEl.paused) {
      void videoEl.play().then(() => {
        if (playbackMode === 'idle' && videoEl) videoEl.pause();
      }).catch(() => {});
    }
  }

  function stopPreview() {
    stopPreviewRaf();
    playbackMode = 'idle';
    previewPlaying = false;
    previewSegIndex = 0;
    previewMontageTime = 0;
    previewPausedElapsed = 0;
    previewOpacityA = 1;
    previewOpacityB = 0;
    videoEl?.pause();
    videoElB?.pause();
    if (videoEl) {
      videoEl.volume = 1;
      videoEl.muted = false;
    }
    if (videoElB) {
      videoElB.volume = 0;
      videoElB.muted = true;
    }
  }

  function pausePreview() {
    if (!previewPlaying) return;
    previewPausedElapsed = (performance.now() - previewClockStart) / 1000;
    previewPlaying = false;
    stopPreviewRaf();
    videoEl?.pause();
    videoElB?.pause();
  }

  function resumePreview() {
    if (playbackMode !== 'preview' || !videoEl || editorLocked) return;
    previewPlaying = true;
    previewClockStart = performance.now() - previewPausedElapsed * 1000;
    tickPreview();
  }

  function togglePreviewPause() {
    if (playbackMode !== 'preview') return;
    if (previewPlaying) pausePreview();
    else resumePreview();
  }

  async function playPreviewFromStart() {
    if (!videoEl || segments.length === 0 || editorLocked || !currentSourceUrl) return;
    stopPreviewRaf();
    playbackMode = 'preview';
    previewPlaying = true;
    previewPausedElapsed = 0;
    previewClockStart = performance.now();
    try {
      await ensurePreviewVideoB();
      applyPreviewMix(computePreviewMix(0));
      tickPreview();
    } catch {
      stopPreview();
      statusMsg = 'Не удалось запустить предпросмотр';
    }
  }

  function addSelection() {
    if (editorLocked || selEnd <= selStart) return;
    const seg: VideoSegment = { start: selStart, end: selEnd };
    if (fadeIn) seg.fadeIn = 0.35;
    if (fadeOut) seg.fadeOut = 0.35;
    segments = [...segments, seg].sort((a, b) => a.start - b.start);
    const idx = segments.findIndex((s) => s.start === seg.start && s.end === seg.end);
    if (idx > 0 && segments[idx - 1]!.crossfadeAfter == null) {
      segments = segments.map((s, i) =>
        i === idx - 1 ? { ...s, crossfadeAfter: crossfade } : s
      );
    }
    activeSegIndex = idx >= 0 ? idx : null;
  }

  function buildRandomSegments(episodeDur: number): VideoSegment[] {
    const minLen = Math.max(MIN_SEG_DUR, Math.min(randomMinLen, randomMaxLen));
    const maxLen = Math.max(minLen, randomMaxLen);
    const count = Math.max(1, Math.min(15, Math.floor(randomCount)));

    const beats = buildMontageBeats(episodeDur, {
      count,
      minClipSec: minLen,
      maxClipSec: maxLen,
    });

    return beats.map((beat, i) => {
      const end = Math.min(episodeDur, beat.seekSec + beat.playDurationSec);
      const seg: VideoSegment = {
        start: beat.seekSec,
        end: Math.max(beat.seekSec + MIN_SEG_DUR, end),
      };
      if (i < beats.length - 1) seg.crossfadeAfter = crossfade;
      return seg;
    });
  }

  function clampRandomLenInputs() {
    randomMinLen = Math.max(MIN_SEG_DUR, randomMinLen);
    randomMaxLen = Math.max(randomMinLen, randomMaxLen);
    randomCount = Math.max(1, Math.min(15, Math.floor(randomCount)));
  }

  function randomizeFragments() {
    if (editorLocked || !duration) return;
    clampRandomLenInputs();
    if (segments.length > 0 && !confirm('Заменить текущие фрагменты случайной нарезкой?')) return;
    stopPreview();
    activeSegIndex = null;
    segments = buildRandomSegments(duration);
    if (segments[0]) {
      selStart = segments[0].start;
      selEnd = segments[0].end;
      seek(segments[0].start);
    }
    statusMsg = `${segments.length} случайных фрагментов · ~${formatTimeSec(segmentsTotalDuration(segments, crossfade))}`;
  }

  function removeSegment(i: number) {
    segments = segments.filter((_, idx) => idx !== i);
    if (activeSegIndex === i) activeSegIndex = null;
    else if (activeSegIndex != null && activeSegIndex > i) activeSegIndex--;
    if (playbackMode === 'preview') stopPreview();
  }

  function jumpSegment(seg: VideoSegment) {
    stopPreview();
    const idx = segments.findIndex((s) => s.start === seg.start && s.end === seg.end);
    if (idx >= 0) selectSegment(idx);
    else {
      seek(seg.start);
      selStart = seg.start;
      selEnd = seg.end;
    }
    zoomToRange(seg.start, seg.end);
  }

  async function probeServerSource(url: string): Promise<boolean> {
    try {
      const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      if (head.ok) return true;
      // Некоторые static-серверы не отдают HEAD — пробуем Range.
      const range = await fetch(url, {
        headers: { Range: 'bytes=0-1' },
        signal: AbortSignal.timeout(8000),
      });
      return range.ok || range.status === 206;
    } catch {
      return false;
    }
  }

  async function ensureSourceOnServer(token: string, bannerId: number, forceUpload = false) {
    if (!forceUpload && sourceMode === 'server' && serverSourceUrl) {
      const ok = await probeServerSource(serverSourceUrl);
      if (ok) return;
      statusMsg = 'Исходник на сервере недоступен — загружаю заново…';
    }

    if (localFile && (sourceMode === 'upload' || forceUpload)) {
      statusMsg = 'Загрузка файла на сервер…';
      const row = await uploadOverviewSourceVideo(token, bannerId, localFile);
      serverSourceUrl = resolveUploadUrl(row.sourceVideoUrl);
      return;
    }

    // episode / stale «С сервера» → качаем 1 серию на диск anixback
    if (payload?.releaseId && !episodePlayback?.playUrl) {
      statusMsg = 'Подготовка 1 серии…';
      if (!dubbers.length) await loadEpisodeOptions();
      else await loadEpisodeVideo();
    }

    const playUrl = episodePlayback?.playUrl;
    if (playUrl) {
      statusMsg = 'Скачивание 1 серии на сервер…';
      const row = await uploadOverviewSourceFromUrl(token, bannerId, playUrl);
      serverSourceUrl = resolveUploadUrl(row.sourceVideoUrl);
      return;
    }

    if (localFile) {
      statusMsg = 'Загрузка файла на сервер…';
      const row = await uploadOverviewSourceVideo(token, bannerId, localFile);
      serverSourceUrl = resolveUploadUrl(row.sourceVideoUrl);
      return;
    }

    throw new Error('Выберите источник видео (1 серия или файл)');
  }

  async function exportVideo() {
    if (!payload || segments.length === 0 || editorLocked) return;
    busy = true;
    statusMsg = '';
    stopPreview();
    try {
      setAdminToken(payload.adminToken);
      await ensureSourceOnServer(payload.adminToken, payload.bannerId);
      statusMsg = 'Сохранение сегментов…';
      await saveOverviewSegments(
        payload.adminToken,
        payload.bannerId,
        segments,
        payload.releaseId
      );
      statusMsg = 'Склейка MP4 (ffmpeg)…';
      try {
        await renderOverviewVideo(payload.adminToken, payload.bannerId, segments, crossfade);
      } catch (renderErr) {
        const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
        if (!/upload source video first/i.test(msg)) throw renderErr;
        // БД без sourceVideoPath / битая ссылка «С сервера» — форсируем загрузку и повторяем.
        statusMsg = 'Исходник не найден на сервере — загружаю и повторяю склейку…';
        await ensureSourceOnServer(payload.adminToken, payload.bannerId, true);
        await renderOverviewVideo(payload.adminToken, payload.bannerId, segments, crossfade);
      }
      window.electron?.overviewEditorDone?.();
      statusMsg = 'Готово!';
    } catch (e) {
      statusMsg = e instanceof Error ? e.message : 'Ошибка экспорта';
    } finally {
      busy = false;
    }
  }

  onMount(async () => {
    try {
      await initAnixbackEndpoint();
      const p = await window.electron?.getOverviewEditorPayload?.();
      if (!p?.adminToken || !p?.bannerId) throw new Error('Нет данных редактора');
      payload = p as OverviewEditorPayload;
      setAdminToken(p.adminToken);
      segments = (p.segments ?? []).map((s: VideoSegment) => ({ ...s }));
      crossfade = p.crossfade ?? 0.5;

      if (p.sourceVideoUrl) {
        serverSourceUrl = resolveUploadUrl(p.sourceVideoUrl);
        sourceMode = 'server';
      } else if (p.releaseId) {
        sourceMode = 'episode';
      } else {
        sourceMode = 'upload';
        loadState = 'ready';
        return;
      }

      // Shell must mount first — <video> is not in DOM while loadState === 'loading'
      loadState = 'ready';
      await tick();

      if (p.sourceVideoUrl && serverSourceUrl) {
        await attachVideoSource(serverSourceUrl);
        statusMsg = 'Исходник с сервера';
      } else if (p.releaseId) {
        await loadEpisodeOptions();
        await loadEpisodeVideo();
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Ошибка загрузки';
      loadState = 'error';
    }
  });

  onDestroy(() => {
    stopPreviewRaf();
    destroyHls();
    destroyHlsB();
    if (localFileUrl) URL.revokeObjectURL(localFileUrl);
  });
</script>

<div class="ove-root">
  <header class="ove-titlebar">
    <span class="ove-titlebar__title">Редактор видео — {payload?.title ?? 'Обзор'}</span>
    <div class="ove-titlebar__controls">
      <button type="button" class="ove-titlebar__btn" aria-label="Свернуть" onclick={() => window.electron?.minimizeToolWindow?.()}>—</button>
      <button type="button" class="ove-titlebar__btn" aria-label="Развернуть" onclick={() => window.electron?.toggleMaximizeToolWindow?.()}>□</button>
      <button type="button" class="ove-titlebar__btn ove-titlebar__btn--close" aria-label="Закрыть" onclick={() => window.electron?.closeToolWindow?.()}>×</button>
    </div>
  </header>

  {#if loadState === 'loading'}
    <p class="ove-loading">Загрузка редактора…</p>
  {:else if loadState === 'error'}
    <p class="ove-error">{loadError}</p>
  {:else}
    {#if statusMsg && !busy && !editorLocked}
      <p class="ove-status">{statusMsg}</p>
    {/if}

    <div class="ove-body">
      <div class="ove-main" class:ove-main--locked={editorLocked}>
        {#if editorLocked}
          <div class="ove-load-overlay">
            <p class="ove-load-overlay__title">{loadProgress || 'Загрузка видео…'}</p>
            <p class="ove-load-overlay__sub">Редактирование будет доступно после полной загрузки</p>
          </div>
        {/if}

        <div class="ove-source-bar">
          <div class="ove-source-tabs">
            {#if payload?.releaseId}
              <button
                type="button"
                class="ove-source-tab"
                class:ove-source-tab--active={sourceMode === 'episode'}
                disabled={editorLocked}
                onclick={async () => { sourceMode = 'episode'; await loadEpisodeVideo(); }}
              >
                1 серия
              </button>
            {/if}
            <button
              type="button"
              class="ove-source-tab"
              class:ove-source-tab--active={sourceMode === 'upload'}
              disabled={editorLocked}
              onclick={() => { sourceMode = 'upload'; }}
            >
              Загрузить MP4
            </button>
            {#if serverSourceUrl}
              <button
                type="button"
                class="ove-source-tab"
                class:ove-source-tab--active={sourceMode === 'server'}
                disabled={editorLocked}
                onclick={async () => {
                  sourceMode = 'server';
                  if (serverSourceUrl) await attachVideoSource(serverSourceUrl);
                }}
              >
                С сервера
              </button>
            {/if}
          </div>

          {#if sourceMode === 'episode' && payload?.releaseId}
            <div class="ove-picker-row">
              <select bind:value={selectedDubberId} disabled={editorLocked} onchange={() => void onDubberChange()}>
                {#each dubbers as d (d.id)}
                  <option value={d.id}>{d.name}</option>
                {/each}
              </select>
              <select bind:value={selectedSourceId} disabled={editorLocked} onchange={() => void loadEpisodeVideo()}>
                {#each sources as s (s.id)}
                  <option value={s.id}>{s.name}</option>
                {/each}
              </select>
            </div>
          {/if}

          {#if sourceMode === 'upload'}
            <label class="btn btn-secondary btn-sm" class:ove-disabled={editorLocked}>
              Выбрать файл
              <input type="file" accept="video/mp4,video/webm" hidden disabled={editorLocked} onchange={onLocalFile} />
            </label>
          {/if}
        </div>

        <div class="ove-player-wrap">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoEl}
            class="ove-player"
            class:ove-player--layer={playbackMode === 'preview'}
            style:opacity={playbackMode === 'preview' ? previewOpacityA : 1}
            style:z-index={playbackMode === 'preview' && previewOpacityB > previewOpacityA ? 1 : 2}
            playsinline
            ontimeupdate={onVideoTimeUpdate}
            onloadedmetadata={() => { if (videoEl) duration = videoEl.duration || 0; }}
          ></video>
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoElB}
            class="ove-player"
            class:ove-player--layer={playbackMode === 'preview'}
            class:ove-player--hidden={playbackMode !== 'preview'}
            style:opacity={playbackMode === 'preview' ? previewOpacityB : 0}
            style:z-index={previewOpacityB > previewOpacityA ? 2 : 1}
            playsinline
          ></video>
          {#if playbackMode === 'preview'}
            <span class="ove-player-badge">Предпросмотр</span>
          {/if}
        </div>

        <div class="ove-player-controls">
          <span class="ove-time">Исходник: {formatTimeSec(currentTime)} / {formatTimeSec(duration)}</span>
          <div class="ove-player-controls__actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              onclick={addSelection}
              disabled={editorLocked || selEnd <= selStart}
            >
              + Добавить фрагмент
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onclick={randomizeFragments}
              disabled={editorLocked || !duration}
            >
              Случайно
            </button>
          </div>
        </div>

        <div class="ove-timeline">
          <div class="ove-timeline__toolbar">
            <span class="ove-timeline__zoom-label">
              {timelineZoom >= 10 ? Math.round(timelineZoom) : timelineZoom.toFixed(1)}×
            </span>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              disabled={editorLocked || timelineZoom <= 1.02}
              onclick={resetTimelineZoom}
            >
              Весь ролик
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              disabled={editorLocked || selEnd <= selStart}
              onclick={() => zoomToRange(selStart, selEnd)}
            >
              К выделению
            </button>
            <span class="ove-time ove-timeline__range">
              {formatTimeSec(viewStart)} — {formatTimeSec(viewStart + viewSpan)}
            </span>
          </div>
          <div
            class="ove-timeline__track"
            class:ove-timeline__track--locked={editorLocked}
            bind:this={trackEl}
            onpointerdown={onTrackPointerDown}
            onpointermove={onTrackPointerMove}
            onpointerup={onTrackPointerUp}
            onpointercancel={onTrackPointerUp}
            onwheel={onTimelineWheel}
            role="slider"
            aria-label="Таймлайн видео"
            aria-valuemin={viewStart}
            aria-valuemax={viewStart + viewSpan}
            aria-valuenow={currentTime}
            tabindex="0"
          >
            <div class="ove-timeline__dim"></div>
            <div
              class="ove-timeline__filmstrip"
              style:left="{filmstripLeftPct}%"
              style:width="{filmstripWidthPct}%"
            >
              {#each thumbs as thumb, i (i)}
                <div class="ove-timeline__thumb" style:background-image={`url(${thumb})`}></div>
              {/each}
            </div>
            {#each segments as seg, i (i)}
              {@const extend = segOverlapExtendPct(i)}
              <div
                class="ove-timeline__fragment"
                class:ove-timeline__fragment--active={activeSegIndex === i}
                style:left="{segLeftPct(seg)}%"
                style:width="calc({segWidthPct(seg)}% + {extend}%)"
                title="Фрагмент {i + 1}: {formatTimeSec(seg.start)} — {formatTimeSec(seg.end)}"
                onpointerdown={(e) => onFragPointerDown(e, i)}
              >
                {#if activeSegIndex === i}
                  <span class="ove-timeline__frag-grip" aria-hidden="true">⋮⋮</span>
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="ove-timeline__handle ove-timeline__handle--start"
                    style:left="0"
                    onpointerdown={(e) => onSegEdgeDown(e, i, 'start')}
                    role="presentation"
                  >
                    <span class="ove-timeline__handle-grip" aria-hidden="true">⋮</span>
                  </div>
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="ove-timeline__handle ove-timeline__handle--end"
                    style:left="100%"
                    onpointerdown={(e) => onSegEdgeDown(e, i, 'end')}
                    role="presentation"
                  >
                    <span class="ove-timeline__handle-grip" aria-hidden="true">⋮</span>
                  </div>
                {/if}
              </div>
            {/each}
            {#if duration > 0 && !editorLocked}
              {#if activeSegIndex == null}
                <div
                  class="ove-timeline__selection"
                  style:left="{selLeftPct}%"
                  style:width="{selWidthPct}%"
                  onpointerdown={onSelMoveDown}
                  role="presentation"
                >
                  <span class="ove-timeline__sel-grip" aria-hidden="true">↔</span>
                </div>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="ove-timeline__handle ove-timeline__handle--start"
                  style:left="{selLeftPct}%"
                  onpointerdown={onSelStartDown}
                  role="presentation"
                >
                  <span class="ove-timeline__handle-grip" aria-hidden="true">⋮</span>
                </div>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="ove-timeline__handle ove-timeline__handle--end"
                  style:left="{selLeftPct + selWidthPct}%"
                  onpointerdown={onSelEndDown}
                  role="presentation"
                >
                  <span class="ove-timeline__handle-grip" aria-hidden="true">⋮</span>
                </div>
              {/if}
              <div class="ove-timeline__playhead" style:left="{playheadPct}%"></div>
              {#if dragTooltipTime != null}
                <div class="ove-timeline__tooltip" style:left="{timeToViewPct(dragTooltipTime)}%">
                  {formatTimeSec(dragTooltipTime)}
                </div>
              {/if}
            {/if}
          </div>
          <div class="ove-timeline__labels">
            {#if activeSegIndex != null && segments[activeSegIndex]}
              <span class="ove-timeline__label ove-timeline__label--accent">
                {formatTimeSec(segments[activeSegIndex]!.start)}
              </span>
              <span class="ove-timeline__label ove-timeline__label--dur">
                {formatTimeSec(segments[activeSegIndex]!.end - segments[activeSegIndex]!.start)}
              </span>
              <span class="ove-timeline__label ove-timeline__label--accent">
                {formatTimeSec(segments[activeSegIndex]!.end)}
              </span>
            {:else}
              <span class="ove-timeline__label ove-timeline__label--accent">{formatTimeSec(selStart)}</span>
              <span class="ove-timeline__label ove-timeline__label--dur">
                {formatTimeSec(selEnd - selStart)}
              </span>
              <span class="ove-timeline__label ove-timeline__label--accent">{formatTimeSec(selEnd)}</span>
            {/if}
          </div>
          <p class="ove-time ove-timeline__hint">
            Колёсико — приближение · Shift+колёсико — прокрутка
            {#if activeSegIndex != null}
              · редактирование фрагмента {activeSegIndex + 1}
            {:else}
              · выделение {formatTimeSec(selStart)} — {formatTimeSec(selEnd)} · фрагментов: {segments.length}
            {/if}
          </p>
        </div>
      </div>

      <aside class="ove-sidebar">
        <div class="ove-sidebar__scroll">
          <h3>Предпросмотр финала</h3>
          <p class="ove-preview-desc">
            Клипы накладываются друг на друга. Тяни зону перехода или меняй длительность наложения.
          </p>

          <div
            class="ove-preview-montage"
            class:ove-preview-montage--empty={segments.length === 0}
            bind:this={previewTimelineEl}
            onpointermove={onPreviewTimelineMove}
            onpointerup={onPreviewTimelineUp}
            onpointercancel={onPreviewTimelineUp}
          >
            {#if segments.length === 0}
              <p class="ove-time">Добавьте фрагменты на таймлайне</p>
            {:else}
              {#each montageLayout.blocks as block (block.index)}
                {@const seg = segments[block.index]!}
                <div
                  class="ove-preview-block"
                  class:ove-preview-block--active={playbackMode === 'preview' && previewSegIndex === block.index}
                  style:left="{block.leftPct}%"
                  style:width="{block.widthPct}%"
                  style:z-index={block.zIndex}
                  title="Фрагмент {block.index + 1}: {formatTimeSec(seg.start)} → {formatTimeSec(seg.end)}"
                >
                  <span class="ove-preview-block__idx">{block.index + 1}</span>
                </div>
              {/each}
              {#each montageLayout.transitions as tr (tr.junctionIndex)}
                <div
                  class="ove-preview-transition"
                  class:ove-preview-transition--active={activeTransitionIndex === tr.junctionIndex || transitionDragIndex === tr.junctionIndex}
                  style:left="{tr.leftPct}%"
                  style:width="{Math.max(tr.widthPct, 4)}%"
                  style:z-index={segments.length + tr.junctionIndex + 2}
                  onpointerdown={(e) => onTransitionPointerDown(e, tr.junctionIndex)}
                  role="slider"
                  aria-label="Наложение {tr.junctionIndex + 1} → {tr.junctionIndex + 2}"
                  aria-valuemin={0}
                  aria-valuemax={maxJunctionCrossfade(segments[tr.junctionIndex]!, segments[tr.junctionIndex + 1]!)}
                  aria-valuenow={tr.crossfadeSec}
                  tabindex="0"
                >
                  <svg class="ove-preview-transition__curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path class="ove-preview-transition__fill" d="M0,100 C40,40 60,60 100,0 L100,100 Z" />
                    <path class="ove-preview-transition__line" d="M0,100 C40,40 60,60 100,0" />
                  </svg>
                  <span class="ove-preview-transition__label">{tr.crossfadeSec.toFixed(1)}с</span>
                </div>
              {/each}
            {/if}
          </div>

          <div class="ove-transport">
            <button
              type="button"
              class="ove-transport__btn ove-transport__btn--primary"
              disabled={editorLocked || segments.length === 0}
              onclick={() => {
                if (playbackMode === 'preview' && !previewPlaying) resumePreview();
                else playPreviewFromStart();
              }}
              aria-label={playbackMode === 'preview' && !previewPlaying ? 'Продолжить' : 'Воспроизвести с начала'}
            >
              {playbackMode === 'preview' && !previewPlaying && previewMontageTime > 0 ? '▶ Продолжить' : '▶ С начала'}
            </button>
            <button
              type="button"
              class="ove-transport__btn"
              disabled={playbackMode !== 'preview'}
              onclick={togglePreviewPause}
              aria-label={previewPlaying ? 'Пауза' : 'Продолжить'}
            >
              {previewPlaying ? '❚❚' : '▶'}
            </button>
            <button
              type="button"
              class="ove-transport__btn"
              disabled={playbackMode !== 'preview'}
              onclick={stopPreview}
              aria-label="Стоп"
            >
              ■
            </button>
          </div>
          <p class="ove-time ove-preview-time">
            {#if playbackMode === 'preview'}
              {formatTimeSec(previewMontageTime)} / {formatTimeSec(resultDuration)}
              · фрагмент {previewSegIndex + 1}/{segments.length}
            {:else}
              0:00 / {formatTimeSec(resultDuration)}
            {/if}
          </p>

          <h3>Фрагменты ({segments.length})</h3>
          {#if segments.length === 0}
            <p class="ove-time">Выделите участок и нажмите «Добавить»</p>
          {:else}
            <ul class="ove-seg-list">
              {#each segments as seg, i (i)}
                <li class="ove-seg-item">
                  <button type="button" disabled={editorLocked} onclick={() => jumpSegment(seg)}>
                    {i + 1}. {formatTimeSec(seg.start)} → {formatTimeSec(seg.end)}
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    disabled={editorLocked}
                    onclick={() => removeSegment(i)}
                  >
                    ×
                  </button>
                </li>
              {/each}
            </ul>
          {/if}

          <h3>Случайная нарезка</h3>
          <p class="ove-random-desc">
            Моменты из разных частей серии. Повторное нажатие — новая расстановка.
          </p>
          <div class="ove-random-grid">
            <label class="ove-random-field">
              <span class="ove-random-field__label">Количество</span>
              <input
                type="number"
                class="settings-input"
                min="1"
                max="15"
                step="1"
                bind:value={randomCount}
                disabled={editorLocked}
                onchange={clampRandomLenInputs}
              />
            </label>
            <label class="ove-random-field">
              <span class="ove-random-field__label">Мин. длина, сек</span>
              <input
                type="number"
                class="settings-input"
                min="0.5"
                max="120"
                step="0.5"
                bind:value={randomMinLen}
                disabled={editorLocked}
                onchange={clampRandomLenInputs}
              />
            </label>
            <label class="ove-random-field">
              <span class="ove-random-field__label">Макс. длина, сек</span>
              <input
                type="number"
                class="settings-input"
                min="0.5"
                max="120"
                step="0.5"
                bind:value={randomMaxLen}
                disabled={editorLocked}
                onchange={clampRandomLenInputs}
              />
            </label>
          </div>
          <button
            type="button"
            class="btn btn-secondary btn-sm ove-random-btn"
            disabled={editorLocked || !duration}
            onclick={randomizeFragments}
          >
            Сгенерировать случайно
          </button>

          <h3>Переходы</h3>
          <label class="ove-check-row">
            <input type="checkbox" bind:checked={fadeIn} disabled={editorLocked} />
            Нарастание (начало ролика)
          </label>
          <label class="ove-check-row">
            <input type="checkbox" bind:checked={fadeOut} disabled={editorLocked} />
            Затухание (конец ролика)
          </label>
          <label class="ove-check-row">
            Наложение по умолчанию, сек
            <input
              type="number"
              class="settings-input"
              style="width:4rem"
              min="0"
              max="3"
              step="0.1"
              bind:value={crossfade}
              disabled={editorLocked}
            />
          </label>
          {#if segments.length > 1}
            <ul class="ove-transition-list">
              {#each segments as seg, i (i)}
                {#if i < segments.length - 1}
                  {@const next = segments[i + 1]!}
                  {@const cf = junctionCrossfade(seg, crossfade)}
                  {@const maxCf = maxJunctionCrossfade(seg, next)}
                  <li class="ove-transition-item">
                    <span class="ove-transition-item__label">{i + 1}→{i + 2}</span>
                    <input
                      type="range"
                      class="ove-transition-item__range"
                      min="0"
                      max={maxCf}
                      step="0.05"
                      value={cf}
                      disabled={editorLocked}
                      oninput={(e) => setJunctionCrossfade(i, Number((e.target as HTMLInputElement).value))}
                    />
                    <input
                      type="number"
                      class="settings-input ove-transition-item__num"
                      min="0"
                      max={maxCf}
                      step="0.05"
                      value={cf}
                      disabled={editorLocked}
                      onchange={(e) => setJunctionCrossfade(i, Number((e.target as HTMLInputElement).value))}
                    />
                  </li>
                {/if}
              {/each}
            </ul>
          {/if}
        </div>

        <footer class="ove-footer">
          <span class="ove-footer__meta">Итого: {formatTimeSec(resultDuration)}</span>
          <button
            type="button"
            class="btn btn-primary"
            disabled={busy || editorLocked || segments.length === 0}
            onclick={() => void exportVideo()}
          >
            {busy ? 'Экспорт…' : 'Экспорт MP4'}
          </button>
        </footer>
      </aside>
    </div>
  {/if}
</div>
