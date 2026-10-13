/**
 * Стор загрузок телефона: список из нативного Media3, группировка по «тайтл · озвучка · источник»,
 * прогресс (опрос, пока что-то качается) и состояние сети для офлайн-режима.
 */
import { derived, get, writable } from 'svelte/store';
import {
  resumeAll,
  downloadsAvailable,
  episodeKey,
  groupKey,
  listDownloads,
  onDownloadEvent,
  storageInfo,
  type DownloadItem,
  type DownloadMeta,
  type StorageInfo,
} from '../native/anix-downloads';

export interface EpisodeEntry {
  downloadId: string;
  position: number;
  name: string;
  state: DownloadItem['state'];
  percent: number;
  bytes: number;
  totalBytes: number;
}

export interface TitleGroup {
  key: string;
  releaseId: number;
  releaseTitle: string;
  meta: DownloadMeta;
  episodes: EpisodeEntry[];
  /** серии, которые уже можно смотреть без сети */
  done: number;
  active: number;
  failed: number;
  /** всего серий в озвучке (если известно) */
  total: number;
  bytes: number;
}

const itemsStore = writable<DownloadItem[]>([]);
const storageStore = writable<StorageInfo | null>(null);
export const downloadsReady = writable(false);
/** false — сеть недоступна (нативный флаг + браузерные события). */
export const isOnline = writable<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);

export const downloadItems = { subscribe: itemsStore.subscribe };
export const downloadStorage = { subscribe: storageStore.subscribe };

export const titleGroups = derived(itemsStore, ($items): TitleGroup[] => {
  const map = new Map<string, TitleGroup>();
  for (const it of $items) {
    const m = it.meta;
    if (!m || it.state === 'removing') continue;
    const key = groupKey(m.releaseId, m.sourceId, m.dubberId);
    let g = map.get(key);
    if (!g) {
      g = {
        key, releaseId: m.releaseId, releaseTitle: m.releaseTitle, meta: m,
        episodes: [], done: 0, active: 0, failed: 0, total: m.episodesTotal ?? 0, bytes: 0,
      };
      map.set(key, g);
    }
    // постер/название берём из любой серии, где они есть
    if (m.posterPath && !g.meta.posterPath) g.meta = { ...g.meta, posterPath: m.posterPath };
    if (m.episodesTotal && m.episodesTotal > g.total) g.total = m.episodesTotal;
    g.episodes.push({
      downloadId: it.id, position: m.episodePosition, name: m.episodeName || it.title || `${m.episodePosition} серия`,
      state: it.state, percent: it.percent, bytes: it.bytes, totalBytes: it.totalBytes,
    });
    g.bytes += it.bytes;
    if (it.state === 'completed') g.done += 1;
    else if (it.state === 'failed') g.failed += 1;
    else g.active += 1;
  }
  for (const g of map.values()) {
    g.episodes.sort((a, b) => a.position - b.position);
    if (g.total < g.episodes.length) g.total = g.episodes.length;
  }
  return [...map.values()].sort((a, b) => b.active - a.active || a.releaseTitle.localeCompare(b.releaseTitle, 'ru'));
});

export const hasActiveDownloads = derived(itemsStore, ($i) =>
  $i.some((x) => x.state === 'queued' || x.state === 'downloading' || x.state === 'restarting'));

export const totalDoneCount = derived(itemsStore, ($i) => $i.filter((x) => x.state === 'completed').length);

/** Статус серии по ключу `releaseId:sourceId:dubberId:ep` (любое качество). */
export function episodeStatus(items: DownloadItem[], releaseId: number, sourceId: number, dubberId: number, ep: number): DownloadItem | undefined {
  const prefix = `${episodeKey(releaseId, sourceId, dubberId, ep)}|`;
  return items.find((x) => x.id.startsWith(prefix) && x.state !== 'removing');
}

let started = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let stopEvent: (() => void) | null = null;

export async function refreshDownloads(): Promise<void> {
  if (!downloadsAvailable()) { downloadsReady.set(true); return; }
  try {
    itemsStore.set(await listDownloads());
    storageStore.set(await storageInfo());
  } catch { /* ignore */ }
  downloadsReady.set(true);
}

function ensurePolling() {
  const active = get(hasActiveDownloads);
  if (active && !pollTimer) pollTimer = setInterval(() => void refreshDownloads(), 1200);
  if (!active && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/** Подписка экрана на обновления; вернуть функцию отписки. Можно вызывать из нескольких компонентов. */
export function watchDownloads(): () => void {
  started += 1;
  if (started === 1) {
    void refreshDownloads();
    void onDownloadEvent(() => void refreshDownloads()).then((off) => { stopEvent = off; });
    unsubActive = hasActiveDownloads.subscribe(() => ensurePolling());
  }
  return () => {
    started = Math.max(0, started - 1);
    if (started === 0) {
      stopEvent?.(); stopEvent = null;
      unsubActive?.(); unsubActive = null;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }
  };
}
let unsubActive: (() => void) | null = null;

let connInit = false;

/**
 * Состояние сети: нативный флаг (VALIDATED) + события браузера + опрос раз в 2,5 с — события WebView
 * при переключении Wi‑Fi/данных приходят не всегда, а офлайн-режим должен включаться надёжно.
 */
export function initConnectivity(): void {
  if (connInit) return;
  connInit = true;
  const native = () => (window as unknown as { Capacitor?: { Plugins?: { AnixPlayer?: {
    networkState?: () => Promise<{ online?: boolean }>;
    addListener?: (n: string, cb: (e: { online?: boolean }) => void) => unknown;
  } } } }).Capacitor?.Plugins?.AnixPlayer;

  const poll = async () => {
    let online = navigator.onLine;
    try {
      const s = await native()?.networkState?.();
      if (typeof s?.online === 'boolean') online = online && s.online;
    } catch { /* ignore */ }
    isOnline.set(online);
  };

  let wasOnline = navigator.onLine;
  isOnline.subscribe((v) => {
    if (v && !wasOnline && get(itemsStore).some((x) => x.state === 'queued' || x.state === 'stopped')) void resumeAll();
    wasOnline = v;
  });
  window.addEventListener('online', () => void poll());
  window.addEventListener('offline', () => isOnline.set(false));
  try { void native()?.addListener?.('network', () => void poll()); } catch { /* ignore */ }
  void poll();
  setInterval(() => void poll(), 2500);
}
