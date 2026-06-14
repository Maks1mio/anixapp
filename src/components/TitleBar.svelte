<script lang="ts">
  import { onMount } from 'svelte';
  import { iconArrowLeft, iconArrowRight, iconSearch, iconUsers, iconBell, iconUser, iconSettings, iconDownload } from './icons';
  import { checkForUpdate, type UpdateInfo } from '../services/update-checker';
  import type { AppUpdateProgress } from '../types/electron';

  const hasWindowApi = typeof (window as any).electron?.window !== 'undefined';

  interface Props {
    searchInput?: HTMLInputElement | null;
    searchWrap?: HTMLElement | null;
    onLobby?: () => void;
    onNotifications?: () => void;
    onSettings?: () => void;
    onProfile?: () => void;
  }

  let {
    searchInput = $bindable(null),
    searchWrap = $bindable(null),
    onLobby,
    onNotifications,
    onSettings,
    onProfile,
  }: Props = $props();

  let updateInfo: UpdateInfo | null = $state(null);
  let updateDownloading = $state(false);
  let updatePct = $state(0);
  let updateState: 'idle' | 'downloading' | 'ready' | 'error' | 'installing' | 'install-error' = $state('idle');
  let installType: string | null = $state(null);
  let avatarUrl: string | null = $state(null);
  let avatarInitials: string = $state('');

  function syncAvatarFromGlobalProfile() {
    const profile = (window as any).__anixProfile;
    avatarUrl = profile?.avatar ?? null;
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

    return () => {
      window.removeEventListener('app-update-progress', onProgress);
      window.removeEventListener('anix:profileUpdated', syncAvatarFromGlobalProfile as EventListener);
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

<div class="titlebar">
  <div class="titlebar__drag">
    <span class="titlebar__logo" aria-hidden="true">
      <img src="logo/512x512.png" alt="" class="titlebar__logo-img" />
    </span>
    <span class="titlebar__title">AnixApp</span>
  </div>

  <div class="titlebar__nav" id="titlebar-nav">
    <button
      type="button"
      class="titlebar__nav-btn tooltip-trigger"
      id="titlebar-back"
      aria-label="Назад"
      onclick={handleBack}
    >
      {@html iconArrowLeft(16)}
      <span class="tooltip tooltip--animated">Назад</span>
    </button>
    <button
      type="button"
      class="titlebar__nav-btn tooltip-trigger"
      id="titlebar-forward"
      aria-label="Вперёд"
      onclick={handleForward}
    >
      {@html iconArrowRight(16)}
      <span class="tooltip tooltip--animated">Вперёд</span>
    </button>
  </div>

  <div class="titlebar__search" id="titlebar-search-wrap" bind:this={searchWrap}>
    <span class="titlebar__search-icon">{@html iconSearch(14)}</span>
    <input
      type="text"
      class="titlebar__search-input"
      id="titlebar-search-input"
      placeholder="Поиск аниме, пользователей, коллекций…"
      autocomplete="off"
      spellcheck={false}
      aria-label="Поиск"
      bind:this={searchInput}
    />
    <kbd class="titlebar__search-kbd">Ctrl+K</kbd>
  </div>

  <div class="titlebar__menu" id="titlebar-menu">
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
        <!-- Waiting for password input / install in progress -->
        <button
          type="button"
          class="titlebar__menu-item titlebar__menu-item--update titlebar__menu-item--update-downloading tooltip-trigger"
          aria-label="Установка обновления…"
        >
          <span class="titlebar__update-fill titlebar__update-fill--pulse" style="width:100%"></span>
          {@html iconDownload(14)}
          <span class="titlebar__update-label">Установка…</span>
          <span class="tooltip tooltip--animated">Введите пароль в диалоге авторизации</span>
        </button>
      {:else if updateState === 'ready'}
        <!-- Downloaded: click to install -->
        <button
          type="button"
          class="titlebar__menu-item titlebar__menu-item--update titlebar__menu-item--update-downloading titlebar__menu-item--update-ready tooltip-trigger"
          aria-label={installLabel()}
          onclick={handleStartUpdate}
        >
          <span class="titlebar__update-fill" style="width:100%"></span>
          {@html iconDownload(14)}
          <span class="titlebar__update-label">{installLabel()}</span>
          <span class="tooltip tooltip--animated">{installTooltip()}</span>
        </button>
      {:else}
        <!-- Idle / error: click to start download -->
        <button
          type="button"
          class="titlebar__menu-item titlebar__menu-item--update tooltip-trigger"
          id="titlebar-update"
          aria-label="Доступно обновление"
          onclick={handleStartUpdate}
        >
          <span class="titlebar__update-icon">{@html iconDownload(18)}</span>
          <span class="titlebar__update-dot" aria-hidden="true"></span>
          <span class="tooltip tooltip--animated">
            {updateState === 'error'
              ? 'Ошибка загрузки. Нажмите для повтора'
              : `Доступна версия ${updateInfo.version}. Нажмите для загрузки.`}
          </span>
        </button>
      {/if}
    {/if}

    <!-- Lobby -->
    <button
      type="button"
      class="titlebar__menu-item tooltip-trigger"
      id="titlebar-lobby"
      aria-label="Совместный просмотр"
      onclick={onLobby}
    >
      {@html iconUsers(18)}
      <span class="tooltip tooltip--animated">Совместный просмотр</span>
    </button>

    <!-- Notifications -->
    <button
      type="button"
      class="titlebar__menu-item tooltip-trigger"
      id="titlebar-notifications"
      aria-label="Уведомления"
      onclick={onNotifications}
    >
      {@html iconBell(18)}
      <span class="tooltip tooltip--animated">Уведомления</span>
    </button>

    <!-- Profile -->
    <button
      type="button"
      class="titlebar__menu-item titlebar__menu-item--avatar tooltip-trigger"
      id="titlebar-profile"
      aria-label="Профиль"
      onclick={onProfile}
    >
      <span
        class="titlebar__avatar {avatarUrl ? 'titlebar__avatar--image' : 'titlebar__avatar--placeholder'}"
        style={avatarUrl ? `background-image:url(${avatarUrl})` : ''}
      >
        {#if !avatarUrl}{@html iconUser(18)}{/if}
      </span>
      <span class="tooltip tooltip--animated">Профиль</span>
    </button>

    <!-- Settings -->
    <button
      type="button"
      class="titlebar__menu-item tooltip-trigger"
      id="titlebar-settings"
      aria-label="Настройки"
      onclick={onSettings}
    >
      {@html iconSettings(18)}
      <span class="tooltip tooltip--animated">Настройки</span>
    </button>
  </div>

  {#if hasWindowApi}
    <div class="titlebar__controls">
      <button
        type="button"
        class="titlebar__btn titlebar__btn--min tooltip-trigger"
        aria-label="Свернуть"
        onclick={handleMinimize}
      >
        <span class="tooltip tooltip--animated">Свернуть</span>
      </button>
      <button
        type="button"
        class="titlebar__btn titlebar__btn--max tooltip-trigger"
        aria-label="Развернуть"
        onclick={handleMaximize}
      >
        <span class="tooltip tooltip--animated">Развернуть</span>
      </button>
      <button
        type="button"
        class="titlebar__btn titlebar__btn--close tooltip-trigger"
        aria-label="Закрыть"
        onclick={handleClose}
      >
        <span class="tooltip tooltip--animated">Закрыть</span>
      </button>
    </div>
  {/if}
</div>
