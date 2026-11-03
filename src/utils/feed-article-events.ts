/**
 * Статистика записей, как в мобильном клиенте (POST article/event):
 * view — запись показана в списке, open — запись открыта.
 * События копятся и уходят пачкой; каждая запись учитывается один раз за сессию.
 */
export type ArticleEventType = 'view' | 'open';
export type ArticleEntryPoint = 'unknown' | 'article' | 'channel' | 'feed' | 'latest' | 'search';

const FLUSH_DELAY_MS = 2500;
const MAX_BATCH = 50;

const sent: Record<ArticleEventType, Set<number>> = {
  view: new Set(),
  open: new Set(),
};
const queue = new Map<string, { type: ArticleEventType; entryPoint: ArticleEntryPoint; ids: Set<number> }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushArticleEvents();
  }, FLUSH_DELAY_MS);
}

export function trackArticleEvent(
  type: ArticleEventType,
  articleId: number,
  entryPoint: ArticleEntryPoint = 'unknown',
): void {
  const id = Number(articleId);
  if (!(id > 0) || sent[type].has(id)) return;
  if (!window.anixApi?.article?.event) return;
  sent[type].add(id);
  const key = `${type}:${entryPoint}`;
  let bucket = queue.get(key);
  if (!bucket) {
    bucket = { type, entryPoint, ids: new Set() };
    queue.set(key, bucket);
  }
  bucket.ids.add(id);
  if (bucket.ids.size >= MAX_BATCH) void flushArticleEvents();
  else scheduleFlush();
}

export async function flushArticleEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const api = window.anixApi?.article?.event;
  const batches = [...queue.values()];
  queue.clear();
  if (!api) return;
  await Promise.all(batches.map(async (b) => {
    try {
      await api({ type: b.type, entry_point: b.entryPoint, articles: [...b.ids] });
    } catch {
      /* статистика не должна мешать ленте */
    }
  }));
}
