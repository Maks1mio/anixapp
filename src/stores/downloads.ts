import { writable, derived, get } from 'svelte/store';

export type DownloadStatus = 'queued' | 'starting' | 'downloading' | 'paused' | 'done' | 'error' | 'cancelled';

export interface DownloadEntry {
  id: string;
  filename: string;
  received: number;
  total: number;
  status: DownloadStatus;
  error?: string;
  filePath?: string;
  fileSize?: number;
  releaseId?: number;
  sourceId?: number;
  dubberId?: number;
  episodePosition?: number;
  releaseTitle?: string;
  folder?: string;
  dubberName?: string;
  sourceName?: string;
  playable?: boolean;
  /** bytes/sec, calculated on UI from progress deltas */
  speedBps?: number;
  /** seconds remaining estimate */
  etaSec?: number;
}

export interface DownloadLibraryFile {
  name: string;
  path: string;
  size: number;
  modifiedAt: number;
  episodePosition?: number | null;
  dubberName?: string;
  sourceName?: string;
  dubberId?: number | null;
  sourceId?: number | null;
}

export interface DownloadLibraryGroup {
  id: string;
  name: string;
  files: DownloadLibraryFile[];
  releaseId?: number | null;
  sourceId?: number | null;
  dubberId?: number | null;
  releaseTitle?: string;
  dubberName?: string;
  sourceName?: string;
}

export interface DownloadSettings {
  directory: string;
  defaultDirectory: string;
  organizeByTitle: boolean;
  /** false = по очереди (1 файл), true = все сразу */
  allAtOnce: boolean;
  autoClearFinished: boolean;
}

const doneTimers = new Map<string, ReturnType<typeof setTimeout>>();
const speedSamples = new Map<string, {
  startedAt: number;
  t: number;
  received: number;
  speedBps: number;
  etaSec: number;
  recent: number[];
}>();

const settingsStore = writable<DownloadSettings>({
  directory: '',
  defaultDirectory: '',
  organizeByTitle: true,
  allAtOnce: false,
  autoClearFinished: true,
});
const libraryStore = writable<DownloadLibraryGroup[]>([]);
const resumeBlockedStore = writable(false);

/**
 * Скорость для HLS: сегменты приходят пачками, а IPC шлёт и «пустые» апдейты статуса.
 * Считаем:
 * 1) среднюю за всё время (received / elapsed) — главный якорь
 * 2) мгновенную только при реальном приросте байт (dBytes > 0)
 */
function estimateSpeedAndEta(
  id: string,
  received: number,
  total: number,
  status: DownloadStatus,
): { speedBps?: number; etaSec?: number } {
  if (status !== 'downloading' && status !== 'starting') {
    if (status !== 'queued') speedSamples.delete(id);
    return {};
  }

  const now = Date.now();
  let prev = speedSamples.get(id);
  if (!prev || received < prev.received) {
    prev = {
      startedAt: now,
      t: now,
      received: Math.max(0, received),
      speedBps: 0,
      etaSec: 0,
      recent: [],
    };
    speedSamples.set(id, prev);
  }

  const elapsed = Math.max(0.001, (now - prev.startedAt) / 1000);
  const overall = received > 0 ? received / elapsed : 0;

  let speedBps = prev.speedBps;
  const recent = [...prev.recent];
  const dBytes = received - prev.received;
  const dt = (now - prev.t) / 1000;

  // Только реальный прирост — нулевые IPC-тики не должны ронять скорость в 0
  if (dBytes > 0 && dt >= 0.05) {
    const instant = dBytes / dt;
    recent.push(instant);
    if (recent.length > 10) recent.shift();
    const sorted = [...recent].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? instant;
    speedBps = speedBps > 0 ? speedBps * 0.4 + mid * 0.6 : mid;
    prev.t = now;
    prev.received = received;
  }

  // Якорь: средняя за сессию (устойчива к пачкам сегментов)
  if (overall > 0) {
    speedBps = speedBps > 0
      ? Math.max(speedBps * 0.35 + overall * 0.65, overall * 0.85)
      : overall;
  }

  const left = total > received && total > 0 ? total - received : 0;
  let etaSec = 0;
  if (speedBps > 512 && left > 0) {
    etaSec = left / speedBps;
  }

  speedSamples.set(id, {
    startedAt: prev.startedAt,
    t: prev.t,
    received: prev.received,
    speedBps,
    etaSec,
    recent,
  });

  return {
    speedBps: speedBps > 0 ? speedBps : undefined,
    etaSec: etaSec > 0 ? Math.max(1, Math.round(etaSec)) : undefined,
  };
}

function applySettingsPayload(data: Partial<DownloadSettings> & { directory?: string; defaultDirectory?: string }) {
  settingsStore.update((s) => ({
    directory: data.directory ?? s.directory,
    defaultDirectory: data.defaultDirectory ?? s.defaultDirectory,
    organizeByTitle: typeof data.organizeByTitle === 'boolean' ? data.organizeByTitle : s.organizeByTitle,
    allAtOnce: typeof data.allAtOnce === 'boolean' ? data.allAtOnce : s.allAtOnce,
    autoClearFinished: typeof data.autoClearFinished === 'boolean' ? data.autoClearFinished : s.autoClearFinished,
  }));
}

