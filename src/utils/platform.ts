/** Платформа из electron/preload.js; в вебе и на TV — undefined. */
export const isMac = typeof window !== 'undefined' && (window as any).electron?.platform === 'darwin';

/** 'Ctrl+Shift+K' → '⇧⌘K' на macOS; на остальных платформах без изменений. */
export function shortcutLabel(combo: string): string {
  if (!isMac) return combo;
  return combo
    .replace(/Ctrl\+Shift\+/g, '⇧⌘')
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Shift\+/g, '⇧')
    .replace(/Alt\+/g, '⌥');
}
