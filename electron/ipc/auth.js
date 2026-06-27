'use strict';

const { ipcMain } = require('electron');
const { DefaultResult } = require('anixapi');
const config = require('../lib/config-store');
const state = require('../lib/app-state');

function register(deps) {
  const {
    loggedHandle,
    handleAnixError,
    getAnixart,
    createAnixClient,
    resetAnixart,
    appendLog,
    logger,
  } = deps;

// ——— Auth ———

ipcMain.handle('anix:getAuthStatus', () => {
  const token = config.loadSavedToken();
  return { hasToken: !!token };
});

// Лёгкая проверка соединения с API.
// Если токена ещё нет (пользователь не залогинен) — считаем соединение доступным,
// чтобы не блокировать экран логина.
// Если сеть/сервер недоступны — промис отклонится.
loggedHandle('anix:checkConnection', async () => {
  try {
    const token = config.loadSavedToken();
    if (!token) {
      return { ok: true };
    }
    const client = getAnixart();
    await client.endpoints.feed.latest(1);
    return { ok: true };
  } catch (err) {
    handleAnixError(err, 'checkConnection');
  }
});

loggedHandle('anix:login', async (_, username, password) => {
  // Для логина используем отдельный клиент БЕЗ сохранённого токена,
  // чтобы старый токен не перезаписывал учётку.
  const { baseUrl } = config.loadConfig();
  const loginClient = createAnixClient({ baseUrl });
  const res = await loginClient.endpoints.auth.signIn({ login: username, password });
  const code = res?.code;
  const profile = res?.profile;
  const profileToken = res?.profileToken;
  // Log auth result but never the token/password
  logger.info('auth', 'login attempt', { code, profileId: profile?.id, login: profile?.login });
  if (code === DefaultResult.Ok && profileToken?.token) {
    config.saveConfig({
      token: profileToken.token,
      profileId: profile?.id ?? null,
      profileLogin: profile?.login ?? null,
      profileAvatar: profile?.avatar ?? null,
      profileRaw: profile || null,
    });
    logger.info('auth', 'login success', { profileId: profile?.id, login: profile?.login });
    state.anixart = createAnixClient({ baseUrl, token: profileToken.token });
    return { success: true };
  }
  logger.warn('auth', 'login failed', { code });
  return { success: false, code };
});

loggedHandle('anix:logout', async () => {
  config.saveConfig({
    token: null,
    profileId: null,
    profileLogin: null,
    profileAvatar: null,
    profileRaw: null,
  });
  logger.info('auth', 'logout');
  state.anixart = null;
  return undefined;
});

ipcMain.handle('anix:getBaseUrl', () => {
  return config.loadConfig().baseUrl;
});

ipcMain.handle('anix:setBaseUrl', (_, baseUrl) => {
  if (typeof baseUrl !== 'string' || !baseUrl) return;
  config.saveConfig({ baseUrl });
  state.anixart = null;
  return undefined;
});

// Пинг произвольного эндпоинта без изменения глобального baseUrl и без оффлайн‑экрана.
ipcMain.handle('anix:pingBaseUrl', async (_, baseUrl) => {
  if (typeof baseUrl !== 'string' || !baseUrl) return { ok: false, latencyMs: null };
  try {
    const started = Date.now();
    const client = createAnixClient({ baseUrl, token: undefined });
    await client.endpoints.feed.latest(1);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    // Здесь намеренно НЕ вызываем handleAnixError, чтобы не включать глобальный оффлайн‑режим
    // при проверке альтернативных эндпоинтов.
    appendLog('endpoint_ping', { baseUrl, error: String(err) });
    return { ok: false, latencyMs: null };
  }
});

// Тестовый метод для проверки оффлайн‑экрана из renderer (dev).
ipcMain.handle('anix:testOffline', async () => {
  const err = new Error('TypeError: fetch failed (test)');
  (err).code = 'ENOTFOUND';
  handleAnixError(err, 'testOffline');
});

ipcMain.handle('app:getDeviceId', () => {
  return config.getOrCreateDeviceId();
});

ipcMain.handle('admin:getSession', () => {
  const raw = config.getRawConfig();
  return {
    token: raw.adminSessionToken ?? null,
    userId: raw.adminSessionUserId ?? null,
  };
});

ipcMain.handle('admin:saveSession', (_, payload) => {
  if (!payload || typeof payload !== 'object') return false;
  config.saveConfig({
    adminSessionToken: payload.token ?? null,
    adminSessionUserId: payload.userId ?? null,
  });
  return true;
});

ipcMain.handle('admin:clearSession', () => {
  config.saveConfig({ adminSessionToken: null, adminSessionUserId: null });
  return true;
});

ipcMain.handle('anix:getAnixbackEndpoint', () => {
  const raw = config.getRawConfig();
  const v = raw.anixbackEndpoint;
  return v === 'local' || v === 'prod' ? v : null;
});

ipcMain.handle('anix:setAnixbackEndpoint', (_, mode) => {
  if (mode !== 'local' && mode !== 'prod') return false;
  config.saveConfig({ anixbackEndpoint: mode });
  return true;
});

const ANIXBACK_LOCAL_ORIGIN = 'http://localhost:8787';
const ANIXBACK_PROD_ORIGIN = 'https://anix.maks1mio.su';

function getAnixbackOrigin() {
  const raw = config.getRawConfig();
  const mode = raw.anixbackEndpoint;
  if (mode === 'local') return ANIXBACK_LOCAL_ORIGIN;
  if (mode === 'prod') return ANIXBACK_PROD_ORIGIN;
  return isDev ? ANIXBACK_LOCAL_ORIGIN : ANIXBACK_PROD_ORIGIN;
}

ipcMain.handle('anix:releaseInfoGeoBypass', async (_, releaseId) => {
  const id = Number(releaseId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('invalid release id');
  }

  const { token } = config.loadConfig();
  const url = `${getAnixbackOrigin()}/api/state.anixart/release/${id}?extended=true`;
  const headers = { Accept: 'application/json' };
  if (token) headers['X-Anixart-Token'] = token;

  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`anixback geo bypass HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
});

ipcMain.handle('anix:selfProfile', async () => {
  const cfg = config.loadConfig();
  const { profileLogin, profileAvatar, profileRaw } = cfg;
  const profileId = cfg.profileId || (profileRaw && profileRaw.id) || null;
  appendLog('profile', { event: 'selfProfile_start', profileId, hasRaw: !!profileRaw, hasLogin: !!profileLogin });

  // Если есть profileId — всегда пробуем свежий запрос для полных данных
  if (profileId) {
    try {
      const client = getAnixart();
      const data = await client.endpoints.profile.info(profileId);
      if (data && data.is_my_profile === false) {
        appendLog('profile', { event: 'selfProfile_mismatch', savedProfileId: profileId });
        config.saveConfig({ profileId: null, profileLogin: null, profileAvatar: null, profileRaw: null });
        return { profile: null, session_mismatch: true };
      }
      if (data && data.profile) {
        appendLog('profile', { event: 'selfProfile_ok', profileId });
        return data;
      }
    } catch (err) {
      appendLog('profile', { event: 'selfProfile_api_error', profileId, error: String(err) });
      handleAnixError(err, 'selfProfile');
    }
  }

  // Фоллбэк: кэшированный profileRaw
  if (profileRaw) {
    appendLog('profile', { event: 'selfProfile_cached_fallback', profileId });
    return { code: 0, profile: profileRaw, is_my_profile: true };
  }

  // Последний фоллбэк: базовые данные
  if (profileLogin || profileAvatar) {
    return {
      profile: { id: profileId || null, login: profileLogin || '', avatar: profileAvatar || '' },
      is_my_profile: true,
    };
  }

  appendLog('profile', { event: 'selfProfile_no_data' });
  return null;
});

}

module.exports = { register };
