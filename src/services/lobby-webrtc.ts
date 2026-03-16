/**
 * WebRTC для лобби: P2P соединения, DataChannel для синхронизации воспроизведения.
 * Сигналинг (SDP, ICE) идёт через HTTP API (postSignal / getSignals).
 */

import type { LobbyPlayback, LobbyParticipant } from './lobby-api';
import { postSignal, getSignals } from './lobby-api';

const SIGNAL_POLL_MS = 600;
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type PeerEntry = {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
};

let roomId: string | null = null;
let myPeerId: string | null = null;
let peers = new Map<string, PeerEntry>();
let signalTimer: ReturnType<typeof setInterval> | null = null;
let onRemotePlayback: ((playback: LobbyPlayback) => void) | null = null;

function getOrCreatePeer(otherPeerId: string): PeerEntry {
  let entry = peers.get(otherPeerId);
  if (entry) return entry;
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  entry = { pc, dc: null };
  peers.set(otherPeerId, entry);

  pc.onicecandidate = (e) => {
    if (!e.candidate || !roomId || !myPeerId) return;
    postSignal(roomId, myPeerId, otherPeerId, 'ice', e.candidate.toJSON()).catch(() => {});
  };

  pc.ondatachannel = (e) => {
    const dc = e.channel;
    if (dc.label !== 'sync') return;
    entry!.dc = dc;
    dc.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as LobbyPlayback;
        if (data && typeof data.releaseId === 'string' && typeof data.currentTime === 'number') {
          onRemotePlayback?.(data);
        }
      } catch (_) {}
    };
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      pc.close();
      peers.delete(otherPeerId);
    }
  };

  return entry;
}

async function handleOffer(fromPeerId: string, sdp: string): Promise<void> {
  const entry = getOrCreatePeer(fromPeerId);
  const pc = entry.pc;
  try {
    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (roomId && myPeerId && pc.localDescription)
      await postSignal(roomId, myPeerId, fromPeerId, 'answer', pc.localDescription.sdp);
  } catch (err) {
    console.warn('[lobby-webrtc] handleOffer error', err);
  }
}

async function handleAnswer(fromPeerId: string, sdp: string): Promise<void> {
  const entry = peers.get(fromPeerId);
  if (!entry) return;
  try {
    await entry.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  } catch (err) {
    console.warn('[lobby-webrtc] handleAnswer error', err);
  }
}

async function handleIce(fromPeerId: string, candidate: string): Promise<void> {
  const entry = peers.get(fromPeerId);
  if (!entry) return;
  try {
    const parsed = JSON.parse(candidate) as RTCIceCandidateInit;
    await entry.pc.addIceCandidate(new RTCIceCandidate(parsed)).catch(() => {});
  } catch (_) {}
}

function pollSignals(): void {
  if (!roomId || !myPeerId) return;
  getSignals(roomId, myPeerId).then((signals) => {
    signals.forEach((s) => {
      if (s.type === 'offer') handleOffer(s.fromPeerId, s.payload);
      else if (s.type === 'answer') handleAnswer(s.fromPeerId, s.payload);
      else if (s.type === 'ice') handleIce(s.fromPeerId, s.payload);
    });
  });
}

function comparePeerIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Запуск WebRTC: установка соединений с участниками, опрос сигналов. */
export function startWebRTC(
  rId: string,
  myId: string,
  participants: LobbyParticipant[],
  onPlayback: (playback: LobbyPlayback) => void
): void {
  stopWebRTC();
  roomId = rId;
  myPeerId = myId;
  onRemotePlayback = onPlayback;
  const others = participants.filter((p) => p.peerId && p.peerId !== myId);
  if (others.length === 0) {
    signalTimer = setInterval(pollSignals, SIGNAL_POLL_MS);
    pollSignals();
    return;
  }
  others.forEach(async (p) => {
    const otherId = p.peerId!;
    if (comparePeerIds(myId, otherId) < 0) {
      const entry = getOrCreatePeer(otherId);
          const dc = entry.pc.createDataChannel('sync');
          entry.dc = dc;
          dc.onmessage = (ev) => {
            try {
              const data = JSON.parse(ev.data) as LobbyPlayback;
              if (data && typeof data.releaseId === 'string' && typeof data.currentTime === 'number') {
                onRemotePlayback?.(data);
              }
            } catch (_) {}
          };
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      if (roomId && myPeerId && entry.pc.localDescription)
        await postSignal(roomId, myPeerId, otherId, 'offer', entry.pc.localDescription.sdp);
    }
  });
  signalTimer = setInterval(pollSignals, SIGNAL_POLL_MS);
  pollSignals();
}

/** Остановка WebRTC и закрытие соединений. */
export function stopWebRTC(): void {
  if (signalTimer) {
    clearInterval(signalTimer);
    signalTimer = null;
  }
  peers.forEach((entry) => {
    entry.pc.close();
  });
  peers = new Map();
  roomId = null;
  myPeerId = null;
  onRemotePlayback = null;
}

/** Отправить состояние воспроизведения всем пирам по DataChannel. */
export function sendPlaybackViaWebRTC(playback: LobbyPlayback): void {
  const raw = JSON.stringify(playback);
  peers.forEach((entry) => {
    if (entry.dc && entry.dc.readyState === 'open') {
      entry.dc.send(raw);
    }
  });
}

/** Есть ли хотя бы одно активное WebRTC-соединение. */
export function hasWebRTCConnections(): boolean {
  for (const entry of peers.values()) {
    if (entry.pc.connectionState === 'connected') return true;
  }
  return false;
}
