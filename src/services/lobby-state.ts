/**
 * Состояние лобби: только WebSocket через сервер. Прямое соединение, ретрансляция playback через сервер.
 */

import { getRoom, type LobbyPlayback, type LobbyParticipant, type LobbyRoom } from './lobby-api';
import { connect, disconnect, sendCommand, sendSyncReady, sendProposal, sendVote, type LobbyCommandAction } from './lobby-ws';

let roomId: string | null = null;
let myPeerId: string | null = null;
let participants: LobbyParticipant[] = [];
let lastPlayback: LobbyPlayback | null = null;
let roomHasPlayback = false;
let hasAuthoritativePlayback = false;
/** Блокирует исходящие команды пока идёт sync-пауза (новый участник загружает видео). */
let isSyncBlocked = false;
let syncReadyTimer: ReturnType<typeof setTimeout> | null = null;

/** ID активного предложения смены аниме (если мы предложили). */
let pendingProposalId: string | null = null;

function handleParticipantsUpdate(list: LobbyParticipant[]): void {
  const prevIds = new Set(participants.map(p => String(p.peerId ?? p.id)));
  const newIds  = new Set(list.map(p => String(p.peerId ?? p.id)));

  // Участники, которые только что вошли
  for (const p of list) {
    const id = String(p.peerId ?? p.id);
    if (!prevIds.has(id) && id !== myPeerId) {
      window.dispatchEvent(new CustomEvent('lobby:activityEvent', {
        detail: { type: 'joined', login: p.login, avatar: p.avatar ?? null, peerId: p.peerId ?? null },
      }));
    }
  }
  // Участники, которые вышли
  for (const p of participants) {
    const id = String(p.peerId ?? p.id);
    if (!newIds.has(id)) {
      window.dispatchEvent(new CustomEvent('lobby:activityEvent', {
        detail: { type: 'left', login: p.login, avatar: p.avatar ?? null, peerId: p.peerId ?? null },
      }));
    }
  }

  participants = list.slice();
  window.dispatchEvent(new CustomEvent('lobby:participantsChanged', { detail: { participants: list } }));
}

// When server confirms join but room has no playback yet,
// unblock local commands so the first user can start watching.
// Fallback: in case the HTTP join or WS joined didn't include current playback,
// fetch it from the server directly so the new participant's player can open.
window.addEventListener('lobby:authoritativeConfirmed', () => {
  hasAuthoritativePlayback = true;
  // If we still have no playback state, the HTTP join and WS joined both had no playback.
  // Do one extra HTTP fetch to catch any playback the backend stores but didn't return.
  if (roomId && !lastPlayback) {
    getRoom(roomId).then((room) => {
      if (room.playback && room.playback.releaseId && !lastPlayback) {
        console.log('[lobby] authoritativeConfirmed fallback: got playback from HTTP', room.playback.releaseId);
        dispatchInitialPlayback(room.playback);
      }
    }).catch(() => {});
  }
});

// Server told us we need to send sync_ready after our player loads.
// Give the player a few seconds to load/seek, then confirm.
window.addEventListener('lobby:syncNeeded', () => {
  isSyncBlocked = true;
  if (syncReadyTimer) clearTimeout(syncReadyTimer);
  // Wait for the player to apply sync (seek to correct position),
  // then tell the server we're ready to resume.
  syncReadyTimer = setTimeout(() => {
    syncReadyTimer = null;
    isSyncBlocked = false;
    sendSyncReady();
    console.log('[lobby] sent sync_ready to server');
  }, 4000);
});

// Server paused everyone because a new user joined — block commands.
window.addEventListener('lobby:syncPause', () => {
  isSyncBlocked = true;
  console.log('[lobby] sync_pause: blocked commands until resume');
});

// Server resumed playback after sync — unblock commands.
window.addEventListener('lobby:syncResume', () => {
  isSyncBlocked = false;
  if (syncReadyTimer) {
    clearTimeout(syncReadyTimer);
    syncReadyTimer = null;
  }
  console.log('[lobby] sync_resume: unblocked commands');
});

// ── Proposal events ──

// Пришло предложение от другого участника — показываем в логе
window.addEventListener('lobby:proposalNew', ((e: CustomEvent) => {
  const { proposerLogin, proposerPeerId } = e.detail ?? {};
  if (proposerLogin && proposerPeerId !== myPeerId) {
    const actor = participants.find(p => String(p.peerId ?? p.id) === proposerPeerId);
    window.dispatchEvent(new CustomEvent('lobby:activityEvent', {
      detail: { type: 'proposal', login: actor?.login ?? proposerLogin, avatar: actor?.avatar ?? null, peerId: proposerPeerId ?? null },
    }));
  }
}) as EventListener);

