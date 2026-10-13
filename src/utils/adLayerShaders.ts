/** WebGL2 ports of Figma layer shaders. Applied per-node like CRT Screen. */

import { applyCrtFilter, sanitizeCrtParams } from './crtScreen';
import type { AdEffect } from './adDesignDoc';
import {
  hexToRgb01,
  isAdShaderType,
  sanitizeShaderParams,
  shaderIsAnimated,
  type AdShaderEffectType,
} from './adLayerShaderCatalog';

const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
uniform float uFlipY;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos.x, a_pos.y * uFlipY, 0.0, 1.0);
}
`;

const PREAMBLE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D inputTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uP[20];
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;

vec4 sampleAt(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(inputTex, clamp(uv, 0.0, 1.0));
}
vec3 unpre(vec4 c) {
  return c.a > 0.001 ? c.rgb / c.a : vec3(0.0);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float hash31(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
}
`;

const SHADERS: Record<AdShaderEffectType, string> = {
  lensDistort: `
void main() {
  vec2 uv = v_uv;
  vec2 center = vec2(uP[2], uP[3]) / 100.0;
  center.y = 1.0 - center.y;
  float amount = uP[0];
  float chroma = uP[1] * (1.0 + abs(amount));
  int mode = int(uP[4] + 0.5);
  int quality = int(uP[5] + 0.5);
  vec2 aspect = vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  vec2 n = (uv - center) * aspect;
  float r2 = dot(n, n);
  float distort = 1.0 + amount * (r2 + r2 * r2);
  vec2 radial = normalize(n + vec2(0.0001, 0.0));
  vec2 base = center + n * distort / aspect;
  vec2 oR = vec2(0.0);
  vec2 oB = vec2(0.0);
  if (mode == 1) {
    oR = radial * chroma * 0.04;
    oB = -radial * chroma * 0.04;
  } else if (mode == 2) {
    oR = vec2(chroma * 0.035, 0.0);
    oB = vec2(-chroma * 0.035, 0.0);
  } else {
    float extra = chroma * r2 * 0.12;
    oR = n * extra / aspect;
    oB = -n * extra / aspect;
  }
  if (quality >= 2 || chroma < 0.001) {
    fragColor = sampleAt(base);
    return;
  }
  float r = sampleAt(base + oR).r;
  vec4 g = sampleAt(base);
  float b = sampleAt(base + oB).b;
  if (quality == 0) {
    r = mix(r, sampleAt(base + oR * 0.5).r, 0.5);
    b = mix(b, sampleAt(base + oB * 0.5).b, 0.5);
  }
  fragColor = vec4(r, g.g, b, g.a);
}
`,
  patternRefract: `
vec2 wrapUv(vec2 uv, int wrap) {
  if (wrap == 1) return clamp(uv, 0.0, 1.0);
  if (wrap == 2) return fract(uv);
  if (wrap == 3) {
    vec2 t = abs(fract(uv * 0.5) * 2.0 - 1.0);
    return t;
  }
  return uv;
}
vec4 wrapSample(vec2 uv, int wrap) {
  if (wrap == 0) return sampleAt(uv);
  return texture(inputTex, wrapUv(uv, wrap));
}
void main() {
  vec2 uv = v_uv;
  int pat = int(uP[0] + 0.5);
  float amt = uP[1] / 100.0 * 0.08;
  float smoothv = uP[2] / 100.0;
  float frost = uP[3] / 100.0;
  float disp = uP[4] / 100.0 * 0.03;
  float sz = max(uP[5], 0.5);
  float ang = radians(uP[6]);
  int wrap = int(uP[7] + 0.5);
  vec2 center = vec2(uP[8], 100.0 - uP[9]) / 100.0;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 p = (uv - center) * uRes / sz;
  float wave = 0.0;
  if (pat == 0) wave = sin(dot(p, dir) * 6.28318);
  else if (pat == 1) wave = abs(fract(dot(p, dir)) * 2.0 - 1.0) * 2.0 - 1.0;
  else if (pat == 2) wave = sin(dot(p, dir) * 6.28318) * 0.6 + sin(dot(p, perp) * 3.14159) * 0.4;
  else if (pat == 3) wave = sin(length((uv - center) * uRes / sz) * 6.28318);
  else if (pat == 4) {
    vec2 c = abs(fract(p) - 0.5);
    wave = sin((c.x + c.y) * 12.0);
  } else {
    vec2 c = abs(fract(p) - 0.5);
    wave = step(0.25, max(c.x, c.y)) * 2.0 - 1.0;
  }
  float steep = wave * (1.0 + smoothv * 4.0);
  wave = mix(wave, steep / (1.0 + abs(steep)), smoothv);
  vec2 n = dir * wave;
  vec2 uvR = uv + n * (amt + disp);
  vec2 uvG = uv + n * amt;
  vec2 uvB = uv + n * (amt - disp);
  if (frost > 0.001) {
    vec2 j = (vec2(hash21(uv * uRes), hash21(uv * uRes + 19.0)) - 0.5) * frost * 0.02;
    uvR += j; uvG += j; uvB += j;
  }
  float r = wrapSample(uvR, wrap).r;
  vec4 g = wrapSample(uvG, wrap);
  float b = wrapSample(uvB, wrap).b;
  fragColor = vec4(r, g.g, b, g.a);
}
`,
  pixelate: `
void main() {
  vec2 uv = v_uv;
  int shape = int(uP[0] + 0.5);
  float px = max(uP[1], 2.0);
  float stretch = max(uP[2], 1.0) / 100.0;
  float gap = uP[3];
  float avgMix = uP[4] / 100.0;
  float dissolve = uP[5] / 100.0;
  float knockout = uP[6];
  float trim = max(uP[7], 2.0);
  int dmode = int(uP[8] + 0.5);
  float fall = uP[9] / 100.0;
  vec2 cell = vec2(px * stretch, px);
  vec2 gid = floor(uv * uRes / cell);
  vec2 cellUv = (gid + 0.5) * cell / uRes;
  vec2 local = fract(uv * uRes / cell) - 0.5;
  if (dmode == 1) local /= max(1.0 - dissolve, 0.02);
  vec4 src = texture(inputTex, uv);
  vec4 cellCol = texture(inputTex, cellUv);
  vec3 trimmed = unpre(cellCol);
  trimmed = floor(trimmed * (trim - 1.0) + 0.5) / max(trim - 1.0, 1.0);
  cellCol = vec4(trimmed * cellCol.a, cellCol.a);
  vec4 col = mix(src, cellCol, avgMix);
  float mask = 1.0;
  float gapN = gap / max(min(cell.x, cell.y), 1.0);
  float edgeW = mix(0.02, 0.28, fall);
  if (shape == 1) mask = 1.0 - smoothstep(0.45 - gapN - edgeW, 0.5 - gapN, length(local * 2.0));
  else if (shape == 2) {
    vec2 p = abs(local);
    mask = 1.0 - smoothstep(0.42 - gapN - edgeW, 0.5 - gapN, p.x * 0.866 + p.y * 0.5);
  } else if (shape == 3) {
    vec2 p = local + vec2(0.0, 0.12);
    float tri = step(p.y, 0.35 - abs(p.x) * 1.6) * step(-0.42, p.y);
    mask = mix(tri, smoothstep(-edgeW, edgeW, (0.35 - abs(p.x) * 1.6) - p.y) * smoothstep(-edgeW, edgeW, p.y + 0.42), min(fall * 4.0, 1.0));
  } else {
    float hx = 0.5 - abs(local.x) - gapN;
    float hy = 0.5 - abs(local.y) - gapN;
    mask = mix(step(0.0, hx) * step(0.0, hy), smoothstep(-edgeW, edgeW, hx) * smoothstep(-edgeW, edgeW, hy), min(fall * 4.0, 1.0));
  }
  if (dmode == 0) {
    float h = hash21(gid + 0.13);
    float keep = mix(step(dissolve, h), smoothstep(dissolve - fall * 0.4 - 0.001, dissolve + fall * 0.4 + 0.001, h), fall);
    mask *= keep;
  }
  if (knockout > 0.5) fragColor = col * mask;
  else fragColor = mix(src, col, mask);
}
`,
  hatching: `
void main() {
  vec2 uv = v_uv;
  int mode = int(uP[0] + 0.5);
  float density = max(uP[1], 0.05);
  float soft = uP[2] / 100.0;
  float freq = uP[3];
  float amp = uP[4] / 100.0;
  float ang = radians(uP[5]);
  float sc = max(uP[6], 1.0);
  vec2 hatchOff = vec2(uP[7], uP[8]) / 100.0 * 48.0;
  vec4 src = texture(inputTex, uv);
  float L = luma(unpre(src));
  vec2 p = uv * uRes / sc;
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 r = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y) + hatchOff;
  float lines = 0.0;
  if (mode == 0) {
    lines = abs(fract(length(r) * density) - 0.5);
  } else if (mode == 1) {
    float w = sin(r.x * freq) * amp * 8.0;
    lines = abs(fract((r.y + w) * density) - 0.5);
  } else {
    float z = abs(fract(r.x * 0.5) - 0.5);
    lines = abs(fract((r.y + z * amp * 6.0) * density) - 0.5);
  }
  float hatch = 1.0 - smoothstep(0.08 + soft * 0.2, 0.22 + soft * 0.35, lines + (1.0 - L) * 0.15);
  vec3 rgb = mix(uC0, uC1, hatch);
  fragColor = vec4(rgb * src.a, src.a);
}
`,
  shapeParticles: `
void main() {
  vec2 uv = v_uv;
  int mode = int(uP[0] + 0.5);
  int arr = int(uP[1] + 0.5);
  float thr = uP[2] / 100.0;
  float dens = mix(8.0, 48.0, uP[3] / 100.0);
  float dscale = uP[4] / 100.0;
  float soft = uP[5] / 100.0;
  float spd = uP[6] / 100.0;
  vec2 cell = uRes / dens;
  vec2 gid = floor(uv * uRes / cell);
  vec2 jitter = vec2(0.0);
  if (arr == 1) jitter = vec2(hash21(gid), hash21(gid + 9.1)) - 0.5;
  jitter += vec2(sin(uTime * spd * 3.0 + hash21(gid) * 6.28), cos(uTime * spd * 2.2 + hash21(gid + 2.0) * 6.28)) * 0.15 * spd;
  vec2 center = (gid + 0.5 + jitter) * cell / uRes;
  vec4 src = texture(inputTex, clamp(center, 0.0, 1.0));
  vec3 rgb = unpre(src);
  float m = src.a;
  if (mode == 1) m = 1.0 - src.a;
  if (mode == 2) m = luma(rgb);
  if (mode == 3) m = 1.0 - luma(rgb);
  m = smoothstep(thr, thr + 0.12, m);
  float rad = 0.42 * dscale * m;
  vec2 local = (uv * uRes / cell) - (gid + 0.5 + jitter);
  float d = length(local);
  float dotv = 1.0 - smoothstep(rad * (1.0 - soft * 0.6), rad + 0.02 + soft * 0.2, d);
  fragColor = vec4(rgb * src.a * dotv, src.a * dotv);
}
`,
  halftone: `
void main() {
  vec2 uv = v_uv;
  int kind = int(uP[0] + 0.5);
  int cmode = int(uP[1] + 0.5);
  float ds = max(uP[2], 4.0);
  float dscale = uP[3];
  float soft = uP[4];
  float ang = radians(uP[5]);
  float clipA = uP[6];
  vec2 origin = vec2(uP[7], 100.0 - uP[8]) / 100.0 * uRes;
  vec4 src = texture(inputTex, uv);
  vec3 rgb = unpre(src);
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 p = uv * uRes - origin;
  vec2 r = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y) / ds;
  vec3 outRgb = vec3(0.0);
  if (cmode <= 1) {
    vec3 ch = cmode == 0 ? vec3(1.0 - rgb.r, 1.0 - rgb.g, 1.0 - rgb.b) : rgb;
    vec2 o[3];
    o[0] = vec2(0.0); o[1] = vec2(0.33, 0.15); o[2] = vec2(-0.2, 0.38);
    for (int i = 0; i < 3; i++) {
      vec2 cell = fract(r + o[i]) - 0.5;
      float v = i == 0 ? ch.r : (i == 1 ? ch.g : ch.b);
      float rad = mix(0.08, 0.48, clamp(v * dscale, 0.0, 1.0));
      float d = kind == 1 ? max(abs(cell.x), abs(cell.y)) : length(cell);
      float dotv = 1.0 - smoothstep(rad - soft * 0.15, rad + 0.02, d);
      vec3 tint = cmode == 0
        ? (i == 0 ? vec3(0.0, 1.0, 1.0) : i == 1 ? vec3(1.0, 0.0, 1.0) : vec3(1.0, 1.0, 0.0))
        : (i == 0 ? vec3(1.0, 0.15, 0.1) : i == 1 ? vec3(0.1, 1.0, 0.2) : vec3(0.15, 0.3, 1.0));
      outRgb += tint * dotv;
    }
    if (cmode == 0) outRgb = 1.0 - outRgb;
  } else {
    float L = luma(rgb);
    if (cmode == 3) L = 1.0 - L;
    vec2 cell = fract(r) - 0.5;
    float rad = mix(0.05, 0.5, clamp(L * dscale, 0.0, 1.0));
    float d = length(cell);
    float dotv = 1.0 - smoothstep(rad - soft * 0.15, rad + 0.02, d);
    outRgb = cmode == 2 ? vec3(dotv) : vec3(1.0 - dotv);
  }
  float a = clipA > 0.5 ? src.a : 1.0;
  fragColor = vec4(outRgb * a, a) * (clipA > 0.5 ? src.a : 1.0);
  fragColor.a = src.a;
  fragColor.rgb *= src.a;
}
`,
  chromaticMetal: `
void main() {
  vec2 uv = v_uv;
  float roundv = uP[0] / 10.0;
  float depth = uP[1] / 100.0;
  float rough = uP[2] / 100.0;
  float split = uP[3] / 100.0 * 0.012;
  float sc = max(uP[4], 2.0) / 50.0;
  float ang = radians(uP[5]);
  float repeats = max(uP[6], 1.0);
  float off = uP[7] / 100.0;
  float stretch = max(uP[8], 1.0) / 100.0;
  float phase = uP[9] / 100.0;
  float evo = uP[10] / 100.0;
  vec4 src = texture(inputTex, uv);
  vec3 rgb = unpre(src);
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 pr = vec2(-dir.y, dir.x);
  vec2 c = uv - 0.5;
  vec2 uvS = 0.5 + dir * dot(c, dir) * stretch + pr * dot(c, pr);
  float n = vnoise(uvS * uRes / sc + evo * 12.0);
  n = mix(n, vnoise(uvS * uRes / sc * 2.7 + 8.0 + evo * 5.0), 0.45);
  float t = luma(rgb) * depth + n * rough * 0.35 + dot(uvS - 0.5, dir) * 0.2 + off + phase;
  t = fract(t * repeats);
  vec3 chrome = mix(vec3(0.18), vec3(1.0), smoothstep(0.0, 0.18, t));
  chrome = mix(chrome, vec3(0.28), smoothstep(0.38, 0.46, t));
  chrome = mix(chrome, vec3(1.0), smoothstep(0.52, 0.62, t));
  chrome = mix(chrome, vec3(0.22), smoothstep(0.68, 0.78, t));
  chrome = mix(chrome, vec3(1.0), smoothstep(0.88, 1.0, t));
  vec2 nrm = vec2(dFdx(t), dFdy(t)) * (1.0 + roundv * 4.0);
  float r = sampleAt(uv + vec2(split, 0.0) + nrm).r;
  float g = rgb.g;
  float b = sampleAt(uv - vec2(split, 0.0) - nrm).b;
  vec3 metal = mix(vec3(r, g, b), chrome, 0.72) * (0.55 + luma(rgb) * 0.7);
  fragColor = vec4(metal * src.a, src.a);
}
`,
  dither: `
float bayer(vec2 p, int algo) {
  ivec2 i2 = ivec2(mod(floor(p), 2.0));
  ivec2 i4 = ivec2(mod(floor(p), 4.0));
  ivec2 i8 = ivec2(mod(floor(p), 8.0));
  if (algo == 0) return float((i2.x * 2 + i2.y * 3) & 3) / 4.0;
  if (algo == 1) return float((i4.x * 4 + i4.y * 11) & 15) / 16.0;
  if (algo == 2) return float((i8.x * 8 + i8.y * 19) & 63) / 64.0;
  float n = hash21(floor(p));
  return n;
}
void main() {
  vec2 uv = v_uv;
  int algo = int(uP[0] + 0.5);
  float psz = max(uP[1], 1.0);
  float levels = max(uP[2], 2.0);
  float br = uP[3] / 100.0;
  float contrast = uP[4];
  float mono = uP[5];
  vec4 src = texture(inputTex, uv);
  vec3 rgb = unpre(src);
  rgb = (rgb - 0.5) * contrast + 0.5;
  rgb *= br;
  vec2 gp = floor(uv * uRes / psz);
  float dth = 0.5;
  if (algo == 4) dth = hash21(gp);
  else if (algo == 5) dth = 0.5;
  else dth = bayer(gp, algo);
  vec3 q = floor(rgb * (levels - 1.0) + dth + 1e-4) / max(levels - 1.0, 1.0);
  if (mono > 0.5) q = uC0 * luma(q);
  fragColor = vec4(clamp(q, 0.0, 1.0) * src.a, src.a);
}
`,
  gradientMap: `
vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 fromLin(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
vec3 mixStops(vec3 a, vec3 b, float t) {
  int space = int(uP[4] + 0.5);
  if (space == 1) return fromLin(mix(toLin(a), toLin(b), t));
  if (space == 2) {
    vec3 al = toLin(a);
    vec3 bl = toLin(b);
    float la = pow(max(dot(al, vec3(0.2126, 0.7152, 0.0722)), 0.0), 1.0 / 3.0);
    float lb = pow(max(dot(bl, vec3(0.2126, 0.7152, 0.0722)), 0.0), 1.0 / 3.0);
    float lm = mix(la, lb, t);
    vec3 chroma = mix(
      al / max(dot(al, vec3(0.2126, 0.7152, 0.0722)), 1e-4),
      bl / max(dot(bl, vec3(0.2126, 0.7152, 0.0722)), 1e-4),
      t
    );
    return fromLin(chroma * (lm * lm * lm));
  }
  return mix(a, b, t);
}
void main() {
  vec2 uv = v_uv;
  float scatter = uP[0] / 100.0;
  float off = uP[1] / 100.0;
  int rpt = int(uP[2] + 0.5);
  float freq = max(uP[3], 1.0);
  vec4 src = texture(inputTex, uv);
  float L = luma(unpre(src));
  L += (hash21(uv * uRes) - 0.5) * scatter;
  float t = L - off;
  if (rpt == 1) t = fract(t * freq);
  else if (rpt == 2) t = 1.0 - abs(fract(t * freq * 0.5) - 0.5) * 2.0;
  else t = clamp(t, 0.0, 1.0);
  vec3 mapped = t < 0.5 ? mixStops(uC0, uC1, t * 2.0) : mixStops(uC1, uC2, (t - 0.5) * 2.0);
  fragColor = vec4(mapped * src.a, src.a);
}
`,
  glowParticles: `
void main() {
  vec2 uv = v_uv;
  float dens = mix(6.0, 36.0, uP[0] / 100.0);
  float psz = mix(0.015, 0.09, uP[1] / 100.0);
  float glow = uP[2] / 100.0;
  float sizeVar = uP[3] / 100.0;
  float scatter = uP[4] / 100.0;
  float dir = radians(uP[5]);
  float edge = uP[6] / 100.0;
  float spd = uP[7] / 100.0;
  float phase = uP[8] / 100.0;
  float rndAmt = uP[9] / 100.0;
  vec4 src = texture(inputTex, uv);
  vec3 rgb = unpre(src);
  float base = mix(luma(rgb), src.a, 0.35);
  float e = length(vec2(dFdx(base), dFdy(base))) * 8.0;
  float spawn = mix(base, e, edge);
  vec2 flow = vec2(cos(dir), sin(dir)) * (uTime * spd * 0.15 + phase * 2.0);
  vec2 cell = uRes / dens;
  vec2 gid = floor((uv * uRes + flow * uRes) / cell);
  vec2 rnd = mix(vec2(0.5), vec2(hash21(gid), hash21(gid + 17.0)), rndAmt);
  vec2 pos = (gid + 0.5 + (rnd - 0.5) * scatter) * cell / uRes;
  pos = fract(pos + flow);
  float rad = psz * mix(1.0 - sizeVar, 1.0 + sizeVar, rnd.x);
  float d = length((uv - pos) * vec2(uRes.x / max(uRes.y, 1.0), 1.0));
  float seed = texture(inputTex, pos).a * luma(unpre(texture(inputTex, pos)));
  seed = mix(seed, length(vec2(dFdx(seed), dFdy(seed))) * 10.0, edge);
  float p = exp(-pow(d / max(rad, 0.001), 2.0)) * spawn * seed;
  vec3 add = uC0 * p * (1.0 + glow * 3.0);
  fragColor = vec4(rgb * src.a + add * src.a, src.a);
}
`,
  bloom: `
void main() {
  vec2 uv = v_uv;
  float thr = uP[0] / 100.0;
  float intensity = uP[1] / 100.0 * 1.8;
  float soft = mix(0.004, 0.028, uP[2] / 100.0);
  float vig = uP[3] / 100.0;
  float vigS = uP[4] / 100.0;
  vec2 origin = vec2(uP[5], 100.0 - uP[6]) / 100.0;
  float radius = uP[7] / 100.0;
  vec4 src = texture(inputTex, uv);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 o = vec2(float(x), float(y)) * soft;
      vec4 s = sampleAt(uv + o);
      vec3 c = unpre(s);
      float l = luma(c);
      float w = exp(-0.35 * float(x * x + y * y)) * s.a;
      acc += c * smoothstep(thr, thr + 0.2, l) * w;
      wsum += w;
    }
  }
  vec3 bloom = (acc / max(wsum, 0.001)) * uC0 * intensity;
  float spot = 1.0 - smoothstep(radius * 0.55, radius * 1.25 + 0.02, length(uv - origin));
  bloom *= mix(spot, 1.0, step(0.995, radius));
  vec2 cc = uv * 2.0 - 1.0;
  float v = 1.0 - vig * smoothstep(mix(1.4, 0.2, vigS), 1.8, dot(cc, cc));
  vec3 rgb = unpre(src) * v + bloom;
  fragColor = vec4(rgb * src.a, src.a);
}
`,
  movingBlobs: `
void main() {
  vec2 uv = v_uv;
  int mode = int(uP[0] + 0.5);
  int region = int(uP[1] + 0.5);
  float str = uP[2] / 100.0;
  float sc = mix(1.5, 8.0, (300.0 - uP[3]) / 270.0);
  float detail = uP[4] / 100.0;
  float thr = uP[5] / 100.0;
  float soft = uP[6] / 100.0;
  float disp = uP[7] / 100.0 * 0.02;
  float spd = uP[8] / 100.0;
  vec2 p = uv * sc + vec2(uTime * spd * 0.35, uTime * spd * 0.22);
  float n = vnoise(p);
  n = mix(n, vnoise(p * 2.3 + 10.0), detail * 0.55);
  n = mix(n, vnoise(p * 5.1 - 4.0), detail * 0.25);
  float blob = smoothstep(thr - soft * 0.2, thr + 0.15 + soft * 0.25, n);
  if (region == 1) {
    vec4 src0 = texture(inputTex, uv);
    float e = length(vec2(dFdx(src0.a), dFdy(src0.a))) * 12.0;
    blob *= smoothstep(0.02, 0.2, e);
  }
  vec2 grad = vec2(dFdx(n), dFdy(n));
  vec2 off = normalize(grad + vec2(0.0001, 0.0)) * blob * str * 0.08;
  vec4 src = sampleAt(uv);
  vec4 warped = sampleAt(uv + off);
  vec3 rgb = unpre(warped);
  if (mode == 1) rgb = unpre(sampleAt(uv + off * 1.6));
  if (mode == 2) {
    vec2 c = uv - 0.5;
    warped = sampleAt(0.5 + c * (1.0 - blob * str * 0.35));
    rgb = unpre(warped);
  }
  if (mode == 3) {
    vec3 hsv = rgb2hsv(rgb);
    hsv.x = fract(hsv.x + blob * str * 0.35);
    rgb = hsv2rgb(hsv);
  }
  if (mode == 4) rgb = mix(rgb, 1.0 - rgb, blob * abs(str));
  float r = sampleAt(uv + off + vec2(disp, 0.0)).r;
  float b = sampleAt(uv + off - vec2(disp, 0.0)).b;
  rgb = vec3(mix(rgb.r, r, abs(str)), rgb.g, mix(rgb.b, b, abs(str)));
  rgb *= 1.0 - blob * (uP[9] / 100.0) * 0.7;
  fragColor = vec4(rgb * warped.a, warped.a);
}
`,
  lightRays: `
void main() {
  vec2 uv = v_uv;
  int imode = int(uP[0] + 0.5);
  float thr = uP[1];
  float dens = uP[2];
  float intensity = uP[3];
  float soft = uP[4];
  float spread = uP[5];
  float spd = uP[6];
  float glow = uP[7];
  float colorBlend = uP[8];
  vec4 src = texture(inputTex, uv);
  vec3 rgb = unpre(src);
  vec2 origin = vec2(0.5, 0.15);
  vec2 dir = normalize(uv - origin);
  float acc = 0.0;
  const int STEPS = 14;
  for (int i = 0; i < STEPS; i++) {
    float fi = float(i) / float(STEPS - 1);
    vec2 p = uv - dir * fi * mix(0.08, 0.45, spread);
    vec4 s = sampleAt(p);
    float m = imode == 1 ? s.a : luma(unpre(s));
    m = smoothstep(thr, thr + 0.15 + soft * 0.2, m);
    acc += m * (1.0 - fi);
  }
  acc /= float(STEPS);
  float rays = acc * dens;
  rays *= 0.65 + 0.35 * sin(atan(dir.y, dir.x) * mix(8.0, 28.0, dens) + uTime * spd * 6.0);
  vec3 tint = mix(uC0, uC1, clamp(length(uv - origin) * 1.4 + colorBlend, 0.0, 1.0));
  float e = length(vec2(dFdx(luma(rgb)), dFdy(luma(rgb)))) * 6.0;
  vec3 add = tint * (rays * intensity * 2.2 + e * glow);
  fragColor = vec4(rgb * src.a + add * src.a, src.a);
}
`,
  filterPreset: `
void main() {
  vec2 uv = v_uv;
  int kind = int(uP[0] + 0.5);
  float amt = uP[1] / 100.0;
  vec4 src = texture(inputTex, uv);
  vec3 rgb = unpre(src);
  vec3 mapped = rgb;
  float L = luma(rgb);
  if (kind == 0) mapped = vec3(L);
  else if (kind == 1) mapped = vec3(dot(rgb, vec3(0.393, 0.769, 0.189)), dot(rgb, vec3(0.349, 0.686, 0.168)), dot(rgb, vec3(0.272, 0.534, 0.131)));
  else if (kind == 2) mapped = mix(vec3(L * 0.9, L * 0.78, L * 0.55), rgb * vec3(1.05, 0.92, 0.75), 0.45);
  else if (kind == 3) mapped = rgb * vec3(0.85, 0.95, 1.18);
  else if (kind == 4) mapped = rgb * vec3(1.18, 1.02, 0.82);
  else if (kind == 5) mapped = mix(vec3(L), rgb, 0.45) * 1.05 + 0.08;
  else if (kind == 6) mapped = (rgb - 0.5) * 1.55 + 0.5;
  else if (kind == 7) mapped = mix(vec3(L), rgb, 1.55);
  else mapped = vec3(smoothstep(0.2, 0.8, L));
  mapped = clamp(mapped, 0.0, 1.0);
  rgb = mix(rgb, mapped, amt);
  fragColor = vec4(rgb * src.a, src.a);
}
`,
  channelMixer: `
void main() {
  vec2 uv = v_uv;
  float lin = uP[0];
  vec4 src = texture(inputTex, uv);
  vec3 rgb = unpre(src);
  if (lin > 0.5) rgb = pow(max(rgb, 0.0), vec3(2.2));
  vec3 mixed = vec3(
    rgb.r * uC0.r + rgb.g * uC0.g + rgb.b * uC0.b,
    rgb.r * uC1.r + rgb.g * uC1.g + rgb.b * uC1.b,
    rgb.r * uC2.r + rgb.g * uC2.g + rgb.b * uC2.b
  );
  if (lin > 0.5) mixed = pow(max(mixed, 0.0), vec3(1.0 / 2.2));
  fragColor = vec4(clamp(mixed, 0.0, 1.0) * src.a, src.a);
}
`,
};

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('shader alloc failed');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'compile error';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function pack(type: AdShaderEffectType, raw: Record<string, number | boolean | string>): {
  p: number[];
  c0: [number, number, number];
  c1: [number, number, number];
  c2: [number, number, number];
} {
  const s = sanitizeShaderParams(type, raw);
  const n = (k: string) => Number(s[k] ?? 0);
  const p = new Array(20).fill(0);
  let c0: [number, number, number] = [1, 1, 1];
  let c1: [number, number, number] = [1, 1, 1];
  let c2: [number, number, number] = [1, 1, 1];
  if (type === 'lensDistort') {
    p[0] = n('distortion'); p[1] = n('aberration'); p[2] = n('centerX'); p[3] = n('centerY'); p[4] = n('chromaticMode');
    p[5] = n('quality');
  } else if (type === 'patternRefract') {
    p[0] = n('patternType'); p[1] = n('amount'); p[2] = n('seamlessness'); p[3] = n('frost');
    p[4] = n('iorDispersion'); p[5] = n('size'); p[6] = n('angle');
    p[7] = n('wrapMode'); p[8] = n('centerX'); p[9] = n('centerY');
  } else if (type === 'pixelate') {
    p[0] = n('pixelShape'); p[1] = n('size'); p[2] = n('stretch'); p[3] = n('gap');
    p[4] = n('average'); p[5] = n('dissolve'); p[6] = n('knockout');
    p[7] = n('colorTrim'); p[8] = n('dissolveMode'); p[9] = n('falloff');
  } else if (type === 'hatching') {
    p[0] = n('mode'); p[1] = n('density'); p[2] = n('softness'); p[3] = n('waveFrequency');
    p[4] = n('waveAmplitude'); p[5] = n('angle'); p[6] = n('scale');
    p[7] = n('offsetX'); p[8] = n('offsetY');
    c0 = hexToRgb01(String(s.colorA)); c1 = hexToRgb01(String(s.colorB));
  } else if (type === 'shapeParticles') {
    p[0] = n('mode'); p[1] = n('arrangement'); p[2] = n('threshold'); p[3] = n('density');
    p[4] = n('dotScale'); p[5] = n('softness'); p[6] = n('speed');
  } else if (type === 'halftone') {
    p[0] = n('halftoneType'); p[1] = n('colorMode'); p[2] = n('dotSize'); p[3] = n('dotScale');
    p[4] = n('softness'); p[5] = n('rotation'); p[6] = n('clipToAlpha');
    p[7] = n('centerX'); p[8] = n('centerY');
  } else if (type === 'chromaticMetal') {
    p[0] = n('rounding'); p[1] = n('depth'); p[2] = n('roughness'); p[3] = n('rgbSplit');
    p[4] = n('scale'); p[5] = n('angle'); p[6] = n('repeats'); p[7] = n('offset');
    p[8] = n('stretch'); p[9] = n('phase'); p[10] = n('evolution');
  } else if (type === 'dither') {
    p[0] = n('algorithm'); p[1] = n('pixelSize'); p[2] = n('levels'); p[3] = n('brightness');
    p[4] = n('contrast'); p[5] = n('mono');
    c0 = hexToRgb01(String(s.monoColor));
  } else if (type === 'gradientMap') {
    p[0] = n('scatter'); p[1] = n('offset'); p[2] = n('repeatType'); p[3] = n('repeatFrequency');
    p[4] = n('mixSpace');
    c0 = hexToRgb01(String(s.colorA)); c1 = hexToRgb01(String(s.colorB)); c2 = hexToRgb01(String(s.colorC));
  } else if (type === 'glowParticles') {
    p[0] = n('density'); p[1] = n('particleSize'); p[2] = n('glow'); p[3] = n('sizeVar');
    p[4] = n('scatter'); p[5] = n('direction'); p[6] = n('edge'); p[7] = n('speed');
    p[8] = n('phase'); p[9] = n('randomize');
    c0 = hexToRgb01(String(s.color));
  } else if (type === 'bloom') {
    p[0] = n('threshold'); p[1] = n('intensity'); p[2] = n('softness'); p[3] = n('vignette'); p[4] = n('vignetteSoft');
    p[5] = n('originX'); p[6] = n('originY'); p[7] = n('radius');
    c0 = hexToRgb01(String(s.tint));
  } else if (type === 'movingBlobs') {
    p[0] = n('mode'); p[1] = n('region'); p[2] = n('strength'); p[3] = n('scale');
    p[4] = n('detail'); p[5] = n('threshold'); p[6] = n('softness'); p[7] = n('dispersion'); p[8] = n('speed');
    p[9] = n('shadow');
  } else if (type === 'lightRays') {
    p[0] = n('inputMode'); p[1] = n('threshold'); p[2] = n('density'); p[3] = n('intensity');
    p[4] = n('softness'); p[5] = n('spread'); p[6] = n('speed'); p[7] = n('glow');
    p[8] = n('colorBlend');
    c0 = hexToRgb01(String(s.color1)); c1 = hexToRgb01(String(s.color2));
  } else if (type === 'filterPreset') {
    p[0] = n('filter'); p[1] = n('intensity');
  } else if (type === 'channelMixer') {
    p[0] = n('linear');
    c0 = hexToRgb01(String(s.red));
    c1 = hexToRgb01(String(s.green));
    c2 = hexToRgb01(String(s.blue));
  }
  return { p, c0, c1, c2 };
}

