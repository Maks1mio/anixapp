'use strict';

/**
 * Приём FCM data-пушей Anixart на десктопе (как NotificationService на Android).
 *
 * 1. Регистрация в Firebase-проекте Anixart через @eneris/push-receiver
 * 2. POST auth/firebase → topicName пользователя
 * 3. Подписка токена на topic (C2DM register3 + AidLogin + X-gcm.topic)
 *    При смене аккаунта / выходе прошлый topic отписывается; неудачные отписки
 *    лежат в `pendingUnsubscribe` и повторяются при следующем sync.
 * 4. Входящие data → parseAnixartPushData → system-notifications.notify
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { PushReceiver } = require('@eneris/push-receiver');
const { getAnixartFirebaseConfig } = require('../lib/anixart-firebase');
const { parseAnixartPushData } = require('./fcm-push-parser');
const config = require('../lib/config-store');
const logger = require('../logger');

const STORAGE_NAME = 'fcm-push-credentials.json';
const RECENT_TTL_MS = 15 * 60 * 1000;

/** @type {import('@eneris/push-receiver').default | null} */
let receiver = null;
let stopNotificationListener = null;
let stopCredentialsListener = null;
/** Все sync/logout идут строго по очереди (быстрые переключения аккаунтов). */
let opChain = Promise.resolve();
/** Sync, поставленный в очередь, но ещё не начатый — повторные вызовы сливаются в него. */
let queuedSync = null;
let subscribedTopic = '';
let connected = false;
let topicSubscribed = false;
/** @type {(payload: object) => void | null} */
let notifyFn = null;
/** @type {() => object | null} */
let getAnixartFn = null;

/** @type {Map<string, number>} */
const recentShown = new Map();

function storagePath() {
  return path.join(app.getPath('userData'), STORAGE_NAME);
}

function loadStore() {
  try {
    const raw = fs.readFileSync(storagePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(patch) {
  const next = { ...loadStore(), ...patch, updatedAt: Date.now() };
  try {
    fs.writeFileSync(storagePath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    logger.warn('fcm', `save credentials failed: ${err?.message || err}`);
  }
  return next;
}

function pruneRecent() {
  const now = Date.now();
  for (const [k, ts] of recentShown) {
    if (now - ts > RECENT_TTL_MS) recentShown.delete(k);
  }
}

function markShown(id) {
  if (!id) return false;
  pruneRecent();
  if (recentShown.has(id)) return false;
  recentShown.set(id, Date.now());
  return true;
}

/** Уже показали этот пуш (для дедупа с poll notification/all). */
function wasRecentlyShown(id) {
  if (!id) return false;
  pruneRecent();
  return recentShown.has(id);
}

function getStatus() {
  return {
    connected,
    topicSubscribed,
    topic: subscribedTopic || null,
    hasCredentials: !!loadStore().credentials,
  };
}

function formBody(fields) {
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join('&');
}

/** Ответ register3: `token=...` (или `deleted=...` при отписке) = ok, `Error=...` = fail. */
function isRegister3Success(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^Error=/i.test(t)) return false;
  return /^(token|deleted)=/i.test(t);
}

function normalizeTopic(topic) {
  return String(topic || '').replace(/^\/topics\//, '').trim();
}

function topicList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeTopic).filter(Boolean))];
}

/**
 * Подписка FCM-токена на user topic (как FirebaseMessaging.subscribeToTopic на Android).
 * Рабочий путь — C2DM register3 + AidLogin + X-gcm.topic (IID batchAdd без server key не проходит).
 */
function subscribeTokenToTopic(credentials, topic) {
  return topicRequest(credentials, topic, false);
}

/** Отписка (как FirebaseMessaging.unsubscribeFromTopic: тот же register3 + delete). */
function unsubscribeTokenFromTopic(credentials, topic) {
  return topicRequest(credentials, topic, true);
}

