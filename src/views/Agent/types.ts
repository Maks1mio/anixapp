import type { AgentAction, AgentImage, AgentReleaseCard } from '../../services/agent-api';
import type { PersonaId } from './personas';

/** A chat bubble as rendered (stored message or the one being streamed). */
export interface ViewMessage {
  key: string;
  id: number | null;
  role: 'user' | 'assistant';
  content: string;
  releases: AgentReleaseCard[];
  actions: AgentAction[];
  /** Gallery (frames / art / photos) — optional, older answers have none. */
  images?: AgentImage[];
  feedback: number | null;
  /** Who answered (assistant). */
  persona: PersonaId;
  streaming?: boolean;
  status?: string;
  /** Current tool activity (search / web / profile …) — drives the face. */
  activity?: string;
  /** Steps done while answering («Ищу в каталоге…»), shown collapsed after the answer. */
  steps?: string[];
  error?: string;
}
