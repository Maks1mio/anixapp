<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Page from '../../components/Page.svelte';
  import { navigate } from '../../stores/navigation';
  import {
    getAllThemes, getActiveThemeId, applyThemeById,
    createCustomTheme,
    BUILT_IN_THEMES, type Theme,
  } from '../../services/themes';
  import { getCardLayout, setCardLayout, type CardLayout } from '../../prefs';

  const ENDPOINT_OPTIONS = [
    { value: 'https://api-s.anixsekai.com',           label: 'api-s.anixsekai.com' },
    { value: 'https://api.anixart.app',               label: 'api.anixart.app' },
    { value: 'https://api.anixart.tv',                label: 'api.anixart.tv (Заблокирован в РФ)' },
    { value: 'https://api.fake-anixapp.invalid',      label: 'api.fake-anixapp.invalid (пример недоступного сервера)' },
  ];

  const UPSCALE_MODES = [
    { id: 14, label: 'ModeA [Preset]',          desc: 'Быстрый пресет с умеренным восстановлением и апскейлом.' },
    { id: 15, label: 'ModeB [Preset]',          desc: 'Сбалансированный пресет с акцентом на детализацию.' },
    { id: 16, label: 'ModeC [Preset]',          desc: 'Качественный пресет с более агрессивным улучшением.' },
    { id: 17, label: 'ModeA+A [Preset]',        desc: 'Расширенный ModeA с дополнительной обработкой.' },
    { id: 18, label: 'ModeB+B [Preset]',        desc: 'Улучшенный ModeB, обеспечивает более высокое качество.' },
    { id: 19, label: 'ModeC+A [Preset]',        desc: 'Комбинированный пресет с высокой чёткостью и восстановлением.' },
    { id: 0,  label: 'DoG [Deblur]',            desc: 'Удаление размытия и усиление границ.' },
    { id: 1,  label: 'BilateralMean [Denoise]', desc: 'Снижение шума без потери резкости.' },
    { id: 2,  label: 'CNNM [Restore]',          desc: 'Нейросетевое восстановление с умеренной глубиной, хорошо для общего улучшения.' },
    { id: 3,  label: 'CNNSoftM [Restore]',      desc: 'Более мягкое восстановление, минимизирующее артефакты и перегибы.' },
    { id: 4,  label: 'CNNSoftVLM [Restore]',    desc: 'Очень лёгкое и мягкое восстановление, подходит для слабых устройств.' },
    { id: 5,  label: 'CNNVL [Restore]',         desc: 'Восстановление с малой задержкой и быстрой обработкой.' },
    { id: 6,  label: 'CNNUL [Restore]',         desc: 'Универсальное восстановление с акцентом на стабильность.' },
    { id: 7,  label: 'GANUUL [Restore]',        desc: 'GAN-реконструкция изображения для высокого качества.' },
    { id: 8,  label: 'CNNx2M [Upscale]',        desc: 'Апскейл ×2 с сохранением структуры кадра.' },
    { id: 9,  label: 'CNNx2VL [Upscale]',       desc: 'Быстрый апскейл ×2 для слабых систем.' },
    { id: 10, label: 'DenoiseCNNx2VL [Upscale]', desc: 'Апскейл ×2 с предварительным шумоподавлением.' },
    { id: 11, label: 'CNNx2UL [Upscale]',       desc: 'Универсальный сбалансированный апскейл ×2.' },
    { id: 12, label: 'GANx3L [Upscale]',        desc: 'GAN апскейл ×3 для высокого качества.' },
    { id: 13, label: 'GANx4UUL [Upscale]',      desc: 'GAN апскейл ×4 — максимальное качество.' },
  ];

  // Active settings tab
  let activeTab = $state<'connection' | 'appearance' | 'behavior' | 'playback'>('appearance');

  // ── Connection tab ─────────────────────────────────────────────────────────
  let currentEndpoint = $state('');
  let endpointLoaded = $state(false);
  let endpointLoadError = $state(false);
  type PingState = { ok: boolean; latencyMs: number | null };
  let pingState = $state<Record<string, PingState>>({});
  let pingInterval: ReturnType<typeof setInterval> | null = null;

  async function loadEndpoint() {
    if (!window.anixApi) return;
    try {
      const url = await window.anixApi.client.getBaseUrl() as string;
      currentEndpoint = url || ENDPOINT_OPTIONS[0].value;
      endpointLoaded = true;
      endpointLoadError = false;
      void pingOnce();
      pingInterval = setInterval(() => pingOnce(), 1000);
    } catch {
      endpointLoaded = true;
      endpointLoadError = true;
    }
  }

  async function pingOnce() {
    if (!window.anixApi) return;
    const nextState: Record<string, PingState> = { ...pingState };
    await Promise.all(ENDPOINT_OPTIONS.map(async (opt) => {
      try {
        const res = await window.anixApi!.client.pingBaseUrl(opt.value) as PingState;
        nextState[opt.value] = res;
      } catch {
        nextState[opt.value] = { ok: false, latencyMs: null };
      }
    }));
    pingState = nextState;
  }

  function setEndpoint(value: string) {
    currentEndpoint = value;
    window.anixApi?.client?.setBaseUrl(value);
    window.dispatchEvent(new CustomEvent('anix:offline'));
  }

  function qualityFor(value: string): string {
    const s = pingState[value];
    if (!s || !s.ok || typeof s.latencyMs !== 'number') return s && !s.ok ? 'offline' : '';
    if (s.latencyMs < 150) return 'good';
    if (s.latencyMs < 300) return 'medium';
    return 'bad';
  }

  function pingLabel(value: string): string {
    const s = pingState[value];
    if (!s) return '';
    if (s.ok && typeof s.latencyMs === 'number') return `${s.latencyMs} мс`;
    if (!s.ok) return 'недоступен';
    return '';
  }

  // ── Appearance tab ─────────────────────────────────────────────────────────
  let cardLayout = $state<CardLayout>(getCardLayout());
  let activeThemeId = $state(getActiveThemeId());
  let customThemes = $state<Theme[]>([]);

  function refreshThemes() {
    customThemes = getAllThemes().filter(t => !t.builtIn);
    activeThemeId = getActiveThemeId();
  }

  function selectTheme(themeId: string) {
    applyThemeById(themeId);
    activeThemeId = themeId;
  }

  function selectLayout(layout: CardLayout) {
    setCardLayout(layout);
    cardLayout = layout;
    const p = window.location.pathname + window.location.search;
    if (p === '/' || p.startsWith('/catalog') || p.startsWith('/search') || p.startsWith('/bookmarks')) {
      navigate(p);
    }
  }

  function openThemeEditor(themeId: string, isNew: boolean) {
    (window.electron as { openThemeEditor?: (opts: object) => void } | undefined)?.openThemeEditor?.({ themeId, isNew });
  }

  function addCustomTheme() {
    const theme = createCustomTheme();
    refreshThemes();
    openThemeEditor(theme.id, true);
  }

  // ── Behavior tab ───────────────────────────────────────────────────────────
  let hasElectron = $state(false);
  let minimizeToTray = $state(false);
  let adaptiveAcceleration = $state(true);
  let behaviorLoaded = $state(false);

  async function loadBehavior() {
    if (!window.electron?.getSettings) return;
    hasElectron = true;
    const settings = await window.electron.getSettings();
    minimizeToTray = settings.minimizeToTray ?? false;
    adaptiveAcceleration = settings.adaptiveAcceleration !== false;
    behaviorLoaded = true;
  }

  function saveTray(checked: boolean) {
    minimizeToTray = checked;
    window.electron?.saveSettings?.({ minimizeToTray: checked });
  }

  function saveAccel(checked: boolean) {
    adaptiveAcceleration = checked;
    window.electron?.saveSettings?.({ adaptiveAcceleration: checked });
  }

  // ── Playback tab ───────────────────────────────────────────────────────────
  let gpuAvailable = $state(false);
  let upscaleEnabled = $state(false);
  let upscaleMode = $state(15);
  let playbackLoaded = $state(false);

  async function loadPlayback() {
    if (!window.electron?.getSettings) return;
    gpuAvailable = 'gpu' in navigator;
    const settings = await window.electron.getSettings() as any;
    upscaleEnabled = settings.upscaleEnabled ?? false;
    upscaleMode = settings.upscaleMode ?? 15;
    playbackLoaded = true;
  }

  function saveUpscale() {
    window.electron?.saveSettings?.({ upscaleEnabled, upscaleMode } as any);
    (window.electron as any)?.sendUpscaleSettings?.({ upscaleEnabled, upscaleMode });
    window.dispatchEvent(new CustomEvent('anix:upscaleChanged', { detail: { upscaleEnabled, upscaleMode } }));
  }

  function onThemeEditorSaved() { refreshThemes(); }
  function onThemeEditorDeleted() { refreshThemes(); }

  onMount(() => {
    refreshThemes();
    loadEndpoint();
    loadBehavior();
    loadPlayback();
    window.addEventListener('anix:themeEditorSaved', onThemeEditorSaved);
    window.addEventListener('anix:themeEditorDeleted', onThemeEditorDeleted);
  });

  onDestroy(() => {
    if (pingInterval) clearInterval(pingInterval);
    window.removeEventListener('anix:themeEditorSaved', onThemeEditorSaved);
    window.removeEventListener('anix:themeEditorDeleted', onThemeEditorDeleted);
  });

  const TABS = [
    { id: 'appearance',  label: 'Внешний вид' },
    { id: 'connection',  label: 'Соединение' },
    { id: 'behavior',    label: 'Поведение' },
    { id: 'playback',    label: 'Воспроизведение' },
  ] as const;
