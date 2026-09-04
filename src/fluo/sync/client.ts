/**
 * Fluo sync — совместный просмотр поверх fluo.player (серверные медиа-часы).
 */

import { getFluoHttpBase, getFluoWsBase } from '../endpoints';
import { getFluoPlayer } from '../player';
import {
  isUsableFluoContent,
  type FluoClockState,
  type FluoContent,
  type FluoParticipant,
  type FluoRoomPublic,
} from '../types';
import { logFluoAction } from '../action-log';

export type FluoProfilePayload = {
  profileId?: number;
  login?: string;
  avatar?: string | null;
  deviceId?: string | null;
};

type QueuedCmd =
  | { type: 'play' | 'pause' | 'seek' | 'changeEpisode'; content: FluoContent; currentTime: number; paused: boolean }
  | { type: 'chat'; text: string; login: string; avatar?: string | null }
  | { type: 'propose'; content: Partial<FluoContent> }
  | { type: 'vote'; proposalId: string; accept: boolean };

let roomId: string | null = null;
let roomCode: string | null = null;
let myPeerId: string | null = null;
let hostPeerId: string | null = null;
let participants: FluoParticipant[] = [];
let clock: FluoClockState | null = null;
let ws: WebSocket | null = null;
let activeWs: WebSocket | null = null;
let intentionalClose = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let rttMs = 40;
let softRateTimer: ReturnType<typeof setTimeout> | null = null;
let driftTimer: ReturnType<typeof setInterval> | null = null;
let pendingOutbound: QueuedCmd[] = [];
let unsubPlayer: (() => void) | null = null;
let roomBarrier = false;
let lastAppliedSeq = 0;
let lastEmittedPaused: boolean | null = null;
let localControlUntil = 0;
let lastPartySignature = '';
/** После join не даём локальным play/seek с t≈0 откатить живые часы комнаты. */
let joinGraceUntil = 0;

const RECONNECT_MS = 3000;
const MAX_RECONNECT = 10;
const SOFT_LO = 0.35;
const HARD_SEEK = 0.8;
/** После локального play/pause/seek не принимать remote clock (иначе snapshot откатывает действие). */
const LOCAL_CONTROL_GRACE_MS = 1800;

export function markFluoLocalControl(ms = LOCAL_CONTROL_GRACE_MS): void {
  localControlUntil = Date.now() + ms;
}

