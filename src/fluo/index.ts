/**
 * Fluo — ядро плеера + совместный просмотр.
 * window.fluo — публичный API (как pulseSyncApi).
 */

import { getFluoPlayer, resetFluoPlayer } from './player';
import type { FluoPlayer } from './player/kernel';
import type { FluoState } from './types';
import {
  createFluoRoom,
  joinFluoRoom,
  leaveFluo,
  getFluoRoomId,
  getFluoRoomCode,
  getFluoParticipants,
  getLastFluoPlayback,
  sendFluoChat,
  proposeFluoAnimeChange,
  voteFluoProposal,
  sendFluoSyncReady,
  notifyFluoLocalBuffering,
  isFluoBarrier,
  getFluoMyPeerId,
} from './sync';

export * from './types';
export * from './player';
export * from './sync';
export * from './rooms-api';
export { subscribeFluoCatalog } from './catalog-ws';
export { getFluoHttpBase, getFluoWsBase } from './endpoints';
export { logFluoAction, getFluoActionLog } from './action-log';

export type FluoPublicApi = {
  playerInstance: FluoPlayer;
  getState: () => FluoState;
  isPlaying: () => boolean;
  getProgress: () => number;
  getDuration: () => number;
  getVolume: () => number;
  getQueue: () => ReturnType<FluoPlayer['getQueue']>;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  setProgress: (t: number) => void;
  setVolume: (v: number) => void;
  setQuality: (q: string) => void;
  setRate: (r: number) => void;
  next: () => void;
  previous: () => void;
  load: FluoPlayer['load'];
  on: FluoPlayer['on'];
  /** Комната */
  getRoomId: () => string | null;
  getRoomCode: () => string | null;
  getParticipants: () => ReturnType<typeof getFluoParticipants>;
  getMyPeerId: () => string | null;
  getLastPlayback: () => ReturnType<typeof getLastFluoPlayback>;
  leaveRoom: () => void;
  sendChat: typeof sendFluoChat;
  proposeChange: typeof proposeFluoAnimeChange;
  vote: typeof voteFluoProposal;
  syncReady: typeof sendFluoSyncReady;
  notifyBuffering: typeof notifyFluoLocalBuffering;
  isBarrier: () => boolean;
  createRoom: typeof createFluoRoom;
  joinRoom: typeof joinFluoRoom;
  _reset: () => void;
};

export function createFluoPublicApi(): FluoPublicApi {
  const player = getFluoPlayer();
  return {
    playerInstance: player,
    getState: () => player.getState(),
    isPlaying: () => player.isPlaying(),
    getProgress: () => player.getProgress(),
    getDuration: () => player.getDuration(),
    getVolume: () => player.getVolume(),
    getQueue: () => player.getQueue(),
    play: () => player.play({ origin: 'user' }),
    pause: () => player.pause({ origin: 'user' }),
    togglePlayPause: () => player.togglePlayPause({ origin: 'user' }),
    setProgress: (t) => player.setProgress(t, { origin: 'user' }),
    setVolume: (v) => player.setVolume(v, { origin: 'user' }),
    setQuality: (q) => player.setQuality(q, { origin: 'user' }),
    setRate: (r) => player.setRate(r, { origin: 'user' }),
    next: () => player.next({ origin: 'user' }),
    previous: () => player.previous({ origin: 'user' }),
    load: (p, o) => player.load(p, o),
    on: (e, cb) => player.on(e, cb),
    getRoomId: () => getFluoRoomId(),
    getRoomCode: () => getFluoRoomCode(),
    getParticipants: () => getFluoParticipants(),
    getMyPeerId: () => getFluoMyPeerId(),
    getLastPlayback: () => getLastFluoPlayback(),
    leaveRoom: () => leaveFluo(),
    sendChat: sendFluoChat,
    proposeChange: proposeFluoAnimeChange,
    vote: voteFluoProposal,
    syncReady: sendFluoSyncReady,
    notifyBuffering: notifyFluoLocalBuffering,
    isBarrier: () => isFluoBarrier(),
    createRoom: createFluoRoom,
    joinRoom: joinFluoRoom,
    _reset: () => {
      leaveFluo();
      resetFluoPlayer();
      installWindowFluo();
    },
  };
}

export function installWindowFluo(): FluoPublicApi {
  const api = createFluoPublicApi();
  (window as unknown as { fluo: FluoPublicApi }).fluo = api;
  return api;
}

declare global {
  interface Window {
    fluo?: FluoPublicApi;
  }
}
