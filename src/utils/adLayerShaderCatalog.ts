/** Figma-style layer shaders (ported to WebGL2). Params follow Rest/Hover like CRT. */

export const AD_SHADER_EFFECT_TYPES = [
  'lensDistort',
  'patternRefract',
  'pixelate',
  'hatching',
  'shapeParticles',
  'halftone',
  'chromaticMetal',
  'dither',
  'gradientMap',
  'glowParticles',
  'bloom',
  'movingBlobs',
  'lightRays',
  'filterPreset',
  'channelMixer',
] as const;

export type AdShaderEffectType = (typeof AD_SHADER_EFFECT_TYPES)[number];

export type ShaderField =
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; unit?: string }
  | { key: string; label: string; kind: 'select'; options: Array<{ value: number; label: string }> }
  | { key: string; label: string; kind: 'toggle' }
  | { key: string; label: string; kind: 'color' };

export type ShaderCatalogItem = {
  type: AdShaderEffectType;
  label: string;
  animated: boolean;
  defaults: Record<string, number | boolean | string>;
  fields: ShaderField[];
};

const HEX = /^#?[0-9a-f]{6}$/i;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function asNum(v: unknown, fb: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fb;
}

function asHex(v: unknown, fb: string): string {
  const s = String(v ?? '').trim();
  if (HEX.test(s)) return s.startsWith('#') ? s.toLowerCase() : `#${s.toLowerCase()}`;
  return fb;
}

