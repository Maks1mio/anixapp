/**
 * NTP-подобная оценка смещения часов относительно пира (скользящее среднее по 5 замерам).
 */

const WINDOW = 5;

export function computeOffsetMs(t0: number, t1: number, t2: number, t3: number): number {
  return (t1 - t0 + t2 - t3) / 2;
}

export class LobbyClockOffsets {
  private samples = new Map<string, number[]>();

  addSample(peerId: string, offsetMs: number): void {
    const arr = this.samples.get(peerId) ?? [];
    arr.push(offsetMs);
    while (arr.length > WINDOW) arr.shift();
    this.samples.set(peerId, arr);
  }

  /** Смещение: localTime ≈ peerTime + offsetFromPeer (для планирования executeAt на часах отправителя). */
  offsetFromPeerMs(peerId: string): number {
    const arr = this.samples.get(peerId);
    if (!arr?.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  removePeer(peerId: string): void {
    this.samples.delete(peerId);
  }

  clear(): void {
    this.samples.clear();
  }
}
