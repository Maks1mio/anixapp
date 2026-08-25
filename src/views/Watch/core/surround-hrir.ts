/**
 * Компактный HRIR-набор для IRCAM binauralFIR.
 * Полный complete_hrtfs.js (~12 МБ) не бандлим: генерируем ITD/ILD-импульсы
 * на сетке азимутов, совместимой с API binauralFIR.
 */

export type HrirPoint = {
  azimuth: number;
  elevation: number;
  distance: number;
  buffer: AudioBuffer;
};

/** Woodworth-ish ITD (сек) по азимуту. */
function itdSeconds(azDeg: number): number {
  const a = Math.max(-90, Math.min(90, azDeg));
  return 0.00065 * Math.sin((a * Math.PI) / 180);
}

function makeStereoHrir(
  ctx: AudioContext,
  azDeg: number,
  elevDeg: number,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.ceil(sr * 0.008); // ~8 ms
  const buf = ctx.createBuffer(2, len, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const itd = itdSeconds(azDeg);
  const delayL = Math.max(0, Math.round((-itd * 0.5) * sr));
  const delayR = Math.max(0, Math.round((itd * 0.5) * sr));

  // ILD: дальнее ухо тише
  const ild = Math.min(0.85, Math.abs(azDeg) / 120);
  const leftGain = azDeg > 0 ? 1 - ild * 0.55 : 1;
  const rightGain = azDeg < 0 ? 1 - ild * 0.55 : 1;
  const elevAtten = 1 - Math.min(0.35, Math.abs(elevDeg) / 180);

  for (let i = 0; i < 48; i++) {
    const env = Math.exp(-i / 10) * elevAtten;
    const sample = (Math.random() * 2 - 1) * 0.15 * env + (i === 0 ? 0.85 * elevAtten : 0);
    const li = i + delayL;
    const ri = i + delayR;
    if (li < len) L[li] += sample * leftGain;
    if (ri < len) R[ri] += sample * rightGain;
  }
  return buf;
}

/** Сетка для 5.1 / 7.1 виртуальных колонок + интерполяция. */
export function buildCompactHrirDataset(ctx: AudioContext): HrirPoint[] {
  const azimuths: number[] = [];
  for (let a = -180; a <= 180; a += 15) azimuths.push(a);
  const elevations = [-40, -20, 0, 20, 40];
  const out: HrirPoint[] = [];
  for (const elevation of elevations) {
    for (const azimuth of azimuths) {
      out.push({
        azimuth,
        elevation,
        distance: 1,
        buffer: makeStereoHrir(ctx, azimuth, elevation),
      });
    }
  }
  return out;
}
