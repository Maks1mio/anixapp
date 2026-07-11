import { writable, derived } from 'svelte/store';

export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error' | 'cancelled';

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
}

export interface DownloadLibraryFile {
  name: string;
  path: string;
  size: number;
  modifiedAt: number;
  episodePosition?: number | null;
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
}

const doneTimers = new Map<string, ReturnType<typeof setTimeout>>();

const settingsStore = writable<DownloadSettings>({ directory: '', defaultDirectory: '' });
const libraryStore = writable<DownloadLibraryGroup[]>([]);

function createDownloadsStore() {
  const { subscribe, update } = writable<DownloadEntry[]>([]);

  async function loadSettings() {
    try {
      const data = await window.electron?.getDownloadSettings?.();
      if (data?.directory) {
        settingsStore.set({
          directory: data.directory,
          defaultDirectory: data.defaultDirectory || data.directory,
        });
      }
    } catch {}
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
      settingsStore.update(s => ({ ...s, directory: res.directory! }));
      await loadLibrary();
      return res.directory;
    }
    return null;
  }

  function handleProgress(e: CustomEvent<DownloadEntry>) {
    const d = e.detail;
    if (!d?.id) return;

    if (d.status === 'cancelled') {
      update(list => list.filter(x => x.id !== d.id));
      return;
    }

    update(list => {
      const idx = list.findIndex(x => x.id === d.id);
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
      };
      if (idx === -1) return [...list, entry];
      const next = [...list];
      next[idx] = entry;
      return next;
    });

    if (d.status === 'done') {
      void loadLibrary();
      const prev = doneTimers.get(d.id);
      if (prev) clearTimeout(prev);
      doneTimers.set(d.id, setTimeout(() => {
        doneTimers.delete(d.id);
        update(list => list.filter(x => x.id !== d.id));
      }, 4000));
    }
  }

  async function removeEntry(id: string) {
    try { await window.electron?.removeDownloadEntry?.(id); } catch {}
    update(list => list.filter(x => x.id !== id));
  }

  async function cancelEntry(id: string) {
    try { await window.electron?.cancelDownload?.(id); } catch {}
  }

  async function cancelAllActive() {
    try { await window.electron?.cancelAllDownloads?.(); } catch {}
  }

  function clearErrors() {
    update(list => list.filter(x => x.status !== 'error'));
  }

  function init() {
    void loadSettings();
    void loadLibrary();
    window.addEventListener('episode-download:progress', handleProgress as EventListener);
    return () => {
      window.removeEventListener('episode-download:progress', handleProgress as EventListener);
      for (const t of doneTimers.values()) clearTimeout(t);
      doneTimers.clear();
    };
  }

  return {
    subscribe,
    loadSettings,
    loadLibrary,
    pickDirectory,
    handleProgress,
    removeEntry,
    cancelEntry,
    cancelAllActive,
    clearErrors,
    init,
  };
}

export const downloads = createDownloadsStore();
export { settingsStore as downloadSettings, libraryStore as downloadLibrary };

export const activeDownloadsCount = derived(downloads, $dl =>
  $dl.filter(x => x.status === 'queued' || x.status === 'downloading').length,
);

export const downloadsOverallProgress = derived(downloads, $dl => {
  const active = $dl.filter(x => x.status === 'queued' || x.status === 'downloading');
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
