import { getApiBase } from './anixback-endpoint';
import { compressImageForUpload } from '../utils/compressImage';
import type { VideoSegment } from './overview-overrides';
import {
  junctionCrossfade,
  maxJunctionCrossfade,
  segmentDuration,
  segmentsTotalDuration,
} from './overview-overrides';
export type { VideoSegment };
export { junctionCrossfade, maxJunctionCrossfade, segmentDuration, segmentsTotalDuration };

export interface OverviewOverrideAdmin {
  bannerId: number;
  releaseId: number | null;
  customBgUrl: string | null;
  customVideoUrl: string | null;
  sourceVideoUrl: string | null;
  segments: VideoSegment[];
  updatedAt?: string;
}

function adminHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Admin-Token': token,
  };
}

async function parseError(res: Response): Promise<Error> {
  const err = await res.json().catch(() => ({ error: 'request failed' }));
  const code = err.error ?? 'request failed';
  if (res.status === 413) {
    return new Error('Файл слишком большой. На сервере нужен nginx client_max_body_size 250m.');
  }
  return new Error(code);
}

export async function fetchAdminOverviewOverrides(token: string): Promise<OverviewOverrideAdmin[]> {
  const res = await fetch(`${getApiBase()}/admin/overview/overrides`, {
    headers: adminHeaders(token),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function saveOverviewSegments(
  token: string,
  bannerId: number,
  segments: VideoSegment[],
  releaseId?: number | null
): Promise<OverviewOverrideAdmin> {
  const res = await fetch(`${getApiBase()}/admin/overview/overrides/${bannerId}`, {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify({ segments, release_id: releaseId }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function uploadOverviewBackground(
  token: string,
  bannerId: number,
  file: File
): Promise<OverviewOverrideAdmin> {
  const prepared = await compressImageForUpload(file);
  const dataUrl = await fileToDataUrl(prepared);
  const res = await fetch(`${getApiBase()}/admin/overview/overrides/${bannerId}/bg`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ data_url: dataUrl }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function uploadOverviewSourceVideo(
  token: string,
  bannerId: number,
  file: File,
  onProgress?: (pct: number) => void
): Promise<OverviewOverrideAdmin> {
  onProgress?.(10);
  const dataUrl = await fileToDataUrl(file);
  onProgress?.(40);
  const res = await fetch(`${getApiBase()}/admin/overview/overrides/${bannerId}/source`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ data_url: dataUrl }),
  });
  onProgress?.(100);
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function uploadOverviewSourceFromUrl(
  token: string,
  bannerId: number,
  url: string
): Promise<OverviewOverrideAdmin> {
  const res = await fetch(`${getApiBase()}/admin/overview/overrides/${bannerId}/source-url`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function renderOverviewVideo(
  token: string,
  bannerId: number,
  segments: VideoSegment[],
  crossfade = 0.5
): Promise<OverviewOverrideAdmin> {
  const res = await fetch(`${getApiBase()}/admin/overview/overrides/${bannerId}/render`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ segments, crossfade }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function deleteOverviewOverride(token: string, bannerId: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/overview/overrides/${bannerId}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  });
  if (!res.ok && res.status !== 204) throw await parseError(res);
}

export async function deleteOverviewVideo(
  token: string,
  bannerId: number
): Promise<OverviewOverrideAdmin> {
  const res = await fetch(`${getApiBase()}/admin/overview/overrides/${bannerId}/video`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

export function formatTimeSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toFixed(1).padStart(m > 0 ? 4 : 3, '0')}`;
}

export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const m = Number(parts[0]);
    const s = Number(parts[1]);
    if (Number.isFinite(m) && Number.isFinite(s)) return m * 60 + s;
  }
  return null;
}
