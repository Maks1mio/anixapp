export interface ReleaseCardData {
  id?: number;
  titleRu?: string;
  titleEn?: string;
  /** Альтернативное название (title_alt из API) */
  titleAlt?: string;
  description?: string;
  poster?: string;
  /** Средняя оценка (grade из API) */
  rating?: number;
  /** Число голосов (vote_count из API) */
  voteCount?: number;
  episodesReleased?: number;
  episodesTotal?: number;
  year?: string;
  country?: string;
  /** Жанры через запятую */
  genres?: string;
  status?: string;
  /** ReleaseStatus id: 1 finished, 2 airing, 3 announced */
  statusId?: number;
  studio?: string;
  category?: string;
  /** Источник (манга, ранобэ…) */
  source?: string;
  author?: string;
  director?: string;
  /** Длительность серии в минутах */
  duration?: number;
  /** 1 зима … 4 осень */
  season?: number;
  /** unix sec — для сезона анонса */
  airedOnDate?: number;
  favoritesCount?: number;
  releaseDate?: string;
  /** В избранном (is_favorite из API) */
  isFavorite?: boolean;
  /** Статус в списке профиля (BookmarkType: watching/planned/...) */
  listStatus?: 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped';
  /** Личная оценка текущего пользователя (1–5, my_vote из API) */
  myVote?: number;
  /** Данные последнего просмотра (вкладка «История») */
  historyView?: {
    episodeLabel?: string;
    dubberLabel?: string;
    viewedAt?: number;
  };
}
