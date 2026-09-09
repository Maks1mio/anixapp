/** CRT Screen — порт Figma WGSL-эффекта на WebGL2. */

export type CrtScreenParams = {
  mask: number;
  maskType: number;
  maskPitch: number;
  curvature: number;
  clipToCurve: boolean;
  scanlines: number;
  scanlineSize: number;
  aberration: number;
  aberrationScheme: number;
  flicker: number;
  noise: number;
  noiseSize: number;
  rollSpeed: number;
  jitter: number;
  vignette: number;
  brightness: number;
  speed: number;
};

/** Значения из Figma defineProperties (заводские). */
export const CRT_FIGMA_DEFAULTS: CrtScreenParams = {
  mask: 30,
  maskType: 0,
  maskPitch: 12,
  curvature: 100,
  clipToCurve: true,
  scanlines: 20,
  scanlineSize: 8,
  aberration: 47,
  aberrationScheme: 0,
  flicker: 62,
  noise: 20,
  noiseSize: 1,
  rollSpeed: 5,
  jitter: 3,
  vignette: 80,
  brightness: 0,
  speed: 0.78,
};

/** Пресет баннера 67 VPN — обычное состояние (rest). */
export const CRT_VPN_PRESET: CrtScreenParams = {
  mask: 100,
  maskType: 0,
  maskPitch: 2,
  curvature: 0,
  clipToCurve: false,
  scanlines: 8,
  scanlineSize: 4.5,
  aberration: 9,
  aberrationScheme: 0,
  flicker: 11,
  noise: 62,
  noiseSize: 1.5,
  rollSpeed: 1.38,
  jitter: 100,
  vignette: 0,
  brightness: -0.04,
  speed: 0.27,
};

/** Пресет баннера 67 VPN — наведение. */
export const CRT_VPN_HOVER_PRESET: CrtScreenParams = {
  mask: 100,
  maskType: 2,
  maskPitch: 2,
  curvature: 36,
  clipToCurve: false,
  scanlines: 8,
  scanlineSize: 4.5,
  aberration: 9,
  aberrationScheme: 0,
  flicker: 11,
  noise: 16,
  noiseSize: 1.5,
  rollSpeed: 1.38,
  jitter: 17,
  vignette: 0,
  brightness: 0.01,
  speed: 0.27,
};

export const CRT_MASK_TYPE_OPTIONS = [
  { value: 0, label: 'Aperture grille' },
  { value: 1, label: 'Slot' },
  { value: 2, label: 'Shadow' },
] as const;

export const CRT_ABERRATION_OPTIONS = [
  { value: 0, label: 'Radial' },
  { value: 1, label: 'Horizontal' },
  { value: 2, label: 'Convergence' },
] as const;

export type CrtSliderKey = Exclude<keyof CrtScreenParams, 'clipToCurve' | 'maskType' | 'aberrationScheme'>;

export const CRT_SLIDER_FIELDS: Array<{
  key: CrtSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}> = [
  { key: 'mask', label: 'Mask', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'maskPitch', label: 'Mask size', min: 2, max: 12, step: 0.5, unit: 'px' },
  { key: 'curvature', label: 'Curvature', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'scanlines', label: 'Scanlines', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'scanlineSize', label: 'Scanline size', min: 1, max: 32, step: 0.5 },
  { key: 'aberration', label: 'Dispersion', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'flicker', label: 'Flicker', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'noise', label: 'Static', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'noiseSize', label: 'Static size', min: 1, max: 8, step: 0.5 },
  { key: 'rollSpeed', label: 'Roll speed', min: 0, max: 5, step: 0.01 },
  { key: 'jitter', label: 'Jitter', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.01 },
  { key: 'speed', label: 'Speed', min: 0, max: 3, step: 0.01 },
];

