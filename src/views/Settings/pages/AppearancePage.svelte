<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../../../stores/navigation';
  import {
    getAllThemes,
    getActiveThemeId,
    applyThemeById,
    createCustomTheme,
    BUILT_IN_THEMES,
    type Theme,
  } from '../../../services/themes';
  import { getCardLayout, setCardLayout, getProfileLayout, setProfileLayout, type CardLayout, type ProfileLayout } from '../../../prefs';

  import ZoomScaleSlider from '../../../components/ZoomScaleSlider.svelte';
  import { DEFAULT_ZOOM, normalizeZoom, type ZoomLevel } from '../../../utils/zoom';

  let cardLayout = $state<CardLayout>(getCardLayout());
  let profileLayout = $state<ProfileLayout>(getProfileLayout());
  let activeThemeId = $state(getActiveThemeId());
  let customThemes = $state<Theme[]>([]);
  let uiZoom = $state<ZoomLevel>(DEFAULT_ZOOM);
  let zoomLoaded = $state(false);

  function refreshThemes() {
    customThemes = getAllThemes().filter((t) => !t.builtIn);
    activeThemeId = getActiveThemeId();
  }

  function selectTheme(themeId: string) {
    applyThemeById(themeId);
    activeThemeId = themeId;
  }

  function selectLayout(layout: CardLayout) {
    setCardLayout(layout);
    cardLayout = layout;
    const p = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
    if (p === '/' || p.startsWith('/catalog') || p.startsWith('/search') || p.startsWith('/bookmarks')) {
      navigate(p);
    }
  }

  function selectProfileLayout(layout: ProfileLayout) {
    setProfileLayout(layout);
    profileLayout = layout;
    const p = typeof window !== 'undefined' ? window.location.pathname : '';
    if (p === '/profile' || /^\/profile\/\d+$/.test(p)) {
      navigate(p);
    }
  }

  function openThemeEditor(themeId: string, isNew: boolean) {
    (window.electron as { openThemeEditor?: (opts: object) => void } | undefined)?.openThemeEditor?.({
      themeId,
      isNew,
    });
  }

  function addCustomTheme() {
    const theme = createCustomTheme();
    refreshThemes();
    openThemeEditor(theme.id, true);
  }

  function saveZoom(next: ZoomLevel) {
    uiZoom = next;
    window.electron?.saveSettings?.({ uiZoom: next });
    window.dispatchEvent(new CustomEvent('anix:uiZoomChanged', { detail: { uiZoom: next } }));
  }

  function onThemeEditorSaved() {
    refreshThemes();
  }
  function onThemeEditorDeleted() {
    refreshThemes();
  }

  function onUiZoomChanged(e: Event) {
    const next = (e as CustomEvent<{ uiZoom?: number }>).detail?.uiZoom;
    if (typeof next === 'number') uiZoom = normalizeZoom(next);
  }

  onMount(() => {
    refreshThemes();
    void window.electron?.getSettings?.().then((settings) => {
      uiZoom = normalizeZoom(settings?.uiZoom ?? DEFAULT_ZOOM);
      zoomLoaded = true;
    });
    window.addEventListener('anix:themeEditorSaved', onThemeEditorSaved);
    window.addEventListener('anix:themeEditorDeleted', onThemeEditorDeleted);
    window.addEventListener('anix:uiZoomChanged', onUiZoomChanged);
  });

  onDestroy(() => {
    window.removeEventListener('anix:themeEditorSaved', onThemeEditorSaved);
    window.removeEventListener('anix:themeEditorDeleted', onThemeEditorDeleted);
    window.removeEventListener('anix:uiZoomChanged', onUiZoomChanged);
  });
