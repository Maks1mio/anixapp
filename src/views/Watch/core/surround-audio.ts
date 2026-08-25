/**
 * Объёмный звук для стерео-видео:
 *  • Matrix + Web Audio HRTF (кино 5.1 / 7.1)
 *  • Imaging (Haas / Widener / Super Stereo / Spatial)
 *  • IRCAM binauralFIR
 *  • 7-полосный эквалайзер
 *
 * MediaElementSource создаётся один раз на <video> до dispose().
 */

import { connectIrcamMatrix, type LibDisposable } from './surround-lib-engines';
import {
  EQ_BANDS,
  clampEqGain,
  defaultEqGains,
  eqLevelToLinear,
  normalizeEqGains,
  type EqBandId,
  type EqGains,
} from './surround-eq';

export type SurroundMode =
  | 'off'
  | 'cinema'
  | 'cinemaPlus'
  | 'haas'
  | 'widener'
  | 'superStereo'
  | 'spatial'
  | 'ircam51'
  | 'ircam71'
  | 'equalizer';

export type SurroundPresetMeta = {
  id: SurroundMode;
  label: string;
  short?: string;
  hint?: string;
  recommended?: boolean;
  lib?: string;
  channels: string;
};

export type SurroundGroup = {
  label: string;
  modes: readonly SurroundMode[];
};

const MODE_LIST: readonly SurroundPresetMeta[] = [
  { id: 'off', label: 'Выкл', channels: '2.0', hint: 'Без обработки, исходное стерео' },
  {
    id: 'cinema',
    label: 'Кино · HRTF',
    short: 'Кино',
    channels: '5.1',
    hint: 'Matrix 5.1 → HRTF в 2.0',
    lib: 'Web Audio PannerNode HRTF',
    recommended: true,
  },
  {
    id: 'cinemaPlus',
    label: 'Кино+ · HRTF',
    short: 'Кино+',
    channels: '7.1',
    hint: 'Matrix 7.1 → HRTF в 2.0',
    lib: 'Web Audio PannerNode HRTF',
  },
  {
    id: 'haas',
    label: 'Haas',
    short: 'Haas',
    channels: '2.0',
    hint: 'Precedence / phantom stereo',
    lib: '@audio/spatial-haas',
  },
  {
    id: 'widener',
    label: 'Widener',
    short: 'Widener',
    channels: '2.0',
    hint: 'Mid/Side расширение стереобазы',
    lib: '@audio/spatial-widener',
  },
  {
    id: 'superStereo',
    label: 'Super Stereo',
    short: 'Super',
    channels: '2.0',
    hint: 'Акцент разности каналов + Haas',
    lib: 'FFmpeg extrastereo-like',
  },
  {
    id: 'spatial',
    label: 'Spatial Mix',
    short: 'Spatial',
    channels: '2.0',
    hint: 'Crossfeed + Haas + Widener',
    lib: '@audio/spatial stack',
  },
  {
    id: 'ircam51',
    label: 'IRCAM · 5.1',
    short: 'IRCAM',
    channels: '5.1',
    hint: 'binauralFIR matrix 5.1 → binaural 2.0',
    lib: 'binauralfir (IRCAM)',
  },
  {
    id: 'ircam71',
    label: 'IRCAM · 7.1',
    short: 'IRCAM+',
    channels: '7.1',
    hint: 'binauralFIR matrix 7.1 → binaural 2.0',
    lib: 'binauralfir (IRCAM)',
  },
  {
    id: 'equalizer',
    label: 'Эквалайзер',
    short: 'EQ',
    channels: '2.0',
    hint: '10 полос, ручная настройка ±12 дБ',
    lib: 'Web Audio BiquadFilter',
  },
];

export const SURROUND_MODES: readonly SurroundPresetMeta[] = MODE_LIST;

export const SURROUND_GROUPS: readonly SurroundGroup[] = [
  { label: 'Кино', modes: ['cinema', 'cinemaPlus'] },
  { label: 'Imaging', modes: ['haas', 'widener', 'superStereo'] },
  { label: 'Пространство', modes: ['spatial'] },
  { label: 'Библиотеки', modes: ['ircam51', 'ircam71'] },
];

