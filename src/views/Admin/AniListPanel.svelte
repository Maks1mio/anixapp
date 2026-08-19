<script lang="ts">
  import { uiv2CustomScroll } from '../../actions/uiv2CustomScroll';
  import { portal } from '../../actions/portal';
  import { getApiBase } from '../../services/anixback-endpoint';
  import { getAdminToken } from '../../services/admin-api';
  import UiV2Select from '../../components/uikit-v2/UiV2Select.svelte';
  import UiV2OutlinedField from '../../components/uikit-v2/UiV2OutlinedField.svelte';
  import UiV2Tooltip from '../../components/uikit-v2/UiV2Tooltip.svelte';

  const ANILIST_URL = 'https://graphql.anilist.co';
  const JIKAN_URL = 'https://api.jikan.moe/v4';
  const KITSU_URL = 'https://kitsu.io/api/edge';

  /** Send a request via server-side proxy to avoid CORS / Electron sandbox. */
  async function proxyFetch(url: string, options: { method?: string; body?: string } = {}): Promise<Response> {
    const token = getAdminToken();
    return fetch(`${getApiBase()}/proxy/fetch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Admin-Token': token } : {}),
      },
      body: JSON.stringify({
        url,
        method: options.method ?? 'GET',
        body: options.body,
      }),
    });
  }

  type Preset = {
    id: string;
    label: string;
    group: string;
    // GraphQL mode
    query?: string;
    variables?: string;
    // REST mode
    api?: 'jikan' | 'kitsu';
    restPath?: string;      // e.g. "/anime/1/episodes" or Kitsu path
    restParams?: string;    // JSON object of query params
  };

  const PRESETS: Preset[] = [
    {
      id: 'media_by_id',
      group: 'Медиа',
      label: 'Аниме по ID',
      query: `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    status
    episodes
    duration
    averageScore
    popularity
    genres
    coverImage { large }
    description(asHtml: false)
    startDate { year month day }
  }
}`,
      variables: `{ "id": 1 }`,
    },
    {
      id: 'media_search',
      group: 'Медиа',
      label: 'Поиск аниме',
      query: `query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage }
    media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
      id
      title { romaji english }
      status
      episodes
      averageScore
      genres
    }
  }
}`,
      variables: `{ "search": "Attack on titan", "page": 1, "perPage": 5 }`,
    },
    {
      id: 'trending',
      group: 'Медиа',
      label: 'Трендовые аниме',
      query: `query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage hasNextPage }
    media(type: ANIME, sort: TRENDING_DESC, status: RELEASING) {
      id
      title { romaji english }
      trending
      popularity
      averageScore
      episodes
      nextAiringEpisode { episode airingAt }
    }
  }
}`,
      variables: `{ "page": 1, "perPage": 10 }`,
    },
    {
      id: 'seasonal',
      group: 'Медиа',
      label: 'Сезонные аниме',
      query: `query ($season: MediaSeason, $year: Int, $page: Int) {
  Page(page: $page, perPage: 10) {
    pageInfo { total hasNextPage }
    media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC) {
      id
      title { romaji english }
      coverImage { medium }
      genres
      averageScore
      status
      episodes
    }
  }
}`,
      variables: `{ "season": "SPRING", "year": 2025, "page": 1 }`,
    },
    {
      id: 'media_relations',
      group: 'Медиа',
      label: 'Связанные медиа',
      query: `query ($id: Int) {
  Media(id: $id) {
    id
    title { romaji }
    relations {
      edges {
        relationType
        node {
          id
          title { romaji english }
          type
          status
          averageScore
        }
      }
    }
  }
}`,
      variables: `{ "id": 1 }`,
    },
    {
      id: 'characters',
      group: 'Персонажи',
      label: 'Персонажи аниме',
      query: `query ($id: Int) {
  Media(id: $id) {
    title { romaji }
    characters(sort: ROLE, role: MAIN) {
      edges {
        role
        node {
          id
          name { full native }
          description(asHtml: false)
          image { medium }
          gender
          age
        }
        voiceActors(language: JAPANESE) {
          name { full native }
          image { medium }
        }
      }
    }
  }
}`,
      variables: `{ "id": 1 }`,
    },
    {
      id: 'character_by_id',
      group: 'Персонажи',
      label: 'Персонаж по ID',
      query: `query ($id: Int) {
  Character(id: $id) {
    id
    name { full native alternative }
    description(asHtml: false)
    gender
    age
    dateOfBirth { year month day }
    favourites
    media(sort: POPULARITY_DESC, perPage: 5) {
      nodes {
        id
        title { romaji }
        type
        averageScore
      }
    }
  }
}`,
      variables: `{ "id": 40 }`,
    },
    {
      id: 'staff_by_id',
      group: 'Персонал',
      label: 'Человек (staff) по ID',
      query: `query ($id: Int) {
  Staff(id: $id) {
    id
    name { full native }
    description(asHtml: false)
    primaryOccupations
    gender
    dateOfBirth { year month day }
    dateOfDeath { year month day }
    languageV2
    favourites
    staffMedia(sort: POPULARITY_DESC, perPage: 5) {
      nodes {
        id
        title { romaji }
        type
        averageScore
      }
    }
  }
}`,
      variables: `{ "id": 95185 }`,
    },
    {
      id: 'studio',
      group: 'Студии',
      label: 'Студия по ID',
      query: `query ($id: Int) {
  Studio(id: $id) {
    id
    name
    isAnimationStudio
    favourites
    media(sort: POPULARITY_DESC, perPage: 8) {
      nodes {
        id
        title { romaji english }
        averageScore
        popularity
        startDate { year }
      }
    }
  }
}`,
      variables: `{ "id": 1 }`,
    },
    {
      id: 'user_profile',
      group: 'Пользователи',
      label: 'Профиль пользователя',
      query: `query ($name: String) {
  User(name: $name) {
    id
    name
    about(asHtml: false)
    avatar { large }
    createdAt
    updatedAt
    statistics {
      anime {
        count
        meanScore
        minutesWatched
        episodesWatched
        genres(limit: 5, sort: COUNT_DESC) { genre count }
      }
    }
  }
}`,
      variables: `{ "name": "Josh" }`,
    },
    {
      id: 'user_list',
      group: 'Пользователи',
      label: 'Список аниме пользователя',
      query: `query ($userId: Int, $status: MediaListStatus) {
  MediaListCollection(userId: $userId, type: ANIME, status: $status) {
    lists {
      name
      status
      entries {
        id
        score
        progress
        updatedAt
        media {
          id
          title { romaji english }
          episodes
          averageScore
        }
      }
    }
  }
}`,
      variables: `{ "userId": 542244, "status": "CURRENT" }`,
    },
    {
      id: 'airing_schedule',
      group: 'Расписание',
      label: 'Расписание выхода',
      query: `query ($page: Int) {
  Page(page: $page, perPage: 10) {
    airingSchedules(sort: TIME, notYetAired: true) {
      id
      episode
      airingAt
      media {
        id
        title { romaji english }
        coverImage { medium }
      }
    }
  }
}`,
      variables: `{ "page": 1 }`,
    },
    {
      id: 'reviews',
      group: 'Отзывы',
      label: 'Отзывы на аниме',
      query: `query ($mediaId: Int) {
  Page(page: 1, perPage: 5) {
    reviews(mediaId: $mediaId, sort: RATING_DESC) {
      id
      summary
      score
      rating
      ratingAmount
      user { name }
      createdAt
    }
  }
}`,
      variables: `{ "mediaId": 1 }`,
    },
    {
      id: 'recommendations',
      group: 'Рекомендации',
      label: 'Рекомендации к аниме',
      query: `query ($mediaId: Int) {
  Media(id: $mediaId) {
    title { romaji }
    recommendations(sort: RATING_DESC, perPage: 8) {
      nodes {
        rating
        mediaRecommendation {
          id
          title { romaji english }
          averageScore
          popularity
          genres
        }
      }
    }
  }
}`,
      variables: `{ "mediaId": 1 }`,
    },
    {
      id: 'media_images',
      group: 'Изображения',
      label: 'Постер + фон тайтла',
      query: `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    coverImage {
      extraLarge
      large
      medium
      color
    }
    bannerImage
    description(asHtml: false)
    averageScore
    popularity
    status
    genres
    startDate { year month day }
  }
}`,
      variables: `{ "id": 1 }`,
    },
    {
      id: 'episodes_streaming',
      group: 'Изображения',
      label: 'Стриминг-эпизоды (Crunchyroll и др.)',
      query: `# ВНИМАНИЕ: streamingEpisodes — это данные от стриминг-сервисов.
