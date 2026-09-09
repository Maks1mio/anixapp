import {
  DoG, BilateralMean, CNNM, CNNSoftM, CNNSoftVL, CNNVL, CNNUL, GANUUL,
  CNNx2M, CNNx2VL, DenoiseCNNx2VL, CNNx2UL, GANx3L, GANx4UUL,
  ModeA, ModeB, ModeC, ModeAA, ModeBB, ModeCA,
  render as anime4kRender,
} from 'anime4k-webgpu';
import { hasWebGpuApi, probeWebGpuAvailable } from './webgpu-availability.svelte';
import { isAnixartCdnUrl, unwrapCdnUrl } from './posterUrl';

const MODE_MAP: Record<number, new (opts: {
  device: GPUDevice;
  inputTexture: GPUTexture;
  nativeDimensions: { width: number; height: number };
  targetDimensions: { width: number; height: number };
}) => unknown> = {
  0: DoG, 1: BilateralMean, 2: CNNM, 3: CNNSoftM, 4: CNNSoftVL,
  5: CNNVL, 6: CNNUL, 7: GANUUL,
  8: CNNx2M, 9: CNNx2VL, 10: DenoiseCNNx2VL, 11: CNNx2UL, 12: GANx3L, 13: GANx4UUL,
  14: ModeA, 15: ModeB, 16: ModeC, 17: ModeAA, 18: ModeBB, 19: ModeCA,
};

export const GPU_AVAILABLE = hasWebGpuApi();

/** Мягкий потолок стороны буфера для realtime-плеера (8K = thrash/мигание). */
const GPU_MAX_SIDE = 3840;

export interface Anime4kSession {
  /** `detachOutput: false` — остановить GPU, не трогая общий canvas/video (смена пресета). */
  stop: (opts?: { detachOutput?: boolean }) => void;
}

export interface Anime4kCanvasLayout {
  cssW: number;
  cssH: number;
  bufferW: number;
  bufferH: number;
}

export type Anime4kTargetHeight = number | null;

function fitCssSize(
  aspect: number,
  containerW: number,
  containerH: number,
  fit: 'contain' | 'cover',
): { cssW: number; cssH: number } {
  let cssW: number;
  let cssH: number;
  if (fit === 'cover') {
    if (containerW / containerH > aspect) {
      cssW = containerW;
      cssH = Math.round(cssW / aspect);
    } else {
      cssH = containerH;
      cssW = Math.round(cssH * aspect);
    }
  } else if (containerW / containerH > aspect) {
    cssH = containerH;
    cssW = Math.round(cssH * aspect);
  } else {
    cssW = containerW;
    cssH = Math.round(cssW / aspect);
  }
  return { cssW, cssH };
}

function clampGpuBuffer(bufferW: number, bufferH: number, aspect: number): { bufferW: number; bufferH: number } {
  if (bufferW <= GPU_MAX_SIDE && bufferH <= GPU_MAX_SIDE) return { bufferW, bufferH };
  if (bufferW >= bufferH) {
    const w = GPU_MAX_SIDE;
    return { bufferW: w, bufferH: Math.max(1, Math.round(w / aspect)) };
  }
  const h = GPU_MAX_SIDE;
  return { bufferW: Math.max(1, Math.round(h * aspect)), bufferH: h };
}

