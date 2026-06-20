import { getAnixbackOrigin, getApiBase } from './anixback-endpoint';

export interface VideoSegment {
  start: number;
  end: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Montage overlap with the next clip, seconds */
  crossfadeAfter?: number;
}

export interface OverviewOverride {
  bannerId: number;
  releaseId: number | null;
  customBgUrl: string | null;
  customVideoUrl: string | null;
  segments: VideoSegment[];
}

export function resolveUploadUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${getAnixbackOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

let cache: OverviewOverride[] | null = null;
let inflight: Promise<OverviewOverride[]> | null = null;

export async function fetchOverviewOverrides(): Promise<OverviewOverride[]> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = fetch(`${getApiBase()}/overview/overrides`, { signal: AbortSignal.timeout(8000) })
    .then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      cache = Array.isArray(data) ? data : [];
      return cache;
    })
    .catch(() => [] as OverviewOverride[])
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function getOverrideForBanner(
  overrides: OverviewOverride[],
  bannerId: number
): OverviewOverride | null {
  return overrides.find((o) => o.bannerId === bannerId) ?? null;
}

export function invalidateOverviewOverridesCache(): void {
  cache = null;
}

export function segmentDuration(seg: VideoSegment): number {
  return Math.max(0, seg.end - seg.start);
}

export function junctionCrossfade(seg: VideoSegment, defaultSec = 0): number {
  if (seg.crossfadeAfter != null && Number.isFinite(seg.crossfadeAfter)) {
    return Math.max(0, seg.crossfadeAfter);
  }
  return Math.max(0, defaultSec);
}

export function maxJunctionCrossfade(seg: VideoSegment, next: VideoSegment): number {
  return Math.min(segmentDuration(seg) / 2, segmentDuration(next) / 2, 3);
}

export function segmentsTotalDuration(segments: VideoSegment[], defaultCrossfadeSec = 0): number {
  let total = 0;
  for (let i = 0; i < segments.length; i++) {
    total += segmentDuration(segments[i]!);
    if (i < segments.length - 1) {
      total -= junctionCrossfade(segments[i]!, defaultCrossfadeSec);
    }
  }
  return Math.max(0, total);
}
