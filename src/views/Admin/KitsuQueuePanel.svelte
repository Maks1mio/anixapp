<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { uiv2CustomScroll } from '../../actions/uiv2CustomScroll';
  import { getAnixbackDirectOrigin, getApiBase, getAnixbackUploadsOrigin } from '../../services/anixback-endpoint';
  import { getAdminToken } from '../../stores/admin';

  interface KitsuJob {
    id: number;
    anixart_id: number;
    title_en: string;
    kitsu_id: string | null;
    status: 'pending' | 'running' | 'done' | 'error';
    error_msg: string | null;
    created_at: string;
    updated_at: string;
  }

  interface KitsuEpisode {
    number: number;
    title_en: string | null;
    title_ru: string | null;
    thumbnail: string | null;
    length: number | null;
    aired_at: string | null;
  }

  interface YoutubeFormatOption {
    formatId?: string;
    itag: number;
    qualityLabel: string;
    height: number | null;
    filesizeBytes: number | null;
    container: string | null;
    hasAudio: boolean;
    hasVideo: boolean;
    mimeType: string | null;
  }

  type KitsuMediaStatus = 'current' | 'finished' | 'tba' | 'unreleased' | 'upcoming';

  interface KitsuTitleListItem {
    anixart_id: number;
    kitsu_id: string;
    title_en: string;
    poster_url: string | null;
    poster_updated_at?: string | null;
    episode_count: number | null;
    media_status: KitsuMediaStatus | null;
    job_status: string | null;
  }

  interface KitsuTitle extends KitsuTitleListItem {
    trailer_url: string | null;
    cover_url: string | null;
    poster_source_url?: string | null;
    cover_source_url?: string | null;
    poster_custom?: boolean;
    cover_custom?: boolean;
    cover_updated_at?: string | null;
    episodes: KitsuEpisode[];
    translations_available: boolean;
    fetched_at: string;
    next_refresh_at: string | null;
    video_bg_url: string | null;
    video_bg_source_url: string | null;
    video_bg_quality: number | null;
    video_bg_updated_at: string | null;
    audio_bg_url: string | null;
    audio_bg_source_url: string | null;
    audio_bg_updated_at: string | null;
  }

  interface KitsuSuggestion {
    id: number;
    anixart_id: number;
    kind: 'banner' | 'trailer';
    url: string;
    created_at: string;
    title_en: string | null;
    anonymous: boolean;
    user_id: number | null;
    user_login: string | null;
  }

  interface KitsuSuggestionBan {
    user_id: number;
    user_login: string;
    reason: string;
    banned_by: number;
    created_at: string;
  }

  const MEDIA_STATUS_META: Record<string, { label: string; color: string }> = {
    current:    { label: 'Онгоинг',   color: 'var(--uikit-v2-accent)' },
    upcoming:   { label: 'Анонс',     color: '#f59e0b' },
    finished:   { label: 'Завершён',  color: 'var(--uikit-v2-success, #4ade80)' },
    tba:        { label: 'TBA',       color: 'var(--uiv2-fg-muted)' },
    unreleased: { label: 'Не вышел', color: 'var(--uiv2-fg-muted)' },
  };

  type View = 'queue' | 'database' | 'suggestions' | 'bans';

  let { startView = 'queue' }: { startView?: View } = $props();

  let view = $state<View>(startView);

  // ── Queue state ──
  let jobs = $state<KitsuJob[]>([]);
  let wsState = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let ws: WebSocket | null = null;
  let reconnectDelay = 2_000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  let formAnixartId = $state('');
  let formTitleEn = $state('');
  let formBusy = $state(false);
  let formError = $state('');
  let formSuccess = $state('');

  const pendingCount = $derived(jobs.filter(j => j.status === 'pending').length);
  const runningCount = $derived(jobs.filter(j => j.status === 'running').length);
  const doneCount = $derived(jobs.filter(j => j.status === 'done').length);
  const errorCount = $derived(jobs.filter(j => j.status === 'error').length);

  // ── Database state ──
  let titles = $state<KitsuTitleListItem[]>([]);
  let titlesLoading = $state(false);
  let titlesError = $state('');
  let selectedTitle = $state<KitsuTitle | null>(null);
  let selectedTitleLoading = $state(false);
  let refreshBusy = $state(false);
  let refreshMsg = $state('');
  let dbSearch = $state('');
  let videoUrlInput = $state('');
  let youtubeFormats = $state<YoutubeFormatOption[]>([]);
  let youtubeFormatsLoading = $state(false);
  let videoItag = $state(''); // string for Svelte select compatibility
  let videoMaxSizeMb = $state('');
  let videoBusy = $state(false);
  let videoMsg = $state('');
  let videoMsgKind = $state<'success' | 'error' | ''>('');
  let videoProgressPct = $state(0);
  let videoProgressMsg = $state('');
  let youtubeAudioFormats = $state<YoutubeFormatOption[]>([]);
  let youtubeAudioFormatsLoading = $state(false);
  let audioItag = $state('');
  let audioBusy = $state(false);
  let audioMsg = $state('');
  let audioMsgKind = $state<'success' | 'error' | ''>('');
  let audioProgressPct = $state(0);
  let audioProgressMsg = $state('');
  let imageBusy = $state(false);
  let imageMsg = $state('');
  let imageMsgKind = $state<'success' | 'error' | ''>('');

  let suggestions = $state<KitsuSuggestion[]>([]);
  let suggestionsLoading = $state(false);
  let suggestionsError = $state('');
  let selectedSuggestion = $state<KitsuSuggestion | null>(null);
  let suggestionBusy = $state(false);
  let suggestionMsg = $state('');
  let suggestionMsgKind = $state<'success' | 'error' | ''>('');
  let suggestionSkipAudio = $state(false);

  let bans = $state<KitsuSuggestionBan[]>([]);
  let bansLoading = $state(false);
  let bansError = $state('');
  let selectedBan = $state<KitsuSuggestionBan | null>(null);
  let banBusy = $state(false);
  let banMsg = $state('');
  let banMsgKind = $state<'success' | 'error' | ''>('');
  let banFormUserId = $state('');
  let banFormLogin = $state('');
  let banFormReason = $state('');

  type YtCookiesStatus = {
    configured: boolean;
    source: 'upload' | 'env_file' | 'env_browser' | null;
    cookieCount: number;
    updatedAt: string | null;
  };

  let ytCookiesStatus = $state<YtCookiesStatus | null>(null);
  let ytCookiesDialogOpen = $state(false);
  let ytCookiesBusy = $state(false);
  let ytCookiesMsg = $state('');
  let ytCookiesMsgKind = $state<'success' | 'error' | ''>('');
  let ytCookiesFileInput = $state<HTMLInputElement | null>(null);

  type VideoStreamEvent = {
    stage: string;
    percent: number;
    message: string;
    title?: KitsuTitle;
    error?: string;
  };

  function resetVideoProgress(): void {
    videoProgressPct = 0;
    videoProgressMsg = '';
  }

  async function consumeVideoJobStream(
    res: Response,
    onProgress: (percent: number, message: string) => void
  ): Promise<{ title?: KitsuTitle; error?: string }> {
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('json') && !contentType.includes('ndjson')) {
      const body = await res.json() as { title?: KitsuTitle; error?: string };
      return body;
    }
    if (!res.body) return { error: 'Пустой ответ сервера' };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let last: VideoStreamEvent | null = null;

    const applyLine = (raw: string): { title?: KitsuTitle; error?: string } | null => {
      const line = raw.trim();
      if (!line) return null;
      try {
        last = JSON.parse(line) as VideoStreamEvent;
      } catch {
        return null;
      }
      if (last.stage !== 'error') onProgress(last.percent, last.message);
      if (last.stage === 'error') return { error: last.error ?? last.message };
      if (last.stage === 'done' && last.title) return { title: last.title };
      return null;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const raw of lines) {
        const result = applyLine(raw);
        if (result) return result;
      }
    }
    if (buf.trim()) {
      const result = applyLine(buf);
      if (result) return result;
    }
    if (last?.title) return { title: last.title };
    return { error: last?.error ?? last?.message ?? (res.ok ? 'Не удалось обработать видео' : `HTTP ${res.status}`) };
  }

  const filteredTitles = $derived.by(() => {
    const q = dbSearch.trim().toLowerCase();
    if (!q) return titles;
    return titles.filter((t) =>
      t.title_en.toLowerCase().includes(q)
      || String(t.anixart_id).includes(q)
      || t.kitsu_id.toLowerCase().includes(q)
    );
  });

  const DB_ROW_H = 60;
  const DB_OVERSCAN = 12;
  let listViewport: HTMLDivElement | null = $state(null);
  let listScrollTop = $state(0);
  let listHeight = $state(560);

  const visibleDbTitles = $derived.by(() => {
    const items = filteredTitles;
    const start = Math.max(0, Math.floor(listScrollTop / DB_ROW_H) - DB_OVERSCAN);
    const visibleCount = Math.ceil((listHeight || 560) / DB_ROW_H) + DB_OVERSCAN * 2;
    const end = Math.min(items.length, start + visibleCount);
    return {
      start,
      end,
      padTop: start * DB_ROW_H,
      padBottom: Math.max(0, (items.length - end) * DB_ROW_H),
      items: items.slice(start, end),
    };
  });

  // ── WS helpers ──
  function getKitsuQueueWsUrl(): string {
    const origin = getAnixbackDirectOrigin();
    if (origin.startsWith('https://')) {
      return `${origin.replace('https://', 'wss://')}/api/kitsu-queue/ws`;
    }
    return `${origin.replace('http://', 'ws://')}/api/kitsu-queue/ws`;
  }

  function upsertJob(job: KitsuJob): void {
    const idx = jobs.findIndex(j => j.id === job.id);
    if (idx >= 0) {
      jobs = jobs.map((j, i) => i === idx ? job : j);
    } else {
      jobs = [job, ...jobs];
    }
    jobs = [...jobs].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  function connect(): void {
    wsState = 'connecting';
    try { ws = new WebSocket(getKitsuQueueWsUrl()); }
    catch { wsState = 'error'; return; }

    ws.onopen = () => { wsState = 'open'; reconnectDelay = 2_000; };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { type: string; jobs?: KitsuJob[]; job?: KitsuJob };
        if (msg.type === 'snapshot' && Array.isArray(msg.jobs)) {
          jobs = [...msg.jobs].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        } else if (msg.type === 'job_update' && msg.job) {
          if (msg.job.status === 'done') {
            // Job completed — remove from queue list (data is now in База данных)
            jobs = jobs.filter(j => j.id !== msg.job!.id);
          } else {
            upsertJob(msg.job);
          }
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      wsState = 'closed'; ws = null;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        connect();
      }, reconnectDelay);
    };

    ws.onerror = () => { wsState = 'error'; };
  }

  function requestRefresh(): void {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'refresh' }));
  }

  // ── Queue: manual enqueue ──
  async function enqueueManual(): Promise<void> {
    formError = ''; formSuccess = '';
    const anixartId = Number(formAnixartId.trim());
    const titleEn = formTitleEn.trim();
    if (!anixartId || anixartId <= 0) { formError = 'Введите корректный Anixart ID'; return; }
    if (!titleEn) { formError = 'Введите английское название'; return; }
    const token = getAdminToken();
    if (!token) { formError = 'Нет сессии администратора'; return; }

    formBusy = true;
    try {
      const res = await fetch(`${getApiBase()}/kitsu/enqueue/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ anixartId, titleEn }),
      });
      const data = await res.json() as { ok?: boolean; alreadyQueued?: boolean; error?: string };
      if (!res.ok) { formError = data.error ?? 'Ошибка запроса'; return; }
      if (data.alreadyQueued) { formSuccess = 'Уже в очереди или выполнено'; }
      else { formSuccess = 'Добавлено в очередь'; formAnixartId = ''; formTitleEn = ''; }
      requestRefresh();
    } catch (e) { formError = e instanceof Error ? e.message : 'Ошибка сети'; }
    finally { formBusy = false; }
  }

  // ── Database: load titles ──
  async function loadTitles(): Promise<void> {
    titlesLoading = true; titlesError = '';
    const token = getAdminToken();
    if (!token) { titlesError = 'Нет сессии'; titlesLoading = false; return; }
    try {
      const res = await fetch(`${getApiBase()}/kitsu/titles?limit=50000`, {
        headers: { 'X-Admin-Token': token },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) { titlesError = `HTTP ${res.status}`; return; }
      const body = await res.json() as { titles: KitsuTitle[] };
      titles = body.titles ?? [];
    } catch (e) { titlesError = e instanceof Error ? e.message : 'Ошибка'; }
    finally { titlesLoading = false; }
  }

  // ── Database: force refresh ──
  async function forceRefreshTitle(anixartId: number): Promise<void> {
    refreshBusy = true; refreshMsg = '';
    const token = getAdminToken();
    if (!token) { refreshMsg = 'Нет сессии'; refreshBusy = false; return; }
    try {
      const res = await fetch(`${getApiBase()}/kitsu/refresh/${anixartId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { refreshMsg = data.error ?? 'Ошибка'; return; }
      refreshMsg = 'Поставлено в очередь на обновление';
      selectedTitle = null;
      requestRefresh();
      setTimeout(() => { void loadTitles(); }, 2_000);
    } catch (e) { refreshMsg = e instanceof Error ? e.message : 'Ошибка'; }
    finally { refreshBusy = false; }
  }

  // ── Formatting ──
  function formatTime(iso: string): string {
    try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
    catch { return iso; }
  }

  function formatDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + ' ' + formatTime(iso); }
    catch { return iso; }
  }

  function formatFullDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  }

  function needsYoutubeAuth(msg: string): boolean {
    return /YT_DLP_COOKIES|требует авторизац|войдите в YouTube|Sign in to confirm|LOGIN_REQUIRED/i.test(msg);
  }

  function ytCookiesButtonLabel(status: YtCookiesStatus | null): string {
    if (!status?.configured) return 'YouTube: войти';
    return 'YouTube: OK';
  }

  function applyYtCookiesStatus(body: Partial<YtCookiesStatus>): void {
    ytCookiesStatus = {
      configured: !!body.configured,
      source: body.source ?? null,
      cookieCount: Number(body.cookieCount) || 0,
      updatedAt: body.updatedAt ?? null,
    };
  }

  async function loadYtCookiesStatus(): Promise<void> {
    const token = getAdminToken();
    if (!token) return;
    try {
      const res = await fetch(`${getApiBase()}/kitsu/youtube/cookies`, {
        headers: { 'X-Admin-Token': token },
      });
      const body = await res.json() as YtCookiesStatus & { error?: string };
      if (!res.ok) return;
      applyYtCookiesStatus(body);
    } catch {
      /* ignore */
    }
  }

  function openYtCookiesDialog(): void {
    ytCookiesDialogOpen = true;
    ytCookiesMsg = '';
    ytCookiesMsgKind = '';
    void loadYtCookiesStatus();
  }

  function closeYtCookiesDialog(): void {
    if (ytCookiesBusy) return;
    ytCookiesDialogOpen = false;
  }

  async function postCookiesTxt(cookiesTxt: string): Promise<boolean> {
    const token = getAdminToken();
    if (!token) {
      ytCookiesMsg = 'Нет сессии';
      ytCookiesMsgKind = 'error';
      return false;
    }
    const res = await fetch(`${getApiBase()}/kitsu/youtube/cookies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ cookies_txt: cookiesTxt }),
    });
    const body = await res.json() as YtCookiesStatus & { ok?: boolean; error?: string };
    if (!res.ok) {
      ytCookiesMsg = body.error ?? `HTTP ${res.status}`;
      ytCookiesMsgKind = 'error';
      return false;
    }
    applyYtCookiesStatus({ ...body, configured: true, source: body.source ?? 'upload' });
    const count = ytCookiesStatus?.cookieCount ?? 0;
    ytCookiesMsg = `Куки сохранены на сервере${count ? ` (${count})` : ''}. Повторите «Принять» или загрузку.`;
    ytCookiesMsgKind = 'success';
    return true;
  }

  async function loginYoutubeAndUpload(): Promise<void> {
    const capture = window.electron?.captureYoutubeCookies;
    if (!capture) {
      ytCookiesMsg = 'Окно входа доступно только в приложении AnixApp. Можно загрузить cookies.txt вручную.';
      ytCookiesMsgKind = 'error';
      return;
    }
    ytCookiesBusy = true;
    ytCookiesMsg = '';
    ytCookiesMsgKind = '';
    try {
      const result = await capture();
      if (result?.cancelled) return;
      if (!result?.ok || !result.cookies_txt) {
        ytCookiesMsg = result?.error ?? 'Не удалось получить куки YouTube';
        ytCookiesMsgKind = 'error';
        return;
      }
      await postCookiesTxt(result.cookies_txt);
    } catch (e) {
      ytCookiesMsg = e instanceof Error ? e.message : 'Ошибка входа';
      ytCookiesMsgKind = 'error';
    } finally {
      ytCookiesBusy = false;
    }
  }

  async function onYtCookiesFile(ev: Event): Promise<void> {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    ytCookiesBusy = true;
    ytCookiesMsg = '';
    ytCookiesMsgKind = '';
    try {
      await postCookiesTxt(await file.text());
    } catch (e) {
      ytCookiesMsg = e instanceof Error ? e.message : 'Не удалось прочитать файл';
      ytCookiesMsgKind = 'error';
    } finally {
      ytCookiesBusy = false;
    }
  }

  async function deleteYtCookies(): Promise<void> {
    const token = getAdminToken();
    if (!token) return;
    ytCookiesBusy = true;
    try {
      const res = await fetch(`${getApiBase()}/kitsu/youtube/cookies`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': token },
      });
      const body = await res.json() as YtCookiesStatus & { error?: string };
      if (!res.ok) {
        ytCookiesMsg = body.error ?? `HTTP ${res.status}`;
        ytCookiesMsgKind = 'error';
        return;
      }
      applyYtCookiesStatus(body);
      ytCookiesMsg = 'Загруженные куки удалены';
      ytCookiesMsgKind = 'success';
    } catch (e) {
      ytCookiesMsg = e instanceof Error ? e.message : 'Ошибка сети';
      ytCookiesMsgKind = 'error';
    } finally {
      ytCookiesBusy = false;
    }
  }

  const STATUS_META: Record<string, { label: string; color: string; pulse: boolean }> = {
    pending: { label: 'Ожидает', color: 'var(--uiv2-fg-muted)', pulse: false },
    running: { label: 'Выполняется', color: 'var(--uikit-v2-accent)', pulse: true },
    done:    { label: 'Готово', color: 'var(--uikit-v2-success, #4ade80)', pulse: false },
    error:   { label: 'Ошибка', color: 'var(--uikit-v2-danger)', pulse: false },
  };

  function switchView(v: View) {
    view = v;
    if (v === 'database' && titles.length === 0) void loadTitles();
    if (v === 'suggestions') void loadSuggestions();
    if (v === 'bans') void loadBans();
  }

  async function loadSuggestions(): Promise<void> {
    suggestionsLoading = true;
    suggestionsError = '';
    const token = getAdminToken();
    if (!token) {
      suggestionsError = 'Нет сессии';
      suggestionsLoading = false;
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/kitsu/suggestions?limit=500`, {
        headers: { 'X-Admin-Token': token },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.json() as { suggestions?: KitsuSuggestion[]; error?: string };
      if (!res.ok) {
        suggestionsError = body.error ?? `HTTP ${res.status}`;
        return;
      }
      suggestions = body.suggestions ?? [];
      if (selectedSuggestion && !suggestions.some((s) => s.id === selectedSuggestion?.id)) {
        selectedSuggestion = null;
      }
    } catch (e) {
      suggestionsError = e instanceof Error ? e.message : 'Ошибка';
    } finally {
      suggestionsLoading = false;
    }
  }

  function suggestionAuthor(item: KitsuSuggestion): string {
    const who = item.user_login
      ? `${item.user_login} · ID ${item.user_id ?? '—'}`
      : (item.user_id ? `ID ${item.user_id}` : 'неизвестно');
    return item.anonymous ? `Аноним (${who})` : who;
  }

  function selectSuggestion(item: KitsuSuggestion): void {
    selectedSuggestion = item;
    suggestionMsg = '';
    suggestionMsgKind = '';
    suggestionSkipAudio = false;
    resetVideoProgress();
    youtubeFormats = [];
    youtubeAudioFormats = [];
    videoItag = '';
    audioItag = '';
    videoUrlInput = item.url;
    if (item.kind === 'trailer') {
      void loadSuggestionFormats();
    }
  }

  async function loadSuggestionFormats(): Promise<void> {
    if (!selectedSuggestion || selectedSuggestion.kind !== 'trailer') return;
    const token = getAdminToken();
    if (!token) {
      suggestionMsg = 'Нет сессии';
      suggestionMsgKind = 'error';
      return;
    }
    const url = selectedSuggestion.url;
    youtubeFormatsLoading = true;
    youtubeAudioFormatsLoading = true;
    youtubeFormats = [];
    youtubeAudioFormats = [];
    try {
      const [videoRes, audioRes] = await Promise.all([
        fetch(`${getApiBase()}/kitsu/video/${selectedSuggestion.anixart_id}/youtube/formats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
          body: JSON.stringify({ url }),
        }),
        fetch(`${getApiBase()}/kitsu/audio/${selectedSuggestion.anixart_id}/youtube/formats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
          body: JSON.stringify({ url }),
        }),
      ]);
      const videoBody = await videoRes.json() as { formats?: YoutubeFormatOption[]; error?: string };
      const audioBody = await audioRes.json() as { formats?: YoutubeFormatOption[]; error?: string };
      if (!videoRes.ok) {
        suggestionMsg = videoBody.error ?? `Видеоформаты: HTTP ${videoRes.status}`;
        suggestionMsgKind = 'error';
      } else {
        youtubeFormats = videoBody.formats ?? [];
        const sorted = [...youtubeFormats].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
        if (sorted[0]) videoItag = formatKey(sorted[0]);
      }
      if (!audioRes.ok) {
        if (!suggestionMsg) {
          suggestionMsg = audioBody.error ?? `Аудиоформаты: HTTP ${audioRes.status}`;
          suggestionMsgKind = 'error';
        }
      } else {
        youtubeAudioFormats = audioBody.formats ?? [];
        if (youtubeAudioFormats[0]) audioItag = formatKey(youtubeAudioFormats[0]);
      }
    } catch (e) {
      suggestionMsg = e instanceof Error ? e.message : 'Ошибка сети';
      suggestionMsgKind = 'error';
    } finally {
      youtubeFormatsLoading = false;
      youtubeAudioFormatsLoading = false;
    }
  }

  async function rejectSuggestion(): Promise<void> {
    if (!selectedSuggestion) return;
    const token = getAdminToken();
    if (!token) {
      suggestionMsg = 'Нет сессии';
      suggestionMsgKind = 'error';
      return;
    }
    suggestionBusy = true;
    suggestionMsg = '';
    try {
      const res = await fetch(`${getApiBase()}/kitsu/suggestions/${selectedSuggestion.id}/reject`, {
        method: 'POST',
        headers: { 'X-Admin-Token': token },
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        suggestionMsg = body.error ?? `HTTP ${res.status}`;
        suggestionMsgKind = 'error';
        return;
      }
      suggestions = suggestions.filter((s) => s.id !== selectedSuggestion?.id);
      selectedSuggestion = null;
      suggestionMsg = 'Отклонено и удалено';
      suggestionMsgKind = 'success';
    } catch (e) {
      suggestionMsg = e instanceof Error ? e.message : 'Ошибка сети';
      suggestionMsgKind = 'error';
    } finally {
      suggestionBusy = false;
    }
  }

  async function loadBans(): Promise<void> {
    bansLoading = true;
    bansError = '';
    const token = getAdminToken();
    if (!token) {
      bansError = 'Нет сессии';
      bansLoading = false;
      return;
    }
    try {
      const res = await fetch(`${getApiBase()}/kitsu/suggestion-bans`, {
        headers: { 'X-Admin-Token': token },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.json() as { bans?: KitsuSuggestionBan[]; error?: string };
      if (!res.ok) {
        bansError = body.error ?? `HTTP ${res.status}`;
        return;
      }
      bans = body.bans ?? [];
      if (selectedBan && !bans.some((b) => b.user_id === selectedBan?.user_id)) {
        selectedBan = null;
      }
    } catch (e) {
      bansError = e instanceof Error ? e.message : 'Ошибка';
    } finally {
      bansLoading = false;
    }
  }

  async function lookupBanLogin(): Promise<void> {
    const userId = Number(banFormUserId.trim());
    if (!Number.isFinite(userId) || userId <= 0) return;
    try {
      const data = await window.anixApi?.profile?.info?.(userId);
      const profile = data?.profile as { login?: string } | undefined;
      const login = String(profile?.login ?? '').trim();
      if (login) banFormLogin = login;
    } catch {
      /* leave login as typed */
    }
  }

  async function submitBan(userId: number, userLogin: string, reason: string): Promise<boolean> {
    const token = getAdminToken();
    if (!token) {
      banMsg = 'Нет сессии';
      banMsgKind = 'error';
      return false;
    }
    const res = await fetch(`${getApiBase()}/kitsu/suggestion-bans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({
        user_id: userId,
        user_login: userLogin.trim(),
        reason: reason.trim(),
      }),
    });
    const body = await res.json() as {
      ok?: boolean;
      ban?: KitsuSuggestionBan;
      deletedSuggestions?: number;
      error?: string;
    };
    if (!res.ok || !body.ban) {
      banMsg = body.error ?? `HTTP ${res.status}`;
      banMsgKind = 'error';
      return false;
    }
    bans = [body.ban, ...bans.filter((b) => b.user_id !== body.ban!.user_id)];
    selectedBan = body.ban;
    const removed = Number(body.deletedSuggestions) || 0;
    if (removed > 0) {
      suggestions = suggestions.filter((s) => s.user_id !== userId);
      if (selectedSuggestion?.user_id === userId) selectedSuggestion = null;
    }
    banMsg = removed > 0
      ? `Забанен. Удалено предложений: ${removed}`
      : 'Пользователь больше не может предлагать обложки и видео';
    banMsgKind = 'success';
    return true;
  }

  async function banFromForm(): Promise<void> {
    const userId = Number(banFormUserId.trim());
    if (!Number.isFinite(userId) || userId <= 0) {
      banMsg = 'Укажите Anixart ID';
      banMsgKind = 'error';
      return;
    }
    banBusy = true;
    banMsg = '';
    try {
      if (!banFormLogin.trim()) await lookupBanLogin();
      const ok = await submitBan(userId, banFormLogin, banFormReason);
      if (ok) {
        banFormUserId = '';
        banFormLogin = '';
        banFormReason = '';
      }
    } catch (e) {
      banMsg = e instanceof Error ? e.message : 'Ошибка сети';
      banMsgKind = 'error';
    } finally {
      banBusy = false;
    }
  }

  async function banSelectedSuggestion(): Promise<void> {
    if (!selectedSuggestion?.user_id) {
      suggestionMsg = 'Нет Anixart ID у этого предложения';
      suggestionMsgKind = 'error';
      return;
    }
    const userId = selectedSuggestion.user_id;
    const login = selectedSuggestion.user_login?.trim() || `ID ${userId}`;
    const ok = window.confirm(
      `Забанить ${login}? Он больше не сможет предлагать обложки и видео. Все его текущие предложения удалятся.`
    );
    if (!ok) return;
    suggestionBusy = true;
    suggestionMsg = '';
    banMsg = '';
    try {
      const banned = await submitBan(userId, selectedSuggestion.user_login ?? '', '');
      if (banned) {
        suggestionMsg = banMsg;
        suggestionMsgKind = 'success';
      } else {
        suggestionMsg = banMsg || 'Не удалось забанить';
        suggestionMsgKind = 'error';
      }
    } catch (e) {
      suggestionMsg = e instanceof Error ? e.message : 'Ошибка сети';
      suggestionMsgKind = 'error';
    } finally {
      suggestionBusy = false;
    }
  }

  async function unbanUser(userId: number): Promise<void> {
    const token = getAdminToken();
    if (!token) {
      banMsg = 'Нет сессии';
      banMsgKind = 'error';
      return;
    }
    banBusy = true;
    banMsg = '';
    try {
      const res = await fetch(`${getApiBase()}/kitsu/suggestion-bans/${userId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': token },
      });
      const body = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        banMsg = body.error ?? `HTTP ${res.status}`;
        banMsgKind = 'error';
        return;
      }
      bans = bans.filter((b) => b.user_id !== userId);
      if (selectedBan?.user_id === userId) selectedBan = null;
      banMsg = 'Бан снят';
      banMsgKind = 'success';
    } catch (e) {
      banMsg = e instanceof Error ? e.message : 'Ошибка сети';
      banMsgKind = 'error';
    } finally {
      banBusy = false;
    }
  }

  async function acceptSuggestion(): Promise<void> {
    if (!selectedSuggestion) return;
    const token = getAdminToken();
    if (!token) {
      suggestionMsg = 'Нет сессии';
      suggestionMsgKind = 'error';
      return;
    }
    suggestionBusy = true;
    suggestionMsg = '';
    suggestionMsgKind = '';
    resetVideoProgress();
    try {
      if (selectedSuggestion.kind === 'banner') {
        const res = await fetch(`${getApiBase()}/kitsu/suggestions/${selectedSuggestion.id}/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        });
        const body = await res.json() as { ok?: boolean; error?: string; title?: KitsuTitle };
        if (!res.ok) {
          suggestionMsg = body.error ?? `HTTP ${res.status}`;
          suggestionMsgKind = 'error';
          return;
        }
        if (body.title) applyUpdatedTitle(body.title);
        suggestions = suggestions.filter((s) => s.id !== selectedSuggestion?.id);
        selectedSuggestion = null;
        suggestionMsg = 'Баннер принят и записан в базу';
        suggestionMsgKind = 'success';
        return;
      }

      videoProgressPct = 2;
      videoProgressMsg = 'Подключаюсь к серверу…';
      const selectedFormat = youtubeFormats.find((f) => formatKey(f) === videoItag.trim());
      const height = selectedFormat?.height ?? 0;
      const quality = height >= 1080 ? 1080 : height >= 720 ? 720 : height >= 480 ? 480 : height >= 360 ? 360 : 1080;
      const res = await fetch(`${getApiBase()}/kitsu/suggestions/${selectedSuggestion.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token, Accept: 'application/x-ndjson' },
        body: JSON.stringify({
          formatId: videoItag.trim() || undefined,
          quality,
          audioFormatId: suggestionSkipAudio ? undefined : (audioItag.trim() || undefined),
          skipAudio: suggestionSkipAudio,
        }),
      });
      const body = await consumeVideoJobStream(res, (percent, message) => {
        videoProgressPct = percent;
        videoProgressMsg = message;
      });
      if (!body.title) {
        suggestionMsg = body.error ?? 'Не удалось принять трейлер';
        suggestionMsgKind = 'error';
        return;
      }
      applyUpdatedTitle(body.title);
      suggestions = suggestions.filter((s) => s.id !== selectedSuggestion?.id);
      selectedSuggestion = null;
      videoProgressPct = 100;
      videoProgressMsg = 'Готово';
      suggestionMsg = 'Трейлер принят и записан в базу';
      suggestionMsgKind = 'success';
    } catch (e) {
      suggestionMsg = e instanceof Error ? e.message : 'Ошибка сети';
      suggestionMsgKind = 'error';
    } finally {
      suggestionBusy = false;
    }
  }

  function resolveUploadUrl(url: string | null | undefined): string {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    return `${getAnixbackUploadsOrigin()}${url.startsWith('/') ? url : `/${url}`}`;
  }

  function resolveVideoPreviewUrl(title: KitsuTitle): string {
    const url = resolveUploadUrl(title.video_bg_url);
    if (!url) return '';
    const stamp = title.video_bg_updated_at ?? '';
    return stamp ? `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(stamp)}` : url;
  }

  function resolveAudioPreviewUrl(title: KitsuTitle): string {
    const url = resolveUploadUrl(title.audio_bg_url);
    if (!url) return '';
    const stamp = title.audio_bg_updated_at ?? '';
    return stamp ? `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(stamp)}` : url;
  }

  function resolveImagePreviewUrl(url: string | null | undefined, stamp?: string | null): string {
    const resolved = resolveUploadUrl(url);
    if (!resolved) return '';
    if (!stamp) return resolved;
    return `${resolved}${resolved.includes('?') ? '&' : '?'}t=${encodeURIComponent(stamp)}`;
  }

  function resolveListPosterUrl(item: KitsuTitleListItem): string {
    const url = item.poster_url?.trim() ?? '';
    if (!url) return '';
    if (url.startsWith('/uploads/kitsu/poster/') || /\/uploads\/kitsu\/poster\//.test(url)) {
      const origin = getAnixbackUploadsOrigin();
      const stamp = item.poster_updated_at ?? '';
      const thumb = `${origin}/uploads/kitsu/poster/${item.anixart_id}.thumb.jpg`;
      return stamp ? `${thumb}?t=${encodeURIComponent(stamp)}` : thumb;
    }
    const resolved = resolveUploadUrl(url);
    return resolved.replace(/\/(original|large|medium|small)\.(jpe?g|png|webp)/i, '/tiny.$2');
  }

  function toListItem(title: KitsuTitle): KitsuTitleListItem {
    return {
      anixart_id: title.anixart_id,
      kitsu_id: title.kitsu_id,
      title_en: title.title_en,
      poster_url: title.poster_url,
      poster_updated_at: title.poster_updated_at ?? null,
      episode_count: title.episode_count,
      media_status: title.media_status,
      job_status: title.job_status,
    };
  }

  function resetTitleEditorState(title?: KitsuTitle | null): void {
    refreshMsg = '';
    videoMsg = '';
    videoMsgKind = '';
    resetVideoProgress();
    youtubeFormats = [];
    videoItag = '';
    videoMaxSizeMb = '';
    videoUrlInput = title?.video_bg_source_url ?? title?.trailer_url ?? '';
    youtubeAudioFormats = [];
    audioItag = '';
    audioMsg = '';
    audioMsgKind = '';
    audioProgressPct = 0;
    audioProgressMsg = '';
    imageMsg = '';
    imageMsgKind = '';
  }

  async function selectTitle(item: KitsuTitleListItem): Promise<void> {
    if (selectedTitle?.anixart_id === item.anixart_id && !selectedTitleLoading) return;
    selectedTitleLoading = true;
    resetTitleEditorState();
    try {
      const res = await fetch(`${getApiBase()}/kitsu/${item.anixart_id}`, {
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.json() as { data?: KitsuTitle; error?: string };
      if (!res.ok || !body.data) {
        refreshMsg = body.error ?? 'Не удалось загрузить тайтл';
        return;
      }
      selectedTitle = { ...body.data, job_status: item.job_status ?? body.data.job_status };
      resetTitleEditorState(body.data);
      if ((!body.data.audio_bg_url || !body.data.video_bg_url) && (body.data.trailer_url || body.data.video_bg_source_url)) {
        void fetch(`${getApiBase()}/kitsu/video/${body.data.anixart_id}/auto`, {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
        }).catch(() => {});
      }
    } catch (e) {
      refreshMsg = e instanceof Error ? e.message : 'Ошибка сети';
    } finally {
      selectedTitleLoading = false;
    }
  }

  function applyUpdatedTitle(updated: KitsuTitle): void {
    const summary = toListItem(updated);
    titles = titles.map((item) => item.anixart_id === updated.anixart_id ? summary : item);
    if (selectedTitle?.anixart_id === updated.anixart_id) {
      selectedTitle = updated;
      videoUrlInput = updated.video_bg_source_url ?? updated.trailer_url ?? '';
    }
  }

  async function saveYoutubeVideo(): Promise<void> {
    if (!selectedTitle) return;
    videoBusy = true;
    videoMsg = '';
    videoMsgKind = '';
    videoProgressPct = 2;
    videoProgressMsg = 'Подключаюсь к серверу…';
    const token = getAdminToken();
    if (!token) { videoMsg = 'Нет сессии'; videoMsgKind = 'error'; videoBusy = false; return; }
    try {
      if (youtubeFormats.length === 0 && !youtubeFormatsLoading) {
        await loadYoutubeFormats();
      }
      const selectedFormat = youtubeFormats.find((f) => formatKey(f) === videoItag.trim());
      const height = selectedFormat?.height ?? 0;
      const quality = height >= 1080 ? 1080 : height >= 720 ? 720 : height >= 480 ? 480 : height >= 360 ? 360 : 1080;
      const maxSizeMb = Number(videoMaxSizeMb.trim() || 0);
      const res = await fetch(`${getApiBase()}/kitsu/video/${selectedTitle.anixart_id}/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token, Accept: 'application/x-ndjson' },
        body: JSON.stringify({
          url: videoUrlInput.trim(),
          formatId: videoItag.trim() || undefined,
          quality,
          maxSizeMb: Number.isFinite(maxSizeMb) && maxSizeMb > 0 ? maxSizeMb : undefined,
        }),
      });
      const body = await consumeVideoJobStream(res, (percent, message) => {
        videoProgressPct = percent;
        videoProgressMsg = message;
      });
      if (!body.title) {
        videoMsg = body.error ?? 'Не удалось скачать видео';
        videoMsgKind = 'error';
        return;
      }
      applyUpdatedTitle(body.title);
      videoProgressPct = 100;
      videoProgressMsg = 'Готово';
      videoMsg = 'Видео загружено. Превью слева можно сразу проиграть.';
      videoMsgKind = 'success';
    } catch (e) {
      videoMsg = e instanceof Error ? e.message : 'Ошибка сети';
      videoMsgKind = 'error';
    } finally {
      videoBusy = false;
    }
  }

  async function loadYoutubeFormats(): Promise<void> {
    if (!selectedTitle) return;
    const token = getAdminToken();
    if (!token) { videoMsg = 'Нет сессии'; videoMsgKind = 'error'; return; }
    const url = videoUrlInput.trim();
    if (!url) { videoMsg = 'Вставь URL YouTube'; videoMsgKind = 'error'; return; }

    youtubeFormatsLoading = true;
    youtubeFormats = [];
    videoItag = '';
    try {
      const res = await fetch(`${getApiBase()}/kitsu/video/${selectedTitle.anixart_id}/youtube/formats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ url }),
      });
      const body = await res.json() as { formats?: YoutubeFormatOption[]; error?: string };
      if (!res.ok) {
        videoMsg = body.error ?? `HTTP ${res.status}`;
        videoMsgKind = 'error';
        return;
      }
      youtubeFormats = body.formats ?? [];

      const maxSizeMb = Number(videoMaxSizeMb.trim() || 0);
      const maxBytes = Number.isFinite(maxSizeMb) && maxSizeMb > 0 ? maxSizeMb * 1024 * 1024 : null;
      const sorted = [...youtubeFormats].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
      const filtered = maxBytes
        ? sorted.filter((f) => (f.filesizeBytes ?? 0) > 0 && (f.filesizeBytes ?? 0) <= maxBytes)
        : sorted;
      const best = filtered[0] ?? sorted[0];
      if (best) videoItag = formatKey(best);
    } catch (e) {
      videoMsg = e instanceof Error ? e.message : 'Ошибка сети';
      videoMsgKind = 'error';
    } finally {
      youtubeFormatsLoading = false;
    }
  }

  function formatKey(format: YoutubeFormatOption): string {
    return String(format.formatId || format.itag || '').trim();
  }

  function formatBytes(bytes: number | null): string {
    if (!bytes || bytes <= 0) return 'n/a';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  }

  async function uploadVideoFile(file: File): Promise<void> {
    if (!selectedTitle) return;
    videoBusy = true;
    videoMsg = '';
    videoMsgKind = '';
    videoProgressPct = 4;
    videoProgressMsg = 'Читаю файл…';
    const token = getAdminToken();
    if (!token) { videoMsg = 'Нет сессии'; videoMsgKind = 'error'; videoBusy = false; return; }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${getApiBase()}/kitsu/video/${selectedTitle.anixart_id}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token, Accept: 'application/x-ndjson' },
        body: JSON.stringify({ data_url: dataUrl }),
      });
      const body = await consumeVideoJobStream(res, (percent, message) => {
        videoProgressPct = percent;
        videoProgressMsg = message;
      });
      if (!body.title) {
        videoMsg = body.error ?? 'Не удалось загрузить файл';
        videoMsgKind = 'error';
        return;
      }
      applyUpdatedTitle(body.title);
      videoProgressPct = 100;
      videoProgressMsg = 'Готово';
      videoMsg = 'Видео из файла сохранено. Превью слева можно сразу проиграть.';
      videoMsgKind = 'success';
    } catch (e) {
      videoMsg = e instanceof Error ? e.message : 'Ошибка сети';
      videoMsgKind = 'error';
    } finally {
      videoBusy = false;
    }
  }

  async function deleteVideo(): Promise<void> {
    if (!selectedTitle) return;
    videoBusy = true;
    videoMsg = '';
    videoMsgKind = '';
    resetVideoProgress();
    const token = getAdminToken();
    if (!token) { videoMsg = 'Нет сессии'; videoMsgKind = 'error'; videoBusy = false; return; }
    try {
      const res = await fetch(`${getApiBase()}/kitsu/video/${selectedTitle.anixart_id}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': token },
      });
      const body = await res.json() as { title?: KitsuTitle; error?: string };
      if (!res.ok || !body.title) {
        videoMsg = body.error ?? 'Не удалось удалить видео';
        videoMsgKind = 'error';
        return;
      }
      applyUpdatedTitle(body.title);
      videoMsg = 'Видео удалено';
      videoMsgKind = 'success';
    } catch (e) {
      videoMsg = e instanceof Error ? e.message : 'Ошибка сети';
      videoMsgKind = 'error';
    } finally {
      videoBusy = false;
    }
  }

  async function saveYoutubeAudio(): Promise<void> {
    if (!selectedTitle) return;
    audioBusy = true;
    audioMsg = '';
    audioMsgKind = '';
    audioProgressPct = 2;
    audioProgressMsg = 'Подключаюсь к серверу…';
    const token = getAdminToken();
    if (!token) { audioMsg = 'Нет сессии'; audioMsgKind = 'error'; audioBusy = false; return; }
    try {
      const formatId = audioItag.trim().replace(/-drc$/i, '');
      const res = await fetch(`${getApiBase()}/kitsu/audio/${selectedTitle.anixart_id}/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token, Accept: 'application/x-ndjson' },
        body: JSON.stringify({
          url: videoUrlInput.trim(),
          formatId: formatId || undefined,
        }),
      });
      const body = await consumeVideoJobStream(res, (percent, message) => {
        audioProgressPct = percent;
        audioProgressMsg = message;
      });
      if (!body.title) {
        audioMsg = body.error ?? 'Не удалось скачать аудио';
        audioMsgKind = 'error';
        return;
      }
      applyUpdatedTitle(body.title);
      audioProgressPct = 100;
      audioProgressMsg = 'Готово';
      audioMsg = 'Аудио загружено. Превью слева можно сразу проиграть.';
      audioMsgKind = 'success';
    } catch (e) {
      audioMsg = e instanceof Error ? e.message : 'Ошибка сети';
      audioMsgKind = 'error';
    } finally {
      audioBusy = false;
    }
  }

  async function loadYoutubeAudioFormats(): Promise<void> {
    if (!selectedTitle) return;
    const token = getAdminToken();
    if (!token) { audioMsg = 'Нет сессии'; audioMsgKind = 'error'; return; }
    const url = videoUrlInput.trim();
    if (!url) { audioMsg = 'Вставь URL YouTube'; audioMsgKind = 'error'; return; }

    youtubeAudioFormatsLoading = true;
    youtubeAudioFormats = [];
    audioItag = '';
    try {
      const res = await fetch(`${getApiBase()}/kitsu/audio/${selectedTitle.anixart_id}/youtube/formats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ url }),
      });
      const body = await res.json() as { formats?: YoutubeFormatOption[]; error?: string };
      if (!res.ok) {
        audioMsg = body.error ?? `HTTP ${res.status}`;
        audioMsgKind = 'error';
        return;
      }
      youtubeAudioFormats = body.formats ?? [];
      const best = youtubeAudioFormats[0];
      if (best) audioItag = formatKey(best);
    } catch (e) {
      audioMsg = e instanceof Error ? e.message : 'Ошибка сети';
      audioMsgKind = 'error';
    } finally {
      youtubeAudioFormatsLoading = false;
    }
  }

  async function deleteAudio(): Promise<void> {
    if (!selectedTitle) return;
    audioBusy = true;
    audioMsg = '';
    audioMsgKind = '';
    audioProgressPct = 0;
    audioProgressMsg = '';
    const token = getAdminToken();
    if (!token) { audioMsg = 'Нет сессии'; audioMsgKind = 'error'; audioBusy = false; return; }
    try {
      const res = await fetch(`${getApiBase()}/kitsu/audio/${selectedTitle.anixart_id}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Token': token },
      });
      const body = await res.json() as { title?: KitsuTitle; error?: string };
      if (!res.ok || !body.title) {
        audioMsg = body.error ?? 'Не удалось удалить аудио';
        audioMsgKind = 'error';
        return;
      }
      applyUpdatedTitle(body.title);
      audioMsg = 'Аудио удалено';
      audioMsgKind = 'success';
    } catch (e) {
      audioMsg = e instanceof Error ? e.message : 'Ошибка сети';
      audioMsgKind = 'error';
    } finally {
      audioBusy = false;
    }
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadTitleImage(kind: 'poster' | 'cover', file: File): Promise<void> {
    if (!selectedTitle) return;
    imageBusy = true;
    imageMsg = '';
    imageMsgKind = '';
    const token = getAdminToken();
    if (!token) { imageMsg = 'Нет сессии'; imageMsgKind = 'error'; imageBusy = false; return; }
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch(`${getApiBase()}/kitsu/image/${selectedTitle.anixart_id}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ kind, data_url: dataUrl }),
      });
      const body = await res.json() as { title?: KitsuTitle; error?: string };
      if (!res.ok || !body.title) {
        imageMsg = body.error ?? 'Не удалось сохранить изображение';
        imageMsgKind = 'error';
        return;
      }
      applyUpdatedTitle(body.title);
      imageMsg = kind === 'poster' ? 'Постер заменён' : 'Обложка заменена';
      imageMsgKind = 'success';
    } catch (e) {
      imageMsg = e instanceof Error ? e.message : 'Ошибка сети';
      imageMsgKind = 'error';
    } finally {
      imageBusy = false;
    }
  }

  async function resetTitleImage(kind: 'poster' | 'cover'): Promise<void> {
    if (!selectedTitle) return;
    imageBusy = true;
    imageMsg = '';
    imageMsgKind = '';
    const token = getAdminToken();
    if (!token) { imageMsg = 'Нет сессии'; imageMsgKind = 'error'; imageBusy = false; return; }
    try {
      const res = await fetch(`${getApiBase()}/kitsu/image/${selectedTitle.anixart_id}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({ kind }),
      });
      const body = await res.json() as { title?: KitsuTitle; error?: string };
      if (!res.ok || !body.title) {
        imageMsg = body.error ?? 'Не удалось вернуть изображение Kitsu';
        imageMsgKind = 'error';
        return;
      }
      applyUpdatedTitle(body.title);
      imageMsg = kind === 'poster' ? 'Постер с сервера Kitsu' : 'Обложка с сервера Kitsu';
      imageMsgKind = 'success';
    } catch (e) {
      imageMsg = e instanceof Error ? e.message : 'Ошибка сети';
      imageMsgKind = 'error';
    } finally {
      imageBusy = false;
    }
  }

  onMount(() => {
    connect();
    void loadSuggestions();
    void loadBans();
    void loadYtCookiesStatus();
    if (startView === 'bans') view = 'bans';
  });

  $effect(() => {
    if (!ytCookiesDialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeYtCookiesDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  $effect(() => {
    const el = listViewport;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0) listHeight = h;
    });
    ro.observe(el);
    listHeight = el.clientHeight || 560;
    const onScroll = () => { listScrollTop = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  });

  $effect(() => {
    dbSearch;
    listScrollTop = 0;
    if (listViewport) listViewport.scrollTop = 0;
  });

  onDestroy(() => {
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    ws?.close();
    ws = null;
  });
</script>

<div class="kq-root">

  <!-- Header -->
  <div class="kq-header">
    <div class="kq-header__left">
      <button type="button" class="kq-view-btn" class:kq-view-btn--active={view === 'queue'} onclick={() => switchView('queue')}>
        Очередь
      </button>
      <button type="button" class="kq-view-btn" class:kq-view-btn--active={view === 'database'} onclick={() => switchView('database')}>
        База данных
        {#if titles.length > 0}<span class="kq-view-btn__count">{titles.length}</span>{/if}
      </button>
      <button type="button" class="kq-view-btn" class:kq-view-btn--active={view === 'suggestions'} onclick={() => switchView('suggestions')}>
        Предложения
        {#if suggestions.length > 0}<span class="kq-view-btn__count">{suggestions.length}</span>{/if}
      </button>
      <button type="button" class="kq-view-btn" class:kq-view-btn--active={view === 'bans'} onclick={() => switchView('bans')}>
        Баны
        {#if bans.length > 0}<span class="kq-view-btn__count">{bans.length}</span>{/if}
      </button>
      <span class="kq-ws-badge" class:kq-ws-badge--open={wsState === 'open'}
            class:kq-ws-badge--error={wsState === 'error' || wsState === 'closed'}>
        {wsState === 'open' ? 'Live' : wsState === 'connecting' ? '...' : 'Offline'}
      </span>
    </div>
    <div class="kq-header__stats">
      {#if view === 'queue'}
        {#if pendingCount > 0}<span class="kq-stat kq-stat--pending">{pendingCount} ожидает</span>{/if}
        {#if runningCount > 0}<span class="kq-stat kq-stat--running">{runningCount} выполняется</span>{/if}
        {#if doneCount > 0}<span class="kq-stat kq-stat--done">{doneCount} готово</span>{/if}
        {#if errorCount > 0}<span class="kq-stat kq-stat--error">{errorCount} ошибок</span>{/if}
      {/if}
    </div>
    <button
      type="button"
      class="kq-yt-status"
      class:kq-yt-status--ok={ytCookiesStatus?.configured}
      onclick={openYtCookiesDialog}
    >
      {ytCookiesButtonLabel(ytCookiesStatus)}
    </button>
    {#if view === 'queue'}
      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={requestRefresh}>Обновить</button>
    {:else if view === 'database'}
      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={loadTitles} disabled={titlesLoading}>
        {titlesLoading ? 'Загрузка…' : 'Обновить'}
      </button>
    {:else if view === 'bans'}
      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={() => void loadBans()} disabled={bansLoading}>
        {bansLoading ? 'Загрузка…' : 'Обновить'}
      </button>
    {:else}
      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={loadSuggestions} disabled={suggestionsLoading}>
        {suggestionsLoading ? 'Загрузка…' : 'Обновить'}
      </button>
    {/if}
  </div>

  <!-- ══════════ Queue View ══════════ -->
  {#if view === 'queue'}
    <div class="kq-body">
      <aside class="kq-sidebar">
        <div class="kq-card">
          <p class="kq-card__label">Добавить в очередь</p>
          <div class="kq-card__body">
            <div class="kq-field">
              <label class="kq-field__label" for="kq-anixart-id">Anixart ID</label>
              <input id="kq-anixart-id" type="number" class="kq-field__input" placeholder="12345"
                bind:value={formAnixartId} disabled={formBusy} />
            </div>
            <div class="kq-field">
              <label class="kq-field__label" for="kq-title-en">Английское название</label>
              <input id="kq-title-en" type="text" class="kq-field__input" placeholder="Attack on Titan"
                bind:value={formTitleEn} disabled={formBusy} />
            </div>
            {#if formError}<p class="kq-form-msg kq-form-msg--error">{formError}</p>{/if}
            {#if formSuccess}<p class="kq-form-msg kq-form-msg--success">{formSuccess}</p>{/if}
            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm kq-btn-full" disabled={formBusy} onclick={enqueueManual}>
              {formBusy ? 'Добавление…' : 'Добавить'}
            </button>
          </div>
        </div>
        <div class="kq-info-card">
          <p class="kq-info-card__text">
            Задания добавляются автоматически при открытии страницы тайтла. Здесь можно добавить вручную.
          </p>
        </div>
      </aside>

      <div class="kq-main">
        {#if jobs.length === 0}
          <div class="kq-empty">
            <div class="kq-empty__icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
                <path d="M12 8v4l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </div>
            <p class="kq-empty__text">Очередь пуста</p>
          </div>
        {:else}
          <div class="kq-table-wrap uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <table class="kq-table uiv2-scroll-area__viewport">
              <thead>
                <tr>
                  <th>ID</th><th>Anixart</th><th class="kq-th--grow">Название</th><th>Kitsu ID</th><th>Статус</th><th>Обновлено</th>
                </tr>
              </thead>
              <tbody>
                {#each jobs as job (job.id)}
                  {@const meta = STATUS_META[job.status] ?? STATUS_META.pending}
                  <tr class="kq-row kq-row--{job.status}" title={job.error_msg ?? ''}>
                    <td class="kq-cell--mono">{job.id}</td>
                    <td class="kq-cell--mono">{job.anixart_id}</td>
                    <td class="kq-cell--title">{job.title_en}</td>
                    <td class="kq-cell--mono kq-cell--muted">{job.kitsu_id ?? '—'}</td>
                    <td>
                      <span class="kq-badge" style="--c:{meta.color}" class:kq-badge--pulse={meta.pulse}>{meta.label}</span>
                      {#if job.status === 'error' && job.error_msg}
                        <span class="kq-error-hint" title={job.error_msg}>!</span>
                      {/if}
                    </td>
                    <td class="kq-cell--time">{formatDate(job.updated_at)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>
        {/if}
      </div>
    </div>

  <!-- ══════════ Database View ══════════ -->
  {:else if view === 'database'}
    <div class="kq-body">

      <!-- Sidebar: title list -->
      <aside class="kq-sidebar kq-sidebar--db">
        <div class="kq-field" style="padding: 0 0 0.25rem;">
          <input type="text" class="kq-field__input" placeholder="Поиск по названию / ID…"
            bind:value={dbSearch} />
        </div>
        {#if titlesError}
          <p class="kq-form-msg kq-form-msg--error">{titlesError}</p>
        {/if}
        {#if titlesLoading}
          <p class="kq-info-card__text" style="text-align:center; padding: 1rem 0;">Загрузка…</p>
        {:else if filteredTitles.length === 0}
          <p class="kq-info-card__text" style="text-align:center; padding: 1rem 0;">Нет сохранённых тайтлов</p>
        {:else}
          <div class="kq-db-list uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <div class="kq-db-list__inner uiv2-scroll-area__viewport" bind:this={listViewport}>
              <div class="kq-db-list__spacer" style="height:{visibleDbTitles.padTop}px"></div>
              {#each visibleDbTitles.items as t (t.anixart_id)}
                <button
                  type="button"
                  class="kq-db-item"
                  class:kq-db-item--active={selectedTitle?.anixart_id === t.anixart_id}
                  onclick={() => void selectTitle(t)}
                >
                  {#if t.poster_url}
                    <img
                      class="kq-db-item__poster"
                      src={resolveListPosterUrl(t)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width="36"
                      height="48"
                      onerror={(e) => {
                        const img = e.currentTarget;
                        if (img.dataset.fallback === '1' || !t.poster_url) return;
                        img.dataset.fallback = '1';
                        img.src = resolveImagePreviewUrl(t.poster_url, t.poster_updated_at);
                      }}
                    />
                  {:else}
                    <div class="kq-db-item__poster kq-db-item__poster--empty">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
                      </svg>
                    </div>
                  {/if}
                  <div class="kq-db-item__info">
                    <span class="kq-db-item__name">{t.title_en}</span>
                    <span class="kq-db-item__meta">
                      ID {t.anixart_id} · {t.episode_count ?? 0} серий
                      {#if t.media_status && MEDIA_STATUS_META[t.media_status]}
                        · <span style="color:{MEDIA_STATUS_META[t.media_status]!.color}">{MEDIA_STATUS_META[t.media_status]!.label}</span>
                      {/if}
                    </span>
                  </div>
                </button>
              {/each}
              <div class="kq-db-list__spacer" style="height:{visibleDbTitles.padBottom}px"></div>
            </div>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>
        {/if}
      </aside>

      <!-- Main: detail view -->
      <div class="kq-main">
        {#if selectedTitleLoading && !selectedTitle}
          <div class="kq-empty">
            <p class="kq-empty__text">Загрузка тайтла…</p>
          </div>
        {:else if selectedTitle}
          {@const t = selectedTitle}
          <div class="kq-detail uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <div class="kq-detail__inner uiv2-scroll-area__viewport">

              <!-- Title header -->
              <div class="kq-detail__head">
                {#if t.cover_url}
                  <div class="kq-detail__cover" style="background-image:url({resolveImagePreviewUrl(t.cover_url, t.cover_updated_at)})"></div>
                {/if}
                <div class="kq-detail__head-row">
                  {#if t.poster_url}
                    <img class="kq-detail__poster" src={resolveImagePreviewUrl(t.poster_url, t.poster_updated_at)} alt="" />
                  {/if}
                  <div class="kq-detail__head-info">
                    <h2 class="kq-detail__title">{t.title_en}</h2>
                    <div class="kq-detail__meta-row">
                      <span class="kq-detail__chip">Anixart {t.anixart_id}</span>
                      <span class="kq-detail__chip">Kitsu {t.kitsu_id}</span>
                      {#if t.episode_count}<span class="kq-detail__chip">{t.episode_count} серий</span>{/if}
                      {#if t.media_status}
                        {@const sm = MEDIA_STATUS_META[t.media_status]}
                        {#if sm}
                          <span class="kq-detail__chip" style="background:color-mix(in srgb,{sm.color} 14%,transparent);color:{sm.color}">{sm.label}</span>
                        {/if}
                      {/if}
                      {#if t.translations_available}<span class="kq-detail__chip kq-detail__chip--accent">RU переводы</span>{/if}
                    </div>
                    <div class="kq-detail__timing">
                      <span class="kq-detail__fetched">Загружено: {formatFullDate(t.fetched_at)}</span>
                      {#if t.next_refresh_at}
                        <span class="kq-detail__refresh-sched">
                          Автообновление: {formatFullDate(t.next_refresh_at)}
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Actions -->
                <div class="kq-detail__actions">
                  <button
                    type="button"
                    class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm"
                    disabled={refreshBusy}
                    onclick={() => forceRefreshTitle(t.anixart_id)}
                  >
                    {refreshBusy ? 'Обновление…' : 'Обновить данные'}
                  </button>
                  {#if refreshMsg}
                    <span class="kq-detail__refresh-msg">{refreshMsg}</span>
                  {/if}
                </div>
              </div>

              <div class="kq-detail__section">
                <h3 class="kq-detail__section-title">Видео фон</h3>
                <div class="kq-video-admin">
                  <div class="kq-video-admin__preview">
                    {#if t.video_bg_url}
                      <video
                        class="kq-video-admin__player"
                        src={resolveVideoPreviewUrl(t)}
                        controls
                        muted
                        loop
                        playsinline
                        preload="metadata"
                      ></video>
                    {:else if t.cover_url}
                      <img class="kq-video-admin__placeholder" src={resolveImagePreviewUrl(t.cover_url, t.cover_updated_at)} alt="" />
                    {:else}
                      <div class="kq-video-admin__placeholder kq-video-admin__placeholder--empty">Нет видео</div>
                    {/if}
                    {#if videoBusy}
                      <div class="kq-video-admin__overlay" aria-hidden="true">
                        <span>{Math.round(videoProgressPct)}%</span>
                      </div>
                    {/if}
                  </div>
                  <div class="kq-video-admin__controls">
                    <div class="kq-field">
                      <label class="kq-field__label" for="kq-video-url">YouTube / трейлер URL</label>
                      <input
                        id="kq-video-url"
                        type="text"
                        class="kq-field__input"
                        placeholder="https://www.youtube.com/watch?v=..."
                        bind:value={videoUrlInput}
                        disabled={videoBusy}
                        onblur={() => void loadYoutubeFormats()}
                      />
                    </div>
                    <div class="kq-field">
                      <label class="kq-field__label" for="kq-video-size">Макс размер (MB, опционально)</label>
                      <input
                        id="kq-video-size"
                        type="number"
                        min="1"
                        step="1"
                        class="kq-field__input"
                        placeholder="например 20"
                        bind:value={videoMaxSizeMb}
                        disabled={videoBusy}
                        onblur={() => {
                          if (youtubeFormats.length > 0) {
                            const maxSizeMb = Number(videoMaxSizeMb.trim() || 0);
                            const maxBytes = Number.isFinite(maxSizeMb) && maxSizeMb > 0 ? maxSizeMb * 1024 * 1024 : null;
                            const sorted = [...youtubeFormats].sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
                            const filtered = maxBytes
                              ? sorted.filter((f) => (f.filesizeBytes ?? 0) > 0 && (f.filesizeBytes ?? 0) <= maxBytes)
                              : sorted;
                            const best = filtered[0] ?? sorted[0];
                            if (best) videoItag = formatKey(best);
                          }
                        }}
                      />
                    </div>
                    <div class="kq-video-admin__row">
                      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={videoBusy || !videoUrlInput.trim()} onclick={saveYoutubeVideo}>
                        {videoBusy ? `${Math.round(videoProgressPct)}%` : 'Скачать с YouTube'}
                      </button>
                    </div>
                    {#if videoBusy || videoProgressPct > 0}
                      <div
                        class="kq-video-progress"
                        role="progressbar"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={Math.round(videoProgressPct)}
                        aria-label={videoProgressMsg || 'Обработка видео'}
                      >
                        <div class="kq-video-progress__track">
                          <div class="kq-video-progress__fill" style="width: {Math.max(2, videoProgressPct)}%"></div>
                        </div>
                        <div class="kq-video-progress__label">
                          <span>{videoProgressMsg || (videoBusy ? 'Обработка…' : 'Готово')}</span>
                          <span>{Math.round(videoProgressPct)}%</span>
                        </div>
                      </div>
                    {/if}
                    {#if youtubeFormatsLoading}
                      <p class="kq-info-card__text">Определяю доступные форматы…</p>
                    {/if}
                    {#if youtubeFormats.length > 0}
                      <div class="kq-field">
                        <label class="kq-field__label" for="kq-video-itag">Формат (itag)</label>
                        <select
                          id="kq-video-itag"
                          class="kq-field__input"
                          bind:value={videoItag}
                          disabled={videoBusy}
                        >
                          <option value="">Автовыбор</option>
                          {#each youtubeFormats as f (formatKey(f))}
                            <option value={formatKey(f)}>
                              {f.qualityLabel}{f.height != null ? ` (${f.height}p)` : ''}{f.container ? ` · ${f.container}` : ''}{f.hasAudio ? '' : ' · video-only'} · {formatBytes(f.filesizeBytes)}{f.itag >= 0 ? ` · itag ${f.itag}` : ` · ${formatKey(f)}`}
                            </option>
                          {/each}
                        </select>
                      </div>
                    {/if}
                    <div class="kq-video-admin__row">
                      <label class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm kq-file-btn">
                        Загрузить файл
                        <input
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          disabled={videoBusy}
                          onchange={(e) => {
                            const file = (e.currentTarget as HTMLInputElement).files?.[0];
                            if (file) void uploadVideoFile(file);
                            (e.currentTarget as HTMLInputElement).value = '';
                          }}
                        />
                      </label>
                      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={videoBusy || !t.video_bg_url} onclick={deleteVideo}>
                        Удалить видео
                      </button>
                    </div>
                    <div class="kq-video-admin__meta">
                      {#if t.trailer_url}
                        <span class="kq-info-card__text">Трейлер Kitsu: {t.trailer_url}</span>
                      {/if}
                      {#if t.video_bg_source_url}
                        <span class="kq-info-card__text">Источник: {t.video_bg_source_url}</span>
                      {/if}
                      {#if t.video_bg_updated_at}
                        <span class="kq-info-card__text">Обновлено: {formatFullDate(t.video_bg_updated_at)}</span>
                      {/if}
                    </div>
                    {#if videoMsg}
                      <p class="kq-form-msg {videoMsgKind === 'error' ? 'kq-form-msg--error' : 'kq-form-msg--success'}">{videoMsg}</p>
                      {#if videoMsgKind === 'error' && needsYoutubeAuth(videoMsg)}
                        <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" onclick={openYtCookiesDialog}>
                          Войти в YouTube
                        </button>
                      {/if}
                    {/if}
                  </div>
                </div>
              </div>

              <div class="kq-detail__section">
                <h3 class="kq-detail__section-title">Аудио фон</h3>
                <div class="kq-video-admin">
                  <div class="kq-video-admin__preview kq-video-admin__preview--audio">
                    {#if t.audio_bg_url}
                      <audio
                        class="kq-video-admin__player kq-video-admin__player--audio"
                        src={resolveAudioPreviewUrl(t)}
                        controls
                        preload="metadata"
                      ></audio>
                    {:else}
                      <div class="kq-video-admin__placeholder kq-video-admin__placeholder--empty">Нет аудио</div>
                    {/if}
                    {#if audioBusy}
                      <div class="kq-video-admin__overlay" aria-hidden="true">
                        <span>{Math.round(audioProgressPct)}%</span>
                      </div>
                    {/if}
                  </div>
                  <div class="kq-video-admin__controls">
                    <p class="kq-info-card__text">Скачивается с той же YouTube-ссылки, что и видео выше.</p>
                    <div class="kq-video-admin__row">
                      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={audioBusy || !videoUrlInput.trim()} onclick={() => void loadYoutubeAudioFormats()}>
                        {youtubeAudioFormatsLoading ? 'Форматы…' : 'Список форматов'}
                      </button>
                      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={audioBusy || !videoUrlInput.trim()} onclick={() => void saveYoutubeAudio()}>
                        {audioBusy ? `${Math.round(audioProgressPct)}%` : 'Скачать аудио с YouTube'}
                      </button>
                      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={audioBusy || !t.audio_bg_url} onclick={() => void deleteAudio()}>
                        Удалить аудио
                      </button>
                    </div>
                    {#if audioBusy || audioProgressPct > 0}
                      <div
                        class="kq-video-progress"
                        role="progressbar"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow={Math.round(audioProgressPct)}
                        aria-label={audioProgressMsg || 'Обработка аудио'}
                      >
                        <div class="kq-video-progress__track">
                          <div class="kq-video-progress__fill" style="width: {Math.max(2, audioProgressPct)}%"></div>
                        </div>
                        <div class="kq-video-progress__label">
                          <span>{audioProgressMsg || (audioBusy ? 'Обработка…' : 'Готово')}</span>
                          <span>{Math.round(audioProgressPct)}%</span>
                        </div>
                      </div>
                    {/if}
                    {#if youtubeAudioFormats.length > 0}
                      <div class="kq-field">
                        <label class="kq-field__label" for="kq-audio-itag">Аудиоформат</label>
                        <select
                          id="kq-audio-itag"
                          class="kq-field__input"
                          bind:value={audioItag}
                          disabled={audioBusy}
                        >
                          <option value="">Автовыбор</option>
                          {#each youtubeAudioFormats as f (formatKey(f))}
                            <option value={formatKey(f)}>
                              {f.qualityLabel}{f.container ? ` · ${f.container}` : ''}{f.hasVideo ? ' · с видеодорожкой' : ''} · {formatBytes(f.filesizeBytes)}{f.itag >= 0 ? ` · itag ${f.itag}` : ` · ${formatKey(f)}`}
                            </option>
                          {/each}
                        </select>
                      </div>
                    {/if}
                    <div class="kq-video-admin__meta">
                      {#if t.audio_bg_source_url}
                        <span class="kq-info-card__text">Источник: {t.audio_bg_source_url}</span>
                      {/if}
                      {#if t.audio_bg_updated_at}
                        <span class="kq-info-card__text">Обновлено: {formatFullDate(t.audio_bg_updated_at)}</span>
                      {/if}
                    </div>
                    {#if audioMsg}
                      <p class="kq-form-msg {audioMsgKind === 'error' ? 'kq-form-msg--error' : 'kq-form-msg--success'}">{audioMsg}</p>
                      {#if audioMsgKind === 'error' && needsYoutubeAuth(audioMsg)}
                        <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" onclick={openYtCookiesDialog}>
                          Войти в YouTube
                        </button>
                      {/if}
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Images section -->
              <div class="kq-detail__section">
                <h3 class="kq-detail__section-title">Изображения</h3>
                <div class="kq-detail__images">
                  <div class="kq-detail__img-card">
                    {#if t.poster_url}
                      <img src={resolveImagePreviewUrl(t.poster_url, t.poster_updated_at)} alt="Poster" />
                    {:else}
                      <div class="kq-detail__img-empty">Нет постера</div>
                    {/if}
                    <span class="kq-detail__img-label">Постер{t.poster_custom ? ' · свой' : ''}</span>
                    <div class="kq-detail__img-actions">
                      <label class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm kq-file-btn">
                        Заменить
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={imageBusy}
                          onchange={(e) => {
                            const file = (e.currentTarget as HTMLInputElement).files?.[0];
                            if (file) void uploadTitleImage('poster', file);
                            (e.currentTarget as HTMLInputElement).value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm"
                        disabled={imageBusy || !t.poster_source_url}
                        onclick={() => void resetTitleImage('poster')}
                      >
                        С Kitsu
                      </button>
                    </div>
                  </div>
                  <div class="kq-detail__img-card kq-detail__img-card--wide">
                    {#if t.cover_url}
                      <img src={resolveImagePreviewUrl(t.cover_url, t.cover_updated_at)} alt="Cover" />
                    {:else}
                      <div class="kq-detail__img-empty kq-detail__img-empty--wide">Нет обложки</div>
                    {/if}
                    <span class="kq-detail__img-label">Обложка{t.cover_custom ? ' · своя' : ''}</span>
                    <div class="kq-detail__img-actions">
                      <label class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm kq-file-btn">
                        Заменить
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={imageBusy}
                          onchange={(e) => {
                            const file = (e.currentTarget as HTMLInputElement).files?.[0];
                            if (file) void uploadTitleImage('cover', file);
                            (e.currentTarget as HTMLInputElement).value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm"
                        disabled={imageBusy || !t.cover_source_url}
                        onclick={() => void resetTitleImage('cover')}
                      >
                        С Kitsu
                      </button>
                    </div>
                  </div>
                </div>
                {#if imageMsg}
                  <p class="kq-form-msg {imageMsgKind === 'error' ? 'kq-form-msg--error' : 'kq-form-msg--success'}">{imageMsg}</p>
                {/if}
              </div>

              <!-- Episodes table -->
              {#if t.episodes.length > 0}
                <div class="kq-detail__section">
                  <h3 class="kq-detail__section-title">Серии ({t.episodes.length})</h3>
                  <table class="kq-table kq-table--episodes">
                    <thead>
                      <tr><th>#</th><th>Превью</th><th class="kq-th--grow">Название EN</th><th class="kq-th--grow">Название RU</th><th>Длит.</th><th>Дата</th></tr>
                    </thead>
                    <tbody>
                      {#each t.episodes as ep (ep.number)}
                        <tr class="kq-row">
                          <td class="kq-cell--mono">{ep.number}</td>
                          <td>
                            {#if ep.thumbnail}
                              <img class="kq-ep-thumb" src={ep.thumbnail} alt="" loading="lazy" />
                            {:else}
                              <span class="kq-cell--muted">—</span>
                            {/if}
                          </td>
                          <td class="kq-cell--title">{ep.title_en ?? '—'}</td>
                          <td class="kq-cell--title">{ep.title_ru ?? '—'}</td>
                          <td class="kq-cell--mono kq-cell--muted">{ep.length ? `${ep.length}м` : '—'}</td>
                          <td class="kq-cell--time">{ep.aired_at ? formatDate(ep.aired_at) : '—'}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {:else}
                <div class="kq-detail__section">
                  <p class="kq-info-card__text">Эпизоды не найдены</p>
                </div>
              {/if}

            </div>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>

        {:else}
          <div class="kq-empty">
            <div class="kq-empty__icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M3 9h18" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </div>
            <p class="kq-empty__text">Выберите тайтл из списка слева</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if view === 'suggestions'}
    <div class="kq-body">
      <aside class="kq-sidebar kq-sidebar--db">
        <p class="kq-card__label">Очередь предложений</p>
        {#if suggestionsLoading && suggestions.length === 0}
          <p class="kq-info-card__text">Загрузка…</p>
        {:else if suggestionsError}
          <p class="kq-form-msg kq-form-msg--error">{suggestionsError}</p>
        {:else if suggestions.length === 0}
          <div class="kq-empty">
            <p class="kq-empty__text">Предложений нет</p>
          </div>
        {:else}
          <div class="kq-db-list uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <div class="uiv2-scroll-area__viewport">
              {#each suggestions as item (item.id)}
                <button
                  type="button"
                  class="kq-db-item"
                  class:kq-db-item--active={selectedSuggestion?.id === item.id}
                  onclick={() => selectSuggestion(item)}
                >
                  <div class="kq-db-item__info">
                    <span class="kq-db-item__name">{item.title_en || `Anixart ${item.anixart_id}`}</span>
                    <span class="kq-db-item__meta">
                      {item.kind === 'trailer' ? 'Трейлер' : 'Баннер'} · {suggestionAuthor(item)}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>
        {/if}
      </aside>

      <div class="kq-main">
        {#if selectedSuggestion}
          {@const s = selectedSuggestion}
          <div class="kq-detail uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <div class="kq-detail__inner uiv2-scroll-area__viewport">
              <div class="kq-detail__head-info">
                <h2 class="kq-detail__title">{s.title_en || `Anixart ${s.anixart_id}`}</h2>
                <div class="kq-detail__meta-row">
                  <span class="kq-detail__chip">Anixart {s.anixart_id}</span>
                  <span class="kq-detail__chip">{s.kind === 'trailer' ? 'Трейлер' : 'Баннер'}</span>
                  <span class="kq-detail__chip">{suggestionAuthor(s)}</span>
                </div>
                <div class="kq-detail__timing">
                  <span class="kq-detail__fetched">Отправлено: {formatFullDate(s.created_at)}</span>
                </div>
              </div>

              <div class="kq-detail__section">
                <h3 class="kq-detail__section-title">Ссылка</h3>
                <p class="kq-info-card__text kq-suggest-url">{s.url}</p>
                {#if s.kind === 'banner'}
                  <img class="kq-suggest-preview" src={s.url} alt="Предложенный баннер" />
                {:else}
                  <a class="kq-suggest-link" href={s.url} target="_blank" rel="noopener noreferrer">Открыть на YouTube</a>
                {/if}
              </div>

              {#if s.kind === 'trailer'}
                <div class="kq-detail__section">
                  <h3 class="kq-detail__section-title">Качество и звук</h3>
                  <div class="kq-video-admin__row">
                    <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={suggestionBusy} onclick={() => void loadSuggestionFormats()}>
                      {(youtubeFormatsLoading || youtubeAudioFormatsLoading) ? 'Форматы…' : 'Обновить форматы'}
                    </button>
                  </div>
                  {#if youtubeFormats.length > 0}
                    <div class="kq-field">
                      <label class="kq-field__label" for="kq-sug-video">Видео</label>
                      <select id="kq-sug-video" class="kq-field__input" bind:value={videoItag} disabled={suggestionBusy}>
                        <option value="">Автовыбор</option>
                        {#each youtubeFormats as f (formatKey(f))}
                          <option value={formatKey(f)}>
                            {f.qualityLabel}{f.height != null ? ` (${f.height}p)` : ''}{f.container ? ` · ${f.container}` : ''} · {formatBytes(f.filesizeBytes)}
                          </option>
                        {/each}
                      </select>
                    </div>
                  {/if}
                  {#if youtubeAudioFormats.length > 0 && !suggestionSkipAudio}
                    <div class="kq-field">
                      <label class="kq-field__label" for="kq-sug-audio">Звук</label>
                      <select id="kq-sug-audio" class="kq-field__input" bind:value={audioItag} disabled={suggestionBusy}>
                        <option value="">Автовыбор</option>
                        {#each youtubeAudioFormats as f (formatKey(f))}
                          <option value={formatKey(f)}>
                            {f.qualityLabel}{f.container ? ` · ${f.container}` : ''} · {formatBytes(f.filesizeBytes)}
                          </option>
                        {/each}
                      </select>
                    </div>
                  {/if}
                  <label class="kq-suggest-check">
                    <input type="checkbox" bind:checked={suggestionSkipAudio} disabled={suggestionBusy} />
                    <span>Не скачивать звук</span>
                  </label>
                  {#if suggestionBusy || videoProgressPct > 0}
                    <div class="kq-video-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(videoProgressPct)}>
                      <div class="kq-video-progress__track">
                        <div class="kq-video-progress__fill" style="width: {Math.max(2, videoProgressPct)}%"></div>
                      </div>
                      <div class="kq-video-progress__label">
                        <span>{videoProgressMsg || (suggestionBusy ? 'Обработка…' : 'Готово')}</span>
                        <span>{Math.round(videoProgressPct)}%</span>
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              <div class="kq-detail__actions">
                <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" disabled={suggestionBusy} onclick={() => void acceptSuggestion()}>
                  {suggestionBusy ? 'Сохранение…' : 'Принять'}
                </button>
                <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={suggestionBusy} onclick={() => void rejectSuggestion()}>
                  Отклонить
                </button>
                {#if selectedSuggestion.user_id}
                  <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={suggestionBusy} onclick={() => void banSelectedSuggestion()}>
                    Забанить
                  </button>
                {/if}
              </div>
              {#if suggestionMsg}
                <p class="kq-form-msg {suggestionMsgKind === 'error' ? 'kq-form-msg--error' : 'kq-form-msg--success'}">{suggestionMsg}</p>
                {#if suggestionMsgKind === 'error' && needsYoutubeAuth(suggestionMsg)}
                  <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" onclick={openYtCookiesDialog}>
                    Войти в YouTube
                  </button>
                {/if}
              {/if}
            </div>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>
        {:else}
          <div class="kq-empty">
            <p class="kq-empty__text">Выберите предложение слева</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if view === 'bans'}
    <div class="kq-body">
      <aside class="kq-sidebar kq-sidebar--db">
        <p class="kq-card__label">Забанить</p>
        <div class="kq-card">
          <div class="kq-card__body">
            <div class="kq-field">
              <label class="kq-field__label" for="kq-ban-id">Anixart ID</label>
              <input
                id="kq-ban-id"
                type="number"
                class="kq-field__input"
                placeholder="487033"
                bind:value={banFormUserId}
                disabled={banBusy}
                onblur={() => void lookupBanLogin()}
              />
            </div>
            <div class="kq-field">
              <label class="kq-field__label" for="kq-ban-login">Логин</label>
              <input
                id="kq-ban-login"
                type="text"
                class="kq-field__input"
                placeholder="необязательно"
                bind:value={banFormLogin}
                disabled={banBusy}
              />
            </div>
            <div class="kq-field">
              <label class="kq-field__label" for="kq-ban-reason">Причина</label>
              <input
                id="kq-ban-reason"
                type="text"
                class="kq-field__input"
                placeholder="необязательно"
                bind:value={banFormReason}
                disabled={banBusy}
              />
            </div>
            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" disabled={banBusy} onclick={() => void banFromForm()}>
              {banBusy ? 'Сохранение…' : 'Забанить'}
            </button>
          </div>
        </div>
        <p class="kq-card__label">Список банов</p>
        {#if bansLoading && bans.length === 0}
          <p class="kq-info-card__text">Загрузка…</p>
        {:else if bansError}
          <p class="kq-form-msg kq-form-msg--error">{bansError}</p>
        {:else if bans.length === 0}
          <div class="kq-empty">
            <p class="kq-empty__text">Банов нет</p>
          </div>
        {:else}
          <div class="kq-db-list uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <div class="uiv2-scroll-area__viewport">
              {#each bans as item (item.user_id)}
                <button
                  type="button"
                  class="kq-db-item"
                  class:kq-db-item--active={selectedBan?.user_id === item.user_id}
                  onclick={() => { selectedBan = item; banMsg = ''; banMsgKind = ''; }}
                >
                  <div class="kq-db-item__info">
                    <span class="kq-db-item__name">{item.user_login || `ID ${item.user_id}`}</span>
                    <span class="kq-db-item__meta">ID {item.user_id}{item.reason ? ` · ${item.reason}` : ''}</span>
                  </div>
                </button>
              {/each}
            </div>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>
        {/if}
      </aside>

      <div class="kq-main">
        {#if selectedBan}
          <div class="kq-detail uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <div class="kq-detail__inner uiv2-scroll-area__viewport">
              <div class="kq-detail__head-info">
                <h2 class="kq-detail__title">{selectedBan.user_login || `ID ${selectedBan.user_id}`}</h2>
                <div class="kq-detail__meta-row">
                  <span class="kq-detail__chip">ID {selectedBan.user_id}</span>
                  <span class="kq-detail__chip">Забанил ID {selectedBan.banned_by}</span>
                </div>
                <div class="kq-detail__timing">
                  <span class="kq-detail__fetched">Бан с {formatFullDate(selectedBan.created_at)}</span>
                </div>
              </div>
              <div class="kq-detail__section">
                <h3 class="kq-detail__section-title">Причина</h3>
                <p class="kq-info-card__text">{selectedBan.reason.trim() || 'Не указана'}</p>
              </div>
              <div class="kq-detail__actions">
                <button
                  type="button"
                  class="uiv2-btn uiv2-btn--primary uiv2-btn--sm"
                  disabled={banBusy}
                  onclick={() => void unbanUser(selectedBan!.user_id)}
                >
                  {banBusy ? 'Снятие…' : 'Снять бан'}
                </button>
              </div>
              {#if banMsg}
                <p class="kq-form-msg {banMsgKind === 'error' ? 'kq-form-msg--error' : 'kq-form-msg--success'}">{banMsg}</p>
              {/if}
            </div>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>
        {:else}
          <div class="kq-empty">
            <p class="kq-empty__text">Выберите бан слева или добавьте новый</p>
            {#if banMsg}
              <p class="kq-form-msg {banMsgKind === 'error' ? 'kq-form-msg--error' : 'kq-form-msg--success'}">{banMsg}</p>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if ytCookiesDialogOpen}
    <div
      class="kq-yt-overlay"
      role="presentation"
      tabindex="-1"
      onclick={closeYtCookiesDialog}
      onkeydown={(e) => { if (e.key === 'Escape') closeYtCookiesDialog(); }}
    >
      <div
        class="kq-yt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kq-yt-dialog-title"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
      >
        <h2 id="kq-yt-dialog-title" class="kq-yt-dialog__title">Вход в YouTube</h2>
        <p class="kq-yt-dialog__lead">
          Часть роликов YouTube не скачивается без аккаунта. Вход откроется в Chrome или Edge — Google блокирует встроенное окно приложения. Куки уйдут только на AnixBack для yt-dlp и не попадут в Anixart.
        </p>
        <p class="kq-yt-dialog__status">
          {#if ytCookiesStatus?.configured && ytCookiesStatus.source === 'upload'}
            На сервере есть куки из админки{ytCookiesStatus.cookieCount ? ` (${ytCookiesStatus.cookieCount})` : ''}{ytCookiesStatus.updatedAt ? ` · ${formatFullDate(ytCookiesStatus.updatedAt)}` : ''}.
          {:else if ytCookiesStatus?.source === 'env_file'}
            На сервере задан файл через YT_DLP_COOKIES_FILE.
          {:else if ytCookiesStatus?.source === 'env_browser'}
            Сервер читает куки из локального браузера.
          {:else}
            Куки на сервере не заданы.
          {/if}
        </p>
        <div class="kq-yt-dialog__actions">
          <button
            type="button"
            class="uiv2-btn uiv2-btn--primary uiv2-btn--sm"
            disabled={ytCookiesBusy}
            onclick={() => void loginYoutubeAndUpload()}
          >
            {ytCookiesBusy ? 'Ожидание…' : 'Войти в YouTube'}
          </button>
          <button
            type="button"
            class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm"
            disabled={ytCookiesBusy}
            onclick={() => ytCookiesFileInput?.click()}
          >
            Загрузить cookies.txt
          </button>
          {#if ytCookiesStatus?.source === 'upload'}
            <button
              type="button"
              class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm"
              disabled={ytCookiesBusy}
              onclick={() => void deleteYtCookies()}
            >
              Удалить куки
            </button>
          {/if}
          <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={ytCookiesBusy} onclick={closeYtCookiesDialog}>
            Закрыть
          </button>
        </div>
        <input
          bind:this={ytCookiesFileInput}
          class="kq-yt-dialog__file"
          type="file"
          accept=".txt,text/plain"
          onchange={(e) => void onYtCookiesFile(e)}
        />
        {#if ytCookiesMsg}
          <p class="kq-form-msg {ytCookiesMsgKind === 'error' ? 'kq-form-msg--error' : 'kq-form-msg--success'}">{ytCookiesMsg}</p>
        {/if}
      </div>
    </div>
  {/if}

</div>

<style lang="scss">
.kq-root {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--uikit-v2-bg);
  color: var(--uikit-v2-text);
  font-family: var(--uikit-v2-font);
}

/* ── Header ── */
.kq-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1.25rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-surface);
  flex-shrink: 0;
}

.kq-header__left { display: flex; align-items: center; gap: 0.5rem; }

.kq-view-btn {
  border: 0;
  background: transparent;
  color: var(--uiv2-fg-muted);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.3rem 0.7rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;

  &:hover { background: var(--uiv2-hover-bg); color: var(--uikit-v2-text); }

  &--active {
    background: color-mix(in srgb, var(--uikit-v2-accent) 12%, transparent);
    color: var(--uikit-v2-accent);
    font-weight: 600;
  }
}

.kq-view-btn__count {
  font-size: 0.65rem;
  font-weight: 700;
  background: color-mix(in srgb, var(--uiv2-fg-muted) 15%, transparent);
  padding: 0.05rem 0.35rem;
  border-radius: 999px;

  .kq-view-btn--active & {
    background: color-mix(in srgb, var(--uikit-v2-accent) 20%, transparent);
  }
}

.kq-title { font-size: 0.875rem; font-weight: 600; }

.kq-ws-badge {
  font-size: 0.62rem;
  font-weight: 600;
  padding: 0.08rem 0.4rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--uiv2-fg-muted) 12%, transparent);
  color: var(--uiv2-fg-muted);
  &--open { background: color-mix(in srgb, var(--uikit-v2-accent) 15%, transparent); color: var(--uikit-v2-accent); }
  &--error { background: color-mix(in srgb, var(--uikit-v2-danger) 15%, transparent); color: var(--uikit-v2-danger); }
}

.kq-header__stats { display: flex; align-items: center; gap: 0.5rem; flex: 1; }

.kq-stat {
  font-size: 0.72rem; font-weight: 600; padding: 0.1rem 0.5rem; border-radius: 6px;
  &--pending { background: color-mix(in srgb, var(--uiv2-fg-muted) 12%, transparent); color: var(--uiv2-fg-muted); }
  &--running { background: color-mix(in srgb, var(--uikit-v2-accent) 15%, transparent); color: var(--uikit-v2-accent); }
  &--done    { background: color-mix(in srgb, #4ade80 15%, transparent); color: #4ade80; }
  &--error   { background: color-mix(in srgb, var(--uikit-v2-danger) 15%, transparent); color: var(--uikit-v2-danger); }
}

/* ── Body ── */
.kq-body {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

/* ── Sidebar ── */
.kq-sidebar {
  border-right: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-surface);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  overflow-y: auto;
}

.kq-sidebar--db {
  gap: 0.35rem;
  overflow: hidden;
}

.kq-card {
  border-radius: 12px;
  border: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-bg);
  overflow: hidden;
}

.kq-card__label {
  margin: 0; padding: 0.55rem 1rem 0;
  font-size: 0.67rem; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--uiv2-fg-muted);
}

.kq-card__body { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.55rem 1rem 0.9rem; }

.kq-field { display: flex; flex-direction: column; gap: 0.25rem; }

.kq-field__label { font-size: 0.72rem; font-weight: 600; color: var(--uiv2-fg-muted); }

.kq-field__input {
  width: 100%; box-sizing: border-box;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--uiv2-border-subtle);
  border-radius: 8px;
  background: var(--uikit-v2-bg);
  color: var(--uikit-v2-text);
  font: inherit; font-size: 0.875rem;
  outline: none;
  &:focus { border-color: var(--uikit-v2-accent); }
}

.kq-btn-full { width: 100%; justify-content: center; }

.kq-form-msg {
  margin: 0; font-size: 0.78rem; padding: 0.3rem 0.5rem; border-radius: 6px;
  &--error { color: var(--uikit-v2-danger); background: color-mix(in srgb, var(--uikit-v2-danger) 10%, transparent); }
  &--success { color: #4ade80; background: color-mix(in srgb, #4ade80 10%, transparent); }
}

.kq-info-card {
  border-radius: 10px;
  border: 1px solid var(--uiv2-border-subtle);
  padding: 0.65rem 0.85rem;
}

.kq-info-card__text { margin: 0; font-size: 0.78rem; line-height: 1.5; color: var(--uiv2-fg-muted); }

/* ── DB List ── */
.kq-db-list { flex: 1 1 0; min-height: 0; position: relative; }

.kq-db-list__inner { display: block; }

.kq-db-list__spacer { width: 100%; pointer-events: none; }

.kq-db-item {
  display: flex; align-items: center; gap: 0.6rem;
  width: 100%; height: 60px; box-sizing: border-box;
  padding: 0 0.6rem;
  border: 0; border-radius: 8px;
  background: transparent; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
  contain: content;

  &:hover { background: var(--uiv2-hover-bg); }
  &--active { background: color-mix(in srgb, var(--uikit-v2-accent) 10%, transparent); }
}

.kq-db-item__poster {
  width: 2.2rem; height: 3rem;
  border-radius: 5px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--uiv2-surface-raised);

  &--empty {
    display: flex; align-items: center; justify-content: center;
    color: var(--uiv2-fg-muted);
  }
}

.kq-db-item__info { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; flex: 1; }

.kq-db-item__name {
  font-size: 0.8rem; font-weight: 500; color: var(--uikit-v2-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.kq-db-item__meta { font-size: 0.68rem; color: var(--uiv2-fg-muted); }

/* ── Main (table/detail) ── */
.kq-main { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

.kq-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 0.75rem; color: var(--uiv2-fg-muted);
}

.kq-empty__icon {
  width: 3rem; height: 3rem;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--uiv2-surface-raised);
}

.kq-empty__text { margin: 0; font-size: 0.875rem; }

.kq-table-wrap { flex: 1 1 0; min-height: 0; position: relative; }

.kq-table {
  width: 100%; border-collapse: collapse; font-size: 0.8125rem;
  th {
    position: sticky; top: 0; z-index: 1;
    background: var(--uikit-v2-surface);
    color: var(--uiv2-fg-muted); font-size: 0.7rem; font-weight: 700;
    letter-spacing: 0.05em; text-transform: uppercase;
    padding: 0.55rem 0.9rem; text-align: left; border-bottom: 1px solid var(--uiv2-border-subtle);
    white-space: nowrap;
  }
  td { padding: 0.55rem 0.9rem; border-bottom: 1px solid var(--uiv2-border-subtle); vertical-align: middle; }
}

.kq-th--grow { width: 100%; }

.kq-row {
  transition: background 0.1s ease;
  &:hover { background: var(--uiv2-hover-bg); }
  &--running { background: color-mix(in srgb, var(--uikit-v2-accent) 4%, transparent); }
  &--error   { background: color-mix(in srgb, var(--uikit-v2-danger) 4%, transparent); }
}

.kq-cell--mono { font-family: 'Courier New', monospace; font-size: 0.78rem; }
.kq-cell--muted { color: var(--uiv2-fg-muted); }
.kq-cell--title { max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kq-cell--time { color: var(--uiv2-fg-muted); white-space: nowrap; font-size: 0.75rem; }

.kq-badge {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 5px;
  color: var(--c, var(--uiv2-fg-muted));
  background: color-mix(in srgb, var(--c, var(--uiv2-fg-muted)) 12%, transparent);
  &--pulse::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: var(--c, var(--uikit-v2-accent)); flex-shrink: 0;
    animation: kq-pulse 1.2s ease-in-out infinite;
  }
}

.kq-error-hint {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.1rem; height: 1.1rem; border-radius: 50%;
  background: color-mix(in srgb, var(--uikit-v2-danger) 15%, transparent);
  color: var(--uikit-v2-danger); font-size: 0.65rem; font-weight: 700;
  margin-left: 0.25rem; cursor: help; vertical-align: middle;
}

/* ── Detail view ── */
.kq-detail { flex: 1 1 0; min-height: 0; position: relative; }

.kq-detail__inner { padding-bottom: 2rem; }

.kq-detail__head {
  position: relative;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  overflow: hidden;
}

.kq-detail__cover {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.15;
  filter: blur(8px);
}

.kq-detail__head-row { display: flex; gap: 1.25rem; align-items: flex-start; position: relative; z-index: 1; }

.kq-detail__poster {
  width: 5rem; height: 7rem;
  border-radius: 8px; object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 2px 12px rgba(0,0,0,0.35);
}

.kq-detail__head-info { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }

.kq-detail__title { margin: 0; font-size: 1.1rem; font-weight: 600; line-height: 1.3; }

.kq-detail__meta-row { display: flex; flex-wrap: wrap; gap: 0.35rem; }

.kq-detail__chip {
  font-size: 0.67rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 5px;
  background: color-mix(in srgb, var(--uiv2-fg-muted) 12%, transparent); color: var(--uiv2-fg-muted);
  &--accent { background: color-mix(in srgb, var(--uikit-v2-accent) 15%, transparent); color: var(--uikit-v2-accent); }
}

.kq-detail__timing { display: flex; flex-direction: column; gap: 0.15rem; margin-top: 0.1rem; }

.kq-detail__fetched { font-size: 0.72rem; color: var(--uiv2-fg-muted); }

.kq-detail__refresh-sched {
  font-size: 0.72rem;
  color: var(--uikit-v2-accent);
  opacity: 0.8;
}

.kq-detail__actions {
  display: flex; align-items: center; gap: 0.75rem;
  margin-top: 0.75rem; position: relative; z-index: 1;
}

.kq-detail__refresh-msg {
  font-size: 0.78rem; color: #4ade80;
}

.kq-detail__section {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
}

.kq-video-admin {
  display: grid;
  grid-template-columns: minmax(0, 18rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.kq-video-admin__preview {
  min-width: 0;
  position: relative;
}

.kq-video-admin__preview--audio {
  min-height: 4.5rem;
}

.kq-video-admin__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: color-mix(in srgb, #000 45%, transparent);
  color: #fff;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  pointer-events: none;
}

.kq-video-admin__player,
.kq-video-admin__placeholder {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  object-fit: cover;
  background: var(--uiv2-surface-raised);
  border: 1px solid var(--uiv2-border-subtle);
}

.kq-video-admin__placeholder--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--uiv2-fg-muted);
  font-size: 0.8rem;
}

.kq-video-admin__player--audio {
  aspect-ratio: auto;
  height: 2.75rem;
  object-fit: unset;
}

.kq-video-admin__controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.kq-video-admin__row {
  display: flex;
  gap: 0.75rem;
  align-items: end;
  flex-wrap: wrap;
}

.kq-video-progress {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.kq-video-progress__track {
  height: 8px;
  border-radius: 999px;
  background: var(--uiv2-surface-raised);
  border: 1px solid var(--uiv2-border-subtle);
  overflow: hidden;
}

.kq-video-progress__fill {
  height: 100%;
  border-radius: inherit;
  background: var(--uikit-v2-accent);
  transition: width 0.2s ease;
}

.kq-video-progress__label {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.78rem;
  color: var(--uiv2-fg-muted);
}

.kq-video-admin__meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.kq-file-btn {
  position: relative;
  overflow: hidden;

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}

.kq-detail__section-title {
  margin: 0 0 0.75rem;
  font-size: 0.8rem; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.kq-detail__images { display: flex; gap: 1rem; flex-wrap: wrap; }

.kq-detail__img-card {
  display: flex; flex-direction: column; gap: 0.3rem;
  img {
    max-height: 8rem; border-radius: 8px; object-fit: cover;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }
  &--wide img { max-height: 6rem; max-width: 20rem; }
}

.kq-detail__img-label { font-size: 0.68rem; color: var(--uiv2-fg-muted); text-align: center; }

.kq-detail__img-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: center;
}

.kq-detail__img-empty {
  width: 5.5rem;
  height: 8rem;
  border-radius: 8px;
  background: var(--uiv2-hover-bg);
  color: var(--uiv2-fg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  text-align: center;
  padding: 0.4rem;

  &--wide {
    width: 16rem;
    height: 6rem;
  }
}

.kq-table--episodes {
  th, td { padding: 0.4rem 0.7rem; }
}

.kq-ep-thumb {
  width: 4.5rem; aspect-ratio: 16/9;
  border-radius: 5px; object-fit: cover;
  background: var(--uiv2-surface-raised);
}

.kq-suggest-url {
  word-break: break-all;
}

.kq-suggest-preview {
  display: block;
  width: min(100%, 28rem);
  max-height: 10rem;
  margin-top: 0.65rem;
  border-radius: 10px;
  object-fit: cover;
}

.kq-suggest-link {
  display: inline-block;
  margin-top: 0.45rem;
  color: var(--uikit-v2-accent);
  font-size: 0.85rem;
}

.kq-suggest-check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.55rem;
  font-size: 0.82rem;
  color: var(--uikit-v2-text);
  cursor: pointer;
}

.kq-yt-status {
  border: 0;
  background: color-mix(in srgb, var(--uiv2-fg-muted) 12%, transparent);
  color: var(--uiv2-fg-muted);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.28rem 0.65rem;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s ease, color 0.12s ease;

  &:hover { background: var(--uiv2-hover-bg); color: var(--uikit-v2-text); }

  &--ok {
    background: color-mix(in srgb, #4ade80 15%, transparent);
    color: #4ade80;
  }
}

.kq-yt-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: color-mix(in srgb, #000 55%, transparent);
}

.kq-yt-dialog {
  position: relative;
  width: min(32rem, 100%);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.15rem 1.2rem 1.2rem;
  border-radius: 14px;
  border: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-surface);
  color: var(--uikit-v2-text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);

  &:focus { outline: none; }

  &__title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
  }

  &__lead,
  &__status {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.45;
    color: var(--uiv2-fg-muted);
  }

  &__status { color: var(--uikit-v2-text); }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  &__file {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
}

@keyframes kq-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}
</style>
