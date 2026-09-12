import {
  bannerIconSvg,
  drawBannerIcon,
  VPN_BANNER_ICON_IDS,
} from './vpnBannerIcons';

export { bannerIconSvg, VPN_BANNER_ICONS } from './vpnBannerIcons';

export const VPN_67_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VPN_67_URL) || 'https://67vpn.ru';

export const VPN_67_COPY = {
  kicker: 'Сервис не доступен?',
  title: 'Используй 67 VPN',
  body: 'Белые списки. Стабильный VPN. 67 рублей. Дешевле обеда.',
  cta: 'Кликай по баннеру',
  aria: 'Реклама 67 VPN: стабильный VPN и белые списки за 67 рублей. Открыть сайт спонсора.',
};

export type AdLayerId = 'icon' | 'kicker' | 'title' | 'body' | 'cta';

export type VpnBannerOverlay = {
  kicker: string;
  title: string;
  body: string;
  cta: string;
  /** Смещение блока от центра, % ширины (−50…50). */
  textX: number;
  /** Смещение блока от базовой позиции, % высоты (−50…50). */
  textY: number;
  /** Масштаб текста и иконки, % (50…180). */
  textScale: number;
  icon: string;
  /** Смещения отдельных слоёв, % размера баннера (−50…50). */
  iconDX: number;
  iconDY: number;
  kickerDX: number;
  kickerDY: number;
  titleDX: number;
  titleDY: number;
  bodyDX: number;
  bodyDY: number;
  ctaDX: number;
  ctaDY: number;
};

export type VpnBannerStates = {
  rest: VpnBannerOverlay;
  hover: VpnBannerOverlay;
};

export type AdLayerBox = {
  id: AdLayerId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
};

const LAYER_ZERO = {
  iconDX: 0,
  iconDY: 0,
  kickerDX: 0,
  kickerDY: 0,
  titleDX: 0,
  titleDY: 0,
  bodyDX: 0,
  bodyDY: 0,
  ctaDX: 0,
  ctaDY: 0,
} as const;

export const VPN_OVERLAY_PRESET: VpnBannerOverlay = {
  kicker: '',
  title: 'Сайт заблокирован',
  body: '',
  cta: '',
  textX: 0,
  textY: 15,
  textScale: 151,
  icon: 'wifi-off',
  ...LAYER_ZERO,
};

export const VPN_OVERLAY_HOVER_PRESET: VpnBannerOverlay = {
  kicker: VPN_67_COPY.kicker,
  title: VPN_67_COPY.title,
  body: VPN_67_COPY.body,
  cta: VPN_67_COPY.cta,
  textX: 0,
  textY: 8,
  textScale: 100,
  icon: 'wifi',
  ...LAYER_ZERO,
};

export const VPN_BANNER_STATES_PRESET: VpnBannerStates = {
  rest: { ...VPN_OVERLAY_PRESET },
  hover: { ...VPN_OVERLAY_HOVER_PRESET },
};

const OVERLAY_STORAGE_KEY = 'anixapp.vpnBannerOverlay.v3';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function asFinite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value;
}

function asIcon(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !VPN_BANNER_ICON_IDS.has(value)) return fallback;
  return value;
}

export function sanitizeVpnOverlay(raw: Partial<VpnBannerOverlay> | null | undefined): VpnBannerOverlay {
  const src = raw ?? {};
  const base = VPN_OVERLAY_PRESET;
  const dx = (v: unknown) => clamp(asFinite(v, 0), -50, 50);
  return {
    kicker: asText(src.kicker, base.kicker),
    title: asText(src.title, base.title),
    body: asText(src.body, base.body),
    cta: asText(src.cta, base.cta),
    textX: clamp(asFinite(src.textX, base.textX), -50, 50),
    textY: clamp(asFinite(src.textY, base.textY), -50, 50),
    textScale: clamp(asFinite(src.textScale, base.textScale), 50, 180),
    icon: asIcon(src.icon, base.icon),
    iconDX: dx(src.iconDX),
    iconDY: dx(src.iconDY),
    kickerDX: dx(src.kickerDX),
    kickerDY: dx(src.kickerDY),
    titleDX: dx(src.titleDX),
    titleDY: dx(src.titleDY),
    bodyDX: dx(src.bodyDX),
    bodyDY: dx(src.bodyDY),
    ctaDX: dx(src.ctaDX),
    ctaDY: dx(src.ctaDY),
  };
}

