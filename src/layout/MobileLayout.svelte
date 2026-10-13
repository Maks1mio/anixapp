<script lang="ts">
  /**
   * Каркас мобильного режима (html.mobile-mode): верхняя панель с поиском, нижний таб-бар из пяти разделов,
   * полноэкранные «Профиль» и «Настройки». Содержимое — те же вью, что и в desktop, но под мобильными токенами.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { Snippet } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { notificationsModalOpen, settingsModalOpen } from '../stores/modals';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { ensureProfileId } from '../utils/profile';
  import { iconDownload, iconPlus, iconHome, iconCompass, iconBookmark, iconNewspaper, iconUser, iconSearch, iconSettings, iconBell } from '../components/icons';
  import SettingsModal from '../components/SettingsModal.svelte';
  import SidebarProfilePanel from '../components/SidebarProfilePanel.svelte';
  import { profilePanelOpen, resetProfilePanelHistory } from '../stores/profile-panel';
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
    { id: 'feed', label: 'Лента', href: '/feed', icon: iconNewspaper },
    { id: 'profile', label: 'Профиль', href: null, icon: iconUser },
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
    rootTab === 'feed' ? 'Поиск записей и блогов' : rootTab === 'bookmarks' ? 'Поиск в закладках' : 'Поиск аниме',
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

  onMount(() => {
    initConnectivity();
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
      <button type="button" class="m-search" onclick={() => navigate('/search')} aria-label="Поиск">
        {@html iconSearch(24)}
        <span>{searchHint}</span>
      </button>
      <button type="button" class="m-icon-btn" onclick={() => navigate('/downloads')} aria-label="Загрузки">
        {@html iconDownload(24)}
        {#if $hasActiveDownloads}<i class="m-dot"></i>{/if}
      </button>
      <button type="button" class="m-icon-btn" onclick={() => settingsModalOpen.set(true)} aria-label="Настройки">
        {@html iconSettings(24)}
      </button>
      <button type="button" class="m-icon-btn" onclick={() => notificationsModalOpen.set(true)} aria-label="Уведомления">
        {@html iconBell(24)}
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
      <SidebarProfilePanel userId={profileUserId} onClose={closeProfile} />
    </div>
  {/if}

  {#if $settingsModalOpen}
    <div class="m-fullscreen">
      <SettingsModal onClose={() => settingsModalOpen.set(false)} standalone flushTop />
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

    .m-icon-btn { width: 48px; height: 48px; border-radius: 16px; background: rgba(28, 28, 28, 0.72); color: var(--m-text); backdrop-filter: blur(6px); }
  }

  .m-app { position: relative; }

  .m-offline {
    display: flex; align-items: center; justify-content: space-between; gap: var(--m-space-3);
    margin: 0 var(--m-gutter) var(--m-space-2); padding: 6px var(--m-space-4); border-radius: 14px;
    background: #3a3818; color: #c8c35f; font-size: 13px;
    button { border: 0; background: none; color: #e6e1a0; font: 600 13px var(--m-font); padding: 6px 4px; }
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

  .m-fullscreen--profile {
    z-index: 20; /* ниже таб-бара (30): профиль — вкладка, а не модалка */
  }
</style>
