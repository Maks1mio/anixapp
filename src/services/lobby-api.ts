/**
 * API лобби совместного просмотра.
 * База берётся из services/anixback-endpoint (настройка в dev).
 */

import { getLobbyHttpBase } from './anixback-endpoint';

export interface LobbyParticipant {
  id: number | string;
  peerId?: string;
  login: string;
  avatar?: string | null;
  deviceId?: string | null;
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
  seq?: number;
}

export interface LobbyRoom {
  roomId: string;
  code: string;
  myPeerId?: string;
  participants: LobbyParticipant[];
  playback?: LobbyPlayback | null;
}

async function fetchLobby(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${getLobbyHttpBase()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
  return res;
}

type LobbyProfilePayload = {
  profileId?: number;
  login?: string;
  avatar?: string | null;
  deviceId?: string | null;
};

/** Есть ли у playback релиз и серия (не idle-заглушка). Idle = пустой releaseId; серия 0 у фильмов валидна. */
export function isUsablePlayback(p: Partial<LobbyPlayback> | null | undefined): boolean {
  if (!p) return false;
  const rid = String(p.releaseId ?? '').trim();
  const ep = String(p.ep ?? '').trim();
  if (!rid || ep === '') return false;
  const n = Number(ep);
  return Number.isFinite(n) && n >= 0;
}

function toSeedPlayback(p: Partial<LobbyPlayback>): LobbyPlayback {
  return {
    releaseId: String(p.releaseId ?? ''),
    sourceId: String(p.sourceId ?? ''),
    ep: String(p.ep ?? ''),
    dubberId: p.dubberId != null ? String(p.dubberId) : undefined,
    title: String(p.title ?? ''),
    sourceName: String(p.sourceName ?? ''),
    paused: p.paused !== false,
    currentTime: typeof p.currentTime === 'number' ? p.currentTime : 0,
  };
}

/** Создать комнату. Возвращает roomId, code и myPeerId (для WebRTC). */
export async function createRoom(
  profile: LobbyProfilePayload,
  playback?: Partial<LobbyPlayback> | null,
): Promise<{ roomId: string; code: string; myPeerId?: string }> {
  const body: Record<string, unknown> = { ...profile };
  if (isUsablePlayback(playback)) body.playback = toSeedPlayback(playback!);
  const res = await fetchLobby('/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Lobby create: ${res.status}`);
  const data = (await res.json()) as { roomId?: string; code?: string; myPeerId?: string };
  return { roomId: String(data.roomId ?? ''), code: String(data.code ?? ''), myPeerId: data.myPeerId != null ? String(data.myPeerId) : undefined };
}

/** Присоединиться по коду. */
export async function joinRoom(code: string, profile: LobbyProfilePayload): Promise<LobbyRoom> {
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

/** Покинуть комнату по deviceId (очистка участника на сервере). */
export async function leaveRoom(roomId: string, deviceId: string): Promise<void> {
  if (!roomId || !deviceId) return;
  await fetchLobby(`/room/${encodeURIComponent(roomId)}/leave`, {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  }).catch(() => undefined);
}
