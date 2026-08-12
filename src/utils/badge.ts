import { resolveJacksonEntity } from './jackson-refs';
import { resolveCdnAssetUrl } from './posterUrl';

export function isLottieBadgeUrl(url: string): boolean {
  return url.trim().toLowerCase().endsWith('.json');
}

/** Достаёт URL бейджа из строки или объекта `{ image_url }` / `{ imageUrl }`. */
export function resolveBadgeImageUrl(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const url = resolveCdnAssetUrl(raw.trim());
    return url || null;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const nested = o.image_url ?? o.imageUrl ?? o.url ?? o.badge_url ?? o.badgeUrl;
    if (typeof nested === 'string' && nested.trim()) {
      return resolveCdnAssetUrl(nested.trim()) || null;
    }
  }
  return null;
}

export function resolveBadgeName(raw: unknown): string {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const name = o.name ?? o.title ?? o.label;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return '';
}

/** Из профиля комментария / друга: badge | badge_url | badgeUrl */
export function resolveProfileBadgeUrl(
  profile: Record<string, unknown> | null | undefined,
  root?: unknown,
): string | null {
  if (!profile) return null;
  // badge может прийти как Jackson-ref `{ "@id": N }` — резолвим из корня ответа
  let badgeRaw: unknown = profile.badge;
  if (root != null && badgeRaw != null) {
    badgeRaw = resolveJacksonEntity(badgeRaw, root) ?? badgeRaw;
  } else if (badgeRaw && typeof badgeRaw === 'object' && !Array.isArray(badgeRaw)) {
    badgeRaw = resolveJacksonEntity(badgeRaw, profile) ?? badgeRaw;
  }
  return (
    resolveBadgeImageUrl(badgeRaw) ??
    resolveBadgeImageUrl(profile.badge_url) ??
    resolveBadgeImageUrl(profile.badgeUrl)
  );
}

export type BadgeCatalogEntry = {
  id: number;
  name: string;
  type: number;
  image_url: string;
};

const BADGE_CATALOG_KEY = 'anixapp.badge-catalog.v1';

/** Логины профилей, у которых можно подсмотреть превью редких значков по id. */
const BADGE_PREVIEW_HOLDERS: Record<number, string> = {
  21: 'tea2',
};

function readBadgeCatalog(): Record<number, BadgeCatalogEntry> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BADGE_CATALOG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, BadgeCatalogEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBadgeCatalog(catalog: Record<number, BadgeCatalogEntry>) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(BADGE_CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    /* ignore quota */
  }
}

/** Кэшируем метаданные значков, которые уже встречались в API/профилях. */
export function rememberBadgeCatalogEntries(entries: BadgeCatalogEntry[]) {
  if (!entries.length) return;
  const catalog = readBadgeCatalog();
  let changed = false;
  for (const entry of entries) {
    if (!entry.id || !entry.name || !entry.image_url) continue;
    catalog[entry.id] = entry;
    changed = true;
  }
  if (changed) writeBadgeCatalog(catalog);
}

function badgeFromProfileRow(row: Record<string, unknown>): BadgeCatalogEntry | null {
  const id = Number(row.badge_id ?? 0);
  if (!id) return null;
  const name = typeof row.badge_name === 'string' ? row.badge_name.trim() : '';
  const imageUrl = resolveBadgeImageUrl(row.badge_url) ?? '';
  if (!name || !imageUrl) return null;
  return {
    id,
    name,
    type: Number(row.badge_type ?? 0),
    image_url: imageUrl,
  };
}

/** Подтягивает превью для слотов без имени (только id) из кэша и поиска профилей. */
export async function enrichLockedBadgePreviews<
  T extends { id: number; name: string; type: number; image_url: string; available: boolean },
>(
  items: T[],
  searchProfiles?: (query: string, page?: number) => Promise<{ content?: unknown[] } | null | undefined>,
): Promise<T[]> {
  const locked = items.filter((item) => !item.available);
  if (!locked.length) return items;

  const catalog = readBadgeCatalog();
  const previews = new Map<number, BadgeCatalogEntry>();

  for (const item of locked) {
    const cached = catalog[item.id];
    if (cached?.name && cached.image_url) previews.set(item.id, cached);
  }

  if (searchProfiles) {
    const pending = locked
      .map((item) => item.id)
      .filter((id, index, all) => all.indexOf(id) === index && !previews.has(id));

    for (const id of pending) {
      const login = BADGE_PREVIEW_HOLDERS[id];
      if (!login) continue;
      try {
        const res = await searchProfiles(login, 0);
        const row = Array.isArray(res?.content) ? (res.content[0] as Record<string, unknown>) : null;
        if (!row) continue;
        const entry = badgeFromProfileRow(row);
        if (!entry || entry.id !== id) continue;
        previews.set(id, entry);
        rememberBadgeCatalogEntries([entry]);
      } catch {
        /* ignore */
      }
    }
  }

  if (!previews.size) return items;

  return items.map((item) => {
    if (item.available) return item;
    const preview = previews.get(item.id);
    if (!preview) return item;
    return {
      ...item,
      name: preview.name,
      image_url: preview.image_url,
      type: preview.type,
      available: false,
    };
  });
}
