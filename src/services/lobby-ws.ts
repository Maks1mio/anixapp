/**
 * WebSocket-клиент лобби: одно соединение с сервером, ретрансляция playback через сервер.
 */

import type { LobbyPlayback, LobbyParticipant } from './lobby-api';

const LOBBY_WS_BASE = 'wss://nhapp-api.onrender.com/anixapp/lobby/ws';

function getWsUrl(): string {
  if (typeof window === 'undefined') return LOBBY_WS_BASE;
  const base = window.location.origin;
  if (base.startsWith('http://localhost') || base.startsWith('file:')) {
    return 'wss://nhapp-api.onrender.com/anixapp/lobby/ws';
  }
  const protocol = base.startsWith('https') ? 'wss:' : 'ws:';
  const host = base.replace(/^https?:\/\//, '');
  return `${protocol}//${host}/anixapp/lobby/ws`;
}

let ws: WebSocket | null = null;
let roomId: string | null = null;
let myPeerId: string | null = null;
let onRemotePlayback: ((playback: LobbyPlayback, fromPeerId?: string | null) => void) | null = null;
let onParticipantsChanged: ((participants: LobbyParticipant[]) => void) | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;

const RECONNECT_DELAY_MS = 3000;

function clearReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (intentionalClose || !roomId) return;
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

    if (msg.type === 'playback' && msg.playback && typeof msg.playback.releaseId !== 'undefined') {
      onRemotePlayback?.(msg.playback, msg.fromPeerId ?? null);
      return;
    }

    // Server sends current playback with the "joined" confirmation.
    // This is the authoritative sync that unblocks local commands.
    if (msg.type === 'joined') {
      const syncing = !!(msg as Record<string, unknown>).syncing;
      if (msg.playback && typeof msg.playback.releaseId !== 'undefined') {
        onRemotePlayback?.(msg.playback, null);
        if (syncing) {
          // Server paused everyone for us to sync. After applying playback,
          // we need to send sync_ready once our player has loaded/seeked.
          window.dispatchEvent(new CustomEvent('lobby:syncNeeded'));
        }
      } else {
        // Room has no playback yet — still dispatch an empty signal
        // so lobby-state sets hasAuthoritativePlayback = true and
        // unblocks local commands for the first user who starts playing.
        window.dispatchEvent(new CustomEvent('lobby:authoritativeConfirmed'));
      }
      if (msg.participants) {
        onParticipantsChanged?.(msg.participants);
      }
      return;
    }

    // Server paused playback because a new user is joining — apply pause.
    if (msg.type === 'sync_pause') {
      if (msg.playback && typeof msg.playback.releaseId !== 'undefined') {
        onRemotePlayback?.(msg.playback, null);
      }
      if (msg.participants) {
        onParticipantsChanged?.(msg.participants);
      }
      window.dispatchEvent(new CustomEvent('lobby:syncPause'));
      return;
    }

    // Server resumed playback after sync — everyone can play again.
    if (msg.type === 'sync_resume') {
      if (msg.playback && typeof msg.playback.releaseId !== 'undefined') {
        onRemotePlayback?.(msg.playback, null);
      }
      window.dispatchEvent(new CustomEvent('lobby:syncResume'));
      return;
    }

    // Real-time participant list updates
    if ((msg.type === 'participant_joined' || msg.type === 'participant_left') && msg.participants) {
      onParticipantsChanged?.(msg.participants);
      return;
    }

    // ── Proposal (голосование за смену аниме) ──
    if (msg.type === 'proposal_new' && msg.proposalId && msg.playback) {
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
      if (msg.playback && typeof msg.playback.releaseId !== 'undefined') {
        onRemotePlayback?.(msg.playback, null);
      }
      window.dispatchEvent(new CustomEvent('lobby:proposalAccepted', {
        detail: { proposalId: msg.proposalId, playback: msg.playback ?? null },
      }));
      return;
    }

    if (msg.type === 'proposal_rejected' && msg.proposalId) {
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
  } catch (_) {}
}

export function connect(
  rId: string,
  onPlayback: (playback: LobbyPlayback, fromPeerId?: string | null) => void,
  peerId?: string | null,
  onParticipants?: (participants: LobbyParticipant[]) => void,
): void {
  disconnect();
  roomId = rId;
  myPeerId = peerId ?? null;
  onRemotePlayback = onPlayback;
  onParticipantsChanged = onParticipants ?? null;
  intentionalClose = false;
  const url = getWsUrl();
  try {
    ws = new WebSocket(url);
  } catch (e) {
    console.warn('[lobby-ws] connect error', e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    clearReconnect();
    ws?.send(JSON.stringify({ type: 'join', roomId: rId, peerId: myPeerId ?? undefined }));
  };

  ws.onmessage = handleMessage;

  ws.onclose = () => {
    ws = null;
    if (!intentionalClose && roomId) scheduleReconnect();
  };

  ws.onerror = () => {
    if (!intentionalClose) scheduleReconnect();
  };
}

export function disconnect(): void {
  intentionalClose = true;
  clearReconnect();
  if (ws) {
    try {
      ws.close();
    } catch (_) {}
    ws = null;
  }
  roomId = null;
  myPeerId = null;
  onRemotePlayback = null;
  onParticipantsChanged = null;
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
export function sendSyncReady(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type: 'sync_ready' }));
  } catch (e) {
    console.warn('[lobby-ws] sendSyncReady error', e);
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

export function isConnected(): boolean {
  return !!ws && ws.readyState === WebSocket.OPEN;
}
