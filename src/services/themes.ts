// ── Theme system ──────────────────────────────────────────────────────────────

export interface ThemeVars {
  colorBg:           string;
  colorSurface:      string;
  colorSurfaceHover: string;
  colorBorder:       string;
  colorText:         string;
  colorTextMuted:    string;
  colorAccent:       string;
  colorAccentHover:  string;
  fontFamily:        string;
}

export interface Theme {
  id:       string;
  name:     string;
  builtIn:  boolean;
  vars:     ThemeVars;
}

// ── Built-in themes ───────────────────────────────────────────────────────────

const FONT_DEFAULT = "'Segoe UI', system-ui, -apple-system, sans-serif";

/** Official dark theme vars (from the app design). */
const DARK_VARS: ThemeVars = {
  colorBg:           '#0d0d0d',
  colorSurface:      '#1a1a1a',
  colorSurfaceHover: '#121212',
  colorBorder:       '#212121',
  colorText:         '#c2c2c2',
  colorTextMuted:    '#8f8f8f',
  colorAccent:       '#e35454',
  colorAccentHover:  '#ec7e7e',
  fontFamily:        FONT_DEFAULT,
};

/** Official light theme vars (from the app design). */
const LIGHT_VARS: ThemeVars = {
  colorBg:           '#fafafa',
  colorSurface:      '#f0f0f0',
  colorSurfaceHover: '#ffffff',
  colorBorder:       '#d6d6d6',
  colorText:         '#383838',
  colorTextMuted:    '#808080',
  colorAccent:       '#e35454',
  colorAccentHover:  '#ec7e7e',
  fontFamily:        FONT_DEFAULT,
};

export const BUILT_IN_THEMES: Theme[] = [
  // ── Auto — delegates to Dark or Light depending on OS setting ────────────────
  {
    id: 'auto', name: 'Авто', builtIn: true,
    // vars here are used only as fallback for tile preview; actual apply is dynamic
    vars: DARK_VARS,
  },
  // ── Dark ────────────────────────────────────────────────────────────────────
  {
    id: 'dark', name: 'Тёмная', builtIn: true,
    vars: DARK_VARS,
  },
  // ── Light ───────────────────────────────────────────────────────────────────
  {
    id: 'light', name: 'Светлая', builtIn: true,
    vars: LIGHT_VARS,
  },
  // ── AMOLED ──────────────────────────────────────────────────────────────────
  {
    id: 'amoled', name: 'AMOLED', builtIn: true,
    vars: {
      colorBg:           '#000000',
      colorSurface:      '#080808',
      colorSurfaceHover: '#101010',
      colorBorder:       '#1c1c1c',
      colorText:         '#ffffff',
      colorTextMuted:    '#888888',
      colorAccent:       '#e35454',
      colorAccentHover:  '#ec7e7e',
      fontFamily:        FONT_DEFAULT,
    },
  },
];

// ── Storage keys ──────────────────────────────────────────────────────────────

const CUSTOM_THEMES_KEY = 'anixapp.customThemes';
const ACTIVE_THEME_KEY  = 'anixapp.activeTheme';

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function getCustomThemes(): Theme[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || '[]'); }
  catch { return []; }
}

export function saveCustomThemes(themes: Theme[]): void {
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
}

export function getAllThemes(): Theme[] {
  return [...BUILT_IN_THEMES, ...getCustomThemes()];
}

export function getThemeById(id: string): Theme | undefined {
  return getAllThemes().find(t => t.id === id);
}

export function getActiveThemeId(): string {
  return localStorage.getItem(ACTIVE_THEME_KEY) || 'auto';
}

export function setActiveThemeId(id: string): void {
  localStorage.setItem(ACTIVE_THEME_KEY, id);
}

export function createCustomTheme(basedOn?: Theme): Theme {
  // Base custom themes on dark, not auto (auto has no own vars)
  const base = basedOn ?? BUILT_IN_THEMES.find(t => t.id === 'dark') ?? BUILT_IN_THEMES[1];
  const theme: Theme = {
    id:      'custom-' + Date.now(),
    name:    'Безымянная',
    builtIn: false,
    vars:    { ...base.vars },
  };
  const themes = getCustomThemes();
  themes.push(theme);
  saveCustomThemes(themes);
  return theme;
}

