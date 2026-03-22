/**
 * Модальное окно лобби: создать комнату, присоединиться по коду, участники.
 */

import { navigate } from '../stores/navigation';
import { renderPage } from './page';
import { createRoom, joinRoom, getRoom, leaveRoom as apiLeaveRoom, type LobbyParticipant, type LobbyRoom } from '../services/lobby-api';
import { setLobbyRoom, leaveLobby, getCurrentRoomId, getCurrentParticipants, getLobbyLog, setLobbyParticipants } from '../services/lobby-state';
import { isConnected } from '../services/lobby-ws';

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function getProfile(): { profileId?: number; login?: string; avatar?: string | null } {
  try {
    const raw = (window as unknown as { __anixProfile?: { id?: number; login?: string; avatar?: string | null } }).__anixProfile;
    if (raw && (raw.id || raw.login)) {
      return {
        profileId: raw.id,
        login: raw.login ?? undefined,
        avatar: raw.avatar ?? null,
      };
    }
  } catch (_) {}
  return {};
}

function copyToClipboard(text: string, btn: HTMLElement): void {
  navigator.clipboard.writeText(text).then(() => {
    const prev = btn.textContent;
    btn.textContent = 'Скопировано!';
    btn.classList.add('lobby-modal__copy-btn--done');
    setTimeout(() => {
      btn.textContent = prev;
      btn.classList.remove('lobby-modal__copy-btn--done');
    }, 1500);
  }).catch(() => {});
}

