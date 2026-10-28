import type { LobbyParticipant, LobbyActivityEntry, LobbyChatMessage, ProposalData, VoteState } from './_types';

const LOG_MAX = 5;
const LOG_TTL = 10000;
/** Предел Date в JS: за ним toISOString() бросает RangeError. */
const MAX_DATE_MS = 8.64e15;

/** Сообщения приходят от других участников комнаты — не доверяем типам. */
function normalizeChatMessage(m: unknown): LobbyChatMessage | null {
  if (!m || typeof m !== 'object') return null;
  const r = m as Record<string, unknown>;
  const id = typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id) : '';
  const text = typeof r.text === 'string' ? r.text.slice(0, 500) : '';
  if (!id || !text) return null;
  const ts = Number(r.ts);
  return {
    id,
    text,
    login: typeof r.login === 'string' && r.login ? r.login : 'Участник',
    avatar: typeof r.avatar === 'string' ? r.avatar : null,
    ts: Number.isFinite(ts) && Math.abs(ts) <= MAX_DATE_MS ? ts : Date.now(),
    peerId: typeof r.peerId === 'string' ? r.peerId : null,
    self: r.self === true,
    system: r.system === true,
  };
}

export class LobbyState {
  participants = $state<LobbyParticipant[]>([]);
  activityLog  = $state<LobbyActivityEntry[]>([]);
  chatMessages = $state<LobbyChatMessage[]>([]);
  roomCode     = $state('');
  hostPeerId   = $state<string | null>(null);
  myPeerId     = $state<string | null>(null);
  chatEnabled  = $state(true);
  controlMode  = $state<'host' | 'everyone'>('everyone');
  animeSelectMode = $state<'host' | 'everyone' | 'vote'>('everyone');
  voteState    = $state<VoteState>('hidden');
  voteProposal = $state<ProposalData | null>(null);
  waitingTitle = $state('');
  resultText   = $state('');
  resultType   = $state<'accepted' | 'rejected'>('accepted');

  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private logTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private logIdCounter = 0;

  showResult(text: string, type: 'accepted' | 'rejected') {
    this.voteState  = 'result';
    this.resultText = text;
    this.resultType = type;
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.resultTimer = setTimeout(() => { this.voteState = 'hidden'; }, 3000);
  }

  handleVote(proposalId: string, accept: boolean) {
    (window as any).electron?.sendLobbyVote?.(proposalId, accept);
    if (!window.electron?.sendLobbyVote) {
      window.dispatchEvent(new CustomEvent('lobby:voteFromPlayer', { detail: { proposalId, accept } }));
    }
    if (!accept) this.voteState = 'hidden';
  }

  addLogEntry(entry: LobbyActivityEntry) {
    const id = ++this.logIdCounter;
    this.activityLog = [...this.activityLog, { ...entry, _id: id } as any];
    if (this.activityLog.length > LOG_MAX) this.activityLog = this.activityLog.slice(-LOG_MAX);
    const t = setTimeout(() => {
      this.activityLog = this.activityLog.filter((x: any) => x._id !== id);
      this.logTimers.delete(id);
    }, LOG_TTL);
    this.logTimers.set(id, t);
  }

  addChat(raw: LobbyChatMessage) {
    const msg = normalizeChatMessage(raw);
    if (!msg) return;
    if (this.chatMessages.some((m) => m.id === msg.id)) return;
    this.chatMessages = [...this.chatMessages, msg].slice(-200);
  }

  setChatHistory(messages: LobbyChatMessage[]) {
    if (!Array.isArray(messages) || messages.length === 0) return;
    const byId = new Map<string, LobbyChatMessage>();
    for (const m of this.chatMessages) byId.set(m.id, m);
    for (const raw of messages) {
      const m = normalizeChatMessage(raw);
      if (m) byId.set(m.id, m);
    }
    this.chatMessages = [...byId.values()]
      .sort((a, b) => a.ts - b.ts)
      .slice(-200);
  }

  resetRoom() {
    this.participants = [];
    this.chatMessages = [];
    this.roomCode = '';
    this.hostPeerId = null;
    this.myPeerId = null;
    this.chatEnabled = true;
    this.controlMode = 'everyone';
    this.animeSelectMode = 'everyone';
    this.voteState = 'hidden';
    this.voteProposal = null;
  }

  destroy() {
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.logTimers.forEach(t => clearTimeout(t));
  }
}