async function topicRequest(credentials, topic, remove) {
  const token = credentials?.fcm?.token;
  const topicName = normalizeTopic(topic);
  if (!token || !topicName) return false;
  const verb = remove ? 'unsubscribe' : 'subscribe';
  const deleteFields = remove ? { delete: 'true', 'X-delete': '1' } : {};

  const topicPath = `/topics/${topicName}`;
  const androidId = credentials?.gcm?.androidId;
  const securityToken = credentials?.gcm?.securityToken;
  if (!androidId || !securityToken) {
    logger.warn('fcm', `topic ${verb}: missing GCM checkin credentials`);
    return false;
  }

  const gcmApp = credentials?.gcm?.appId || 'com.swiftsoft.anixartd';
  const firebase = getAnixartFirebaseConfig();
  const senderId = firebase.messagingSenderId;

  /** @type {{ name: string, fields: Record<string, string> }[]} */
  const attempts = [
    {
      name: 'register3-match-app',
      fields: {
        device: String(androidId),
        app: String(gcmApp),
        sender: token,
        'X-gcm.topic': topicPath,
        'X-scope': topicPath,
        ...deleteFields,
      },
    },
    {
      name: 'register3-android-pkg',
      fields: {
        device: String(androidId),
        app: 'com.swiftsoft.anixartd',
        sender: token,
        'X-gcm.topic': topicPath,
        'X-scope': topicPath,
        app_ver: '221',
        ...deleteFields,
      },
    },
    {
      name: 'register3-sender-project',
      fields: {
        device: String(androidId),
        app: String(gcmApp),
        sender: String(senderId),
        'X-subtype': token,
        'X-gcm.topic': topicPath,
        'X-scope': topicPath,
        'X-subscription': token,
        'X-gms_app_id': firebase.appId,
        app_ver: '221',
        ...deleteFields,
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch('https://android.clients.google.com/c2dm/register3', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `AidLogin ${androidId}:${securityToken}`,
          app: attempt.fields.app,
        },
        body: formBody(attempt.fields),
      });
      const text = await res.text().catch(() => '');
      if (isRegister3Success(text)) {
        logger.info('fcm', `${verb}d topic via ${attempt.name}`, { topic: topicName });
        return true;
      }
      logger.warn('fcm', `topic ${verb} ${attempt.name} failed`, {
        status: res.status,
        body: text.slice(0, 200),
      });
    } catch (err) {
      logger.warn('fcm', `topic ${verb} ${attempt.name} error: ${err?.message || err}`);
    }
  }

  // Fallback: старый IID (обычно 401 без server key — оставляем на всякий случай).
  try {
    const fisToken = credentials?.fcm?.installation?.token;
    if (fisToken) {
      const res = await fetch(`https://iid.googleapis.com/iid/v1:${remove ? 'batchRemove' : 'batchAdd'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${fisToken}`,
          access_token_auth: 'true',
        },
        body: JSON.stringify({ to: topicPath, registration_tokens: [token] }),
      });
      const text = await res.text().catch(() => '');
      if (res.ok) {
        logger.info('fcm', `${verb}d topic via FIS-batch`, { topic: topicName });
        return true;
      }
      logger.warn('fcm', `topic ${verb} FIS-batch failed`, {
        status: res.status,
        body: text.slice(0, 200),
      });
    }
  } catch (err) {
    logger.warn('fcm', `topic ${verb} FIS error: ${err?.message || err}`);
  }

  return false;
}

async function fetchUserTopicName() {
  if (typeof getAnixartFn !== 'function') return '';
  const cfg = config.loadConfig?.() || {};
  const token = cfg.token;
  if (!token) return '';
  try {
    const client = getAnixartFn();
    if (!client?.endpoints?.auth?.firebase) return '';
    const res = await client.endpoints.auth.firebase();
    const topic =
      (typeof res?.topicName === 'string' && res.topicName)
      || (typeof res?.topic_name === 'string' && res.topic_name)
      || '';
    return String(topic).trim();
  } catch (err) {
    logger.warn('fcm', `auth/firebase failed: ${err?.message || err}`);
    return '';
  }
}

