/**
 * AAWA chat agent client (anixback /api/agent/*).
 * Auth: the bridge trades the Anixart token for a session (`client.agentSession`),
 * the renderer only keeps that opaque id and re-requests it on 401.
 */
import { getAnixbackDirectOrigin, getApiBase } from './anixback-endpoint';

export interface AgentQuota {
  tier: 'teer-1' | 'teer-2' | 'teer-3' | null;
  limit: number;
  used: number;
  remaining: number;
  resets_at: string;
}

export interface AgentReleaseCard {
  id: number;
  title: string;
  title_original: string | null;
  year: number | null;
  category: string | null;
  status: string | null;
  episodes: string | null;
  grade: number | null;
  votes: number | null;
  genres: string[];
  image: string | null;
  adult?: boolean;
}

export interface AgentAction {
  kind:
    | 'open_release'
    | 'open_route'
    | 'open_settings'
    | 'search'
    | 'open_support'
    | 'open_profile'
    | 'add_to_list'
    | 'add_favorite'
    | 'open_url'
    | 'open_ticket';
  label: string;
  release_id?: number;
  route?: string;
  tab?: string;
  query?: string;
  list?: 'watching' | 'planned' | 'completed' | 'hold_on' | 'dropped';
  url?: string;
  /** open_ticket: support ticket id */
  ticket_id?: string;
}

/** Picture in the gallery under an answer (frames, art, photos from the internet). */
export interface AgentImage {
  url: string;
  thumb?: string;
  title: string | null;
  source: string;
  page?: string | null;
}

export interface AgentMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  attachments: { releases?: AgentReleaseCard[]; actions?: AgentAction[]; images?: AgentImage[] } | null;
  feedback: number | null;
  created_at: string;
  /** Who answered: kanna | asya (null for old messages and user messages). */
  persona?: string | null;
}

export interface AgentConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: number;
  persona?: string | null;
}

export interface AgentPersonaInfo {
  id: string;
  name: string;
  tagline: string;
  starters: string[];
}

export interface AgentMe {
  name: string;
  user_id: number;
  login: string | null;
  quota: AgentQuota;
  starters: string[];
  /** Older anixback builds don't send it — the app falls back to its own looks. */
  personas?: AgentPersonaInfo[];
  /** Support tab: is the viewer on the team, and how many tickets have news. */
  support?: { admin: boolean; unread: number };
  available: boolean;
}

export type AgentStreamEvent =
  | { type: 'meta'; conversation_id: string; title: string; user_message_id: number | null; persona?: string }
  | { type: 'status'; text: string; activity?: string }
  | { type: 'delta'; text: string }
  | { type: 'cards'; releases: AgentReleaseCard[] }
  | { type: 'images'; images: AgentImage[] }
  | { type: 'actions'; actions: AgentAction[] }
  | { type: 'done'; message: AgentMessage; quota: AgentQuota }
  | { type: 'error'; code: string; message: string; quota?: AgentQuota };

export class AgentApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

let session: { id: string; exp: number; origin: string } | null = null;
let sessionPromise: Promise<string> | null = null;

async function requestSession(): Promise<string> {
  // The bridge needs the real origin (its allow-list rejects the dev Vite proxy path).
  const origin = getAnixbackDirectOrigin();
  const bridge = window.anixApi?.client?.agentSession;
  if (!bridge) throw new AgentApiError('no_bridge', 'Обновите приложение, чтобы поговорить с помощницей');
  const res = await bridge(origin);
  if (!res?.ok || !res.session) {
    if (res?.error === 'not_logged_in' || res?.error === 'invalid_token') {
      throw new AgentApiError('not_logged_in', 'Войдите в аккаунт Anixart, чтобы поговорить с помощницей');
    }
    if (res?.error === 'anixart_unavailable') {
      throw new AgentApiError('anixart_unavailable', 'Anixart сейчас не отвечает — попробуйте чуть позже');
    }
    throw new AgentApiError('session_failed', 'Не удалось подключиться к помощнице', res?.status ?? 0);
  }
  const exp = res.expires_at ? Date.parse(res.expires_at) : Date.now() + 60 * 60 * 1000;
  session = { id: res.session, exp, origin };
  return res.session;
}

async function getSession(force = false): Promise<string> {
  const origin = getAnixbackDirectOrigin();
  if (!force && session && session.origin === origin && session.exp - Date.now() > 60_000) return session.id;
  sessionPromise ??= requestSession().finally(() => {
    sessionPromise = null;
  });
  return sessionPromise;
}

/** Drop the cached session (logout / account switch). */
export function resetAgentSession(): void {
  session = null;
}

export async function authedFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const id = await getSession();
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${id}` },
  });
  if (res.status === 401 && retry) {
    session = null;
    await getSession(true);
    return authedFetch(path, init, false);
  }
  return res;
}

export async function agentJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await authedFetch(path, {
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
      signal: init.signal ?? AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (err instanceof AgentApiError) throw err;
    throw new AgentApiError('network', 'Нет связи с сервером');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!res.ok) throw new AgentApiError(data?.error ?? 'http', data?.message ?? `Ошибка ${res.status}`, res.status);
  return data as T;
}

export const fetchAgentMe = () => agentJson<AgentMe>('/agent/me');

export const fetchConversations = () =>
  agentJson<{ conversations: AgentConversation[] }>('/agent/conversations').then((r) => r.conversations);

export const fetchConversation = (id: string) =>
  agentJson<{ conversation: { id: string; title: string }; messages: AgentMessage[] }>(
    `/agent/conversations/${encodeURIComponent(id)}`,
  );

export const renameConversation = (id: string, title: string) =>
  agentJson<{ ok: boolean }>(`/agent/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });

export const deleteConversation = (id: string) =>
  agentJson<{ ok: boolean }>(`/agent/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const sendFeedback = (messageId: number, value: -1 | 0 | 1) =>
  agentJson<{ ok: boolean }>(`/agent/messages/${messageId}/feedback`, { method: 'POST', body: JSON.stringify({ value }) });

/**
 * Send a message and stream the answer. Resolves when the stream ends.
 * Limit / no-tier answers come as AgentApiError (429) before any event.
 */
export async function streamAgentChat(
  body: {
    message?: string;
    conversation_id?: string | null;
    regenerate?: boolean;
    allow_profile: boolean;
    /** Collected by the app (services/agent-profile.ts) — the agent reads it on demand. */
    profile?: unknown;
    /** kanna | asya */
    persona?: string;
    /** App version / platform / where the chat was opened from — helps with app questions. */
    client?: { version: string | null; platform: string | null; route: string | null };
  },
  onEvent: (e: AgentStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await authedFetch('/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof AgentApiError) throw err;
    if (signal.aborted) return;
    throw new AgentApiError('network', 'Нет связи с сервером');
  }
  if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('event-stream')) {
    const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new AgentApiError(data?.error ?? 'http', data?.message ?? `Ошибка ${res.status}`, res.status);
  }

  await readSse(res, onEvent, signal);
}

/** Read a `text/event-stream` response, one JSON `data:` payload per event. */
export async function readSse<E>(res: Response, onEvent: (e: E) => void, signal: AbortSignal): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        try {
          onEvent(JSON.parse(data) as E);
        } catch {
          /* malformed event — skip */
        }
      }
    }
  } catch (err) {
    if (signal.aborted) return;
    throw new AgentApiError('network', 'Соединение прервалось');
  }
}
