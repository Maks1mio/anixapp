import { resolveCdnAssetUrl } from '../../utils/posterUrl';
import { extractHistoryEpisodeInfo } from '../../utils/historyFormat';

function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Время просмотра из профиля Anixart.
 * API отдаёт `watched_time` в минутах (35524 → «24 дня 16 часов»).
 */
export function fmtWatchedTime(minutes: number): string {
  const totalMin = Math.max(0, Math.floor(Number(minutes) || 0));
  if (!totalMin) return '';

  const h = Math.floor(totalMin / 60);
  const d = Math.floor(h / 24);
  const remH = h % 24;
  const m = totalMin % 60;

  if (d >= 1) {
    const days = `${d} ${ruPlural(d, 'день', 'дня', 'дней')}`;
    if (remH <= 0) return days;
    return `${days} ${remH} ${ruPlural(remH, 'час', 'часа', 'часов')}`;
  }
  if (h >= 1) {
    const hours = `${h} ${ruPlural(h, 'час', 'часа', 'часов')}`;
    if (m <= 0) return hours;
    return `${hours} ${m} ${ruPlural(m, 'минута', 'минуты', 'минут')}`;
  }
  const mins = Math.max(1, m || totalMin);
  return `${mins} ${ruPlural(mins, 'минута', 'минуты', 'минут')}`;
}

/** Короткий формат; `watched_time` — минуты. */
export function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) {
    const rem = h % 24;
    return rem > 0 ? `${d} д. ${rem} ч.` : `${d} д.`;
  }
  const m = minutes % 60;
  return h > 0 ? `${h} ч. ${m} мин.` : `${m} мин.`;
}

export function fmtDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  const months = ['янв.','фев.','мар.','апр.','мая','июн.','июл.','авг.','сен.','окт.','ноя.','дек.'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtRelative(ts: number): string {
  if (!ts) return '';
  const ms   = ts < 1e12 ? ts * 1000 : ts;
  const diff = Date.now() - ms;
  const min  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (min < 1)   return 'только что';
  if (min < 60)  return `${min} мин. назад`;
  if (hours < 24) return `${hours} ч. назад`;
  if (days < 7)  return `${days} д. назад`;
  return fmtDate(ts);
}

export function posterUrl(raw: string | undefined): string {
  return resolveCdnAssetUrl(raw);
}

export { isLottieBadgeUrl } from '../../utils/badge';

/** «3 серия • 8 июн. в 17:31» для истории просмотра */
export function fmtHistoryEpisodeMeta(item: Record<string, unknown>): string {
  const ep = item.last_view_episode as { name?: string; position?: number } | undefined;
  const { episodeLabel } = extractHistoryEpisodeInfo(ep as Record<string, unknown> | undefined);
  const epLabel = episodeLabel ?? '';
  const ts = Number(item.last_view_timestamp ?? 0);
  if (!ts) return epLabel;

  const date = new Date(ts < 1e12 ? ts * 1000 : ts);
  const months = ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'нояб.', 'дек.'];
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const datePart = `${date.getDate()} ${months[date.getMonth()]} в ${time}`;
  return epLabel ? `${epLabel} • ${datePart}` : datePart;
}

/** «был(а) в сети 10 июн. в 01:40» */
export function fmtLastSeen(ts: number): string {
  if (!ts) return '';
  const date = new Date(ts < 1e12 ? ts * 1000 : ts);
  const months = ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'нояб.', 'дек.'];
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `был(а) в сети ${date.getDate()} ${months[date.getMonth()]} в ${time}`;
}

/** «14 сент. в 23:00» — дата окончания бана */
export function fmtBanUntil(ts: number): string {
  if (!ts) return '';
  const date = new Date(ts < 1e12 ? ts * 1000 : ts);
  const months = ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'нояб.', 'дек.'];
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()} ${months[date.getMonth()]} в ${time}`;
}

export type ProfileBanFields = {
  is_banned?: boolean;
  is_perm_banned?: boolean;
  ban_expires?: number | null;
  ban_reason?: string | null;
};

type ResolvedProfileBan =
  | { active: false }
  | {
      active: true;
      perm: boolean;
      reason: string;
      expiresRaw: number;
      expiresMs: number;
    };

function asBanFields(
  profile: ProfileBanFields | Record<string, unknown>,
): ProfileBanFields {
  return profile as ProfileBanFields;
}

function resolveProfileBan(
  profile: ProfileBanFields | Record<string, unknown> | null | undefined,
): ResolvedProfileBan {
  if (!profile) return { active: false };

  const p = asBanFields(profile);
  const perm = !!p.is_perm_banned;
  const expiresRaw = Number(p.ban_expires ?? 0);
  const expiresMs = expiresRaw > 0 ? (expiresRaw < 1e12 ? expiresRaw * 1000 : expiresRaw) : 0;
  const tempActive = expiresMs > Date.now();
  const flagged = !!p.is_banned || perm;

  if (!flagged && !tempActive) return { active: false };
  if (!perm && expiresMs > 0 && expiresMs <= Date.now() && !p.is_banned) return { active: false };

  const reason = String(p.ban_reason ?? '').trim() || 'нарушение правил';
  return { active: true, perm, reason, expiresRaw, expiresMs };
}

function fmtBanRemaining(expiresMs: number): string {
  const remaining = expiresMs - Date.now();
  if (remaining <= 0) return '';

  const min = Math.max(1, Math.floor(remaining / 60000));
  const hours = Math.floor(remaining / 3600000);
  const days = Math.floor(remaining / 86400000);

  if (days >= 1) return `ещё ${days} ${ruPlural(days, 'день', 'дня', 'дней')}`;
  if (hours >= 1) return `ещё ${hours} ${ruPlural(hours, 'час', 'часа', 'часов')}`;
  return `ещё ${min} ${ruPlural(min, 'минута', 'минуты', 'минут')}`;
}

export function isProfileBanned(
  profile: ProfileBanFields | Record<string, unknown> | null | undefined,
): boolean {
  return resolveProfileBan(profile).active;
}

/** Текст плашки бана или `null`, если пользователь не заблокирован. */
export function getProfileBanNotice(
  profile: ProfileBanFields | Record<string, unknown> | null | undefined,
): string | null {
  const ban = resolveProfileBan(profile);
  if (!ban.active) return null;

  if (ban.perm) {
    return `Пользователь был заблокирован навсегда за ${ban.reason}`;
  }

  const until = ban.expiresRaw > 0 ? fmtBanUntil(ban.expiresRaw) : '';
  if (until) {
    return `Пользователь был заблокирован за ${ban.reason} до ${until}`;
  }
  return `Пользователь был заблокирован за ${ban.reason}`;
}

/** Короткий срок бана для списков: «навсегда», «ещё 3 дня». */
export function getProfileBanDurationLabel(
  profile: ProfileBanFields | Record<string, unknown> | null | undefined,
): string | null {
  const ban = resolveProfileBan(profile);
  if (!ban.active) return null;
  if (ban.perm) return 'навсегда';

  const remaining = fmtBanRemaining(ban.expiresMs);
  if (remaining) return remaining;
  if (ban.expiresRaw > 0) {
    const until = fmtBanUntil(ban.expiresRaw);
    return until ? `до ${until}` : 'бан';
  }
  return 'навсегда';
}
