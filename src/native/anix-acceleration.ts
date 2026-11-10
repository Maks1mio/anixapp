/**
 * «Адаптивное ускорение» на телефоне (плагин AnixAcceleration в мобильной сборке):
 * GPU-флаги Chromium для WebView, от которых зависят WebGPU и Anime4K. Меняется после перезапуска.
 */
type AccelerationState = { enabled: boolean; applied: boolean };
type AccelerationPlugin = {
  get: () => Promise<AccelerationState>;
  set: (opts: { enabled: boolean }) => Promise<{ enabled: boolean }>;
};

function plugin(): AccelerationPlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixAcceleration?: AccelerationPlugin } } })
    .Capacitor?.Plugins?.AnixAcceleration;
}

export function hasNativeAcceleration(): boolean {
  return !!plugin();
}

export async function getNativeAcceleration(): Promise<AccelerationState | null> {
  try {
    return (await plugin()?.get()) ?? null;
  } catch {
    return null;
  }
}

export async function setNativeAcceleration(enabled: boolean): Promise<boolean> {
  try {
    const res = await plugin()?.set({ enabled });
    return res?.enabled ?? enabled;
  } catch {
    return enabled;
  }
}