/** Старые / удалённые ключи → актуальные режимы. */
const LEGACY: Record<string, SurroundMode> = {
  off: 'off',
  soft: 'off',
  headphones: 'off',
  cinema: 'cinema',
  wide: 'cinemaPlus',
  cinemaPlus: 'cinemaPlus',
  immersive: 'cinemaPlus',
  bs2b: 'off',
  bs2bMeier: 'off',
  crossfeed: 'off',
  haas: 'haas',
  widener: 'widener',
  superStereo: 'superStereo',
  hall: 'spatial',
  spatial: 'spatial',
  toneWidener: 'widener',
  toneHall: 'spatial',
  tunaChorus: 'spatial',
  tunaSpace: 'spatial',
  ircam51: 'ircam51',
  ircam71: 'ircam71',
  equalizer: 'equalizer',
};

export type { EqBandId, EqGains };
export {
  EQ_BANDS,
  EQ_GAIN_MIN,
  EQ_GAIN_MAX,
  EQ_GAIN_STEP,
  defaultEqGains,
  normalizeEqGains,
  normalizeEqLevel,
  eqLevelToLinear,
  formatEqGain,
  formatEqGainBadge,
  clampEqGain,
} from './surround-eq';

export function isSurroundMode(v: unknown): v is SurroundMode {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(LEGACY, v)
    && LEGACY[v] === v;
}

export function normalizeSurroundMode(v: unknown): SurroundMode {
  if (typeof v === 'string' && v in LEGACY) return LEGACY[v]!;
  return 'off';
}

export function surroundModeMeta(mode: SurroundMode): SurroundPresetMeta | undefined {
  return MODE_LIST.find((m) => m.id === mode);
}

export function surroundModeLabel(mode: SurroundMode): string {
  return surroundModeDisplayLabel(mode);
}

/** Подпись в списках: «Кино · HRTF · 5.1» */
export function surroundModeDisplayLabel(mode: SurroundMode, withStar = false): string {
  const m = surroundModeMeta(mode);
  if (!m) return 'Выкл · 2.0';
  const star = withStar && m.recommended ? ' ★' : '';
  return `${m.label}${star} · ${m.channels}`;
}

export function surroundModeShort(mode: SurroundMode): string | null {
  if (mode === 'off') return null;
  const m = surroundModeMeta(mode);
  if (!m) return null;
  const name = m.short ?? m.label;
  return `${name} · ${m.channels}`;
}

type GraphNodes = { nodes: AudioNode[] };

export class SurroundController {
  private ctx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private video: HTMLVideoElement | null = null;
  private mode: SurroundMode = 'off';
  private graph: GraphNodes | null = null;
  private libDisposable: LibDisposable | null = null;
  private rebuildGen = 0;
  private playResumeBound = false;
  private eqGains: EqGains = defaultEqGains();
  private eqLevelDb = 0;
  private eqFilters: BiquadFilterNode[] = [];
  private eqMaster: GainNode | null = null;

  get currentMode(): SurroundMode {
    return this.mode;
  }

  get currentEqGains(): EqGains {
    return { ...this.eqGains };
  }

  get currentEqLevel(): number {
    return this.eqLevelDb;
  }

  get attached(): boolean {
    return this.source != null;
  }

  get active(): boolean {
    return this.mode !== 'off' && this.source != null;
  }

  async attach(video: HTMLVideoElement | null): Promise<void> {
    if (!video) return;
    if (this.video === video && this.source) {
      await this.resume();
      return;
    }
    this.disposeGraphOnly();
    if (this.source && this.video && this.video !== video) this.dispose();
    this.video = video;
    this.ensureContext();
    if (!this.source) {
      try {
        this.source = this.ctx!.createMediaElementSource(video);
      } catch (err) {
        console.warn('[surround] createMediaElementSource failed', err);
        this.source = null;
        return;
      }
    }
    this.bindPlayResume(video);
    await this.rebuild();
    await this.resume();
  }

  async setMode(mode: SurroundMode): Promise<void> {
    const next = normalizeSurroundMode(mode);
    if (this.mode === next && this.graph) {
      await this.resume();
      return;
    }
    this.mode = next;
    if (!this.source || !this.ctx) return;
    await this.rebuild();
    await this.resume();
  }

