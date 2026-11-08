<script lang="ts">
  /**
   * Каркас мобильного режима (html.mobile-mode): верхняя панель с поиском, разделы как на ПК
   * (телефон — нижняя панель-шторка, планшет — боковая панель), полноэкранные «Профиль» и «Настройки».
   * Содержимое — те же вью, что и в desktop, но под мобильными токенами.
   */
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { get } from 'svelte/store';
  import type { Snippet } from 'svelte';
  import { navigate, refreshCurrentPage } from '../stores/navigation';
  import MobileDock from './MobileDock.svelte';
  import MobileRail from './MobileRail.svelte';
  import MobilePullRefresh from './MobilePullRefresh.svelte';
  import UiV2MediaLightbox from '../components/uikit-v2/UiV2MediaLightbox.svelte';
  import { closeFeedMediaLightbox, feedMediaLightbox } from '../utils/feed-media-lightbox';
  import { randomReleaseId, shuffleRandomRelease } from '../stores/random-release';
  import { bookmarksSearchLabel, bookmarksSearchOpen, bookmarksSearchQuery, closeBookmarksSearch } from '../stores/mobile-bookmarks-search';
  import { mobileNavOrder, mobilePhoneBarSize, moveMobileNavTabAcross, swapMobileNavTabs, PHONE_BAR_MAX, PHONE_BAR_MIN, type MobileNavTab } from '../stores/mobile-nav';
  import { isScrollRestorePending } from '../stores/view-state';
  import { notificationsModalOpen, settingsModalOpen, watchModalOpen, openSettingsModal, closeSettingsModal } from '../stores/modals';
  import { notificationUnreadCount, refreshNotificationUnreadCount } from '../stores/notifications';
  import { loadDeviceNotificationSettings, resetDeviceNotificationBaseline, startDeviceNotificationPolling } from '../stores/device-notifications';
  import { supportModalOpen } from '../stores/support-promo';
  import { supportInbox, supportInboxLabel, watchSupportInbox } from '../stores/support-inbox';
  import { bindNotificationTaps, requestNativeNotifyPermission } from '../native/anix-notify';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { ensureProfileId, loadSelfProfileGlobal } from '../utils/profile';
  import { iconDownload, iconPlus, iconShuffle, iconCircleUser, iconSearch, iconSettings, iconBell } from '../components/icons';
  import { SIDEBAR_NAV_ITEMS, type SidebarNavId } from '../constants/sidebar-nav';
  import MobileSettings from './MobileSettings.svelte';
  import MobileSearch from './MobileSearch.svelte';
  import { buildSearchRoute, SEARCH_PLACEHOLDERS, type SearchTab } from '../search-controller';
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
    search?: { q: string; tab: SearchTab; by: number };
  }
  let { children, currentPath = '/', search }: Props = $props();

  type NavEntry = { id: MobileNavTab; label: string; short: string; href: string | null; icon: string; beta?: boolean };

  /** Короткие подписи для узкой левой панели и нижнего таб-бара. */
  const SHORT_LABELS: Partial<Record<SidebarNavId, string>> = { agent: 'ИИ' };
  /** Разделы — те же, что в сайдбаре ПК. */
  const SECTIONS: NavEntry[] = SIDEBAR_NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.id === 'agent' ? 'ИИ-помощницы' : item.label,
    short: SHORT_LABELS[item.id] ?? item.label,
    href: item.href,
    icon: item.icon,
    beta: item.beta,
  }));
  const PROFILE: NavEntry = { id: 'profile', label: 'Профиль', short: 'Профиль', href: null, icon: iconCircleUser(24) };

  const ALL_ENTRIES = [...SECTIONS, PROFILE];
  /** Порядок один на оба устройства: телефон показывает первые разделы в панели, остальные в шторке. */
  const orderedEntries = $derived($mobileNavOrder.map((id) => ALL_ENTRIES.find((e) => e.id === id)!));
  const phoneBar = $derived(orderedEntries.slice(0, $mobilePhoneBarSize));
  const phoneMore = $derived(orderedEntries.slice($mobilePhoneBarSize));
  /** На планшете профиль всегда внизу панели; линия отделяет от остальных те же главные разделы. */
  const railEntries = $derived(orderedEntries.filter((e) => e.id !== 'profile'));
  const railMainCount = $derived(phoneBar.filter((e) => e.id !== 'profile').length);

  let moreOpen = $state(false);
  let liftedTab = $state<string | null>(null);
  /** Откуда подняли раздел: обмены во время переноса на зоны не влияют. */
  let liftedFromBar = $state(false);
  /** Пока раздел подняли, появляется место, куда его можно отпустить, если ряд можно изменить. */
  const barHasFreeCell = $derived(liftedTab != null && !liftedFromBar && $mobilePhoneBarSize < PHONE_BAR_MAX);
  const canDropBelow = $derived(liftedTab != null && liftedFromBar && moreOpen && $mobilePhoneBarSize > PHONE_BAR_MIN);
  const navReorderParams = {
    onSwap: swapMobileNavTabs,
    onZone: (id: string, zone: string) => {
      const [area, index] = zone.split(':');
      moveMobileNavTabAcross(id, area === 'bar', index == null ? undefined : Number(index));
    },
    onLift: (id: string | null) => {
      if (id) liftedFromBar = phoneBar.some((e) => e.id === id);
      liftedTab = id;
    },
  };

  /** Свой аватар на кнопке профиля; без него (гость, нет фото, не загрузился) — обычная иконка. */
  let avatarUrl = $state<string | null>(null);
  function syncAvatar() {
    avatarUrl = (window as unknown as { __anixProfile?: { avatar?: string | null } }).__anixProfile?.avatar ?? null;
  }

  /** Верхняя и нижняя панели и вкладки: при прокрутке вниз уходят, при прокрутке вверх возвращаются. */
  const BARS_ALWAYS_SHOWN_PX = 120;
  const BARS_TOGGLE_DELTA_PX = 10;
  let barsHidden = $state(false);
  let scrollAnchor = 0;

  function showBars() {
    barsHidden = false;
    scrollAnchor = 0;
  }

  function onContentScroll(e: Event) {
    const scroller = e.target as HTMLElement;
    // В профиль событие приходит и от вложенных лент; панелями управляет только прокрутка страницы
    if (!scroller.matches('.page__scroll')) return;
    const y = scroller.scrollTop;
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

  let profileOpen = $state(false);
  let profileUserId = $state<number | null>(null);

  const path = $derived((currentPath.split('?')[0] || '/').replace(/\/+$/, '') || '/');

  const inCollections = $derived(path === '/collections' || path === '/collections/my');

  /** Страница релиза: «назад» плавает поверх размытой обложки, а не занимает отдельную полосу. */
  const floatBack = $derived(/^\/release\/\d+$/.test(path));
  const canShuffle = $derived(floatBack && $randomReleaseId === Number(path.split('/').pop()));
  /** Разделы со своей шапкой (DiscoverHero): заголовок уже в ней, назад ведёт системная кнопка. */
  const ownHeader = $derived(['/overview/popular', '/fluo'].includes(path));

  const rootTab = $derived.by((): MobileNavTab | null => {
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
  const isRoot = $derived(['/', '/catalog', '/overview', '/bookmarks', '/feed'].includes(path) || inCollections);
  /** В закладках поле открывается в верхней панели, а результаты остаются на странице, в текущей вкладке. */
  const bookmarksSearching = $derived(path === '/bookmarks' && $bookmarksSearchOpen);
  const activeTab = $derived<MobileNavTab | null>(profileOpen ? 'profile' : rootTab);
  /** Ответы от ИИ-помощниц: как на ПК, новость важнее пометки beta. */
  const aiUnread = $derived($supportInbox.unread);
  const aiUnreadLabel = $derived(aiUnread > 9 ? '9+' : String(aiUnread));
  const aiNews = $derived(supportInboxLabel($supportInbox));
  /** Раздел ИИ убран в шторку, а там есть новое: на панели счётчика не видно. */
  const aiHiddenNews = $derived(aiUnread > 0 && phoneMore.some((e) => e.id === 'agent'));

  function navAriaLabel(entry: NavEntry): string | undefined {
    if (entry.id === 'agent' && aiNews) return `${entry.label}: ${aiNews}`;
    return entry.beta ? `${entry.label} (beta)` : undefined;
  }

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
    showBars();
    moreOpen = false;
  });

  /** Из профиля поиск идёт по пользователям, из коллекций — по коллекциям. */
  const searchScope = $derived<SearchTab>(profileOpen ? 'profiles' : inCollections ? 'collections' : 'releases');
  const searchLabel = $derived(path === '/bookmarks' && !profileOpen ? $bookmarksSearchLabel : SEARCH_PLACEHOLDERS[searchScope]);

  function openSearch() {
    if (path === '/bookmarks' && !profileOpen) {
      bookmarksSearchOpen.set(true);
      return;
    }
    const route = searchScope === 'releases' ? '/search' : buildSearchRoute('', searchScope);
    closeProfile();
    navigate(route);
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
    showBars();
  }

  function closeProfile() {
    if (!profileOpen) return;
    profileOpen = false;
    profilePanelOpen.set(false);
    showBars();
  }

  /** На экранах с формами обновление стёрло бы введённое. */
  const canPullRefresh = $derived(
    !/\/(create|edit|composer)(\/|$)/.test(path) && (!profileOpen || $profilePanelInnerView === 'overview'),
  );
  let profileRefreshKey = $state(0);

  function refreshFromPull() {
    if (profileOpen) profileRefreshKey += 1;
    else refreshCurrentPage();
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
    if (get(feedMediaLightbox)) closeFeedMediaLightbox();
    else if (moreOpen) moreOpen = false;
    else if (get(watchModalOpen)) watchModalOpen.set(false);
    else if (profileOpen) backInProfile();
    else if (bookmarksSearching) closeBookmarksSearch();
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
    const stopSupportInbox = watchSupportInbox();
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
      stopSupportInbox();
      unsubSupport();
      unbindBack();
      stopDl();
      window.clearTimeout(offlineStart);
      window.removeEventListener('anix:profilePanelOpen', onOpen);
      window.removeEventListener('anix:profilePanelClose', onClose);
    };
  });
