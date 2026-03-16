/**
 * API лобби совместного просмотра.
 * Базовый URL: nhapp-api.onrender.com/anixapp/lobby
 * Синхронизация: пауза, таймкод, смена серии/озвучки. Громкость не синхронизируется.
 */

const LOBBY_BASE = 'https://nhapp-api.onrender.com/anixapp/lobby';

export interface LobbyParticipant {
  id: number | string;
  peerId?: string;
  login: string;
  avatar?: string | null;
}

export interface LobbyPlayback {
  releaseId: string;
  sourceId: string;
  ep: string;
  dubberId?: string;
  title: string;
  sourceName: string;
  paused: boolean;
  currentTime: number;
}

export interface LobbyRoom {
  roomId: string;
  code: string;
  myPeerId?: string;
  participants: LobbyParticipant[];
  playback?: LobbyPlayback | null;
}

async function fetchLobby(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${LOBBY_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
  return res;
}

/** Создать комнату. Возвращает roomId, code и myPeerId (для WebRTC). */
export async function createRoom(profile: { profileId?: number; login?: string; avatar?: string | null }): Promise<{ roomId: string; code: string; myPeerId?: string }> {
  const res = await fetchLobby('/create', {
    method: 'POST',
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`Lobby create: ${res.status}`);
  const data = (await res.json()) as { roomId?: string; code?: string; myPeerId?: string };
  return { roomId: String(data.roomId ?? ''), code: String(data.code ?? ''), myPeerId: data.myPeerId != null ? String(data.myPeerId) : undefined };
}

/** Присоединиться по коду. */
export async function joinRoom(
  code: string,
  profile: { profileId?: number; login?: string; avatar?: string | null }
): Promise<LobbyRoom> {
  const res = await fetchLobby('/join', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim(), ...profile }),
  });
  if (!res.ok) throw new Error(`Lobby join: ${res.status}`);
  const data = (await res.json()) as LobbyRoom;
  return data;
}

/** Получить состояние комнаты (участники + воспроизведение). */
export async function getRoom(roomId: string): Promise<LobbyRoom> {
  const res = await fetchLobby(`/room/${encodeURIComponent(roomId)}`);
  if (!res.ok) throw new Error(`Lobby get room: ${res.status}`);
  const data = (await res.json()) as LobbyRoom;
  return data;
}

/** Обновить состояние воспроизведения в комнате (резерв при отсутствии WebRTC). */
export async function updatePlayback(roomId: string, playback: LobbyPlayback): Promise<void> {
  const res = await fetchLobby(`/room/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ playback }),
  });
  if (!res.ok) throw new Error(`Lobby update playback: ${res.status}`);
}

/** Сигналинг WebRTC: отправить SDP/ICE другому пиру (POST .../room/:id/signal). */
export async function postSignal(
  roomId: string,
  fromPeerId: string,
  toPeerId: string,
  type: 'offer' | 'answer' | 'ice',
  payload: string | object
): Promise<void> {
  const res = await fetchLobby(`/room/${encodeURIComponent(roomId)}/signal`, {
    method: 'POST',
    body: JSON.stringify({ fromPeerId, toPeerId, type, payload: typeof payload === 'string' ? payload : JSON.stringify(payload) }),
  });
  if (!res.ok) throw new Error(`Lobby signal: ${res.status}`);
}

/** Сигналинг WebRTC: получить входящие сигналы для пира (сервер отдаёт и удаляет). */
export async function getSignals(roomId: string, peerId: string): Promise<Array<{ fromPeerId: string; type: 'offer' | 'answer' | 'ice'; payload: string }>> {
  const res = await fetchLobby(`/room/${encodeURIComponent(roomId)}/signals?peerId=${encodeURIComponent(peerId)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { signals?: Array<{ fromPeerId: string; type: string; payload: string }> };
  const list = data?.signals ?? [];
  return list.map((s) => ({ fromPeerId: s.fromPeerId, type: s.type as 'offer' | 'answer' | 'ice', payload: s.payload ?? '' }));
}
