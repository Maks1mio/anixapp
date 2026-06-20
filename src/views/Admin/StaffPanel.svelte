<script lang="ts">
  import { onMount } from 'svelte';
  import Select from '../../components/Select.svelte';
  import {
    fetchStaffList,
    fetchPermissionDefs,
    createStaffMember,
    updateStaffMember,
    resetStaffPermissions,
    setStaffPassword,
    changeOwnPassword,
    removeStaff,
    type StaffMember,
    type PermissionDef,
    getAdminToken,
  } from '../../services/admin-api';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';

  interface Props {
    canManageStaff: boolean;
    currentUserId: number;
  }

  let { canManageStaff, currentUserId }: Props = $props();

  type PanelMode = 'idle' | 'create' | 'edit' | 'self';

  let staff = $state<StaffMember[]>([]);
  let permissionDefs = $state<PermissionDef[]>([]);
  let panelMode = $state<PanelMode>('idle');
  let selectedId = $state<number | null>(null);
  let loadError = $state('');
  let successMessage = $state('');
  let formError = $state('');
  let busy = $state(false);
  let profileCache = $state<Record<number, { login: string; avatar: string | null }>>({});

  // Create / edit form
  let formRole = $state<'admin' | 'editor'>('editor');
  let formPermissions = $state<string[]>([]);
  let formPassword = $state('');
  let passwordCopied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  // Self password change
  let selfCurrentPassword = $state('');
  let selfNewPassword = $state('');
  let selfConfirmPassword = $state('');

  // User search (create)
  let searchQuery = $state('');
  let searchResults = $state<Array<{ id: number; login: string; avatar?: string | null }>>([]);
  let searchLoading = $state(false);
  let pickedUser = $state<{ id: number; login: string; avatar?: string | null } | null>(null);
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const STAFF_ROLE_OPTIONS = [
    { value: 'editor', label: 'Редактор', desc: 'Шаблон прав редактора' },
    { value: 'admin', label: 'Админ', desc: 'Шаблон прав админа' },
  ];

  const ROLE_TEMPLATES: Record<'admin' | 'editor', string[]> = {
    admin: ['manage_announcements', 'delete_any_comment', 'manage_staff', 'manage_overview'],
    editor: ['manage_announcements', 'delete_any_comment'],
  };

  const selectedMember = $derived(
    selectedId != null ? staff.find((s) => s.userId === selectedId) ?? null : null
  );
  const panelOpen = $derived(panelMode !== 'idle');
  const isFounderSelected = $derived(selectedMember?.roleSlug === 'founder');
  const readOnlyPermissions = $derived(!canManageStaff || panelMode === 'self');

  function generatePassword(): string {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function shufflePassword() {
    formPassword = generatePassword();
    passwordCopied = false;
    void copyPassword();
  }

  async function copyPassword() {
    if (!formPassword.trim()) return;
    try {
      await navigator.clipboard.writeText(formPassword);
      passwordCopied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { passwordCopied = false; }, 2500);
    } catch {
      passwordCopied = false;
    }
  }

  async function enrichProfiles(ids: number[]) {
    const missing = ids.filter((id) => !(id in profileCache));
    await Promise.allSettled(
      missing.map(async (uid) => {
        try {
          const data = await (window as any).anixApi?.profile?.info?.(uid);
          const p = data?.profile;
          profileCache = {
            ...profileCache,
            [uid]: {
              login: p?.login ?? p?.nickname ?? String(uid),
              avatar: p?.avatar ? resolveCdnAssetUrl(p.avatar) : null,
            },
          };
        } catch {
          profileCache = { ...profileCache, [uid]: { login: String(uid), avatar: null } };
        }
      })
    );
  }

  async function load() {
    loadError = '';
    successMessage = '';
    const token = getAdminToken();
    if (!token) return;
    try {
      [staff, permissionDefs] = await Promise.all([
        fetchStaffList(token),
        fetchPermissionDefs(token),
      ]);
      await enrichProfiles(staff.map((s) => s.userId));
      if (!canManageStaff) {
        openSelf();
      } else if (staff.length === 0) {
        startCreate();
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Ошибка загрузки';
    }
  }

  onMount(() => void load());

  function applyRoleTemplate(role: 'admin' | 'editor') {
    formRole = role;
    formPermissions = [...ROLE_TEMPLATES[role]];
  }

  function startCreate() {
    panelMode = 'create';
    selectedId = null;
    pickedUser = null;
    searchQuery = '';
    searchResults = [];
    formRole = 'editor';
    formPermissions = [...ROLE_TEMPLATES.editor];
    formPassword = '';
    passwordCopied = false;
    formError = '';
    shufflePassword();
  }

  function openMember(member: StaffMember) {
    if (!canManageStaff && member.userId !== currentUserId) return;
    selectedId = member.userId;
    panelMode = member.userId === currentUserId && !canManageStaff ? 'self' : 'edit';
    formRole = member.roleSlug === 'admin' ? 'admin' : 'editor';
    formPermissions =
      member.roleSlug === 'founder'
        ? permissionDefs.map((d) => d.slug)
        : [...member.permissions];
    formPassword = '';
    passwordCopied = false;
    selfCurrentPassword = '';
    formError = '';
  }

  function openSelf() {
    const self = staff.find((s) => s.userId === currentUserId);
    if (self) openMember(self);
    else panelMode = 'self';
  }

  function closePanel() {
    panelMode = 'idle';
    selectedId = null;
    formError = '';
  }

  function togglePermission(slug: string, enabled: boolean) {
    if (readOnlyPermissions || isFounderSelected) return;
    if (enabled) {
      if (!formPermissions.includes(slug)) formPermissions = [...formPermissions, slug];
    } else {
      formPermissions = formPermissions.filter((p) => p !== slug);
    }
  }

  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchResults = [];
      return;
    }
    searchTimer = setTimeout(() => void runSearch(q), 300);
  }

  async function runSearch(q: string) {
    if (!window.anixApi?.search?.profiles) return;
    searchLoading = true;
    try {
      const data = await window.anixApi.search.profiles(q, 0) as any;
      const content = (data?.content ?? data ?? []) as any[];
      searchResults = content
        .filter((p) => p?.id)
        .slice(0, 8)
        .map((p) => ({
          id: Number(p.id),
          login: String(p.login ?? p.nickname ?? p.id),
          avatar: p.avatar ?? null,
        }));
    } catch {
      searchResults = [];
    } finally {
      searchLoading = false;
    }
  }

  function pickUser(u: { id: number; login: string; avatar?: string | null }) {
    pickedUser = u;
    searchQuery = u.login;
    searchResults = [];
    profileCache = {
      ...profileCache,
      [u.id]: { login: u.login, avatar: u.avatar ? resolveCdnAssetUrl(u.avatar) : null },
    };
  }

  async function saveCreate() {
    const token = getAdminToken();
    if (!token || !pickedUser) {
      formError = 'Выберите пользователя из поиска';
      return;
    }
    if (formPassword.length < 8) {
      formError = 'Пароль — минимум 8 символов';
      return;
    }
    busy = true;
    formError = '';
    try {
      await createStaffMember(token, {
        userId: pickedUser.id,
        roleSlug: formRole,
        password: formPassword,
        permissions: formPermissions,
      });
      closePanel();
      await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Ошибка';
    } finally {
      busy = false;
    }
  }

  async function saveEdit() {
    const token = getAdminToken();
    if (!token || !selectedId || isFounderSelected) return;
    busy = true;
    formError = '';
    try {
      await updateStaffMember(token, selectedId, {
        roleSlug: formRole,
        permissions: formPermissions,
      });
      if (formPassword.trim()) {
        if (formPassword.length < 8) throw new Error('Пароль — минимум 8 символов');
        await setStaffPassword(token, selectedId, formPassword);
      }
      closePanel();
      await load();
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Ошибка';
    } finally {
      busy = false;
    }
  }

  async function resetPermissions() {
    const token = getAdminToken();
    if (!token || !selectedId) return;
    busy = true;
    try {
      formPermissions = await resetStaffPermissions(token, selectedId);
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Ошибка';
    } finally {
      busy = false;
    }
  }

  async function removeMember() {
    const token = getAdminToken();
    if (!token || !selectedId || !confirm('Удалить участника из команды?')) return;
    busy = true;
    try {
      await removeStaff(token, selectedId);
      closePanel();
      await load();
    } finally {
      busy = false;
    }
  }

  async function saveSelfPassword() {
    const token = getAdminToken();
    if (!token) return;
    if (selfNewPassword.length < 8) {
      formError = 'Новый пароль — минимум 8 символов';
      return;
    }
    if (selfNewPassword !== selfConfirmPassword) {
      formError = 'Пароли не совпадают';
      return;
    }
    busy = true;
    formError = '';
    try {
      await changeOwnPassword(token, selfCurrentPassword, selfNewPassword);
      selfCurrentPassword = '';
      selfNewPassword = '';
      selfConfirmPassword = '';
      formError = '';
      loadError = '';
      successMessage = 'Пароль успешно изменён';
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Ошибка';
    } finally {
      busy = false;
    }
  }

  async function saveFounderPassword() {
    const token = getAdminToken();
    if (!token) return;
    if (!selfCurrentPassword.trim()) {
      formError = 'Введите текущий пароль';
      return;
    }
    if (formPassword.length < 8) {
      formError = 'Новый пароль — минимум 8 символов';
      return;
    }
    busy = true;
    formError = '';
    try {
      await changeOwnPassword(token, selfCurrentPassword, formPassword);
      selfCurrentPassword = '';
      formPassword = '';
      passwordCopied = false;
      loadError = '';
      successMessage = 'Пароль успешно изменён';
    } catch (e) {
      formError = e instanceof Error ? e.message : 'Ошибка';
    } finally {
      busy = false;
    }
  }

  function displayLogin(userId: number): string {
    return profileCache[userId]?.login ?? `ID ${userId}`;
  }
