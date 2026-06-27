import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
import { WRAPPED_YEAR } from '../../../utils/yearWrapped';

export type WrappedRelease = Record<string, unknown>;
export type WrappedCollection = Record<string, unknown>;
export type WrappedProfile = Record<string, unknown>;

export interface WrappedYearStats {
  watchedThisYear: number;
  completedThisYear: number;
  droppedThisYear: number;
  favoritesAddedThisYear: number;
  watchingThisYear: number;
  planThisYear: number;
  holdOnThisYear: number;
  commentsThisYear: number;
  episodesThisYear: number;
  activeWatchDays: number;
}

export interface WatchDynamicsSummary {
  episodesWatched: number;
  activeDays: number;
  busiestDay: { label: string; count: number } | null;
  peakStreak: number;
}

export interface GenreStat {
  name: string;
  count: number;
}

export interface RankedRelease {
  release: WrappedRelease;
  /** Серий досмотрено (по last_view_episode.position) */
  count: number;
}

export interface PreferredBlock {
  label: string;
  items: { name: string; percent: number }[];
}

export interface WrappedComment {
  id: number;
  message: string;
  likes: number;
  replies: number;
  isSpoiler: boolean;
  timestamp: number;
  release: WrappedRelease | null;
}

/** Топ комментариев пользователя: приоритет этому году, сортировка по лайкам. */
export function buildTopComments(rawComments: WrappedRelease[], year: number, limit = 3): WrappedComment[] {
  const out: WrappedComment[] = [];
  for (const c of rawComments) {
    const msg = String(c.message ?? '').trim();
    if (!msg) continue;
    out.push({
      id: Number(c.id ?? 0),
      message: msg,
      likes: Number(c.likes_count ?? c.vote_count ?? 0),
      replies: Number(c.reply_count ?? 0),
      isSpoiler: Boolean(c.is_spoiler),
      timestamp: Number(c.timestamp ?? 0),
      release: (c.release && typeof c.release === 'object' ? c.release : null) as WrappedRelease | null,
    });
  }
  const thisYear = out.filter((c) => isTimestampInYear(c.timestamp, year));
  const pool = thisYear.length ? thisYear : out;
  return pool.sort((a, b) => b.likes - a.likes || b.timestamp - a.timestamp).slice(0, limit);
}

export interface CommunityTopItem {
  release: WrappedRelease;
  grade: number;
  voteCount: number;
  /** Пользователь смотрел этот тайтл */
  watchedByUser: boolean;
  /** Оценка пользователя (1..5) или null */
  userVote: number | null;
}

export interface CommunityTopSummary {
  items: CommunityTopItem[];
  /** Сколько тайтлов из топа пользователь смотрел */
  watchedCount: number;
  /** Сколько оценил */
  ratedCount: number;
  /** Размер рассмотренного топа (для текста «из N») */
  poolSize: number;
}

export function getYearRange(year: number): { start: number; end: number } {
  const start = new Date(year, 0, 1).getTime() / 1000;
  const end = new Date(year, 11, 31, 23, 59, 59).getTime() / 1000;
  return { start, end };
}

export function isTimestampInYear(timestamp: number | undefined | null, year: number): boolean {
  if (!timestamp) return false;
  return new Date(timestamp * 1000).getFullYear() === year;
}

export function filterByYear<T extends { last_view_timestamp?: number; voted_at?: number; add_date?: number }>(
  items: T[],
  year: number,
): T[] {
  const { start, end } = getYearRange(year);
  return items.filter((item) => {
    const ts = item.last_view_timestamp ?? item.voted_at ?? item.add_date;
    return ts != null && ts >= start && ts <= end;
  });
}

/** API отдаёт watched_time в минутах */
export function calculateHoursFromMinutes(minutes: number): number {
  return Math.round(minutes / 60);
}

export function calculateDaysFromMinutes(minutes: number): number {
  return Math.round(minutes / 60 / 24);
}

export function calculateAverageHoursPerDay(minutes: number, daysSinceRegistration: number): number {
  if (daysSinceRegistration <= 0) return 0;
  const hours = minutes / 60;
  return Math.round((hours / daysSinceRegistration) * 10) / 10;
}

