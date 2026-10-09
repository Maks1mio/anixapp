import { get, writable } from 'svelte/store';
import { isAuthenticated } from './auth';
import { fetchAllNotifications } from './notifications';
import { parseNotification } from '../utils/notification-format';
import { resolveBadgeImageUrl, resolveBadgeName } from '../utils/badge';
import { resolveCdnAssetUrl } from '../utils/posterUrl';
import { resolveJacksonRefs } from '../utils/jackson-refs';
import type {
  DeviceNotificationSettings,
  DeviceNotificationPayload,
  NotificationSoundOption,
} from '../types/electron';

const FALLBACK_TEST_IMAGE_RAW = 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg';

/** Тестовая картинка значка (прозрачный фон — на белой плитке тоста). */
const SAMPLE_ACHIEVEMENT_BADGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><linearGradient id="g" x1="0.2" y1="0" x2="0.8" y2="1">' +
      '<stop offset="0%" stop-color="#f6d35a"/><stop offset="100%" stop-color="#e29a1a"/>' +
      '</linearGradient></defs>' +
      '<circle cx="32" cy="26" r="13" fill="url(#g)"/>' +
      '<path d="M18 50c5-11 23-11 28 0v2H18z" fill="url(#g)"/>' +
      '</svg>',
  );

type TestPerson = { name: string; image: string; id?: number; isSelf?: boolean };
type TestAnime = { title: string; image: string; id?: number };

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
  const push = (name: unknown, avatar: unknown, id?: number, isSelf = false) => {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n || seen.has(n)) return;
    seen.add(n);
    const pid = Number(id);
    people.push({
      name: n,
      image: personImage(avatar),
      id: Number.isFinite(pid) && pid > 0 ? pid : undefined,
      isSelf,
    });
  };
  try {
    const selfRes = await window.anixApi?.profile?.self?.() as {
      profile?: { id?: number; login?: string; avatar?: string };
    } | null;
    const self = selfRes?.profile;
    push(self?.login, self?.avatar, self?.id, true);
    const uid = Number(self?.id);
    if (Number.isFinite(uid) && uid > 0) {
      const friendsRes = await window.anixApi?.profile?.getFriends?.(uid, 0) as {
        content?: Array<{ id?: number; login?: string; avatar?: string }>;
      } | null;
      for (const fr of friendsRes?.content ?? []) {
        push(fr?.login, fr?.avatar, fr?.id, false);
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
      const rid = Number(release?.id ?? raw?.id);
      favs.push({
        title,
        image: personImage(release?.image || release?.poster || raw?.image),
        id: Number.isFinite(rid) && rid > 0 ? rid : undefined,
      });
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

  const profileLink = a.id ? { type: 'profile' as const, id: a.id } : undefined;
  const releaseLink = anime.id ? { type: 'release' as const, id: anime.id } : undefined;

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
        deepLink: profileLink,
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
        deepLink: releaseLink ?? profileLink,
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
        deepLink: profileLink,
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
        deepLink: releaseLink,
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
        deepLink: releaseLink,
        force: true,
      };
    case 'achievement':
    case 'badge':
      return {
        id,
        title: 'Новое достижение',
        body: pickText([
          '«Спасибо Эрен»',
          '«Я-Гуль»',
          '«Накама на всегда»',
          '«Хелпер»',
        ]),
        image: SAMPLE_ACHIEVEMENT_BADGE,
        kind: 'achievement',
        deepLink: { type: 'profile-badge', id: 0 },
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
        deepLink: releaseLink ?? profileLink,
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
    {
      title: 'Новое достижение',
      body: '«Спасибо Эрен»',
      kind: 'achievement',
      image: SAMPLE_ACHIEVEMENT_BADGE,
    },
  ];
}

/**
 * Настройки уведомлений устройства (нативные тосты + баннеры + звук).
 * Electron: config-store. Иначе: localStorage (web / Capacitor / Mac·Linux без моста).
 */

const STORAGE_KEY = 'anix.deviceNotificationSettings.v1';

const DEFAULT_SETTINGS: DeviceNotificationSettings = {
  desktopEnabled: true,
  useNativeNotifications: true,
  customBannersEnabled: false,
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
    achievement: 'both',
    default: 'both',
  },
};

