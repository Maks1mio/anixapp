/** Порог репутации для создания блога (как minBlogCreateRatingScore в Android). */

export const BLOG_CREATE_CODE = {
  ReputationLevelTooLow: 2,
  Banned: 402,
} as const;

export type BlogCreateGate = {
  ratingScore: number;
  minRatingScore: number;
  canCreate: boolean;
  /** Уже есть личный блог — «улучшать» повторно нельзя. */
  existingBlogChannelId: number | null;
};

function asInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function channelIdFromBlogPayload(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const o = raw as Record<string, unknown>;
  const direct = Number((o.channel as { id?: number } | undefined)?.id ?? 0);
  if (direct > 0) return direct;
  const nested = o.blogInfo as { channel?: { id?: number } } | undefined;
  return Number(nested?.channel?.id ?? 0);
}

/** Id личного блога текущего пользователя, если профиль уже улучшен. */
export async function findSelfBlogChannelId(
  knownManaged?: Array<{ id?: number; is_blog?: boolean } | null> | null,
): Promise<number | null> {
  const fromManaged = (knownManaged ?? [])
    .map((c) => (c?.is_blog && Number(c.id) > 0 ? Number(c.id) : 0))
    .find((id) => id > 0);
  if (fromManaged) return fromManaged;

  const api = window.anixApi;
  if (!api?.profile?.self || !api.channel?.getBlog) return null;
  try {
    const selfRes = await api.profile.self().catch(() => null) as {
      profile?: { id?: number };
    } | null;
    const profileId = Number(selfRes?.profile?.id ?? 0);
    if (!(profileId > 0)) return null;
    const blog = await api.channel.getBlog(profileId).catch(() => null);
    const id = channelIdFromBlogPayload(blog);
    return id > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function loadBlogCreateGate(
  knownManaged?: Array<{ id?: number; is_blog?: boolean } | null> | null,
): Promise<BlogCreateGate> {
  const api = window.anixApi;
  const [selfRes, togglesRes, existingBlogChannelId] = await Promise.all([
    api?.profile?.self?.().catch(() => null) as Promise<Record<string, unknown> | null>,
    api?.config?.toggles?.().catch(() => null) as Promise<Record<string, unknown> | null>,
    findSelfBlogChannelId(knownManaged),
  ]);

  const profile = (selfRes?.profile ?? null) as Record<string, unknown> | null;
  const ratingScore = asInt(profile?.rating_score ?? profile?.ratingScore, 0);
  const minRatingScore = asInt(
    togglesRes?.minBlogCreateRatingScore
      ?? togglesRes?.min_blog_create_rating_score,
    0,
  );

  return {
    ratingScore,
    minRatingScore,
    canCreate: existingBlogChannelId == null && ratingScore >= minRatingScore,
    existingBlogChannelId,
  };
}

export function blogCreateApiErrorMessage(code: number | undefined | null): string | null {
  if (code == null) return null;
  if (code === BLOG_CREATE_CODE.ReputationLevelTooLow) {
    return 'Ой, кажется, твой уровень репутации слишком низок.';
  }
  if (code === BLOG_CREATE_CODE.Banned) {
    return 'Вы не можете создать или редактировать блог в связи с нарушением правил. Подробную информацию вы можете найти на странице своего профиля.';
  }
  return null;
}

/** Деления прогресс-бара как в Android BlogCreateDialogFragment. */
export function blogCreateProgressMarks(minRatingScore: number): number[] {
  if (minRatingScore <= 1) return [];
  const last = minRatingScore - 1;
  if (last <= 12) {
    return Array.from({ length: last }, (_, i) => i + 1);
  }
  const step = Math.ceil(last / 12);
  const marks: number[] = [];
  for (let i = step; i < minRatingScore; i += step) {
    marks.push(i);
  }
  return marks;
}

export function blogCreateProgressPercent(ratingScore: number, minRatingScore: number): number {
  if (minRatingScore <= 0) return 100;
  const raw = Math.round((ratingScore / minRatingScore) * 100);
  return Math.max(10, Math.min(100, raw));
}
