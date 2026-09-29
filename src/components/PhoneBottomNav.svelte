<script lang="ts">
  import { navigateSidebarTab } from '../stores/navigation';
  import { activeSidebarTab, isSidebarTabActive } from '../stores/tab-navigation';
  import { isAuthenticated, requireAuth } from '../stores/auth';
  import { isTeamMember, openAdminArea } from '../stores/admin';
  import { activeDownloadsCount } from '../stores/downloads';
  import {
    iconHome,
    iconCompass,
    iconBookmark,
    iconDownload,
    iconMoreHorizontal,
    iconNewspaper,
    iconFlame,
    iconLayoutGrid,
    iconSignal,
    iconCalendar,
  } from './icons';

  interface Props {
    currentPath?: string;
    /** Закрыть боковые панели (расписание и т.п.) перед переходом */
    onBeforeNavigate?: () => void;
    /** Открыть расписание (на телефоне кнопка убрана из шапки) */
    onSchedule?: () => void;
  }

  let { currentPath = '/', onBeforeNavigate, onSchedule }: Props = $props();

  const MAIN_TABS = [
    { href: '/', label: 'Главная', icon: iconHome(22) },
    { href: '/overview', label: 'Обзор', icon: iconCompass(22) },
    { href: '/bookmarks', label: 'Закладки', icon: iconBookmark(22) },
    { href: '/downloads', label: 'Загрузки', icon: iconDownload(22) },
  ];

  const MORE_ITEMS = [
    { href: '/feed', label: 'Лента', icon: iconNewspaper(20) },
    { href: '/overview/popular', label: 'Популярное', icon: iconFlame(20) },
    { href: '/collections', label: 'Коллекции', icon: iconLayoutGrid(20) },
    { href: '/fluo', label: 'Fluo', icon: iconSignal(20) },
  ];

  const EXTERNAL_LINKS = [
    { url: 'https://discord.gg/qdFMFxzU9A', label: 'Discord' },
    { url: 'https://boosty.to/evt', label: 'Boosty' },
  ];

  let moreOpen = $state(false);

  const downloadsBadge = $derived($activeDownloadsCount);
  const sidebarContextTab = $derived($activeSidebarTab);

  function isActive(href: string): boolean {
    void sidebarContextTab;
    return isSidebarTabActive(href, currentPath ?? '');
  }

  const moreActive = $derived(
    moreOpen
      || MORE_ITEMS.some((i) => isActive(i.href))
      || (currentPath ?? '').startsWith('/admin'),
  );

  function go(href: string) {
    moreOpen = false;
    onBeforeNavigate?.();
    if (href === '/bookmarks' && !requireAuth()) return;
    navigateSidebarTab(href);
  }

  function openExternal(url: string) {
    moreOpen = false;
    const electronOpen = window.electron?.openExternal;
    if (electronOpen) electronOpen(url);
    else window.open(url, '_blank', 'noopener');
  }

  function openSchedule() {
    moreOpen = false;
    onSchedule?.();
  }

  function openAdmin() {
    moreOpen = false;
    onBeforeNavigate?.();
    openAdminArea();
  }
</script>

{#if moreOpen}
  <button
    type="button"
    class="phone-more-backdrop"
    aria-label="Закрыть меню"
    onclick={() => (moreOpen = false)}
  ></button>
  <div class="phone-more-sheet" role="menu" aria-label="Ещё">
    {#each MORE_ITEMS as item}
      <button
        type="button"
        role="menuitem"
        class="phone-more-sheet__item"
        class:phone-more-sheet__item--active={isActive(item.href)}
        onclick={() => go(item.href)}
      >
        <span class="phone-more-sheet__icon">{@html item.icon}</span>
        <span>{item.label}</span>
      </button>
    {/each}
    {#if onSchedule}
      <button type="button" role="menuitem" class="phone-more-sheet__item" onclick={openSchedule}>
        <span class="phone-more-sheet__icon">{@html iconCalendar(20)}</span>
        <span>Расписание</span>
      </button>
    {/if}
    {#if $isTeamMember}
      <button type="button" role="menuitem" class="phone-more-sheet__item" onclick={openAdmin}>
        <span class="phone-more-sheet__icon"></span>
        <span>Команда</span>
      </button>
    {/if}
    <div class="phone-more-sheet__divider"></div>
    {#each EXTERNAL_LINKS as link}
      <button
        type="button"
        role="menuitem"
        class="phone-more-sheet__item phone-more-sheet__item--muted"
        onclick={() => openExternal(link.url)}
      >
        <span class="phone-more-sheet__icon"></span>
        <span>{link.label}</span>
      </button>
    {/each}
  </div>
{/if}

<nav class="phone-bottom-nav" aria-label="Основная навигация">
  {#each MAIN_TABS as tab}
    <button
      type="button"
      class="phone-bottom-nav__tab"
      class:phone-bottom-nav__tab--active={!moreOpen && isActive(tab.href)}
      class:phone-bottom-nav__tab--locked={tab.href === '/bookmarks' && !$isAuthenticated}
      aria-label={tab.label}
      aria-current={isActive(tab.href) ? 'page' : undefined}
      onclick={() => go(tab.href)}
    >
      <span class="phone-bottom-nav__icon">
        {@html tab.icon}
        {#if tab.href === '/downloads' && downloadsBadge > 0}
          <span class="phone-bottom-nav__badge">{downloadsBadge > 9 ? '9+' : downloadsBadge}</span>
        {/if}
      </span>
      <span class="phone-bottom-nav__label">{tab.label}</span>
    </button>
  {/each}
  <button
    type="button"
    class="phone-bottom-nav__tab"
    class:phone-bottom-nav__tab--active={moreActive}
    aria-label="Ещё"
    aria-expanded={moreOpen}
    onclick={() => (moreOpen = !moreOpen)}
  >
    <span class="phone-bottom-nav__icon">{@html iconMoreHorizontal(22)}</span>
    <span class="phone-bottom-nav__label">Ещё</span>
  </button>
</nav>
