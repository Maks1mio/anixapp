export interface ParsedMsg {
  replyId: string | null;
  releaseId: number | null;
  gifUrl: string | null;
  text: string;
}

export interface ReplyTo {
  id: string;
  userId: number;
  message: string;
}

export interface SlashResult {
  id: number;
  title: string;
  poster: string;
  year?: string;
}

export interface ReleaseEmbed {
  id: number;
  titleRu?: string;
  titleEn?: string;
  poster?: string;
  rating?: number;
  voteCount?: number;
  episodesReleased?: number;
  episodesTotal?: number;
  year?: string;
  category?: string;
  status?: string;
  genres?: string;
}

export const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  NOTE:       { label: 'Заметка',        color: '#60a5fa' },
  TIP:        { label: 'Совет',          color: '#4ade80' },
  IMPORTANT:  { label: 'Важно',          color: '#a78bfa' },
  WARNING:    { label: 'Предупреждение', color: '#fbbf24' },
  CAUTION:    { label: 'Внимание',       color: '#f87171' },
  DISCUSSION: { label: 'Обсуждение',     color: '#38bdf8' },
};
