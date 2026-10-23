<script lang="ts">
  /**
   * Каркас мобильного режима (html.mobile-mode): верхняя панель с поиском, нижний таб-бар из пяти разделов,
   * полноэкранные «Профиль» и «Настройки». Содержимое — те же вью, что и в desktop, но под мобильными токенами.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { Snippet } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { notificationsModalOpen, settingsModalOpen, watchModalOpen, openSettingsModal, closeSettingsModal } from '../stores/modals';
  import { notificationUnreadCount, refreshNotificationUnreadCount } from '../stores/notifications';
  import { loadDeviceNotificationSettings, resetDeviceNotificationBaseline, startDeviceNotificationPolling } from '../stores/device-notifications';
  import { supportModalOpen } from '../stores/support-promo';
  import { bindNotificationTaps, requestNativeNotifyPermission } from '../native/anix-notify';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { ensureProfileId, loadSelfProfileGlobal } from '../utils/profile';
  import { iconDownload, iconPlus, iconHome, iconCompass, iconBookmark, iconPanelTop, iconCircleUser, iconSearch, iconSettings, iconBell } from '../components/icons';
  import MobileSettings from './MobileSettings.svelte';
  import { bindNativeBackButton, minimizeNativeApp } from '../platform/mobile-back';
  import SidebarProfilePanel from '../components/SidebarProfilePanel.svelte';
  import {
    profilePanelOpen,
    profilePanelCanBack,
    profilePanelInnerView,
    profilePanelBack,
    resetProfilePanelHistory,
    setProfilePanelInnerView,
  } from '../stores/profile-panel';
  import { isOnline, hasActiveDownloads, watchDownloads, initConnectivity } from '../stores/mobile-downloads';

  interface Props {
    children?: Snippet;
    currentPath?: string;
  }
  let { children, currentPath = '/' }: Props = $props();

  type Tab = 'home' | 'overview' | 'bookmarks' | 'feed' | 'profile';
  const TABS: { id: Tab; label: string; href: string | null; icon: (s: number) => string }[] = [
    { id: 'home', label: 'Главная', href: '/', icon: iconHome },
    { id: 'overview', label: 'Обзор', href: '/overview', icon: iconCompass },
    { id: 'bookmarks', label: 'Закладки', href: '/bookmarks', icon: iconBookmark },
    { id: 'feed', label: 'Лента', href: '/feed', icon: iconPanelTop },
    { id: 'profile', label: 'Профиль', href: null, icon: iconCircleUser },
  ];

  let profileOpen = $state(false);
  let profileUserId = $state<number | null>(null);

  const path = $derived((currentPath.split('?')[0] || '/').replace(/\/+$/, '') || '/');

  /** Страница релиза: «назад» плавает поверх размытой обложки, а не занимает отдельную полосу. */
  const floatBack = $derived(/^\/release\/\d+$/.test(path));

  const rootTab = $derived.by((): Tab | null => {
    if (path === '/' || path === '/catalog') return 'home';
    if (path === '/overview' || path === '/schedule' || path === '/overview/popular') return 'overview';
    if (path === '/bookmarks') return 'bookmarks';
    if (path === '/feed') return 'feed';
    return null;
  });
  /** Корневые экраны разделов получают верхнюю панель с поиском; остальные — панель с «назад». */
  const isRoot = $derived(rootTab !== null && path !== '/overview/popular' && path !== '/schedule');
  const activeTab = $derived<Tab | null>(profileOpen ? 'profile' : rootTab);
  const searchHint = $derived(
    rootTab === 'feed' ? 'Поиск записей и блогов' : 'Поиск аниме',
  );

  function goTab(tab: (typeof TABS)[number]) {
    if (tab.id === 'profile') {
      void openProfile();
      return;
    }
    closeProfile();
    if (tab.href) navigate(tab.href);
  }

  async function openProfile() {
    if (!(await requireAuth())) return;
    const id = await ensureProfileId();
    if (id == null) return;
    profileUserId = id;
    resetProfilePanelHistory();
    profilePanelOpen.set(true);
    profileOpen = true;
  }

  function closeProfile() {
    if (!profileOpen) return;
    profileOpen = false;
    profilePanelOpen.set(false);
  }

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else navigate('/');
  }

  /** Профиль — вкладка со своей историей: внутренний экран → предыдущий профиль → закрыть. */
  function backInProfile() {
    if (get(profilePanelInnerView) !== 'overview') setProfilePanelInnerView('overview');
    else if (get(profilePanelCanBack)) profilePanelBack();
    else closeProfile();
  }

  /** «Назад» системы, когда ни один экран не перехватил: сначала закрываем слои, потом история, потом сворачиваем. */
  function onNativeBack() {
    if (get(watchModalOpen)) watchModalOpen.set(false);
    else if (get(notificationsModalOpen)) notificationsModalOpen.set(false);
    else if (profileOpen) backInProfile();
    else if (path !== '/') goBack();
    else void minimizeNativeApp();
  }

  /** Счётчик на колокольчике — полное число, как в Anixart. */
  const unreadLabel = $derived($notificationUnreadCount > 999 ? '999+' : String($notificationUnreadCount));

  /** Уведомления: счётчик (раз в минуту и при возврате в приложение) и системные уведомления о новых. */
  function startNotifications(): () => void {
    void loadDeviceNotificationSettings();
    let permissionAsked = false;
    const unsubAuth = isAuthenticated.subscribe((ok) => {
      if (!ok) {
        notificationUnreadCount.set(0);
        resetDeviceNotificationBaseline();
        return;
      }
      void refreshNotificationUnreadCount();
      void loadSelfProfileGlobal();
      if (!permissionAsked) {
        permissionAsked = true;
        void requestNativeNotifyPermission();
      }
    });
    const poll = window.setInterval(() => void refreshNotificationUnreadCount(), 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshNotificationUnreadCount(); };
    document.addEventListener('visibilitychange', onVisible);
    const stopDevice = startDeviceNotificationPolling(45_000);
    // нажатие на системное уведомление: адресат — как desktop-ссылка anix:deepLink, без адресата — список
    const stopTaps = bindNotificationTaps((link) => {
      if (link) window.dispatchEvent(new CustomEvent('anix:deepLink', { detail: link }));
      else notificationsModalOpen.set(true);
    });
    // открыли список — после него счётчик обновится с сервера
    const unsubModal = notificationsModalOpen.subscribe((open) => { if (!open) void refreshNotificationUnreadCount(); });
    return () => {
      unsubAuth();
      unsubModal();
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      stopDevice();
      stopTaps();
    };
  }

  onMount(() => {
    initConnectivity();
    const stopNotifications = startNotifications();
    // Anix+ на телефоне — раздел настроек, а не desktop-модалка (промо «Подробнее», значки и т.п.)
    const unsubSupport = supportModalOpen.subscribe((open) => {
      if (!open) return;
      supportModalOpen.set(false);
      openSettingsModal('support');
    });
    let unbindBack = () => {};
    void bindNativeBackButton(onNativeBack).then((fn) => { unbindBack = fn; });
    const stopDl = watchDownloads();
    // Запуск без сети: сразу на «Загрузки», чтобы можно было смотреть скачанное.
    const offlineStart = window.setTimeout(() => {
      if (!get(isOnline) && (path === '/' || path === '')) navigate('/downloads');
    }, 900);
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ userId?: number }>).detail?.userId;
      if (typeof id === 'number') {
        profileUserId = id;
        profileOpen = true;
      }
    };
    const onClose = () => { profileOpen = false; };
    window.addEventListener('anix:profilePanelOpen', onOpen);
    window.addEventListener('anix:profilePanelClose', onClose);
    return () => {
      stopNotifications();
      unsubSupport();
      unbindBack();
      stopDl();
      window.clearTimeout(offlineStart);
      window.removeEventListener('anix:profilePanelOpen', onOpen);
      window.removeEventListener('anix:profilePanelClose', onClose);
    };
  });