</script>

{#snippet navItem(tab: NavEntry, label?: string)}
  <button
    type="button"
    class="m-nav-item"
    class:m-nav-item--active={activeTab === tab.id}
    class:m-nav-item--lifted={liftedTab === tab.id}
    data-tab={tab.id}
    aria-current={activeTab === tab.id ? 'page' : undefined}
    aria-label={navAriaLabel(tab)}
    onclick={() => goTab(tab)}
  >
    <span class="m-nav-item__pill">
      {#if tab.id === 'profile' && avatarUrl && $isAuthenticated}
        <img class="m-nav-avatar" src={avatarUrl} alt="" draggable="false" onerror={() => { avatarUrl = null; }} />
      {:else}
        {@html tab.icon}
      {/if}
      {#if tab.id === 'agent' && aiUnread > 0}
        <span class="m-nav-badge" aria-hidden="true">{aiUnreadLabel}</span>
      {:else if tab.beta}
        <span class="m-nav-badge" aria-hidden="true">β</span>
      {/if}
    </span>
    <span class="m-nav-item__label">{label ?? tab.short}</span>
  </button>
{/snippet}

{#snippet searchEntry()}
  <button type="button" class="m-search" onclick={openSearch}>
    {@html iconSearch(24)}
    <span>{searchLabel}</span>
  </button>
{/snippet}

<div class="m-app">
  <MobilePullRefresh enabled={canPullRefresh} onRefresh={refreshFromPull} />
  <MobileRail reorder={navReorderParams} locked={liftedTab != null}>
    {#snippet list()}
      {#each railEntries as tab, i (tab.id)}
        {@render navItem(tab)}
        {#if i === railMainCount - 1}<hr class="m-rail__sep" />{/if}
      {/each}
    {/snippet}
    {#snippet footer()}
      {@render navItem(PROFILE)}
    {/snippet}
  </MobileRail>

  {#if floatBack}
    <header class="m-topbar m-topbar--inner m-topbar--float" class:m-topbar--float-hidden={barsHidden}>
      <button type="button" class="m-icon-btn" onclick={goBack} aria-label="Назад">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
      </button>
      <div class="m-float-actions">
        <button type="button" class="m-icon-btn m-icon-btn--end" onclick={() => window.dispatchEvent(new Event('anix:release-add-to-collection'))} aria-label="Добавить в коллекцию">
          {@html iconPlus(24)}
        </button>
        {#if canShuffle}
          <button type="button" class="m-icon-btn" onclick={() => void shuffleRandomRelease()} aria-label="Другой случайный релиз">
            {@html iconShuffle(22)}
          </button>
        {/if}
      </div>
    </header>
  {/if}

  <!-- .page__scroll / #content: здесь прокрутка всех страниц — на него завязаны подгрузка списков и восстановление позиции -->
  <div
    id="content"
    class="m-app__scroll page__scroll"
    class:m-app__scroll--bars-hidden={barsHidden}
    class:m-app__scroll--no-bar={floatBack || ownHeader}
    data-page-scroll
    onscroll={onContentScroll}
  >
  {#if isRoot && !bookmarksSearching}
    <header class="m-topbar">
      {@render searchEntry()}
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
  {:else if !floatBack && !ownHeader}
    <header class="m-topbar m-topbar--inner">
      <button type="button" class="m-icon-btn" onclick={bookmarksSearching ? closeBookmarksSearch : goBack} aria-label="Назад">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
      </button>
      {#if path === '/search'}
        <MobileSearch value={search?.q} tab={search?.tab} searchBy={search?.by} />
      {:else if bookmarksSearching}
        <MobileSearch
          value={$bookmarksSearchQuery}
          local={{ label: $bookmarksSearchLabel, onQuery: (q) => bookmarksSearchQuery.set(q) }}
        />
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

  <MobileDock
    bind:open={moreOpen}
    hidden={barsHidden}
    alert={aiHiddenNews}
    columns={$mobilePhoneBarSize}
    reorder={navReorderParams}
    locked={liftedTab != null}
  >
    {#snippet bar()}
      {#each phoneBar as tab, i (tab.id)}
        {#if barHasFreeCell}<div class="m-nav-free m-nav-free--gap" data-nav-drop={`bar:${i}`}></div>{/if}
        {@render navItem(tab)}
      {/each}
      {#if barHasFreeCell}<div class="m-nav-free" data-nav-drop="bar"></div>{/if}
    {/snippet}
    {#snippet more()}
      {#if canDropBelow}
        <div class="m-nav-dropzone" data-nav-drop="more" transition:slide={{ duration: 180 }}>Убрать вниз</div>
      {/if}
      {#each phoneMore as tab, i (tab.id)}
        <div class="m-dock__tile" style:--i={i}>{@render navItem(tab, $mobilePhoneBarSize === PHONE_BAR_MIN ? tab.label : undefined)}</div>
      {/each}
    {/snippet}
  </MobileDock>

  <UiV2MediaLightbox />

  {#if profileOpen && profileUserId != null}
    <div class="m-fullscreen m-fullscreen--profile" onscrollcapture={onContentScroll}>
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
      {#key profileRefreshKey}
        <SidebarProfilePanel userId={profileUserId} onClose={closeProfile} />
      {/key}
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
  }

  /* Отступ под панель разделов внутри прокрутки: фон страницы заходит под неё и виден в скруглённых углах */
  .m-app__scroll {
    flex: 1;
    min-height: 0;
    padding-left: var(--m-rail-left);
    padding-right: var(--m-rail-right);
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
    top: calc(env(safe-area-inset-top) + 34px); /* вровень с верхом обложки */
    /* По краям страницы (56rem, как у остальных), на узком экране — обычные поля */
    --m-float-inset: max(var(--m-space-4), calc((100% - var(--m-rail-w) - 56rem) / 2 + var(--m-gutter)));
    left: calc(var(--m-rail-left) + var(--m-float-inset));
    right: calc(var(--m-rail-right) + var(--m-float-inset));
    min-height: 0;
    padding: 0 !important; /* у общего .m-topbar поля заданы сильнее, и кнопки стояли не по краю контента */
    justify-content: space-between;
    align-items: flex-start !important;
    transition: transform 0.2s ease;

    .m-icon-btn { width: 48px; height: 48px; border-radius: 16px; background: var(--m-surface-chip); box-shadow: inset 0 0 0 1px var(--m-outline-variant); color: var(--m-text); }
  }

  @media (min-width: 600px) {
    .m-topbar--float { top: calc(env(safe-area-inset-top) + 20px); }
  }

  .m-float-actions { display: flex; flex-direction: column; gap: var(--m-space-2); }

  /* За верхний край целиком: кнопки стоят ниже него на высоту отступа */
  .m-topbar--float-hidden { transform: translateY(calc(-100% - env(safe-area-inset-top) - 48px)); }

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
    left: var(--m-rail-left);
    right: var(--m-rail-right);
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

  /* Угол иконки, а не пилюли: ширина пилюли на телефоне и планшете разная */
  .m-nav-badge {
    position: absolute;
    top: -1px;
    left: calc(50% + 5px);
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #e5484d;
    color: #fff;
    font: 700 11px/16px var(--m-font);
    text-align: center;
    pointer-events: none;
    box-shadow: 0 0 0 2px var(--m-surface-sheet);
  }

  .m-rail__sep {
    width: 40px;
    height: 1px;
    margin: var(--m-space-1) auto;
    border: 0;
    background: var(--m-divider);
  }

  .m-nav-avatar {
    display: block;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }

</style>
