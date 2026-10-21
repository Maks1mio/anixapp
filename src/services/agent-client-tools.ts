/**
 * «Client tools» for AAWA: anixback asks, the app runs the call through its own Anixart
 * session (the token never leaves the app) and posts back a compact result. The agent
 * gets the same reach as the user — other profiles, their lists, votes, comments, feed.
 * Read-only: anything that changes data goes through a confirmation card instead.
 */
import { resolveProfileId, snapshotItem } from './agent-profile';

/** watching … dropped → Anixart bookmark type. */
const LIST_TYPES: Record<string, number> = { watching: 1, planned: 2, completed: 3, hold_on: 4, dropped: 5 };
const PER_PAGE = 25;

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown, max = 300): string | null {
  return typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null;
}

function date(sec: unknown): string | null {
  const n = num(sec);
  return n && n > 0 ? new Date(n * 1000).toISOString().slice(0, 16).replace('T', ' ') : null;
}

function content(res: unknown): unknown[] {
  const r = rec(res);
  return [r?.content, r?.releases, r?.profiles].find((x): x is unknown[] => Array.isArray(x)) ?? [];
}

function page(res: unknown, shown: number) {
  const r = rec(res);
  return { total: num(r?.total_count) ?? shown, pages: num(r?.total_page_count), shown };
}

function user(raw: unknown) {
  const r = rec(raw);
  const id = num(r?.id);
  if (!r || !id) return null;
  return { id, login: str(r.login, 64), ...(r.is_online === true ? { online: true } : {}) };
}

function release(raw: unknown) {
  const r = rec(raw);
  const base = snapshotItem(raw);
  if (!r || !base) return null;
  const vote = num(r.my_vote ?? r.your_vote ?? r.vote);
  return { ...base, ...(vote && vote > 0 ? { vote } : {}) };
}

function comment(raw: unknown) {
  const r = rec(raw);
  if (!r) return null;
  const rel = rec(r.release);
  return {
    id: num(r.id),
    author: user(r.profile),
    text: str(r.message, 500),
    likes: num(r.likes_count ?? r.vote_count),
    date: date(r.timestamp),
    ...(rel ? { release: { id: num(rel.id), title: str(rel.title_ru ?? rel.title_original, 120) } } : {}),
    ...(r.is_spoiler === true ? { spoiler: true } : {}),
  };
}

function collection(raw: unknown) {
  const r = rec(raw);
  if (!r) return null;
  return {
    id: num(r.id),
    title: str(r.title, 120),
    author: user(r.creator),
    releases: num(r.release_count),
    likes: num(r.favorites_count),
    about: str(r.description, 200),
  };
}

/** Feed post: channel, date and the text blocks (no media). */
function article(raw: unknown) {
  const r = rec(raw);
  if (!r) return null;
  const blocks = Array.isArray(rec(r.payload)?.blocks) ? (rec(r.payload)?.blocks as unknown[]) : [];
  const text = blocks
    .map((b) => str(rec(rec(b)?.data)?.text, 400))
    .filter(Boolean)
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .slice(0, 500);
  return {
    id: num(r.id),
    channel: str(rec(r.channel)?.title, 80),
    author: user(r.author ?? r.profile),
    date: date(r.creation_date ?? r.timestamp),
    text: text || null,
    likes: num(r.vote_count ?? r.likes_count),
    comments: num(r.comment_count),
  };
}

function compactList<T>(list: unknown[], map: (x: unknown) => T | null, limit = PER_PAGE): T[] {
  return list.map(map).filter((x): x is T => x != null).slice(0, limit);
}

async function profileId(raw: unknown): Promise<number> {
  const id = num(raw) ?? 0;
  return id > 0 ? id : resolveProfileId();
}

function hidden(res: unknown, what: string) {
  const r = rec(res);
  return r && num(r.code) && num(r.code) !== 0 ? { error: 'hidden', hint: `${what} закрыт(ы) настройками приватности или недоступны.` } : null;
}

