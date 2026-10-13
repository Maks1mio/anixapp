export type ApiEndpointOption = { value: string; label: string };

/** Основные Anixart API (прямые хосты). */
export const API_ENDPOINT_OPTIONS: readonly ApiEndpointOption[] = [
  { value: 'https://api-s.anixsekai.com', label: 'api-s.anixsekai.com' },
  { value: 'https://api.anixart.app', label: 'api.anixart.app' },
  { value: 'https://api.anixart.tv', label: 'api.anixart.tv' },
];

/** Резервный прокси AnixApp. */
export const BACKUP_API_PROXY = 'https://api.anixapp.com/anixart-api';

export const BACKUP_API_PROXY_LABEL = 'AnixApp proxy';

/** Нерезолвящийся хост (.invalid) — только для проверки оффлайна в dev. */
export const DEV_DOWN_API_ENDPOINT = 'https://api-down.anixart.invalid';
export const DEV_DOWN_API_ENDPOINT_LABEL = 'api-down.anixart.invalid';

export function isViteDev(): boolean {
  return import.meta.env.DEV === true;
}

export function isDevDownApiEndpoint(url: string | null | undefined): boolean {
  if (!url) return false;
  return String(url).includes('api-down.anixart.invalid') || String(url).includes('anixart.invalid');
}

/** Все варианты в селекторе эндпоинтов (прямые + dev-тест + резерв). */
export const SELECTABLE_API_ENDPOINTS: readonly ApiEndpointOption[] = [
  ...API_ENDPOINT_OPTIONS,
  ...(isViteDev()
    ? [{ value: DEV_DOWN_API_ENDPOINT, label: DEV_DOWN_API_ENDPOINT_LABEL }]
    : []),
  { value: BACKUP_API_PROXY, label: BACKUP_API_PROXY_LABEL },
];

export const DEFAULT_API_ENDPOINT = API_ENDPOINT_OPTIONS[0].value;

export function isBackupApiProxy(url: string | null | undefined): boolean {
  if (!url) return false;
  const normalized = String(url).trim().replace(/\/$/, '');
  return (
    normalized === BACKUP_API_PROXY ||
    normalized.startsWith(`${BACKUP_API_PROXY}/`) ||
    normalized.includes('api.anixapp.com/anixart-api')
  );
}

/** Нормализация выбора из селектора — резервный прокси сохраняется. */
export function normalizeSelectableApiEndpoint(url: string | null | undefined): string {
  if (!url) return DEFAULT_API_ENDPOINT;
  const normalized = String(url).trim().replace(/\/$/, '');
  if (!isViteDev() && isDevDownApiEndpoint(normalized)) return DEFAULT_API_ENDPOINT;
  if (isBackupApiProxy(normalized)) return BACKUP_API_PROXY;
  const match = SELECTABLE_API_ENDPOINTS.find(
    (o) => o.value === normalized || o.value === url,
  );
  return match?.value ?? url;
}

/** Если нужен только прямой хост (не прокси) — например для legacy. */
export function coercePrimaryApiEndpoint(url: string | null | undefined): string {
  if (!url || isBackupApiProxy(url)) return DEFAULT_API_ENDPOINT;
  if (isDevDownApiEndpoint(url)) {
    return isViteDev() ? DEV_DOWN_API_ENDPOINT : DEFAULT_API_ENDPOINT;
  }
  const match = API_ENDPOINT_OPTIONS.find((o) => o.value === url || o.value === url.replace(/\/$/, ''));
  return match?.value ?? url;
}