function createDownloadsStore() {
  const { subscribe, update } = writable<DownloadEntry[]>([]);

  async function loadSettings() {
    try {
      const data = await window.electron?.getDownloadSettings?.();
      if (data?.directory) applySettingsPayload(data);
    } catch {}
  }

  async function saveSettings(patch: {
    organizeByTitle?: boolean;
    allAtOnce?: boolean;
    autoClearFinished?: boolean;
  }) {
    try {
      const res = await window.electron?.saveDownloadSettings?.(patch);
      if (res?.ok) applySettingsPayload(res);
      else applySettingsPayload(patch);
    } catch {
      applySettingsPayload(patch);
    }
  }

  async function loadLibrary() {
    try {
      const groups = await window.electron?.listDownloadLibrary?.();
      if (Array.isArray(groups)) libraryStore.set(groups);
    } catch {}
  }

  async function pickDirectory() {
    const res = await window.electron?.pickDownloadDirectory?.();
    if (res?.ok && res.directory) {
      settingsStore.update((s) => ({ ...s, directory: res.directory! }));
      await loadLibrary();
      return res.directory;
    }
    return null;
  }

  async function resetDirectory() {
    const res = await window.electron?.resetDownloadDirectory?.();
    if (res?.ok && res.directory) {
      applySettingsPayload(res);
      await loadLibrary();
      return res.directory;
    }
    return null;
  }

  function handleProgress(e: CustomEvent<DownloadEntry>) {
    const d = e.detail;
    if (!d?.id) return;

    if (d.status === 'cancelled') {
      speedSamples.delete(d.id);
      update((list) => {
        const idx = list.findIndex((x) => x.id === d.id);
        const entry: DownloadEntry = {
          id: d.id,
          filename: d.filename,
          received: d.received ?? 0,
          total: d.total ?? 0,
          status: 'cancelled',
          error: d.error || 'Загрузка отменена пользователем',
          filePath: d.filePath,
          releaseId: d.releaseId,
          sourceId: d.sourceId,
          dubberId: d.dubberId,
          episodePosition: d.episodePosition,
          releaseTitle: d.releaseTitle,
          folder: d.folder,
          dubberName: d.dubberName,
          sourceName: d.sourceName,
        };
        if (idx === -1) return [...list, entry];
        const next = [...list];
        next[idx] = entry;
        return next;
      });
      const prev = doneTimers.get(d.id);
      if (prev) clearTimeout(prev);
      doneTimers.set(d.id, setTimeout(() => {
        doneTimers.delete(d.id);
        update((list) => list.filter((x) => !(x.id === d.id && x.status === 'cancelled')));
      }, 12_000));
      return;
    }

    update((list) => {
      const idx = list.findIndex((x) => x.id === d.id);
      const { speedBps, etaSec } = estimateSpeedAndEta(
        d.id,
        d.received ?? 0,
        d.total ?? 0,
        d.status,
      );
      const entry: DownloadEntry = {
        id: d.id,
        filename: d.filename,
        received: d.received ?? 0,
        total: d.total ?? 0,
        status: d.status,
        error: d.error,
        filePath: d.filePath,
        fileSize: d.fileSize,
        releaseId: d.releaseId,
        sourceId: d.sourceId,
        dubberId: d.dubberId,
        episodePosition: d.episodePosition,
        releaseTitle: d.releaseTitle,
        folder: d.folder,
        dubberName: d.dubberName,
        sourceName: d.sourceName,
        playable: d.playable,
        speedBps,
        etaSec,
      };
      if (idx === -1) return [...list, entry];
      const next = [...list];
      next[idx] = entry;
      return next;
    });

    if (d.status === 'done') {
      speedSamples.delete(d.id);
      void loadLibrary();
      const prev = doneTimers.get(d.id);
      if (prev) clearTimeout(prev);
      if (get(settingsStore).autoClearFinished) {
        doneTimers.set(d.id, setTimeout(() => {
          doneTimers.delete(d.id);
          update((list) => list.filter((x) => x.id !== d.id));
        }, 4000));
      }
    }

    if (d.status === 'error') {
      speedSamples.delete(d.id);
    }
  }

  async function removeEntry(id: string) {
    try { await window.electron?.removeDownloadEntry?.(id); } catch {}
    update((list) => list.filter((x) => x.id !== id));
  }

  async function cancelEntry(id: string) {
    try { await window.electron?.cancelDownload?.(id); } catch {}
  }

  async function pauseEntry(id: string) {
    try { await window.electron?.pauseDownload?.(id); } catch {}
  }

  async function resumeEntry(id: string) {
    try { await window.electron?.resumeDownload?.(id); } catch {}
  }

  async function pauseAllActive() {
    try { await window.electron?.pauseAllDownloads?.(); } catch {}
  }

  async function resumeAllActive() {
    try { await window.electron?.resumeAllDownloads?.(); } catch {}
  }

  async function reorderEntries(orderedIds: string[]) {
    try { await window.electron?.reorderDownloads?.({ orderedIds }); } catch {}
    update((list) => {
      const byId = new Map(list.map((x) => [x.id, x]));
      const next: DownloadEntry[] = [];
      const seen = new Set<string>();
      for (const id of orderedIds) {
        const e = byId.get(id);
        if (!e || seen.has(id)) continue;
        next.push(e);
        seen.add(id);
      }
      for (const e of list) {
        if (!seen.has(e.id)) next.push(e);
      }
      return next;
    });
  }

  async function deleteLibraryFile(filePath: string) {
    try {
      await window.electron?.deleteDownloadFile?.(filePath);
    } catch {}
    await loadLibrary();
  }

  async function deleteLibraryGroup(groupName: string) {
    try {
      await window.electron?.deleteDownloadGroup?.(groupName);
    } catch {}
    await loadLibrary();
  }

  async function cancelAllActive() {
    try { await window.electron?.cancelAllDownloads?.(); } catch {}
  }

  function clearErrors() {
    update((list) => list.filter((x) => x.status !== 'error' && x.status !== 'cancelled'));
  }

  async function hydrateQueue() {
    try {
      const items = await window.electron?.getActiveDownloadQueue?.();
      if (!Array.isArray(items) || items.length === 0) return;
      update((list) => {
        const byId = new Map(list.map((x) => [x.id, x]));
        for (const d of items) {
          if (!d?.id) continue;
          const status = (d.status || 'queued') as DownloadStatus;
          const prev = byId.get(d.id);
          byId.set(d.id, {
            id: d.id,
            filename: d.filename || prev?.filename || 'episode.mp4',
            received: typeof d.received === 'number' ? d.received : (prev?.received ?? 0),
            total: typeof d.total === 'number' ? d.total : (prev?.total ?? 0),
            status,
            error: d.error,
            filePath: d.filePath,
            releaseId: d.releaseId,
            sourceId: d.sourceId,
            dubberId: d.dubberId,
            episodePosition: d.episodePosition,
            releaseTitle: d.releaseTitle,
            folder: d.folder,
            dubberName: d.dubberName,
            sourceName: d.sourceName,
            speedBps: prev?.speedBps,
            etaSec: prev?.etaSec,
          });
        }
        return [...byId.values()];
      });
    } catch {}
  }

  function init() {
    void loadSettings();
    void loadLibrary();
    void hydrateQueue();
    void window.electron?.isDownloadResumeBlocked?.()
      .then((r) => { resumeBlockedStore.set(!!r?.blocked); })
      .catch(() => {});
    // Повторно подтянуть очередь — restore в main может завершиться чуть позже
    const t1 = setTimeout(() => { void hydrateQueue(); }, 2500);
    const t2 = setTimeout(() => { void hydrateQueue(); }, 5000);
    const onStreamingHold = (e: Event) => {
      const blocked = !!(e as CustomEvent<{ blocked?: boolean }>).detail?.blocked;
      resumeBlockedStore.set(blocked);
      if (blocked) void hydrateQueue();
    };
    window.addEventListener('episode-download:progress', handleProgress as EventListener);
    window.addEventListener('downloads:streaming-hold', onStreamingHold as EventListener);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('episode-download:progress', handleProgress as EventListener);
      window.removeEventListener('downloads:streaming-hold', onStreamingHold as EventListener);
      for (const t of doneTimers.values()) clearTimeout(t);
      doneTimers.clear();
    };
  }

  return {
    subscribe,
    loadSettings,
    saveSettings,
    loadLibrary,
    pickDirectory,
    resetDirectory,
    handleProgress,
    removeEntry,
    cancelEntry,
    pauseEntry,
    resumeEntry,
    pauseAllActive,
    resumeAllActive,
    reorderEntries,
    deleteLibraryFile,
    deleteLibraryGroup,
    cancelAllActive,
    clearErrors,
    hydrateQueue,
    init,
  };
}

export const downloads = createDownloadsStore();
export { settingsStore as downloadSettings, libraryStore as downloadLibrary, resumeBlockedStore as downloadResumeBlocked };

export const activeDownloadsCount = derived(downloads, ($dl) =>
  $dl.filter((x) =>
    x.status === 'queued'
    || x.status === 'downloading'
    || x.status === 'starting'
    || x.status === 'paused',
  ).length,
);

export const downloadsOverallProgress = derived(downloads, ($dl) => {
  const active = $dl.filter((x) => x.status === 'queued' || x.status === 'downloading');
  if (active.length === 0) return 0;
  let sum = 0;
  for (const e of active) {
    if (e.status === 'queued') {
      sum += 0;
    } else if (e.total > 0) {
      sum += Math.min(1, e.received / e.total);
    } else if (e.received > 0) {
      sum += 0.15;
    } else {
      sum += 0.05;
    }
  }
  return Math.min(100, Math.round((sum / active.length) * 100));
});
