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
  subscriber_count?: number;
  article_count?: number;
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

export interface FeedArticle {
  id: number;
  channel?: FeedChannel | null;
  author?: FeedProfile | null;
  payload?: {
    time?: number;
    blocks?: FeedArticleBlock[];
  };
  comment_count?: number;
  repost_count?: number;
  vote_count?: number;
  vote?: number;
  creation_date?: number;
  last_update_date?: number;
  is_deleted?: boolean;
  is_under_moderation?: boolean;
  contains_repost_article?: boolean;
}

export interface FeedPageResponse {
  content?: FeedArticle[];
  total_count?: number;
  total_page_count?: number;
  current_page?: number;
  code?: number;
}