/** Список мелодий без Electron (превью звука там недоступно). */
export const FALLBACK_NOTIFICATION_SOUNDS: NotificationSoundOption[] = [
  { id: 'off', label: 'Выключен', file: null, desc: 'Без звука' },
  { id: 'system', label: 'Системный', file: null, desc: 'Звук операционной системы' },
  { id: 'chime', label: 'Chime', file: null, desc: 'Мягкий колокольчик' },
  { id: 'plub', label: 'Plub', file: null, desc: 'sa plub' },
  { id: 'rawr', label: 'Rawr', file: null, desc: 'sa rawr' },
  { id: 'nya', label: 'Nya', file: null, desc: 'sa nya' },
  { id: 'bonk', label: 'Bonk', file: null, desc: 'sa bonk' },
  { id: 'eh', label: 'Eh', file: null, desc: 'sa eh' },
];

export const deviceNotificationSettings = writable<DeviceNotificationSettings>(DEFAULT_SETTINGS);

type DeviceNotificationBridge = NonNullable<NonNullable<Window['electron']>['notifications']>;

function bridge(): DeviceNotificationBridge | null {
  return window.electron?.notifications ?? null;
}

/** Есть оболочка с баннерами в углу (Electron desktop). */
export function hasDeviceNotifications(): boolean {
  return !!bridge();
}

/** То же, что hasDeviceNotifications — явное имя для UI. */
export function hasDesktopBannerShell(): boolean {
  return !!bridge();
}

function readLocalSettings(): Partial<DeviceNotificationSettings> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeviceNotificationSettings>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalSettings(settings: DeviceNotificationSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* quota / private mode */
  }
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
  if (api) {
    try {
      const data = await api.getSettings();
      const merged = mergeSettings(data);
      deviceNotificationSettings.set(merged);
      return merged;
    } catch {
      /* fall through to local */
    }
  }
  const local = mergeSettings(readLocalSettings());
  deviceNotificationSettings.set(local);
  return local;
}

export async function saveDeviceNotificationSettings(
  patch: Partial<DeviceNotificationSettings>,
): Promise<void> {
  let next: DeviceNotificationSettings = DEFAULT_SETTINGS;
  deviceNotificationSettings.update((s) => {
    next = mergeSettings({
      ...s,
      ...patch,
      typeChannels: { ...s.typeChannels, ...(patch.typeChannels || {}) },
    });
    return next;
  });

  const api = bridge();
  if (api) {
    try {
      const data = await api.saveSettings(patch);
      const merged = mergeSettings(data);
      deviceNotificationSettings.set(merged);
      return;
    } catch {
      // оставляем оптимистичное значение
    }
  }
  writeLocalSettings(next);
}

export async function listNotificationSounds(): Promise<NotificationSoundOption[]> {
  const api = bridge();
  if (api?.listSounds) {
    try {
      const list = await api.listSounds();
      if (Array.isArray(list) && list.length) return list;
    } catch {
      /* fallback */
    }
  }
  return FALLBACK_NOTIFICATION_SOUNDS;
}

export async function previewNotificationSound(soundId?: string): Promise<void> {
  const api = bridge();
  if (api?.previewSound) {
    await api.previewSound(soundId);
    return;
  }
  // Без Electron — короткий системный клик, если доступен AudioContext
  if (soundId === 'off' || typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    const vol = Math.max(0.02, Math.min(0.2, (get(deviceNotificationSettings).volume || 100) / 500));
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.start(t);
    osc.stop(t + 0.2);
    void ctx.resume();
    setTimeout(() => void ctx.close(), 300);
  } catch {
    /* ignore */
  }
}

async function showWebNotification(title: string, body: string): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return false;
    const n = new Notification(title || 'AnixApp', {
      body: body || '',
      silent: !get(deviceNotificationSettings).soundEnabled,
    });
    setTimeout(() => n.close(), 6000);
    return true;
  } catch {
    return false;
  }
}

