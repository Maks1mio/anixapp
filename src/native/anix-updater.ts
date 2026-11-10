/**
 * Плагин AnixUpdater мобильной сборки: скачивает APK из релиза GitHub и открывает системный установщик.
 */
type Progress = { received: number; total: number; percent: number };
type Listener = { remove: () => Promise<void> | void };
type UpdaterPlugin = {
  info: () => Promise<{ versionName: string; versionCode?: number; canInstall: boolean }>;
  download: (opts: { url: string; fileName: string }) => Promise<{ path: string }>;
  cancel: () => Promise<void>;
  install: (opts: { path: string }) => Promise<{ started?: boolean; needsPermission?: boolean }>;
  addListener: (event: 'progress', cb: (p: Progress) => void) => Promise<Listener> | Listener;
};

function plugin(): UpdaterPlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixUpdater?: UpdaterPlugin } } })
    .Capacitor?.Plugins?.AnixUpdater;
}

export function hasNativeUpdater(): boolean {
  return !!plugin();
}

export async function downloadApk(
  url: string,
  fileName: string,
  onProgress: (p: Progress) => void,
): Promise<string> {
  const p = plugin();
  if (!p) throw new Error('Updater unavailable');
  const listener = await p.addListener('progress', onProgress);
  try {
    return (await p.download({ url, fileName })).path;
  } finally {
    void listener.remove();
  }
}

export async function cancelApkDownload(): Promise<void> {
  try {
    await plugin()?.cancel();
  } catch {
    // ignore
  }
}

export async function canInstallApk(): Promise<boolean> {
  try {
    return !!(await plugin()?.info())?.canInstall;
  } catch {
    return false;
  }
}

export async function installApk(path: string): Promise<{ started?: boolean; needsPermission?: boolean }> {
  const p = plugin();
  if (!p) throw new Error('Updater unavailable');
  return p.install({ path });
}