async function run(name: string, args: Record<string, unknown>): Promise<unknown> {
  const api = window.anixApi;
  if (!api) return { error: 'no_api' };
  const p = num(args.page) ?? 0;
  switch (name) {
    case 'find_user': {
      const res = await api.search.profiles(String(args.query ?? ''), 0);
      const users = compactList(content(res), user, 10);
      return { users, ...(users.length ? {} : { hint: 'Никого не нашлось — уточни логин у пользователя.' }) };
    }
    case 'get_user_profile': {
      const id = await profileId(args.user_id);
      const res = await api.profile.info(id);
      const pr = rec(rec(res)?.profile);
      if (!pr) return { error: 'not_found', hint: 'Профиль не найден.' };
      return {
        id,
        login: str(pr.login, 64),
        is_me: rec(res)?.is_my_profile === true,
        status: str(pr.status, 200),
        last_seen: date(pr.last_activity_time),
        registered: date(pr.register_date)?.slice(0, 10) ?? null,
        ...(pr.is_private === true ? { private: true } : {}),
        ...(pr.is_banned === true ? { banned: true } : {}),
        ...(pr.is_sponsor === true ? { sponsor: true } : {}),
        lists: {
          watching: num(pr.watching_count),
          planned: num(pr.plan_count),
          completed: num(pr.completed_count),
          hold_on: num(pr.hold_on_count),
          dropped: num(pr.dropped_count),
          favorites: num(pr.favorite_count),
        },
        watched_episodes: num(pr.watched_episode_count),
        watched_hours: pr.watched_time != null ? Math.round(Number(pr.watched_time) / 3600) : null,
        friends: num(pr.friend_count),
        collections: num(pr.collection_count),
        comments: num(pr.comment_count),
        friend_status: num(pr.friend_status),
        badge: str(rec(pr.badge)?.name, 60),
        recent_votes: compactList(Array.isArray(pr.votes) ? pr.votes : [], release, 10),
        recent_history: compactList(Array.isArray(pr.history) ? pr.history : [], release, 10),
      };
    }
    case 'get_user_list': {
      const id = await profileId(args.user_id);
      const res = await api.profile.getBookmarks(id, LIST_TYPES[String(args.list)] ?? 1, p, 1, 0, 0);
      const items = compactList(content(res), release);
      return hidden(res, 'Список') ?? { ...page(res, items.length), releases: items };
    }
    case 'get_user_votes': {
      const id = await profileId(args.user_id);
      const res = await api.profile.getVotedReleases(id, p, 1);
      const items = compactList(content(res), release);
      return hidden(res, 'Оценки') ?? { ...page(res, items.length), releases: items };
    }
    case 'get_user_collections': {
      const id = await profileId(args.user_id);
      const res = await api.collection.profileCollections(id, p);
      const items = compactList(content(res), collection, 15);
      return hidden(res, 'Коллекции') ?? { ...page(res, items.length), collections: items };
    }
    case 'get_user_comments': {
      const id = await profileId(args.user_id);
      const res = await api.profile.getReleaseComments(id, p, 1);
      const items = compactList(content(res), comment, 15);
      return hidden(res, 'Комментарии') ?? { ...page(res, items.length), comments: items };
    }
    case 'get_user_friends': {
      const id = await profileId(args.user_id);
      const res = await api.profile.getFriends(id, p);
      const items = compactList(content(res), user, 30);
      return hidden(res, 'Друзья') ?? { ...page(res, items.length), friends: items };
    }
    case 'get_release_comments': {
      const res = await api.comments.release.list(num(args.release_id) ?? 0, p, args.sort === 'new' ? 1 : 3);
      const items = compactList(content(res), comment, 15);
      return { ...page(res, items.length), comments: items };
    }
    case 'get_collection': {
      const id = num(args.collection_id) ?? 0;
      const [info, list] = await Promise.all([api.collection.info(id), api.collection.getReleases(id, p)]);
      const c = collection(rec(info)?.collection ?? info);
      if (!c?.id) return { error: 'not_found', hint: 'Коллекция не найдена или закрыта.' };
      const items = compactList(content(list), release);
      return { ...c, ...page(list, items.length), titles: items };
    }
    case 'get_feed': {
      const res = args.kind === 'latest' ? await api.feed.latest(p) : await api.feed.my(p);
      const items = compactList(content(res), article, 12);
      return { ...page(res, items.length), posts: items };
    }
  }
  return { error: 'unknown_tool' };
}

export async function runAgentClientTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    return await run(name, args);
  } catch (err) {
    return {
      error: 'request_failed',
      message: (err instanceof Error ? err.message : String(err)).slice(0, 160),
      hint: 'Anixart не ответил на запрос. Не повторяй его — ответь тем, что есть.',
    };
  }
}