/** Размер буфера и CSS-fit для Anime4K (auto = под размер окна/контейнера). */
export function computeAnime4kCanvasLayout(
  sourceW: number,
  sourceH: number,
  container: HTMLElement | null | undefined,
  fit: 'contain' | 'cover' = 'contain',
  pixelRatio?: number,
  /** null/undefined = авто; иначе целевая высота буфера (1080/1440/…) */
  targetHeight?: Anime4kTargetHeight,
): Anime4kCanvasLayout {
  const aspect = sourceW / sourceH;
  const rect = container?.getBoundingClientRect();
  const containerW = rect ? Math.round(rect.width) : 1280;
  const containerH = rect ? Math.round(rect.height) : 720;
  const dpr = Math.min(
    pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
    2,
  );

  const { cssW, cssH } = fitCssSize(aspect, containerW, containerH, fit);

  if (targetHeight != null && targetHeight > 0) {
    let bufferH = Math.max(sourceH, targetHeight);
    let bufferW = Math.round(bufferH * aspect);
    ({ bufferW, bufferH } = clampGpuBuffer(bufferW, bufferH, aspect));
    bufferW = Math.max(sourceW, bufferW);
    bufferH = Math.max(sourceH, bufferH);
    return { cssW, cssH, bufferW, bufferH };
  }

  // Авто: буфер = видимая область видео в окне (contain), без лимита 2× source.
  let bufferW = Math.max(1, Math.round(cssW * dpr));
  let bufferH = Math.max(1, Math.round(cssH * dpr));
  if (bufferW / bufferH > aspect) {
    bufferH = Math.max(1, Math.round(bufferW / aspect));
  } else {
    bufferW = Math.max(1, Math.round(bufferH * aspect));
  }
  ({ bufferW, bufferH } = clampGpuBuffer(bufferW, bufferH, aspect));
  bufferW = Math.max(sourceW, bufferW);
  bufferH = Math.max(sourceH, bufferH);

  return { cssW, cssH, bufferW, bufferH };
}

