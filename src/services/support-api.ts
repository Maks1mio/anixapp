/**
 * Support tickets client (anixback /api/agent/support/*, same session as the agent chat).
 * Replies stream as SSE; the other side's messages are picked up by polling `fetchTicket(id, after)`.
 */
import { AgentApiError, agentJson, authedFetch, readSse } from './agent-api';
import { resolveAnixbackUploadUrl } from './anixback-endpoint';

export type TicketStatus = 'open' | 'pending' | 'closed';
export type TicketCategory = 'bug' | 'question' | 'idea' | 'account' | 'other';
export type TicketAuthor = 'user' | 'admin' | 'bot' | 'system';

export const TICKET_CATEGORIES: Record<TicketCategory, string> = {
  bug: 'Баг',
  question: 'Вопрос',
  idea: 'Идея',
  account: 'Аккаунт',
  other: 'Другое',
};

export const TICKET_STATUSES: Record<TicketStatus, string> = {
  open: 'Открыто',
  pending: 'Ждёт команду',
  closed: 'Закрыто',
};

export interface TicketImage {
  url: string;
  description?: string;
}

export interface Ticket {
  id: string;
  number: number;
  user_id: number;
  login: string | null;
  title: string;
  category: TicketCategory;
  status: TicketStatus;
  persona: string | null;
  summary: string | null;
  app_context: Record<string, unknown> | null;
  admin_joined: boolean;
  last_author: TicketAuthor | null;
  close_reason: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  unread?: boolean;
  messages?: number;
}

export interface TicketMessage {
  id: number;
  ticket_id: string;
  author_kind: TicketAuthor;
  author_id: number | null;
  author_login: string | null;
  persona: string | null;
  content: string;
  images: TicketImage[];
  created_at: string;
}

export type SupportStreamEvent =
  | { type: 'ticket'; ticket: Ticket }
  | { type: 'message'; message: TicketMessage }
  | { type: 'status'; text: string; activity: string; persona: string }
  | { type: 'delta'; text: string; persona: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** Stored screenshot path → loadable URL. */
export function ticketImageUrl(url: string): string {
  return resolveAnixbackUploadUrl(url);
}

export function fetchTickets(opts: { scope?: 'mine' | 'all'; status?: TicketStatus | 'active' } = {}) {
  const q = new URLSearchParams();
  if (opts.scope) q.set('scope', opts.scope);
  if (opts.status) q.set('status', opts.status);
  return agentJson<{ tickets: Ticket[]; admin: boolean; unread: number }>(`/agent/support/tickets?${q.toString()}`);
}

export function fetchTicket(id: string, after = 0) {
  return agentJson<{ ticket: Ticket; messages: TicketMessage[]; admin: boolean; viewer: { user_id: number; owner: boolean } }>(
    `/agent/support/tickets/${encodeURIComponent(id)}?after=${after}`,
  );
}

export function patchTicket(id: string, body: { action: 'close' | 'reopen' | 'pending' | 'open' | 'edit'; reason?: string; title?: string; category?: TicketCategory }) {
  return agentJson<{ ticket: Ticket | null }>(`/agent/support/tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** Upload one screenshot (png/jpeg/webp/gif ≤ 6 MB) → stored path. */
export async function uploadScreenshot(file: Blob): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new AgentApiError('bad_image', 'Можно прикреплять только PNG, JPEG, WebP или GIF');
  if (file.size > 6 * 1024 * 1024) throw new AgentApiError('bad_image', 'Картинка больше 6 МБ');
  let res: Response;
  try {
    res = await authedFetch('/agent/support/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    if (err instanceof AgentApiError) throw err;
    throw new AgentApiError('network', 'Не получилось загрузить картинку');
  }
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string; message?: string } | null;
  if (!res.ok || !data?.url) throw new AgentApiError(data?.error ?? 'http', data?.message ?? `Ошибка ${res.status}`, res.status);
  return data.url;
}

/** Create a ticket (no id) or reply in one; streams the stored message and the bot's answer. */
export async function postTicketMessage(
  ticketId: string | null,
  body: {
    message: string;
    images: string[];
    persona: string;
    category?: TicketCategory;
    client?: { version: string | null; platform: string | null };
  },
  onEvent: (e: SupportStreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const path = ticketId ? `/agent/support/tickets/${encodeURIComponent(ticketId)}/messages` : '/agent/support/tickets';
  let res: Response;
  try {
    res = await authedFetch(path, {
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
  if (!res.ok || !res.headers.get('content-type')?.includes('event-stream')) {
    const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new AgentApiError(data?.error ?? 'http', data?.message ?? `Ошибка ${res.status}`, res.status);
  }
  await readSse<SupportStreamEvent>(res, onEvent, signal);
}
