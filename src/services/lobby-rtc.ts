/**
 * WebRTC full mesh: DataChannel sync (команды) + clock (NTP).
 * Сигналинг через WebSocket (без HTTP polling).
 */

import type { LobbyPlayback, LobbyParticipant } from './lobby-api';
import { getSignals } from './lobby-api';
import { setSignalHandler, sendSignal, type LobbySignalMessage } from './lobby-ws';
import { LobbyClockOffsets, computeOffsetMs } from './lobby-clock';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const SYNC_DELAY_MS = 55;
const NTP_INTERVAL_MS = 30_000;
const NTP_BURST = 5;
const RECONNECT_MS = 2_000;

export type LobbySyncAction = 'play' | 'pause' | 'seek' | 'changeEpisode';

export type RemoteSyncPayload = {
  action: LobbySyncAction;
  playback: LobbyPlayback;
  fromPeerId: string;
  seq: number;
  executeAt: number;
};

type PeerEntry = {
  pc: RTCPeerConnection;
  syncDc: RTCDataChannel | null;
  clockDc: RTCDataChannel | null;
  otherPeerId: string;
  ntpTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
};

let roomId: string | null = null;
let myPeerId: string | null = null;
const peers = new Map<string, PeerEntry>();
let seqCounter = 1;
let onRemoteSync: ((p: RemoteSyncPayload) => void) | null = null;
const clockOffsets = new LobbyClockOffsets();
const pendingNtp = new Map<string, { t0: number }>();

function comparePeerIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function wireSyncDc(dc: RTCDataChannel, otherPeerId: string): void {
  dc.onmessage = (ev) => {
    try {
      const raw = JSON.parse(ev.data as string) as Record<string, unknown>;
      if (raw.v === 1 && raw.t === 'ack' && typeof raw.forSeq === 'number') return;
      if (raw.v === 1 && raw.action && raw.playback && raw.fromPeerId && typeof raw.seq === 'number' && typeof raw.executeAt === 'number') {
        onRemoteSync?.({
          action: raw.action as LobbySyncAction,
          playback: raw.playback as LobbyPlayback,
          fromPeerId: String(raw.fromPeerId),
          seq: Number(raw.seq),
          executeAt: Number(raw.executeAt),
        });
      }
    } catch (_) {}
  };
}

