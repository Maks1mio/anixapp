export interface FeedArticle {
  id?: number;
  release?: {
    id?: number;
    titleRu?: string;
    titleEn?: string;
    poster?: { small?: { url?: string }; medium?: { url?: string } };
  };
}
