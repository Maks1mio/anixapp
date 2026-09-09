import type { UiV2SelectStatus } from '../components/uikit-v2/UiV2Select.svelte';
import {
  endpointHostname,
  staticEndpointCountry,
  type EndpointCountryInfo,
} from './endpointCountry';

export type EndpointPingState = {
  ok: boolean;
  latencyMs: number | null;
};

export type { EndpointCountryInfo };

const GOOD_MS = 150;
const MEDIUM_MS = 300;

/** Хост для проверки резервного прокси (DNS не резолвится). */
export function isBackupTestEndpoint(value: string): boolean {
  return value.includes('anixart.invalid');
}

/** Хосты, которые часто режут в РФ (показываем спец. текст только если пинг упал). */
export function isBlockedRfEndpoint(value: string): boolean {
  return value.includes('anixart.tv');
}

export function endpointCountryLabel(
  value: string,
  geo?: EndpointCountryInfo | null,
): string | undefined {
  if (isBackupTestEndpoint(value)) return 'тест резерва';
  const name = geo?.countryName || staticEndpointCountry(value).countryName;
  return name || undefined;
}

/** Подпись под хостом: страна · пинг / блокировка / не работает */
export function endpointStatusDesc(
  value: string,
  state?: EndpointPingState,
  geo?: EndpointCountryInfo | null,
): string | undefined {
  const country = endpointCountryLabel(value, geo);

  if (isBackupTestEndpoint(value)) {
    if (!state) return 'DNS fail · проверка прокси';
    if (state.ok) return 'неожиданно онлайн';
    return 'недоступен · ждём failover';
  }

  if (!state) return country ? `${country} · …` : '…';

  if (state.ok && typeof state.latencyMs === 'number') {
    return country ? `${country} · ${state.latencyMs} мс` : `${state.latencyMs} мс`;
  }

  if (isBlockedRfEndpoint(value)) {
    return country
      ? `${country} · заблокирован в вашей стране`
      : 'заблокирован в вашей стране';
  }

  return country ? `${country} · неработает` : 'неработает';
}

/** @deprecated используйте endpointStatusDesc */
export function endpointPingHint(state?: EndpointPingState): string | undefined {
  if (!state) return '…';
  if (state.ok && typeof state.latencyMs === 'number') return `${state.latencyMs} мс`;
  if (!state.ok) return 'неработает';
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

/** Параллельный geo по хостам эндпоинтов. */
export async function resolveEndpointCountries(
  urls: string[],
  geoFn: (url: string) => Promise<EndpointCountryInfo>,
  onResult?: (url: string, geo: EndpointCountryInfo) => void,
): Promise<Record<string, EndpointCountryInfo>> {
  const result: Record<string, EndpointCountryInfo> = {};
  await Promise.all(
    urls.map(async (url) => {
      let geo: EndpointCountryInfo = staticEndpointCountry(url);
      try {
        const live = await geoFn(url);
        if (live?.countryCode || live?.countryName) geo = live;
      } catch {
        /* keep static */
      }
      result[url] = geo;
      onResult?.(url, geo);
    }),
  );
  return result;
}

/** Короткое имя хоста без суффикса в скобках */
export function endpointHostLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export { endpointHostname };
