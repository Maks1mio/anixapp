<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { getCurrentRoomId, getCurrentParticipants, proposeAnimeChange, getLastPlayback, getLobbyHostPeerId, getLobbyMyPeerId } from '../services/lobby-state';
  import { getFluoRoomSettings } from '../fluo/sync';
  import { fluoAnimeSelectModeOf, fluoPlaybackControlMode, isFluoAnimeVoteEnabled } from '../fluo/types';
  import { isDubberBlacklisted } from '../views/Watch/_utils';
  import {
    buildDownloadFolder,
    buildEpisodeFilename,
    resolveDownloadWithSiblingFallback,
  } from '../utils/download-queue-client';
  import { navigate } from '../stores/navigation';
  import { isMobileMode } from '../platform/mobile';
  import { showToast } from '../stores/toast';
  import MobilePlayerChooser from './MobilePlayerChooser.svelte';
  import DesktopPlayerChooser from './DesktopPlayerChooser.svelte';
  import ExternalPlaylistRangeSheet from './ExternalPlaylistRangeSheet.svelte';
  import ExternalPlaylistProgressOverlay from './ExternalPlaylistProgressOverlay.svelte';
  import MobileDownloadFlow from './MobileDownloadFlow.svelte';
  import { downloadItems, watchDownloads, episodeStatus, hasActiveDownloads } from '../stores/mobile-downloads';
  import { downloadsAvailable } from '../native/anix-downloads';
  import { queueEpisodes, getDownloadQuality, type QueueEp } from '../utils/mobile-download-actions';
  import {
    getMobilePlayerPrefs,
    setMobilePlayerPrefs,
    launchWithKind,
    needsExternalPlaylistRange,
    type ExternalPlaylistWindow,
    type MobilePlayerKind,
  } from '../utils/mobile-player';
  import {
    getPreferredExternalPlayerId,
    setPreferredExternalPlayerId,
    type ExternalPlayerId,
  } from '../utils/player-integration';
  import Page from './Page.svelte';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import { infiniteScroll } from '../actions/infiniteScroll';
  import {
    getWatchModalState,
    saveWatchModalState,
  } from '../stores/modals';
  import {
    iconMic,
    iconSearch,
    iconDownload,
    iconCircleCheck,
    iconCheck,
    iconMoreHorizontal,
    iconRefreshCw,
    iconChevronLeft,
    iconEye,
    iconX,
    iconPin,
  } from './icons';
  import {
    episodeDisplayNumber,
    episodeListDisplayNumbers,
    episodeListDisplayTotal,
    episodeListDisplayTotalLabel,
    epWordRu,
  } from '../utils/episode-display';
  import { formatDubberQuality, isDubberNovelty, readLastEpisodeTypeUpdateId, sortDubbersPinnedFirst } from '../utils/dubber-meta';
  import { listPlayableDubberSources, NO_EPISODE_PICK_OTHER_DUB } from '../utils/dubber-sources';
  import { isTvMode } from '../platform/tv';
  import { scheduleFocusTvOverlayContent } from '../services/tv-navigation';

  interface Props {
    releaseId: number;
    releaseTitle: string;
    onClose: () => void;
  }

  const { releaseId, releaseTitle, onClose }: Props = $props();

  interface Dubber {
    id: number;
    name: string;
    icon?: string;
    view_count?: number;
    viewCount?: number;
    episode_count?: number;
    episodeCount?: number;
    episodes_count?: number;
    episodesCount?: number;
    is_sub?: boolean;
    isSub?: boolean;
    pinned?: boolean;
    quality?: number;
    [key: string]: unknown;
  }

  interface Source {
    id: number;
    name: string;
    episode_count?: number;
    episodeCount?: number;
    episodes_count?: number;
    episodesCount?: number;
    [key: string]: unknown;
  }

  interface Episode {
    position: number;
    name: string;
    url: string;
    iframe: boolean;
    is_watched?: boolean;
    isWatched?: boolean;
    created_at?: string;
    createdAt?: string;
    added_at?: string;
    addedAt?: string;
    updated_at?: string;
    updatedAt?: string;
    [key: string]: unknown;
  }

  interface DownloadItem {
    url: string;
    filename: string;
    folder?: string;
    headers?: Record<string, string>;
    releaseId?: number;
    sourceId?: number;
    dubberId?: number;
    episodePosition?: number;
    releaseTitle?: string;
    dubberName?: string;
    sourceName?: string;
    skip?: {
      opening?: { start: number; end: number } | null;
      ending?: { start: number; end: number } | null;
    } | null;
  }

  interface EpisodeUpdate {
    last_episode_update_date?: number;
    last_episode_update_name?: string;
    last_episode_source_update_id?: number;
    last_episode_source_update_name?: string;
    last_episode_type_update_id?: number;
    lastEpisodeTypeUpdateName?: string;
    [key: string]: unknown;
  }

  type ModalView = 'variants' | 'episodes' | 'updates';
  type VariantFilter = 'all' | 'voice' | 'sub';

  let modalView = $state<ModalView>('variants');
  let variantFilter = $state<VariantFilter>(isMobileMode() ? 'all' : 'voice');
  let sourcesLoading = $state(true);
  let sourcesError = $state('');
  let dubbers = $state<Dubber[]>([]);
  let updates = $state<EpisodeUpdate[]>([]);
  let updatesLoading = $state(false);
  let updatesLoadingMore = $state(false);
  let updatesError = $state('');
  let updatesLoaded = $state(false);
  let updatesPage = $state(0);
  let updatesHasMore = $state(false);
  let updatesScrollRoot = $state<HTMLElement | null>(null);
  let selectedDubber = $state<Dubber | null>(null);
  let sources = $state<Source[]>([]);
  let selectedSourceId = $state<number | null>(null);
  let episodes = $state<Episode[]>([]);
  let episodesLoading = $state(false);
  let episodesError = $state('');
  let searchInput = $state('');
  let selectedEpisodePos = $state<number | null>(null);
  let optionsOpen = $state(false);
  let actionBusy = $state('');
  let downloadStatus = $state('');
  let downloadedPositions = $state<Record<number, boolean>>({});
  let lastEpisodeTypeUpdateId = $state<number | null>(null);

  let confirmTitle = $state('');
  let confirmText = $state('');
  let confirmYesLabel = $state('Да');
  let confirmSkipLabel = $state('');
  let showConfirm = $state(false);
  let confirmCallback = $state<(() => void) | null>(null);
  let confirmSkipCallback = $state<(() => void) | null>(null);
  let confirmHideCancel = $state(false);

  let episodesListEl = $state<HTMLElement | null>(null);

  const micIconSvg = iconMic(18);
  const searchIconSvg = iconSearch(15);
  const downloadIconSvg = iconDownload(15);
  const downloadedIconSvg = iconCircleCheck(15);
  const checkIconSvg = iconCheck(14);
  const dotsIconSvg = iconMoreHorizontal(16);
  const refreshIconSvg = iconRefreshCw(18);
  const backIconSvg = iconChevronLeft(20);
  const eyeIconSvg = iconEye(15);
  const closeIconSvg = iconX(16);

  const selectedSource = $derived(sources.find((s) => s.id === selectedSourceId) ?? null);
  const filteredEpisodes = $derived.by(() => {
    const q = searchInput.trim();
    if (!q) return episodes;
    return episodes.filter((ep) => {
      const display = episodeDisplayNumber(ep, episodes);
      const displayStr = display == null ? '' : String(display);
      return (
        (displayStr && displayStr.includes(q))
        || String(ep.position).includes(q)
        || ep.name?.toLowerCase().includes(q.toLowerCase())
      );
    });
  });
  const watchedCount = $derived(episodes.filter(isEpisodeWatched).length);
  const remainingCount = $derived(Math.max(0, episodes.length - watchedCount));
  const lastWatchedEpisode = $derived.by(() => {
    let last: Episode | null = null;
    for (const ep of episodes) {
      if (isEpisodeWatched(ep) && (!last || ep.position > last.position)) last = ep;
    }
    return last;
  });
  const filteredDubbers = $derived.by(() => {
    const list =
      variantFilter === 'voice' ? dubbers.filter((d) => !isSubDubber(d))
      : variantFilter === 'sub' ? dubbers.filter(isSubDubber)
      : dubbers;
    return sortDubbersPinnedFirst(list);
  });

  function ensureHttps(url: string): string {
    if (!url || typeof url !== 'string') return url;
    return url.replace(/^http:\/\//i, 'https://');
  }

  function normalizeEpisodeCount(d: Record<string, unknown>): number | null {
    const raw = d.episode_count ?? d.episodeCount ?? d.episodes_count ?? d.episodesCount;
    if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
    if (typeof raw === 'string') {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n)) return n;
    }
    return null;
  }

  function formatNum(n: number): string {
    return n.toLocaleString('ru-RU');
  }

  function fmtViewsShort(n?: number): string {
    if (n == null || n === 0) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  }

  function isSubDubber(d: Dubber): boolean {
    return d.is_sub === true || d.isSub === true || /субтитр/i.test(d.name);
  }

  function epWord(n: number): string {
    return epWordRu(n);
  }

  /** Живой итог по загруженному списку (последний номер), иначе поле API. */
  const liveEpisodeTotal = $derived(episodeListDisplayTotal(episodes));
  const liveEpisodeTotalLabel = $derived(episodeListDisplayTotalLabel(episodes));

  function dubberEpisodeLabel(d: Dubber): string {
    if (selectedDubber?.id === d.id && liveEpisodeTotalLabel) return liveEpisodeTotalLabel;
    const count = normalizeEpisodeCount(d as Record<string, unknown>);
    return count != null ? `${count} ${epWord(count)}` : '';
  }

  let pinningId = $state<number | null>(null);

  async function togglePinDubber(d: Dubber, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const api = window.anixApi?.type;
    if (!api?.pin || !api?.unpin || pinningId != null) return;
    const nextPinned = !d.pinned;
    pinningId = d.id;
    try {
      const res = nextPinned
        ? await api.pin(releaseId, d.id)
        : await api.unpin(releaseId, d.id);
      if (res && typeof res.code === 'number' && res.code !== 0) return;
      dubbers = sortDubbersPinnedFirst(
        dubbers.map((item) => (item.id === d.id ? { ...item, pinned: nextPinned } : item)),
      );
    } catch {
      /* ignore */
    } finally {
      pinningId = null;
    }
  }

  function buildDownloadMeta(ep: Episode, sourceNameOverride = '') {
    const dub = selectedDubber?.name ?? '';
    const player = sourceNameOverride || selectedSource?.name || '';
    return {
      folder: buildDownloadFolder(releaseTitle, dub, player),
      filename: buildEpisodeFilename(releaseTitle, dub, ep.position, player),
    };
  }

  function isEpisodeDownloaded(position: number): boolean {
    return !!downloadedPositions[position];
  }

  async function refreshDownloadedState() {
    if (!window.electron?.checkDownloadFiles || episodes.length === 0) {
      downloadedPositions = {};
      return;
    }
    try {
      const items = episodes.map((ep) => buildDownloadMeta(ep));
      const results = await window.electron.checkDownloadFiles({ items });
      const next: Record<number, boolean> = {};
      results.forEach((r, i) => {
        if (r.exists) next[episodes[i].position] = true;
      });
      downloadedPositions = next;
    } catch {
      downloadedPositions = {};
    }
  }

  function openConfirm(opts: {
    title: string;
    text: string;
    yesLabel?: string;
    onYes: () => void;
    skipLabel?: string;
    onSkip?: () => void;
    hideCancel?: boolean;
  }) {
    confirmTitle = opts.title;
    confirmText = opts.text;
    confirmYesLabel = opts.yesLabel ?? 'Да';
    confirmCallback = opts.onYes;
    confirmSkipLabel = opts.skipLabel ?? '';
    confirmSkipCallback = opts.onSkip ?? null;
    confirmHideCancel = opts.hideCancel === true;
    showConfirm = true;
  }

  function isInLobbyWithOthers(): boolean {
    const roomId = getCurrentRoomId();
    if (!roomId) return false;
    return getCurrentParticipants().length > 1;
  }

  function isEpisodeWatched(ep: Episode): boolean {
    return ep.is_watched === true || ep.isWatched === true;
  }

  function setEpisodeWatchedLocal(position: number, watched: boolean) {
    episodes = episodes.map((ep) => (
      ep.position === position ? { ...ep, is_watched: watched, isWatched: watched } : ep
    ));
  }

  function formatUpdateTimestamp(timestamp?: number): string {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return 'дата неизвестна';
    const ms = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    return new Date(ms).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function updateEpisodeLabel(update: EpisodeUpdate): string {
    return update.last_episode_update_name || '— серия';
  }

  function updateVariantLabel(update: EpisodeUpdate): string {
    return update.lastEpisodeTypeUpdateName || '—';
  }

  function updateSourceLabel(update: EpisodeUpdate): string {
    return update.last_episode_source_update_name || '—';
  }

  async function loadUpdatesPage(page: number, append = false) {
    if (page === 0) {
      updatesLoading = true;
      updatesError = '';
    } else {
      updatesLoadingMore = true;
    }

    try {
      const res = await window.anixApi?.release?.getEpisodeUpdates?.(releaseId, page);
      const content = res?.content ?? [];
      updates = append ? [...updates, ...content] : content;

      const currentPage = typeof res?.current_page === 'number' ? res.current_page : page;
      const totalPages = typeof res?.total_page_count === 'number' ? res.total_page_count : 0;
      updatesPage = currentPage;
      updatesHasMore = totalPages > 0 && currentPage + 1 < totalPages;
      updatesLoaded = true;

      if (!append && updates.length === 0) updatesError = 'Статистика добавлений пустая';
    } catch {
      if (!append) updatesError = 'Не удалось загрузить статистику';
    } finally {
      updatesLoading = false;
      updatesLoadingMore = false;
    }
  }

  async function openUpdatesView(force = false) {
    modalView = 'updates';
    if (updatesLoaded && !force) return;
    updates = [];
    updatesPage = 0;
    updatesHasMore = false;
    await loadUpdatesPage(0, false);
  }

  function loadMoreUpdates() {
    if (!updatesHasMore || updatesLoadingMore || updatesLoading) return;
    loadUpdatesPage(updatesPage + 1, true);
  }

  function focusTvModalContent() {
    if (!isTvMode()) return;
    scheduleFocusTvOverlayContent(24);
  }

  // ── Телефон: «Выберите вариант» → «Выберите серию» → «Выберите плеер» ──────────────────────────
  const isMobile = isMobileMode();
  function playerKindLabel(k: MobilePlayerKind): string {
    return k === 'web' ? 'Веб-плеер' : k === 'anix' ? 'АниксПлеер' : k === 'external' ? 'Сторонний' : 'Встроенный';
  }
  let stopDlWatch: (() => void) | null = null;
  let chooserEp = $state<number | null>(null);
  /** ПК: серия, ожидающая выбора плеера в диалоге. */
  let desktopChooserEp = $state<number | null>(null);
  /** ПК: серия ждёт выбора размера плейлиста для VLC/mpv. */
  let externalRangeEp = $state<number | null>(null);
  let externalProgress = $state<{ done: number; total: number } | null>(null);
  let externalAbort: AbortController | null = null;
  /** Выбранный сторонний плеер для текущего запуска (vlc / mpv). */
  let pendingExternalPlayerId = $state<ExternalPlayerId | null>(null);
  /** Окно «Выберите плеер» открыто только для смены плеера по умолчанию (без запуска серии). */
  let chooserSettings = $state(false);
  let playerLabel = $state(playerKindLabel(getMobilePlayerPrefs().kind));
  const HINT_KEYS = { variants: 'anix:hint:watch-variants', episodes: 'anix:hint:watch-episodes' } as const;
  function hintHidden(key: string): boolean {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  }
  let hintVariantsHidden = $state(isMobile && hintHidden(HINT_KEYS.variants));
  let hintEpisodesHidden = $state(isMobile && hintHidden(HINT_KEYS.episodes));
  function hideHint(which: 'variants' | 'episodes') {
    try { localStorage.setItem(HINT_KEYS[which], '1'); } catch { /* ignore */ }
    if (which === 'variants') hintVariantsHidden = true; else hintEpisodesHidden = true;
  }

  function cancelExternalPlaylistPrep() {
    externalAbort?.abort();
    externalAbort = null;
    externalProgress = null;
    externalRangeEp = null;
  }

  function watchLaunchParams(epPosition: number) {
    return {
      releaseId,
      sourceId: selectedSource!.id,
      ep: epPosition,
      title: releaseTitle,
      sourceName: selectedSource!.name,
      dubberId: selectedDubber?.id,
      dubberName: selectedDubber?.name,
    };
  }

  async function runExternalWithWindow(epPosition: number, playlistWindow: ExternalPlaylistWindow) {
    if (!selectedSource) return;
    cancelExternalPlaylistPrep();
    const ac = new AbortController();
    externalAbort = ac;
    externalProgress = { done: 0, total: 0 };
    const playerId = pendingExternalPlayerId || getPreferredExternalPlayerId() || undefined;
    try {
      const r = await launchWithKind('external', watchLaunchParams(epPosition), {
        playlistWindow,
        signal: ac.signal,
        playerId,
        onProgress: (p) => {
          if (externalAbort === ac) externalProgress = { done: p.done, total: p.total };
        },
        episodeMeta: episodes.map((ep) => ({
          position: Number(ep.position),
          name: typeof ep.name === 'string' ? ep.name : '',
          url: typeof ep.url === 'string' ? ep.url : '',
        })),
      });
      if (r.cancelled) return;
      if (r.started) {
        void markEpisodeWatched(epPosition);
        close();
      } else if (r.message) {
        showToast(r.message);
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      showToast(e instanceof Error ? e.message : 'Не удалось запустить плеер');
    } finally {
      if (externalAbort === ac) {
        externalAbort = null;
        externalProgress = null;
      }
    }
  }

  async function startWithKind(kind: MobilePlayerKind, epPosition: number) {
    if (!selectedSource) return;
    if (kind === 'external') {
      pendingExternalPlayerId = getPreferredExternalPlayerId();
      if (needsExternalPlaylistRange(episodes.length)) {
        externalRangeEp = epPosition;
        return;
      }
      await runExternalWithWindow(epPosition, 'all');
      return;
    }
    try {
      const r = await launchWithKind(kind, watchLaunchParams(epPosition));
      if (r.started) {
        void markEpisodeWatched(epPosition);
        close();
      } else if (r.message) {
        showToast(r.message);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось запустить плеер');
    }
  }

  function startMobileEpisode(epPosition: number) {
    const prefs = getMobilePlayerPrefs();
    if (prefs.ask) chooserEp = epPosition;
    else void startWithKind(prefs.kind, epPosition);
  }

  /** ПК: запуск серии выбранным плеером (web / builtin / external). */
  async function startDesktopEpisode(kind: MobilePlayerKind, epPosition: number, playerId?: ExternalPlayerId) {
    if (!selectedSource) return;
    if (kind === 'external') {
      pendingExternalPlayerId = playerId || getPreferredExternalPlayerId();
      if (needsExternalPlaylistRange(episodes.length)) {
        externalRangeEp = epPosition;
        return;
      }
      await runExternalWithWindow(epPosition, 'all');
      return;
    }
    pendingExternalPlayerId = null;
    try {
      const r = await launchWithKind(kind, watchLaunchParams(epPosition));
      if (r.started) {
        void markEpisodeWatched(epPosition);
        close();
      } else if (r.message) {
        showToast(r.message);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось запустить плеер');
    }
  }

  function onDesktopChooserDone(kind: MobilePlayerKind, remember: boolean, playerId?: ExternalPlayerId) {
    const ep = desktopChooserEp;
    desktopChooserEp = null;
    if (remember) {
      setMobilePlayerPrefs({ kind, ask: false });
      if (kind === 'external' && playerId) setPreferredExternalPlayerId(playerId);
    }
    if (ep != null) void startDesktopEpisode(kind, ep, playerId);
  }

  function onExternalRangeChosen(window: ExternalPlaylistWindow) {
    const ep = externalRangeEp;
    externalRangeEp = null;
    if (ep != null) void runExternalWithWindow(ep, window);
  }

  function onChooserDone(kind: MobilePlayerKind, ask: boolean) {
    const ep = chooserEp;
    chooserEp = null;
    setMobilePlayerPrefs({ kind, ask });
    chooserSettings = false;
    playerLabel = playerKindLabel(kind);
    if (ep != null) void startWithKind(kind, ep);
  }

  function backFromNestedView() {
    if (modalView === 'variants') { close(); return; }
    if (modalView === 'episodes') {
      modalView = 'variants';
      optionsOpen = false;
      focusTvModalContent();
      return;
    }
    if (modalView === 'updates') {
      modalView = 'variants';
      focusTvModalContent();
    }
  }

  function sourceLabel(source: Source): string {
    if (selectedSourceId === source.id && liveEpisodeTotal > 0) {
      return `${source.name} · ${liveEpisodeTotal} эп.`;
    }
    const count = normalizeEpisodeCount(source as Record<string, unknown>);
    return count != null ? `${source.name} · ${count} эп.` : source.name;
  }

  function scrollToEpisode(position: number) {
    if (!episodesListEl) return;
    const target = episodesListEl.querySelector<HTMLElement>(`.watch-modal__episode-card[data-position="${position}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('watch-modal__episode-card--highlight');
    window.setTimeout(() => target.classList.remove('watch-modal__episode-card--highlight'), 1200);
  }

  function handleSearchEpisode() {
    const num = Number(searchInput.trim());
    if (Number.isFinite(num) && num > 0) scrollToEpisode(num);
  }

  function handleLastWatched() {
    if (lastWatchedEpisode) scrollToEpisode(lastWatchedEpisode.position);
  }

  async function openDubber(dubber: Dubber) {
    modalView = 'episodes';
    selectedDubber = dubber;
    sources = [];
    selectedSourceId = null;
    selectedEpisodePos = null;
    episodes = [];
    searchInput = '';
    optionsOpen = false;
    downloadStatus = '';
    episodesError = '';
    episodesLoading = true;

    const api = window.anixApi;
    if (!api) {
      episodesLoading = false;
      episodesError = 'API недоступно';
      return;
    }

    try {
      const srcs = await listPlayableDubberSources(releaseId, dubber.id);
      sources = srcs;
      if (srcs.length === 0) {
        episodesLoading = false;
        episodesError = NO_EPISODE_PICK_OTHER_DUB;
        return;
      }
      await selectSource(srcs[0], false);
      await tick();
      focusTvModalContent();
    } catch {
      episodesLoading = false;
      episodesError = 'Ошибка загрузки источников';
    }
  }

  async function selectSource(source: Source, resetSearch = true) {
    if (!selectedDubber) return;
    selectedSourceId = source.id;
    selectedEpisodePos = null;
    if (resetSearch) searchInput = '';
    episodesLoading = true;
    episodesError = '';
    optionsOpen = false;

    try {
      const res = await window.anixApi?.release?.getEpisodes(releaseId, selectedDubber.id, source.id);
      episodes = (res?.episodes ?? []).filter((ep) => !!ep?.url);
      episodesLoading = false;
      if (episodes.length === 0) {
        episodesError = NO_EPISODE_PICK_OTHER_DUB;
        return;
      }
      await refreshDownloadedState();
      await tick();
      focusTvModalContent();
      if (lastWatchedEpisode) window.setTimeout(() => scrollToEpisode(lastWatchedEpisode!.position), 80);
    } catch {
      episodesLoading = false;
      episodesError = 'Ошибка загрузки серий';
    }
  }

  function handleEpisodePlay(epPosition: number) {
    if (!selectedSource) return;
    selectedEpisodePos = epPosition;
    const params = {
      releaseId: String(releaseId),
      sourceId: String(selectedSource.id),
      ep: String(epPosition),
      title: releaseTitle,
      sourceName: selectedSource.name,
      ...(selectedDubber ? { dubberId: String(selectedDubber.id) } : {}),
    };

    const doOpenPlayer = () => {
      if (isMobile) { startMobileEpisode(epPosition); return; }
      const prefs = getMobilePlayerPrefs();
      if (prefs.ask) desktopChooserEp = epPosition;
      else void startDesktopEpisode(prefs.kind === 'anix' ? 'builtin' : prefs.kind, epPosition);
    };

    if (isInLobbyWithOthers()) {
      const currentPlayback = getLastPlayback();
      const prevRid = String(currentPlayback?.releaseId ?? '').trim();
      const isDifferentAnime = !prevRid || prevRid !== String(releaseId);
      const settings = getFluoRoomSettings();
      const iAmHost = !!getLobbyMyPeerId() && getLobbyMyPeerId() === getLobbyHostPeerId();
      if (isDifferentAnime) {
        if (isFluoAnimeVoteEnabled(settings, getCurrentParticipants().length)) {
        openConfirm({
          title: `Предложить «${releaseTitle}»?`,
          text: 'Все участники увидят предложение сменить аниме. Продолжить?',
          yesLabel: 'Предложить',
          onYes: () => {
            proposeAnimeChange(params);
            const waiting = { type: 'waiting' as const, newPlayback: { title: releaseTitle, ep: params.ep } };
            window.electron?.sendProposalToPlayer?.(waiting);
            if (!window.electron) {
              window.dispatchEvent(new CustomEvent('lobby:proposal', { detail: waiting }));
            }
            close();
          },
        });
        return;
        }
        if (fluoAnimeSelectModeOf(settings) === 'host' && !iAmHost) {
          openConfirm({
            title: 'Выбор аниме',
            text: 'В этой комнате тайтл выбирает только хост.',
            yesLabel: 'Понятно',
            hideCancel: true,
            onYes: () => {},
          });
          return;
        }
        doOpenPlayer();
        return;
      }
      if (fluoPlaybackControlMode(settings) === 'host' && !iAmHost) {
        openConfirm({
          title: 'Управление плеером',
          text: 'Серии, озвучку и перемотку в этой комнате меняет только хост.',
          yesLabel: 'Понятно',
          hideCancel: true,
          onYes: () => {},
        });
        return;
      }
      doOpenPlayer();
      return;
    }
    doOpenPlayer();
  }

  async function markEpisodeWatched(position: number) {
    if (!selectedSource) return;
    const prev = episodes.find((ep) => ep.position === position);
    if (!prev || isEpisodeWatched(prev)) return;
    setEpisodeWatchedLocal(position, true);
    try {
      await window.anixApi?.history?.markWatched?.(releaseId, selectedSource.id, position);
    } catch {
      setEpisodeWatchedLocal(position, false);
    }
  }

  async function toggleEpisodeWatched(ep: Episode, event: MouseEvent) {
    event.stopPropagation();
    if (!selectedSource || actionBusy) return;
    const next = !isEpisodeWatched(ep);
    const key = `ep-${ep.position}`;
    actionBusy = key;
    setEpisodeWatchedLocal(ep.position, next);
    try {
      if (next) await window.anixApi?.history?.markWatched?.(releaseId, selectedSource.id, ep.position);
      else await window.anixApi?.history?.unmarkWatched?.(releaseId, selectedSource.id, ep.position);
    } catch {
      setEpisodeWatchedLocal(ep.position, !next);
    } finally {
      actionBusy = '';
    }
  }

  async function setAllWatched(watched: boolean) {
    if (!selectedSource || episodes.length === 0 || actionBusy) return;
    const previous = episodes;
    actionBusy = watched ? 'mark-all' : 'unmark-all';
    optionsOpen = false;
    episodes = episodes.map((ep) => ({ ...ep, is_watched: watched, isWatched: watched }));

    try {
      const apiCall = watched ? window.anixApi?.history?.markWatched : window.anixApi?.history?.unmarkWatched;
      for (const ep of previous) {
        await apiCall?.(releaseId, selectedSource.id, ep.position);
      }
    } catch {
      episodes = previous;
    } finally {
      actionBusy = '';
    }
  }

  async function resolveDownloadItem(ep: Episode): Promise<DownloadItem | null> {
    if (!selectedSource || selectedDubber?.id == null) return null;
    let episode = ep;
    if (!episode.url) {
      const res = await window.anixApi?.release?.getEpisode(releaseId, selectedSource.id, ep.position);
      episode = { ...ep, ...(res?.episode ?? {}) };
    }
    if (!episode.url) return null;

    const resolved = await resolveDownloadWithSiblingFallback({
      releaseId,
      sourceId: selectedSource.id,
      dubberId: selectedDubber.id,
      position: ep.position,
      episodeUrl: episode.url,
      iframe: !!episode.iframe,
    });
    if (!resolved?.url) return null;

    const sourceName = resolved.sourceName || selectedSource?.name || '';
    const meta = buildDownloadMeta(ep, sourceName);
    return {
      url: resolved.url,
      filename: meta.filename,
      folder: meta.folder,
      headers: resolved.headers,
      releaseId,
      sourceId: resolved.sourceId,
      dubberId: selectedDubber.id,
      episodePosition: ep.position,
      releaseTitle,
      dubberName: selectedDubber?.name ?? '',
      sourceName,
      skip: resolved.skip ?? null,
    };
  }

  async function queueDownloads(eps: Episode[]) {
    const items: DownloadItem[] = [];
    for (const ep of eps) {
      downloadStatus = `Подготовка серии ${ep.position}…`;
      const item = await resolveDownloadItem(ep);
      if (item) items.push(item);
    }
    if (items.length === 0) throw new Error('no items');
    await window.electron?.queueEpisodeDownloads?.({ items });
    void refreshDownloadedState();
  }

  // ── Телефон: нативные загрузки (Media3) ────────────────────────────────────────────────────
  let dlDialog = $state(false);
  let dlBusy = $state('');

  function mobileDlItem(position: number) {
    if (!selectedSource || !selectedDubber) return undefined;
    return episodeStatus($downloadItems, releaseId, selectedSource.id, selectedDubber.id, position);
  }

  const mobileDoneCount = $derived(
    isMobile ? episodes.filter((e) => mobileDlItem(e.position)?.state === 'completed').length : 0,
  );
  const mobileMissing = $derived(
    isMobile ? episodes.filter((e) => !mobileDlItem(e.position) || mobileDlItem(e.position)?.state === 'failed').length : 0,
  );

  async function mobileQueue(list: Episode[], quality: string) {
    if (!selectedSource || !selectedDubber || list.length === 0) return;
    dlBusy = `Подготовка: ${list.length}…`;
    const eps: QueueEp[] = list.map((e) => ({ position: e.position, name: e.name || `${e.position} серия`, url: e.url }));
    const res = await queueEpisodes(
      {
        releaseId,
        releaseTitle,
        sourceId: selectedSource.id,
        sourceName: selectedSource.name,
        dubberId: selectedDubber.id,
        dubberName: selectedDubber.name,
        episodesTotal: episodes.length,
      },
      eps,
      quality,
      (done, total) => { dlBusy = `Подготовка: ${done} из ${total}`; },
    );
    dlBusy = '';
    if (res.failed > 0 && res.queued === 0) {
      showToast(res.error ? `Не удалось: ${res.error}` : 'Не удалось поставить в очередь');
    } else {
      showToast(res.queued > 0 ? `Загрузка начата: ${res.queued} ${res.queued === 1 ? 'серия' : res.queued < 5 ? 'серии' : 'серий'}` : 'Эти серии уже в загрузках');
    }
  }

  function onDlConfirm(quality: string, onlyMissing: boolean) {
    dlDialog = false;
    const list = onlyMissing
      ? episodes.filter((e) => !mobileDlItem(e.position) || mobileDlItem(e.position)?.state === 'failed')
      : episodes;
    void mobileQueue(list, quality);
  }

  async function downloadEpisode(ep: Episode, event?: MouseEvent) {
    event?.stopPropagation();
    if (isMobile) {
      const st = mobileDlItem(ep.position)?.state;
      if (st === 'completed' || st === 'queued' || st === 'downloading') {
        showToast(st === 'completed' ? 'Серия уже скачана' : 'Серия уже в загрузках');
        return;
      }
      void mobileQueue([ep], getDownloadQuality());
      return;
    }
    if (actionBusy) return;

    const run = async () => {
      actionBusy = `dl-${ep.position}`;
      downloadStatus = `Подготовка серии ${ep.position}…`;
      try {
        await queueDownloads([ep]);
        downloadStatus = `Серия ${ep.position} добавлена в загрузки`;
        navigate('/downloads');
      } catch {
        downloadStatus = `Не удалось подготовить серию ${ep.position}`;
      } finally {
        actionBusy = '';
      }
    };

    if (isEpisodeDownloaded(ep.position)) {
      openConfirm({
        title: `Серия ${ep.position} уже скачана`,
        text: 'Файл уже есть в папке загрузок. Скачать заново?',
        yesLabel: 'Скачать заново',
        onYes: () => { void run(); },
      });
      return;
    }
    await run();
  }

  async function downloadAllEpisodes() {
    if (isMobile) { if (episodes.length > 0) dlDialog = true; return; }
    if (episodes.length === 0 || actionBusy) return;

    const already = episodes.filter((ep) => isEpisodeDownloaded(ep.position));
    const pending = episodes.filter((ep) => !isEpisodeDownloaded(ep.position));

    const runQueue = async (list: Episode[]) => {
      if (list.length === 0) {
        downloadStatus = 'Нечего скачивать — все серии уже на диске';
        return;
      }
      actionBusy = 'download-all';
      optionsOpen = false;
      downloadStatus = `Подготовка ${liveEpisodeTotal || list.length} серий…`;
      try {
        await queueDownloads(list);
        downloadStatus = `Добавлено в загрузки: ${list.length}`;
        navigate('/downloads');
      } catch {
        downloadStatus = 'Не удалось подготовить загрузку';
      } finally {
        actionBusy = '';
      }
    };

    if (already.length > 0) {
      const nums = already.map((ep) => ep.position).join(', ');
      const allDone = already.length === episodes.length;
      openConfirm({
        title: allDone
          ? 'Все серии уже скачаны'
          : `${already.length} ${already.length === 1 ? 'серия уже скачана' : already.length < 5 ? 'серии уже скачаны' : 'серий уже скачаны'}`,
        text: allDone
          ? 'Все файлы уже есть в папке загрузок. Скачать всё заново?'
          : `Серии ${nums} уже скачаны. Скачать всё заново (будут созданы новые копии) или пропустить их?`,
        yesLabel: 'Скачать заново',
        onYes: () => { void runQueue(episodes); },
        skipLabel: allDone ? '' : `Скачать только ${pending.length} ${pending.length === 1 ? 'серию' : pending.length < 5 ? 'серии' : 'серий'}`,
        onSkip: allDone ? undefined : () => { void runQueue(pending); },
      });
      return;
    }

    await runQueue(episodes);
  }

  function handleConfirmYes() {
    showConfirm = false;
    confirmCallback?.();
    confirmCallback = null;
    confirmSkipCallback = null;
  }

  function handleConfirmNo() {
    showConfirm = false;
    confirmCallback = null;
    confirmSkipCallback = null;
  }

  function handleConfirmSkip() {
    showConfirm = false;
    confirmSkipCallback?.();
    confirmCallback = null;
    confirmSkipCallback = null;
  }

  function close() {
    document.body.style.overflow = '';
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  onMount(() => {
    stopDlWatch = isMobile ? watchDownloads() : null;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeydown);
    focusTvModalContent();

    const cached = getWatchModalState(releaseId);

    const onDownloadProgress = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.status === 'done') void refreshDownloadedState();
    };
    window.addEventListener('episode-download:progress', onDownloadProgress);

    const api = window.anixApi;
    if (!Number.isFinite(releaseId) || releaseId <= 0 || !api?.release?.getDubbers) {
      sourcesLoading = false;
      sourcesError = !Number.isFinite(releaseId) || releaseId <= 0 ? 'Неверный релиз' : 'API недоступно';
    } else {
      api.release.getDubbers(releaseId)
        .then(async (res: { types?: Dubber[] }) => {
          const types = (res?.types ?? []).filter(d => !isDubberBlacklisted(String(d.name ?? '')));
          sourcesLoading = false;
          if (types.length === 0) {
            sourcesError = 'Нет озвучек';
            return;
          }
          dubbers = sortDubbersPinnedFirst(types);
          await tick();
          focusTvModalContent();

          void api.release.info?.(releaseId).then((infoRes: { release?: unknown }) => {
            lastEpisodeTypeUpdateId = readLastEpisodeTypeUpdateId(infoRes?.release ?? infoRes);
          }).catch(() => {});

          if (!cached) return;

          variantFilter = cached.variantFilter;
          searchInput = cached.searchInput;
          selectedEpisodePos = cached.selectedEpisodePos;

          if (cached.modalView === 'updates') {
            void openUpdatesView();
            return;
          }

          if (cached.modalView === 'episodes' && cached.selectedDubberId != null) {
            const dubber = types.find((d) => d.id === cached.selectedDubberId);
            if (!dubber) return;
            await openDubber(dubber);
            if (cached.selectedSourceId != null) {
              const source = sources.find((s) => s.id === cached.selectedSourceId);
              if (source) {
                await selectSource(source, false);
                searchInput = cached.searchInput;
                selectedEpisodePos = cached.selectedEpisodePos;
              }
            }
          }
        })
        .catch(() => {
          sourcesLoading = false;
          sourcesError = 'Ошибка загрузки';
        });
    }

    return () => {
      window.removeEventListener('episode-download:progress', onDownloadProgress);
    };
  });

  onDestroy(() => {
    // отписка от загрузок выполняется ниже вместе с остальной очисткой
    stopDlWatch?.();
    cancelExternalPlaylistPrep();
    saveWatchModalState({
      releaseId,
      modalView,
      variantFilter,
      selectedDubberId: selectedDubber?.id ?? null,
      selectedSourceId,
      searchInput,
      selectedEpisodePos,
    });
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleKeydown);
  });

</script>

<div class="watch-modal" role="dialog" aria-modal="true">
  <button type="button" class="watch-modal__backdrop" aria-label="Закрыть" onclick={close}></button>

  <div class="watch-modal__panel">
    <div class="watch-modal__head">
      {#if modalView !== 'variants' || isMobile}
        <button type="button" class="watch-modal__head-back" aria-label="Назад" onclick={backFromNestedView}>
          {@html backIconSvg}
        </button>
      {/if}
      <div class="watch-modal__head-text">
        <h2 class="watch-modal__title">
          {#if modalView === 'updates'}
            Статистика добавления
          {:else if isMobile && modalView === 'episodes'}
            Выберите серию
          {:else if modalView === 'episodes' && selectedDubber}
            {selectedDubber.name}
          {:else if isMobile}
            Выберите вариант
          {:else}
            Смотреть
          {/if}
        </h2>
        {#if modalView === 'variants'}
          {#if !isMobile}<p class="watch-modal__subtitle">{releaseTitle}</p>{/if}
        {:else if isMobile && modalView === 'episodes'}
          {#if selectedSource}<p class="watch-modal__subtitle">Источник {selectedSource.name}</p>{/if}
        {:else if modalView === 'episodes' && selectedDubber}
          {@const viewCountRaw = selectedDubber.view_count ?? selectedDubber.viewCount ?? 0}
          {@const viewCount = typeof viewCountRaw === 'number' ? viewCountRaw : parseInt(String(viewCountRaw), 10) || 0}
          <p class="watch-modal__subtitle">
            {formatNum(viewCount)} просмотров · {isSubDubber(selectedDubber) ? 'субтитры' : 'озвучка'} · {liveEpisodeTotalLabel || dubberEpisodeLabel(selectedDubber)}
          </p>
        {/if}
      </div>
      <div class="watch-modal__head-actions">
        {#if modalView === 'variants'}
          <button type="button" class="watch-modal__head-icon" aria-label="Статистика добавления" title="Статистика добавления" onclick={() => openUpdatesView()}>
            {@html refreshIconSvg}
          </button>
        {:else if modalView === 'updates'}
          <button
            type="button"
            class="watch-modal__head-icon"
            class:watch-modal__head-icon--spinning={updatesLoading || updatesLoadingMore}
            aria-label="Обновить статистику"
            title="Обновить"
            onclick={() => openUpdatesView(true)}
            disabled={updatesLoading}
          >
            {@html refreshIconSvg}
          </button>
        {/if}
        <button type="button" class="watch-modal__close" aria-label="Закрыть" onclick={close}>
          {@html closeIconSvg}
        </button>
      </div>
    </div>

    <div class="watch-modal__body">
      {#if modalView === 'updates'}
        <div class="watch-modal__updates-scroll" bind:this={updatesScrollRoot}>
          <div class="watch-modal__updates-list">
            {#if updatesLoading && updates.length === 0}
              <div class="watch-modal__loading watch-modal__loading--center">Загрузка статистики…</div>
            {:else if updatesError && updates.length === 0}
              <div class="watch-modal__loading watch-modal__loading--center">{updatesError}</div>
            {:else}
              {#each updates as update, i (`${update.last_episode_update_name}-${update.last_episode_source_update_id}-${update.last_episode_update_date}-${i}`)}
                <article class="watch-modal__update-row">
                  <span class="watch-modal__update-marker" aria-hidden="true"></span>
                  <div class="watch-modal__update-content">
                    <p>
                      {updateEpisodeLabel(update)}, вариант {updateVariantLabel(update)}, источник {updateSourceLabel(update)}
                    </p>
                    <time>{formatUpdateTimestamp(update.last_episode_update_date)}</time>
                  </div>
                </article>
              {/each}

              {#if updatesLoadingMore}
                <div class="watch-modal__load-more-indicator" aria-live="polite">
                  <span class="watch-modal__load-status">Загрузка…</span>
                </div>
              {/if}

              {#if updatesHasMore || updatesLoadingMore}
                <div
                  class="watch-modal__load-sentinel"
                  aria-hidden="true"
                  use:infiniteScroll={{
                    onLoad: loadMoreUpdates,
                    enabled: () => updatesHasMore && !updatesLoadingMore && !updatesLoading,
                    root: updatesScrollRoot,
                  }}
                ></div>
              {/if}
            {/if}
          </div>
        </div>
      {:else if modalView === 'episodes'}
        {#if episodesLoading && episodes.length === 0}
          <div class="watch-modal__loading watch-modal__loading--center">Загрузка серий…</div>
        {:else if episodesError}
          <div class="watch-modal__loading watch-modal__loading--center">{episodesError}</div>
        {:else}
          <Page noPadding extraClass="watch-modal__page page--scroll-area">
            <div class="watch-modal__episodes-view">
              {#if isMobile && selectedDubber}
                <h3 class="watch-modal__group-title">{selectedDubber.name}</h3>
              {/if}
              {#if isMobile && downloadsAvailable()}
                <div class="watch-modal__dl-bar">
                  <button type="button" class="watch-modal__dl-all" disabled={!!dlBusy || episodes.length === 0} onclick={downloadAllEpisodes}>
                    {@html downloadIconSvg}
                    <span>{dlBusy || (mobileDoneCount === episodes.length && episodes.length > 0 ? 'Все серии скачаны' : mobileDoneCount > 0 ? `Скачать остальные (${mobileMissing})` : `Скачать все серии (${liveEpisodeTotal || episodes.length})`)}</span>
                  </button>
                  <button type="button" class="watch-modal__dl-open" onclick={() => { close(); navigate('/downloads'); }}>
                    Загрузки{#if $hasActiveDownloads}<i class="watch-modal__dl-dot"></i>{/if}
                  </button>
                </div>
              {/if}
              {#if isMobile}
                <button type="button" class="watch-modal__player-pick" onclick={() => (chooserSettings = true)}>
                  <span>Плеер: <b>{playerLabel}</b></span><span class="watch-modal__player-pick-act">Изменить</span>
                </button>
              {/if}
              {#if isMobile && !hintEpisodesHidden}
                <div class="watch-modal__hint">
                  <p>Если серия не запускается ни через какой видеоплеер, попробуйте сменить источник, если это доступно. Любая реклама в видео к приложению отношения не имеет.</p>
                  <button type="button" aria-label="Скрыть подсказку" onclick={() => hideHint('episodes')}>{@html closeIconSvg}</button>
                </div>
              {/if}
              {#if sources.length > 1}
                <div class="watch-modal__source-pills" aria-label="Источники">
                  {#each sources as source (source.id)}
                    <button
                      type="button"
                      class="watch-modal__source-pill"
                      class:watch-modal__source-pill--active={source.id === selectedSourceId}
                      onclick={() => selectSource(source)}
                    >
                      {sourceLabel(source)}
                    </button>
                  {/each}
                </div>
              {/if}

              <div class="watch-modal__episodes-toolbar" role="search">
                <label class="watch-modal__episodes-search">
                  <span class="watch-modal__episodes-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
                  <input
                    type="search"
                    class="watch-modal__episodes-search-input"
                    placeholder="Найти серию"
                    bind:value={searchInput}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchEpisode(); } }}
                  />
                </label>

                <div class="watch-modal__toolbar-divider" aria-hidden="true"></div>

                <div class="watch-modal__toolbar-actions">
                  <button type="button" class="watch-modal__toolbar-btn" title="Скачать все серии" onclick={downloadAllEpisodes} disabled={actionBusy !== '' || episodes.length === 0}>
                    {@html downloadIconSvg}
                  </button>
                  <div class="watch-modal__options">
                    <button type="button" class="watch-modal__toolbar-btn" title="Опции" aria-expanded={optionsOpen} onclick={() => optionsOpen = !optionsOpen}>
                      {@html dotsIconSvg}
                    </button>
                    {#if optionsOpen}
                      <div class="watch-modal__options-menu">
                        <button type="button" onclick={handleLastWatched}>К последней отмеченной</button>
                        <button type="button" onclick={() => setAllWatched(true)} disabled={actionBusy !== ''}>Пометить всё</button>
                        <button type="button" onclick={() => setAllWatched(false)} disabled={actionBusy !== ''}>Удалить все отметки</button>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>

              {#if downloadStatus}
                <div class="watch-modal__download-status">{downloadStatus}</div>
              {/if}

              <div class="watch-modal__episodes" bind:this={episodesListEl}>
                {#each filteredEpisodes as ep (ep.position)}
                  {@const watched = isEpisodeWatched(ep)}
                  {@const dlItem = isMobile ? mobileDlItem(ep.position) : undefined}
                  {@const downloaded = isMobile ? dlItem?.state === 'completed' : isEpisodeDownloaded(ep.position)}
                  {@const displayNum = episodeDisplayNumber(ep, episodes)}
                  {@const unnumbered = displayNum == null}
                  <article
                    class="watch-modal__episode-card"
                    class:watch-modal__episode-card--watched={watched}
                    class:watch-modal__episode-card--active={selectedEpisodePos === ep.position}
                    class:watch-modal__episode-card--unnumbered={unnumbered}
                    data-position={ep.position}
                  >
                    <button type="button" class="watch-modal__episode-main" onclick={() => handleEpisodePlay(ep.position)}>
                      {#if unnumbered}
                        <span class="watch-modal__episode-name watch-modal__episode-name--solo">
                          {ep.name?.trim() || 'Смотреть онлайн'}
                        </span>
                      {:else}
                        <span class="watch-modal__episode-num">{displayNum}</span>
                        <span class="watch-modal__episode-name">{ep.name || `Серия ${displayNum}`}</span>
                      {/if}
                    </button>
                    <span class="watch-modal__episode-actions">
                      <button
                        type="button"
                        class="watch-modal__episode-mini"
                        title={watched ? 'Снять отметку' : 'Пометить просмотренной'}
                        onclick={(e) => toggleEpisodeWatched(ep, e)}
                      >
                        {@html checkIconSvg}
                      </button>
                      <button
                        type="button"
                        class="watch-modal__episode-mini"
                        class:watch-modal__episode-mini--downloaded={downloaded}
                        title={downloaded ? 'Скачано' : 'Скачать серию'}
                        onclick={(e) => downloadEpisode(ep, e)}
                      >
                        {#if downloaded}
                          {@html downloadedIconSvg}
                        {:else if dlItem && (dlItem.state === 'downloading' || dlItem.state === 'queued' || dlItem.state === 'restarting')}
                          <span class="watch-modal__dl-ring" style="--p:{Math.round(dlItem.percent)}" title={dlItem.state === 'queued' ? 'В очереди' : `${Math.round(dlItem.percent)}%`}></span>
                        {:else if dlItem?.state === 'failed'}
                          <span class="watch-modal__dl-fail" title="Ошибка — нажмите, чтобы повторить">!</span>
                        {:else}
                          {@html downloadIconSvg}
                        {/if}
                      </button>
                    </span>
                  </article>
                {/each}
              </div>
            </div>
          </Page>
        {/if}
      {:else if sourcesLoading}
        <div class="watch-modal__loading watch-modal__loading--center">Загрузка озвучек…</div>
      {:else if sourcesError}
        <div class="watch-modal__loading watch-modal__loading--center">{sourcesError}</div>
      {:else}
        <Page noPadding extraClass="watch-modal__page page--scroll-area">
          <div class="watch-modal__variants">
            <div class="watch-modal__filters" role="tablist" aria-label="Фильтр вариантов">
              <button
                type="button"
                role="tab"
                class="watch-modal__filter"
                class:watch-modal__filter--active={variantFilter === 'all'}
                aria-selected={variantFilter === 'all'}
                onclick={() => variantFilter = 'all'}
              >Все</button>
              <button
                type="button"
                role="tab"
                class="watch-modal__filter"
                class:watch-modal__filter--active={variantFilter === 'voice'}
                aria-selected={variantFilter === 'voice'}
                onclick={() => variantFilter = 'voice'}
              >Озвучки</button>
              <button
                type="button"
                role="tab"
                class="watch-modal__filter"
                class:watch-modal__filter--active={variantFilter === 'sub'}
                aria-selected={variantFilter === 'sub'}
                onclick={() => variantFilter = 'sub'}
              >Субтитры</button>
            </div>

            {#if isMobile && !hintVariantsHidden}
              <div class="watch-modal__hint">
                <p>Напротив каждого варианта озвучки указано общее количество доступных серий. Статистика просмотров обновляется ежедневно.</p>
                <button type="button" aria-label="Скрыть подсказку" onclick={() => hideHint('variants')}>{@html closeIconSvg}</button>
              </div>
            {/if}

            <div class="watch-modal__variant-list">
              {#if filteredDubbers.length === 0}
                <div class="watch-modal__loading watch-modal__loading--center">Нет вариантов</div>
              {:else}
                {#each filteredDubbers as d (d.id)}
                  {@const viewCountRaw = d.view_count ?? d.viewCount ?? 0}
                  {@const viewCount = typeof viewCountRaw === 'number' ? viewCountRaw : parseInt(String(viewCountRaw), 10) || 0}
                  {@const iconUrl = d.icon ? resolveCdnAssetUrl(ensureHttps(String(d.icon))) : ''}
                  {@const epLabel = dubberEpisodeLabel(d)}
                  {@const qualityLabel = formatDubberQuality(d.quality)}
                  {@const pinned = d.pinned === true}
                  {@const isNew = isDubberNovelty(d.id, lastEpisodeTypeUpdateId)}
                  <div
                    class="watch-modal__variant-row"
                    class:watch-modal__variant-row--pinned={pinned}
                    role="button"
                    tabindex="0"
                    onclick={() => openDubber(d)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDubber(d);
                      }
                    }}
                  >
                    <button
                      type="button"
                      class="watch-modal__variant-pin"
                      class:watch-modal__variant-pin--active={pinned}
                      aria-label={pinned ? 'Открепить озвучку' : 'Закрепить озвучку'}
                      title={pinned ? 'Открепить' : 'Закрепить'}
                      disabled={pinningId === d.id}
                      onclick={(e) => void togglePinDubber(d, e)}
                    >
                      {@html iconPin(15)}
                    </button>

                    {#if iconUrl}
                      <span class="watch-modal__variant-avatar" style="background-image:url({iconUrl})"></span>
                    {:else}
                      <span class="watch-modal__variant-avatar watch-modal__variant-avatar--mic">{@html micIconSvg}</span>
                    {/if}

                    <span class="watch-modal__variant-info">
                      <span class="watch-modal__variant-name-row">
                        <span class="watch-modal__variant-name">{d.name}</span>
                        {#if isNew}
                          <span class="watch-modal__new-badge">НОВИНКА</span>
                        {/if}
                      </span>
                      <span class="watch-modal__variant-meta">
                        {#if epLabel}
                          <span class="watch-modal__variant-ep">{epLabel}</span>
                        {/if}
                        {#if qualityLabel}
                          <span class="watch-modal__quality-badge">{qualityLabel}</span>
                        {/if}
                      </span>
                    </span>

                    <span class="watch-modal__variant-views-badge">
                      {@html eyeIconSvg}
                      {fmtViewsShort(viewCount)}
                    </span>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        </Page>
      {/if}
    </div>

    {#if dlDialog}
      <MobileDownloadFlow
        {releaseId}
        {releaseTitle}
        preDubberId={selectedDubber?.id}
        preSourceId={selectedSource?.id}
        onClose={() => (dlDialog = false)}
      />
    {/if}

    {#if chooserEp !== null || chooserSettings}
      <MobilePlayerChooser onChoose={onChooserDone} onClose={() => { chooserEp = null; chooserSettings = false; }} />
    {/if}

    {#if !isMobile && desktopChooserEp !== null}
      <DesktopPlayerChooser onChoose={onDesktopChooserDone} onClose={() => (desktopChooserEp = null)} />
    {/if}

    {#if externalRangeEp !== null && externalProgress === null}
      {@const rangeEp = episodes.find((ep) => ep.position === externalRangeEp)}
      {@const rangeCurrent = (rangeEp ? episodeDisplayNumber(rangeEp, episodes) : null) ?? externalRangeEp}
      <ExternalPlaylistRangeSheet
        currentEp={rangeCurrent}
        positions={episodeListDisplayNumbers(episodes)}
        onChoose={onExternalRangeChosen}
        onClose={() => {
          const ep = externalRangeEp;
          externalRangeEp = null;
          // Назад к выбору плеера / источника
          if (ep != null && !isMobile) desktopChooserEp = ep;
        }}
      />
    {/if}

    {#if externalProgress}
      <ExternalPlaylistProgressOverlay
        done={externalProgress.done}
        total={externalProgress.total}
        onCancel={cancelExternalPlaylistPrep}
      />
    {/if}

    {#if showConfirm}
      <div class="watch-modal__confirm">
        <div class="watch-modal__confirm-inner">
          <div class="watch-modal__confirm-title">{confirmTitle}</div>
          <div class="watch-modal__confirm-text">{confirmText}</div>
          <div class="watch-modal__confirm-actions">
            {#if !confirmHideCancel}
              <button type="button" class="watch-modal__confirm-btn watch-modal__confirm-btn--secondary" onclick={handleConfirmNo}>
                Отмена
              </button>
            {/if}
            {#if confirmSkipLabel && confirmSkipCallback}
              <button type="button" class="watch-modal__confirm-btn watch-modal__confirm-btn--secondary" onclick={handleConfirmSkip}>
                {confirmSkipLabel}
              </button>
            {/if}
            <button type="button" class="watch-modal__confirm-btn watch-modal__confirm-btn--primary" onclick={handleConfirmYes}>
              {confirmYesLabel}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