export function sanitizeVpnBannerStates(raw: Partial<VpnBannerStates> | null | undefined): VpnBannerStates {
  const src = raw ?? {};
  return {
    rest: sanitizeVpnOverlay(src.rest ?? VPN_OVERLAY_PRESET),
    hover: sanitizeVpnOverlay(src.hover ?? src.rest ?? VPN_OVERLAY_PRESET),
  };
}

export function loadVpnBannerStates(): VpnBannerStates {
  if (typeof localStorage === 'undefined') return cloneStates(VPN_BANNER_STATES_PRESET);
  try {
    const raw = localStorage.getItem(OVERLAY_STORAGE_KEY);
    if (raw) return sanitizeVpnBannerStates(JSON.parse(raw) as Partial<VpnBannerStates>);
  } catch {
    /* ignore */
  }
  return cloneStates(VPN_BANNER_STATES_PRESET);
}

export function saveVpnBannerStates(states: VpnBannerStates): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(OVERLAY_STORAGE_KEY, JSON.stringify(sanitizeVpnBannerStates(states)));
  } catch {
    /* quota / private mode */
  }
}

export function overlaySignature(overlay: VpnBannerOverlay): string {
  const o = sanitizeVpnOverlay(overlay);
  return [
    o.kicker,
    o.title,
    o.body,
    o.cta,
    o.textX,
    o.textY,
    o.textScale,
    o.icon,
    o.iconDX,
    o.iconDY,
    o.kickerDX,
    o.kickerDY,
    o.titleDX,
    o.titleDY,
    o.bodyDX,
    o.bodyDY,
    o.ctaDX,
    o.ctaDY,
  ].join('\n');
}

export function statesSignature(states: VpnBannerStates): string {
  const s = sanitizeVpnBannerStates(states);
  return `${overlaySignature(s.rest)}||${overlaySignature(s.hover)}`;
}

export function cloneStates(states: VpnBannerStates): VpnBannerStates {
  return {
    rest: { ...states.rest },
    hover: { ...states.hover },
  };
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
): void {
  const iw = 'width' in img ? Number(img.width) || w : w;
  const ih = 'height' in img ? Number(img.height) || h : h;
  const scale = Math.max(w / Math.max(iw, 1), h / Math.max(ih, 1));
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

type TextRun = {
  role: AdLayerId;
  text: string;
  x: number;
  y: number;
  size: number;
  weight: string;
  alpha: number;
};

type OverlayLayout = {
  icon: string;
  iconX: number;
  iconY: number;
  iconSize: number;
  runs: TextRun[];
};

function layerOffset(
  overlay: VpnBannerOverlay,
  id: AdLayerId,
): { dx: number; dy: number } {
  switch (id) {
    case 'icon':
      return { dx: overlay.iconDX, dy: overlay.iconDY };
    case 'kicker':
      return { dx: overlay.kickerDX, dy: overlay.kickerDY };
    case 'title':
      return { dx: overlay.titleDX, dy: overlay.titleDY };
    case 'body':
      return { dx: overlay.bodyDX, dy: overlay.bodyDY };
    case 'cta':
      return { dx: overlay.ctaDX, dy: overlay.ctaDY };
  }
}

function layoutOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  overlay: VpnBannerOverlay,
): OverlayLayout {
  const copy = sanitizeVpnOverlay(overlay);
  const minSide = Math.min(w, h);
  const scale = copy.textScale / 100;
  const baseCx = w * 0.5 + (copy.textX / 100) * w;
  const baseIconY = h * 0.22 + (copy.textY / 100) * h;
  const iconOff = layerOffset(copy, 'icon');
  const iconX = baseCx + (iconOff.dx / 100) * w;
  const iconY = baseIconY + (iconOff.dy / 100) * h;
  const iconR = minSide * 0.11 * scale;
  const font = '"IBM Plex Sans", "Segoe UI", sans-serif';
  const pad = w * 0.08;
  const maxW = w - pad * 2;
  const runs: TextRun[] = [];
  let y = baseIconY + iconR + h * 0.08 * scale;

  const push = (
    role: AdLayerId,
    text: string,
    weight: string,
    size: number,
    gap: number,
    alpha: number,
  ) => {
    if (!text.trim()) return;
    const off = layerOffset(copy, role);
    const cx = baseCx + (off.dx / 100) * w;
    const dy = (off.dy / 100) * h;
    ctx.font = `${weight} ${Math.round(size)}px ${font}`;
    const lines = wrapLines(ctx, text, maxW);
    for (const line of lines) {
      runs.push({ role, text: line, x: cx, y: y + dy, size, weight, alpha });
      y += gap;
    }
  };

  push('kicker', copy.kicker, '600', minSide * 0.055 * scale, minSide * 0.08 * scale, 1);
  push('title', copy.title, '700', minSide * 0.078 * scale, minSide * 0.11 * scale, 1);
  push('body', copy.body, '500', minSide * 0.042 * scale, minSide * 0.058 * scale, 1);
  if (copy.body.trim()) y += minSide * 0.02 * scale;
  push('cta', copy.cta, '500', minSide * 0.038 * scale, minSide * 0.055 * scale, 0.88);

  return {
    icon: copy.icon,
    iconX,
    iconY,
    iconSize: iconR * 2,
    runs,
  };
}

