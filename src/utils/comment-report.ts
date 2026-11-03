import { showToast } from '../stores/toast';

export type CommentReportSource = 'release' | 'article' | 'collection';
export type CommentReportReason = { id: number; label: string };

const cache = new Map<CommentReportSource, CommentReportReason[]>();
const pending = new Map<CommentReportSource, Promise<CommentReportReason[]>>();

/** Причины жалоб на комментарий (кэш на сессию). */
export function getCommentReportReasons(source: CommentReportSource): CommentReportReason[] {
  return cache.get(source) ?? [];
}

export function ensureCommentReportReasons(source: CommentReportSource): Promise<CommentReportReason[]> {
  const cached = cache.get(source);
  if (cached && cached.length > 0) return Promise.resolve(cached);
  const inflight = pending.get(source);
  if (inflight) return inflight;

  const api = window.anixApi?.report;
  const fetcher =
    source === 'article'
      ? api?.articleCommentReasons
      : source === 'collection'
        ? api?.collectionCommentReasons
        : api?.releaseCommentReasons;
  if (!fetcher) return Promise.resolve([]);

  const request = fetcher()
    .then((rows) => {
      const list = (Array.isArray(rows) ? rows : [])
        .map((row) => {
          const id = Number(row?.id);
          if (!(id > 0)) return null;
          return { id, label: String(row.title ?? row.name ?? row.text ?? `Причина ${id}`) };
        })
        .filter((x): x is CommentReportReason => x != null);
      cache.set(source, list);
      return list;
    })
    .catch(() => [] as CommentReportReason[])
    .finally(() => pending.delete(source));
  pending.set(source, request);
  return request;
}

export async function submitCommentReport(
  source: CommentReportSource,
  commentId: number,
  reasonId: number,
): Promise<void> {
  const api = window.anixApi?.report;
  const submit =
    source === 'article'
      ? api?.submitArticleComment
      : source === 'collection'
        ? api?.submitCollectionComment
        : api?.submitReleaseComment;
  if (!submit || !(commentId > 0) || !(reasonId > 0)) {
    showToast('Жалобы недоступны', 'err');
    return;
  }
  try {
    const res = await submit({ entity_id: commentId, reason_id: reasonId });
    const code = Number(res?.code ?? 0);
    if (code !== 0) {
      showToast(`Не удалось отправить жалобу (код ${code})`, 'err');
      return;
    }
    showToast('Жалоба отправлена');
  } catch (err) {
    showToast(String(err), 'err');
  }
}
