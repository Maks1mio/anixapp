<script lang="ts">
  import { isMobileMode } from '../../platform/mobile';
  import { onMount } from 'svelte';
  import {
    closeFeedMediaLightbox,
    feedMediaLightbox,
    stepFeedMediaLightbox,
  } from '../../utils/feed-media-lightbox';
  import { toCdnProxyUrl, unwrapCdnUrl } from '../../utils/posterUrl';
  import { showToast } from '../../stores/toast';
  import { forceDarkSystemBars } from '../../native/anix-system-bars';
  import {
    iconChevronLeft,
    iconChevronRight,
    iconCopy,
    iconDownload,
    iconSparkles,
    iconX,
  } from '../icons';
  import {
    startAnime4kImageUpscale,
    snapshotCanvasImage,
    type Anime4kSession,
  } from '../../utils/anime4kUpscale';
  import { isGpuAvailable, probeWebGpuAvailable } from '../../utils/webgpu-availability.svelte';
  import {
    ANIME4K_INTENSITIES,
    ANIME4K_TARGET_RES,
    ANIME4K_TYPES,
    anime4kTargetHeight,
    mapAnime4kPreset,
    normalizeAnime4kPreset,
    normalizeAnime4kTargetRes,
    type Anime4kIntensity,
    type Anime4kTargetRes,
    type Anime4kType,
  } from '../../views/Watch/core/anime4k-presets';

  const lightbox = $derived($feedMediaLightbox);
  const item = $derived(lightbox?.items[lightbox.index] ?? null);
  const total = $derived(lightbox?.items.length ?? 0);
  const canNav = $derived(total > 1);
  const canUpscale = $derived(!!item && item.kind !== 'video' && !isMobileMode());
  const gpuOk = $derived(isGpuAvailable());

  let overlayEl = $state<HTMLDivElement | null>(null);
  let stageEl = $state<HTMLElement | null>(null);
  let upscaleCanvasEl = $state<HTMLCanvasElement | null>(null);
  let pointerStartX = $state<number | null>(null);
  let closing = $state(false);
  let openedKey = $state('');
  let downloadBusy = $state(false);
  let copyBusy = $state(false);

  let upscalePanelOpen = $state(false);
  let upscaleBusy = $state(false);
  let upscaleActive = $state(false);
  let upscaleType = $state<Anime4kType>('balance');
  let upscaleIntensity = $state<Anime4kIntensity>('optimal');
  let upscaleTargetRes = $state<Anime4kTargetRes>('1080');
  let upscaleSession: Anime4kSession | null = null;
  let upscaleToken = 0;

  const a4kTypes = ANIME4K_TYPES.filter((t) => t.id !== 'off');

  // ── Мобильный просмотр: на весь экран, жесты пальцами ──
  const mobile = isMobileMode();
  const MAX_ZOOM = 5;
  const DOUBLE_TAP_ZOOM = 2.5;
  const PEEK_GAP = 16;
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let swipeX = $state(0);
  let dragY = $state(0);
  let gesturing = $state(false);
  let chromeHidden = $state(false);
  const pointers = new Map<number, { x: number; y: number }>();
  type GestureMode = 'none' | 'pending' | 'pan' | 'pinch' | 'swipe' | 'dismiss';
  let gesture = {
    mode: 'none' as GestureMode,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    startZoom: 1,
    startDist: 1,
    startMidX: 0,
    startMidY: 0,
    lastX: 0,
    lastT: 0,
    vx: 0,
    moved: false,
  };
  let lastTapAt = 0;
  let tapTimer = 0;

  const imgTransform = $derived(
    zoom !== 1 || panX || panY || swipeX
      ? `translate3d(${panX + swipeX}px, ${panY}px, 0) scale(${zoom})`
      : undefined,
  );
  const dragProgress = $derived(Math.min(1, Math.abs(dragY) / 320));

  // gesturing не трогаем: при перелистывании он держит transition выключенным, пока новый кадр встаёт на место
  function resetMobileView() {
    zoom = 1;
    panX = 0;
    panY = 0;
    swipeX = 0;
    dragY = 0;
    pointers.clear();
    gesture.mode = 'none';
  }

  function viewCenter(): { cx: number; cy: number } {
    const el = overlayEl;
    return { cx: (el?.clientWidth ?? window.innerWidth) / 2, cy: (el?.clientHeight ?? window.innerHeight) / 2 };
  }

  /**
   * Сдвиг не даёт увести увеличенную картинку дальше её краёв.
   * img растянут на весь экран с object-fit: contain — считаем по видимой части, а не по рамке
   */
  function clampPan(x: number, y: number, z: number): { x: number; y: number } {
    const img = stageEl?.querySelector('img');
    if (!img || z <= 1) return { x: 0, y: 0 };
    const vw = overlayEl?.clientWidth ?? window.innerWidth;
    const vh = overlayEl?.clientHeight ?? window.innerHeight;
    let w = img.offsetWidth;
    let h = img.offsetHeight;
    if (img.naturalWidth && img.naturalHeight) {
      const fit = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      w = img.naturalWidth * fit;
      h = img.naturalHeight * fit;
    }
    const maxX = Math.max(0, (w * z - vw) / 2);
    const maxY = Math.max(0, (h * z - vh) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  }

  function canZoom(): boolean {
    return !!item && item.kind !== 'video';
  }

  /** Масштаб вокруг точки экрана: точка картинки под пальцем или курсором остаётся на месте */
  function zoomAround(x: number, y: number, z: number) {
    const next = Math.max(1, Math.min(MAX_ZOOM, z));
    const { cx, cy } = viewCenter();
    const qx = (x - cx - panX) / zoom;
    const qy = (y - cy - panY) / zoom;
    const p = clampPan(x - cx - qx * next, y - cy - qy * next, next);
    zoom = next;
    panX = p.x;
    panY = p.y;
  }

  function toggleZoomAt(x: number, y: number) {
    if (!canZoom()) return;
    if (zoom > 1) {
      zoom = 1;
      panX = 0;
      panY = 0;
      return;
    }
    zoomAround(x, y, DOUBLE_TAP_ZOOM);
  }

  function onMobileWheel(e: WheelEvent) {
    if (!canZoom() || closing) return;
    e.preventDefault();
    zoomAround(e.clientX, e.clientY, zoom * Math.exp(-e.deltaY * 0.0025));
  }

  $effect(() => {
    const el = overlayEl;
    if (!mobile || !el) return;
    el.addEventListener('wheel', onMobileWheel, { passive: false });
    return () => el.removeEventListener('wheel', onMobileWheel);
  });

  /** Перелистывание: текущий кадр уезжает, соседний въезжает на его место, без отката назад */
  let sliding = false;
  function slideTo(dir: 1 | -1) {
    const width = overlayEl?.clientWidth ?? window.innerWidth;
    sliding = true;
    swipeX = -dir * (width + PEEK_GAP);
    window.setTimeout(() => {
      gesturing = true; // без transition: новый кадр сразу на месте
      stepFeedMediaLightbox(dir);
      swipeX = 0;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          gesturing = false;
          sliding = false;
        }),
      );
    }, prefersReducedMotion() ? 0 : 220);
  }

  function handleTap(x: number, y: number) {
    const now = performance.now();
    if (now - lastTapAt < 280) {
      window.clearTimeout(tapTimer);
      lastTapAt = 0;
      toggleZoomAt(x, y);
      return;
    }
    lastTapAt = now;
    tapTimer = window.setTimeout(() => {
      chromeHidden = !chromeHidden;
    }, 280);
  }

  function startPinch() {
    const [a, b] = [...pointers.values()];
    gesture.mode = 'pinch';
    gesture.startDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    gesture.startZoom = zoom;
    gesture.startPanX = panX;
    gesture.startPanY = panY;
    gesture.startMidX = (a.x + b.x) / 2;
    gesture.startMidY = (a.y + b.y) / 2;
    swipeX = 0;
    dragY = 0;
  }

  function startSingle(x: number, y: number) {
    gesture.mode = zoom > 1 ? 'pan' : 'pending';
    gesture.startX = x;
    gesture.startY = y;
    gesture.lastX = x;
    gesture.lastT = performance.now();
    gesture.vx = 0;
    gesture.moved = false;
    gesture.startPanX = panX;
    gesture.startPanY = panY;
  }

  function onMobilePointerDown(e: PointerEvent) {
    if (closing || sliding) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as Element | null;
    if (target?.closest('button, video')) return;
    try {
      overlayEl?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesturing = true;
    if (pointers.size === 2 && canZoom()) startPinch();
    else if (pointers.size === 1) startSingle(e.clientX, e.clientY);
  }

  function onMobilePointerMove(e: PointerEvent) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const g = gesture;

    if (g.mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const z = Math.max(1, Math.min(MAX_ZOOM, (g.startZoom * dist) / g.startDist));
      // Точка картинки под пальцами остаётся под пальцами
      const { cx, cy } = viewCenter();
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const qx = (g.startMidX - cx - g.startPanX) / g.startZoom;
      const qy = (g.startMidY - cy - g.startPanY) / g.startZoom;
      const next = clampPan(midX - cx - qx * z, midY - cy - qy * z, z);
      zoom = z;
      panX = next.x;
      panY = next.y;
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.mode === 'pending') {
      if (Math.hypot(dx, dy) < 10) return;
      if (Math.abs(dx) > Math.abs(dy)) g.mode = canNav ? 'swipe' : 'none';
      else g.mode = 'dismiss';
    }
    if (g.mode === 'swipe') {
      const now = performance.now();
      const dt = now - g.lastT;
      if (dt > 0) g.vx = 0.7 * ((e.clientX - g.lastX) / dt) + 0.3 * g.vx;
      g.lastX = e.clientX;
      g.lastT = now;
      swipeX = dx;
    } else if (g.mode === 'dismiss') dragY = dy;
    else if (g.mode === 'pan') {
      if (Math.hypot(dx, dy) >= 10) g.moved = true; // уже не тап
      const next = clampPan(g.startPanX + dx, g.startPanY + dy, zoom);
      panX = next.x;
      panY = next.y;
    }
  }

  function onMobilePointerUp(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const g = gesture;

    if (g.mode === 'pinch') {
      if (pointers.size === 1) {
        const [rest] = [...pointers.values()];
        startSingle(rest.x, rest.y);
        g.moved = true;
        return;
      }
      if (pointers.size === 0 && zoom < 1.05) {
        zoom = 1;
        panX = 0;
        panY = 0;
      }
    }
    if (pointers.size > 0) return;

    gesturing = false;
    const width = overlayEl?.clientWidth ?? window.innerWidth;
    if (g.mode === 'pending') handleTap(e.clientX, e.clientY);
    else if (g.mode === 'pan' && !g.moved) handleTap(e.clientX, e.clientY);
    else if (g.mode === 'swipe') {
      const dx = swipeX;
      // Дотянул до трети экрана или резко смахнул в ту же сторону — листаем
      const flick = Math.abs(g.vx) > 0.45 && Math.sign(g.vx) === Math.sign(dx) && Math.abs(dx) > 24;
      if (Math.abs(dx) > width * 0.33 || flick) slideTo(dx > 0 ? -1 : 1);
      else swipeX = 0;
    } else if (g.mode === 'dismiss') {
      if (Math.abs(dragY) > 110) void dismissBySwipe();
      else dragY = 0;
    }
    g.mode = 'none';
  }

  function onMobilePointerCancel() {
    pointers.clear();
    gesturing = false;
    gesture.mode = 'none';
    swipeX = 0;
    dragY = 0;
    if (zoom < 1.05) {
      zoom = 1;
      panX = 0;
      panY = 0;
    }
  }

  /** Смахивание вверх или вниз: картинка уезжает за край, фон гаснет */
  async function dismissBySwipe() {
    if (closing || !lightbox) return;
    closing = true;
    const el = stageEl;
    const from = dragY;
    const dir = from < 0 ? -1 : 1;
    if (el && !prefersReducedMotion()) {
      try {
        await el.animate(
          [
            { transform: `translate3d(0, ${from}px, 0)`, opacity: 1 },
            { transform: `translate3d(0, ${dir * window.innerHeight * 0.6}px, 0)`, opacity: 0 },
          ],
          { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
        ).finished;
      } catch {
        /* ignore cancelled animation */
      }
    }
    closeFeedMediaLightbox();
    resetMobileView();
    gesturing = false;
    chromeHidden = false;
    closing = false;
    openedKey = '';
  }

  function currentKey(next: typeof lightbox): string {
    if (!next) return '';
    return `${next.items.map((i) => i.url).join('|')}#${next.index}#${next.origin?.left ?? ''}`;
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function shareableUrl(url: string): string {
    return unwrapCdnUrl(url) || url;
  }

  function fileNameFromUrl(url: string, mime = ''): string {
    const fallbackExt =
      mime.includes('gif') ? 'gif'
      : mime.includes('webp') ? 'webp'
      : mime.includes('png') ? 'png'
      : mime.includes('mp4') ? 'mp4'
      : mime.includes('webm') ? 'webm'
      : 'jpg';
    try {
      const path = new URL(shareableUrl(url), window.location.origin).pathname;
      const base = decodeURIComponent(path.split('/').pop() || 'image');
      if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
      return `${base || 'image'}.${fallbackExt}`;
    } catch {
      return `image.${fallbackExt}`;
    }
  }

  function upscaledFileName(url: string): string {
    const base = fileNameFromUrl(url, 'image/png').replace(/\.[a-z0-9]+$/i, '');
    return `${base || 'image'}-anime4k.png`;
  }

  type OriginRect = {
    left: number;
    top: number;
    width: number;
    height: number;
    borderRadius?: string;
  };

  function mediaEl(stage: HTMLElement): HTMLElement | null {
    return stage.querySelector('img, video');
  }

  function clearStageInlineStyles(stage: HTMLElement) {
    stage.getAnimations().forEach((a) => a.cancel());
    stage.style.cssText = '';
    const media = mediaEl(stage);
    if (media) media.style.cssText = '';
  }

  /** Равномерный scale + сдвиг центров — без width/height на img (не сплющивает). */
  function flipMotion(
    origin: OriginRect,
    last: DOMRect,
  ): { dx: number; dy: number; scale: number } {
    const sx = origin.width / Math.max(1, last.width);
    const sy = origin.height / Math.max(1, last.height);
    const scale = Math.max(sx, sy);
    return {
      dx: origin.left + origin.width / 2 - (last.left + last.width / 2),
      dy: origin.top + origin.height / 2 - (last.top + last.height / 2),
      scale,
    };
  }

  function playOpen(origin: OriginRect) {
    const el = stageEl;
    if (!el || prefersReducedMotion()) return;
    clearStageInlineStyles(el);
    const last = el.getBoundingClientRect();
    if (last.width < 4 || last.height < 4) return;
    const { dx, dy, scale } = flipMotion(origin, last);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.92 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'none' },
    );
  }

  function stopUpscale() {
    upscaleToken += 1;
    upscaleBusy = false;
    upscaleActive = false;
    try {
      upscaleSession?.stop();
    } catch {
      /* ignore */
    }
    upscaleSession = null;
    const canvas = upscaleCanvasEl;
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = '';
      canvas.style.height = '';
      canvas.style.maxWidth = '';
      canvas.style.maxHeight = '';
      canvas.style.aspectRatio = '';
    }
    if (stageEl) clearStageInlineStyles(stageEl);
  }

  async function applyUpscale() {
    if (!item || item.kind === 'video' || !upscaleCanvasEl || !stageEl || upscaleBusy) return;
    upscaleBusy = true;

    if (!(await probeWebGpuAvailable())) {
      upscaleBusy = false;
      showToast('WebGPU недоступен для Anime4K', 'err');
      return;
    }

    const { enabled, mode } = mapAnime4kPreset({ type: upscaleType, intensity: upscaleIntensity });
    if (!enabled) {
      stopUpscale();
      return;
    }

    const token = ++upscaleToken;
    try {
      upscaleSession?.stop();
      upscaleSession = null;
      upscaleActive = false;
      clearStageInlineStyles(stageEl);

      upscaleCanvasEl.hidden = false;
      upscaleCanvasEl.removeAttribute('hidden');

      const proxied = toCdnProxyUrl(item.url) || item.url;
      const rawHttps = unwrapCdnUrl(item.url) || item.url;
      const result = await startAnime4kImageUpscale({
        imageUrl: proxied,
        imageUrls: [proxied, rawHttps, item.url],
        canvas: upscaleCanvasEl,
        mode,
        container: stageEl,
        fit: 'contain',
        targetHeight: anime4kTargetHeight(upscaleTargetRes),
        hideSourceClass: '',
        canvasVisibleClass: '',
        warmMs: 120,
      });

      if (token !== upscaleToken) {
        if (result.ok) result.session.stop();
        return;
      }
      if (!result.ok) {
        showToast(result.error || 'Не удалось запустить Anime4K', 'err');
        upscaleCanvasEl.width = 1;
        upscaleCanvasEl.height = 1;
        upscaleCanvasEl.style.width = '';
        upscaleCanvasEl.style.height = '';
        return;
      }

      upscaleSession = result.session;
      upscaleActive = true;
      upscalePanelOpen = false;
      // После показа img снова измерим и подгоним display (на случай смены layout)
      queueMicrotask(() => {
        const canvas = upscaleCanvasEl;
        const img = stageEl?.querySelector('img');
        if (!canvas || canvas.width < 2 || !img) return;
        const aspect = canvas.width / Math.max(1, canvas.height);
        const boxW = img.clientWidth;
        const boxH = img.clientHeight;
        if (boxW < 4 || boxH < 4) return;
        let w = boxW;
        let h = w / aspect;
        if (h > boxH) {
          h = boxH;
          w = h * aspect;
        }
        canvas.style.width = `${Math.round(w)}px`;
        canvas.style.height = `${Math.round(h)}px`;
        canvas.style.maxWidth = 'none';
        canvas.style.maxHeight = 'none';
      });
      showToast('Anime4K применён');
    } catch (err) {
      if (token === upscaleToken) {
        const msg = err instanceof Error && err.message ? err.message : 'Ошибка Anime4K';
        showToast(msg, 'err');
      }
    } finally {
      if (token === upscaleToken) upscaleBusy = false;
    }
  }

  async function closeWithMotion() {
    if (closing || !lightbox) return;
    closing = true;
    stopUpscale();
    upscalePanelOpen = false;
    const el = stageEl;
    const origin = lightbox.origin;
    if (el && origin && !prefersReducedMotion()) {
      clearStageInlineStyles(el);
      const last = el.getBoundingClientRect();
      const { dx, dy, scale } = flipMotion(origin, last);
      try {
        await el.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.45 },
          ],
          { duration: 240, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'none' },
        ).finished;
      } catch {
        /* ignore cancelled animation */
      }
    }
    closeFeedMediaLightbox();
    resetMobileView();
    gesturing = false;
    chromeHidden = false;
    closing = false;
    openedKey = '';
  }

  function triggerBlobDownload(blob: Blob, name: string) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1500);
  }

  async function downloadCurrent() {
    if (!item || downloadBusy) return;
    downloadBusy = true;
    try {
      if (upscaleActive && upscaleCanvasEl) {
        const blob = await snapshotCanvasImage(upscaleCanvasEl, 'image/png');
        if (blob) {
          triggerBlobDownload(blob, upscaledFileName(item.url));
          showToast('Улучшенное изображение сохранено');
          return;
        }
        showToast('Не удалось сохранить улучшенное изображение, скачиваю оригинал', 'err');
      }
      const fetchUrl = toCdnProxyUrl(item.url) || item.url;
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      triggerBlobDownload(blob, fileNameFromUrl(item.url, blob.type));
      showToast('Файл сохранён');
    } catch {
      try {
        const a = document.createElement('a');
        a.href = item.url;
        a.download = fileNameFromUrl(item.url);
        a.rel = 'noopener';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('Открываю файл для сохранения');
      } catch {
        showToast('Не удалось скачать', 'err');
      }
    } finally {
      downloadBusy = false;
    }
  }

  async function copyCurrentLink() {
    if (!item || copyBusy) return;
    copyBusy = true;
    try {
      await navigator.clipboard.writeText(shareableUrl(item.url));
      showToast('Ссылка скопирована');
    } catch {
      showToast('Не удалось скопировать ссылку', 'err');
    } finally {
      copyBusy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (!lightbox) return;
    if (e.key === 'Escape' || e.key === 'Back' || e.key === 'BrowserBack') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (upscalePanelOpen) {
        upscalePanelOpen = false;
        return;
      }
      void closeWithMotion();
      return;
    }
    if (!canNav) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepFeedMediaLightbox(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepFeedMediaLightbox(1);
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (mobile) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerStartX = e.clientX;
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerStartX == null) return;
    const dx = e.clientX - pointerStartX;
    pointerStartX = null;
    if (!canNav || Math.abs(dx) < 56) return;
    stepFeedMediaLightbox(dx > 0 ? -1 : 1);
  }

  async function loadUpscaleDefaults() {
    try {
      const api = (window as Window & { electron?: { getSettings?: () => Promise<Record<string, unknown>> } })
        .electron;
      const settings = await api?.getSettings?.();
      if (!settings) return;
      const preset = normalizeAnime4kPreset(settings);
      if (preset.type !== 'off') upscaleType = preset.type;
      upscaleIntensity = preset.intensity;
      upscaleTargetRes = normalizeAnime4kTargetRes(settings.upscaleTargetRes);
    } catch {
      /* ignore */
    }
  }

  $effect(() => {
    const next = lightbox;
    if (!next || closing) return;
    const key = currentKey(next);
    if (openedKey === key) return;
    openedKey = key;
    resetMobileView();
    stopUpscale();
    upscalePanelOpen = false;
    const origin = next.origin;
    queueMicrotask(() => {
      if (origin) playOpen(origin);
      overlayEl?.focus();
    });
  });

  $effect(() => {
    if (mobile) forceDarkSystemBars(!!lightbox);
  });

  onMount(() => {
    void probeWebGpuAvailable();
    void loadUpscaleDefaults();
    return () => {
      window.clearTimeout(tapTimer);
      if (mobile) forceDarkSystemBars(false);
      stopUpscale();
      document.body.style.overflow = '';
    };
  });
