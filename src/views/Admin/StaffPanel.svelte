<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2Select from '../../components/uikit-v2/UiV2Select.svelte';
  import { uiv2CustomScroll } from '../../actions/uiv2CustomScroll';
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

  let formRole = $state<'admin' | 'editor'>('editor');
  let formPermissions = $state<string[]>([]);
  let formPassword = $state('');
  let passwordCopied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  let selfCurrentPassword = $state('');
  let selfNewPassword = $state('');
  let selfConfirmPassword = $state('');

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
      if (!canManageStaff) openSelf();
      else if (staff.length === 0) startCreate();
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
    if (q.length < 2) { searchResults = []; return; }
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
    if (!token || !pickedUser) { formError = 'Выберите пользователя из поиска'; return; }
    if (formPassword.length < 8) { formError = 'Пароль — минимум 8 символов'; return; }
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
      await updateStaffMember(token, selectedId, { roleSlug: formRole, permissions: formPermissions });
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
    if (selfNewPassword.length < 8) { formError = 'Новый пароль — минимум 8 символов'; return; }
    if (selfNewPassword !== selfConfirmPassword) { formError = 'Пароли не совпадают'; return; }
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
    if (!selfCurrentPassword.trim()) { formError = 'Введите текущий пароль'; return; }
    if (formPassword.length < 8) { formError = 'Новый пароль — минимум 8 символов'; return; }
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