/** CSS-пиксельные bbox слоёв для редактора (как в Figma). */
export function measureAdLayers(
  cssW: number,
  cssH: number,
  overlay: VpnBannerOverlay,
): AdLayerBox[] {
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const layout = layoutOverlay(ctx, w, h, overlay);
  const copy = sanitizeVpnOverlay(overlay);
  const labels: Record<AdLayerId, string> = {
    icon: 'Icon',
    kicker: 'Kicker',
    title: copy.title.trim() || 'Title',
    body: copy.body.trim() ? copy.body.trim().slice(0, 28) : 'Body',
    cta: copy.cta.trim() || 'CTA',
  };
  const boxes: AdLayerBox[] = [];

  const iconHalf = layout.iconSize / 2;
  boxes.push({
    id: 'icon',
    label: labels.icon,
    x: layout.iconX - iconHalf,
    y: layout.iconY - iconHalf,
    w: layout.iconSize,
    h: layout.iconSize,
    visible: true,
  });

  for (const role of ['kicker', 'title', 'body', 'cta'] as AdLayerId[]) {
    const runs = layout.runs.filter((r) => r.role === role);
    if (runs.length === 0) {
      boxes.push({
        id: role,
        label: labels[role],
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        visible: false,
      });
      continue;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const run of runs) {
      ctx.font = `${run.weight} ${Math.round(run.size)}px "IBM Plex Sans", "Segoe UI", sans-serif`;
      const tw = ctx.measureText(run.text).width;
      minX = Math.min(minX, run.x - tw / 2);
      maxX = Math.max(maxX, run.x + tw / 2);
      minY = Math.min(minY, run.y);
      maxY = Math.max(maxY, run.y + run.size * 1.15);
    }
    boxes.push({
      id: role,
      label: labels[role],
      x: minX,
      y: minY,
      w: Math.max(1, maxX - minX),
      h: Math.max(1, maxY - minY),
      visible: true,
    });
  }

  return boxes;
}

export const AD_LAYER_META: Array<{ id: AdLayerId; name: string }> = [
  { id: 'icon', name: 'Icon' },
  { id: 'kicker', name: 'Kicker' },
  { id: 'title', name: 'Title' },
  { id: 'body', name: 'Body' },
  { id: 'cta', name: 'CTA' },
];

