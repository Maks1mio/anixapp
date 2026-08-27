import type { UiV2PopupMenuItem } from '../components/uikit-v2/UiV2PopupMenu.svelte';
import type { FeedArticle } from '../types/feed';
import {
  iconCopy,
  iconEye,
  iconEyeOff,
  iconHeart,
  iconPencil,
  iconPin,
  iconShare,
  iconTrash2,
  iconTriangleAlert,
} from '../components/icons';
import { articleHeadline, articlePreviewText } from './feed-article';

export type FeedArticleReportReason = {
  id: number;
  title?: string;
  name?: string;
  text?: string;
};

export type FeedArticleMenuOptions = {
  /** Закрепление доступно (страница канала / запись). */
  pinAvailable?: boolean;
  /** Скрытие записи доступно (в ленте — да). */
  muteAvailable?: boolean;
  /** privilege_level текущего пользователя (≥3 — «Обработать»). */
  privilegeLevel?: number;
  reportReasons?: FeedArticleReportReason[];
};

function channelFlag(channel: FeedArticle['channel'], key: string): boolean {
  if (!channel || typeof channel !== 'object') return false;
  const rec = channel as Record<string, unknown>;
  return !!rec[key];
}

export function articlePlainPreview(article: FeedArticle, maxLen = 150): string {
  const headline = articleHeadline(article).trim();
  const preview = articlePreviewText(article, maxLen).trim();
  return headline || preview || 'Запись';
}

export function normalizeArticleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return 'https://anixart.io/';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function articleLinkUrl(articleId: number, baseUrl: string): string {
  return `${normalizeArticleBaseUrl(baseUrl)}article/${articleId}`;
}

export function articleShareText(article: FeedArticle, baseUrl: string): string {
  const preview = articlePlainPreview(article);
  const link = articleLinkUrl(article.id, baseUrl);
  return `Рекомендую ознакомиться с записью: «${preview}»\n${link}`;
}

export function buildFeedArticleMenuItems(
  article: FeedArticle,
  options: FeedArticleMenuOptions = {},
): UiV2PopupMenuItem[] {
  const pinAvailable = options.pinAvailable ?? false;
  const muteAvailable = options.muteAvailable ?? true;
  const privilegeLevel = options.privilegeLevel ?? 0;
  const reportReasons = options.reportReasons ?? [];

  const channel = article.channel;
  const isAdmin = channelFlag(channel, 'is_administrator_or_higher');
  const isCreator = channelFlag(channel, 'is_creator');
  const isPinned = !!(article as FeedArticle & { is_pinned?: boolean }).is_pinned;
  const isMuted = !!(article as FeedArticle & { is_muted?: boolean }).is_muted;

  const items: UiV2PopupMenuItem[] = [];

  if (pinAvailable && isAdmin && !isPinned) {
    items.push({ id: 'pin', label: 'Закрепить', icon: iconPin(16) });
  }
  if (pinAvailable && isAdmin && isPinned) {
    items.push({ id: 'unpin', label: 'Открепить', icon: iconPin(16) });
  }

  items.push({ id: 'votes', label: 'Оценили', icon: iconHeart(16) });
  items.push({ id: 'reposts', label: 'Репостнули', icon: iconShare(16) });

  if (isAdmin) {
    items.push({
      id: 'edit',
      label: 'Редактировать',
      icon: iconPencil(16),
      dividerBefore: true,
    });
    items.push({
      id: 'delete',
      label: 'Удалить',
      icon: iconTrash2(16),
      danger: true,
    });
  }

  items.push({
    id: 'share',
    label: 'Поделиться',
    icon: iconShare(16),
    dividerBefore: isAdmin,
  });
  items.push({ id: 'copyLink', label: 'Скопировать ссылку', icon: iconCopy(16) });

  if (muteAvailable && !isCreator) {
    items.push({
      id: isMuted ? 'unmute' : 'mute',
      label: isMuted ? 'Отменить скрытие записи' : 'Скрыть запись',
      icon: isMuted ? iconEye(16) : iconEyeOff(16),
      dividerBefore: true,
    });
  }

  if (!isCreator) {
    const reportItem: UiV2PopupMenuItem = {
      id: 'report',
      label: 'Пожаловаться',
      icon: iconTriangleAlert(16),
      danger: true,
      dividerBefore: true,
    };
    if (reportReasons.length > 0) {
      reportItem.children = reportReasons.map((reason) => ({
        id: `report:${reason.id}`,
        label: reason.title ?? reason.name ?? reason.text ?? `Причина ${reason.id}`,
      }));
      reportItem.submenuWide = true;
    }
    items.push(reportItem);
  }

  if (privilegeLevel >= 3) {
    items.push({
      id: 'process',
      label: 'Обработать',
      icon: iconTriangleAlert(16),
      danger: true,
      dividerBefore: true,
    });
  }

  return items;
}

let sessionPrivilegeLevel = 0;
let sessionReportReasons: FeedArticleReportReason[] = [];
let sessionLoaded = false;
let sessionLoading: Promise<void> | null = null;

export function getFeedArticleMenuSession() {
  return {
    privilegeLevel: sessionPrivilegeLevel,
    reportReasons: sessionReportReasons,
    loaded: sessionLoaded,
  };
}

/** Кэш privilege_level и причин жалоб на статью (как в мобильном приложении). */
export async function ensureFeedArticleMenuSession(force = false): Promise<void> {
  if (sessionLoaded && !force) return;
  if (sessionLoading && !force) {
    await sessionLoading;
    return;
  }

  sessionLoading = (async () => {
    sessionPrivilegeLevel = 0;
    sessionReportReasons = [];

    const api = typeof window !== 'undefined' ? window.anixApi : undefined;
    if (!api) {
      sessionLoaded = true;
      return;
    }

    try {
      const auth = await api.client.getAuthStatus?.();
      if (!auth?.hasToken) {
        sessionLoaded = true;
        return;
      }

      const self = await api.profile.self?.();
      const profile = (self as { profile?: { privilege_level?: number } } | null)?.profile;
      sessionPrivilegeLevel = Number(profile?.privilege_level ?? 0);

      const reasons = await api.report?.articleReasons?.();
      if (Array.isArray(reasons)) {
        sessionReportReasons = reasons
          .map((row) => {
            const rec = row as FeedArticleReportReason;
            const id = Number(rec.id);
            if (!Number.isFinite(id) || id <= 0) return null;
            return {
              id,
              title: rec.title ?? rec.name ?? rec.text,
              name: rec.name,
              text: rec.text,
            } satisfies FeedArticleReportReason;
          })
          .filter((x): x is FeedArticleReportReason => x != null);
      }
    } catch {
      // Меню без жалоб / модерации — не блокируем карточку.
    } finally {
      sessionLoaded = true;
      sessionLoading = null;
    }
  })();

  await sessionLoading;
}
