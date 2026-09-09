/**
 * Страна API-эндпоинта (хост) + отображение в селекторе.
 */

export type EndpointCountryInfo = {
  countryCode: string | null;
  countryName: string | null;
};

/** Запасные значения, если live-geo недоступен (VPN fake-IP / Clash 198.18). */
const STATIC_ENDPOINT_COUNTRY: Record<string, EndpointCountryInfo> = {
  'api.anixapp.com': { countryCode: 'DE', countryName: 'Германия' },
  // Один anycast/CDN IP у основных Anixart API (ip-api → BZ)
  'api-s.anixsekai.com': { countryCode: 'BZ', countryName: 'Белиз' },
  'api.anixart.app': { countryCode: 'BZ', countryName: 'Белиз' },
  'api.anixart.tv': { countryCode: 'BZ', countryName: 'Белиз' },
};

export function endpointHostname(baseUrl: string): string {
  try {
    return new URL(baseUrl.trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function staticEndpointCountry(baseUrl: string): EndpointCountryInfo {
  const host = endpointHostname(baseUrl);
  return STATIC_ENDPOINT_COUNTRY[host] ?? { countryCode: null, countryName: null };
}

/** ISO alpha-2 → класс flag-icons (`fi fi-de`). */
export function endpointFlagCode(countryCode?: string | null): string | null {
  const code = countryCode?.trim().toLowerCase();
  if (!code || !/^[a-z]{2}$/.test(code)) return null;
  return code;
}

export function endpointFlagIconHtml(countryCode?: string | null): string | undefined {
  const code = endpointFlagCode(countryCode);
  if (!code) return undefined;
  return `<span class="fi fi-${code} uiv2-endpoint-flag" aria-hidden="true"></span>`;
}
