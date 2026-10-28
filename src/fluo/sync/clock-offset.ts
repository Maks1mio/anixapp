/**
 * Оценка расхождения часов клиента и сервера Fluo по ping/pong (как в NTP).
 *
 * t0 в часах комнаты — серверное время. Если сравнивать его с локальным
 * Date.now(), спешащие или отстающие системные часы сдвигают позицию видео
 * у участника на величину расхождения.
 */

export type FluoClockSample = {
  /** Серверное время минус локальное, мс. */
  offsetMs: number;
  /** Время в сети туда-обратно без обработки на сервере, мс. */
  rttMs: number;
};

const DEFAULT_WINDOW = 8;

/**
 * Один замер: clientSend/clientRecv — локальное время отправки ping и получения pong,
 * serverRecv/serverSend — серверное время получения ping и отправки pong.
 */
export function fluoClockSample(
  clientSendMs: number,
  serverRecvMs: number,
  serverSendMs: number,
  clientRecvMs: number,
): FluoClockSample | null {
  if (![clientSendMs, serverRecvMs, serverSendMs, clientRecvMs].every(Number.isFinite)) return null;
  const serverHoldMs = Math.max(0, serverSendMs - serverRecvMs);
  const rttMs = Math.max(0, clientRecvMs - clientSendMs - serverHoldMs);
  const offsetMs = ((serverRecvMs - clientSendMs) + (serverSendMs - clientRecvMs)) / 2;
  return { offsetMs, rttMs };
}

/** Скользящее окно замеров; берётся замер с наименьшим RTT — он точнее всех. */
export function createFluoClockOffset(windowSize = DEFAULT_WINDOW) {
  const samples: FluoClockSample[] = [];
  let offsetMs = 0;
  return {
    add(sample: FluoClockSample): number {
      samples.push(sample);
      if (samples.length > windowSize) samples.shift();
      let best = samples[0];
      for (const s of samples) {
        if (s.rttMs < best.rttMs) best = s;
      }
      offsetMs = best.offsetMs;
      return offsetMs;
    },
    offsetMs(): number {
      return offsetMs;
    },
    hasSamples(): boolean {
      return samples.length > 0;
    },
  };
}
