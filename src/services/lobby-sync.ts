/**
 * Лобби: WebSocket + P2P (WebRTC DataChannel), очередь команд, NTP-смещение по P2P.
 */

import { getRoom, type LobbyPlayback, type LobbyParticipant, type LobbyRoom } from './lobby-api';
import { connect, disconnect, sendCommand, sendSyncReady, sendProposal, sendVote, sendBufferingStart, type LobbyCommandAction } from './lobby-ws';

export type { LobbyCommandAction } from './lobby-ws';
import {
  startLobbyRtc,
  stopLobbyRtc,
  updateLobbyRtcPeers,
  broadcastSyncCommand,
  hasP2PSync,
  getClockOffsets,
  type RemoteSyncPayload,
} from './lobby-rtc';

let roomId: string | null = null;
let roomCode: string | null = null;
let myPeerId: string | null = null;
let participants: LobbyParticipant[] = [];
let lastPlayback: LobbyPlayback | null = null;
let roomHasPlayback = false;
let hasAuthoritativePlayback = false;
let isSyncBlocked = false;
let syncReadyTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProposalId: string | null = null;
/** Ждём seeked+canplay в плеере перед sync_ready / снятием блока. */
let awaitingPlayerSync = false;

type QueuedCmd = { action: LobbyCommandAction; playback: LobbyPlayback };
const pendingOutbound: QueuedCmd[] = [];

function flushOutboundQueue(): void {
  while (pendingOutbound.length > 0) {
    if (roomHasPlayback && !hasAuthoritativePlayback) break;
    if (isSyncBlocked) break;
    const next = pendingOutbound.shift();
    if (!next) break;
    const { action, playback } = next;
    const isAnimeChange =
      lastPlayback && playback.releaseId && lastPlayback.releaseId !== playback.releaseId;
    if (isAnimeChange && participants.length > 1) continue;
    lastPlayback = playback;
    pushLog({
      ts: Date.now(),
      type: 'local-playback',
      playback,
      note: `command=${action}`,
    });
    sendCommandOrP2p(action, playback);
  }
}

function sendCommandOrP2p(action: LobbyCommandAction, playback: LobbyPlayback): void {
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
  if (hasP2PSync()) broadcastSyncCommand(action, playback);
  else sendCommand(action, payload);
}

function startP2pIfNeeded(): void {
  if (!roomId || !myPeerId) return;
  startLobbyRtc(roomId, myPeerId, participants, onP2pRemoteSync);
}

function onP2pRemoteSync(p: RemoteSyncPayload): void {
  const { action, playback, fromPeerId, executeAt } = p;
  const off = getClockOffsets().offsetFromPeerMs(fromPeerId);
  const localAt = executeAt + off;
  const delay = Math.max(0, localAt - Date.now());
  window.setTimeout(() => {
    dispatchRemotePlayback(playback, fromPeerId, action);
  }, delay);
}

function handleParticipantsUpdate(list: LobbyParticipant[]): void {
  const prevIds = new Set(participants.map(p => String(p.peerId ?? p.id)));
  const newIds = new Set(list.map(p => String(p.peerId ?? p.id)));

  for (const p of list) {
    const id = String(p.peerId ?? p.id);
    if (!prevIds.has(id) && id !== myPeerId) {
      window.dispatchEvent(new CustomEvent('lobby:activityEvent', {
        detail: { type: 'joined', login: p.login, avatar: p.avatar ?? null, peerId: p.peerId ?? null },
      }));
    }
  }
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
  updateLobbyRtcPeers(participants);
}

window.addEventListener('lobby:authoritativeConfirmed', () => {
  hasAuthoritativePlayback = true;
  if (roomId && !lastPlayback) {
    getRoom(roomId).then((room) => {
      if (room.playback && room.playback.releaseId && !lastPlayback) {
        console.log('[lobby] authoritativeConfirmed fallback: got playback from HTTP', room.playback.releaseId);
        dispatchInitialPlayback(room.playback);
      }
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404') && roomId) {
        console.warn('[lobby] room 404 after WS join, stopping reconnects');
        leaveLobby();
        window.dispatchEvent(new CustomEvent('lobby:roomGone'));
      }
    });
  }
});

window.addEventListener('lobby:syncNeeded', () => {
  isSyncBlocked = true;
  awaitingPlayerSync = true;
  if (syncReadyTimer) {
    clearTimeout(syncReadyTimer);
    syncReadyTimer = null;
  }
  // Не показываем полноэкранное «ожидание» при входе — синхронизация идёт в фоне до sync_ready.
});

