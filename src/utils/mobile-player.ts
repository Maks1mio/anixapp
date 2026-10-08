/**
 * Выбор плеера на телефоне («Выберите плеер»): веб-плеер источника, АниксПлеер (наш AnixApp Player по Intent API),
 * встроенный плеер (/watch на hls.js) и сторонний (системный выбор). Настройка хранится локально.
 */
import { launchPlayer, type WatchLaunchParams } from './watch-nav';

export type MobilePlayerKind = 'web' | 'anix' | 'builtin' | 'external';

export interface MobilePlayerPrefs {
  kind: MobilePlayerKind;
  /** «Спрашивать всегда» — показывать диалог выбора перед каждой серией. */
  ask: boolean;
}

/** Окно серий вокруг текущей для M3U во VLC/mpv. */
export type ExternalPlaylistWindow = 50 | 100 | 'all';

export const EXTERNAL_PLAYLIST_ASK_THRESHOLD = 25;

export interface ExternalLaunchOpts {
  /** Сколько серий резолвить в плейлист (окно вокруг текущей или все). */
  playlistWindow?: ExternalPlaylistWindow;
  signal?: AbortSignal;
  onProgress?: (p: { done: number; total: number }) => void;
  /** Уже загруженный список серий (position/name/url) — без повторного getEpisodes. */
  episodeMeta?: Array<{ position: number; name?: string; url?: string }>;
  /** Конкретный сторонний плеер (vlc / mpv / …) из player-integration. */
  playerId?: string;
}

const PREFS_KEY = 'anix:mobilePlayerPrefs';
const DEFAULTS: MobilePlayerPrefs = { kind: 'builtin', ask: true };

export function getMobilePlayerPrefs(): MobilePlayerPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<MobilePlayerPrefs>;
    const kinds: MobilePlayerKind[] = ['web', 'anix', 'builtin', 'external'];
    return {
      kind: kinds.includes(p.kind as MobilePlayerKind) ? (p.kind as MobilePlayerKind) : DEFAULTS.kind,
      ask: p.ask !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setMobilePlayerPrefs(prefs: MobilePlayerPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

export function needsExternalPlaylistRange(episodeCount: number): boolean {
  return episodeCount > EXTERNAL_PLAYLIST_ASK_THRESHOLD;
}

/** Индексы окна вокруг текущей серии в отсортированном списке. */
export function externalPlaylistSliceBounds(
  episodeCount: number,
  currentIndex: number,
  window: ExternalPlaylistWindow,
): { start: number; end: number } {
  if (window === 'all' || episodeCount <= 0) return { start: 0, end: Math.max(0, episodeCount) };
  const size = Math.min(window, episodeCount);
  const center = Math.max(0, Math.min(currentIndex, episodeCount - 1));
  const radius = Math.floor(size / 2);
  let start = Math.max(0, center - radius);
  let end = Math.min(episodeCount, start + size);
  start = Math.max(0, end - size);
  return { start, end };
}

export function describeExternalPlaylistWindow(
  positions: number[],
  currentEp: number,
  window: ExternalPlaylistWindow,
): { label: string; description: string; from: number; to: number; count: number } {
  // length (сколько в списке) и max (последний номер) часто расходятся — дыры в нумерации Anixart.
  const sorted = [...new Set(positions.filter((n) => Number.isFinite(n)))].sort((a, b) => a - b);
  const idx = sorted.findIndex((p) => p === currentEp);
  const center = idx >= 0 ? idx : 0;
  const { start, end } = externalPlaylistSliceBounds(sorted.length, center, window);
  const slice = sorted.slice(start, end);
  const from = slice[0] ?? currentEp;
  const to = slice[slice.length - 1] ?? currentEp;
  const count = slice.length;
  const listFrom = sorted[0] ?? currentEp;
  const listTo = sorted[sorted.length - 1] ?? currentEp;
  const listCount = sorted.length;
  if (window === 'all') {
    // В UI «всего» = последний номер серии (1122), не length при дырах в API (1120).
    return {
      label: `Все серии (${listTo})`,
      description: listCount
        ? `Подготовить все ${listTo} серий · долго на больших тайтлах`
        : 'Подготовить полный плейлист',
      from: listFrom,
      to: listTo,
      count: listCount,
    };
  }
  return {
    label: `${window} серий`,
    description: count
      ? `Около текущей: ${from}–${to} · ${count} шт.`
      : `±${Math.floor(window / 2)} от текущей серии`,
    from,
    to,
    count,
  };
}

type NativePlugin = {
  openExternalPlayer?: (o: Record<string, unknown>) => Promise<{
    installed?: boolean;
    closed?: boolean;
    positionMs?: number;
    durationMs?: number;
    completed?: boolean;
  }>;
};

function nativePlugin(): NativePlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixPlayer?: NativePlugin } } }).Capacitor?.Plugins?.AnixPlayer;
}

