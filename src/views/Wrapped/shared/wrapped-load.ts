import { WRAPPED_YEAR } from '../../../utils/yearWrapped';
import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
import { resolveJacksonPreviewList, resolveJacksonEntity } from '../../../utils/jackson-refs';
import {
  calculateHoursFromMinutes,
  defaultYearStats,
  estimateYearWatchMinutes,
  filterByYear,
  genresFromHistory,
  getRankedFromHistory,
  isTrackedWatched,
  pickRecommendations,
  preferredBlocksFromProfile,
  franchiseKey,
  releaseId,
  releasePosterUrl,
  scoreByGenres,
  summarizeWatchDynamics,
  accountAgeYears,
  rankCommunityBest,
  buildTopComments,
  type WrappedComment,
  type CommunityTopSummary,
  type GenreStat,
  type PreferredBlock,
  type RankedRelease,
  type WatchDynamicsSummary,
  type WrappedCollection,
  type WrappedProfile,
  type WrappedRelease,
  type WrappedYearStats,
} from './wrapped-utils';

export type WrappedLoadState = 'loading' | 'error' | 'ready' | 'empty' | 'private';

export interface WrappedData {
  year: number;
  profile: WrappedProfile;
  login: string;
  avatarUrl: string;
  isStatsHidden: boolean;
  topRelease: WrappedRelease | null;
  topReleaseViews: number;
  topThree: RankedRelease[];
  leastWatched: RankedRelease | null;
  collections: WrappedCollection[];
  favorites: WrappedRelease[];
  topRated: WrappedRelease[];
  yearStats: WrappedYearStats;
  historyThisYear: WrappedRelease[];
  posterUrls: string[];
  /** watched_time из профиля — в минутах */
  watchedTimeMinutes: number;
  yearWatchMinutes: number;
  watchedEpisodes: number;
  preferredBlocks: PreferredBlock[];
  recommendUnwatched: WrappedRelease[];
  recommendSimilar: WrappedRelease[];
  watchedReleaseIds: number[];
  yearHighlightReleases: WrappedRelease[];
  watchDynamics: WatchDynamicsSummary;
  topGenresYear: GenreStat[];
  /** Лет на платформе (по register_date) */
  accountAgeYears: number;
  friendCount: number;
  subscriptionCount: number;
  ratingScore: number;
  /** Лучшее аниме года по версии сообщества + пересечение со зрителем */
  communityTop: CommunityTopSummary;
  /** Топ комментариев пользователя за год (по лайкам) */
  topComments: WrappedComment[];
}

interface PageableResponse {
  content?: unknown[];
  total_count?: number;
  last?: boolean;
}

const BOOKMARK_WATCHING = 1;
const BOOKMARK_PLANS = 2;
const BOOKMARK_COMPLETED = 3;
const BOOKMARK_HOLD = 4;
const BOOKMARK_DROPPED = 5;
const SORT_NEW_TO_OLD = 1;
const SORT_POPULARITY = 3;
const MAX_PAGES = 40;

function emptyPage(): PageableResponse {
  return { content: [], total_count: 0, last: true };
}

async function fetchPage(fn: (page: number) => Promise<PageableResponse>, page: number): Promise<PageableResponse> {
  try {
    const res = await fn(page);
    return {
      content: Array.isArray(res?.content) ? res.content : [],
      total_count: typeof res?.total_count === 'number' ? res.total_count : 0,
      last: res?.last ?? false,
    };
  } catch {
    return emptyPage();
  }
}

