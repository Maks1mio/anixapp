/**
 * Скрытое окно для проигрывания звуков уведомлений.
 * Слушает IPC notification-sound:play с { fileUrl, volume, soundId }.
 * Каждый play — отдельный Audio (наложение, как у стека баннеров).
 */

interface NotificationSoundPlayPayload {
  fileUrl?: string;
  soundId?: string;
  volume?: number;
  file?: string;
}

interface NotificationSoundBridge {
  onPlay: (cb: (payload: NotificationSoundPlayPayload) => void) => void;
  getVolume: () => Promise<number>;
  ready: () => void;
}

declare global {
  interface Window {
    notificationSound?: NotificationSoundBridge;
  }
}

let volume = 1;
let playGen = 0;

function resolveSrc(payload: NotificationSoundPlayPayload): string | null {
  if (typeof payload.fileUrl === 'string' && payload.fileUrl) return payload.fileUrl;
  return null;
}

function releaseAudio(el: HTMLAudioElement): void {
  try {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } catch { /* ignore */ }
}

async function play(payload: NotificationSoundPlayPayload) {
  if (typeof payload.volume === 'number') {
    volume = Math.min(1, Math.max(0, payload.volume / 100));
  }
  const src = resolveSrc(payload);
  if (!src) return;
  const gen = ++playGen;
  const el = new Audio();
  el.preload = 'auto';
  el.volume = volume;
  const cleanup = () => releaseAudio(el);
  el.addEventListener('ended', cleanup, { once: true });
  el.addEventListener('error', cleanup, { once: true });
  try {
    el.src = src;
    await el.play();
  } catch (err) {
    cleanup();
    if (gen !== playGen) return;
    if (err instanceof DOMException && err.name === 'AbortError') return;
    console.warn('[notification-sound] play failed', err);
  }
}

window.notificationSound?.onPlay((p) => { void play(p); });

void window.notificationSound?.getVolume().then((v) => {
  if (typeof v === 'number') volume = Math.min(1, Math.max(0, v / 100));
  window.notificationSound?.ready();
});
