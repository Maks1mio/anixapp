/**
 * Мобильный режим (Vite `VITE_MOBILE_MODE=1`, Capacitor ANIXAPP_TARGET=mobile).
 * Третья цель рядом с desktop и TV: общими остаются API-слой, сторы, роутер и бизнес-логика.
 * TV-навигация (D-pad, spatial-фокус) и масштабирование под холст 1920×1080 в этом режиме НЕ подключаются.
 */
import { isTvMode } from './tv';

export function isMobileMode(): boolean {
  const v = import.meta.env.VITE_MOBILE_MODE;
  return (v === '1' || v === 'true') && !isTvMode();
}

/** Однократные настройки корня документа для мобильной вёрстки. */
export function applyMobileDefaults(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.add('mobile-mode');
  if ((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
    root.classList.add('mobile-native');
  }
  // Только тёмная тема: фиксируем, чтобы тема из desktop-настроек не перекрашивала мобильный UI.
  root.style.colorScheme = 'dark';
}
