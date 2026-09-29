/**
 * Телефонный режим: Android-сборка без VITE_TV_MODE.
 *
 * Включается флагом сборки VITE_PHONE_MODE=1 (scripts/build-android-phone.mjs)
 * или, как запасной вариант, если страница открыта внутри Capacitor и это не ТВ.
 * Десктоп (Electron) и ТВ сюда не попадают, поэтому все мобильные стили
 * пишутся только под html.phone-mode и не задевают другие сборки.
 */
import { isTvMode } from './tv';

type NativeWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
};

export function isPhoneMode(): boolean {
  if (isTvMode()) return false;
  const flag = import.meta.env.VITE_PHONE_MODE;
  if (flag === '1' || flag === 'true') return true;
  if (typeof window === 'undefined') return false;
  return !!(window as NativeWindow).Capacitor?.isNativePlatform?.();
}

export function applyPhoneDefaults(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.add('phone-mode');
}

type OrientationWindow = Window & {
  AnixOrientation?: { setLandscape?: (landscape: boolean) => void };
};

/**
 * Телефон закреплён в портрете (MainActivity). Плеер в полном экране просит
 * горизонталь. Вне телефонного режима и без нативного моста ничего не делает.
 */
export function setPhoneLandscape(landscape: boolean): void {
  if (typeof window === 'undefined' || !isPhoneMode()) return;
  try {
    (window as OrientationWindow).AnixOrientation?.setLandscape?.(landscape);
  } catch {
    /* мост недоступен — остаёмся в текущей ориентации */
  }
}
