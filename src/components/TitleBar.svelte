<script lang="ts">
  import { onMount } from 'svelte';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import { iconArrowLeft, iconArrowRight, iconSearch, iconUsers, iconBell, iconCalendar, iconUser, iconSettings, iconDownload, iconChevronDown, iconPlus, iconX } from './icons';
  import { checkForUpdate, type UpdateInfo } from '../services/update-checker';
  import type { AppUpdateProgress } from '../types/electron';
  import { isAuthenticated, openLoginPrompt, applyAccountSessionChange } from '../stores/auth';
  import { notificationUnreadCount, refreshNotificationUnreadCount } from '../stores/notifications';
  import ConnectionBanner from './ConnectionBanner.svelte';
  import UiV2Tooltip from './uikit-v2/UiV2Tooltip.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './uikit-v2/UiV2PopupMenu.svelte';

  const hasWindowApi = typeof (window as any).electron?.window !== 'undefined';

  type SavedAccountRow = { id: number; login: string; avatar: string | null; active: boolean };

  interface Props {
    onLobby?: () => void;
    onNotifications?: () => void;
    onSchedule?: () => void;
    scheduleOpen?: boolean;
    onSettings?: () => void;
    onProfile?: (event: MouseEvent) => void;
    onSearchTab?: () => void;
    searchTabActive?: boolean;
    onConnectionRetry?: () => void | Promise<void>;
  }

  let {
    onLobby,
    onNotifications,
    onSchedule,
    scheduleOpen = false,
    onSettings,
    onProfile,
    onSearchTab,
    searchTabActive = false,
    onConnectionRetry,
  }: Props = $props();

  let updateInfo: UpdateInfo | null = $state(null);
  let updateDownloading = $state(false);
  let updatePct = $state(0);
  let updateState: 'idle' | 'downloading' | 'ready' | 'error' | 'installing' | 'install-error' = $state('idle');
  let installType: string | null = $state(null);
  let avatarUrl: string | null = $state(null);
  let profileLogin = $state('');
  let profileId = $state(0);
  let hasUnreadNotifications = $state(false);
  let appVersion = $state('');
  let authed = $state(false);
  let savedAccounts = $state<SavedAccountRow[]>([]);

  let accountsOpen = $state(false);
  let accountsX = $state(0);
  let accountsY = $state(0);
  let accountsAnchor = $state<HTMLElement | null>(null);
  let accountChipEl = $state<HTMLDivElement | null>(null);

  function syncAvatarFromGlobalProfile() {
    const profile = (window as any).__anixProfile;
    avatarUrl = profile?.avatar ? resolveCdnAssetUrl(profile.avatar) : null;
    profileLogin = typeof profile?.login === 'string' ? profile.login : '';
    profileId = Number(profile?.id ?? 0) || 0;
  }

  async function refreshSavedAccounts() {
    try {
      const res = await window.anixApi?.auth?.listAccounts?.();
      savedAccounts = Array.isArray(res?.accounts) ? res.accounts : [];
    } catch {
      savedAccounts = [];
    }
  }

  function accountAvatarIcon(avatar: string | null): string {
    if (!avatar) return iconUser(18);
    const url = resolveCdnAssetUrl(avatar);
    return `<span class="titlebar__account-menu-avatar" style="background-image:url(${url})"></span>`;
  }

  const accountMenuItems = $derived.by((): UiV2PopupMenuItem[] => {
    const items: UiV2PopupMenuItem[] = [];
    const list = savedAccounts.length > 0
      ? savedAccounts
      : (authed && (profileLogin || profileId)
          ? [{ id: profileId || 0, login: profileLogin || `ID ${profileId}`, avatar: null, active: true }]
          : []);

    for (const acc of list) {
      items.push({
        id: `account:${acc.id}`,
        label: acc.login || `ID ${acc.id}`,
        icon: accountAvatarIcon(acc.avatar),
        type: 'radio',
        checked: !!acc.active,
        keepOpen: false,
        trailingIcon: list.length > 1 ? iconX(14) : undefined,
        trailingLabel: list.length > 1 ? 'Выйти / удалить из списка' : undefined,
      });
    }

    items.push({
      id: authed ? 'account:add' : 'account:login',
      label: authed ? 'Добавить аккаунт' : 'Войти в аккаунт',
      icon: iconPlus(18),
      dividerBefore: items.length > 0,
    });
    return items;
  });

  async function toggleAccountsMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (accountsOpen) {
      accountsOpen = false;
      return;
    }
    await refreshSavedAccounts();
    const el = accountChipEl;
    if (!el) return;
    const r = el.getBoundingClientRect();
    accountsAnchor = el;
    accountsX = r.left + r.width / 2;
    accountsY = r.bottom;
    accountsOpen = true;
  }

  function closeAccountsMenu() {
    accountsOpen = false;
  }

  async function afterAccountSessionChange() {
    closeAccountsMenu();
    await applyAccountSessionChange();
  }

  async function onAccountMenuSelect(id: string) {
    if (id === 'account:add' || id === 'account:login') {
      closeAccountsMenu();
      openLoginPrompt();
      return;
    }
    const m = /^account:(\d+)$/.exec(id);
    if (!m) return;
    const targetId = Number(m[1]);
    closeAccountsMenu();
    if (targetId === profileId) return;
    try {
      const res = await window.anixApi?.auth?.switchAccount?.(targetId);
      if (res?.success && !res.alreadyActive) await afterAccountSessionChange();
    } catch {
      /* ignore */
    }
  }

  async function onAccountTrailingClick(id: string) {
    const m = /^account:(\d+)$/.exec(id);
    if (!m) return;
    const targetId = Number(m[1]);
    try {
      const res = await window.anixApi?.auth?.removeAccount?.(targetId);
      if (!res?.success) return;
      if (res.loggedOut || res.switched) {
        await afterAccountSessionChange();
      } else {
        await refreshSavedAccounts();
      }
    } catch {
      /* ignore */
    }
  }

  async function loadAppVersion() {
    try {
      const versions = await window.electron?.getVersions?.();
      const v = versions?.app || (await window.electron?.getAppVersion?.());
      if (v) appVersion = String(v).replace(/^v/i, '');
    } catch {
      // ignore
    }
  }

  async function loadUpdateInfo() {
    const currentVersion =
      (await window.electron?.getVersions?.().then((v: any) => v?.app).catch(() => undefined))
      ?? (await window.electron?.getAppVersion?.().catch(() => undefined));
    if (!currentVersion) return;
    const info = await checkForUpdate(String(currentVersion)).catch(() => null);
    if (info) updateInfo = info;
  }

  /** Человекочитаемая подпись кнопки установки для текущего типа пакета. */
  function installLabel(): string {
    if (installType === 'appimage') return 'Установить и перезапустить';
    if (installType === 'pacman')   return 'Установить (Arch)';
    if (installType === 'flatpak')  return 'Обновить (Flatpak)';
    return 'Установить';
  }

  /** Подсказка в тултипе кнопки "готово к установке". */
  function installTooltip(): string {
    if (installType === 'appimage') return 'Файл скачан — приложение заменится и перезапустится';
    if (installType === 'pacman')   return 'Откроется окно pkexec (ввод пароля root)';
    if (installType === 'flatpak')  return 'Запустится flatpak update';
    return 'Откроется установщик пакета';
  }

  onMount(() => {
    syncAvatarFromGlobalProfile();
    void loadAppVersion();

    // Получаем тип установки для правильных подписей кнопки
    window.electron?.getLinuxInstallType?.().then((t) => {
      if (t) installType = t;
    }).catch(() => {});

    // Check for app updates
    void loadUpdateInfo();

    // App update progress listener
    const onProgress = (ev: Event) => {
      const data = (ev as CustomEvent<AppUpdateProgress>).detail;
      // Синхронизируем тип установки из прогресс-события (если ещё не получен)
      if (data.installType && !installType) installType = data.installType;
      if (data.state === 'downloading') {
        updatePct = data.total > 0 ? Math.round((data.received / data.total) * 100) : data.percent || 0;
        updateState = 'downloading';
      } else if (data.state === 'ready') {
        updateState = 'ready';
        updatePct = 100;
        // Не устанавливаем автоматически — пользователь должен явно нажать кнопку.
      } else if (data.state === 'error') {
        updateState = 'error';
        updateDownloading = false;
      } else if (data.state === 'installing') {
        // Ждём ввода пароля пользователем — показываем индикатор
        updateState = 'installing';
      } else if (data.state === 'install-error') {
        // Пользователь отменил или установка упала — возвращаемся в ready
        updateState = 'ready';
        updateDownloading = false;
      }
    };
    window.addEventListener('app-update-progress', onProgress);
    window.addEventListener('anix:profileUpdated', syncAvatarFromGlobalProfile as EventListener);

    const unsubUnread = notificationUnreadCount.subscribe((n) => {
      hasUnreadNotifications = n > 0;
    });
    const unsubAuth = isAuthenticated.subscribe((ok) => {
      authed = ok;
      if (ok) {
        void refreshNotificationUnreadCount();
        void refreshSavedAccounts();
      } else {
        notificationUnreadCount.set(0);
        profileLogin = '';
        profileId = 0;
        avatarUrl = null;
        savedAccounts = [];
      }
    });
    void refreshNotificationUnreadCount();
    void refreshSavedAccounts();
    const unreadPoll = setInterval(() => {
      void refreshNotificationUnreadCount();
    }, 60_000);

    return () => {
      window.removeEventListener('app-update-progress', onProgress);
      window.removeEventListener('anix:profileUpdated', syncAvatarFromGlobalProfile as EventListener);
      unsubUnread();
      unsubAuth();
      clearInterval(unreadPoll);
    };
  });

  function handleStartUpdate() {
    if (updateState === 'ready') {
      // Download done — now install
      (window.electron as any)?.installUpdate?.();
      return;
    }
    if (updateDownloading || !updateInfo) return;
    updateDownloading = true;
    updateState = 'downloading';
    updatePct = 0;
    (window.electron as any)?.startUpdateDownload?.().catch(() => {
      updateDownloading = false;
      updateState = 'error';
    });
  }

  function handleBack() { window.history.back(); }
  function handleForward() { window.history.forward(); }
  function handleMinimize() { (window as any).electron?.window?.minimize(); }
  function handleMaximize() { (window as any).electron?.window?.maximize(); }
  function handleClose() { (window as any).electron?.window?.close(); }

