/**
 * Загрузки на телефоне: тот же контракт, что window.electron (preload.js),
 * поверх нативного window.AnixDownloads (AnixDownloadBridge.java).
 *
 * Отдельный объект, а не подмена window.electron: наличие window.electron
 * по всему коду означает «десктоп», это ломать нельзя.
 */
import { navigate } from '../stores/navigation';
import { isEmbeddedWebPlayer } from '../utils/watch-nav';

type NativeDownloads = {
  enqueue(itemsJson: string): string;
  list(): string;
  pause(id: string): string;
  pauseAll(): string;
  resume(id: string): string;
  resumeAll(): string;
  retry(id: string, url: string, headersJson: string): string;
  cancel(id: string): string;
  cancelAll(): string;
  remove(id: string): string;
  reorder(idsJson: string): string;
  library(): string;
  byRelease(releaseId: string): string;
  check(itemsJson: string): string;
  deleteFile(path: string): string;
  deleteGroup(name: string): string;
  getSettings(): string;
  saveSettings(patchJson: string): string;
  readSkip(path: string): string;
  saveSkip(path: string, skipJson: string): string;
};

type ElectronApi = NonNullable<Window['electron']>;

/** Методы загрузок, которые умеет и десктоп, и телефон. */
export type DownloadHost = Pick<ElectronApi,
  | 'queueEpisodeDownloads'
  | 'getDownloadSettings'
  | 'saveDownloadSettings'
  | 'resetDownloadDirectory'
  | 'pickDownloadDirectory'
  | 'openDownloadDirectory'
  | 'showDownloadFile'
  | 'listDownloadLibrary'
  | 'listDownloadsByRelease'
  | 'readDownloadSkipMarks'
  | 'saveDownloadSkipMarks'
  | 'deleteDownloadFile'
  | 'deleteDownloadGroup'
  | 'pauseDownload'
  | 'pauseAllDownloads'
  | 'resumeDownload'
  | 'resumeAllDownloads'
  | 'isDownloadResumeBlocked'
  | 'setDownloadStreamingHold'
  | 'reorderDownloads'
  | 'checkDownloadFiles'
  | 'cancelDownload'
  | 'cancelAllDownloads'
  | 'getActiveDownloadQueue'
  | 'removeDownloadEntry'
  | 'playDownloadInApp'
> & {
  /** Повтор ошибки со свежей ссылкой (только телефон). */
  retryDownload?: (
    id: string,
    fresh?: { url: string; headers?: Record<string, string> } | null,
  ) => Promise<{ ok: boolean }>;
  /** Воспроизведение идёт через AnixLocalMedia, а не anix-local:// */
  isPhone?: boolean;
};

/** Префикс, который перехватывает AnixLocalMedia.java. */
export const PHONE_LOCAL_MEDIA_PREFIX = '/__anix_local__';

function nativeDownloads(): NativeDownloads | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { AnixDownloads?: NativeDownloads }).AnixDownloads ?? null;
}

export function hasPhoneDownloads(): boolean {
  return nativeDownloads() != null;
}

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** URL скачанного файла для <video>/hls.js: каждый сегмент пути кодируется отдельно. */
export function phoneLocalMediaUrl(filePath: string): string {
  const encoded = filePath
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
  return `${origin}${PHONE_LOCAL_MEDIA_PREFIX}${encoded.startsWith('/') ? '' : '/'}${encoded}`;
}

let cached: DownloadHost | null = null;

export function phoneDownloadHost(): DownloadHost | null {
  const n = nativeDownloads();
  if (!n) return null;
  if (cached) return cached;

  const call = <T>(fn: () => string, fallback: T): Promise<T> => {
    try {
      return Promise.resolve(parse<T>(fn(), fallback));
    } catch {
      return Promise.resolve(fallback);
    }
  };

  cached = {
    isPhone: true,
    queueEpisodeDownloads: (payload) =>
      call(() => n.enqueue(JSON.stringify(payload?.items ?? [])), { ok: false, items: [] }),
    getDownloadSettings: () => call(() => n.getSettings(), {
      directory: '',
      defaultDirectory: '',
      organizeByTitle: true,
      allAtOnce: false,
      autoClearFinished: true,
    }),
    saveDownloadSettings: (patch) => call(() => n.saveSettings(JSON.stringify(patch ?? {})), { ok: false }),
    // Папка фиксирована (память приложения) — выбора нет.
    resetDownloadDirectory: () => call(() => n.getSettings(), { ok: false }).then((s) => ({ ...s, ok: true })),
    listDownloadLibrary: () => call(() => n.library(), []),
    listDownloadsByRelease: (releaseId) => call(() => n.byRelease(String(releaseId)), []),
    readDownloadSkipMarks: (filePath) => call(() => n.readSkip(filePath), null),
    saveDownloadSkipMarks: ({ filePath, skip }) =>
      call(() => n.saveSkip(filePath, JSON.stringify(skip ?? null)), { ok: false }),
    deleteDownloadFile: (filePath) => call(() => n.deleteFile(filePath), { ok: false }),
    deleteDownloadGroup: (groupName) => call(() => n.deleteGroup(groupName), { ok: false }),
    pauseDownload: (id) => call(() => n.pause(id), { ok: false }),
    pauseAllDownloads: () => call(() => n.pauseAll(), { ok: false }),
    resumeDownload: (id) => call(() => n.resume(id), { ok: false }),
    resumeAllDownloads: () => call(() => n.resumeAll(), { ok: false }),
    isDownloadResumeBlocked: () => Promise.resolve({ blocked: false }),
    reorderDownloads: ({ orderedIds }) => call(() => n.reorder(JSON.stringify(orderedIds ?? [])), { ok: false }),
    checkDownloadFiles: ({ items }) => call(() => n.check(JSON.stringify(items ?? [])), []),
    cancelDownload: (id) => call(() => n.cancel(id), { ok: false }),
    cancelAllDownloads: () => call(() => n.cancelAll(), { ok: false }),
    getActiveDownloadQueue: () => call(() => n.list(), []),
    removeDownloadEntry: (id) => call(() => n.remove(id), { ok: false }),
    retryDownload: (id, fresh) =>
      call(() => n.retry(id, fresh?.url ?? '', fresh?.headers ? JSON.stringify(fresh.headers) : ''), { ok: false }),
    playDownloadInApp: async (payload) => {
      if (!payload?.filePath) return { ok: false, error: 'file-missing' };
      const params: Record<string, string> = {
        localFile: payload.filePath,
        title: payload.title || '',
        releaseId: payload.releaseId != null ? String(payload.releaseId) : '',
        sourceId: payload.sourceId != null ? String(payload.sourceId) : '',
        ep: payload.episodePosition != null ? String(payload.episodePosition) : '1',
        sourceName: payload.sourceName || '',
        dubberName: payload.dubberName || '',
        dubberId: payload.dubberId != null ? String(payload.dubberId) : '',
      };
      // Как player:changeContent в Electron: уже открытый плеер переключаем на месте.
      if (isEmbeddedWebPlayer()) {
        window.dispatchEvent(new CustomEvent('player:changeContent', { detail: { ...params, local: true } }));
      } else {
        navigate(`/watch?${new URLSearchParams(params).toString()}`);
      }
      return { ok: true };
    },
  };
  return cached;
}