type ProgramRec = {
  program: WebGLProgram;
  uRes: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uFlipY: WebGLUniformLocation | null;
  uP: WebGLUniformLocation | null;
  uC0: WebGLUniformLocation | null;
  uC1: WebGLUniformLocation | null;
  uC2: WebGLUniformLocation | null;
};

class LayerShaderEngine {
  private gl: WebGL2RenderingContext;
  private programs = new Map<AdShaderEffectType, ProgramRec | null>();
  private vs: WebGLShader;
  private vao: WebGLVertexArrayObject;
  private quad: WebGLBuffer;
  private texA: WebGLTexture;
  private texB: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private outCanvas: HTMLCanvasElement;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.outCanvas = canvas;
    this.vs = compile(gl, gl.VERTEX_SHADER, VERT);

    const quad = gl.createBuffer();
    const vao = gl.createVertexArray();
    const texA = gl.createTexture();
    const texB = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!quad || !vao || !texA || !texB || !fbo) throw new Error('buffer alloc failed');
    this.quad = quad;
    this.vao = vao;
    this.texA = texA;
    this.texB = texB;
    this.fbo = fbo;

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

    for (const tex of [texA, texB]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
  }

  private getProgram(type: AdShaderEffectType): ProgramRec | null {
    if (this.programs.has(type)) return this.programs.get(type) ?? null;
    const gl = this.gl;
    try {
      const fs = compile(gl, gl.FRAGMENT_SHADER, PREAMBLE + SHADERS[type]);
      const program = gl.createProgram();
      if (!program) throw new Error('program alloc failed');
      gl.attachShader(program, this.vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) || 'link error';
        gl.deleteProgram(program);
        throw new Error(log);
      }
      gl.useProgram(program);
      gl.uniform1i(gl.getUniformLocation(program, 'inputTex'), 0);
      const rec: ProgramRec = {
        program,
        uRes: gl.getUniformLocation(program, 'uRes'),
        uTime: gl.getUniformLocation(program, 'uTime'),
        uFlipY: gl.getUniformLocation(program, 'uFlipY'),
        uP: gl.getUniformLocation(program, 'uP[0]') ?? gl.getUniformLocation(program, 'uP'),
        uC0: gl.getUniformLocation(program, 'uC0'),
        uC1: gl.getUniformLocation(program, 'uC1'),
        uC2: gl.getUniformLocation(program, 'uC2'),
      };
      this.programs.set(type, rec);
      return rec;
    } catch (err) {
      console.warn(`[ad-layer-shaders] ${type} failed`, err);
      this.programs.set(type, null);
      return null;
    }
  }

  private allocTex(tex: WebGLTexture, w: number, h: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  apply(source: HTMLCanvasElement, effects: AdEffect[], timeMs: number): HTMLCanvasElement | null {
    if (this.destroyed) return null;
    const gl = this.gl;
    const w = Math.max(1, source.width);
    const h = Math.max(1, source.height);
    const canvas = this.outCanvas;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    this.allocTex(this.texA, w, h);
    this.allocTex(this.texB, w, h);

    gl.bindTexture(gl.TEXTURE_2D, this.texA);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    let read = this.texA;
    let write = this.texB;
    let ran = false;
    const time = (timeMs * 0.001) % 1024;

    const drawShader = (type: AdShaderEffectType, params: Record<string, number | boolean | string>) => {
      const rec = this.getProgram(type);
      if (!rec) return;
      const packed = pack(type, params);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, write, 0);
      gl.viewport(0, 0, w, h);
      gl.useProgram(rec.program);
      gl.uniform2f(rec.uRes, w, h);
      gl.uniform1f(rec.uTime, time);
      // Canvas uploads store the top row at texel y=0; FBO writes normally store it at y=h.
      // Flip clip-space Y so ping-pong textures keep the same origin as the source canvas.
      gl.uniform1f(rec.uFlipY, -1);
      gl.uniform1fv(rec.uP, packed.p);
      gl.uniform3f(rec.uC0, packed.c0[0], packed.c0[1], packed.c0[2]);
      gl.uniform3f(rec.uC1, packed.c1[0], packed.c1[1], packed.c1[2]);
      gl.uniform3f(rec.uC2, packed.c2[0], packed.c2[1], packed.c2[2]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read);
      gl.bindVertexArray(this.vao);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindVertexArray(null);
      const tmp = read;
      read = write;
      write = tmp;
      ran = true;
    };

    for (const fx of effects) {
      if (!fx.visible) continue;
      if (fx.type === 'crt' && 'params' in fx) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, read);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, read, 0);
        const snap = document.createElement('canvas');
        snap.width = w;
        snap.height = h;
        const sctx = snap.getContext('2d');
        if (sctx) {
          const pixels = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          const img = sctx.createImageData(w, h);
          img.data.set(pixels);
          sctx.putImageData(img, 0, 0);
          const crt = applyCrtFilter(snap, sanitizeCrtParams(fx.params), timeMs);
          gl.bindTexture(gl.TEXTURE_2D, write);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, crt ?? snap);
          const tmp = read;
          read = write;
          write = tmp;
          ran = true;
        }
      } else if (isAdShaderType(fx.type) && 'params' in fx) {
        drawShader(fx.type, fx.params);
      }
    }

    if (!ran) return null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, read, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, read, 0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, w, h, 0, h, w, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    return canvas;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const gl = this.gl;
    for (const rec of this.programs.values()) {
      if (rec) gl.deleteProgram(rec.program);
    }
    gl.deleteShader(this.vs);
    gl.deleteBuffer(this.quad);
    gl.deleteTexture(this.texA);
    gl.deleteTexture(this.texB);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteVertexArray(this.vao);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

