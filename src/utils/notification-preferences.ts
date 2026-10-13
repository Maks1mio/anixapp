/** Profile list statuses used by episode notification filters (Android parity). */
export const NOTIFICATION_LIST_STATUSES = [
  { id: 0, label: 'Избранное' },
  { id: 1, label: 'Смотрю' },
  { id: 2, label: 'В планах' },
  { id: 3, label: 'Просмотрено' },
  { id: 4, label: 'Отложено' },
  { id: 5, label: 'Брошено' },
] as const;

export type EpisodeScopeMode = 'allLists' | 'selectedLists' | 'selectedReleases';

export type VoiceoverTypeOption = {
  id: number;
  name: string;
};

export type NotificationPrefsState = {
  is_episode_notifications_enabled: boolean;
  is_first_episode_notification_enabled: boolean;
  is_related_release_notifications_enabled: boolean;
  is_report_process_notifications_enabled: boolean;
  is_comment_notifications_enabled: boolean;
  is_my_collection_comment_notifications_enabled: boolean;
  is_article_notifications_enabled: boolean;
  is_my_article_comment_notifications_enabled: boolean;
  is_release_type_notifications_enabled: boolean;
  statusIds: number[];
  typeIds: number[];
};

const STATUS_NAME_TO_ID: Record<string, number> = {
  FAVORITE_STATUS: 0,
  STATUS_WATCHING: 1,
  STATUS_PLAN: 2,
  STATUS_COMPLETED: 3,
  STATUS_HOLD_ON: 4,
  STATUS_DROPPED: 5,
  // common aliases
  FAVORITE: 0,
  WATCHING: 1,
  PLAN: 2,
  PLANNED: 2,
  COMPLETED: 3,
  HOLD_ON: 4,
  ON_HOLD: 4,
  DROPPED: 5,
};

function asBool(v: unknown): boolean {
  return v === true || v === 1 || v === 'true';
}

function pickArray(data: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const v = data[key];
    if (Array.isArray(v)) return v;
  }
  return undefined;
}

function statusFromName(name: string): number | null {
  const key = name.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (key in STATUS_NAME_TO_ID) return STATUS_NAME_TO_ID[key];
  if (Number.isFinite(Number(name))) return Number(name);
  return null;
}

function statusValue(item: unknown): number | null {
  if (item == null) return null;
  if (typeof item === 'number' && Number.isFinite(item)) return item;
  if (typeof item === 'string') return statusFromName(item);
  if (typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    const status = rec.status ?? rec.value;
    if (typeof status === 'number' && Number.isFinite(status)) return status;
    if (typeof status === 'string') return statusFromName(status);
    if (status && typeof status === 'object') {
      const nested = status as { value?: unknown; name?: unknown };
      if (typeof nested.value === 'number') return nested.value;
      if (typeof nested.name === 'string') return statusFromName(nested.name);
    }
  }
  return null;
}

function typeIdValue(item: unknown): number | null {
  if (item == null) return null;
  if (typeof item === 'number' && Number.isFinite(item)) return item;
  if (typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    const type = rec.type ?? rec;
    if (typeof type === 'number') return type;
    if (type && typeof type === 'object') {
      const id = (type as { id?: unknown }).id;
      if (typeof id === 'number' && Number.isFinite(id)) return id;
      if (typeof id === 'string' && Number.isFinite(Number(id))) return Number(id);
    }
    if (typeof rec.id === 'number') return rec.id;
  }
  return null;
}

export function parseNotificationPrefs(raw: unknown): NotificationPrefsState {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  // Wire format is usually snake_case; tolerate camelCase from older clients/mappers.
  const statusesRaw = pickArray(
    data,
    'profile_status_notification_preferences',
    'profileStatusNotificationPreferences',
  );
  const typesRaw = pickArray(
    data,
    'profile_type_notification_preferences',
    'profileTypeNotificationPreferences',
  );
  const statusIds: number[] = [];
  const typeIds: number[] = [];

  if (Array.isArray(statusesRaw)) {
    for (const item of statusesRaw) {
      const v = statusValue(item);
      if (v != null && !statusIds.includes(v)) statusIds.push(v);
    }
  }
  if (Array.isArray(typesRaw)) {
    for (const item of typesRaw) {
      const v = typeIdValue(item);
      if (v != null && !typeIds.includes(v)) typeIds.push(v);
    }
  }

  return {
    is_episode_notifications_enabled: asBool(data.is_episode_notifications_enabled),
    is_first_episode_notification_enabled: asBool(data.is_first_episode_notification_enabled),
    is_related_release_notifications_enabled: asBool(data.is_related_release_notifications_enabled),
    is_report_process_notifications_enabled: asBool(data.is_report_process_notifications_enabled),
    is_comment_notifications_enabled: asBool(data.is_comment_notifications_enabled),
    is_my_collection_comment_notifications_enabled: asBool(
      data.is_my_collection_comment_notifications_enabled,
    ),
    is_article_notifications_enabled: asBool(data.is_article_notifications_enabled),
    is_my_article_comment_notifications_enabled: asBool(
      data.is_my_article_comment_notifications_enabled,
    ),
    is_release_type_notifications_enabled: asBool(data.is_release_type_notifications_enabled),
    statusIds: statusIds.sort((a, b) => a - b),
    typeIds: typeIds.sort((a, b) => a - b),
  };
}