# Они могут содержать только последние сезоны или быть неполными.
# Каждый сезон в AniList — отдельный Media объект.
# Используй запрос "Все сезоны + эпизоды" для полного списка.
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english }
    episodes
    streamingEpisodes {
      title
      thumbnail
      url
      site
    }
  }
}`,
      variables: `{ "id": 1 }`,
    },
    {
      id: 'episodes_all_seasons',
      group: 'Изображения',
      label: 'Все сезоны + эпизоды (правильный)',
      query: `# AniList хранит каждый сезон как отдельный Media.
# Этот запрос получает все связанные сезоны через relations.
# Для конкретного сезона используй его ID из поля relations.
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    episodes
    status
    season
    seasonYear
    streamingEpisodes {
      title
      thumbnail
      url
      site
    }
    relations {
      edges {
        relationType
        node {
          id
          title { romaji english }
          type
          format
          status
          episodes
          season
          seasonYear
          coverImage { medium }
          streamingEpisodes {
            title
            thumbnail
            url
            site
          }
        }
      }
    }
  }
}`,
      variables: `{ "id": 21 }`,
    },
    {
      id: 'airing_episodes',
      group: 'Изображения',
      label: 'Расписание эпизодов тайтла',
      query: `# Получаем расписание выхода эпизодов конкретного тайтла.