</script>

<div class="admin-staff-page">
  {#if loadError}
    <p class="admin-page__error" role="alert">{loadError}</p>
  {/if}
  {#if successMessage}
    <p class="admin-page__success" role="status">{successMessage}</p>
  {/if}

  <div class="admin-workspace">
    {#if canManageStaff}
      <aside class="admin-list" aria-label="Участники команды">
        <div class="admin-list__toolbar">
          <p class="admin-list__title">Участники</p>
          <button type="button" class="btn btn-primary btn-sm" onclick={startCreate}>+ Добавить</button>
        </div>

        {#if staff.length === 0}
          <div class="admin-list__empty">
            <p>Команда пуста</p>
            <button type="button" class="btn btn-secondary btn-sm" onclick={startCreate}>Добавить первого</button>
          </div>
        {:else}
          <ul class="admin-list__items">
            {#each staff as s (s.userId)}
              <li>
                <button
                  type="button"
                  class="admin-list__item admin-list__item--staff"
                  class:admin-list__item--active={selectedId === s.userId && panelOpen}
                  onclick={() => openMember(s)}
                >
                  {#if profileCache[s.userId]?.avatar}
                    <span
                      class="admin-staff__avatar"
                      style="background-image:url({profileCache[s.userId].avatar})"
                    ></span>
                  {:else}
                    <span class="admin-staff__avatar admin-staff__avatar--ph">
                      {displayLogin(s.userId).charAt(0).toUpperCase()}
                    </span>
                  {/if}
                  <span class="admin-staff__item-body">
                    <span class="admin-staff__item-name">{displayLogin(s.userId)}</span>
                    <span class="admin-list__badge" style="--c: {s.color}">{s.roleName}</span>
                    <span class="admin-list__meta">
                      <span class="admin-list__chip">ID {s.userId}</span>
                      {#if !s.hasPassword}<span class="admin-list__chip admin-list__chip--warn">Нет пароля</span>{/if}
                    </span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </aside>
    {/if}

    <section class="admin-editor admin-staff-editor" aria-label="Настройки участника">
      {#if panelMode === 'create'}
        <div class="admin-editor__head">
          <div>
            <h2 class="admin-editor__title">Новый участник</h2>
            <p class="admin-editor__sub">Найдите пользователя по нику, задайте пароль и права доступа.</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick={closePanel}>Закрыть</button>
        </div>

        {#if formError}<p class="admin-page__error admin-page__error--inline">{formError}</p>{/if}

        <div class="settings-section">
          <p class="settings-section__label">Пользователь</p>
          <div class="settings-section__body admin-staff__search-wrap">
            <div class="admin-staff__search">
              <input
                type="search"
                class="settings-input"
                placeholder="Поиск по никнейму…"
                bind:value={searchQuery}
                oninput={onSearchInput}
              />
              {#if searchLoading}<span class="admin-staff__search-hint">Поиск…</span>{/if}
              {#if searchResults.length > 0}
                <ul class="admin-staff__search-results">
                  {#each searchResults as u (u.id)}
                    <li>
                      <button type="button" class="admin-staff__search-item" onclick={() => pickUser(u)}>
                        {#if u.avatar}
                          <span class="admin-staff__avatar admin-staff__avatar--sm" style="background-image:url({resolveCdnAssetUrl(u.avatar)})"></span>
                        {/if}
                        <span>{u.login}</span>
                        <span class="admin-staff__search-id">ID {u.id}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
            {#if pickedUser}
              <p class="admin-staff__picked">Выбран: <strong>{pickedUser.login}</strong> (ID {pickedUser.id})</p>
            {/if}
          </div>
        </div>

        <div class="settings-section">
          <p class="settings-section__label">Пароль доступа</p>
          <p class="settings-section__desc">
            Скопируйте пароль и передайте участнику до сохранения — после добавления его нельзя посмотреть.
          </p>
          <div class="settings-section__body admin-staff__password-block">
            <label class="admin-editor__label" for="new-staff-pass">Пароль для передачи</label>
            <div class="admin-staff__password-row">
              <input
                id="new-staff-pass"
                type="text"
                class="settings-input admin-staff__password-visible"
                bind:value={formPassword}
                autocomplete="off"
                spellcheck="false"
              />
              <button type="button" class="btn btn-secondary btn-sm" onclick={shufflePassword}>
                Сгенерировать
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                disabled={!formPassword.trim()}
                onclick={copyPassword}
              >
                {passwordCopied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="admin-staff__perm-head">
            <p class="settings-section__label">Права доступа</p>
            <Select
              options={STAFF_ROLE_OPTIONS}
              value={formRole}
              onChange={(v) => applyRoleTemplate(v as 'admin' | 'editor')}
              placeholder="Шаблон роли"
            />
          </div>
          <div class="settings-section__body">
            {#each permissionDefs as def (def.slug)}
              <div class="settings-row">
                <div class="settings-row__info">
                  <div class="settings-row__label">{def.name}</div>
                  <div class="settings-row__desc">{def.description}</div>
                </div>
                <div class="settings-row__control">
                  <label class="settings-toggle-switch" aria-label={def.name}>
                    <input
                      type="checkbox"
                      checked={formPermissions.includes(def.slug)}
                      onchange={(e) => togglePermission(def.slug, (e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span class="settings-toggle-switch__track"></span>
                    <span class="settings-toggle-switch__thumb"></span>
                  </label>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <footer class="admin-editor__foot">
          <div class="admin-editor__foot-actions">
            <button type="button" class="btn btn-secondary" disabled={busy} onclick={closePanel}>Отмена</button>
            <button type="button" class="btn btn-primary" disabled={busy} onclick={saveCreate}>Добавить</button>
          </div>
        </footer>
      {:else if panelMode === 'edit' && selectedMember}
        <div class="admin-editor__head">
          <div>
            <h2 class="admin-editor__title">{displayLogin(selectedMember.userId)}</h2>
            <p class="admin-editor__sub">
              <span class="admin-list__badge" style="--c: {selectedMember.color}">{selectedMember.roleName}</span>
              · ID {selectedMember.userId}
            </p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick={closePanel}>Закрыть</button>
        </div>

        {#if formError}<p class="admin-page__error admin-page__error--inline">{formError}</p>{/if}

        {#if isFounderSelected}
          <div class="settings-section">
            <p class="settings-section__label">Сменить пароль</p>
            <p class="settings-section__desc">
              Укажите текущий пароль и новый. Сгенерированный пароль виден здесь — сохраните его у себя.
            </p>
            <div class="settings-section__body admin-staff__password-block">
              <div class="admin-editor__field">
                <label class="admin-editor__label" for="founder-cur-pass">Текущий пароль</label>
                <input
                  id="founder-cur-pass"
                  type="password"
                  class="settings-input"
                  bind:value={selfCurrentPassword}
                  autocomplete="current-password"
                />
              </div>
              <label class="admin-editor__label" for="founder-new-pass">Новый пароль</label>
              <div class="admin-staff__password-row">
                <input
                  id="founder-new-pass"
                  type="text"
                  class="settings-input admin-staff__password-visible"
                  bind:value={formPassword}
                  autocomplete="new-password"
                  spellcheck="false"
                />
                <button type="button" class="btn btn-secondary btn-sm" onclick={shufflePassword}>
                  Сгенерировать
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  disabled={!formPassword.trim()}
                  onclick={copyPassword}
                >
                  {passwordCopied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </div>
          </div>
        {:else}
          <div class="settings-section">
            <p class="settings-section__label">Сменить пароль</p>
            <p class="settings-section__desc">
              Текущий пароль скрыт. Сгенерируйте новый, скопируйте и передайте участнику, затем сохраните.
            </p>
            <div class="settings-section__body admin-staff__password-block">
              <label class="admin-editor__label" for="edit-pass">Новый пароль</label>
              <div class="admin-staff__password-row">
                <input
                  id="edit-pass"
                  type="text"
                  class="settings-input admin-staff__password-visible"
                  bind:value={formPassword}
                  placeholder="Пусто — не менять"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button type="button" class="btn btn-secondary btn-sm" onclick={shufflePassword}>
                  Сгенерировать
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  disabled={!formPassword.trim()}
                  onclick={copyPassword}
                >
                  {passwordCopied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </div>
          </div>
        {/if}

        <div class="settings-section">
          <div class="admin-staff__perm-head">
            <p class="settings-section__label">Права доступа</p>
            {#if !isFounderSelected}
              <button type="button" class="admin-staff__reset-link" disabled={busy} onclick={resetPermissions}>
                Сбросить права
              </button>
            {/if}
          </div>
          <div class="settings-section__body">
            {#each permissionDefs as def (def.slug)}
              <div class="settings-row" class:settings-row--readonly={isFounderSelected}>
                <div class="settings-row__info">
                  <div class="settings-row__label">{def.name}</div>
                  <div class="settings-row__desc">{def.description}</div>
                </div>
                <div class="settings-row__control">
                  <label class="settings-toggle-switch" aria-label={def.name}>
                    <input
                      type="checkbox"
                      checked={isFounderSelected ? true : formPermissions.includes(def.slug)}
                      disabled={isFounderSelected}
                      onchange={(e) => togglePermission(def.slug, (e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span class="settings-toggle-switch__track"></span>
                    <span class="settings-toggle-switch__thumb"></span>
                  </label>
                </div>
              </div>
            {/each}
          </div>
        </div>

        {#if !isFounderSelected}
          <div class="settings-section">
            <p class="settings-section__label">Роль (шаблон)</p>
            <Select
              options={STAFF_ROLE_OPTIONS}
              value={formRole}
              onChange={(v) => applyRoleTemplate(v as 'admin' | 'editor')}
            />
          </div>
        {/if}

        <footer class="admin-editor__foot">
          {#if !isFounderSelected}
            <button type="button" class="btn btn-secondary" disabled={busy} onclick={removeMember}>Удалить</button>
          {/if}
          <div class="admin-editor__foot-actions">
            <button type="button" class="btn btn-secondary" disabled={busy} onclick={closePanel}>Отмена</button>
            {#if isFounderSelected}
              <button type="button" class="btn btn-primary" disabled={busy} onclick={saveFounderPassword}>
                {busy ? 'Сохранение…' : 'Обновить пароль'}
              </button>
            {:else}
              <button type="button" class="btn btn-primary" disabled={busy} onclick={saveEdit}>Сохранить</button>
            {/if}
          </div>
        </footer>
      {:else if panelMode === 'self' || (!canManageStaff && staff.length > 0)}
        {@const selfMember = staff.find((s) => s.userId === currentUserId)}
        <div class="admin-editor__head">
          <div>
            <h2 class="admin-editor__title">Мой доступ</h2>
            <p class="admin-editor__sub">Вы можете менять только свой пароль. Права назначает основатель.</p>
          </div>
        </div>

        {#if formError}<p class="admin-page__error admin-page__error--inline">{formError}</p>{/if}

        {#if selfMember}
          <div class="settings-section">
            <p class="settings-section__label">Ваша роль</p>
            <div class="settings-section__body admin-staff__self-role">
              <span class="admin-list__badge" style="--c: {selfMember.color}">{selfMember.roleName}</span>
              <span>ID {selfMember.userId}</span>
            </div>
          </div>

          <div class="settings-section">
            <p class="settings-section__label">Выданные права</p>
            <div class="settings-section__body">
              {#each permissionDefs as def (def.slug)}
                <div class="settings-row settings-row--readonly">
                  <div class="settings-row__info">
                    <div class="settings-row__label">{def.name}</div>
                    <div class="settings-row__desc">{def.description}</div>
                  </div>
                  <div class="settings-row__control">
                    <label class="settings-toggle-switch">
                      <input type="checkbox" checked={selfMember.permissions.includes(def.slug)} disabled />
                      <span class="settings-toggle-switch__track"></span>
                      <span class="settings-toggle-switch__thumb"></span>
                    </label>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="settings-section">
          <p class="settings-section__label">Сменить пароль</p>
          <div class="settings-section__body admin-staff__password-block">
            <div class="admin-editor__field">
              <label class="admin-editor__label" for="self-cur">Текущий пароль</label>
              <input id="self-cur" type="password" class="settings-input" bind:value={selfCurrentPassword} autocomplete="current-password" />
            </div>
            <div class="admin-editor__field admin-editor__field--row">
              <div class="admin-editor__field-grow">
                <label class="admin-editor__label" for="self-new">Новый пароль</label>
                <input id="self-new" type="password" class="settings-input" bind:value={selfNewPassword} autocomplete="new-password" />
              </div>
              <div class="admin-editor__field-grow">
                <label class="admin-editor__label" for="self-new2">Подтверждение</label>
                <input id="self-new2" type="password" class="settings-input" bind:value={selfConfirmPassword} autocomplete="new-password" />
              </div>
            </div>
            <button type="button" class="btn btn-primary" disabled={busy} onclick={saveSelfPassword}>Обновить пароль</button>
          </div>
        </div>
      {:else}
        <div class="admin-editor__empty">
          <h2 class="admin-editor__empty-title">Выберите участника</h2>
          <p class="admin-editor__empty-text">Нажмите на пользователя слева или добавьте нового в команду.</p>
          <button type="button" class="btn btn-primary" onclick={startCreate}>Добавить участника</button>
        </div>
      {/if}
    </section>
  </div>
</div>

<style lang="scss">
.admin-page__success {
  color: #4ade80;
  font-size: 0.875rem;
  margin: 0 0 1rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  background: rgba(74, 222, 128, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.25);
}

  .admin-staff-editor {
    min-height: 24rem;
  }

  .admin-list__item--staff {
    flex-direction: row;
    align-items: center;
    gap: 0.65rem;
  }

  .admin-staff__avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    flex-shrink: 0;
    background-size: cover;
    background-position: center;
    background-color: rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;

    &--sm {
      width: 1.5rem;
      height: 1.5rem;
      font-size: 0.65rem;
    }

    &--ph {
      color: rgba(255, 255, 255, 0.5);
    }
  }

  .admin-staff__item-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    min-width: 0;
  }

  .admin-staff__item-name {
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .admin-list__chip--warn {
    color: #fbbf24;
    border-color: rgba(251, 191, 36, 0.35);
  }

  .admin-staff__search-wrap {
    padding: 1rem;
  }

  .admin-staff__search {
    position: relative;
  }

  .admin-staff__search-hint {
    display: block;
    margin-top: 0.35rem;
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
  }

  .admin-staff__search-results {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.25);
  }

  .admin-staff__search-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.55rem 0.75rem;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.05);
    }
  }

  .admin-staff__search-id {
    margin-left: auto;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.4);
  }

  .admin-staff__picked {
    margin: 0.75rem 0 0;
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .admin-staff__password-block {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .admin-staff__password-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .admin-staff__password-visible {
    flex: 1;
    min-width: 12rem;
    font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.9375rem;
    letter-spacing: 0.04em;
  }

  .admin-staff__perm-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .admin-staff__reset-link {
    border: none;
    background: none;
    color: #7c9cff;
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0;

    &:hover:not(:disabled) {
      text-decoration: underline;
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  .admin-staff__self-role {
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
  }
</style>
