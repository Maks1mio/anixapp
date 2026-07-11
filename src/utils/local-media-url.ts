/** URL для воспроизведения локального файла через custom protocol Electron (обход блокировки file://). */
export function pathToLocalMediaUrl(filePath: string): string {
  if (!filePath) return '';
  if (/^anix-local:/i.test(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  return `anix-local://play/?p=${encodeURIComponent(normalized)}`;
}

export function isLocalMediaUrl(url: string): boolean {
  return /^anix-local:/i.test(url);
}
