<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { navigate } from '../../stores/navigation';
  import UiV2Tabs from '../../components/uikit-v2/UiV2Tabs.svelte';
  import UiV2Select from '../../components/uikit-v2/UiV2Select.svelte';
  import { uiv2CustomScroll } from '../../actions/uiv2CustomScroll';
  import {
    fetchAllAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    type Announcement,
    type AnnouncementType,
  } from '../../services/announcements';
  import { getAdminToken, logoutAdminMode, adminMode, adminPermissions } from '../../stores/admin';
  import { getSearchParams } from '../../router';
  import StaffPanel from './StaffPanel.svelte';
  import OverviewPanel from './OverviewPanel.svelte';
  import AniListPanel from './AniListPanel.svelte';

  type Tab = 'announcements' | 'staff' | 'overview' | 'anilist';
  type PanelMode = 'idle' | 'create' | 'edit';

  const TYPE_CONFIG: Record<AnnouncementType, { label: string; color: string }> = {
    NOTE:       { label: 'Заметка',        color: '#60a5fa' },
    TIP:        { label: 'Совет',          color: '#4ade80' },
    IMPORTANT:  { label: 'Важно',          color: '#a78bfa' },
    WARNING:    { label: 'Предупреждение', color: '#fbbf24' },
    CAUTION:    { label: 'Внимание',       color: '#f87171' },
    DISCUSSION: { label: 'Обсуждение',     color: '#38bdf8' },
  };

  const TYPE_OPTIONS = Object.entries(TYPE_CONFIG).map(([value, cfg]) => ({
    value,
    label: cfg.label,
  }));

  const profile = (window as any).__anixProfile as { id?: number } | undefined;
  const currentUserId = profile?.id ?? 0;

  let tab = $state<Tab>('announcements');
  let panelMode = $state<PanelMode>('idle');
  let announcements = $state<Announcement[]>([]);
  let loadError = $state('');
  let formError = $state('');
  let busy = $state(false);
  let standaloneWindow = $state(getSearchParams().get('standalone') === '1');

  let formType = $state<AnnouncementType>('DISCUSSION');
  let formMessage = $state('');
  let formLinkUrl = $state('');
  let formLinkLabel = $state('');
  let formActive = $state(true);
  let formCommentsEnabled = $state(true);
  let formCommentsLocked = $state(false);
  let editingId = $state<string | null>(null);

  const canManageStaff = $derived($adminPermissions.includes('manage_staff'));
  const canManageAnnouncements = $derived($adminPermissions.includes('manage_announcements'));
  const canManageOverview = $derived($adminPermissions.includes('manage_overview'));

  const tabItems = $derived([
    ...(canManageAnnouncements ? [{ id: 'announcements', label: 'Объявления', badge: announcements.length || undefined }] : []),
    ...(canManageOverview ? [{ id: 'overview', label: 'Обзоры' }] : []),
    { id: 'staff', label: canManageStaff ? 'Команда' : 'Мой доступ' },
    { id: 'anilist', label: "Anime API's" },
  ]);
  const canPopOut = $derived(typeof window !== 'undefined' && !!window.electron?.openAdminPanelWindow);
  const panelOpen = $derived(panelMode !== 'idle');
  const panelTitle = $derived(panelMode === 'edit' ? 'Редактирование' : 'Новое объявление');

  function typeMeta(type: AnnouncementType) {
    return TYPE_CONFIG[type] ?? TYPE_CONFIG.NOTE;
  }

  async function load() {
    loadError = '';
    const token = getAdminToken();
    if (!token) return;
    try {
      announcements = await fetchAllAnnouncements();
      if (tab === 'announcements' && panelMode === 'idle' && announcements.length === 0 && canManageAnnouncements) {
        startCreate();
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Ошибка загрузки';
    }
  }

  onMount(() => {
    if (!get(adminMode)) {
      navigate('/admin');
      return;
    }
    if (!canManageAnnouncements && canManageStaff) tab = 'staff';
    else if (!canManageAnnouncements && canManageOverview) tab = 'overview';
    void load();
  });

  function resetForm() {
    editingId = null;
    formType = 'DISCUSSION';
    formMessage = '';
    formLinkUrl = '';
    formLinkLabel = '';
    formActive = true;
    formCommentsEnabled = true;
    formCommentsLocked = false;
    formError = '';
  }

  function startCreate() {
    resetForm();
    panelMode = 'create';
  }

  function closePanel() {
    panelMode = 'idle';
    resetForm();
  }

  function editAnn(a: Announcement) {
    editingId = a.id;
    formType = a.type;
    formMessage = a.message;
    formLinkUrl = a.link?.url ?? '';
    formLinkLabel = a.link?.label ?? '';
    formActive = a.active;
    formCommentsEnabled = a.commentsEnabled;
    formCommentsLocked = a.commentsLocked;
    formError = '';
    panelMode = 'edit';
    tab = 'announcements';
  }

  async function saveAnnouncement() {
    if (busy) return;
    if (!formMessage.trim()) { formError = 'Введите текст объявления'; return; }
    busy = true;
    formError = '';
    try {
      const link = formLinkUrl.trim() && formLinkLabel.trim()
        ? { url: formLinkUrl.trim(), label: formLinkLabel.trim() }
        : null;
      const payload = { type: formType, message: formMessage.trim(), link, active: formActive, commentsEnabled: formCommentsEnabled, commentsLocked: formCommentsLocked };
      if (editingId) await updateAnnouncement(editingId, payload);
      else await createAnnouncement(payload);
      closePanel();
      await load();
      if (announcements.length === 0) startCreate();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Ошибка сохранения';
    } finally {
      busy = false;
    }
  }

  async function removeAnn(id: string) {
    if (!confirm('Удалить объявление?')) return;
    busy = true;
    try {
      await deleteAnnouncement(id);
      if (editingId === id) closePanel();
      await load();
      if (announcements.length === 0 && canManageAnnouncements) startCreate();
    } finally {
      busy = false;
    }
  }

  async function exitAdmin() {
    if (standaloneWindow) {
      window.electron?.closeToolWindow?.();
      return;
    }
    await logoutAdminMode();
    navigate('/');
  }

  function openInWindow() {
    void window.electron?.openAdminPanelWindow?.();
  }

  const currentTypeMeta = $derived(typeMeta(formType));
</script>

<div class="adm-root">

  <!-- ── Top bar ── -->
  <header class="adm-topbar">
    <div class="adm-topbar__left">
      <span class="adm-topbar__brand">Панель управления</span>
    </div>
    <nav class="adm-topbar__tabs">
      {#each tabItems as t}
        <button
          type="button"
          class="adm-tab"
          class:adm-tab--active={tab === t.id}
          onclick={() => { tab = t.id as Tab; }}
        >
          {t.label}
          {#if t.badge}<span class="adm-tab__badge">{t.badge}</span>{/if}
        </button>
      {/each}
    </nav>
    <div class="adm-topbar__right">
      {#if !standaloneWindow && canPopOut}
        <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={openInWindow}>
          Открыть в отдельном окне
        </button>
      {/if}
      <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={exitAdmin}>Выйти</button>
    </div>
  </header>

  <!-- ── Content area ── -->
  <div class="adm-body">

    {#if tab === 'announcements' && canManageAnnouncements}

      <!-- List pane -->
      <aside class="adm-pane adm-pane--list">
        <div class="adm-pane__head">
          <span class="adm-pane__title">Объявления</span>
          <div class="adm-pane__head-actions">
            {#if loadError}<span class="adm-pane__err" title={loadError}>!</span>{/if}
            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" onclick={startCreate}>+ Создать</button>
          </div>
        </div>

        {#if announcements.length === 0}
          <div class="adm-pane__empty">
            <p>Объявлений нет</p>
            <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={startCreate}>Создать первое</button>
          </div>
        {:else}
          <div class="adm-pane__scroll uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <ul class="adm-list uiv2-scroll-area__viewport">
              {#each announcements as a (a.id)}
                {@const meta = typeMeta(a.type)}
                <li>
                  <button
                    type="button"
                    class="adm-list-item"
                    class:adm-list-item--active={editingId === a.id && panelMode === 'edit'}
                    onclick={() => editAnn(a)}
                  >
                    <span class="adm-list-item__dot" style="--c:{meta.color}"></span>
                    <span class="adm-list-item__body">
                      <span class="adm-list-item__label">{meta.label}</span>
                      <span class="adm-list-item__text">{a.message}</span>
                      <span class="adm-list-item__chips">
                        {#if !a.active}<span class="adm-chip adm-chip--muted">Скрыто</span>{/if}
                        {#if a.commentsEnabled}<span class="adm-chip">Чат</span>{/if}
                        {#if typeof a.commentCount === 'number' && a.commentCount > 0}
                          <span class="adm-chip">{a.commentCount} комм.</span>
                        {/if}
                      </span>
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>
        {/if}
      </aside>

      <!-- Editor pane -->
      <section class="adm-pane adm-pane--editor">
        {#if panelOpen}
          <!-- Editor head -->
          <div class="adm-pane__head">
            <div class="adm-pane__head-title-group">
              <span class="adm-list-item__dot" style="--c:{currentTypeMeta.color}"></span>
              <div>
                <span class="adm-pane__title">{panelTitle}</span>
                <span class="adm-pane__sub">{panelMode === 'create' ? 'Новое объявление' : `ID ${editingId ?? '—'}`}</span>
              </div>
            </div>
          </div>

          <div class="adm-pane__scroll uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
            <div class="adm-pane__vp uiv2-scroll-area__viewport">
              {#if formError}
                <div class="adm-error-bar" role="alert">{formError}</div>
              {/if}

              <!-- Live preview -->
              <div class="adm-preview">
                <div class="adm-preview__badge" style="--c:{currentTypeMeta.color}">{currentTypeMeta.label}</div>
                <p class="adm-preview__text">{formMessage || 'Текст объявления появится здесь…'}</p>
                {#if formLinkUrl}
                  <span class="adm-preview__link">{formLinkLabel || formLinkUrl}</span>
                {/if}
                <div class="adm-preview__meta">
                  <span class="adm-status" class:adm-status--on={formActive}>
                    <span class="adm-status__dot"></span>{formActive ? 'Активно' : 'Скрыто'}
                  </span>
                  {#if formCommentsEnabled}
                    <span class="adm-status adm-status--on">
                      <span class="adm-status__dot"></span>{formCommentsLocked ? 'Чат закрыт' : 'Чат открыт'}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Content card -->
              <div class="adm-card">
                <p class="adm-card__label">Содержание</p>
                <div class="adm-card__body">
                  <UiV2Select
                    label="Тип"
                    options={TYPE_OPTIONS}
                    value={formType}
                    onChange={(v) => { if (v) formType = v as AnnouncementType; }}
                  />
                  <div class="adm-field">
                    <label class="adm-field__label" for="ann-message">Текст</label>
                    <textarea id="ann-message" class="adm-field__textarea" rows="4"
                      placeholder="Текст, который увидят пользователи…"
                      bind:value={formMessage}></textarea>
                  </div>
                </div>
              </div>

              <!-- Link card -->
              <div class="adm-card">
                <p class="adm-card__label">Ссылка <span class="adm-card__label-hint">— необязательно</span></p>
                <div class="adm-card__body adm-card__body--row">
                  <div class="adm-field">
                    <label class="adm-field__label" for="ann-link-url">URL</label>
                    <input id="ann-link-url" type="url" class="adm-field__input" placeholder="https://…" bind:value={formLinkUrl} />
                  </div>
                  <div class="adm-field">
                    <label class="adm-field__label" for="ann-link-label">Подпись</label>
                    <input id="ann-link-label" type="text" class="adm-field__input" placeholder="Подробнее" bind:value={formLinkLabel} />
                  </div>
                </div>
              </div>

              <!-- Toggles card -->
              <div class="adm-card">
                <p class="adm-card__label">Поведение</p>
                <label class="adm-toggle">
                  <span class="adm-toggle__info">
                    <span class="adm-toggle__name">Активно</span>
                    <span class="adm-toggle__desc">Показывать на главной</span>
                  </span>
                  <span class="uiv2-popup-menu__switch" class:uiv2-popup-menu__switch--on={formActive} aria-hidden="true">
                    <span class="uiv2-popup-menu__switch-thumb"></span>
                  </span>
                  <input type="checkbox" class="adm-sr-only" bind:checked={formActive} />
                </label>
                <label class="adm-toggle">
                  <span class="adm-toggle__info">
                    <span class="adm-toggle__name">Комментарии</span>
                    <span class="adm-toggle__desc">Разрешить обсуждение</span>
                  </span>
                  <span class="uiv2-popup-menu__switch" class:uiv2-popup-menu__switch--on={formCommentsEnabled} aria-hidden="true">
                    <span class="uiv2-popup-menu__switch-thumb"></span>
                  </span>
                  <input type="checkbox" class="adm-sr-only" bind:checked={formCommentsEnabled} />
                </label>
                <label class="adm-toggle" class:adm-toggle--disabled={!formCommentsEnabled}>
                  <span class="adm-toggle__info">
                    <span class="adm-toggle__name">Закрыть чат</span>
                    <span class="adm-toggle__desc">Только чтение</span>
                  </span>
                  <span class="uiv2-popup-menu__switch" class:uiv2-popup-menu__switch--on={formCommentsLocked} aria-hidden="true">
                    <span class="uiv2-popup-menu__switch-thumb"></span>
                  </span>
                  <input type="checkbox" class="adm-sr-only" bind:checked={formCommentsLocked} disabled={!formCommentsEnabled} />
                </label>
              </div>

            </div>
            <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
          </div>

          <div class="adm-pane__foot">
            {#if panelMode === 'edit' && editingId}
              <button
                type="button"
                class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm adm-btn-danger"
                disabled={busy}
                onclick={() => editingId && removeAnn(editingId)}
              >
                Удалить
              </button>
            {/if}

            <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" disabled={busy} onclick={closePanel}>
              Отмена
            </button>

            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" disabled={busy} onclick={saveAnnouncement}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>

        {:else}
          <div class="adm-empty">
            <div class="adm-empty__icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </div>
            <h2 class="adm-empty__title">Выберите объявление</h2>
            <p class="adm-empty__text">Нажмите на запись слева или создайте новое.</p>
            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" onclick={startCreate}>Создать</button>
          </div>
        {/if}
      </section>

    {:else if tab === 'overview' && canManageOverview}
      <div class="adm-body__full">
        <OverviewPanel />
      </div>
    {:else if tab === 'staff'}
      <div class="adm-body__full">
        <StaffPanel {canManageStaff} currentUserId={currentUserId} />
      </div>
    {:else if tab === 'anilist'}
      <div class="adm-body__full">
        <AniListPanel />
      </div>
    {/if}

  </div>
</div>

<style lang="scss">
:global(.page__scroll:has(.adm-root)) {
  padding: 0 !important;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Root ── */

.adm-root {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  background: var(--uikit-v2-bg);
  color: var(--uikit-v2-text);
  font-family: var(--uikit-v2-font);
}

/* ── Top bar ── */
.adm-topbar {
  display: flex;
  align-items: center;
  gap: 0;
  height: 3rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-surface);
  flex-shrink: 0;
  padding: 0 1rem;
}

.adm-topbar__left {
  flex-shrink: 0;
  margin-right: 1.5rem;
}

.adm-topbar__brand {
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.adm-topbar__tabs {
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 100%;
  flex: 1;
}

.adm-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.9rem;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--uiv2-fg-muted);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.15s ease;
  white-space: nowrap;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0.5rem;
    right: 0.5rem;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: var(--uikit-v2-accent);
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  &:hover { color: var(--uikit-v2-text); }

  &--active {
    color: var(--uikit-v2-text);
    font-weight: 600;
    &::after { opacity: 1; }
  }
}

.adm-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--uikit-v2-accent);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
}

.adm-topbar__right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  margin-left: auto;
}

/* ── Body split ── */
.adm-body {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  /* grid rows: single row filling all available height */
  grid-template-rows: 1fr;
}

/* ── Pane (list or editor) ── */
.adm-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;

  &--list {
    border-right: 1px solid var(--uiv2-border-subtle);
    background: var(--uikit-v2-surface);
  }

  &--editor {
    background: var(--uikit-v2-bg);
  }
}

.adm-pane__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.adm-pane__head-title-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.adm-pane__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--uikit-v2-text);
}

.adm-pane__sub {
  display: block;
  font-size: 0.7rem;
  color: var(--uiv2-fg-muted);
  margin-top: 0.05rem;
}

.adm-pane__head-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.adm-pane__err {
  width: 1.25rem;
  height: 1.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--uikit-v2-danger) 15%, transparent);
  color: var(--uikit-v2-danger);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: help;
}

.adm-pane__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.65rem;
  padding: 2.5rem 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--uiv2-fg-muted);
}

.adm-pane__scroll {
  flex: 1 1 0;
  min-height: 0;
  position: relative;
}

.adm-pane__scroll :global(.uiv2-scroll-area__viewport) {
  overflow-x: hidden;
  overflow-y: auto;
}

.adm-pane__foot {
  flex-shrink: 0;
  padding: 0.85rem 1rem;
  border-top: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-bg);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
}

/* ── List items ── */
.adm-list {
  list-style: none;
  margin: 0;
  padding: 0.35rem;
}

.adm-list-item {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  width: 100%;
  padding: 0.6rem 0.7rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover { background: var(--uiv2-hover-bg); }
  &--active { background: var(--uiv2-selected-bg); }
}

.adm-list-item__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c, var(--uikit-v2-accent));
  flex-shrink: 0;
  margin-top: 0.35rem;
}

.adm-list-item__body {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  flex: 1;
}

.adm-list-item__label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c, var(--uiv2-fg-muted));
}

