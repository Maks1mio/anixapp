import type { AgentAction, AgentReleaseCard } from '../../services/agent-api';

/** A chat bubble as rendered (stored message or the one being streamed). */
export interface ViewMessage {
  key: string;
  id: number | null;
  role: 'user' | 'assistant';
  content: string;
  releases: AgentReleaseCard[];
  actions: AgentAction[];
  feedback: number | null;
  streaming?: boolean;
  status?: string;
  error?: string;
}
