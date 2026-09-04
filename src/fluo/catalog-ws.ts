/**
 * Live-подписка на каталог Fluo-комнат через WS.
 */

import { getFluoWsBase } from './endpoints';
import type { FluoRoomListItem } from './types';

type CatalogListener = (rooms: FluoRoomListItem[]) => void;

let socket: WebSocket | null = null;
let intentionalClose = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const listeners = new Set<CatalogListener>();

function notify(rooms: FluoRoomListItem[]): void {
  for (const fn of listeners) {
    try {
      fn(rooms);
    } catch {
      /* ignore */
    }
  }
}

function clearReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (intentionalClose || listeners.size === 0) return;
  clearReconnect();
  const delay = Math.min(8000, 600 + reconnectAttempts * 700);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect(): void {
  if (typeof WebSocket === 'undefined') return;
  if (listeners.size === 0) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  intentionalClose = false;
  const url = getFluoWsBase();
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    if (socket !== ws) return;
    reconnectAttempts = 0;
    try {
      ws.send(JSON.stringify({ type: 'catalog_subscribe' }));
    } catch {
      /* ignore */
    }
  };

  ws.onmessage = (ev) => {
    if (socket !== ws) return;
    let msg: { type?: string; rooms?: FluoRoomListItem[] };
    try {
      msg = JSON.parse(String(ev.data)) as { type?: string; rooms?: FluoRoomListItem[] };
    } catch {
      return;
    }
    if (msg.type === 'catalog' && Array.isArray(msg.rooms)) {
      notify(msg.rooms);
    }
  };

  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    if (!intentionalClose) scheduleReconnect();
  };

  ws.onerror = () => {
    /* onclose follows */
  };
}

function disconnectIfIdle(): void {
  if (listeners.size > 0) return;
  intentionalClose = true;
  clearReconnect();
  if (socket) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
    socket = null;
  }
}

/** Подписка на live-каталог. Сразу поднимает WS; отписка закрывает сокет, если слушателей не осталось. */
export function subscribeFluoCatalog(listener: CatalogListener): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    disconnectIfIdle();
  };
}
