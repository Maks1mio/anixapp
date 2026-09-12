import type { AdDesignDoc, AdFrameNode, AdNode, AdPaint } from './adDesignDoc';
import { getRoot, listChildren } from './adDesignDoc';
import { mixNodeVisual, nodeOpacity } from './adDesignMotion';
import { isSvgDataUrl, parseSvgDataUrlColor, tintSvgDataUrl } from './svgTint';

const imageCache = new Map<string, HTMLImageElement | 'error'>();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const hit = imageCache.get(src);
  if (hit === 'error') return Promise.resolve(null);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    try {
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        const origin = new URL(src, typeof location !== 'undefined' ? location.href : 'http://localhost').origin;
        if (typeof location !== 'undefined' && origin !== location.origin) img.crossOrigin = 'anonymous';
      }
    } catch {
      /* ignore */
    }
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => {
      imageCache.set(src, 'error');
      resolve(null);
    };
    img.src = src;
  });
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
  for (const p of paints) {
    ctx.save();
    if (radius > 0) {
      roundRect(ctx, x, y, w, h, radius);
      ctx.clip();
    }
    if (p.type === 'solid') {
      ctx.globalAlpha = p.opacity;
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
        ctx.globalAlpha = p.opacity;
        drawImageCover(ctx, img, x, y, w, h, p.scaleMode === 'fit' ? 'fit' : 'fill');
      }
    } else if (p.type === 'gradient') {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      for (const s of p.stops) g.addColorStop(Math.min(1, Math.max(0, s.position)), s.color);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
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

function drawTextNode(ctx: CanvasRenderingContext2D, node: Extract<AdNode, { type: 'text' }>, x: number, y: number, alphaMul = 1) {
  const fill = node.fills[0];
  ctx.save();
  ctx.globalAlpha *= alphaMul;
  ctx.fillStyle = fill ? paintColor(fill) : '#fff';
  ctx.textAlign = node.textAlign;
  ctx.textBaseline = node.verticalAlign === 'middle' ? 'middle' : node.verticalAlign === 'bottom' ? 'bottom' : 'top';
  applyTextStyle(ctx, node);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = Math.max(3, Math.min(node.w, node.h) * 0.03);
  ctx.shadowOffsetY = 1;
  let tx = x;
  if (node.textAlign === 'center') tx = x + node.w / 2;
  if (node.textAlign === 'right') tx = x + node.w;
  let ty = y;
  if (node.verticalAlign === 'middle') ty = y + node.h / 2;
  if (node.verticalAlign === 'bottom') ty = y + node.h;
  const lh = node.lineHeight === 'auto' ? node.fontSize * 1.25 : node.lineHeight;
  const lines = wrapText(ctx, node.characters, node.w);
  let lineY = ty;
  if (node.verticalAlign === 'middle') lineY = ty - ((lines.length - 1) * lh) / 2;
  if (node.verticalAlign === 'bottom') lineY = ty - (lines.length - 1) * lh;
  for (const line of lines) {
    ctx.fillText(line, tx, lineY, node.w);
    lineY += lh;
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
  if (!img) return;
  ctx.save();
  ctx.globalAlpha *= alphaMul;
  if (node.cornerRadius > 0) {
    roundRect(ctx, x, y, node.w, node.h, node.cornerRadius);
    ctx.clip();
  }
  drawImageCover(ctx, img, x, y, node.w, node.h, node.scaleMode === 'fit' ? 'fit' : 'fill');
  ctx.restore();
}

async function drawNode(
  ctx: CanvasRenderingContext2D,
  doc: AdDesignDoc,
  node: AdNode,
  ox: number,
  oy: number,
  hoverDoc?: AdDesignDoc | null,
  t = 0,
) {
  const counterpart = hoverDoc?.nodes[node.id];
  const mixed = counterpart && counterpart.type === node.type ? mixNodeVisual(node, counterpart, t) : node;
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

  if (mixed.type === 'frame') {
    if (mixed.clipsContent) {
      roundRect(ctx, x, y, mixed.w, mixed.h, mixed.cornerRadius);
      ctx.clip();
    }
    await drawPaint(ctx, mixed.fills, x, y, mixed.w, mixed.h, mixed.cornerRadius);
    for (const stroke of mixed.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = stroke.opacity * mixed.opacity;
      ctx.lineWidth = stroke.weight;
      roundRect(ctx, x, y, mixed.w, mixed.h, mixed.cornerRadius);
      ctx.stroke();
    }
    for (const child of listChildren(doc, mixed.id)) {
      await drawNode(ctx, doc, child, x, y, hoverDoc, t);
    }
  } else if (mixed.type === 'rectangle') {
    await drawPaint(ctx, mixed.fills, x, y, mixed.w, mixed.h, mixed.cornerRadius);
    for (const stroke of mixed.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = stroke.opacity * mixed.opacity;
      ctx.lineWidth = stroke.weight;
      roundRect(ctx, x, y, mixed.w, mixed.h, mixed.cornerRadius);
      ctx.stroke();
    }
  } else if (mixed.type === 'image') {
    const restImg = node.type === 'image' ? node : mixed;
    const other = counterpart && counterpart.type === 'image' ? counterpart : null;
    if (other && other.src !== restImg.src && t > 0.02 && t < 0.98) {
      await drawImageNode(ctx, { ...mixed, src: restImg.src, scaleMode: restImg.scaleMode }, x, y, 1 - t);
      await drawImageNode(ctx, { ...mixed, src: other.src, scaleMode: other.scaleMode }, x, y, t);
    } else {
      await drawImageNode(ctx, mixed, x, y, 1);
    }
  } else if (mixed.type === 'text') {
    const restText = node.type === 'text' ? node : mixed;
    const other = counterpart && counterpart.type === 'text' ? counterpart : null;
    if (other && other.characters !== restText.characters && t > 0.02 && t < 0.98) {
      drawTextNode(ctx, { ...restText, ...mixed, characters: restText.characters, type: 'text' }, x, y, 1 - t);
      drawTextNode(ctx, { ...other, w: mixed.w, h: mixed.h, fontSize: mixed.fontSize }, x, y, t);
    } else {
      drawTextNode(ctx, mixed, x, y, 1);
    }
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
): Promise<void> {
  ctx.clearRect(0, 0, cssW, cssH);
  const root = getRoot(doc);
  const sx = cssW / Math.max(1, doc.width);
  const sy = cssH / Math.max(1, doc.height);
  ctx.save();
  ctx.scale(sx, sy);
  await drawNode(ctx, doc, root, 0, 0, hoverDoc ?? null, hoverDoc ? Math.min(1, Math.max(0, t)) : 0);
  ctx.restore();
}

export function designHasCrt(doc: AdDesignDoc): boolean {
  const root = doc.nodes[doc.rootId] as AdFrameNode | undefined;
  return Boolean(root?.effects?.some((e) => e.type === 'crt' && e.visible));
}

export function getRootCrtParams(doc: AdDesignDoc): Record<string, number | boolean | string> | null {
  const root = doc.nodes[doc.rootId] as AdFrameNode | undefined;
  const fx = root?.effects?.find((e) => e.type === 'crt' && e.visible);
  return fx && fx.type === 'crt' ? fx.params : null;
}
