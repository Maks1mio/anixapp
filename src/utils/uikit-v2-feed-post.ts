import type { FeedArticle, FeedChannel } from '../types/feed';
import type {
  UiV2FeedPostData,
  UiV2FeedPostMedia,
  UiV2FeedPostChannel,
} from '../components/uikit-v2/UiV2FeedPost.svelte';
import {
  articleHeadline,
  articleMediaItems,
  articlePreviewText,
  channelAvatarUrl,
} from './feed-article';
import { formatCommentTimestamp } from './comment';
import { resolveBadgeImageUrl, resolveBadgeName } from './badge';

const DEMO_IMG =
  'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg';

/** Тестовая GIF для UI Kit / ленты (Tenor). */
export const UIV2_FEED_POST_DEMO_GIF_URL =
  'https://media1.tenor.com/m/jtYZqBxGUwMAAAAd/mad-mew-mew-deltarune.gif';

function mapMedia(article: FeedArticle, max = 10): UiV2FeedPostMedia[] {
  return articleMediaItems(article, max).map((item) => ({
    url: item.url,
    kind: item.kind,
  }));
}

function formatPostTime(ts: number | undefined | null): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '';
  const sec = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  return formatCommentTimestamp(sec);
}

function mapChannel(channel: FeedChannel): UiV2FeedPostChannel {
  const title =
    channel.title?.trim() ||
    (channel.is_blog ? 'Блог' : 'Канал');
  return {
    id: channel.id,
    title,
    avatar: channelAvatarUrl(channel.avatar),
    badgeUrl: resolveBadgeImageUrl(channel.badge),
    badgeName: resolveBadgeName(channel.badge),
    isVerified: !!channel.is_verified,
    isSubscribed: !!channel.is_subscribed,
    isBlog: !!channel.is_blog,
  };
}

export function feedArticleToUiV2FeedPost(article: FeedArticle): UiV2FeedPostData {
  const channel = article.channel ?? { id: 0, title: 'Канал' };
  const repostRaw =
    article.repost_article && Number(article.repost_article.id) > 0
      ? article.repost_article
      : null;

  return {
    id: article.id,
    channel: mapChannel(channel),
    timeStr: formatPostTime(article.creation_date ?? article.last_update_date),
    headline: articleHeadline(article),
    preview: articlePreviewText(article),
    media: mapMedia(article),
    voteCount: article.vote_count,
    commentCount: article.comment_count,
    voted: Number(article.vote ?? 0) > 0,
    containsRepost: !!article.contains_repost_article,
    repost: repostRaw
      ? {
          channel: repostRaw.channel
            ? mapChannel(repostRaw.channel)
            : { title: 'Канал' },
          timeStr: formatPostTime(
            repostRaw.creation_date ?? repostRaw.last_update_date,
          ),
          headline: articleHeadline(repostRaw),
          preview: articlePreviewText(repostRaw),
          media: mapMedia(repostRaw),
        }
      : article.contains_repost_article
        ? { channel: { title: 'Канал' }, missing: true }
        : null,
  };
}

export const UIV2_FEED_POST_DEMO: UiV2FeedPostData[] = [
  {
    id: 'demo-text',
    channel: {
      id: 1,
      title: 'Nassc',
      avatar: DEMO_IMG,
      isVerified: true,
    },
    timeStr: '3 мин назад',
    preview: 'Отпуск закончился, эх',
    voteCount: 12,
    commentCount: 4,
  },
  {
    id: 'demo-headline',
    channel: {
      id: 2,
      title: 'AnixBlog',
      avatar: DEMO_IMG,
    },
    timeStr: 'вчера в 23:00',
    headline: 'Почему второй сезон оправдал ожидания',
    preview:
      'Разбор ключевых сцен, саундтрека и того, как режиссёр выстроил финальную арку без лишнего фансервиса.',
    voteCount: 248,
    commentCount: 91,
    voted: true,
  },
  {
    id: 'demo-image',
    channel: {
      id: 3,
      title: 'FrameLab',
      avatar: DEMO_IMG,
      isSubscribed: true,
    },
    timeStr: '2 ч назад',
    preview: 'Кадр из финала — свет и композиция на высоте.',
    media: [{ url: DEMO_IMG, kind: 'image' }],
    voteCount: 56,
    commentCount: 7,
  },
  {
    id: 'demo-carousel',
    channel: {
      id: 6,
      title: 'Илья',
      avatar: DEMO_IMG,
    },
    timeStr: '14 ч назад',
    preview: 'скамные ссылки на первой позиции',
    media: [
      { url: DEMO_IMG, kind: 'image' },
      { url: DEMO_IMG, kind: 'image' },
      { url: DEMO_IMG, kind: 'image' },
    ],
    voteCount: 150,
    commentCount: 12,
  },
  {
    id: 'demo-gif',
    channel: {
      id: 7,
      title: 'YuremiArt',
      avatar: DEMO_IMG,
      isVerified: true,
    },
    timeStr: '20 ч назад',
    preview: 'Mad Mew Mew — тестовая GIF из Tenor',
    media: [
      {
        url: UIV2_FEED_POST_DEMO_GIF_URL,
        kind: 'gif',
      },
    ],
    voteCount: 80,
    commentCount: 31,
  },
  {
    id: 'demo-gallery',
    channel: {
      id: 4,
      title: 'ScreenshotDaily',
      avatar: DEMO_IMG,
    },
    timeStr: '5 ч назад',
    headline: 'Подборка кадров недели',
    preview: 'Четыре кадра из разных тайтлов — для вдохновения и обсуждения.',
    media: [
      { url: DEMO_IMG, kind: 'image' },
      { url: DEMO_IMG, kind: 'image' },
      { url: DEMO_IMG, kind: 'image' },
      { url: DEMO_IMG, kind: 'image' },
    ],
    voteCount: 103,
    commentCount: 22,
  },
  {
    id: 'demo-repost',
    channel: {
      id: 5,
      title: 'Maks1mio',
      avatar: DEMO_IMG,
    },
    timeStr: 'сегодня в 12:40',
    preview: 'Согласен полностью — особенно про финал.',
    containsRepost: true,
    repost: {
      channel: {
        id: 1,
        title: 'Nassc',
        avatar: DEMO_IMG,
        isVerified: true,
      },
      timeStr: 'вчера в 23:00',
      preview: 'Отпуск закончился, эх',
      media: [{ url: DEMO_IMG, kind: 'image' }],
    },
    voteCount: 8,
    commentCount: 2,
  },
];