export const AD_SHADER_CATALOG: ShaderCatalogItem[] = [
  {
    type: 'lensDistort',
    label: 'Lens distortion',
    animated: false,
    defaults: { distortion: 0.5, aberration: 0.2, centerX: 50, centerY: 50, chromaticMode: 0, quality: 1 },
    fields: [
      { key: 'distortion', label: 'Distortion', kind: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'aberration', label: 'Aberration', kind: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'centerX', label: 'Center X', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'centerY', label: 'Center Y', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      {
        key: 'chromaticMode',
        label: 'Mode',
        kind: 'select',
        options: [
          { value: 0, label: 'Lateral' },
          { value: 1, label: 'Longitudinal' },
          { value: 2, label: 'Anamorphic' },
        ],
      },
      {
        key: 'quality',
        label: 'Quality',
        kind: 'select',
        options: [
          { value: 2, label: 'Low' },
          { value: 1, label: 'Medium' },
          { value: 0, label: 'High' },
        ],
      },
    ],
  },
  {
    type: 'patternRefract',
    label: 'Pattern refraction',
    animated: false,
    defaults: {
      patternType: 0, amount: 50, seamlessness: 0, frost: 0, iorDispersion: 4,
      wrapMode: 0, centerX: 50, centerY: 50, size: 8, angle: 45,
    },
    fields: [
      {
        key: 'patternType',
        label: 'Pattern',
        kind: 'select',
        options: [
          { value: 0, label: 'Lenticular' },
          { value: 1, label: 'Zigzag' },
          { value: 2, label: 'Waves' },
          { value: 3, label: 'Circular' },
          { value: 4, label: 'Curved square' },
          { value: 5, label: 'Flat square' },
        ],
      },
      { key: 'amount', label: 'Strength', kind: 'range', min: -100, max: 100, step: 1 },
      { key: 'seamlessness', label: 'Smoothness', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'frost', label: 'Frost', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'iorDispersion', label: 'Dispersion', kind: 'range', min: -100, max: 100, step: 1, unit: '%' },
      { key: 'size', label: 'Size', kind: 'range', min: 1, max: 40, step: 0.1 },
      { key: 'angle', label: 'Angle', kind: 'range', min: -180, max: 180, step: 1 },
      { key: 'centerX', label: 'Center X', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'centerY', label: 'Center Y', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      {
        key: 'wrapMode',
        label: 'Edge wrap',
        kind: 'select',
        options: [
          { value: 0, label: 'Zero' },
          { value: 1, label: 'Clamp' },
          { value: 2, label: 'Repeat' },
          { value: 3, label: 'Mirror' },
        ],
      },
    ],
  },
  {
    type: 'pixelate',
    label: 'Pixelate',
    animated: false,
    defaults: { pixelShape: 0, size: 10, stretch: 100, gap: 0, colorTrim: 2, average: 80, dissolve: 0, dissolveMode: 0, falloff: 0, knockout: 1 },
    fields: [
      {
        key: 'pixelShape',
        label: 'Shape',
        kind: 'select',
        options: [
          { value: 0, label: 'Rectangle' },
          { value: 1, label: 'Ellipse' },
          { value: 2, label: 'Hexagon' },
          { value: 3, label: 'Triangle' },
        ],
      },
      { key: 'size', label: 'Size', kind: 'range', min: 2, max: 100, step: 1 },
      { key: 'stretch', label: 'Stretch', kind: 'range', min: 0, max: 2000, step: 1, unit: '%' },
      { key: 'gap', label: 'Gap', kind: 'range', min: 0, max: 50, step: 1, unit: 'px' },
      { key: 'colorTrim', label: 'Color trim', kind: 'range', min: 2, max: 16, step: 1 },
      { key: 'average', label: 'Average color', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      {
        key: 'dissolveMode',
        label: 'Dissolve mode',
        kind: 'select',
        options: [
          { value: 0, label: 'Dropout' },
          { value: 1, label: 'Scale' },
        ],
      },
      { key: 'dissolve', label: 'Dissolve', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'falloff', label: 'Falloff', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'knockout', label: 'Knockout', kind: 'toggle' },
    ],
  },
  {
    type: 'hatching',
    label: 'Hatching',
    animated: false,
    defaults: {
      mode: 1, density: 1, softness: 0, waveFrequency: 2.8, waveAmplitude: 2.3,
      offsetX: 0, offsetY: 0, colorA: '#0a5d37', colorB: '#c7f8f8', angle: 90, scale: 8,
    },
    fields: [
      {
        key: 'mode',
        label: 'Pattern',
        kind: 'select',
        options: [
          { value: 0, label: 'Circles' },
          { value: 1, label: 'Waves' },
          { value: 2, label: 'Zigzag' },
        ],
      },
      { key: 'density', label: 'Density', kind: 'range', min: 0, max: 2, step: 0.01 },
      { key: 'softness', label: 'Softness', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'waveFrequency', label: 'Frequency', kind: 'range', min: 0, max: 20, step: 0.1 },
      { key: 'waveAmplitude', label: 'Amplitude', kind: 'range', min: 0, max: 100, step: 0.1, unit: '%' },
      { key: 'angle', label: 'Angle', kind: 'range', min: -180, max: 180, step: 1 },
      { key: 'scale', label: 'Scale', kind: 'range', min: 1, max: 40, step: 0.5 },
      { key: 'offsetX', label: 'Offset X', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'offsetY', label: 'Offset Y', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'colorA', label: 'Background', kind: 'color' },
      { key: 'colorB', label: 'Foreground', kind: 'color' },
    ],
  },
  {
    type: 'shapeParticles',
    label: 'Shape particles',
    animated: true,
    defaults: { mode: 0, threshold: 5, arrangement: 0, density: 50, dotScale: 100, softness: 0, speed: 20 },
    fields: [
      {
        key: 'mode',
        label: 'Input',
        kind: 'select',
        options: [
          { value: 0, label: 'Alpha' },
          { value: 1, label: 'Inverse alpha' },
          { value: 2, label: 'Luma' },
          { value: 3, label: 'Inverse luma' },
        ],
      },
      { key: 'arrangement', label: 'Arrangement', kind: 'select', options: [{ value: 0, label: 'Grid' }, { value: 1, label: 'Noise' }] },
      { key: 'threshold', label: 'Threshold', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'density', label: 'Dot density', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'dotScale', label: 'Dot scale', kind: 'range', min: 10, max: 500, step: 1, unit: '%' },
      { key: 'softness', label: 'Softness', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'speed', label: 'Speed', kind: 'range', min: 0, max: 100, step: 1 },
    ],
  },
  {
    type: 'halftone',
    label: 'Halftone',
    animated: false,
    defaults: { halftoneType: 0, colorMode: 0, dotSize: 20, dotScale: 1, softness: 0, rotation: 0, centerX: 50, centerY: 50, clipToAlpha: 0 },
    fields: [
      { key: 'halftoneType', label: 'Pattern', kind: 'select', options: [{ value: 0, label: 'Dot' }, { value: 1, label: 'Blended' }] },
      {
        key: 'colorMode',
        label: 'Color mode',
        kind: 'select',
        options: [
          { value: 0, label: 'CMYK' },
          { value: 1, label: 'RGB' },
          { value: 2, label: 'BW light' },
          { value: 3, label: 'BW dark' },
        ],
      },
      { key: 'dotSize', label: 'Dot size', kind: 'range', min: 4, max: 120, step: 0.5 },
      { key: 'dotScale', label: 'Dot scale', kind: 'range', min: 0, max: 2, step: 0.01 },
      { key: 'softness', label: 'Softness', kind: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'rotation', label: 'Rotation', kind: 'range', min: -180, max: 180, step: 0.5 },
      { key: 'centerX', label: 'Center X', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'centerY', label: 'Center Y', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'clipToAlpha', label: 'Clip to alpha', kind: 'toggle' },
    ],
  },
  {
    type: 'chromaticMetal',
    label: 'Chromatic metal',
    animated: false,
    defaults: { rounding: 7.5, depth: 100, roughness: 0, rgbSplit: 10, scale: 50, stretch: 200, angle: 30, repeats: 2, offset: 0, phase: 0, evolution: 0 },
    fields: [
      { key: 'rounding', label: 'Rounding', kind: 'range', min: 0, max: 10, step: 0.5 },
      { key: 'depth', label: 'Depth', kind: 'range', min: 0, max: 200, step: 1, unit: '%' },
      { key: 'roughness', label: 'Roughness', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'rgbSplit', label: 'RGB split', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'scale', label: 'Scale', kind: 'range', min: 2, max: 200, step: 1, unit: '%' },
      { key: 'stretch', label: 'Stretch', kind: 'range', min: 0, max: 500, step: 1, unit: '%' },
      { key: 'angle', label: 'Angle', kind: 'range', min: -180, max: 180, step: 1 },
      { key: 'repeats', label: 'Repeats', kind: 'range', min: 1, max: 10, step: 1 },
      { key: 'offset', label: 'Offset', kind: 'range', min: -100, max: 100, step: 1, unit: '%' },
      { key: 'phase', label: 'Phase', kind: 'range', min: -100, max: 100, step: 1, unit: '%' },
      { key: 'evolution', label: 'Evolution', kind: 'range', min: -100, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    type: 'dither',
    label: 'Dither',
    animated: false,
    defaults: { algorithm: 3, pixelSize: 2, levels: 3, brightness: 100, contrast: 1, mono: 0, monoColor: '#ffffff' },
    fields: [
      {
        key: 'algorithm',
        label: 'Style',
        kind: 'select',
        options: [
          { value: 0, label: 'Bayer 2×2' },
          { value: 1, label: 'Bayer 4×4' },
          { value: 2, label: 'Bayer 8×8' },
          { value: 3, label: 'Bayer 16×16' },
          { value: 4, label: 'Blue noise' },
          { value: 5, label: 'Threshold' },
        ],
      },
      { key: 'pixelSize', label: 'Size', kind: 'range', min: 1, max: 8, step: 1 },
      { key: 'levels', label: 'Levels', kind: 'range', min: 2, max: 8, step: 1 },
      { key: 'brightness', label: 'Brightness', kind: 'range', min: 0, max: 200, step: 1, unit: '%' },
      { key: 'contrast', label: 'Contrast', kind: 'range', min: 0.5, max: 2, step: 0.02 },
      { key: 'mono', label: 'Mono', kind: 'toggle' },
      { key: 'monoColor', label: 'Mono color', kind: 'color' },
    ],
  },
  {
    type: 'gradientMap',
    label: 'Gradient map',
    animated: false,
    defaults: {
      colorA: '#ffffff', colorB: '#1abcfe', colorC: '#000000',
      scatter: 0, offset: 0, repeatType: 0, repeatFrequency: 2, mixSpace: 0,
    },
    fields: [
      { key: 'colorA', label: 'Stop 1', kind: 'color' },
      { key: 'colorB', label: 'Stop 2', kind: 'color' },
      { key: 'colorC', label: 'Stop 3', kind: 'color' },
      { key: 'scatter', label: 'Scatter', kind: 'range', min: 0, max: 100, step: 0.1, unit: '%' },
      { key: 'offset', label: 'Offset', kind: 'range', min: -100, max: 100, step: 0.1, unit: '%' },
      {
        key: 'repeatType',
        label: 'Repeat',
        kind: 'select',
        options: [
          { value: 0, label: 'None' },
          { value: 1, label: 'Repeat' },
          { value: 2, label: 'Mirror' },
        ],
      },
      { key: 'repeatFrequency', label: 'Repeat frequency', kind: 'range', min: 1, max: 10, step: 1 },
      {
        key: 'mixSpace',
        label: 'Mix space',
        kind: 'select',
        options: [
          { value: 0, label: 'sRGB' },
          { value: 1, label: 'Linear' },
          { value: 2, label: 'OKLab' },
        ],
      },
    ],
  },
  {
    type: 'glowParticles',
    label: 'Glowing particles',
    animated: true,
    defaults: {
      phase: 0, density: 50, particleSize: 30, glow: 60, color: '#ffd94d',
      sizeVar: 50, scatter: 80, direction: 0, randomize: 100, edge: 0, speed: 40,
    },
    fields: [
      { key: 'phase', label: 'Phase', kind: 'range', min: 0, max: 100, step: 0.5 },
      { key: 'density', label: 'Density', kind: 'range', min: 1, max: 100, step: 1 },
      { key: 'particleSize', label: 'Particle size', kind: 'range', min: 1, max: 100, step: 1 },
      { key: 'glow', label: 'Glow intensity', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'color', label: 'Glow color', kind: 'color' },
      { key: 'sizeVar', label: 'Size variation', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'scatter', label: 'Scatter radius', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'direction', label: 'Direction', kind: 'range', min: 0, max: 360, step: 1 },
      { key: 'randomize', label: 'Randomize', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'edge', label: 'Edge', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'speed', label: 'Speed', kind: 'range', min: 0, max: 100, step: 1 },
    ],
  },
  {
    type: 'bloom',
    label: 'Bloom',
    animated: false,
    defaults: { threshold: 50, intensity: 10, softness: 50, tint: '#ffffff', vignette: 50, vignetteSoft: 50, originX: 50, originY: 50, radius: 100 },
    fields: [
      { key: 'threshold', label: 'Threshold', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'intensity', label: 'Intensity', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'softness', label: 'Softness', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'tint', label: 'Tint', kind: 'color' },
      { key: 'vignette', label: 'Vignette', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'vignetteSoft', label: 'Vignette softness', kind: 'range', min: 0, max: 100, step: 1 },
      { key: 'originX', label: 'Spotlight X', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'originY', label: 'Spotlight Y', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'radius', label: 'Spotlight', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    type: 'movingBlobs',
    label: 'Moving blobs',
    animated: true,
    defaults: { mode: 0, region: 0, strength: 100, scale: 100, detail: 10, threshold: 60, softness: 0, shadow: 20, dispersion: 50, speed: 10 },
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        kind: 'select',
        options: [
          { value: 0, label: 'Refraction' },
          { value: 1, label: 'Displacement' },
          { value: 2, label: 'Bulge / pinch' },
          { value: 3, label: 'Hue shift' },
          { value: 4, label: 'Invert' },
        ],
      },
      { key: 'region', label: 'Region', kind: 'select', options: [{ value: 0, label: 'Whole area' }, { value: 1, label: 'Edges only' }] },
      { key: 'strength', label: 'Strength', kind: 'range', min: -100, max: 100, step: 1, unit: '%' },
      { key: 'scale', label: 'Scale', kind: 'range', min: 30, max: 300, step: 1, unit: '%' },
      { key: 'detail', label: 'Detail', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'threshold', label: 'Threshold', kind: 'range', min: 0, max: 100, step: 0.1, unit: '%' },
      { key: 'softness', label: 'Softness', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'shadow', label: 'Shadow', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
      { key: 'dispersion', label: 'Dispersion', kind: 'range', min: 0, max: 100, step: 0.1, unit: '%' },
      { key: 'speed', label: 'Speed', kind: 'range', min: 0, max: 100, step: 0.1, unit: '%' },
    ],
  },
  {
    type: 'lightRays',
    label: 'Light rays',
    animated: true,
    defaults: {
      inputMode: 0, threshold: 0.5, density: 0.5, intensity: 0.2, softness: 0.5, spread: 0.5, speed: 0.5,
      color1: '#1abcff', color2: '#a259ff', colorBlend: 0, glow: 0.3,
    },
    fields: [
      { key: 'inputMode', label: 'Input', kind: 'select', options: [{ value: 0, label: 'Luma' }, { value: 1, label: 'Alpha' }] },
      { key: 'threshold', label: 'Threshold', kind: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'density', label: 'Density', kind: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'intensity', label: 'Intensity', kind: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'softness', label: 'Softness', kind: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'spread', label: 'Spread', kind: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'speed', label: 'Speed', kind: 'range', min: 0, max: 1, step: 0.01 },
      { key: 'color1', label: 'Color 1', kind: 'color' },
      { key: 'color2', label: 'Color 2', kind: 'color' },
      { key: 'colorBlend', label: 'Color blend', kind: 'range', min: -1, max: 1, step: 0.01 },
      { key: 'glow', label: 'Edge glow', kind: 'range', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    type: 'filterPreset',
    label: 'Filter presets',
    animated: false,
    defaults: { filter: 0, intensity: 100 },
    fields: [
      {
        key: 'filter',
        label: 'Filter',
        kind: 'select',
        options: [
          { value: 0, label: 'Grayscale' },
          { value: 1, label: 'Sepia' },
          { value: 2, label: 'Vintage' },
          { value: 3, label: 'Cool' },
          { value: 4, label: 'Warm' },
          { value: 5, label: 'Fade' },
          { value: 6, label: 'High contrast' },
          { value: 7, label: 'Vivid' },
          { value: 8, label: 'Noir' },
        ],
      },
      { key: 'intensity', label: 'Intensity', kind: 'range', min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    type: 'channelMixer',
    label: 'Channel mixer',
    animated: false,
    defaults: { red: '#ff0000', green: '#00ff00', blue: '#0000ff', linear: 0 },
    fields: [
      { key: 'red', label: 'Red', kind: 'color' },
      { key: 'green', label: 'Green', kind: 'color' },
      { key: 'blue', label: 'Blue', kind: 'color' },
      { key: 'linear', label: 'Linear space', kind: 'toggle' },
    ],
  },
];

const CATALOG_BY_TYPE = new Map(AD_SHADER_CATALOG.map((item) => [item.type, item]));

export function isAdShaderType(value: unknown): value is AdShaderEffectType {
  return typeof value === 'string' && CATALOG_BY_TYPE.has(value as AdShaderEffectType);
}

export function shaderCatalogItem(type: string): ShaderCatalogItem | null {
  return CATALOG_BY_TYPE.get(type as AdShaderEffectType) ?? null;
}

export function shaderEffectLabel(type: string): string {
  return shaderCatalogItem(type)?.label ?? type;
}

export function shaderIsAnimated(type: string): boolean {
  return Boolean(shaderCatalogItem(type)?.animated);
}

export function defaultShaderParams(type: AdShaderEffectType): Record<string, number | boolean | string> {
  return { ...CATALOG_BY_TYPE.get(type)!.defaults };
}

export function sanitizeShaderParams(
  type: string,
  raw: Record<string, number | boolean | string> | null | undefined,
): Record<string, number | boolean | string> {
  const item = shaderCatalogItem(type);
  if (!item) return { ...(raw ?? {}) };
  const src = raw ?? {};
  const out: Record<string, number | boolean | string> = { ...item.defaults };
  for (const field of item.fields) {
    const value = src[field.key] ?? item.defaults[field.key];
    if (field.kind === 'color') {
      out[field.key] = asHex(value, String(item.defaults[field.key]));
    } else if (field.kind === 'toggle') {
      out[field.key] = value === true || value === 1 || value === '1' ? 1 : 0;
    } else if (field.kind === 'select') {
      const num = asNum(value, Number(item.defaults[field.key]));
      const allowed = field.options.some((opt) => opt.value === num);
      out[field.key] = allowed ? num : Number(item.defaults[field.key]);
    } else {
      out[field.key] = clamp(asNum(value, Number(item.defaults[field.key])), field.min, field.max);
    }
  }
  return out;
}

export function mixShaderParams(
  type: string,
  aRaw: Record<string, number | boolean | string>,
  bRaw: Record<string, number | boolean | string>,
  t: number,
): Record<string, number | boolean | string> {
  const item = shaderCatalogItem(type);
  const a = sanitizeShaderParams(type, aRaw);
  const b = sanitizeShaderParams(type, bRaw);
  const k = clamp(t, 0, 1);
  if (!item) return k < 0.5 ? a : b;
  const out: Record<string, number | boolean | string> = {};
  for (const field of item.fields) {
    const av = a[field.key];
    const bv = b[field.key];
    if (field.kind === 'range' && typeof av === 'number' && typeof bv === 'number') {
      out[field.key] = av + (bv - av) * k;
    } else {
      out[field.key] = k < 0.5 ? av : bv;
    }
  }
  return out;
}

export function hexToRgb01(hex: string): [number, number, number] {
  const h = asHex(hex, '#ffffff').slice(1);
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
