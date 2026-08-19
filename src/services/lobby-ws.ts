/**
 * WebSocket-клиент лобби: одно соединение с сервером, ретрансляция playback через сервер.
 */

import type { LobbyPlayback, LobbyParticipant } from './lobby-api';
import { getLobbyWsBase } from './anixback-endpoint';
import { logLobbyAction, snapshotPlayback } from './lobby-action-log';

function getWsUrl(): string {
  return getLobbyWsBase();
}

let ws: WebSocket | null = null;
/** Активный сокет — onclose от старых инстансов игнорируем (иначе reconnect-loop ~3 с). */
let activeWs: WebSocket | null = null;
let hadJoinedOnce = false;
let roomId: string | null = null;
let myPeerId: string | null = null;
let onRemotePlayback: ((playback: LobbyPlayback, fromPeerId?: string | null, action?: string | null) => void) | null = null;
let onParticipantsChanged: ((participants: LobbyParticipant[]) => void) | null = null;

export type LobbySignalKind = 'offer' | 'answer' | 'ice';
export type LobbySignalMessage = { kind: LobbySignalKind; fromPeerId: string; payload: string };
let onSignal: ((msg: LobbySignalMessage) => void) | null = null;

export function setSignalHandler(cb: ((msg: LobbySignalMessage) => void) | null): void {
  onSignal = cb;
}

/** WebRTC SDP/ICE через WebSocket (мгновенно); иначе сервер кладёт в HTTP-очередь. */
export function sendSignal(kind: 'signal_offer' | 'signal_answer' | 'signal_ice', toPeerId: string, payload: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !roomId) return;
  try {
    ws.send(JSON.stringify({ type: kind, toPeerId, payload }));
  } catch (e) {
    console.warn('[lobby-ws] sendSignal error', e);
  }
}
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;
let reconnectAttempts = 0;

const RECONNECT_DELAY_MS = 3000;
// Stop reconnecting after this many consecutive failures (~24 seconds).
// If the room is gone the polling logic in lobby-modal will detect 404 and call leaveLobby().
const MAX_RECONNECT_ATTEMPTS = 8;

function clearReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (intentionalClose || !roomId) return;
  reconnectAttempts++;
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.warn('[lobby-ws] max reconnect attempts reached, giving up');
    roomId = null;
    return;
  }
  clearReconnect();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!roomId || !onRemotePlayback) return;
    connect(roomId, onRemotePlayback, myPeerId ?? undefined, onParticipantsChanged ?? undefined);
  }, RECONNECT_DELAY_MS);
}

