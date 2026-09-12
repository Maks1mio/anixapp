/**
 * Умная сортировка подписок:
 * 1) непрочитанные с пином,
 * 2) непрочитанные,
 * 3) пины,
 * 4) остальные.
 */

export function sortSubscriptionsSmart<T extends { id: number; last_article_date?: number }>(
  channels: T[],
  isFresh: (ch: T) => boolean,
  pinnedIds: number[] = [],
): T[] {
  if (channels.length <= 1) return [...channels];
  const fallback = new Map(channels.map((c, i) => [c.id, i]));
  const pinRank = new Map(pinnedIds.map((id, i) => [id, i]));
  const isPinned = (id: number) => pinRank.has(id);

  function group(ch: T): 0 | 1 | 2 | 3 {
    const pinned = isPinned(ch.id);
    const fresh = isFresh(ch);
    if (fresh && pinned) return 0;
    if (fresh) return 1;
    if (pinned) return 2;
    return 3;
  }

  return [...channels].sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return ga - gb;

    if (ga === 0 || ga === 2) {
      return (pinRank.get(a.id) ?? 0) - (pinRank.get(b.id) ?? 0);
    }
    if (ga === 1) {
      const da = Number(a.last_article_date) || 0;
      const db = Number(b.last_article_date) || 0;
      if (db !== da) return db - da;
    }
    return (fallback.get(a.id) ?? 0) - (fallback.get(b.id) ?? 0);
  });
}