async function loadImageBitmap(url: string): Promise<ImageBitmap | null> {
  // Chromium fetch() не умеет custom schemes вроде anix-cdn:// — даже с supportFetchAPI.
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/__cdn')) return null;
  try {
    const res = await fetch(url, { cache: 'force-cache', mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size < 32) return null;
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

async function loadImageBitmapViaElectron(url: string): Promise<ImageBitmap | null> {
  try {
    const api = (window as Window & {
      electron?: { fetchRemoteImage?: (u: string) => Promise<{ mimeType: string; data: Uint8Array } | null> };
    }).electron?.fetchRemoteImage;
    if (!api) return null;
    const target = unwrapCdnUrl(url) || url;
    if (!/^https?:\/\//i.test(target)) return null;
    const result = await api(target);
    if (!result?.data?.byteLength) return null;
    const copy = new Uint8Array(result.data.byteLength);
    copy.set(result.data);
    const blob = new Blob([copy], { type: result.mimeType || 'image/jpeg' });
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function expandImageLoadUrls(urls: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw?: string | null) => {
    const url = raw?.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  for (const raw of urls) {
    push(raw);
    const unwrapped = unwrapCdnUrl(raw ?? '');
    if (unwrapped && unwrapped !== raw?.trim()) push(unwrapped);
  }
  return out;
}

/** fetch / Electron IPC — без DOM-img (CORS травит WebGPU). */
async function loadUntaintedBitmap(urls: Array<string | null | undefined>): Promise<ImageBitmap | null> {
  for (const url of expandImageLoadUrls(urls)) {
    const viaCdn = url.startsWith('anix-cdn://') || isAnixartCdnUrl(url);
    // CDN: только main (Referer + mirror fallback). Renderer fetch(anix-cdn://) падает.
    if (viaCdn) {
      const viaMain = await loadImageBitmapViaElectron(url);
      if (viaMain?.width) return viaMain;
      continue;
    }
    const viaFetch = await loadImageBitmap(url);
    if (viaFetch?.width) return viaFetch;
    const viaMain = await loadImageBitmapViaElectron(url);
    if (viaMain?.width) return viaMain;
  }
  return null;
}

/** Снимок canvas (в т.ч. WebGPU) в Blob для скачивания. */
export async function snapshotCanvasImage(
  source: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob | null> {
  if (source.width < 2 || source.height < 2) return null;
  const tryToBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob && blob.size > 0 ? blob : null), type, quality);
      } catch {
        resolve(null);
      }
    });

  const direct = await tryToBlob(source);
  if (direct) return direct;

  try {
    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return await tryToBlob(out);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type Anime4kImageUpscaleResult =
  | { ok: true; session: Anime4kSession }
  | { ok: false; error: string };

function fitSourceToGpuLimit(sw: number, sh: number): { w: number; h: number } {
  const maxSide = Math.max(sw, sh);
  if (maxSide <= GPU_MAX_SIDE) return { w: sw, h: sh };
  const scale = GPU_MAX_SIDE / maxSide;
  return {
    w: Math.max(2, Math.round(sw * scale)),
    h: Math.max(2, Math.round(sh * scale)),
  };
}

/** CSS-размер canvas с сохранением пропорций буфера (max-width+max-height вместе сплющивают). */
function setCanvasDisplaySize(
  canvas: HTMLCanvasElement,
  bufferW: number,
  bufferH: number,
  container: HTMLElement | null | undefined,
  fallbackCss?: { cssW: number; cssH: number },
): void {
  const aspect = bufferW / Math.max(1, bufferH);
  const media = container?.querySelector?.('img, video') as HTMLElement | null;
  let boxW = fallbackCss?.cssW ?? 0;
  let boxH = fallbackCss?.cssH ?? 0;
  if (media && media.clientWidth > 4 && media.clientHeight > 4) {
    boxW = media.clientWidth;
    boxH = media.clientHeight;
  }
  if (boxW < 4 || boxH < 4) {
    const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.85 : bufferW;
    const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.8 : bufferH;
    boxW = Math.min(maxW, bufferW);
    boxH = Math.min(maxH, bufferH);
  }
  let w = boxW;
  let h = w / aspect;
  if (h > boxH) {
    h = boxH;
    w = h * aspect;
  }
  canvas.style.width = `${Math.max(1, Math.round(w))}px`;
  canvas.style.height = `${Math.max(1, Math.round(h))}px`;
  canvas.style.maxWidth = 'none';
  canvas.style.maxHeight = 'none';
  canvas.style.aspectRatio = 'auto';
}

const BLIT_VERT_WGSL = `
struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
}

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  const pos = array(
    vec2( 1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0, -1.0),
    vec2( 1.0,  1.0),
    vec2(-1.0, -1.0),
    vec2(-1.0,  1.0),
  );
  const uv = array(
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(1.0, 0.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
  );
  var output : VertexOutput;
  output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}
`;

const BLIT_FRAG_WGSL = `
@group(0) @binding(1) var mySampler: sampler;
@group(0) @binding(2) var myTexture: texture_2d<f32>;

@fragment
fn main(@location(0) fragUV : vec2f) -> @location(0) vec4f {
  return textureSampleBaseClampToEdge(myTexture, mySampler, fragUV);
}
`;

/**
 * Anime4K для статичной картинки — один проход WebGPU (без captureStream/video).
 * В Electron captureStream часто недоступен, поэтому не используем video-цикл библиотеки.
 */
export async function startAnime4kImageUpscale(opts: {
  imageUrl: string;
  /** Доп. URL (прокси/оригинал) — пробуем по очереди через fetch. */
  imageUrls?: string[];
  canvas: HTMLCanvasElement;
  mode?: number;
  container?: HTMLElement | null;
  fit?: 'contain' | 'cover';
  targetHeight?: Anime4kTargetHeight;
  hideSourceClass?: string;
  canvasVisibleClass?: string;
  /** @deprecated Не используем DOM-img: cross-origin травит GPU copy. */
  sourceImage?: HTMLImageElement | null;
  warmMs?: number;
}): Promise<Anime4kImageUpscaleResult> {
  let bitmap: ImageBitmap | null = null;
  try {
    if (!(await probeWebGpuAvailable())) {
      return { ok: false, error: 'WebGPU недоступен' };
    }

    bitmap = await loadUntaintedBitmap([...(opts.imageUrls ?? []), opts.imageUrl]);
    if (!bitmap?.width) {
      return {
        ok: false,
        error: 'Не удалось загрузить картинку (нужен перезапуск приложения после обновления)',
      };
    }

    const sized = fitSourceToGpuLimit(bitmap.width, bitmap.height);
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = sized.w;
    srcCanvas.height = sized.h;
    const ctx2d = srcCanvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx2d) {
      bitmap.close();
      return { ok: false, error: 'Нет 2D-контекста' };
    }
    ctx2d.drawImage(bitmap, 0, 0, sized.w, sized.h);
    bitmap.close();
    bitmap = null;

    const layout = computeAnime4kCanvasLayout(
      sized.w,
      sized.h,
      opts.container ?? opts.canvas.parentElement,
      opts.fit ?? 'contain',
      1,
      opts.targetHeight ?? null,
    );

    const canvas = opts.canvas;
    canvas.hidden = false;
    canvas.removeAttribute('hidden');
    canvas.width = layout.bufferW;
    canvas.height = layout.bufferH;
    setCanvasDisplaySize(canvas, layout.bufferW, layout.bufferH, opts.container, layout);

    const gpu = navigator.gpu;
    if (!gpu?.requestAdapter) {
      return { ok: false, error: 'WebGPU API нет' };
    }

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' })
      ?? await gpu.requestAdapter();
    if (!adapter) {
      return { ok: false, error: 'GPU-адаптер не найден' };
    }
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) {
      try { device.destroy(); } catch { /* ignore */ }
      return { ok: false, error: 'Нет webgpu-контекста canvas' };
    }

    const format = gpu.getPreferredCanvasFormat();
    const configureContext = () => {
      context.configure({
        device,
        format,
        alphaMode: 'premultiplied',
      });
    };
    configureContext();

    const native = { width: sized.w, height: sized.h };
    const target = { width: layout.bufferW, height: layout.bufferH };

    const inputTexture = device.createTexture({
      size: [native.width, native.height, 1],
      format: 'rgba16float',
      // TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT
      usage: 0x04 | 0x02 | 0x10,
    });

    device.queue.copyExternalImageToTexture(
      { source: srcCanvas },
      { texture: inputTexture },
      [native.width, native.height],
    );

    const mode = opts.mode ?? 15;
    const ModeClass = MODE_MAP[mode] ?? ModeB;
    const pipelines = [
      new ModeClass({
        device,
        inputTexture,
        nativeDimensions: native,
        targetDimensions: target,
      }),
    ] as Array<{ pass: (encoder: GPUCommandEncoder) => void; getOutputTexture: () => GPUTexture }>;

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 1, visibility: 0x2, sampler: {} }, // FRAGMENT
        { binding: 2, visibility: 0x2, texture: {} },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
    const renderPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({ code: BLIT_VERT_WGSL }),
        entryPoint: 'vert_main',
      },
      fragment: {
        module: device.createShaderModule({ code: BLIT_FRAG_WGSL }),
        entryPoint: 'main',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    const runCompute = () => {
      const encoder = device.createCommandEncoder();
      for (const p of pipelines) p.pass(encoder);
      device.queue.submit([encoder.finish()]);
    };

    const blitToCanvas = (outTex: GPUTexture) => {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(renderPipeline);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: bindGroupLayout,
          entries: [
            { binding: 1, resource: sampler },
            { binding: 2, resource: outTex.createView() },
          ],
        }),
      );
      pass.draw(6);
      pass.end();
      device.queue.submit([encoder.finish()]);
    };

    runCompute();
    await device.queue.onSubmittedWorkDone();

    const outTex = pipelines.at(-1)!.getOutputTexture();
    const outW = Math.max(2, outTex.width);
    const outH = Math.max(2, outTex.height);
    // Если пайплайн отдал другой размер — подгоняем canvas, иначе blit сплющит кадр
    if (canvas.width !== outW || canvas.height !== outH) {
      canvas.width = outW;
      canvas.height = outH;
      configureContext();
    }
    setCanvasDisplaySize(canvas, outW, outH, opts.container, layout);

    blitToCanvas(outTex);
    await device.queue.onSubmittedWorkDone();
    blitToCanvas(outTex);
    await device.queue.onSubmittedWorkDone();

    if (opts.warmMs) await sleep(opts.warmMs);

    let stopped = false;
    return {
      ok: true,
      session: {
        stop: () => {
          if (stopped) return;
          stopped = true;
          try {
            inputTexture.destroy();
          } catch {
            /* ignore */
          }
          canvas.width = 1;
          canvas.height = 1;
          canvas.style.width = '';
          canvas.style.height = '';
          canvas.style.maxWidth = '';
          canvas.style.maxHeight = '';
          canvas.style.aspectRatio = '';
        },
      },
    };
  } catch (err) {
    try {
      bitmap?.close();
    } catch {
      /* ignore */
    }
    const raw = err instanceof Error && err.message ? err.message : 'Ошибка Anime4K';
    const msg = /tainted|cross-origin/i.test(raw)
      ? 'Картинка с чужого домена (CORS) — открой через CDN-прокси'
      : raw;
    return { ok: false, error: msg };
  }
}