const QUALITY_ORDER = ['1080', '720', '480', '360', '240'];

interface ResolvedStream {
  url: string;
  headers: string[];
  title?: string;
}

type ReleaseApi = {
  getEpisode: (r: number, s: number, e: number) => Promise<{ episode?: { url?: string; name?: string } }>;
  getEpisodes?: (r: number, d: number, s: number, sort?: number) => Promise<{
    episodes?: Array<{ position?: number; name?: string; url?: string }>;
  }>;
  getDirectVideoLink: (u: string) => Promise<{
    directUrl?: string | null;
    qualityMap?: Record<string, string>;
    downloadHeaders?: Record<string, string>;
  }>;
};

function releaseApi(): ReleaseApi {
  return (window.anixApi as unknown as { release: ReleaseApi }).release;
}

function pickDirectUrl(direct: Awaited<ReturnType<ReleaseApi['getDirectVideoLink']>>): string {
  const map = direct?.qualityMap ?? {};
  const key = QUALITY_ORDER.find((q) => map[q] || map[`${q}p`]);
  const url = (key ? map[key] || map[`${key}p`] : direct?.directUrl) || '';
  if (!url) return '';
  return url.startsWith('http') ? url : `https:${url}`;
}

function headersObject(pairs: string[]): Record<string, string> {
  return Object.fromEntries(
    pairs.reduce<Array<[string, string]>>((out, value, index, all) => {
      if (index % 2 === 0 && all[index + 1] != null) out.push([value, all[index + 1]]);
      return out;
    }, []),
  );
}

function episodeTitle(releaseTitle: string, position: number, episodeName?: string): string {
  const base = String(releaseTitle || '').trim() || 'AnixApp';
  const epLabel = `${position} серия`;
  const name = String(episodeName || '').trim();
  if (name && name !== epLabel && !/^\d+$/.test(name)) return `${base} — ${epLabel} (${name})`;
  return `${base} — ${epLabel}`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error('cancelled');
    err.name = 'AbortError';
    throw err;
  }
}

/** Серия → прямая ссылка (через AnixBack, как и во встроенном плеере). */
async function resolveEpisodeStream(
  releaseId: string | number,
  sourceId: string | number,
  ep: string | number,
  opts?: { embedUrl?: string; episodeName?: string; releaseTitle?: string; signal?: AbortSignal },
): Promise<ResolvedStream> {
  throwIfAborted(opts?.signal);
  const api = releaseApi();
  let embed = opts?.embedUrl || '';
  let episodeName = opts?.episodeName || '';
  if (!embed) {
    const res = await api.getEpisode(Number(releaseId), Number(sourceId), Number(ep));
    throwIfAborted(opts?.signal);
    embed = res?.episode?.url || '';
    if (!episodeName) episodeName = res?.episode?.name || '';
  }
  if (!embed) throw new Error('Не удалось получить ссылку на серию');
  const direct = await api.getDirectVideoLink(embed);
  throwIfAborted(opts?.signal);
  const abs = pickDirectUrl(direct);
  if (!abs) throw new Error('Источник не отдал прямую ссылку — попробуйте другой плеер или источник');
  const headers: string[] = [];
  for (const [k, v] of Object.entries(direct?.downloadHeaders ?? {})) headers.push(k, String(v));
  return {
    url: abs,
    headers,
    title: episodeTitle(opts?.releaseTitle || '', Number(ep), episodeName),
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      throwIfAborted(signal);
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => run()));
  return out;
}