export function openLobbyModal(prefilledCode?: string): void {
  const existing = document.querySelector('.lobby-modal-overlay') as HTMLElement | null;
  if (existing) {
    const closer = (existing as unknown as { _close?: () => void })._close;
    if (typeof closer === 'function') closer();
    else existing.remove();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'lobby-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Лобби совместного просмотра');

  const panel = document.createElement('div');
  panel.className = 'lobby-modal-panel';
  panel.innerHTML = `
    <div class="lobby-modal__header">
      <div class="lobby-modal__header-left">
        <div class="lobby-modal__header-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <h2 class="lobby-modal__title">Совместный просмотр</h2>
      </div>
      <button type="button" class="lobby-modal__close" aria-label="Закрыть"></button>
    </div>
    <div class="lobby-modal__body"></div>
  `;

  const body = panel.querySelector('.lobby-modal__body') as HTMLElement;
  const page = renderPage();
  page.classList.remove('page--padded');
  page.classList.add('lobby-modal__page');
  body.appendChild(page);
  const scrollRoot = page.querySelector('.page__scroll') as HTMLElement;
  if (scrollRoot) scrollRoot.removeAttribute('id');

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('lobby-modal-overlay--open'));

  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    // Stop room-level polling and event listeners if modal is closed externally (X / Escape / outside click)
    const roomCleanup = (scrollRoot as unknown as { _lobbyOnClose?: () => void })._lobbyOnClose;
    if (roomCleanup) {
      (scrollRoot as unknown as { _lobbyOnClose?: () => void })._lobbyOnClose = undefined;
      roomCleanup();
    }
    overlay.classList.remove('lobby-modal-overlay--open');
    overlay.classList.add('lobby-modal-overlay--closing');
    const done = () => {
      if (!overlay.parentNode) return;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      (overlay as unknown as { _close?: () => void })._close = undefined;
    };
    overlay.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 260);
  }

  // Закрытие по клику вне панели
  overlay.addEventListener('click', (e) => {
    if (panel.contains(e.target as Node)) return;
    close();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  panel.querySelector('.lobby-modal__close')?.addEventListener('click', close);

  (overlay as unknown as { _close?: () => void })._close = close;

  /** Auto-join lobby using a code from Discord party invite. */
  function renderInitialWithCode(code: string) {
    scrollRoot.innerHTML = '<div class="lobby-modal__loading">Подключаемся к комнате через Discord…</div>';
    const baseProfile = getProfile();
    const getDeviceId = (window as unknown as { electron?: { getDeviceId?: () => Promise<string> } }).electron?.getDeviceId;
    const deviceIdPromise = typeof getDeviceId === 'function' ? getDeviceId().catch(() => null) : Promise.resolve(null);
    deviceIdPromise
      .then((deviceId) => joinRoom(code, { ...baseProfile, deviceId: deviceId ?? null }))
      .then((room) => {
        setLobbyRoom(room.roomId, {
          myPeerId: room.myPeerId,
          participants: room.participants ?? [],
          playback: room.playback ?? undefined,
          roomCode: room.code,
        });
        renderInRoom(room.roomId, scrollRoot, close, room.code, room.participants);
      })
      .catch(() => {
        // Fallback to manual join screen with code pre-filled
        renderInitial();
        setTimeout(() => {
          const input = scrollRoot.querySelector('[data-lobby-code]') as HTMLInputElement | null;
          if (input) input.value = code;
        }, 0);
      });
  }

  function renderInitial() {
    const currentRoomId = getCurrentRoomId();
    if (prefilledCode && !currentRoomId) {
      // Discord party invite — pre-fill the join code and auto-submit
      renderInitialWithCode(prefilledCode);
      return;
    }
    if (currentRoomId) {
      scrollRoot.innerHTML = '<div class="lobby-modal__loading">Загрузка...</div>';
      getRoom(currentRoomId)
        .then((room: LobbyRoom) => {
          renderInRoom(currentRoomId, scrollRoot, close, room.code, room.participants);
        })
        .catch(() => {
          renderInRoom(currentRoomId, scrollRoot, close);
        });
      return;
    }

    scrollRoot.innerHTML = `
      <div class="lobby-modal__welcome">
        <div class="lobby-modal__welcome-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polygon points="10 8 16 11 10 14 10 8" fill="currentColor" stroke="none"/></svg>
        </div>
        <p class="lobby-modal__welcome-text">Смотрите аниме вместе с друзьями в реальном времени</p>
      </div>

      <div class="lobby-modal__actions">
        <button type="button" class="lobby-modal__btn lobby-modal__btn--create" data-lobby-create>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Создать комнату
        </button>

        <div class="lobby-modal__divider">
          <span class="lobby-modal__divider-line"></span>
          <span class="lobby-modal__divider-text">или</span>
          <span class="lobby-modal__divider-line"></span>
        </div>

        <div class="lobby-modal__join-group">
          <label class="lobby-modal__join-label">Присоединиться по коду</label>
          <div class="lobby-modal__join-row">
            <input type="text" class="lobby-modal__input" data-lobby-code placeholder="ABC123" maxlength="12" autocomplete="off" spellcheck="false" />
            <button type="button" class="lobby-modal__btn lobby-modal__btn--join" data-lobby-join>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Войти
            </button>
          </div>
          <p class="lobby-modal__join-hint" data-lobby-hint hidden></p>
        </div>
      </div>
    `;

    const codeInput = scrollRoot.querySelector('[data-lobby-code]') as HTMLInputElement;
    codeInput?.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    codeInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        scrollRoot.querySelector<HTMLButtonElement>('[data-lobby-join]')?.click();
      }
    });

    scrollRoot.querySelector('[data-lobby-create]')?.addEventListener('click', () => {
      const btn = scrollRoot.querySelector('[data-lobby-create]') as HTMLButtonElement;
      btn.disabled = true;
      btn.classList.add('lobby-modal__btn--loading');
      const baseProfile = getProfile();
      const getDeviceId = (window as unknown as { electron?: { getDeviceId?: () => Promise<string> } }).electron?.getDeviceId;
      const deviceIdPromise = typeof getDeviceId === 'function' ? getDeviceId().catch(() => null) : Promise.resolve(null);
      deviceIdPromise
        .then((deviceId) => createRoom({ ...baseProfile, deviceId: deviceId ?? null }))
        .then(({ roomId: id, code, myPeerId: peerId }) => {
          setLobbyRoom(id, { myPeerId: peerId, participants: [], roomCode: code });
          // Immediately fire participantsChanged so Discord party info is set
          // before any page navigation (don't wait for WS handshake).
          window.dispatchEvent(new CustomEvent('lobby:participantsChanged', { detail: { participants: [] } }));
          renderInRoom(id, scrollRoot, close, code);
        })
        .catch(() => {
          btn.disabled = false;
          btn.classList.remove('lobby-modal__btn--loading');
          const hint = scrollRoot.querySelector('[data-lobby-hint]') as HTMLElement;
          if (hint) {
            hint.textContent = 'Не удалось создать комнату. Попробуйте ещё раз.';
            hint.classList.add('lobby-modal__join-hint--error');
            hint.hidden = false;
          }
        });
    });

    scrollRoot.querySelector('[data-lobby-join]')?.addEventListener('click', () => {
      const input = scrollRoot.querySelector('[data-lobby-code]') as HTMLInputElement | null;
      const code = input?.value?.trim();
      const hint = scrollRoot.querySelector('[data-lobby-hint]') as HTMLElement;
      if (!code) {
        if (hint) {
          hint.textContent = 'Введите код комнаты';
          hint.classList.add('lobby-modal__join-hint--error');
          hint.hidden = false;
        }
        return;
      }
      const joinBtn = scrollRoot.querySelector('[data-lobby-join]') as HTMLButtonElement;
      joinBtn.disabled = true;
      joinBtn.classList.add('lobby-modal__btn--loading');
      const baseProfile = getProfile();
      const getDeviceId = (window as unknown as { electron?: { getDeviceId?: () => Promise<string> } }).electron?.getDeviceId;
      const deviceIdPromise = typeof getDeviceId === 'function' ? getDeviceId().catch(() => null) : Promise.resolve(null);
      deviceIdPromise
        .then((deviceId) => joinRoom(code, { ...baseProfile, deviceId: deviceId ?? null }))
        .then((room) => {
          setLobbyRoom(room.roomId, {
            myPeerId: room.myPeerId,
            participants: room.participants ?? [],
            playback: room.playback ?? undefined,
            roomCode: room.code,
          });
          renderInRoom(room.roomId, scrollRoot, close, room.code, room.participants);
        })
        .catch(() => {
          joinBtn.disabled = false;
          joinBtn.classList.remove('lobby-modal__btn--loading');
          if (hint) {
            hint.textContent = 'Неверный код или комната не найдена';
            hint.classList.add('lobby-modal__join-hint--error');
            hint.hidden = false;
          }
        });
    });
  }

  // Совместный просмотр на техническом обслуживании — показываем UI но заблокированным
  scrollRoot.innerHTML = `
    <div class="lobby-modal__maintenance-banner">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Техническое обслуживание — функция временно недоступна
    </div>

    <div class="lobby-modal__welcome">
      <div class="lobby-modal__welcome-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polygon points="10 8 16 11 10 14 10 8" fill="currentColor" stroke="none"/></svg>
      </div>
      <p class="lobby-modal__welcome-text">Смотрите аниме вместе с друзьями в реальном времени</p>
    </div>

    <div class="lobby-modal__actions lobby-modal__actions--disabled">
      <button type="button" class="lobby-modal__btn lobby-modal__btn--create" disabled>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Создать комнату
      </button>

      <div class="lobby-modal__divider">
        <span class="lobby-modal__divider-line"></span>
        <span class="lobby-modal__divider-text">или</span>
        <span class="lobby-modal__divider-line"></span>
      </div>

      <div class="lobby-modal__join-group">
        <label class="lobby-modal__join-label">Присоединиться по коду</label>
        <div class="lobby-modal__join-row">
          <input type="text" class="lobby-modal__input" placeholder="ABC123" maxlength="12" disabled />
          <button type="button" class="lobby-modal__btn lobby-modal__btn--join" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            Войти
          </button>
        </div>
      </div>
    </div>
  `;
}