async function fetchFluo(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${getFluoHttpBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
}

function contentFromState(): FluoContent | null {
  const s = getFluoPlayer().getState();
  return s.content;
}

function emitParticipants(): void {
  const hostSig = hostPeerId ?? '';
  const sig = `${hostSig}|${participants.map((p) => String(p.peerId ?? p.id)).sort().join(',')}`;
  if (sig === lastPartySignature) return;
  lastPartySignature = sig;
  window.dispatchEvent(new CustomEvent('fluo:participants', {
    detail: { participants: participants.slice(), hostPeerId },
  }));
  window.dispatchEvent(new CustomEvent('lobby:participantsChanged', {
    detail: { participants: participants.slice(), hostPeerId },
  }));
}

function emitSession(): void {
  const session = {
    inLobby: !!roomId,
    roomId,
    roomCode,
    participants: participants.slice(),
    hostPeerId,
    myPeerId,
  };
  window.dispatchEvent(new CustomEvent('fluo:session', { detail: session }));
  window.dispatchEvent(new CustomEvent('lobby:session', { detail: session }));
}

export function computeFluoPosition(c: FluoClockState, now = Date.now()): number {
  if (c.paused) return c.mediaOrigin;
  const elapsed = Math.max(0, (now - c.t0) / 1000) * (c.rate || 1);
  return Math.max(0, c.mediaOrigin + elapsed);
}

function computePosition(c: FluoClockState, now = Date.now()): number {
  return computeFluoPosition(c, now + rttMs / 2);
}

function applyClockToPlayer(c: FluoClockState, forceHard = false): void {
  const prev = clock;
  clock = c;
  const target = computePosition(c);
  const seq = typeof c.seq === 'number' ? c.seq : 0;
  const pausedChanged = lastEmittedPaused === null || lastEmittedPaused !== c.paused;
  const contentChanged = !prev?.content
    || !c.content
    || prev.content.releaseId !== c.content.releaseId
    || prev.content.ep !== c.content.ep
    || prev.content.sourceId !== c.content.sourceId
    || String(prev.content.dubberId ?? '') !== String(c.content.dubberId ?? '');
  const seqAdvanced = seq > lastAppliedSeq;

  // Пока пользователь только что жал play/pause/seek — не откатываем snapshot'ом.
  if (!forceHard && Date.now() < localControlUntil) {
    return;
  }

  // Тик без нового seq и без смены pause/контента — не шлём IPC (иначе Discord/плеер спам).
  if (!forceHard && seq > 0 && seq < lastAppliedSeq) {
    return;
  }
  const needsIpc = forceHard || seqAdvanced || pausedChanged || contentChanged || roomBarrier;
  if (!needsIpc && !forceHard) {
    return;
  }

  if (seqAdvanced) lastAppliedSeq = seq;
  lastEmittedPaused = c.paused;

  const playback = c.content
    ? {
        ...c.content,
        paused: c.paused || roomBarrier,
        currentTime: target,
      }
    : null;

  if (playback && needsIpc) {
    window.dispatchEvent(new CustomEvent('lobby:remotePlayback', {
      detail: {
        playback,
        fromPeerId: null,
        action: pausedChanged ? (c.paused ? 'pause' : 'play') : (forceHard ? 'seek' : null),
      },
    }));
    logFluoAction({
      origin: 'server',
      action: `clock.apply${pausedChanged ? (c.paused ? '.pause' : '.play') : ''}`,
      detail: { seq, t: Math.round(target * 10) / 10, paused: c.paused },
      via: 'ws',
    });
  }

  const player = getFluoPlayer();
  const hasLocalVideo = typeof document !== 'undefined'
    && !!document.querySelector('video.watch-page__video, .watch-page video, video');
  if (!hasLocalVideo) {
    return;
  }

  const local = player.getProgress();
  const drift = Math.abs(local - target);
  let softRate: number | undefined;
  if (!c.paused && !forceHard && drift >= SOFT_LO && drift < HARD_SEEK) {
    softRate = local < target ? 1.05 : 0.95;
    if (softRateTimer) clearTimeout(softRateTimer);
    softRateTimer = setTimeout(() => {
      softRateTimer = null;
      if (roomId) player.setRate(1, { origin: 'sync' });
    }, 2500);
  } else if (softRateTimer && (forceHard || drift >= HARD_SEEK || c.paused)) {
    clearTimeout(softRateTimer);
    softRateTimer = null;
    player.setRate(1, { origin: 'sync' });
  }

  // Мягкий тик без hard: только rate, без seek/play echo.
  if (!forceHard && !pausedChanged && !contentChanged && drift < HARD_SEEK) {
    if (softRate != null) player.setRate(softRate, { origin: 'sync' });
    return;
  }

  player.applyClockSnapshot({
    content: c.content,
    paused: c.paused || roomBarrier,
    currentTime: target,
    softRate: forceHard || drift >= HARD_SEEK ? undefined : softRate,
  });
}

function startDriftLoop(): void {
  stopDriftLoop();
  // Drift-коррекция только в документе с <video>. На Electron main — только server clock/snapshot.
  driftTimer = setInterval(() => {
    if (!clock || !roomId || roomBarrier) return;
    if (Date.now() < localControlUntil) return;
    try {
      if (!document.querySelector('video')) return;
    } catch {
      return;
    }
    applyClockToPlayer(clock, false);
  }, 1000);
}

function stopDriftLoop(): void {
  if (driftTimer) {
    clearInterval(driftTimer);
    driftTimer = null;
  }
}

function wirePlayerEcho(): void {
  unsubPlayer?.();
  // В Electron WS на main, а video в player — echo с main даст дубли с IPC pushCommand.
  // Echo только если в этом документе есть video ядра.
  const player = getFluoPlayer();
  const hasVideo = () => {
    try {
      return !!document.querySelector('video');
    } catch {
      return false;
    }
  };
  if (!hasVideo()) {
    unsubPlayer = null;
    return;
  }
  const offs = [
    player.on('play', ({ origin }) => {
      if (origin !== 'user' || !roomId || roomBarrier) return;
      pushTransport('play');
    }),
    player.on('pause', ({ origin }) => {
      if (origin !== 'user' || !roomId || roomBarrier) return;
      pushTransport('pause');
    }),
    player.on('seek', ({ origin }) => {
      if (origin !== 'user' || !roomId || roomBarrier) return;
      pushTransport('seek');
    }),
    player.on('content', ({ origin }) => {
      if (origin !== 'user' || !roomId) return;
      pushTransport('changeEpisode');
    }),
  ];
  unsubPlayer = () => offs.forEach((u) => u());
}

function pushTransport(action: 'play' | 'pause' | 'seek' | 'changeEpisode'): void {
  const content = contentFromState();
  if (!content || !isUsableFluoContent(content)) return;
  const player = getFluoPlayer();
  pushFluoCommand(action, {
    ...content,
    currentTime: player.getProgress(),
    paused: action === 'pause' ? true : action === 'play' ? false : player.getState().paused,
  });
}

function sendWs(msg: Record<string, unknown>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}

function flushOutbound(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const q = pendingOutbound.splice(0);
  for (const cmd of q) {
    if (cmd.type === 'chat') {
      sendWs({ type: 'chat', text: cmd.text, login: cmd.login, avatar: cmd.avatar ?? null });
    } else if (cmd.type === 'propose') {
      sendWs({ type: 'propose_change', payload: cmd.content });
    } else if (cmd.type === 'vote') {
      sendWs({ type: 'vote_change', proposalId: cmd.proposalId, accept: cmd.accept });
    } else {
      sendWs({
        type: 'command',
        action: cmd.type,
        payload: {
          ...cmd.content,
          currentTime: cmd.currentTime,
          paused: cmd.paused,
        },
      });
    }
  }
}

/** Показать активное голосование, если вошли в комнату после его старта. */
function emitActiveProposalFromJoin(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const ap = raw as {
    proposalId?: unknown;
    proposerPeerId?: unknown;
    proposerLogin?: unknown;
    playback?: unknown;
    expiresAt?: unknown;
  };
  const proposalId = ap.proposalId != null ? String(ap.proposalId) : '';
  if (!proposalId) return;
  const proposerPeerId = ap.proposerPeerId != null ? String(ap.proposerPeerId) : '';
  const expiresAt = typeof ap.expiresAt === 'number' ? ap.expiresAt : undefined;

  // Инициатор снова подключился — ждёт ответов, а не голосует сам.
  if (proposerPeerId && myPeerId && proposerPeerId === myPeerId) {
    window.dispatchEvent(new CustomEvent('lobby:proposalSentLocal', {
      detail: { newPlayback: ap.playback ?? null },
    }));
    return;
  }

  window.dispatchEvent(new CustomEvent('lobby:proposalNew', {
    detail: {
      proposalId,
      proposerPeerId: proposerPeerId || null,
      proposerLogin: typeof ap.proposerLogin === 'string' ? ap.proposerLogin : 'Участник',
      playback: ap.playback ?? null,
      expiresAt,
    },
  }));
  logFluoAction({
    origin: 'server',
    action: 'ws.joined.active_proposal',
    detail: { proposalId, expiresAt: expiresAt ?? null },
    via: 'ws',
  });
}

/** Подгрузить историю чата комнаты при join. */
function emitChatHistoryFromJoin(raw: unknown): void {
  if (!Array.isArray(raw) || raw.length === 0) return;
  const messages = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const m = item as Record<string, unknown>;
      const text = String(m.text ?? '').trim();
      const id = m.id != null ? String(m.id) : '';
      if (!text || !id) return null;
      const from = m.fromPeerId != null ? String(m.fromPeerId) : '';
      return {
        id,
        text: text.slice(0, 500),
        login: String(m.login ?? 'Участник'),
        avatar: typeof m.avatar === 'string' ? m.avatar : null,
        ts: typeof m.ts === 'number' ? m.ts : Date.now(),
        peerId: from || null,
        self: !!(myPeerId && from && from === myPeerId),
      };
    })
    .filter((m): m is NonNullable<typeof m> => !!m)
    .sort((a, b) => a.ts - b.ts);

  if (!messages.length) return;
  window.dispatchEvent(new CustomEvent('lobby:chatHistory', { detail: { messages } }));
  logFluoAction({
    origin: 'server',
    action: 'ws.joined.chat_history',
    detail: { count: messages.length },
    via: 'ws',
  });
}

