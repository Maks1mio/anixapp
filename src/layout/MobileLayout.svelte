<script lang="ts">
  /**
   * Каркас мобильного режима (html.mobile-mode): верхняя панель с поиском, разделы как на ПК
   * (телефон — нижний таб-бар и шторка «Ещё», планшет — левая панель), полноэкранные «Профиль» и «Настройки».
   * Содержимое — те же вью, что и в desktop, но под мобильными токенами.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { Snippet } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { isScrollRestorePending } from '../stores/view-state';
  import { notificationsModalOpen, settingsModalOpen, watchModalOpen, openSettingsModal, closeSettingsModal } from '../stores/modals';
  import { notificationUnreadCount, refreshNotificationUnreadCount } from '../stores/notifications';
  import { loadDeviceNotificationSettings, resetDeviceNotificationBaseline, startDeviceNotificationPolling } from '../stores/device-notifications';
  import { supportModalOpen } from '../stores/support-promo';
  import { bindNotificationTaps, requestNativeNotifyPermission } from '../native/anix-notify';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { ensureProfileId, loadSelfProfileGlobal } from '../utils/profile';
  import { iconDownload, iconPlus, iconCircleUser, iconMoreHorizontal, iconSearch, iconSettings, iconBell } from '../components/icons';
  import { SIDEBAR_NAV_ITEMS, type SidebarNavId } from '../constants/sidebar-nav';
  import MobileSettings from './MobileSettings.svelte';
  import MobileSearch from './MobileSearch.svelte';
  import type { SearchTab } from '../search-controller';
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
    /** Состояние страницы результатов — показывается в поле поиска и фильтрах. */
    search?: { q: string; tab: SearchTab; by: number; hiddenOnly: boolean };
  }
  let { children, currentPath = '/', search }: Props = $props();

  type Tab = SidebarNavId | 'profile';
  type NavEntry = { id: Tab; label: string; short: string; href: string | null; icon: string };

  /** Короткие подписи для узкой левой панели и нижнего таб-бара. */
  const SHORT_LABELS: Partial<Record<SidebarNavId, string>> = { agent: 'ИИ' };
  /** Разделы — те же, что в сайдбаре ПК. */
  const SECTIONS: NavEntry[] = SIDEBAR_NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.id === 'agent' ? 'ИИ-помощницы' : item.label,
    short: SHORT_LABELS[item.id] ?? item.label,
    href: item.href,
    icon: item.icon,
  }));
  const PROFILE: NavEntry = { id: 'profile', label: 'Профиль', short: 'Профиль', href: null, icon: iconCircleUser(24) };

  /** Телефон: в таб-баре только частые разделы, остальное — в шторке «Ещё». */
  const PHONE_BAR_IDS: Tab[] = ['home', 'overview', 'bookmarks', 'profile'];
  const ALL_ENTRIES = [...SECTIONS, PROFILE];
  const PHONE_BAR = PHONE_BAR_IDS.map((id) => ALL_ENTRIES.find((e) => e.id === id)!);
  const PHONE_MORE = SECTIONS.filter((e) => !PHONE_BAR_IDS.includes(e.id));

  /** Свой аватар на кнопке профиля; без него (гость, нет фото, не загрузился) — обычная иконка. */
  let avatarUrl = $state<string | null>(null);
  function syncAvatar() {
    avatarUrl = (window as unknown as { __anixProfile?: { avatar?: string | null } }).__anixProfile?.avatar ?? null;
  }

  /** Верхняя панель и вкладки: при прокрутке вниз уходят, при прокрутке вверх возвращаются. */
  const BARS_ALWAYS_SHOWN_PX = 120;
  const BARS_TOGGLE_DELTA_PX = 10;
  let barsHidden = $state(false);
  let scrollAnchor = 0;

  function onContentScroll(e: Event) {
    const y = (e.currentTarget as HTMLElement).scrollTop;
    // Восстановление позиции при возврате на страницу — не жест пользователя
    if (isScrollRestorePending() || y < BARS_ALWAYS_SHOWN_PX) {
      if (y < BARS_ALWAYS_SHOWN_PX) barsHidden = false;
      scrollAnchor = y;
      return;
    }
    const delta = y - scrollAnchor;
    if (Math.abs(delta) < BARS_TOGGLE_DELTA_PX) return;
    barsHidden = delta > 0;
    scrollAnchor = y;
  }

  let moreOpen = $state(false);
  let profileOpen = $state(false);
  let profileUserId = $state<number | null>(null);

  const path = $derived((currentPath.split('?')[0] || '/').replace(/\/+$/, '') || '/');

  /** Страница релиза: «назад» плавает поверх размытой обложки, а не занимает отдельную полосу. */
  const floatBack = $derived(/^\/release\/\d+$/.test(path));

  const rootTab = $derived.by((): Tab | null => {
    if (path === '/' || path === '/catalog') return 'home';
    if (path === '/overview/popular' || path.startsWith('/overview/popular/')) return 'popular';
    if (path === '/overview' || path === '/schedule') return 'overview';
    if (path === '/bookmarks' || path.startsWith('/bookmarks/')) return 'bookmarks';
    if (path === '/feed') return 'feed';
    if (path === '/agent' || path.startsWith('/agent/')) return 'agent';
    if (path === '/fluo' || path.startsWith('/fluo/')) return 'fluo';
    if (path === '/collections' || path.startsWith('/collections/')) return 'collections';
    if (path === '/downloads') return 'downloads';
    return null;
  });
  /** Корневые экраны разделов получают верхнюю панель с поиском; остальные — панель с «назад». */
  const isRoot = $derived(['/', '/catalog', '/overview', '/bookmarks', '/feed'].includes(path));
  /** В «Закладках» слот поиска занимает их собственное поле (mobile-overrides). */
  const hasOwnSearch = $derived(path === '/bookmarks');
  const activeTab = $derived<Tab | null>(profileOpen ? 'profile' : rootTab);
  /** «Ещё» подсвечен, когда открытый раздел лежит в шторке. */
  const moreActive = $derived(moreOpen || PHONE_MORE.some((e) => e.id === activeTab));

  function goTab(tab: NavEntry) {
    moreOpen = false;
    if (tab.id === 'profile') {
      void openProfile();
      return;
    }
    closeProfile();
    if (tab.href) navigate(tab.href);
  }

  // На новой странице панели снова на месте
  $effect(() => {
    void path;
    barsHidden = false;
    scrollAnchor = 0;
  });

  function openSearch() {
    closeProfile();
    navigate('/search');
  }

  function openNotifications() {
    closeProfile();
    if (path !== '/notifications') navigate('/notifications');
  }

  // Любой запрос «открыть уведомления» (настройки, ссылки) ведёт на страницу, а не во всплывающую панель
  $effect(() => {
    if (!$notificationsModalOpen) return;
    notificationsModalOpen.set(false);
    openNotifications();
  });

  // Ушли со страницы уведомлений — счётчик обновится с сервера
  let wasInNotifications = false;
  $effect(() => {
    const inNotifications = path === '/notifications';
    if (wasInNotifications && !inNotifications) void refreshNotificationUnreadCount();
    wasInNotifications = inNotifications;
  });

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
    if (moreOpen) moreOpen = false;
    else if (get(watchModalOpen)) watchModalOpen.set(false);
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
      else openNotifications();
    });
    return () => {
      unsubAuth();
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
    syncAvatar();
    window.addEventListener('anix:profileUpdated', syncAvatar);
    return () => {
      window.removeEventListener('anix:profileUpdated', syncAvatar);
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

{#snippet navItem(tab: NavEntry)}
  <button
    type="button"
    class="m-nav-item"
    class:m-nav-item--active={activeTab === tab.id}
    data-tab={tab.id}
    aria-current={activeTab === tab.id ? 'page' : undefined}
    onclick={() => goTab(tab)}
  >
    <span class="m-nav-item__pill">
      {#if tab.id === 'profile' && avatarUrl && $isAuthenticated}
        <img class="m-nav-avatar" src={avatarUrl} alt="" onerror={() => { avatarUrl = null; }} />
      {:else}
        {@html tab.icon}
      {/if}
    </span>
    <span class="m-nav-item__label">{tab.short}</span>
  </button>
{/snippet}

{#snippet searchEntry()}
  <button type="button" class="m-search" onclick={openSearch}>
    {@html iconSearch(24)}
    <span>Поиск</span>
  </button>
{/snippet}

<div class="m-app">
  <nav class="m-rail" aria-label="Разделы">
    <div class="m-rail__list">
      {#each SECTIONS as tab (tab.id)}
        {@render navItem(tab)}
      {/each}
    </div>
    <div class="m-rail__footer">
      {@render navItem(PROFILE)}
    </div>
  </nav>

  {#if floatBack}
    <header class="m-topbar m-topbar--inner m-topbar--float" class:m-topbar--float-hidden={barsHidden}>
      <button type="button" class="m-icon-btn" onclick={goBack} aria-label="Назад">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
      </button>
      <button type="button" class="m-icon-btn m-icon-btn--end" onclick={() => navigate('/collections/create')} aria-label="Добавить в коллекцию">
        {@html iconPlus(24)}
      </button>
    </header>
  {/if}

  <!-- .page__scroll / #content: здесь прокрутка всех страниц — на него завязаны подгрузка списков и восстановление позиции -->
  <div
    id="content"
    class="m-app__scroll page__scroll"
    class:m-app__scroll--bars-hidden={barsHidden}
    class:m-app__scroll--no-bar={floatBack}
    data-page-scroll
    onscroll={onContentScroll}
  >
  {#if isRoot}
    <header class="m-topbar">
      {#if hasOwnSearch}
        <!-- в «Закладках» сюда встаёт их поле поиска (mobile-overrides) -->
        <div class="m-search-slot"></div>
      {:else}
        {@render searchEntry()}
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
      <button type="button" class="m-icon-btn" onclick={openNotifications} aria-label="Уведомления">
        {@html iconBell(24)}
        {#if $notificationUnreadCount > 0}<span class="m-badge-count">{unreadLabel}</span>{/if}
      </button>
    </header>
  {:else if !floatBack}
    <header class="m-topbar m-topbar--inner">
      <button type="button" class="m-icon-btn" onclick={goBack} aria-label="Назад">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
      </button>
      {#if path === '/search'}
        <MobileSearch value={search?.q} tab={search?.tab} searchBy={search?.by} hiddenOnly={search?.hiddenOnly} />
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
  </div>

  <nav class="m-navbar" aria-label="Разделы">
    {#each PHONE_BAR as tab (tab.id)}
      {@render navItem(tab)}
    {/each}
    <button
      type="button"
      class="m-nav-item"
      class:m-nav-item--active={moreActive}
      aria-expanded={moreOpen}
      onclick={() => { moreOpen = !moreOpen; }}
    >
      <span class="m-nav-item__pill">{@html iconMoreHorizontal(24)}</span>
      <span class="m-nav-item__label">Ещё</span>
    </button>
  </nav>

  {#if moreOpen}
    <button type="button" class="m-overlay m-more-scrim" aria-label="Закрыть" onclick={() => { moreOpen = false; }}></button>
    <div class="m-sheet m-more" role="dialog" aria-label="Все разделы">
      <div class="m-sheet__handle"></div>
      <div class="m-more__grid">
        {#each PHONE_MORE as tab (tab.id)}
          <button
            type="button"
            class="m-more__item"
            class:m-more__item--active={activeTab === tab.id}
            onclick={() => goTab(tab)}
          >
            <span class="m-more__icon">{@html tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if profileOpen && profileUserId != null}
    <div class="m-fullscreen m-fullscreen--profile">
      <header class="m-topbar">
        {@render searchEntry()}
        <button type="button" class="m-icon-btn" onclick={() => settingsModalOpen.set(true)} aria-label="Настройки">
          {@html iconSettings(24)}
        </button>
        <button type="button" class="m-icon-btn" onclick={openNotifications} aria-label="Уведомления">
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
    height: 100dvh;
    overflow: hidden;
    background: var(--m-bg);
    color: var(--m-text);
    padding-top: env(safe-area-inset-top);
    padding-left: var(--m-rail-w);
  }

  .m-app__scroll {
    flex: 1;
    min-height: 0;
    overscroll-behavior: contain;
  }

  .m-app__content {
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
    left: calc(var(--m-rail-w) + var(--m-space-4));
    right: var(--m-space-4);
    min-height: 0;
    padding: 0;
    justify-content: space-between;
    transition: transform 0.2s ease;

    .m-icon-btn { width: 48px; height: 48px; border-radius: 16px; background: color-mix(in srgb, var(--m-bg) 72%, transparent); color: var(--m-text); backdrop-filter: blur(6px); }
  }

  .m-topbar--float-hidden { transform: translateY(calc(-100% - env(safe-area-inset-top) - 16px)); }

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
    left: var(--m-rail-w);
    z-index: 20; /* ниже таб-бара (30): профиль — вкладка, а не модалка */
    /* Высота фиксирована окном: панель профиля (и редактор внутри неё) скроллит свой .page__scroll, как на desktop.
       Иначе цепочка height:100% у слайдов не определена и прокрутка не работает. */
    display: flex;
    flex-direction: column;
    overflow: hidden;

    > :global(.m-topbar) { flex: none; }
    > :global(.profile-panel) { flex: 1 1 0; min-height: 0; }
    :global(.page__scroll) { overscroll-behavior: contain; }

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

  /* Телефон: нижний таб-бар. Планшет (≥600px, см. --m-rail-w): левая панель со всеми разделами. */
  .m-rail { display: none; }

  @media (min-width: 600px) {
    :global(html.mobile-mode) .m-navbar { display: none; }

    .m-rail {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 30;
      width: var(--m-rail-w);
      display: flex;
      flex-direction: column;
      padding: calc(env(safe-area-inset-top) + var(--m-space-3)) 0 calc(env(safe-area-inset-bottom) + var(--m-space-3));
      background: var(--m-surface-sheet);

      /* flex-basis: в таб-баре .m-nav-item растягивается на ширину, здесь — стопкой по высоте */
      :global(.m-nav-item) { flex: none; width: 100%; padding: 8px 0; font-size: 12px; }
      :global(.m-nav-item__pill) { width: 56px; }
      :global(.m-nav-item__label) { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }

    .m-rail__list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .m-rail__footer { flex: none; padding-top: var(--m-space-2); }
  }

  .m-nav-avatar {
    display: block;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }

  .m-more-scrim { border: 0; padding: 0; z-index: 40; }

  .m-more__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--m-space-2);
    padding-bottom: var(--m-space-2);
  }

  .m-more__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--m-space-2);
    min-width: 0;
    padding: var(--m-space-3) var(--m-space-1);
    border: 0;
    border-radius: 16px;
    background: none;
    color: var(--m-text);
    font: 500 13px/1.25 var(--m-font);
    text-align: center;
    &:active { background: var(--m-press); }
  }

  .m-more__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 18px;
    background: var(--m-surface-raised);
    :global(svg) { width: 24px; height: 24px; }
  }

  .m-more__item--active .m-more__icon {
    background: var(--m-secondary-container);
    color: var(--m-on-secondary-container);
  }

  .m-search-slot { flex: 1; min-width: 0; height: 48px; margin-right: var(--m-space-2); }
</style>
