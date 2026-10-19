/**
 * Коллекция значков Anixart 10.5: редкость, «как получен», доля владельцев.
 * Тексты и правила — как в Android-приложении (BadgeRarityStyle, BadgeAwardsKt, ProfileBadgeModel).
 */
import type { ApiBadge, ApiBadgeCollection } from '../types/api';
import { resolveCdnAssetUrl } from './posterUrl';
import { NOTIFICATION_LIST_STATUSES } from './notification-preferences';

export type BadgeRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'UNKNOWN';

export const BADGE_RARITY_LABEL: Record<BadgeRarity, string> = {
  COMMON: 'Обычный',
  UNCOMMON: 'Необычный',
  RARE: 'Редкий',
  EPIC: 'Эпический',
  LEGENDARY: 'Легендарный',
  UNKNOWN: 'Редкость уточняется',
};

/** На витрине можно закрепить не больше 3 значков */
export const BADGE_SHOWCASE_LIMIT = 3;

export function badgeRarity(badge: Pick<ApiBadge, 'rarity'> | null | undefined): BadgeRarity {
  const r = String(badge?.rarity ?? '').trim().toUpperCase();
  return r in BADGE_RARITY_LABEL ? (r as BadgeRarity) : 'UNKNOWN';
}

/** Lottie (`.json`) или картинка; для сеток берём статичное превью, если оно есть. */
export function badgeImage(badge: ApiBadge, prefer: 'anim' | 'static' = 'anim'): string | null {
  const raw = badge;
  const candidates = prefer === 'static'
    ? [raw.image_medium_url, raw.image_preview_url, raw.image_small_url, raw.image_url]
    : [raw.image_url, raw.image_medium_url, raw.image_preview_url, raw.image_small_url];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return resolveCdnAssetUrl(c.trim()) || null;
  }
  return null;
}

/** «Есть у 0,36% пользователей» / «Есть менее чем у 0,01% пользователей» */
export function badgeOwnershipText(percent: number | null | undefined): string | null {
  if (percent == null || !Number.isFinite(percent)) return null;
  const lessThan = percent > 0 && percent < 0.01;
  const value = (lessThan ? 0.01 : percent).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return lessThan ? `Есть менее чем у ${value}% пользователей` : `Есть у ${value}% пользователей`;
}

export function badgeDate(ts: number | null | undefined): string {
  if (!ts) return '';
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function listStatusLabel(status: number | null | undefined): string {
  return NOTIFICATION_LIST_STATUSES.find((s) => s.id === status)?.label ?? '';
}

/** Подпись под значком в сетке (ProfileBadgeModel): серия/релиз, «По коду», «От команды» или дата */
export function badgeSubtitle(badge: ApiBadge): string {
  const award = badge.award;
  const detail = award?.episode_name?.trim() || award?.release_title?.trim();
  if (detail) return detail;
  if (award?.trigger === 'CLAIM_CODE') return 'По коду';
  if (award?.trigger === 'MANUAL') return 'От команды';
  return badgeDate(badge.timestamp);
}

export type BadgeAwardInfo = {
  title: string;
  detail: string;
  poster: string | null;
  releaseId: number | null;
  kind: 'episode' | 'list' | 'code' | 'manual' | 'release';
};

/** Карточка «За что получен» в листе значка */
export function badgeAwardInfo(badge: ApiBadge): BadgeAwardInfo | null {
  const award = badge.award;
  if (!award) return null;
  const releaseId = Number(award.release_id) > 0 ? Number(award.release_id) : null;
  const poster = award.release_image ? resolveCdnAssetUrl(award.release_image) || null : null;
  const releaseTitle = award.release_title?.trim() || '';
  switch (award.trigger) {
    case 'EPISODE_WATCHED':
      return {
        kind: 'episode',
        title: releaseTitle || 'Просмотр серии',
        detail: award.episode_name ? `Просмотр: ${award.episode_name}` : 'Просмотр серии',
        poster,
        releaseId,
      };
    case 'PROFILE_LIST_STATUS': {
      const status = listStatusLabel(award.profile_list_status);
      return {
        kind: 'list',
        title: releaseTitle || 'Добавление в список',
        detail: status ? `В списке «${status}»` : 'Добавление в список',
        poster,
        releaseId,
      };
    }
    case 'CLAIM_CODE':
      return { kind: 'code', title: 'Получен по коду или ссылке', detail: '', poster: null, releaseId: null };
    case 'MANUAL':
      return { kind: 'manual', title: 'Выдан командой Anixart', detail: '', poster: null, releaseId: null };
    default:
      return releaseId || releaseTitle
        ? { kind: 'release', title: releaseTitle || 'Обложка релиза', detail: '', poster, releaseId }
        : null;
  }
}

export type BadgeSectionView = {
  id: number;
  title: string;
  count: number;
  items: ApiBadge[];
};

export type BadgeCollectionView = {
  total: number;
  showcased: ApiBadge[];
  recent: ApiBadge[];
  sections: BadgeSectionView[];
  selectedId: number | null;
};

/** Нормализует ответ profile/{id}/badge/list: пустая категория (id 0) → «Прочие» в конце */
export function toBadgeCollectionView(res: ApiBadgeCollection | null | undefined): BadgeCollectionView {
  const sections = (res?.sections ?? [])
    .filter((s) => s && (Number(s.count) > 0 || (s.content?.length ?? 0) > 0))
    .map((s) => ({
      id: Number(s.id) || 0,
      title: s.title?.trim() || 'Прочие',
      count: Math.max(Number(s.count) || 0, s.content?.length ?? 0),
      items: (s.content ?? []).filter((b): b is ApiBadge => !!b && Number(b.id) > 0),
    }))
    .sort((a, b) => Number(a.id === 0) - Number(b.id === 0));

  const all = [...(res?.showcased ?? []), ...(res?.recent ?? []), ...sections.flatMap((s) => s.items)];
  const selected = all.find((b) => b?.is_selected) ?? res?.profile?.badge ?? null;

  return {
    total: Number(res?.total_count) || sections.reduce((n, s) => n + s.count, 0),
    showcased: (res?.showcased ?? []).filter((b): b is ApiBadge => !!b && Number(b.id) > 0),
    recent: (res?.recent ?? []).filter((b): b is ApiBadge => !!b && Number(b.id) > 0),
    sections,
    selectedId: selected ? Number(selected.id) || null : null,
  };
}

/** id недавно открытых значков — уходят в `?recent=` (как в приложении) */
const RECENT_KEY = 'anix:badge-recent';

export function readRecentBadgeIds(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.map(Number).filter((n) => n > 0).slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function rememberRecentBadge(id: number): void {
  try {
    const next = [id, ...readRecentBadgeIds().filter((x) => x !== id)].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* приватный режим */
  }
}