window.addEventListener('lobby:proposalCreated', ((e: CustomEvent) => {
  pendingProposalId = e.detail?.proposalId ?? null;
  console.log('[lobby] our proposal created:', pendingProposalId);
}) as EventListener);

window.addEventListener('lobby:proposalAccepted', ((e: CustomEvent) => {
  pendingProposalId = null;
  const playback = e.detail?.playback;
  if (playback) {
    lastPlayback = playback;
  }
  console.log('[lobby] proposal accepted, anime will change for everyone');
}) as EventListener);

window.addEventListener('lobby:proposalRejected', ((e: CustomEvent) => {
  pendingProposalId = null;
  console.log('[lobby] proposal rejected:', e.detail?.reason);
}) as EventListener);

type LobbyLogEventType = 'join' | 'leave' | 'local-playback' | 'remote-playback';

export interface LobbyLogEvent {
  ts: number;
  type: LobbyLogEventType;
  playback?: LobbyPlayback;
  fromPeerId?: string | null;
  note?: string;
}

const lobbyLog: LobbyLogEvent[] = [];
const MAX_LOBBY_LOG_ITEMS = 200;

function pushLog(entry: LobbyLogEvent): void {
  lobbyLog.push(entry);
  if (lobbyLog.length > MAX_LOBBY_LOG_ITEMS) {
    lobbyLog.splice(0, lobbyLog.length - MAX_LOBBY_LOG_ITEMS);
  }
  window.dispatchEvent(new CustomEvent('lobby:logUpdated'));
}

export function getLobbyLog(): LobbyLogEvent[] {
  return lobbyLog.slice();
}

export function getCurrentRoomId(): string | null {
  return roomId;
}

export function getCurrentParticipants(): LobbyParticipant[] {
  return participants.slice();
}

export function setLobbyParticipants(list: LobbyParticipant[]): void {
  participants = list.slice();
}

function dispatchRemotePlayback(playback: LobbyPlayback, fromPeerId?: string | null, action?: string | null): void {
  const isFirstAuthoritative = !hasAuthoritativePlayback && roomHasPlayback;
  lastPlayback = playback;
  hasAuthoritativePlayback = true;

  // При первом авторитативном sync (мы только что зашли в комнату где уже шёл просмотр)
  // блокируем исходящие команды на 5 секунд. Это даёт время плееру загрузить видео
  // и перемотать на нужный момент. Без этого play event с currentTime=0 отправляется
  // на сервер и ломает просмотр остальным.
  if (isFirstAuthoritative) {
    isSyncBlocked = true;
    if (syncReadyTimer) clearTimeout(syncReadyTimer);
    syncReadyTimer = setTimeout(() => {
      syncReadyTimer = null;
      isSyncBlocked = false;
      sendSyncReady();
      console.log('[lobby] initial sync block released, sent sync_ready');
    }, 5000);
  }

  // Отправляем событие активности в плеер (для лога действий)
  if (fromPeerId && action && fromPeerId !== myPeerId) {
    const actionTypes = ['play', 'pause', 'seek', 'changeEpisode'];
    if (actionTypes.includes(action)) {
      const actor = participants.find(p => String(p.peerId ?? p.id) === fromPeerId);
      if (actor) {
        window.dispatchEvent(new CustomEvent('lobby:activityEvent', {
          detail: { type: action, login: actor.login, avatar: actor.avatar ?? null, peerId: fromPeerId },
        }));
      }
    }
  }

  pushLog({
    ts: Date.now(),
    type: 'remote-playback',
    playback,
    fromPeerId: fromPeerId ?? null,
  });
  const meta = {
    playback,
    fromPeerId: fromPeerId ?? null,
  };
  console.log('[lobby] playback по WS', {
    releaseId: playback.releaseId,
    ep: playback.ep,
    fromPeerId: meta.fromPeerId,
  });
  window.dispatchEvent(new CustomEvent('lobby:remotePlayback', { detail: meta }));
}

// Первоначальный playback, который приходит сразу после joinRoom по HTTP.
// Он нужен для мгновенной синхронизации UI, но НЕ считается authoritative
// до тех пор, пока не придёт playback по WebSocket.
function dispatchInitialPlayback(playback: LobbyPlayback): void {
  lastPlayback = playback;
  pushLog({
    ts: Date.now(),
    type: 'remote-playback',
    playback,
    note: 'initial-http',
  });
  const meta = {
    playback,
    fromPeerId: null as string | null,
  };
  console.log('[lobby] initial playback по HTTP', {
    releaseId: playback.releaseId,
    ep: playback.ep,
  });
  window.dispatchEvent(new CustomEvent('lobby:remotePlayback', { detail: meta }));
}

