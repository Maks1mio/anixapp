import { get, writable } from 'svelte/store';
import { isAuthenticated } from './auth';
import { fetchAllNotifications } from './notifications';
import { parseNotification } from '../utils/notification-format';
import { resolveCdnAssetUrl } from '../utils/posterUrl';
import type { DeviceNotificationSettings, DeviceNotificationPayload } from '../types/electron';

const FALLBACK_TEST_IMAGE_RAW = 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg';

type TestPerson = { name: string; image: string; isSelf?: boolean };
type TestAnime = { title: string; image: string };

let testPeopleCache: TestPerson[] = [];
let testPeopleCachedAt = 0;
let testFavoritesCache: TestAnime[] = [];
let testFavoritesCachedAt = 0;

/** CDN без Referer отдаёт пустышку — для UI нужен anix-cdn:// / __cdn прокси. */
function fallbackTestImage(): string {
  return resolveCdnAssetUrl(FALLBACK_TEST_IMAGE_RAW) || FALLBACK_TEST_IMAGE_RAW;
}

function personImage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return fallbackTestImage();
  return resolveCdnAssetUrl(raw) || fallbackTestImage();
}

function pickPerson(people: TestPerson[]): TestPerson {
  if (!people.length) return { name: 'AnixUser', image: fallbackTestImage() };
  return people[Math.floor(Math.random() * people.length)]!;
}

function friendsOnly(people: TestPerson[]): TestPerson[] {
  const friends = people.filter((p) => !p.isSelf);
  return friends.length ? friends : people;
}

function pickAnime(list: TestAnime[], fallbackTitle = 'Необъятный океан 3'): TestAnime {
  if (!list.length) return { title: fallbackTitle, image: fallbackTestImage() };
  return list[Math.floor(Math.random() * list.length)]!;
}

function pickText(variants: string[]): string {
  return variants[Math.floor(Math.random() * variants.length)] ?? variants[0] ?? '';
}

function fmt(template: string, map: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => map[key] ?? '');
}

/** Друзья (+ я) — для соц. превью уведомлений. */
async function loadTestPeople(): Promise<TestPerson[]> {
  const now = Date.now();
  if (testPeopleCache.length && now - testPeopleCachedAt < 5 * 60_000) {
    return testPeopleCache;
  }
  const people: TestPerson[] = [];
  const seen = new Set<string>();
  const push = (name: unknown, avatar: unknown, isSelf = false) => {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n || seen.has(n)) return;
    seen.add(n);
    people.push({ name: n, image: personImage(avatar), isSelf });
  };
  try {
    const selfRes = await window.anixApi?.profile?.self?.() as {
      profile?: { id?: number; login?: string; avatar?: string };
    } | null;
    const self = selfRes?.profile;
    push(self?.login, self?.avatar, true);
    const uid = Number(self?.id);
    if (Number.isFinite(uid) && uid > 0) {
      const friendsRes = await window.anixApi?.profile?.getFriends?.(uid, 0) as {
        content?: Array<{ login?: string; avatar?: string }>;
      } | null;
      for (const fr of friendsRes?.content ?? []) {
        push(fr?.login, fr?.avatar, false);
      }
    }
  } catch {
    // без сети — останется fallback
  }
  testPeopleCache = people;
  testPeopleCachedAt = now;
  return people;
}

/** Избранные релизы — постеры для серий / релизов в демо. */
async function loadTestFavorites(): Promise<TestAnime[]> {
  const now = Date.now();
  if (testFavoritesCache.length && now - testFavoritesCachedAt < 5 * 60_000) {
    return testFavoritesCache;
  }
  const favs: TestAnime[] = [];
  const seen = new Set<string>();
  try {
    const favRes = await window.anixApi?.favorites?.all?.(0, 1, 0, 0) as {
      content?: unknown[];
      releases?: unknown[];
    } | null;
    const rows = (favRes?.content ?? favRes?.releases ?? []) as Array<Record<string, unknown>>;
    for (const raw of rows) {
      const release = (raw?.release && typeof raw.release === 'object'
        ? raw.release
        : raw) as Record<string, unknown>;
      const title = String(release?.title_ru || release?.title || raw?.title_ru || '').trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      favs.push({ title, image: personImage(release?.image || release?.poster || raw?.image) });
    }
  } catch {
    // избранное опционально
  }
  testFavoritesCache = favs;
  testFavoritesCachedAt = now;
  return favs;
}

