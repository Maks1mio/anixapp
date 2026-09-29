import { phoneDownloadHost, type DownloadHost } from './phone-downloads';

/**
 * Кто выполняет загрузки: Electron (preload) или нативный мост телефона.
 * undefined — загрузок нет (браузер, ТВ без моста): вызовы через ?. молча пропускаются,
 * как раньше с window.electron?.…
 */
export function downloadHost(): DownloadHost | undefined {
  if (typeof window === 'undefined') return undefined;
  if (window.electron?.queueEpisodeDownloads) return window.electron;
  return phoneDownloadHost() ?? undefined;
}

export function isPhoneDownloadHost(): boolean {
  return downloadHost()?.isPhone === true;
}
