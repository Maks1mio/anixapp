import { resolveCdnAssetUrl } from '../../utils/posterUrl';

export interface ReleaseVideoItem {
  id: number;
  title: string;
  image: string;
  url: string;
  player_url?: string;
  timestamp?: number;
  category?: { id: number; name: string };
  hosting?: { id: number; name: string; icon?: string };
  profile?: { login?: string; nickname?: string };
}

export interface ReleaseVideoBlockData {
  category: { id: number; name: string };
  videos: ReleaseVideoItem[];
}

export interface ReleaseStreamingPlatform {
  id: number;
  name: string;
  icon?: string;
  url: string;
}

export function normalizeMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  let normalized = trimmed;
  if (normalized.startsWith('//')) normalized = `https:${normalized}`;
  else if (normalized.startsWith('http://')) normalized = `https://${normalized.slice('http://'.length)}`;
  return resolveCdnAssetUrl(normalized);
}

export function normalizeVideo(raw: Record<string, unknown>): ReleaseVideoItem {
  const profile = raw.profile as Record<string, unknown> | undefined;
  const category = raw.category as Record<string, unknown> | undefined;
  const hosting = raw.hosting as Record<string, unknown> | undefined;
  return {
    id: Number(raw.id ?? 0),
    title: String(raw.title ?? ''),
    image: normalizeMediaUrl(String(raw.image ?? '')),
    url: String(raw.url ?? ''),
    player_url: raw.player_url != null ? String(raw.player_url) : undefined,
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : undefined,
    category: category?.id != null
      ? { id: Number(category.id), name: String(category.name ?? '') }
      : undefined,
    hosting: hosting?.id != null
      ? {
          id: Number(hosting.id),
          name: String(hosting.name ?? ''),
          icon: hosting.icon ? normalizeMediaUrl(String(hosting.icon)) : undefined,
        }
      : undefined,
    profile: profile
      ? { login: profile.login ? String(profile.login) : undefined, nickname: profile.nickname ? String(profile.nickname) : undefined }
      : undefined,
  };
}

export function normalizeVideoBlocks(raw: unknown): ReleaseVideoBlockData[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((block) => {
      const b = block as Record<string, unknown>;
      const category = b.category as Record<string, unknown> | undefined;
      const videos = Array.isArray(b.videos) ? b.videos : [];
      return {
        category: {
          id: Number(category?.id ?? 0),
          name: String(category?.name ?? ''),
        },
        videos: videos.map((v) => normalizeVideo(v as Record<string, unknown>)),
      };
    })
    .filter((b) => b.category.id > 0 && b.videos.length > 0);
}

export function normalizeStreamingPlatforms(raw: unknown): ReleaseStreamingPlatform[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const item = p as Record<string, unknown>;
      return {
        id: Number(item.id ?? 0),
        name: String(item.name ?? ''),
        icon: item.icon ? normalizeMediaUrl(String(item.icon)) : undefined,
        url: String(item.url ?? ''),
      };
    })
    .filter((p) => p.id > 0 && p.url);
}

export function videoEmbedUrl(video: ReleaseVideoItem): string {
  const raw = (video.player_url || video.url || '').trim();
  if (!raw) return '';

  const src = normalizeMediaUrl(raw);

  try {
    const u = new URL(src);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) {
        return u.toString();
      }
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes('rutube.ru') && u.pathname.startsWith('/play/embed/')) return u.toString();
    if (u.hostname.includes('rutube.ru') && u.pathname.startsWith('/video/')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://rutube.ru/play/embed/${id}`;
    }
    return u.toString();
  } catch { /* relative or invalid */ }

  return src;
}

export function formatVideoDate(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const months = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'нояб.', 'дек.'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]} в ${hh}:${mm}`;
}

export function videoAuthor(video: ReleaseVideoItem): string {
  return video.profile?.nickname || video.profile?.login || 'Anixart';
}
