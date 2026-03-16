import { renderLayout } from './layout';
import { handleRoute, getPath } from './router';
import { initTooltipPlacement } from './utils/tooltip-place';
import { renderLogin } from './views/login';
import { renderWatch } from './views/watch';
import { getCurrentRoomId, pushPlayback } from './services/lobby-state';

function showLoginScreen(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  const loginView = renderLogin(showMainApp);
  app.appendChild(loginView);
}

function showMainApp(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  if (getPath() === '/watch') {
    app.classList.add('app--player-window');
    app.appendChild(renderWatch());
    return;
  }

  const layout = renderLayout(showLoginScreen);
  app.appendChild(layout);
  const content = document.getElementById('content');
  if (content) {
    handleRoute(content);
    window.removeEventListener('popstate', onPopState);
    window.addEventListener('popstate', onPopState);
    if (window.location.protocol === 'file:') {
      window.removeEventListener('hashchange', onHashChange);
      window.addEventListener('hashchange', onHashChange);
    }
  }

  function onHashChange(): void {
    const c = document.getElementById('content');
    if (c) handleRoute(c);
  }

  window.addEventListener('lobby:remotePlayback', ((e: CustomEvent) => {
    const raw = e.detail;
    console.log('[lobby] remotePlayback получен', raw ? { releaseId: raw.releaseId, ep: raw.ep } : 'пусто');
    if (!raw || !window.electron?.syncPlayerState) {
      if (!window.electron?.syncPlayerState) console.warn('[lobby] syncPlayerState недоступен (не Electron?)');
      return;
    }
    const playback = {
      releaseId: String(raw.releaseId ?? ''),
      sourceId: String(raw.sourceId ?? ''),
      ep: String(raw.ep ?? ''),
      dubberId: raw.dubberId != null ? String(raw.dubberId) : undefined,
      title: String(raw.title ?? ''),
      sourceName: String(raw.sourceName ?? ''),
      paused: Boolean(raw.paused),
      currentTime: Number(raw.currentTime) || 0,
    };
    window.electron.syncPlayerState(playback);
  }) as EventListener);

  window.addEventListener('lobby:playerStateChanged', ((e: CustomEvent) => {
    if (getCurrentRoomId()) pushPlayback(e.detail);
  }) as EventListener);

  function onPopState() {
    const c = document.getElementById('content');
    if (c) handleRoute(c);
  }
}

export function initApp(): void {
  const app = document.getElementById('app');
  if (!app) return;

  initTooltipPlacement();

  if (typeof window.anix === 'undefined') {
    app.innerHTML = '';
    app.appendChild(renderLogin(() => {}));
    const err = app.querySelector('.auth-form__error') as HTMLElement;
    if (err) {
      err.textContent = 'API доступно только в приложении Electron. Запустите: yarn electron:dev';
      err.hidden = false;
    }
    return;
  }

  window.anix.getAuthStatus().then(({ hasToken }) => {
    if (hasToken) {
      showMainApp();
    } else {
      showLoginScreen();
    }
  }).catch(() => {
    showLoginScreen();
  });
}

export function navigate(path: string, _state?: unknown): void {
  console.log('[navigate]', path, 'protocol:', window.location.protocol);
  if (window.location.protocol === 'file:') {
    const hash = path && path !== '/' ? (path.startsWith('#') ? path : '#' + path) : '#/';
    if (window.location.hash !== hash) {
      window.location.hash = hash;
      console.log('[navigate] file: set hash', hash);
    } else {
      console.log('[navigate] file: hash уже равен, handleRoute');
      const content = document.getElementById('content');
      if (content) handleRoute(content);
    }
    return;
  }
  window.history.pushState(_state ?? null, '', path);
  const content = document.getElementById('content');
  if (content) handleRoute(content);
}
