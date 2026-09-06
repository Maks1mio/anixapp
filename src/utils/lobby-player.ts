import {
  createFluoRoom,
  joinFluoRoom,
  leaveFluoRoomHttp,
  catchUpFluoPlayback,
  computeFluoPosition,
  getFluoRoomSettings,
  FluoJoinError,
  type FluoProfilePayload,
} from '../fluo/sync';
import { isUsableFluoContent, type FluoContent, type FluoCreateRoomOptions, type FluoParticipant } from '../fluo/types';
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

export { FluoJoinError };
export type { FluoCreateRoomOptions };

export type LobbySession = {
  inLobby: boolean;
  roomId: string | null;
  roomCode: string | null;
  participants: FluoParticipant[];
  hostPeerId: string | null;
  myPeerId: string | null;
  settings?: import('../fluo/types').FluoRoomSettings;
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
    settings: getFluoRoomSettings(),
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

export async function createLobbyRoomAndOpenPlayer(
  seed?: Partial<LobbyPlayback> | null,
  options: FluoCreateRoomOptions = {},
): Promise<void> {
  const deviceId = await getLobbyDeviceId();
  const playback = isUsableFluoContent(seed)
    ? {
        releaseId: String(seed!.releaseId),
        sourceId: String(seed!.sourceId ?? ''),
        ep: String(seed!.ep),
        dubberId: seed!.dubberId != null ? String(seed!.dubberId) : undefined,
        title: String(seed!.title ?? ''),
        sourceName: String(seed!.sourceName ?? ''),
        dubberName: seed!.dubberName,
        posterUrl: seed!.posterUrl,
        paused: seed!.paused !== false,
        currentTime: typeof seed!.currentTime === 'number' ? seed!.currentTime : 0,
        duration: typeof seed!.duration === 'number' ? seed!.duration : undefined,
      }
    : undefined;
  const { roomId, code, myPeerId, settings } = await createFluoRoom(
    { ...getLobbyProfile(), deviceId },
    playback,
    options,
  );
  setLobbyRoom(roomId, {
    myPeerId,
    participants: [],
    roomCode: code,
    playback: playback as LobbyPlayback | undefined,
    isCreator: true,
    hostPeerId: myPeerId,
    settings: settings ?? undefined,
  });
  window.dispatchEvent(new CustomEvent('lobby:participantsChanged', { detail: { participants: [] } }));
  await openLobbyPlayerWindow();
}

export async function joinLobbyRoomAndOpenPlayer(
  code: string,
  password?: string | null,
): Promise<void> {
  const deviceId = await getLobbyDeviceId();
  const room = await joinFluoRoom(code, { ...getLobbyProfile(), deviceId }, password);
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
    settings: room.settings ?? undefined,
  });
  await openLobbyPlayerWindow({ applyRoomPlayback: true });
  // Догон после открытия окна плеера (IPC мог уйти в пустоту).
  window.setTimeout(() => catchUpFluoPlayback(true), 400);
  window.setTimeout(() => catchUpFluoPlayback(true), 1200);
  window.setTimeout(() => catchUpFluoPlayback(true), 2500);
  window.setTimeout(() => catchUpFluoPlayback(true), 5000);
}

export async function leaveLobbyRoomFromUi(): Promise<void> {
  const id = getCurrentRoomId();
  const peerId = getLobbyMyPeerId();
  const deviceId = await getLobbyDeviceId();
  if (id) {
    await leaveFluoRoomHttp(id, deviceId, peerId).catch(() => false);
  }
  leaveLobby();
  pushLobbySessionToPlayer();
}

export type { FluoContent, LobbyPlayback };
