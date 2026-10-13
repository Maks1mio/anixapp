/** Tint SVG data-URLs so banner icons respect Fill color. */

export function isSvgDataUrl(src: string): boolean {
  return /^data:image\/svg\+xml/i.test(String(src || ''));
}

export function decodeSvgDataUrl(src: string): string | null {
  const raw = String(src || '');
  const comma = raw.indexOf(',');
  if (comma < 0) return null;
  const meta = raw.slice(0, comma);
  const payload = raw.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) {
      const bin = atob(payload);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    try {
      return decodeURIComponent(payload);
    } catch {
      return null;
    }
  }
}

export function encodeSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeHex(color: string): string {
  const c = color.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(c)) return c;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  return '#ffffff';
}

/** Recolor strokes/fills except none. */
export function tintSvgMarkup(svg: string, color: string): string {
  const hex = normalizeHex(color);
  return svg
    .replace(/stroke="currentColor"/gi, `stroke="${hex}"`)
    .replace(/fill="currentColor"/gi, `fill="${hex}"`)
    .replace(/\bstroke="[^"]*"/gi, (m) => (/stroke="none"/i.test(m) ? m : `stroke="${hex}"`))
    .replace(/\bfill="#1[Bb]1[Ff]24"/g, `fill="${hex}"`)
    .replace(/\bfill="#0{3,8}"/gi, `fill="${hex}"`)
    .replace(/\bfill="black"/gi, `fill="${hex}"`);
}

export function tintSvgDataUrl(src: string, color: string): string {
  if (!isSvgDataUrl(src)) return src;
  const svg = decodeSvgDataUrl(src);
  if (!svg) return src;
  return encodeSvgDataUrl(tintSvgMarkup(svg, color));
}

export function svgDataUrlNeedsTint(src: string): boolean {
  if (!isSvgDataUrl(src)) return false;
  const svg = decodeSvgDataUrl(src);
  if (!svg) return false;
  return /currentColor|#1[Bb]1[Ff]24|#0{3,8}\b|stroke="black"/i.test(svg);
}

export function parseSvgDataUrlColor(src: string): string | null {
  const svg = decodeSvgDataUrl(src);
  if (!svg) return null;
  const stroke = svg.match(/\bstroke="(#[0-9a-fA-F]{3,8})"/);
  if (stroke?.[1] && !/^#0+$/i.test(stroke[1])) return stroke[1];
  const fill = svg.match(/\bfill="(#[0-9a-fA-F]{3,8})"/);
  if (fill?.[1] && !/^#0+$/i.test(fill[1]) && fill[1].toLowerCase() !== '#1b1f24') return fill[1];
  if (/currentColor|#1[Bb]1[Ff]24|#0{3,8}/i.test(svg)) return '#ffffff';
  return null;
}
