import { createRoom, joinRoom, leaveRoom, type LobbyParticipant } from '../services/lobby-api';
import {
  getCurrentParticipants,
  getCurrentRoomCode,
  getCurrentRoomId,
  getLastPlayback,
  leaveLobby,
  pushLobbySyncStateToPlayer,
  setLobbyRoom,
} from '../services/lobby-state';
import { isPlayerWindowOpen } from '../stores/modals';
import { openInAppPlayer, isEmbeddedWebPlayer } from './watch-nav';
import { resolveCdnAssetUrl } from './posterUrl';

export type LobbySession = {
  inLobby: boolean;
  roomId: string | null;
  roomCode: string | null;
  participants: LobbyParticipant[];
};

export function getLobbyProfile(): {
  profileId?: number;
  login?: string;
  avatar?: string | null;
} {
  try {
    const raw = (window as unknown as { __anixProfile?: { id?: number; login?: string; avatar?: string | null } }).__anixProfile;
    if (raw && (raw.id || raw.login)) {
      return {
        profileId: raw.id,
        login: raw.login ?? undefined,
        avatar: raw.avatar ? resolveCdnAssetUrl(raw.avatar) : null,
      };
    }
  } catch {
    // ignore
  }
  return {};
}

const WEB_DEVICE_ID_KEY = 'anixapp.webDeviceId';

function getOrCreateWebDeviceId(): string {
  try {
    const existing = localStorage.getItem(WEB_DEVICE_ID_KEY);
    if (existing) return existing;
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(WEB_DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `web-${Date.now()}`;
  }
}

export async function getLobbyDeviceId(): Promise<string | null> {
  const getDeviceId = window.electron?.getDeviceId;
  if (typeof getDeviceId === 'function') {
    try {
      const id = await getDeviceId();
      if (id) return id;
    } catch {
      // fall through to web id
    }
  }
  return getOrCreateWebDeviceId();
}

export function getLobbySession(): LobbySession {
  const roomId = getCurrentRoomId();
  return {
    inLobby: !!roomId,
    roomId,
    roomCode: getCurrentRoomCode(),
    participants: getCurrentParticipants(),
  };
}

export function pushLobbySessionToPlayer(): void {
  const session = getLobbySession();
  if (window.electron?.sendLobbySessionToPlayer) {
    window.electron.sendLobbySessionToPlayer(session);
    pushLobbySyncStateToPlayer();
    return;
  }
  window.dispatchEvent(new CustomEvent('lobby:session', { detail: session }));
}

export async function openLobbyPlayerWindow(): Promise<void> {
  const pb = getLastPlayback();
  const payload = pb?.releaseId
    ? {
        releaseId: String(pb.releaseId),
        sourceId: String(pb.sourceId ?? ''),
        ep: String(pb.ep ?? '1'),
        title: pb.title || 'Совместный просмотр',
        sourceName: pb.sourceName || '',
        ...(pb.dubberId ? { dubberId: String(pb.dubberId) } : {}),
      }
    : {
        releaseId: '',
        sourceId: '',
        ep: '0',
        title: 'Совместный просмотр',
        sourceName: '',
        lobbyIdle: true,
      };

  if (window.electron?.openPlayerWindow) {
    await window.electron.openPlayerWindow(payload);
    isPlayerWindowOpen.set(true);
    pushLobbySessionToPlayer();
    window.setTimeout(() => pushLobbySessionToPlayer(), 400);
    return;
  }

  if (isEmbeddedWebPlayer()) {
    window.dispatchEvent(new CustomEvent('lobby:session', { detail: getLobbySession() }));
    return;
  }

  await openInAppPlayer(payload);
  window.dispatchEvent(new CustomEvent('lobby:session', { detail: getLobbySession() }));
}

export async function createLobbyRoomAndOpenPlayer(): Promise<void> {
  const deviceId = await getLobbyDeviceId();
  const { roomId, code, myPeerId } = await createRoom({ ...getLobbyProfile(), deviceId });
  setLobbyRoom(roomId, { myPeerId, participants: [], roomCode: code });
  window.dispatchEvent(new CustomEvent('lobby:participantsChanged', { detail: { participants: [] } }));
  await openLobbyPlayerWindow();
}

export async function joinLobbyRoomAndOpenPlayer(code: string): Promise<void> {
  const deviceId = await getLobbyDeviceId();
  const room = await joinRoom(code, { ...getLobbyProfile(), deviceId });
  setLobbyRoom(room.roomId, {
    myPeerId: room.myPeerId,
    participants: room.participants ?? [],
    playback: room.playback ?? undefined,
    roomCode: room.code,
  });
  await openLobbyPlayerWindow();
}

export async function leaveLobbyRoomFromUi(): Promise<void> {
  const id = getCurrentRoomId();
  const deviceId = await getLobbyDeviceId();
  if (id && deviceId) await leaveRoom(id, deviceId).catch(() => undefined);
  leaveLobby();
  pushLobbySessionToPlayer();
}
