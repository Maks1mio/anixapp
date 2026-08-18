/**
 * Лобби: WebSocket + P2P (WebRTC DataChannel), очередь команд, NTP-смещение по P2P.
 */

import { getRoom, isUsablePlayback, type LobbyPlayback, type LobbyParticipant, type LobbyRoom } from './lobby-api';
import { connect, disconnect, sendCommand, sendSyncReady, sendProposal, sendVote, sendBufferingStart, sendChat, type LobbyCommandAction } from './lobby-ws';
import { logLobbyAction, snapshotPlayback } from './lobby-action-log';

export type { LobbyCommandAction } from './lobby-ws';
import {
  startLobbyRtc,
  stopLobbyRtc,
  updateLobbyRtcPeers,
  broadcastSyncCommand,
  broadcastChat,
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
/** Локально инициировали buffering_start — не сбрасывать awaitingPlayerSync на чужой sync_resume. */
let localBufferingPending = false;
let lastAppliedSeq = 0;

const SYNC_STALL_MS = 8_000;
const PLAY_PAUSE_DEBOUNCE_MS = 70;

function isPlayerRenderer(): boolean {
  try {
    const path = String(window.location?.pathname ?? '');
    return /player\.html$/i.test(path) || path.endsWith('/player');
  } catch {
    return false;
  }
}

function isLobbyHostWindow(): boolean {
  return !!roomId && !isPlayerRenderer();
}

function pushSyncStateToPlayer(): void {
  const state = { blocked: isSyncBlocked, awaiting: awaitingPlayerSync };
  window.dispatchEvent(new CustomEvent('lobby:syncState', { detail: state }));
  if (!isLobbyHostWindow()) return;
  try {
    (window as { electron?: { sendLobbySyncStateToPlayer?: (s: { blocked: boolean; awaiting: boolean }) => void } }).electron
      ?.sendLobbySyncStateToPlayer?.(state);
  } catch { /* ignore */ }
}

export function pushLobbySyncStateToPlayer(): void {
  pushSyncStateToPlayer();
}

function scheduleSyncStallWatchdog(reason: string): void {
  if (syncReadyTimer) clearTimeout(syncReadyTimer);
  syncReadyTimer = setTimeout(() => {
    syncReadyTimer = null;
    if (!awaitingPlayerSync && !isSyncBlocked) return;
    console.warn('[lobby] sync stall timeout:', reason);
    logLobbyAction({
      origin: 'local',
      action: 'sync.stall_timeout',
      note: reason,
    });
    awaitingPlayerSync = false;
    isSyncBlocked = false;
    sendSyncReady();
    flushOutboundQueue();
    flushPlayPauseNow();
    pushSyncStateToPlayer();
    window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', { detail: null }));
  }, SYNC_STALL_MS);
}

function clearSyncStallWatchdog(): void {
  if (syncReadyTimer) {
    clearTimeout(syncReadyTimer);
    syncReadyTimer = null;
  }
}

function dedupeParticipants(list: LobbyParticipant[]): LobbyParticipant[] {
  const byPeer = new Map<string, LobbyParticipant>();
  for (const p of list) {
    const id = String(p.peerId ?? p.id);
    byPeer.set(id, p);
  }
  return [...byPeer.values()];
}

type QueuedCmd = { action: LobbyCommandAction; playback: LobbyPlayback };
const pendingOutbound: QueuedCmd[] = [];
let playPauseTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPlayPause: QueuedCmd | null = null;

function dedupePendingOutbound(): void {
  const latest = new Map<LobbyCommandAction, QueuedCmd>();
  for (const cmd of pendingOutbound) {
    latest.set(cmd.action, cmd);
  }
  pendingOutbound.length = 0;
  for (const cmd of latest.values()) pendingOutbound.push(cmd);
}

function queueOutbound(action: LobbyCommandAction, playback: LobbyPlayback): void {
  const playPause = action === 'play' || action === 'pause';
  for (let i = pendingOutbound.length - 1; i >= 0; i--) {
    const a = pendingOutbound[i]!.action;
    if (a === action || (playPause && (a === 'play' || a === 'pause'))) {
      pendingOutbound.splice(i, 1);
    }
  }
  pendingOutbound.push({ action, playback });
}

function flushOutboundQueue(): void {
  dedupePendingOutbound();
  const next = pendingOutbound.shift();
  if (!next) return;
  if (roomHasPlayback && !hasAuthoritativePlayback) {
    pendingOutbound.unshift(next);
    return;
  }
  const { action, playback } = next;
  if (isSyncBlocked && action !== 'seek' && action !== 'changeEpisode') {
    pendingOutbound.unshift(next);
    return;
  }
  const isAnimeChange =
    lastPlayback && playback.releaseId && lastPlayback.releaseId !== playback.releaseId;
  if (isAnimeChange && participants.length > 1) return;
  lastPlayback = playback;
  pushLog({
    ts: Date.now(),
    type: 'local-playback',
    playback,
    note: `command=${action}`,
  });
  sendCommandOrP2p(action, playback);
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
  const viaP2p = hasP2PSync() && participants.length <= 1;
  if (viaP2p) broadcastSyncCommand(action, playback);
  else sendCommand(action, payload);
}

function emitLocalCommand(action: LobbyCommandAction, playback: LobbyPlayback): void {
  lastPlayback = playback;
  pushLog({
    ts: Date.now(),
    type: 'local-playback',
    playback,
    note: `command=${action}`,
  });
  sendCommandOrP2p(action, playback);
}

function flushPlayPauseNow(): void {
  if (playPauseTimer) {
    clearTimeout(playPauseTimer);
    playPauseTimer = null;
  }
  const cmd = pendingPlayPause;
  pendingPlayPause = null;
  if (!cmd || !roomId) return;
  emitLocalCommand(cmd.action, cmd.playback);
}

function schedulePlayPause(action: LobbyCommandAction, playback: LobbyPlayback): void {
  pendingPlayPause = { action, playback };
  lastPlayback = playback;
  if (playPauseTimer) clearTimeout(playPauseTimer);
  playPauseTimer = setTimeout(() => {
    playPauseTimer = null;
    const cmd = pendingPlayPause;
    pendingPlayPause = null;
    if (!cmd || !roomId) return;
    emitLocalCommand(cmd.action, cmd.playback);
  }, PLAY_PAUSE_DEBOUNCE_MS);
}

function startP2pIfNeeded(): void {
  if (!roomId || !myPeerId) return;
  startLobbyRtc(roomId, myPeerId, participants, onP2pRemoteSync);
}

function onP2pRemoteSync(p: RemoteSyncPayload): void {
  if (participants.length > 1) return;
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

  participants = dedupeParticipants(list.slice());
  window.dispatchEvent(new CustomEvent('lobby:participantsChanged', { detail: { participants } }));
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

window.addEventListener('lobby:wsJoined', () => {
  if (!lastPlayback || !isUsablePlayback(lastPlayback)) return;
  if (!hasAuthoritativePlayback) return;
  sendCommandOrP2p(lastPlayback.paused ? 'pause' : 'play', lastPlayback);
});

window.addEventListener('lobby:syncNeeded', () => {
  isSyncBlocked = true;
  awaitingPlayerSync = true;
  clearSyncStallWatchdog();
  scheduleSyncStallWatchdog('syncNeeded');
  pushSyncStateToPlayer();
});

window.addEventListener('lobby:playerSynced', ((e: Event) => {
  if (!awaitingPlayerSync && !isSyncBlocked) return;
  awaitingPlayerSync = false;
  localBufferingPending = false;
  clearSyncStallWatchdog();
  isSyncBlocked = false;
  const liveTime = (e as CustomEvent<{ currentTime?: number }>).detail?.currentTime;
  sendSyncReady(typeof liveTime === 'number' ? liveTime : undefined);
  flushOutboundQueue();
  flushPlayPauseNow();
  pushSyncStateToPlayer();
  window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', { detail: null }));
  console.log('[lobby] sync_ready after player seeked+canplay');
}) as EventListener);

/** Вызывать из главного окна перед сменой качества/озвучки в лобби (или через IPC из окна плеера). */
export function notifyLobbyBufferingStart(): void {
  if (!roomId) return;
  awaitingPlayerSync = true;
  localBufferingPending = true;
  isSyncBlocked = true;
  logLobbyAction({ origin: 'local', action: 'sync.buffering_start', note: 'локальная смена качества/озвучки' });
  sendBufferingStart();
  window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', { detail: { mode: 'localBuffering' } }));
}

window.addEventListener('lobby:syncPause', ((e: Event) => {
  isSyncBlocked = true;
  awaitingPlayerSync = true;
  for (let i = pendingOutbound.length - 1; i >= 0; i--) {
    const a = pendingOutbound[i]!.action;
    if (a === 'play' || a === 'pause') pendingOutbound.splice(i, 1);
  }
  clearSyncStallWatchdog();
  scheduleSyncStallWatchdog('sync_pause');
  pushSyncStateToPlayer();
  const detail = (e as CustomEvent<{
    playback?: LobbyPlayback | null;
    reason?: 'join' | 'episode' | 'buffer';
    joinerPeerId?: string | null;
  }>).detail ?? {};
  const playback = detail.playback ?? lastPlayback;
  const barrierDetail = {
    playback,
    reason: detail.reason ?? 'buffer',
    joinerPeerId: detail.joinerPeerId ?? null,
  };
  window.dispatchEvent(new CustomEvent('lobby:barrierSync', { detail: barrierDetail }));
  if (!isLobbyHostWindow()) return;
  try {
    (window as { electron?: { sendLobbyBarrierSyncToPlayer?: (pb: unknown) => void } }).electron
      ?.sendLobbyBarrierSyncToPlayer?.(barrierDetail);
  } catch { /* ignore */ }
}) as EventListener);

window.addEventListener('lobby:syncResume', () => {
  if (isPlayerRenderer()) return;
  const wasBlocked = isSyncBlocked || awaitingPlayerSync;
  isSyncBlocked = false;
  if (!localBufferingPending) {
    awaitingPlayerSync = false;
  }
  clearSyncStallWatchdog();
  if (wasBlocked) {
    flushOutboundQueue();
    flushPlayPauseNow();
  }
  pushSyncStateToPlayer();
  if (!localBufferingPending) {
    window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', { detail: null }));
  }
  if (isLobbyHostWindow()) {
    try {
      (window as { electron?: { sendLobbySyncResumeToPlayer?: () => void } }).electron?.sendLobbySyncResumeToPlayer?.();
    } catch { /* ignore */ }
  }
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
  const seq = typeof playback.seq === 'number' ? playback.seq : null;
  const pausedChanged = lastPlayback != null && lastPlayback.paused !== playback.paused;
  const timeChanged = lastPlayback != null
    && Math.abs((lastPlayback.currentTime ?? 0) - (playback.currentTime ?? 0)) > 0.45;
  if (seq != null && seq <= lastAppliedSeq && !pausedChanged && !timeChanged) {
    logLobbyAction({
      origin: 'server',
      action: 'apply.remote.stale',
      playback: snapshotPlayback(playback),
      note: `seq ${seq} ≤ ${lastAppliedSeq}`,
    });
    return;
  }
  if (seq != null && seq > lastAppliedSeq) lastAppliedSeq = seq;

  const sameContent = !!(lastPlayback
    && String(lastPlayback.releaseId) === String(playback.releaseId)
    && String(lastPlayback.sourceId ?? '') === String(playback.sourceId ?? '')
    && String(lastPlayback.ep) === String(playback.ep)
    && String(lastPlayback.dubberId ?? '') === String(playback.dubberId ?? ''));
  const isEcho = hasAuthoritativePlayback && !fromPeerId && !action && sameContent && !pausedChanged && !timeChanged;
  if (isEcho) {
    lastPlayback = playback;
    hasAuthoritativePlayback = true;
    return;
  }

  const isFirstAuthoritative = !hasAuthoritativePlayback && roomHasPlayback;
  lastPlayback = playback;
  hasAuthoritativePlayback = true;

  if (isFirstAuthoritative) {
    isSyncBlocked = true;
    awaitingPlayerSync = true;
    clearSyncStallWatchdog();
    scheduleSyncStallWatchdog('first_authoritative_playback');
    pushSyncStateToPlayer();
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
  const actor = fromPeerId
    ? participants.find(p => String(p.peerId ?? p.id) === fromPeerId)
    : undefined;
  if (fromPeerId !== myPeerId) {
    logLobbyAction({
      origin: fromPeerId ? 'peer' : 'server',
      action: `apply.remote${action ? `.${action}` : ''}`,
      actor: { login: actor?.login, peerId: fromPeerId ?? null },
      playback: snapshotPlayback(playback),
      note: isFirstAuthoritative ? 'первый авторитетный playback' : undefined,
    });
  }
  const meta = {
    playback,
    fromPeerId: fromPeerId ?? null,
    action: action ?? null,
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
  options?: {
    myPeerId?: string;
    participants?: LobbyRoom['participants'];
    playback?: LobbyRoom['playback'];
    roomCode?: string;
    isCreator?: boolean;
  }
): void {
  if (roomId) {
    stopLobbyRtc();
    disconnect();
  }
  pendingOutbound.length = 0;
  if (playPauseTimer) {
    clearTimeout(playPauseTimer);
    playPauseTimer = null;
  }
  pendingPlayPause = null;
  lastAppliedSeq = 0;
  roomId = id;
  roomCode = options?.roomCode ?? null;
  myPeerId = options?.myPeerId ?? null;
  participants = options?.participants ? options.participants.slice() : [];
  lastPlayback = options?.playback && isUsablePlayback(options.playback) ? options.playback : null;
  roomHasPlayback = !!lastPlayback;
  hasAuthoritativePlayback = !!options?.isCreator && !!lastPlayback;
  isSyncBlocked = false;
  pendingProposalId = null;
  awaitingPlayerSync = false;
  localBufferingPending = false;
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
    logLobbyAction({
      origin: 'local',
      action: 'room.join',
      actor: { peerId: myPeerId },
      detail: { roomId, roomCode, participants: participants.length },
    });
  }
  if (roomId) {
    connect(roomId, dispatchRemotePlayback, myPeerId ?? undefined, handleParticipantsUpdate);
    startP2pIfNeeded();
    if (options?.playback && isUsablePlayback(options.playback) && !options.isCreator) {
      dispatchInitialPlayback(options.playback);
    }
  }
}

export function pushCommand(action: LobbyCommandAction, playback: LobbyPlayback): void {
  if (!roomId) return;
  if (roomHasPlayback && !hasAuthoritativePlayback) {
    queueOutbound(action, playback);
    logLobbyAction({
      origin: 'local',
      action: `sync.queued.${action}`,
      playback: snapshotPlayback(playback),
      note: 'ждём авторитетный playback с сервера',
    });
    return;
  }
  if (isSyncBlocked) {
    if (action === 'play' || action === 'pause') {
      pendingPlayPause = { action, playback };
      lastPlayback = playback;
      return;
    }
    if (action !== 'seek' && action !== 'changeEpisode') {
      queueOutbound(action, playback);
      logLobbyAction({
        origin: 'local',
        action: `sync.queued.${action}`,
        playback: snapshotPlayback(playback),
        note: 'синхронизация: команда в очереди',
      });
      return;
    }
  }

  const prevId = String(lastPlayback?.releaseId ?? '').trim();
  const nextId = String(playback.releaseId ?? '').trim();
  if (!isUsablePlayback(playback)) return;
  const isAnimeChange = prevId.length > 0 && nextId.length > 0 && prevId !== nextId;
  if (isAnimeChange && participants.length > 1) {
    logLobbyAction({
      origin: 'local',
      action: 'sync.blocked.animeChange',
      playback: snapshotPlayback(playback),
      note: 'смена аниме только через голосование',
    });
    return;
  }

  if (action === 'play' || action === 'pause') {
    schedulePlayPause(action, playback);
    return;
  }

  flushPlayPauseNow();
  emitLocalCommand(action, playback);
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
  logLobbyAction({
    origin: 'local',
    action: accept ? 'vote.accept' : 'vote.reject',
    detail: { proposalId },
  });
  sendVote(proposalId, accept);
}

export function sendLobbyChat(payload: { text: string; login?: string; avatar?: string | null }): void {
  if (!roomId) return;
  const text = String(payload.text ?? '').trim().slice(0, 500);
  if (!text) return;
  const msg = {
    id: `${myPeerId ?? 'local'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    login: payload.login?.trim() || 'Участник',
    avatar: payload.avatar ?? null,
    ts: Date.now(),
    peerId: myPeerId,
  };
  broadcastChat(msg);
  sendChat(msg);
  logLobbyAction({
    origin: 'local',
    action: 'chat.send',
    actor: { login: msg.login, peerId: myPeerId },
    via: hasP2PSync() ? 'p2p' : 'ws',
    note: text.slice(0, 80),
  });
  window.dispatchEvent(new CustomEvent('lobby:chat', {
    detail: { ...msg, self: true },
  }));
}

export function getPendingProposalId(): string | null {
  return pendingProposalId;
}

export function isLobbyAwaitingPlayerSync(): boolean {
  return awaitingPlayerSync;
}

export function isLobbySyncBlocked(): boolean {
  return isSyncBlocked;
}

export function getLobbyMyPeerId(): string | null {
  return myPeerId;
}

export function leaveLobby(): void {
  const leavingId = roomId;
  stopLobbyRtc();
  disconnect();
  if (leavingId) {
    pushLog({
      ts: Date.now(),
      type: 'leave',
      note: `Выход из комнаты ${leavingId}`,
    });
    logLobbyAction({ origin: 'local', action: 'room.leave', detail: { roomId: leavingId } });
  }
  roomId = null;
  roomCode = null;
  myPeerId = null;
  participants = [];
  lastPlayback = null;
  isSyncBlocked = false;
  pendingProposalId = null;
  awaitingPlayerSync = false;
  localBufferingPending = false;
  pendingOutbound.length = 0;
  if (playPauseTimer) {
    clearTimeout(playPauseTimer);
    playPauseTimer = null;
  }
  pendingPlayPause = null;
  lastAppliedSeq = 0;
  if (syncReadyTimer) {
    clearTimeout(syncReadyTimer);
    syncReadyTimer = null;
  }
  if (leavingId) {
    window.dispatchEvent(new CustomEvent('lobby:left'));
  }
}
