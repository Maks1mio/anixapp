/** Fluo — типы ядра плеера и совместного просмотра. */

export type FluoOrigin = 'user' | 'sync' | 'system';

export type FluoLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface FluoContent {
  releaseId: string;
  sourceId: string;
  ep: string;
  dubberId?: string;
  title: string;
  sourceName: string;
}

export interface FluoEpisodeItem {
  position: number;
  name?: string;
}

export interface FluoState {
  content: FluoContent | null;
  paused: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  quality: string;
  availableQualities: Record<string, string>;
  buffering: boolean;
  loadState: FluoLoadState;
  /** Эпизоды текущего источника (очередь next/previous). */
  queue: FluoEpisodeItem[];
}

export type FluoEventMap = {
  state: FluoState;
  timeupdate: { currentTime: number; duration: number; origin: FluoOrigin };
  play: { origin: FluoOrigin };
  pause: { origin: FluoOrigin };
  seek: { currentTime: number; origin: FluoOrigin };
  ended: { origin: FluoOrigin };
  buffering: { buffering: boolean; origin: FluoOrigin };
  error: { message: string; origin: FluoOrigin };
  content: { content: FluoContent | null; origin: FluoOrigin };
};

export type FluoEventName = keyof FluoEventMap;

export interface FluoLoadParams extends FluoContent {
  seek?: number;
  paused?: boolean;
  /** Прямой URL (если уже резолвлен). */
  url?: string;
  useVideo?: boolean;
}

export interface FluoCommandOptions {
  origin?: FluoOrigin;
}

/** Серверные медиа-часы комнаты. */
export interface FluoClockState {
  content: FluoContent | null;
  paused: boolean;
  /** Позиция в момент t0 (секунды). */
  mediaOrigin: number;
  /** Серверное время (ms), когда mediaOrigin был зафиксирован. */
  t0: number;
  rate: number;
  seq: number;
}

export interface FluoParticipant {
  id: number | string;
  peerId?: string;
  login: string;
  avatar?: string | null;
  deviceId?: string | null;
}

export interface FluoRoomPublic {
  roomId: string;
  code: string;
  myPeerId?: string;
  participants: FluoParticipant[];
  clock: FluoClockState | null;
  hostPeerId?: string | null;
}

export function emptyFluoState(): FluoState {
  return {
    content: null,
    paused: true,
    currentTime: 0,
    duration: 0,
    volume: 100,
    muted: false,
    playbackRate: 1,
    quality: '',
    availableQualities: {},
    buffering: false,
    loadState: 'idle',
    queue: [],
  };
}

export function isUsableFluoContent(c: Partial<FluoContent> | null | undefined): boolean {
  if (!c) return false;
  const rid = String(c.releaseId ?? '').trim();
  const ep = String(c.ep ?? '').trim();
  if (!rid || ep === '') return false;
  const n = Number(ep);
  return Number.isFinite(n) && n >= 0;
}
