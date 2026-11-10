/**
 * Мобильный режим (Vite `VITE_MOBILE_MODE=1`, Capacitor ANIXAPP_TARGET=mobile).
 * Третья цель рядом с desktop и TV: общими остаются API-слой, сторы, роутер и бизнес-логика.
 * TV-навигация (D-pad, spatial-фокус) и масштабирование под холст 1920×1080 в этом режиме НЕ подключаются.
 */
import { isTvMode } from './tv';
import { bindSystemBarsToTheme } from '../native/anix-system-bars';

export function isMobileMode(): boolean {
  const v = import.meta.env.VITE_MOBILE_MODE;
  return (v === '1' || v === 'true') && !isTvMode();
}

/** Однократные настройки корня документа для мобильной вёрстки. */
export function applyMobileDefaults(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.add('mobile-mode');
  applyMobileUiScale(getMobileUiScale());
  window.addEventListener('resize', syncViewportUnitScale);
  if ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
    root.classList.add('mobile-native');
    bindSystemBarsToTheme();
  }
  // Долгое нажатие в WebView — это contextmenu: без него не появляются выделение текста
  // и системное меню ссылок/картинок. В полях ввода оставляем (вставить, выделить всё).
  document.addEventListener('contextmenu', (e) => {
    if (!isEditableTarget(e.target)) e.preventDefault();
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return !!el?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .m-selectable');
}

// ── Масштаб интерфейса телефона (Настройки → Внешний вид) ──────────────────────────────────
/** Пять шагов, «Обычный» — посередине. */
export const MOBILE_UI_SCALES = [
  { value: 0.85, label: '85%' },
  { value: 0.92, label: '92%' },
  { value: 1, label: '100%' },
  { value: 1.08, label: '108%' },
  { value: 1.16, label: '116%' },
] as const;

const MOBILE_UI_SCALE_KEY = 'anixapp:mobile-ui-scale';

export function getMobileUiScale(): number {
  try {
    const raw = Number(window.localStorage.getItem(MOBILE_UI_SCALE_KEY));
    if (MOBILE_UI_SCALES.some((s) => s.value === raw)) return raw;
  } catch {
    /* хранилище недоступно */
  }
  return 1;
}

export function setMobileUiScale(value: number): number {
  const next = MOBILE_UI_SCALES.some((s) => s.value === value) ? value : 1;
  try {
    window.localStorage.setItem(MOBILE_UI_SCALE_KEY, String(next));
  } catch {
    /* ignore */
  }
  applyMobileUiScale(next);
  return next;
}

/** Текущий множитель CSS zoom корня (для пересчёта пикселей окна в пиксели вёрстки). */
export function mobileUiZoom(): number {
  if (typeof document === 'undefined') return 1;
  const z = Number(document.documentElement.style.getPropertyValue('--m-zoom'));
  return z > 0 ? z : 1;
}

function applyMobileUiScale(value: number): void {
  const root = document.documentElement;
  root.style.zoom = value === 1 ? '' : String(value);
  root.style.setProperty('--m-zoom', String(value));
  syncViewportUnitScale();
}

/**
 * Под zoom высота «100dvh» у разных движков то масштабируется, то нет. Меряем, сколько на деле
 * занимает 100dvh относительно окна (fixed inset:0), и отдаём поправку в --m-vh-fix:
 * в стилях высота экрана — calc(100dvh * var(--m-vh-fix, 1)).
 */
function syncViewportUnitScale(): void {
  if (typeof document === 'undefined' || !document.body) return;
  const root = document.documentElement;
  const probe = (css: string) => {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;width:1px;visibility:hidden;pointer-events:none;${css}`;
    document.body.appendChild(el);
    const h = el.offsetHeight;
    el.remove();
    return h;
  };
  const screen = probe('top:0;bottom:0;');
  const dvh = probe('top:0;height:100dvh;');
  const fix = screen > 0 && dvh > 0 ? screen / dvh : 1;
  root.style.setProperty('--m-vh-fix', Math.abs(fix - 1) < 0.005 ? '1' : fix.toFixed(4));
}
