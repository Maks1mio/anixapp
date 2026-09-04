import { isCapacitorNative } from '../native/anix-api-native';
import {
  getWebGpuUnavailableReason,
  initWebGpuAvailability,
  isGpuAvailable,
  webGpu,
  webGpuDiagnostics,
} from '../utils/webgpu-availability.svelte';

export type NativeDeviceDiagnostics = {
  manufacturer?: string;
  brand?: string;
  model?: string;
  device?: string;
  product?: string;
  hardware?: string;
  board?: string;
  androidRelease?: string;
  sdkInt?: number;
  supportedAbis?: string[];
  processName?: string;
  screenWidthPx?: number;
  screenHeightPx?: number;
  densityDpi?: number;
  density?: number;
  memoryClassMb?: number;
  largeMemoryClassMb?: number;
  lowRamDevice?: boolean;
  gpuFlagsApplied?: boolean;
  gpuFlagsError?: string;
  webViewMultiprocess?: boolean | null;
  webViewPackage?: string | null;
  webViewVersion?: string | null;
  webViewVersionCode?: number | null;
  error?: string;
};

export type DiagnosticLine = { key: string; value: string };

type AnixDeviceNative = {
  getDiagnostics?: () => string;
};

function nativeBridge(): AnixDeviceNative | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { AnixDevice?: AnixDeviceNative }).AnixDevice ?? null;
}

export async function loadNativeDeviceDiagnostics(): Promise<NativeDeviceDiagnostics | null> {
  const bridge = nativeBridge();
  if (!bridge?.getDiagnostics) return null;
  try {
    const raw = bridge.getDiagnostics();
    return JSON.parse(raw) as NativeDeviceDiagnostics;
  } catch {
    return { error: 'Не удалось прочитать native-диагностику' };
  }
}

function formatAbis(abis?: string[]): string {
  if (!abis?.length) return '—';
  return abis.join(', ');
}

function buildAnime4kTips(native: NativeDeviceDiagnostics | null): string[] {
  const tips: string[] = [];
  const major = webGpuDiagnostics.chromiumMajor;
  const webViewVersion = native?.webViewVersion ?? null;
  const webViewMajor = webViewVersion ? Number(webViewVersion.split('.')[0]) : null;

  if (!isCapacitorNative()) {
    tips.push('Anime4K в APK доступен только в нативном приложении.');
    return tips;
  }

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    tips.push('Соберите bundled APK (build:android-tv-anime4k), а не live по HTTP.');
  }

  if (native?.gpuFlagsApplied === false) {
    tips.push('GPU-флаги Chromium не применились — пересоберите APK и полностью перезапустите TV.');
    if (native.gpuFlagsError) tips.push(`Ошибка флагов: ${native.gpuFlagsError}`);
  }

  if (webViewMajor != null && webViewMajor < 121) {
    tips.push(`Обновите Android System WebView (${webViewVersion}) до 121+ в Play Store.`);
  } else if (major != null && major < 121) {
    tips.push(`WebView в User-Agent старый (Chrome ${major}) — обновите System WebView.`);
  }

  if (native?.webViewMultiprocess === true) {
    tips.push('WebView multiprocess: флаги GPU применяются в каждом процессе через Application.');
  }

  if (!isGpuAvailable()) {
    tips.push('Prod APK: UI встроен в приложение (не требует tv.anixapp.com при старте).');
    tips.push('Сайт tv.anixapp.com — для браузера; обновление: yarn deploy:tv');
    tips.push('Обновите Android System WebView (121+) в Play Store на TV.');
    tips.push('Если WebView новый, но адаптер null — WebGPU может быть недоступен на этом TV.');
  } else {
    tips.push('WebGPU доступен — Anime4K должен работать в плеере.');
  }

  return tips;
}

export function buildDeviceDiagnosticLines(native: NativeDeviceDiagnostics | null): DiagnosticLine[] {
  const lines: DiagnosticLine[] = [];

  const push = (key: string, value: unknown) => {
    lines.push({
      key,
      value: value == null || value === '' ? '—' : String(value),
    });
  };

  push('Производитель', native?.manufacturer);
  push('Бренд', native?.brand);
  push('Модель', native?.model);
  push('Устройство', native?.device);
  push('Продукт', native?.product);
  push('Hardware', native?.hardware);
  push('Board', native?.board);
  push('Android', native?.androidRelease ? `${native.androidRelease} (API ${native.sdkInt ?? '?'})` : native?.sdkInt);
  push('ABI', formatAbis(native?.supportedAbis));
  push('Процесс', native?.processName);
  push(
    'Экран',
    native?.screenWidthPx && native?.screenHeightPx
      ? `${native.screenWidthPx}×${native.screenHeightPx} @ ${native.densityDpi ?? '?'} dpi`
      : null,
  );
  push('Память (MB)', native?.memoryClassMb != null ? `${native.memoryClassMb} / large ${native.largeMemoryClassMb}` : null);
  push('Low RAM device', native?.lowRamDevice == null ? null : native.lowRamDevice ? 'да' : 'нет');

  push('WebView пакет', native?.webViewPackage);
  push(
    'WebView версия',
    native?.webViewVersion
      ? `${native.webViewVersion}${native.webViewVersionCode != null ? ` (${native.webViewVersionCode})` : ''}`
      : null,
  );
  push('WebView multiprocess', native?.webViewMultiprocess == null ? null : native.webViewMultiprocess ? 'да' : 'нет');
  push('GPU-флаги Chromium', native?.gpuFlagsApplied == null ? null : native.gpuFlagsApplied ? 'применены' : 'нет');
  if (native?.gpuFlagsError) push('GPU-флаги ошибка', native.gpuFlagsError);

  if (typeof window !== 'undefined') {
    push('Origin', window.location.origin);
    push('Secure context', window.isSecureContext ? 'да' : 'нет');
    push('User-Agent', navigator.userAgent);
    push('DPR', window.devicePixelRatio);
  }

  push('WebGPU API (navigator.gpu)', webGpuDiagnostics.hasApi ? 'да' : 'нет');
  push('WebGPU статус', webGpu.status);
  push('WebGPU Chrome (UA)', webGpuDiagnostics.chromiumMajor ?? '—');
  push('WebGPU probe', webGpuDiagnostics.lastProbe ?? '—');
  push('WebGPU причина', getWebGpuUnavailableReason() ?? '—');
  if (webGpuDiagnostics.adapterVendor) push('GPU vendor', webGpuDiagnostics.adapterVendor);
  if (webGpuDiagnostics.adapterArchitecture) push('GPU arch', webGpuDiagnostics.adapterArchitecture);
  if (webGpuDiagnostics.adapterDevice) push('GPU device', webGpuDiagnostics.adapterDevice);
  if (webGpuDiagnostics.adapterDescription) push('GPU описание', webGpuDiagnostics.adapterDescription);

  return lines;
}

export async function refreshDeviceDiagnostics(): Promise<{
  native: NativeDeviceDiagnostics | null;
  lines: DiagnosticLine[];
  tips: string[];
}> {
  await initWebGpuAvailability(true);
  if (isCapacitorNative()) {
    await new Promise((r) => setTimeout(r, 300));
    await initWebGpuAvailability(true);
  }
  const native = await loadNativeDeviceDiagnostics();
  const tips = buildAnime4kTips(native);
  const lines = buildDeviceDiagnosticLines(native);
  return { native, lines, tips };
}