function handleIncoming(envelope) {
  try {
    const message = envelope?.message || envelope;
    const data = message?.data && typeof message.data === 'object'
      ? message.data
      : message;
    // data values sometimes nested under notification-less FCM
    const map = data && typeof data === 'object' && !Array.isArray(data) ? { ...data } : {};
    // flatten stringified values
    for (const [k, v] of Object.entries(map)) {
      if (v != null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
        map[k] = String(v);
      }
    }

    const parsed = parseAnixartPushData(map);
    if (!parsed) {
      const action = map.action || map.Action;
      if (action) logger.info('fcm', `unhandled action: ${action}`);
      return;
    }

    if (!markShown(parsed.id)) {
      logger.info('fcm', `skip duplicate ${parsed.id}`);
      return;
    }

    if (typeof notifyFn === 'function') {
      notifyFn({ ...parsed, force: false });
      logger.info('fcm', `notified ${parsed.kind}`, { id: parsed.id, title: parsed.title });
    }
  } catch (err) {
    logger.warn('fcm', `handleIncoming: ${err?.message || err}`);
  }
}

async function ensureReceiver() {
  if (receiver) return receiver;

  const firebase = getAnixartFirebaseConfig();
  const store = loadStore();
  const credentials = store.credentials || undefined;
  const persistentIds = Array.isArray(store.persistentIds) ? store.persistentIds.slice(-200) : [];

  receiver = new PushReceiver({
    firebase,
    credentials,
    persistentIds,
    debug: process.env.ANIXAPP_FCM_DEBUG === '1',
    heartbeatIntervalMs: 5 * 60 * 1000,
  });

  stopCredentialsListener = receiver.onCredentialsChanged(({ newCredentials }) => {
    saveStore({ credentials: newCredentials });
  });

  stopNotificationListener = receiver.onNotification((envelope) => {
    const storeNow = loadStore();
    const ids = Array.isArray(storeNow.persistentIds) ? [...storeNow.persistentIds] : [];
    const pid = envelope?.persistentId;
    if (pid && !ids.includes(pid)) {
      ids.push(pid);
      saveStore({ persistentIds: ids.slice(-200) });
    }
    handleIncoming(envelope);
  });

  await receiver.connect();
  connected = true;
  try {
    const creds = await receiver.registerIfNeeded();
    if (creds) saveStore({ credentials: creds });
  } catch (err) {
    logger.warn('fcm', `registerIfNeeded: ${err?.message || err}`);
  }
  logger.info('fcm', 'receiver connected');
  return receiver;
}

/**
 * Отписка от прошлых profile topic'ов из `pendingUnsubscribe`.
 * Ошибка не блокирует смену аккаунта: topic остаётся в списке до следующего sync.
 */
async function flushPendingUnsubscribes(creds) {
  const pending = topicList(loadStore().pendingUnsubscribe);
  if (!pending.length) return;
  if (!creds?.fcm?.token) {
    logger.warn('fcm', 'pending unsubscribe: no FCM credentials, retry later', { topics: pending });
    return;
  }
  const failed = [];
  for (const t of pending) {
    if (!(await unsubscribeTokenFromTopic(creds, t))) failed.push(t);
  }
  const done = new Set(pending.filter((t) => !failed.includes(t)));
  saveStore({ pendingUnsubscribe: topicList(loadStore().pendingUnsubscribe).filter((t) => !done.has(t)) });
  if (failed.length) {
    logger.warn('fcm', 'topic unsubscribe failed — will retry on next sync', { topics: failed });
  }
}

/**
 * Прошлый profile topic (store.topic) → в очередь на отписку.
 * Трогаем только topic, полученный из auth/firebase, — общие topic'и сюда не попадают.
 */