# airingAt — Unix timestamp даты выхода.
query ($mediaId: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { total hasNextPage }
    airingSchedules(mediaId: $mediaId, sort: EPISODE) {
      id
      episode
      airingAt
      timeUntilAiring
      media {
        id
        title { romaji english }
        episodes
        coverImage { medium }
      }
    }
  }
}`,
      variables: `{ "mediaId": 21, "page": 1 }`,
    },
    {
      id: 'media_full',
      group: 'Изображения',
      label: 'Полная инфо (постер + фон + эпизоды)',
      query: `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { romaji english native }
    coverImage {
      extraLarge
      large
      color
    }
    bannerImage
    description(asHtml: false)
    status
    episodes
    duration
    averageScore
    popularity
    genres
    studios(isMain: true) { nodes { id name } }
    streamingEpisodes {
      title
      thumbnail
      url
      site
    }
    characters(sort: ROLE, role: MAIN, perPage: 5) {
      edges {
        role
        node {
          name { full }
          image { medium }
        }
        voiceActors(language: JAPANESE) {
          name { full }
        }
      }
    }
    trailer { id site thumbnail }
    nextAiringEpisode { episode airingAt }
  }
}`,
      variables: `{ "id": 1 }`,
    },

    // ── Jikan (MAL) REST API ──────────────────────────────────────────────
    {
      id: 'jikan_anime',
      group: 'Jikan (MAL)',
      label: 'Аниме по MAL ID',
      api: 'jikan',
      restPath: '/anime/{id}',
      restParams: `{ "id": 1 }`,
    },
    {
      id: 'jikan_episodes',
      group: 'Jikan (MAL)',
      label: 'Эпизоды (все, с названиями)',
      api: 'jikan',
      restPath: '/anime/{id}/episodes',
      restParams: `{ "id": 1, "page": 1 }`,
    },
    {
      id: 'jikan_episodes_p2',
      group: 'Jikan (MAL)',
      label: 'Эпизоды (страница 2)',
      api: 'jikan',
      restPath: '/anime/{id}/episodes',
      restParams: `{ "id": 1, "page": 2 }`,
    },
    {
      id: 'jikan_characters',
      group: 'Jikan (MAL)',
      label: 'Персонажи + сэйю',
      api: 'jikan',
      restPath: '/anime/{id}/characters',
      restParams: `{ "id": 1 }`,
    },
    {
      id: 'jikan_staff',
      group: 'Jikan (MAL)',
      label: 'Staff (режиссёр и др.)',
      api: 'jikan',
      restPath: '/anime/{id}/staff',
      restParams: `{ "id": 1 }`,
    },
    {
      id: 'jikan_pictures',
      group: 'Jikan (MAL)',
      label: 'Картинки (постеры)',
      api: 'jikan',
      restPath: '/anime/{id}/pictures',
      restParams: `{ "id": 1 }`,
    },
    {
      id: 'jikan_videos',
      group: 'Jikan (MAL)',
      label: 'Трейлеры и видео',
      api: 'jikan',
      restPath: '/anime/{id}/videos',
      restParams: `{ "id": 1 }`,
    },
    {
      id: 'jikan_search',
      group: 'Jikan (MAL)',
      label: 'Поиск аниме',
      api: 'jikan',
      restPath: '/anime',
      restParams: `{ "q": "konosuba", "limit": 5 }`,
    },
    {
      id: 'jikan_seasons',
      group: 'Jikan (MAL)',
      label: 'Сезонные аниме',
      api: 'jikan',
      restPath: '/seasons/{year}/{season}',
      restParams: `{ "year": 2025, "season": "spring", "limit": 10 }`,
    },

    // ── Kitsu API (JSON:API, base: https://kitsu.io/api/edge) ─────────────
    // Konosuba s1 = 11681, s2 = 13881, s3 = 46941
    {
      id: 'kitsu_search',
      group: 'Kitsu',
      label: 'Поиск аниме',
      api: 'kitsu',
      restPath: '/anime',
      restParams: `{
  "filter[text]": "konosuba",
  "page[limit]": 5,
  "page[offset]": 0,
  "fields[anime]": "canonicalTitle,titles,posterImage,coverImage,status,episodeCount,episodeLength,averageRating,startDate,endDate,ageRating,subtype"
}`,
    },
    {
      id: 'kitsu_anime',
      group: 'Kitsu',
      label: 'Аниме по Kitsu ID',
      api: 'kitsu',
      restPath: '/anime/{id}',
      restParams: `{
  "id": "11681",
  "include": "categories,animeProductions.producer",
  "fields[anime]": "canonicalTitle,titles,synopsis,posterImage,coverImage,status,episodeCount,episodeLength,averageRating,startDate,endDate,ageRating,subtype,youtubeVideoId,nsfw"
}`,
    },
    {
      id: 'kitsu_episodes',
      group: 'Kitsu',
      label: 'Эпизоды (названия + превью)',
      api: 'kitsu',
      restPath: '/anime/{id}/episodes',
      restParams: `{
  "id": "11681",
  "page[limit]": 20,
  "page[offset]": 0,
  "sort": "number",
  "fields[episodes]": "canonicalTitle,titles,synopsis,thumbnail,number,airdate,length"
}`,
    },
    {
      id: 'kitsu_episodes_p2',
      group: 'Kitsu',
      label: 'Эпизоды (стр. 2)',
      api: 'kitsu',
      restPath: '/anime/{id}/episodes',
      restParams: `{
  "id": "11681",
  "page[limit]": 20,
  "page[offset]": 20,
  "sort": "number",
  "fields[episodes]": "canonicalTitle,titles,synopsis,thumbnail,number,airdate,length"
}`,
    },
    {
      id: 'kitsu_characters',
      group: 'Kitsu',
      label: 'Персонажи',
      api: 'kitsu',
      restPath: '/anime/{id}/characters',
      restParams: `{
  "id": "11681",
  "include": "character",
  "page[limit]": 20,
  "fields[animeCharacters]": "role",
  "fields[characters]": "canonicalName,names,image,description"
}`,
    },
    {
      id: 'kitsu_staff',
      group: 'Kitsu',
      label: 'Staff (режиссёр, студия)',
      api: 'kitsu',
      restPath: '/anime/{id}/staff',
      restParams: `{
  "id": "11681",
  "include": "person",
  "page[limit]": 20,
  "fields[animeStaff]": "role",
  "fields[people]": "name,names,image"
}`,
    },
    {
      id: 'kitsu_categories',
      group: 'Kitsu',
      label: 'Категории / жанры',
      api: 'kitsu',
      restPath: '/anime/{id}/categories',
      restParams: `{
  "id": "11681",
  "page[limit]": 20,
  "fields[categories]": "title,slug,nsfw,totalMediaCount"
}`,
    },
    {
      id: 'kitsu_streamlinks',
      group: 'Kitsu',
      label: 'Стриминг-сервисы',
      api: 'kitsu',
      restPath: '/anime/{id}/streaming-links',
      restParams: `{
  "id": "11681",
  "include": "streamer",
  "fields[streamingLinks]": "url,subs,dubs",
  "fields[streamers]": "siteName"
}`,
    },
    {
      id: 'kitsu_trending',
      group: 'Kitsu',
      label: 'Трендовые аниме',
      api: 'kitsu',
      restPath: '/trending/anime',
      restParams: `{
  "fields[anime]": "canonicalTitle,posterImage,averageRating,episodeCount,status,subtype"
}`,
    },
    {
      id: 'kitsu_seasonal',
      group: 'Kitsu',
      label: 'Сезонные (фильтр по году)',
      api: 'kitsu',
      restPath: '/anime',
      restParams: `{
  "filter[seasonYear]": "2025",
  "filter[season]": "spring",
  "filter[subtype]": "TV",
  "page[limit]": 10,
  "page[offset]": 0,
  "sort": "-averageRating",
  "fields[anime]": "canonicalTitle,posterImage,averageRating,episodeCount,status,startDate"
}`,
    },
  ];

  const siteOptions = [
    { value: 'all', label: 'Все сайты' },
    { value: 'anilist', label: 'AniList (GraphQL)' },
    { value: 'jikan', label: 'Jikan (REST)' },
    { value: 'kitsu', label: 'Kitsu (REST)' },
  ];

  function presetSite(p: Preset): string {
    if (p.api === 'jikan') return 'jikan';
    if (p.api === 'kitsu') return 'kitsu';
    return 'anilist';
  }

  const STORAGE_KEY = 'anixart_anilist_state';

  type SavedState = {
    selectedPreset: string;
    siteFilter: string;
    searchQuery: string;
    queryText: string;
    variablesText: string;
    result: unknown;
    resultError: string;
    resultMs: number;
  };

  function loadState(): SavedState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveState() {
    try {
      const s: SavedState = { selectedPreset, siteFilter, searchQuery, queryText, variablesText, result, resultError, resultMs };
      const serialized = JSON.stringify(s);
      // Don't save if result is too large (> 500 KB) — skip result only
      if (serialized.length > 500_000) {
        const slim: SavedState = {
          selectedPreset,
          siteFilter,
          searchQuery,
          queryText,
          variablesText,
          result: null,
          resultError,
          resultMs,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
      } else {
        localStorage.setItem(STORAGE_KEY, serialized);
      }
    } catch {}
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
    result = null;
    resultError = '';
    resultMs = 0;
    rateLimit = null;
  }

  const saved = loadState();

  function defaultsForPreset(id: string): { queryText: string; variablesText: string } {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return { queryText: '', variablesText: '{}' };
    if (p.api === 'jikan' || p.api === 'kitsu') {
      return { queryText: p.restPath ?? '', variablesText: p.restParams ?? '{}' };
    }
    return { queryText: p.query ?? '', variablesText: p.variables ?? '{}' };
  }

  const initPresetId = saved?.selectedPreset ?? 'media_by_id';
  const initSiteFilterRaw = saved?.siteFilter ?? 'all';
  const initDefaults = defaultsForPreset(initPresetId);
  const initPresetObj = PRESETS.find((p) => p.id === initPresetId);
  const initPresetSite = initPresetObj ? presetSite(initPresetObj) : 'anilist';
  const initSiteFilter = initSiteFilterRaw !== 'all' && initPresetSite !== initSiteFilterRaw ? 'all' : initSiteFilterRaw;

  let selectedPreset = $state<string>(initPresetId);
  let queryText = $state<string>(saved?.queryText || initDefaults.queryText);
  let variablesText = $state<string>(saved?.variablesText || initDefaults.variablesText);
  let siteFilter = $state<string>(initSiteFilter);
  let searchQuery = $state<string>(saved?.searchQuery ?? '');
  let running = $state(false);
  let result = $state<unknown>(saved?.result ?? null);
  let resultError = $state<string>(saved?.resultError ?? '');
  let resultMs = $state<number>(saved?.resultMs ?? 0);
  let showVars = $state(true);

  // Which preset is active (for mode detection in UI)
  const activePreset = $derived(PRESETS.find((p) => p.id === selectedPreset) ?? null);
  const isRestMode = $derived(activePreset?.api === 'jikan' || activePreset?.api === 'kitsu');
  const restApiLabel = $derived(
    activePreset?.api === 'kitsu' ? 'Kitsu REST'
    : activePreset?.api === 'jikan' ? 'Jikan REST'
    : 'GraphQL'
  );

  const visiblePresets = $derived(
    PRESETS.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      const siteOk = siteFilter === 'all' || presetSite(p) === siteFilter;
      const searchOk = !q || p.label.toLowerCase().includes(q) || p.group.toLowerCase().includes(q);
      return siteOk && searchOk;
    })
  );

  const visibleGroups = $derived([...new Set(visiblePresets.map((p) => p.group))]);

  // If user switches site filter, keep selection consistent
  $effect(() => {
    const vp = visiblePresets;
    if (!vp.some((p) => p.id === selectedPreset) && vp.length > 0) {
      pickPreset(vp[0].id);
    }
  });

  type RateLimit = {
    limit: number;
    remaining: number;
    rateLimited: boolean;
    retryAfter: number | null;
    resetAt: number | null;
  };
  let rateLimit = $state<RateLimit | null>(null);

  const rateLimitPct = $derived(
    rateLimit ? Math.round((rateLimit.remaining / rateLimit.limit) * 100) : 100
  );
  const rateLimitColor = $derived(
    rateLimit?.rateLimited
      ? '#f87171'
      : rateLimitPct <= 20
        ? '#fbbf24'
        : '#4ade80'
  );

  // Persist on every change
  $effect(() => {
    selectedPreset; siteFilter; searchQuery; queryText; variablesText; result; resultError; resultMs;
    saveState();
  });

  function pickPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    selectedPreset = id;
    if (p.api === 'jikan' || p.api === 'kitsu') {
      queryText = p.restPath ?? '';
      variablesText = p.restParams ?? '{}';
    } else {
      queryText = p.query ?? '';
      variablesText = p.variables ?? '{}';
    }
    result = null;
    resultError = '';
    resultMs = 0;
  }

  // Build REST URL from path template + params object
  function buildRestUrl(baseUrl: string, pathTpl: string, params: Record<string, unknown>): string {
    let path = pathTpl;
    const usedKeys = new Set<string>();
    path = path.replace(/\{(\w+)\}/g, (_, k) => {
      usedKeys.add(k);
      return String(params[k] ?? '');
    });
    const qs = Object.entries(params)
      .filter(([k]) => !usedKeys.has(k))
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    return `${baseUrl}${path}${qs ? '?' + qs : ''}`;
  }

  async function runQuery() {
    if (running) return;
    running = true;
    result = null;
    resultError = '';
    const t0 = performance.now();
    try {
      let params: Record<string, unknown> = {};
      try { params = JSON.parse(variablesText || '{}'); } catch {
        resultError = 'Ошибка парсинга параметров: невалидный JSON';
        running = false;
        return;
      }

      if (isRestMode) {
        // ── Jikan / Kitsu REST (via server proxy) ─────────────────────────
        const baseUrl = activePreset?.api === 'kitsu' ? KITSU_URL : JIKAN_URL;
        const url = buildRestUrl(baseUrl, queryText, params);
        const res = await proxyFetch(url);
        const json = await res.json();
        resultMs = Math.round(performance.now() - t0);
        if (res.status === 429) {
          resultError = '429 Too Many Requests — Jikan rate limit. Подождите 1 сек между запросами.';
          result = json;
        } else if (res.status === 502) {
          resultError = `Прокси-ошибка: ${(json as { error?: string }).error ?? 'неизвестная ошибка'}`;
          result = json;
        } else if (!res.ok) {
          resultError = `HTTP ${res.status}: ${(json as { message?: string }).message ?? res.statusText}`;
          result = json;
        } else {
          result = json;
        }
        rateLimit = null;
      } else {
        // ── AniList GraphQL (via server proxy) ───────────────────────────
        const res = await proxyFetch(ANILIST_URL, {
          method: 'POST',
          body: JSON.stringify({ query: queryText, variables: params }),
        });

        const rlLimit = Number(res.headers.get('X-RateLimit-Limit') ?? 90);
        const rlRemaining = Number(res.headers.get('X-RateLimit-Remaining') ?? rlLimit);
        const retryAfterRaw = res.headers.get('Retry-After');
        const resetRaw = res.headers.get('X-RateLimit-Reset');
        rateLimit = {
          limit: rlLimit,
          remaining: res.status === 429 ? 0 : rlRemaining,
          rateLimited: res.status === 429,
          retryAfter: retryAfterRaw ? Number(retryAfterRaw) : null,
          resetAt: resetRaw ? Number(resetRaw) * 1000 : null,
        };

        const json = await res.json();
        resultMs = Math.round(performance.now() - t0);
        if (res.status === 429) {
          const retryMsg = rateLimit.retryAfter
            ? ` Повторить через ${rateLimit.retryAfter} сек.`
            : '';
          resultError = `429 Too Many Requests — превышен лимит запросов.${retryMsg}`;
          result = json;
        } else if (json.errors) {
          resultError = json.errors.map((e: { message: string }) => e.message).join('\n');
          result = json;
        } else {
          result = json;
        }
      }
    } catch (e) {
      resultMs = Math.round(performance.now() - t0);
      resultError = e instanceof Error ? e.message : 'Неизвестная ошибка';
    } finally {
      running = false;
    }
  }

  function formatJson(v: unknown): string {
    return JSON.stringify(v, null, 2);
  }

  function copyResult() {
    if (result) navigator.clipboard.writeText(formatJson(result));
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
  }

  function openExternal(url: string) {
    if (window.electron?.shell?.openExternal) {
      window.electron.shell.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|avif|svg)(\?.*)?$/i;
  const URL_RE = /^https?:\/\//i;

  function isImageUrl(s: string): boolean {
    return URL_RE.test(s) && IMAGE_EXTS.test(s.split('?')[0]);
  }

  function isUrl(s: string): boolean {
    return URL_RE.test(s);
  }

  const PREVIEW_OFFSET = 16;
  const PREVIEW_EDGE = 10;
  const PREVIEW_LABEL_H = 22;

  let previewUrl = $state<string | null>(null);
  let previewX = $state(0);
  let previewY = $state(0);
  let previewNatW = $state(0);
  let previewNatH = $state(0);
  let viewportW = $state(typeof window !== 'undefined' ? window.innerWidth : 1200);
  let viewportH = $state(typeof window !== 'undefined' ? window.innerHeight : 800);

  function syncViewport() {
    viewportW = window.innerWidth;
    viewportH = window.innerHeight;
  }

  const previewMaxW = $derived(Math.max(180, Math.min(760, viewportW - 48)));
  const previewMaxH = $derived(Math.max(120, Math.min(680, viewportH - 72)));
  const previewScale = $derived(
    previewNatW > 0 && previewNatH > 0
      ? Math.min(1, previewMaxW / previewNatW, previewMaxH / previewNatH)
      : 0
  );
  const previewDispW = $derived(Math.max(1, Math.round(previewNatW * previewScale)));
  const previewDispH = $derived(Math.max(1, Math.round(previewNatH * previewScale)));
  const previewReady = $derived(previewScale > 0);
  const previewBoxH = $derived(previewDispH + PREVIEW_LABEL_H);

  const previewLeft = $derived((() => {
    const preferRight = previewX + PREVIEW_OFFSET + previewDispW <= viewportW - PREVIEW_EDGE;
    let left = preferRight
      ? previewX + PREVIEW_OFFSET
      : previewX - PREVIEW_OFFSET - previewDispW;
    return Math.max(PREVIEW_EDGE, Math.min(left, viewportW - PREVIEW_EDGE - previewDispW));
  })());
  const previewTop = $derived((() => {
    const preferBelow = previewY + PREVIEW_OFFSET + previewBoxH <= viewportH - PREVIEW_EDGE;
    let top = preferBelow
      ? previewY + PREVIEW_OFFSET
      : previewY - PREVIEW_OFFSET - previewBoxH;
    return Math.max(PREVIEW_EDGE, Math.min(top, viewportH - PREVIEW_EDGE - previewBoxH));
  })());

  function showPreview(e: MouseEvent, url: string) {
    previewX = e.clientX;
    previewY = e.clientY;
    if (previewUrl === url) return;
    previewUrl = url;
    previewNatW = 0;
    previewNatH = 0;
    const probe = new Image();
    probe.onload = () => {
      if (previewUrl !== url) return;
      previewNatW = probe.naturalWidth;
      previewNatH = probe.naturalHeight;
    };
    probe.src = url;
  }

  function movePreview(e: MouseEvent) {
    previewX = e.clientX;
    previewY = e.clientY;
  }

  function hidePreview() {
    previewUrl = null;
    previewNatW = 0;
    previewNatH = 0;
  }

  // Render JSON as token list for the template
  type JsonToken =
    | { kind: 'syntax'; text: string }
    | { kind: 'key'; text: string }
    | { kind: 'string'; value: string; isUrl: boolean; isImage: boolean }
    | { kind: 'number'; text: string }
    | { kind: 'bool'; text: string }
    | { kind: 'null' }
    | { kind: 'newline'; indent: number };

  function tokenizeJson(v: unknown, indent = 0): JsonToken[] {
    const tokens: JsonToken[] = [];
    const I = '  ';

    function walk(val: unknown, depth: number) {
      if (val === null) { tokens.push({ kind: 'null' }); return; }
      if (typeof val === 'boolean') { tokens.push({ kind: 'bool', text: String(val) }); return; }
      if (typeof val === 'number') { tokens.push({ kind: 'number', text: String(val) }); return; }
      if (typeof val === 'string') {
        const img = isImageUrl(val);
        const url = isUrl(val);
        tokens.push({ kind: 'string', value: val, isUrl: url, isImage: img });
        return;
      }
      if (Array.isArray(val)) {
        if (val.length === 0) { tokens.push({ kind: 'syntax', text: '[]' }); return; }
        tokens.push({ kind: 'syntax', text: '[' });
        val.forEach((item, i) => {
          tokens.push({ kind: 'newline', indent: depth + 1 });
          walk(item, depth + 1);
          if (i < val.length - 1) tokens.push({ kind: 'syntax', text: ',' });
        });
        tokens.push({ kind: 'newline', indent: depth });
        tokens.push({ kind: 'syntax', text: ']' });
        return;
      }
      if (typeof val === 'object') {
        const entries = Object.entries(val as Record<string, unknown>);
        if (entries.length === 0) { tokens.push({ kind: 'syntax', text: '{}' }); return; }
        tokens.push({ kind: 'syntax', text: '{' });
        entries.forEach(([k, v2], i) => {
          tokens.push({ kind: 'newline', indent: depth + 1 });
          tokens.push({ kind: 'key', text: JSON.stringify(k) });
          tokens.push({ kind: 'syntax', text: ': ' });
          walk(v2, depth + 1);
          if (i < entries.length - 1) tokens.push({ kind: 'syntax', text: ',' });
        });
        tokens.push({ kind: 'newline', indent: depth });
        tokens.push({ kind: 'syntax', text: '}' });
        return;
      }
      tokens.push({ kind: 'syntax', text: String(val) });
    }

    walk(v, indent);
    return tokens;
  }

  const resultTokens = $derived(result ? tokenizeJson(result) : []);
</script>

<svelte:window onresize={syncViewport} />

<div class="al-root">
  <!-- Left: preset list -->
  <aside class="al-sidebar">
    <div class="al-sidebar__head">
      <span class="al-sidebar__title">Anime API's</span>
      <a class="al-sidebar__link" href="https://docs.anilist.co" target="_blank" rel="noreferrer">Docs ↗</a>
    </div>

    <div class="al-sidebar__filters">
      <UiV2Select
        label="API сайт"
        placeholder="Все сайты"
        options={siteOptions.map((o) => ({ value: o.value, label: o.label }))}
        value={siteFilter}
        onChange={(v) => (siteFilter = v)}
      />
      <div class="al-search-wrap">
        <UiV2OutlinedField
          label="Поиск запроса"
          type="search"
          bind:value={searchQuery}
          spellcheck={false}
        />
        {#if searchQuery}
          <button
            type="button"
            class="al-search-clear"
            aria-label="Очистить поиск"
            onclick={() => (searchQuery = '')}
          >✕</button>
        {/if}
      </div>
    </div>

    <div class="al-presets uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
      <div class="al-presets__vp uiv2-scroll-area__viewport">
        {#if visiblePresets.length === 0}
          <div class="al-empty">Ничего не найдено</div>
        {:else}
          {#each visibleGroups as group}
            <div class="al-group">
              <p class="al-group__label">{group}</p>
              {#each visiblePresets.filter((p) => p.group === group) as preset}
                <button
                  type="button"
                  class="al-preset-item"
                  class:al-preset-item--active={selectedPreset === preset.id}
                  onclick={() => pickPreset(preset.id)}
                >
                  {preset.label}
                </button>
              {/each}
            </div>
          {/each}
        {/if}
      </div>
      <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
    </div>
  </aside>

  <!-- Right: editor + result -->
  <div class="al-main">
    <!-- Query editor -->
    <div class="al-editor">
      <div class="al-editor__head">
        <div class="al-editor__label-group">
          {#if isRestMode}
            <span class="al-editor__api-badge"
              class:al-editor__api-badge--rest={activePreset?.api === 'jikan'}
              class:al-editor__api-badge--kitsu={activePreset?.api === 'kitsu'}
            >{restApiLabel}</span>
            <span class="al-editor__label">URL путь</span>
          {:else}
            <span class="al-editor__api-badge al-editor__api-badge--gql">GraphQL</span>
            <span class="al-editor__label">Запрос</span>
          {/if}
          <UiV2Tooltip text="Запрос и результат сохраняются автоматически" placement="top" showDelay={80}>
            <span class="al-editor__saved">💾 автосохранение</span>
          </UiV2Tooltip>
        </div>
        <div class="al-editor__actions">
          <button
            type="button"
            class="al-toggle-btn"
            class:al-toggle-btn--on={showVars}
            onclick={() => showVars = !showVars}
          >{isRestMode ? 'Параметры' : 'Переменные'}</button>
          <button
            type="button"
            class="uiv2-btn uiv2-btn--primary uiv2-btn--sm"
            disabled={running}
            onclick={runQuery}
          >
            {running ? '…' : '▶ Выполнить'}
          </button>
        </div>
      </div>

      <div class="al-editor__panels" class:al-editor__panels--no-vars={!showVars}>
        <textarea
          class="al-editor__query"
          class:al-editor__query--url={isRestMode}
          spellcheck="false"
          bind:value={queryText}
          placeholder={isRestMode ? '/anime/{id}/episodes' : 'query { ... }'}
        ></textarea>
        {#if showVars}
          <textarea
            class="al-editor__vars"
            spellcheck="false"
            bind:value={variablesText}
              placeholder="&#123;&#125;"
          ></textarea>
        {/if}
      </div>
    </div>

    <!-- Result pane -->
    <div class="al-result">
      <div class="al-result__head">
        <span class="al-result__label">Результат</span>
        {#if resultMs > 0}
          <span class="al-result__meta">{resultMs} мс</span>
        {/if}
        {#if resultError}
          <span class="al-result__err-badge">Ошибка</span>
        {:else if result}
          <span class="al-result__ok-badge">OK</span>
        {/if}
        {#if result}
          <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm" onclick={copyResult}>
            Копировать
          </button>
          <button type="button" class="uiv2-btn uiv2-btn--ghost uiv2-btn--sm al-btn--danger" onclick={clearState}>
            Сбросить
          </button>
        {/if}

        {#if rateLimit}
          <UiV2Tooltip text="Rate limit: {rateLimit.remaining}/{rateLimit.limit} запросов" placement="top" showDelay={80}>
            <div class="al-rl">
            <span class="al-rl__label">
              {#if rateLimit.rateLimited}
                🚫 Rate limited
                {#if rateLimit.retryAfter}· retry in {rateLimit.retryAfter}s{/if}
              {:else}
                {rateLimit.remaining}/{rateLimit.limit}
              {/if}
            </span>
            <div class="al-rl__bar">
              <div
                class="al-rl__fill"
                style="width: {rateLimitPct}%; background: {rateLimitColor};"
              ></div>
            </div>
          </div>
          </UiV2Tooltip>
        {/if}
      </div>

      <div class="al-result__scroll uiv2-scroll-area uiv2-scroll-area--y" use:uiv2CustomScroll={{ axis: 'y' }}>
        <div class="uiv2-scroll-area__viewport al-result__vp">
          {#if running}
            <div class="al-result__placeholder">Выполняется запрос…</div>
          {:else if resultError && !result}
            <pre class="al-result__pre al-result__pre--error">{resultError}</pre>
          {:else if result}
            {#if resultError}
              <pre class="al-result__pre al-result__pre--error al-result__pre--inline">{resultError}</pre>
            {/if}
            <div class="al-json">
              {#each resultTokens as tok}
                {#if tok.kind === 'newline'}
                  <br />{#each { length: tok.indent } as _}&nbsp;&nbsp;{/each}
                {:else if tok.kind === 'syntax'}
                  <span class="al-json__syntax">{tok.text}</span>
                {:else if tok.kind === 'key'}
                  <span class="al-json__key">{tok.text}</span>
                {:else if tok.kind === 'number'}
                  <span class="al-json__num">{tok.text}</span>
                {:else if tok.kind === 'bool'}
                  <span class="al-json__bool">{tok.text}</span>
                {:else if tok.kind === 'null'}
                  <span class="al-json__null">null</span>
                {:else if tok.kind === 'string'}
                  <span class="al-json__str-wrap">
                    {#if tok.isImage}
                      <button
                        type="button"
                        class="al-json__link al-json__link--img"
                        onmouseenter={(e) => showPreview(e, tok.value)}
                        onmousemove={(e) => movePreview(e)}
                        onmouseleave={hidePreview}
                        onclick={() => openExternal(tok.value)}
                      >"{tok.value}"</button>
                    {:else if tok.isUrl}
                      <UiV2Tooltip text={tok.value} placement="top" showDelay={80}>
                        <button
                          type="button"
                          class="al-json__link"
                          onclick={() => openExternal(tok.value)}
                        >"{tok.value}"</button>
                      </UiV2Tooltip>
                    {:else}
                      <span class="al-json__str">"{tok.value}"</span>
                    {/if}
                    <UiV2Tooltip text="Копировать" placement="top" showDelay={80}>
                      <button
                        type="button"
                        class="al-json__copy"
                        onclick={() => copyText(tok.value)}
                      >⎘</button>
                    </UiV2Tooltip>
                  </span>
                {/if}
              {/each}
            </div>
          {:else}
            <div class="al-result__placeholder">
              <span class="al-result__hint">▶ Нажмите «Выполнить» чтобы отправить запрос</span>
              <span class="al-result__hint-sub">Запросы отправляются напрямую через серверный прокси</span>
            </div>
          {/if}
        </div>
        <div class="uiv2-scroll-area__v-track" aria-hidden="true"><div class="uiv2-scroll-area__v-thumb"></div></div>
      </div>
    </div>
  </div>
</div>

{#if previewUrl && previewReady}
  <div
    class="al-img-preview"
    use:portal
    style:left="{previewLeft}px"
    style:top="{previewTop}px"
  >
    <div class="al-img-preview__meta">{previewNatW} × {previewNatH} px</div>
    <div
      class="al-img-preview__shot"
      style:width="{previewDispW}px"
      style:height="{previewDispH}px"
      style:background-image={`url("${previewUrl.replace(/"/g, '')}")`}
    ></div>
  </div>
{/if}

