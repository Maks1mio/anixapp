<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut, cubicIn } from 'svelte/easing';
  import { navigate } from '../../stores/navigation';
  import { requireAuth } from '../../stores/auth';
  import { openWatchModal } from '../../stores/modals';
  import { buildPosterUrl, buildScreenshotUrl } from '../../utils/posterUrl';
  import { setDiscordContext, refreshDiscordPresence } from '../../services/discord-presence';
  import type { SelectOption } from '../../components/select';
  import { LIST_STATUSES, type ListStatusId } from './_types';
  import type { ReleaseMetaInfoRow } from './_metaInfo';
  import {
    buildCreditsSegments,
    buildGenreSegments,
    buildSourceSegments,
    plainMetaSegments,
  } from './_metaInfo';
  import {
    getAgeRateText, getSeasonName, stripHtmlToText, sanitizeRichHtml,
    numToStatusId, ratingHue, mapCardData, formatEpisodeAdded,
  } from './_utils';
  import { isReleaseAnnounce } from '../../utils/release-card';
  import { ReleaseHead, ReleaseVideos, ReleaseRating, ReleaseRelated, ReleaseRecommendations, ReleaseScreenshots, ReleaseComments } from './components';
  import ReleaseSuggestMenu from './components/ReleaseSuggestMenu.svelte';
  import { notifyFavoritesChanged } from '../../utils/favorites-events';
  import { applyReleaseListStatus } from '../../utils/release-list-status';
  import { enrichBlockedRelease } from '../../services/release-geo-bypass';
  import { extractHistoryEpisodeInfo } from '../../utils/historyFormat';
  import { getApiBase, getAnixbackUploadsOrigin } from '../../services/anixback-endpoint';
  import { iconArrowUpDown, iconDownload, iconEye, iconEyeOff, iconImage, iconVolume2, iconVolumeX } from '../../components/icons';
  import { openProfilePanel } from '../../stores/profile-panel';

  interface Props { id: number; }
  let { id }: Props = $props();

  // ── State ──────────────────────────────────────────────────────────────────
  let loadState   = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg    = $state('');
  let release     = $state<Record<string, unknown> | null>(null);
  let isFavorite  = $state(false);
  let favoritesCount = $state(0);
  let currentStatus  = $state<ListStatusId | null>(null);
  let descCollapsed  = $state(true);
  let historyResume  = $state<{ episode: string; dubber: string } | null>(null);
  let kitsuVideoBgUrl = $state('');
  let kitsuAudioBgUrl = $state('');
  let kitsuCoverUrl = $state('');
  let kitsuVideoFailed = $state(false);
  let kitsuVideoReady = $state(false);
  let kitsuVideoEl: HTMLVideoElement | null = $state(null);
  let kitsuAudioEl: HTMLAudioElement | null = $state(null);
  let kitsuEnqueueAttempted = false;
  let kitsuRefreshInProgress = $state(false);
  let prefersReducedMotion = $state(false);
  let showThankYouNotice = $state(false);
  let showTransformNotice = $state(false);
  let showVideoSoonNotice = $state(false);
  let profileLogin = $state('');
  let kitsuInitialLoadDone = false;
  let kitsuHadVideoInitially = false;
  let kitsuHadCoverInitially = false;
  let kitsuExpectsVideo = $state(false);
  let thankYouShown = false;
  let transformNoticeShownOnce = false;
  let videoSoonNoticeShownOnce = false;
  let thankYouTimer: ReturnType<typeof setTimeout> | null = null;
  let unlockBgAudioHandler: (() => void) | null = null;

  const noticeFlyIn = { y: -12, duration: 380, easing: cubicOut, opacity: 0 };
  const noticeFlyOut = { y: -10, duration: 320, easing: cubicIn, opacity: 0 };

  const BG_MEDIA_PREF_KEY = 'anix.releaseBg.media';
  const BG_DEFAULT_VOLUME = 0.1;

  type BgMediaPrefs = {
    muted: boolean;
    volume: number;
    hideVideo: boolean;
  };

  function clampBgVolume(raw: number): number {
    if (!Number.isFinite(raw)) return BG_DEFAULT_VOLUME;
    return Math.min(1, Math.max(0.01, raw));
  }

  function readBgMediaPrefs(): BgMediaPrefs {
    try {
      const raw = localStorage.getItem(BG_MEDIA_PREF_KEY);
      if (!raw) return { muted: true, volume: BG_DEFAULT_VOLUME, hideVideo: false };
      const parsed = JSON.parse(raw) as Partial<BgMediaPrefs>;
      return {
        muted: parsed.muted !== false,
        volume: clampBgVolume(Number(parsed.volume ?? BG_DEFAULT_VOLUME)),
        hideVideo: parsed.hideVideo === true,
      };
    } catch {
      return { muted: true, volume: BG_DEFAULT_VOLUME, hideVideo: false };
    }
  }

  function persistBgMediaPrefs(): void {
    try {
      localStorage.setItem(BG_MEDIA_PREF_KEY, JSON.stringify({
        muted: bgMuted,
        volume: bgVolume,
        hideVideo: bgHideVideo,
      }));
    } catch {
      /* ignore quota / private mode */
    }
  }

  const initialBgPrefs = readBgMediaPrefs();
  let bgMuted = $state(initialBgPrefs.muted);
  let bgVolume = $state(initialBgPrefs.volume);
  let bgHideVideo = $state(initialBgPrefs.hideVideo);
  let kitsuSourceUrl = $state('');
  let kitsuCoverByUserId = $state<number | null>(null);
  let kitsuCoverByLogin = $state('');
  let kitsuVideoByUserId = $state<number | null>(null);
  let kitsuVideoByLogin = $state('');
  let bgAreaHover = $state(false);
  let bgVolumeFading = false;
  let bgVolumeFadeRaf = 0;

  const showKitsuVideo = $derived(
    !!kitsuVideoBgUrl && !kitsuVideoFailed && !prefersReducedMotion && !bgHideVideo
  );
  const showKitsuAudio = $derived(!!kitsuAudioBgUrl && showKitsuVideo);
  const showKitsuBg = $derived(showKitsuVideo || !!kitsuCoverUrl);
  const showKitsuCover = $derived(!!kitsuCoverUrl && !(showKitsuVideo && kitsuVideoReady));
  const bgSourceLabel = $derived.by(() => {
    const url = kitsuSourceUrl.trim();
    if (!url) return 'Источник загрузки';
    if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
    try {
      return new URL(url).hostname.replace(/^www\./, '') || 'Источник загрузки';
    } catch {
      return 'Источник загрузки';
    }
  });
  const bgVolumePercent = $derived(Math.round(bgVolume * 100));
  let kitsuPollTimer: ReturnType<typeof setTimeout> | null = null;
  let kitsuPollAttempts = 0;
  const KITSU_POLL_MAX_ATTEMPTS = 30;
  /** Cover may appear before server-side auto-video finishes — poll longer for video_bg_url. */
  const KITSU_VIDEO_POLL_MAX_ATTEMPTS = 100;
  const VIDEO_ENSURE_RETRY_EVERY_POLLS = 6;

  type KitsuTitlePayload = {
    video_bg_url?: string | null;
    video_bg_updated_at?: string | null;
    video_bg_source_url?: string | null;
    audio_bg_url?: string | null;
    audio_bg_updated_at?: string | null;
    cover_url?: string | null;
    poster_url?: string | null;
    cover_updated_at?: string | null;
    poster_updated_at?: string | null;
    trailer_url?: string | null;
    cover_by_user_id?: number | null;
    cover_by_login?: string | null;
    video_by_user_id?: number | null;
    video_by_login?: string | null;
  };

  const thankYouUserName = $derived(profileLogin.trim() || 'друг');

  function syncProfileLogin(): void {
    profileLogin = String(
      (window as { __anixProfile?: { login?: string } }).__anixProfile?.login ?? '',
    ).trim();
  }

  function showTransformNoticeOnce(): void {
    if (transformNoticeShownOnce || kitsuHadVideoInitially) return;
    transformNoticeShownOnce = true;
    showTransformNotice = true;
  }

  function hideTransformNotice(): void {
    showTransformNotice = false;
  }

  function showVideoSoonNoticeOnce(): void {
    if (videoSoonNoticeShownOnce || kitsuHadVideoInitially) return;
    videoSoonNoticeShownOnce = true;
    showVideoSoonNotice = true;
  }

  function hideVideoSoonNotice(): void {
    showVideoSoonNotice = false;
  }

  function showThankYouNoticeFor15s(): void {
    if (thankYouShown) return;
    thankYouShown = true;
    hideTransformNotice();
    hideVideoSoonNotice();
    showThankYouNotice = true;
    if (thankYouTimer) clearTimeout(thankYouTimer);
    thankYouTimer = setTimeout(() => {
      showThankYouNotice = false;
      thankYouTimer = null;
    }, 15_000);
  }

  function clearThankYouNotice(): void {
    if (thankYouTimer) {
      clearTimeout(thankYouTimer);
      thankYouTimer = null;
    }
    showThankYouNotice = false;
  }

  function resetKitsuUpgradeState(): void {
    kitsuInitialLoadDone = false;
    kitsuHadVideoInitially = false;
    kitsuHadCoverInitially = false;
    kitsuExpectsVideo = false;
    thankYouShown = false;
    transformNoticeShownOnce = false;
    videoSoonNoticeShownOnce = false;
    showTransformNotice = false;
    showVideoSoonNotice = false;
    clearThankYouNotice();
  }

  function readResumeInfo(raw: Record<string, unknown> | null | undefined) {
    if (!raw) return { episode: '', dubber: '' };

    const lastEpisode = raw.last_view_episode as Record<string, unknown> | undefined;
    const nested = extractHistoryEpisodeInfo(lastEpisode);
    const rawEpisode = String(raw.last_view_episode_name ?? nested.episodeLabel ?? '').trim();
    const episode = /^\d+(?:[.,]\d+)?$/.test(rawEpisode)
      ? `${rawEpisode} серия`
      : rawEpisode;

    const source = lastEpisode?.source as Record<string, unknown> | undefined;
    const sourceDubber = source?.dubber as Record<string, unknown> | undefined;
    const sourceType = source?.type as Record<string, unknown> | undefined;
    const dubber = String(
      raw.last_view_episode_type_name
      ?? sourceDubber?.name
      ?? sourceType?.name
      ?? nested.dubberLabel
      ?? '',
    ).trim();

    return { episode, dubber };
  }

  async function loadHistoryResume(releaseId: number) {
    if (!window.anixApi?.history?.all) return null;

    // Обычно нужный релиз находится на первой странице. Несколько страниц
    // нужны для тайтлов, которые пользователь смотрел чуть раньше.
    for (let page = 0; page < 6; page += 1) {
      const response = await window.anixApi.history.all(page) as Record<string, unknown>;
      const content = (response?.content ?? response?.releases ?? []) as Record<string, unknown>[];
      const match = content.find((item) => Number(item.id ?? (item.release as Record<string, unknown> | undefined)?.id) === releaseId);
      if (match) return readResumeInfo(match);
      if (content.length === 0 || response?.last === true) break;
    }
    return null;
  }

  // ── Derived: poster ────────────────────────────────────────────────────────
  const posterUrl = $derived.by(() => {
    if (!release) return '';
    const r = release;
    const raw =
      typeof r.poster === 'string' ? r.poster as string :
      (r.poster as any)?.original?.url ?? (r.poster as any)?.medium?.url ?? (r.poster as any)?.small?.url;
    return buildPosterUrl(raw ?? (typeof r.image === 'string' ? r.image as string : '')) || '';
  });

  // ── Derived: title / description ──────────────────────────────────────────
  const titleRu       = $derived((release?.title_ru       ?? '') as string);
  const titleOriginal = $derived((release?.title_original ?? '') as string);
  const titleAlt        = $derived((release?.title_alt ?? '') as string);
  const title         = $derived(titleRu || titleOriginal || 'Без названия');
  const desc          = $derived((release?.description ?? '') as string);
  const descClean     = $derived(desc ? stripHtmlToText(desc) : '');
  const descHtml      = $derived(desc ? sanitizeRichHtml(desc) : '');
  const descNeedsTruncate = $derived(descClean.length > 300);
  const noteHtml      = $derived.by(() => {
    if (release?.is_view_blocked) return '';
    return release?.note ? sanitizeRichHtml(release.note as string) : '';
  });

  // ── Derived: rating ───────────────────────────────────────────────────────
  const gradeRaw   = $derived(release?.grade ?? release?.rating);
  const grade      = $derived(typeof gradeRaw === 'number' && !Number.isNaN(gradeRaw) ? gradeRaw : null);
  const voteCount  = $derived(typeof release?.vote_count === 'number' ? release.vote_count as number : 0);
  const hasRating  = $derived(voteCount > 0 || (grade != null && grade > 0));
  const ratingHueVal   = $derived(grade != null && grade > 0 ? ratingHue(grade) : 0);
  const ratingBg       = $derived(grade != null && grade > 0 ? `hsl(${ratingHueVal}, 95%, 52%)` : 'rgba(255,255,255,0.12)');
  const ratingTextColor = $derived(grade != null && grade > 0 && ratingHueVal >= 28 ? '#0b0b0b' : '#f5f5f5');

  // ── Derived: vote counts ──────────────────────────────────────────────────
  const vote1 = $derived((release?.vote_1_count ?? 0) as number);
  const vote2 = $derived((release?.vote_2_count ?? 0) as number);
  const vote3 = $derived((release?.vote_3_count ?? 0) as number);
  const vote4 = $derived((release?.vote_4_count ?? 0) as number);
  const vote5 = $derived((release?.vote_5_count ?? 0) as number);
  const yourVote = $derived(Math.max(0, Number(release?.your_vote ?? 0) || 0));
  const watchingCount  = $derived((release?.watching_count  ?? 0) as number);
  const planCount      = $derived((release?.plan_count      ?? 0) as number);
  const completedCount = $derived((release?.completed_count ?? 0) as number);
  const holdOnCount    = $derived((release?.hold_on_count   ?? 0) as number);
  const droppedCount   = $derived((release?.dropped_count   ?? 0) as number);

  // ── Derived: meta ─────────────────────────────────────────────────────────
  const year         = $derived(release?.year != null ? String(release.year) : '');
  const country      = $derived((release?.country ?? '') as string);
  const episodesReleased = $derived(release?.episodes_released as number | null | undefined);
  const episodesTotal    = $derived(release?.episodes_total    as number | null | undefined);
  const statusName   = $derived((release?.status   as { name?: string } | undefined)?.name ?? '');
  const statusId     = $derived((release?.status as { id?: number } | undefined)?.id);
  const isAnnounce   = $derived(isReleaseAnnounce(statusName, statusId));
  const canVote      = $derived(!isAnnounce && release?.rating_available !== false);
  const studio       = $derived((release?.studio   ?? '') as string);
  const source       = $derived((release?.source   ?? '') as string);
  const genres       = $derived((release?.genres   ?? '') as string);
  const categoryName = $derived((release?.category as { name?: string } | undefined)?.name ?? '');
  const author       = $derived((release?.author   ?? '') as string);
  const director     = $derived((release?.director ?? '') as string);
  const isAdult      = $derived(!!(release?.is_adult));
  const ageRatingRaw = $derived(release?.age_rating as number | string | undefined);
  const ageRateText  = $derived(isAdult ? '18+' : getAgeRateText(ageRatingRaw));
  const ageIsRestricted = $derived(ageRateText === '16+' || ageRateText === '18+');
  const duration     = $derived(release?.duration   as number | null | undefined);
  const season       = $derived(release?.season     as number | null | undefined);
  const seasonName   = $derived(getSeasonName(season));
  const releaseDate  = $derived((release?.release_date ?? '') as string);
  const airedOnDate  = $derived(release?.aired_on_date as number | null | undefined);
  const isViewBlocked = $derived(!!(release?.is_view_blocked));
  const hasEpisodesReleased = $derived(typeof episodesReleased === 'number' && episodesReleased > 0);
  const releaseId    = $derived(release?.id as number | undefined);

  const resumeInfo = $derived.by(() => {
    const fromRelease = readResumeInfo(release);
    return {
      episode: historyResume?.episode || fromRelease.episode,
      dubber: historyResume?.dubber || fromRelease.dubber,
    };
  });

  const airedText = $derived.by(() => {
    if (airedOnDate && airedOnDate > 0) {
      const d = new Date(airedOnDate * 1000);
      const months = ['янв.','февр.','мар.','апр.','мая','июн.','июл.','авг.','сен.','окт.','нояб.','дек.'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
    }
    return releaseDate;
  });

  const playBtnText     = $derived.by(() => {
    if (isViewBlocked || hasEpisodesReleased) {
      if (resumeInfo.episode && resumeInfo.dubber) {
        return `${resumeInfo.episode} · ${resumeInfo.dubber}`;
      }
      if (resumeInfo.episode) return `Продолжить · ${resumeInfo.episode}`;
      if (resumeInfo.dubber) return `Продолжить · ${resumeInfo.dubber}`;
      return 'Воспроизвести';
    }
    return airedText ? `${airedText}` : 'Скоро';
  });
  const playBtnDisabled = $derived(!isViewBlocked && !hasEpisodesReleased);

  const episodeAddedText = $derived.by(() => {
    if (playBtnDisabled) return null;
    return formatEpisodeAdded(release?.episode_last_update);
  });

  const metaInfoRows = $derived.by((): ReleaseMetaInfoRow[] => {
    const rows: ReleaseMetaInfoRow[] = [];
    const parts: string[] = [];
    if (country) parts.push(country);
    if (seasonName && year) parts.push(`${seasonName} ${year} г.`);
    else if (year) parts.push(`${year} г.`);
    if (parts.length) {
      rows.push({
        kind: 'country',
        segments: plainMetaSegments(parts.join(', ')),
        country: country || undefined,
      });
    }

    let epText = '';
    if (episodesReleased != null && episodesTotal != null && episodesTotal > 0) epText = `${episodesReleased} из ${episodesTotal} эп.`;
    else if (episodesReleased != null) epText = `${episodesReleased} эп.`;
    else if (episodesTotal    != null) epText = `${episodesTotal} эп.`;
    if (duration && duration > 0) epText += epText ? ` по ~${duration} мин.` : `~${duration} мин.`;
    if (epText) rows.push({ kind: 'episodes', segments: plainMetaSegments(epText) });

    const catParts: string[] = [];
    if (categoryName) catParts.push(categoryName);
    if (statusName)   catParts.push(statusName);
    if (catParts.length) rows.push({ kind: 'category', segments: plainMetaSegments(catParts.join(', ')) });

    const creditSegments = buildCreditsSegments(studio, author, director);
    if (creditSegments.length) rows.push({ kind: 'credits', segments: creditSegments });

    if (source) rows.push({ kind: 'source', segments: buildSourceSegments(source) });
    if (genres) rows.push({ kind: 'genres', segments: buildGenreSegments(genres) });
    return rows;
  });

  // ── Derived: lists / related / screenshots ────────────────────────────────
  const screenshots   = $derived.by(() => {
    if (!release) return [] as string[];
    const si = release.screenshot_images as string[] | undefined;
    if (si) return si.map((u) => buildScreenshotUrl(u));
    return ((release.screenshots as string[] | undefined) ?? [])
      .map((u) => buildScreenshotUrl(u));
  });

  const related          = $derived(release?.related as { id?: number; name_ru?: string; release_count?: number } | null | undefined);
  const relatedReleases  = $derived((release?.related_releases  ?? []) as Record<string, unknown>[]);
  const recommended      = $derived((release?.recommended_releases ?? []) as Record<string, unknown>[]);
  const comments         = $derived((release?.comments ?? []) as Record<string, unknown>[]);
  const commentCount     = $derived(
    typeof release?.comment_count === 'number' ? release.comment_count
      : typeof release?.comments_count === 'number' ? release.comments_count
      : comments.length,
  );
  const relatedCards     = $derived(relatedReleases.map(r => mapCardData(r)));
  const recommendedCards = $derived(recommended.map(r => mapCardData(r)));

  // ── Select options ────────────────────────────────────────────────────────
  const selectOptions = $derived([
    { value: '', label: 'Не в списке' },
    ...LIST_STATUSES.map(s => ({ value: s.id, label: s.label })),
  ] as SelectOption[]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function toggleFavorite() {
    if (!requireAuth()) return;
    if (!window.anixApi || !releaseId) return;
    try {
      if (isFavorite) await window.anixApi.release.removeFavorite(releaseId);
      else            await window.anixApi.release.addFavorite(releaseId);
      isFavorite     = !isFavorite;
      favoritesCount = Math.max(0, favoritesCount + (isFavorite ? 1 : -1));
      notifyFavoritesChanged();
    } catch { /* ignore */ }
  }

  function handleWatch() {
    if (!releaseId) return;
    openWatchModal(releaseId, titleRu || title || titleOriginal || 'Без названия');
  }

  async function setStatus(value: string) {
    if (!requireAuth()) return;
    if (!window.anixApi || !releaseId) return;
    const prev = currentStatus;
    const next = (value || null) as ListStatusId | null;
    if (prev === next) return;
    try {
      await applyReleaseListStatus(releaseId, next, prev);
      currentStatus = next;
    } catch {
      /* keep previous status on failure */
    }
  }

  async function syncListStateFromApi() {
    if (!window.anixApi || !id) return;
    try {
      const data = await window.anixApi.release.info(id, true) as Record<string, unknown>;
      const raw = (data?.release ?? data) as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== 'object') return;
      isFavorite = !!(raw.is_favorite);
      if (typeof raw.favorites_count === 'number') favoritesCount = raw.favorites_count;
      currentStatus = numToStatusId(raw.profile_list_status as number | null | undefined);
    } catch { /* ignore */ }
  }

  async function refreshReleaseData() {
    if (!window.anixApi) return;
    try {
      const data = await window.anixApi.release.info(id, true) as any;
      let raw = data?.release ?? data;
      if (raw && typeof raw === 'object') {
        raw = await enrichBlockedRelease(id, raw as Record<string, unknown>);
        release = { ...release, ...raw } as Record<string, unknown>;
        isFavorite = !!(raw.is_favorite);
        if (typeof raw.favorites_count === 'number') favoritesCount = raw.favorites_count;
        currentStatus = numToStatusId(raw.profile_list_status as number | null | undefined);
      }
    } catch { /* ignore */ }
  }

  async function tryEnqueueKitsuTitle(releaseId: number, titleEn: string): Promise<void> {
    if (kitsuEnqueueAttempted) return;
    if (!titleEn.trim()) return;
    kitsuEnqueueAttempted = true;
    try {
      await fetch(`${getApiBase()}/kitsu/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anixartId: releaseId, titleEn: titleEn.trim() }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // no-op: queueing is best-effort, UI should still render release page
    }
  }

  async function tryEnsureKitsuVideoDownload(releaseId: number): Promise<
    'ready' | 'downloading' | 'started' | 'no_trailer' | 'not_found' | 'error'
  > {
    try {
      const res = await fetch(`${getApiBase()}/kitsu/video/${releaseId}/auto`, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return 'error';
      const body = await res.json() as { status?: string; data?: KitsuTitlePayload };
      const status = body.status ?? 'error';
      if (body.data && (
        status === 'ready'
        || status === 'downloading'
        || status === 'started'
        || status === 'no_trailer'
      )) {
        applyKitsuTitlePayload(body.data);
      }
      if (status === 'ready' || status === 'downloading' || status === 'started' || status === 'no_trailer' || status === 'not_found') {
        return status;
      }
      return 'error';
    } catch {
      return 'error';
    }
  }

  function kitsuMediaUrl(rel: string, stamp?: string | null): string {
    const origin = getAnixbackUploadsOrigin();
    const path = rel.startsWith('/') ? rel : `/${rel}`;
    const q = stamp ? `?t=${encodeURIComponent(stamp)}` : '';
    return `${origin}${path}${q}`;
  }

  function applyKitsuTitlePayload(title: KitsuTitlePayload | undefined): {
    hasVideo: boolean;
    hasAudio: boolean;
    hasCover: boolean;
    expectsVideo: boolean;
  } {
    const rel = title?.video_bg_url?.trim() ?? '';
    const nextVideoUrl = rel ? kitsuMediaUrl(rel, title?.video_bg_updated_at) : '';

    if (nextVideoUrl && nextVideoUrl !== kitsuVideoBgUrl) {
      kitsuVideoBgUrl = nextVideoUrl;
      kitsuVideoFailed = false;
      kitsuVideoReady = false;
    } else if (!nextVideoUrl) {
      kitsuVideoBgUrl = '';
      kitsuVideoReady = false;
    }

    const audioRel = title?.audio_bg_url?.trim() ?? '';
    kitsuAudioBgUrl = audioRel ? kitsuMediaUrl(audioRel, title?.audio_bg_updated_at) : '';

    const coverRel = title?.cover_url?.trim() || title?.poster_url?.trim() || '';
    kitsuCoverUrl = coverRel
      ? (coverRel.startsWith('/uploads/')
        ? kitsuMediaUrl(coverRel, title?.cover_updated_at || title?.poster_updated_at)
        : coverRel)
      : '';

    const trailerUrl = title?.trailer_url?.trim() || title?.video_bg_source_url?.trim() || '';
    kitsuSourceUrl = trailerUrl;
    const coverLogin = String(title?.cover_by_login ?? '').trim();
    const coverUserId = Number(title?.cover_by_user_id ?? 0);
    kitsuCoverByLogin = coverLogin;
    kitsuCoverByUserId = coverLogin && Number.isFinite(coverUserId) && coverUserId > 0 ? coverUserId : null;
    const videoLogin = String(title?.video_by_login ?? '').trim();
    const videoUserId = Number(title?.video_by_user_id ?? 0);
    kitsuVideoByLogin = videoLogin;
    kitsuVideoByUserId = videoLogin && Number.isFinite(videoUserId) && videoUserId > 0 ? videoUserId : null;
    const expectsVideo = !!trailerUrl && /youtube\.com|youtu\.be/i.test(trailerUrl);
    kitsuExpectsVideo = expectsVideo;
    return {
      hasVideo: !!rel,
      hasAudio: !!audioRel,
      hasCover: !!kitsuCoverUrl,
      expectsVideo,
    };
  }

  async function playBgAudio(): Promise<void> {
    const audio = kitsuAudioEl;
    if (!audio || prefersReducedMotion || !showKitsuAudio) return;
    audio.loop = true;
    audio.volume = Math.min(1, Math.max(0, bgVolume));
    if (bgMuted) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      /* autoplay blocked until a user gesture */
    }
  }

  function cancelBgVolumeFade(): void {
    if (bgVolumeFadeRaf) {
      cancelAnimationFrame(bgVolumeFadeRaf);
      bgVolumeFadeRaf = 0;
    }
    bgVolumeFading = false;
  }

  function fadeBgVolumeIn(target = BG_DEFAULT_VOLUME, durationMs = 900): void {
    cancelBgVolumeFade();
    const to = clampBgVolume(target);
    if (prefersReducedMotion) {
      bgMuted = false;
      bgVolume = to;
      persistBgMediaPrefs();
      void playBgAudio();
      return;
    }

    bgMuted = false;
    bgVolume = 0;
    const audio = kitsuAudioEl;
    if (audio) audio.volume = 0;
    void playBgAudio();

    bgVolumeFading = true;
    const start = performance.now();
    const tick = (now: number) => {
      if (!bgVolumeFading || bgMuted || bgHideVideo) {
        bgVolumeFading = false;
        bgVolumeFadeRaf = 0;
        return;
      }
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      const vol = to * eased;
      bgVolume = vol;
      if (kitsuAudioEl) kitsuAudioEl.volume = vol;
      if (t < 1) {
        bgVolumeFadeRaf = requestAnimationFrame(tick);
        return;
      }
      bgVolume = to;
      if (kitsuAudioEl) kitsuAudioEl.volume = to;
      bgVolumeFading = false;
      bgVolumeFadeRaf = 0;
      persistBgMediaPrefs();
    };
    bgVolumeFadeRaf = requestAnimationFrame(tick);
  }

  function toggleBgMuted(): void {
    cancelBgVolumeFade();
    bgMuted = !bgMuted;
    if (!bgMuted && bgVolume < 0.01) bgVolume = BG_DEFAULT_VOLUME;
    persistBgMediaPrefs();
    void playBgAudio();
  }

  let bgVolumeDrag = $state(false);
  let bgVolumeDragStartY = 0;
  let bgVolumeDragStart = BG_DEFAULT_VOLUME;

  function setBgVolumeFromPointer(clientY: number): void {
    cancelBgVolumeFade();
    const deltaPx = bgVolumeDragStartY - clientY;
    const next = clampBgVolume(bgVolumeDragStart + deltaPx / 140);
    bgVolume = next;
    if (bgMuted) bgMuted = false;
    persistBgMediaPrefs();
    void playBgAudio();
  }

  function onBgVolumePointerDown(event: PointerEvent): void {
    if (!kitsuAudioBgUrl || !showKitsuVideo || prefersReducedMotion) return;
    if (event.button !== 0) return;
    event.preventDefault();
    bgVolumeDrag = false;
    bgVolumeDragStartY = event.clientY;
    bgVolumeDragStart = bgMuted ? BG_DEFAULT_VOLUME : bgVolume;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onBgVolumePointerMove(event: PointerEvent): void {
    if (!event.currentTarget || !(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return;
    if (Math.abs(bgVolumeDragStartY - event.clientY) < 4 && !bgVolumeDrag) return;
    bgVolumeDrag = true;
    setBgVolumeFromPointer(event.clientY);
  }

  function onBgVolumePointerUp(event: PointerEvent): void {
    const el = event.currentTarget as HTMLElement;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    if (!bgVolumeDrag) toggleBgMuted();
    bgVolumeDrag = false;
  }

  function onBgVolumeKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault();
      cancelBgVolumeFade();
      bgVolume = clampBgVolume(bgVolume + 0.05);
      bgMuted = false;
      persistBgMediaPrefs();
      void playBgAudio();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault();
      cancelBgVolumeFade();
      bgVolume = clampBgVolume(bgVolume - 0.05);
      persistBgMediaPrefs();
      void playBgAudio();
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggleBgMuted();
    }
  }

  function toggleBgHideVideo(): void {
    bgHideVideo = !bgHideVideo;
    if (bgHideVideo) {
      cancelBgVolumeFade();
      bgAreaHover = false;
      if (!bgMuted) {
        bgMuted = true;
        void playBgAudio();
      }
      persistBgMediaPrefs();
      return;
    }
    persistBgMediaPrefs();
    fadeBgVolumeIn(BG_DEFAULT_VOLUME);
  }

  function onBgAreaEnter(): void {
    bgAreaHover = true;
  }

  function onBgAreaLeave(): void {
    bgAreaHover = false;
  }

  function openBgSource(event: MouseEvent): void {
    const url = kitsuSourceUrl.trim();
    if (!url) return;
    if (window.electron?.openExternal) {
      event.preventDefault();
      window.electron.openExternal(url);
    }
  }

  function openAssetCredit(userId: number | null, login: string): void {
    const id = Number(userId ?? 0);
    if (!Number.isFinite(id) || id <= 0) return;
    openProfilePanel(id, { login });
  }

  function coverDownloadName(ext: string): string {
    const raw = (titleOriginal || title || `title-${id}`).trim();
    const safe = raw
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .slice(0, 120)
      .trim();
    return `${safe || `title-${id}`} - обложка.${ext}`;
  }

  async function downloadShownCover(): Promise<void> {
    const url = kitsuCoverUrl.trim();
    if (!url) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const mime = blob.type || '';
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = coverDownloadName(ext);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      if (window.electron?.openExternal) window.electron.openExternal(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function syncBgAudio(): void {
    const video = kitsuVideoEl;
    const audio = kitsuAudioEl;
    if (!video || !audio || audio.paused) return;
    if (Math.abs(audio.currentTime - video.currentTime) > 0.45) {
      audio.currentTime = video.currentTime;
    }
  }

  function clearKitsuPoll(): void {
    if (kitsuPollTimer) {
      clearTimeout(kitsuPollTimer);
      kitsuPollTimer = null;
    }
  }

  function scheduleKitsuPoll(
    releaseId: number,
    titleEnFallback: string,
    waitingForVideo = false,
  ): void {
    const maxAttempts = waitingForVideo ? KITSU_VIDEO_POLL_MAX_ATTEMPTS : KITSU_POLL_MAX_ATTEMPTS;
    if (kitsuPollAttempts >= maxAttempts) {
      kitsuRefreshInProgress = false;
      return;
    }
    clearKitsuPoll();
    kitsuPollTimer = setTimeout(() => {
      kitsuPollAttempts += 1;
      void loadKitsuBackground(releaseId, titleEnFallback);
    }, 3000);
  }

  async function loadKitsuBackground(releaseId: number, titleEnFallback = ''): Promise<void> {
    try {
      const res = await fetch(`${getApiBase()}/kitsu/${releaseId}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const data = await res.json() as {
        queued?: boolean;
        notFound?: boolean;
        data?: KitsuTitlePayload;
      };
      const title = data.data;
      const { hasVideo, hasAudio, hasCover, expectsVideo } = applyKitsuTitlePayload(title);

      if (!kitsuInitialLoadDone) {
        kitsuInitialLoadDone = true;
        kitsuHadVideoInitially = hasVideo;
        kitsuHadCoverInitially = hasCover;
      }

      if (hasVideo) {
        hideTransformNotice();
        hideVideoSoonNotice();
        if (!hasAudio && expectsVideo) {
          const shouldEnsure = kitsuPollAttempts === 0 || kitsuPollAttempts % VIDEO_ENSURE_RETRY_EVERY_POLLS === 0;
          if (shouldEnsure) void tryEnsureKitsuVideoDownload(releaseId);
          kitsuRefreshInProgress = true;
          scheduleKitsuPoll(releaseId, titleEnFallback, true);
          return;
        }
        clearKitsuPoll();
        kitsuPollAttempts = 0;
        kitsuRefreshInProgress = false;
        return;
      }

      if (hasCover && expectsVideo) {
        hideTransformNotice();
        const shouldEnsure = kitsuPollAttempts === 0 || kitsuPollAttempts % VIDEO_ENSURE_RETRY_EVERY_POLLS === 0;
        let videoPending = kitsuRefreshInProgress;
        if (shouldEnsure) {
          const ensureStatus = await tryEnsureKitsuVideoDownload(releaseId);
          if (ensureStatus === 'no_trailer') {
            hideVideoSoonNotice();
            clearKitsuPoll();
            kitsuRefreshInProgress = false;
            return;
          }
          if (ensureStatus === 'ready') {
            return loadKitsuBackground(releaseId, titleEnFallback);
          }
          videoPending = ensureStatus === 'started' || ensureStatus === 'downloading';
        }
        if (videoPending) {
          showVideoSoonNoticeOnce();
          kitsuRefreshInProgress = true;
          scheduleKitsuPoll(releaseId, titleEnFallback, true);
        } else {
          hideVideoSoonNotice();
          clearKitsuPoll();
          kitsuRefreshInProgress = false;
        }
        return;
      }

      if (hasCover) {
        clearKitsuPoll();
        kitsuPollAttempts = 0;
        kitsuRefreshInProgress = false;
        hideTransformNotice();
        hideVideoSoonNotice();
        return;
      }

      if (!title && data.notFound) {
        void tryEnqueueKitsuTitle(releaseId, titleEnFallback);
      }

      if (!hasCover && (data.notFound || data.queued)) {
        kitsuRefreshInProgress = true;
        showTransformNoticeOnce();
        scheduleKitsuPoll(releaseId, titleEnFallback);
      }
    } catch {
      kitsuVideoBgUrl = '';
      kitsuCoverUrl = '';
      kitsuVideoReady = false;
      if (kitsuRefreshInProgress) scheduleKitsuPoll(releaseId, titleEnFallback);
    }
  }

  function onBookmarksChanged(e: Event) {
    const detail = (e as CustomEvent<{ releaseId?: number }>).detail;
    if (detail?.releaseId != null && detail.releaseId !== id) return;
    void syncListStateFromApi();
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  onMount(async () => {
    resetKitsuUpgradeState();
    syncProfileLogin();
    window.addEventListener('anix:profileUpdated', syncProfileLogin);
    window.addEventListener('anix:bookmarksChanged', onBookmarksChanged);
    unlockBgAudioHandler = () => { void playBgAudio(); };
    window.addEventListener('pointerdown', unlockBgAudioHandler, { once: true });
    if (!window.anixApi) {
      errorMsg  = 'API недоступно (только в Electron).';
      loadState = 'error';
      return;
    }
    try {
      const historyResumePromise = loadHistoryResume(id).catch(() => null);
      const data = await window.anixApi.release.info(id, true) as any;
      let raw  = data?.release ?? data;
      if (!raw || (raw.id == null && !raw.title_ru && !raw.title_original)) {
        errorMsg  = 'Релиз не найден.';
        loadState = 'error';
        return;
      }
      raw = await enrichBlockedRelease(id, raw as Record<string, unknown>);
      release        = raw as Record<string, unknown>;
      isFavorite     = !!(raw.is_favorite);
      favoritesCount = (raw.favorites_count ?? 0) as number;
      currentStatus  = numToStatusId(raw.profile_list_status as number | null | undefined);
      loadState      = 'ready';
      const titleForKitsu = String(raw.title_original ?? raw.title_en ?? raw.title_ru ?? '').trim();
      void loadKitsuBackground(id, titleForKitsu);

      const posterVal = buildPosterUrl(
        typeof raw.poster === 'string' ? raw.poster :
        (raw.poster as any)?.original?.url ?? (raw.poster as any)?.medium?.url ?? (typeof raw.image === 'string' ? raw.image : '')
      );
      setDiscordContext({
        releaseTitle: (raw.title_ru || raw.title_original || '') as string,
        releasePoster: posterVal || undefined,
      });
      refreshDiscordPresence();

      void historyResumePromise.then((resume) => {
        if (resume?.episode || resume?.dubber) historyResume = resume;
      });
    } catch (err) {
      errorMsg  = String(err);
      loadState = 'error';
    }
  });

  onDestroy(() => {
    window.removeEventListener('anix:profileUpdated', syncProfileLogin);
    window.removeEventListener('anix:bookmarksChanged', onBookmarksChanged);
    if (unlockBgAudioHandler) {
      window.removeEventListener('pointerdown', unlockBgAudioHandler);
      unlockBgAudioHandler = null;
    }
    clearKitsuPoll();
    clearThankYouNotice();
    cancelBgVolumeFade();
  });

  $effect(() => {
    id;
    resetKitsuUpgradeState();
  });

  $effect(() => {
    if (thankYouShown) return;

    const videoReadyDuringVisit = kitsuVideoReady && showKitsuVideo && !kitsuHadVideoInitially;
    const coverReadyDuringVisit = !!kitsuCoverUrl
      && !kitsuHadCoverInitially
      && !kitsuExpectsVideo
      && !kitsuHadVideoInitially;

    if (!videoReadyDuringVisit && !coverReadyDuringVisit) return;

    hideTransformNotice();
    hideVideoSoonNotice();
    showThankYouNoticeFor15s();
  });

  $effect(() => {
    kitsuAudioBgUrl;
    kitsuVideoReady;
    void playBgAudio();
  });

  $effect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { prefersReducedMotion = mq.matches; };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });
</script>

<div class="release-view-wrap">
  {#if showTransformNotice}
    <div
      class="release-view-upgrade-notice release-view-upgrade-notice--transform"
      role="status"
      aria-live="polite"
      in:fly={noticeFlyIn}
      out:fly={noticeFlyOut}
    >
      Сейчас эта страница преобразится, подождите немного.
    </div>
  {/if}

  {#if showVideoSoonNotice}
    <div
      class="release-view-upgrade-notice release-view-upgrade-notice--video-soon"
      role="status"
      aria-live="polite"
      in:fly={noticeFlyIn}
      out:fly={noticeFlyOut}
    >
      Скоро будет доступен видеофон.
    </div>
  {/if}

  {#if showThankYouNotice}
    <div
      class="release-view-upgrade-notice release-view-upgrade-notice--thanks"
      role="status"
      aria-live="polite"
      in:fly={noticeFlyIn}
      out:fly={noticeFlyOut}
    >
      Спасибо, {thankYouUserName}, вы сделали эту страницу такой красивой. Теперь все смогут это увидеть.
    </div>
  {/if}

  {#if showKitsuBg}
    <div
      class="release-view-wrap__bg"
      onpointerenter={onBgAreaEnter}
      onpointerleave={onBgAreaLeave}
    >
      <div class="release-view-wrap__bg-media" aria-hidden="true">
        {#if kitsuCoverUrl}
          <img
            class="release-view-wrap__bg-cover"
            class:release-view-wrap__bg-cover--hidden={showKitsuVideo && kitsuVideoReady}
            src={kitsuCoverUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        {/if}

        {#if showKitsuVideo}
          {#key kitsuVideoBgUrl}
          <video
            bind:this={kitsuVideoEl}
            class="release-view-wrap__bg-video"
            class:release-view-wrap__bg-video--ready={kitsuVideoReady}
            src={kitsuVideoBgUrl}
            poster={kitsuCoverUrl || undefined}
            autoplay
            muted
            loop
            playsinline
            preload="auto"
            disablepictureinpicture
            onloadeddata={() => { kitsuVideoReady = true; }}
            oncanplay={() => { kitsuVideoReady = true; }}
            onplaying={() => { kitsuVideoReady = true; void playBgAudio(); }}
            ontimeupdate={syncBgAudio}
            onerror={() => { kitsuVideoFailed = true; }}
          ></video>
          {/key}
        {/if}

        {#if showKitsuAudio}
          {#key kitsuAudioBgUrl}
          <audio
            bind:this={kitsuAudioEl}
            class="release-view-wrap__bg-audio"
            src={kitsuAudioBgUrl}
            loop
            preload="auto"
          ></audio>
          {/key}
        {/if}
      </div>

      <div class="release-view-wrap__bg-bar" role="group" aria-label="Настройки фона страницы">
        <span class="release-view-wrap__bg-chip">
          {#if kitsuSourceUrl}
            <a
              class="release-view-wrap__bg-source"
              href={kitsuSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Открыть источник в браузере"
              onclick={openBgSource}
            >
              <span class="release-view-wrap__bg-bar-icon" aria-hidden="true">{@html iconDownload(14)}</span>
              <span>{bgSourceLabel}</span>
            </a>
          {:else}
            <span class="release-view-wrap__bg-source release-view-wrap__bg-source--static">
              <span class="release-view-wrap__bg-bar-icon" aria-hidden="true">{@html iconDownload(14)}</span>
              <span>Источник</span>
            </span>
          {/if}
          {#if kitsuVideoByLogin && kitsuVideoByUserId}
            <button
              type="button"
              class="release-view-wrap__bg-credit"
              title="Кто предложил видео"
              aria-label="Профиль {kitsuVideoByLogin}"
              onclick={() => openAssetCredit(kitsuVideoByUserId, kitsuVideoByLogin)}
            >
              · {kitsuVideoByLogin}
            </button>
          {/if}
        </span>

        {#if showKitsuAudio}
          <button
            type="button"
            class="release-view-wrap__bg-btn release-view-wrap__bg-vol"
            class:release-view-wrap__bg-btn--active={!bgMuted}
            class:release-view-wrap__bg-vol--drag={bgVolumeDrag}
            style="--bg-vol: {bgMuted ? 0 : bgVolumePercent}%"
            disabled={prefersReducedMotion}
            aria-pressed={!bgMuted}
            role="slider"
            aria-orientation="vertical"
            aria-valuemin="1"
            aria-valuemax="100"
            aria-valuenow={bgMuted ? 0 : bgVolumePercent}
            aria-describedby="release-bg-vol-hint"
            aria-label={bgMuted ? 'Включить звук и тянуть вверх-вниз для громкости' : `Громкость ${bgVolumePercent} процентов. Тяните вверх или вниз`}
            onpointerdown={onBgVolumePointerDown}
            onpointermove={onBgVolumePointerMove}
            onpointerup={onBgVolumePointerUp}
            onpointercancel={onBgVolumePointerUp}
            onkeydown={onBgVolumeKeyDown}
          >
            <span class="release-view-wrap__bg-bar-icon" aria-hidden="true">{@html bgMuted ? iconVolumeX(14) : iconVolume2(14)}</span>
            <span>{bgMuted ? 'Выкл.' : `${bgVolumePercent}%`}</span>
            <span class="release-view-wrap__bg-bar-icon release-view-wrap__bg-vol-grip" aria-hidden="true">{@html iconArrowUpDown(12)}</span>
          </button>
        {/if}

        {#if showKitsuCover}
          <span class="release-view-wrap__bg-chip">
            <button
              type="button"
              class="release-view-wrap__bg-btn"
              aria-label={kitsuCoverByLogin ? `Скачать обложку, предложил ${kitsuCoverByLogin}` : 'Скачать обложку'}
              title="Скачать обложку"
              onclick={() => { void downloadShownCover(); }}
            >
              <span class="release-view-wrap__bg-bar-icon" aria-hidden="true">{@html iconImage(14)}</span>
              <span>Обложка</span>
            </button>
            {#if kitsuCoverByLogin && kitsuCoverByUserId}
              <button
                type="button"
                class="release-view-wrap__bg-credit"
                title="Кто предложил обложку"
                aria-label="Профиль {kitsuCoverByLogin}"
                onclick={() => openAssetCredit(kitsuCoverByUserId, kitsuCoverByLogin)}
              >
                · {kitsuCoverByLogin}
              </button>
            {/if}
          </span>
        {/if}

        {#if kitsuVideoBgUrl && !prefersReducedMotion}
          <button
            type="button"
            class="release-view-wrap__bg-btn"
            class:release-view-wrap__bg-btn--active={!bgHideVideo}
            aria-pressed={!bgHideVideo}
            aria-label={bgHideVideo ? 'Показать видео' : 'Скрыть видео'}
            title={bgHideVideo ? 'Показать видео' : 'Скрыть видео'}
            onclick={toggleBgHideVideo}
          >
            <span class="release-view-wrap__bg-bar-icon" aria-hidden="true">{@html bgHideVideo ? iconEyeOff(14) : iconEye(14)}</span>
            <span>{bgHideVideo ? 'Видео скрыто' : 'Видео'}</span>
          </button>
        {/if}

        {#if showKitsuAudio}
          <span id="release-bg-vol-hint" class="release-view-wrap__bg-vol-hint" role="tooltip">
            {bgMuted ? 'Включить звук (10%). Зажмите и ведите вверх/вниз — громкость' : 'Зажмите и ведите вверх/вниз — громкость. Клик — выключить'}
          </span>
        {/if}
      </div>

      <ReleaseSuggestMenu releaseId={id} />
    </div>
  {/if}

  <div
    class="view view-release"
    class:view-release--with-bg={showKitsuBg}
    class:view-release--bg-peek={showKitsuBg && bgAreaHover && !prefersReducedMotion && !bgVolumeDrag}
  >
  {#if loadState === 'loading'}
    <div class="release-loading">Загрузка…</div>

  {:else if loadState === 'error'}
    <div class="release-loading">{errorMsg}</div>

  {:else if release}
    <section class="release-page">

      <!-- Head: poster + info -->
      <ReleaseHead
        {posterUrl} {title} {titleRu} {titleOriginal} {titleAlt}
        {ageRateText} {ageIsRestricted}
        {isFavorite} {favoritesCount}
        {isViewBlocked} {noteHtml} {descHtml} {descClean} {descNeedsTruncate} {descCollapsed}
        {metaInfoRows} {playBtnText} {playBtnDisabled} {episodeAddedText}
        {currentStatus} {selectOptions}
        onToggleFavorite={toggleFavorite}
        onWatch={handleWatch}
        onSetStatus={setStatus}
        onToggleDesc={() => { descCollapsed = !descCollapsed; }}
      />

      <ReleaseVideos releaseId={id} releaseTitle={title} />

      <!-- Rating block -->
      <ReleaseRating
        releaseId={id}
        {grade} {hasRating} {voteCount}
        {vote1} {vote2} {vote3} {vote4} {vote5}
        {yourVote}
        {watchingCount} {planCount} {completedCount} {holdOnCount} {droppedCount}
        {canVote}
        onRefresh={refreshReleaseData}
      />

      <!-- Screenshots -->
      {#if screenshots.length > 0}
        <ReleaseScreenshots {screenshots} />
      {/if}

      <!-- Related releases -->
      {#if relatedCards.length > 0 && related?.id}
        <ReleaseRelated
          releaseId={id}
          relatedId={related.id}
          items={relatedCards}
        />
      {/if}

      <!-- Recommendations -->
      <ReleaseRecommendations items={recommendedCards} />

      <!-- Comments -->
      {#if commentCount > 0 || comments.length > 0}
        <ReleaseComments releaseId={id} {comments} totalCount={commentCount} commentsRoot={release} />
      {/if}

    </section>
  {/if}
  </div>
</div>
