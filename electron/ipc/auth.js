'use strict';

const { ipcMain } = require('electron');
const { DefaultResult, OAuthAuthResult } = require('anixapi');
const config = require('../lib/config-store');
const state = require('../lib/app-state');
const {
  getVkAccessToken,
  getGoogleFirebaseIdToken,
  getTelegramIdToken,
  getYandexAccessToken,
  extractTokenFromPastedUrl,
  cancelPending,
} = require('../lib/oauth-login');

/** @type {{ provider: string, token: string, email?: string | null, suggestedLogins?: string[] | null } | null} */
let pendingOAuthSignup = null;

function register(deps) {
  const {
    loggedHandle,
    handleAnixError,
    getAnixart,
    createAnixClient,
    resetAnixart,
    appendLog,
    logger,
    isDev,
  } = deps;


  function applyLoginSuccess(profile, profileToken, baseUrl) {
    pendingOAuthSignup = null;
    config.saveConfig({
      token: profileToken.token,
      profileId: profile?.id ?? null,
      profileLogin: profile?.login ?? null,
      profileAvatar: profile?.avatar ?? null,
      profileRaw: profile || null,
    });
    state.anixart = createAnixClient({ baseUrl, token: profileToken.token });
  }

  function rememberSignup(provider, token, res) {
    pendingOAuthSignup = {
      provider,
      token,
      email: res?.email || null,
      suggestedLogins: Array.isArray(res?.suggested_logins) ? res.suggested_logins : null,
    };
  }

  async function finishOAuthLogin(provider, token, apiCall) {
    const { baseUrl } = config.loadConfig();
    const loginClient = createAnixClient({ baseUrl });
    const res = await apiCall(loginClient);
    const code = res?.code;
    const profile = res?.profile;
    const profileToken = res?.profileToken;
    logger.info('auth', `${provider} login attempt`, {
      code,
      profileId: profile?.id,
      login: profile?.login,
    });
    if (code === DefaultResult.Ok && profileToken?.token) {
      applyLoginSuccess(profile, profileToken, baseUrl);
      logger.info('auth', `${provider} login success`, {
        profileId: profile?.id,
        login: profile?.login,
      });
      return { success: true };
    }
    const notRegistered = code === (OAuthAuthResult?.NotRegistered ?? 3);
    if (notRegistered) {
      rememberSignup(provider, token, res);
      logger.info('auth', `${provider} needs signup`, {
        email: res?.email || null,
        suggested: res?.suggested_logins?.length || 0,
      });
      return {
        success: false,
        needsSignup: true,
        code,
        email: res?.email || null,
        suggestedLogins: Array.isArray(res?.suggested_logins) ? res.suggested_logins : null,
      };
    }
    logger.warn('auth', `${provider} login failed`, { code });
    return { success: false, code };
  }

  const ANIX_UA =
    'AnixartApp/9.0 BETA 21-26080522 (Android 9; SDK 28; x86_64; ROG ASUS AI2201_B; ru)';

  /** Прямой POST /auth/vk — обходим возможные нюансы URLSearchParams. */
  async function signInWithVkRaw(baseUrl, vkAccessToken, fieldName = 'vkAccessToken') {
    const url = new URL('auth/vk', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    const body = `${fieldName}=${encodeURIComponent(vkAccessToken)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': ANIX_UA,
        Accept: 'application/json',
      },
      body,
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { code: -1, raw: text.slice(0, 300) };
    }
    logger.info('auth', 'vk raw response', {
      http: res.status,
      code: data?.code,
      fieldName,
      bodyPreview: text.slice(0, 240),
    });
    return data;
  }

  async function finishVkLogin(vkAccessToken) {
    const { baseUrl } = config.loadConfig();
    const token = String(vkAccessToken || '').trim();
    if (!token) return { success: false, error: 'vk_no_token' };

    let res = await finishOAuthLogin('vk', token, (client) =>
      client.endpoints.auth.signInWithVk({ vkAccessToken: token }),
    );
    if (res.success || res.needsSignup) return res;

    // код 2 (INVALID_REQUEST) — не гоняем snake_case/зеркала: это обычно неверный тип токена
    if (res.code === 2) {
      logger.warn('auth', 'vk rejected by api (invalid request)', { code: 2 });
      return res;
    }

    return res;
  }

  async function completeOAuthSignUp({ login, email }) {
    const pending = pendingOAuthSignup;
    if (!pending?.provider || !pending?.token) {
      return { success: false, error: 'no_pending_oauth' };
    }
    const loginValue = String(login || '').trim();
    const emailValue = String(email || pending.email || '').trim();
    if (!loginValue || !emailValue) {
      return { success: false, error: 'login_email_required' };
    }

    const { baseUrl } = config.loadConfig();
    const client = createAnixClient({ baseUrl });
    const token = pending.token;
    let res;
    switch (pending.provider) {
      case 'vk':
        res = await client.endpoints.auth.signUpWithVk({
          login: loginValue,
          email: emailValue,
          vkAccessToken: token,
        });
        break;
      case 'google':
        res = await client.endpoints.auth.signUpWithGoogle({
          login: loginValue,
          email: emailValue,
          googleIdToken: token,
        });
        break;
      case 'telegram':
        res = await client.endpoints.auth.signUpWithTelegram({
          login: loginValue,
          email: emailValue,
          telegramIdToken: token,
        });
        break;
      case 'yandex':
        res = await client.endpoints.auth.signUpWithYandex({
          login: loginValue,
          email: emailValue,
          yandexAccessToken: token,
        });
        break;
      default:
        return { success: false, error: 'unknown_provider' };
    }

    const code = res?.code;
    const profile = res?.profile;
    const profileToken = res?.profileToken;
    logger.info('auth', `${pending.provider} signup attempt`, {
      code,
      profileId: profile?.id,
      login: profile?.login,
    });

    if (code === DefaultResult.Ok && profileToken?.token) {
      applyLoginSuccess(profile, profileToken, baseUrl);
      return { success: true };
    }

    if (res?.hash) {
      return {
        success: false,
        code,
        needsVerify: true,
        hash: res.hash,
        codeTimestampExpires: res.codeTimestampExpires,
        suggestedLogins: Array.isArray(res.suggested_logins) ? res.suggested_logins : null,
      };
    }

    return {
      success: false,
      code,
      suggestedLogins: Array.isArray(res?.suggested_logins) ? res.suggested_logins : null,
    };
  }

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
    applyLoginSuccess(profile, profileToken, baseUrl);
    logger.info('auth', 'login success', { profileId: profile?.id, login: profile?.login });
    return { success: true };
  }
  logger.warn('auth', 'login failed', { code });
  return { success: false, code };
});

loggedHandle('anix:signUp', async (_, payload) => {
  const login = String(payload?.login || '').trim();
  const email = String(payload?.email || '').trim();
  const password = String(payload?.password || '');
  if (!login || !email || !password) {
    return { success: false, error: 'fields_required' };
  }
  const { baseUrl } = config.loadConfig();
  const client = createAnixClient({ baseUrl });
  const res = await client.endpoints.auth.signUp({ login, email, password });
  const code = res?.code;
  logger.info('auth', 'signUp attempt', { code, login });
  if (code === DefaultResult.Ok && res?.hash) {
    return {
      success: true,
      needsVerify: true,
      hash: res.hash,
      codeTimestampExpires: res.codeTimestampExpires,
    };
  }
  if (res?.hash) {
    return {
      success: false,
      needsVerify: true,
      code,
      hash: res.hash,
      codeTimestampExpires: res.codeTimestampExpires,
      suggestedLogins: Array.isArray(res.suggested_logins) ? res.suggested_logins : null,
    };
  }
  return {
    success: false,
    code,
    suggestedLogins: Array.isArray(res?.suggested_logins) ? res.suggested_logins : null,
  };
});

loggedHandle('anix:signUpVerify', async (_, payload) => {
  const login = String(payload?.login || '').trim();
  const email = String(payload?.email || '').trim();
  const password = String(payload?.password || '');
  const hash = String(payload?.hash || '');
  const code = Number(payload?.code);
  if (!login || !email || !password || !hash || !Number.isFinite(code)) {
    return { success: false, error: 'fields_required' };
  }
  const { baseUrl } = config.loadConfig();
  const client = createAnixClient({ baseUrl });
  const res = await client.endpoints.auth.verify({ login, email, password, hash, code });
  const resultCode = res?.code;
  logger.info('auth', 'signUp verify', { code: resultCode, login });
  if (resultCode === DefaultResult.Ok) {
    const loginRes = await client.endpoints.auth.signIn({ login, password });
    if (loginRes?.code === DefaultResult.Ok && loginRes?.profileToken?.token) {
      applyLoginSuccess(loginRes.profile, loginRes.profileToken, baseUrl);
      return { success: true };
    }
    return { success: true, needsLogin: true };
  }
  return { success: false, code: resultCode };
});

loggedHandle('anix:signUpResend', async (_, payload) => {
  const login = String(payload?.login || '').trim();
  const email = String(payload?.email || '').trim();
  const password = String(payload?.password || '');
  const hash = String(payload?.hash || '');
  if (!hash) return { success: false, error: 'hash_required' };
  const { baseUrl } = config.loadConfig();
  const client = createAnixClient({ baseUrl });
  const res = await client.endpoints.auth.resend({ login, email, password, hash });
  const code = res?.code;
  logger.info('auth', 'signUp resend', { code });
  if (code === DefaultResult.Ok || res?.hash) {
    return {
      success: true,
      hash: res?.hash || hash,
      codeTimestampExpires: res?.codeTimestampExpires,
    };
  }
  return { success: false, code };
});

loggedHandle('anix:checkLogin', async (_, loginValue) => {
  const login = String(loginValue || '').trim();
  if (!login) return { available: false, code: 2 };
  const { baseUrl } = config.loadConfig();
  const client = createAnixClient({ baseUrl });
  const res = await client.endpoints.auth.checkLogin({ login });
  return {
    available: !!res?.available,
    code: res?.code,
    suggestedLogins: Array.isArray(res?.suggested_logins) ? res.suggested_logins : null,
  };
});

loggedHandle('anix:restore', async (_, dataValue) => {
  const data = String(dataValue || '').trim();
  if (!data) return { success: false, error: 'data_required' };
  const { baseUrl } = config.loadConfig();
  const client = createAnixClient({ baseUrl });
  const res = await client.endpoints.auth.restore({ data });
  const code = res?.code;
  logger.info('auth', 'restore attempt', { code });
  if ((code === DefaultResult.Ok || res?.hash) && res?.hash) {
    return {
      success: true,
      needsVerify: true,
      hash: res.hash,
      codeTimestampExpires: res.codeTimestampExpires,
    };
  }
  return { success: false, code };
});

loggedHandle('anix:restoreVerify', async (_, payload) => {
  const data = String(payload?.data || '').trim();
  const password = String(payload?.password || '');
  const hash = String(payload?.hash || '');
  const code = Number(payload?.code);
  if (!data || !password || !hash || !Number.isFinite(code)) {
    return { success: false, error: 'fields_required' };
  }
  const { baseUrl } = config.loadConfig();
  const client = createAnixClient({ baseUrl });
  const res = await client.endpoints.auth.restoreVerify({ data, password, hash, code });
  const resultCode = res?.code;
  const profile = res?.profile;
  const profileToken = res?.profileToken;
  logger.info('auth', 'restore verify', { code: resultCode, profileId: profile?.id });
  if (resultCode === DefaultResult.Ok && profileToken?.token) {
    applyLoginSuccess(profile, profileToken, baseUrl);
    return { success: true };
  }
  if (resultCode === DefaultResult.Ok) {
    // Фоллбэк: старые ответы без токена
    const loginRes = await client.endpoints.auth.signIn({ login: data, password });
    if (loginRes?.code === DefaultResult.Ok && loginRes?.profileToken?.token) {
      applyLoginSuccess(loginRes.profile, loginRes.profileToken, baseUrl);
      return { success: true };
    }
    return { success: true, needsLogin: true };
  }
  return { success: false, code: resultCode };
});

loggedHandle('anix:restoreResend', async (_, payload) => {
  const data = String(payload?.data || '').trim();
  const password = String(payload?.password || '');
  const hash = String(payload?.hash || '');
  if (!data || !password || !hash) return { success: false, error: 'fields_required' };
  const { baseUrl } = config.loadConfig();
  const client = createAnixClient({ baseUrl });
  const res = await client.endpoints.auth.restoreResend({ data, password, hash });
  const code = res?.code;
  logger.info('auth', 'restore resend', { code });
  if (code === DefaultResult.Ok || res?.hash) {
    return {
      success: true,
      hash: res?.hash || hash,
      codeTimestampExpires: res?.codeTimestampExpires,
    };
  }
  return { success: false, code };
});

loggedHandle('anix:loginVk', async () => {
  try {
    const vkAccessToken = String(await getVkAccessToken() || '').trim();
    if (!vkAccessToken) return { success: false, error: 'vk_no_token' };
    logger.info('auth', 'vk token ready', { len: vkAccessToken.length });
    return await finishVkLogin(vkAccessToken);
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg === 'cancelled') return { success: false, cancelled: true };
    logger.warn('auth', 'vk oauth error', { error: msg });
    return { success: false, error: msg };
  }
});

loggedHandle('anix:loginGoogle', async () => {
  try {
    const googleIdToken = String(await getGoogleFirebaseIdToken() || '').trim();
    if (!googleIdToken) return { success: false, error: 'google_no_token' };
    logger.info('auth', 'google token ready', { len: googleIdToken.length });
    return await finishOAuthLogin('google', googleIdToken, (client) =>
      client.endpoints.auth.signInWithGoogle({ googleIdToken }),
    );
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg === 'cancelled') return { success: false, cancelled: true };
    logger.warn('auth', 'google oauth error', { error: msg });
    return { success: false, error: msg };
  }
});

loggedHandle('anix:loginTelegram', async () => {
  try {
    const telegramIdToken = String(await getTelegramIdToken() || '').trim();
    if (!telegramIdToken) return { success: false, error: 'telegram_no_token' };
    logger.info('auth', 'telegram token ready', { len: telegramIdToken.length });
    return await finishOAuthLogin('telegram', telegramIdToken, (client) =>
      client.endpoints.auth.signInWithTelegram({ telegramIdToken }),
    );
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg === 'cancelled') return { success: false, cancelled: true };
    logger.warn('auth', 'telegram oauth error', { error: msg });
    return { success: false, error: msg };
  }
});

loggedHandle('anix:loginYandex', async () => {
  try {
    const yandexAccessToken = String(await getYandexAccessToken() || '').trim();
    if (!yandexAccessToken) return { success: false, error: 'yandex_no_token' };
    logger.info('auth', 'yandex token ready', { len: yandexAccessToken.length });
    return await finishOAuthLogin('yandex', yandexAccessToken, (client) =>
      client.endpoints.auth.signInWithYandex({ yandexAccessToken }),
    );
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg === 'cancelled') return { success: false, cancelled: true };
    logger.warn('auth', 'yandex oauth error', { error: msg });
    return { success: false, error: msg };
  }
});

loggedHandle('anix:oauthCompleteSignUp', async (_, payload) => {
  try {
    return await completeOAuthSignUp(payload || {});
  } catch (err) {
    const msg = String(err?.message || err);
    logger.warn('auth', 'oauth signup error', { error: msg });
    return { success: false, error: msg };
  }
});

loggedHandle('anix:oauthClearPending', async () => {
  pendingOAuthSignup = null;
  return { ok: true };
});

/** Запасной путь: вставка URL с blank.html (если окно OAuth не перехватило hash). */
loggedHandle('anix:oauthSubmitUrl', async (_, url) => {
  if (typeof url !== 'string' || !url.trim()) {
    return { success: false, error: 'empty' };
  }
  const vkAccessToken = extractTokenFromPastedUrl(url.trim());
  if (!vkAccessToken) return { success: false, error: 'no_token' };
  cancelPending('cancelled');
  return finishVkLogin(vkAccessToken);
});

ipcMain.handle('anix:oauthCancel', () => {
  cancelPending('cancelled');
  return { ok: true };
});

  // Привязка OAuth-сервиса к текущему аккаунту (profile/preference/<provider>/bind).
  loggedHandle('anix:bindOAuthService', async (_, provider) => {
    const p = String(provider || '').toLowerCase();
    try {
      const client = getAnixart();
      const pref = client.endpoints.profilePreference;
      let res;
      if (p === 'vk') {
        const accessToken = String(await getVkAccessToken() || '').trim();
        if (!accessToken) return { success: false, error: 'vk_no_token' };
        res = await pref.vkBind({ accessToken });
      } else if (p === 'google') {
        const idToken = String(await getGoogleFirebaseIdToken() || '').trim();
        if (!idToken) return { success: false, error: 'google_no_token' };
        res = await pref.googleBind({ idToken });
      } else if (p === 'telegram') {
        const idToken = String(await getTelegramIdToken() || '').trim();
        if (!idToken) return { success: false, error: 'telegram_no_token' };
        res = await pref.telegramBind({ idToken });
      } else if (p === 'yandex') {
        const accessToken = String(await getYandexAccessToken() || '').trim();
        if (!accessToken) return { success: false, error: 'yandex_no_token' };
        res = await pref.yandexBind({ accessToken });
      } else {
        return { success: false, error: 'unknown_provider' };
      }
      const code = res?.code ?? -1;
      logger.info('auth', `${p} bind`, { code });
      if (code === DefaultResult.Ok) return { success: true, code };
      return { success: false, code };
    } catch (err) {
      const msg = String(err?.message || err);
      if (msg === 'cancelled') return { success: false, cancelled: true };
      logger.warn('auth', `${p} bind error`, { error: msg });
      return { success: false, error: msg };
    }
  });

  // Отвязка OAuth-сервиса (profile/preference/<provider>/unbind).
  loggedHandle('anix:unbindOAuthService', async (_, provider) => {
    const p = String(provider || '').toLowerCase();
    try {
      const client = getAnixart();
      const pref = client.endpoints.profilePreference;
      let res;
      if (p === 'vk') res = await pref.vkUnbind();
      else if (p === 'google') res = await pref.googleUnbind();
      else if (p === 'telegram') res = await pref.telegramUnbind();
      else if (p === 'yandex') res = await pref.yandexUnbind();
      else return { success: false, error: 'unknown_provider' };
      const code = res?.code ?? -1;
      logger.info('auth', `${p} unbind`, { code });
      if (code === DefaultResult.Ok) return { success: true, code };
      return { success: false, code };
    } catch (err) {
      const msg = String(err?.message || err);
      logger.warn('auth', `${p} unbind error`, { error: msg });
      return { success: false, error: msg };
    }
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

loggedHandle('anix:kitsuSubmitSuggestion', async (_, payload) => {
  const cfg = config.loadConfig();
  if (!cfg.token) {
    return { ok: false, status: 401, error: 'Нужна авторизация Anixart' };
  }

  const { signSuggestion, getSecret } = require('../lib/suggestion-sign');
  if (String(getSecret() || '').length < 32) {
    return { ok: false, status: 500, error: 'Не задан SUGGESTION_HMAC_SECRET' };
  }

  const body = payload && typeof payload === 'object' ? payload : {};
  const anixartId = Number(body.anixartId);
  const bannerUrl = typeof body.bannerUrl === 'string' ? body.bannerUrl.trim() : '';
  const trailerUrl = typeof body.trailerUrl === 'string' ? body.trailerUrl.trim() : '';
  const anonymous = body.anonymous === true;
  if (!Number.isFinite(anixartId) || anixartId <= 0) {
    return { ok: false, status: 400, error: 'Некорректные данные предложения' };
  }
  if (!bannerUrl && !trailerUrl) {
    return { ok: false, status: 400, error: 'Укажите ссылку на баннер или трейлер' };
  }

  const profileId = Number(cfg.profileId || cfg.profileRaw?.id || 0);
  if (!Number.isFinite(profileId) || profileId <= 0) {
    return { ok: false, status: 401, error: 'Нужна авторизация Anixart' };
  }

  let userId = profileId;
  let userLogin = typeof cfg.profileLogin === 'string' ? cfg.profileLogin : '';
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.info(profileId);
    if (data?.is_my_profile === false || !data?.profile) {
      return { ok: false, status: 401, error: 'Сессия Anixart недействительна. Войдите снова.' };
    }
    userId = Number(data.profile.id) || profileId;
    userLogin = String(data.profile.login ?? userLogin);
  } catch {
    /* Токен остаётся только в процессе приложения. */
  }

  const signed = signSuggestion({
    userId,
    userLogin,
    anixartId,
    bannerUrl,
    trailerUrl,
    anonymous,
  });

  const res = await fetch(`${getAnixbackOrigin()}/api/kitsu/suggestions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(signed),
  });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text.trim() ? JSON.parse(text) : {};
  } catch {
    return { ok: false, status: res.status, error: `Сервер вернул не JSON (HTTP ${res.status})` };
  }
  return { ok: res.ok, status: res.status, ...parsed };
});

