/**
 * Fluo rooms catalog API — list / create / join helpers.
 */

import { getFluoHttpBase } from './endpoints';
import type {
  FluoCreateRoomOptions,
  FluoContent,
  FluoRoomListItem,
  FluoRoomPublic,
  FluoRoomSettings,
} from './types';
import { isUsableFluoContent } from './types';

type ProfilePayload = {
  profileId?: number;
  login?: string;
  avatar?: string | null;
  deviceId?: string | null;
};

async function fetchFluo(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${getFluoHttpBase()}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
}

export async function listFluoRooms(): Promise<FluoRoomListItem[]> {
  const res = await fetchFluo('/rooms');
  if (!res.ok) throw new Error(`Fluo rooms: ${res.status}`);
  const data = (await res.json()) as { rooms?: FluoRoomListItem[] };
  return Array.isArray(data.rooms) ? data.rooms : [];
}

export type FluoCreateRoomResult = {
  roomId: string;
  code: string;
  myPeerId?: string;
  name?: string;
  visibility?: string;
  settings?: FluoRoomSettings;
};

export async function createFluoRoomWithOptions(
  profile: ProfilePayload,
  options: FluoCreateRoomOptions = {},
  seed?: Partial<FluoContent> & { currentTime?: number; paused?: boolean } | null,
): Promise<FluoCreateRoomResult> {
  const body: Record<string, unknown> = {
    ...profile,
    name: options.name,
    visibility: options.visibility,
    password: options.password,
    settings: options.settings,
  };
  if (seed && isUsableFluoContent(seed)) {
    body.clock = {
      content: {
        releaseId: String(seed.releaseId),
        sourceId: String(seed.sourceId ?? ''),
        ep: String(seed.ep),
        dubberId: seed.dubberId != null ? String(seed.dubberId) : undefined,
        title: String(seed.title ?? ''),
        sourceName: String(seed.sourceName ?? ''),
        dubberName: seed.dubberName,
        posterUrl: seed.posterUrl,
      },
      paused: seed.paused !== false,
      mediaOrigin: typeof seed.currentTime === 'number' ? seed.currentTime : 0,
    };
  }
  const res = await fetchFluo('/create', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    let message = `Fluo create: ${res.status}`;
    let code: string | undefined;
    try {
      const err = (await res.json()) as { error?: string; message?: string };
      if (err.message) message = err.message;
      code = err.error;
    } catch {
      /* ignore */
    }
    const e = new Error(message) as Error & { code?: string };
    e.code = code;
    throw e;
  }
  return (await res.json()) as FluoCreateRoomResult;
}

export class FluoJoinError extends Error {
  constructor(
    public readonly code: 'banned' | 'password_required' | 'password_invalid' | 'not_found' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'FluoJoinError';
  }
}

export async function joinFluoRoomWithPassword(
  code: string,
  profile: ProfilePayload,
  password?: string | null,
): Promise<FluoRoomPublic> {
  const res = await fetchFluo('/join', {
    method: 'POST',
    body: JSON.stringify({
      code: code.trim(),
      ...profile,
      ...(password != null && password !== '' ? { password } : {}),
    }),
  });
  if (res.status === 403) {
    throw new FluoJoinError('banned', 'Вас выгнали из этой комнаты');
  }
  if (res.status === 401) {
    let errCode: 'password_required' | 'password_invalid' = 'password_invalid';
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error === 'password_required') errCode = 'password_required';
    } catch {
      /* ignore */
    }
    throw new FluoJoinError(
      errCode,
      errCode === 'password_required' ? 'Нужен пароль' : 'Неверный пароль',
    );
  }
  if (res.status === 404) {
    throw new FluoJoinError('not_found', 'Комната не найдена');
  }
  if (!res.ok) {
    throw new FluoJoinError('unknown', `Fluo join: ${res.status}`);
  }
  return (await res.json()) as FluoRoomPublic;
}

export type { FluoRoomListItem, FluoCreateRoomOptions, FluoRoomSettings };
