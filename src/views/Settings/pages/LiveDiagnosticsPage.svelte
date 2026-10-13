<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import { uiv2CustomScroll } from '../../../actions/uiv2CustomScroll';

  type DiagEntry = {
    id: string;
    ts: number;
    iso?: string;
    channel?: string;
    level?: string;
    message?: string;
    url?: string;
    method?: string;
    status?: number;
    durationMs?: number;
    window?: string;
    source?: string;
    line?: number;
    error?: string;
    resourceType?: string;
  };

  type ChannelFilter = 'all' | 'console' | 'network' | 'main' | 'system' | 'navigation';
  type LevelFilter = 'all' | 'debug' | 'info' | 'warn' | 'error';
  type ResourceFilter =
    | 'all'
    | 'xhr'
    | 'doc'
    | 'css'
    | 'js'
    | 'font'
    | 'img'
    | 'media'
    | 'manifest'
    | 'socket'
    | 'wasm'
    | 'other';

  const RESOURCE_FILTERS: { id: ResourceFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'xhr', label: 'Fetch/XHR' },
    { id: 'doc', label: 'Doc' },
    { id: 'css', label: 'CSS' },
    { id: 'js', label: 'JS' },
    { id: 'font', label: 'Font' },
    { id: 'img', label: 'Img' },
    { id: 'media', label: 'Media' },
    { id: 'manifest', label: 'Manifest' },
    { id: 'socket', label: 'Socket' },
    { id: 'wasm', label: 'Wasm' },
    { id: 'other', label: 'Other' },
  ];

  /** Map Chromium webRequest resourceType → DevTools-style bucket. */
  function resourceBucket(type: string | undefined): ResourceFilter {
    const t = String(type || '').toLowerCase();
    if (t === 'xhr' || t === 'fetch') return 'xhr';
    if (t === 'mainframe' || t === 'subframe') return 'doc';
    if (t === 'stylesheet') return 'css';
    if (t === 'script') return 'js';
    if (t === 'font') return 'font';
    if (t === 'image') return 'img';
    if (t === 'media') return 'media';
    if (t === 'manifest') return 'manifest';
    if (t === 'websocket' || t === 'webtransport') return 'socket';
    if (t === 'wasm' || t.includes('wasm')) return 'wasm';
    return 'other';
  }

  let entries = $state<DiagEntry[]>([]);
  let channel = $state<ChannelFilter>('all');
  let level = $state<LevelFilter>('all');
  let resource = $state<ResourceFilter>('all');
  let query = $state('');
  let paused = $state(false);
  let autoScroll = $state(true);
  let busy = $state(false);
  let muteLive = $state(false);
  let feedback = $state('');
  let feedbackKind = $state<'ok' | 'err'>('ok');
  let stats = $state<{ total: number; max: number; byChannel: Record<string, number>; byLevel: Record<string, number> } | null>(null);
  let logPaths = $state<{ dir: string; file: string; zipDefaultDir: string } | null>(null);
  let viewport: HTMLDivElement | null = $state(null);
  let listRoot: HTMLDivElement | null = $state(null);
  let unsubEntry: (() => void) | null = null;
  let pending: DiagEntry[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let scrollRaf = 0;
  const seenIds = new Set<string>();

  const showResourceBar = $derived(channel === 'all' || channel === 'network');

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const out: DiagEntry[] = [];
    const used = new Set<string>();
    for (const e of entries) {
      if (!e?.id || used.has(e.id)) continue;
      if (channel !== 'all' && e.channel !== channel) continue;
      if (level !== 'all' && e.level !== level) continue;
      if (resource !== 'all') {
        if (e.channel !== 'network') continue;
        if (resourceBucket(e.resourceType) !== resource) continue;
      }
      if (q) {
        const hay = `${e.message || ''} ${e.url || ''} ${e.window || ''} ${e.source || ''} ${e.method || ''} ${e.resourceType || ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      used.add(e.id);
      out.push(e);
    }
    return out;
  });

  function setFeedback(msg: string, kind: 'ok' | 'err' = 'ok') {
    feedback = msg;
    feedbackKind = kind;
  }

  function resolveViewport(): HTMLElement | null {
    if (viewport) return viewport;
    return listRoot?.querySelector<HTMLElement>('[data-uiv2-scroll], .uiv2-scroll-area__viewport') ?? null;
  }

  function scrollToBottomNow() {
    const el = resolveViewport();
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  async function scrollToBottom() {
    await tick();
    scrollToBottomNow();
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      scrollToBottomNow();
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        scrollToBottomNow();
      });
    });
  }

  function toggleAutoScroll() {
    autoScroll = !autoScroll;
    if (autoScroll) void scrollToBottom();
  }

  // Keep pinned to bottom while Авто is on (covers filter flips + late DOM paint).
  $effect(() => {
    const n = filtered.length;
    if (!autoScroll || n === 0) return;
    void scrollToBottom();
  });

  function flushPending() {
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!pending.length) return;
    const batch = pending.splice(0, pending.length);
    const next = entries.slice();
    for (const e of batch) {
      if (!e?.id || seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      next.push(e);
    }
    if (next.length > 4000) {
      const trimmed = next.slice(-4000);
      seenIds.clear();
      for (const e of trimmed) if (e.id) seenIds.add(e.id);
      entries = trimmed;
    } else {
      entries = next;
    }
  }

  function enqueue(entry: DiagEntry) {
    if (paused || muteLive) return;
    if (!entry?.id || seenIds.has(entry.id)) return;
    if (pending.some((p) => p.id === entry.id)) return;
    pending.push(entry);
    if (flushTimer != null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushPending();
      if (autoScroll) void scrollToBottom();
    }, 80);
  }

  async function refreshStats() {
    stats = (await window.electron?.diagnosticsStats?.()) ?? null;
  }

  async function refreshPaths() {
    logPaths = (await window.electron?.diagnosticsPaths?.()) ?? null;
  }

  async function openLogsFolder() {
    const res = await window.electron?.diagnosticsOpenDir?.();
    if (!res?.ok) setFeedback('Не удалось открыть папку', 'err');
  }

  async function copyLogsPath() {
    const text = logPaths?.file || logPaths?.dir || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('Путь скопирован');
    } catch {
      setFeedback('Не удалось скопировать', 'err');
    }
  }

  async function loadInitial() {
    const list = (await window.electron?.diagnosticsGet?.({ limit: 1500 })) as DiagEntry[] | undefined;
    flushPending();
    pending = [];
    seenIds.clear();
    const unique: DiagEntry[] = [];
    for (const e of Array.isArray(list) ? list : []) {
      if (!e?.id || seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      unique.push(e);
    }
    entries = unique;
    await refreshStats();
    if (autoScroll) void scrollToBottom();
  }

  async function clearAll() {
    busy = true;
    muteLive = true;
    try {
      if (flushTimer != null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pending = [];
      seenIds.clear();
      entries = [];
      await window.electron?.diagnosticsClear?.();
      // Drop any live events that raced during clear, then snapshot once.
      pending = [];
      await loadInitial();
      await refreshPaths();
      setFeedback('Буфер очищен · новый файл сессии');
    } finally {
      muteLive = false;
      busy = false;
    }
  }

  async function exportZip() {
    busy = true;
    try {
      const res = await window.electron?.diagnosticsExportZip?.();
      if (!res || res.canceled) {
        setFeedback('Сохранение отменено');
        return;
      }
      if (!res.ok || !res.path) {
        setFeedback('Не удалось сохранить ZIP', 'err');
        return;
      }
      const deviceBits = [
        res.deviceSummary?.os,
        res.deviceSummary?.cpu ? String(res.deviceSummary.cpu).slice(0, 42) : '',
        res.deviceSummary?.ramGb != null ? `${res.deviceSummary.ramGb} ГБ` : '',
      ].filter(Boolean);
      setFeedback(
        deviceBits.length
          ? `ZIP · ${res.count ?? 0} событий · ${deviceBits.join(' · ')}`
          : `ZIP · ${res.count ?? 0} событий`,
      );
      await window.electron?.diagnosticsReveal?.(res.path);
    } catch {
      setFeedback('Ошибка экспорта', 'err');
    } finally {
      busy = false;
    }
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  }

  function rowPrimary(e: DiagEntry): string {
    if (e.channel === 'network') {
      return `${e.method || 'GET'} ${e.status || '—'}  ${e.url || ''}`;
    }
    return e.message || '';
  }

  function rowMeta(e: DiagEntry): string {
    const bits: string[] = [];
    if (e.window) bits.push(e.window);
    if (e.channel === 'network' && e.resourceType) bits.push(e.resourceType);
    if (e.source) bits.push(`${e.source}${e.line ? `:${e.line}` : ''}`);
    if (e.error) bits.push(e.error);
    return bits.join(' · ');
  }

  onMount(() => {
    void loadInitial();
    void refreshPaths();
    void window.electron?.diagnosticsSubscribe?.();
    unsubEntry = window.electron?.onDiagnosticsEntry?.((raw) => {
      enqueue(raw as DiagEntry);
      void refreshStats();
    }) ?? null;
  });

  onDestroy(() => {
    if (flushTimer) clearTimeout(flushTimer);
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    unsubEntry?.();
    void window.electron?.diagnosticsUnsubscribe?.();
  });
</script>

<section class="diag-live" aria-label="Отладка">
  <div class="diag-live__bar">
    <div class="diag-live__actions">
      <UiV2Button
        label={paused ? 'Продолжить' : 'Пауза'}
        size="sm"
        variant="chrome"
        onclick={() => { paused = !paused; }}
      />
      <UiV2Button
        label="Очистить"
        size="sm"
        variant="ghost"
        disabled={busy}
        onclick={() => { void clearAll(); }}
      />
      <UiV2Button
        label={busy ? '…' : 'ZIP'}
        title="Сохранить ZIP"
        size="sm"
        variant="primary"
        disabled={busy}
        onclick={() => { void exportZip(); }}
      />
    </div>

    <label class="diag-live__search">
      <span class="diag-live__search-label">Поиск</span>
      <input
        type="search"
        placeholder="Поиск…"
        bind:value={query}
        autocomplete="off"
      />
    </label>

    <button
      type="button"
      class="diag-live__chip diag-live__chip--toggle"
      class:diag-live__chip--on={autoScroll}
      aria-pressed={autoScroll}
      title={autoScroll ? 'Автопрокрутка включена' : 'Автопрокрутка выключена'}
      onclick={toggleAutoScroll}
    >Авто</button>

    {#if stats}
      <div class="diag-live__stats" aria-live="polite">
        <span class="diag-live__pill">{stats.total}/{stats.max}</span>
        {#each Object.entries(stats.byChannel || {}) as [k, v] (k)}
          <span class="diag-live__pill diag-live__pill--muted">{k} {v}</span>
        {/each}
      </div>
    {/if}

    {#if feedback}
      <p class="diag-live__feedback" class:diag-live__feedback--err={feedbackKind === 'err'}>{feedback}</p>
    {/if}
  </div>

  <div class="diag-live__filters">
    <div class="diag-live__chips" role="group" aria-label="Канал">
      {#each [
        { id: 'all', label: 'Все' },
        { id: 'console', label: 'Console' },
        { id: 'network', label: 'Network' },
        { id: 'main', label: 'Main' },
        { id: 'system', label: 'System' },
      ] as c (c.id)}
        <button
          type="button"
          class="diag-live__chip"
          class:diag-live__chip--on={channel === c.id}
          onclick={() => {
            channel = c.id as ChannelFilter;
            if (c.id !== 'all' && c.id !== 'network') resource = 'all';
          }}
        >{c.label}</button>
      {/each}
    </div>
    <div class="diag-live__chips" role="group" aria-label="Уровень">
      {#each [
        { id: 'all', label: 'ALL' },
        { id: 'error', label: 'ERR' },
        { id: 'warn', label: 'WARN' },
        { id: 'info', label: 'INFO' },
        { id: 'debug', label: 'DBG' },
      ] as l (l.id)}
        <button
          type="button"
          class="diag-live__chip diag-live__chip--level"
          class:diag-live__chip--on={level === l.id}
          class:diag-live__chip--err={l.id === 'error'}
          class:diag-live__chip--warn={l.id === 'warn'}
          onclick={() => { level = l.id as LevelFilter; }}
        >{l.label}</button>
      {/each}
    </div>
  </div>

  {#if showResourceBar}
    <div class="diag-live__netbar" role="group" aria-label="Тип сетевого ресурса">
      {#each RESOURCE_FILTERS as r, i (r.id)}
        {#if i === 1}
          <span class="diag-live__netbar-sep" aria-hidden="true"></span>
        {/if}
        <button
          type="button"
          class="diag-live__netchip"
          class:diag-live__netchip--on={resource === r.id}
          onclick={() => {
            resource = r.id;
            if (r.id !== 'all' && channel !== 'network') channel = 'network';
          }}
        >{r.label}</button>
      {/each}
    </div>
  {/if}

  {#if logPaths?.dir}
    <div class="diag-live__path" title={logPaths.file || logPaths.dir}>
      <div class="diag-live__path-text">
        <span class="diag-live__path-label">Сессия (по дате)</span>
        <code class="diag-live__path-value">{logPaths.file || logPaths.dir}</code>
      </div>
      <div class="diag-live__path-actions">
        <button type="button" class="diag-live__path-btn" onclick={() => { void copyLogsPath(); }}>Копировать</button>
        <button type="button" class="diag-live__path-btn" onclick={() => { void openLogsFolder(); }}>Открыть</button>
      </div>
    </div>
  {/if}

  <p class="diag-live__zip-hint">
    ZIP: устройство + консоль + сеть · токены маскируются
    {#if logPaths?.zipDefaultDir}
      · сохранение по умолчанию: {logPaths.zipDefaultDir}
    {/if}
  </p>

  <div
    class="diag-live__list uiv2-scroll-area uiv2-scroll-area--y"
    bind:this={listRoot}
    use:uiv2CustomScroll={{ axis: 'y' }}
  >
    <div class="uiv2-scroll-area__viewport" data-uiv2-scroll bind:this={viewport}>
      {#if filtered.length === 0}
        <div class="diag-live__empty">
          <p>Логов пока нет</p>
        </div>
      {:else}
        {#each filtered as e (e.id)}
          <article
            class="diag-live__row"
            class:diag-live__row--error={e.level === 'error'}
            class:diag-live__row--warn={e.level === 'warn'}
            class:diag-live__row--network={e.channel === 'network'}
            data-channel={e.channel}
            data-level={e.level}
          >
            <time class="diag-live__time" datetime={e.iso}>{formatTime(e.ts)}</time>
            <span class="diag-live__badge diag-live__badge--{e.channel || 'system'}">{e.channel}</span>
            <span class="diag-live__level diag-live__level--{e.level || 'info'}">{e.level}</span>
            <div class="diag-live__body">
              <p class="diag-live__msg">{rowPrimary(e)}</p>
              {#if rowMeta(e)}
                <p class="diag-live__meta">{rowMeta(e)}</p>
              {/if}
            </div>
          </article>
        {/each}
      {/if}
    </div>
    <div class="uiv2-scroll-area__v-track" aria-hidden="true">
      <div class="uiv2-scroll-area__v-thumb"></div>
    </div>
  </div>
</section>
