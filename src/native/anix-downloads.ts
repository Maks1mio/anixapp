/**
 * Загрузки на телефоне: тонкая обёртка над нативным плагином AnixPlayer (Media3 DownloadManager).
 * Метаданные тайтла лежат прямо в загрузке (БД Media3), поэтому список «Загрузки» работает без сети.
 */

export interface DownloadMeta {
  releaseId: number;
  releaseTitle: string;
  /** Исходный URL постера (для сохранения в файл). */
  poster?: string;
  /** Локальный файл постера (после savePoster). */
  posterPath?: string;
  sourceId: number;
  sourceName: string;
  dubberId: number;
  dubberName: string;
  episodePosition: number;
  episodeName?: string;
  /** Сколько серий в озвучке (для «12 из 14»). */
  episodesTotal?: number;
  quality?: string;
}

export type DownloadState =
  | 'queued' | 'downloading' | 'completed' | 'failed' | 'stopped' | 'removing' | 'restarting' | 'unknown';

export interface DownloadItem {
  /** `releaseId:sourceId:dubberId:ep|quality` */
  id: string;
  state: DownloadState;
  percent: number;
  bytes: number;
  totalBytes: number;
  title: string;
  meta?: DownloadMeta;
}

export interface StorageInfo {
  freeBytes: number;
  totalBytes: number;
  cacheBytes: number;
}

interface Plugin {
  download?: (o: Record<string, unknown>) => Promise<{ downloadId?: string; skipped?: boolean; quality?: string }>;
  downloads?: () => Promise<{ downloads: Array<Record<string, unknown>> }>;
  removeDownload?: (o: { downloadId: string }) => Promise<void>;
  pauseDownloads?: () => Promise<void>;
  resumeDownloads?: () => Promise<void>;
  storage?: () => Promise<StorageInfo>;
  savePoster?: (o: { key: string; url: string }) => Promise<{ path: string }>;
  playOffline?: (o: Record<string, unknown>) => Promise<unknown>;
  networkState?: () => Promise<{ online?: boolean; connected?: boolean; metered?: boolean }>;
  addListener?: (name: string, cb: (e: Record<string, unknown>) => void) => Promise<{ remove: () => void }> | { remove: () => void };
}

type CapWindow = {
  Capacitor?: {
    Plugins?: { AnixPlayer?: Plugin };
    convertFileSrc?: (p: string) => string;
    isNativePlatform?: () => boolean;
  };
};

function plugin(): Plugin | undefined {
  return (window as unknown as CapWindow).Capacitor?.Plugins?.AnixPlayer;
}

/** Нативные загрузки доступны только в Android-приложении. */
export function downloadsAvailable(): boolean {
  return !!plugin()?.download;
}

export function episodeKey(releaseId: number, sourceId: number, dubberId: number, ep: number): string {
  return `${releaseId}:${sourceId}:${dubberId}:${ep}`;
}

export function groupKey(releaseId: number, sourceId: number, dubberId: number): string {
  return `${releaseId}:${sourceId}:${dubberId}`;
}

/** Файл постера → URL, который можно показать в WebView. */
export function posterSrc(meta: Pick<DownloadMeta, 'posterPath' | 'poster'> | undefined): string {
  if (!meta) return '';
  const cap = (window as unknown as CapWindow).Capacitor;
  if (meta.posterPath && cap?.convertFileSrc) return cap.convertFileSrc(meta.posterPath);
  return meta.poster ?? '';
}

function toItem(raw: Record<string, unknown>): DownloadItem {
  return {
    id: String(raw.id ?? ''),
    state: (raw.state as DownloadState) ?? 'unknown',
    percent: Math.max(0, Number(raw.percent ?? 0)),
    bytes: Math.max(0, Number(raw.bytes ?? 0)),
    totalBytes: Math.max(0, Number(raw.totalBytes ?? 0)),
    title: String(raw.title ?? ''),
    meta: raw.meta && typeof raw.meta === 'object' ? (raw.meta as DownloadMeta) : undefined,
  };
}

export async function listDownloads(): Promise<DownloadItem[]> {
  const res = await plugin()?.downloads?.();
  return (res?.downloads ?? []).map(toItem);
}

/** Поставить серию в очередь. Резолв ссылки — нативно, через AnixBack. */
export async function queueEpisode(meta: DownloadMeta, embedUrl: string, quality?: string): Promise<{ skipped: boolean }> {
  const p = plugin();
  if (!p?.download) throw new Error('Загрузки доступны только в приложении');
  const res = await p.download({
    id: episodeKey(meta.releaseId, meta.sourceId, meta.dubberId, meta.episodePosition),
    embedUrl,
    quality,
    title: meta.episodeName || `${meta.episodePosition} серия`,
    meta,
  });
  return { skipped: !!res?.skipped };
}

export async function removeDownload(downloadId: string): Promise<void> {
  await plugin()?.removeDownload?.({ downloadId });
}

export async function pauseAll(): Promise<void> { await plugin()?.pauseDownloads?.(); }
export async function resumeAll(): Promise<void> { await plugin()?.resumeDownloads?.(); }

export async function storageInfo(): Promise<StorageInfo | null> {
  try { return (await plugin()?.storage?.()) ?? null; } catch { return null; }
}

/** Скачивает постер в файл приложения; на ошибке возвращает undefined (покажем онлайн-URL). */
export async function savePoster(releaseId: number, url: string): Promise<string | undefined> {
  try {
    const res = await plugin()?.savePoster?.({ key: `r${releaseId}`, url });
    return res?.path;
  } catch { return undefined; }
}

export interface OfflineEpisode {
  downloadId: string;
  id: string;
  name: string;
}

/** Нативный плеер по скачанным сериям (без сети). */
export async function playOffline(title: string, items: OfflineEpisode[], startDownloadId?: string, startPositionMs = 0): Promise<void> {
  const p = plugin();
  if (!p?.playOffline) throw new Error('Офлайн-плеер доступен только в приложении');
  await p.playOffline({ title, items, startDownloadId, startPositionMs });
}

export async function onDownloadEvent(cb: () => void): Promise<() => void> {
  const p = plugin();
  if (!p?.addListener) return () => {};
  try {
    const h = await p.addListener('downloadState', cb);
    return () => { try { h.remove(); } catch { /* ignore */ } };
  } catch { return () => {}; }
}
