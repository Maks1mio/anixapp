/**
 * Цвет системных полос (строка состояния сверху, жестовая панель снизу) под тему приложения на Android.
 * Без этого под полосами виден чёрный фон окна — заметно в светлой теме.
 */
import { isMobileMode } from '../platform/mobile';

type BarsPlugin = { setSystemBars?: (o: { top: string; bottom?: string; light: boolean }) => Promise<void> };

function plugin(): BarsPlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixPlayer?: BarsPlugin } } }).Capacitor?.Plugins?.AnixPlayer;
}

/** CSS-цвет (в т.ч. rgba) → непрозрачный #rrggbb поверх фона. */
function toOpaqueHex(color: string, under: [number, number, number]): string | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i.exec(color);
  let rgb: [number, number, number];
  let a = 1;
  if (m) {
    rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
  } else {
    const h = /^#([0-9a-f]{6})$/i.exec(color.trim());
    if (!h) return null;
    const n = parseInt(h[1], 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const mix = rgb.map((c, i) => Math.round(c * a + under[i] * (1 - a)));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function resolveColor(cssVar: string): string {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${cssVar})`;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c;
}

let lastKey = '';

/** Отправить цвета полос: верх = фон страницы, низ = нижняя панель навигации (на широком экране — фон). */
export function syncSystemBars(): void {
  if (!isMobileMode()) return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', syncSystemBars, { once: true });
    return;
  }
  const p = plugin();
  if (!p?.setSystemBars) return;
  const bg = toOpaqueHex(resolveColor('--m-bg'), [0, 0, 0]) ?? '#000000';
  const bgRgb: [number, number, number] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16)) as [number, number, number];
  const wide = window.matchMedia('(min-width: 840px)').matches;
  const bottom = wide ? bg : toOpaqueHex(resolveColor('--m-navbar-bg'), bgRgb) ?? bg;
  const light = document.documentElement.dataset.mTheme === 'light';
  const key = `${bg}|${bottom}|${light}`;
  if (key === lastKey) return;
  lastKey = key;
  void p.setSystemBars({ top: bg, bottom, light }).catch(() => { lastKey = ''; });
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
if (typeof window !== 'undefined') {
  // Стили могли догрузиться после первого applyTheme
  window.addEventListener('load', () => { lastKey = ''; syncSystemBars(); }, { once: true });
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(syncSystemBars, 150);
  });
}
