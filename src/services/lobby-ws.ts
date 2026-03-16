/**
 * WebSocket-клиент лобби: одно соединение с сервером, ретрансляция playback через сервер.
 */

import type { LobbyPlayback } from './lobby-api';

const LOBBY_HTTP = 'https://nhapp-api.onrender.com/anixapp/lobby';
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
let onRemotePlayback: ((playback: LobbyPlayback) => void) | null = null;
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
    connect(roomId!, onRemotePlayback!);
  }, RECONNECT_DELAY_MS);
}

function handleMessage(e: MessageEvent): void {
  try {
    const msg = JSON.parse(e.data as string) as { type?: string; playback?: LobbyPlayback };
    if (msg.type === 'playback' && msg.playback && typeof msg.playback.releaseId !== 'undefined') {
      onRemotePlayback?.(msg.playback);
    }
  } catch (_) {}
}

export function connect(rId: string, onPlayback: (playback: LobbyPlayback) => void): void {
  disconnect();
  roomId = rId;
  onRemotePlayback = onPlayback;
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
    ws?.send(JSON.stringify({ type: 'join', roomId: rId }));
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
  onRemotePlayback = null;
}

export function sendPlayback(playback: LobbyPlayback): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !roomId) return;
  try {
    ws.send(JSON.stringify({ type: 'playback', playback }));
  } catch (e) {
    console.warn('[lobby-ws] send error', e);
  }
}

export function isConnected(): boolean {
  return !!ws && ws.readyState === WebSocket.OPEN;
}
