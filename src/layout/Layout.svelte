<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { openLobbyModal, openNotificationsModal, openSettingsModal } from '../stores/modals';
  import { bindSearchHotkeys } from '../search-controller';
  import { addSearchHistory } from '../utils/search-history';
  import { openSearchDropdown, closeSearchDropdown } from '../components/search-dropdown';
  import { iconHome, iconBookmark } from '../components/icons';

  import TitleBar from '../components/TitleBar.svelte';
  import Page from '../components/Page.svelte';

  interface Props {
    children?: Snippet;
    currentPath?: string;
  }

  let { children, currentPath = '/' }: Props = $props();

  const SIDEBAR_NAV = [
    { href: '/', label: 'Главная', icon: iconHome(18) },
    { href: '/bookmarks', label: 'Закладки', icon: iconBookmark(18) },
  ];

  function isActive(href: string): boolean {
    return href === currentPath || (href === '/' && (currentPath === '' || currentPath === '/'));
  }

  let searchInputEl: HTMLInputElement | null = $state(null);
  let searchWrapEl: HTMLElement | null = $state(null);

  onMount(() => {
    if (searchWrapEl && searchInputEl) {
      const searchKbd = searchWrapEl.querySelector('.titlebar__search-kbd') as HTMLElement | null;

      searchWrapEl.addEventListener('click', () => searchInputEl?.focus());

      searchInputEl.addEventListener('focus', () => {
        if (searchKbd) searchKbd.textContent = 'Enter';
        openSearchDropdown(searchWrapEl!, searchInputEl!, ({ query, tab }) => {
          if (query) addSearchHistory(query);
          const tabParam = tab && tab !== 'releases' ? `&tab=${tab}` : '';
          navigate(query ? `/search?q=${encodeURIComponent(query)}${tabParam}` : '/search');
        });
      });

      searchInputEl.addEventListener('blur', () => {
        if (searchKbd) searchKbd.textContent = 'Ctrl+K';
      });

      searchInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const q = searchInputEl!.value.trim();
          if (q) addSearchHistory(q);
          closeSearchDropdown();
          navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
        }
      });
    }

    bindSearchHotkeys();

    // Load profile avatar — stored in __anixProfile so TitleBar's $effect can pick it up
    if (window.anixApi) {
      window.anixApi.profile.self().then((data: any) => {
        const profile = data?.profile;
        if (!profile) return;
        const pid = profile.id ?? profile['@id'];
        (window as any).__anixProfile = {
          id: typeof pid === 'number' ? pid : undefined,
          login: profile.login ?? profile.nickname ?? undefined,
          avatar: profile.avatar ?? null,
        };
      }).catch(() => {});
    }
  });
</script>

<div class="layout">
  <TitleBar
    bind:searchInput={searchInputEl}
    bind:searchWrap={searchWrapEl}
    onLobby={() => openLobbyModal()}
    onNotifications={() => openNotificationsModal()}
    onSettings={() => openSettingsModal()}
    onProfile={() => navigate('/profile')}
  />

  <div class="layout__body">
    <aside class="sidebar">
      <nav class="sidebar__nav">
        {#each SIDEBAR_NAV as item}
          <a
            href={item.href}
            class="sidebar__link tooltip-trigger"
            class:sidebar__link--active={isActive(item.href)}
            aria-label={item.label}
            onclick={(e) => { e.preventDefault(); navigate(item.href); }}
          >
            {@html item.icon}
            <span class="tooltip tooltip--animated tooltip--right">{item.label}</span>
          </a>
        {/each}
      </nav>
      <div class="sidebar__bottom"></div>
    </aside>

    <main class="layout__main">
      <div class="content-panel">
        <div class="content-panel__body">
          <Page scrollId="content">
            {@render children?.()}
          </Page>
        </div>
      </div>
    </main>
  </div>
</div>
