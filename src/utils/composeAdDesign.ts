import type { AdDesignDoc, AdFrameNode, AdNode, AdPaint } from './adDesignDoc';
import { getRoot, listChildren } from './adDesignDoc';

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
  const iw = 'naturalWidth' in img ? Number(img.naturalWidth) || Number(img.width) : Number(img.width);
  const ih = 'naturalHeight' in img ? Number(img.naturalHeight) || Number(img.height) : Number(img.height);
  if (!iw || !ih) return;
  const scale = mode === 'fit' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function drawNode(
  ctx: CanvasRenderingContext2D,
  doc: AdDesignDoc,
  node: AdNode,
  ox: number,
  oy: number,
) {
  if (!node.visible) return;
  const x = ox + node.x;
  const y = oy + node.y;
  ctx.save();
  ctx.globalAlpha *= node.opacity;
  if (node.rotation) {
    ctx.translate(x + node.w / 2, y + node.h / 2);
    ctx.rotate((node.rotation * Math.PI) / 180);
    ctx.translate(-(x + node.w / 2), -(y + node.h / 2));
  }

  if (node.type === 'frame') {
    if (node.clipsContent) {
      roundRect(ctx, x, y, node.w, node.h, node.cornerRadius);
      ctx.clip();
    }
    await drawPaint(ctx, node.fills, x, y, node.w, node.h, node.cornerRadius);
    for (const stroke of node.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = stroke.opacity * node.opacity;
      ctx.lineWidth = stroke.weight;
      roundRect(ctx, x, y, node.w, node.h, node.cornerRadius);
      ctx.stroke();
    }
    for (const child of listChildren(doc, node.id)) {
      await drawNode(ctx, doc, child, x, y);
    }
  } else if (node.type === 'rectangle') {
    await drawPaint(ctx, node.fills, x, y, node.w, node.h, node.cornerRadius);
    for (const stroke of node.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = stroke.opacity * node.opacity;
      ctx.lineWidth = stroke.weight;
      roundRect(ctx, x, y, node.w, node.h, node.cornerRadius);
      ctx.stroke();
    }
  } else if (node.type === 'image') {
    const img = await loadImage(node.src);
    if (img) {
      if (node.cornerRadius > 0) {
        roundRect(ctx, x, y, node.w, node.h, node.cornerRadius);
        ctx.clip();
      }
      drawImageCover(ctx, img, x, y, node.w, node.h, node.scaleMode === 'fit' ? 'fit' : 'fill');
    }
  } else if (node.type === 'text') {
    const fill = node.fills[0];
    ctx.fillStyle = fill ? paintColor(fill) : '#fff';
    ctx.textAlign = node.textAlign;
    ctx.textBaseline = node.verticalAlign === 'middle' ? 'middle' : node.verticalAlign === 'bottom' ? 'bottom' : 'top';
    const weight = node.fontWeight >= 600 ? '700' : '500';
    ctx.font = `${weight} ${Math.round(node.fontSize)}px ${node.fontFamily}, "Segoe UI", sans-serif`;
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
      ctx.fillText(line, tx, lineY);
      lineY += lh;
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
): Promise<void> {
  ctx.clearRect(0, 0, cssW, cssH);
  const root = getRoot(doc);
  const sx = cssW / Math.max(1, doc.width);
  const sy = cssH / Math.max(1, doc.height);
  ctx.save();
  ctx.scale(sx, sy);
  await drawNode(ctx, doc, root, 0, 0);
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
