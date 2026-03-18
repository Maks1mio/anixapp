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
  studio?: string;
  category?: string;
  releaseDate?: string;
  /** В избранном (is_favorite из API) */
  isFavorite?: boolean;
  /** Статус в списке профиля (BookmarkType: watching/planned/...) */
  listStatus?: 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped';
  /** Личная оценка текущего пользователя (1–5, my_vote из API) */
  myVote?: number;
}
