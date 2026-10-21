/**
 * Support tickets client (anixback /api/agent/support/*, same session as the agent chat).
 * Replies stream as SSE; the other side's messages are picked up by polling `fetchTicket(id, after)`,
 * which also returns `live` — the bot answer being written right now (seen by every participant).
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

/** What attachment moderation found (server-side check). */
export type ModerationFlag = 'nsfw' | 'gore' | 'malware' | 'injection' | 'personal_data' | 'archive';

export const MODERATION_FLAGS: Record<ModerationFlag, string> = {
  nsfw: '18+',
  gore: 'жестокость',
  malware: 'исполняемый / опасный файл',
  injection: 'попытка подменить инструкции',
  personal_data: 'личные данные',
  archive: 'архив',
};

/** Flags that hide the attachment (an archive is only a caution). */
export function blockingFlags(flags: ModerationFlag[] | undefined): ModerationFlag[] {
  return (flags ?? []).filter((f) => f !== 'archive');
}

export interface TicketImage {
  url: string;
  description?: string;
  flags?: ModerationFlag[];
}

export interface TicketFile {
  id: string;
  name: string;
  size: number;
  kind: 'text' | 'binary';
  flags?: ModerationFlag[];
}

/** The bot answer being written in a ticket right now. */
export interface TicketLive {
  persona: string | null;
  status: string | null;
  activity: string | null;
  text: string;
  started_at: string;
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
  /** An attachment (or the bot) raised a moderation flag. */
  flagged?: boolean;
  flag_reason?: string | null;
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
  /** Older anixback builds don't send it. */
  files?: TicketFile[];
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
  return agentJson<{
    ticket: Ticket;
    messages: TicketMessage[];
    admin: boolean;
    viewer: { user_id: number; owner: boolean };
    live?: TicketLive | null;
  }>(
    `/agent/support/tickets/${encodeURIComponent(id)}?after=${after}`,
  );
}

export function patchTicket(id: string, body: { action: 'close' | 'reopen' | 'pending' | 'open' | 'edit' | 'unflag'; reason?: string; title?: string; category?: TicketCategory }) {
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

export const MAX_FILE_BYTES = 3 * 1024 * 1024;

/** Upload any other file (log, config, text… ≤ 3 MB). The server checks it on arrival. */
export async function uploadTicketFile(file: File): Promise<TicketFile> {
  if (file.size > MAX_FILE_BYTES) throw new AgentApiError('bad_file', 'Файл больше 3 МБ');
  let res: Response;
  try {
    res = await authedFetch(`/agent/support/upload-file?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    if (err instanceof AgentApiError) throw err;
    throw new AgentApiError('network', 'Не получилось загрузить файл');
  }
  const data = (await res.json().catch(() => null)) as (TicketFile & { error?: string; message?: string }) | null;
  if (!res.ok || !data?.id) throw new AgentApiError(data?.error ?? 'http', data?.message ?? `Ошибка ${res.status}`, res.status);
  return data;
}

/** Download an attached file (needs the session header, so not a plain link). */
export async function downloadTicketFile(f: TicketFile): Promise<void> {
  const res = await authedFetch(`/agent/support/files/${encodeURIComponent(f.id)}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new AgentApiError(data?.error ?? 'http', data?.message ?? `Ошибка ${res.status}`, res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Create a ticket (no id) or reply in one; streams the stored message and the bot's answer. */
export async function postTicketMessage(
  ticketId: string | null,
  body: {
    message: string;
    images: string[];
    /** ids from uploadTicketFile */
    files?: string[];
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
