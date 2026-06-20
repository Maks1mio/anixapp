<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { navigate } from '../../stores/navigation';
  import Tabs from '../../components/Tabs.svelte';
  import Select from '../../components/Select.svelte';
  import Checkbox from '../../components/Checkbox.svelte';
  import {
    fetchAllAnnouncements,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    type Announcement,
    type AnnouncementType,
  } from '../../services/announcements';
  import { getAdminToken, logoutAdminMode, adminMode, adminPermissions } from '../../stores/admin';
  import StaffPanel from './StaffPanel.svelte';
  import OverviewPanel from './OverviewPanel.svelte';

  type Tab = 'announcements' | 'staff' | 'overview';
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
    desc: value,
  }));

  const profile = (window as any).__anixProfile as { id?: number } | undefined;
  const currentUserId = profile?.id ?? 0;

  let tab = $state<Tab>('announcements');
  let panelMode = $state<PanelMode>('idle');
  let announcements = $state<Announcement[]>([]);
  let loadError = $state('');
  let formError = $state('');
  let busy = $state(false);

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
  ]);
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
    if (!canManageAnnouncements && canManageStaff) {
      tab = 'staff';
    } else if (!canManageAnnouncements && canManageOverview) {
      tab = 'overview';
    }
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
    if (!formMessage.trim()) {
      formError = 'Введите текст объявления';
      return;
    }
    busy = true;
    formError = '';
    try {
      const link = formLinkUrl.trim() && formLinkLabel.trim()
        ? { url: formLinkUrl.trim(), label: formLinkLabel.trim() }
        : null;
      const payload = {
        type: formType,
        message: formMessage.trim(),
        link,
        active: formActive,
        commentsEnabled: formCommentsEnabled,
        commentsLocked: formCommentsLocked,
      };
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
    await logoutAdminMode();
    navigate('/');
  }

  function onTabChange(id: string) {
    tab = id as Tab;
  }
</script>

