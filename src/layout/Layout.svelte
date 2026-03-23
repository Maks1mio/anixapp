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
    searchQ?: string;
  }

  let { children, currentPath = '/', searchQ = '' }: Props = $props();

  const SIDEBAR_NAV = [
    { href: '/', label: 'Главная', icon: iconHome(18) },
    { href: '/bookmarks', label: 'Закладки', icon: iconBookmark(18) },
  ];

  function isActive(href: string): boolean {
    return href === currentPath || (href === '/' && (currentPath === '' || currentPath === '/'));
  }

  const isChatPage = $derived(/^\/announcement\/[^/]+\/chat$/.test(currentPath ?? ''));

  let searchInputEl: HTMLInputElement | null = $state(null);
  let searchWrapEl: HTMLElement | null = $state(null);

  // Sync titlebar input value whenever the search query changes from navigation
  $effect(() => {
    const q = searchQ;
    const el = searchInputEl;
    if (el && document.activeElement !== el) {
      el.value = q;
    }
  });

  onMount(() => {
    if (searchWrapEl && searchInputEl) {
      const searchKbd = searchWrapEl.querySelector('.titlebar__search-kbd') as HTMLElement | null;

      searchWrapEl.addEventListener('click', () => searchInputEl?.focus());

      searchInputEl.addEventListener('focus', () => {
        if (searchKbd) searchKbd.textContent = 'Enter';
        openSearchDropdown(searchWrapEl!, searchInputEl!, ({ query, tab }) => {
          if (query) addSearchHistory(query);
          // Immediately show the selected query in the input so the user
          // sees it even before the page re-renders.
          if (searchInputEl) searchInputEl.value = query;
          const tabParam = tab && tab !== 'releases' ? `&tab=${tab}` : '';
          navigate(query ? `/search?q=${encodeURIComponent(query)}${tabParam}` : '/search');
          // Dispatch directly so Search.svelte always reacts, even if the URL
          // path didn't change (same /search path, only query params differ).
          window.dispatchEvent(new CustomEvent('anix:searchRequest', {
            detail: { q: query, tab: tab || 'releases' },
          }));
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
          // Always dispatch so Search.svelte reacts even when the URL path
          // stays the same (pushState with same /search path won't trigger
          // the store/effect chain that updates the `q` prop).
          window.dispatchEvent(new CustomEvent('anix:searchRequest', {
            detail: { q, tab: 'releases' },
          }));
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
        window.dispatchEvent(new CustomEvent('anix:profileUpdated'));
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
      <div class="sidebar__bottom">
  <a
    href="https://discord.gg/qdFMFxzU9A"
    class="sidebar__link sidebar__link--social tooltip-trigger"
    aria-label="Discord"
    onclick={(e) => { e.preventDefault(); window.electron?.openExternal?.('https://discord.gg/qdFMFxzU9A'); }}
  >
    <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
    <span class="tooltip tooltip--animated tooltip--right">Discord</span>
  </a>
  <a
    href="https://boosty.to/evt"
    class="sidebar__link sidebar__link--social sidebar__link--boosty tooltip-trigger"
    aria-label="Boosty"
    onclick={(e) => { e.preventDefault(); window.electron?.openExternal?.('https://boosty.to/evt'); }}
  >
    <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.5 2L4 13.5h7L8.5 22 20 10.5h-7L13.5 2z"/>
    </svg>
    <span class="tooltip tooltip--animated tooltip--right">Boosty</span>
  </a>
</div>
    </aside>

    <main class="layout__main">
      <div class="content-panel">
        <div class="content-panel__body">
          <Page scrollId="content" extraClass={isChatPage ? 'page--chat' : undefined}>
            {@render children?.()}
          </Page>
        </div>
      </div>
    </main>
  </div>
</div>
