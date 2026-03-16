/**
 * Состояние лобби: только WebSocket через сервер. Прямое соединение, ретрансляция playback через сервер.
 */

import type { LobbyPlayback, LobbyParticipant, LobbyRoom } from './lobby-api';
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
  participants = list.slice();
  window.dispatchEvent(new CustomEvent('lobby:participantsChanged', { detail: { participants: list } }));
}

// When server confirms join but room has no playback yet,
// unblock local commands so the first user can start watching.
window.addEventListener('lobby:authoritativeConfirmed', () => {
  hasAuthoritativePlayback = true;
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

function dispatchRemotePlayback(playback: LobbyPlayback, fromPeerId?: string | null): void {
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
  // отправляем предложение вместо прямой команды.
  const isAnimeChange = lastPlayback && playback.releaseId && lastPlayback.releaseId !== playback.releaseId;
  if (isAnimeChange && participants.length > 1) {
    // Не отправляем повторное предложение, если уже есть активное
    if (pendingProposalId) {
      console.log('[lobby] proposal already pending, ignoring duplicate anime change');
      return;
    }
    console.log('[lobby] anime change detected, sending proposal instead of command', {
      from: lastPlayback?.releaseId,
      to: playback.releaseId,
    });
    pushLog({
      ts: Date.now(),
      type: 'local-playback',
      playback,
      note: 'proposal-sent',
    });
    // Сохраняем старый playback для реверта плеера
    const oldPlayback = lastPlayback ? { ...lastPlayback } : null;
    sendProposal(payload);
    // Говорим приложению: "откати плеер обратно на старое аниме и покажи ожидание голосов"
    window.dispatchEvent(new CustomEvent('lobby:proposalSentLocal', {
      detail: {
        oldPlayback,
        newPlayback: playback,
      },
    }));
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