<div class="view admin-page">
  <header class="view-header admin-page__header">
    <h1 class="view-header__title">Панель управления</h1>
    <p class="view-header__subtitle">Объявления, карусель обзора и доступ команды</p>
  </header>

  <Tabs
    tabs={tabItems}
    activeId={tab}
    onChange={onTabChange}
    rootClassName="bookmarks__tabs admin-page__tabs-bar"
  >
    {#snippet rightActions()}
      <button type="button" class="btn btn-secondary btn-sm" onclick={exitAdmin}>Выйти</button>
    {/snippet}
  </Tabs>

  {#if loadError}
    <p class="admin-page__error" role="alert">{loadError}</p>
  {/if}

  {#if tab === 'announcements' && canManageAnnouncements}
    <div class="admin-workspace">
      <aside class="admin-list" aria-label="Список объявлений">
        <div class="admin-list__toolbar">
          <p class="admin-list__title">Объявления</p>
          <button type="button" class="btn btn-primary btn-sm" onclick={startCreate}>
            + Создать
          </button>
        </div>

        {#if announcements.length === 0}
          <div class="admin-list__empty">
            <p>Пока нет объявлений</p>
            <button type="button" class="btn btn-secondary btn-sm" onclick={startCreate}>Создать первое</button>
          </div>
        {:else}
          <ul class="admin-list__items">
            {#each announcements as a (a.id)}
              {@const meta = typeMeta(a.type)}
              <li>
                <button
                  type="button"
                  class="admin-list__item"
                  class:admin-list__item--active={editingId === a.id && panelMode === 'edit'}
                  onclick={() => editAnn(a)}
                >
                  <span class="admin-list__badge" style="--c: {meta.color}">{meta.label}</span>
                  <span class="admin-list__preview">{a.message}</span>
                  <span class="admin-list__meta">
                    {#if !a.active}<span class="admin-list__chip admin-list__chip--muted">Скрыто</span>{/if}
                    {#if a.commentsEnabled}
                      <span class="admin-list__chip">Чат</span>
                    {/if}
                    {#if typeof a.commentCount === 'number' && a.commentCount > 0}
                      <span class="admin-list__chip">{a.commentCount} комм.</span>
                    {/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </aside>

      <section class="admin-editor" aria-label="Редактор объявления">
        {#if panelOpen}
          <div class="admin-editor__head">
            <div>
              <h2 class="admin-editor__title">{panelTitle}</h2>
              <p class="admin-editor__sub">
                {#if panelMode === 'create'}
                  Заполните форму и сохраните — объявление появится на главной, если включено «Активно».
                {:else}
                  Изменения применяются после сохранения.
                {/if}
              </p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick={closePanel}>Закрыть</button>
          </div>

          {#if formError}
            <p class="admin-page__error admin-page__error--inline" role="alert">{formError}</p>
          {/if}

          <div class="settings-section admin-editor__section">
            <p class="settings-section__label">Содержание</p>
            <div class="settings-section__body admin-editor__body">
              <div class="admin-editor__field">
                <Select
                  label="Тип"
                  options={TYPE_OPTIONS}
                  value={formType}
                  onChange={(v) => { formType = v as AnnouncementType; }}
                  placeholder="Выберите тип"
                />
              </div>

              <div class="admin-editor__field">
                <label class="admin-editor__label" for="ann-message">Текст</label>
                <textarea
                  id="ann-message"
                  class="settings-input admin-editor__textarea"
                  rows="5"
                  placeholder="Текст объявления на главной…"
                  bind:value={formMessage}
                ></textarea>
              </div>

              <div class="admin-editor__field admin-editor__field--row">
                <div class="admin-editor__field-grow">
                  <label class="admin-editor__label" for="ann-link-url">Ссылка</label>
                  <input
                    id="ann-link-url"
                    type="url"
                    class="settings-input"
                    placeholder="https://…"
                    bind:value={formLinkUrl}
                  />
                </div>
                <div class="admin-editor__field-grow">
                  <label class="admin-editor__label" for="ann-link-label">Подпись ссылки</label>
                  <input
                    id="ann-link-label"
                    type="text"
                    class="settings-input"
                    placeholder="Подробнее"
                    bind:value={formLinkLabel}
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="settings-section admin-editor__section">
            <p class="settings-section__label">Поведение</p>
            <div class="settings-section__body">
              <div class="settings-row">
                <div class="settings-row__info">
                  <div class="settings-row__label">Активно</div>
                  <div class="settings-row__desc">Показывать на главной странице</div>
                </div>
                <div class="settings-row__control">
                  <Checkbox bind:checked={formActive} />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__info">
                  <div class="settings-row__label">Комментарии</div>
                  <div class="settings-row__desc">Разрешить обсуждение под объявлением</div>
                </div>
                <div class="settings-row__control">
                  <Checkbox bind:checked={formCommentsEnabled} />
                </div>
              </div>
              <div class="settings-row">
                <div class="settings-row__info">
                  <div class="settings-row__label">Закрыть чат</div>
                  <div class="settings-row__desc">Только чтение, без новых сообщений</div>
                </div>
                <div class="settings-row__control">
                  <Checkbox bind:checked={formCommentsLocked} disabled={!formCommentsEnabled} />
                </div>
              </div>
            </div>
          </div>

          <footer class="admin-editor__foot">
            {#if panelMode === 'edit' && editingId}
              <button
                type="button"
                class="btn btn-secondary"
                disabled={busy}
                onclick={() => editingId && removeAnn(editingId)}
              >
                Удалить
              </button>
            {/if}
            <div class="admin-editor__foot-actions">
              <button type="button" class="btn btn-secondary" disabled={busy} onclick={closePanel}>Отмена</button>
              <button type="button" class="btn btn-primary" disabled={busy} onclick={saveAnnouncement}>
                {busy ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </footer>
        {:else}
          <div class="admin-editor__empty">
            <div class="admin-editor__empty-icon" aria-hidden="true">+</div>
            <h2 class="admin-editor__empty-title">Выберите объявление</h2>
            <p class="admin-editor__empty-text">
              Нажмите на запись слева, чтобы отредактировать, или создайте новое объявление.
            </p>
            <button type="button" class="btn btn-primary" onclick={startCreate}>Создать объявление</button>
          </div>
        {/if}
      </section>
    </div>
  {:else if tab === 'overview' && canManageOverview}
    <OverviewPanel />
  {:else if tab === 'staff'}
    <StaffPanel {canManageStaff} currentUserId={currentUserId} />
  {/if}
</div>