let engine: LayerShaderEngine | null = null;
let engineCanvas: HTMLCanvasElement | null = null;
let engineFailed = false;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      engine?.destroy();
    } catch {
      /* ignore */
    }
    engine = null;
    engineCanvas = null;
    engineFailed = false;
  });
}

export function layerHasAnimatedFx(effects: AdEffect[] | undefined): boolean {
  return (effects ?? []).some((e) => {
    if (!e.visible) return false;
    if (e.type === 'crt') return true;
    return isAdShaderType(e.type) && shaderIsAnimated(e.type);
  });
}

export function applyLayerFilters(
  source: HTMLCanvasElement,
  effects: AdEffect[],
  timeMs: number,
): HTMLCanvasElement | null {
  const list = effects.filter((e) => {
    if (!e.visible) return false;
    return e.type === 'crt' || isAdShaderType(e.type);
  });
  if (!list.length || typeof document === 'undefined') return null;
  if (list.length === 1 && list[0]!.type === 'crt' && 'params' in list[0]!) {
    return applyCrtFilter(source, sanitizeCrtParams(list[0]!.params), timeMs);
  }
  if (engineFailed) {
    const crt = list.find((e) => e.type === 'crt' && 'params' in e);
    return crt && crt.type === 'crt' ? applyCrtFilter(source, sanitizeCrtParams(crt.params), timeMs) : null;
  }
  try {
    if (!engineCanvas) engineCanvas = document.createElement('canvas');
    if (!engine) engine = new LayerShaderEngine(engineCanvas);
    return engine.apply(source, list, timeMs);
  } catch (err) {
    console.warn('[ad-layer-shaders]', err);
    engineFailed = true;
    try {
      engine?.destroy();
    } catch {
      /* ignore */
    }
    engine = null;
    engineCanvas = null;
    const crt = list.find((e) => e.type === 'crt' && 'params' in e);
    return crt && crt.type === 'crt' ? applyCrtFilter(source, sanitizeCrtParams(crt.params), timeMs) : null;
  }
}