function handleMessage(raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }
  const type = String(msg.type ?? '');

  if (type === 'pong' && typeof msg.t0 === 'number' && typeof msg.clientTs === 'number') {
    const t3 = Date.now();
    const t0 = Number(msg.clientTs);
    const t1 = Number(msg.t0);
    const t2 = typeof msg.t2 === 'number' ? Number(msg.t2) : t1;
    rttMs = Math.max(0, t3 - t0);
    // offset sample unused — position uses rtt/2
    void t1;
    void t2;
    return;
  }

  if (type === 'joined') {
    if (Array.isArray(msg.participants)) {
      participants = msg.participants as FluoParticipant[];
    }
    hostPeerId = msg.hostPeerId != null ? String(msg.hostPeerId) : null;
    joinGraceUntil = Date.now() + 2800;
    emitParticipants();
    emitSession();
    const c = msg.clock as FluoClockState | null | undefined;
    if (c && c.content) {
      // Серверный clock с настоящим t0 — живая позиция для догона.
      clock = c;
      lastAppliedSeq = Math.max(lastAppliedSeq, c.seq ?? 0);
      applyClockToPlayer(c, true);
      logFluoAction({
        origin: 'server',
        action: 'ws.joined.catchup',
        detail: {
          liveT: Math.round(computePosition(c) * 10) / 10,
          mediaOrigin: c.mediaOrigin,
          paused: c.paused,
          seq: c.seq,
        },
        via: 'ws',
      });
    }
    // Голосование, начатое до входа — показать UI
    emitActiveProposalFromJoin(msg.activeProposal);
    // Чат комнаты до входа
    emitChatHistoryFromJoin(msg.chatHistory);
    window.dispatchEvent(new CustomEvent('lobby:wsJoined'));
    window.dispatchEvent(new CustomEvent('fluo:joined', { detail: { clock: c ?? null } }));
    logFluoAction({ origin: 'server', action: 'ws.joined', detail: { participants: participants.length } });
    flushOutbound();
    startDriftLoop();
    // Повторный catch-up: окно плеера могло открыться чуть позже joined.
    window.setTimeout(() => {
      if (clock?.content) applyClockToPlayer(clock, true);
    }, 600);
    window.setTimeout(() => {
      if (clock?.content) applyClockToPlayer(clock, true);
    }, 1600);
    // Повторная доставка истории чата в плеер (Electron race)
    window.setTimeout(() => emitChatHistoryFromJoin(msg.chatHistory), 500);
    window.setTimeout(() => emitChatHistoryFromJoin(msg.chatHistory), 1400);
    return;
  }

  if (type === 'snapshot' || type === 'clock') {
    const c = msg.clock as FluoClockState | undefined;
    if (!c) return;
    // snapshot — мягко; clock (команда) — жёстко
    applyClockToPlayer(c, type === 'clock');
    return;
  }

  if (type === 'barrier_start') {
    roomBarrier = true;
    localControlUntil = 0; // чужая смена серии должна пройти сразу
    const reason = String(msg.reason ?? 'episode');
    const c = msg.clock as FluoClockState | null | undefined;
    if (c?.content) {
      clock = c;
      lastAppliedSeq = Math.max(lastAppliedSeq, c.seq ?? 0);
      lastEmittedPaused = true;
    }
    const playback = c?.content
      ? {
          ...c.content,
          paused: true,
          currentTime: reason === 'episode' ? 0 : computePosition(c),
        }
      : clockToPlayback();

    // Сразу меняем контент у всех (IPC remotePlayback), не ждём barrier_end.
    if (c?.content) {
      applyClockToPlayer(
        {
          ...c,
          paused: true,
          mediaOrigin: reason === 'episode' ? 0 : c.mediaOrigin,
        },
        true,
      );
    } else {
      getFluoPlayer().pause({ origin: 'sync' });
    }

    logFluoAction({
      origin: 'server',
      action: 'barrier.start',
      detail: {
        reason,
        ep: playback && 'ep' in playback ? playback.ep : null,
        initiator: msg.initiatorPeerId != null ? String(msg.initiatorPeerId) : null,
      },
      via: 'ws',
    });

    const barrierDetail = {
      reason: reason === 'join' || reason === 'episode' || reason === 'buffer' ? reason : 'episode',
      playback,
      joinerPeerId: msg.initiatorPeerId != null ? String(msg.initiatorPeerId) : null,
    };
    window.dispatchEvent(new CustomEvent('lobby:syncPause', { detail: barrierDetail }));
    window.dispatchEvent(new CustomEvent('lobby:barrierSync', { detail: barrierDetail }));
    return;
  }

  if (type === 'barrier_end') {
    roomBarrier = false;
    const c = msg.clock as FluoClockState | undefined;
    if (c) {
      clock = c;
      lastAppliedSeq = Math.max(lastAppliedSeq, c.seq ?? 0);
      applyClockToPlayer(c, true);
    }
    logFluoAction({ origin: 'server', action: 'barrier.end', via: 'ws' });
    window.dispatchEvent(new CustomEvent('lobby:syncResume'));
    window.dispatchEvent(new CustomEvent('lobby:playerWaitingOverlay', { detail: null }));
    return;
  }

  if (type === 'participant_joined' || type === 'participant_left') {
    if (Array.isArray(msg.participants)) {
      participants = msg.participants as FluoParticipant[];
    }
    if (msg.hostPeerId !== undefined) {
      hostPeerId = msg.hostPeerId != null ? String(msg.hostPeerId) : null;
    }
    emitParticipants();
    emitSession();
    if (type === 'participant_left' && msg.kickedPeerId) {
      window.dispatchEvent(new CustomEvent('lobby:participantKicked', {
        detail: {
          peerId: String(msg.kickedPeerId),
          login: msg.kickedLogin != null ? String(msg.kickedLogin) : null,
        },
      }));
    }
    return;
  }

  if (type === 'host_changed') {
    if (msg.hostPeerId !== undefined) {
      hostPeerId = msg.hostPeerId != null ? String(msg.hostPeerId) : null;
    }
    if (Array.isArray(msg.participants)) {
      participants = msg.participants as FluoParticipant[];
    }
    emitParticipants();
    emitSession();
    window.dispatchEvent(new CustomEvent('lobby:hostChanged', {
      detail: { hostPeerId },
    }));
    return;
  }

  if (type === 'kicked') {
    logFluoAction({ origin: 'server', action: 'ws.kicked', via: 'ws' });
    window.dispatchEvent(new CustomEvent('lobby:kicked', {
      detail: { reason: String(msg.reason ?? 'host') },
    }));
    leaveFluoLocal(true);
    return;
  }

  if (type === 'chat' && typeof msg.text === 'string') {
    const from = String(msg.fromPeerId ?? '');
    if (myPeerId && from === myPeerId) return;
    window.dispatchEvent(new CustomEvent('lobby:chat', {
      detail: {
        id: String(msg.id ?? `${from}-${Date.now()}`),
        text: String(msg.text).slice(0, 500),
        login: String(msg.login ?? 'Участник'),
        avatar: typeof msg.avatar === 'string' ? msg.avatar : null,
        ts: typeof msg.ts === 'number' ? msg.ts : Date.now(),
        peerId: from || null,
        self: false,
      },
    }));
    return;
  }

  if (type === 'proposal_new' && msg.proposalId) {
    window.dispatchEvent(new CustomEvent('lobby:proposalNew', {
      detail: {
        proposalId: msg.proposalId,
        proposerPeerId: msg.proposerPeerId ?? null,
        proposerLogin: msg.proposerLogin ?? 'Участник',
        playback: msg.playback ?? null,
        expiresAt: typeof msg.expiresAt === 'number' ? msg.expiresAt : undefined,
      },
    }));
    return;
  }
  if (type === 'proposal_created' && msg.proposalId) {
    window.dispatchEvent(new CustomEvent('lobby:proposalCreated', { detail: { proposalId: msg.proposalId } }));
    return;
  }
  if (type === 'proposal_accepted' && msg.proposalId) {
    window.dispatchEvent(new CustomEvent('lobby:proposalAccepted', {
      detail: { proposalId: msg.proposalId, playback: msg.playback ?? null },
    }));
    return;
  }
  if (type === 'proposal_rejected' && msg.proposalId) {
    window.dispatchEvent(new CustomEvent('lobby:proposalRejected', {
      detail: { proposalId: msg.proposalId, reason: msg.reason ?? 'unknown' },
    }));
    return;
  }
  if (type === 'proposal_vote_update' && msg.proposalId) {
    window.dispatchEvent(new CustomEvent('lobby:proposalVoteUpdate', {
      detail: {
        proposalId: msg.proposalId,
        acceptedCount: msg.acceptedCount ?? 0,
        totalVoters: msg.totalVoters ?? 0,
      },
    }));
  }
}