export function layerOffsetKeys(id: AdLayerId): { dx: keyof VpnBannerOverlay; dy: keyof VpnBannerOverlay } {
  switch (id) {
    case 'icon':
      return { dx: 'iconDX', dy: 'iconDY' };
    case 'kicker':
      return { dx: 'kickerDX', dy: 'kickerDY' };
    case 'title':
      return { dx: 'titleDX', dy: 'titleDY' };
    case 'body':
      return { dx: 'bodyDX', dy: 'bodyDY' };
    case 'cta':
      return { dx: 'ctaDX', dy: 'ctaDY' };
  }
}

function lerpLayout(a: OverlayLayout, b: OverlayLayout, t: number): OverlayLayout {
  return {
    icon: t < 0.5 ? a.icon : b.icon,
    iconX: lerp(a.iconX, b.iconX, t),
    iconY: lerp(a.iconY, b.iconY, t),
    iconSize: lerp(a.iconSize, b.iconSize, t),
    runs: [],
  };
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  size: number,
  alpha: number,
): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(4, size * 0.12);
  drawBannerIcon(ctx, id, x, y, size);
  ctx.restore();
}

function drawRuns(
  ctx: CanvasRenderingContext2D,
  runs: TextRun[],
  minSide: number,
  maxW: number,
  alphaMul: number,
): void {
  const font = '"IBM Plex Sans", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(4, minSide * 0.02);
  for (const run of runs) {
    const a = run.alpha * alphaMul;
    if (a <= 0.01 || !run.text) continue;
    ctx.globalAlpha = a;
    ctx.font = `${run.weight} ${Math.round(run.size)}px ${font}`;
    ctx.fillText(run.text, run.x, run.y, maxW);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function lerpRuns(a: TextRun[], b: TextRun[], t: number): TextRun[] {
  const n = Math.max(a.length, b.length);
  const out: TextRun[] = [];
  for (let i = 0; i < n; i += 1) {
    const from = a[i];
    const to = b[i];
    if (from && to && from.text === to.text && from.role === to.role) {
      out.push({
        role: from.role,
        text: from.text,
        x: lerp(from.x, to.x, t),
        y: lerp(from.y, to.y, t),
        size: lerp(from.size, to.size, t),
        weight: t < 0.5 ? from.weight : to.weight,
        alpha: lerp(from.alpha, to.alpha, t),
      });
      continue;
    }
    if (from) {
      out.push({
        ...from,
        x: to ? lerp(from.x, to.x, t) : from.x,
        y: to ? lerp(from.y, to.y, t) : from.y,
        size: to ? lerp(from.size, to.size, t) : from.size,
        alpha: from.alpha * (1 - t),
      });
    }
    if (to) {
      out.push({
        ...to,
        x: from ? lerp(from.x, to.x, t) : to.x,
        y: from ? lerp(from.y, to.y, t) : to.y,
        size: from ? lerp(from.size, to.size, t) : to.size,
        alpha: to.alpha * t,
      });
    }
  }
  return out;
}

export function composeVpnSponsorFrame(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
  rest: VpnBannerOverlay = VPN_OVERLAY_PRESET,
  hover: VpnBannerOverlay = rest,
  t = 0,
): void {
  const from = sanitizeVpnOverlay(rest);
  const to = sanitizeVpnOverlay(hover);
  const k = clamp(t, 0, 1);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, w, h);
  drawCover(ctx, img, w, h);

  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(0,0,0,0.38)');
  shade.addColorStop(0.38, 'rgba(0,0,0,0.52)');
  shade.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  const layoutA = layoutOverlay(ctx, w, h, from);
  const layoutB = layoutOverlay(ctx, w, h, to);
  const mixed = lerpLayout(layoutA, layoutB, k);
  const minSide = Math.min(w, h);

  if (layoutA.icon === layoutB.icon) {
    drawIcon(ctx, layoutA.icon, mixed.iconX, mixed.iconY, mixed.iconSize, 1);
  } else {
    drawIcon(ctx, layoutA.icon, mixed.iconX, mixed.iconY, mixed.iconSize, 1 - k);
    drawIcon(ctx, layoutB.icon, mixed.iconX, mixed.iconY, mixed.iconSize, k);
  }

  drawRuns(ctx, lerpRuns(layoutA.runs, layoutB.runs, k), minSide, w - w * 0.16, 1);
}