  /** Обновить полосы EQ (живо, без rebuild). Пока граф собирается — только сохраняем gains. */
  async setEqGains(gains: EqGains | Partial<EqGains>): Promise<void> {
    this.eqGains = normalizeEqGains({ ...this.eqGains, ...gains });
    if (this.mode !== 'equalizer') return;
    if (this.eqFilters.length !== EQ_BANDS.length || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < EQ_BANDS.length; i++) {
      const band = EQ_BANDS[i]!;
      const f = this.eqFilters[i];
      if (!f) continue;
      const db = this.eqGains[band.id];
      try {
        f.gain.cancelScheduledValues(t);
        f.gain.setTargetAtTime(db, t, 0.012);
      } catch {
        f.gain.value = db;
      }
    }
    await this.resume();
  }

  /** Общее усиление (preamp), дБ — живо. */
  async setEqLevel(db: number): Promise<void> {
    this.eqLevelDb = clampEqGain(db);
    if (this.mode !== 'equalizer' || !this.eqMaster || !this.ctx) return;
    const linear = eqLevelToLinear(this.eqLevelDb);
    const t = this.ctx.currentTime;
    try {
      this.eqMaster.gain.cancelScheduledValues(t);
      this.eqMaster.gain.setTargetAtTime(linear, t, 0.012);
    } catch {
      this.eqMaster.gain.value = linear;
    }
    await this.resume();
  }

