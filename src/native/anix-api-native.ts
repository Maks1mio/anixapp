import { isTvMode } from '../platform/tv';

type NativeWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
};

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as NativeWindow).Capacitor?.isNativePlatform?.();
}

let nativeInvoke: ((channel: string, args: unknown[]) => Promise<unknown>) | null = null;

export function getNativeInvoke() {
  return nativeInvoke;
}

/** Capacitor / production TV: Anixart API directly (CapacitorHttp обходит CORS). */
export async function initNativeAnixApi(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const useNative = isCapacitorNative() || (isTvMode() && import.meta.env.PROD);
  if (!useNative) return false;

  try {
    const { createBrowserAnixBridge } = await import('./anix-bridge-browser');
    const bridge = createBrowserAnixBridge();
    nativeInvoke = (channel, args) => bridge.invoke(channel, args);
    return true;
  } catch (err) {
    console.error('[anix-native] failed to init', err);
    return false;
  }
}