.adm-list-item__text {
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--uikit-v2-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.adm-list-item__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.1rem;
}

/* full-width slot for panels with their own layout */
.adm-body__full {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  height: 100%;
}

.adm-body__full > :global(*) {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
}

/* ── Error bar ── */
.adm-error-bar {
  padding: 0.45rem 1rem;
  font-size: 0.8rem;
  color: var(--uikit-v2-danger);
  background: color-mix(in srgb, var(--uikit-v2-danger) 8%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--uikit-v2-danger) 20%, transparent);
  flex-shrink: 0;
}

/* ── Live preview ── */
.adm-preview {
  margin: 1rem;
  padding: 0.9rem 1rem;
  border-radius: 12px;
  background: var(--uiv2-surface-subtle);
  border: 1px solid var(--uiv2-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.adm-preview__badge {
  display: inline-flex;
  align-self: flex-start;
  padding: 0.12rem 0.45rem;
  border-radius: 5px;
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--c, #fff);
  background: color-mix(in srgb, var(--c, #fff) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c, #fff) 25%, transparent);
}

.adm-preview__text {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
  color: color-mix(in srgb, var(--uikit-v2-text) 70%, transparent);
  font-style: italic;
}

.adm-preview__link {
  display: inline-flex;
  align-self: flex-start;
  font-size: 0.8rem;
  color: var(--uikit-v2-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.adm-preview__meta {
  display: flex;
  gap: 0.75rem;
  padding-top: 0.35rem;
  border-top: 1px solid var(--uiv2-border-subtle);
}

.adm-status {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--uiv2-fg-muted);

  &--on { color: var(--uikit-v2-text); }
}

.adm-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--uiv2-fg-muted);
  flex-shrink: 0;

  .adm-status--on & { background: var(--uikit-v2-accent); }
}

/* Viewport wrapper — DO NOT set min-height:0, content must grow freely */
.adm-pane__vp {
  display: block;
  height: auto;
  padding-bottom: 1.25rem;
}

.adm-pane__vp > :global(*) {
  flex-shrink: 0;
}

/* ── Form cards ── */

.adm-card {
  margin: 0.75rem 1rem 0;
  border-radius: 12px;
  border: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-surface);
  overflow: hidden;
}

.adm-card__label {
  margin: 0;
  padding: 0.6rem 1rem 0;
  font-size: 0.67rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.adm-card__label-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.7;
}

.adm-card__body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.55rem 1rem 0.9rem;

  &--row {
    flex-direction: row;
  }
}

/* ── Toggle rows inside card ── */
.adm-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  cursor: pointer;
  transition: background 0.12s ease;
  border-top: 1px solid var(--uiv2-border-subtle);

  &:hover { background: var(--uiv2-hover-subtle); }

  &--disabled {
    opacity: 0.45;
    pointer-events: none;
  }
}

