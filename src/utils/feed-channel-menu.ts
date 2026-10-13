import type { UiV2PopupMenuItem } from '../components/uikit-v2/UiV2PopupMenu.svelte';
import { iconCopy, iconEye, iconEyeOff, iconInfo } from '../components/icons';
import type { FeedChannel } from '../types/feed';
import { showToast } from '../stores/toast';
import { requireAuth } from '../stores/auth';
import { normalizeArticleBaseUrl, type FeedArticleReportReason } from './feed-article-menu';

export function channelLinkUrl(channelId: number, baseUrl: string): string {
  return `${normalizeArticleBaseUrl(baseUrl)}channel/${channelId}`;
}

export function buildFeedChannelMenuItems(
  channel: FeedChannel,
  reportReasons: FeedArticleReportReason[] = [],
): UiV2PopupMenuItem[] {
  const items: UiV2PopupMenuItem[] = [
    { id: 'copy', label: 'Скопировать ссылку', icon: iconCopy(16) },
  ];

  if (!channel.is_creator) {
    const muted = !!channel.is_muted;
    items.push({
      id: muted ? 'unmute' : 'mute',
      label: muted ? 'Отменить скрытие канала' : 'Скрыть канал',
      icon: muted ? iconEye(16) : iconEyeOff(16),
    });

    const reportItem: UiV2PopupMenuItem = {
      id: 'report',
      label: 'Пожаловаться',
      icon: iconInfo(16),
      danger: true,
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

  return items;
}

let channelReportReasons: FeedArticleReportReason[] = [];
let channelReportLoaded = false;
let channelReportLoading: Promise<void> | null = null;

export function getChannelReportReasons(): FeedArticleReportReason[] {
  return channelReportReasons;
}

export async function ensureChannelReportReasons(force = false): Promise<FeedArticleReportReason[]> {
  if (channelReportLoaded && !force) return channelReportReasons;
  if (channelReportLoading && !force) {
    await channelReportLoading;
    return channelReportReasons;
  }

  channelReportLoading = (async () => {
    channelReportReasons = [];
    const api = typeof window !== 'undefined' ? window.anixApi : undefined;
    if (!api?.report?.channelReasons) {
      channelReportLoaded = true;
      return;
    }
    try {
      const reasons = await api.report.channelReasons();
      if (Array.isArray(reasons)) {
        channelReportReasons = reasons
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
      channelReportReasons = [];
    } finally {
      channelReportLoaded = true;
      channelReportLoading = null;
    }
  })();

  await channelReportLoading;
  return channelReportReasons;
}

export type FeedChannelMenuResult =
  | { kind: 'none' }
  | { kind: 'muted'; channelId: number }
  | { kind: 'unmuted'; channelId: number };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function runFeedChannelMenuAction(
  actionId: string,
  channel: FeedChannel,
): Promise<FeedChannelMenuResult> {
  const channelId = Number(channel.id ?? 0);
  if (!(channelId > 0)) return { kind: 'none' };

  if (actionId === 'copy') {
    const base = await window.anixApi?.client?.getBaseUrl?.();
    const url = channelLinkUrl(channelId, typeof base === 'string' ? base : 'https://anixart.io/');
    const copied = await copyText(url);
    showToast(copied ? 'Ссылка скопирована' : url, copied ? 'ok' : 'info');
    return { kind: 'none' };
  }

  if (actionId === 'mute') {
    if (!requireAuth()) return { kind: 'none' };
    const ok = window.confirm(
      'Скрыть канал?\n\nЗаписи с этого канала перестанут отображаться в ленте, а также в поиске.',
    );
    if (!ok) return { kind: 'none' };
    try {
      await window.anixApi?.channel?.mute?.(channelId);
      showToast('Канал скрыт, действие можно отменить в настройках профиля');
      return { kind: 'muted', channelId };
    } catch (err) {
      showToast(String(err), 'err');
      return { kind: 'none' };
    }
  }

  if (actionId === 'unmute') {
    if (!requireAuth()) return { kind: 'none' };
    try {
      await window.anixApi?.channel?.unmute?.(channelId);
      showToast('Скрытие канала отменено, он будет снова отображаться в ленте и поиске');
      return { kind: 'unmuted', channelId };
    } catch (err) {
      showToast(String(err), 'err');
      return { kind: 'none' };
    }
  }

  if (actionId.startsWith('report:')) {
    if (!requireAuth()) return { kind: 'none' };
    const reasonId = Number(actionId.slice('report:'.length));
    if (!Number.isFinite(reasonId) || reasonId <= 0) return { kind: 'none' };
    try {
      await window.anixApi?.report?.submitChannel?.({ entity_id: channelId, reason_id: reasonId });
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

  return { kind: 'none' };
}