function buildPersonalizedTest(
  kind: string,
  people: TestPerson[],
  favorites: TestAnime[],
): DeviceNotificationPayload {
  const social = friendsOnly(people);
  const a = pickPerson(social);
  let b = pickPerson(people);
  if (people.length > 1 && b.name === a.name) b = pickPerson(people.filter((p) => p.name !== a.name));
  const anime = pickAnime(favorites);
  const id = `test-${kind}-${Date.now()}`;
  const names = { name: a.name, other: b.name, title: anime.title };

  switch (kind) {
    case 'friend':
      return {
        id,
        title: 'Друзья',
        body: fmt(pickText([
          '«{name}» добавил вас в друзья',
          '«{name}» принял вашу заявку в друзья',
          '«{name}» хочет добавить вас в друзья',
          'У вас новый друг — «{name}»',
        ]), names),
        image: a.image,
        kind: Math.random() > 0.5 ? 'friend' : 'friend-accept',
        force: true,
      };
    case 'comment':
      return {
        id,
        title: 'Комментарий',
        body: fmt(pickText([
          '«{name}»: {other}, зацени новую серию!',
          '«{name}»: кто тоже смотрит это?',
          '«{name}» ответил вам: согласен на все 100%',
          '«{name}»: {other}, напиши в личку, есть идея',
          '«{name}»: ахах, вот это поворот',
          '«{name}» упомянул вас в обсуждении',
        ]), names),
        image: a.image,
        kind: 'comment',
        force: true,
      };
    case 'article':
      return {
        id,
        title: 'Запись',
        body: fmt(pickText([
          '«{name}»: свежий пост в ленте — загляни',
          '«{name}» опубликовал новую запись',
          'В канале «{name}» вышел новый пост',
          '«{name}»: подборка на выходные уже тут',
        ]), names),
        image: a.image,
        kind: 'article',
        force: true,
      };
    case 'release':
      return {
        id,
        title: 'Релиз',
        body: fmt(pickText([
          'Добавлена страница релиза «{title}»',
          'В каталоге появился «{title}»',
          'Новый релиз в приложении — «{title}»',
          'Доступен связанный релиз «{title}»',
        ]), names),
        image: anime.image,
        kind: 'related',
        force: true,
      };
    case 'episode':
      return {
        id,
        title: 'Серия',
        body: fmt(pickText([
          'Вышла «11 серия» «{title}» · JAM CLUB · Kodik',
          '«3 серия» «{title}» уже на Anilibria',
          'Новая серия «{title}» в варианте AniDUB',
          '«7 серия» «{title}» доступна на источнике Kodik',
        ]), names),
        image: anime.image,
        kind: 'episode',
        force: true,
      };
    default:
      return {
        id,
        title: 'AnixApp',
        body: pickText([
          'Так выглядят уведомления на этом устройстве',
          'Превью баннера и системного тоста',
          'Проверка звука и внешнего вида',
        ]),
        image: anime.image !== fallbackTestImage() ? anime.image : a.image,
        kind: 'default',
        force: true,
      };
  }
}

export type CornerPreviewItem = {
  title: string;
  body: string;
  kind: string;
  image: string;
};

/** Стек для превью угла: друзья на соцтипах, избранное на серии/релизе. */
export async function buildCornerPreviewItems(): Promise<CornerPreviewItem[]> {
  const [people, favorites] = await Promise.all([loadTestPeople(), loadTestFavorites()]);
  const social = friendsOnly(people);
  const f1 = pickPerson(social);
  let f2 = pickPerson(social);
  if (social.length > 1 && f2.name === f1.name) {
    f2 = pickPerson(social.filter((p) => p.name !== f1.name));
  }
  const author = pickPerson(people);
  const ep = pickAnime(favorites, 'Необъятный океан 3');
  let rel = pickAnime(favorites, 'Кае не страшно');
  if (favorites.length > 1 && rel.title === ep.title) {
    rel = pickAnime(favorites.filter((x) => x.title !== ep.title), 'Кае не страшно');
  }
  return [
    {
      title: 'Серия',
      body: `Вышла «11 серия» «${ep.title}» · JAM CLUB · Kodik`,
      kind: 'episode',
      image: ep.image,
    },
    {
      title: 'Комментарий',
      body: `«${f1.name}»: зацени новую серию!`,
      kind: 'comment',
      image: f1.image,
    },
    {
      title: 'Друзья',
      body: `«${f2.name}» добавил вас в друзья`,
      kind: 'friend',
      image: f2.image,
    },
    {
      title: 'Запись',
      body: `«${author.name}»: свежий пост в ленте`,
      kind: 'article',
      image: author.image,
    },
    {
      title: 'Релиз',
      body: `Добавлена страница релиза «${rel.title}»`,
      kind: 'related',
      image: rel.image,
    },
  ];
}

