<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import type { AnimationConfig } from 'svelte/animate';
  import {
    downloads,
    downloadSettings,
    downloadLibrary,
    downloadResumeBlocked,
    downloadFolders,
    type DownloadDisk,
    type DownloadFolder,
    type DownloadEntry,
    type DownloadLibraryGroup,
    type DownloadLibraryFile,
  } from '../stores/downloads';
  import { ffmpegInstall } from '../stores/ffmpeg-install';
  import { formatDownloadErrorMessage } from '../utils/download-errors';
  import { queueMissingEpisodes } from '../utils/download-queue-client';
  import { navigate } from '../stores/navigation';
  import { mapCardData } from './Release/_utils';
  import { toPosterDisplayUrl } from '../utils/posterUrl';
  import { getCurrentRoomId } from '../services/lobby-state';
  import {
    buildViewStateKey,
    getViewState,
    restoreScrollTop,
    registerActiveScrollKey,
    saveViewStateData,
  } from '../stores/view-state';
  import {
    iconDownload,
    iconRefreshCw,
    iconTriangleAlert,
    iconFolder,
    iconPlus,
    iconFileVideo,
    iconChevronRight,
    iconChevronUp,
    iconChevronDown,
    iconPlay,
    iconPause,
    iconX,
    iconTrash2,
    iconFilm,
    iconGripVertical,
    iconSearch,
    iconMic,
    iconRotateCcw,
    iconRotateCw,
  } from '../components/icons';

  interface LibrarySourceBucket {
    id: string;
    sourceName: string;
    sourceId: number | null;
    dubberName: string;
    dubberId: number | null;
    files: DownloadLibraryFile[];
  }

  interface LibraryDubberBucket {
    id: string;
    dubberName: string;
    dubberId: number | null;
    sources: LibrarySourceBucket[];
    fileCount: number;
    size: number;
  }

  /** Flip без перехвата кликов по тулбару во время анимации. */
  function libraryFlip(
    node: Element,
    rects: { from: DOMRect; to: DOMRect },
  ): AnimationConfig {
    const el = node as HTMLElement;
    const prev = el.style.pointerEvents;
    el.style.pointerEvents = 'none';
    const base = flip(node, rects, { duration: 460, easing: cubicOut });
    const duration = typeof base.duration === 'number' ? base.duration : 460;
    const restore = () => {
      el.style.pointerEvents = prev;
    };
    window.setTimeout(restore, duration + 80);
    const baseCss = base.css;
    return {
      delay: base.delay,
      duration: base.duration,
      easing: base.easing,
      css: baseCss
        ? (t, u) => {
            if (t >= 1) restore();
            return baseCss(t, u);
          }
        : undefined,
      tick: (t, u) => {
        base.tick?.(t, u);
        if (t >= 1) restore();
      },
    };
  }
  import UiV2Tabs, { type UiV2TabItem } from '../components/uikit-v2/UiV2Tabs.svelte';
  import UiV2Card from '../components/uikit-v2/UiV2Card.svelte';
  import UiV2ChoiceSheet from '../components/uikit-v2/UiV2ChoiceSheet.svelte';
  import { showToast } from '../stores/toast';
  import UiV2Button from '../components/uikit-v2/UiV2Button.svelte';
  import UiV2RoundButton from '../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2OutlinedField from '../components/uikit-v2/UiV2OutlinedField.svelte';
  import UiV2Select, { type UiV2SelectOption } from '../components/uikit-v2/UiV2Select.svelte';

  type LibSort = 'name' | 'date-desc' | 'date-asc' | 'size-desc' | 'size-asc';

  type LibQueryToken =
    | { kind: 'text'; value: string }
    | { kind: 'episode'; n: number; raw: string };

  type RankedLibraryGroup = DownloadLibraryGroup & {
    match: boolean;
    /** path → серия подходит под запрос */
    fileHits: Record<string, boolean>;
  };

  type HighlightPart = { text: string; hit: boolean };

  interface DownloadsViewState {
    expandedGroups: Record<string, boolean>;
    expandedDubs?: Record<string, boolean>;
    expandedSources?: Record<string, boolean>;
    tab?: string;
    libQuery?: string;
    libSort?: LibSort;
    libSource?: string;
    libDubber?: string;
  }

  const DOWNLOADS_VIEW_KEY = () => buildViewStateKey('/downloads');

  let expandedGroups = $state<Record<string, boolean>>({});
  let expandedDubs = $state<Record<string, boolean>>({});
  let expandedSources = $state<Record<string, boolean>>({});
  let activeTab = $state('library');
  /** Смена основной папки / перенос / добавление — блокирует кнопки папок */
  let folderBusy = $state(false);
  let moveProgress = $state<{ done: number; total: number } | null>(null);
  let folderMsg = $state('');
  /** Ждёт ответа «перенести или оставить» */
  let pendingPrimary = $state<{ path: string; titles: number; files: number; bytes: number } | null>(null);
  let stopMoveProgress: (() => void) | null = null;
  let seasonBusy = $state<string | null>(null);
  let playBlockedMsg = $state('');
  let playBlockedTimer: ReturnType<typeof setTimeout> | null = null;
  let unregisterScrollKey: (() => void) | null = null;
  let libQuery = $state('');
  let libSort = $state<LibSort>('name');
  let libSource = $state('');
  let libDubber = $state('');

  const ffmpegAvailable = $derived($ffmpegInstall.available ?? true);
  const ffmpegPath = $derived($ffmpegInstall.path);
  const canRetry = typeof window !== 'undefined' && typeof window.electron?.retryDownload === 'function';
  const ffmpegSource = $derived($ffmpegInstall.source);
  const ffmpegBusy = $derived($ffmpegInstall.busy);
  const ffmpegProgress = $derived($ffmpegInstall.progress);
  const ffmpegMsg = $derived($ffmpegInstall.message);
  const ffmpegPercent = $derived(ffmpegProgress?.percent ?? null);

  onMount(() => {
    unregisterScrollKey = registerActiveScrollKey(() => DOWNLOADS_VIEW_KEY());
    downloads.init();
    void downloads.loadFolders();
    stopMoveProgress = window.electron?.onDownloadFolderMoveProgress?.((d) => {
      if (!d.finished) moveProgress = { done: d.done ?? 0, total: d.total ?? 0 };
    }) ?? null;
    ffmpegInstall.init();
    void ffmpegInstall.refreshStatus();
    const cached = getViewState<DownloadsViewState>(DOWNLOADS_VIEW_KEY());
    if (cached?.data?.expandedGroups) {
      expandedGroups = { ...cached.data.expandedGroups };
    }
    if (cached?.data?.expandedDubs) {
      expandedDubs = { ...cached.data.expandedDubs };
    }
    if (cached?.data?.expandedSources) {
      expandedSources = { ...cached.data.expandedSources };
    }
    if (cached?.data?.tab === 'active' || cached?.data?.tab === 'settings' || cached?.data?.tab === 'library') {
      activeTab = cached.data.tab;
    }
    if (typeof cached?.data?.libQuery === 'string') libQuery = cached.data.libQuery;
    if (cached?.data?.libSort) libSort = cached.data.libSort;
    if (typeof cached?.data?.libSource === 'string') libSource = cached.data.libSource;
    if (typeof cached?.data?.libDubber === 'string') libDubber = cached.data.libDubber;
    void restoreScrollTop(cached?.scrollTop ?? 0, { maxWaitMs: 5000 });
  });

  onDestroy(() => {
    stopMoveProgress?.();
    unregisterScrollKey?.();
    unregisterScrollKey = null;
    if (playBlockedTimer) clearTimeout(playBlockedTimer);
    persistDownloadsView();
  });

  const activeItems = $derived(
    $downloads.filter((x) =>
      x.status === 'queued'
      || x.status === 'starting'
      || x.status === 'downloading'
      || x.status === 'paused'
      || x.status === 'error'
      || x.status === 'cancelled'
      || x.status === 'done'
    ),
  );
  const activeCount = $derived(
    $downloads.filter((x) => x.status === 'downloading' || x.status === 'starting').length,
  );
  const queuedCount = $derived(
    $downloads.filter((x) => x.status === 'queued' || x.status === 'paused').length,
  );
  const pausedCount = $derived(
    $downloads.filter((x) => x.status === 'paused').length,
  );
  const canPauseAll = $derived(
    $downloads.some((x) =>
      x.status === 'downloading' || x.status === 'starting' || x.status === 'queued',
    ),
  );
  const errorCount = $derived(
    $downloads.filter((x) => x.status === 'error' || x.status === 'cancelled').length,
  );
  const libraryGroups = $derived($downloadLibrary);
  const libraryFileCount = $derived(libraryGroups.reduce((n, g) => n + g.files.length, 0));

  const librarySourceOptions = $derived.by((): UiV2SelectOption[] => {
    const set = new Set<string>();
    for (const g of libraryGroups) {
      for (const f of g.files) {
        const n = (f.sourceName || g.sourceName || '').trim();
        if (n) set.add(n);
      }
    }
    return [
      { value: '', label: 'Все источники' },
      ...[...set].sort((a, b) => a.localeCompare(b, 'ru')).map((v) => ({ value: v, label: v })),
    ];
  });

  const libraryDubberOptions = $derived.by((): UiV2SelectOption[] => {
    const set = new Set<string>();
    for (const g of libraryGroups) {
      for (const f of g.files) {
        const n = (f.dubberName || g.dubberName || '').trim();
        if (n) set.add(n);
      }
    }
    return [
      { value: '', label: 'Все озвучки' },
      ...[...set].sort((a, b) => a.localeCompare(b, 'ru')).map((v) => ({ value: v, label: v })),
    ];
  });

  const librarySortOptions: UiV2SelectOption[] = [
    { value: 'name', label: 'По названию' },
    { value: 'date-desc', label: 'Сначала новые' },
    { value: 'date-asc', label: 'Сначала старые' },
    { value: 'size-desc', label: 'Сначала большие' },
    { value: 'size-asc', label: 'Сначала маленькие' },
  ];

  function parseLibQuery(raw: string): LibQueryToken[] {
    const parts = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const tokens: LibQueryToken[] = [];
    for (const p of parts) {
      if (/^\d{1,4}$/.test(p)) {
        tokens.push({ kind: 'episode', n: Number.parseInt(p, 10), raw: p });
        continue;
      }
      const epPrefixed = p.match(/^(?:серия|seria|ep|e|s|#)0*(\d{1,4})$/i);
      if (epPrefixed) {
        tokens.push({ kind: 'episode', n: Number.parseInt(epPrefixed[1], 10), raw: p });
        continue;
      }
      tokens.push({ kind: 'text', value: p });
    }
    return tokens;
  }

  function libQueryNeedles(tokens: LibQueryToken[]): string[] {
    const out: string[] = [];
    for (const t of tokens) {
      if (t.kind === 'text') {
        out.push(t.value);
      } else {
        out.push(String(t.n));
        out.push(String(t.n).padStart(2, '0'));
      }
    }
    return [...new Set(out.filter(Boolean))];
  }

  function highlightParts(text: string, needles: string[]): HighlightPart[] {
    if (!text) return [];
    const ns = needles.map((n) => n.trim()).filter((n) => n.length > 0);
    if (!ns.length) return [{ text, hit: false }];

    const lower = text.toLowerCase();
    const ranges: { start: number; end: number }[] = [];
    for (const n of ns) {
      const needle = n.toLowerCase();
      let from = 0;
      while (from < lower.length) {
        const i = lower.indexOf(needle, from);
        if (i < 0) break;
        ranges.push({ start: i, end: i + needle.length });
        from = i + Math.max(1, needle.length);
      }
    }
    if (!ranges.length) return [{ text, hit: false }];

    ranges.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged: { start: number; end: number }[] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
      else merged.push({ ...r });
    }

    const parts: HighlightPart[] = [];
    let cursor = 0;
    for (const r of merged) {
      if (r.start > cursor) parts.push({ text: text.slice(cursor, r.start), hit: false });
      parts.push({ text: text.slice(r.start, r.end), hit: true });
      cursor = r.end;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
    return parts;
  }

  function fileSearchBlob(file: DownloadLibraryFile, group: DownloadLibraryGroup): string {
    const src = (file.sourceName || group.sourceName || '').trim();
    const dub = (file.dubberName || group.dubberName || '').trim();
    const epLabel = typeof file.episodePosition === 'number' && Number.isFinite(file.episodePosition)
      ? `серия ${String(file.episodePosition).padStart(2, '0')} ${file.episodePosition}`
      : '';
    return `${file.name} ${dub} ${src} ${epLabel}`.toLowerCase();
  }

  function fileMatchesLibTokens(
    file: DownloadLibraryFile,
    group: DownloadLibraryGroup,
    tokens: LibQueryToken[],
    titleBlob: string,
  ): boolean {
    if (!tokens.length) return true;
    const blob = fileSearchBlob(file, group);
    return tokens.every((t) => {
      if (t.kind === 'episode') {
        return file.episodePosition === t.n;
      }
      return titleBlob.includes(t.value) || blob.includes(t.value);
    });
  }

  function libraryGroupMatchesTokens(
    group: DownloadLibraryGroup,
    tokens: LibQueryToken[],
  ): { match: boolean; fileHits: Record<string, boolean> } {
    const fileHits: Record<string, boolean> = {};
    if (!tokens.length) {
      for (const f of group.files) fileHits[f.path] = true;
      return { match: true, fileHits };
    }

    const titleBlob = `${group.name} ${group.releaseTitle || ''}`.toLowerCase();
    const textTokens = tokens.filter((t): t is Extract<LibQueryToken, { kind: 'text' }> => t.kind === 'text');
    const epTokens = tokens.filter((t): t is Extract<LibQueryToken, { kind: 'episode' }> => t.kind === 'episode');

    const textOk = textTokens.every((t) =>
      titleBlob.includes(t.value)
      || group.files.some((f) => fileSearchBlob(f, group).includes(t.value)),
    );
    if (!textOk) {
      for (const f of group.files) fileHits[f.path] = false;
      return { match: false, fileHits };
    }

    if (epTokens.length === 0) {
      for (const f of group.files) fileHits[f.path] = true;
      return { match: true, fileHits };
    }

    let anyEp = false;
    for (const f of group.files) {
      const hit = fileMatchesLibTokens(f, group, tokens, titleBlob);
      fileHits[f.path] = hit;
      if (hit) anyEp = true;
    }
    return { match: anyEp, fileHits };
  }

  const libQueryTokens = $derived(parseLibQuery(libQuery));
  const libTextNeedles = $derived(
    libQueryTokens.filter((t): t is Extract<LibQueryToken, { kind: 'text' }> => t.kind === 'text').map((t) => t.value),
  );
  const libAllNeedles = $derived(libQueryNeedles(libQueryTokens));

  const filteredLibraryGroups = $derived.by((): RankedLibraryGroup[] => {
    const tokens = parseLibQuery(libQuery);
    const qActive = tokens.length > 0;
    const out: RankedLibraryGroup[] = [];

    for (const g of libraryGroups) {
      let files = g.files.filter((f) => {
        const src = (f.sourceName || g.sourceName || '').trim();
        const dub = (f.dubberName || g.dubberName || '').trim();
        if (libSource && src !== libSource) return false;
        if (libDubber && dub !== libDubber) return false;
        return true;
      });

      if (files.length === 0) continue;

      const base = { ...g, files };
      const { match, fileHits } = libraryGroupMatchesTokens(base, tokens);

      files = [...files].sort((a, b) => {
        if (qActive) {
          const ah = fileHits[a.path] ? 0 : 1;
          const bh = fileHits[b.path] ? 0 : 1;
          if (ah !== bh) return ah - bh;
        }
        const ap = a.episodePosition ?? 9999;
        const bp = b.episodePosition ?? 9999;
        if (ap !== bp) return ap - bp;
        return a.name.localeCompare(b.name, 'ru');
      });

      out.push({ ...g, files, match, fileHits });
    }

    const latest = (g: DownloadLibraryGroup) =>
      g.files.reduce((m, f) => Math.max(m, f.modifiedAt || 0), 0);
    const size = (g: DownloadLibraryGroup) =>
      g.files.reduce((s, f) => s + (f.size || 0), 0);

    const bySort = (a: DownloadLibraryGroup, b: DownloadLibraryGroup) => {
      switch (libSort) {
        case 'date-desc':
          return latest(b) - latest(a);
        case 'date-asc':
          return latest(a) - latest(b);
        case 'size-desc':
          return size(b) - size(a);
        case 'size-asc':
          return size(a) - size(b);
        case 'name':
        default:
          return a.name.localeCompare(b.name, 'ru');
      }
    };

    out.sort((a, b) => {
      if (qActive && a.match !== b.match) return a.match ? -1 : 1;
      return bySort(a, b);
    });

    return out;
  });

  const matchedLibraryGroups = $derived(
    filteredLibraryGroups.filter((g) => g.match),
  );

  const filteredLibraryFileCount = $derived(
    libQuery.trim()
      ? matchedLibraryGroups.reduce(
        (n, g) => n + g.files.filter((f) => g.fileHits[f.path]).length,
        0,
      )
      : filteredLibraryGroups.reduce((n, g) => n + g.files.length, 0),
  );

  const matchedLibraryTitleCount = $derived(
    libQuery.trim() ? matchedLibraryGroups.length : filteredLibraryGroups.length,
  );

  const libFiltersActive = $derived(
    !!libQuery.trim() || !!libSource || !!libDubber || libSort !== 'name',
  );

  const libQueryActive = $derived(!!libQuery.trim());

  const libraryMatchIds = $derived.by(() => {
    const set = new Set<string>();
    for (const g of filteredLibraryGroups) {
      if (g.match) set.add(g.id);
    }
    return set;
  });

  function isUnderMatchedLibraryGroup(id: string): boolean {
    if (!libQueryActive) return false;
    for (const gid of libraryMatchIds) {
      if (id === gid || id.startsWith(`${gid}::`)) return true;
    }
    return false;
  }

  function persistDownloadsView(tab = activeTab) {
    saveViewStateData(DOWNLOADS_VIEW_KEY(), {
      expandedGroups,
      expandedDubs,
      expandedSources,
      tab,
      libQuery,
      libSort,
      libSource,
      libDubber,
    });
  }

  /** По умолчанию свёрнуто; при поиске совпадения (и их вложенность) раскрыты. */
  function isLibraryNodeExpanded(map: Record<string, boolean>, id: string): boolean {
    if (isUnderMatchedLibraryGroup(id)) return true;
    return map[id] === true;
  }

  function isLibraryGroupExpanded(id: string): boolean {
    return isLibraryNodeExpanded(expandedGroups, id);
  }

  function isLibraryDubExpanded(id: string): boolean {
    return isLibraryNodeExpanded(expandedDubs, id);
  }

  function isLibrarySourceExpanded(id: string): boolean {
    return isLibraryNodeExpanded(expandedSources, id);
  }

  function clearLibSort() {
    libSort = 'name';
    persistDownloadsView();
  }

  function clearLibSource() {
    libSource = '';
    persistDownloadsView();
  }

  function clearLibDubber() {
    libDubber = '';
    persistDownloadsView();
  }

  function persistLibFilters() {
    persistDownloadsView();
  }

  const downloadDir = $derived($downloadSettings.directory || '—');
  /** Папки по дискам (диск основной — первым), у каждого — его заполнение. */
  const folderDisks = $derived.by(() => {
    const groups: Array<{ root: string; disk: DownloadDisk | null; folders: DownloadFolder[] }> = [];
    for (const f of $downloadFolders.folders) {
      let g = groups.find((x) => x.root === f.disk);
      if (!g) {
        g = { root: f.disk, disk: $downloadFolders.disks.find((d) => d.root === f.disk) ?? null, folders: [] };
        groups.push(g);
      }
      g.folders.push(f);
    }
    return groups;
  });
  const primaryIsDefault = $derived(
    !$downloadFolders.defaultDirectory || samePathUi($downloadSettings.directory, $downloadFolders.defaultDirectory),
  );

  const tabs = $derived<UiV2TabItem[]>([
    { id: 'library', label: 'Библиотека', badge: libraryFileCount || undefined },
    { id: 'active', label: 'Скачивается', badge: (activeCount + queuedCount) || undefined },
    { id: 'settings', label: 'Настройки' },
  ]);

  function progressPercent(entry: DownloadEntry): number {
    if (entry.status === 'error' || entry.status === 'cancelled') return 100;
    if (entry.status === 'done') return 100;
    if (!entry.total) return entry.received > 0 ? 12 : 0;
    return Math.min(99, Math.round((entry.received / entry.total) * 100));
  }

  function statusLabel(entry: DownloadEntry): string {
    if (entry.status === 'error') return 'Ошибка';
    if (entry.status === 'cancelled') return 'Отменено';
    if (entry.status === 'done') return 'Готово';
    if (entry.status === 'paused') return 'Пауза';
    if (entry.status === 'queued') {
      return entry.received > 0 ? 'Ожидание · продолжение' : 'Ожидание…';
    }
    const pct = progressPercent(entry);
    return pct > 0 ? `${pct}%` : 'Загрузка…';
  }

  function jobLabel(entry: DownloadEntry): string {
    const title = (entry.releaseTitle || '').trim();
    const ep = entry.episodePosition;
    if (title && ep != null && ep > 0) return `${title} · серия ${ep}`;
    if (title) return title;
    return entry.filename;
  }

  /** Живая очередь в порядке main: первая — текущая (как в Steam), дальше «Далее». */
  const liveItems = $derived(activeItems.filter((x) =>
    x.status === 'queued'
    || x.status === 'starting'
    || x.status === 'downloading'
    || x.status === 'paused',
  ));
  const finishedItems = $derived(activeItems.filter((x) =>
    x.status === 'error' || x.status === 'cancelled' || x.status === 'done',
  ));
  const currentItem = $derived(liveItems[0] ?? null);
  const upNextItems = $derived(liveItems.slice(1));
  const totalSpeedBps = $derived(
    liveItems.reduce((n, x) => n + (x.status === 'downloading' ? (x.speedBps ?? 0) : 0), 0),
  );

  /** В строке очереди номер серии первым — длинное название обрежется, а серия останется видна. */
  function rowLabel(entry: DownloadEntry): string {
    const title = (entry.releaseTitle || '').trim() || entry.filename;
    const ep = entry.episodePosition;
    return ep != null && ep > 0 ? `Серия ${ep} · ${title}` : title;
  }

  function heroStatus(entry: DownloadEntry): string {
    if (entry.status === 'paused') return 'Приостановлено';
    if (entry.status === 'starting') return 'Подготовка…';
    if (entry.status === 'queued') return $downloadResumeBlocked ? 'Ждёт конца онлайн-просмотра' : 'В очереди';
    return 'Загрузка';
  }

  // Постеры для карточек очереди (кэш на время жизни экрана)
  let posters = $state<Record<number, string>>({});
  const posterRequested = new Set<number>();
  $effect(() => {
    for (const e of liveItems) {
      const rid = e.releaseId;
      if (rid == null || posterRequested.has(rid) || !window.anixApi?.release?.info) continue;
      posterRequested.add(rid);
      void window.anixApi.release.info(rid, false)
        .then((data) => {
          const rel = data?.release as Record<string, unknown> | undefined;
          const raw = rel ? mapCardData(rel).poster : '';
          if (raw) posters = { ...posters, [rid]: toPosterDisplayUrl(raw, 'cardVertical') };
        })
        .catch(() => {});
    }
  });

  let dragJobId = $state<string | null>(null);
  let dropTargetJobId = $state<string | null>(null);
  let heroDropActive = $state(false);
  let deleteBusy = $state<string | null>(null);

  async function applyReorder(nextIds: string[]) {
    await downloads.reorderEntries([...nextIds, ...finishedItems.map((x) => x.id)]);
  }

  function onJobDragStart(e: DragEvent, id: string) {
    dragJobId = id;
    e.dataTransfer?.setData('text/anix-job', id);
    e.dataTransfer!.effectAllowed = 'move';
  }

  function onDragEnd() {
    dragJobId = null;
    dropTargetJobId = null;
    heroDropActive = false;
  }

  async function onJobDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    const fromJob = e.dataTransfer?.getData('text/anix-job') || dragJobId;
    if (fromJob && fromJob !== targetId) {
      const ids = liveItems.map((x) => x.id);
      const from = ids.indexOf(fromJob);
      const to = ids.indexOf(targetId);
      if (from >= 0 && to >= 0) {
        ids.splice(from, 1);
        ids.splice(to, 0, fromJob);
        await applyReorder(ids);
      }
    }
    onDragEnd();
  }

  /** Бросили серию на текущую загрузку — качать её сейчас, текущая уходит в «Далее». */
  async function onHeroDrop(e: DragEvent) {
    e.preventDefault();
    const fromJob = e.dataTransfer?.getData('text/anix-job') || dragJobId;
    onDragEnd();
    if (fromJob && fromJob !== currentItem?.id) await downloads.startNow(fromJob);
  }

  async function confirmDeleteFile(file: DownloadLibraryFile) {
    if (!confirm(`Удалить файл?\n${file.name}`)) return;
    deleteBusy = file.path;
    try {
      await downloads.deleteLibraryFile(file.path);
    } finally {
      deleteBusy = null;
    }
  }

  async function confirmDeleteGroup(group: DownloadLibraryGroup) {
    if (!confirm(`Удалить весь тайтл «${group.name}» и все серии (${group.files.length})?`)) return;
    deleteBusy = group.id;
    try {
      await downloads.deleteLibraryGroup(group.name);
    } finally {
      deleteBusy = null;
    }
  }

  async function confirmDeleteSource(src: LibrarySourceBucket) {
    if (!confirm(
      `Удалить источник «${src.sourceName}» (${src.dubberName}) и все серии (${src.files.length})?`,
    )) return;
    deleteBusy = src.id;
    try {
      for (const file of src.files) {
        await window.electron?.deleteDownloadFile?.(file.path);
      }
      await downloads.loadLibrary();
    } finally {
      deleteBusy = null;
    }
  }

  function formatBytes(n: number): string {
    if (!n || n <= 0) return '—';
    if (n < 1024) return `${n} Б`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
    if (n < 1024 ** 4) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
    return `${(n / 1024 ** 4).toFixed(2)} ТБ`;
  }

  /** Как formatBytes, но пустая папка — «0 Б», а не прочерк. */
  function formatSize(n: number): string {
    return n > 0 ? formatBytes(n) : '0 Б';
  }

  function formatDate(ts: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function groupSize(group: DownloadLibraryGroup): number {
    return group.files.reduce((s, f) => s + f.size, 0);
  }

  function fileEpisodeLabel(file: DownloadLibraryFile): string {
    if (typeof file.episodePosition === 'number' && Number.isFinite(file.episodePosition)) {
      return `Серия ${String(file.episodePosition).padStart(2, '0')}`;
    }
    return file.name;
  }

  function fileEpisodeFlatLabel(
    file: DownloadLibraryFile,
    dubberName: string,
    sourceName: string,
  ): string {
    return `${dubberName} · ${sourceName} · ${fileEpisodeLabel(file)}`;
  }

  function isFlatLibraryNest(dubbers: LibraryDubberBucket[]): boolean {
    return dubbers.length === 1 && dubbers[0].sources.length === 1;
  }

  function nestLibraryGroup(
    group: DownloadLibraryGroup,
    fileHits?: Record<string, boolean>,
  ): LibraryDubberBucket[] {
    const dubMap = new Map<string, {
      dubberName: string;
      dubberId: number | null;
      sources: Map<string, LibrarySourceBucket>;
    }>();

    for (const file of group.files) {
      const dubberName = (file.dubberName || group.dubberName || 'Озвучка').trim() || 'Озвучка';
      const sourceName = (file.sourceName || group.sourceName || 'Источник').trim() || 'Источник';
      const dubberId = file.dubberId ?? group.dubberId ?? null;
      const sourceId = file.sourceId ?? null;
      const dubKey = `${dubberId ?? 'x'}::${dubberName}`;
      const srcKey = `${sourceId ?? 'x'}::${sourceName}`;

      let dub = dubMap.get(dubKey);
      if (!dub) {
        dub = { dubberName, dubberId, sources: new Map() };
        dubMap.set(dubKey, dub);
      }
      let src = dub.sources.get(srcKey);
      if (!src) {
        src = {
          id: `${group.id}::${dubKey}::${srcKey}`,
          sourceName,
          sourceId,
          dubberName,
          dubberId,
          files: [],
        };
        dub.sources.set(srcKey, src);
      }
      src.files.push(file);
    }

    const sortFiles = (files: DownloadLibraryFile[]) =>
      [...files].sort((a, b) => {
        if (fileHits) {
          const ah = fileHits[a.path] ? 0 : 1;
          const bh = fileHits[b.path] ? 0 : 1;
          if (ah !== bh) return ah - bh;
        }
        const ap = a.episodePosition ?? 9999;
        const bp = b.episodePosition ?? 9999;
        if (ap !== bp) return ap - bp;
        return a.name.localeCompare(b.name, 'ru');
      });

    const out: LibraryDubberBucket[] = [];
    for (const [dubKey, dub] of dubMap) {
      const sources = [...dub.sources.values()].map((s) => ({
        ...s,
        files: sortFiles(s.files),
      }));
      sources.sort((a, b) => {
        if (fileHits) {
          const aHit = a.files.some((f) => fileHits[f.path]) ? 0 : 1;
          const bHit = b.files.some((f) => fileHits[f.path]) ? 0 : 1;
          if (aHit !== bHit) return aHit - bHit;
        }
        return a.sourceName.localeCompare(b.sourceName, 'ru');
      });
      const fileCount = sources.reduce((n, s) => n + s.files.length, 0);
      const size = sources.reduce((n, s) => n + s.files.reduce((x, f) => x + f.size, 0), 0);
      out.push({
        id: `${group.id}::${dubKey}`,
        dubberName: dub.dubberName,
        dubberId: dub.dubberId,
        sources,
        fileCount,
        size,
      });
    }
    out.sort((a, b) => {
      if (fileHits) {
        const aHit = a.sources.some((s) => s.files.some((f) => fileHits[f.path])) ? 0 : 1;
        const bHit = b.sources.some((s) => s.files.some((f) => fileHits[f.path])) ? 0 : 1;
        if (aHit !== bHit) return aHit - bHit;
      }
      return a.dubberName.localeCompare(b.dubberName, 'ru');
    });
    return out;
  }

  function sourceBucketSize(bucket: LibrarySourceBucket): number {
    return bucket.files.reduce((s, f) => s + f.size, 0);
  }

  function toggleExpandedMap(
    current: Record<string, boolean>,
    id: string,
  ): Record<string, boolean> {
    // При поиске узлы визуально открыты — клик пишет предпочтение на будущее
    const storedOpen = current[id] === true;
    return { ...current, [id]: !storedOpen };
  }

  function toggleGroup(id: string) {
    expandedGroups = toggleExpandedMap(expandedGroups, id);
    persistDownloadsView();
  }

  function toggleDub(id: string) {
    expandedDubs = toggleExpandedMap(expandedDubs, id);
    persistDownloadsView();
  }

  function toggleSource(id: string) {
    expandedSources = toggleExpandedMap(expandedSources, id);
    persistDownloadsView();
  }

  function samePathUi(a: string, b: string): boolean {
    const norm = (x: string) => x.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
    return !!a && !!b && norm(a) === norm(b);
  }

  function seriesCountWord(n: number): string {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'тайтл';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'тайтла';
    return 'тайтлов';
  }

  /** Новая основная папка: если в старой что-то скачано — спросить, переносить ли. */
  async function choosePrimary(target?: string) {
    if (folderBusy) return;
    folderMsg = '';
    let dir = target;
    if (!dir) {
      const r = await window.electron?.chooseDownloadFolder?.('Новая папка для загрузок');
      if (!r?.ok || !r.path) return;
      dir = r.path;
    }
    const current = $downloadSettings.directory;
    if (samePathUi(dir, current)) return;
    const info = (await window.electron?.inspectDownloadFolder?.(current)) ?? { titles: 0, files: 0, bytes: 0 };
    // В старой папке пусто — спрашивать нечего, просто переключаемся
    if (info.files === 0) {
      await applyPrimary(dir, 'move');
      return;
    }
    pendingPrimary = { path: dir, ...info };
  }

  async function applyPrimary(dir: string, mode: 'move' | 'keep') {
    pendingPrimary = null;
    folderBusy = true;
    folderMsg = '';
    if (mode === 'move') moveProgress = { done: 0, total: 0 };
    try {
      const res = await downloads.setPrimaryFolder(dir, mode);
      if (!res.ok) {
        folderMsg = res.error === 'no-space'
            ? `На новом диске не хватает места: нужно ${formatSize(res.need ?? 0)}, свободно ${formatSize(res.free ?? 0)}`
          : res.error === 'nested'
            ? 'Новая папка не может лежать внутри старой (и наоборот)'
            : 'Не удалось сменить папку';
      } else if (mode === 'move' && (res.failed ?? 0) > 0) {
        folderMsg = `Перенесено не всё: ${res.failed} файлов остались в старой папке, она осталась в библиотеке`;
      } else if (mode === 'move' && (res.bytes ?? 0) > 0) {
        showToast(`Перенесено ${formatBytes(res.bytes ?? 0)}`);
      }
    } finally {
      folderBusy = false;
      moveProgress = null;
    }
  }

  async function addLibraryFolder() {
    if (folderBusy) return;
    const r = await window.electron?.chooseDownloadFolder?.('Папка с аниме для библиотеки');
    if (!r?.ok || !r.path) return;
    await downloads.addLibraryFolder(r.path);
  }

  function showInFolder(file: DownloadLibraryFile) {
    window.electron?.showDownloadFile?.(file.path);
  }

  function showPlayBlocked(msg: string) {
    playBlockedMsg = msg;
    if (playBlockedTimer) clearTimeout(playBlockedTimer);
    playBlockedTimer = setTimeout(() => {
      playBlockedMsg = '';
      playBlockedTimer = null;
    }, 3200);
  }

  async function playInApp(payload: {
    filePath: string;
    title?: string;
    releaseId?: number | null;
    sourceId?: number | null;
    dubberId?: number | null;
    episodePosition?: number | null;
    sourceName?: string;
    dubberName?: string;
  }) {
    if (getCurrentRoomId()) {
      showPlayBlocked('В комнате нельзя переключиться на скачанные файлы');
      return;
    }
    await window.electron?.playDownloadInApp?.({
      filePath: payload.filePath,
      title: payload.title,
      releaseId: payload.releaseId ?? undefined,
      sourceId: payload.sourceId ?? undefined,
      dubberId: payload.dubberId ?? undefined,
      episodePosition: payload.episodePosition ?? undefined,
      sourceName: payload.sourceName,
      dubberName: payload.dubberName,
    });
  }

  function openRelease(releaseId?: number | null) {
    if (releaseId) navigate(`/release/${releaseId}`);
  }

  async function downloadRestOfSeason(opts: {
    busyId: string;
    releaseId: number;
    sourceId: number;
    dubberId: number;
    releaseTitle: string;
    dubberName: string;
    sourceName: string;
    files: DownloadLibraryFile[];
  }) {
    seasonBusy = opts.busyId;
    try {
      const positions = opts.files
        .map((f) => f.episodePosition)
        .filter((p): p is number => typeof p === 'number');
      const n = await queueMissingEpisodes({
        releaseId: opts.releaseId,
        sourceId: opts.sourceId,
        dubberId: opts.dubberId,
        releaseTitle: opts.releaseTitle,
        dubberName: opts.dubberName,
        sourceName: opts.sourceName,
        existingPositions: positions,
      });
      if (n > 0) {
        activeTab = 'active';
        navigate('/downloads');
      }
    } finally {
      seasonBusy = null;
    }
  }

  function formatEta(sec?: number): string {
    if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
    if (sec < 60) return `~${Math.max(1, Math.round(sec))} с`;
    if (sec < 3600) {
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      return s > 0 ? `~${m} мин ${s} с` : `~${m} мин`;
    }
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m > 0 ? `~${h} ч ${m} мин` : `~${h} ч`;
  }

  function formatSpeed(bps?: number): string {
    if (!bps || bps < 1) return '';
    if (bps < 1024) return `${Math.round(bps)} Б/с`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} КБ/с`;
    return `${(bps / (1024 * 1024)).toFixed(1)} МБ/с`;
  }

  /** Последний включённый лимит — чтобы тумблер возвращал его, а не сбрасывал на дефолт. */
  let lastSpeedLimit = $state(5);
  $effect(() => {
    if ($downloadSettings.speedLimitMBps > 0) lastSpeedLimit = $downloadSettings.speedLimitMBps;
  });

  /** Шаг стрелок: мелкий на малых лимитах, крупный на больших. */
  function stepSpeedLimit(dir: 1 | -1) {
    const cur = $downloadSettings.speedLimitMBps || lastSpeedLimit;
    const step = cur < 5 || (dir < 0 && cur <= 5) ? 0.5 : cur < 20 || (dir < 0 && cur <= 20) ? 1 : 5;
    const next = Math.round((cur + dir * step) * 10) / 10;
    void downloads.saveSettings({ speedLimitMBps: Math.min(1000, Math.max(0.5, next)) });
  }

  function saveSpeedLimit(raw: string) {
    const n = Math.round(Number(String(raw).replace(',', '.')) * 10) / 10;
    void downloads.saveSettings({ speedLimitMBps: Number.isFinite(n) && n > 0 ? Math.min(1000, n) : lastSpeedLimit });
  }

  function onTabChange(id: string) {
    activeTab = id;
    // Размеры папок и свободное место меняются по мере загрузок
    if (id === 'settings') void downloads.loadFolders();
    persistDownloadsView(id);
  }
</script>

<div class="view view-downloads">
  <UiV2Tabs
    {tabs}
    activeId={activeTab}
    onChange={onTabChange}
    class="dl-v2-tabs"
  />

  {#if (!ffmpegAvailable || ffmpegBusy) && activeTab !== 'settings'}
    <div class="dl-v2-banner" role="status" aria-live="polite">
      <div class="dl-v2-banner__icon" aria-hidden="true">{@html iconTriangleAlert(18)}</div>
      <div class="dl-v2-banner__body">
        <p class="dl-v2-banner__title">
          {#if ffmpegBusy}
            Скачивание FFmpeg{#if ffmpegPercent != null} · {ffmpegPercent}%{/if}
          {:else}
            FFmpeg не найден
          {/if}
        </p>
        <p class="dl-v2-banner__text">
          {#if ffmpegBusy}
            Установка продолжается в фоне. Можно оставаться на любой вкладке.
          {:else}
            Нужен для быстрой сборки HLS. Установите во вкладке «Настройки».
          {/if}
        </p>
      </div>
      <UiV2Button
        label="К настройкам"
        size="sm"
        variant="primary"
        onclick={() => onTabChange('settings')}
      />
    </div>
  {/if}

  {#if playBlockedMsg}
    <div class="dl-v2-banner" role="status" aria-live="polite">
      <div class="dl-v2-banner__icon" aria-hidden="true">{@html iconTriangleAlert(18)}</div>
      <div class="dl-v2-banner__body">
        <p class="dl-v2-banner__title">Совместный просмотр</p>
        <p class="dl-v2-banner__text">{playBlockedMsg}</p>
      </div>
    </div>
  {/if}

  {#if activeTab === 'library'}
    <UiV2Card label="Библиотека загрузок" spaced class="dl-v2-card">
      {#if libraryGroups.length === 0}
        <div class="dl-v2-empty">
          <div class="dl-v2-empty__icon" aria-hidden="true">{@html iconFileVideo(36)}</div>
          <p class="dl-v2-empty__title">Пока нет скачанных серий</p>
          <p class="dl-v2-empty__sub">Файлы появятся здесь после завершения загрузки</p>
        </div>
      {:else}
        <div class="dl-v2-lib-toolbar">
          <div class="dl-v2-lib-search">
            <UiV2OutlinedField
              label="Поиск по тайтлу, озвучке, источнику…"
              type="search"
              inputmode="search"
              bind:value={libQuery}
              oninput={() => persistLibFilters()}
              class="dl-v2-lib-search__field"
            />
          </div>
          <div class="dl-v2-lib-filters">
            <div class="dl-v2-lib-filter">
              <div class="dl-v2-lib-filter__label-row">
                <span class="dl-v2-lib-filter__label">Сортировка</span>
                {#if libSort !== 'name'}
                  <button
                    type="button"
                    class="dl-v2-lib-filter__reset"
                    aria-label="Сбросить сортировку"
                    title="Сбросить"
                    onclick={clearLibSort}
                  >
                    {@html iconRotateCcw(12)}
                  </button>
                {/if}
              </div>
              <UiV2Select
                options={librarySortOptions}
                value={libSort}
                onChange={(v) => {
                  libSort = (v || 'name') as LibSort;
                  persistLibFilters();
                }}
              />
            </div>
            <div class="dl-v2-lib-filter">
              <div class="dl-v2-lib-filter__label-row">
                <span class="dl-v2-lib-filter__label">Источник</span>
                {#if libSource}
                  <button
                    type="button"
                    class="dl-v2-lib-filter__reset"
                    aria-label="Сбросить источник"
                    title="Сбросить"
                    onclick={clearLibSource}
                  >
                    {@html iconRotateCcw(12)}
                  </button>
                {/if}
              </div>
              <UiV2Select
                options={librarySourceOptions}
                value={libSource}
                onChange={(v) => {
                  libSource = v || '';
                  persistLibFilters();
                }}
              />
            </div>
            <div class="dl-v2-lib-filter">
              <div class="dl-v2-lib-filter__label-row">
                <span class="dl-v2-lib-filter__label">Озвучка</span>
                {#if libDubber}
                  <button
                    type="button"
                    class="dl-v2-lib-filter__reset"
                    aria-label="Сбросить озвучку"
                    title="Сбросить"
                    onclick={clearLibDubber}
                  >
                    {@html iconRotateCcw(12)}
                  </button>
                {/if}
              </div>
              <UiV2Select
                options={libraryDubberOptions}
                value={libDubber}
                onChange={(v) => {
                  libDubber = v || '';
                  persistLibFilters();
                }}
              />
            </div>
          </div>
          {#if libFiltersActive}
            <p class="dl-v2-lib-hint">
              Найдено {filteredLibraryFileCount}
              из {libraryFileCount}
              · {matchedLibraryTitleCount}
              {matchedLibraryTitleCount === 1 ? 'тайтл' : matchedLibraryTitleCount < 5 ? 'тайтла' : 'тайтлов'}
            </p>
          {/if}
        </div>

        {#if filteredLibraryGroups.length === 0}
          <div class="dl-v2-empty">
            <div class="dl-v2-empty__icon" aria-hidden="true">{@html iconSearch(36)}</div>
            <p class="dl-v2-empty__title">Ничего не найдено</p>
            <p class="dl-v2-empty__sub">Измените фильтры источника или озвучки</p>
          </div>
        {:else}
          <div class="dl-v2-list" role="list">
            {#each filteredLibraryGroups as group (group.id)}
              {@const dubbers = nestLibraryGroup(group, group.fileHits)}
              {@const flat = isFlatLibraryNest(dubbers)}
              {@const flatSrc = flat ? dubbers[0].sources[0] : null}
              {@const hasPartialFileHits = libQueryActive && group.match && group.files.some((f) => group.fileHits[f.path]) && group.files.some((f) => !group.fileHits[f.path])}
              <div
                class="dl-v2-group"
                class:dl-v2-group--dim={libQueryActive && !group.match}
                role="listitem"
                animate:libraryFlip
              >
                <div class="dl-v2-group__head">
                  <button
                    type="button"
                    class="dl-v2-group__toggle"
                    onclick={() => toggleGroup(group.id)}
                    aria-expanded={isLibraryGroupExpanded(group.id)}
                  >
                    <span class="dl-v2-group__chevron" class:dl-v2-group__chevron--open={isLibraryGroupExpanded(group.id)} aria-hidden="true">
                      {@html iconChevronRight(16)}
                    </span>
                    <span class="dl-v2-group__folder" aria-hidden="true">{@html iconFolder(16)}</span>
                    <span class="dl-v2-group__name">
                      {#if libQueryActive && group.match && libTextNeedles.length}
                        {#each highlightParts(group.name, libTextNeedles) as part, i (`n-${i}`)}
                          {#if part.hit}<mark class="dl-v2-hit">{part.text}</mark>{:else}{part.text}{/if}
                        {/each}
                      {:else}
                        {group.name}
                      {/if}
                    </span>
                    <span class="dl-v2-group__meta">
                      {group.files.length} · {formatBytes(groupSize(group))}
                    </span>
                  </button>
                  <div class="dl-v2-group__actions">
                    {#if group.releaseId}
                      <UiV2RoundButton
                        label="Страница тайтла"
                        size="sm"
                        title="Страница тайтла"
                        onclick={() => openRelease(group.releaseId)}
                      >
                        {@html iconFilm(14)}
                      </UiV2RoundButton>
                    {/if}
                    {#if flatSrc && group.releaseId && flatSrc.sourceId && flatSrc.dubberId}
                      <UiV2RoundButton
                        label="Докачать остальные серии"
                        size="sm"
                        title="Докачать остальные серии"
                        disabled={seasonBusy === flatSrc.id || deleteBusy === group.id}
                        onclick={() => void downloadRestOfSeason({
                          busyId: flatSrc.id,
                          releaseId: group.releaseId!,
                          sourceId: flatSrc.sourceId!,
                          dubberId: flatSrc.dubberId!,
                          releaseTitle: group.releaseTitle || group.name,
                          dubberName: flatSrc.dubberName,
                          sourceName: flatSrc.sourceName,
                          files: flatSrc.files,
                        })}
                      >
                        {@html iconDownload(14)}
                      </UiV2RoundButton>
                    {/if}
                    <UiV2RoundButton
                      label="Удалить тайтл"
                      size="sm"
                      title="Удалить тайтл"
                      disabled={deleteBusy === group.id}
                      onclick={() => void confirmDeleteGroup(group)}
                    >
                      {@html iconTrash2(14)}
                    </UiV2RoundButton>
                  </div>
                </div>

                {#if isLibraryGroupExpanded(group.id)}
                  <div class="dl-v2-tree" class:dl-v2-tree--flat={flat}>
                    {#if flat && flatSrc}
                      <ul class="dl-v2-files">
                        {#each flatSrc.files as file (file.path)}
                          <li
                            class="dl-v2-file"
                            class:dl-v2-file--dim={hasPartialFileHits && !group.fileHits[file.path]}
                            animate:libraryFlip
                          >
                            <button
                              type="button"
                              class="dl-v2-file__hit"
                              title={fileEpisodeFlatLabel(file, flatSrc.dubberName, flatSrc.sourceName)}
                              onclick={() => void playInApp({
                                filePath: file.path,
                                title: group.releaseTitle || group.name,
                                releaseId: group.releaseId,
                                sourceId: file.sourceId ?? flatSrc.sourceId,
                                dubberId: file.dubberId ?? flatSrc.dubberId,
                                episodePosition: file.episodePosition,
                                sourceName: file.sourceName || flatSrc.sourceName,
                                dubberName: file.dubberName || flatSrc.dubberName,
                              })}
                            >
                              <span class="dl-v2-file__icon" aria-hidden="true">{@html iconFileVideo(15)}</span>
                              <span class="dl-v2-file__main">
                                <span class="dl-v2-file__name">
                                  {#if libQueryActive && group.match && group.fileHits[file.path] && libAllNeedles.length}
                                    {#each highlightParts(
                                      fileEpisodeFlatLabel(file, flatSrc.dubberName, flatSrc.sourceName),
                                      libAllNeedles,
                                    ) as part, i (`f-${i}`)}
                                      {#if part.hit}<mark class="dl-v2-hit">{part.text}</mark>{:else}{part.text}{/if}
                                    {/each}
                                  {:else}
                                    {fileEpisodeFlatLabel(file, flatSrc.dubberName, flatSrc.sourceName)}
                                  {/if}
                                </span>
                                <span class="dl-v2-file__meta">
                                  {formatBytes(file.size)} · {formatDate(file.modifiedAt)}
                                </span>
                              </span>
                            </button>
                            <div class="dl-v2-file__actions">
                              <UiV2RoundButton
                                label="Показать в папке"
                                size="sm"
                                title="Показать в папке"
                                onclick={() => showInFolder(file)}
                              >
                                {@html iconFolder(14)}
                              </UiV2RoundButton>
                              <UiV2RoundButton
                                label="Удалить"
                                size="sm"
                                title="Удалить"
                                disabled={deleteBusy === file.path}
                                onclick={() => void confirmDeleteFile(file)}
                              >
                                {@html iconTrash2(14)}
                              </UiV2RoundButton>
                            </div>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      {#each dubbers as dub (dub.id)}
                        <section class="dl-v2-dub">
                          <div class="dl-v2-dub__head">
                            <button
                              type="button"
                              class="dl-v2-dub__toggle"
                              onclick={() => toggleDub(dub.id)}
                              aria-expanded={isLibraryDubExpanded(dub.id)}
                            >
                              <span
                                class="dl-v2-group__chevron"
                                class:dl-v2-group__chevron--open={isLibraryDubExpanded(dub.id)}
                                aria-hidden="true"
                              >
                                {@html iconChevronRight(14)}
                              </span>
                              <span class="dl-v2-dub__icon" aria-hidden="true">{@html iconMic(14)}</span>
                              <span class="dl-v2-dub__name">{dub.dubberName}</span>
                              <span class="dl-v2-dub__meta">
                                {dub.fileCount} · {formatBytes(dub.size)}
                              </span>
                            </button>
                          </div>

                          {#if isLibraryDubExpanded(dub.id)}
                            {#each dub.sources as src (src.id)}
                              <div class="dl-v2-src">
                                <div class="dl-v2-src__head">
                                  <button
                                    type="button"
                                    class="dl-v2-src__toggle"
                                    onclick={() => toggleSource(src.id)}
                                    aria-expanded={isLibrarySourceExpanded(src.id)}
                                  >
                                    <span
                                      class="dl-v2-group__chevron"
                                      class:dl-v2-group__chevron--open={isLibrarySourceExpanded(src.id)}
                                      aria-hidden="true"
                                    >
                                      {@html iconChevronRight(14)}
                                    </span>
                                    <span class="dl-v2-src__name">{src.sourceName}</span>
                                    <span class="dl-v2-src__meta">
                                      {src.files.length} · {formatBytes(sourceBucketSize(src))}
                                    </span>
                                  </button>
                                  <div class="dl-v2-src__actions">
                                    {#if group.releaseId && src.sourceId && src.dubberId}
                                      <UiV2RoundButton
                                        label="Докачать остальные серии"
                                        size="sm"
                                        title="Докачать остальные серии этого источника"
                                        disabled={seasonBusy === src.id || deleteBusy === src.id}
                                        onclick={() => void downloadRestOfSeason({
                                          busyId: src.id,
                                          releaseId: group.releaseId!,
                                          sourceId: src.sourceId!,
                                          dubberId: src.dubberId!,
                                          releaseTitle: group.releaseTitle || group.name,
                                          dubberName: src.dubberName,
                                          sourceName: src.sourceName,
                                          files: src.files,
                                        })}
                                      >
                                        {@html iconDownload(14)}
                                      </UiV2RoundButton>
                                    {/if}
                                    <UiV2RoundButton
                                      label="Удалить источник"
                                      size="sm"
                                      title="Удалить все серии этого источника"
                                      disabled={deleteBusy === src.id || seasonBusy === src.id}
                                      onclick={() => void confirmDeleteSource(src)}
                                    >
                                      {@html iconTrash2(14)}
                                    </UiV2RoundButton>
                                  </div>
                                </div>

                                {#if isLibrarySourceExpanded(src.id)}
                                  <ul class="dl-v2-files">
                                    {#each src.files as file (file.path)}
                                      <li
                                        class="dl-v2-file"
                                        class:dl-v2-file--dim={hasPartialFileHits && !group.fileHits[file.path]}
                                        animate:libraryFlip
                                      >
                                        <button
                                          type="button"
                                          class="dl-v2-file__hit"
                                          title={file.name}
                                          onclick={() => void playInApp({
                                            filePath: file.path,
                                            title: group.releaseTitle || group.name,
                                            releaseId: group.releaseId,
                                            sourceId: file.sourceId ?? src.sourceId,
                                            dubberId: file.dubberId ?? src.dubberId,
                                            episodePosition: file.episodePosition,
                                            sourceName: file.sourceName || src.sourceName,
                                            dubberName: file.dubberName || src.dubberName,
                                          })}
                                        >
                                          <span class="dl-v2-file__icon" aria-hidden="true">{@html iconFileVideo(15)}</span>
                                          <span class="dl-v2-file__main">
                                            <span class="dl-v2-file__name">
                                              {#if libQueryActive && group.match && group.fileHits[file.path] && libAllNeedles.length}
                                                {#each highlightParts(fileEpisodeLabel(file), libAllNeedles) as part, i (`nf-${i}`)}
                                                  {#if part.hit}<mark class="dl-v2-hit">{part.text}</mark>{:else}{part.text}{/if}
                                                {/each}
                                              {:else}
                                                {fileEpisodeLabel(file)}
                                              {/if}
                                            </span>
                                            <span class="dl-v2-file__meta">
                                              {formatBytes(file.size)} · {formatDate(file.modifiedAt)}
                                            </span>
                                          </span>
                                        </button>
                                        <div class="dl-v2-file__actions">
                                          <UiV2RoundButton
                                            label="Показать в папке"
                                            size="sm"
                                            title="Показать в папке"
                                            onclick={() => showInFolder(file)}
                                          >
                                            {@html iconFolder(14)}
                                          </UiV2RoundButton>
                                          <UiV2RoundButton
                                            label="Удалить"
                                            size="sm"
                                            title="Удалить"
                                            disabled={deleteBusy === file.path}
                                            onclick={() => void confirmDeleteFile(file)}
                                          >
                                            {@html iconTrash2(14)}
                                          </UiV2RoundButton>
                                        </div>
                                      </li>
                                    {/each}
                                  </ul>
                                {/if}
                              </div>
                            {/each}
                          {/if}
                        </section>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </UiV2Card>
  {:else if activeTab === 'active'}
    <div class="dl-steam">
      <div class="dl-v2-toolbar">
        {#if canPauseAll}
          <UiV2Button label="Пауза всем" size="sm" variant="chrome" onclick={() => void downloads.pauseAllActive()}>
            {#snippet icon()}{@html iconPause(14)}{/snippet}
          </UiV2Button>
        {/if}
        {#if pausedCount > 0}
          <UiV2Button
            label="Продолжить всё"
            size="sm"
            variant="chrome"
            disabled={$downloadResumeBlocked}
            onclick={() => void downloads.resumeAllActive()}
          >
            {#snippet icon()}{@html iconPlay(14)}{/snippet}
          </UiV2Button>
        {/if}
        {#if liveItems.length > 0}
          <UiV2Button label="Остановить все" size="sm" variant="danger" onclick={() => void downloads.cancelAllActive()} />
        {/if}
        <span class="dl-steam__toolbar-spacer"></span>
        <UiV2Button label="Обновить библиотеку" size="sm" variant="ghost" onclick={() => void downloads.loadLibrary()}>
          {#snippet icon()}{@html iconRefreshCw(14)}{/snippet}
        </UiV2Button>
      </div>

      {#if $downloadResumeBlocked}
        <p class="dl-v2-stream-hold" role="status">
          Онлайн-просмотр: загрузки на паузе. Продолжить можно после закрытия плеера или при локальном файле.
        </p>
      {/if}

      {#if liveItems.length === 0 && finishedItems.length === 0}
        <div class="dl-v2-empty">
          <div class="dl-v2-empty__icon" aria-hidden="true">{@html iconDownload(36)}</div>
          <p class="dl-v2-empty__title">Нет активных загрузок</p>
          <p class="dl-v2-empty__sub">Запустите скачивание из окна выбора серий</p>
        </div>
      {/if}

      {#if currentItem}
        {@const cur = currentItem}
        {@const pct = progressPercent(cur)}
        {@const poster = cur.releaseId != null ? posters[cur.releaseId] : ''}
        <UiV2Card title="Сейчас" class="dl-v2-card">
          <div
            class="dl-steam__current dl-steam__current--{cur.status}"
            class:dl-steam__current--drop={heroDropActive}
            role="group"
            aria-label="Текущая загрузка"
            ondragover={(e) => {
              if (!dragJobId || dragJobId === cur.id) return;
              e.preventDefault();
              heroDropActive = true;
            }}
            ondragleave={() => (heroDropActive = false)}
            ondrop={(e) => void onHeroDrop(e)}
          >
            <span class="dl-steam__poster" style={poster ? `background-image:url(${poster})` : ''}>
              {#if !poster}{@html iconFilm(20)}{/if}
            </span>
            <div class="dl-steam__current-info">
              {#if cur.releaseId}
                <button type="button" class="dl-steam__row-title dl-steam__row-title--link dl-steam__current-title" onclick={() => openRelease(cur.releaseId)}>
                  {cur.releaseTitle || cur.filename}
                </button>
              {:else}
                <span class="dl-steam__row-title dl-steam__current-title">{cur.releaseTitle || cur.filename}</span>
              {/if}
              <span class="dl-steam__row-meta">
                {[cur.episodePosition != null ? `Серия ${cur.episodePosition}` : '', cur.dubberName, cur.sourceName].filter(Boolean).join(' · ')}
              </span>
              <div class="dl-steam__progress-row">
                <span>{heroStatus(cur)}</span>
                <span class="dl-steam__progress-nums">
                  {formatBytes(cur.received)}{#if cur.total > 0}&nbsp;/ {formatBytes(cur.total)}{/if}{#if cur.status === 'downloading' && formatSpeed(totalSpeedBps)}&nbsp;· {formatSpeed(totalSpeedBps)}{/if}{#if cur.status === 'downloading' && formatEta(cur.etaSec)}&nbsp;· осталось {formatEta(cur.etaSec)}{/if}{#if $downloadSettings.speedLimitMBps > 0}&nbsp;· лимит {$downloadSettings.speedLimitMBps} МБ/с{/if}
                  · {pct}%
                </span>
              </div>
              <div class="dl-steam__track" aria-hidden="true"><div class="dl-steam__fill" style="width:{pct}%"></div></div>
              {#if cur.status === 'paused' && upNextItems.length > 0}
                <p class="dl-steam__hint">Очередь ждёт эту серию. Продолжите её или перетащите сюда другую.</p>
              {/if}
            </div>
            <div class="dl-steam__row-actions">
              {#if cur.status === 'paused'}
                <UiV2RoundButton label="Продолжить" disabled={$downloadResumeBlocked} onclick={() => void downloads.resumeEntry(cur.id)}>
                  {@html iconPlay(16)}
                </UiV2RoundButton>
              {:else}
                <UiV2RoundButton label="Пауза" onclick={() => void downloads.pauseEntry(cur.id)}>
                  {@html iconPause(16)}
                </UiV2RoundButton>
              {/if}
              <UiV2RoundButton label="Остановить" onclick={() => void downloads.cancelEntry(cur.id)}>
                {@html iconX(16)}
              </UiV2RoundButton>
            </div>
          </div>
        </UiV2Card>
      {/if}

      {#if upNextItems.length > 0}
        <UiV2Card title="Далее" pill={String(upNextItems.length)} class="dl-v2-card">
          <div class="dl-steam__list" role="list">
            {#each upNextItems as entry (entry.id)}
              {@const pct = progressPercent(entry)}
              {@const poster = entry.releaseId != null ? posters[entry.releaseId] : ''}
              <div
                class="dl-steam__row dl-steam__row--{entry.status}"
                class:dl-steam__row--dragging={dragJobId === entry.id}
                class:dl-steam__row--drop={dropTargetJobId === entry.id}
                role="listitem"
                draggable="true"
                ondragstart={(e) => onJobDragStart(e, entry.id)}
                ondragend={onDragEnd}
                ondragover={(e) => {
                  if (!dragJobId || dragJobId === entry.id) return;
                  e.preventDefault();
                  dropTargetJobId = entry.id;
                }}
                ondrop={(e) => void onJobDrop(e, entry.id)}
              >
                <span class="dl-steam__grip" aria-hidden="true">{@html iconGripVertical(14)}</span>
                <span class="dl-steam__thumb" style={poster ? `background-image:url(${poster})` : ''}>
                  {#if !poster}{@html iconFilm(16)}{/if}
                </span>
                <div class="dl-steam__row-info">
                  <span class="dl-steam__row-title">{rowLabel(entry)}</span>
                  <span class="dl-steam__row-meta">
                    {[entry.dubberName, entry.sourceName].filter(Boolean).join(' · ')}{#if entry.total > 0}&nbsp;· {formatBytes(entry.received)} / {formatBytes(entry.total)}{:else if entry.received > 0}&nbsp;· {formatBytes(entry.received)}{/if}{#if entry.status === 'downloading' && formatSpeed(entry.speedBps)}&nbsp;· {formatSpeed(entry.speedBps)}{/if}
                  </span>
                  {#if entry.received > 0 || entry.status === 'downloading'}
                    <div class="dl-steam__mini-track" aria-hidden="true"><div class="dl-steam__fill" style="width:{pct}%"></div></div>
                  {/if}
                </div>
                <span class="dl-steam__row-status">{entry.status === 'paused' ? 'Пауза' : entry.status === 'downloading' ? `${pct}%` : 'Далее'}</span>
                <div class="dl-steam__row-actions">
                  <UiV2RoundButton label="Скачать сейчас" size="sm" disabled={$downloadResumeBlocked} onclick={() => void downloads.startNow(entry.id)}>
                    {@html iconDownload(14)}
                  </UiV2RoundButton>
                  {#if entry.status !== 'paused'}
                    <UiV2RoundButton label="Пауза" size="sm" onclick={() => void downloads.pauseEntry(entry.id)}>
                      {@html iconPause(14)}
                    </UiV2RoundButton>
                  {/if}
                  <UiV2RoundButton label="Убрать из очереди" size="sm" onclick={() => void downloads.cancelEntry(entry.id)}>
                    {@html iconX(14)}
                  </UiV2RoundButton>
                </div>
              </div>
            {/each}
          </div>
          <p class="dl-steam__hint">Перетащите серию в «Сейчас», чтобы скачивать её первой.</p>
        </UiV2Card>
      {/if}

      {#if finishedItems.length > 0}
        <UiV2Card title="Завершённые" pill={String(finishedItems.length)} class="dl-v2-card">
          {#if errorCount > 0}
            <div class="dl-v2-toolbar">
              <UiV2Button label="Очистить ошибки" size="sm" variant="ghost" onclick={() => downloads.clearErrors()} />
            </div>
          {/if}
          <div class="dl-steam__list" role="list">
            {#each finishedItems as entry (entry.id)}
              <div class="dl-steam__row dl-steam__row--{entry.status}" role="listitem">
                <span class="dl-steam__row-icon" aria-hidden="true">
                  {#if entry.status === 'done'}{@html iconDownload(16)}{:else}{@html iconTriangleAlert(16)}{/if}
                </span>
                <div class="dl-steam__row-info">
                  {#if entry.releaseId}
                    <button type="button" class="dl-steam__row-title dl-steam__row-title--link" onclick={() => openRelease(entry.releaseId)}>{rowLabel(entry)}</button>
                  {:else}
                    <span class="dl-steam__row-title">{rowLabel(entry)}</span>
                  {/if}
                  <span class="dl-steam__row-meta">
                    {[entry.dubberName, entry.sourceName, statusLabel(entry)].filter(Boolean).join(' · ')}
                  </span>
                  {#if (entry.status === 'error' || entry.status === 'cancelled') && entry.error}
                    <p class="dl-v2-job__error">{formatDownloadErrorMessage(entry.error)}</p>
                  {/if}
                </div>
                <div class="dl-steam__row-actions">
                  {#if entry.status === 'error' && entry.filePath && canRetry}
                    <UiV2RoundButton label="Повторить" size="sm" disabled={$downloadResumeBlocked} onclick={() => void downloads.retryEntry(entry.id)}>
                      {@html iconRotateCw(14)}
                    </UiV2RoundButton>
                  {/if}
                  <UiV2RoundButton label="Убрать из списка" size="sm" onclick={() => void downloads.removeEntry(entry.id)}>
                    {@html iconTrash2(14)}
                  </UiV2RoundButton>
                </div>
              </div>
            {/each}
          </div>
        </UiV2Card>
      {/if}
    </div>
  {:else}
    <div class="dl-v2-settings">
      <UiV2Card title="Папки" spaced class="dl-v2-card">
        {#if folderDisks.length === 0}
          <div class="dl-v2-path">
            <span class="dl-v2-path__icon" aria-hidden="true">{@html iconFolder(16)}</span>
            <span class="dl-v2-path__text">{downloadDir}</span>
          </div>
        {/if}
        <div class="dl-v2-disks">
          {#each folderDisks as g (g.root)}
            <section class="dl-v2-disk">
              <div class="dl-v2-disk__head">
                <span class="dl-v2-disk__name">Диск {g.root.replace(/[\\/]+$/, '') || g.root}</span>
                {#if g.disk}
                  <span class="dl-v2-disk__free">свободно {formatSize(g.disk.free)} из {formatSize(g.disk.total)}</span>
                {:else}
                  <span class="dl-v2-disk__free">недоступен</span>
                {/if}
              </div>
              {#if g.disk}
                {@const d = g.disk}
                {@const other = Math.max(0, d.total - d.free - d.anime)}
                {@const pct = (n: number) => (d.total > 0 ? (n / d.total) * 100 : 0)}
                <div class="dl-v2-disk__bar" aria-hidden="true">
                  <span class="dl-v2-disk__seg dl-v2-disk__seg--anime" style="width:max({pct(d.anime)}%, {d.anime > 0 ? 3 : 0}px)"></span>
                  <span class="dl-v2-disk__seg dl-v2-disk__seg--other" style="width:{pct(other)}%"></span>
                </div>
                <div class="dl-v2-disk__legend">
                  <span><i class="dl-v2-disk__dot dl-v2-disk__dot--anime"></i>Аниме {formatSize(d.anime)}</span>
                  <span><i class="dl-v2-disk__dot dl-v2-disk__dot--other"></i>Система и программы {formatSize(other)}</span>
                  <span><i class="dl-v2-disk__dot"></i>Свободно {formatSize(d.free)}</span>
                </div>
              {/if}
              <div class="dl-v2-folders">
                {#each g.folders as f (f.path)}
                  <div class="dl-v2-folder" class:dl-v2-folder--primary={f.primary} class:dl-v2-folder--missing={!f.exists}>
                    <span class="dl-v2-path__icon" aria-hidden="true">{@html iconFolder(16)}</span>
                    <div class="dl-v2-folder__info">
                      <span class="dl-v2-folder__path">{f.path}</span>
                      {#if f.primary && moveProgress}
                        {@const movePct = moveProgress.total > 0 ? Math.round((moveProgress.done / moveProgress.total) * 100) : 0}
                        <span class="dl-v2-folder__meta" role="status">
                          Перенос… {formatSize(moveProgress.done)} из {formatSize(moveProgress.total)} · {movePct}%
                        </span>
                        <div class="dl-steam__mini-track" aria-hidden="true"><div class="dl-steam__fill" style="width:{movePct}%"></div></div>
                      {:else}
                        <span class="dl-v2-folder__meta">
                          {#if !f.exists}Папка недоступна — диск отключён или папку удалили
                          {:else if f.primary}Сюда скачиваются новые серии · {formatSize(f.bytes)}
                          {:else}Только для библиотеки · {formatSize(f.bytes)}{/if}
                        </span>
                      {/if}
                    </div>
                    {#if f.primary}
                      <span class="dl-v2-folder__badge">Основная</span>
                      {#if !primaryIsDefault}
                        <UiV2Button label="По умолчанию" size="sm" variant="ghost" disabled={folderBusy} onclick={() => void choosePrimary($downloadFolders.defaultDirectory)} />
                      {/if}
                      <UiV2Button label="Переместить" size="sm" variant="chrome" disabled={folderBusy} onclick={() => void choosePrimary()} />
                    {:else}
                      <UiV2Button label="Сделать основной" size="sm" variant="ghost" disabled={folderBusy || !f.exists} onclick={() => void applyPrimary(f.path, 'keep')} />
                    {/if}
                    <UiV2RoundButton label="Открыть папку" size="sm" disabled={!f.exists} onclick={() => void window.electron?.openDownloadDirectory?.(f.path)}>
                      {@html iconFolder(14)}
                    </UiV2RoundButton>
                    {#if !f.primary}
                      <UiV2RoundButton label="Убрать из библиотеки" size="sm" disabled={folderBusy} onclick={() => void downloads.removeLibraryFolder(f.path)}>
                        {@html iconX(14)}
                      </UiV2RoundButton>
                    {/if}
                  </div>
                {/each}
              </div>
            </section>
          {/each}
        </div>

        <button type="button" class="dl-v2-folder-add" disabled={folderBusy} onclick={() => void addLibraryFolder()}>
          {@html iconPlus(16)}
          <span>Добавить папку</span>
        </button>
        {#if folderMsg}
          <p class="dl-v2-folder-msg" role="alert">{folderMsg}</p>
        {/if}
        <p class="dl-v2-folders-note">
          Новые серии скачиваются в основную папку. Остальные только показываются в библиотеке — файлы в них не трогаются.
        </p>
      </UiV2Card>

      <UiV2Card title="Скачивание" spaced class="dl-v2-card">
        <div class="dl-v2-pref">
          <div class="dl-v2-pref__info">
            <div class="dl-v2-pref__label">Папки по тайтлам</div>
            <div class="dl-v2-pref__desc">
              {#if $downloadSettings.organizeByTitle}
                Вкл: у каждого тайтла своя папка — «Тайтл / Озвучка / Источник / Название 01.mp4»
              {:else}
                Выкл: все серии лежат прямо в папке загрузок, без подпапок — «Название 01.mp4»
              {/if}
            </div>
          </div>
          <label class="dl-v2-switch" aria-label="Папки по тайтлам">
            <input
              type="checkbox"
              checked={$downloadSettings.organizeByTitle}
              onchange={(e) => void downloads.saveSettings({
                organizeByTitle: (e.currentTarget as HTMLInputElement).checked,
              })}
            />
            <span class="dl-v2-switch__track" aria-hidden="true">
              <span class="dl-v2-switch__thumb"></span>
            </span>
          </label>
        </div>

        <div class="dl-v2-pref">
          <div class="dl-v2-pref__info">
            <div class="dl-v2-pref__label">Скачивать всё сразу</div>
            <div class="dl-v2-pref__desc">
              Выкл — по очереди (1 файл, быстрее). Вкл — все файлы параллельно
            </div>
          </div>
          <label class="dl-v2-switch" aria-label="Скачивать всё сразу">
            <input
              type="checkbox"
              checked={$downloadSettings.allAtOnce}
              onchange={(e) => void downloads.saveSettings({
                allAtOnce: (e.currentTarget as HTMLInputElement).checked,
              })}
            />
            <span class="dl-v2-switch__track" aria-hidden="true">
              <span class="dl-v2-switch__thumb"></span>
            </span>
          </label>
        </div>

        <div class="dl-v2-pref">
          <div class="dl-v2-pref__info">
            <div class="dl-v2-pref__label">Ограничить скорость</div>
            <div class="dl-v2-pref__desc">
              {#if $downloadSettings.speedLimitMBps > 0}
                Все загрузки вместе — не быстрее {$downloadSettings.speedLimitMBps} МБ/с, чтобы не забивать интернет
              {:else}
                Без ограничений — качать на полной скорости
              {/if}
            </div>
          </div>
          {#if $downloadSettings.speedLimitMBps > 0}
            <div class="dl-v2-speed">
              <div class="dl-v2-speed__field">
                <input
                  type="text"
                  inputmode="decimal"
                  aria-label="Лимит скорости, МБ/с"
                  value={$downloadSettings.speedLimitMBps}
                  onchange={(e) => saveSpeedLimit((e.currentTarget as HTMLInputElement).value)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                    else if (e.key === 'ArrowUp') { e.preventDefault(); stepSpeedLimit(1); }
                    else if (e.key === 'ArrowDown') { e.preventDefault(); stepSpeedLimit(-1); }
                  }}
                />
                <div class="dl-v2-speed__arrows">
                  <button type="button" tabindex="-1" aria-label="Больше" onclick={() => stepSpeedLimit(1)}>{@html iconChevronUp(12)}</button>
                  <button type="button" tabindex="-1" aria-label="Меньше" disabled={$downloadSettings.speedLimitMBps <= 0.5} onclick={() => stepSpeedLimit(-1)}>{@html iconChevronDown(12)}</button>
                </div>
              </div>
              <span>МБ/с</span>
            </div>
          {/if}
          <label class="dl-v2-switch" aria-label="Ограничить скорость">
            <input
              type="checkbox"
              checked={$downloadSettings.speedLimitMBps > 0}
              onchange={(e) => void downloads.saveSettings({
                speedLimitMBps: (e.currentTarget as HTMLInputElement).checked ? lastSpeedLimit : 0,
              })}
            />
            <span class="dl-v2-switch__track" aria-hidden="true">
              <span class="dl-v2-switch__thumb"></span>
            </span>
          </label>
        </div>

        <div class="dl-v2-pref">
          <div class="dl-v2-pref__info">
            <div class="dl-v2-pref__label">Убирать завершённые</div>
            <div class="dl-v2-pref__desc">Готовые файлы исчезают из «Скачивается» через несколько секунд</div>
          </div>
          <label class="dl-v2-switch" aria-label="Убирать завершённые">
            <input
              type="checkbox"
              checked={$downloadSettings.autoClearFinished}
              onchange={(e) => void downloads.saveSettings({
                autoClearFinished: (e.currentTarget as HTMLInputElement).checked,
              })}
            />
            <span class="dl-v2-switch__track" aria-hidden="true">
              <span class="dl-v2-switch__thumb"></span>
            </span>
          </label>
        </div>
      </UiV2Card>

      <UiV2Card
        title="FFmpeg"
        pill={ffmpegAvailable ? 'OK' : 'Нет'}
        spaced
        class="dl-v2-card"
      >
        {#if ffmpegAvailable}
          <p class="dl-v2-ffmpeg-ok">
            Установлен{#if ffmpegSource} · {ffmpegSource}{/if}
          </p>
          {#if ffmpegPath}
            <p class="dl-v2-ffmpeg-path" title={ffmpegPath}>{ffmpegPath}</p>
          {/if}
        {:else}
          <p class="dl-v2-ffmpeg-warn">
            Без FFmpeg часть HLS-источников не соберётся в MP4.
          </p>
        {/if}

        {#if ffmpegMsg}
          <p class="dl-v2-ffmpeg-msg">{ffmpegMsg}</p>
        {/if}
        {#if ffmpegBusy}
          <p class="dl-v2-ffmpeg-msg">
            Скачивание…
            {#if ffmpegPercent != null}
              {ffmpegPercent}%
            {/if}
          </p>
          <div
            class="dl-v2-ffmpeg-track"
            class:dl-v2-ffmpeg-track--indeterminate={ffmpegPercent == null}
            aria-hidden="true"
          >
            <div
              class="dl-v2-ffmpeg-fill"
              style={ffmpegPercent != null ? `width:${ffmpegPercent}%` : undefined}
            ></div>
          </div>
        {/if}

        <div class="dl-v2-row-actions">
          {#if !ffmpegAvailable || ffmpegBusy}
            <UiV2Button
              label={ffmpegBusy ? 'Скачивание…' : 'Скачать FFmpeg'}
              size="sm"
              variant="primary"
              disabled={ffmpegBusy}
              onclick={() => void ffmpegInstall.install()}
            />
          {/if}
          <UiV2Button
            label="Сайт FFmpeg"
            size="sm"
            variant="ghost"
            disabled={ffmpegBusy}
            onclick={() => void window.electron?.openFfmpegPage?.()}
          />
          <UiV2Button
            label="Проверить"
            size="sm"
            variant="ghost"
            disabled={ffmpegBusy}
            onclick={() => void ffmpegInstall.refreshStatus()}
          />
        </div>
      </UiV2Card>
    </div>
  {/if}
  {#if pendingPrimary}
    {@const pp = pendingPrimary}
    <UiV2ChoiceSheet
      title="Сменить папку загрузок?"
      value=""
      options={[
        {
          value: 'move',
          label: 'Перенести всё в новую папку',
          description: `${pp.titles} ${seriesCountWord(pp.titles)} (${formatSize(pp.bytes)}) переедут в ${pp.path}. Старая папка освободится.`,
        },
        {
          value: 'keep',
          label: 'Оставить в старой папке',
          description: 'Новые серии будут скачиваться в новую папку, а старая останется в библиотеке.',
        },
      ]}
      onSelect={(v) => void applyPrimary(pp.path, v === 'move' ? 'move' : 'keep')}
      onClose={() => (pendingPrimary = null)}
    />
  {/if}
</div>