function handleMessage(e: MessageEvent): void {
  try {
    const msg = JSON.parse(e.data as string) as {
      type?: string;
      playback?: LobbyPlayback;
      fromPeerId?: string;
      participants?: LobbyParticipant[];
      proposalId?: string;
      proposerPeerId?: string;
      proposerLogin?: string;
      reason?: string;
      rejectedByPeerId?: string;
      acceptedCount?: number;
      totalVoters?: number;
    };

    if (msg.type === 'signal_offer' && (msg as Record<string, unknown>).fromPeerId && (msg as Record<string, unknown>).payload != null) {
      onSignal?.({
        kind: 'offer',
        fromPeerId: String((msg as Record<string, unknown>).fromPeerId),
        payload: String((msg as Record<string, unknown>).payload),
      });
      return;
    }
    if (msg.type === 'signal_answer' && (msg as Record<string, unknown>).fromPeerId && (msg as Record<string, unknown>).payload != null) {
      onSignal?.({
        kind: 'answer',
        fromPeerId: String((msg as Record<string, unknown>).fromPeerId),
        payload: String((msg as Record<string, unknown>).payload),
      });
      return;
    }
    if (msg.type === 'signal_ice' && (msg as Record<string, unknown>).fromPeerId && (msg as Record<string, unknown>).payload != null) {
      onSignal?.({
        kind: 'ice',
        fromPeerId: String((msg as Record<string, unknown>).fromPeerId),
        payload: String((msg as Record<string, unknown>).payload),
      });
      return;
    }

    if (msg.type === 'playback' && msg.playback && typeof msg.playback.releaseId !== 'undefined') {
      const action = (msg as Record<string, unknown>).action as string ?? null;
      onRemotePlayback?.(msg.playback, msg.fromPeerId ?? null, action);
      return;
    }

    // Server sends current playback with the "joined" confirmation.
    // This is the authoritative sync that unblocks local commands.
    if (msg.type === 'joined') {
      const rawJoined = msg as Record<string, unknown>;
      const wRaw = rawJoined.watchingPeerIds;
      const watchingPeerIds = Array.isArray(wRaw) ? wRaw.map((x) => String(x)) : [];
      window.dispatchEvent(new CustomEvent('lobby:viewerState', { detail: { watchingPeerIds } }));

      const syncing = !!rawJoined.syncing;
      logLobbyAction({
        origin: 'server',
        action: 'ws.joined',
        playback: snapshotPlayback(msg.playback),
        via: 'ws',
        detail: { syncing, participants: msg.participants?.length ?? 0, watching: watchingPeerIds.length },
      });
      if (msg.playback && typeof msg.playback.releaseId !== 'undefined') {
        // При reconnect без syncing не затираем локальный play/pause — WS мог быть offline.
        if (syncing || !hadJoinedOnce) {
          onRemotePlayback?.(msg.playback, null);
        }
        if (syncing) {
          window.dispatchEvent(new CustomEvent('lobby:syncNeeded'));
        }
      } else if (!hadJoinedOnce) {
        // Room has no playback yet — still dispatch an empty signal
        // so lobby-state sets hasAuthoritativePlayback = true and
        // unblocks local commands for the first user who starts playing.
        window.dispatchEvent(new CustomEvent('lobby:authoritativeConfirmed'));
      }
      hadJoinedOnce = true;
      if (msg.participants) {
        onParticipantsChanged?.(msg.participants);
      }
      window.dispatchEvent(new CustomEvent('lobby:wsJoined'));
      return;
    }

    // Server paused playback (новый участник или смена качества/озвучки у кого-то).
    if (msg.type === 'sync_pause') {
      const raw = msg as Record<string, unknown>;
      logLobbyAction({
        origin: 'server',
        action: 'ws.sync_pause',
        actor: {
          login: raw.waitingLogin != null ? String(raw.waitingLogin) : undefined,
          peerId: raw.joinerPeerId != null ? String(raw.joinerPeerId) : null,
        },
        playback: snapshotPlayback(msg.playback),
        via: 'ws',
        note: 'сервер поставил всех на паузу',
      });
      const joinerPeerId = raw.joinerPeerId != null ? String(raw.joinerPeerId) : null;
      const waitingLogin = raw.waitingLogin != null ? String(raw.waitingLogin) : null;
      const waitingAvatar = raw.waitingAvatar != null ? String(raw.waitingAvatar) : null;
      const reasonRaw = raw.reason != null ? String(raw.reason) : '';
      const reason = reasonRaw === 'join' || reasonRaw === 'episode' || reasonRaw === 'buffer' ? reasonRaw : 'buffer';
      if (reason !== 'join' && msg.playback && typeof msg.playback.releaseId !== 'undefined') {
        onRemotePlayback?.(msg.playback, null);
      }
      if (msg.participants) {
        onParticipantsChanged?.(msg.participants);
      }
      window.dispatchEvent(new CustomEvent('lobby:syncPause', {
        detail: { joinerPeerId, waitingLogin, waitingAvatar, reason, playback: msg.playback ?? null },
      }));
      const isSelf = myPeerId && joinerPeerId === myPeerId;
      window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', {
        detail: isSelf
          ? { mode: 'localBuffering', label: 'Синхронизация…' }
          : {
            mode: 'peer',
            login: waitingLogin ?? 'Участник',
            avatar: waitingAvatar,
            peerId: joinerPeerId,
          },
      }));
      return;
    }

    // Server resumed playback after sync — everyone can play again.
    if (msg.type === 'sync_resume') {
      logLobbyAction({
        origin: 'server',
        action: 'ws.sync_resume',
        playback: snapshotPlayback(msg.playback),
        via: 'ws',
        note: 'сервер снял паузу синхронизации',
      });
      if (msg.playback && typeof msg.playback.releaseId !== 'undefined') {
        onRemotePlayback?.(msg.playback, null);
      }
      window.dispatchEvent(new CustomEvent('lobby:syncResume'));
      window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', { detail: null }));
      return;
    }

    // Real-time participant list updates
    if ((msg.type === 'participant_joined' || msg.type === 'participant_left') && msg.participants) {
      logLobbyAction({
        origin: 'server',
        action: `ws.${msg.type}`,
        via: 'ws',
        detail: { count: msg.participants.length },
      });
      onParticipantsChanged?.(msg.participants);
      return;
    }

    // ── Proposal (голосование за смену аниме) ──
    if (msg.type === 'proposal_new' && msg.proposalId && msg.playback) {
      logLobbyAction({
        origin: 'peer',
        action: 'ws.proposal_new',
        actor: { login: msg.proposerLogin, peerId: msg.proposerPeerId ?? null },
        playback: snapshotPlayback(msg.playback),
        via: 'ws',
        detail: { proposalId: msg.proposalId },
      });
      window.dispatchEvent(new CustomEvent('lobby:proposalNew', {
        detail: {
          proposalId: msg.proposalId,
          proposerPeerId: msg.proposerPeerId ?? null,
          proposerLogin: msg.proposerLogin ?? 'Участник',
          playback: msg.playback,
        },
      }));
      return;
    }

    if (msg.type === 'proposal_created' && msg.proposalId) {
      window.dispatchEvent(new CustomEvent('lobby:proposalCreated', {
        detail: { proposalId: msg.proposalId },
      }));
      return;
    }

    if (msg.type === 'proposal_accepted' && msg.proposalId) {
      logLobbyAction({
        origin: 'server',
        action: 'ws.proposal_accepted',
        playback: snapshotPlayback(msg.playback),
        via: 'ws',
        detail: { proposalId: msg.proposalId },
      });
      window.dispatchEvent(new CustomEvent('lobby:proposalAccepted', {
        detail: { proposalId: msg.proposalId, playback: msg.playback ?? null },
      }));
      return;
    }

    if (msg.type === 'proposal_rejected' && msg.proposalId) {
      logLobbyAction({
        origin: 'server',
        action: 'ws.proposal_rejected',
        via: 'ws',
        detail: { proposalId: msg.proposalId, reason: msg.reason ?? 'unknown' },
      });
      window.dispatchEvent(new CustomEvent('lobby:proposalRejected', {
        detail: {
          proposalId: msg.proposalId,
          reason: msg.reason ?? 'unknown',
          rejectedByPeerId: msg.rejectedByPeerId ?? null,
        },
      }));
      return;
    }

    if (msg.type === 'proposal_vote_update' && msg.proposalId) {
      window.dispatchEvent(new CustomEvent('lobby:proposalVoteUpdate', {
        detail: {
          proposalId: msg.proposalId,
          acceptedCount: msg.acceptedCount ?? 0,
          totalVoters: msg.totalVoters ?? 0,
        },
      }));
      return;
    }

    if (msg.type === 'viewer_state') {
      const raw = msg as Record<string, unknown>;
      const ids = raw.watchingPeerIds;
      const watchingPeerIds = Array.isArray(ids) ? ids.map((x) => String(x)) : [];
      window.dispatchEvent(new CustomEvent('lobby:viewerState', { detail: { watchingPeerIds } }));
      return;
    }

    if (msg.type === 'chat' && typeof (msg as Record<string, unknown>).text === 'string') {
      const raw = msg as Record<string, unknown>;
      const from = String(raw.fromPeerId ?? '');
      if (myPeerId && from && from === myPeerId) return;
      logLobbyAction({
        origin: 'peer',
        action: 'ws.chat',
        actor: { login: String(raw.login ?? 'Участник'), peerId: from || null },
        via: 'ws',
        note: String(raw.text).slice(0, 80),
      });
      window.dispatchEvent(new CustomEvent('lobby:chat', {
        detail: {
          id: String(raw.id ?? `${from}-${raw.ts ?? Date.now()}`),
          text: String(raw.text).slice(0, 500),
          login: String(raw.login ?? 'Участник'),
          avatar: typeof raw.avatar === 'string' ? raw.avatar : null,
          ts: typeof raw.ts === 'number' ? raw.ts : Date.now(),
          peerId: from || null,
          self: false,
        },
      }));
      return;
    }
  } catch (_) {}
}

