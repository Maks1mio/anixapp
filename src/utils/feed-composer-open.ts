import type { FeedArticle } from '../types/feed';

export type FeedComposerOpenChannel = {
  id: number;
  title: string;
  avatar?: string | null;
  is_blog?: boolean;
};

export type FeedComposerOpenPayload = {
  channelId?: number | null;
  draftId?: string | null;
  repostArticle?: FeedArticle | null;
  channels?: FeedComposerOpenChannel[];
  /** Предложение записи в канал (не прямая публикация). */
  isSuggestion?: boolean;
};

export async function openFeedComposerWindow(
  payload: FeedComposerOpenPayload = {},
): Promise<boolean> {
  const open = window.electron?.openComposerWindow;
  if (!open) return false;
  try {
    await open({
      channelId: payload.channelId ?? null,
      draftId: payload.draftId ?? null,
      repostArticle: payload.repostArticle ?? null,
      channels: payload.channels ?? [],
      isSuggestion: !!payload.isSuggestion,
    });
    return true;
  } catch {
    return false;
  }
}
