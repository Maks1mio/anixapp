/** Статьи / каналы ленты Anixart (Android Feed). */

export type FeedDateFilter =
  | 0 // Последнее
  | 1 // 24 часа
  | 2 // Неделя
  | 3 // Месяц
  | 4 // Год
  | 5; // Всё время

export const FEED_DATE_OPTIONS: Array<{ id: FeedDateFilter; label: string }> = [
  { id: 0, label: 'Последнее' },
  { id: 1, label: '24 часа' },
  { id: 2, label: 'Неделя' },
  { id: 3, label: 'Месяц' },
  { id: 4, label: 'Год' },
  { id: 5, label: 'Всё время' },
];

export interface FeedChannel {
  id: number;
  title: string;
  description?: string;
  avatar?: string;
  cover?: string;
  is_blog?: boolean;
  is_verified?: boolean;
  is_subscribed?: boolean;
  is_creator?: boolean;
  is_administrator_or_higher?: boolean;
  subscriber_count?: number;
  article_count?: number;
  /** Значок канала / блога (объект badge или URL). */
  badge?: unknown;
}

export interface FeedProfile {
  id?: number;
  login?: string;
  avatar?: string | null;
}

export interface FeedArticleBlock {
  id?: string;
  type?: string;
  name?: string;
  data?: Record<string, unknown>;
}

export interface FeedArticlePayload {
  time?: number;
  version?: string;
  blocks?: FeedArticleBlock[];
  block_count?: number;
}

export interface FeedArticleLastComment {
  message?: string;
  text?: string;
  profile?: FeedProfile | null;
  author?: FeedProfile | null;
  creation_date?: number;
  date?: number;
  is_spoiler?: boolean;
  is_deleted?: boolean;
  vote_count?: number;
}

export interface FeedArticle {
  id: number;
  channel?: FeedChannel | null;
  author?: FeedProfile | null;
  /** Объект или JSON-строка — лента иногда отдаёт payload строкой. */
  payload?: FeedArticlePayload | string;
  comment_count?: number;
  repost_count?: number;
  vote_count?: number;
  /** 0 — нет, 1 — минус, 2 — плюс (как в Anixart API). */
  vote?: number;
  tags?: Array<string | { name?: string; title?: string; tag?: string }>;
  last_comment?: FeedArticleLastComment | null;
  creation_date?: number;
  last_update_date?: number;
  is_deleted?: boolean;
  is_under_moderation?: boolean;
  is_pinned?: boolean;
  is_muted?: boolean;
  has_delete_enforcement?: boolean;
  contains_repost_article?: boolean;
  /** Вложенная статья при репосте. */
  repost_article?: FeedArticle | null;
}

export interface FeedPageResponse {
  content?: FeedArticle[];
  total_count?: number;
  total_page_count?: number;
  current_page?: number;
  code?: number;
}