function detachWsHandlers(socket: WebSocket): void {
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
}

export function connect(
  rId: string,
  onPlayback: (playback: LobbyPlayback, fromPeerId?: string | null, action?: string | null) => void,
  peerId?: string | null,
  onParticipants?: (participants: LobbyParticipant[]) => void,
): void {
  if (activeWs) {
    detachWsHandlers(activeWs);
    try { activeWs.close(); } catch { /* ignore */ }
    activeWs = null;
    ws = null;
  }
  clearReconnect();
  roomId = rId;
  myPeerId = peerId ?? null;
  onRemotePlayback = onPlayback;
  onParticipantsChanged = onParticipants ?? null;
  intentionalClose = false;
  const url = getWsUrl();
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch (e) {
    console.warn('[lobby-ws] connect error', e);
    scheduleReconnect();
    return;
  }
  ws = socket;
  activeWs = socket;

  socket.onopen = () => {
    if (socket !== activeWs) return;
    clearReconnect();
    reconnectAttempts = 0;
    logLobbyAction({
      origin: 'system',
      action: 'ws.open',
      via: 'ws',
      detail: { roomId: rId, peerId: myPeerId },
      note: url,
    });
    socket.send(JSON.stringify({ type: 'join', roomId: rId, peerId: myPeerId ?? undefined }));
  };

  socket.onmessage = handleMessage;

  socket.onclose = () => {
    if (socket !== activeWs) return;
    activeWs = null;
    ws = null;
    logLobbyAction({
      origin: 'system',
      action: 'ws.close',
      via: 'ws',
      note: intentionalClose ? 'закрыто намеренно' : 'обрыв, переподключение',
    });
    if (!intentionalClose && roomId) scheduleReconnect();
  };

  socket.onerror = () => {
    if (socket !== activeWs) return;
    // reconnect только в onclose — иначе двойной scheduleReconnect
  };
}

