/**
 * Воспроизведение звука уведомления в главном окне приложения.
 * Main-процесс шлёт `notification-sound:playInApp` через preload.
 * Каждый вызов — отдельный Audio, чтобы звуки накладывались как баннеры.
 */

let playGen = 0;

function resolveSrc(payload: { fileUrl?: string; soundId?: string }): string | null {
  if (typeof payload.fileUrl === 'string' && payload.fileUrl.startsWith('anix-sound:')) {
    return payload.fileUrl;
  }
  if (
    typeof payload.fileUrl === 'string'
    && payload.fileUrl.startsWith('file:')
    && window.location.protocol === 'file:'
  ) {
    return payload.fileUrl;
  }
  return null;
}

function releaseAudio(el: HTMLAudioElement): void {
  try {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } catch { /* ignore */ }
}

async function onPlay(e: Event) {
  const payload = (e as CustomEvent<{ fileUrl?: string; soundId?: string; volume?: number }>).detail || {};
  const src = resolveSrc(payload);
  if (!src) return;
  const vol = typeof payload.volume === 'number'
    ? Math.min(1, Math.max(0, payload.volume / 100))
    : 1;
  const gen = ++playGen;
  const el = new Audio();
  el.preload = 'auto';
  el.volume = vol;
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
  }
}

let attached = false;

/** Подписаться на звуки уведомлений (один раз за жизнь приложения). */
export function startNotificationSoundListener(): () => void {
  if (attached) return () => {};
  attached = true;
  window.addEventListener('anix:notificationSound', onPlay);
  return () => {
    window.removeEventListener('anix:notificationSound', onPlay);
    attached = false;
  };
}