<style lang="scss">
.al-root {
  display: grid;
  grid-template-columns: 14rem minmax(0, 1fr);
  grid-template-rows: 1fr;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--uikit-v2-bg);
  color: var(--uikit-v2-text);
  font-family: var(--uikit-v2-font);
}

/* ── Sidebar ── */
.al-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-surface);
}

.al-sidebar__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
}

.al-sidebar__filters {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem 0.6rem;
  flex-shrink: 0;
  border-bottom: 1px solid var(--uiv2-border-subtle);
}

.al-search-wrap {
  position: relative;
}

.al-search-clear {
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: 0.2rem 0.3rem;
  cursor: pointer;
  font-size: 0.7rem;
  color: var(--uiv2-fg-muted);
  line-height: 1;
  border-radius: 4px;
  &:hover { color: var(--uikit-v2-text); background: var(--uiv2-hover-bg); }
}

.al-empty {
  padding: 2rem 1rem;
  text-align: center;
  font-size: 0.8rem;
  color: var(--uiv2-fg-muted);
  opacity: 0.7;
}

.al-sidebar__title {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.al-sidebar__link {
  font-size: 0.72rem;
  color: var(--uikit-v2-accent);
  text-decoration: none;
  &:hover { text-decoration: underline; }
}

.al-presets {
  flex: 1 1 0;
  min-height: 0;
  position: relative;
}

.al-presets__vp {
  display: block;
  padding: 0.4rem 0.35rem;
}

.al-group {
  margin-bottom: 0.25rem;
}

.al-group__label {
  margin: 0;
  padding: 0.45rem 0.65rem 0.25rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
  opacity: 0.7;
}

.al-preset-item {
  display: block;
  width: 100%;
  padding: 0.4rem 0.65rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--uikit-v2-text);
  font: inherit;
  font-size: 0.8125rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s ease;

  &:hover { background: var(--uiv2-hover-bg); }
  &--active {
    background: var(--uiv2-selected-bg);
    color: var(--uikit-v2-accent);
    font-weight: 600;
  }
}