function clockToPlayback(): Record<string, unknown> | null {
  if (!clock?.content) return null;
  return {
    ...clock.content,
    paused: clock.paused,
    currentTime: computePosition(clock),
  };
}

function scheduleReconnect(): void {
  if (intentionalClose || !roomId) return;
  reconnectAttempts++;
  if (reconnectAttempts > MAX_RECONNECT) {
    logFluoAction({ origin: 'system', action: 'ws.giveup' });
    return;
  }
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (roomId) connectWs(roomId);
  }, RECONNECT_MS);
}

function connectWs(rId: string): void {
  if (activeWs) {
    try { activeWs.close(); } catch { /* ignore */ }
    activeWs = null;
    ws = null;
  }
  intentionalClose = false;
  let socket: WebSocket;
  try {
    socket = new WebSocket(getFluoWsBase());
  } catch {
    scheduleReconnect();
    return;
  }
  ws = socket;
  activeWs = socket;

  socket.onopen = () => {
    if (socket !== activeWs) return;
    reconnectAttempts = 0;
    sendWs({ type: 'join', roomId: rId, peerId: myPeerId ?? undefined });
    // ping loop
    const ping = () => {
      if (socket !== activeWs || socket.readyState !== WebSocket.OPEN) return;
      sendWs({ type: 'ping', clientTs: Date.now() });
    };
    ping();
    const iv = setInterval(ping, 5000);
    socket.addEventListener('close', () => clearInterval(iv), { once: true });
    logFluoAction({ origin: 'system', action: 'ws.open', detail: { roomId: rId } });
  };

  socket.onmessage = (e) => handleMessage(String(e.data));
  socket.onclose = () => {
    if (socket !== activeWs) return;
    activeWs = null;
    ws = null;
    if (!intentionalClose) scheduleReconnect();
  };
}