function wireClockDc(dc: RTCDataChannel, otherPeerId: string, weInitiated: boolean): void {
  dc.onmessage = (ev) => {
    try {
      const raw = JSON.parse(ev.data as string) as Record<string, unknown>;
      if (raw.t !== 'ntp' || typeof raw.id !== 'string') return;
      const id = raw.id;
      if (weInitiated) {
        if (raw.i0 != null && raw.i1 != null && raw.i2 != null) {
          const t0 = Number(raw.i0);
          const t1 = Number(raw.i1);
          const t2 = Number(raw.i2);
          const t3 = Date.now();
          const off = computeOffsetMs(t0, t1, t2, t3);
          clockOffsets.addSample(otherPeerId, off);
          pendingNtp.delete(id);
        }
      } else {
        if (raw.i0 != null && raw.i1 == null) {
          const t0 = Number(raw.i0);
          const t1 = Date.now();
          const t2 = Date.now();
          dc.send(JSON.stringify({ t: 'ntp', id, i0: t0, i1: t1, i2: t2 }));
        }
      }
    } catch (_) {}
  };

  if (weInitiated) {
    let burst = 0;
    const sendPing = () => {
      const id = `${myPeerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const t0 = Date.now();
      pendingNtp.set(id, { t0 });
      try {
        dc.send(JSON.stringify({ t: 'ntp', id, i0: t0 }));
      } catch (_) {}
    };
    const burstTimer = window.setInterval(() => {
      if (burst >= NTP_BURST) {
        window.clearInterval(burstTimer);
        return;
      }
      burst++;
      sendPing();
    }, 120);
    window.setTimeout(() => {
      window.clearInterval(burstTimer);
    }, NTP_BURST * 120 + 50);

    const interval = window.setInterval(sendPing, NTP_INTERVAL_MS);
    const entry = peers.get(otherPeerId);
    if (entry) entry.ntpTimer = interval;
  }
}

function cleanupPeer(otherPeerId: string): void {
  const e = peers.get(otherPeerId);
  if (!e) return;
  if (e.ntpTimer) {
    clearInterval(e.ntpTimer);
    e.ntpTimer = null;
  }
  if (e.reconnectTimer) {
    clearTimeout(e.reconnectTimer);
    e.reconnectTimer = null;
  }
  try {
    e.pc.close();
  } catch (_) {}
  peers.delete(otherPeerId);
  clockOffsets.removePeer(otherPeerId);
}

function scheduleReconnect(otherPeerId: string): void {
  const e = peers.get(otherPeerId);
  if (!e || !roomId || !myPeerId) return;
  if (e.reconnectTimer) return;
  e.reconnectTimer = setTimeout(() => {
    e.reconnectTimer = null;
    if (!roomId || !myPeerId) return;
    cleanupPeer(otherPeerId);
    void connectToPeer(otherPeerId);
  }, RECONNECT_MS);
}

async function handleOffer(fromPeerId: string, sdp: string): Promise<void> {
  if (!myPeerId || comparePeerIds(myPeerId, fromPeerId) < 0) return;
  let entry = peers.get(fromPeerId);
  if (!entry) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    entry = { pc, syncDc: null, clockDc: null, otherPeerId: fromPeerId, ntpTimer: null, reconnectTimer: null };
    peers.set(fromPeerId, entry);
    pc.onicecandidate = (e) => {
      if (!e.candidate || !roomId || !myPeerId) return;
      sendSignal('signal_ice', fromPeerId, JSON.stringify(e.candidate.toJSON()));
    };
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      if (ch.label === 'sync') {
        entry!.syncDc = ch;
        wireSyncDc(ch, fromPeerId);
        ch.onopen = () => {};
      } else if (ch.label === 'clock') {
        entry!.clockDc = ch;
        wireClockDc(ch, fromPeerId, false);
      }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'failed' || st === 'closed') scheduleReconnect(fromPeerId);
    };
  }
  try {
    await entry.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    const answer = await entry.pc.createAnswer();
    await entry.pc.setLocalDescription(answer);
    if (roomId && myPeerId && entry.pc.localDescription) {
      sendSignal('signal_answer', fromPeerId, entry.pc.localDescription.sdp);
    }
  } catch (err) {
    console.warn('[lobby-rtc] handleOffer', err);
  }
}

async function handleAnswer(fromPeerId: string, sdp: string): Promise<void> {
  const entry = peers.get(fromPeerId);
  if (!entry) return;
  try {
    await entry.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  } catch (err) {
    console.warn('[lobby-rtc] handleAnswer', err);
  }
}

async function handleIce(fromPeerId: string, candidateJson: string): Promise<void> {
  const entry = peers.get(fromPeerId);
  if (!entry) return;
  try {
    const parsed = JSON.parse(candidateJson) as RTCIceCandidateInit;
    await entry.pc.addIceCandidate(new RTCIceCandidate(parsed)).catch(() => {});
  } catch (_) {}
}

function onSignalMessage(msg: LobbySignalMessage): void {
  if (msg.kind === 'offer') void handleOffer(msg.fromPeerId, msg.payload);
  else if (msg.kind === 'answer') void handleAnswer(msg.fromPeerId, msg.payload);
  else if (msg.kind === 'ice') void handleIce(msg.fromPeerId, msg.payload);
}

async function connectToPeer(otherPeerId: string): Promise<void> {
  if (!roomId || !myPeerId || otherPeerId === myPeerId) return;
  if (peers.has(otherPeerId)) return;
  if (comparePeerIds(myPeerId, otherPeerId) >= 0) return;

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const entry: PeerEntry = {
    pc,
    syncDc: null,
    clockDc: null,
    otherPeerId: otherPeerId,
    ntpTimer: null,
    reconnectTimer: null,
  };
  peers.set(otherPeerId, entry);

  pc.onicecandidate = (e) => {
    if (!e.candidate || !roomId || !myPeerId) return;
    sendSignal('signal_ice', otherPeerId, JSON.stringify(e.candidate.toJSON()));
  };

  const sync = pc.createDataChannel('sync', { ordered: true });
  entry.syncDc = sync;
  wireSyncDc(sync, otherPeerId);
  sync.onopen = () => {};

  const clock = pc.createDataChannel('clock', { ordered: false });
  entry.clockDc = clock;
  wireClockDc(clock, otherPeerId, true);

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') scheduleReconnect(otherPeerId);
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (roomId && myPeerId && pc.localDescription) {
      sendSignal('signal_offer', otherPeerId, pc.localDescription.sdp);
    }
  } catch (err) {
    console.warn('[lobby-rtc] connectToPeer', err);
  }
}

async function drainHttpSignalsOnce(): Promise<void> {
  if (!roomId || !myPeerId) return;
  try {
    const list = await getSignals(roomId, myPeerId);
    list.forEach((s) => {
      if (s.type === 'offer') void handleOffer(s.fromPeerId, s.payload);
      else if (s.type === 'answer') void handleAnswer(s.fromPeerId, s.payload);
      else if (s.type === 'ice') void handleIce(s.fromPeerId, s.payload);
    });
  } catch (_) {}
}

/** Запуск mesh к указанным участникам. */
export function startLobbyRtc(
  rId: string,
  myId: string,
  participants: LobbyParticipant[],
  onSync: (p: RemoteSyncPayload) => void,
): void {
  stopLobbyRtc();
  roomId = rId;
  myPeerId = myId;
  onRemoteSync = onSync;
  seqCounter = 1;
  setSignalHandler(onSignalMessage);

  const others = participants.map((p) => p.peerId).filter((id): id is string => !!id && id !== myId);
  void drainHttpSignalsOnce();
  others.forEach((id) => void connectToPeer(id));
}

export function updateLobbyRtcPeers(participants: LobbyParticipant[]): void {
  if (!roomId || !myPeerId) return;
  const want = new Set(
    participants.map((p) => p.peerId).filter((id): id is string => !!id && id !== myPeerId),
  );
  for (const id of peers.keys()) {
    if (!want.has(id)) cleanupPeer(id);
  }
  want.forEach((id) => {
    if (!peers.has(id)) void connectToPeer(id);
  });
}

export function stopLobbyRtc(): void {
  setSignalHandler(null);
  for (const id of [...peers.keys()]) cleanupPeer(id);
  peers.clear();
  clockOffsets.clear();
  roomId = null;
  myPeerId = null;
  onRemoteSync = null;
  pendingNtp.clear();
}

export function getClockOffsets(): LobbyClockOffsets {
  return clockOffsets;
}

export function broadcastSyncCommand(
  action: LobbySyncAction,
  playback: LobbyPlayback,
): void {
  if (!myPeerId) return;
  const seq = seqCounter++;
  const executeAt = Date.now() + SYNC_DELAY_MS;
  const raw = JSON.stringify({
    v: 1,
    seq,
    action,
    playback,
    executeAt,
    fromPeerId: myPeerId,
  });
  peers.forEach((e) => {
    if (e.syncDc && e.syncDc.readyState === 'open') {
      try {
        e.syncDc.send(raw);
      } catch (_) {}
    }
  });
}

export function hasP2PSync(): boolean {
  for (const e of peers.values()) {
    if (e.syncDc?.readyState === 'open') return true;
  }
  return false;
}
