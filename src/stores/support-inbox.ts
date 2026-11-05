/** Unread support tickets, so the left rail can say «вам ответили» outside the support screen. */
import { get, writable } from 'svelte/store';
import { fetchAgentMe } from '../services/agent-api';
import { isAuthenticated } from './auth';

export interface SupportInbox {
  unread: number;
  admin: boolean;
}

export const supportInbox = writable<SupportInbox>({ unread: 0, admin: false });

export function setSupportInbox(unread: number, admin: boolean): void {
  supportInbox.set({ unread: Math.max(0, unread), admin });
}

/** Short line for the rail and the ticket that holds the badge. */
export function supportInboxLabel(inbox: SupportInbox): string {
  if (inbox.unread <= 0) return '';
  return inbox.admin ? 'Новый запрос' : 'Вам ответили';
}

let stopWatch: (() => void) | null = null;

export function watchSupportInbox(): () => void {
  if (stopWatch) return stopWatch;
  let alive = true;

  const refresh = async () => {
    if (!alive) return;
    if (!get(isAuthenticated)) {
      supportInbox.set({ unread: 0, admin: false });
      return;
    }
    try {
      const me = await fetchAgentMe();
      if (!alive) return;
      supportInbox.set({
        unread: me.support?.unread ?? 0,
        admin: me.support?.admin ?? false,
      });
    } catch {
      /* guest or offline */
    }
  };

  const unsub = isAuthenticated.subscribe(() => { void refresh(); });
  void refresh();
  const timer = setInterval(() => void refresh(), 45_000);

  stopWatch = () => {
    alive = false;
    unsub();
    clearInterval(timer);
    stopWatch = null;
  };
  return stopWatch;
}
