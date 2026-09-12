import type { AdDesignDoc, AdFrameNode, AdNode, AdPaint, AdTextNode } from './adDesignDoc';
import { getRoot, listChildren, stopCssColor } from './adDesignDoc';
import { easeInOutCubic, mixNodeVisual, nodeOpacity } from './adDesignMotion';
import { applyCrtFilter, sanitizeCrtParams, type CrtScreenParams } from './crtScreen';
import { isSvgDataUrl, parseSvgDataUrlColor, tintSvgDataUrl } from './svgTint';

const imageCache = new Map<string, HTMLImageElement | 'error'>();
const imageInflight = new Map<string, Promise<HTMLImageElement | null>>();

let srcResolver: ((src: string) => string) | null = null;

/** Editor: rewrite `/uploads/...` to the AnixBack origin. Embed leaves src as-is. */
export function setAdComposeSrcResolver(fn: ((src: string) => string) | null): void {
  srcResolver = fn;
  imageCache.clear();
  imageInflight.clear();
}

function resolveComposeSrc(src: string): string {
  const raw = String(src || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  return srcResolver ? (srcResolver(raw) || raw) : raw;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  const url = resolveComposeSrc(src);
  if (!url) return Promise.resolve(null);
  const hit = imageCache.get(url);
  if (hit === 'error') return Promise.resolve(null);
  if (hit) return Promise.resolve(hit);
  const pending = imageInflight.get(url);
  if (pending) return pending;
  const job = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    try {
      if (!url.startsWith('data:') && !url.startsWith('blob:')) {
        const origin = new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost').origin;
        if (typeof location !== 'undefined' && origin !== location.origin) img.crossOrigin = 'anonymous';
      }
    } catch {
      /* ignore */
    }
    img.onload = () => {
      imageInflight.delete(url);
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => {
      imageInflight.delete(url);
      imageCache.set(url, 'error');
      resolve(null);
    };
    img.src = url;
  });
  imageInflight.set(url, job);
  return job;
}

function paintColor(p: AdPaint): string {
  if (p.type === 'solid') {
    const a = Math.round(Math.min(1, Math.max(0, p.opacity)) * 255)
      .toString(16)
      .padStart(2, '0');
    const c = p.color.replace('#', '');
    if (c.length === 6) return `#${c}${a}`;
    return p.color;
  }
  return '#ffffff';
}

function fontWeightCss(weight: number): string {
  const w = Math.round(weight);
  if (w >= 700) return '700';
  if (w >= 600) return '600';
  if (w >= 500) return '500';
  return '400';
}

function applyTextStyle(ctx: CanvasRenderingContext2D, node: Extract<AdNode, { type: 'text' }>) {
  ctx.font = `${fontWeightCss(node.fontWeight)} ${Math.round(node.fontSize)}px ${node.fontFamily}, "Segoe UI", sans-serif`;
  const letter = (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing;
  if (letter !== undefined) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      `${node.letterSpacing || 0}px`;
  }
}

async function drawPaint(
  ctx: CanvasRenderingContext2D,
  paints: AdPaint[],
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0,
) {
  const layers = (paints ?? []).filter((p) => p && p.visible !== false && p.opacity > 0.001);
  for (let i = layers.length - 1; i >= 0; i--) {
    const p = layers[i]!;
    ctx.save();
    if (radius > 0) {
      roundRect(ctx, x, y, w, h, radius);
      ctx.clip();
    }
    ctx.globalAlpha *= p.opacity;
    if (p.type === 'solid') {
      ctx.fillStyle = p.color;
      if (radius > 0) {
        roundRect(ctx, x, y, w, h, radius);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    } else if (p.type === 'image' && p.src) {
      const img = await loadImage(p.src);
      if (img) {
        if (p.scaleMode === 'tile') {
          const pat = ctx.createPattern(img, 'repeat');
          if (pat) {
            ctx.fillStyle = pat;
            ctx.fillRect(x, y, w, h);
          }
        } else {
          drawImageCover(ctx, img, x, y, w, h, p.scaleMode === 'fit' ? 'fit' : 'fill');
        }
      }
    } else if (p.type === 'gradient') {
      const g = linearGradient(ctx, x, y, w, h, p.angle ?? 180);
      addGradientStops(g, p.stops);
      ctx.fillStyle = g;
      if (radius > 0) {
        roundRect(ctx, x, y, w, h, radius);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, h);
      }
    }
    ctx.restore();
  }
}

function linearGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  angleDeg: number,
): CanvasGradient {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const len = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  return ctx.createLinearGradient(cx - dx * len, cy - dy * len, cx + dx * len, cy + dy * len);
}

function addGradientStops(g: CanvasGradient, stops: Array<{ color: string; position: number; opacity?: number }>) {
  const sorted = [...stops]
    .map((s) => ({
      color: stopCssColor(s),
      position: Math.min(1, Math.max(0, s.position)),
    }))
    .sort((a, b) => a.position - b.position);
  if (!sorted.length) {
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, '#fff');
    return;
  }
  let last = -1;
  for (const s of sorted) {
    let pos = s.position;
    if (pos <= last) pos = Math.min(1, last + 0.0001);
    last = pos;
    try {
      g.addColorStop(pos, s.color);
    } catch {
      /* invalid color */
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: 'fill' | 'fit',
) {
  const anyImg = img as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const iw = Number(anyImg.naturalWidth || anyImg.width) || 0;
  const ih = Number(anyImg.naturalHeight || anyImg.height) || 0;
  if (!iw || !ih) return;
  const scale = mode === 'fit' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function paintFillStyle(
  ctx: CanvasRenderingContext2D,
  p: AdPaint,
  x: number,
  y: number,
  w: number,
  h: number,
): string | CanvasGradient | CanvasPattern | null {
  if (p.type === 'solid') return p.color;
  if (p.type === 'gradient') {
    const g = linearGradient(ctx, x, y, w, h, p.angle ?? 180);
    addGradientStops(g, p.stops);
    return g;
  }
  return null;
}

async function drawTextNode(ctx: CanvasRenderingContext2D, node: Extract<AdNode, { type: 'text' }>, x: number, y: number, alphaMul = 1) {
  const paints = (node.fills ?? []).filter((p) => p.visible !== false && p.opacity > 0.001 && p.type !== 'image');
  const ordered = [...paints].reverse();
  ctx.save();
  ctx.globalAlpha *= alphaMul;
  ctx.textAlign = node.textAlign;
  ctx.textBaseline = node.verticalAlign === 'middle' ? 'middle' : node.verticalAlign === 'bottom' ? 'bottom' : 'top';
  applyTextStyle(ctx, node);
  let tx = x;
  if (node.textAlign === 'center') tx = x + node.w / 2;
  if (node.textAlign === 'right') tx = x + node.w;
  let ty = y;
  if (node.verticalAlign === 'middle') ty = y + node.h / 2;
  if (node.verticalAlign === 'bottom') ty = y + node.h;
  const lh = node.lineHeight === 'auto' ? node.fontSize * 1.25 : node.lineHeight;
  const lines = wrapText(ctx, node.characters, node.w);
  const paintsOrDefault = ordered.length ? ordered : [{ type: 'solid' as const, color: '#fff', opacity: 1, id: 'd', visible: true }];
  for (let pi = 0; pi < paintsOrDefault.length; pi++) {
    const p = paintsOrDefault[pi]!;
    ctx.save();
    ctx.globalAlpha *= p.opacity;
    const style = paintFillStyle(ctx, p, x, y, node.w, node.h);
    ctx.fillStyle = style || '#fff';
    if (pi === 0 && alphaMul > 0.92) {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = Math.max(3, Math.min(node.w, node.h) * 0.03);
      ctx.shadowOffsetY = 1;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
    let lineY = ty;
    if (node.verticalAlign === 'middle') lineY = ty - ((lines.length - 1) * lh) / 2;
    if (node.verticalAlign === 'bottom') lineY = ty - (lines.length - 1) * lh;
    for (const line of lines) {
      ctx.fillText(line, tx, lineY, node.w);
      lineY += lh;
    }
    ctx.restore();
  }
  ctx.restore();
}

async function drawImageNode(
  ctx: CanvasRenderingContext2D,
  node: Extract<AdNode, { type: 'image' }>,
  x: number,
  y: number,
  alphaMul = 1,
) {
  let src = node.src;
  if (isSvgDataUrl(src)) {
    const color = node.tint || parseSvgDataUrlColor(src) || '#ffffff';
    src = tintSvgDataUrl(src, color);
  }
  const img = await loadImage(src);
  ctx.save();
  ctx.globalAlpha *= alphaMul;
  if (node.cornerRadius > 0) {
    roundRect(ctx, x, y, node.w, node.h, node.cornerRadius);
    ctx.clip();
  }
  if (img) drawImageCover(ctx, img, x, y, node.w, node.h, node.scaleMode === 'fit' ? 'fit' : 'fill');
  if (node.fills?.length) await drawPaint(ctx, node.fills, x, y, node.w, node.h, 0);
  ctx.restore();
}

const layerPool: HTMLCanvasElement[] = [];

function acquireLayer(w: number, h: number): HTMLCanvasElement {
  const c = layerPool.pop() ?? document.createElement('canvas');
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  } else {
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
  return c;
}

function releaseLayer(c: HTMLCanvasElement) {
  if (layerPool.length < 8) layerPool.push(c);
}

function visibleCrtParams(node: AdNode): CrtScreenParams | null {
  const fx = node.effects?.find((e) => e.type === 'crt' && e.visible);
  if (!fx || fx.type !== 'crt') return null;
  return sanitizeCrtParams(fx.params);
}

function dissolveAlphas(t: number): { outA: number; inA: number } {
  const x = Math.min(1, Math.max(0, t));
  const smooth = (v: number) => {
    const u = Math.min(1, Math.max(0, v));
    return u * u * (3 - 2 * u);
  };
  return { outA: 1 - smooth(x), inA: smooth(x) };
}

function textForFade(from: AdTextNode, box: AdTextNode): AdTextNode {
  return {
    ...from,
    type: 'text',
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rotation: box.rotation,
    fontSize: box.fontSize,
    letterSpacing: box.letterSpacing,
    opacity: 1,
    visible: true,
  };
}

async function paintNodeBody(
  ctx: CanvasRenderingContext2D,
  doc: AdDesignDoc,
  restNode: AdNode,
  mixed: AdNode,
  counterpart: AdNode | undefined,
  x: number,
  y: number,
  hoverDoc: AdDesignDoc | null | undefined,
  t: number,
  timeMs: number,
) {
  if (mixed.type === 'frame') {
    if (mixed.clipsContent) {
      roundRect(ctx, x, y, mixed.w, mixed.h, mixed.cornerRadius);
      ctx.clip();
    }
    await drawPaint(ctx, mixed.fills, x, y, mixed.w, mixed.h, mixed.cornerRadius);
    for (const stroke of mixed.strokes) {
      ctx.save();
      ctx.globalAlpha *= stroke.opacity;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.weight;
      roundRect(ctx, x, y, mixed.w, mixed.h, mixed.cornerRadius);
      ctx.stroke();
      ctx.restore();
    }
    for (const child of listChildren(doc, mixed.id)) {
      await drawNode(ctx, doc, child, x, y, hoverDoc, t, timeMs);
    }
  } else if (mixed.type === 'rectangle') {
    await drawPaint(ctx, mixed.fills, x, y, mixed.w, mixed.h, mixed.cornerRadius);
    for (const stroke of mixed.strokes) {
      ctx.save();
      ctx.globalAlpha *= stroke.opacity;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.weight;
      roundRect(ctx, x, y, mixed.w, mixed.h, mixed.cornerRadius);
      ctx.stroke();
      ctx.restore();
    }
  } else if (mixed.type === 'image') {
    const restImg = restNode.type === 'image' ? restNode : mixed;
    const other = counterpart && counterpart.type === 'image' ? counterpart : null;
    if (other && other.src !== restImg.src && t > 0.02 && t < 0.98) {
      await drawImageNode(ctx, { ...mixed, src: restImg.src, scaleMode: restImg.scaleMode }, x, y, 1 - t);
      await drawImageNode(ctx, { ...mixed, src: other.src, scaleMode: other.scaleMode }, x, y, t);
    } else {
      await drawImageNode(ctx, mixed, x, y, 1);
    }
  } else if (mixed.type === 'text') {
    const restText = restNode.type === 'text' ? restNode : mixed;
    const hoverText = counterpart && counterpart.type === 'text' ? counterpart : null;
    const fadeT = Math.min(1, Math.max(0, t));
    const fadeCopy =
      hoverText
      && fadeT > 0.001
      && fadeT < 0.999
      && (
        hoverText.characters !== restText.characters
        || hoverText.textAlign !== restText.textAlign
        || hoverText.verticalAlign !== restText.verticalAlign
      );
    if (fadeCopy) {
      const { outA, inA } = dissolveAlphas(fadeT);
      if (outA > 0.01) {
        await drawTextNode(ctx, textForFade(restText, mixed), x, y, outA);
      }
      if (inA > 0.01) {
        await drawTextNode(ctx, textForFade(hoverText, mixed), x, y, inA);
      }
    } else {
      await drawTextNode(ctx, mixed, x, y, 1);
    }
  }
}

async function drawNode(
  ctx: CanvasRenderingContext2D,
  doc: AdDesignDoc,
  node: AdNode,
  ox: number,
  oy: number,
  hoverDoc?: AdDesignDoc | null,
  t = 0,
  timeMs = 0,
) {
  const counterpart = hoverDoc?.nodes[node.id];
  const motionT = easeInOutCubic(t);
  const mixed = counterpart && counterpart.type === node.type ? mixNodeVisual(node, counterpart, motionT) : node;
  if (nodeOpacity(mixed) <= 0.001) return;
  const x = ox + mixed.x;
  const y = oy + mixed.y;
  ctx.save();
  ctx.globalAlpha *= mixed.opacity;
  if (mixed.rotation) {
    ctx.translate(x + mixed.w / 2, y + mixed.h / 2);
    ctx.rotate((mixed.rotation * Math.PI) / 180);
    ctx.translate(-(x + mixed.w / 2), -(y + mixed.h / 2));
  }

  const crtParams = visibleCrtParams(mixed);
  if (crtParams && mixed.w > 0.5 && mixed.h > 0.5 && typeof document !== 'undefined') {
    const m = ctx.getTransform();
    const scaleX = Math.hypot(m.a, m.b) || 1;
    const scaleY = Math.hypot(m.c, m.d) || 1;
    const pxW = Math.max(1, Math.min(4096, Math.round(mixed.w * scaleX)));
    const pxH = Math.max(1, Math.min(4096, Math.round(mixed.h * scaleY)));
    const layer = acquireLayer(pxW, pxH);
    try {
      const lctx = layer.getContext('2d', { alpha: true });
      if (lctx) {
        lctx.setTransform(pxW / Math.max(1, mixed.w), 0, 0, pxH / Math.max(1, mixed.h), 0, 0);
        await paintNodeBody(lctx, doc, node, mixed, counterpart, 0, 0, hoverDoc, t, timeMs);
        const filtered = applyCrtFilter(layer, crtParams, timeMs);
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        ctx.drawImage(filtered ?? layer, x, y, mixed.w, mixed.h);
      }
    } finally {
      releaseLayer(layer);
    }
  } else {
    await paintNodeBody(ctx, doc, node, mixed, counterpart, x, y, hoverDoc, t, timeMs);
  }
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const paragraphs = String(text || '').split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = words[0]!;
    for (let i = 1; i < words.length; i++) {
      const next = `${line} ${words[i]}`;
      if (ctx.measureText(next).width <= maxW) line = next;
      else {
        lines.push(line);
        line = words[i]!;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

/** Paint design document into ctx at (0,0) with doc width/height (css pixels * dpr already applied via canvas size). */
export async function composeAdDesign(
  ctx: CanvasRenderingContext2D,
  doc: AdDesignDoc,
  cssW: number,
  cssH: number,
  hoverDoc?: AdDesignDoc | null,
  t = 0,
  timeMs = 0,
): Promise<void> {
  ctx.clearRect(0, 0, cssW, cssH);
  const root = getRoot(doc);
  const sx = cssW / Math.max(1, doc.width);
  const sy = cssH / Math.max(1, doc.height);
  ctx.save();
  ctx.scale(sx, sy);
  await drawNode(ctx, doc, root, 0, 0, hoverDoc ?? null, hoverDoc ? Math.min(1, Math.max(0, t)) : 0, timeMs);
  ctx.restore();
}

export function designHasCrt(doc: AdDesignDoc): boolean {
  return Object.values(doc.nodes).some((n) => n.effects?.some((e) => e.type === 'crt' && e.visible));
}

export function getRootCrtParams(doc: AdDesignDoc): Record<string, number | boolean | string> | null {
  const root = doc.nodes[doc.rootId] as AdFrameNode | undefined;
  const fx = root?.effects?.find((e) => e.type === 'crt' && e.visible);
  return fx && fx.type === 'crt' ? fx.params : null;
}
