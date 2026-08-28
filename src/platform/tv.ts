/** Android TV / leanback UI target (Vite `VITE_TV_MODE=1`). */
import { toCdnThumbnailUrl } from '../utils/posterUrl';

export function isTvMode(): boolean {
  const v = import.meta.env.VITE_TV_MODE;
  return v === '1' || v === 'true';
}

/** Reference 10-foot canvas — UI is authored for this size, then scaled to the display. */
export const TV_DESIGN_WIDTH = 1920;
export const TV_DESIGN_HEIGHT = 1080;
export const TV_BASE_FONT_PX = 18;

const TV_THEME_APPLIED_KEY = 'anixapp.tv.themeDefaultApplied';

export function getTvUiScale(): number {
  if (typeof document === 'undefined') return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--tv-ui-scale');
  const scale = Number.parseFloat(raw);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function applyTvViewportScale(): void {
  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;
  const scaleX = width / TV_DESIGN_WIDTH;
  const scaleY = height / TV_DESIGN_HEIGHT;

  // 16:9 → contain. Сильно широкий/высокий экран → ближе к cover.
  const contain = Math.min(scaleX, scaleY);
  const cover = Math.max(scaleX, scaleY);
  const designAspect = TV_DESIGN_WIDTH / TV_DESIGN_HEIGHT;
  const screenAspect = width / height;
  const aspectDelta = Math.abs(Math.log(screenAspect / designAspect));
  const fillBias = Math.min(1, aspectDelta / 0.32);
  const scale = contain + (cover - contain) * fillBias;

  const root = document.documentElement;
  root.style.setProperty('--tv-ui-scale', scale.toFixed(5));
  // rem/layout scale — без CSS transform, чтобы текст и картинки не мылились.
  root.style.fontSize = `${TV_BASE_FONT_PX * scale}px`;
}

/** Uniform 1920×1080 baseline; scales via root font-size (sharp, no transform blur). */
export function initTvViewportScale(): void {
  if (typeof window === 'undefined' || !isTvMode()) return;

  const sync = () => applyTvViewportScale();

  sync();
  window.addEventListener('resize', sync, { passive: true });
  window.visualViewport?.addEventListener('resize', sync, { passive: true });
  window.addEventListener('orientationchange', sync, { passive: true });

  requestAnimationFrame(sync);
  window.setTimeout(sync, 0);
  window.setTimeout(sync, 120);
}

function tvDisplayDpr(): number {
  if (typeof window === 'undefined') return 1.5;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(2, Math.max(1.5, Math.round(dpr * 2) / 2));
}

/** Poster URL sized for current TV scale + DPR (sharp on 4K / large windows). */
export function tvPosterThumbUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const scale = getTvUiScale();
  const cssW = 10 * TV_BASE_FONT_PX * scale;
  const w = Math.min(640, Math.round(cssW * tvDisplayDpr()));
  const h = Math.min(960, Math.round(w * 1.5));
  return toCdnThumbnailUrl(url, w, h);
}

/** One-time defaults for 10-foot UI on TV. */
export function applyTvDefaults(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.add('tv-mode');

  const hirroStack = "'Hirro Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
  root.style.setProperty('--font-sans', hirroStack);
  root.style.setProperty('--uikit-v2-font', hirroStack);

  initTvViewportScale();

  try {
    if (localStorage.getItem(TV_THEME_APPLIED_KEY)) return;
    const theme = localStorage.getItem('anixapp.activeTheme');
    if (!theme || theme === 'auto') {
      localStorage.setItem('anixapp.activeTheme', 'dark');
    }
    localStorage.setItem(TV_THEME_APPLIED_KEY, '1');
  } catch {
    /* ignore */
  }
}