const CRT_STORAGE_KEY = 'anixapp.vpnCrtParams.v4';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function asFinite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function sanitizeCrtParams(raw: Partial<CrtScreenParams> | null | undefined): CrtScreenParams {
  const src = raw ?? {};
  const base = CRT_VPN_PRESET;
  return {
    mask: clamp(asFinite(src.mask, base.mask), 0, 100),
    maskType: clamp(Math.round(asFinite(src.maskType, base.maskType)), 0, 2),
    maskPitch: clamp(asFinite(src.maskPitch, base.maskPitch), 2, 12),
    curvature: clamp(asFinite(src.curvature, base.curvature), 0, 100),
    clipToCurve: src.clipToCurve == null ? base.clipToCurve : Boolean(src.clipToCurve),
    scanlines: clamp(asFinite(src.scanlines, base.scanlines), 0, 100),
    scanlineSize: clamp(asFinite(src.scanlineSize, base.scanlineSize), 1, 32),
    aberration: clamp(asFinite(src.aberration, base.aberration), 0, 100),
    aberrationScheme: clamp(Math.round(asFinite(src.aberrationScheme, base.aberrationScheme)), 0, 2),
    flicker: clamp(asFinite(src.flicker, base.flicker), 0, 100),
    noise: clamp(asFinite(src.noise, base.noise), 0, 100),
    noiseSize: clamp(asFinite(src.noiseSize, base.noiseSize), 1, 8),
    rollSpeed: clamp(asFinite(src.rollSpeed, base.rollSpeed), 0, 5),
    jitter: clamp(asFinite(src.jitter, base.jitter), 0, 100),
    vignette: clamp(asFinite(src.vignette, base.vignette), 0, 100),
    brightness: clamp(asFinite(src.brightness, base.brightness), -1, 1),
    speed: clamp(asFinite(src.speed, base.speed), 0, 3),
  };
}

export type CrtScreenStates = {
  rest: CrtScreenParams;
  hover: CrtScreenParams;
};

export const CRT_VPN_STATES_PRESET: CrtScreenStates = {
  rest: { ...CRT_VPN_PRESET },
  hover: { ...CRT_VPN_HOVER_PRESET },
};

export function cloneCrtParams(params: CrtScreenParams): CrtScreenParams {
  return { ...sanitizeCrtParams(params) };
}

export function sanitizeCrtStates(raw: Partial<CrtScreenStates> | null | undefined): CrtScreenStates {
  const src = raw ?? {};
  const rest = sanitizeCrtParams(src.rest ?? CRT_VPN_PRESET);
  return {
    rest,
    hover: sanitizeCrtParams(src.hover ?? rest),
  };
}

export function cloneCrtStates(states: CrtScreenStates): CrtScreenStates {
  return {
    rest: cloneCrtParams(states.rest),
    hover: cloneCrtParams(states.hover),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Плавно смешивает CRT-параметры rest → hover. Дискретные поля переключаются на середине. */
export function mixCrtParams(rest: CrtScreenParams, hover: CrtScreenParams, t: number): CrtScreenParams {
  const a = sanitizeCrtParams(rest);
  const b = sanitizeCrtParams(hover);
  const k = clamp(t, 0, 1);
  return {
    mask: lerp(a.mask, b.mask, k),
    maskType: k < 0.5 ? a.maskType : b.maskType,
    maskPitch: lerp(a.maskPitch, b.maskPitch, k),
    curvature: lerp(a.curvature, b.curvature, k),
    clipToCurve: k < 0.5 ? a.clipToCurve : b.clipToCurve,
    scanlines: lerp(a.scanlines, b.scanlines, k),
    scanlineSize: lerp(a.scanlineSize, b.scanlineSize, k),
    aberration: lerp(a.aberration, b.aberration, k),
    aberrationScheme: k < 0.5 ? a.aberrationScheme : b.aberrationScheme,
    flicker: lerp(a.flicker, b.flicker, k),
    noise: lerp(a.noise, b.noise, k),
    noiseSize: lerp(a.noiseSize, b.noiseSize, k),
    rollSpeed: lerp(a.rollSpeed, b.rollSpeed, k),
    jitter: lerp(a.jitter, b.jitter, k),
    vignette: lerp(a.vignette, b.vignette, k),
    brightness: lerp(a.brightness, b.brightness, k),
    speed: lerp(a.speed, b.speed, k),
  };
}

export function loadCrtVpnStates(): CrtScreenStates {
  if (typeof localStorage === 'undefined') return cloneCrtStates(CRT_VPN_STATES_PRESET);
  try {
    const raw = localStorage.getItem(CRT_STORAGE_KEY);
    if (raw) return sanitizeCrtStates(JSON.parse(raw) as Partial<CrtScreenStates>);
  } catch {
    /* ignore */
  }
  return cloneCrtStates(CRT_VPN_STATES_PRESET);
}

export function saveCrtVpnStates(states: CrtScreenStates): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CRT_STORAGE_KEY, JSON.stringify(sanitizeCrtStates(states)));
  } catch {
    /* quota / private mode */
  }
}