  async resume(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* autoplay */ }
    }
  }

  dispose(): void {
    this.unbindPlayResume();
    this.disposeGraphOnly();
    try { this.source?.disconnect(); } catch { /* ignore */ }
    this.source = null;
    this.video = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.mode = 'off';
  }

  private ensureContext(): void {
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
  }

  private bindPlayResume(video: HTMLVideoElement): void {
    if (this.playResumeBound) return;
    video.addEventListener('play', this.onVideoPlay);
    this.playResumeBound = true;
  }

  private unbindPlayResume(): void {
    if (!this.playResumeBound || !this.video) return;
    this.video.removeEventListener('play', this.onVideoPlay);
    this.playResumeBound = false;
  }

  private onVideoPlay = (): void => { void this.resume(); };

  private disposeGraphOnly(): void {
    if (this.libDisposable) {
      try { this.libDisposable.dispose(); } catch { /* ignore */ }
      this.libDisposable = null;
    }
    this.eqFilters = [];
    this.eqMaster = null;
    if (this.graph) {
      for (const n of this.graph.nodes) {
        try { n.disconnect(); } catch { /* ignore */ }
      }
      this.graph = null;
    }
    try { this.source?.disconnect(); } catch { /* ignore */ }
  }

  private async rebuild(): Promise<void> {
    if (!this.ctx || !this.source) return;
    const gen = ++this.rebuildGen;
    this.disposeGraphOnly();
    if (gen !== this.rebuildGen) return;

    if (this.mode === 'off') {
      this.source.connect(this.ctx.destination);
      this.graph = { nodes: [] };
      return;
    }

    if (this.mode === 'ircam51' || this.mode === 'ircam71') {
      await this.rebuildLib(this.mode);
      return;
    }

    const builders: Record<string, () => GraphNodes> = {
      cinema: () => this.buildCinemaHrtf({ rear: 0.65, dist: 1.2, master: 0.72, plus: false }),
      cinemaPlus: () => this.buildCinemaHrtf({ rear: 0.9, dist: 1.45, master: 0.68, plus: true }),
      haas: () => this.buildHaas({ delayMs: 18 }),
      widener: () => this.buildWidener({ width: 1.55 }),
      superStereo: () => this.buildSuperStereo(),
      spatial: () => this.buildSpatialMix(),
      equalizer: () => this.buildEqualizer(),
    };
    const build = builders[this.mode];
    this.graph = build ? build() : { nodes: [] };
  }

  private async rebuildLib(mode: SurroundMode): Promise<void> {
    if (!this.ctx || !this.source) return;
    const gen = this.rebuildGen;
    try {
      const { nodes, disposable } = await connectIrcamMatrix(
        this.ctx,
        this.source,
        mode === 'ircam71' ? '7.1' : '5.1',
      );
      if (gen !== this.rebuildGen) {
        disposable.dispose();
        for (const n of nodes) {
          try { n.disconnect(); } catch { /* ignore */ }
        }
        return;
      }
      this.libDisposable = disposable;
      this.graph = { nodes };
    } catch (err) {
      console.warn('[surround] IRCAM engine failed, falling back to cinema', err);
      if (gen !== this.rebuildGen) return;
      this.graph = this.buildCinemaHrtf({ rear: 0.65, dist: 1.2, master: 0.72, plus: false });
    }
  }

  private buildEqualizer(): GraphNodes {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const filters: BiquadFilterNode[] = [];
    let prev: AudioNode = this.source!;
    for (const band of EQ_BANDS) {
      const f = this.track(nodes, ctx.createBiquadFilter());
      f.type = 'peaking';
      f.frequency.value = band.hz;
      f.Q.value = 1.1;
      f.gain.value = clampEqGain(this.eqGains[band.id]);
      prev.connect(f);
      prev = f;
      filters.push(f);
    }
    this.eqFilters = filters;
    const master = this.track(nodes, ctx.createGain());
    master.gain.value = eqLevelToLinear(this.eqLevelDb);
    this.eqMaster = master;
    prev.connect(master);
    master.connect(ctx.destination);
    return { nodes };
  }

  private track<T extends AudioNode>(nodes: AudioNode[], n: T): T {
    nodes.push(n);
    return n;
  }

  private setupListener(): void {
    const listener = this.ctx!.listener;
    if (!listener.positionX) return;
    listener.positionX.value = 0;
    listener.positionY.value = 0;
    listener.positionZ.value = 0;
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  }

  private setPannerAzimuth(panner: PannerNode, azDeg: number, distance: number): void {
    this.setPannerSpherical(panner, azDeg, 0, distance);
  }

  private setPannerSpherical(
    panner: PannerNode,
    azDeg: number,
    elevDeg: number,
    distance: number,
  ): void {
    const az = (azDeg * Math.PI) / 180;
    const el = (elevDeg * Math.PI) / 180;
    const x = Math.sin(az) * Math.cos(el) * distance;
    const y = Math.sin(el) * distance;
    const z = -Math.cos(az) * Math.cos(el) * distance;
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else {
      // @ts-expect-error legacy
      panner.setPosition(x, y, z);
    }
  }

  private splitStereo(nodes: AudioNode[]): { L: GainNode; R: GainNode } {
    const ctx = this.ctx!;
    const split = this.track(nodes, ctx.createChannelSplitter(2));
    this.source!.connect(split);
    const L = this.track(nodes, ctx.createGain());
    const R = this.track(nodes, ctx.createGain());
    L.gain.value = 1;
    R.gain.value = 1;
    split.connect(L, 0);
    split.connect(R, 1);
    return { L, R };
  }

  private buildCinemaHrtf(opts: {
    rear: number;
    dist: number;
    master: number;
    plus: boolean;
  }): GraphNodes {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const t = <T extends AudioNode>(n: T) => this.track(nodes, n);
    this.setupListener();
    const { L, R } = this.splitStereo(nodes);

    const fl = t(ctx.createGain());
    const fr = t(ctx.createGain());
    const c = t(ctx.createGain());
    const sl = t(ctx.createGain());
    const sr = t(ctx.createGain());
    fl.gain.value = 1;
    fr.gain.value = 1;
    c.gain.value = opts.plus ? 0.6 : 0.707;
    sl.gain.value = opts.rear;
    sr.gain.value = opts.rear;

    L.connect(fl);
    R.connect(fr);

    const lToC = t(ctx.createGain());
    const rToC = t(ctx.createGain());
    lToC.gain.value = 1;
    rToC.gain.value = 1;
    L.connect(lToC);
    R.connect(rToC);
    lToC.connect(c);
    rToC.connect(c);

    const diff = opts.plus ? -0.65 : -0.5;
    const lToSl = t(ctx.createGain());
    const rToSl = t(ctx.createGain());
    lToSl.gain.value = 1;
    rToSl.gain.value = diff;
    L.connect(lToSl);
    R.connect(rToSl);
    lToSl.connect(sl);
    rToSl.connect(sl);

    const rToSr = t(ctx.createGain());
    const lToSr = t(ctx.createGain());
    rToSr.gain.value = 1;
    lToSr.gain.value = diff;
    R.connect(rToSr);
    L.connect(lToSr);
    rToSr.connect(sr);
    lToSr.connect(sr);

    const slTone = t(ctx.createBiquadFilter());
    const srTone = t(ctx.createBiquadFilter());
    for (const f of [slTone, srTone]) {
      f.type = 'highshelf';
      f.frequency.value = 2200;
      f.gain.value = opts.plus ? 3.5 : 2;
    }
    sl.connect(slTone);
    sr.connect(srTone);

    // LFE (.1) — низкочастотный канал из центра
    const lfeLp = t(ctx.createBiquadFilter());
    lfeLp.type = 'lowpass';
    lfeLp.frequency.value = 120;
    lfeLp.Q.value = 0.7;
    const lfe = t(ctx.createGain());
    lfe.gain.value = 0.55;
    c.connect(lfeLp);
    lfeLp.connect(lfe);

    const speakers: { node: AudioNode; az: number; elev: number; g: number; dist?: number }[] = [
      { node: fl, az: -30, elev: 0, g: 1 },
      { node: fr, az: 30, elev: 0, g: 1 },
      { node: c, az: 0, elev: 0, g: 0.85 },
      { node: lfe, az: 0, elev: -30, g: 0.7, dist: 1 },
      { node: slTone, az: opts.plus ? -100 : -110, elev: 0, g: 0.8 },
      { node: srTone, az: opts.plus ? 100 : 110, elev: 0, g: 0.8 },
    ];

    // 7.1: задние BL/BR
    if (opts.plus) {
      const bl = t(ctx.createGain());
      const br = t(ctx.createGain());
      bl.gain.value = opts.rear * 0.75;
      br.gain.value = opts.rear * 0.75;
      const lToBl = t(ctx.createGain());
      const rToBl = t(ctx.createGain());
      const rToBr = t(ctx.createGain());
      const lToBr = t(ctx.createGain());
      lToBl.gain.value = 0.85;
      rToBl.gain.value = -0.4;
      rToBr.gain.value = 0.85;
      lToBr.gain.value = -0.4;
      L.connect(lToBl);
      R.connect(rToBl);
      lToBl.connect(bl);
      rToBl.connect(bl);
      R.connect(rToBr);
      L.connect(lToBr);
      rToBr.connect(br);
      lToBr.connect(br);
      speakers.push(
        { node: bl, az: -150, elev: 0, g: 0.7 },
        { node: br, az: 150, elev: 0, g: 0.7 },
      );
    }

    const master = t(ctx.createGain());
    master.gain.value = opts.master;

    for (const s of speakers) {
      const g = t(ctx.createGain());
      g.gain.value = s.g;
      const panner = t(ctx.createPanner());
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 12;
      panner.rolloffFactor = 1;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      this.setPannerSpherical(panner, s.az, s.elev, s.dist ?? opts.dist);
      s.node.connect(g);
      g.connect(panner);
      panner.connect(master);
    }

    master.connect(ctx.destination);
    return { nodes };
  }

  /** BS2B-style (libbs2b / Bauer). */
  private buildBs2b(opts: { fc: number; feedDb: number; widen: number }): GraphNodes {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const t = <T extends AudioNode>(n: T) => this.track(nodes, n);
    const split = t(ctx.createChannelSplitter(2));
    this.source!.connect(split);

    const feed = Math.pow(10, opts.feedDb / 20);
    const lpL = t(ctx.createBiquadFilter());
    const lpR = t(ctx.createBiquadFilter());
    for (const f of [lpL, lpR]) {
      f.type = 'lowpass';
      f.frequency.value = opts.fc;
      f.Q.value = 0.5;
    }
    const dL = t(ctx.createDelay(0.001));
    const dR = t(ctx.createDelay(0.001));
    dL.delayTime.value = 0.00035;
    dR.delayTime.value = 0.00035;
    const feedR = t(ctx.createGain());
    const feedL = t(ctx.createGain());
    feedR.gain.value = feed;
    feedL.gain.value = feed;
    const dryL = t(ctx.createGain());
    const dryR = t(ctx.createGain());
    dryL.gain.value = 1;
    dryR.gain.value = 1;

    const merge = t(ctx.createChannelMerger(2));
    split.connect(dryL, 0);
    split.connect(dryR, 1);
    dryL.connect(merge, 0, 0);
    dryR.connect(merge, 0, 1);
    split.connect(lpL, 0);
    split.connect(lpR, 1);
    lpL.connect(dL);
    lpR.connect(dR);
    dL.connect(feedR);
    dR.connect(feedL);
    feedR.connect(merge, 0, 1);
    feedL.connect(merge, 0, 0);

    return this.finishWithWiden(nodes, merge, opts.widen, 0.95);
  }

  /**
   * @audio/spatial-crossfeed style: level mixes filtered opposite channel,
   * dry scaled by (1 - level*0.5).
   */
  private buildCrossfeed(opts: { fc: number; level: number }): GraphNodes {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const t = <T extends AudioNode>(n: T) => this.track(nodes, n);
    const split = t(ctx.createChannelSplitter(2));
    this.source!.connect(split);

    const dryGain = 1 - opts.level * 0.5;
    const wetGain = opts.level * 0.5;
    const dryL = t(ctx.createGain());
    const dryR = t(ctx.createGain());
    dryL.gain.value = dryGain;
    dryR.gain.value = dryGain;
    const lpL = t(ctx.createBiquadFilter());
    const lpR = t(ctx.createBiquadFilter());
    for (const f of [lpL, lpR]) {
      f.type = 'lowpass';
      f.frequency.value = opts.fc;
      f.Q.value = 0.707;
    }
    const wetL = t(ctx.createGain());
    const wetR = t(ctx.createGain());
    wetL.gain.value = wetGain;
    wetR.gain.value = wetGain;

    const merge = t(ctx.createChannelMerger(2));
    split.connect(dryL, 0);
    split.connect(dryR, 1);
    dryL.connect(merge, 0, 0);
    dryR.connect(merge, 0, 1);
    // cross: filtered R → L, filtered L → R
    split.connect(lpR, 1);
    split.connect(lpL, 0);
    lpR.connect(wetL);
    lpL.connect(wetR);
    wetL.connect(merge, 0, 0);
    wetR.connect(merge, 0, 1);

    const master = t(ctx.createGain());
    master.gain.value = 1;
    merge.connect(master);
    master.connect(ctx.destination);
    return { nodes };
  }

  /** @audio/spatial-haas — delay one channel. */
  private buildHaas(opts: { delayMs: number }): GraphNodes {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const t = <T extends AudioNode>(n: T) => this.track(nodes, n);
    const split = t(ctx.createChannelSplitter(2));
    this.source!.connect(split);
    const delay = t(ctx.createDelay(0.05));
    delay.delayTime.value = opts.delayMs / 1000;
    const merge = t(ctx.createChannelMerger(2));
    split.connect(merge, 0, 0);
    split.connect(delay, 1);
    delay.connect(merge, 0, 1);
    const master = t(ctx.createGain());
    master.gain.value = 1;
    merge.connect(master);
    master.connect(ctx.destination);
    return { nodes };
  }

  /** @audio/spatial-widener / Tone.StereoWidener — mid/side. */
  private buildWidener(opts: { width: number }): GraphNodes {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const split = this.track(nodes, ctx.createChannelSplitter(2));
    this.source!.connect(split);
    const merge = this.track(nodes, ctx.createChannelMerger(2));
    // temporary unity merge then widen helper
    split.connect(merge, 0, 0);
    split.connect(merge, 1, 1);
    return this.finishWithWiden(nodes, merge, opts.width, 0.92);
  }

  private buildSuperStereo(): GraphNodes {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const t = <T extends AudioNode>(n: T) => this.track(nodes, n);
    const { L, R } = this.splitStereo(nodes);

    // extrastereo-like: boost difference
    const mid = t(ctx.createGain());
    const side = t(ctx.createGain());
    mid.gain.value = 0.85;
    side.gain.value = 1.85;
    const lToM = t(ctx.createGain());
    const rToM = t(ctx.createGain());
    const lToS = t(ctx.createGain());
    const rToS = t(ctx.createGain());
    lToM.gain.value = 0.5;
    rToM.gain.value = 0.5;
    lToS.gain.value = 0.5;
    rToS.gain.value = -0.5;
    L.connect(lToM);
    R.connect(rToM);
    L.connect(lToS);
    R.connect(rToS);
    lToM.connect(mid);
    rToM.connect(mid);
    lToS.connect(side);
    rToS.connect(side);

    const merge = t(ctx.createChannelMerger(2));
    const mL = t(ctx.createGain());
    const sL = t(ctx.createGain());
    const mR = t(ctx.createGain());
    const sR = t(ctx.createGain());
    mL.gain.value = 1;
    sL.gain.value = 1;
    mR.gain.value = 1;
    sR.gain.value = -1;
    mid.connect(mL);
    side.connect(sL);
    mid.connect(mR);
    side.connect(sR);
    mL.connect(merge, 0, 0);
    sL.connect(merge, 0, 0);
    mR.connect(merge, 0, 1);
    sR.connect(merge, 0, 1);

    // tiny Haas on right for depth
    const outSplit = t(ctx.createChannelSplitter(2));
    const delay = t(ctx.createDelay(0.03));
    delay.delayTime.value = 0.012;
    const outMerge = t(ctx.createChannelMerger(2));
    merge.connect(outSplit);
    outSplit.connect(outMerge, 0, 0);
    outSplit.connect(delay, 1);
    delay.connect(outMerge, 0, 1);

    const master = t(ctx.createGain());
    master.gain.value = 0.85;
    outMerge.connect(master);
    master.connect(ctx.destination);
    return { nodes };
  }

  /** Freeverb-like: parallel combs + allpasses (Schroeder). */
  private buildHall(opts: { wet: number }): GraphNodes {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const t = <T extends AudioNode>(n: T) => this.track(nodes, n);
    const input = t(ctx.createGain());
    this.source!.connect(input);

    const dry = t(ctx.createGain());
    dry.gain.value = 1 - opts.wet * 0.55;
    input.connect(dry);

    const combTimes = [0.0297, 0.0371, 0.0411, 0.0437];
    const combBus = t(ctx.createGain());
    combBus.gain.value = 1;
    for (const sec of combTimes) {
      const d = t(ctx.createDelay(0.1));
      d.delayTime.value = sec;
      const fb = t(ctx.createGain());
      fb.gain.value = 0.78;
      const lp = t(ctx.createBiquadFilter());
      lp.type = 'lowpass';
      lp.frequency.value = 4200;
      input.connect(d);
      d.connect(lp);
      lp.connect(fb);
      fb.connect(d);
      lp.connect(combBus);
    }

    let ap: AudioNode = combBus;
    for (const sec of [0.005, 0.0017]) {
      const d = t(ctx.createDelay(0.02));
      d.delayTime.value = sec;
      const g = t(ctx.createGain());
      g.gain.value = 0.5;
      const sum = t(ctx.createGain());
      ap.connect(d);
      d.connect(g);
      g.connect(sum);
      ap.connect(sum);
      ap = sum;
    }

    const wet = t(ctx.createGain());
    wet.gain.value = opts.wet;
    ap.connect(wet);

    const master = t(ctx.createGain());
    master.gain.value = 0.9;
    dry.connect(master);
    wet.connect(master);
    master.connect(ctx.destination);
    return { nodes };
  }

  private buildImmersive(): GraphNodes {
    const ctx = this.ctx!;
    const n2: AudioNode[] = [];
    const t = <T extends AudioNode>(n: T) => this.track(n2, n);
    this.setupListener();
    const { L, R } = this.splitStereo(n2);

    const merge = t(ctx.createChannelMerger(2));
    L.connect(merge, 0, 0);
    R.connect(merge, 0, 1);

    const widenIn = t(ctx.createGain());
    merge.connect(widenIn);

    const split = t(ctx.createChannelSplitter(2));
    widenIn.connect(split);
    const sideDelay = t(ctx.createDelay(0.05));
    sideDelay.delayTime.value = 0.022;
    const sideGain = t(ctx.createGain());
    sideGain.gain.value = 0.35;
    const fold = t(ctx.createChannelMerger(2));
    split.connect(fold, 0, 0);
    split.connect(fold, 1, 1);
    split.connect(sideDelay, 0);
    sideDelay.connect(sideGain);
    sideGain.connect(fold, 0, 1);
    const sideDelay2 = t(ctx.createDelay(0.05));
    sideDelay2.delayTime.value = 0.026;
    const sideGain2 = t(ctx.createGain());
    sideGain2.gain.value = 0.35;
    split.connect(sideDelay2, 1);
    sideDelay2.connect(sideGain2);
    sideGain2.connect(fold, 0, 0);

    const out = t(ctx.createGain());
    out.gain.value = 0.7;
    for (const [ch, az] of [[0, -28], [1, 28]] as const) {
      const g = t(ctx.createGain());
      g.gain.value = 1;
      const p = t(ctx.createPanner());
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1;
      this.setPannerAzimuth(p, az, 1.15);
      const s = t(ctx.createChannelSplitter(2));
      fold.connect(s);
      s.connect(g, ch);
      g.connect(p);
      p.connect(out);
    }

    const dry = t(ctx.createGain());
    dry.gain.value = 0.78;
    out.connect(dry);

    const hallIn = t(ctx.createGain());
    out.connect(hallIn);
    const combT = [0.031, 0.037, 0.043];
    const combBus = t(ctx.createGain());
    for (const sec of combT) {
      const d = t(ctx.createDelay(0.1));
      d.delayTime.value = sec;
      const fb = t(ctx.createGain());
      fb.gain.value = 0.7;
      hallIn.connect(d);
      d.connect(fb);
      fb.connect(d);
      d.connect(combBus);
    }
    const wet = t(ctx.createGain());
    wet.gain.value = 0.18;
    combBus.connect(wet);

    const master = t(ctx.createGain());
    master.gain.value = 0.88;
    dry.connect(master);
    wet.connect(master);
    master.connect(ctx.destination);
    return { nodes: n2 };
  }

  /** Crossfeed + Haas + Widener (@audio/spatial stack). */
  private buildSpatialMix(): GraphNodes {
    const ctx = this.ctx!;
    const nodes: AudioNode[] = [];
    const t = <T extends AudioNode>(n: T) => this.track(nodes, n);
    const split = t(ctx.createChannelSplitter(2));
    this.source!.connect(split);

    // crossfeed
    const level = 0.28;
    const dryG = 1 - level * 0.5;
    const wetG = level * 0.5;
    const dryL = t(ctx.createGain());
    const dryR = t(ctx.createGain());
    dryL.gain.value = dryG;
    dryR.gain.value = dryG;
    const lpL = t(ctx.createBiquadFilter());
    const lpR = t(ctx.createBiquadFilter());
    lpL.type = 'lowpass';
    lpR.type = 'lowpass';
    lpL.frequency.value = 700;
    lpR.frequency.value = 700;
    const wL = t(ctx.createGain());
    const wR = t(ctx.createGain());
    wL.gain.value = wetG;
    wR.gain.value = wetG;
    const m1 = t(ctx.createChannelMerger(2));
    split.connect(dryL, 0);
    split.connect(dryR, 1);
    dryL.connect(m1, 0, 0);
    dryR.connect(m1, 0, 1);
    split.connect(lpL, 0);
    split.connect(lpR, 1);
    lpL.connect(wR);
    lpR.connect(wL);
    wL.connect(m1, 0, 0);
    wR.connect(m1, 0, 1);

    // Haas on R
    const s2 = t(ctx.createChannelSplitter(2));
    m1.connect(s2);
    const delay = t(ctx.createDelay(0.04));
    delay.delayTime.value = 0.014;
    const m2 = t(ctx.createChannelMerger(2));
    s2.connect(m2, 0, 0);
    s2.connect(delay, 1);
    delay.connect(m2, 0, 1);

    return this.finishWithWiden(nodes, m2, 1.28, 0.92);
  }

  private finishWithWiden(
    nodes: AudioNode[],
    input: AudioNode,
    width: number,
    masterGain: number,
  ): GraphNodes {
    const ctx = this.ctx!;
    const t = <T extends AudioNode>(n: T) => this.track(nodes, n);
    const split = t(ctx.createChannelSplitter(2));
    input.connect(split);

    const mid = t(ctx.createGain());
    const side = t(ctx.createGain());
    mid.gain.value = 1;
    side.gain.value = width;

    const lToM = t(ctx.createGain());
    const rToM = t(ctx.createGain());
    const lToS = t(ctx.createGain());
    const rToS = t(ctx.createGain());
    lToM.gain.value = 0.5;
    rToM.gain.value = 0.5;
    lToS.gain.value = 0.5;
    rToS.gain.value = -0.5;
    split.connect(lToM, 0);
    split.connect(rToM, 1);
    split.connect(lToS, 0);
    split.connect(rToS, 1);
    lToM.connect(mid);
    rToM.connect(mid);
    lToS.connect(side);
    rToS.connect(side);

    const merge = t(ctx.createChannelMerger(2));
    const mL = t(ctx.createGain());
    const sL = t(ctx.createGain());
    const mR = t(ctx.createGain());
    const sR = t(ctx.createGain());
    mL.gain.value = 1;
    sL.gain.value = 1;
    mR.gain.value = 1;
    sR.gain.value = -1;
    mid.connect(mL);
    side.connect(sL);
    mid.connect(mR);
    side.connect(sR);
    mL.connect(merge, 0, 0);
    sL.connect(merge, 0, 0);
    mR.connect(merge, 0, 1);
    sR.connect(merge, 0, 1);

    const master = t(ctx.createGain());
    master.gain.value = masterGain;
    merge.connect(master);
    master.connect(ctx.destination);
    return { nodes };
  }
}