</script>

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
            <rect x="8" y="10" width="28" height="6" rx="2" fill="currentColor" opacity="0.7" />
            <rect x="8" y="20" width="28" height="6" rx="2" fill="currentColor" opacity="0.7" />
            <rect x="8" y="30" width="28" height="6" rx="2" fill="currentColor" opacity="0.7" />
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
            <rect x="7" y="7" width="13" height="13" rx="2" fill="currentColor" opacity="0.7" />
            <rect x="24" y="7" width="13" height="13" rx="2" fill="currentColor" opacity="0.7" />
            <rect x="7" y="24" width="13" height="13" rx="2" fill="currentColor" opacity="0.7" />
            <rect x="24" y="24" width="13" height="13" rx="2" fill="currentColor" opacity="0.7" />
          </svg>
        </div>
        <span>Карточками</span>
      </button>
    </div>
  </div>

  <!-- Profile layout -->
  <div class="settings-section">
    <p class="settings-section__label">Страница профиля</p>
    <p class="settings-section__desc">Новый дизайн оформлен как страница релиза — удобнее на широком экране. Классический можно вернуть для отката.</p>
    <div class="settings-card-layout-toggle">
      <button
        type="button"
        class="settings-card-layout-btn{profileLayout === 'v2' ? ' settings-card-layout-btn--active' : ''}"
        onclick={() => selectProfileLayout('v2')}
      >
        <div class="settings-card-layout-btn__preview">
          <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="10" height="28" rx="2" fill="currentColor" opacity="0.5" />
            <rect x="22" y="8" width="14" height="6" rx="2" fill="currentColor" opacity="0.7" />
            <rect x="22" y="18" width="14" height="4" rx="1" fill="currentColor" opacity="0.4" />
            <rect x="22" y="26" width="14" height="10" rx="2" fill="currentColor" opacity="0.35" />
          </svg>
        </div>
        <span>Новый (v2)</span>
      </button>
      <button
        type="button"
        class="settings-card-layout-btn{profileLayout === 'classic' ? ' settings-card-layout-btn--active' : ''}"
        onclick={() => selectProfileLayout('classic')}
      >
        <div class="settings-card-layout-btn__preview">
          <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="10" width="28" height="8" rx="2" fill="currentColor" opacity="0.5" />
            <rect x="8" y="22" width="28" height="5" rx="1" fill="currentColor" opacity="0.35" />
            <rect x="8" y="30" width="28" height="5" rx="1" fill="currentColor" opacity="0.35" />
          </svg>
        </div>
        <span>Классический</span>
      </button>
    </div>
  </div>

  <!-- UI zoom -->
  <div class="settings-section">
    <p class="settings-section__label">Уровень масштабирования</p>
    <div class="settings-section__body">
      <p class="settings-zoom-hint">Измените масштаб интерфейса. Также можно использовать Ctrl + / Ctrl −.</p>
      {#if zoomLoaded}
        <ZoomScaleSlider value={uiZoom} onChange={saveZoom} />
      {:else}
        <div class="settings-zoom-loading">Загрузка…</div>
      {/if}
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
          <div
            class="settings-theme-tile__preview"
            style={theme.id === 'auto'
              ? 'background:linear-gradient(to right, #1a1a1a 50%, #f0f0f0 50%);border:1px solid #888'
              : `background:${theme.vars.colorSurface};border:1px solid ${theme.vars.colorBorder}`}
          >
            {#if theme.id === 'auto'}
              <svg class="settings-theme-tile__auto-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            {:else}
              <div class="settings-theme-tile__accent" style="background:{theme.vars.colorAccent}"></div>
              <div class="settings-theme-tile__bar" style="background:{theme.vars.colorText}"></div>
              <div class="settings-theme-tile__bar settings-theme-tile__bar--short" style="background:{theme.vars.colorTextMuted}"></div>
            {/if}
          </div>
          <div class="settings-theme-tile__check">
            <svg viewBox="0 0 16 16" fill="none">
              <polyline points="3,8 6.5,11.5 13,5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
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
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), selectTheme(theme.id))}
        >
          <div
            class="settings-theme-tile__preview"
            style="background:{theme.vars.colorSurface};border:1px solid {theme.vars.colorBorder}"
          >
            <div class="settings-theme-tile__accent" style="background:{theme.vars.colorAccent}"></div>
            <div class="settings-theme-tile__bar" style="background:{theme.vars.colorText}"></div>
            <div class="settings-theme-tile__bar settings-theme-tile__bar--short" style="background:{theme.vars.colorTextMuted}"></div>
          </div>
          <div class="settings-theme-tile__check">
            <svg viewBox="0 0 16 16" fill="none">
              <polyline points="3,8 6.5,11.5 13,5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <span class="settings-theme-tile__name">{theme.name}</span>
          <div class="settings-theme-tile__actions">
            <button
              type="button"
              class="settings-theme-tile__action-btn"
              title="Редактировать"
              onclick={(e) => {
                e.stopPropagation();
                openThemeEditor(theme.id, false);
              }}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <path d="M11 2l3 3-8.5 8.5L2 14l.5-3.5L11 2z" />
              </svg>
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