export function episodeScopeMode(prefs: NotificationPrefsState): EpisodeScopeMode {
  if (prefs.is_release_type_notifications_enabled) return 'selectedReleases';
  if (prefs.statusIds.length >= NOTIFICATION_LIST_STATUSES.length) return 'allLists';
  return 'selectedLists';
}

export function statusLabels(ids: number[]): string {
  if (ids.length === 0) return 'Не выбрано';
  if (ids.length >= NOTIFICATION_LIST_STATUSES.length) return 'Из всех моих списков';
  return NOTIFICATION_LIST_STATUSES
    .filter((s) => ids.includes(s.id))
    .map((s) => s.label)
    .join(', ');
}

export function typeLabels(ids: number[], catalog: VoiceoverTypeOption[]): string {
  if (ids.length === 0) return 'Не выбрано';
  if (catalog.length > 0 && ids.length >= catalog.length) return 'От всех озвучек';
  const map = new Map(catalog.map((t) => [t.id, t.name]));
  const names = ids.map((id) => map.get(id) || String(id)).filter(Boolean);
  return names.length ? names.join(', ') : `${ids.length} озвуч.`;
}

export function parseVoiceoverCatalog(raw: unknown): VoiceoverTypeOption[] {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(data.types)
    ? data.types
    : Array.isArray(data.content)
      ? data.content
      : Array.isArray(raw)
        ? raw
        : [];
  const out: VoiceoverTypeOption[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { id?: unknown; name?: unknown };
    const id = typeof rec.id === 'number' ? rec.id : Number(rec.id);
    if (!Number.isFinite(id)) continue;
    const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : `Озвучка ${id}`;
    out.push({ id, name });
  }
  return out;
}

export function parseReleaseTypeIds(raw: unknown): number[] {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = pickArray(
    data,
    'profile_release_type_notification_preferences',
    'profileReleaseTypeNotificationPreferences',
  );
  const ids: number[] = [];
  if (!Array.isArray(list)) return ids;
  for (const item of list) {
    const v = typeIdValue(item);
    if (v != null && !ids.includes(v)) ids.push(v);
  }
  return ids.sort((a, b) => a - b);
}

export type ReleasePrefItem = {
  id: number;
  title: string;
  image: string;
  episodesReleased?: number | null;
  episodesTotal?: number | null;
  grade?: number | null;
  preferenceCount: number;
};

export function parseReleasePrefPage(raw: unknown): { items: ReleasePrefItem[]; lastPage: boolean } {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const content = Array.isArray(data.content)
    ? data.content
    : Array.isArray(data.releases)
      ? data.releases
      : [];
  const items: ReleasePrefItem[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'number' ? rec.id : Number(rec.id);
    if (!Number.isFinite(id)) continue;
    const title =
      (typeof rec.title_ru === 'string' && rec.title_ru) ||
      (typeof rec.title === 'string' && rec.title) ||
      `Релиз ${id}`;
    const image =
      (typeof rec.image === 'string' && rec.image) ||
      (typeof rec.poster === 'string' && rec.poster) ||
      '';
    items.push({
      id,
      title,
      image,
      episodesReleased: typeof rec.episodes_released === 'number' ? rec.episodes_released : null,
      episodesTotal: typeof rec.episodes_total === 'number' ? rec.episodes_total : null,
      grade: typeof rec.grade === 'number' ? rec.grade : null,
      preferenceCount:
        typeof rec.profile_release_type_notification_preference_count === 'number'
          ? rec.profile_release_type_notification_preference_count
          : 0,
    });
  }
  const lastPage = data.last_page === true || data.lastPage === true || content.length === 0;
  return { items, lastPage };
}
