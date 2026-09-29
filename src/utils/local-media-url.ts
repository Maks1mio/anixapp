import { hasPhoneDownloads, phoneLocalMediaUrl, PHONE_LOCAL_MEDIA_PREFIX } from '../native/phone-downloads';

/**
 * URL для воспроизведения локального файла: custom protocol Electron (обход блокировки file://),
 * на телефоне — https://localhost/__anix_local__/… (AnixLocalMedia.java).
 */
export function pathToLocalMediaUrl(filePath: string): string {
  if (!filePath) return '';
  if (isLocalMediaUrl(filePath)) return filePath;
  if (!window.electron && hasPhoneDownloads()) return phoneLocalMediaUrl(filePath);
  const normalized = filePath.replace(/\\/g, '/');
  return `anix-local://play/?p=${encodeURIComponent(normalized)}`;
}

export function isLocalMediaUrl(url: string): boolean {
  if (/^anix-local:/i.test(url)) return true;
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' && u.pathname.startsWith(`${PHONE_LOCAL_MEDIA_PREFIX}/`);
  } catch {
    return false;
  }
}
