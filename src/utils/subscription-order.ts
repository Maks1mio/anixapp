/**
 * Умная сортировка подписок:
 * 1) закреплённые (порядок закрепа),
 * 2) свежие (новее выше),
 * 3) остальные (порядок API).
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

  return [...channels].sort((a, b) => {
    const ap = isPinned(a.id);
    const bp = isPinned(b.id);
    if (ap !== bp) return ap ? -1 : 1;
    if (ap && bp) {
      return (pinRank.get(a.id) ?? 0) - (pinRank.get(b.id) ?? 0);
    }

    const af = isFresh(a);
    const bf = isFresh(b);
    if (af !== bf) return af ? -1 : 1;
    if (af && bf) {
      const da = Number(a.last_article_date) || 0;
      const db = Number(b.last_article_date) || 0;
      if (db !== da) return db - da;
    }
    return (fallback.get(a.id) ?? 0) - (fallback.get(b.id) ?? 0);
  });
}