interface PlaylistEntry {
  url: string;
  title: string;
  position: number;
}

type EpisodeMeta = { position: number; name: string; url: string };

function sliceMetaWindow(meta: EpisodeMeta[], currentEp: number, window: ExternalPlaylistWindow): EpisodeMeta[] {
  if (window === 'all' || meta.length <= EXTERNAL_PLAYLIST_ASK_THRESHOLD) return meta;
  const idx = meta.findIndex((m) => m.position === currentEp);
  const center = idx >= 0 ? idx : 0;
  const { start, end } = externalPlaylistSliceBounds(meta.length, center, window);
  return meta.slice(start, end);
}

/** Список серий источника → прямые URL с подписями для VLC/mpv. */
async function buildExternalPlaylist(
  params: WatchLaunchParams,
  opts: ExternalLaunchOpts = {},
): Promise<{
  current: ResolvedStream;
  playlist: PlaylistEntry[];
  startIndex: number;
}> {
  const api = releaseApi();
  const releaseId = Number(params.releaseId);
  const sourceId = Number(params.sourceId);
  const currentEp = Number(params.ep);
  const dubberId = params.dubberId != null && params.dubberId !== '' ? Number(params.dubberId) : NaN;
  const signal = opts.signal;
  const playlistWindow: ExternalPlaylistWindow = opts.playlistWindow ?? 'all';

  let meta: EpisodeMeta[] = [];
  if (opts.episodeMeta?.length) {
    meta = opts.episodeMeta
      .map((e) => ({
        position: Number(e.position),
        name: typeof e.name === 'string' ? e.name : '',
        url: typeof e.url === 'string' ? e.url : '',
      }))
      .filter((e) => Number.isFinite(e.position))
      .sort((a, b) => a.position - b.position);
  } else if (Number.isFinite(dubberId) && api.getEpisodes) {
    try {
      const res = await api.getEpisodes(releaseId, dubberId, sourceId);
      throwIfAborted(signal);
      meta = (res?.episodes || [])
        .map((e) => ({
          position: Number(e.position),
          name: typeof e.name === 'string' ? e.name : '',
          url: typeof e.url === 'string' ? e.url : '',
        }))
        .filter((e) => Number.isFinite(e.position))
        .sort((a, b) => a.position - b.position);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      /* fallback ниже */
    }
  }
  if (!meta.length) {
    meta = [{ position: currentEp, name: '', url: '' }];
  }

  meta = sliceMetaWindow(meta, currentEp, playlistWindow);
  const total = meta.length;
  opts.onProgress?.({ done: 0, total });

  let done = 0;
  const resolved = await mapPool(meta, 3, async (item) => {
    throwIfAborted(signal);
    try {
      const stream = await resolveEpisodeStream(releaseId, sourceId, item.position, {
        embedUrl: item.url || undefined,
        episodeName: item.name,
        releaseTitle: params.title,
        signal,
      });
      return {
        position: item.position,
        url: stream.url,
        title: stream.title || episodeTitle(params.title, item.position, item.name),
        headers: stream.headers,
      };
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      return null;
    } finally {
      done += 1;
      opts.onProgress?.({ done, total });
    }
  }, signal);

  const playlist = resolved.filter((e): e is NonNullable<typeof e> => !!e);
  if (!playlist.length) {
    throwIfAborted(signal);
    const current = await resolveEpisodeStream(releaseId, sourceId, currentEp, {
      releaseTitle: params.title,
      signal,
    });
    return {
      current,
      playlist: [{ url: current.url, title: current.title || episodeTitle(params.title, currentEp), position: currentEp }],
      startIndex: 0,
    };
  }

  let startIndex = playlist.findIndex((e) => e.position === currentEp);
  if (startIndex < 0) startIndex = 0;
  const current = {
    url: playlist[startIndex].url,
    headers: playlist[startIndex].headers,
    title: playlist[startIndex].title,
  };
  return {
    current,
    playlist: playlist.map((e) => ({ url: e.url, title: e.title, position: e.position })),
    startIndex,
  };
}

