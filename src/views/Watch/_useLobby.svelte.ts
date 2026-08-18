import type { LobbyParticipant, LobbyActivityEntry, LobbyChatMessage, ProposalData, VoteState } from './_types';

const LOG_MAX = 5;
const LOG_TTL = 10000;

export class LobbyState {
  participants = $state<LobbyParticipant[]>([]);
  activityLog  = $state<LobbyActivityEntry[]>([]);
  chatMessages = $state<LobbyChatMessage[]>([]);
  roomCode     = $state('');
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

  addChat(msg: LobbyChatMessage) {
    if (this.chatMessages.some((m) => m.id === msg.id)) return;
    this.chatMessages = [...this.chatMessages, msg].slice(-200);
  }

  resetRoom() {
    this.participants = [];
    this.chatMessages = [];
    this.roomCode = '';
    this.voteState = 'hidden';
    this.voteProposal = null;
  }

  destroy() {
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.logTimers.forEach(t => clearTimeout(t));
  }
}