export async function createFluoRoom(
  profile: FluoProfilePayload,
  seed?: Partial<FluoContent> & { currentTime?: number; paused?: boolean } | null,
): Promise<{ roomId: string; code: string; myPeerId?: string }> {
  const body: Record<string, unknown> = { ...profile };
  if (seed && isUsableFluoContent(seed)) {
    body.clock = {
      content: {
        releaseId: String(seed.releaseId),
        sourceId: String(seed.sourceId ?? ''),
        ep: String(seed.ep),
        dubberId: seed.dubberId != null ? String(seed.dubberId) : undefined,
        title: String(seed.title ?? ''),
        sourceName: String(seed.sourceName ?? ''),
      },
      paused: seed.paused !== false,
      mediaOrigin: typeof seed.currentTime === 'number' ? seed.currentTime : 0,
    };
  }
  const res = await fetchFluo('/create', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Fluo create: ${res.status}`);
  return (await res.json()) as { roomId: string; code: string; myPeerId?: string };
}

export async function joinFluoRoom(code: string, profile: FluoProfilePayload): Promise<FluoRoomPublic> {
  const res = await fetchFluo('/join', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim(), ...profile }),
  });
  if (res.status === 403) {
    const err = new Error('banned') as Error & { code?: string };
    err.code = 'banned';
    throw err;
  }
  if (!res.ok) throw new Error(`Fluo join: ${res.status}`);
  return (await res.json()) as FluoRoomPublic;
}

export async function leaveFluoRoomHttp(roomIdValue: string, deviceId: string): Promise<void> {
  if (!roomIdValue || !deviceId) return;
  await fetchFluo(`/room/${encodeURIComponent(roomIdValue)}/leave`, {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  }).catch(() => undefined);
}

export function setFluoRoom(
  id: string | null,
  options?: {
    myPeerId?: string;
    participants?: FluoParticipant[];
    roomCode?: string;
    clock?: FluoClockState | null;
    hostPeerId?: string | null;
    isCreator?: boolean;
  },
): void {
  leaveFluoLocal(false);
  roomId = id;
  roomCode = options?.roomCode ?? null;
  myPeerId = options?.myPeerId ?? null;
  hostPeerId = options?.hostPeerId ?? null;
  participants = options?.participants ? options.participants.slice() : [];
  clock = options?.clock ?? null;
  roomBarrier = false;
  pendingOutbound = [];
  lastAppliedSeq = clock?.seq ?? 0;
  lastEmittedPaused = clock?.paused ?? null;
  localControlUntil = 0;
  lastPartySignature = '';
  if (roomId) {
    wirePlayerEcho();
    connectWs(roomId);
    // Не apply сразу: плеер ещё может быть закрыт. Catch-up после open / ws.joined.
    emitParticipants();
    emitSession();
    logFluoAction({
      origin: 'local',
      action: 'room.join',
      detail: {
        roomId,
        roomCode,
        liveT: clock ? Math.round(computePosition(clock) * 10) / 10 : null,
        paused: clock?.paused ?? null,
      },
    });
  }
}

/** Принудительно догнать плеер до живой позиции часов (после открытия окна / join). */
export function catchUpFluoPlayback(force = true): void {
  if (!clock?.content) return;
  applyClockToPlayer(clock, force);
}

function leaveFluoLocal(emitLeft: boolean): void {
  intentionalClose = true;
  stopDriftLoop();
  unsubPlayer?.();
  unsubPlayer = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (softRateTimer) {
    clearTimeout(softRateTimer);
    softRateTimer = null;
  }
  if (activeWs) {
    try { activeWs.close(); } catch { /* ignore */ }
    activeWs = null;
  }
  ws = null;
  const leftId = roomId;
  roomId = null;
  roomCode = null;
  myPeerId = null;
  hostPeerId = null;
  participants = [];
  clock = null;
  roomBarrier = false;
  pendingOutbound = [];
  lastAppliedSeq = 0;
  lastEmittedPaused = null;
  localControlUntil = 0;
  joinGraceUntil = 0;
  lastPartySignature = '';
  if (emitLeft && leftId) {
    window.dispatchEvent(new CustomEvent('lobby:left'));
    window.dispatchEvent(new CustomEvent('fluo:left'));
    emitSession();
  }
}

export function leaveFluo(): void {
  leaveFluoLocal(true);
  logFluoAction({ origin: 'local', action: 'room.leave' });
}

export function getFluoRoomId(): string | null {
  return roomId;
}

export function getFluoRoomCode(): string | null {
  return roomCode;
}

export function getFluoParticipants(): FluoParticipant[] {
  return participants.slice();
}

export function getFluoMyPeerId(): string | null {
  return myPeerId;
}

export function getFluoHostPeerId(): string | null {
  return hostPeerId;
}

export function kickFluoParticipant(targetPeerId: string): void {
  if (!roomId || !targetPeerId) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (hostPeerId !== myPeerId) return;
  sendWs({ type: 'kick', targetPeerId });
}

export function transferFluoHost(targetPeerId: string): void {
  if (!roomId || !targetPeerId) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (hostPeerId !== myPeerId) return;
  sendWs({ type: 'transfer_host', targetPeerId });
}

export function getFluoClock(): FluoClockState | null {
  return clock ? { ...clock, content: clock.content ? { ...clock.content } : null } : null;
}

export function getLastFluoPlayback(): (FluoContent & { paused: boolean; currentTime: number }) | null {
  if (!clock?.content) {
    const s = getFluoPlayer().getState();
    if (!s.content) return null;
    return { ...s.content, paused: s.paused, currentTime: s.currentTime };
  }
  return {
    ...clock.content,
    paused: clock.paused,
    currentTime: computePosition(clock),
  };
}

export function sendFluoChat(payload: { text: string; login?: string; avatar?: string | null }): void {
  if (!roomId) return;
  const text = String(payload.text ?? '').trim().slice(0, 500);
  if (!text) return;
  const login = payload.login?.trim() || 'Участник';
  const msg = {
    id: `${myPeerId ?? 'local'}-${Date.now()}`,
    text,
    login,
    avatar: payload.avatar ?? null,
    ts: Date.now(),
    peerId: myPeerId,
    self: true,
  };
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingOutbound.push({ type: 'chat', text, login, avatar: payload.avatar });
  } else {
    sendWs({ type: 'chat', id: msg.id, text, login, avatar: msg.avatar, ts: msg.ts, fromPeerId: myPeerId });
  }
  window.dispatchEvent(new CustomEvent('lobby:chat', { detail: msg }));
}

export function proposeFluoAnimeChange(content: Partial<FluoContent>): void {
  if (!roomId) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingOutbound.push({ type: 'propose', content });
    return;
  }
  sendWs({ type: 'propose_change', payload: content });
}

export function voteFluoProposal(proposalId: string, accept: boolean): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingOutbound.push({ type: 'vote', proposalId, accept });
    return;
  }
  sendWs({ type: 'vote_change', proposalId, accept });
}

/** Сообщить серверу, что локальный плеер готов после barrier (смена серии). */
export function sendFluoSyncReady(currentTime?: number): void {
  sendWs({
    type: 'sync_ready',
    ...(typeof currentTime === 'number' && Number.isFinite(currentTime) ? { currentTime } : {}),
  });
}

export function notifyFluoLocalBuffering(buffering: boolean): void {
  sendWs({ type: 'buffering', buffering: !!buffering });
  // локально не стопаем комнату — только сигнал для UI
  window.dispatchEvent(new CustomEvent('fluo:localBuffering', { detail: { buffering } }));
}

export function isFluoBarrier(): boolean {
  return roomBarrier;
}

export function pushFluoCommand(
  action: 'play' | 'pause' | 'seek' | 'changeEpisode',
  playback: FluoContent & { paused?: boolean; currentTime?: number },
): void {
  if (!roomId) return;
  markFluoLocalControl();
  // Не трогаем local video здесь: в Electron уже применил окно плеера, main только шлёт WS.
  const cmd: QueuedCmd = {
    type: action,
    content: {
      releaseId: String(playback.releaseId ?? ''),
      sourceId: String(playback.sourceId ?? ''),
      ep: String(playback.ep ?? ''),
      dubberId: playback.dubberId != null ? String(playback.dubberId) : undefined,
      title: String(playback.title ?? ''),
      sourceName: String(playback.sourceName ?? ''),
    },
    currentTime: typeof playback.currentTime === 'number' ? playback.currentTime : getFluoPlayer().getProgress(),
    paused: action === 'pause' ? true : action === 'play' ? false : !!playback.paused,
  };
  if (!isUsableFluoContent(cmd.content)) return;

  // После join: не откатываем живую комнату play/seek с «почти нуля».
  if (
    Date.now() < joinGraceUntil
    && clock?.content
    && (action === 'play' || action === 'seek')
    && clock.content.releaseId === cmd.content.releaseId
    && clock.content.ep === cmd.content.ep
    && clock.content.sourceId === cmd.content.sourceId
  ) {
    const live = computePosition(clock);
    if (live > 5 && cmd.currentTime < live - 3) {
      logFluoAction({
        origin: 'local',
        action: 'command.suppressed.join_grace',
        detail: { action, t: Math.round(cmd.currentTime * 10) / 10, liveT: Math.round(live * 10) / 10 },
        via: 'ws',
      });
      return;
    }
  }

  // Оптимистично обновляем локальные часы, чтобы snapshot не откатил.
  if (clock || cmd.content) {
    clock = {
      content: cmd.content,
      paused: cmd.paused,
      mediaOrigin: cmd.currentTime,
      t0: Date.now(),
      rate: 1,
      seq: (clock?.seq ?? lastAppliedSeq) + 1,
    };
    lastAppliedSeq = clock.seq;
    lastEmittedPaused = cmd.paused;
  }
  logFluoAction({
    origin: 'local',
    action: `command.${action}`,
    detail: { t: Math.round(cmd.currentTime * 10) / 10, paused: cmd.paused },
    via: 'ws',
  });
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingOutbound.push(cmd);
    return;
  }
  sendWs({
    type: 'command',
    action,
    payload: {
      ...cmd.content,
      currentTime: cmd.currentTime,
      paused: cmd.paused,
    },
  });
}
