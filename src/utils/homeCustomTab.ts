/** Mirrors Android `CustomFilter` entity (local SQLite on phone). */
export interface CustomFilterStorage {
  selected_category_id: number | null;
  selected_status_id: number | null;
  selected_start_year: number | null;
  selected_end_year: number | null;
  selected_studio: string;
  selected_source: string;
  selected_episodes: number | null;
  selected_sort: number;
  selected_country: string;
  selected_season: number | null;
  selected_episode_duration: number | null;
  selected_genres: string[];
  selected_profile_list_exclusions: string[];
  selected_types: string[];
  selected_age_ratings: string[];
  is_genres_exclude_mode_enabled: boolean;
}

export interface HomeCustomTabData {
  tabName: string;
  filter: CustomFilterStorage | null;
  activeTab: string | null;
}

export const DEFAULT_CUSTOM_FILTER: CustomFilterStorage = {
  selected_category_id: null,
  selected_status_id: null,
  selected_start_year: null,
  selected_end_year: null,
  selected_studio: '',
  selected_source: '',
  selected_episodes: null,
  selected_sort: 0,
  selected_country: '',
  selected_season: null,
  selected_episode_duration: null,
  selected_genres: [],
  selected_profile_list_exclusions: [],
  selected_types: [],
  selected_age_ratings: [],
  is_genres_exclude_mode_enabled: false,
};

const EMPTY_TAB: HomeCustomTabData = {
  tabName: '',
  filter: null,
  activeTab: null,
};

function homeApi() {
  return window.anixApi?.home;
}

export function isHomeCustomTabConfigured(data: HomeCustomTabData): boolean {
  return data.filter != null;
}

export function getMyTabLabel(data: HomeCustomTabData): string {
  const trimmed = data.tabName.trim();
  return trimmed || 'Моя вкладка';
}

export async function loadHomeCustomTab(): Promise<HomeCustomTabData> {
  const api = homeApi();
  if (!api) return { ...EMPTY_TAB };
  try {
    const data = await api.getCustomTab();
    if (!data || typeof data !== 'object') return { ...EMPTY_TAB };
    return {
      tabName: typeof data.tabName === 'string' ? data.tabName : '',
      filter: normalizeFilter(data.filter),
      activeTab: typeof data.activeTab === 'string' ? data.activeTab : null,
    };
  } catch {
    return { ...EMPTY_TAB };
  }
}

export async function saveHomeCustomTab(data: HomeCustomTabData): Promise<void> {
  const api = homeApi();
  if (!api) return;
  const payload = serializeHomeCustomTabData(data);
  await api.setCustomTab(payload);
  window.dispatchEvent(new CustomEvent('anix:homeCustomTabChanged'));
}

export async function setSavedHomeActiveTab(tabId: string): Promise<void> {
  const current = await loadHomeCustomTab();
  if (current.activeTab === tabId) return;
  await saveHomeCustomTab({ ...current, activeTab: tabId });
}

export async function setDefaultHomeTab(tabId: string): Promise<void> {
  const current = await loadHomeCustomTab();
  await saveHomeCustomTab({ ...current, activeTab: tabId });
}

export async function renameHomeCustomTab(name: string): Promise<void> {
  const current = await loadHomeCustomTab();
  await saveHomeCustomTab({ ...current, tabName: name.trim() });
}

function normalizeFilter(raw: unknown): CustomFilterStorage | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Partial<CustomFilterStorage>;
  return {
    ...DEFAULT_CUSTOM_FILTER,
    ...f,
    selected_studio: typeof f.selected_studio === 'string' ? f.selected_studio : '',
    selected_source: typeof f.selected_source === 'string' ? f.selected_source : '',
    selected_country: typeof f.selected_country === 'string' ? f.selected_country : '',
    selected_genres: Array.isArray(f.selected_genres) ? f.selected_genres.map(String) : [],
    selected_profile_list_exclusions: Array.isArray(f.selected_profile_list_exclusions)
      ? f.selected_profile_list_exclusions.map(String)
      : [],
    selected_types: Array.isArray(f.selected_types) ? f.selected_types.map(String) : [],
    selected_age_ratings: Array.isArray(f.selected_age_ratings) ? f.selected_age_ratings.map(String) : [],
    selected_sort: typeof f.selected_sort === 'number' ? f.selected_sort : 0,
    is_genres_exclude_mode_enabled: !!f.is_genres_exclude_mode_enabled,
  };
}

/** Plain JSON-safe copy for Electron IPC (Svelte $state proxies cannot be cloned). */
export function serializeHomeCustomTabData(data: HomeCustomTabData): HomeCustomTabData {
  return JSON.parse(JSON.stringify({
    tabName: typeof data.tabName === 'string' ? data.tabName : '',
    filter: data.filter ? normalizeFilter(data.filter) : null,
    activeTab: typeof data.activeTab === 'string' ? data.activeTab : null,
  })) as HomeCustomTabData;
}

/** Builds POST /filter/{page} body — same mapping as CustomFilterTabPresenter.java */
export function toFilterRequest(filter: CustomFilterStorage): Record<string, unknown> {
  const body: Record<string, unknown> = { sort: filter.selected_sort ?? 0 };

  if (filter.selected_category_id != null) body.category_id = filter.selected_category_id;
  if (filter.selected_status_id != null) body.status_id = filter.selected_status_id;
  if (filter.selected_start_year != null) body.start_year = filter.selected_start_year;
  if (filter.selected_end_year != null) body.end_year = filter.selected_end_year;
  if (filter.selected_season != null) body.season = filter.selected_season;

  if (filter.selected_studio.trim()) body.studio = filter.selected_studio.trim();
  if (filter.selected_source.trim()) body.source = filter.selected_source.trim();
  if (filter.selected_country.trim()) body.country = filter.selected_country.trim();

  const ep = filter.selected_episodes;
  if (ep === 1) {
    body.episodes_from = 1;
    body.episodes_to = 12;
  } else if (ep === 2) {
    body.episodes_from = 13;
    body.episodes_to = 25;
  } else if (ep === 3) {
    body.episodes_from = 26;
    body.episodes_to = 100;
  } else if (ep === 4) {
    body.episodes_from = 100;
  }

  const dur = filter.selected_episode_duration;
  if (dur === 1) {
    body.episode_duration_from = 1;
    body.episode_duration_to = 10;
  } else if (dur === 2) {
    body.episode_duration_from = 11;
    body.episode_duration_to = 30;
  } else if (dur === 3) {
    body.episode_duration_from = 31;
  }

  if (filter.selected_genres.length) body.genres = [...filter.selected_genres];

  const exclusions = filter.selected_profile_list_exclusions
    .map((v) => parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
  if (exclusions.length) body.profile_list_exclusions = exclusions;

  const types = filter.selected_types
    .map((v) => parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
  if (types.length) body.types = types;

  const ageRatings = filter.selected_age_ratings
    .map((v) => parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
  if (ageRatings.length) body.age_ratings = ageRatings;

  if (filter.is_genres_exclude_mode_enabled) body.is_genres_exclude_mode_enabled = true;

  return JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
}
