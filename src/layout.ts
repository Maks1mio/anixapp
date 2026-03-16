import { navigate } from './app';
import {
  iconBookmark,
  iconBell,
  iconHome,
  iconLayoutGrid,
  iconLogOut,
  iconSettings,
  iconUser,
  iconUsers,
} from './components/icons';
import { openSettingsModal } from './components/settings-modal';
import { openNotificationsModal } from './components/notifications-modal';
import { openLobbyModal } from './components/lobby-modal';
import { renderTitleBar } from './components/titlebar';
import { renderPage } from './components/page';
import { getPath } from './router';
import { bindSearchHotkeys } from './search-controller';
import { openSearchDropdown, closeSearchDropdown } from './components/search-dropdown';
import { addSearchHistory } from './utils/search-history';

const SIDEBAR_NAV: { href: string; label: string; icon: string }[] = [
  { href: '/', label: 'Главная', icon: iconHome(18) },
  { href: '/feed', label: 'Обзор', icon: iconLayoutGrid(18) },
  { href: '/bookmarks', label: 'Закладки', icon: iconBookmark(18) },
];

export function renderLayout(onLogout: () => void): HTMLElement {
  const layout = document.createElement('div');
  layout.className = 'layout';

  const titlebar = renderTitleBar();
  layout.appendChild(titlebar);

  const searchWrap = titlebar.querySelector('#titlebar-search-wrap') as HTMLElement | null;
  const searchInput = titlebar.querySelector('#titlebar-search-input') as HTMLInputElement | null;
  const searchKbd = titlebar.querySelector('.titlebar__search-kbd') as HTMLElement | null;
  if (searchWrap && searchInput) {
    searchWrap.addEventListener('click', () => searchInput.focus());
    searchInput.addEventListener('focus', () => {
      if (searchKbd) searchKbd.textContent = 'Enter';
      openSearchDropdown(searchWrap!, searchInput, ({ query, tab }) => {
        if (query) addSearchHistory(query);
        const tabParam = tab && tab !== 'releases' ? `&tab=${tab}` : '';
        navigate(query ? `/search?q=${encodeURIComponent(query)}${tabParam}` : '/search');
      });
    });
    searchInput.addEventListener('blur', () => {
      if (searchKbd) searchKbd.textContent = 'Ctrl+K';
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = searchInput.value.trim();
        if (q) addSearchHistory(q);
        closeSearchDropdown();
        navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
      }
    });
  }
  bindSearchHotkeys();

  const titlebarMenu = titlebar.querySelector('#titlebar-menu') as HTMLElement;
  if (titlebarMenu) {
    titlebarMenu.innerHTML = `
      <button type="button" class="titlebar__menu-item" id="titlebar-lobby" aria-label="Совместный просмотр">${iconUsers(18)}</button>
      <button type="button" class="titlebar__menu-item" id="titlebar-notifications" aria-label="Уведомления">${iconBell(18)}</button>
      <button type="button" class="titlebar__menu-item titlebar__menu-item--avatar" id="titlebar-profile" aria-label="Профиль">
        <span class="titlebar__avatar titlebar__avatar--placeholder">${iconUser(18)}</span>
      </button>
      <button type="button" class="titlebar__menu-item" id="titlebar-settings" aria-label="Настройки">${iconSettings(18)}</button>
    `;
    titlebarMenu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const lobbyBtn = target.closest('#titlebar-lobby');
      const notificationsBtn = target.closest('#titlebar-notifications');
      const profileBtn = target.closest('#titlebar-profile');
      const settingsBtn = target.closest('#titlebar-settings');
      if (lobbyBtn) {
        e.preventDefault();
        openLobbyModal();
      } else if (notificationsBtn) {
        e.preventDefault();
        openNotificationsModal();
      } else if (profileBtn) {
        e.preventDefault();
        navigate('/profile');
      } else if (settingsBtn) {
        e.preventDefault();
        openSettingsModal(() => {});
      }
    });
  }

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';

  const navLinks = SIDEBAR_NAV.map(
    ({ href, label, icon }) =>
      `<a href="${href}" class="sidebar__link" data-nav aria-label="${label}">${icon}</a>`,
  ).join('');

  sidebar.innerHTML = `
    <nav class="sidebar__nav">
      ${navLinks}
    </nav>
    <div class="sidebar__bottom">
      <button type="button" class="sidebar__link sidebar__link--btn sidebar__link--logout" id="sidebar-logout" aria-label="Выйти">${iconLogOut(18)}</button>
    </div>
  `;

  const contentPanel = document.createElement('div');
  contentPanel.className = 'content-panel';
  const panelBody = document.createElement('div');
  panelBody.className = 'content-panel__body';
  panelBody.appendChild(renderPage());
  contentPanel.appendChild(panelBody);

  const main = document.createElement('main');
  main.className = 'layout__main';
  main.appendChild(contentPanel);

  const body = document.createElement('div');
  body.className = 'layout__body';
  body.appendChild(sidebar);
  body.appendChild(main);
  layout.appendChild(body);

  sidebar.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const a = el as HTMLAnchorElement;
      const href = a.getAttribute('href');
      console.log('[layout] sidebar nav click', { href });
      if (a.href && href?.startsWith('/')) {
        e.preventDefault();
        navigate(href);
      }
    });
  });

  sidebar.querySelector('#sidebar-logout')?.addEventListener('click', () => {
    if (window.anix) {
      window.anix.logout().then(onLogout);
    }
  });

  if (window.anix) {
    window.anix
      .getSelfProfile()
      .then((data: any) => {
        const profile = data?.profile;
        if (!profile) return;
        const id = profile.id ?? profile['@id'];
        (window as unknown as { __anixProfile?: { id?: number; login?: string; avatar?: string | null } }).__anixProfile = {
          id: typeof id === 'number' ? id : undefined,
          login: profile.login ?? profile.nickname ?? undefined,
          avatar: profile.avatar ?? null,
        };
        const avatarEl = layout.querySelector('.titlebar__avatar') as HTMLElement | null;
        if (avatarEl && profile.avatar) {
          avatarEl.classList.add('titlebar__avatar--image');
          avatarEl.classList.remove('titlebar__avatar--placeholder');
          avatarEl.style.backgroundImage = `url(${profile.avatar})`;
          avatarEl.innerHTML = '';
        }
      })
      .catch(() => {});
  }

  return layout;
}
