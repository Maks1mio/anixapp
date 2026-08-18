import {
  DoG, BilateralMean, CNNM, CNNSoftM, CNNSoftVL, CNNVL, CNNUL, GANUUL,
  CNNx2M, CNNx2VL, DenoiseCNNx2VL, CNNx2UL, GANx3L, GANx4UUL,
  ModeA, ModeB, ModeC, ModeAA, ModeBB, ModeCA,
  render as anime4kRender,
} from 'anime4k-webgpu';

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

export const GPU_AVAILABLE =
  typeof navigator !== 'undefined' && typeof (navigator as Navigator & { gpu?: unknown }).gpu !== 'undefined';

export interface Anime4kSession {
  /** `detachOutput: false` — остановить GPU, не трогая общий canvas/video (смена пресета). */
  stop: (opts?: { detachOutput?: boolean }) => void;
}

interface CanvasLayout {
  cssW: number;
  cssH: number;
  bufferW: number;
  bufferH: number;
}

function computeCanvasLayout(
  sourceW: number,
  sourceH: number,
  container: HTMLElement | null | undefined,
  fit: 'contain' | 'cover' = 'contain',
  pixelRatio?: number,
): CanvasLayout {
  const aspect = sourceW / sourceH;
  const rect = container?.getBoundingClientRect();
  const containerW = rect ? Math.round(rect.width) : 1280;
  const containerH = rect ? Math.round(rect.height) : 720;
  const dpr = Math.min(
    pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
    2,
  );

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

  const maxBufferW = Math.min(sourceW * 2, Math.round(cssW * dpr));
  const maxBufferH = Math.min(sourceH * 2, Math.round(cssH * dpr));
  let bufferW: number;
  let bufferH: number;
  if (maxBufferW / maxBufferH > aspect) {
    bufferH = maxBufferH;
    bufferW = Math.round(bufferH * aspect);
  } else {
    bufferW = maxBufferW;
    bufferH = Math.round(bufferW / aspect);
  }
  bufferW = Math.max(sourceW, bufferW);
  bufferH = Math.max(sourceH, bufferH);

  if (fit === 'cover') {
    bufferW = Math.max(bufferW, Math.round(containerW * dpr));
    bufferH = Math.max(bufferH, Math.round(containerH * dpr));
    if (bufferW / bufferH > aspect) {
      bufferH = Math.round(bufferW / aspect);
    } else {
      bufferW = Math.round(bufferH * aspect);
    }
  }

  return { cssW, cssH, bufferW, bufferH };
}

async function loadImageBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/** Anime4K для статичного постера (через captureStream → video). */
export async function startAnime4kImageUpscale(opts: {
  imageUrl: string;
  canvas: HTMLCanvasElement;
  mode?: number;
  container?: HTMLElement | null;
  fit?: 'contain' | 'cover';
}): Promise<Anime4kSession | null> {
  if (!GPU_AVAILABLE) return null;

  const bitmap = await loadImageBitmap(opts.imageUrl);
  if (!bitmap?.width) return null;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = bitmap.width;
  srcCanvas.height = bitmap.height;
  const ctx = srcCanvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  const stream = srcCanvas.captureStream(1);
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }

  await new Promise<void>((resolve) => {
    if (video.videoWidth > 0) {
      resolve();
      return;
    }
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    setTimeout(resolve, 800);
  });

  if (video.videoWidth < 1) {
    video.pause();
    video.srcObject = null;
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }

  const session = await startAnime4kUpscale({
    video,
    canvas: opts.canvas,
    mode: opts.mode,
    container: opts.container,
    fit: opts.fit ?? 'cover',
  });

  if (!session) {
    video.pause();
    video.srcObject = null;
    stream.getTracks().forEach((t) => t.stop());
    return null;
  }

  const origStop = session.stop;
  return {
    stop: () => {
      origStop();
      video.pause();
      video.srcObject = null;
      stream.getTracks().forEach((t) => t.stop());
      opts.canvas.classList.remove('hero-media__canvas--poster');
    },
  };
}

function copyExtentWH(copySize: GPUExtent3D): { w: number; h: number } {
  if (Array.isArray(copySize)) {
    return { w: Number(copySize[0]) || 0, h: Number(copySize[1]) || 0 };
  }
  const d = copySize as GPUExtent3DDict;
  return { w: Number(d?.width) || 0, h: Number(d?.height) || 0 };
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
}): Promise<Anime4kSession | null> {
  if (!GPU_AVAILABLE) return null;

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
  } = opts;
  if (video.readyState < HTMLVideoElement.HAVE_FUTURE_DATA) {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
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
  const origRvfc = video.requestVideoFrameCallback.bind(video);

  const manageCanvasHidden = canvasVisibleClass !== '';

  const stop = (opts?: { detachOutput?: boolean }) => {
    stopped = true;
    video.requestVideoFrameCallback = origRvfc;
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
  const layout = computeCanvasLayout(videoW, videoH, container, fit, pixelRatio);

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
        const { w, h } = copyExtentWH(copySize);
        if (src.videoWidth < w || src.videoHeight < h || w < 2 || h < 2) {
          copyFails++;
          if (copyFails >= 6) stop();
          return;
        }
      }
      try {
        const result = origCopy(source, destination, copySize);
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
    video.requestVideoFrameCallback = origRvfc;
    if (latestRvfcId !== null) {
      try { video.cancelVideoFrameCallback(latestRvfcId); } catch { /* ignore */ }
    }
  };

  if (manageCanvasHidden) {
    canvas.hidden = false;
    canvas.classList.add(canvasVisibleClass);
  }
  video.classList.add(hideSourceClass);

  return { stop };
}
