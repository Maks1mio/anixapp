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
};

export type VpnBannerStates = {
  rest: VpnBannerOverlay;
  hover: VpnBannerOverlay;
};

export const VPN_OVERLAY_PRESET: VpnBannerOverlay = {
  kicker: '',
  title: 'Сайт заблокирован',
  body: '',
  cta: '',
  textX: 0,
  textY: 15,
  textScale: 151,
  icon: 'wifi-off',
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
  return {
    kicker: asText(src.kicker, base.kicker),
    title: asText(src.title, base.title),
    body: asText(src.body, base.body),
    cta: asText(src.cta, base.cta),
    textX: clamp(asFinite(src.textX, base.textX), -50, 50),
    textY: clamp(asFinite(src.textY, base.textY), -50, 50),
    textScale: clamp(asFinite(src.textScale, base.textScale), 50, 180),
    icon: asIcon(src.icon, base.icon),
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
  return `${o.kicker}\n${o.title}\n${o.body}\n${o.cta}\n${o.textX}\n${o.textY}\n${o.textScale}\n${o.icon}`;
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

function layoutOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  overlay: VpnBannerOverlay,
): OverlayLayout {
  const copy = sanitizeVpnOverlay(overlay);
  const minSide = Math.min(w, h);
  const scale = copy.textScale / 100;
  const cx = w * 0.5 + (copy.textX / 100) * w;
  const iconY = h * 0.22 + (copy.textY / 100) * h;
  const iconR = minSide * 0.11 * scale;
  const font = '"IBM Plex Sans", "Segoe UI", sans-serif';
  const pad = w * 0.08;
  const maxW = w - pad * 2;
  const runs: TextRun[] = [];
  let y = iconY + iconR + h * 0.08 * scale;

  const push = (text: string, weight: string, size: number, gap: number, alpha: number) => {
    if (!text.trim()) return;
    ctx.font = `${weight} ${Math.round(size)}px ${font}`;
    const lines = wrapLines(ctx, text, maxW);
    for (const line of lines) {
      runs.push({ text: line, x: cx, y, size, weight, alpha });
      y += gap;
    }
  };

  push(copy.kicker, '600', minSide * 0.055 * scale, minSide * 0.08 * scale, 1);
  push(copy.title, '700', minSide * 0.078 * scale, minSide * 0.11 * scale, 1);
  push(copy.body, '500', minSide * 0.042 * scale, minSide * 0.058 * scale, 1);
  if (copy.body.trim()) y += minSide * 0.02 * scale;
  push(copy.cta, '500', minSide * 0.038 * scale, minSide * 0.055 * scale, 0.88);

  return {
    icon: copy.icon,
    iconX: cx,
    iconY,
    iconSize: iconR * 2,
    runs,
  };
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

function lerpRuns(a: TextRun[], b: TextRun[], t: number, x: number): TextRun[] {
  const n = Math.max(a.length, b.length);
  const out: TextRun[] = [];
  for (let i = 0; i < n; i += 1) {
    const from = a[i];
    const to = b[i];
    if (from && to && from.text === to.text) {
      out.push({
        text: from.text,
        x,
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
        x,
        y: to ? lerp(from.y, to.y, t) : from.y,
        size: to ? lerp(from.size, to.size, t) : from.size,
        alpha: from.alpha * (1 - t),
      });
    }
    if (to) {
      out.push({
        ...to,
        x,
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

  drawRuns(ctx, lerpRuns(layoutA.runs, layoutB.runs, k, mixed.iconX), minSide, w - w * 0.16, 1);
}
