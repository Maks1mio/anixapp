import type { FeedArticle, FeedChannel } from '../types/feed';
  import type {
    UiV2FeedPostData,
    UiV2FeedPostMedia,
    UiV2FeedPostChannel,
  } from '../components/uikit-v2/UiV2FeedPost.svelte';
  import type { ArticleFormatBlock } from './article-block-format';
  import {
    ARTICLE_VOTE_PLUS,
    articleFeedContentParts,
    articleFeedPreviewParts,
    articleMediaItems,
    articlePreviewText,
    articleRenderBlocks,
    articleTags,
    channelAvatarUrl,
    normalizeArticleVote,
    type RenderBlock,
  } from './feed-article';
import { formatCommentTimestamp } from './comment';
import { resolveBadgeImageUrl, resolveBadgeName } from './badge';
import { mapArticleCommentToTop } from './feed-top-comment';

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

/** Текст + медиа в исходном порядке блоков (как в приложении). */
function mapBodyBlocks(article: FeedArticle): NonNullable<UiV2FeedPostData['bodyBlocks']> {
  const out: NonNullable<UiV2FeedPostData['bodyBlocks']> = [];
  for (const block of articleRenderBlocks(article) as RenderBlock[]) {
    if (block.kind === 'media') {
      if (!block.items.length) continue;
      const prev = out[out.length - 1];
      // Соседние media-блоки склеиваем → плитка/карусель, а не стопка одиночных.
      if (prev && prev.kind === 'media') {
        const seen = new Set(prev.items.map((item) => item.url));
        for (const item of block.items) {
          if (seen.has(item.url)) continue;
          seen.add(item.url);
          prev.items.push(item);
        }
        continue;
      }
      out.push({ kind: 'media', items: [...block.items] });
      continue;
    }
    if (block.kind === 'embed') continue;
    out.push(block);
  }
  return out;
}

function formatPostTime(ts: number | undefined | null): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '';
  const sec = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  return formatCommentTimestamp(sec);
}

function mapLastComment(article: FeedArticle): UiV2FeedPostData['lastComment'] {
  const mapped = mapArticleCommentToTop(article.last_comment);
  if (!mapped) return null;
  return {
    ...mapped,
    timeStr: formatPostTime(article.last_comment?.creation_date ?? article.last_comment?.date) || undefined,
  };
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
  const parts = articleFeedPreviewParts(article);
  const content = articleFeedContentParts(article);
  const beforeBlocks: ArticleFormatBlock[] = content.before;
  const afterBlocks: ArticleFormatBlock[] = content.after;
  const repostRaw =
    article.repost_article && Number(article.repost_article.id) > 0
      ? article.repost_article
      : null;
  const authorLogin = article.author?.login?.trim() || '';
  const authorId = Number(article.author?.id ?? 0);
  const signedAuthor =
    article.is_signed && authorId > 0 && authorLogin
      ? {
          id: authorId,
          login: authorLogin,
          avatar: article.author?.avatar ?? null,
        }
      : null;

  return {
    id: article.id,
    channel: mapChannel(channel),
    timeStr: formatPostTime(article.creation_date ?? article.last_update_date),
    // Заголовки рендерятся как header-блоки — отдельный headline даёт дубль.
    preview: parts.lead,
    moreText: parts.more || undefined,
    beforeBlocks,
    afterBlocks,
    bodyBlocks: mapBodyBlocks(article),
    canExpand: content.canExpand,
    media: mapMedia(article),
    tags: articleTags(article),
    voteCount: article.vote_count,
    commentCount: article.comment_count,
    repostCount: article.repost_count,
    vote: normalizeArticleVote(article.vote),
    voted: normalizeArticleVote(article.vote) === ARTICLE_VOTE_PLUS,
    lastComment: mapLastComment(article),
    containsRepost: !!article.contains_repost_article,
    signedAuthor,
    repost: repostRaw
      ? (() => {
          const repostContent = articleFeedContentParts(repostRaw);
          return {
            channel: repostRaw.channel
              ? mapChannel(repostRaw.channel)
              : { title: 'Канал' },
            timeStr: formatPostTime(
              repostRaw.creation_date ?? repostRaw.last_update_date,
            ),
            beforeBlocks: repostContent.before,
            afterBlocks: repostContent.after,
            bodyBlocks: mapBodyBlocks(repostRaw),
            preview: articlePreviewText(repostRaw) || undefined,
            media: mapMedia(repostRaw),
          };
        })()
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
    lastComment: {
      author: 'Velour_',
      avatar: DEMO_IMG,
      text: 'Базовый минимум — особенно финал.',
    },
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
      'Разбор ключевых сцен, саундтрека и того, как режиссёр выстроил финальную арку без лишнего фансервиса. Ещё два абзаца про монтаж, свет и то, почему финал держится на персонажах, а не на твистах.',
    tags: ['Anime', 'Season2'],
    voteCount: 248,
    commentCount: 91,
    voted: true,
    vote: 2,
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
    moreText: 'P.S: ещё два кадра в полном посте — свет и композиция на высоте.',
    canExpand: true,
    media: [{ url: DEMO_IMG, kind: 'image' }],
    tags: ['TheOldTeam', 'AnimeMemes'],
    voteCount: 56,
    commentCount: 7,
    lastComment: {
      author: 'Velour_',
      avatar: DEMO_IMG,
      text: '1. Какой суперспецифичный музей ты бы с удовольствием посетил?\n2. Что тебя в последнее время приятно удивило?',
    },
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
    lastComment: {
      author: 'FrameLab',
      avatar: DEMO_IMG,
      text: '1. Какой суперспецифичный музей ты бы с удовольствием посетил?\n2. Что тебя в последнее время приятно удивило?',
    },
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