function retireStoredTopic(keepTopic = '') {
  const stored = loadStore();
  const prev = normalizeTopic(stored.topic);
  const pending = topicList(stored.pendingUnsubscribe);
  if (prev && prev !== keepTopic && !pending.includes(prev)) pending.push(prev);
  const patch = { pendingUnsubscribe: pending.filter((t) => t !== keepTopic) };
  if (prev && prev !== keepTopic) {
    patch.topic = '';
    patch.topicSubscribed = false;
  }
  saveStore(patch);
}

async function syncInternal() {
  // Хвосты прошлых аккаунтов отписываем даже без активной сессии (credentials лежат в store).
  await flushPendingUnsubscribes(loadStore().credentials);

  const token = config.loadConfig?.()?.token;
  if (!token) {
    await stop();
    return getStatus();
  }

  const settings = config.getNotificationSettings?.();
  if (settings && settings.desktopEnabled === false) {
    await stop();
    return getStatus();
  }

  await ensureReceiver();
  let creds = loadStore().credentials;
  try {
    if (receiver) creds = await receiver.registerIfNeeded();
  } catch { /* keep stored */ }
  if (creds) saveStore({ credentials: creds });
  if (!creds?.fcm?.token) {
    logger.warn('fcm', 'no FCM token after connect');
    return getStatus();
  }

  const topic = await fetchUserTopicName();
  if (!topic) {
    topicSubscribed = false;
    subscribedTopic = '';
    logger.warn('fcm', 'no topicName from auth/firebase — push-only events unavailable');
    return getStatus();
  }

  // Сменился профиль: сначала отписка от прошлого topic, потом подписка на новый.
  retireStoredTopic(topic);
  await flushPendingUnsubscribes(creds);

  const stored = loadStore();
  if (subscribedTopic === topic && topicSubscribed && stored.topicSubscribed === true) {
    return getStatus();
  }

  const ok = await subscribeTokenToTopic(creds, topic);
  topicSubscribed = ok;
  subscribedTopic = ok ? topic : '';
  saveStore({ topic: subscribedTopic || topic, topicSubscribed: ok });
  if (!ok) {
    logger.warn('fcm', 'topic subscribe failed — achievement/report pushes unavailable until retry');
  }
  return getStatus();
}

function enqueue(label, fn) {
  const run = opChain.then(fn).catch((err) => {
    logger.warn('fcm', `${label} failed: ${err?.message || err}`);
    return getStatus();
  });
  opChain = run.then(() => {}, () => {});
  return run;
}

function sync() {
  if (queuedSync) return queuedSync;
  const run = enqueue('sync', () => {
    // sync() во время этого прогона встанет в очередь заново и прочитает свежий токен.
    if (queuedSync === run) queuedSync = null;
    return syncInternal();
  });
  queuedSync = run;
  return run;
}

/**
 * Выход без перехода на другой аккаунт: отписка от profile topic и остановка приёма.
 * stop() только гасит receiver (выход из приложения), подписку не трогает.
 */
function logout() {
  return enqueue('logout', async () => {
    retireStoredTopic();
    await stop();
    await flushPendingUnsubscribes(loadStore().credentials);
    return getStatus();
  });
}

async function stop() {
  connected = false;
  topicSubscribed = false;
  subscribedTopic = '';
  try { stopNotificationListener?.(); } catch { /* ignore */ }
  try { stopCredentialsListener?.(); } catch { /* ignore */ }
  stopNotificationListener = null;
  stopCredentialsListener = null;
  if (receiver) {
    try { receiver.destroy(); } catch { /* ignore */ }
    receiver = null;
  }
}

/**
 * @param {{ notify: Function, getAnixart: Function }} deps
 */
function createFcmPushService(deps) {
  notifyFn = typeof deps?.notify === 'function' ? deps.notify : null;
  getAnixartFn = typeof deps?.getAnixart === 'function' ? deps.getAnixart : null;

  return {
    sync,
    stop,
    logout,
    getStatus,
    wasRecentlyShown,
    markShown,
  };
}

module.exports = {
  createFcmPushService,
  parseAnixartPushData,
};