/* ── Main area ── */
.al-main {
  display: grid;
  grid-template-rows: 14rem minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ── Editor ── */
.al-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  overflow: hidden;
}

.al-editor__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
  background: var(--uikit-v2-surface);
}

.al-editor__label-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.al-editor__label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
}

.al-editor__saved {
  font-size: 0.65rem;
  color: var(--uiv2-fg-muted);
  opacity: 0.55;
}

.al-editor__api-badge {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  letter-spacing: 0.04em;

  &--gql {
    background: color-mix(in srgb, #e10098 12%, transparent);
    color: #e10098;
    border: 1px solid color-mix(in srgb, #e10098 25%, transparent);
  }

  &--rest {
    background: color-mix(in srgb, #38bdf8 12%, transparent);
    color: #38bdf8;
    border: 1px solid color-mix(in srgb, #38bdf8 25%, transparent);
  }

  &--kitsu {
    background: color-mix(in srgb, #f97316 12%, transparent);
    color: #f97316;
    border: 1px solid color-mix(in srgb, #f97316 25%, transparent);
  }
}

// In REST mode, query textarea shows a single-line URL path
.al-editor__query--url {
  font-size: 0.875rem;
  line-height: 2;
}

.al-editor__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.al-toggle-btn {
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--uiv2-border-subtle);
  border-radius: 6px;
  background: transparent;
  color: var(--uiv2-fg-muted);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover { border-color: var(--uikit-v2-accent); color: var(--uikit-v2-text); }
  &--on {
    background: color-mix(in srgb, var(--uikit-v2-accent) 12%, transparent);
    border-color: var(--uikit-v2-accent);
    color: var(--uikit-v2-accent);
    font-weight: 600;
  }
}

.al-editor__panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;

  &--no-vars {
    grid-template-columns: 1fr;
  }
}

.al-editor__query,
.al-editor__vars {
  width: 100%;
  height: 100%;
  padding: 0.75rem 1rem;
  border: 0;
  border-left: 1px solid var(--uiv2-border-subtle);
  background: color-mix(in srgb, var(--uikit-v2-bg) 60%, var(--uikit-v2-surface));
  color: var(--uikit-v2-text);
  font-family: var(--uikit-v2-mono, 'Fira Code', 'Cascadia Code', monospace);
  font-size: 0.8125rem;
  line-height: 1.6;
  resize: none;
  outline: none;
  box-sizing: border-box;
  overflow: auto;
  tab-size: 2;

  &:first-child { border-left: 0; }

  &:focus {
    background: var(--uikit-v2-bg);
  }
}

/* ── Result ── */
.al-result {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.al-result__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--uiv2-border-subtle);
  flex-shrink: 0;
  background: var(--uikit-v2-surface);
}

.al-result__label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--uiv2-fg-muted);
  margin-right: auto;
}

.al-result__meta {
  font-size: 0.72rem;
  color: var(--uiv2-fg-muted);
}

.al-result__ok-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  background: color-mix(in srgb, #4ade80 15%, transparent);
  color: #4ade80;
  border: 1px solid color-mix(in srgb, #4ade80 30%, transparent);
}

.al-result__err-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--uikit-v2-danger) 15%, transparent);
  color: var(--uikit-v2-danger);
  border: 1px solid color-mix(in srgb, var(--uikit-v2-danger) 30%, transparent);
}

