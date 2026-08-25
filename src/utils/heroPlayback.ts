import { isDubberBlacklisted, resolveEpisodeUrlWithRetry } from '../views/Watch/_utils';
import { buildScreenshotUrl, resolveCdnAssetUrl } from './posterUrl';

export interface HeroPlayback {
  releaseId: number;
  sourceId: number;
  dubberId: number;
  sourceName: string;
  playUrl: string;
  episodeUrl: string;
  iframe: boolean;
}

function isVoiceoverDub(d: { type?: number; name: string }): boolean {
  return !(d.type === 1 || /субтитр/i.test(d.name));
}

export function parseBannerReleaseId(banner: { type: number; action: string }): number | null {
  if (banner.type !== 1) return null;
  const id = parseInt(banner.action, 10);
  return id > 0 ? id : null;
}

export async function resolveHeroPlayback(releaseId: number): Promise<HeroPlayback | null> {
  const api = window.anixApi?.release;
  if (!api?.getDubbers || !api.getDubberSources || !api.getEpisode) return null;
  if (!Number.isFinite(releaseId) || releaseId <= 0) return null;

  try {
    const dubRes = await api.getDubbers(releaseId);
    const dubbers = (dubRes?.types ?? [])
      .filter((d) => isVoiceoverDub(d) && !isDubberBlacklisted(d.name))
      .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));

    for (const dub of dubbers) {
      let sources: Array<{ id: number; name: string }> = [];
      try {
        const srcRes = await api.getDubberSources(releaseId, dub.id);
        sources = srcRes?.sources ?? [];
      } catch {
        continue;
      }

      for (const src of sources) {
        for (const epNum of [1, 0]) {
          try {
            const epRes = await api.getEpisode(releaseId, src.id, epNum);
            const ep = epRes?.episode;
            if (!ep?.url) continue;

            const resolved = await resolveEpisodeUrlWithRetry(ep.url, ep.iframe);
            if (!resolved.useVideo || !resolved.playUrl) continue;

            return {
              releaseId,
              sourceId: src.id,
              dubberId: dub.id,
              sourceName: src.name,
              playUrl: resolved.playUrl,
              episodeUrl: ep.url,
              iframe: ep.iframe,
            };
          } catch {
            continue;
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

const backdropCache = new Map<number, string>();

export function getCachedHeroBackdrop(releaseId: number): string | undefined {
  return backdropCache.get(releaseId);
}

/** Backdrop for non-carousel contexts. Prefer release poster, then screenshots. */
export async function resolveHeroBackdrop(releaseId: number, fallback: string): Promise<string> {
  const cached = backdropCache.get(releaseId);
  if (cached) return cached;

  const api = window.anixApi?.release;
  if (!api?.info) {
    backdropCache.set(releaseId, fallback);
    return fallback;
  }

  try {
    const data = await api.info(releaseId, true);
    const release = data?.release as Record<string, unknown> | undefined;
    if (release) {
      const shots = (release.screenshot_images ?? release.screenshots) as string[] | undefined;
      if (shots?.length) {
        const idx = Math.min(shots.length - 1, Math.floor(Math.random() * Math.min(4, shots.length)));
        const shot = buildScreenshotUrl(shots[idx]);
        if (shot) {
          backdropCache.set(releaseId, shot);
          return shot;
        }
      }

      const poster = release.poster as Record<string, { url?: string }> | undefined;
      const posterRaw = poster?.original?.url ?? poster?.large?.url ?? poster?.medium?.url;
      if (posterRaw) {
        const url = resolveCdnAssetUrl(posterRaw);
        if (url) {
          backdropCache.set(releaseId, url);
          return url;
        }
      }
    }
  } catch {
    /* ignore */
  }

  backdropCache.set(releaseId, fallback);
  return fallback;
}
