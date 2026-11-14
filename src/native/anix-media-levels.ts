/**
 * Системные громкость (STREAM_MUSIC) и яркость экрана для веб-плеера на Android
 * (методы плагина AnixPlayer). В браузере/Electron и на старых APK без этих методов — null/no-op,
 * плеер тогда управляет громкостью элемента и затемнением сам.
 */
export type MediaLevels = { volume: number; volumeMax: number; brightness: number };

type MediaLevelsPlugin = {
  getMediaLevels?: () => Promise<MediaLevels>;
  setSystemVolume?: (opts: { index: number }) => Promise<{ volume: number; volumeMax: number }>;
  setWindowBrightness?: (opts: { level: number }) => Promise<void>;
};

function plugin(): MediaLevelsPlugin | undefined {
  if (!document.documentElement.classList.contains('mobile-native')) return undefined;
  return (window as unknown as { Capacitor?: { Plugins?: { AnixPlayer?: MediaLevelsPlugin } } })
    .Capacitor?.Plugins?.AnixPlayer;
}

/** null — системное управление недоступно. */
export async function getMediaLevels(): Promise<MediaLevels | null> {
  try {
    const res = await plugin()?.getMediaLevels?.();
    if (!res || !(res.volumeMax > 0) || !Number.isFinite(res.brightness)) return null;
    return res;
  } catch {
    return null;
  }
}

export function setSystemVolume(index: number): void {
  void plugin()?.setSystemVolume?.({ index: Math.round(index) })?.catch?.(() => {});
}

/** level < 0 — вернуть системную яркость. */
export function setWindowBrightness(level: number): void {
  void plugin()?.setWindowBrightness?.({ level })?.catch?.(() => {});
}
