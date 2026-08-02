/** Player hotkeys & playback-speed helpers (Electron settings + Watch page). */

export const PLAYBACK_RATE_MIN = 0.05;
export const PLAYBACK_RATE_MAX = 4;
export const PLAYBACK_RATE_STEP = 0.05;
/** Above this rate the UI warns that buffering may lag. */
export const PLAYBACK_RATE_WARN = 2;
export const DEFAULT_PLAYBACK_RATE = 1;

export const SEEK_SECONDS_OPTIONS = [5, 10, 15, 30, 60, 90] as const;

export interface PlayerHotkeysSettings {
  seekBackCode: string;
  seekForwardCode: string;
  playPauseCode: string;
  volumeUpCode: string;
  volumeDownCode: string;
  fullscreenCode: string;
  alwaysOnTopCode: string;
  seekSeconds: number;
  ctrlWheelSpeed: boolean;
}

export const DEFAULT_PLAYER_HOTKEYS: PlayerHotkeysSettings = {
  seekBackCode: 'ArrowLeft',
  seekForwardCode: 'ArrowRight',
  playPauseCode: 'Space',
  volumeUpCode: 'ArrowUp',
  volumeDownCode: 'ArrowDown',
  fullscreenCode: 'KeyF',
  alwaysOnTopCode: 'KeyP',
  seekSeconds: 10,
  ctrlWheelSpeed: true,
};

/** Keyboard-bind fields that must stay unique across actions. */
export const PLAYER_HOTKEY_BIND_FIELDS = [
  'seekBackCode',
  'seekForwardCode',
  'playPauseCode',
  'volumeUpCode',
  'volumeDownCode',
  'fullscreenCode',
  'alwaysOnTopCode',
] as const;

export type PlayerHotkeyBindField = (typeof PLAYER_HOTKEY_BIND_FIELDS)[number];

function pickHotkeyCode(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  // Explicit empty string = unbound (cleared after conflict rebind).
  return raw;
}

const KEY_LABELS: Record<string, string> = {
  Space: 'Пробел',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Tab: 'Tab',
  Minus: '−',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
};

export function normalizePlayerHotkeys(raw: unknown): PlayerHotkeysSettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const seekSecondsRaw = typeof src.seekSeconds === 'number' ? src.seekSeconds : DEFAULT_PLAYER_HOTKEYS.seekSeconds;
  const nearestSeek = SEEK_SECONDS_OPTIONS.reduce((best, n) =>
    Math.abs(n - seekSecondsRaw) < Math.abs(best - seekSecondsRaw) ? n : best,
  SEEK_SECONDS_OPTIONS[0]);

  return {
    seekBackCode: pickHotkeyCode(src.seekBackCode, DEFAULT_PLAYER_HOTKEYS.seekBackCode),
    seekForwardCode: pickHotkeyCode(src.seekForwardCode, DEFAULT_PLAYER_HOTKEYS.seekForwardCode),
    playPauseCode: pickHotkeyCode(src.playPauseCode, DEFAULT_PLAYER_HOTKEYS.playPauseCode),
    volumeUpCode: pickHotkeyCode(src.volumeUpCode, DEFAULT_PLAYER_HOTKEYS.volumeUpCode),
    volumeDownCode: pickHotkeyCode(src.volumeDownCode, DEFAULT_PLAYER_HOTKEYS.volumeDownCode),
    fullscreenCode: pickHotkeyCode(src.fullscreenCode, DEFAULT_PLAYER_HOTKEYS.fullscreenCode),
    alwaysOnTopCode: pickHotkeyCode(src.alwaysOnTopCode, DEFAULT_PLAYER_HOTKEYS.alwaysOnTopCode),
    seekSeconds: nearestSeek,
    ctrlWheelSpeed: src.ctrlWheelSpeed !== false,
  };
}

/** Assign `code` to `field`; clear the same code from any other bind. */
export function rebindPlayerHotkey(
  current: PlayerHotkeysSettings,
  field: PlayerHotkeyBindField,
  code: string,
): PlayerHotkeysSettings {
  const next: PlayerHotkeysSettings = { ...current };
  for (const other of PLAYER_HOTKEY_BIND_FIELDS) {
    if (other !== field && next[other] === code) {
      next[other] = '';
    }
  }
  next[field] = code;
  return next;
}

export function formatHotkeyCode(code: string): string {
  if (!code) return '—';
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

/** Reject pure modifiers / mouse-only codes when rebinding. */
export function isBindableKeyCode(code: string): boolean {
  return !['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code);
}

export function clampPlaybackRate(rate: number): number {
  const stepped = Math.round(rate / PLAYBACK_RATE_STEP) * PLAYBACK_RATE_STEP;
  const clamped = Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, stepped));
  return Math.round(clamped * 100) / 100;
}

export function formatPlaybackRate(rate: number): string {
  const n = clampPlaybackRate(rate);
  if (Number.isInteger(n)) return `${n}×`;
  // Keep two decimals for fine rates (0.05, 1.05), trim trailing zero (1.50 → 1.5)
  const fixed = n.toFixed(2).replace(/(\.\d)0$/, '$1');
  return `${fixed}×`;
}

export function stepPlaybackRate(current: number, direction: 1 | -1): number {
  return clampPlaybackRate(current + direction * PLAYBACK_RATE_STEP);
}
