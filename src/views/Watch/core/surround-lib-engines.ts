/**
 * IRCAM binauralFIR — matrix 5.1/7.1 → binaural.
 */

import { buildCompactHrirDataset } from './surround-hrir';

export type LibDisposable = { dispose: () => void };

function asDefault<T>(mod: T | { default: T }): T {
  if (typeof mod === 'function') return mod as T;
  if (mod && typeof mod === 'object' && 'default' in (mod as object)) {
    return (mod as { default: T }).default;
  }
  return mod as T;
}

type BinauralNode = {
  input: AudioNode;
  connect: (n: AudioNode) => unknown;
  disconnect: (n?: AudioNode) => unknown;
  setPosition: (az: number, el: number, dist: number) => void;
  HRTFDataset: unknown;
};

export async function connectIrcamMatrix(
  ctx: AudioContext,
  source: AudioNode,
  layout: '5.1' | '7.1',
): Promise<{ nodes: AudioNode[]; disposable: LibDisposable }> {
  const BinauralMod = await import('binauralfir/dist/binaural-fir.js');
  const BinauralFIR = asDefault(BinauralMod) as new (o: {
    audioContext: AudioContext;
  }) => BinauralNode;

  const dataset = buildCompactHrirDataset(ctx);
  const split = ctx.createChannelSplitter(2);
  source.connect(split);
  const L = ctx.createGain();
  const R = ctx.createGain();
  split.connect(L, 0);
  split.connect(R, 1);

  const c = ctx.createGain();
  c.gain.value = 0.707;
  L.connect(c);
  R.connect(c);

  const sl = ctx.createGain();
  const sr = ctx.createGain();
  sl.gain.value = 0.7;
  sr.gain.value = 0.7;
  const lToSl = ctx.createGain();
  const rToSl = ctx.createGain();
  const rToSr = ctx.createGain();
  const lToSr = ctx.createGain();
  lToSl.gain.value = 1;
  rToSl.gain.value = -0.5;
  rToSr.gain.value = 1;
  lToSr.gain.value = -0.5;
  L.connect(lToSl);
  R.connect(rToSl);
  lToSl.connect(sl);
  rToSl.connect(sl);
  R.connect(rToSr);
  L.connect(lToSr);
  rToSr.connect(sr);
  lToSr.connect(sr);

  const lfeLp = ctx.createBiquadFilter();
  lfeLp.type = 'lowpass';
  lfeLp.frequency.value = 120;
  const lfe = ctx.createGain();
  lfe.gain.value = 0.5;
  c.connect(lfeLp);
  lfeLp.connect(lfe);

  type Speaker = { node: AudioNode; az: number; el: number; g: number };
  const speakers: Speaker[] = [
    { node: L, az: -30, el: 0, g: 1 },
    { node: R, az: 30, el: 0, g: 1 },
    { node: c, az: 0, el: 0, g: 0.85 },
    { node: lfe, az: 0, el: -35, g: 0.65 },
    { node: sl, az: -110, el: 0, g: 0.75 },
    { node: sr, az: 110, el: 0, g: 0.75 },
  ];

  if (layout === '7.1') {
    const bl = ctx.createGain();
    const br = ctx.createGain();
    bl.gain.value = 0.55;
    br.gain.value = 0.55;
    const lToBl = ctx.createGain();
    const rToBl = ctx.createGain();
    const rToBr = ctx.createGain();
    const lToBr = ctx.createGain();
    lToBl.gain.value = 0.9;
    rToBl.gain.value = -0.35;
    rToBr.gain.value = 0.9;
    lToBr.gain.value = -0.35;
    L.connect(lToBl);
    R.connect(rToBl);
    lToBl.connect(bl);
    rToBl.connect(bl);
    R.connect(rToBr);
    L.connect(lToBr);
    rToBr.connect(br);
    lToBr.connect(br);
    speakers.push(
      { node: bl, az: -150, el: 0, g: 0.7 },
      { node: br, az: 150, el: 0, g: 0.7 },
    );
  }

  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  const firs: BinauralNode[] = [];
  const graphNodes: AudioNode[] = [split, L, R, c, sl, sr, lfeLp, lfe, master];

  for (const sp of speakers) {
    const fir = new BinauralFIR({ audioContext: ctx });
    fir.HRTFDataset = dataset;
    fir.setPosition(sp.az, sp.el, 1);
    const g = ctx.createGain();
    g.gain.value = sp.g;
    sp.node.connect(g);
    g.connect(fir.input);
    fir.connect(master);
    firs.push(fir);
    graphNodes.push(g);
  }

  return {
    nodes: graphNodes,
    disposable: {
      dispose: () => {
        for (const fir of firs) {
          try { fir.disconnect(master); } catch { /* ignore */ }
        }
      },
    },
  };
}
