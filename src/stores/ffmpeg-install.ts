import { writable, derived, get } from 'svelte/store';

export type FfmpegInstallProgress = {
  received: number;
  total: number;
  /** 0–99 while downloading; null if unknown */
  percent: number | null;
};

type FfmpegInstallState = {
  busy: boolean;
  progress: FfmpegInstallProgress | null;
  message: string;
  available: boolean | null;
  path: string;
  source: string;
};

const initial: FfmpegInstallState = {
  busy: false,
  progress: null,
  message: '',
  available: null,
  path: '',
  source: '',
};

const store = writable<FfmpegInstallState>(initial);

let listening = false;
let lastPercent = -1;
let lastTotal = 0;

function clampPercent(received: number, total: number): number | null {
  if (!(total > 0) || !(received >= 0)) return null;
  return Math.min(99, Math.max(0, Math.round((received / total) * 100)));
}

function applyProgress(received: number, total: number) {
  const nextTotal = total > 0 ? total : lastTotal;
  let nextReceived = Math.max(0, received);

  // Новый этап (другой content-length) — можно сбросить монотонность
  if (nextTotal > 0 && lastTotal > 0 && nextTotal !== lastTotal) {
    lastPercent = -1;
  }
  if (nextTotal > 0) lastTotal = nextTotal;

  // Не даём ползунку ехать назад при шумных апдейтах
  const pct = clampPercent(nextReceived, nextTotal);
  if (pct != null && lastPercent >= 0 && pct < lastPercent) {
    return;
  }
  if (pct != null) lastPercent = pct;

  store.update((s) => ({
    ...s,
    busy: true,
    progress: {
      received: nextReceived,
      total: nextTotal,
      percent: pct,
    },
  }));
}

function ensureProgressListener() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('downloads:ffmpeg-install-progress', ((e: Event) => {
    const detail = (e as CustomEvent<{ received?: number; total?: number }>).detail;
    if (!detail) return;
    applyProgress(Number(detail.received) || 0, Number(detail.total) || 0);
  }) as EventListener);
}

export const ffmpegInstall = {
  subscribe: store.subscribe,

  busy: derived(store, ($s) => $s.busy),
  progress: derived(store, ($s) => $s.progress),

  init() {
    ensureProgressListener();
  },

  async refreshStatus() {
    try {
      const st = await window.electron?.getFfmpegStatus?.();
      const install = await window.electron?.getFfmpegInstallState?.();
      const installing = !!install?.busy;
      const received = Number(install?.received) || 0;
      const total = Number(install?.total) || 0;
      const percent = clampPercent(received, total);

      if (installing) {
        lastTotal = total > 0 ? total : lastTotal;
        if (percent != null) lastPercent = Math.max(lastPercent, percent);
      } else {
        lastPercent = -1;
        lastTotal = 0;
      }

      store.update((s) => ({
        ...s,
        available: !!st?.available,
        path: st?.path || '',
        source: st?.source || '',
        busy: installing,
        progress: installing
          ? { received, total, percent }
          : null,
        message: installing ? '' : (st?.available && s.message === 'FFmpeg установлен' ? s.message : (!st?.available ? s.message : '')),
      }));
    } catch {
      store.update((s) => ({
        ...s,
        available: false,
        path: '',
        source: '',
      }));
    }
  },

  async install() {
    ensureProgressListener();
    const cur = get(store);
    if (cur.busy) return;

    lastPercent = -1;
    lastTotal = 0;
    store.update((s) => ({
      ...s,
      busy: true,
      message: '',
      progress: { received: 0, total: 0, percent: null },
    }));

    try {
      const res = await window.electron?.installFfmpeg?.();
      if (res?.ok) {
        store.update((s) => ({
          ...s,
          busy: false,
          progress: null,
          message: 'FFmpeg установлен',
          available: true,
        }));
        await ffmpegInstall.refreshStatus();
      } else if (res?.busy) {
        // Уже качается в main — оставляем busy и слушаем progress
        store.update((s) => ({
          ...s,
          busy: true,
          message: '',
        }));
      } else {
        store.update((s) => ({
          ...s,
          busy: false,
          progress: null,
          message: res?.error || 'Не удалось установить FFmpeg',
        }));
        await ffmpegInstall.refreshStatus();
      }
    } catch (e) {
      store.update((s) => ({
        ...s,
        busy: false,
        progress: null,
        message: e instanceof Error ? e.message : 'Ошибка установки FFmpeg',
      }));
    }
  },
};