.al-result__scroll {
  flex: 1 1 0;
  min-height: 0;
  position: relative;
}

.al-result__vp {
  display: block;
  height: auto;
}

.al-result__pre {
  margin: 0;
  padding: 1rem 1.25rem;
  font-family: var(--uikit-v2-mono, 'Fira Code', 'Cascadia Code', monospace);
  font-size: 0.78rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--uikit-v2-text);

  &--error {
    color: var(--uikit-v2-danger);
    background: color-mix(in srgb, var(--uikit-v2-danger) 5%, transparent);
  }

  &--inline {
    border-bottom: 1px solid color-mix(in srgb, var(--uikit-v2-danger) 20%, transparent);
    padding-bottom: 0.75rem;
    margin-bottom: 0;
  }
}

.al-result__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 12rem;
  gap: 0.5rem;
  text-align: center;
}

.al-result__hint {
  font-size: 0.875rem;
  color: var(--uiv2-fg-muted);
  font-weight: 500;
}

.al-result__hint-sub {
  font-size: 0.72rem;
  color: var(--uiv2-fg-muted);
  opacity: 0.6;
}

/* ── Rate limit indicator ── */
.al-rl {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-left: 0.25rem;
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--uiv2-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--uikit-v2-surface) 60%, transparent);
}

.al-rl__label {
  font-size: 0.7rem;
  color: var(--uiv2-fg-muted);
  white-space: nowrap;
}

