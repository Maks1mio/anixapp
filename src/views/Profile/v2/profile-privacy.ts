export interface ProfilePrivacyFlags {
  is_stats_hidden?: boolean;
  is_counts_hidden?: boolean;
  is_social_hidden?: boolean;
  is_me_blocked?: boolean;
}

export function isBlockedByProfile(
  profile: { is_me_blocked?: boolean } | null | undefined,
): boolean {
  return !!profile?.is_me_blocked;
}

export function hasProfilePrivacyRestrictions(
  profile: ProfilePrivacyFlags,
  isMyProfile: boolean,
): boolean {
  if (isMyProfile) return false;
  return !!(profile.is_stats_hidden || profile.is_counts_hidden || profile.is_social_hidden);
}

export const PROFILE_PRIVACY_NOTICE =
  'У пользователя установлены настройки приватности. Некоторая информация для Вас может быть недоступна.';

export const PROFILE_BLOCKED_BY_USER_NOTICE =
  'Пользователь внес Вас в свой блоклист. Вы не можете просматривать информацию этого профиля.';

export function hasStatsExtras(profile: Record<string, unknown>): boolean {
  return (
    (Array.isArray(profile.watch_dynamics) && profile.watch_dynamics.length > 0)
    || (Array.isArray(profile.history) && profile.history.length > 0)
  );
}