export interface MobileLaunchResult {
  /** false — плеер открыт, но серию отмечать просмотренной по возврату не нужно (например, не установлен). */
  started: boolean;
  message?: string;
  cancelled?: boolean;
}

/** Десктоп: VLC/mpv с M3U-плейлистом (окно серий или все). */
async function launchExternalDesktop(
  params: WatchLaunchParams,
  opts: ExternalLaunchOpts = {},
): Promise<MobileLaunchResult> {
  const openPlayer = window.electron?.openExternalPlayer;
  if (!openPlayer) return { started: false, message: 'Запуск внешнего плеера недоступен в этой сборке' };

  try {
    const built = await buildExternalPlaylist(params, opts);
    throwIfAborted(opts.signal);
    const headers = headersObject(built.current.headers);
    const result = await openPlayer({
      url: built.current.url,
      headers,
      title: built.current.title,
      playlist: built.playlist.map((e) => ({ url: e.url, title: e.title })),
      startIndex: built.startIndex,
      ...(opts.playerId ? { playerId: opts.playerId } : {}),
    });
    if (!result?.ok) {
      return {
        started: false,
        message: result?.reason === 'player-not-found'
          ? 'Не найден VLC или mpv. Установите один из них и повторите попытку.'
          : 'Не удалось запустить VLC или mpv.',
      };
    }
    return { started: true };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError' || (e as Error)?.message === 'cancelled') {
      return { started: false, cancelled: true };
    }
    throw e;
  }
}

/** Запуск серии выбранным плеером. Для web/builtin — маршрут /watch; для anix/external — нативный Intent / системная ссылка. */
export async function launchWithKind(
  kind: MobilePlayerKind,
  params: WatchLaunchParams,
  opts: ExternalLaunchOpts = {},
): Promise<MobileLaunchResult> {
  if (kind === 'builtin') {
    await launchPlayer(params);
    return { started: true };
  }
  if (kind === 'web') {
    // Desktop: Kodik в iframe из 127.0.0.1 не играет — открываем URL источника top-level.
    if (window.electron?.openPlayerWindow) {
      await window.electron.openPlayerWindow({
        releaseId: String(params.releaseId),
        sourceId: String(params.sourceId),
        ep: String(params.ep),
        title: params.title,
        sourceName: params.sourceName,
        ...(params.dubberId != null ? { dubberId: String(params.dubberId) } : {}),
        ...(params.dubberName != null ? { dubberName: params.dubberName } : {}),
        sourceWeb: true,
      });
      return { started: true };
    }
    await launchPlayer({ ...params, webPlayer: true });
    return { started: true };
  }

  const plugin = nativePlugin();
  if (!plugin?.openExternalPlayer) {
    if (kind === 'external') return launchExternalDesktop(params, opts);
    return { started: false, message: 'Внешние плееры доступны только в приложении' };
  }
  const stream = await resolveEpisodeStream(params.releaseId, params.sourceId, params.ep, {
    releaseTitle: params.title,
    signal: opts.signal,
  });
  const out = await plugin.openExternalPlayer({
    mode: kind === 'anix' ? 'anix' : 'chooser',
    url: stream.url,
    title: stream.title || params.title,
    label: `${params.ep} серия`,
    headers: stream.headers,
    startMs: params.currentTime ? Math.round(params.currentTime * 1000) : 0,
  });
  if (kind === 'anix' && out?.installed === false) {
    return { started: false, message: 'АниксПлеер не установлен. Установите AnixApp Player или выберите другой плеер.' };
  }
  return { started: true };
}