/**
 * Настройки уведомлений устройства (нативные тосты + баннеры + звук).
 * Хранятся в Electron config (см. electron/lib/config-store.js).
 */

const DEFAULT_SETTINGS: DeviceNotificationSettings = {
  desktopEnabled: true,
  useNativeNotifications: true,
  customBannersEnabled: true,
  showPreview: true,
  flashTaskbar: true,
  soundEnabled: true,
  soundId: 'chime',
  volume: 100,
  bannerCount: 3,
  position: 'bottom-right',
  appearance: 'banner',
  bannerStyle: 'compact',
  alwaysOnTop: true,
  muted: false,
  showWhenFocused: false,
  typeChannels: {
    episode: 'both',
    article: 'both',
    friend: 'both',
    comment: 'both',
    release: 'both',
    default: 'both',
  },
};

export const deviceNotificationSettings = writable<DeviceNotificationSettings>(DEFAULT_SETTINGS);

type DeviceNotificationBridge = NonNullable<NonNullable<Window['electron']>['notifications']>;

function bridge(): DeviceNotificationBridge | null {
  return window.electron?.notifications ?? null;
}

export function hasDeviceNotifications(): boolean {
  return !!bridge();
}

function mergeSettings(data?: Partial<DeviceNotificationSettings> | null): DeviceNotificationSettings {
  const src = data || {};
  const rawStyle = (src as { bannerStyle?: string }).bannerStyle;
  const bannerStyle =
    rawStyle === 'full' || rawStyle === 'compact' || rawStyle === 'minimal'
      ? rawStyle
      : rawStyle === 'rich'
        ? 'compact'
        : (src.bannerStyle ?? DEFAULT_SETTINGS.bannerStyle);
  return {
    ...DEFAULT_SETTINGS,
    ...src,
    bannerStyle,
    typeChannels: {
      ...DEFAULT_SETTINGS.typeChannels,
      ...(src.typeChannels || {}),
    },
  };
}

export async function loadDeviceNotificationSettings(): Promise<DeviceNotificationSettings> {
  const api = bridge();
  if (!api) return get(deviceNotificationSettings);
  try {
    const data = await api.getSettings();
    const merged = mergeSettings(data);
    deviceNotificationSettings.set(merged);
    return merged;
  } catch {
    return get(deviceNotificationSettings);
  }
}

export async function saveDeviceNotificationSettings(
  patch: Partial<DeviceNotificationSettings>,
): Promise<void> {
  deviceNotificationSettings.update((s) => mergeSettings({
    ...s,
    ...patch,
    typeChannels: { ...s.typeChannels, ...(patch.typeChannels || {}) },
  }));
  const api = bridge();
  if (!api) return;
  try {
    const data = await api.saveSettings(patch);
    deviceNotificationSettings.set(mergeSettings(data));
  } catch {
    // оставляем оптимистичное значение
  }
}

export async function previewNotificationSound(soundId?: string): Promise<void> {
  await bridge()?.previewSound(soundId);
}

export async function sendTestDeviceNotification(kind?: string): Promise<void> {
  const api = bridge();
  if (!api) return;
  const key = typeof kind === 'string' && kind ? kind : 'episode';
  try {
    const [people, favorites] = await Promise.all([loadTestPeople(), loadTestFavorites()]);
    await api.show(buildPersonalizedTest(key, people, favorites));
  } catch {
    await api.test(key);
  }
}

/** Живой превью угла расположения — баннеры на реальном экране. */
export async function previewNotificationCorner(
  position: string,
  items?: Array<{ title?: string; body?: string; kind?: string; image?: string }>,
): Promise<void> {
  let payload = items;
  if (!payload?.length) {
    try {
      payload = await buildCornerPreviewItems();
    } catch {
      payload = undefined;
    }
  }
  await bridge()?.previewCorner?.(position as DeviceNotificationSettings['position'], payload);
}