.adm-toggle__info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.adm-toggle__name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--uikit-v2-text);
}

.adm-toggle__desc {
  font-size: 0.72rem;
  color: var(--uiv2-fg-muted);
}

/* ── Chips ── */
.adm-chip {
  font-size: 0.67rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--uiv2-surface-raised);
  color: var(--uiv2-fg-muted);

  &--muted { opacity: 0.6; }
}

/* ── Fields ── */
.adm-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1 1 0;
  min-width: 0;
}

.adm-field__label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--uiv2-fg-muted);
}

.adm-field__input,
.adm-field__textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--uiv2-border-subtle);
  border-radius: 9px;
  background: var(--uikit-v2-bg);
  color: var(--uikit-v2-text);
  font: inherit;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus { border-color: var(--uikit-v2-accent); }
}

.adm-field__textarea {
  resize: vertical;
  min-height: 6rem;
  line-height: 1.5;
}

/* ── Danger button ── */
.adm-btn-danger { color: var(--uikit-v2-danger) !important; }

/* ── SR only ── */
.adm-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
}

/* ── Empty state ── */
.adm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 2rem;
  gap: 0.75rem;
}

.adm-empty__icon {
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--uiv2-surface-raised);
  color: var(--uiv2-fg-muted);
}

.adm-empty__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.adm-empty__text {
  margin: 0;
  font-size: 0.875rem;
  color: var(--uiv2-fg-muted);
  max-width: 22rem;
}
</style>
