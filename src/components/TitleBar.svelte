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
  let updateState: 'idle' | 'downloading' | 'ready' | 'error' = $state('idle');
  let avatarUrl: string | null = $state(null);
  let avatarInitials: string = $state('');

  onMount(() => {
    // Check for app updates
    checkForUpdate().then((info) => {
      if (info) updateInfo = info;
    }).catch(() => {});

    // App update progress listener
    const onProgress = (ev: Event) => {
      const data = (ev as CustomEvent<AppUpdateProgress>).detail;
      if (data.state === 'downloading') {
        updatePct = data.total > 0 ? Math.round((data.received / data.total) * 100) : data.percent || 0;
        updateState = 'downloading';
      } else if (data.state === 'ready') {
        updateState = 'ready';
        updatePct = 100;
        setTimeout(() => { (window.electron as any)?.installUpdate?.(); }, 1200);
      } else if (data.state === 'error') {
        updateState = 'error';
        updateDownloading = false;
      }
    };
    window.addEventListener('app-update-progress', onProgress);

    return () => window.removeEventListener('app-update-progress', onProgress);
  });

  function handleStartUpdate() {
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

  // Allow parent to update avatar via __anixProfile
  $effect(() => {
    const profile = (window as any).__anixProfile;
    if (profile?.avatar) {
      avatarUrl = profile.avatar;
    }
  });
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
      {#if updateDownloading && updateState !== 'idle'}
        <button
          type="button"
          class="titlebar__menu-item titlebar__menu-item--update titlebar__menu-item--update-downloading"
          aria-label="Загрузка обновления"
        >
          <span class="titlebar__update-fill" style="width:{updatePct}%"></span>
          {@html iconDownload(14)}
          <span class="titlebar__update-label">
            {updateState === 'ready' ? 'Устанавливаем…' : `${updatePct}%`}
          </span>
        </button>
      {:else}
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
            {updateState === 'error' ? 'Ошибка загрузки. Нажмите для повтора' : `Доступна версия ${updateInfo.version}. Нажмите для загрузки.`}
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
