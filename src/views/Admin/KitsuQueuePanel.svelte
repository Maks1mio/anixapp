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

  interface KitsuTitle {
    anixart_id: number;
    kitsu_id: string;
    title_en: string;
    trailer_url: string | null;
    poster_url: string | null;
    cover_url: string | null;
    episodes: KitsuEpisode[];
    episode_count: number | null;
    translations_available: boolean;
    fetched_at: string;
    job_status: string | null;
    media_status: KitsuMediaStatus | null;
    next_refresh_at: string | null;
    video_bg_url: string | null;
    video_bg_source_url: string | null;
    video_bg_quality: number | null;
    video_bg_updated_at: string | null;
  }

  const MEDIA_STATUS_META: Record<string, { label: string; color: string }> = {
    current:    { label: 'Онгоинг',   color: 'var(--uikit-v2-accent)' },
    upcoming:   { label: 'Анонс',     color: '#f59e0b' },
    finished:   { label: 'Завершён',  color: 'var(--uikit-v2-success, #4ade80)' },
    tba:        { label: 'TBA',       color: 'var(--uiv2-fg-muted)' },
    unreleased: { label: 'Не вышел', color: 'var(--uiv2-fg-muted)' },
  };

  type View = 'queue' | 'database';

  let view = $state<View>('queue');

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
  let titles = $state<KitsuTitle[]>([]);
  let titlesLoading = $state(false);
  let titlesError = $state('');
  let selectedTitle = $state<KitsuTitle | null>(null);
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

  const filteredTitles = $derived(
    dbSearch.trim()
      ? titles.filter(t =>
          t.title_en.toLowerCase().includes(dbSearch.toLowerCase()) ||
          String(t.anixart_id).includes(dbSearch) ||
          t.kitsu_id.includes(dbSearch)
        )
      : titles
  );

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
      const res = await fetch(`${getApiBase()}/kitsu/titles?limit=500`, {
        headers: { 'X-Admin-Token': token },
        signal: AbortSignal.timeout(10_000),
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

  const STATUS_META: Record<string, { label: string; color: string; pulse: boolean }> = {
    pending: { label: 'Ожидает', color: 'var(--uiv2-fg-muted)', pulse: false },
    running: { label: 'Выполняется', color: 'var(--uikit-v2-accent)', pulse: true },
    done:    { label: 'Готово', color: 'var(--uikit-v2-success, #4ade80)', pulse: false },
    error:   { label: 'Ошибка', color: 'var(--uikit-v2-danger)', pulse: false },
  };

  function switchView(v: View) {
    view = v;
    if (v === 'database' && titles.length === 0) void loadTitles();
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

  function selectTitle(title: KitsuTitle): void {
    selectedTitle = title;
    refreshMsg = '';
    videoMsg = '';
    videoMsgKind = '';
    resetVideoProgress();
    youtubeFormats = [];
    videoItag = '';
    videoMaxSizeMb = '';
    videoUrlInput = title.video_bg_source_url ?? title.trailer_url ?? '';
  }

  function applyUpdatedTitle(updated: KitsuTitle): void {
    titles = titles.map((item) => item.anixart_id === updated.anixart_id ? updated : item);
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
      const itagNum = videoItag.trim() ? Number(videoItag) : undefined;
      const selectedFormat = youtubeFormats.find((f) => f.itag === itagNum);
      const height = selectedFormat?.height ?? 0;
      const quality = height >= 1080 ? 1080 : height >= 720 ? 720 : height >= 480 ? 480 : height >= 360 ? 360 : 1080;
      const maxSizeMb = Number(videoMaxSizeMb.trim() || 0);
      const res = await fetch(`${getApiBase()}/kitsu/video/${selectedTitle.anixart_id}/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token, Accept: 'application/x-ndjson' },
        body: JSON.stringify({
          url: videoUrlInput.trim(),
          itag: itagNum,
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
      if (best) videoItag = String(best.itag);
    } catch (e) {
      videoMsg = e instanceof Error ? e.message : 'Ошибка сети';
      videoMsgKind = 'error';
    } finally {
      youtubeFormatsLoading = false;
    }
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

  onMount(() => { connect(); });

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
    {#if view === 'queue'}
      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={requestRefresh}>Обновить</button>
    {:else}
      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={loadTitles} disabled={titlesLoading}>
        {titlesLoading ? 'Загрузка…' : 'Обновить'}
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
  {:else}
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
            <div class="kq-db-list__inner uiv2-scroll-area__viewport">
              {#each filteredTitles as t (t.anixart_id)}
                <button
                  type="button"
                  class="kq-db-item"
                  class:kq-db-item--active={selectedTitle?.anixart_id === t.anixart_id}
                  onclick={() => selectTitle(t)}
                >
                  {#if t.poster_url}
                    <img class="kq-db-item__poster" src={t.poster_url} alt="" loading="lazy" />
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
                      ID {t.anixart_id} · {t.episode_count ?? t.episodes.length} серий
                      {#if t.media_status && MEDIA_STATUS_META[t.media_status]}
                        · <span style="color:{MEDIA_STATUS_META[t.media_status]!.color}">{MEDIA_STATUS_META[t.media_status]!.label}</span>
                      {/if}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>
        {/if}
      </aside>

      <!-- Main: detail view -->
      <div class="kq-main">
        {#if selectedTitle}
          {@const t = selectedTitle}
          <div class="kq-detail uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <div class="kq-detail__inner uiv2-scroll-area__viewport">

              <!-- Title header -->
              <div class="kq-detail__head">
                {#if t.cover_url}
                  <div class="kq-detail__cover" style="background-image:url({t.cover_url})"></div>
                {/if}
                <div class="kq-detail__head-row">
                  {#if t.poster_url}
                    <img class="kq-detail__poster" src={t.poster_url} alt="" />
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
                      <img class="kq-video-admin__placeholder" src={t.cover_url} alt="" />
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
                            if (best) videoItag = String(best.itag);
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
                          {#each youtubeFormats as f (f.itag)}
                            <option value={String(f.itag)}>
                              {f.qualityLabel}{f.height != null ? ` (${f.height}p)` : ''}{f.container ? ` · ${f.container}` : ''} · {formatBytes(f.filesizeBytes)} · itag {f.itag}
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
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Images section -->
              {#if t.poster_url || t.cover_url}
                <div class="kq-detail__section">
                  <h3 class="kq-detail__section-title">Изображения</h3>
                  <div class="kq-detail__images">
                    {#if t.poster_url}
                      <div class="kq-detail__img-card">
                        <img src={t.poster_url} alt="Poster" />
                        <span class="kq-detail__img-label">Постер</span>
                      </div>
                    {/if}
                    {#if t.cover_url}
                      <div class="kq-detail__img-card kq-detail__img-card--wide">
                        <img src={t.cover_url} alt="Cover" />
                        <span class="kq-detail__img-label">Обложка</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}

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

</div>

<style lang="scss">
.kq-root {
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

.kq-db-list__inner { display: flex; flex-direction: column; gap: 2px; }

.kq-db-item {
  display: flex; align-items: center; gap: 0.6rem;
  width: 100%; padding: 0.45rem 0.6rem;
  border: 0; border-radius: 8px;
  background: transparent; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
  transition: background 0.12s ease;

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

.kq-table--episodes {
  th, td { padding: 0.4rem 0.7rem; }
}

.kq-ep-thumb {
  width: 4.5rem; aspect-ratio: 16/9;
  border-radius: 5px; object-fit: cover;
  background: var(--uiv2-surface-raised);
}

@keyframes kq-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}
</style>