</script>

<div class="m-app">
  {#if isRoot}
    <header class="m-topbar">
      {#if rootTab === 'bookmarks'}
        <!-- как в Anixart: в панели поиск по текущей вкладке — его поле рисуют сами «Закладки» (mobile-overrides) -->
        <div class="m-search-slot"></div>
      {:else}
        <button type="button" class="m-search" onclick={() => navigate('/search')} aria-label="Поиск">
          {@html iconSearch(24)}
          <span>{searchHint}</span>
        </button>
      {/if}
      {#if $hasActiveDownloads}
        <!-- как в Anixart, в панели только настройки и уведомления; «Загрузки» появляются, пока что-то качается -->
        <button type="button" class="m-icon-btn" onclick={() => navigate('/downloads')} aria-label="Загрузки">
          {@html iconDownload(24)}
          <i class="m-dot"></i>
        </button>
      {/if}
      <button type="button" class="m-icon-btn" onclick={() => settingsModalOpen.set(true)} aria-label="Настройки">
        {@html iconSettings(24)}
      </button>
      <button type="button" class="m-icon-btn" onclick={() => notificationsModalOpen.set(true)} aria-label="Уведомления">
        {@html iconBell(24)}
        {#if $notificationUnreadCount > 0}<span class="m-badge-count">{unreadLabel}</span>{/if}
      </button>
    </header>
  {:else}
    <header class="m-topbar m-topbar--inner" class:m-topbar--float={floatBack}>
      <button type="button" class="m-icon-btn" onclick={goBack} aria-label="Назад">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
      </button>
      {#if floatBack}
        <button type="button" class="m-icon-btn m-icon-btn--end" onclick={() => navigate('/collections/create')} aria-label="Добавить в коллекцию">
          {@html iconPlus(24)}
        </button>
      {/if}
    </header>
  {/if}

  {#if !$isOnline && path !== '/downloads'}
    <div class="m-offline" role="status">
      <span>Нет подключения к сети</span>
      <button type="button" onclick={() => navigate('/downloads')}>Загрузки</button>
    </div>
  {/if}

  <main class="m-app__content">
    {@render children?.()}
  </main>

  <nav class="m-navbar" aria-label="Разделы">
    {#each TABS as tab (tab.id)}
      <button
        type="button"
        class="m-nav-item"
        class:m-nav-item--active={activeTab === tab.id}
        onclick={() => goTab(tab)}
      >
        <span class="m-nav-item__pill">{@html tab.icon(24)}</span>
        <span>{tab.label}</span>
      </button>
    {/each}
  </nav>

  {#if profileOpen && profileUserId != null}
    <div class="m-fullscreen m-fullscreen--profile">
      <header class="m-topbar">
        <button type="button" class="m-search" onclick={() => { closeProfile(); navigate('/search'); }} aria-label="Поиск">
          {@html iconSearch(24)}
          <span>Поиск пользователей</span>
        </button>
        <button type="button" class="m-icon-btn" onclick={() => settingsModalOpen.set(true)} aria-label="Настройки">
          {@html iconSettings(24)}
        </button>
        <button type="button" class="m-icon-btn" onclick={() => notificationsModalOpen.set(true)} aria-label="Уведомления">
          {@html iconBell(24)}
        {#if $notificationUnreadCount > 0}<span class="m-badge-count">{unreadLabel}</span>{/if}
        </button>
      </header>
      <SidebarProfilePanel userId={profileUserId} onClose={closeProfile} />
    </div>
  {/if}

  {#if $settingsModalOpen}
    <div class="m-fullscreen m-fullscreen--page">
      <MobileSettings onClose={closeSettingsModal} />
    </div>
  {/if}
</div>

<style lang="scss">
  .m-app {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background: var(--m-bg);
    color: var(--m-text);
    padding-top: env(safe-area-inset-top);
  }

  .m-app__content {
    flex: 1;
    min-width: 0;
    padding-bottom: calc(var(--m-nav-h) + env(safe-area-inset-bottom));
  }

  .m-topbar--inner {
    min-height: 48px;
    padding-bottom: 0;
  }

  .m-topbar--float {
    position: absolute;
    z-index: 15;
    top: calc(env(safe-area-inset-top) + 8px);
    left: var(--m-space-4);
    right: var(--m-space-4);
    min-height: 0;
    padding: 0;
    justify-content: space-between;

    .m-icon-btn { width: 48px; height: 48px; border-radius: 16px; background: color-mix(in srgb, var(--m-bg) 72%, transparent); color: var(--m-text); backdrop-filter: blur(6px); }
  }

  .m-app { position: relative; }

  .m-offline {
    display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-3);
    margin: 0 var(--m-gutter) var(--m-space-2); padding: 6px var(--m-space-4); border-radius: 14px;
    background: var(--m-warn-bg); color: var(--m-warn-fg); font-size: 13px;
    button { border: 0; background: none; color: var(--m-text); font: 600 13px var(--m-font); padding: 6px 4px; }
  }

  .m-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--m-bg);
    overflow-y: auto;
    padding-top: env(safe-area-inset-top);
    padding-bottom: calc(var(--m-nav-h) + env(safe-area-inset-bottom));
  }

  /* Отдельный экран поверх таб-бара: свой скролл внутри, без нижнего отступа под навбар */
  .m-fullscreen--page {
    z-index: 40;
    overflow: hidden;
    padding-bottom: 0;
  }

  .m-fullscreen--profile {
    z-index: 20; /* ниже таб-бара (30): профиль — вкладка, а не модалка */

    /* вкладку закрывает таб-бар и системное «назад» — desktop-крестик не нужен */
    :global(.profile-panel__close) { display: none !important; }
  }

  .m-badge-count {
    position: absolute;
    top: 3px;
    right: 1px;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: #e5484d;
    color: #fff;
    font: 600 12px/20px var(--m-font);
    text-align: center;
    pointer-events: none;
  }

  .m-search-slot { flex: 1; min-width: 0; height: 48px; margin-right: var(--m-space-2); }
</style>