</script>

<Page scrollId="content-settings" extraClass="view view-settings">
  <header class="settings-header">
    <h1 class="settings-title">Настройки</h1>
  </header>

  <!-- Tab bar -->
  <div class="bookmarks__tabs">
    {#each TABS as t}
      <button
        type="button"
        class="bookmarks__tab{activeTab === t.id ? ' bookmarks__tab--active' : ''}"
        onclick={() => (activeTab = t.id as typeof activeTab)}
      >{t.label}</button>
    {/each}
  </div>

  <!-- Tab content -->
  {#if activeTab === 'connection'}
    <div class="settings-modal-content">
      {#if !window.anixApi}
        <p class="settings-account-coming-soon">API доступно только в приложении Electron.</p>
      {:else if !endpointLoaded}
        <div class="settings-section">
          <p class="settings-section__label">Эндпоинт API</p>
          <div style="font-size:0.875rem;color:#737373;">Загрузка…</div>
        </div>
      {:else if endpointLoadError}
        <div class="settings-section">
          <p class="settings-section__label">Эндпоинт API</p>
          <p style="font-size:0.875rem;color:#737373;">Не удалось загрузить текущий эндпоинт.</p>
        </div>
      {:else}
        <div class="settings-section">
          <p class="settings-section__label">Эндпоинт API</p>
          <p style="font-size:0.8125rem;color:#737373;margin:0 0 12px;line-height:1.5;">
            Используется для всех запросов. После смены перезагрузка не требуется.
          </p>
          <div class="custom-select">
            {#each ENDPOINT_OPTIONS as opt}
              {@const quality = qualityFor(opt.value)}
              {@const ping = pingLabel(opt.value)}
              <button
                type="button"
                class="custom-select__option{currentEndpoint === opt.value ? ' custom-select__option--active' : ''}"
                data-value={opt.value}
                data-latency-quality={quality || undefined}
                onclick={() => setEndpoint(opt.value)}
              >
                <span class="endpoint-option__host">{opt.label}</span>
                {#if ping}
                  <span class="endpoint-option__ping">{ping}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

  {:else if activeTab === 'appearance'}
    <div class="settings-modal-content">
      <!-- Card layout -->
      <div class="settings-section">
        <p class="settings-section__label">Отображение карточек</p>
        <div class="settings-card-layout-toggle">
          <button
            type="button"
            class="settings-card-layout-btn{cardLayout === 'wide' ? ' settings-card-layout-btn--active' : ''}"
            onclick={() => selectLayout('wide')}
          >
            <div class="settings-card-layout-btn__preview">
              <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="8" y="10" width="28" height="6" rx="2" fill="currentColor" opacity="0.7"/>
                <rect x="8" y="20" width="28" height="6" rx="2" fill="currentColor" opacity="0.7"/>
                <rect x="8" y="30" width="28" height="6" rx="2" fill="currentColor" opacity="0.7"/>
              </svg>
            </div>
            <span>Списком</span>
          </button>
          <button
            type="button"
            class="settings-card-layout-btn{cardLayout === 'mini' ? ' settings-card-layout-btn--active' : ''}"
            onclick={() => selectLayout('mini')}
          >
            <div class="settings-card-layout-btn__preview">
              <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="7"  y="7"  width="13" height="13" rx="2" fill="currentColor" opacity="0.7"/>
                <rect x="24" y="7"  width="13" height="13" rx="2" fill="currentColor" opacity="0.7"/>
                <rect x="7"  y="24" width="13" height="13" rx="2" fill="currentColor" opacity="0.7"/>
                <rect x="24" y="24" width="13" height="13" rx="2" fill="currentColor" opacity="0.7"/>
              </svg>
            </div>
            <span>Карточками</span>
          </button>
        </div>
      </div>

      <!-- Built-in themes -->
      <div class="settings-section">
        <p class="settings-section__label">Тема оформления</p>
        <div class="settings-theme-grid">
          {#each BUILT_IN_THEMES as theme}
            <button
              type="button"
              class="settings-theme-tile{activeThemeId === theme.id ? ' settings-theme-tile--active' : ''}"
              data-theme-id={theme.id}
              onclick={() => selectTheme(theme.id)}
            >
              <div class="settings-theme-tile__preview" style={theme.id === 'auto' ? 'background:linear-gradient(to right, #1a1a1a 50%, #f0f0f0 50%);border:1px solid #888' : `background:${(theme as any).vars?.colorSurface};border:1px solid ${(theme as any).vars?.colorBorder}`}>
                {#if theme.id === 'auto'}
                  <svg class="settings-theme-tile__auto-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
                {:else}
                  <div class="settings-theme-tile__accent" style="background:{(theme as any).vars?.colorAccent}"></div>
                  <div class="settings-theme-tile__bar" style="background:{(theme as any).vars?.colorText}"></div>
                  <div class="settings-theme-tile__bar settings-theme-tile__bar--short" style="background:{(theme as any).vars?.colorTextMuted}"></div>
                {/if}
              </div>
              <div class="settings-theme-tile__check">
                <svg viewBox="0 0 16 16" fill="none"><polyline points="3,8 6.5,11.5 13,5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <span class="settings-theme-tile__name">{theme.name}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Custom themes -->
      <div class="settings-section">
        <p class="settings-section__label">Пользовательские темы</p>
        <div class="settings-theme-grid">
          {#each customThemes as theme}
            <div
              role="button"
              tabindex="0"
              class="settings-theme-tile{activeThemeId === theme.id ? ' settings-theme-tile--active' : ''}"
              data-theme-id={theme.id}
              onclick={() => selectTheme(theme.id)}
              onkeydown={(e) => ((e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), selectTheme(theme.id)))}
            >
              <div class="settings-theme-tile__preview" style="background:{(theme as any).vars?.colorSurface};border:1px solid {(theme as any).vars?.colorBorder}">
                <div class="settings-theme-tile__accent" style="background:{(theme as any).vars?.colorAccent}"></div>
                <div class="settings-theme-tile__bar" style="background:{(theme as any).vars?.colorText}"></div>
                <div class="settings-theme-tile__bar settings-theme-tile__bar--short" style="background:{(theme as any).vars?.colorTextMuted}"></div>
              </div>
              <div class="settings-theme-tile__check">
                <svg viewBox="0 0 16 16" fill="none"><polyline points="3,8 6.5,11.5 13,5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <span class="settings-theme-tile__name">{theme.name}</span>
              <div class="settings-theme-tile__actions">
                <button
                  type="button"
                  class="settings-theme-tile__action-btn"
                  title="Редактировать"
                  onclick={(e) => { e.stopPropagation(); openThemeEditor(theme.id, false); }}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M11 2l3 3-8.5 8.5L2 14l.5-3.5L11 2z"/></svg>
                </button>
              </div>
            </div>
          {/each}
          <button type="button" class="settings-theme-tile settings-theme-tile--add" onclick={addCustomTheme}>
            <span class="settings-theme-tile__plus">+</span>
            <span>Создать тему</span>
          </button>
        </div>
      </div>
    </div>

  {:else if activeTab === 'behavior'}
    <div class="settings-modal-content">
      {#if !hasElectron}
        <p class="settings-account-coming-soon">Настройки поведения доступны только в приложении Electron.</p>
      {:else if !behaviorLoaded}
        <div style="padding:16px;color:#737373;">Загрузка…</div>
      {:else}
        <div class="settings-section">
          <p class="settings-section__label">Окно</p>
          <div class="settings-section__body">
            <div class="settings-row">
              <div class="settings-row__info">
                <div class="settings-row__label">Сворачивать в трей при закрытии</div>
                <div class="settings-row__desc">Окно скрывается в системный трей вместо выхода</div>
              </div>
              <div class="settings-row__control">
                <label class="settings-toggle-switch" aria-label="Сворачивать в трей">
                  <input type="checkbox" checked={minimizeToTray} onchange={(e) => saveTray((e.target as HTMLInputElement).checked)} />
                  <span class="settings-toggle-switch__track"></span>
                  <span class="settings-toggle-switch__thumb"></span>
                </label>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row__info">
                <div class="settings-row__label">Адаптивное ускорение</div>
                <div class="settings-row__desc">Использовать аппаратное ускорение (GPU). Требуется перезапуск.</div>
              </div>
              <div class="settings-row__control">
                <label class="settings-toggle-switch" aria-label="Адаптивное ускорение">
                  <input type="checkbox" checked={adaptiveAcceleration} onchange={(e) => saveAccel((e.target as HTMLInputElement).checked)} />
                  <span class="settings-toggle-switch__track"></span>
                  <span class="settings-toggle-switch__thumb"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>

  {:else if activeTab === 'playback'}
    <div class="settings-modal-content">
      {#if !window.electron?.getSettings}
        <p class="settings-account-coming-soon">Настройки воспроизведения доступны только в приложении Electron.</p>
      {:else if !playbackLoaded}
        <div style="padding:16px;color:#737373;">Загрузка…</div>
      {:else}
        {#if !gpuAvailable}
          <div class="settings-upscale-notice settings-upscale-notice--warn">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="10.5"/><circle cx="10" cy="13.5" r=".7" fill="currentColor" stroke="none"/></svg>
            <span>Ваш GPU не поддерживает WebGPU — улучшение качества недоступно.</span>
          </div>
        {/if}

        <div class="settings-upscale-notice">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r=".7" fill="currentColor" stroke="none"/></svg>
          <span>Технология Anime4K улучшает видео в реальном времени, используя WebGPU.</span>
        </div>

        <div class="settings-section">
          <div class="settings-section__body">
            <div class="settings-row">
              <div class="settings-row__info">
                <div class="settings-row__label">Включить улучшение качества</div>
                <div class="settings-row__desc">Активирует улучшение через GPU с использованием WebGPU и Anime4K.</div>
              </div>
              <div class="settings-row__control">
                <label class="settings-toggle-switch" aria-label="Улучшение качества">
                  <input
                    type="checkbox"
                    checked={upscaleEnabled}
                    disabled={!gpuAvailable}
                    onchange={(e) => { upscaleEnabled = (e.target as HTMLInputElement).checked; saveUpscale(); }}
                  />
                  <span class="settings-toggle-switch__track"></span>
                  <span class="settings-toggle-switch__thumb"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <p class="settings-section__label">Режим улучшения</p>
          <select
            class="custom-select__trigger"
            value={String(upscaleMode)}
            disabled={!gpuAvailable || !upscaleEnabled}
            onchange={(e) => { upscaleMode = Number((e.target as HTMLSelectElement).value); saveUpscale(); }}
          >
            {#each UPSCALE_MODES as m}
              <option value={String(m.id)}>{m.label} — {m.desc}</option>
            {/each}
          </select>
        </div>

        <div class="settings-section">
          <p class="settings-section__label">Инструменты разработки</p>
          <div class="settings-section__body">
            <div class="settings-row">
              <div class="settings-row__info">
                <div class="settings-row__label">Предпросмотр моделей</div>
                <div class="settings-row__desc">Открыть инструмент сравнения Anime4K в реальном времени.</div>
              </div>
              <div class="settings-row__control">
                <button class="settings-btn settings-btn--primary" onclick={() => (window.electron as any)?.openUpscaleTool?.()}>Открыть</button>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</Page>
