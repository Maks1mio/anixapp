/** Fluo — типы ядра плеера и совместного просмотра. */

export type FluoOrigin = 'user' | 'sync' | 'system';

export type FluoLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface FluoContent {
  releaseId: string;
  sourceId: string;
  ep: string;
  dubberId?: string;
  /** Имя озвучки (команда) */
  dubberName?: string;
  title: string;
  sourceName: string;
  /** Постер для каталога комнат */
  posterUrl?: string;
}

export type FluoRoomVisibility = 'public' | 'private' | 'closed';
/** Play / pause / seek / серии текущего тайтла */
export type FluoControlMode = 'host' | 'everyone';
/** Смена тайтла (другое аниме) */
export type FluoAnimeSelectMode = 'host' | 'everyone' | 'vote';

export interface FluoRoomSettings {
  controlMode: FluoControlMode;
  animeSelectMode: FluoAnimeSelectMode;
  chatEnabled: boolean;
}

export interface FluoCatalogActivity {
  peerId: string;
  profileId: number | null;
  login: string;
  avatar: string | null;
  action: 'play' | 'pause' | 'seek';
  ts: number;
  t: number;
}

export function fluoPlaybackControlMode(
  s: Partial<FluoRoomSettings> | null | undefined,
): FluoControlMode {
  return s?.controlMode === 'host' ? 'host' : 'everyone';
}

export function fluoAnimeSelectModeOf(
  s: (Partial<FluoRoomSettings> & { episodeVoteEnabled?: boolean; controlMode?: string }) | null | undefined,
): FluoAnimeSelectMode {
  const raw = s?.animeSelectMode;
  if (raw === 'host' || raw === 'everyone' || raw === 'vote') return raw;
  if (s?.controlMode === 'vote' || s?.episodeVoteEnabled === true) return 'vote';
  return 'everyone';
}

export function isFluoTitleChange(
  prev: { releaseId?: string } | null | undefined,
  next: { releaseId?: string } | null | undefined,
): boolean {
  const b = String(next?.releaseId ?? '').trim();
  if (!b) return false;
  const a = String(prev?.releaseId ?? '').trim();
  return !a || a !== b;
}

/** Голосование только при смене тайтла и если в комнате больше одного */
export function isFluoAnimeVoteEnabled(
  s: Partial<FluoRoomSettings> | null | undefined,
  participantCount = 0,
): boolean {
  return fluoAnimeSelectModeOf(s) === 'vote' && participantCount > 1;
}

export interface FluoCreateRoomOptions {
  name?: string;
  visibility?: FluoRoomVisibility;
  password?: string;
  settings?: Partial<FluoRoomSettings>;
}

/** Карточка комнаты в каталоге (без секретов). */
export interface FluoRoomListItem {
  roomId: string;
  code: string;
  name: string;
  visibility: FluoRoomVisibility;
  settings: FluoRoomSettings;
  participantCount: number;
  participants: Array<{
    login: string;
    avatar?: string | null;
    peerId?: string;
    profileId?: number | null;
  }>;
  hostPeerId: string | null;
  hostLogin: string | null;
  content: {
    releaseId?: string;
    title?: string;
    ep?: string;
    sourceName?: string;
    dubberName?: string;
    posterUrl?: string;
    previewUrl?: string | null;
    paused?: boolean;
    currentTime?: number;
    duration?: number;
  } | null;
  activity?: FluoCatalogActivity[];
  createdAt: number;
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
  name?: string;
  visibility?: FluoRoomVisibility;
  settings?: FluoRoomSettings;
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