export function loadCrtVpnParams(): CrtScreenParams {
  return { ...loadCrtVpnStates().rest };
}

export function saveCrtVpnParams(params: CrtScreenParams): void {
  const current = loadCrtVpnStates();
  saveCrtVpnStates({ ...current, rest: sanitizeCrtParams(params) });
}

export function formatCrtParamsForCopy(params: CrtScreenParams): string {
  return JSON.stringify(sanitizeCrtParams(params), null, 2);
}

export function formatCrtValue(key: CrtSliderKey, value: number, unit?: string): string {
  const digits = key === 'brightness' || key === 'speed' || key === 'rollSpeed' || key === 'maskPitch'
    || key === 'scanlineSize' || key === 'noiseSize'
    ? 2
    : 0;
  const shown = digits ? value.toFixed(digits).replace(/\.?0+$/, '') : String(Math.round(value));
  return unit ? `${shown}${unit}` : shown;
}

const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;

layout(std140) uniform CrtUniforms {
  vec4 params0;
  vec4 params1;
  vec4 params2;
  vec4 params3;
  vec4 dims;
  vec4 params4;
};

uniform sampler2D inputTex;
in vec2 v_uv;
out vec4 fragColor;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;
const float PHASE120 = 2.09439510239;

float coverage(vec2 p, vec2 texel) {
  float fx = smoothstep(0.0, texel.x, p.x) * (1.0 - smoothstep(1.0 - texel.x, 1.0, p.x));
  float fy = smoothstep(0.0, texel.y, p.y) * (1.0 - smoothstep(1.0 - texel.y, 1.0, p.y));
  return fx * fy;
}

vec4 sampleRaw(vec2 p) {
  return texture(inputTex, clamp(p, vec2(0.0), vec2(1.0)));
}

