'use strict';

const dns = require('dns').promises;

/** @type {Map<string, { countryCode: string | null, countryName: string | null, ip: string | null, ts: number }>} */
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const COUNTRY_NAME_RU = {
  DE: 'Германия',
  NL: 'Нидерланды',
  US: 'США',
  GB: 'Великобритания',
  FR: 'Франция',
  FI: 'Финляндия',
  SE: 'Швеция',
  PL: 'Польша',
  CZ: 'Чехия',
  LT: 'Литва',
  LV: 'Латвия',
  EE: 'Эстония',
  RU: 'Россия',
  UA: 'Украина',
  KZ: 'Казахстан',
  TR: 'Турция',
  SG: 'Сингапур',
  JP: 'Япония',
  HK: 'Гонконг',
  IE: 'Ирландия',
  CH: 'Швейцария',
  AT: 'Австрия',
  BE: 'Бельгия',
  BZ: 'Белиз',
  CA: 'Канада',
};

/**
 * Статический запас, если DNS/geo недоступны (VPN fake-IP и т.п.).
 * Должен совпадать с src/utils/endpointCountry.ts
 */
const STATIC_HOST_GEO = {
  'api.anixapp.com': { countryCode: 'DE', countryName: 'Германия' },
  'api-s.anixsekai.com': { countryCode: 'BZ', countryName: 'Белиз' },
  'api.anixart.app': { countryCode: 'BZ', countryName: 'Белиз' },
  'api.anixart.tv': { countryCode: 'BZ', countryName: 'Белиз' },
};

/** DoH по IP-литералу — не зависит от системного DNS (Clash fake-IP). */
const DOH_ENDPOINTS = [
  'https://1.1.1.1/dns-query',
  'https://8.8.8.8/resolve',
];

function isFakeOrPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  // Clash/TUN fake range 198.18.0.0/15
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function hostFromBaseUrl(baseUrl) {
  try {
    return new URL(String(baseUrl || '').trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function countryNameRu(code, fallback) {
  const upper = String(code || '').toUpperCase();
  return COUNTRY_NAME_RU[upper] || fallback || null;
}

async function lookupIpGeo(ip) {
  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,message`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`geo HTTP ${res.status}`);
  const data = await res.json();
  if (data?.status !== 'success' || !data.countryCode) {
    throw new Error(data?.message || 'geo failed');
  }
  return {
    countryCode: String(data.countryCode).toUpperCase(),
    countryName: countryNameRu(data.countryCode, data.country),
  };
}

async function resolveViaDoh(host) {
  for (const base of DOH_ENDPOINTS) {
    try {
      const url = `${base}?name=${encodeURIComponent(host)}&type=A`;
      const res = await fetch(url, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const answers = Array.isArray(data?.Answer) ? data.Answer : [];
      for (const row of answers) {
        if (row?.type === 1 && typeof row.data === 'string' && !isFakeOrPrivateIp(row.data)) {
          return row.data;
        }
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

async function resolvePublicIp(host) {
  try {
    const looked = await dns.lookup(host, { family: 4 });
    if (!isFakeOrPrivateIp(looked.address)) return looked.address;
  } catch {
    /* fall through */
  }
  return resolveViaDoh(host);
}

/**
 * @param {string} baseUrl
 * @returns {Promise<{ countryCode: string | null, countryName: string | null, ip: string | null }>}
 */
async function resolveEndpointGeo(baseUrl) {
  const host = hostFromBaseUrl(baseUrl);
  if (!host) return { countryCode: null, countryName: null, ip: null };

  const cached = cache.get(host);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return {
      countryCode: cached.countryCode,
      countryName: cached.countryName,
      ip: cached.ip,
    };
  }

  const staticHit = STATIC_HOST_GEO[host] || null;
  let ip = null;
  let countryCode = staticHit?.countryCode ?? null;
  let countryName = staticHit?.countryName ?? null;

  try {
    ip = await resolvePublicIp(host);
    if (ip && !isFakeOrPrivateIp(ip)) {
      const geo = await lookupIpGeo(ip);
      countryCode = geo.countryCode;
      countryName = geo.countryName;
    }
  } catch {
    // keep static / null
  }

  // Гарантируем флаг/страну для известных хостов даже при полном фейле geo
  if (!countryCode && staticHit) {
    countryCode = staticHit.countryCode;
    countryName = staticHit.countryName;
  }

  const entry = { countryCode, countryName, ip, ts: Date.now() };
  cache.set(host, entry);
  return { countryCode, countryName, ip };
}

module.exports = {
  resolveEndpointGeo,
  hostFromBaseUrl,
  isFakeOrPrivateIp,
  countryNameRu,
};