export function updateCustomTheme(
  id: string,
  updates: Partial<{ name: string; vars: ThemeVars }>,
): void {
  const themes = getCustomThemes();
  const idx = themes.findIndex(t => t.id === id);
  if (idx < 0) return;
  if (updates.name !== undefined) themes[idx].name = updates.name;
  if (updates.vars !== undefined) themes[idx].vars = { ...themes[idx].vars, ...updates.vars };
  saveCustomThemes(themes);
  if (getActiveThemeId() === id) applyTheme(themes[idx]);
}

export function deleteCustomTheme(id: string): void {
  const themes = getCustomThemes().filter(t => t.id !== id);
  saveCustomThemes(themes);
  if (getActiveThemeId() === id) applyThemeById('auto');
}

// ── Auto theme resolution ──────────────────────────────────────────────────────

/** Returns the Dark or Light theme depending on the current OS preference. */
function resolveAutoTheme(): Theme {
  const prefersDark =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true;
  return BUILT_IN_THEMES.find(t => t.id === (prefersDark ? 'dark' : 'light'))!;
}

// ── Apply ─────────────────────────────────────────────────────────────────────

export function applyTheme(theme: Theme): void {
  // For 'auto', resolve the actual theme based on OS preference
  const effective = theme.id === 'auto' ? resolveAutoTheme() : theme;

  const root = document.documentElement;
  const v = effective.vars;
  root.style.setProperty('--color-bg',            v.colorBg);
  root.style.setProperty('--color-surface',       v.colorSurface);
  root.style.setProperty('--color-surface-hover', v.colorSurfaceHover);
  root.style.setProperty('--color-border',        v.colorBorder);
  root.style.setProperty('--color-text',          v.colorText);
  root.style.setProperty('--color-text-muted',    v.colorTextMuted);
  root.style.setProperty('--color-accent',        v.colorAccent);
  root.style.setProperty('--color-accent-hover',  v.colorAccentHover);
  root.style.setProperty('--font-sans',           v.fontFamily);

  // Save the user's chosen id (may be 'auto'), not the effective id
  setActiveThemeId(theme.id);
  window.dispatchEvent(new CustomEvent('anix:themeChanged', { detail: { theme } }));
}

export function applyThemeById(id: string): void {
  const theme = getThemeById(id) ?? BUILT_IN_THEMES[0]; // [0] = auto
  applyTheme(theme);
}

// ── Theme Seed ─────────────────────────────────────────────────────────────────

const SEED_PREFIX = 'AnixApp-TH';

/** Order of color keys packed into a seed. */
const SEED_KEYS: Array<keyof ThemeVars> = [
  'colorBg', 'colorSurface', 'colorSurfaceHover', 'colorBorder',
  'colorText', 'colorTextMuted', 'colorAccent', 'colorAccentHover',
];

/**
 * Known font CSS values in stable index order.
 * MUST stay in sync with ALL_CYRILLIC_FONTS.value order in theme-editor.ts.
 * Index 0xFF (255) = font not in list → not encoded.
 */
export const SEED_FONTS: readonly string[] = [
  // Системные
  "'Segoe UI', system-ui, -apple-system, sans-serif",
  'system-ui, -apple-system, sans-serif',
  'Arial, Helvetica, sans-serif',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  "'Calibri', sans-serif",
  "'Ubuntu', sans-serif",
  "'Noto Sans', sans-serif",
  // Без засечек
  "'Inter', sans-serif",
  "'Roboto', sans-serif",
  "'Open Sans', sans-serif",
  "'Lato', sans-serif",
  "'Montserrat', sans-serif",
  "'Source Sans 3', 'Source Sans Pro', sans-serif",
  "'Nunito', sans-serif",
  "'Nunito Sans', sans-serif",
  "'Raleway', sans-serif",
  "'Manrope', sans-serif",
  "'Rubik', sans-serif",
  "'Jost', sans-serif",
  "'Mulish', sans-serif",
  "'Quicksand', sans-serif",
  "'Overpass', sans-serif",
  "'Exo 2', sans-serif",
  "'Fira Sans', sans-serif",
  "'PT Sans', sans-serif",
  "'PT Sans Narrow', sans-serif",
  "'Cuprum', sans-serif",
  "'Oranienbaum', serif",
  // Дисплейные
  "'Russo One', sans-serif",
  "'Oswald', sans-serif",
  "'Exo', sans-serif",
  "'Comfortaa', sans-serif",
  "'Lobster', cursive",
  "'Pacifico', cursive",
  "'Neucha', cursive",
  "'Marck Script', cursive",
  "'Yeseva One', serif",
  // С засечками
  'Georgia, serif',
  "'Times New Roman', Times, serif",
  'Cambria, Georgia, serif',
  "'Palatino Linotype', Palatino, serif",
  "'Merriweather', serif",
  "'Playfair Display', serif",
  "'Lora', serif",
  "'EB Garamond', serif",
  "'Crimson Text', serif",
  "'Source Serif 4', 'Source Serif Pro', serif",
  "'Cormorant', serif",
  "'Spectral', serif",
  "'Vollkorn', serif",
  "'PT Serif', serif",
  "'Philosopher', serif",
  // Моноширинные
  'Consolas, monospace',
  "'Courier New', Courier, monospace",
  "'Cascadia Code', 'Cascadia Mono', monospace",
  "'JetBrains Mono', monospace",
  "'Fira Code', monospace",
  "'Source Code Pro', monospace",
  "'IBM Plex Mono', monospace",
  "'Hack', monospace",
  "'Roboto Mono', monospace",
  "'PT Mono', monospace",
];