export function setLobbyRoom(
  id: string | null,
  options?: { myPeerId?: string; participants?: LobbyRoom['participants']; playback?: LobbyRoom['playback'] }
): void {
  if (roomId) disconnect();
  roomId = id;
  myPeerId = options?.myPeerId ?? null;
  participants = options?.participants ? options.participants.slice() : [];
  lastPlayback = null;
  roomHasPlayback = !!options?.playback;
  hasAuthoritativePlayback = false;
  isSyncBlocked = false;
  pendingProposalId = null;
  if (syncReadyTimer) {
    clearTimeout(syncReadyTimer);
    syncReadyTimer = null;
  }
  if (roomId) {
    pushLog({
      ts: Date.now(),
      type: 'join',
      note: `Вход в комнату ${roomId}`,
    });
  }
  if (roomId) {
    connect(roomId, dispatchRemotePlayback, myPeerId ?? undefined, handleParticipantsUpdate);
    if (options?.playback) {
      // Мгновенно синхронизируемся с текущим состоянием комнаты,
      // чтобы новый участник не ломал просмотр старым, но пока
      // НЕ разблокируем локальные команды до authoritative sync по WS.
      dispatchInitialPlayback(options.playback);
    }
  }
}

export function pushCommand(action: LobbyCommandAction, playback: LobbyPlayback): void {
  if (!roomId) return;
  // Если в комнате уже был playback до нашего входа, но мы ещё не получили authoritative sync,
  // игнорируем локальные команды, чтобы не перезаписывать состояние для остальных.
  if (roomHasPlayback && !hasAuthoritativePlayback) return;
  // Блокируем команды во время sync-паузы (кто-то присоединяется).
  if (isSyncBlocked) return;

  const payload: Partial<LobbyPlayback> = {
    releaseId: playback.releaseId,
    sourceId: playback.sourceId,
    ep: playback.ep,
    dubberId: playback.dubberId,
    title: playback.title,
    sourceName: playback.sourceName,
    paused: playback.paused,
    currentTime: playback.currentTime,
  };

  // Если меняется аниме (другой releaseId) и в комнате больше одного участника —
  // блокируем команду: смена аниме должна идти через кнопку "Предложить" в watch-modal.
  const isAnimeChange = lastPlayback && playback.releaseId && lastPlayback.releaseId !== playback.releaseId;
  if (isAnimeChange && participants.length > 1) {
    console.log('[lobby] anime change blocked in pushCommand — use proposeAnimeChange() via watch-modal instead');
    return;
  }

  lastPlayback = playback;
  pushLog({
    ts: Date.now(),
    type: 'local-playback',
    playback,
    note: `command=${action}`,
  });
  sendCommand(action, payload);
}

/** Отправить предложение смены аниме напрямую (без изменения плеера). */
export function proposeAnimeChange(playback: Partial<LobbyPlayback>): void {
  if (!roomId) return;
  if (pendingProposalId) {
    console.log('[lobby] proposal already pending, ignoring duplicate');
    return;
  }
  console.log('[lobby] proposing anime change directly:', playback.releaseId);
  pushLog({
    ts: Date.now(),
    type: 'local-playback',
    playback: playback as LobbyPlayback,
    note: 'proposal-sent-direct',
  });
  sendProposal(playback);
}

/** Возвращает последний известный playback (текущее состояние комнаты). */
export function getLastPlayback(): LobbyPlayback | null {
  return lastPlayback ? { ...lastPlayback } : null;
}

/** Отправить голос за предложение. */
export function voteOnProposal(proposalId: string, accept: boolean): void {
  sendVote(proposalId, accept);
}

export function getPendingProposalId(): string | null {
  return pendingProposalId;
}

export function leaveLobby(): void {
  disconnect();
  if (roomId) {
    pushLog({
      ts: Date.now(),
      type: 'leave',
      note: `Выход из комнаты ${roomId}`,
    });
  }
  roomId = null;
  myPeerId = null;
  participants = [];
  lastPlayback = null;
  isSyncBlocked = false;
  pendingProposalId = null;
  if (syncReadyTimer) {
    clearTimeout(syncReadyTimer);
    syncReadyTimer = null;
  }
}
