import type { FeedArticle } from '../types/feed';
import { showToast } from '../stores/toast';
import {
  articleLinkUrl,
  articleShareText,
  type FeedArticleReportReason,
} from './feed-article-menu';

async function getBaseUrl(): Promise<string> {
  const url = await window.anixApi?.client?.getBaseUrl?.();
  return typeof url === 'string' ? url : 'https://anixart.io/';
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type FeedArticleMenuActionResult =
  | { kind: 'none' }
  | { kind: 'removed'; articleId: number }
  | { kind: 'updated'; article: FeedArticle }
  | { kind: 'navigate'; path: string };

export async function runFeedArticleMenuAction(
  actionId: string,
  article: FeedArticle,
): Promise<FeedArticleMenuActionResult> {
  const api = window.anixApi?.article;
  const reportApi = window.anixApi?.report;
  if (!api) {
    showToast('API недоступно', 'err');
    return { kind: 'none' };
  }

  const articleId = article.id;

  if (actionId === 'pin' || actionId === 'unpin') {
    try {
      await api.setPinned?.(articleId, actionId === 'pin');
      showToast(actionId === 'pin' ? 'Запись закреплена' : 'Закрепление снято');
      return {
        kind: 'updated',
        article: {
          ...article,
          is_pinned: actionId === 'pin',
        } as FeedArticle,
      };
    } catch (err) {
      showToast(String(err), 'err');
      return { kind: 'none' };
    }
  }

  if (actionId === 'votes') {
    showToast('Список оценивших скоро будет в desktop-версии', 'info');
    return { kind: 'navigate', path: `/article/${articleId}` };
  }

  if (actionId === 'reposts') {
    showToast('Список репостнувших скоро будет в desktop-версии', 'info');
    return { kind: 'navigate', path: `/article/${articleId}` };
  }

  if (actionId === 'edit') {
    showToast('Редактор записей скоро будет в desktop-версии', 'info');
    return { kind: 'navigate', path: `/article/${articleId}` };
  }

  if (actionId === 'delete') {
    const ok = window.confirm('Удалить запись?\n\nДействие нельзя отменить.');
    if (!ok) return { kind: 'none' };
    try {
      await api.delete?.(articleId);
      showToast('Запись удалена');
      return { kind: 'removed', articleId };
    } catch (err) {
      showToast(String(err), 'err');
      return { kind: 'none' };
    }
  }

  if (actionId === 'share') {
    const baseUrl = await getBaseUrl();
    const text = articleShareText(article, baseUrl);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text, title: 'Anixart' });
        return { kind: 'none' };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return { kind: 'none' };
      }
    }
    const copied = await copyText(text);
    showToast(copied ? 'Текст для отправки скопирован' : 'Не удалось скопировать', copied ? 'ok' : 'err');
    return { kind: 'none' };
  }

  if (actionId === 'copyLink') {
    const baseUrl = await getBaseUrl();
    const link = articleLinkUrl(articleId, baseUrl);
    const copied = await copyText(link);
    showToast(copied ? 'Ссылка скопирована' : 'Не удалось скопировать', copied ? 'ok' : 'err');
    return { kind: 'none' };
  }

  if (actionId === 'mute') {
    const ok = window.confirm('Скрыть запись?\n\nВы перестанете видеть её в ленте.');
    if (!ok) return { kind: 'none' };
    try {
      await api.mute?.(articleId);
      showToast('Запись скрыта');
      return { kind: 'removed', articleId };
    } catch (err) {
      showToast(String(err), 'err');
      return { kind: 'none' };
    }
  }

  if (actionId === 'unmute') {
    try {
      await api.unmute?.(articleId);
      showToast('Скрытие записи отменено');
      return {
        kind: 'updated',
        article: { ...article, is_muted: false } as FeedArticle,
      };
    } catch (err) {
      showToast(String(err), 'err');
      return { kind: 'none' };
    }
  }

  if (actionId.startsWith('report:')) {
    const reasonId = Number(actionId.slice('report:'.length));
    if (!Number.isFinite(reasonId) || reasonId <= 0) return { kind: 'none' };
    try {
      await reportApi?.submitArticle?.({ entity_id: articleId, reason_id: reasonId });
      showToast('Жалоба отправлена');
    } catch (err) {
      showToast(String(err), 'err');
    }
    return { kind: 'none' };
  }

  if (actionId === 'report') {
    showToast('Выберите причину жалобы', 'info');
    return { kind: 'none' };
  }

  if (actionId === 'process') {
    showToast('Модерация записей в desktop-версии пока недоступна', 'info');
    return { kind: 'none' };
  }

  return { kind: 'none' };
}

export type { FeedArticleReportReason };
