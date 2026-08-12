import type { UiV2SelectStatus } from '../components/uikit-v2/UiV2Select.svelte';

export type EndpointPingState = {
  ok: boolean;
  latencyMs: number | null;
};

const GOOD_MS = 150;
const MEDIUM_MS = 300;

/** Подпись ping справа */
export function endpointPingHint(state?: EndpointPingState): string | undefined {
  if (!state) return '…';
  if (state.ok && typeof state.latencyMs === 'number') return `${state.latencyMs} мс`;
  if (!state.ok) return 'недоступен';
  return undefined;
}

/** Цветовой статус по задержке */
export function endpointPingStatus(state?: EndpointPingState): UiV2SelectStatus {
  if (!state) return 'neutral';
  if (!state.ok || state.latencyMs == null) return 'offline';
  if (state.latencyMs < GOOD_MS) return 'good';
  if (state.latencyMs < MEDIUM_MS) return 'medium';
  return 'bad';
}

/** Параллельный ping — результаты отдаются по мере готовности каждого URL */
export async function pingEndpointStates(
  urls: string[],
  pingFn: (url: string) => Promise<EndpointPingState>,
  onResult?: (url: string, state: EndpointPingState) => void,
): Promise<Record<string, EndpointPingState>> {
  const result: Record<string, EndpointPingState> = {};
  await Promise.all(
    urls.map(async (url) => {
      let state: EndpointPingState;
      try {
        state = await pingFn(url);
      } catch {
        state = { ok: false, latencyMs: null };
      }
      result[url] = state;
      onResult?.(url, state);
    }),
  );
  return result;
}

/** Короткое имя хоста без суффикса в скобках */
export function endpointHostLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function isBlockedRfEndpoint(value: string): boolean {
  return value.includes('anixart.tv');
}
