import { renderLayout } from './layout';
import { handleRoute, getPath } from './router';
import { initTooltipPlacement } from './utils/tooltip-place';
import { renderLogin } from './views/login';
import { renderWatch } from './views/watch';
import { getCurrentRoomId, pushCommand, voteOnProposal, getCurrentParticipants } from './services/lobby-state';
import { renderTitleBar } from './components/titlebar';
import { iconSettings } from './components/icons';
import { openSettingsModal } from './components/settings-modal';

let offlineRetryTimer: number | null = null;

function clearOfflineRetryTimer(): void {
  if (offlineRetryTimer !== null) {
    window.clearInterval(offlineRetryTimer);
    offlineRetryTimer = null;
  }
}

function showLoginScreen(): void {
  const app = document.getElementById('app');
  if (!app) return;
  clearOfflineRetryTimer();
  app.innerHTML = '';
  const loginView = renderLogin(showMainApp);
  app.appendChild(loginView);
}

function showMainApp(): void {
  const app = document.getElementById('app');
  if (!app) return;
  clearOfflineRetryTimer();
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

  // ── Proposal events → forward to player via IPC ──

  // lobby:proposalSentLocal — fired from pushCommand as fallback (rarely used now).
  // watch-modal's "Предложить" button handles the primary proposal flow directly.
  // No player revert needed — player was never changed in the new flow.
  window.addEventListener('lobby:proposalSentLocal', ((e: CustomEvent) => {
    const { newPlayback } = e.detail ?? {};
    if (window.electron?.sendProposalToPlayer) {
      window.electron.sendProposalToPlayer({
        type: 'waiting',
        newPlayback: newPlayback ?? null,
      });
    }
  }) as EventListener);

  // Другие получили предложение — показать голосование в плеере
  window.addEventListener('lobby:proposalNew', ((e: CustomEvent) => {
    if (window.electron?.sendProposalToPlayer) {
      window.electron.sendProposalToPlayer({
        type: 'vote',
        proposalId: e.detail?.proposalId,
        proposerLogin: e.detail?.proposerLogin ?? 'Участник',
        playback: e.detail?.playback ?? null,
      });
    }
  }) as EventListener);

  // Предложение принято
  window.addEventListener('lobby:proposalAccepted', ((e: CustomEvent) => {
    if (window.electron?.sendProposalToPlayer) {
      window.electron.sendProposalToPlayer({
        type: 'accepted',
        proposalId: e.detail?.proposalId,
        playback: e.detail?.playback ?? null,
      });
    }
  }) as EventListener);

  // Предложение отклонено
  window.addEventListener('lobby:proposalRejected', ((e: CustomEvent) => {
    if (window.electron?.sendProposalToPlayer) {
      window.electron.sendProposalToPlayer({
        type: 'rejected',
        proposalId: e.detail?.proposalId,
        reason: e.detail?.reason ?? '',
      });
    }
  }) as EventListener);

  // Голос пришёл из плеера — пересылаем в lobby-state
  window.addEventListener('lobby:voteFromPlayer', ((e: CustomEvent) => {
    const { proposalId, accept } = e.detail ?? {};
    if (proposalId) {
      voteOnProposal(proposalId, accept === true);
    }
  }) as EventListener);

  window.addEventListener('lobby:remotePlayback', ((e: CustomEvent) => {
    const raw = e.detail as { playback?: unknown; fromPeerId?: string | null } | null;
    const rawPlayback = raw && typeof raw === 'object' ? (raw as any).playback : raw;
    console.log(
      '[lobby] remotePlayback получен',
      rawPlayback ? { releaseId: (rawPlayback as any).releaseId, ep: (rawPlayback as any).ep, fromPeerId: (raw as any)?.fromPeerId ?? null } : 'пусто'
    );
    if (!rawPlayback || !window.electron?.syncPlayerState) {
      if (!window.electron?.syncPlayerState) console.warn('[lobby] syncPlayerState недоступен (не Electron?)');
      return;
    }
    const playback = {
      releaseId: String((rawPlayback as any).releaseId ?? ''),
      sourceId: String((rawPlayback as any).sourceId ?? ''),
      ep: String((rawPlayback as any).ep ?? ''),
      dubberId: (rawPlayback as any).dubberId != null ? String((rawPlayback as any).dubberId) : undefined,
      title: String((rawPlayback as any).title ?? ''),
      sourceName: String((rawPlayback as any).sourceName ?? ''),
      paused: Boolean((rawPlayback as any).paused),
      currentTime: Number((rawPlayback as any).currentTime) || 0,
    };
    window.electron.syncPlayerState(playback);
    // Также пересылаем текущих участников в плеер при каждом sync
    const currentParts = getCurrentParticipants();
    window.electron?.sendParticipantsToPlayer?.(currentParts);
  }) as EventListener);

  // Пересылаем изменения участников в плеер
  window.addEventListener('lobby:participantsChanged', ((e: CustomEvent) => {
    window.electron?.sendParticipantsToPlayer?.(e.detail?.participants ?? []);
  }) as EventListener);

  // Пересылаем события активности в плеер (pause/play/join/leave/proposal)
  window.addEventListener('lobby:activityEvent', ((e: CustomEvent) => {
    window.electron?.sendActivityToPlayer?.(e.detail ?? {});
  }) as EventListener);

  window.addEventListener(
    'lobby:playerStateChanged',
    ((e: CustomEvent) => {
      if (!getCurrentRoomId()) return;
      const detail = e.detail as
        | { action?: string; playback?: unknown }
        | unknown;
      let action: 'play' | 'pause' | 'seek' | 'changeEpisode' = 'play';
      let rawPlayback: any = detail;
      if (detail && typeof detail === 'object' && (detail as any).playback) {
        const d = detail as any;
        rawPlayback = d.playback;
        if (typeof d.action === 'string') {
          if (d.action === 'pause' || d.action === 'seek' || d.action === 'changeEpisode' || d.action === 'play') {
            action = d.action;
          }
        }
      }
      if (!rawPlayback || typeof rawPlayback !== 'object') return;
      if (!('releaseId' in rawPlayback) || !('sourceId' in rawPlayback) || !('ep' in rawPlayback)) return;
      if (action === 'play' || action === 'pause') {
        action = rawPlayback.paused ? 'pause' : 'play';
      }
      const playback = {
        releaseId: String((rawPlayback as any).releaseId ?? ''),
        sourceId: String((rawPlayback as any).sourceId ?? ''),
        ep: String((rawPlayback as any).ep ?? ''),
        dubberId: (rawPlayback as any).dubberId != null ? String((rawPlayback as any).dubberId) : undefined,
        title: String((rawPlayback as any).title ?? ''),
        sourceName: String((rawPlayback as any).sourceName ?? ''),
        paused: Boolean((rawPlayback as any).paused),
        currentTime: Number((rawPlayback as any).currentTime) || 0,
      };
      pushCommand(action, playback);
    }) as EventListener,
  );

  function onPopState() {
    const c = document.getElementById('content');
    if (c) handleRoute(c);
  }
}