float hash21(vec2 p) {
  vec3 h = fract(vec3(p.x, p.y, p.x) * 0.1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}

float hash31(vec3 p) {
  vec3 h = fract(p * vec3(0.1031, 0.1030, 0.0973));
  h += vec3(dot(h, h.yzx + 33.33));
  return fract((h.x + h.y) * h.z);
}

vec2 barrel(vec2 uv, vec2 aspect, float curvature, vec2 scale) {
  vec2 c = (uv * 2.0 - 1.0) * aspect;
  float r2 = dot(c, c);
  c = c * (1.0 + curvature * 0.35 * r2) * scale;
  return (c / aspect) * 0.5 + 0.5;
}

vec2 aberrationOffset(vec2 screenUv, vec2 aspect, float amount, float scheme, vec2 texel) {
  vec2 p = screenUv * 2.0 - 1.0;
  vec2 c = p * aspect;
  float radius = length(c);
  vec2 normalizedRadial = c / max(radius, 0.000001);
  vec2 radialDirection = radius > 0.0001 ? normalizedRadial : vec2(1.0, 0.0);
  float radialLevel = clamp(radius / sqrt(2.0), 0.0, 1.0);

  vec2 radialPixels = radialDirection * (amount * (0.72 + 0.48 * radialLevel));
  vec2 horizontalPixels = vec2(amount * 1.15, 0.0);
  vec2 convergenceBase = vec2(0.95, -0.55);
  vec2 convergenceField = vec2(p.x * 0.18, p.y * 0.22);
  vec2 convergencePixels = (convergenceBase + convergenceField) * amount;

  vec2 offsetPixels = radialPixels;
  if (scheme > 0.5 && scheme < 1.5) {
    offsetPixels = horizontalPixels;
  } else if (scheme >= 1.5) {
    offsetPixels = convergencePixels;
  }
  return offsetPixels * texel;
}

vec3 grilleProfile(vec3 theta, float pitch) {
  float fundamentalAA = smoothstep(2.0, 3.0, pitch);
  float secondAA = smoothstep(2.0, 3.0, pitch * 0.5);
  return vec3(0.375)
    + 0.5 * fundamentalAA * cos(theta)
    + 0.125 * secondAA * cos(theta * 2.0);
}

float softProfile(float theta, float period) {
  return 0.5 + 0.5 * smoothstep(2.0, 3.0, period) * cos(theta);
}

vec3 softProfile3(vec3 theta, float period) {
  return vec3(0.5) + 0.5 * smoothstep(2.0, 3.0, period) * cos(theta);
}

void main() {
  float curvature = params0.x;
  float scanAmtRaw = params0.y;
  float maskAmt = clamp(params0.z, 0.0, 1.0);
  float aberr = params0.w;
  float bright = params1.y;
  float scanSize = max(params1.z, 1.0);
  float t = params1.w;
  float flickerAmt = params2.x;
  float noiseAmt = params2.y;
  float rollSpeed = params2.z;
  float jitterAmt = params2.w;
  float noiseSize = max(params3.y, 1.0);
  bool clipCurve = params3.z > 0.5;
  float maskPitch = clamp(params3.w, 2.0, 12.0);
  float maskType = dims.z;
  float vigAmt = clamp(dims.w, 0.0, 1.0);
  float aberrationScheme = params4.x;

  vec2 inDims = max(vec2(textureSize(inputTex, 0)), vec2(1.0));
  vec2 inTexel = 1.0 / inDims;
  vec2 outDims = max(dims.xy, vec2(1.0));

  vec2 aspectRaw = vec2(outDims.x / outDims.y, 1.0);
  vec2 aspect = aspectRaw / (length(aspectRaw) / sqrt(2.0));

  vec2 edgeFit = vec2(
    1.0 / (1.0 + curvature * 0.35 * aspect.x * aspect.x),
    1.0 / (1.0 + curvature * 0.35 * aspect.y * aspect.y)
  );

  float edgeAllowancePixels = 0.5;
  float jitterReserveUv = clamp(jitterAmt, 0.0, 1.0) * 3.9 * inTexel.x;
  vec2 reserveUv = vec2(
    jitterReserveUv + edgeAllowancePixels * inTexel.x,
    edgeAllowancePixels * inTexel.y
  );
  vec2 availableSpan = max(vec2(1.0) - 2.0 * reserveUv, vec2(0.05));
  vec2 clipFit = edgeFit / availableSpan;

  float cornerFitValue = 1.0 / (1.0 + 0.7 * curvature);
  vec2 rectangularFit = vec2(cornerFitValue);
  vec2 barrelScale = clipCurve ? clipFit : rectangularFit;

  float scanAmt = scanAmtRaw * mix(0.6, 1.0, smoothstep(1.0, 2.5, scanSize));
  float scanNorm = 1.0 / (1.0 - scanAmt * 0.5);

  vec2 warped = barrel(v_uv, aspect, curvature, barrelScale);

  float lineId = floor(warped.y * outDims.y / scanSize);
  float lineNoise = hash21(vec2(lineId, floor(t * 24.0))) - 0.5;
  float drift = sin(t * 1.7 + warped.y * 9.0) * 0.5;
  float jitterX = jitterAmt * (lineNoise * 0.9 + drift * 0.4) * inTexel.x * 6.0;
  warped = vec2(warped.x + jitterX, warped.y);

  float cov = clipCurve ? coverage(warped, inTexel) : 1.0;

  vec2 dir = aberrationOffset(v_uv, aspect, aberr, aberrationScheme, inTexel);
  vec4 sr = sampleRaw(warped + dir);
  vec4 sg = sampleRaw(warped);
  vec4 sb = sampleRaw(warped - dir);

  float sharedAlpha = max(sr.a, max(sg.a, sb.a));
  vec3 separatedRgb = min(vec3(sr.r, sg.g, sb.b), vec3(sharedAlpha));
  vec4 colorSample = vec4(separatedRgb, sharedAlpha) * cov;

  float py = warped.y * outDims.y + t * 6.0;
  float scan = (1.0 - scanAmt * 0.5 * (1.0 - cos(TAU * py / scanSize))) * scanNorm;
  colorSample = vec4(colorSample.rgb * scan, colorSample.a);

  float rollPos = fract(warped.y + t * rollSpeed * 0.12);
  float band = smoothstep(0.0, 0.06, rollPos) * (1.0 - smoothstep(0.06, 0.22, rollPos));
  colorSample = vec4(
    colorSample.rgb * (1.0 + band * 0.35 * step(0.001, rollSpeed)),
    colorSample.a
  );

  vec3 col = colorSample.rgb;
  float alpha = colorSample.a;

  vec2 baseWarp = barrel(v_uv, aspect, curvature, barrelScale);

  float px = v_uv.x * outDims.x;
  float pyMask = v_uv.y * outDims.y;

  vec3 profile = vec3(1.0);
  float profileMean = 1.0;

  if (maskType < 0.5) {
    float th = px * (TAU / maskPitch);
    profile = grilleProfile(vec3(th, th - PHASE120, th + PHASE120), maskPitch);
    profileMean = 0.375;
  } else if (maskType < 1.5) {
    float th = px * (TAU / maskPitch);
    vec3 hp = grilleProfile(vec3(th, th - PHASE120, th + PHASE120), maskPitch);
    float slotPeriod = maskPitch * 2.0;
    float tie = softProfile(pyMask * (TAU / slotPeriod), slotPeriod);
    float vTrans = 1.0 - 0.75 * tie;
    profile = hp * vTrans;
    profileMean = 0.234375;
  } else {
    float rowPeriod = maskPitch * 0.8660254;
    float rowPos = pyMask / rowPeriod;
    float rowIdx = floor(rowPos);
    float odd = rowIdx - 2.0 * floor(rowIdx * 0.5);
    float th = (px + odd * maskPitch * 0.5) * (TAU / maskPitch);
    vec3 hp = softProfile3(vec3(th, th - PHASE120, th + PHASE120), maskPitch);
    float vp = softProfile((rowPos - rowIdx) * TAU - PI, rowPeriod);
    profile = hp * vp;
    profileMean = 0.25;
  }

  float maskFloor = 0.03;
  float maskSpan = 1.8;
  vec3 maskRaw = vec3(maskFloor) + maskSpan * profile;
  vec3 maskGain = maskRaw / (maskFloor + maskSpan * profileMean);
  col *= mix(vec3(1.0), maskGain, maskAmt);

  float flick = 1.0 + flickerAmt * (sin(t * 37.0) * 0.5 + sin(t * 11.3) * 0.3) * 0.06;
  col *= flick;

  float field = floor(t * 24.0);
  vec2 gp = floor(baseWarp * outDims / noiseSize);
  float white = hash31(vec3(gp, field));
  float hiss = hash21(vec2(floor(baseWarp.y * outDims.y / noiseSize), field * 1.7)) - 0.5;
  float staticLvl = clamp(white + hiss * 0.35, 0.0, 1.0);
  float nMix = clamp(noiseAmt, 0.0, 1.0) * 0.55 * alpha;
  col = mix(col, vec3(staticLvl) * alpha, nMix);
  col *= (1.0 + (white - 0.5) * noiseAmt * 0.25);

  vec2 cc = (baseWarp * 2.0 - 1.0) * aspect;
  float r2 = dot(cc, cc);
  float vigStrength = 3.0 * vigAmt * vigAmt * (0.35 + 0.65 * vigAmt);
  float vigSpread = clamp(
    vigAmt * vigAmt * (0.6 + 0.4 * clamp(curvature, 0.0, 1.0)),
    0.0,
    1.0
  );
  float vigInner = mix(1.4, 0.0, vigSpread);
  float v = 1.0 - vigStrength * smoothstep(vigInner, 2.0, r2);
  col = col * max(v, 0.0) * bright;

  float kneeStart = 0.8;
  float knee = alpha * kneeStart;
  float kneeRoom = max(alpha - knee, 0.000001);
  vec3 excess = max(col - vec3(knee), vec3(0.0));
  vec3 compressed = vec3(knee) + vec3(kneeRoom) * (vec3(1.0) - exp(-excess / vec3(kneeRoom)));
  col = mix(col, compressed, vec3(greaterThan(col, vec3(knee))));

  fragColor = vec4(clamp(col, vec3(0.0), vec3(alpha)), alpha);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL shader alloc failed');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'compile error';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

export function isCrtScreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2', { alpha: true });
  return !!gl;
}

export class CrtScreenRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quad: WebGLBuffer;
  private ubo: WebGLBuffer;
  private tex: WebGLTexture;
  private params: CrtScreenParams = { ...CRT_FIGMA_DEFAULTS };
  private sourceW = 1;
  private sourceH = 1;
  private outW = 1;
  private outH = 1;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL program alloc failed');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || 'link error';
      gl.deleteProgram(program);
      throw new Error(log);
    }
    this.program = program;

    const block = gl.getUniformBlockIndex(program, 'CrtUniforms');
    if (block === gl.INVALID_INDEX) {
      gl.deleteProgram(program);
      throw new Error('CrtUniforms block missing');
    }
    gl.uniformBlockBinding(program, block, 0);

    const quad = gl.createBuffer();
    const vao = gl.createVertexArray();
    const ubo = gl.createBuffer();
    const tex = gl.createTexture();
    if (!quad || !vao || !ubo || !tex) throw new Error('WebGL buffer alloc failed');
    this.quad = quad;
    this.vao = vao;
    this.ubo = ubo;
    this.tex = tex;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0,
        -1, 1, 0, 0, 1, -1, 1, 1, 1, 1, 1, 0,
      ]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, 96, gl.DYNAMIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'inputTex'), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  setParams(next: Partial<CrtScreenParams>): void {
    this.params = { ...this.params, ...next };
  }

  setSource(source: TexImageSource): void {
    const gl = this.gl;
    const w = 'width' in source ? Number(source.width) || 1 : 1;
    const h = 'height' in source ? Number(source.height) || 1 : 1;
    this.sourceW = Math.max(1, w);
    this.sourceH = Math.max(1, h);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  resize(cssWidth: number, cssHeight: number, dpr = 1): void {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    const pxW = Math.max(1, Math.round(cssWidth * dpr));
    const pxH = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    this.outW = pxW;
    this.outH = pxH;
    gl.viewport(0, 0, pxW, pxH);
  }

  render(timeMs: number): void {
    if (this.destroyed) return;
    const gl = this.gl;
    const p = this.params;
    const time = ((timeMs * 0.001 * p.speed) % 1024 + 1024) % 1024;
    const data = new Float32Array([
      p.curvature / 100,
      p.scanlines / 100,
      p.mask / 100,
      (p.aberration / 100) * 12,
      0,
      Math.pow(2, p.brightness),
      p.scanlineSize,
      time,
      p.flicker / 100,
      p.noise / 100,
      p.rollSpeed,
      p.jitter / 100,
      0,
      p.noiseSize,
      p.clipToCurve ? 1 : 0,
      p.maskPitch,
      this.outW,
      this.outH,
      p.maskType,
      p.vignette / 100,
      p.aberrationScheme,
      0,
      0,
      0,
    ]);

    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);

    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.bindVertexArray(this.vao);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    gl.deleteBuffer(this.quad);
    gl.deleteBuffer(this.ubo);
    gl.deleteTexture(this.tex);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
