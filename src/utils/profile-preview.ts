import { resolveJacksonRefs } from './jackson-refs';
import { posterUrl } from '../views/Profile/_utils';

export interface ProfilePreviewData {
  profile: Record<string, unknown>;
  coverUrl: string | null;
  isMyProfile: boolean;
  selfProfileId: number;
}

const cache = new Map<number, { data: ProfilePreviewData; ts: number }>();
const TTL_MS = 60_000;

function resolveCover(
  data: Record<string, unknown>,
  channelData: Record<string, unknown> | null,
): string | null {
  const cover =
    (data?.blogInfo as { channel?: { cover?: string } } | undefined)?.channel?.cover
    || (data?.blog_info as { channel?: { cover?: string } } | undefined)?.channel?.cover
    || (data?.blog as { channel?: { cover?: string } } | undefined)?.channel?.cover
    || (channelData as { blogInfo?: { channel?: { cover?: string } } } | undefined)?.blogInfo?.channel?.cover
    || (channelData as { channel?: { cover?: string } } | undefined)?.channel?.cover
    || null;
  return cover ? posterUrl(cover) : null;
}

export async function loadProfilePreview(userId: number): Promise<ProfilePreviewData | null> {
  const selfId = Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0);
  const cacheKey = userId || selfId;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.data;
  if (!window.anixApi?.profile) return null;

  try {
    const channelFn = window.anixApi.channel?.getBlog ?? window.anixApi.channel?.info;
    const useSelf = !userId || (selfId > 0 && userId === selfId);
    const profilePromise = useSelf
      ? window.anixApi.profile.self()
      : window.anixApi.profile.info(userId);

    const [rawData, selfData, channelData] = await Promise.all([
      profilePromise,
      useSelf ? Promise.resolve(null) : window.anixApi.profile.self().catch(() => null),
      channelFn && (userId || selfId)
        ? channelFn.call(window.anixApi.channel, userId || selfId).catch(() => null)
        : Promise.resolve(null),
    ]) as [Record<string, unknown>, Record<string, unknown> | null, Record<string, unknown> | null];

    if (!rawData?.profile) return null;

    const data = resolveJacksonRefs(rawData);
    const profile = data.profile as Record<string, unknown>;
    const isMyProfile = !!(rawData.is_my_profile) || useSelf;
    const resolvedSelfId = Number((selfData?.profile as { id?: number } | undefined)?.id ?? selfId ?? profile.id ?? 0);
    const selfProfileId = isMyProfile
      ? Number(profile.id ?? 0)
      : resolvedSelfId;

    const result: ProfilePreviewData = {
      profile,
      coverUrl: resolveCover(data, channelData),
      isMyProfile,
      selfProfileId,
    };
    cache.set(Number(profile.id ?? cacheKey), { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

export function invalidateProfilePreview(userId?: number): void {
  if (userId != null) cache.delete(userId);
  else cache.clear();
}
