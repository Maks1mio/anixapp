import { posterUrl } from '../_utils';
import { resolveJacksonEntity, resolveJacksonRefs, resolveJacksonPreviewList } from '../../../utils/jackson-refs';

function resolveProfileCommentsPreview(
  items: unknown[],
  root: Record<string, unknown>,
): Record<string, unknown>[] {
  return items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((comment) => ({
      ...comment,
      release: comment.release != null
        ? resolveJacksonEntity(comment.release, root) ?? comment.release
        : comment.release,
      collection: comment.collection != null
        ? resolveJacksonEntity(comment.collection, root) ?? comment.collection
        : comment.collection,
      article: comment.article != null
        ? resolveJacksonEntity(comment.article, root) ?? comment.article
        : comment.article,
    }));
}

export type ProfileLoadState = 'loading' | 'error' | 'ready';

export interface ProfilePageData {
  loadState: ProfileLoadState;
  errorMsg: string;
  profile: Record<string, unknown> | null;
  coverUrl: string | null;
  isMyProfile: boolean;
  friendsPreview: Record<string, unknown>[];
  hasFriendsMore: boolean;
  jacksonRoot: Record<string, unknown> | null;
}

export async function loadProfilePage(id?: number): Promise<ProfilePageData> {
  if (!window.anixApi) {
    return {
      loadState: 'error',
      errorMsg: 'API недоступно (только в Electron).',
      profile: null,
      coverUrl: null,
      isMyProfile: false,
      friendsPreview: [],
      hasFriendsMore: false,
      jacksonRoot: null,
    };
  }

  try {
    const profilePromise = id
      ? window.anixApi.profile.info(id)
      : window.anixApi.profile.self();

    const channelPromise = id
      ? (window.anixApi.channel?.getBlog
          ? window.anixApi.channel.getBlog(id).catch(() => null)
          : window.anixApi.channel?.info?.(id).catch(() => null) ?? Promise.resolve(null))
      : Promise.resolve(null);

    const [data, channelData] = await Promise.all([profilePromise, channelPromise]) as [
      Record<string, unknown>,
      Record<string, unknown> | null,
    ];

    if (data?.session_mismatch || !data?.profile) {
      return {
        loadState: 'error',
        errorMsg: data?.session_mismatch
          ? 'Профиль не совпадает с сессией.'
          : 'Не удалось загрузить профиль.',
        profile: null,
        coverUrl: null,
        isMyProfile: false,
        friendsPreview: [],
        hasFriendsMore: false,
        jacksonRoot: null,
      };
    }

    const resolved = resolveJacksonRefs(data);
    const profile = resolved.profile as Record<string, unknown>;
    const isMyProfile = !id || !!(data?.is_my_profile);

    const collectionCount = Number(profile.collection_count ?? 0);
    let collectionsPreview = Array.isArray(profile.collections_preview)
      ? resolveJacksonPreviewList<Record<string, unknown>>(profile.collections_preview, data)
      : [];

    if (collectionCount > 0 && collectionsPreview.length === 0 && window.anixApi?.collection?.profileCollections) {
      try {
        const colData = resolveJacksonRefs(
          await window.anixApi.collection.profileCollections(Number(profile.id), 0) as Record<string, unknown>,
        );
        const content = (colData?.content ?? []) as Record<string, unknown>[];
        if (content.length) {
          collectionsPreview = content.slice(0, Math.min(content.length, 12));
        }
      } catch {
        /* ignore */
      }
    }

    if (collectionsPreview.length) {
      profile.collections_preview = collectionsPreview;
    }

    if (Array.isArray(profile.comments_preview) && profile.comments_preview.length) {
      profile.comments_preview = resolveProfileCommentsPreview(profile.comments_preview, data);
    }

    const cover =
      (data?.blogInfo as { channel?: { cover?: string } } | undefined)?.channel?.cover
      || (data?.blog_info as { channel?: { cover?: string } } | undefined)?.channel?.cover
      || (data?.blog as { channel?: { cover?: string } } | undefined)?.channel?.cover
      || (channelData as { blogInfo?: { channel?: { cover?: string } } })?.blogInfo?.channel?.cover
      || (channelData as { channel?: { cover?: string } })?.channel?.cover
      || null;
    let coverUrl = cover ? posterUrl(cover) : null;

    let friendsPreview: Record<string, unknown>[] = [];
    let hasFriendsMore = false;

    const friendCount = Number(profile.friend_count ?? 0);
    if (friendCount > 0 && profile.id) {
      try {
        const fData = await window.anixApi.profile.getFriends(Number(profile.id), 0) as {
          content?: Record<string, unknown>[];
        };
        const friends = fData?.content ?? [];
        friendsPreview = friends.slice(0, 7);
        hasFriendsMore = friendCount > 7;
      } catch {
        /* ignore */
      }
    }

    return {
      loadState: 'ready',
      errorMsg: '',
      profile,
      coverUrl,
      isMyProfile,
      friendsPreview,
      hasFriendsMore,
      jacksonRoot: data,
    };
  } catch {
    return {
      loadState: 'error',
      errorMsg: 'Ошибка загрузки профиля.',
      profile: null,
      coverUrl: null,
      isMyProfile: false,
      friendsPreview: [],
      hasFriendsMore: false,
      jacksonRoot: null,
    };
  }
}

export function fetchCoverFallback(profileId: number, onCover: (url: string) => void): void {
  if (!window.anixApi?.channel) return;
  const blogFn = window.anixApi.channel.getBlog ?? window.anixApi.channel.info;
  if (!blogFn) return;
  blogFn.call(window.anixApi.channel, profileId)
    .then((ch: Record<string, unknown>) => {
      const fallback =
        (ch?.channel as { cover?: string } | undefined)?.cover
        || (ch?.blogInfo as { channel?: { cover?: string } } | undefined)?.channel?.cover
        || (ch?.blog_info as { channel?: { cover?: string } } | undefined)?.channel?.cover
        || null;
      if (fallback) onCover(posterUrl(fallback));
    })
    .catch(() => {});
}
