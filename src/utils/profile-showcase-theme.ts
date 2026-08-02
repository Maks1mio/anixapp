/**
 * Тема витрины профиля Anixart.
 * API отдаёт поля theme_* уже «разрешёнными» (auto → конкретный градиент).
 * id тем: 1 = Автоматически, 2 = Без темы (см. Theme.AUTO_THEME / NO_THEME_ID в APK).
 */

export type ProfileThemeFields = {
  theme_enabled?: boolean | null;
  theme_gradient_start_color?: string | null;
  theme_gradient_end_color?: string | null;
  theme_gradient_angle?: string | null;
  theme_background_url?: string | null;
  theme_background_mode?: string | null;
  theme_background_alpha?: number | null;
};

/** Android Color.parseColor: #AARRGGBB или #RRGGBB → css rgba/hex */
export function parseAnixColor(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s.startsWith('#')) return null;
  const hex = s.slice(1);
  if (hex.length === 6 && /^[0-9a-fA-F]+$/.test(hex)) {
    return `#${hex}`;
  }
  if (hex.length === 8 && /^[0-9a-fA-F]+$/.test(hex)) {
    const a = parseInt(hex.slice(0, 2), 16) / 255;
    const r = parseInt(hex.slice(2, 4), 16);
    const g = parseInt(hex.slice(4, 6), 16);
    const b = parseInt(hex.slice(6, 8), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
  }
  return null;
}

function gradientDirection(angle: string | null | undefined): string {
  const key = String(angle ?? 'top_to_bottom').toLowerCase();
  switch (key) {
    case 'left_to_right':
      return 'to right';
    case 'bottom_to_top':
      return 'to top';
    case 'diagonal_tl_br':
      return 'to bottom right';
    case 'diagonal_tr_bl':
      return 'to bottom left';
    case 'radial_from_center':
      return 'radial';
    case 'top_to_bottom':
    default:
      return 'to bottom';
  }
}

/**
 * CSS `background` для контейнера статистики (витрины).
 * null — тема выключена / нет данных.
 */
export function profileShowcaseBackground(
  profile: ProfileThemeFields,
  opts?: { backgroundUrlProxy?: (url: string) => string },
): string | null {
  if (!profile?.theme_enabled) return null;

  const start = parseAnixColor(profile.theme_gradient_start_color ?? undefined);
  const end = parseAnixColor(profile.theme_gradient_end_color ?? undefined) ?? 'rgba(0,0,0,0)';
  if (!start && !profile.theme_background_url) return null;

  const layers: string[] = [];
  const bgUrl = profile.theme_background_url
    ? (opts?.backgroundUrlProxy?.(String(profile.theme_background_url)) ?? String(profile.theme_background_url))
    : '';
  if (bgUrl) {
    const alpha = Number(profile.theme_background_alpha);
    const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
    const mode = String(profile.theme_background_mode ?? 'center_crop').toLowerCase();
    const size = mode === 'fit_xy' ? '100% 100%' : mode === 'tile' ? 'auto' : 'cover';
    const repeat = mode === 'tile' ? 'repeat' : 'no-repeat';
    layers.push(`linear-gradient(rgba(0,0,0,${1 - a}), rgba(0,0,0,${1 - a})), url('${bgUrl}') ${repeat} center / ${size}`);
  }

  if (start) {
    const dir = gradientDirection(profile.theme_gradient_angle);
    if (dir === 'radial') {
      layers.push(`radial-gradient(circle at center, ${start}, ${end})`);
    } else {
      layers.push(`linear-gradient(${dir}, ${start}, ${end})`);
    }
  }

  return layers.length ? layers.join(', ') : null;
}
