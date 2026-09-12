/**
 * Standalone CRT ad player for AnixBack /embed/ads/*
 * Bundled into anixback/public/ads-embed/player.js
 */
import {
  CrtScreenRenderer,
  cloneCrtStates,
  isCrtScreenSupported,
  mixCrtParams,
  sanitizeCrtStates,
  type CrtScreenStates,
} from '../utils/crtScreen';
import {
    cloneStates,
    composeVpnSponsorFrame,
    sanitizeVpnBannerStates,
    statesSignature,
    type VpnBannerOverlay,
    type VpnBannerStates,
} from '../utils/vpnSponsorBanner';
import {
    isDesignStates,
    sanitizeDesignStates,
    type AdDesignDoc,
    type AdDesignStates,
} from '../utils/adDesignDoc';
import { composeAdDesign, designHasCrt } from '../utils/composeAdDesign';
import { alignDesignPair, easeInOutCubic, stepHoverT } from '../utils/adDesignMotion';

type AdPayload = {
  id?: string;
  href?: string;
  width?: string;
  height?: string;
  aspectRatio?: string;
  imageUrl?: string | null;
  updatedAt?: string;
  crt?: CrtScreenStates;
  overlay?: VpnBannerStates;
  design?: AdDesignStates;
  title?: string;
};

type Boot = { id?: string | null; slot?: string | null };

declare global {
  interface Window {
    __ANIX_AD_BOOT__?: Boot;
  }
}

const CLICK_MSG = 'anix-ad-click';

function resolveImageUrl(url: string | null | undefined, stamp?: string | null): string {
  const value = String(url ?? '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return stamp ? `${value}${value.includes('?') ? '&' : '?'}t=${encodeURIComponent(stamp)}` : value;
  }
  const abs = `${window.location.origin}${value.startsWith('/') ? value : `/${value}`}`;
  return stamp ? `${abs}${abs.includes('?') ? '&' : '?'}t=${encodeURIComponent(stamp)}` : abs;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    try {
      const origin = new URL(src, window.location.href).origin;
      if (origin !== window.location.origin) img.crossOrigin = 'anonymous';
    } catch {
      /* ignore */
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed'));
    img.src = src;
  });
}