.al-rl__bar {
  width: 4rem;
  height: 4px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--uiv2-fg-muted) 20%, transparent);
  overflow: hidden;
}

.al-rl__fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.3s ease, background 0.3s ease;
}

.al-btn--danger {
  color: var(--uikit-v2-danger) !important;
  &:hover { background: color-mix(in srgb, var(--uikit-v2-danger) 10%, transparent) !important; }
}

/* ── JSON interactive renderer ── */
.al-json {
  padding: 0.85rem 1.1rem;
  font-family: var(--uikit-v2-mono, 'Cascadia Code', 'Fira Code', monospace);
  font-size: 0.78rem;
  line-height: 1.65;
  word-break: break-all;
  white-space: pre-wrap;
}

.al-json__syntax { color: var(--uiv2-fg-muted); }
.al-json__key    { color: #7dd3fc; }
.al-json__num    { color: #fb923c; }
.al-json__bool   { color: #a78bfa; }
.al-json__null   { color: var(--uiv2-fg-muted); font-style: italic; }
.al-json__str    { color: #86efac; }

.al-json__str-wrap {
  display: inline-flex;
  align-items: baseline;
  gap: 0.2rem;
}

.al-json__link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: #38bdf8;
  text-decoration: underline;
  text-decoration-style: dotted;
  cursor: pointer;
  text-align: left;

  &:hover { color: #7dd3fc; text-decoration-style: solid; }

  &--img {
    color: #f472b6;
    &:hover { color: #f9a8d4; }
  }
}

.al-json__copy {
  background: none;
  border: none;
  padding: 0 0.15rem;
  cursor: pointer;
  font-size: 0.72rem;
  color: var(--uiv2-fg-muted);
  opacity: 0;
  transition: opacity 0.1s ease, color 0.1s ease;
  line-height: 1;
  vertical-align: middle;

  &:hover { color: var(--uikit-v2-accent); opacity: 1 !important; }
}

.al-json__str-wrap:hover .al-json__copy {
  opacity: 0.6;
}

.al-img-preview {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  display: inline-block;
  width: auto;
  height: auto;
  padding: 0;
  margin: 0;
  line-height: 0;
  font-size: 0;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  border: 1px solid var(--uiv2-border-subtle);
  background: var(--uikit-v2-surface);
}

.al-img-preview__meta {
  display: block;
  padding: 0.3rem 0.55rem;
  font-size: 0.68rem;
  line-height: 1.3;
  font-family: var(--uikit-v2-mono, monospace);
  color: var(--uiv2-fg-muted);
  background: color-mix(in srgb, var(--uikit-v2-bg) 80%, transparent);
  border-bottom: 1px solid var(--uiv2-border-subtle);
  text-align: center;
  letter-spacing: 0.03em;
}

.al-img-preview__shot {
  display: block;
  width: auto;
  height: auto;
  padding: 0;
  margin: 0;
  flex: none;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
}
</style>