export async function sendTestDeviceNotification(kind?: string): Promise<void> {
  const api = bridge();
  const key = typeof kind === 'string' && kind ? kind : 'episode';
  if (api) {
    try {
      const [people, favorites] = await Promise.all([loadTestPeople(), loadTestFavorites()]);
      await api.show(buildPersonalizedTest(key, people, favorites));
      return;
    } catch {
      await api.test?.(key);
      return;
    }
  }
  try {
    const [people, favorites] = await Promise.all([loadTestPeople(), loadTestFavorites()]);
    const payload = buildPersonalizedTest(key, people, favorites);
    const ok = await showWebNotification(payload.title || 'AnixApp', payload.body || '');
    if (!ok) await previewNotificationSound(get(deviceNotificationSettings).soundId);
  } catch {
    await showWebNotification('AnixApp', 'Тестовое уведомление');
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
 * Electron — баннер/тост; иначе — Notification API браузера / WebView.
 */
export async function showDeviceNotification(payload: DeviceNotificationPayload): Promise<void> {
  const s = get(deviceNotificationSettings);
  if (!s.desktopEnabled || s.muted) return;

  const api = bridge();
  if (api) {
    await api.show(payload);
    return;
  }

  if (!s.useNativeNotifications) return;
  const title = payload.title || 'AnixApp';
  const body = s.showPreview ? (payload.body || '') : '';
  await showWebNotification(title, body);
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
    case 'achievement':
    case 'badge':
      return 'Новое достижение';
    default:
      return 'AnixApp';
  }
}

/** FCM topic активен — девайс-тосты идут пушем; poll только для baseline/колокольчика. */
async function isFcmPushActive(): Promise<boolean> {
  try {
    const st = await bridge()?.fcmStatus?.();
    return !!(st?.connected && st?.topicSubscribed);
  } catch {
    return false;
  }
}

export async function pollDeviceNotifications(): Promise<void> {
  if (polling || !get(isAuthenticated)) return;
  const api = bridge();
  if (!api) return;
  polling = true;
  try {
    const fcmActive = await isFcmPushActive();
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
      // Когда FCM подписан на topic — пуши уже показали тост; не дублируем из poll.
      if (fcmActive) continue;
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
  resetBadgeAchievementBaseline();
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

// ——— Значки / достижения (FCM-only на Android; на ПК — poll каталога) ———

const seenBadgeIds = new Set<number>();
let badgeBaselineReady = false;
let badgePolling = false;
let badgePollTimer: ReturnType<typeof setInterval> | null = null;

type BadgeRow = { id: number; name: string; image: string; available: boolean };

async function fetchAvailableBadges(): Promise<BadgeRow[]> {
  const api = window.anixApi?.settings;
  if (!api?.getBadges) return [];
  const out: BadgeRow[] = [];
  const seen = new Set<number>();
  for (let page = 0; page < 20; page++) {
    const res = resolveJacksonRefs(await api.getBadges(page)) as {
      content?: unknown[];
      total_page_count?: number;
    };
    const rows = Array.isArray(res?.content) ? res.content : [];
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const id = Number(row.id);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      const available = row.available === true || row.is_available === true;
      if (!available) continue;
      seen.add(id);
      out.push({
        id,
        name: resolveBadgeName(row) || 'Без названия',
        image: resolveBadgeImageUrl(row) || SAMPLE_ACHIEVEMENT_BADGE,
        available: true,
      });
    }
    const total = Math.max(1, Math.floor(Number(res?.total_page_count) || 1));
    if (page + 1 >= total) break;
  }
  return out;
}

/**
 * Опрос каталога значков: новый available → тост «Новое достижение»
 * (на Android это только FCM ACTION_ACHIEVEMENT_OBTAINED).
 */
export async function pollBadgeAchievements(): Promise<void> {
  if (badgePolling || !get(isAuthenticated)) return;
  if (!bridge() && !window.anixApi?.settings?.getBadges) return;
  badgePolling = true;
  try {
    const badges = await fetchAvailableBadges();
    if (!badgeBaselineReady) {
      for (const b of badges) seenBadgeIds.add(b.id);
      badgeBaselineReady = true;
      return;
    }
    for (const b of badges) {
      if (seenBadgeIds.has(b.id)) continue;
      seenBadgeIds.add(b.id);
      await showDeviceNotification({
        id: `achievement-badge-${b.id}-${Date.now()}`,
        title: 'Новое достижение',
        body: `«${b.name}»`,
        image: b.image,
        kind: 'achievement',
        deepLink: { type: 'profile-badge', id: 0 },
      });
    }
  } catch {
    // тихо
  } finally {
    badgePolling = false;
  }
}

export function resetBadgeAchievementBaseline(): void {
  seenBadgeIds.clear();
  badgeBaselineReady = false;
}

export function startBadgeAchievementPolling(intervalMs = 60_000): () => void {
  const tick = () => { void pollBadgeAchievements(); };
  const warmup = setTimeout(tick, 12_000);
  badgePollTimer = setInterval(tick, intervalMs);
  return () => {
    clearTimeout(warmup);
    if (badgePollTimer) clearInterval(badgePollTimer);
    badgePollTimer = null;
  };
}
