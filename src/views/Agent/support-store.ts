/** Which half of the agent tab is open (chats / support) and a ticket to open next. */
import { get, writable } from 'svelte/store';
import { currentPath, navigate } from '../../stores/navigation';

export type AgentMode = 'chat' | 'support';

/** Survives leaving the tab (module state), like the open chat. */
export const agentMode = writable<AgentMode>('chat');

/** Set by «Открыть обращение» buttons; the support view picks it up and clears it. */
export const requestedTicket = writable<string | null>(null);

export function openSupportTicket(id: string | null): void {
  requestedTicket.set(id);
  agentMode.set('support');
  if (get(currentPath) !== '/agent') navigate('/agent');
}