const FONT_NONE = 0xFF; // font not in the known list → skip on import

/** Parsed data returned by parseThemeSeed. */
export interface ThemeSeedData {
  vars:      Partial<ThemeVars>;
  themeName?: string;
}

/**
 * Encodes colors + font (if known) + name into a shareable seed string.
 * Layout: [24 bytes colors] [1 byte font idx] [N bytes name UTF-8]
 * Name is capped at 64 UTF-8 bytes.
 */
export function generateThemeSeed(vars: ThemeVars, themeName?: string): string {
  const COLOR_BYTES = SEED_KEYS.length * 3; // 24
  const nameBytes   = themeName
    ? new TextEncoder().encode(themeName.slice(0, 64))
    : new Uint8Array(0);
  const bytes = new Uint8Array(COLOR_BYTES + 1 + nameBytes.length);

  SEED_KEYS.forEach((k, i) => {
    const clean = (vars[k] as string).replace('#', '').padEnd(6, '0');
    bytes[i * 3]     = parseInt(clean.slice(0, 2), 16) || 0;
    bytes[i * 3 + 1] = parseInt(clean.slice(2, 4), 16) || 0;
    bytes[i * 3 + 2] = parseInt(clean.slice(4, 6), 16) || 0;
  });

  const fontIdx = SEED_FONTS.indexOf(vars.fontFamily);
  bytes[COLOR_BYTES] = fontIdx >= 0 ? fontIdx : FONT_NONE;

  if (nameBytes.length > 0) bytes.set(nameBytes, COLOR_BYTES + 1);

  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${SEED_PREFIX}${b64}`;
}

/**
 * Decodes a seed string back into { vars, themeName? }.
 * Returns null if the seed is invalid.
 * Backward-compatible: 24-byte seeds (colors only) and 25-byte seeds (colors + font) are supported.
 */
export function parseThemeSeed(seed: string): ThemeSeedData | null {
  const s = seed.trim();
  if (!s.startsWith(SEED_PREFIX)) return null;
  const b64raw = s.slice(SEED_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64raw + '=='.slice(0, (4 - b64raw.length % 4) % 4);
  try {
    const binary = atob(padded);
    const COLOR_BYTES = SEED_KEYS.length * 3; // 24
    if (binary.length < COLOR_BYTES) return null;

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const toHex = (b: number) => b.toString(16).padStart(2, '0');
    const color  = (i: number) =>
      `#${toHex(bytes[i * 3])}${toHex(bytes[i * 3 + 1])}${toHex(bytes[i * 3 + 2])}`;

    const vars: Partial<ThemeVars> = Object.fromEntries(
      SEED_KEYS.map((k, i) => [k, color(i)])
    );

    // Byte 24: font index (present if length >= 25)
    if (binary.length >= COLOR_BYTES + 1) {
      const fontIdx = bytes[COLOR_BYTES];
      if (fontIdx !== FONT_NONE && fontIdx < SEED_FONTS.length) {
        vars.fontFamily = SEED_FONTS[fontIdx];
      }
    }

    // Bytes 25+: theme name UTF-8 (present if length >= 26)
    let themeName: string | undefined;
    if (binary.length > COLOR_BYTES + 1) {
      themeName = new TextDecoder().decode(bytes.slice(COLOR_BYTES + 1)) || undefined;
    }

    return { vars, themeName };
  } catch {
    return null;
  }
}

/** Call once at app startup to restore the saved theme. */
export function initTheme(): void {
  applyThemeById(getActiveThemeId());

  // When the OS switches dark ↔ light, re-apply if user chose auto
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getActiveThemeId() === 'auto') {
        applyThemeById('auto');
      }
    });
  }
}