loggedHandle('anix:kitsuSuggestionQuota', async () => {
  const cfg = config.loadConfig();
  if (!cfg.token) {
    return { ok: false, status: 401, error: 'Нужна авторизация Anixart' };
  }

  const { signQuota, getSecret } = require('../lib/suggestion-sign');
  if (String(getSecret() || '').length < 32) {
    return { ok: false, status: 500, error: 'Не задан SUGGESTION_HMAC_SECRET' };
  }

  const profileId = Number(cfg.profileId || cfg.profileRaw?.id || 0);
  if (!Number.isFinite(profileId) || profileId <= 0) {
    return { ok: false, status: 401, error: 'Нужна авторизация Anixart' };
  }

  let userId = profileId;
  try {
    const client = getAnixart();
    const data = await client.endpoints.profile.info(profileId);
    if (data?.is_my_profile === false || !data?.profile) {
      return { ok: false, status: 401, error: 'Сессия Anixart недействительна. Войдите снова.' };
    }
    userId = Number(data.profile.id) || profileId;
  } catch {
    /* local session */
  }

  const signed = signQuota({ userId });
  const res = await fetch(`${getAnixbackOrigin()}/api/kitsu/suggestions/quota`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(signed),
  });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text.trim() ? JSON.parse(text) : {};
  } catch {
    return { ok: false, status: res.status, error: `Сервер вернул не JSON (HTTP ${res.status})` };
  }
  return { ok: res.ok, status: res.status, ...parsed };
});

}

module.exports = { register };