/** @deprecated используйте calculateHoursFromMinutes — API в минутах */
export function calculateHoursFromSeconds(seconds: number): number {
  return calculateHoursFromMinutes(seconds);
}

export function calculateDaysFromSeconds(seconds: number): number {
  return calculateDaysFromMinutes(seconds);
}

export function getDaysSinceRegistration(registerDate: number): number {
  const now = Date.now();
  const registered = registerDate * 1000;
  return Math.ceil(Math.abs(now - registered) / (1000 * 60 * 60 * 24));
}

export function releaseId(release: WrappedRelease | null | undefined): number | null {
  if (!release) return null;
  const nested = release.release;
  const id = (typeof nested === 'object' && nested != null ? (nested as WrappedRelease).id : undefined)
    ?? release.id;
  return typeof id === 'number' && id > 0 ? id : null;
}

function episodeProgress(item: WrappedRelease): number {
  const ep = item.last_view_episode;
  if (ep && typeof ep === 'object') {
    const pos = Number((ep as WrappedRelease).position ?? 0);
    if (pos > 0) return pos;
  }
  return 1;
}

/**
 * Тайтл попадает в «топ года» только если пользователь его осознанно отслеживал:
 * есть статус списка (1..5) или личная оценка, и реально начат (позиция > 0).
 * Иначе это «случайно открыл серию» — история Anixart пишет позицию даже без просмотра.
 */
export function isTrackedWatched(item: WrappedRelease): boolean {
  const rel = (item.release && typeof item.release === 'object' ? item.release : item) as WrappedRelease;
  const lve = (item.last_view_episode ?? rel.last_view_episode) as WrappedRelease | undefined;
  const pos = lve && typeof lve === 'object' ? Number(lve.position ?? 0) : 0;
  const status = Number(
    item.profile_list_status ?? rel.profile_list_status ?? item.status_id ?? rel.status_id ?? 0,
  );
  const vote = Number(item.your_vote ?? rel.your_vote ?? 0);
  return pos > 0 && ((status >= 1 && status <= 5) || vote > 0);
}

export function getRankedFromHistory(history: WrappedRelease[]): RankedRelease[] {
  const byId = new Map<number, RankedRelease>();
  for (const item of history) {
    const id = releaseId(item);
    if (!id) continue;
    const progress = episodeProgress(item);
    const releaseData = (item.release && typeof item.release === 'object'
      ? item.release
      : item) as WrappedRelease;
    const existing = byId.get(id);
    if (!existing || progress > existing.count) {
      byId.set(id, { release: releaseData, count: progress });
    }
  }
  return [...byId.values()].sort((a, b) => b.count - a.count);
}

export function summarizeWatchDynamics(
  dynamics: unknown,
  year: number,
): WatchDynamicsSummary {
  const empty: WatchDynamicsSummary = {
    episodesWatched: 0,
    activeDays: 0,
    busiestDay: null,
    peakStreak: 0,
  };
  if (!Array.isArray(dynamics)) return empty;

  const inYear = dynamics.filter((d) => {
    const ts = Number((d as WrappedRelease).timestamp ?? 0);
    return isTimestampInYear(ts, year);
  });

  let episodesWatched = 0;
  let busiest: { label: string; count: number; ts: number } | null = null;
  const activeTimestamps: number[] = [];

  for (const raw of inYear) {
    const row = raw as WrappedRelease;
    const count = Number(row.count ?? 0);
    const ts = Number(row.timestamp ?? 0);
    episodesWatched += count;
    if (count > 0 && ts) {
      activeTimestamps.push(ts);
      if (!busiest || count > busiest.count) {
        busiest = {
          count,
          ts,
          label: new Date(ts * 1000).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
          }),
        };
      }
    }
  }

  activeTimestamps.sort((a, b) => a - b);
  let peakStreak = 0;
  let streak = 0;
  let prevDay: string | null = null;
  for (const ts of activeTimestamps) {
    const day = new Date(ts * 1000).toDateString();
    if (day === prevDay) continue;
    if (prevDay) {
      const diff = (ts - new Date(prevDay).getTime() / 1000) / 86400;
      streak = diff <= 1.5 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    peakStreak = Math.max(peakStreak, streak);
    prevDay = day;
  }

  return {
    episodesWatched,
    activeDays: new Set(activeTimestamps.map((ts) => new Date(ts * 1000).toDateString())).size,
    busiestDay: busiest ? { label: busiest.label, count: busiest.count } : null,
    peakStreak,
  };
}

