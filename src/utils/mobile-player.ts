/**
 * Выбор плеера на телефоне («Выберите плеер»): веб-плеер источника, АниксПлеер (наш AnixApp Player по Intent API),
 * встроенный плеер (/watch на hls.js) и сторонний (системный выбор). Настройка хранится локально.
 */
import { launchPlayer, type WatchLaunchParams } from './watch-nav';
import { mlog, safeUrl } from '../services/mobile-log';

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
  /** Вместо окна вокруг серии — текущая и N следующих (АниксПлеер: «следующая серия» без долгой подготовки). */
  aheadOnly?: number;
  /** Постер релиза — превью серий в АниксПлеере. */
  thumbnail?: string;
}

/** Сколько следующих серий отдавать АниксПлееру вместе с текущей. */
export const ANIX_PLAYLIST_AHEAD = 11;

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
    playlistPosition?: number;
    resultCode?: number;
    hasData?: boolean;
    resumeIndices?: number[];
    resumeValuesMs?: number[];
  }>;
  openWebPlayer?: (o: { url: string; referer?: string; title?: string }) => Promise<{ closed?: boolean; seconds?: number }>;
  anixPlayerStatus?: () => Promise<{ installed?: boolean; versionCode?: number; ownInstalled?: boolean; abis?: string[] }>;
};

function nativePlugin(): NativePlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixPlayer?: NativePlugin } } }).Capacitor?.Plugins?.AnixPlayer;
}

const QUALITY_ORDER = ['1080', '720', '480', '360', '240'];

interface ResolvedStream {
  url: string;
  headers: string[];
  title?: string;
  /** Качества источника в формате АниксПлеера: {"720p": url}. */
  qualities?: Record<string, string>;
  episodeName?: string;
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

/** qualityMap источника → {"360p": url, …} с абсолютными ссылками (ключи как у Anixart). */
function normalizeQualities(direct: Awaited<ReturnType<ReleaseApi['getDirectVideoLink']>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(direct?.qualityMap ?? {})) {
    const m = /^(\d{3,4})p?$/i.exec(String(k).trim());
    if (!m || !v) continue;
    out[`${m[1]}p`] = v.startsWith('http') ? v : `https:${v}`;
  }
  return out;
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
    qualities: normalizeQualities(direct),
    episodeName,
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
  episodeName?: string;
  qualities?: Record<string, string>;
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

  if (opts.aheadOnly != null) {
    const idx = Math.max(0, meta.findIndex((m) => m.position === currentEp));
    meta = meta.slice(idx, idx + 1 + Math.max(0, opts.aheadOnly));
  } else {
    meta = sliceMetaWindow(meta, currentEp, playlistWindow);
  }
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
        episodeName: item.name || stream.episodeName,
        qualities: stream.qualities,
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
      playlist: [{
        url: current.url,
        title: current.title || episodeTitle(params.title, currentEp),
        position: currentEp,
        episodeName: current.episodeName,
        qualities: current.qualities,
      }],
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
    playlist: playlist.map((e) => ({
      url: e.url,
      title: e.title,
      position: e.position,
      episodeName: e.episodeName,
      qualities: e.qualities,
    })),
    startIndex,
  };
}

export interface MobileLaunchResult {
  /** false — плеер открыт, но серию отмечать просмотренной по возврату не нужно (например, не установлен). */
  started: boolean;
  message?: string;
  cancelled?: boolean;
  /** АниксПлеер не установлен — показать предложение установить. */
  notInstalled?: boolean;
  /** Номера серий, которые АниксПлеер прошёл по плейлисту (для отметки «просмотрено»). */
  watchedPositions?: number[];
}

const DEFAULT_IFRAME_EMBED = 'https://anixmirai.com/iframe?url=';
const DEFAULT_APP_REFERER = 'https://anixart-app.com/';
let iframeEmbedCache: { prefix: string; referer: string } | null = null;