</script>

<svelte:window onkeydowncapture={onKey} />

{#if lightbox && item}
  <div
    bind:this={overlayEl}
    class="uiv2-media-lightbox"
    class:uiv2-media-lightbox--closing={closing}
    class:uiv2-media-lightbox--upscaled={upscaleActive}
    class:uiv2-media-lightbox--mobile={mobile}
    class:uiv2-media-lightbox--bare={mobile && chromeHidden}
    class:uiv2-media-lightbox--settle={mobile && !gesturing}
    style:--lightbox-drag={mobile ? dragProgress : undefined}
    role="dialog"
    aria-modal="true"
    aria-label="Просмотр изображения"
    tabindex="-1"
    onpointerdown={mobile ? onMobilePointerDown : undefined}
    onpointermove={mobile ? onMobilePointerMove : undefined}
    onpointerup={mobile ? onMobilePointerUp : undefined}
    onpointercancel={mobile ? onMobilePointerCancel : undefined}
  >
    <button
      type="button"
      class="uiv2-media-lightbox__backdrop"
      aria-label="Закрыть предпросмотр"
      onclick={() => void closeWithMotion()}
    ></button>

    <div class="uiv2-media-lightbox__toolbar">
      {#if canUpscale}
        <button
          type="button"
          class="uiv2-media-lightbox__tool"
          class:uiv2-media-lightbox__tool--active={upscaleActive || upscalePanelOpen}
          aria-label="Anime4K"
          title="Anime4K"
          aria-expanded={upscalePanelOpen}
          aria-controls="uiv2-media-lightbox-a4k"
          disabled={upscaleBusy}
          onclick={() => {
            if (!gpuOk) {
              showToast('WebGPU недоступен для Anime4K', 'err');
              return;
            }
            upscalePanelOpen = !upscalePanelOpen;
          }}
        >
          {@html iconSparkles(18)}
        </button>
      {/if}
      <button
        type="button"
        class="uiv2-media-lightbox__tool"
        aria-label={upscaleActive ? 'Скачать улучшенное изображение' : 'Скачать'}
        title={upscaleActive ? 'Скачать улучшенное изображение' : 'Скачать'}
        disabled={downloadBusy}
        onclick={() => void downloadCurrent()}
      >
        {@html iconDownload(18)}
      </button>
      <button
        type="button"
        class="uiv2-media-lightbox__tool"
        aria-label="Скопировать ссылку"
        title="Скопировать ссылку"
        disabled={copyBusy}
        onclick={() => void copyCurrentLink()}
      >
        {@html iconCopy(18)}
      </button>
      <button
        type="button"
        class="uiv2-media-lightbox__tool"
        aria-label="Закрыть"
        title="Закрыть"
        onclick={() => void closeWithMotion()}
      >
        {@html iconX(18)}
      </button>
    </div>

    {#if upscalePanelOpen && canUpscale}
      <div
        id="uiv2-media-lightbox-a4k"
        class="uiv2-media-lightbox__a4k"
        role="dialog"
        aria-label="Пресет Anime4K"
      >
        <p class="uiv2-media-lightbox__a4k-title">Anime4K</p>

        <div class="uiv2-media-lightbox__a4k-row" role="radiogroup" aria-label="Тип улучшения">
          {#each a4kTypes as opt (opt.id)}
            <button
              type="button"
              class="uiv2-media-lightbox__a4k-chip"
              class:uiv2-media-lightbox__a4k-chip--active={upscaleType === opt.id}
              aria-checked={upscaleType === opt.id}
              role="radio"
              disabled={upscaleBusy || !gpuOk}
              onclick={() => {
                upscaleType = opt.id;
              }}
            >
              {opt.label}{#if opt.recommended}<span aria-hidden="true"> ★</span>{/if}
            </button>
          {/each}
        </div>

        <div class="uiv2-media-lightbox__a4k-row" role="radiogroup" aria-label="Нагрузка">
          {#each ANIME4K_INTENSITIES as opt (opt.id)}
            <button
              type="button"
              class="uiv2-media-lightbox__a4k-chip"
              class:uiv2-media-lightbox__a4k-chip--active={upscaleIntensity === opt.id}
              aria-checked={upscaleIntensity === opt.id}
              role="radio"
              disabled={upscaleBusy || !gpuOk}
              onclick={() => {
                upscaleIntensity = opt.id;
              }}
            >
              {opt.label}
            </button>
          {/each}
        </div>

        <div class="uiv2-media-lightbox__a4k-row" role="radiogroup" aria-label="Целевое разрешение">
          {#each ANIME4K_TARGET_RES as opt (opt.id)}
            <button
              type="button"
              class="uiv2-media-lightbox__a4k-chip"
              class:uiv2-media-lightbox__a4k-chip--active={upscaleTargetRes === opt.id}
              aria-checked={upscaleTargetRes === opt.id}
              role="radio"
              disabled={upscaleBusy || !gpuOk}
              onclick={() => {
                upscaleTargetRes = opt.id;
              }}
            >
              {opt.label}
            </button>
          {/each}
        </div>

        <div class="uiv2-media-lightbox__a4k-actions">
          {#if upscaleActive}
            <button
              type="button"
              class="uiv2-media-lightbox__a4k-btn uiv2-media-lightbox__a4k-btn--ghost"
              disabled={upscaleBusy}
              onclick={() => {
                stopUpscale();
                upscalePanelOpen = false;
              }}
            >
              Оригинал
            </button>
          {/if}
          <button
            type="button"
            class="uiv2-media-lightbox__a4k-btn"
            disabled={upscaleBusy || !gpuOk}
            onclick={() => void applyUpscale()}
          >
            {upscaleBusy ? 'Обработка…' : upscaleActive ? 'Применить снова' : 'Улучшение'}
          </button>
        </div>
      </div>
    {/if}

    {#if canNav && !mobile}
      <button
        type="button"
        class="uiv2-media-lightbox__nav uiv2-media-lightbox__nav--prev"
        aria-label="Предыдущее"
        onclick={() => stepFeedMediaLightbox(-1)}
      >
        {@html iconChevronLeft(22)}
      </button>
      <button
        type="button"
        class="uiv2-media-lightbox__nav uiv2-media-lightbox__nav--next"
        aria-label="Следующее"
        onclick={() => stepFeedMediaLightbox(1)}
      >
        {@html iconChevronRight(22)}
      </button>
    {/if}

    {#if mobile && canNav}
      <!-- Соседние кадры стоят по бокам и едут вместе с пальцем -->
      {#each [-1, 1] as dir (dir)}
        {@const peek = lightbox.items[(lightbox.index + dir + total) % total]}
        <div
          class="uiv2-media-lightbox__peek"
          style:transform={`translate3d(calc(${dir * 100}% + ${dir * PEEK_GAP + swipeX}px), 0, 0)`}
          aria-hidden="true"
        >
          {#if peek.kind !== 'video'}
            <img src={toCdnProxyUrl(peek.url) || peek.url} alt="" decoding="async" draggable="false" />
          {/if}
        </div>
      {/each}
    {/if}

    <div
      bind:this={stageEl}
      class="uiv2-media-lightbox__stage"
      style:transform={mobile && dragY ? `translate3d(0, ${dragY}px, 0)` : undefined}
      role="group"
      aria-label="Изображение"
      onpointerdown={onPointerDown}
      onpointerup={onPointerUp}
      onpointercancel={() => {
        pointerStartX = null;
      }}
    >
      {#if item.kind === 'video'}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video src={item.url} controls playsinline autoplay></video>
      {:else}
        <img
          src={toCdnProxyUrl(item.url) || item.url}
          alt=""
          decoding="async"
          draggable="false"
          style:transform={mobile ? imgTransform : undefined}
          class:uiv2-media-lightbox__source--hidden={upscaleActive}
        />
        <canvas
          bind:this={upscaleCanvasEl}
          class="uiv2-media-lightbox__upscale"
          class:uiv2-media-lightbox__upscale--visible={upscaleActive}
          aria-hidden={!upscaleActive}
        ></canvas>
      {/if}
    </div>

    {#if canNav}
      <p class="uiv2-media-lightbox__count">{lightbox.index + 1} / {total}</p>
    {/if}
    {#if upscaleActive}
      <p class="uiv2-media-lightbox__badge">Anime4K</p>
    {/if}
  </div>
{/if}