window.addEventListener('lobby:playerSynced', () => {
  if (!awaitingPlayerSync) return;
  awaitingPlayerSync = false;
  if (syncReadyTimer) {
    clearTimeout(syncReadyTimer);
    syncReadyTimer = null;
  }
  isSyncBlocked = false;
  sendSyncReady();
  flushOutboundQueue();
  window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', { detail: null }));
  console.log('[lobby] sync_ready after player seeked+canplay');
});

/** Вызывать из главного окна перед сменой качества/озвучки в лобби (или через IPC из окна плеера). */
export function notifyLobbyBufferingStart(): void {
  if (!roomId) return;
  awaitingPlayerSync = true;
  isSyncBlocked = true;
  sendBufferingStart();
  window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', { detail: { mode: 'localBuffering' } }));
}

window.addEventListener('lobby:syncPause', () => {
  isSyncBlocked = true;
  console.log('[lobby] sync_pause: blocked commands until resume');
});

window.addEventListener('lobby:syncResume', () => {
  isSyncBlocked = false;
  awaitingPlayerSync = false;
  if (syncReadyTimer) {
    clearTimeout(syncReadyTimer);
    syncReadyTimer = null;
  }
  flushOutboundQueue();
  console.log('[lobby] sync_resume: unblocked commands');
});

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

  if (isFirstAuthoritative) {
    isSyncBlocked = true;
    awaitingPlayerSync = true;
    if (syncReadyTimer) {
      clearTimeout(syncReadyTimer);
      syncReadyTimer = null;
    }
  }

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
  console.log('[lobby] playback', {
    releaseId: playback.releaseId,
    ep: playback.ep,
    fromPeerId: meta.fromPeerId,
  });
  window.dispatchEvent(new CustomEvent('lobby:remotePlayback', { detail: meta }));
}

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

export function getCurrentRoomCode(): string | null {
  return roomCode;
}

export function setLobbyRoom(
  id: string | null,
  options?: { myPeerId?: string; participants?: LobbyRoom['participants']; playback?: LobbyRoom['playback']; roomCode?: string }
): void {
  if (roomId) {
    stopLobbyRtc();
    disconnect();
  }
  pendingOutbound.length = 0;
  roomId = id;
  roomCode = options?.roomCode ?? null;
  myPeerId = options?.myPeerId ?? null;
  participants = options?.participants ? options.participants.slice() : [];
  lastPlayback = null;
  roomHasPlayback = !!options?.playback;
  hasAuthoritativePlayback = false;
  isSyncBlocked = false;
  pendingProposalId = null;
  awaitingPlayerSync = false;
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
    startP2pIfNeeded();
    if (options?.playback) {
      dispatchInitialPlayback(options.playback);
    }
  }
}

export function pushCommand(action: LobbyCommandAction, playback: LobbyPlayback): void {
  if (!roomId) return;
  if (roomHasPlayback && !hasAuthoritativePlayback) {
    pendingOutbound.push({ action, playback });
    return;
  }
  if (isSyncBlocked) {
    pendingOutbound.push({ action, playback });
    return;
  }

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
  sendCommandOrP2p(action, playback);
}

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

export function getLastPlayback(): LobbyPlayback | null {
  return lastPlayback ? { ...lastPlayback } : null;
}

export function voteOnProposal(proposalId: string, accept: boolean): void {
  sendVote(proposalId, accept);
}

export function getPendingProposalId(): string | null {
  return pendingProposalId;
}

export function getLobbyMyPeerId(): string | null {
  return myPeerId;
}

export function leaveLobby(): void {
  stopLobbyRtc();
  disconnect();
  if (roomId) {
    pushLog({
      ts: Date.now(),
      type: 'leave',
      note: `Выход из комнаты ${roomId}`,
    });
    window.dispatchEvent(new CustomEvent('lobby:left'));
  }
  roomId = null;
  roomCode = null;
  myPeerId = null;
  participants = [];
  lastPlayback = null;
  isSyncBlocked = false;
  pendingProposalId = null;
  awaitingPlayerSync = false;
  pendingOutbound.length = 0;
  if (syncReadyTimer) {
    clearTimeout(syncReadyTimer);
    syncReadyTimer = null;
  }
}
