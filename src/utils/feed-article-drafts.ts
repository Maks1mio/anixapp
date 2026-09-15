import {
  cloneEditorBlocks,
  editorHasContent,
  editorPlainText,
  generateBlockId,
  type ArticleEditorBlock,
} from './feed-article-create';
import type { FeedArticle } from '../types/feed';

export type FeedArticleDraft = {
  id: string;
  updatedAt: number;
  channelId: number | null;
  isSigned: boolean;
  blocks: ArticleEditorBlock[];
  repostArticle: FeedArticle | null;
  preview: string;
};

const KEY_PREFIX = 'anix.feed.drafts';

function storageKey(): string {
  return KEY_PREFIX;
}

function draftPreview(blocks: ArticleEditorBlock[]): string {
  for (const block of blocks) {
    if (block.type === 'paragraph' || block.type === 'header' || block.type === 'quote') {
      const text = editorPlainText(block.html);
      if (text) return text.slice(0, 160);
    }
    if (block.type === 'list') {
      const text = block.items.map(editorPlainText).find(Boolean);
      if (text) return text.slice(0, 160);
    }
  }
  if (blocks.some((b) => b.type === 'media')) return 'Изображение';
  if (blocks.some((b) => b.type === 'embed')) return 'Вложение';
  if (blocks.some((b) => b.type === 'delimiter')) return 'Разделитель';
  return 'Черновик';
}

export function newDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft_${Date.now()}_${generateBlockId()}`;
}

export function loadFeedDrafts(): FeedArticleDraft[] {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is FeedArticleDraft => !!item && typeof item === 'object' && typeof (item as FeedArticleDraft).id === 'string')
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function getFeedDraft(id: string): FeedArticleDraft | null {
  return loadFeedDrafts().find((d) => d.id === id) ?? null;
}

function writeDrafts(list: FeedArticleDraft[]): void {
  localStorage.setItem(storageKey(), JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('anix:feed-drafts-changed'));
}

export function upsertFeedDraft(input: {
  id: string;
  channelId: number | null;
  isSigned: boolean;
  blocks: ArticleEditorBlock[];
  repostArticle?: FeedArticle | null;
}): FeedArticleDraft | null {
  const blocks = cloneEditorBlocks(input.blocks);
  if (!editorHasContent(blocks) && !input.repostArticle) {
    deleteFeedDraft(input.id);
    return null;
  }
  const draft: FeedArticleDraft = {
    id: input.id,
    updatedAt: Date.now(),
    channelId: input.channelId,
    isSigned: input.isSigned,
    blocks,
    repostArticle: input.repostArticle ?? null,
    preview: draftPreview(blocks),
  };
  const next = loadFeedDrafts().filter((d) => d.id !== draft.id);
  next.unshift(draft);
  writeDrafts(next.slice(0, 40));
  return draft;
}

export function deleteFeedDraft(id: string): void {
  const next = loadFeedDrafts().filter((d) => d.id !== id);
  writeDrafts(next);
}

export function formatDraftTime(ts: number): string {
  if (!ts) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ts);
  } catch {
    return '';
  }
}