export function genresFromHistory(history: WrappedRelease[], limit = 6): GenreStat[] {
  const counts = new Map<string, number>();
  for (const item of history) {
    const raw = String(item.genres ?? (item.release as WrappedRelease | undefined)?.genres ?? '');
    if (!raw.trim()) continue;
    for (const g of raw.split(',')) {
      const name = g.trim().toLowerCase();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function estimateYearWatchMinutes(history: WrappedRelease[]): number {
  let total = 0;
  for (const item of history) {
    const eps = episodeProgress(item);
    const dur = Number(item.duration ?? 24);
    total += eps * dur;
  }
  return total;
}

export function preferredBlocksFromProfile(profile: WrappedProfile): PreferredBlock[] {
  type Pref = { name?: string; percentage?: number; percent?: number };
  const blocks: PreferredBlock[] = [];
  const push = (raw: unknown, label: string) => {
    if (!Array.isArray(raw)) return;
    const items = (raw as Pref[])
      .slice(0, 4)
      .map((g) => ({
        name: String(g.name ?? '').trim(),
        percent: Math.round(Number(g.percentage ?? g.percent ?? 0)),
      }))
      .filter((g) => g.name);
    if (items.length) blocks.push({ label, items });
  };
  push(profile.preferred_genres, 'Жанры');
  push(profile.preferred_audiences, 'Аудитория');
  push(profile.preferred_themes, 'Тематика');
  return blocks;
}

export function getTopReleaseFromHistory(history: WrappedRelease[]): WrappedRelease | null {
  return getRankedFromHistory(history)[0]?.release ?? null;
}

export function releasePosterUrl(release: WrappedRelease | null | undefined): string {
  if (!release) return '';
  const image = release.image ?? release.poster;
  if (typeof image === 'string') return resolveCdnAssetUrl(image);
  if (image && typeof image === 'object') {
    const p = image as Record<string, { url?: string } | string>;
    const raw =
      (typeof p.original === 'object' ? p.original?.url : undefined)
      ?? (typeof p.medium === 'object' ? p.medium?.url : undefined)
      ?? (typeof p.small === 'object' ? p.small?.url : undefined)
      ?? (typeof p.original === 'string' ? p.original : undefined);
    if (raw) return resolveCdnAssetUrl(raw);
  }
  return '';
}

export function releaseTitle(release: WrappedRelease | null | undefined): string {
  if (!release) return 'Без названия';
  const ru = release.title_ru ?? release.title;
  const orig = release.title_original ?? release.title_en;
  if (typeof ru === 'string' && ru.trim()) return ru;
  if (typeof orig === 'string' && orig.trim()) return orig;
  return 'Без названия';
}

export function formatWrappedDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Статус списка пользователя (profile_list_status / status_id). */
export function listStatusLabel(status: number | null | undefined): string {
  switch (Number(status)) {
    case 1: return 'Смотрю';
    case 2: return 'В планах';
    case 3: return 'Просмотрено';
    case 4: return 'Отложено';
    case 5: return 'Брошено';
    default: return '';
  }
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function defaultYearStats(): WrappedYearStats {
  return {
    watchedThisYear: 0,
    completedThisYear: 0,
    droppedThisYear: 0,
    favoritesAddedThisYear: 0,
    watchingThisYear: 0,
    planThisYear: 0,
    holdOnThisYear: 0,
    commentsThisYear: 0,
    episodesThisYear: 0,
    activeWatchDays: 0,
  };
}

export function hasMinimalWrappedData(stats: WrappedYearStats, historyLen: number): boolean {
  return historyLen > 0 || stats.watchedThisYear > 0 || stats.episodesThisYear > 0;
}

/** Ключ франшизы — чтобы не показывать 4× One Piece */
/**
 * Базовый «стебель» названия франшизы: режем подзаголовок после двоеточия/тире
 * и убираем сезонные/типовые маркеры (TV, OVA, Part 2, San no Shou и т.п.),
 * чтобы все части одного тайтла («Пламенная бригада пожарных: …») схлопывались в один ключ.
 */
function franchiseStem(raw: string): string {
  let s = String(raw ?? '').toLowerCase();
  if (!s.trim()) return '';
  s = s.split(/[:：]\s/)[0].split(/\s[—–]\s/)[0];
  s = s
    .replace(
      /\b(?:tv|ova|ona|oad|special|specials|movie|film|mini\s*anime|picture\s*drama|recap|side\s*story)\b.*$/i,
      ' ',
    )
    .replace(/\b(?:season|part|chapter|cour|arc|no\s+shou)\b.*$/i, ' ')
    .replace(/[\s\-–—]+(?:\d+|[ivx]+)\s*$/i, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return s;
}

export function franchiseKey(release: WrappedRelease | null | undefined): string {
  if (!release) return '';
  const rel = release.related;
  if (rel && typeof rel === 'object') {
    const id = (rel as WrappedRelease).id;
    if (typeof id === 'number' && id > 0) return `fr:${id}`;
  }
  // У связанных релизов (related/{id}) поле related пустое — группируем по названию.
  const stem = franchiseStem(String(release.title_original ?? '')) || franchiseStem(String(release.title_ru ?? ''));
  if (stem) return `frtitle:${stem}`;
  const id = releaseId(release);
  return id ? `id:${id}` : '';
}

export function pickRecommendations(
  pool: WrappedRelease[],
  watchedIds: Set<number>,
  limit: number,
  usedFranchises: Set<string> = new Set(),
): WrappedRelease[] {
  const scored = pool
    .map((release) => {
      const id = releaseId(release);
      if (!id || watchedIds.has(id)) return null;
      const fk = franchiseKey(release);
      if (!fk || usedFranchises.has(fk)) return null;
      return { release, id, fk };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const out: WrappedRelease[] = [];
  for (const item of scored) {
    if (usedFranchises.has(item.fk)) continue;
    usedFranchises.add(item.fk);
    out.push(item.release);
    if (out.length >= limit) break;
  }
  return out;
}

/** Лет на платформе с момента регистрации (минимум 1). */
export function accountAgeYears(registerDate: number): number {
  if (!registerDate) return 0;
  const days = getDaysSinceRegistration(registerDate);
  return Math.max(1, Math.floor(days / 365));
}

/**
 * Лучшее аниме года по версии сообщества: из пула (отсортирован по популярности)
 * ранжируем по grade с минимальным порогом голосов, чтобы не всплывали случайные.
 */
export function rankCommunityBest(
  pool: WrappedRelease[],
  watchedIds: Set<number>,
  userVotesById: Map<number, number>,
  limit: number,
  minVotes = 2000,
): CommunityTopSummary {
  const seen = new Set<number>();
  const candidates: CommunityTopItem[] = [];

  for (const raw of pool) {
    const rel = (raw.release && typeof raw.release === 'object' ? raw.release : raw) as WrappedRelease;
    const id = releaseId(rel);
    if (!id || seen.has(id)) continue;
    const grade = Number(rel.grade ?? rel.rating ?? 0);
    const voteCount = Number(rel.vote_count ?? 0);
    if (!(grade > 0)) continue;
    if (voteCount < minVotes) continue;
    seen.add(id);
    candidates.push({
      release: rel,
      grade,
      voteCount,
      watchedByUser: watchedIds.has(id),
      userVote: userVotesById.get(id) ?? null,
    });
  }

  candidates.sort((a, b) => b.grade - a.grade || b.voteCount - a.voteCount);
  const poolSize = Math.min(candidates.length, Math.max(limit, 10));
  const ranked = candidates.slice(0, poolSize);

  return {
    items: ranked.slice(0, limit),
    watchedCount: ranked.filter((c) => c.watchedByUser).length,
    ratedCount: ranked.filter((c) => c.userVote != null).length,
    poolSize,
  };
}

export function scoreByGenres(release: WrappedRelease, topGenres: GenreStat[]): number {
  const blob = String(release.genres ?? '').toLowerCase();
  if (!blob.trim()) return 0;
  let score = 0;
  for (const g of topGenres) {
    if (blob.includes(g.name.toLowerCase())) score += g.count;
  }
  return score;
}

export { WRAPPED_YEAR };