function copyExtentWH(copySize: GPUExtent3D | Iterable<number> | number[]): { w: number; h: number } {
  if (Array.isArray(copySize)) {
    return { w: Number(copySize[0]) || 0, h: Number(copySize[1]) || 0 };
  }
  if (copySize && typeof copySize === 'object' && Symbol.iterator in Object(copySize)) {
    const arr = Array.from(copySize as Iterable<number>);
    return { w: Number(arr[0]) || 0, h: Number(arr[1]) || 0 };
  }
  const d = copySize as GPUExtent3DDict;
  return { w: Number(d?.width) || 0, h: Number(d?.height) || 0 };
}

/** Снять monkey-patch anime4k-webgpu, иначе следующий requestVideoFrameCallback молча ничего не делает. */
export function restoreNativeVideoFrameCallback(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  const rvfc = HTMLVideoElement.prototype.requestVideoFrameCallback;
  if (typeof rvfc === 'function') video.requestVideoFrameCallback = rvfc.bind(video);
  const cancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
  if (typeof cancel === 'function') video.cancelVideoFrameCallback = cancel.bind(video);
}

export async function startAnime4kUpscale(opts: {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  mode?: number;
  container?: HTMLElement | null;
  fit?: 'contain' | 'cover';
  hideSourceClass?: string;
  /** Класс видимости canvas. Пустая строка — не трогать (плеер). */
  canvasVisibleClass?: string;
  /** 1 = как старый плеер, без DPR-буфера. */
  pixelRatio?: number;
  /** ratio — размер/позиция canvas задаёт CSS (соотношение сторон плеера). */
  cssLayout?: 'contain' | 'ratio';
  /** Целевая высота буфера; null/omit = авто под контейнер. */
  targetHeight?: Anime4kTargetHeight;
}): Promise<Anime4kSession | null> {
  if (!(await probeWebGpuAvailable())) return null;

  const {
    video,
    canvas,
    container = canvas.parentElement,
    mode = 15,
    fit = 'contain',
    hideSourceClass = 'hero-media__video--upscaled',
    canvasVisibleClass = 'hero-media__canvas--visible',
    pixelRatio,
    cssLayout = 'contain',
    targetHeight = null,
  } = opts;
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
      video.addEventListener('playing', done, { once: true });
      setTimeout(done, 1200);
    });
  }
  if (video.readyState < 1) return null;
  const capturedW = video.videoWidth;
  const capturedH = video.videoHeight;
  if (capturedW < 2 || capturedH < 2) return null;

  let stopped = false;
  let upscaleStopFn: (() => void) | null = null;
  let capturedDevice: GPUDevice | null = null;
  let latestRvfcId: number | null = null;
  const origRvfc = HTMLVideoElement.prototype.requestVideoFrameCallback.bind(video);

  const manageCanvasHidden = canvasVisibleClass !== '';

  const stop = (opts?: { detachOutput?: boolean }) => {
    stopped = true;
    restoreNativeVideoFrameCallback(video);
    if (upscaleStopFn) {
      try { upscaleStopFn(); } catch { /* ignore */ }
      upscaleStopFn = null;
    }
    if (latestRvfcId !== null) {
      try { video.cancelVideoFrameCallback(latestRvfcId); } catch { /* ignore */ }
      latestRvfcId = null;
    }
    // Не вызывать device.destroy(): в Chromium это ломает следующий
    // getContext('webgpu') на том же canvas — Anime4K «залипает» или не стартует.
    capturedDevice = null;
    if (opts?.detachOutput === false) return;
    if (manageCanvasHidden) {
      canvas.hidden = true;
      canvas.classList.remove(canvasVisibleClass);
    }
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = '';
    canvas.style.height = '';
    video.classList.remove(hideSourceClass);
  };

  const videoW = capturedW;
  const videoH = capturedH;
  const layout = computeAnime4kCanvasLayout(videoW, videoH, container, fit, pixelRatio, targetHeight);

  canvas.width = layout.bufferW;
  canvas.height = layout.bufferH;
  if (cssLayout === 'ratio') {
    canvas.style.width = '';
    canvas.style.height = '';
  } else {
    canvas.style.width = `${layout.cssW}px`;
    canvas.style.height = `${layout.cssH}px`;
  }

  const wrapCopyQueue = (device: GPUDevice) => {
    const queue = device.queue;
    const origCopy = queue.copyExternalImageToTexture.bind(queue);
    let copyFails = 0;
    queue.copyExternalImageToTexture = (source, destination, copySize) => {
      const src = source?.source;
      if (src instanceof HTMLVideoElement) {
        const { w, h } = copyExtentWH(copySize as GPUExtent3D);
        if (src.videoWidth < w || src.videoHeight < h || w < 2 || h < 2) {
          copyFails++;
          if (copyFails >= 6) stop();
          return;
        }
      }
      try {
        const result = origCopy(source, destination, copySize as never);
        copyFails = 0;
        return result;
      } catch {
        copyFails++;
        if (copyFails >= 6) stop();
      }
    };
  };

  video.requestVideoFrameCallback = (cb: VideoFrameRequestCallback): number => {
    const wrapped: VideoFrameRequestCallback = (now, meta) => {
      if (stopped) return;
      if (video.videoWidth !== capturedW || video.videoHeight !== capturedH) {
        stop({ detachOutput: false });
        video.classList.remove(hideSourceClass);
        return;
      }
      try {
        cb(now, meta);
      } catch {
        stop({ detachOutput: false });
        video.classList.remove(hideSourceClass);
      }
    };
    const id = origRvfc(wrapped);
    latestRvfcId = id;
    return id;
  };

  const navAny = navigator as Navigator & { gpu?: GPU };
  const gpuAny = navAny.gpu;
  if (!gpuAny?.requestAdapter) {
    video.requestVideoFrameCallback = origRvfc;
    return null;
  }

  const origRequestAdapter = gpuAny.requestAdapter.bind(gpuAny);
  try {
    gpuAny.requestAdapter = async (...args: Parameters<GPU['requestAdapter']>) => {
      const adapter = await origRequestAdapter(...args);
      if (!adapter) return adapter;
      const origRD = adapter.requestDevice.bind(adapter);
      adapter.requestDevice = async (...dArgs: Parameters<GPUAdapter['requestDevice']>) => {
        const device = await origRD(...dArgs);
        capturedDevice = device;
        wrapCopyQueue(device);
        return device;
      };
      return adapter;
    };

    const ModeClass = MODE_MAP[mode] ?? ModeB;

    try {
      await anime4kRender({
        video,
        canvas,
        pipelineBuilder: (device: GPUDevice, inputTexture: GPUTexture) => {
          const native = { width: capturedW, height: capturedH };
          const target = { width: canvas.width, height: canvas.height };
          return [new ModeClass({ device, inputTexture, nativeDimensions: native, targetDimensions: target }) as never];
        },
      });
    } catch {
      stop();
      return null;
    }
  } finally {
    gpuAny.requestAdapter = origRequestAdapter;
  }

  if (stopped) {
    stop();
    return null;
  }

  upscaleStopFn = () => {
    stopped = true;
    restoreNativeVideoFrameCallback(video);
    if (latestRvfcId !== null) {
      try { video.cancelVideoFrameCallback(latestRvfcId); } catch { /* ignore */ }
    }
  };

  if (manageCanvasHidden) {
    canvas.hidden = false;
    canvas.classList.add(canvasVisibleClass);
  }
  // Пустой класс = скрытие источника управляет вызывающий код
  // (плеер ждёт готовности canvas, иначе чёрный кадр / мигание).
  if (hideSourceClass) {
    video.classList.add(hideSourceClass);
  }

  return { stop };
}