export function disconnect(): void {
  intentionalClose = true;
  reconnectAttempts = 0;
  hadJoinedOnce = false;
  clearReconnect();
  if (activeWs) {
    detachWsHandlers(activeWs);
    try { activeWs.close(); } catch { /* ignore */ }
    activeWs = null;
  }
  ws = null;
  roomId = null;
  myPeerId = null;
  onRemotePlayback = null;
  onParticipantsChanged = null;
  onSignal = null;
}

export type LobbyCommandAction = 'play' | 'pause' | 'seek' | 'changeEpisode';

export function sendCommand(action: LobbyCommandAction, payload: Partial<LobbyPlayback>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !roomId) return;
  try {
    ws.send(
      JSON.stringify({
        type: 'command',
        action,
        payload,
      })
    );
  } catch (e) {
    console.warn('[lobby-ws] send command error', e);
  }
}

/** Временная обёртка для обратной совместимости. Используем команду changeEpisode. */
export function sendPlayback(playback: LobbyPlayback): void {
  sendCommand('changeEpisode', playback);
}

/** Сообщает серверу, что новый участник синхронизировался и готов к воспроизведению. */
export function sendSyncReady(currentTime?: number): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({
      type: 'sync_ready',
      ...(typeof currentTime === 'number' && Number.isFinite(currentTime) ? { currentTime } : {}),
    }));
  } catch (e) {
    console.warn('[lobby-ws] sendSyncReady error', e);
  }
}

/** Уведомить сервер: меняю качество/озвучку — пауза для всех до sync_ready. */
export function sendBufferingStart(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !roomId) return;
  try {
    ws.send(JSON.stringify({ type: 'buffering_start' }));
  } catch (e) {
    console.warn('[lobby-ws] sendBufferingStart error', e);
  }
}

/** Отдельное окно плеера открыто/закрыто — сервер рассылает viewer_state всем. */
export function sendPlayerViewActive(active: boolean): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !roomId) return;
  try {
    ws.send(JSON.stringify({ type: 'player_view', active }));
  } catch (e) {
    console.warn('[lobby-ws] sendPlayerViewActive error', e);
  }
}

/** Отправляет предложение смены аниме на сервер. */
export function sendProposal(playback: Partial<LobbyPlayback>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: 'propose_change', payload: playback }));
  } catch (e) {
    console.warn('[lobby-ws] sendProposal error', e);
  }
}

/** Отправляет голос за/против предложения. */
export function sendVote(proposalId: string, accept: boolean): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: 'vote_change', proposalId, accept }));
  } catch (e) {
    console.warn('[lobby-ws] sendVote error', e);
  }
}

export function sendChat(msg: {
  id: string;
  text: string;
  login: string;
  avatar?: string | null;
  ts: number;
  peerId?: string | null;
}): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !roomId) return;
  try {
    ws.send(JSON.stringify({
      type: 'chat',
      id: msg.id,
      text: msg.text,
      login: msg.login,
      avatar: msg.avatar ?? null,
      ts: msg.ts,
      fromPeerId: msg.peerId ?? myPeerId,
    }));
  } catch (e) {
    console.warn('[lobby-ws] sendChat error', e);
  }
}

export function isConnected(): boolean {
  return !!ws && ws.readyState === WebSocket.OPEN;
}
