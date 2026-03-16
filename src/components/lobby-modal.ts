/**
 * Модальное окно лобби: создать комнату, присоединиться по коду, участники (аватар + ник, переход в профиль).
 */

import { navigate } from '../app';
import { renderPage } from './page';
import { createRoom, joinRoom, getRoom, type LobbyParticipant, type LobbyRoom } from '../services/lobby-api';
import { setLobbyRoom, leaveLobby, getCurrentRoomId } from '../services/lobby-state';

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

export function openLobbyModal(): void {
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
      <h2 class="lobby-modal__title">Совместный просмотр</h2>
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
  let onDocumentClick: ((e: MouseEvent) => void) | null = null;

  function close() {
    if (closed) return;
    closed = true;
    overlay.classList.remove('lobby-modal-overlay--open');
    overlay.classList.add('lobby-modal-overlay--closing');
    const done = () => {
      if (!overlay.parentNode) return;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (onDocumentClick) {
        document.removeEventListener('click', onDocumentClick, true);
        onDocumentClick = null;
      }
      (overlay as unknown as { _close?: () => void })._close = undefined;
    };
    overlay.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 260);
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  panel.querySelector('.lobby-modal__close')?.addEventListener('click', close);

  onDocumentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && panel.contains(target)) return;
    close();
  };
  document.addEventListener('click', onDocumentClick, true);

  (overlay as unknown as { _close?: () => void })._close = close;

  function renderInitial() {
    const currentRoomId = getCurrentRoomId();
    if (currentRoomId) {
      scrollRoot.innerHTML = '<div class="lobby-modal__loading">Загрузка…</div>';
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
      <div class="lobby-modal__section">
        <button type="button" class="lobby-modal__btn lobby-modal__btn--primary" data-lobby-create>Создать комнату</button>
      </div>
      <div class="lobby-modal__section">
        <label class="lobby-modal__label">Присоединиться по коду</label>
        <div class="lobby-modal__join-row">
          <input type="text" class="lobby-modal__input" data-lobby-code placeholder="Код комнаты" maxlength="12" />
          <button type="button" class="lobby-modal__btn" data-lobby-join>Войти</button>
        </div>
      </div>
    `;
    scrollRoot.querySelector('[data-lobby-create]')?.addEventListener('click', () => {
      createRoom(getProfile())
        .then(({ roomId: id, code, myPeerId: peerId }) => {
          setLobbyRoom(id, { myPeerId: peerId, participants: [] });
          renderInRoom(id, scrollRoot, close, code);
        })
        .catch(() => {
          const btn = scrollRoot.querySelector('[data-lobby-create]');
          if (btn) btn.textContent = 'Ошибка. Повторить?';
        });
    });
    scrollRoot.querySelector('[data-lobby-join]')?.addEventListener('click', () => {
      const input = scrollRoot.querySelector('[data-lobby-code]') as HTMLInputElement | null;
      const code = input?.value?.trim();
      if (!code) return;
      joinRoom(code, getProfile())
        .then((room) => {
          setLobbyRoom(room.roomId, { myPeerId: room.myPeerId, participants: room.participants ?? [] });
          renderInRoom(room.roomId, scrollRoot, close, room.code, room.participants);
        })
        .catch(() => {
          (scrollRoot.querySelector('[data-lobby-join]') as HTMLElement).textContent = 'Неверный код';
        });
    });
  }

  renderInitial();
}

function renderInRoom(
  id: string,
  scrollRoot: HTMLElement,
  onClose: () => void,
  code?: string,
  participants: LobbyParticipant[] = []
): void {
  const codeBlock = code
    ? `<div class="lobby-modal__section">
        <label class="lobby-modal__label">Код комнаты</label>
        <div class="lobby-modal__code">${escapeHtml(code)}</div>
      </div>`
    : '';

  const participantsHtml =
    participants.length > 0
      ? `
      <div class="lobby-modal__section">
        <label class="lobby-modal__label">Участники</label>
        <div class="lobby-modal__participants" data-lobby-participants>
          ${participants
            .map(
              (p) => `
            <button type="button" class="lobby-modal__participant" data-profile-id="${escapeHtml(String(p.id))}">
              <span class="lobby-modal__participant-avatar ${p.avatar ? 'lobby-modal__participant-avatar--img' : ''}" ${p.avatar ? `style="background-image:url(${escapeHtml(p.avatar)})"` : ''}></span>
              <span class="lobby-modal__participant-name">${escapeHtml(p.login || 'Пользователь')}</span>
            </button>
          `
            )
            .join('')}
        </div>
      </div>`
      : '<div class="lobby-modal__section"><p class="lobby-modal__muted">Загрузка участников…</p></div>';

  scrollRoot.innerHTML = `
    ${codeBlock}
    ${participantsHtml}
    <div class="lobby-modal__section">
      <button type="button" class="lobby-modal__btn lobby-modal__btn--outline" data-lobby-leave>Покинуть комнату</button>
    </div>
  `;

  scrollRoot.querySelector('[data-lobby-leave]')?.addEventListener('click', () => {
    leaveLobby();
    scrollRoot.innerHTML = '';
    openLobbyModal(); // re-open to show create/join again
  });

  scrollRoot.querySelectorAll('[data-profile-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const profileId = (btn as HTMLElement).dataset.profileId;
      if (profileId) navigate(`/profile/${profileId}`);
    });
  });
}
