import { isCapacitorNative } from '../native/anix-api-native';

export type WebGpuStatus = 'pending' | 'available' | 'unavailable';

export type WebGpuDiagnostics = {
  secureContext: boolean;
  hasApi: boolean;
  chromiumMajor: number | null;
  lastProbe: string | null;
  adapterVendor: string | null;
  adapterArchitecture: string | null;
  adapterDevice: string | null;
  adapterDescription: string | null;
};

/** Реактивное состояние — UI обновляется после async-probe. */
export const webGpu = $state({
  status: 'pending' as WebGpuStatus,
  reason: null as string | null,
});

export const webGpuDiagnostics = $state<WebGpuDiagnostics>({
  secureContext: false,
  hasApi: false,
  chromiumMajor: null,
  lastProbe: null,
  adapterVendor: null,
  adapterArchitecture: null,
  adapterDevice: null,
  adapterDescription: null,
});

let inflight: Promise<boolean> | null = null;

type ExtendedAdapterOptions = GPURequestAdapterOptions & { compatibilityMode?: boolean };

export function hasWebGpuApi(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.gpu?.requestAdapter === 'function';
}

export function isGpuAvailable(): boolean {
  return webGpu.status === 'available';
}

export function getWebGpuUnavailableReason(): string | null {
  return webGpu.reason;
}

function parseChromiumMajor(): number | null {
  if (typeof navigator === 'undefined') return null;
  const match = navigator.userAgent.match(/\bChrome\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function clearAdapterDiagnostics() {
  webGpuDiagnostics.adapterVendor = null;
  webGpuDiagnostics.adapterArchitecture = null;
  webGpuDiagnostics.adapterDevice = null;
  webGpuDiagnostics.adapterDescription = null;
}

function storeAdapterDiagnostics(adapter: GPUAdapter) {
  try {
    const info = adapter.info;
    webGpuDiagnostics.adapterVendor = info?.vendor ?? null;
    webGpuDiagnostics.adapterArchitecture = info?.architecture ?? null;
    webGpuDiagnostics.adapterDevice = info?.device ?? null;
    webGpuDiagnostics.adapterDescription = info?.description ?? null;
  } catch {
    clearAdapterDiagnostics();
  }
}

function updateDiagnostics(stage: string) {
  webGpuDiagnostics.secureContext = typeof window !== 'undefined' && window.isSecureContext;
  webGpuDiagnostics.hasApi = hasWebGpuApi();
  webGpuDiagnostics.chromiumMajor = parseChromiumMajor();
  webGpuDiagnostics.lastProbe = stage;
}

function secureContextBlocked(): string | null {
  if (typeof window === 'undefined') return 'Нет окружения браузера';
  if (window.isSecureContext) return null;
  if (isCapacitorNative()) {
    return 'WebGPU недоступен в live-сборке по HTTP — используйте bundled APK (build:android-tv-anime4k)';
  }
  return 'WebGPU работает только по HTTPS или на localhost (не по IP в локальной сети)';
}

function gpuAdapterUnavailableReason(chromiumMajor: number | null): string {
  if (isCapacitorNative()) {
    if (chromiumMajor != null && chromiumMajor < 121) {
      return `WebView Chrome ${chromiumMajor} — нужен 121+. Обновите Android System WebView в Play Store`;
    }
    return 'GPU-адаптер WebGPU не найден на этом TV (см. диагностику в Поведение)';
  }
  return 'GPU не выделен — включите аппаратное ускорение в браузере';
}

function missingWebGpuApiReason(chromiumMajor: number | null): string {
  if (isCapacitorNative()) {
    if (chromiumMajor != null) {
      return `WebView Chrome ${chromiumMajor} — для WebGPU нужен 121+. Обновите в Play Store`;
    }
    return 'Обновите Android System WebView до версии 121+ (Chrome в Play Store)';
  }
  return 'Обновите браузер (Chrome 113+, Edge 113+, Firefox 141+)';
}

async function requestAnyAdapter(): Promise<GPUAdapter | null> {
  const gpu = navigator.gpu;
  if (!gpu?.requestAdapter) return null;

  const optionsList: ExtendedAdapterOptions[] = [
    { compatibilityMode: true },
    { powerPreference: 'high-performance', compatibilityMode: true },
    { powerPreference: 'high-performance' },
    { powerPreference: 'low-power' },
    {},
    { forceFallbackAdapter: true },
    { compatibilityMode: true, forceFallbackAdapter: true },
  ];

  for (const options of optionsList) {
    try {
      const adapter = await gpu.requestAdapter(options);
      if (adapter) return adapter;
    } catch {
      // try next strategy (TV GPUs often need compatibilityMode / OpenGL ES)
    }
  }
  return null;
}

export async function probeWebGpuAvailable(force = false): Promise<boolean> {
  if (!force && webGpu.status === 'available') return true;
  if (!force && webGpu.status === 'unavailable' && webGpu.reason) return false;

  const chromiumMajor = parseChromiumMajor();
  updateDiagnostics('start');
  clearAdapterDiagnostics();

  const secureBlock = secureContextBlocked();
  if (secureBlock) {
    webGpu.status = 'unavailable';
    webGpu.reason = secureBlock;
    updateDiagnostics('secure-context-blocked');
    return false;
  }

  if (!hasWebGpuApi()) {
    webGpu.status = 'unavailable';
    webGpu.reason = missingWebGpuApiReason(chromiumMajor);
    updateDiagnostics('missing-api');
    return false;
  }

  try {
    let adapter = await requestAnyAdapter();
    if (!adapter && isCapacitorNative()) {
      await new Promise((r) => setTimeout(r, 400));
      adapter = await requestAnyAdapter();
    }
    if (!adapter) {
      webGpu.status = 'unavailable';
      webGpu.reason = gpuAdapterUnavailableReason(chromiumMajor);
      updateDiagnostics('adapter-null');
      return false;
    }
    storeAdapterDiagnostics(adapter);
    webGpu.status = 'available';
    webGpu.reason = null;
    updateDiagnostics('available');
    return true;
  } catch {
    webGpu.status = 'unavailable';
    webGpu.reason = 'Ошибка инициализации WebGPU';
    updateDiagnostics('error');
    return false;
  }
}

export function initWebGpuAvailability(force = false): Promise<boolean> {
  if (!force && inflight) return inflight;
  inflight = probeWebGpuAvailable(force).finally(() => {
    inflight = null;
  });
  return inflight;
}