<div class="adm-staff">
  {#if canManageStaff}
    <!-- Staff list sidebar column -->
    <aside class="adm-staff__list">
      <div class="adm-staff__list-head">
        <span class="adm-staff__list-title">Участники</span>
        <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--sm" onclick={startCreate}>+ Добавить</button>
      </div>

      {#if loadError}
        <p class="adm-msg adm-msg--error" role="alert">{loadError}</p>
      {/if}

      {#if staff.length === 0}
        <div class="adm-staff__empty">
          <p>Команда пуста</p>
          <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={startCreate}>Добавить первого</button>
        </div>
      {:else}
        <div class="adm-staff__scroll uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
          <ul class="adm-staff__items uiv2-scroll-area__viewport">
            {#each staff as s (s.userId)}
              <li>
                <button
                  type="button"
                  class="adm-staff__item"
                  class:adm-staff__item--active={selectedId === s.userId && panelOpen}
                  onclick={() => openMember(s)}
                >
                  {#if profileCache[s.userId]?.avatar}
                    <span class="adm-avatar" style="background-image:url({profileCache[s.userId].avatar})"></span>
                  {:else}
                    <span class="adm-avatar adm-avatar--ph">{displayLogin(s.userId).charAt(0).toUpperCase()}</span>
                  {/if}
                  <span class="adm-staff__item-body">
                    <span class="adm-staff__item-name">{displayLogin(s.userId)}</span>
                    <span class="adm-staff__item-role" style="color:{s.color}">{s.roleName}</span>
                    {#if !s.hasPassword}
                      <span class="adm-chip adm-chip--warn">Нет пароля</span>
                    {/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
          <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
        </div>
      {/if}
    </aside>
  {/if}

  <!-- Editor panel -->
  <section class="adm-staff__editor uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
  <div class="uiv2-scroll-area__viewport adm-staff__editor-vp">
    {#if successMessage}
      <p class="adm-msg adm-msg--success" role="status">{successMessage}</p>
    {/if}

    {#if panelMode === 'create'}
      <header class="adm-editor__head">
        <div>
          <h2 class="adm-editor__title">Новый участник</h2>
          <p class="adm-editor__sub">Найдите пользователя по нику, задайте пароль и права доступа.</p>
        </div>
        <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--sm" onclick={closePanel}>Закрыть</button>
      </header>

      {#if formError}<p class="adm-msg adm-msg--error adm-msg--inline">{formError}</p>{/if}

      <div class="adm-section">
        <p class="adm-section__label">Пользователь</p>
        <div class="adm-section__body">
          <div class="adm-search">
            <input
              type="search"
              class="adm-field__input"
              placeholder="Поиск по никнейму…"
              bind:value={searchQuery}
              oninput={onSearchInput}
            />
            {#if searchLoading}<span class="adm-search__hint">Поиск…</span>{/if}
            {#if searchResults.length > 0}
              <ul class="adm-search__results">
                {#each searchResults as u (u.id)}
                  <li>
                    <button type="button" class="adm-search__item" onclick={() => pickUser(u)}>
                      {#if u.avatar}
                        <span class="adm-avatar adm-avatar--sm" style="background-image:url({resolveCdnAssetUrl(u.avatar)})"></span>
                      {/if}
                      <span>{u.login}</span>
                      <span class="adm-search__id">ID {u.id}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
          {#if pickedUser}
            <p class="adm-search__picked">Выбран: <strong>{pickedUser.login}</strong> (ID {pickedUser.id})</p>
          {/if}
        </div>
      </div>

      <div class="adm-section">
        <p class="adm-section__label">Пароль доступа</p>
        <p class="adm-section__desc">Скопируйте пароль и передайте участнику до сохранения.</p>
        <div class="adm-section__body">
          <div class="adm-pass-row">
            <input
              type="text"
              class="adm-field__input adm-field__input--mono"
              bind:value={formPassword}
              autocomplete="off"
              spellcheck="false"
            />
            <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--sm" onclick={shufflePassword}>Сгенерировать</button>
            <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--sm" disabled={!formPassword.trim()} onclick={copyPassword}>
              {passwordCopied ? 'Скопировано ✓' : 'Копировать'}
            </button>
          </div>
        </div>
      </div>

      <div class="adm-section adm-section--grow">
        <div class="adm-perm-head">
          <p class="adm-section__label">Права доступа</p>
          <UiV2Select
            options={STAFF_ROLE_OPTIONS}
            value={formRole}
            onChange={(v) => { if (v) applyRoleTemplate(v as 'admin' | 'editor'); }}
            placeholder="Шаблон роли"
          />
        </div>
        <div class="adm-section__body adm-section__body--rows">
          {#each permissionDefs as def (def.slug)}
            <label class="adm-perm-row">
              <span class="adm-toggle-row__info">
                <span class="adm-toggle-row__name">{def.name}</span>
                <span class="adm-toggle-row__desc">{def.description}</span>
              </span>
              <span class="uiv2-popup-menu__switch" class:uiv2-popup-menu__switch--on={formPermissions.includes(def.slug)} aria-hidden="true">
                <span class="uiv2-popup-menu__switch-thumb"></span>
              </span>
              <input
                type="checkbox"
                class="adm-sr-only"
                checked={formPermissions.includes(def.slug)}
                onchange={(e) => togglePermission(def.slug, (e.currentTarget as HTMLInputElement).checked)}
              />
            </label>
          {/each}
        </div>
      </div>

      <footer class="adm-editor__foot">
        <div class="adm-editor__foot-actions">
          <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--md" disabled={busy} onclick={closePanel}>Отмена</button>
          <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" disabled={busy} onclick={saveCreate}>Добавить</button>
        </div>
      </footer>

    {:else if panelMode === 'edit' && selectedMember}
      <header class="adm-editor__head">
        <div class="adm-editor__head-left">
          {#if profileCache[selectedMember.userId]?.avatar}
            <span class="adm-avatar adm-avatar--lg" style="background-image:url({profileCache[selectedMember.userId].avatar})"></span>
          {:else}
            <span class="adm-avatar adm-avatar--lg adm-avatar--ph">{displayLogin(selectedMember.userId).charAt(0).toUpperCase()}</span>
          {/if}
          <div>
            <h2 class="adm-editor__title">{displayLogin(selectedMember.userId)}</h2>
            <p class="adm-editor__sub">
              <span style="color:{selectedMember.color}">{selectedMember.roleName}</span>
              · ID {selectedMember.userId}
            </p>
          </div>
        </div>
        <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--sm" onclick={closePanel}>Закрыть</button>
      </header>

      {#if formError}<p class="adm-msg adm-msg--error adm-msg--inline">{formError}</p>{/if}

      {#if isFounderSelected}
        <div class="adm-section">
          <p class="adm-section__label">Сменить пароль</p>
          <p class="adm-section__desc">Укажите текущий и новый пароль. Сохраните новый у себя.</p>
          <div class="adm-section__body">
            <div class="adm-field">
              <label class="adm-field__label" for="founder-cur-pass">Текущий пароль</label>
              <input id="founder-cur-pass" type="password" class="adm-field__input" bind:value={selfCurrentPassword} autocomplete="current-password" />
            </div>
            <div class="adm-field">
              <label class="adm-field__label" for="founder-new-pass">Новый пароль</label>
              <div class="adm-pass-row">
                <input id="founder-new-pass" type="text" class="adm-field__input adm-field__input--mono" bind:value={formPassword} autocomplete="new-password" spellcheck="false" />
                <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--sm" onclick={shufflePassword}>Сгенерировать</button>
                <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--sm" disabled={!formPassword.trim()} onclick={copyPassword}>
                  {passwordCopied ? 'Скопировано ✓' : 'Копировать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <div class="adm-section">
          <p class="adm-section__label">Сменить пароль</p>
          <p class="adm-section__desc">Текущий пароль скрыт. Сгенерируйте новый, скопируйте и передайте участнику.</p>
          <div class="adm-section__body">
            <div class="adm-pass-row">
              <input type="text" class="adm-field__input adm-field__input--mono" bind:value={formPassword} placeholder="Пусто — не менять" autocomplete="off" spellcheck="false" />
              <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--sm" onclick={shufflePassword}>Сгенерировать</button>
              <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--sm" disabled={!formPassword.trim()} onclick={copyPassword}>
                {passwordCopied ? 'Скопировано ✓' : 'Копировать'}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <div class="adm-section adm-section--grow">
        <div class="adm-perm-head">
          <p class="adm-section__label">Права доступа</p>
          {#if !isFounderSelected}
            <button type="button" class="adm-link" disabled={busy} onclick={resetPermissions}>Сбросить права</button>
          {/if}
        </div>
        <div class="adm-section__body adm-section__body--rows">
          {#each permissionDefs as def (def.slug)}
            <label class="adm-perm-row" class:adm-perm-row--readonly={isFounderSelected}>
              <span class="adm-toggle-row__info">
                <span class="adm-toggle-row__name">{def.name}</span>
                <span class="adm-toggle-row__desc">{def.description}</span>
              </span>
              <span class="uiv2-popup-menu__switch" class:uiv2-popup-menu__switch--on={isFounderSelected ? true : formPermissions.includes(def.slug)} aria-hidden="true">
                <span class="uiv2-popup-menu__switch-thumb"></span>
              </span>
              <input
                type="checkbox"
                class="adm-sr-only"
                checked={isFounderSelected ? true : formPermissions.includes(def.slug)}
                disabled={isFounderSelected}
                onchange={(e) => togglePermission(def.slug, (e.currentTarget as HTMLInputElement).checked)}
              />
            </label>
          {/each}
        </div>
      </div>

      {#if !isFounderSelected}
        <div class="adm-section">
          <p class="adm-section__label">Роль (шаблон)</p>
          <UiV2Select
            options={STAFF_ROLE_OPTIONS}
            value={formRole}
            onChange={(v) => { if (v) applyRoleTemplate(v as 'admin' | 'editor'); }}
          />
        </div>
      {/if}

      <footer class="adm-editor__foot">
        {#if !isFounderSelected}
          <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--md adm-editor__delete" disabled={busy} onclick={removeMember}>Удалить</button>
        {/if}
        <div class="adm-editor__foot-actions">
          <button type="button" class="uiv2-btn uiv2-btn--chrome uiv2-btn--md" disabled={busy} onclick={closePanel}>Отмена</button>
          {#if isFounderSelected}
            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" disabled={busy} onclick={saveFounderPassword}>
              {busy ? 'Сохранение…' : 'Обновить пароль'}
            </button>
          {:else}
            <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" disabled={busy} onclick={saveEdit}>Сохранить</button>
          {/if}
        </div>
      </footer>

    {:else if panelMode === 'self' || (!canManageStaff && staff.length > 0)}
      {@const selfMember = staff.find((s) => s.userId === currentUserId)}
      <header class="adm-editor__head">
        <div>
          <h2 class="adm-editor__title">Мой доступ</h2>
          <p class="adm-editor__sub">Вы можете менять только свой пароль. Права назначает основатель.</p>
        </div>
      </header>

      {#if formError}<p class="adm-msg adm-msg--error adm-msg--inline">{formError}</p>{/if}

      {#if selfMember}
        <div class="adm-section">
          <p class="adm-section__label">Ваша роль</p>
          <div class="adm-section__body">
            <span class="adm-role-badge" style="color:{selfMember.color};border-color:color-mix(in srgb,{selfMember.color} 30%, transparent);background:color-mix(in srgb,{selfMember.color} 12%, transparent)">{selfMember.roleName}</span>
          </div>
        </div>

        <div class="adm-section adm-section--grow">
          <p class="adm-section__label">Выданные права</p>
          <div class="adm-section__body adm-section__body--rows">
            {#each permissionDefs as def (def.slug)}
              <div class="adm-perm-row adm-perm-row--readonly">
                <span class="adm-toggle-row__info">
                  <span class="adm-toggle-row__name">{def.name}</span>
                  <span class="adm-toggle-row__desc">{def.description}</span>
                </span>
                <span class="uiv2-popup-menu__switch" class:uiv2-popup-menu__switch--on={selfMember.permissions.includes(def.slug)} aria-hidden="true">
                  <span class="uiv2-popup-menu__switch-thumb"></span>
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <div class="adm-section">
        <p class="adm-section__label">Сменить пароль</p>
        <div class="adm-section__body">
          <div class="adm-field">
            <label class="adm-field__label" for="self-cur">Текущий пароль</label>
            <input id="self-cur" type="password" class="adm-field__input" bind:value={selfCurrentPassword} autocomplete="current-password" />
          </div>
          <div class="adm-field-row">
            <div class="adm-field">
              <label class="adm-field__label" for="self-new">Новый пароль</label>
              <input id="self-new" type="password" class="adm-field__input" bind:value={selfNewPassword} autocomplete="new-password" />
            </div>
            <div class="adm-field">
              <label class="adm-field__label" for="self-new2">Подтверждение</label>
              <input id="self-new2" type="password" class="adm-field__input" bind:value={selfConfirmPassword} autocomplete="new-password" />
            </div>
          </div>
          <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" disabled={busy} onclick={saveSelfPassword}>Обновить пароль</button>
        </div>
      </div>

    {:else}
      <div class="adm-empty">
        <div class="adm-empty__icon" aria-hidden="true">👤</div>
        <h2 class="adm-empty__title">Выберите участника</h2>
        <p class="adm-empty__text">Нажмите на пользователя слева или добавьте нового в команду.</p>
        <button type="button" class="uiv2-btn uiv2-btn--primary uiv2-btn--md" onclick={startCreate}>Добавить участника</button>
      </div>
    {/if}
  </div>
  <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
  </section>
</div>

<style lang="scss">
.adm-staff {
  display: grid;
  grid-template-columns: 17rem minmax(0, 1fr);
  grid-template-rows: 1fr;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.adm-staff__list {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--uiv2-border-subtle);
}

.adm-staff__list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  flex-shrink: 0;
  border-bottom: 1px solid var(--uiv2-border-subtle);
}

.adm-staff__list-title {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.adm-staff__empty {
  padding: 2rem 1rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: var(--uiv2-fg-muted);
}

.adm-staff__scroll {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}

.adm-staff__items {
  list-style: none;
  margin: 0;
  padding: 0.35rem;
}

.adm-staff__item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
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

.adm-staff__item-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  min-width: 0;
  flex: 1;
}

.adm-staff__item-name {
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.adm-staff__item-role {
  font-size: 0.75rem;
  font-weight: 600;
}

.adm-staff__editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.adm-staff__editor :global(.uiv2-scroll-area__viewport) {
  overflow-x: hidden;
  overflow-y: auto;
}

.adm-staff__editor-vp {
  display: block;
  height: auto;
}

.adm-staff__editor-vp > :global(*) {
  flex-shrink: 0;
}

.adm-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: var(--uiv2-surface-raised);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;

  &--sm { width: 1.5rem; height: 1.5rem; font-size: 0.65rem; }
  &--lg { width: 2.5rem; height: 2.5rem; font-size: 1rem; }
  &--ph { color: var(--uiv2-fg-muted); }
}

.adm-editor__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.adm-editor__head-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.adm-editor__title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.adm-editor__sub {
  margin: 0.2rem 0 0;
  font-size: 0.8125rem;
  color: var(--uiv2-fg-muted);
}

.adm-editor__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1.5rem;
  border-top: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.adm-editor__delete {
  color: color-mix(in srgb, var(--uikit-v2-danger) 80%, #fff);
}

.adm-editor__foot-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.adm-section {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.adm-section__label {
  margin: 0 0 0.65rem;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.adm-section__desc {
  margin: -0.35rem 0 0.65rem;
  font-size: 0.8rem;
  color: var(--uiv2-fg-muted);
  line-height: 1.45;
}

.adm-section__body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;

  &--rows {
    gap: 0;
    border: 1px solid var(--uiv2-border-subtle);
    border-radius: 12px;
    overflow: hidden;
  }
}

.adm-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1 1 0;
  min-width: 0;
}

.adm-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}

.adm-field__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--uiv2-fg-muted);
}

.adm-field__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--uiv2-border-strong);
  border-radius: 10px;
  background: var(--uiv2-hover-subtle);
  color: var(--uikit-v2-text);
  font: inherit;
  font-size: 0.9375rem;
  outline: none;
  transition: border-color 0.15s ease;

  &:focus { border-color: var(--uikit-v2-accent); background: transparent; }
  &--mono { font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; letter-spacing: 0.04em; }
}

.adm-pass-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;

  .adm-field__input { flex: 1; min-width: 12rem; }
}

.adm-search {
  position: relative;
}

.adm-search__hint {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: var(--uiv2-fg-muted);
}

.adm-search__results {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  border: 1px solid var(--uiv2-border-subtle);
  border-radius: 10px;
  overflow: hidden;
  background: var(--uikit-v2-surface);
}

.adm-search__item {
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

  &:hover { background: var(--uiv2-hover-bg); }
}

.adm-search__id {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--uiv2-fg-muted);
}

.adm-search__picked {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
  color: var(--uiv2-fg-muted);
}

.adm-perm-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.65rem;
}

.adm-perm-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  cursor: pointer;
  transition: background 0.12s ease;
  border-bottom: 1px solid var(--uiv2-border-subtle);

  &:last-child { border-bottom: 0; }
  &:hover { background: var(--uiv2-hover-subtle); }
  &--readonly { pointer-events: none; }
}

.adm-toggle-row__info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}

.adm-toggle-row__name {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--uikit-v2-text);
}

.adm-toggle-row__desc {
  font-size: 0.75rem;
  color: var(--uiv2-fg-muted);
}

.adm-role-badge {
  display: inline-flex;
  padding: 0.25rem 0.65rem;
  border-radius: 6px;
  border: 1px solid;
  font-size: 0.8125rem;
  font-weight: 700;
}

.adm-link {
  border: none;
  background: none;
  color: var(--uikit-v2-accent);
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 0;

  &:hover:not(:disabled) { text-decoration: underline; }
  &:disabled { opacity: 0.5; cursor: default; }
}

.adm-chip {
  font-size: 0.67rem;
  font-weight: 600;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--uiv2-surface-raised);
  color: var(--uiv2-fg-muted);

  &--warn { color: #fbbf24; }
}

.adm-msg {
  padding: 0.55rem 0.85rem;
  border-radius: 8px;
  font-size: 0.8125rem;
  margin: 0;
  flex-shrink: 0;

  &--error {
    color: var(--uikit-v2-danger);
    background: color-mix(in srgb, var(--uikit-v2-danger) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--uikit-v2-danger) 25%, transparent);
  }

  &--success {
    color: #4ade80;
    background: rgba(74, 222, 128, 0.1);
    border: 1px solid rgba(74, 222, 128, 0.25);
  }

  &--inline {
    margin: 0.5rem 1.5rem;
  }
}

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
  font-size: 1.5rem;
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

.adm-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
}
</style>
