/**
 * Состояние лобби: только WebSocket через сервер. Прямое соединение, ретрансляция playback через сервер.
 */

import type { LobbyPlayback, LobbyRoom } from './lobby-api';
import { connect, disconnect, sendPlayback } from './lobby-ws';

let roomId: string | null = null;
let lastPlayback: LobbyPlayback | null = null;

export function getCurrentRoomId(): string | null {
  return roomId;
}

function dispatchRemotePlayback(playback: LobbyPlayback): void {
  lastPlayback = playback;
  console.log('[lobby] playback по WS, открываю плеер', { releaseId: playback.releaseId, ep: playback.ep });
  window.dispatchEvent(new CustomEvent('lobby:remotePlayback', { detail: playback }));
}

export function setLobbyRoom(
  id: string | null,
  _options?: { myPeerId?: string; participants?: LobbyRoom['participants'] }
): void {
  if (roomId) disconnect();
  roomId = id;
  lastPlayback = null;
  if (roomId) {
    connect(roomId, dispatchRemotePlayback);
  }
}

export function pushPlayback(playback: LobbyPlayback): void {
  if (!roomId) return;
  lastPlayback = playback;
  sendPlayback(playback);
}

export function leaveLobby(): void {
  disconnect();
  roomId = null;
  lastPlayback = null;
}