function showOfflineScreen(): void {
  const app = document.getElementById('app');
  if (!app) return;
  clearOfflineRetryTimer();
  app.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'layout';

  const titlebar = renderTitleBar();
  layout.appendChild(titlebar);

  // Для страницы проверки соединения скрываем стрелки и поиск,
  // но показываем отдельную кнопку настроек.
  const navEl = titlebar.querySelector('#titlebar-nav') as HTMLElement | null;
  if (navEl) navEl.remove();
  const searchWrap = titlebar.querySelector('#titlebar-search-wrap') as HTMLElement | null;
  if (searchWrap) searchWrap.remove();
  const menu = titlebar.querySelector('#titlebar-menu') as HTMLElement | null;
  if (menu) {
    menu.innerHTML = `
      <button type="button" class="titlebar__menu-item" id="titlebar-offline-settings" aria-label="Настройки">
        ${iconSettings(18)}
      </button>
    `;
    const btn = menu.querySelector('#titlebar-offline-settings') as HTMLButtonElement | null;
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openSettingsModal(() => {});
      });
    }
  }

  const wrap = document.createElement('div');
  wrap.className = 'view-offline';
  wrap.innerHTML = `
    <div class="view-offline__body">
      <div class="offline-card">
        <div class="offline-card__spinner" aria-hidden="true"></div>
        <h1 class="offline-card__title">Проверяем соединение с сервером…</h1>
        <p class="offline-card__text">
          С серверами Anixart сейчас могут быть проблемы. Пробуем подключиться.
        </p>
        <p class="offline-card__hint">
          Проверяем соединение каждые несколько секунд. Вы можете оставить приложение открытым.
        </p>
      </div>
    </div>
  `;

  const retry = async () => {
    if (!window.anix) return;
    try {
      await window.anix.checkConnection();
      const { hasToken } = await window.anix.getAuthStatus();
      clearOfflineRetryTimer();
      if (hasToken) {
        showMainApp();
      } else {
        showLoginScreen();
      }
    } catch {
      // остаёмся на оффлайн-экране
    }
  };

  // Периодически пробуем переподключиться, без ручной кнопки.
  offlineRetryTimer = window.setInterval(() => {
    retry();
  }, 7000);

  layout.appendChild(wrap);
  app.appendChild(layout);
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

  window.addEventListener(
    'anix:offline',
    (() => {
      showOfflineScreen();
    }) as EventListener,
  );

  // При старте всегда сначала показываем страницу лоадера,
  // затем пробуем проверить соединение и статус авторизации.
  showOfflineScreen();

  window.anix
    .checkConnection()
    .then(async () => {
      const { hasToken } = await window.anix.getAuthStatus();
      // Немного задерживаем переход, чтобы пользователь успел увидеть экран проверки соединения.
      window.setTimeout(() => {
        if (hasToken) {
          showMainApp();
        } else {
          showLoginScreen();
        }
      }, 500);
    })
    .catch(() => {
      // Если нет ответа от API — просто остаёмся на оффлайн‑экране.
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