/** Обёртка веб-плеера Anixart из config/toggles (как в ПК-версии), с запасным адресом. */
async function resolveIframeEmbed(): Promise<{ prefix: string; referer: string }> {
  if (iframeEmbedCache) return iframeEmbedCache;
  for (const base of ANIX_PLAYER_CONFIG_BASES) {
    try {
      const res = await fetch(`${base}/config/toggles?version_code=26090418&is_beta=true`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const j = (await res.json()) as { iframeEmbedUrl?: string; baseUrl?: string };
      const embed = typeof j.iframeEmbedUrl === 'string' ? j.iframeEmbedUrl.trim() : '';
      if (!/^https:\/\//i.test(embed)) continue;
      const prefix = /[=?&]$/.test(embed) ? embed : `${embed}${embed.includes('?') ? '&url=' : '?url='}`;
      const referer = typeof j.baseUrl === 'string' && /^https:\/\//i.test(j.baseUrl)
        ? (j.baseUrl.endsWith('/') ? j.baseUrl : `${j.baseUrl}/`)
        : DEFAULT_APP_REFERER;
      iframeEmbedCache = { prefix, referer };
      return iframeEmbedCache;
    } catch { /* следующее зеркало */ }
  }
  return { prefix: DEFAULT_IFRAME_EMBED, referer: DEFAULT_APP_REFERER };
}

async function launchNativeWebPlayer(plugin: NativePlugin, params: WatchLaunchParams): Promise<MobileLaunchResult> {
  const api = releaseApi();
  const res = await api.getEpisode(Number(params.releaseId), Number(params.sourceId), Number(params.ep));
  let embed = res?.episode?.url || '';
  if (!embed) throw new Error('Не удалось получить ссылку на серию');
  if (embed.startsWith('//')) embed = `https:${embed}`;
  const { prefix, referer } = await resolveIframeEmbed();
  // Как Anixart: ссылка серии без параметров запроса
  let clean = embed;
  try { const u = new URL(embed); clean = `${u.origin}${u.pathname}`; } catch { /* как есть */ }
  mlog('player', 'info', `Веб-плеер: «${params.title}», серия ${params.ep}, источник ${params.sourceName ?? '?'} (${safeUrl(clean)})`);
  const out = await plugin.openWebPlayer!({ url: `${prefix}${encodeURIComponent(clean)}`, referer, title: `${params.title} — ${params.ep} серия` });
  return { started: (out?.seconds ?? 0) >= 60, watchedPositions: (out?.seconds ?? 0) >= 60 ? [Number(params.ep)] : [] };
}

export interface AnixPlayerRelease {
  versionCode: number;
  whatsNew: string;
  downloadUrl: string | null;
}

const ANIX_PLAYER_CONFIG_BASES = ['https://api.anixart.app', 'https://api.anixart.tv', 'https://api-s.anixsekai.com'];

/** Как AnixPlayerDownload в Anixart: ссылка под ABI устройства → universal → любая. */
export function pickAnixPlayerDownload(links: Record<string, string>, abis: string[]): string | null {
  const ok = (u?: string) => (u && /^https:\/\//i.test(u.trim()) ? u.trim() : null);
  for (const abi of abis) {
    const u = ok(links[abi]);
    if (u) return u;
  }
  return ok(links.universal) ?? Object.values(links).map(ok).find(Boolean) ?? null;
}

/** Свежая версия официального АниксПлеера с сервера Anixart (config/anixplayer). */
export async function fetchAnixPlayerRelease(abis: string[]): Promise<AnixPlayerRelease | null> {
  for (const base of ANIX_PLAYER_CONFIG_BASES) {
    try {
      const res = await fetch(`${base}/config/anixplayer`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const j = (await res.json()) as { last_version_code?: number; whats_new?: string; download_links?: Record<string, string> };
      return {
        versionCode: Number(j.last_version_code) || 0,
        whatsNew: String(j.whats_new || ''),
        downloadUrl: pickAnixPlayerDownload(j.download_links || {}, abis),
      };
    } catch {
      /* следующее зеркало */
    }
  }
  return null;
}

/** Состояние официального АниксПлеера на устройстве (null — не Android). */
export async function getAnixPlayerStatus(): Promise<{ installed: boolean; versionCode?: number; ownInstalled: boolean; abis: string[] } | null> {
  const plugin = nativePlugin();
  if (!plugin?.anixPlayerStatus) return null;
  const s = await plugin.anixPlayerStatus();
  return { installed: !!s?.installed, versionCode: s?.versionCode, ownInstalled: !!s?.ownInstalled, abis: s?.abis ?? [] };
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
    // Android: Kodik во фрейме https://localhost не играет («Error code: ds») — нативное окно с обёрткой Anixart
    const native = nativePlugin();
    if (native?.openWebPlayer) return launchNativeWebPlayer(native, params);
    await launchPlayer({ ...params, webPlayer: true });
    return { started: true };
  }

  const plugin = nativePlugin();
  if (!plugin?.openExternalPlayer) {
    if (kind === 'external') return launchExternalDesktop(params, opts);
    return { started: false, message: 'Внешние плееры доступны только в приложении' };
  }
  if (kind === 'anix') return launchAnixPlayer(plugin, params, opts);
  const stream = await resolveEpisodeStream(params.releaseId, params.sourceId, params.ep, {
    releaseTitle: params.title,
    signal: opts.signal,
  });
  const out = await plugin.openExternalPlayer({
    mode: 'chooser',
    url: stream.url,
    title: stream.title || params.title,
    label: `${params.ep} серия`,
    headers: stream.headers,
    startMs: params.currentTime ? Math.round(params.currentTime * 1000) : 0,
  });
  return { started: out?.installed !== false };
}

/**
 * АниксПлеер: как Anixart — плейлист (текущая + следующие серии) с качествами, заголовками и позициями.
 * По возврату — какие серии плейлиста пройдены.
 */
async function launchAnixPlayer(
  plugin: NativePlugin,
  params: WatchLaunchParams,
  opts: ExternalLaunchOpts,
): Promise<MobileLaunchResult> {
  const status = await plugin.anixPlayerStatus?.().catch(() => null);
  if (status && !status.installed && !status.ownInstalled) {
    mlog('player', 'warn', 'АниксПлеер не установлен');
    return { started: false, notInstalled: true, message: 'АниксПлеер не установлен' };
  }
  const which = status?.installed ? `официальный (сборка ${status.versionCode ?? '?'})` : 'AnixApp Player (форк mpvEx)';
  const t0 = Date.now();
  try {
    const built = await buildExternalPlaylist(params, { ...opts, aheadOnly: opts.aheadOnly ?? ANIX_PLAYLIST_AHEAD });
    throwIfAborted(opts.signal);
    const cur = built.playlist[built.startIndex];
    const qualities = cur?.qualities ?? {};
    const selectedQuality = QUALITY_ORDER.map((q) => `${q}p`).find((q) => qualities[q]);
    mlog('player', 'info', `Запуск АниксПлеера — ${which}: «${params.title}», серия ${params.ep}, `
      + `в плейлисте ${built.playlist.length} (с ${built.startIndex + 1}-й), качество ${selectedQuality ?? 'по умолчанию'} `
      + `[${Object.keys(qualities).join(', ') || 'нет вариантов'}], поток ${safeUrl(built.current.url)}, `
      + `заголовков ${built.current.headers.length / 2}, позиция ${params.currentTime ? Math.round(params.currentTime) + ' с' : 'с начала'}`);
    const out = await plugin.openExternalPlayer!({
      mode: 'anix',
      url: built.current.url,
      title: built.current.title || params.title,
      label: `${params.ep} серия`,
      headers: built.current.headers,
      startMs: params.currentTime ? Math.round(params.currentTime * 1000) : 0,
      playlist: built.playlist.map((e) => ({
        url: e.url,
        name: String(params.title || '').trim() || 'AnixApp',
        info: e.episodeName && !/^\d+$/.test(e.episodeName) ? e.episodeName : `${e.position} серия`,
        qualities: e.qualities ?? {},
      })),
      startIndex: built.startIndex,
      ...(selectedQuality ? { selectedQuality } : {}),
      ...(opts.thumbnail ? { thumbnail: opts.thumbnail } : {}),
    });
    if (out?.installed === false) return { started: false, notInstalled: true, message: 'АниксПлеер не установлен' };
    const secs = Math.round((Date.now() - t0) / 1000);
    if (out?.resultCode !== -1 && !out?.hasData) {
      mlog('player', 'error', `АниксПлеер закрылся без ответа через ${secs} с — вероятно, вылет или зависание (ANR), `
        + 'либо его закрыли из недавних. Позиция не сохранена.');
    } else {
      const fmt = (ms?: number) => (ms != null ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}` : '?');
      mlog('player', 'info', `АниксПлеер закрыт через ${secs} с: позиция ${fmt(out?.positionMs)} из ${fmt(out?.durationMs)}`
        + (typeof out?.playlistPosition === 'number' ? `, остановились на ${out.playlistPosition + 1}-й в плейлисте` : ''));
    }
    const last = typeof out?.playlistPosition === 'number' && out.playlistPosition >= built.startIndex
      ? Math.min(out.playlistPosition, built.playlist.length - 1)
      : built.startIndex;
    return {
      started: true,
      watchedPositions: built.playlist.slice(built.startIndex, last + 1).map((e) => e.position),
    };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError' || (e as Error)?.message === 'cancelled') {
      mlog('player', 'info', 'Запуск АниксПлеера отменён');
      return { started: false, cancelled: true };
    }
    mlog('player', 'error', 'Не удалось запустить АниксПлеер:', e);
    throw e;
  }
}