function makeFallbackArt(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 440;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#121218';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

async function fetchAd(boot: Boot): Promise<AdPayload | null> {
  let url = '';
  if (boot.id) url = `/api/ads/${encodeURIComponent(boot.id)}`;
  else if (boot.slot) url = `/api/ads/embed/${encodeURIComponent(boot.slot)}`;
  else return null;
  const bust = new URLSearchParams(window.location.search).get('t') || String(Date.now());
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}t=${encodeURIComponent(bust)}`, {
    credentials: 'omit',
    cache: 'no-store',
  });
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error(`ad fetch ${res.status}`);
  return res.json() as Promise<AdPayload>;
}

function openHref(href: string) {
  const url = href.trim();
  if (!url) return;
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: CLICK_MSG, href: url }, '*');
      return;
    } catch {
      /* fall through */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function showEmpty(root: HTMLElement, text: string) {
  root.innerHTML = `<div class="empty">${text}</div>`;
}

async function start() {
  const root = document.getElementById('root');
  if (!root) return;
  const boot: Boot = window.__ANIX_AD_BOOT__ ?? {};
  let ad: AdPayload | null = null;
  try {
    ad = await fetchAd(boot);
  } catch (err) {
    console.warn('[ads-embed]', err);
    showEmpty(root, 'Не удалось загрузить рекламу');
    return;
  }
  if (!ad) {
    showEmpty(root, 'Реклама не найдена');
    return;
  }

  const crtStates = cloneCrtStates(sanitizeCrtStates(ad.crt));
  const overlayStates = cloneStates(sanitizeVpnBannerStates(ad.overlay));
  const designStates: AdDesignStates | null = isDesignStates(ad.design)
    ? alignDesignPair(
        sanitizeDesignStates(ad.design).rest,
        sanitizeDesignStates(ad.design).hover,
      )
    : null;
  const href = String(ad.href ?? '').trim();

  try {
    await document.fonts?.load('700 32px "IBM Plex Sans"');
    await document.fonts?.ready;
  } catch {
    /* fallback stack */
  }

  root.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', ad.title || 'Реклама');
  root.appendChild(canvas);

  let art: CanvasImageSource = makeFallbackArt();
  const imgUrl = resolveImageUrl(ad.imageUrl, ad.updatedAt);
  if (imgUrl) {
    try {
      art = await loadImage(imgUrl);
    } catch {
      /* keep fallback */
    }
  }

  let renderer: CrtScreenRenderer | null = null;
  let engine: 'none' | 'webgl' | '2d' = 'none';
  let source: HTMLCanvasElement | null = null;
  let raf = 0;
  let pointerHover = false;
  let hoverT = 0;
  let lastTime = 0;
  let lastCssW = 0;
  let lastCssH = 0;
  let lastDpr = 0;
  let lastOverlayKey = '';
  let visible = true;
  let composeBusy = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const useDesign = Boolean(designStates);

  if (!useDesign) {
    try {
      if (isCrtScreenSupported()) {
        renderer = new CrtScreenRenderer(canvas);
        engine = 'webgl';
      }
    } catch (err) {
      console.warn('[ads-embed] webgl fallback', err);
      renderer = null;
    }
  }
  if (!renderer) engine = '2d';

  const pickDesign = (): AdDesignDoc | null => {
    if (!designStates) return null;
    return designStates.rest;
  };

  const paintSource = async (
    cssW: number,
    cssH: number,
    dpr: number,
    rest: VpnBannerOverlay,
    hover: VpnBannerOverlay,
    t: number,
  ) => {
    const sw = Math.max(1, Math.round(cssW * dpr));
    const sh = Math.max(1, Math.round(cssH * dpr));
    if (!source) source = document.createElement('canvas');
    if (source.width !== sw || source.height !== sh) {
      source.width = sw;
      source.height = sh;
    }
    const ctx = source.getContext('2d', { alpha: true });
    if (!ctx) return;
    composeVpnSponsorFrame(ctx, art, sw, sh, rest, hover, t);
    renderer?.setSource(source);
  };

  const paintDesign = async (
    t: number,
    cssW: number,
    cssH: number,
    dpr: number,
    timeMs: number,
  ) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const design = pickDesign();
    if (!design) return;
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    await composeAdDesign(ctx, design, canvas.width, canvas.height, designStates?.hover ?? null, t, timeMs);
  };

  const paintFallback = async (
    rest: VpnBannerOverlay,
    hover: VpnBannerOverlay,
    t: number,
    cssW: number,
    cssH: number,
    dpr: number,
  ) => {
    if (engine !== '2d') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    composeVpnSponsorFrame(ctx, art, canvas.width, canvas.height, rest, hover, t);
  };

  const drawFrame = (timeMs: number) => {
    const cssW = Math.max(1, root.clientWidth);
    const cssH = Math.max(1, root.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const dt = lastTime ? Math.min(48, Math.max(0, timeMs - lastTime)) : 16;
    lastTime = timeMs;
    const target = pointerHover ? 1 : 0;
    hoverT = reduced ? target : stepHoverT(hoverT, target, dt);
    const eased = easeInOutCubic(hoverT);
    const designKey = designStates
      ? `d2:${designStates.rest.rootId}:${Object.keys(designStates.rest.nodes).length}:${Object.keys(designStates.hover.nodes).length}`
      : '';
    const overlayKey = `${designKey}|${statesSignature(overlayStates)}|${hoverT.toFixed(3)}`;
    const sizeChanged = cssW !== lastCssW || cssH !== lastCssH || dpr !== lastDpr;
    if (sizeChanged) {
      lastCssW = cssW;
      lastCssH = cssH;
      lastDpr = dpr;
      renderer?.resize(cssW, cssH, dpr);
    }

    if (useDesign) {
      const hasCrt = designHasCrt(designStates!.rest) || designHasCrt(designStates!.hover);
      const fxTime = reduced ? 0 : timeMs;
      if (!composeBusy && (hasCrt || sizeChanged || overlayKey !== lastOverlayKey)) {
        lastOverlayKey = overlayKey;
        composeBusy = true;
        void paintDesign(hoverT, cssW, cssH, dpr, fxTime).finally(() => {
          composeBusy = false;
        });
      }
      return;
    }

    if (sizeChanged || overlayKey !== lastOverlayKey) {
      lastOverlayKey = overlayKey;
      if (engine === 'webgl') {
        void paintSource(cssW, cssH, dpr, overlayStates.rest, overlayStates.hover, eased);
      } else {
        void paintFallback(overlayStates.rest, overlayStates.hover, eased, cssW, cssH, dpr);
      }
    }
    if (engine !== 'webgl' || !renderer) return;
    const live = mixCrtParams(crtStates.rest, crtStates.hover, eased);
    renderer.setParams(
      reduced
        ? { ...live, speed: 0, flicker: 0, jitter: 0, rollSpeed: 0 }
        : live,
    );
    renderer.render(reduced ? 0 : timeMs);
  };

  const stopLoop = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const loop = (now: number) => {
    raf = 0;
    if (!visible || document.hidden) return;
    if (reduced) hoverT = pointerHover ? 1 : 0;
    drawFrame(now);
    const hoverBusy = Math.abs((pointerHover ? 1 : 0) - hoverT) > 0.002;
    if (!reduced || hoverBusy) raf = requestAnimationFrame(loop);
  };

  const startLoop = () => {
    if (raf || !visible || document.hidden) return;
    raf = requestAnimationFrame(loop);
  };

  root.addEventListener('pointerenter', () => {
    pointerHover = true;
    startLoop();
  });
  root.addEventListener('pointerleave', () => {
    pointerHover = false;
    startLoop();
  });
  canvas.addEventListener('click', (e) => {
    e.preventDefault();
    openHref(href);
  });

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (!visible) stopLoop();
    else startLoop();
  });
  io.observe(root);

  const ro = new ResizeObserver(() => startLoop());
  ro.observe(root);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else startLoop();
  });

  drawFrame(performance.now());
  startLoop();
}

void start();
