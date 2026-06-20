/** Map Anixart country label (RU) → ISO 3166-1 alpha-2 for flag-icons. */
const COUNTRY_FLAG_CODES: Record<string, string> = {
  'Япония': 'jp',
  'Japan': 'jp',
  'Китай': 'cn',
  'China': 'cn',
  'Южная Корея': 'kr',
  'South Korea': 'kr',
  'Korea': 'kr',
  'США': 'us',
  'USA': 'us',
  'United States': 'us',
  'Тайвань': 'tw',
  'Taiwan': 'tw',
};

export function countryToFlagCode(country?: string | null): string | null {
  const raw = country?.trim();
  if (!raw) return null;
  const direct = COUNTRY_FLAG_CODES[raw];
  if (direct) return direct;
  const lower = raw.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_FLAG_CODES)) {
    if (name.toLowerCase() === lower) return code;
  }
  return null;
}
