import { getApiBase, getAnixbackOrigin } from './anixback-endpoint';
import { getAdminToken, FOUNDER_ID } from './admin-api';
import type { AppReleaseInfo } from '../types/electron';

export interface UpdateInfo {
  version: string;
  url: string;
  body: string | null;
}

export type UpdateChannel = 'stable' | 'beta';
export type { AppReleaseInfo };

/** При ошибке (404, сеть, неверный JSON) возвращаем null — обновление не показываем. */
export async function checkForUpdate(
  currentVersion: string,
  opts?: { force?: boolean },
): Promise<UpdateInfo | null> {
  if (!window.electron?.checkForUpdate) return null;
  try {
    return await window.electron.checkForUpdate(currentVersion, !!opts?.force);
  } catch {
    return null;
  }
}

function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => String(v).replace(/^v/i, '').split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const l = x[i] ?? 0;
    const r = y[i] ?? 0;
    if (l > r) return true;
    if (l < r) return false;
  }
  return false;
}

/** Stable: GitHub anixapp (без prerelease). */
export async function listStableReleases(
  currentVersion?: string,
  opts?: { force?: boolean },
): Promise<AppReleaseInfo[]> {
  if (!window.electron?.listAppReleases) return [];
  try {
    const rows = await window.electron.listAppReleases(currentVersion, 'stable', !!opts?.force);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Beta: только Windows (.exe) с AnixBack. На других ОС канал недоступен. */
export function isBetaChannelSupported(): boolean {
  return typeof navigator !== 'undefined'
    && /Windows/i.test(navigator.userAgent || '');
}

type BetaApiRow = {
  id: string;
  version: string;
  platform?: string;
  fileName?: string;
  size?: number;
  notes?: string;
  publishedAt?: string;
  downloadPath?: string;
  filePath?: string;
};

/** Beta: сборки с AnixBack (только win / .exe). */
export async function listBetaReleases(currentVersion?: string): Promise<AppReleaseInfo[]> {
  if (!isBetaChannelSupported()) return [];

  const current = String(currentVersion ?? '').replace(/^v/i, '').trim();
  const origin = getAnixbackOrigin().replace(/\/$/, '');
  const out: AppReleaseInfo[] = [];

  try {
    const res = await fetch(`${getApiBase()}/app-updates/beta`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as { builds?: BetaApiRow[] };
      for (const b of data.builds ?? []) {
        const platform = String(b.platform ?? 'win').toLowerCase();
        if (platform !== 'win' && platform !== 'windows' && platform !== 'any') continue;
        const fileName = String(b.fileName ?? '');
        if (fileName && !/\.exe$/i.test(fileName)) continue;
        const version = String(b.version ?? '').replace(/^v/i, '');
        if (!version) continue;
        const downloadUrl = b.downloadPath
          ? `${origin}${b.downloadPath.startsWith('/') ? '' : '/'}${b.downloadPath}`
          : b.filePath
            ? `${origin}${b.filePath.startsWith('/') ? '' : '/'}${b.filePath}`
            : null;
        out.push({
          id: b.id,
          version,
          tag: `beta-${b.id}`,
          name: b.notes || `Beta ${version}`,
          publishedAt: b.publishedAt ?? null,
          prerelease: true,
          draft: false,
          url: downloadUrl || origin,
          hasAsset: !!downloadUrl,
          isCurrent: version === current,
          isNewer: current ? isNewer(version, current) : false,
          isOlder: current ? isNewer(current, version) : false,
          channel: 'beta',
          source: 'anixback',
          downloadUrl,
        });
      }
    }
  } catch {
    /* anixback offline */
  }

  return out.sort((a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')));
}

export async function listChannelReleases(
  channel: UpdateChannel,
  currentVersion?: string,
  opts?: { force?: boolean },
): Promise<AppReleaseInfo[]> {
  if (channel === 'beta') {
    if (!isBetaChannelSupported()) return [];
    return listBetaReleases(currentVersion);
  }
  return listStableReleases(currentVersion, opts);
}

export function isFounderProfile(): boolean {
  const profile = (window as unknown as { __anixProfile?: { id?: number } }).__anixProfile;
  const id = typeof profile?.id === 'number' ? profile.id : Number(profile?.id);
  return Number.isFinite(id) && id === FOUNDER_ID;
}

export async function uploadBetaBuild(input: {
  file: File;
  version: string;
  notes?: string;
}): Promise<BetaApiRow> {
  const token = getAdminToken();
  if (!token) throw new Error('Нужна разблокировка админ-режима (Основатель)');
  if (!isBetaChannelSupported()) {
    throw new Error('Бета-сборки доступны только на Windows');
  }
  const version = String(input.version || '').replace(/^v/i, '').trim();
  if (!version) throw new Error('Укажите версию');
  if (!/\.exe$/i.test(input.file.name || '')) {
    throw new Error('Загружайте только .exe установщик');
  }
  const qs = new URLSearchParams({
    version,
    filename: input.file.name || 'AnixApp-Setup.exe',
    notes: input.notes || '',
    platform: 'win',
  });
  const res = await fetch(`${getApiBase()}/admin/app-updates/beta?${qs}`, {
    method: 'POST',
    headers: {
      'X-Admin-Token': token,
      'Content-Type': 'application/octet-stream',
      'X-Update-Version': version,
      'X-Update-Filename': input.file.name || 'AnixApp-Setup.exe',
      'X-Update-Notes': input.notes || '',
      'X-Update-Platform': 'win',
    },
    body: input.file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'upload failed' }));
    throw new Error(String(err.error || 'upload failed'));
  }
  return res.json();
}

export async function deleteBetaBuild(id: string): Promise<void> {
  const token = getAdminToken();
  if (!token) throw new Error('Нужна разблокировка админ-режима');
  const res = await fetch(`${getApiBase()}/admin/app-updates/beta/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': token },
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: 'delete failed' }));
    throw new Error(String(err.error || 'delete failed'));
  }
}
