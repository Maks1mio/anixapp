import { getApiBase, getAdminToken } from './admin-api';
import {
  getAnixbackEmbedOrigin,
  resolveAnixbackUploadUrl,
} from './anixback-endpoint';
import { cloneCrtStates, CRT_VPN_STATES_PRESET, type CrtScreenStates } from '../utils/crtScreen';
import {
  cloneStates,
  VPN_BANNER_STATES_PRESET,
  type VpnBannerStates,
} from '../utils/vpnSponsorBanner';
import {
  designLooksEmpty,
  designMissingCover,
  isDesignStates,
  legacyOverlayToDesign,
  sanitizeDesignStates,
  type AdDesignStates,
} from '../utils/adDesignDoc';
import { alignDesignPair, ensureCrtOnRoot, setCoverImage } from '../utils/adDesignMotion';
import { designHasCrt } from '../utils/composeAdDesign';

export type CrtAdVisual = {
  href?: string;
  width?: string;
  height?: string;
  aspectRatio?: string;
  imageUrl?: string | null;
  updatedAt?: string;
  crt: CrtScreenStates;
  overlay: VpnBannerStates;
  design?: AdDesignStates;
};

export type CrtAdCreative = CrtAdVisual & {
  id: string;
  title: string;
  slot: string;
  href: string;
  active: boolean;
  width: string;
  height: string;
  aspectRatio: string;
  imageUrl: string | null;
  design: AdDesignStates;
  createdAt: string;
  updatedAt: string;
};

export const AD_SLOT_OPTIONS = [
  { value: 'connection', label: 'Соединение' },
  { value: 'offline', label: 'Офлайн' },
  { value: 'uikit', label: 'UI-kit' },
] as const;

function designFromCreative(input: {
  overlay: VpnBannerStates;
  crt: CrtScreenStates;
  imageUrl?: string | null;
}): AdDesignStates {
  const rest = legacyOverlayToDesign(
    input.overlay.rest,
    input.imageUrl,
    640,
    440,
    input.crt.rest as unknown as Record<string, number | boolean | string>,
  );
  const hover = legacyOverlayToDesign(
    input.overlay.hover,
    input.imageUrl,
    640,
    440,
    input.crt.hover as unknown as Record<string, number | boolean | string>,
  );
  return alignDesignPair(rest, hover);
}

export { setCoverImage };

export function blankAdDraft(): Omit<CrtAdCreative, 'id' | 'createdAt' | 'updatedAt'> {
  const crt = cloneCrtStates(CRT_VPN_STATES_PRESET);
  const overlay = cloneStates(VPN_BANNER_STATES_PRESET);
  return {
    title: 'Новая реклама',
    slot: 'connection',
    href: '',
    active: true,
    width: '100%',
    height: 'auto',
    aspectRatio: '16 / 11',
    imageUrl: null,
    crt,
    overlay,
    design: designFromCreative({ overlay, crt, imageUrl: null }),
  };
}

/** Normalize API row → always has a usable design document matching CRT banner. */
export function ensureAdDesign(
  row: Partial<CrtAdCreative> & {
    overlay?: VpnBannerStates;
    crt?: CrtScreenStates;
    imageUrl?: string | null;
  },
  opts?: { force?: boolean },
): AdDesignStates {
  const overlay = row.overlay ?? VPN_BANNER_STATES_PRESET;
  const crt = row.crt ?? CRT_VPN_STATES_PRESET;
  const imageUrl = row.imageUrl ?? null;

  if (!opts?.force && isDesignStates(row.design)) {
    let current = alignDesignPair(
      sanitizeDesignStates(row.design).rest,
      sanitizeDesignStates(row.design).hover,
    );
    if (designLooksEmpty(current.rest)) {
      return designFromCreative({ overlay, crt, imageUrl });
    }
    if (imageUrl && designMissingCover(current.rest, imageUrl)) {
      current = setCoverImage(current, imageUrl);
    }
    if (!designHasCrt(current.rest)) {
      current = {
        rest: ensureCrtOnRoot(current.rest, crt.rest as unknown as Record<string, number | boolean | string>),
        hover: ensureCrtOnRoot(current.hover, crt.hover as unknown as Record<string, number | boolean | string>),
      };
    }
    return current;
  }

  return designFromCreative({ overlay, crt, imageUrl });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function adminHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Admin-Token': token,
  };
}

export function resolveAdImageUrl(url: string | null | undefined, stamp?: string | null): string {
  const value = String(url ?? '').trim();
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;
  return resolveAnixbackUploadUrl(url, stamp);
}

/**
 * Публичный плеер — корень AnixBack (не `/__anixback`), чтобы `/api` и `/ads-embed`
 * резолвились. Если localhost:8787 недоступен — prod (см. getAnixbackEmbedOrigin).
 */
export function adEmbedUrlById(id: string): string {
  return `${getAnixbackEmbedOrigin()}/embed/ads/${encodeURIComponent(id)}`;
}

export function adEmbedUrlBySlot(slot: string): string {
  return `${getAnixbackEmbedOrigin()}/embed/ads/slot/${encodeURIComponent(slot)}`;
}

export function adIframeSnippet(opts: { id?: string; slot?: string; width?: string; aspectRatio?: string }): string {
  const src = opts.id
    ? adEmbedUrlById(opts.id)
    : adEmbedUrlBySlot(opts.slot || 'connection');
  const w = opts.width || '100%';
  const ar = opts.aspectRatio || '16 / 11';
  return `<iframe src="${src}" style="width:${w};aspect-ratio:${ar};border:0;border-radius:14px;overflow:hidden;display:block" loading="lazy" referrerpolicy="no-referrer" title="Ad"></iframe>`;
}

export async function fetchAdEmbed(slot: string): Promise<CrtAdCreative | null> {
  const res = await fetch(`${getApiBase()}/ads/embed/${encodeURIComponent(slot)}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) throw new Error('failed to load ad');
  return res.json();
}

export async function fetchAds(token = getAdminToken()): Promise<CrtAdCreative[]> {
  if (!token) throw new Error('admin session required');
  const res = await fetch(`${getApiBase()}/admin/ads`, {
    headers: adminHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('failed to load ads');
  return res.json();
}

export async function createAd(
  input: Partial<CrtAdCreative>,
  token = getAdminToken(),
): Promise<CrtAdCreative> {
  if (!token) throw new Error('admin session required');
  const res = await fetch(`${getApiBase()}/admin/ads`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('failed to create ad');
  return res.json();
}

export async function updateAd(
  id: string,
  patch: Partial<CrtAdCreative>,
  token = getAdminToken(),
): Promise<CrtAdCreative> {
  if (!token) throw new Error('admin session required');
  const res = await fetch(`${getApiBase()}/admin/ads/${id}`, {
    method: 'PATCH',
    headers: adminHeaders(token),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('failed to update ad');
  return res.json();
}

export async function deleteAd(id: string, token = getAdminToken()): Promise<void> {
  if (!token) throw new Error('admin session required');
  const res = await fetch(`${getApiBase()}/admin/ads/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  });
  if (!res.ok && res.status !== 204) throw new Error('failed to delete ad');
}

export async function uploadAdImage(
  id: string,
  dataUrl: string,
  token = getAdminToken(),
): Promise<CrtAdCreative> {
  if (!token) throw new Error('admin session required');
  const put = await fetch(`${getApiBase()}/admin/ads/${id}/image`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ data_url: dataUrl }),
  });
  if (!put.ok) throw new Error('failed to upload image');
  return put.json();
}
