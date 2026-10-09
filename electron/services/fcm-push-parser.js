'use strict';

/**
 * Парсер FCM data-сообщений Anixart → payload для system-notifications.
 * Логика как в Android NotificationService (ACTION_*).
 */

const SPOILER = '[сообщение скрыто, так как может содержать спойлер]';

function str(data, key) {
  const v = data?.[key];
  if (v == null) return '';
  return String(v).trim();
}

function num(data, key) {
  const n = Number(str(data, key));
  return Number.isFinite(n) ? n : 0;
}

function commentMessage(data) {
  if (String(data?.comment_is_spoiler || '').toLowerCase() === 'true') return SPOILER;
  return str(data, 'comment_message') || SPOILER;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {Record<string, unknown>} data — FCM data map
 * @returns {{ title: string, body: string, image?: string, kind: string, deepLink?: { type: string, id: number }, id: string } | null}
 */
function parseAnixartPushData(data) {
  if (!data || typeof data !== 'object') return null;
  const action = str(data, 'action');
  if (!action) return null;

  const idBase = `fcm-${action}-${Date.now()}`;

  switch (action) {
    case 'ACTION_OPEN_EPISODE': {
      const releaseId = num(data, 'release_id');
      if (!releaseId) return null;
      const titleRu = str(data, 'release_title_ru') || 'Без названия';
      const episode = str(data, 'episode_name') || 'Без названия';
      const typeName = str(data, 'type_name') || 'Без названия';
      return {
        id: `fcm-episode-${releaseId}-${episode}`,
        title: `Новая серия «${titleRu}»`,
        body: `Вышла «${episode}» в варианте «${typeName}»`,
        image: str(data, 'release_image') || undefined,
        kind: 'episode',
        deepLink: { type: 'release', id: releaseId },
      };
    }

    case 'ACTION_OPEN_RELEASE': {
      const releaseId = num(data, 'release_id');
      if (!releaseId) return null;
      const titleRu = str(data, 'release_title_ru') || 'Без названия';
      return {
        id: `fcm-release-${releaseId}`,
        title: `Новый релиз «${titleRu}»`,
        body: `В приложение была добавлена страница релиза «${titleRu}»`,
        image: str(data, 'release_image') || undefined,
        kind: 'related',
        deepLink: { type: 'release', id: releaseId },
      };
    }

    case 'ACTION_OPEN_ARTICLE': {
      const articleId = num(data, 'article_id');
      if (!articleId) return null;
      const channel = str(data, 'channel_title') || 'канал';
      const articleText = stripHtml(str(data, 'article_text'));
      const hasText = !!articleText;
      return {
        id: `fcm-article-${articleId}`,
        title: hasText ? articleText.slice(0, 120) : `Новая запись на канале «${channel}»`,
        body: hasText
          ? `Новая запись на канале «${channel}»`
          : 'Нажмите, чтобы посмотреть содержимое',
        image: str(data, 'article_media_file_url') || undefined,
        kind: 'article',
        deepLink: { type: 'article', id: articleId },
      };
    }

    case 'ACTION_OPEN_RELEASE_COMMENT':
    case 'ACTION_OPEN_COLLECTION_COMMENT':
    case 'ACTION_OPEN_ARTICLE_COMMENT': {
      const login = str(data, 'profile_login');
      const msg = commentMessage(data);
      if (!login) return null;
      const releaseId = num(data, 'release_id');
      const collectionId = num(data, 'collection_id');
      const articleId = num(data, 'article_id');
      const commentId = num(data, 'comment_id');
      let deepLink;
      if (action === 'ACTION_OPEN_ARTICLE_COMMENT' && articleId) {
        deepLink = { type: 'article', id: articleId };
      } else if (action === 'ACTION_OPEN_COLLECTION_COMMENT' && collectionId) {
        deepLink = { type: 'collection', id: collectionId };
      } else if (releaseId) {
        deepLink = { type: 'release', id: releaseId };
      }
      return {
        id: `fcm-comment-${commentId || idBase}`,
        title: 'Ответ на комментарий',
        body: `Новый ответ от «${login}»: ${msg}`,
        image: str(data, 'profile_avatar') || undefined,
        kind: 'comment',
        deepLink,
      };
    }

    case 'ACTION_OPEN_MY_COLLECTION_COMMENT': {
      const login = str(data, 'profile_login');
      const collectionTitle = str(data, 'collection_title') || 'коллекция';
      const collectionId = num(data, 'collection_id');
      const msg = commentMessage(data);
      if (!login || !collectionId) return null;
      return {
        id: `fcm-my-collection-comment-${collectionId}-${num(data, 'parent_comment_id')}`,
        title: 'Комментарий к вашей коллекции',
        body: `Новый комментарий к вашей коллекции «${collectionTitle}» от «${login}»: ${msg}`,
        image: str(data, 'profile_avatar') || undefined,
        kind: 'comment',
        deepLink: { type: 'collection', id: collectionId },
      };
    }

    case 'ACTION_OPEN_MY_ARTICLE_COMMENT': {
      const login = str(data, 'profile_login');
      const articleId = num(data, 'article_id');
      const msg = commentMessage(data);
      const preview = stripHtml(str(data, 'article_text'));
      if (!login || !articleId) return null;
      const body = preview
        ? `Новый комментарий к Вашей блоговой записи «${preview.slice(0, 40)}» от «${login}»: ${msg}`
        : `Новый комментарий к Вашей блоговой записи от «${login}»: ${msg}`;
      return {
        id: `fcm-my-article-comment-${articleId}-${num(data, 'parent_comment_id')}`,
        title: 'Комментарий к вашей записи',
        body,
        image: str(data, 'profile_avatar') || undefined,
        kind: 'comment',
        deepLink: { type: 'article', id: articleId },
      };
    }

    case 'ACTION_OPEN_PROFILE_FRIEND': {
      const profileId = num(data, 'profile_id');
      const login = str(data, 'profile_login') || 'Пользователь';
      const status = str(data, 'status'); // 0 request, 1 accept
      const accept = status === '1';
      if (!profileId) return null;
      return {
        id: `fcm-friend-${profileId}-${status}`,
        title: accept
          ? `${login} добавил вас в друзья`
          : `${login} хочет добавить вас в друзья`,
        body: accept
          ? `Пользователь «${login}» внёс вас в список своих друзей`
          : `Пользователь «${login}» хочет внести вас в список друзей`,
        image: str(data, 'profile_avatar') || undefined,
        kind: accept ? 'friend-accept' : 'friend',
        deepLink: { type: 'profile', id: profileId },
      };
    }

    case 'ACTION_ACHIEVEMENT_OBTAINED': {
      const name = str(data, 'name') || 'Без названия';
      return {
        id: `fcm-achievement-${name}-${str(data, 'image_url').slice(-24)}`,
        title: 'Новое достижение',
        body: `«${name}»`,
        image: str(data, 'image_url') || undefined,
        kind: 'achievement',
        deepLink: { type: 'profile-badge', id: 0 },
      };
    }

    case 'ACTION_REPORT_PROCESS': {
      const type = num(data, 'notification_report_type');
      let body = 'Ваша жалоба была обработана модерацией';
      let deepLink;
      switch (type) {
        case 1: {
          const titleRu = str(data, 'release_title_ru') || 'релиз';
          const releaseId = num(data, 'release_id');
          body = `Ваша жалоба на релиз «${titleRu}» была успешно обработана модерацией`;
          if (releaseId) deepLink = { type: 'release', id: releaseId };
          break;
        }
        case 2: {
          const login = str(data, 'comment_profile_login') || 'пользователь';
          body = `Ваша жалоба на комментарий пользователя «${login}» была успешно обработана модерацией`;
          break;
        }
        case 3: {
          const title = str(data, 'collection_title') || 'коллекция';
          const collectionId = num(data, 'release_id'); // Android передаёт collection id в release_id
          body = `Ваша жалоба на коллекцию «${title}» была успешно обработана модерацией`;
          if (collectionId) deepLink = { type: 'collection', id: collectionId };
          break;
        }
        case 4: {
          const login = str(data, 'comment_profile_login') || 'пользователь';
          body = `Ваша жалоба на комментарий пользователя «${login}» была успешно обработана модерацией`;
          break;
        }
        case 5: {
          const titleRu = str(data, 'release_title_ru') || 'релиз';
          body = `Ваша жалоба на эпизод релиза «${titleRu}» была успешно обработана модерацией`;
          break;
        }
        case 6: {
          const login = str(data, 'profile_login') || 'пользователь';
          body = `Ваша жалоба на пользователя «${login}» была успешно обработана модерацией`;
          break;
        }
        default:
          break;
      }
      return {
        id: `fcm-report-${type}-${idBase}`,
        title: 'Обработка жалобы',
        body,
        kind: 'default',
        deepLink,
      };
    }

    default:
      return null;
  }
}

module.exports = { parseAnixartPushData };