function renderInRoom(
  id: string,
  scrollRoot: HTMLElement,
  onClose: () => void,
  code?: string,
  participants: LobbyParticipant[] = []
): void {
  let destroyed = false;

  scrollRoot.innerHTML = `
    <div class="lobby-modal__room">
      ${code ? `
      <div class="lobby-modal__code-section">
        <div class="lobby-modal__code-header">
          <span class="lobby-modal__code-label">Код комнаты</span>
          <span class="lobby-modal__status" data-lobby-status>
            <span class="lobby-modal__status-dot"></span>
            <span class="lobby-modal__status-text">Подключение...</span>
          </span>
        </div>
        <div class="lobby-modal__code-block">
          <span class="lobby-modal__code-value">${escapeHtml(code)}</span>
          <button type="button" class="lobby-modal__copy-btn" data-lobby-copy title="Скопировать код">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Копировать
          </button>
        </div>
      </div>
      ` : ''}

      <div class="lobby-modal__participants-section">
        <div class="lobby-modal__participants-header">
          <span class="lobby-modal__participants-label">Участники</span>
          <span class="lobby-modal__participants-count" data-lobby-count>${participants.length}</span>
        </div>
        <div class="lobby-modal__participants-list" data-lobby-participants-wrap></div>
      </div>

      <div class="lobby-modal__room-footer">
        <button type="button" class="lobby-modal__btn lobby-modal__btn--leave" data-lobby-leave>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Покинуть
        </button>
        <button type="button" class="lobby-modal__btn lobby-modal__btn--logs" data-lobby-log-toggle>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Логи
        </button>
      </div>

      <div class="lobby-modal__log-section" data-lobby-log-section hidden>
        <div class="lobby-modal__log" data-lobby-log></div>
      </div>
    </div>
  `;

  const participantsWrap = scrollRoot.querySelector('[data-lobby-participants-wrap]') as HTMLElement | null;
  const countEl = scrollRoot.querySelector('[data-lobby-count]') as HTMLElement | null;
  const statusEl = scrollRoot.querySelector('[data-lobby-status]') as HTMLElement | null;

  // Copy code
  if (code) {
    scrollRoot.querySelector('[data-lobby-copy]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(code, e.currentTarget as HTMLElement);
    });
  }

  // Status indicator
  const updateStatus = () => {
    if (!statusEl) return;
    const connected = isConnected();
    const dot = statusEl.querySelector('.lobby-modal__status-dot') as HTMLElement;
    const text = statusEl.querySelector('.lobby-modal__status-text') as HTMLElement;
    if (connected) {
      statusEl.classList.add('lobby-modal__status--connected');
      statusEl.classList.remove('lobby-modal__status--connecting');
      if (dot) dot.style.background = '';
      if (text) text.textContent = 'Подключено';
    } else {
      statusEl.classList.remove('lobby-modal__status--connected');
      statusEl.classList.add('lobby-modal__status--connecting');
      if (text) text.textContent = 'Подключение...';
    }
  };
  updateStatus();
  const statusInterval = setInterval(updateStatus, 2000);

  const renderParticipants = (list: LobbyParticipant[]) => {
    if (!participantsWrap) return;
    if (countEl) countEl.textContent = String(list.length);
    if (list.length === 0) {
      participantsWrap.innerHTML = '<div class="lobby-modal__empty-participants">Ожидание участников...</div>';
      return;
    }
    participantsWrap.innerHTML = list.map((p) => `
      <button type="button" class="lobby-modal__participant" data-profile-id="${escapeHtml(String(p.id))}">
        <div class="lobby-modal__participant-avatar-wrap">
          <span class="lobby-modal__participant-avatar ${p.avatar ? 'lobby-modal__participant-avatar--img' : ''}" ${p.avatar ? `style="background-image:url(${escapeHtml(p.avatar)})"` : ''}></span>
          <span class="lobby-modal__participant-online"></span>
        </div>
        <span class="lobby-modal__participant-name">${escapeHtml(p.login || 'Пользователь')}</span>
      </button>
    `).join('');
    participantsWrap.querySelectorAll('[data-profile-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const profileId = (btn as HTMLElement).dataset.profileId;
        if (profileId) navigate(`/profile/${profileId}`);
      });
    });
  };

  renderParticipants(participants);

  // Leave
  scrollRoot.querySelector('[data-lobby-leave]')?.addEventListener('click', () => {
    const getDeviceId = (window as unknown as { electron?: { getDeviceId?: () => Promise<string> } }).electron?.getDeviceId;
    const deviceIdPromise = typeof getDeviceId === 'function' ? getDeviceId().catch(() => null) : Promise.resolve(null);
    deviceIdPromise
      .then((deviceId) => {
        if (deviceId) return apiLeaveRoom(id, deviceId).catch(() => undefined);
        return undefined;
      })
      .finally(() => {
        cleanupRoom();
        leaveLobby();
        scrollRoot.innerHTML = '';
        openLobbyModal();
      });
  });

  // Logs toggle
  const logBtn = scrollRoot.querySelector('[data-lobby-log-toggle]') as HTMLButtonElement | null;
  const logSection = scrollRoot.querySelector('[data-lobby-log-section]') as HTMLElement | null;
  const logContainer = scrollRoot.querySelector('[data-lobby-log]') as HTMLElement | null;

  let onLogUpdated: (() => void) | null = null;

  if (logBtn && logSection && logContainer) {
    const renderLog = () => {
      const log = getLobbyLog();
      const currentParticipants = getCurrentParticipants();
      if (!log.length) {
        logContainer.innerHTML = '<div class="lobby-modal__log-empty">Пока нет событий</div>';
        return;
      }
      const rows = log.map((entry) => {
        const ts = new Date(entry.ts).toLocaleTimeString();
        let author = '';
        if (entry.fromPeerId) {
          const p = currentParticipants.find((x) => x.peerId === entry.fromPeerId);
          if (p) author = p.login || `ID ${p.id}`;
        } else if (entry.type === 'local-playback') {
          author = 'Вы';
        }
        const playback = entry.playback;
        const pos = playback ? Math.round(playback.currentTime ?? 0) : null;
        const ep = playback?.ep ? `E${playback.ep}` : '';
        const state = playback && typeof playback.paused === 'boolean'
          ? playback.paused ? 'Пауза' : 'Play'
          : '';
        const note = entry.note || '';
        return `
          <div class="lobby-modal__log-item">
            <span class="lobby-modal__log-time">${escapeHtml(ts)}</span>
            ${author ? `<span class="lobby-modal__log-author">${escapeHtml(author)}</span>` : ''}
            <span class="lobby-modal__log-type">${escapeHtml(entry.type)}</span>
            ${state ? `<span class="lobby-modal__log-tag">${escapeHtml(state)}</span>` : ''}
            ${ep ? `<span class="lobby-modal__log-tag">${escapeHtml(ep)}</span>` : ''}
            ${pos != null ? `<span class="lobby-modal__log-tag">${pos}s</span>` : ''}
            ${note ? `<span class="lobby-modal__log-note">${escapeHtml(note)}</span>` : ''}
          </div>
        `;
      }).join('');
      logContainer.innerHTML = rows;
      logContainer.scrollTop = logContainer.scrollHeight;
    };

    logBtn.addEventListener('click', () => {
      const hidden = logSection.hidden;
      if (hidden) {
        renderLog();
        logSection.hidden = false;
        logBtn.classList.add('lobby-modal__btn--active');
      } else {
        logSection.hidden = true;
        logBtn.classList.remove('lobby-modal__btn--active');
      }
    });

    onLogUpdated = () => {
      if (!logSection.hidden) renderLog();
    };
    window.addEventListener('lobby:logUpdated', onLogUpdated as EventListener);
  }

  // Real-time participant updates via WebSocket
  const onWsParticipants = ((e: CustomEvent) => {
    if (destroyed) return;
    const detail = e.detail as { participants?: LobbyParticipant[] } | null;
    const list = detail?.participants ?? [];
    setLobbyParticipants(list);
    renderParticipants(list);
  }) as EventListener;
  window.addEventListener('lobby:participantsChanged', onWsParticipants);

  // Fallback polling
  const POLL_INTERVAL_MS = 10000;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  // Cleanup: stop all timers and event listeners without closing the modal.
  // Called both on modal close (X/Escape/outside) and on explicit "Покинуть".
  const cleanupRoom = () => {
    if (destroyed) return;
    destroyed = true;
    stopPolling();
    clearInterval(statusInterval);
    window.removeEventListener('lobby:participantsChanged', onWsParticipants);
    if (onLogUpdated) {
      window.removeEventListener('lobby:logUpdated', onLogUpdated as EventListener);
      onLogUpdated = null;
    }
  };

  const startPolling = () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (destroyed) return;
      getRoom(id)
        .then((room) => {
          if (destroyed) return;
          const list = room.participants ?? [];
          setLobbyParticipants(list);
          renderParticipants(list);
        })
        .catch((err: unknown) => {
          // Room gone on server (404) — stop everything and close the modal
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('404') && !destroyed) {
            console.warn('[lobby] room 404 in poll, leaving lobby');
            cleanupRoom();
            leaveLobby();
            onClose();
          }
        });
    }, POLL_INTERVAL_MS);
  };

  startPolling();

  // Register cleanup so openLobbyModal's close() can call it on X/Escape/outside-click
  (scrollRoot as unknown as { _lobbyOnClose?: () => void })._lobbyOnClose = cleanupRoom;
}
