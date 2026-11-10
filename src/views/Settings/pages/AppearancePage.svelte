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
  import {
    getCardLayout,
    setCardLayout,
    getDefaultBookmarksTab,
    setDefaultBookmarksTab,
    type BookmarksTabId,
    type CardLayout,
  } from '../../../prefs';
  import UiV2Select, { type UiV2SelectOption } from '../../../components/uikit-v2/UiV2Select.svelte';
  import UiV2SettingsRow from '../../../components/uikit-v2/UiV2SettingsRow.svelte';

  import ZoomScaleSlider from '../../../components/ZoomScaleSlider.svelte';
  import NavigationSettingsSection from '../../../components/settings/NavigationSettingsSection.svelte';
  import { DEFAULT_ZOOM, normalizeZoom, type ZoomLevel } from '../../../utils/zoom';
  import { isMac } from '../../../utils/platform';
  import { isMobileMode, MOBILE_UI_SCALES, getMobileUiScale, setMobileUiScale } from '../../../platform/mobile';

  const modKey = isMac ? '⌘' : 'Ctrl';
  /** Телефон: масштаб, навигация и редактор тем — функции окна ПК. */
  const touchOnly = isMobileMode();
  let mobileScale = $state(touchOnly ? getMobileUiScale() : 1);
  const canEditThemes = !touchOnly && !!(window.electron as { openThemeEditor?: unknown } | undefined)?.openThemeEditor;

  let cardLayout = $state<CardLayout>(getCardLayout());
  let bookmarksTab = $state<BookmarksTabId>(getDefaultBookmarksTab());

  /** Тот же список, что в настройках телефона. */
  const BOOKMARKS_OPTIONS: UiV2SelectOption[] = [
    { value: 'watching', label: 'Смотрю' },
    { value: 'planned', label: 'В планах' },
    { value: 'completed', label: 'Просмотрено' },
    { value: 'on_hold', label: 'Отложено' },
    { value: 'dropped', label: 'Брошено' },
    { value: 'collections', label: 'Коллекции' },
    { value: 'history', label: 'История' },
    { value: 'votes', label: 'Оценки' },
    { value: 'favorites', label: 'Избранное' },
  ];
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
    if (p === '/' || p.startsWith('/catalog') || p.startsWith('/bookmarks')) {
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

{#snippet themeCard(theme: Theme, custom: boolean)}
  <div
    role="button"
    tabindex="0"
    class="uiv2-settings__theme"
    class:uiv2-settings__theme--on={activeThemeId === theme.id}
    data-theme-id={theme.id}
    aria-pressed={activeThemeId === theme.id}
    onclick={() => selectTheme(theme.id)}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), selectTheme(theme.id))}
  >
    <div
      class="uiv2-settings__theme-preview"
      style={theme.id === 'auto'
        ? 'background:linear-gradient(to right, #1a1a1a 50%, #f0f0f0 50%);border:1px solid #888'
        : `background:${theme.vars.colorSurface};border:1px solid ${theme.vars.colorBorder}`}
    >
      {#if theme.id === 'auto'}
        <svg class="uiv2-settings__theme-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      {:else}
        <div class="uiv2-settings__theme-accent" style="background:{theme.vars.colorAccent}"></div>
        <div class="uiv2-settings__theme-bar" style="background:{theme.vars.colorText}"></div>
        <div class="uiv2-settings__theme-bar uiv2-settings__theme-bar--short" style="background:{theme.vars.colorTextMuted}"></div>
      {/if}
    </div>
    <div class="uiv2-settings__theme-check">
      <svg viewBox="0 0 16 16" fill="none">
        <polyline points="3,8 6.5,11.5 13,5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <span class="uiv2-settings__theme-name">{theme.name}</span>
    {#if custom && canEditThemes}
      <div class="uiv2-settings__theme-actions">
        <button
          type="button"
          class="uiv2-settings__theme-edit"
          aria-label="Редактировать тему {theme.name}"
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
    {/if}
  </div>
{/snippet}

<div class="uiv2-settings uiv2-settings--appearance">
  <!-- Тема — то, что меняют чаще всего, поэтому первой -->
  <section class="uiv2-settings__block">
    <h3 class="uiv2-settings__title">Тема оформления</h3>
    <div class="uiv2-settings__theme-grid">
      {#each BUILT_IN_THEMES as theme (theme.id)}
        {@render themeCard(theme, false)}
      {/each}
    </div>
  </section>

  {#if customThemes.length > 0 || canEditThemes}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Свои темы</h3>
      {#if !canEditThemes}
        <p class="uiv2-settings__desc">Создавать и менять темы можно в AnixApp на ПК.</p>
      {/if}
      <div class="uiv2-settings__theme-grid">
        {#each customThemes as theme (theme.id)}
          {@render themeCard(theme, true)}
        {/each}
        {#if canEditThemes}
          <button type="button" class="uiv2-settings__theme uiv2-settings__theme--add" onclick={addCustomTheme}>
            <span class="uiv2-settings__theme-plus">+</span>
            <span>Создать тему</span>
          </button>
        {/if}
      </div>
    </section>
  {/if}

  <section class="uiv2-settings__block">
    <h3 class="uiv2-settings__title">Списки релизов</h3>
    <div class="uiv2-settings__choice-grid">
      <button
        type="button"
        class="uiv2-settings__choice"
        class:uiv2-settings__choice--on={cardLayout === 'wide'}
        aria-pressed={cardLayout === 'wide'}
        onclick={() => selectLayout('wide')}
      >
        <div class="uiv2-settings__choice-preview">
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
        class="uiv2-settings__choice"
        class:uiv2-settings__choice--on={cardLayout === 'mini'}
        aria-pressed={cardLayout === 'mini'}
        onclick={() => selectLayout('mini')}
      >
        <div class="uiv2-settings__choice-preview">
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
  </section>

  <section class="uiv2-settings__block">
    <h3 class="uiv2-settings__title">Закладки</h3>
    <div class="uiv2-settings__group">
      <UiV2SettingsRow title="Вкладка по умолчанию" desc="Какой список открывать первым в разделе «Закладки»">
        <UiV2Select
          options={BOOKMARKS_OPTIONS}
          value={bookmarksTab}
          ariaLabel="Вкладка закладок по умолчанию"
          onChange={(v) => { bookmarksTab = setDefaultBookmarksTab(v); }}
        />
      </UiV2SettingsRow>
    </div>
  </section>

  {#if touchOnly}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Масштаб интерфейса</h3>
      <p class="uiv2-settings__desc">Если элементы кажутся крупными или мелкими. По умолчанию — 100%.</p>
      <div class="uiv2-settings__group uiv2-settings__group--pad">
        <div class="uiv2-settings__scale" role="radiogroup" aria-label="Масштаб интерфейса">
          {#each MOBILE_UI_SCALES as opt (opt.value)}
            <button
              type="button"
              role="radio"
              aria-checked={mobileScale === opt.value}
              class="uiv2-settings__chip"
              class:uiv2-settings__chip--on={mobileScale === opt.value}
              onclick={() => { mobileScale = setMobileUiScale(opt.value); }}
            >{opt.label}</button>
          {/each}
        </div>
      </div>
    </section>
  {:else}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Масштаб интерфейса</h3>
      <div class="uiv2-settings__group uiv2-settings__group--pad">
        <p class="uiv2-settings__hint">Также можно нажать {modKey} + / {modKey} −.</p>
        {#if zoomLoaded}
          <ZoomScaleSlider value={uiZoom} onChange={saveZoom} />
        {:else}
          <p class="uiv2-settings__status">Загрузка…</p>
        {/if}
      </div>
    </section>

    <!-- Боковая панель и миниатюры есть только у ПК; на телефоне разделы переставляют долгим нажатием на панели -->
    <NavigationSettingsSection />
  {/if}
</div>