</script>

<div
  class="titlebar"
  role="banner"
>
  <div class="titlebar__drag">
    <span class="titlebar__logo" aria-hidden="true">
      <img src="logo/512x512.png" alt="" class="titlebar__logo-img" />
    </span>
    <div class="titlebar__brand" title={appVersion ? `AnixApp v${appVersion}` : 'AnixApp beta'}>
      <span class="titlebar__title">AnixApp</span>
      <span class="titlebar__beta">beta</span>
      {#if appVersion}
        <span class="titlebar__version">v{appVersion}</span>
      {/if}
    </div>
  </div>

  <div class="titlebar__nav" id="titlebar-nav">
    <UiV2Tooltip text="Назад">
      <button
        type="button"
        class="titlebar__nav-btn"
        id="titlebar-back"
        aria-label="Назад"
        onclick={handleBack}
      >
        {@html iconArrowLeft(16)}
      </button>
    </UiV2Tooltip>
    <UiV2Tooltip text="Вперёд">
      <button
        type="button"
        class="titlebar__nav-btn"
        id="titlebar-forward"
        aria-label="Вперёд"
        onclick={handleForward}
      >
        {@html iconArrowRight(16)}
      </button>
    </UiV2Tooltip>
  </div>

  <!-- Явная зона drag / dblclick между навигацией и меню -->
  <div class="titlebar__space" aria-hidden="true"></div>

  <div class="titlebar__menu" id="titlebar-menu">
    <ConnectionBanner onRetry={onConnectionRetry} />
    <!-- Update button -->
    {#if updateInfo}
      {#if updateState === 'downloading'}
        <!-- Downloading: inline progress bar, no click -->
        <button
          type="button"
          class="titlebar__menu-item titlebar__menu-item--update titlebar__menu-item--update-downloading"
          aria-label="Загрузка обновления {updatePct}%"
        >
          <span class="titlebar__update-fill" style="width:{updatePct}%"></span>
          {@html iconDownload(14)}
          <span class="titlebar__update-label">{updatePct}%</span>
        </button>
      {:else if updateState === 'installing'}
        <UiV2Tooltip text="Введите пароль в диалоге авторизации">
          <button
            type="button"
            class="titlebar__menu-item titlebar__menu-item--update titlebar__menu-item--update-downloading"
            aria-label="Установка обновления…"
          >
            <span class="titlebar__update-fill titlebar__update-fill--pulse" style="width:100%"></span>
            {@html iconDownload(14)}
            <span class="titlebar__update-label">Установка…</span>
          </button>
        </UiV2Tooltip>
      {:else if updateState === 'ready'}
        <UiV2Tooltip text={installTooltip()}>
          <button
            type="button"
            class="titlebar__menu-item titlebar__menu-item--update titlebar__menu-item--update-downloading titlebar__menu-item--update-ready"
            aria-label={installLabel()}
            onclick={handleStartUpdate}
          >
            <span class="titlebar__update-fill" style="width:100%"></span>
            {@html iconDownload(14)}
            <span class="titlebar__update-label">{installLabel()}</span>
          </button>
        </UiV2Tooltip>
      {:else}
        <UiV2Tooltip
          text={updateState === 'error'
            ? 'Ошибка загрузки. Нажмите для повтора'
            : `Доступна версия ${updateInfo.version}. Нажмите для загрузки.`}
        >
          <button
            type="button"
            class="titlebar__menu-item titlebar__menu-item--update"
            id="titlebar-update"
            aria-label="Доступно обновление"
            onclick={handleStartUpdate}
          >
            <span class="titlebar__update-icon">{@html iconDownload(18)}</span>
            <span class="titlebar__update-dot" aria-hidden="true"></span>
          </button>
        </UiV2Tooltip>
      {/if}
    {/if}

    <UiV2Tooltip text="Совместный просмотр">
      <button
        type="button"
        class="titlebar__menu-item"
        id="titlebar-lobby"
        aria-label="Совместный просмотр"
        onclick={onLobby}
      >
        {@html iconUsers(18)}
      </button>
    </UiV2Tooltip>

    <UiV2Tooltip text="Расписание">
      <button
        type="button"
        class="titlebar__menu-item"
        class:titlebar__menu-item--active={scheduleOpen}
        id="titlebar-schedule"
        aria-label="Расписание"
        aria-expanded={scheduleOpen}
        onclick={onSchedule}
      >
        {@html iconCalendar(18)}
      </button>
    </UiV2Tooltip>

    <UiV2Tooltip text="Уведомления">
      <button
        type="button"
        class="titlebar__menu-item"
        class:titlebar__menu-item--has-badge={hasUnreadNotifications}
        id="titlebar-notifications"
        aria-label={hasUnreadNotifications ? 'Уведомления (есть новые)' : 'Уведомления'}
        onclick={onNotifications}
      >
        {@html iconBell(18)}
        {#if hasUnreadNotifications}
          <span class="titlebar__notif-dot" aria-hidden="true"></span>
        {/if}
      </button>
    </UiV2Tooltip>

    <div
      class="titlebar__account"
      class:titlebar__account--open={accountsOpen}
      bind:this={accountChipEl}
    >
      <UiV2Tooltip text="Профиль">
        <button
          type="button"
          class="titlebar__account-avatar"
          id="titlebar-profile"
          aria-label="Профиль"
          onclick={onProfile}
        >
          <span
            class="titlebar__avatar {avatarUrl ? 'titlebar__avatar--image' : 'titlebar__avatar--placeholder'}"
            style={avatarUrl ? `background-image:url(${avatarUrl})` : ''}
          >
            {#if !avatarUrl}{@html iconUser(16)}{/if}
          </span>
        </button>
      </UiV2Tooltip>
      <UiV2Tooltip text="Аккаунты">
        <button
          type="button"
          class="titlebar__account-chevron"
          id="titlebar-accounts"
          aria-label="Выбор аккаунта"
          aria-expanded={accountsOpen}
          aria-haspopup="menu"
          onclick={toggleAccountsMenu}
          onpointerdown={(e) => e.stopPropagation()}
        >
          <span class="titlebar__account-chevron-icon" aria-hidden="true">
            {@html iconChevronDown(12)}
          </span>
        </button>
      </UiV2Tooltip>
    </div>

    <UiV2Tooltip text="Настройки">
      <button
        type="button"
        class="titlebar__menu-item"
        id="titlebar-settings"
        aria-label="Настройки"
        onclick={onSettings}
      >
        {@html iconSettings(18)}
      </button>
    </UiV2Tooltip>

    <UiV2Tooltip text="Поиск">
      <button
        type="button"
        class="titlebar__menu-item"
        class:titlebar__menu-item--active={searchTabActive}
        aria-label="Поиск"
        aria-current={searchTabActive ? 'page' : undefined}
        onclick={onSearchTab}
      >
        {@html iconSearch(18)}
      </button>
    </UiV2Tooltip>
  </div>

  {#if hasWindowApi}
    <div class="titlebar__controls">
      <UiV2Tooltip text="Свернуть">
        <button
          type="button"
          class="titlebar__btn titlebar__btn--min"
          aria-label="Свернуть"
          onclick={handleMinimize}
        ></button>
      </UiV2Tooltip>
      <UiV2Tooltip text="Развернуть">
        <button
          type="button"
          class="titlebar__btn titlebar__btn--max"
          aria-label="Развернуть"
          onclick={handleMaximize}
        ></button>
      </UiV2Tooltip>
      <UiV2Tooltip text="Закрыть">
        <button
          type="button"
          class="titlebar__btn titlebar__btn--close"
          aria-label="Закрыть"
          onclick={handleClose}
        ></button>
      </UiV2Tooltip>
    </div>
  {/if}
</div>

{#if accountsOpen}
  <UiV2PopupMenu
    open={accountsOpen}
    x={accountsX}
    y={accountsY}
    anchor={accountsAnchor}
    items={accountMenuItems}
    title="Аккаунты"
    placement="anchor"
    onClose={closeAccountsMenu}
    onSelect={onAccountMenuSelect}
    onTrailingClick={onAccountTrailingClick}
  />
{/if}