async function fetchAllPages<T>(
  fetchFn: (page: number) => Promise<PageableResponse>,
  options?: { maxPages?: number },
): Promise<T[]> {
  const first = await fetchPage(fetchFn, 0);
  let items = [...(first.content ?? [])] as T[];
  const total = first.total_count ?? items.length;
  const pageSize = items.length || 25;
  const pages = Math.min(Math.ceil(total / pageSize) || 1, options?.maxPages ?? MAX_PAGES);

  for (let page = 1; page < pages; page++) {
    const res = await fetchPage(fetchFn, page);
    const content = (res.content ?? []) as T[];
    if (!content.length) break;
    items = items.concat(content);
    if (res.last) break;
  }

  return items;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function extractProfile(data: Record<string, unknown>): WrappedProfile | null {
  const p = asRecord(data.profile) ?? data;
  return p.id != null ? p : null;
}

function avatarFromProfile(profile: WrappedProfile): string {
  const raw = profile.avatar;
  if (typeof raw === 'string' && raw) return resolveCdnAssetUrl(raw);
  return '';
}

function collectPosterUrls(...sources: (WrappedRelease | WrappedCollection | null | undefined)[]): string[] {
  const urls = new Set<string>();
  for (const src of sources) {
    if (!src) continue;
    const url = releasePosterUrl(src as WrappedRelease);
    if (url) urls.add(url);
  }
  return [...urls].slice(0, 8);
}

function uniqueReleases(items: WrappedRelease[], limit: number): WrappedRelease[] {
  const seen = new Set<number>();
  const out: WrappedRelease[] = [];
  for (const item of items) {
    const id = releaseId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

async function loadRecommendations(
  api: NonNullable<typeof window.anixApi>,
  topReleases: WrappedRelease[],
  watchedIds: Set<number>,
  topGenres: GenreStat[],
): Promise<{ unwatched: WrappedRelease[]; similar: WrappedRelease[] }> {
  const usedFranchises = new Set<string>();
  for (const r of topReleases) {
    const fk = franchiseKey(r);
    if (fk) usedFranchises.add(fk);
  }

  let unwatched: WrappedRelease[] = [];
  let similar: WrappedRelease[] = [];

  // Персональные рекомендации (как на «Обзоре») — не page 0 с «первыми» тайтлами каталога
  const recPool: WrappedRelease[] = [];
  for (const [page, prev] of [[-1, -1], [0, -1], [1, 0]] as const) {
    try {
      const disc = await api.discover.recommendations(page, prev);
      const raw = (Array.isArray(disc?.content) ? disc.content : []) as WrappedRelease[];
      recPool.push(...raw);
    } catch {
      /* ignore */
    }
  }

  try {
    const watching = await api.discover.watching(0);
    recPool.push(...((watching?.content ?? []) as WrappedRelease[]));
  } catch {
    /* ignore */
  }

  const rankedRecs = [...recPool]
    .sort((a, b) => scoreByGenres(b, topGenres) - scoreByGenres(a, topGenres));

  unwatched = pickRecommendations(rankedRecs, watchedIds, 6, usedFranchises);

  // Похожее — из related нескольких топ-тайтлов. Каждую «связку» (related/{id})
  // держим отдельно, чтобы не показать 4 части одного тайтла подряд.
  const similarSources = topReleases.slice(0, 3);
  const similarGroups = await Promise.all(
    similarSources.map(async (release): Promise<WrappedRelease[]> => {
      const topId = releaseId(release);
      if (!topId) return [];
      try {
        const info = await api.release.info(topId, true);
        const rel = asRecord(asRecord(info)?.release ?? info)?.related;
        const relatedId = typeof rel === 'number' ? rel : asRecord(rel)?.id;
        if (typeof relatedId !== 'number') return [];
        const items: WrappedRelease[] = [];
        for (let page = 0; page < 2; page++) {
          const relRes = await api.release.related(relatedId, page);
          items.push(...((relRes?.content ?? []) as WrappedRelease[]));
        }
        return items;
      } catch {
        return [];
      }
    }),
  );

  const seenIds = new Set<number>(watchedIds);
  const seenFranchises = new Set<string>(usedFranchises);
  const pushSimilar = (rel: WrappedRelease): boolean => {
    const id = releaseId(rel);
    if (!id || seenIds.has(id)) return false;
    const fk = franchiseKey(rel);
    if (fk && seenFranchises.has(fk)) return false;
    seenIds.add(id);
    if (fk) seenFranchises.add(fk);
    similar.push(rel);
    return true;
  };

  // 1-й проход: по одному представителю из связки каждого топ-тайтла → гарантированно разные тайтлы.
  for (const group of similarGroups) {
    for (const rel of group) {
      if (pushSimilar(rel)) break;
    }
  }
  // 2-й проход: добираем до 6 другими франшизами из тех же связок.
  for (const group of similarGroups) {
    for (const rel of group) {
      if (similar.length >= 6) break;
      pushSimilar(rel);
    }
    if (similar.length >= 6) break;
  }

  // Если API вернул мало — добираем из рекомендаций с другим offset
  if (unwatched.length < 4 && rankedRecs.length) {
    const extra = pickRecommendations(rankedRecs, watchedIds, 6, new Set([...usedFranchises]));
    unwatched = uniqueReleases([...unwatched, ...extra], 6);
  }

  return { unwatched, similar };
}

/** Лучшее аниме года по версии сообщества — собираем популярные релизы года и ранжируем по рейтингу. */
async function loadCommunityBest(
  api: NonNullable<typeof window.anixApi>,
  year: number,
  watchedIds: Set<number>,
  userVotesById: Map<number, number>,
): Promise<CommunityTopSummary> {
  const pool: WrappedRelease[] = [];
  const filterArgs = { sort: SORT_POPULARITY, start_year: year, end_year: year };
  for (let page = 0; page < 3; page++) {
    try {
      const res = await api.release.filter(page, filterArgs, true);
      const content = (Array.isArray(res?.content) ? res.content : []) as WrappedRelease[];
      if (!content.length) break;
      pool.push(...content);
    } catch {
      break;
    }
  }
  return rankCommunityBest(pool, watchedIds, userVotesById, 5);
}

export async function loadWrappedData(year = WRAPPED_YEAR): Promise<{
  state: WrappedLoadState;
  error?: string;
  data?: WrappedData;
}> {
  const api = window.anixApi;
  if (!api) {
    return { state: 'error', error: 'API недоступно (только в Electron).' };
  }

  try {
    const rawProfile = await api.profile.self();
    if (asRecord(rawProfile)?.session_mismatch) {
      return { state: 'error', error: 'Войдите в аккаунт, чтобы открыть итоги года.' };
    }

    const profile = extractProfile(asRecord(rawProfile) ?? {});
    if (!profile?.id) {
      return { state: 'error', error: 'Не удалось загрузить профиль.' };
    }

    const profileId = Number(profile.id);
    const isStatsHidden = Boolean(profile.is_stats_hidden);
    const jacksonRoot = asRecord(rawProfile) ?? profile;

    let historyItems: WrappedRelease[] = [];
    try {
      historyItems = await fetchAllPages<WrappedRelease>(
        (page) => api.history.all(page) as Promise<PageableResponse>,
      );
    } catch {
      const fallback = profile.history;
      historyItems = Array.isArray(fallback) ? (fallback as WrappedRelease[]) : [];
    }

    let releaseVotes: WrappedRelease[] = [];
    const profileVotes = profile.votes;
    if (Array.isArray(profileVotes) && profileVotes.length) {
      releaseVotes = profileVotes as WrappedRelease[];
    }
    if (!releaseVotes.length) {
      try {
        releaseVotes = await fetchAllPages<WrappedRelease>(
          (page) => api.profile.getVotedReleases(profileId, page) as Promise<PageableResponse>,
        );
      } catch {
        /* ignore */
      }
    }

    const historyThisYear = filterByYear(historyItems, year);
    const ranked = getRankedFromHistory(historyThisYear);
    // Для «топа года» берём только осознанно отслеживаемые тайтлы (в списке/с оценкой),
    // иначе в историю просачиваются случайно открытые серии (например «Цикады»).
    const trackedRanked = getRankedFromHistory(historyThisYear.filter(isTrackedWatched));
    const baseRanked = trackedRanked.length ? trackedRanked : ranked;
    const topThree = baseRanked.slice(0, 3);
    const leastWatched = baseRanked.length > 1 ? baseRanked[baseRanked.length - 1] : null;

    let topRelease: WrappedRelease | null = topThree[0]?.release ?? null;
    const topReleaseViews = topThree[0]?.count ?? 0;

    if (topRelease?.id && !topRelease.title_ru) {
      try {
        const info = await api.release.info(Number(topRelease.id));
        const full = asRecord(info)?.release ?? asRecord(info);
        if (full) topRelease = { ...topRelease, ...full };
      } catch {
        /* use partial */
      }
    }

    const watchedReleaseIds = historyItems
      .map((item) => releaseId(item))
      .filter((id): id is number => id != null);
    const watchedIdsSet = new Set(watchedReleaseIds);

    let collections: WrappedCollection[] = [];
    try {
      const colRes = await api.collection.profileCollections(profileId, 0);
      const raw = Array.isArray(colRes?.content) ? colRes.content : [];
      collections = resolveJacksonPreviewList(raw, jacksonRoot) as WrappedCollection[];
      if (collections.length < (colRes?.total_count ?? 0)) {
        const extra = await fetchAllPages<WrappedCollection>(
          (page) => api.collection.profileCollections(profileId, page) as Promise<PageableResponse>,
          { maxPages: 8 },
        );
        if (extra.length > collections.length) collections = extra;
      }
    } catch {
      const preview = profile.collections_preview;
      if (Array.isArray(preview)) {
        collections = resolveJacksonPreviewList(preview, jacksonRoot) as WrappedCollection[];
      }
    }

    let favorites: WrappedRelease[] = [];
    try {
      favorites = await fetchAllPages<WrappedRelease>(
        (page) => api.favorites.all(page, SORT_NEW_TO_OLD, 0, 0) as Promise<PageableResponse>,
        { maxPages: 12 },
      );
    } catch {
      /* ignore */
    }

    let topRated: WrappedRelease[] = [];
    try {
      const fiveStar = releaseVotes.filter((v) => Number(v.my_vote) === 5);
      const yearVotes = filterByYear(fiveStar, year).slice(0, 10);
      topRated = yearVotes.filter((r) => r.title_ru);
      if (!topRated.length && yearVotes.length) {
        const loaded = await Promise.allSettled(
          yearVotes.slice(0, 6).map(async (vote) => {
            const id = Number(vote.id);
            if (!id) return vote;
            const info = await api.release.info(id);
            return (asRecord(info)?.release ?? info) as WrappedRelease;
          }),
        );
        topRated = loaded
          .filter((r): r is PromiseFulfilledResult<WrappedRelease> => r.status === 'fulfilled')
          .map((r) => r.value);
      }
    } catch {
      /* ignore */
    }

    const watchDynamics = summarizeWatchDynamics(profile.watch_dynamics, year);
    const topGenresYear = genresFromHistory(historyThisYear, 8);
    const yearWatchMinutes = estimateYearWatchMinutes(historyThisYear);

    const yearStats = defaultYearStats();
    yearStats.watchedThisYear = historyThisYear.length;
    yearStats.episodesThisYear = watchDynamics.episodesWatched || ranked.reduce((s, r) => s + r.count, 0);
    yearStats.activeWatchDays = watchDynamics.activeDays;

    if (!isStatsHidden) {
      try {
        const [watchingList, planList, completedList, holdList, droppedList] = await Promise.all([
          api.profile.getBookmarks(profileId, BOOKMARK_WATCHING, 0, SORT_NEW_TO_OLD, 0, 0),
          api.profile.getBookmarks(profileId, BOOKMARK_PLANS, 0, SORT_NEW_TO_OLD, 0, 0),
          api.profile.getBookmarks(profileId, BOOKMARK_COMPLETED, 0, SORT_NEW_TO_OLD, 0, 0),
          api.profile.getBookmarks(profileId, BOOKMARK_HOLD, 0, SORT_NEW_TO_OLD, 0, 0),
          api.profile.getBookmarks(profileId, BOOKMARK_DROPPED, 0, SORT_NEW_TO_OLD, 0, 0),
        ]);

        yearStats.watchingThisYear = Number(watchingList?.total_count ?? watchingList?.content?.length ?? 0);
        yearStats.planThisYear = Number(planList?.total_count ?? planList?.content?.length ?? 0);
        yearStats.completedThisYear = Number(completedList?.total_count ?? completedList?.content?.length ?? 0);
        yearStats.holdOnThisYear = Number(holdList?.total_count ?? holdList?.content?.length ?? 0);
        yearStats.droppedThisYear = Number(droppedList?.total_count ?? droppedList?.content?.length ?? 0);
      } catch {
        yearStats.watchingThisYear = Number(profile.watching_count ?? 0);
        yearStats.planThisYear = Number(profile.plan_count ?? 0);
        yearStats.completedThisYear = Number(profile.completed_count ?? 0);
        yearStats.holdOnThisYear = Number(profile.hold_on_count ?? 0);
        yearStats.droppedThisYear = Number(profile.dropped_count ?? 0);
      }

      yearStats.favoritesAddedThisYear = favorites.length;
      yearStats.commentsThisYear = Number(profile.comment_count ?? 0);
    }

    const watchedTimeMinutes = Number(profile.watched_time ?? 0);
    const watchedEpisodes = Number(profile.watched_episode_count ?? 0);
    const login = String(profile.login ?? profile.nickname ?? 'Пользователь');
    const preferredBlocks = preferredBlocksFromProfile(profile);

    const { unwatched: recommendUnwatched, similar: recommendSimilar } = await loadRecommendations(
      api,
      topThree.map((t) => t.release),
      watchedIdsSet,
      topGenresYear,
    );

    const userVotesById = new Map<number, number>();
    for (const v of releaseVotes) {
      const id = releaseId(v);
      const vote = Number(v.my_vote ?? 0);
      if (id && vote > 0) userVotesById.set(id, vote);
    }

    const communityTop = await loadCommunityBest(api, year, watchedIdsSet, userVotesById);

    const rawComments = Array.isArray(profile.comments_preview)
      ? (profile.comments_preview as WrappedRelease[]).map((c) => ({
          ...c,
          release: c.release != null
            ? (resolveJacksonEntity(c.release, jacksonRoot) ?? c.release)
            : c.release,
        }))
      : [];
    const topComments = isStatsHidden ? [] : buildTopComments(rawComments as WrappedRelease[], year, 3);

    const yearHighlightReleases = uniqueReleases(
      [
        ...topThree.map((t) => t.release),
        ...topRated.slice(0, 3),
        ...historyThisYear.slice(0, 4),
      ],
      6,
    );

    const posterUrls = collectPosterUrls(
      topRelease,
      ...topThree.map((t) => t.release),
      ...topRated.slice(0, 3),
      ...yearHighlightReleases,
    );

    const data: WrappedData = {
      year,
      profile,
      login,
      avatarUrl: avatarFromProfile(profile),
      isStatsHidden,
      topRelease,
      topReleaseViews,
      topThree,
      leastWatched,
      collections: collections.slice(0, 8),
      favorites,
      topRated: topRated.slice(0, 3),
      yearStats,
      historyThisYear,
      posterUrls,
      watchedTimeMinutes,
      yearWatchMinutes,
      watchedEpisodes,
      preferredBlocks,
      recommendUnwatched,
      recommendSimilar,
      watchedReleaseIds,
      yearHighlightReleases,
      watchDynamics,
      topGenresYear,
      accountAgeYears: accountAgeYears(Number(profile.register_date ?? 0)),
      friendCount: Number(profile.friend_count ?? 0),
      subscriptionCount: Number(profile.subscription_count ?? 0),
      ratingScore: Number(profile.rating_score ?? 0),
      communityTop,
      topComments,
    };

    if (!isStatsHidden && historyThisYear.length === 0 && watchedTimeMinutes === 0 && watchDynamics.episodesWatched === 0) {
      return { state: 'empty', data };
    }

    if (isStatsHidden && !topRelease && topThree.length === 0) {
      return { state: 'private', data };
    }

    return { state: 'ready', data };
  } catch (err) {
    return {
      state: 'error',
      error: err instanceof Error ? err.message : 'Ошибка загрузки итогов',
    };
  }
}

/** Лёгкий prefetch постеров для баннера на главной */
export async function fetchWrappedBannerPosters(limit = 4): Promise<string[]> {
  const api = window.anixApi;
  if (!api) return [];
  try {
    const res = await api.history.all(0);
    const items = (Array.isArray(res?.content) ? res.content : []) as WrappedRelease[];
    const urls: string[] = [];
    for (const item of items) {
      const url = releasePosterUrl((asRecord(item.release) ?? item) as WrappedRelease);
      if (url && !urls.includes(url)) urls.push(url);
      if (urls.length >= limit) break;
    }
    return urls;
  } catch {
    return [];
  }
}

export { calculateHoursFromMinutes };