export async function endNotificationCornerPreview(): Promise<void> {
  await bridge()?.endPreviewCorner?.();
}

/**
 * Показать уведомление устройства.
 * Если Electron недоступен — no-op (веб/TV/мобильная сборка).
 */
export async function showDeviceNotification(payload: DeviceNotificationPayload): Promise<void> {
  await bridge()?.show(payload);
}

// ——— Дифф по опросу API и рассылка устройству ———

/** Уже показанные id, чтобы не дублировать при повторном опросе. */
const seenIds = new Set<string>();
/** Первый проход не должен «вываливать» всю историю уведомлений. */
let baselineReady = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let polling = false;

function notificationKey(raw: unknown, index: number): string {
  const rec = (raw ?? {}) as { id?: number | string; type?: string; timestamp?: number };
  if (rec.id != null) return String(rec.id);
  return `${rec.type ?? 'n'}-${rec.timestamp ?? index}`;
}

/** Структурная ссылка приложения для перехода по клику на уведомление. */
function notificationDeepLink(
  n: ReturnType<typeof parseNotification>,
): { type: string; id: number } | undefined {
  if (n.articleId) return { type: 'article', id: n.articleId };
  if (n.releaseId) return { type: 'release', id: n.releaseId };
  if (n.channelId) return { type: 'channel', id: n.channelId };
  if (n.profileId) return { type: 'profile', id: n.profileId };
  return undefined;
}

function plainBody(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Заголовок баннера по типу уведомления. */
function notificationTitle(kind: string): string {
  switch (kind) {
    case 'episode':
      return 'Новая серия';
    case 'article':
      return 'Новая запись';
    case 'related':
      return 'Новый релиз';
    case 'friend':
    case 'friend-accept':
      return 'Друзья';
    case 'comment':
      return 'Новый комментарий';
    default:
      return 'AnixApp';
  }
}

export async function pollDeviceNotifications(): Promise<void> {
  if (polling || !get(isAuthenticated)) return;
  const api = bridge();
  if (!api) return;
  polling = true;
  try {
    const content = await fetchAllNotifications();
    const fresh: { raw: unknown; key: string }[] = [];
    for (let i = 0; i < content.length; i++) {
      const key = notificationKey(content[i], i);
      if (!seenIds.has(key)) fresh.push({ raw: content[i], key });
    }

    if (!baselineReady) {
      // Первый проход: только запоминаем, ничего не показываем.
      for (const f of fresh) seenIds.add(f.key);
      baselineReady = true;
      return;
    }

    // Новые — от старых к новым, чтобы последнее было сверху стека.
    fresh.sort((a, b) => {
      const ta = Number((a.raw as { timestamp?: number })?.timestamp) || 0;
      const tb = Number((b.raw as { timestamp?: number })?.timestamp) || 0;
      return ta - tb;
    });

    for (const f of fresh) {
      seenIds.add(f.key);
      const n = parseNotification(f.raw);
      const kind = n.markerKind === 'none' ? 'default' : n.markerKind;
      await showDeviceNotification({
        id: `anix-notif-${f.key}`,
        title: notificationTitle(kind),
        body: plainBody(n.bodyHtml),
        image: n.image || undefined,
        deepLink: notificationDeepLink(n),
        kind,
      });
    }
  } catch {
    // тихо игнорируем сбой опроса
  } finally {
    polling = false;
  }
}

/** Сбросить состояние (при выходе из аккаунта / смене пользователя). */
export function resetDeviceNotificationBaseline(): void {
  seenIds.clear();
  baselineReady = false;
}

/**
 * Запускает фоновый опрос новых уведомлений и рассылку их на устройство.
 * @returns функция остановки
 */
export function startDeviceNotificationPolling(intervalMs = 60_000): () => void {
  if (!bridge()) return () => {};
  const tick = () => { void pollDeviceNotifications(); };
  // Небольшая задержка, чтобы приложение успело авторизоваться.
  const warmup = setTimeout(tick, 8_000);
  pollTimer = setInterval(tick, intervalMs);
  return () => {
    clearTimeout(warmup);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };
}
