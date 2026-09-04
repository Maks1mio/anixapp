import {
  createFluoRoom,
  joinFluoRoom,
  leaveFluoRoomHttp,
  catchUpFluoPlayback,
  computeFluoPosition,
  type FluoProfilePayload,
} from '../fluo/sync';
import { isUsableFluoContent, type FluoContent, type FluoParticipant } from '../fluo/types';
import {
  getCurrentParticipants,
  getCurrentRoomCode,
  getCurrentRoomId,
  getLastPlayback,
  getLobbyHostPeerId,
  getLobbyMyPeerId,
  leaveLobby,
  pushLobbySyncStateToPlayer,
  setLobbyRoom,
  type LobbyPlayback,
} from '../services/lobby-state';
import { isPlayerWindowOpen } from '../stores/modals';
import { openInAppPlayer, isEmbeddedWebPlayer } from './watch-nav';
import { resolveCdnAssetUrl } from './posterUrl';

export type LobbySession = {
  inLobby: boolean;
  roomId: string | null;
  roomCode: string | null;
  participants: FluoParticipant[];
  hostPeerId: string | null;
  myPeerId: string | null;
};

export function getLobbyProfile(): FluoProfilePayload {
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
      // fall through
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
    hostPeerId: getLobbyHostPeerId(),
    myPeerId: getLobbyMyPeerId(),
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

export async function openLobbyPlayerWindow(opts?: { applyRoomPlayback?: boolean }): Promise<void> {
  const pb = getLastPlayback();
  const payload = pb?.releaseId
    ? {
        releaseId: String(pb.releaseId),
        sourceId: String(pb.sourceId ?? ''),
        ep: String(pb.ep ?? '1'),
        title: pb.title || 'Совместный просмотр',
        sourceName: pb.sourceName || '',
        ...(pb.dubberId ? { dubberId: String(pb.dubberId) } : {}),
        currentTime: typeof pb.currentTime === 'number' ? pb.currentTime : 0,
        paused: pb.paused !== false,
        applyRoomPlayback: opts?.applyRoomPlayback === true,
      }
    : {
        releaseId: '',
        sourceId: '',
        ep: '',
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

export async function createLobbyRoomAndOpenPlayer(seed?: Partial<LobbyPlayback> | null): Promise<void> {
  const deviceId = await getLobbyDeviceId();
  const playback = isUsableFluoContent(seed)
    ? {
        releaseId: String(seed!.releaseId),
        sourceId: String(seed!.sourceId ?? ''),
        ep: String(seed!.ep),
        dubberId: seed!.dubberId != null ? String(seed!.dubberId) : undefined,
        title: String(seed!.title ?? ''),
        sourceName: String(seed!.sourceName ?? ''),
        paused: seed!.paused !== false,
        currentTime: typeof seed!.currentTime === 'number' ? seed!.currentTime : 0,
      }
    : undefined;
  const { roomId, code, myPeerId } = await createFluoRoom(
    { ...getLobbyProfile(), deviceId },
    playback,
  );
  setLobbyRoom(roomId, {
    myPeerId,
    participants: [],
    roomCode: code,
    playback: playback as LobbyPlayback | undefined,
    isCreator: true,
    hostPeerId: myPeerId,
  });
  window.dispatchEvent(new CustomEvent('lobby:participantsChanged', { detail: { participants: [] } }));
  await openLobbyPlayerWindow();
}

export async function joinLobbyRoomAndOpenPlayer(code: string): Promise<void> {
  const deviceId = await getLobbyDeviceId();
  const room = await joinFluoRoom(code, { ...getLobbyProfile(), deviceId });
  const serverClock = room.clock ?? null;
  // Живая позиция: mediaOrigin + (now - t0), а не сырой mediaOrigin.
  const liveT = serverClock ? computeFluoPosition(serverClock) : 0;
  const pb = serverClock?.content
    ? {
        ...serverClock.content,
        paused: serverClock.paused,
        currentTime: liveT,
      }
    : null;
  setLobbyRoom(room.roomId, {
    myPeerId: room.myPeerId,
    participants: room.participants ?? [],
    playback: pb,
    clock: serverClock,
    roomCode: room.code,
    hostPeerId: room.hostPeerId,
  });
  await openLobbyPlayerWindow({ applyRoomPlayback: true });
  // Догон после открытия окна плеера (IPC мог уйти в пустоту).
  window.setTimeout(() => catchUpFluoPlayback(true), 400);
  window.setTimeout(() => catchUpFluoPlayback(true), 1200);
}

export async function leaveLobbyRoomFromUi(): Promise<void> {
  const id = getCurrentRoomId();
  const deviceId = await getLobbyDeviceId();
  if (id && deviceId) await leaveFluoRoomHttp(id, deviceId).catch(() => undefined);
  leaveLobby();
  pushLobbySessionToPlayer();
}

export type { FluoContent, LobbyPlayback };
