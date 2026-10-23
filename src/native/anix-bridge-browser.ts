/* eslint-disable @typescript-eslint/no-explicit-any */
import { Anixart, BookmarkSortType, BookmarkType, DefaultResult } from 'anixapi';
import { attachLegacyEndpoints } from './legacy-endpoints';
import { attachApiFailover, installProxyKeyFetch, isProxyUrl, proxyKey } from './api-failover';
import { ANIXART_UA, attachAnixErrorMessages, enrichAnixError } from './anix-errors';
import { isTvMode } from '../platform/tv';
import { tvBridgeInvokeUrl } from '../constants/tv-bridge';

const CONFIG_KEY = 'anixapp.native.config';
const ACCOUNTS_KEY = 'anixapp.native.accounts';
const CUSTOM_TAB_KEY = 'anixapp.homeCustomFilters';
const DEFAULT_BASE_URL = 'https://api-s.anixsekai.com';

const LIST_STATUS_TO_TYPE: Record<string, number> = {
  watching: BookmarkType.Watching,
  planned: BookmarkType.InPlans,
  completed: BookmarkType.Completed,
  on_hold: BookmarkType.HoldOn,
  dropped: BookmarkType.Dropped,
};

type NativeConfig = {
  token: string | null;
  baseUrl: string;
  profileId: number | null;
  profileLogin: string | null;
  profileAvatar: string | null;
  profileRaw: Record<string, unknown> | null;
};

/** Mirror of electron/lib/accounts-store.js: сохранённые сессии для быстрой смены аккаунта. */
type SavedAccount = {
  id: number;
  login: string;
  avatar: string | null;
  token: string;
  profileRaw: Record<string, unknown> | null;
  updatedAt: number;
};

type Handler = (c: BridgeCtx, args: unknown[]) => Promise<unknown>;

type BridgeCtx = {
  getClient: () => any;
  createClient: (opts?: { baseUrl?: string; token?: string | null }) => any;
  loadConfig: () => NativeConfig;
  saveConfig: (partial: Partial<NativeConfig>) => void;
  resetClient: () => void;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

const PRESENCE_ORIGIN = /^(https:\/\/([a-z0-9-]+\.)*anixapp\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i;

/** Mirror of electron/lib/anixapp-presence.js for the native/browser bridge. */
async function sendAppPresence(payload: unknown, token: string | null, savedProfileId: number | null): Promise<unknown> {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const origin = typeof p.origin === 'string' ? p.origin.replace(/\/$/, '') : '';
  if (!PRESENCE_ORIGIN.test(origin)) return { ok: false, error: 'origin not allowed' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const userId = toPositiveInt(p.user_id) ?? toPositiveInt(savedProfileId);
  if (token && userId) {
    headers['X-Anixart-User-Id'] = String(userId);
    headers['X-Anixart-Token'] = token;
  }
  try {
    const res = await fetch(`${origin}/api/app/presence`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ install_id: p.install_id, platform: p.platform, version: p.version, event: p.event }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? `HTTP ${res.status}` };
    return data ?? { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Mirror of electron/lib/anixapp-agent.js: Anixart token → chat agent session id. */
async function requestAgentSession(origin: unknown, token: string | null, profileId: number | null): Promise<unknown> {
  const o = typeof origin === 'string' ? origin.replace(/\/$/, '') : '';
  if (!PRESENCE_ORIGIN.test(o)) return { ok: false, error: 'origin not allowed' };
  const userId = toPositiveInt(profileId);
  if (!token || !userId) return { ok: false, error: 'not_logged_in' };
  try {
    const res = await fetch(`${o}/api/agent/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Anixart-User-Id': String(userId), 'X-Anixart-Token': token },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.session) return { ok: false, status: res.status, error: data?.error ?? `HTTP ${res.status}` };
    return { ok: true, session: data.session, expires_at: data.expires_at };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function h(fn: (c: BridgeCtx, ...args: any[]) => unknown): Handler {
  return async (c, args) => fn(c, ...(args ?? []));
}

export function createBrowserAnixBridge() {
  let anixart: any = null;

  function loadConfig(): NativeConfig {
    const raw = readJson<Partial<NativeConfig>>(CONFIG_KEY, {});
    // Сохранённый прокси без ключа заведомо отвечает 403 — возвращаемся на прямой хост
    const savedBase = raw.baseUrl && !(isProxyUrl(raw.baseUrl) && !proxyKey()) ? raw.baseUrl : DEFAULT_BASE_URL;
    return {
      token: raw.token ?? null,
      baseUrl: savedBase,
      profileId: raw.profileId ?? null,
      profileLogin: raw.profileLogin ?? null,
      profileAvatar: raw.profileAvatar ?? null,
      profileRaw: raw.profileRaw ?? null,
    };
  }

  function saveConfig(partial: Partial<NativeConfig>) {
    const next = { ...loadConfig(), ...partial };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    if ('token' in partial || 'baseUrl' in partial) anixart = null;
  }

  function createClient({ baseUrl, token }: { baseUrl?: string; token?: string | null } = {}) {
    const cfg = loadConfig();
    installProxyKeyFetch();
    const client = attachLegacyEndpoints(new Anixart({
      baseUrl: baseUrl ?? cfg.baseUrl,
      token: token ?? cfg.token ?? undefined,
      userAgent: ANIXART_UA,
    }) as any);
    // Автопереключение между прямыми хостами и резервным прокси; рабочий адрес сохраняем без сброса клиента
    attachApiFailover(client, (base) => {
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...loadConfig(), baseUrl: base }));
      } catch { /* ignore */ }
    });
    return attachAnixErrorMessages(client);
  }

  function getClient() {
    if (!anixart) anixart = createClient();
    return anixart;
  }

  function resetClient() {
    anixart = null;
  }

  function normalizeAccounts(raw: unknown): SavedAccount[] {
    if (!Array.isArray(raw)) return [];
    const out: SavedAccount[] = [];
    for (const item of raw as any[]) {
      const id = toPositiveInt(item?.id);
      const token = String(item?.token || '');
      if (id == null || !token) continue;
      out.push({
        id,
        login: String(item.login || '').trim() || `ID ${id}`,
        avatar: item.avatar ? String(item.avatar) : null,
        token,
        profileRaw: item.profileRaw ?? null,
        updatedAt: Number(item.updatedAt) || Date.now(),
      });
    }
    return out;
  }

  function writeAccounts(accounts: SavedAccount[]) {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch { /* ignore */ }
  }

  function upsertAccount(list: SavedAccount[], entry: Omit<SavedAccount, 'updatedAt'>): SavedAccount[] {
    const prev = list.find((a) => a.id === entry.id);
    const next: SavedAccount = {
      id: entry.id,
      login: String(entry.login || prev?.login || '').trim() || `ID ${entry.id}`,
      avatar: entry.avatar || prev?.avatar || null,
      token: entry.token,
      profileRaw: entry.profileRaw ?? prev?.profileRaw ?? null,
      updatedAt: Date.now(),
    };
    return [next, ...list.filter((a) => a.id !== entry.id)];
  }

  /** Список аккаунтов; активная сессия всегда в нём (миграция со старых версий). */
  function getAccounts(): SavedAccount[] {
    let accounts = normalizeAccounts(readJson<unknown>(ACCOUNTS_KEY, []));
    const cfg = loadConfig();
    const activeId = toPositiveInt(cfg.profileId);
    if (activeId != null && cfg.token) {
      const cur = accounts.find((a) => a.id === activeId);
      if (!cur || cur.token !== cfg.token || cur.login !== (cfg.profileLogin || cur.login) || (cfg.profileAvatar && cur.avatar !== cfg.profileAvatar)) {
        const updatedAt = cur?.updatedAt ?? Date.now();
        accounts = upsertAccount(accounts, {
          id: activeId,
          login: cfg.profileLogin || cur?.login || '',
          avatar: cfg.profileAvatar,
          token: cfg.token,
          profileRaw: cfg.profileRaw,
        }).map((a) => (a.id === activeId ? { ...a, updatedAt } : a));
        writeAccounts(accounts);
      }
    }
    return accounts;
  }

  function activateAccount(account: SavedAccount) {
    saveConfig({
      token: account.token,
      profileId: account.id,
      profileLogin: account.login,
      profileAvatar: account.avatar,
      profileRaw: account.profileRaw,
    });
    writeAccounts(upsertAccount(getAccounts(), account));
    resetClient();
  }

  function clearActiveSession() {
    saveConfig({ token: null, profileId: null, profileLogin: null, profileAvatar: null, profileRaw: null });
    resetClient();
  }

  /** Убрать аккаунт из списка; если он был активным — переключиться на следующий или выйти. */
  function removeSavedAccount(id: number) {
    const activeId = toPositiveInt(loadConfig().profileId);
    const rest = getAccounts().filter((a) => a.id !== id);
    writeAccounts(rest);
    if (activeId !== id) return { success: true, switched: false };
    const fallback = rest[0];
    if (fallback) {
      activateAccount(fallback);
      return { success: true, switched: true, profileId: fallback.id };
    }
    clearActiveSession();
    return { success: true, switched: false, loggedOut: true };
  }

  /** Успешный вход: прежний аккаунт остаётся в списке быстрой смены, новый становится активным. */
  function applyLoginSuccess(profile: any, token: string) {
    // getAccounts() кладёт текущую активную сессию в список до перезаписи конфига
    let accounts = getAccounts();
    const newId = toPositiveInt(profile?.id);
    if (newId != null) {
      accounts = upsertAccount(accounts, {
        id: newId,
        login: profile?.login ?? '',
        avatar: profile?.avatar ?? null,
        token,
        profileRaw: profile || null,
      });
      writeAccounts(accounts);
    }
    saveConfig({
      token,
      profileId: profile?.id ?? null,
      profileLogin: profile?.login ?? null,
      profileAvatar: profile?.avatar ?? null,
      profileRaw: profile || null,
    });
    resetClient();
  }

  type OAuthProvider = 'vk' | 'google' | 'telegram' | 'yandex';
  /** Сервис подтвердил личность, но аккаунта Anixart нет — ждём никнейм/email (как pendingOAuthSignup в electron). */
  let pendingOAuthSignup: { provider: OAuthProvider; token: string; email: string | null } | null = null;

  /** Токен сервиса получает веб-слой (src/native/anix-oauth.ts) — здесь только вход в Anixart по нему. */
  async function loginWithOAuthToken(provider: OAuthProvider, rawToken: unknown) {
    const token = String(rawToken || '').trim();
    if (!token) return { success: false, error: `${provider}_no_token` };
    pendingOAuthSignup = null;
    const auth = createClient({ token: undefined }).endpoints.auth;
    const res = provider === 'vk'
      ? await auth.signInWithVk({ vkAccessToken: token })
      : provider === 'google'
        ? await auth.signInWithGoogle({ googleIdToken: token })
        : provider === 'telegram'
          ? await auth.signInWithTelegram({ telegramIdToken: token })
          : await auth.signInWithYandex({ yandexAccessToken: token });
    if (res?.code === DefaultResult.Ok && res?.profileToken?.token) {
      applyLoginSuccess(res.profile, res.profileToken.token);
      return { success: true };
    }
    if (res?.code === 3 /* OAuthAuthResult.NotRegistered */) {
      pendingOAuthSignup = { provider, token, email: res?.email || null };
      return {
        success: false,
        needsSignup: true,
        code: res.code,
        email: res?.email || null,
        suggestedLogins: Array.isArray(res?.suggested_logins) ? res.suggested_logins : null,
      };
    }
    return { success: false, code: res?.code };
  }

  async function completeOAuthSignUp(payload: any) {
    const pending = pendingOAuthSignup;
    if (!pending) return { success: false, error: 'no_pending_oauth' };
    const login = String(payload?.login || '').trim();
    const email = String(payload?.email || pending.email || '').trim();
    if (!login || !email) return { success: false, error: 'login_email_required' };
    const auth = createClient({ token: undefined }).endpoints.auth;
    const { provider, token } = pending;
    const res = provider === 'vk'
      ? await auth.signUpWithVk({ login, email, vkAccessToken: token })
      : provider === 'google'
        ? await auth.signUpWithGoogle({ login, email, googleIdToken: token })
        : provider === 'telegram'
          ? await auth.signUpWithTelegram({ login, email, telegramIdToken: token })
          : await auth.signUpWithYandex({ login, email, yandexAccessToken: token });
    if (res?.code === DefaultResult.Ok && res?.profileToken?.token) {
      pendingOAuthSignup = null;
      applyLoginSuccess(res.profile, res.profileToken.token);
      return { success: true };
    }
    const suggestedLogins = Array.isArray(res?.suggested_logins) ? res.suggested_logins : null;
    if (res?.hash) {
      return { success: false, code: res.code, needsVerify: true, hash: res.hash, codeTimestampExpires: res.codeTimestampExpires, suggestedLogins };
    }
    return { success: false, code: res?.code, suggestedLogins };
  }

  const ctx = (): BridgeCtx => ({
    getClient,
    createClient,
    loadConfig,
    saveConfig,
    resetClient,
  });

  const HANDLERS: Record<string, Handler> = {
    'anix:getAuthStatus': async (c) => ({ hasToken: !!c.loadConfig().token }),
    'anix:checkConnection': async (c) => {
      if (!c.loadConfig().token) return { ok: true };
      await c.getClient().endpoints.feed.latest(1);
      return { ok: true };
    },
    'anix:appPresence': async (c, [payload]) => {
      const cfg = c.loadConfig();
      return sendAppPresence(payload, cfg.token, cfg.profileId);
    },
    'anix:agentSession': async (c, [origin]) => {
      const cfg = c.loadConfig();
      return requestAgentSession(origin, cfg.token, cfg.profileId);
    },
    'anix:login': async (c, [username, password]) => {
      const { baseUrl } = c.loadConfig();
      const loginClient = c.createClient({ baseUrl, token: undefined });
      const res = await loginClient.endpoints.auth.signIn({ login: username, password });
      const profile = res?.profile;
      const profileToken = res?.profileToken;
      if (res?.code === DefaultResult.Ok && profileToken?.token) {
        applyLoginSuccess(profile, profileToken.token);
        return { success: true };
      }
      return { success: false, code: res?.code };
    },
    'anix:signUp': async (c, [payload]) => {
      const login = String((payload as any)?.login || '').trim();
      const email = String((payload as any)?.email || '').trim();
      const password = String((payload as any)?.password || '');
      if (!login || !email || !password) return { success: false, error: 'fields_required' };
      const client = c.createClient({ token: undefined });
      const res = await client.endpoints.auth.signUp({ login, email, password });
      return { success: res?.code === DefaultResult.Ok, hash: res?.hash, code: res?.code };
    },
    'anix:signUpVerify': async (c, [payload]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.signUpVerify(payload);
    },
    'anix:signUpResend': async (c, [payload]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.signUpResend(payload);
    },
    'anix:checkLogin': async (c, [loginValue]) => c.getClient().endpoints.auth.checkLogin(loginValue),
    'anix:restore': async (c, [dataValue]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.restore(dataValue);
    },
    'anix:restoreVerify': async (c, [payload]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.restoreVerify(payload);
    },
    'anix:restoreResend': async (c, [payload]) => {
      const client = c.createClient({ token: undefined });
      return client.endpoints.auth.restoreResend(payload);
    },
    // Без нативного окна входа (TV) сервисы недоступны; на телефоне anix-api-web шлёт anix:loginOAuthToken
    'anix:loginVk': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:loginGoogle': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:loginTelegram': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:loginYandex': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:bindOAuthService': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:loginOAuthToken': async (_c, [provider, token]) => loginWithOAuthToken(provider as OAuthProvider, token),
    'anix:bindOAuthToken': h(async (c, provider, rawToken) => {
      const p = String(provider || '').toLowerCase();
      const token = String(rawToken || '').trim();
      if (!token) return { success: false, error: `${p}_no_token` };
      const pref = c.getClient().endpoints.profilePreference;
      const res = p === 'vk'
        ? await pref.vkBind({ accessToken: token })
        : p === 'google'
          ? await pref.googleBind({ idToken: token })
          : p === 'telegram'
            ? await pref.telegramBind({ idToken: token })
            : p === 'yandex'
              ? await pref.yandexBind({ accessToken: token })
              : null;
      if (!res) return { success: false, error: 'unknown_provider' };
      const code = res?.code ?? -1;
      return code === DefaultResult.Ok ? { success: true, code } : { success: false, code };
    }),
    'anix:unbindOAuthService': h(async (c, provider) => c.getClient().endpoints.auth.unbindOAuth?.(provider)),
    'anix:oauthCompleteSignUp': async (_c, [payload]) => completeOAuthSignUp(payload),
    'anix:oauthClearPending': async () => {
      pendingOAuthSignup = null;
      return { ok: true };
    },
    'anix:oauthSubmitUrl': async () => ({ success: false, error: 'oauth_electron_only' }),
    'anix:oauthCancel': async () => ({ ok: true }),
    'anix:logout': async () => {
      // То же, что «удалить из списка» для активного аккаунта
      const activeId = toPositiveInt(loadConfig().profileId);
      if (activeId == null) {
        clearActiveSession();
        return { switched: false, loggedOut: true };
      }
      const { switched, profileId, loggedOut } = removeSavedAccount(activeId);
      return { switched, profileId, loggedOut };
    },
    'anix:listAccounts': async () => {
      const activeId = toPositiveInt(loadConfig().profileId);
      return {
        accounts: getAccounts().map((a) => ({
          id: a.id,
          login: a.login,
          avatar: a.avatar || ((a.profileRaw as any)?.avatar ?? null),
          active: a.id === activeId,
        })),
      };
    },
    'anix:switchAccount': async (_c, [profileId]) => {
      const id = toPositiveInt(profileId);
      const account = id == null ? null : getAccounts().find((a) => a.id === id);
      if (!account) return { success: false, error: 'not_found' };
      if (account.id === toPositiveInt(loadConfig().profileId)) return { success: true, alreadyActive: true };
      activateAccount(account);
      return { success: true, profileId: account.id };
    },
    'anix:removeAccount': async (_c, [profileId]) => {
      const id = toPositiveInt(profileId);
      if (id == null) return { success: false, error: 'bad_id' };
      return removeSavedAccount(id);
    },
    'anix:getBaseUrl': async (c) => c.loadConfig().baseUrl,
    'anix:setBaseUrl': async (c, [baseUrl]) => {
      c.saveConfig({ baseUrl: String(baseUrl || DEFAULT_BASE_URL) });
      return { ok: true };
    },
    'anix:getBackupProxy': async () => ({
      enabled: true,
      url: 'https://api.anixapp.com/anixart-api',
      active: false,
      stickyUntil: null,
    }),
    'anix:setBackupProxyEnabled': async (_c, [enabled]) => ({
      enabled: enabled !== false,
      url: 'https://api.anixapp.com/anixart-api',
      active: false,
      stickyUntil: null,
    }),
    'anix:pingBaseUrl': async (_c, [baseUrl]) => {
      const url = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
      if (url.includes('.invalid')) return { ok: false, latencyMs: null };
      const started = performance.now();
      try {
        // Любой HTTP-ответ (даже 403/404 на корне) значит «хост достижим»; не отвечает — сеть/блокировка.
        const res = await Promise.race([
          fetch(`${url}/`, { method: 'GET', cache: 'no-store' }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
        ]);
        return { ok: res.status > 0 && res.status < 500, status: res.status, latencyMs: Math.round(performance.now() - started) };
      } catch {
        return { ok: false, latencyMs: null };
      }
    },
    'anix:endpointGeo': async (_c, [baseUrl]) => {
      const { staticEndpointCountry } = await import('../utils/endpointCountry');
      return staticEndpointCountry(String(baseUrl || ''));
    },
    'anix:testOffline': async () => {
      throw new Error('TypeError: fetch failed (test)');
    },
    'anix:selfProfile': async (c) => {
      const config = c.loadConfig();
      const profileId = config.profileId || (config.profileRaw as any)?.id || null;
      if (profileId) {
        const data = await c.getClient().endpoints.profile.info(profileId);
        if (data && data.is_my_profile === false) {
          c.saveConfig({ profileId: null, profileLogin: null, profileAvatar: null, profileRaw: null });
          return { profile: null, session_mismatch: true };
        }
        if (data?.profile) return data;
      }
      if (config.profileRaw) return { code: 0, profile: config.profileRaw, is_my_profile: true };
      return null;
    },
    'anix:releaseById': h((c, id, extended = true) => {
      const releaseId = toPositiveInt(id);
      if (releaseId == null) return null;
      return c.getClient().endpoints.release.info(releaseId, extended);
    }),
    'anix:getVideos': h((c, releaseId) => {
      const id = toPositiveInt(releaseId);
      if (id == null) return { types: [] };
      return c.getClient().endpoints.release.getVideos(id);
    }),
    'anix:getVideoInCategory': h((c, releaseId, categoryId, page = 1) => {
      const id = toPositiveInt(releaseId);
      const cat = toPositiveInt(categoryId);
      if (id == null || cat == null) return { videos: [] };
      return c.getClient().endpoints.release.getVideoInCategory({ id, categoryId: cat, page });
    }),
    'anix:getDubbers': h((c, releaseId) => {
      const id = toPositiveInt(releaseId);
      if (id == null) return { types: [] };
      return c.getClient().endpoints.release.getDubbers(id);
    }),
    'anix:typeAll': h((c) => c.getClient().endpoints.type.types()),
    'anix:typePin': h((c, releaseId, typeId) => c.getClient().endpoints.type.pin(toPositiveInt(releaseId), toPositiveInt(typeId))),
    'anix:typeUnpin': h((c, releaseId, typeId) => c.getClient().endpoints.type.unpin(toPositiveInt(releaseId), toPositiveInt(typeId))),
    'anix:getDubberSources': h((c, releaseId, dubberId) =>
      c.getClient().endpoints.release.getDubberSources(toPositiveInt(releaseId), toPositiveInt(dubberId))),
    'anix:getEpisodes': h((c, releaseId, dubberId, sourceId, sort = 1) =>
      c.getClient().endpoints.release.getEpisodes(toPositiveInt(releaseId), toPositiveInt(dubberId), toPositiveInt(sourceId), sort)),
    'anix:getEpisode': h((c, releaseId, sourceId, episodePosition) =>
      c.getClient().endpoints.release.getEpisode(toPositiveInt(releaseId), toPositiveInt(sourceId), episodePosition)),
    'anix:getEpisodeUpdates': h((c, releaseId, page = 0) =>
      c.getClient().endpoints.release.episodeUpdates?.(toPositiveInt(releaseId), page)),
    'anix:getDirectVideoLink': async (_c, args) => {
      const embedUrl = String(args?.[0] || '');
      // Prefer AnixBack server-side resolve (stable IP / headers for Kodik etc.).
      try {
        const { resolveViaAnixback } = await import('../services/stream-resolve');
        const remote = await resolveViaAnixback(embedUrl);
        if (remote?.directUrl) return remote;
        if (remote?.error === 'libria-release-missing') return remote;
      } catch (e) {
        console.warn('[stream] anixback resolve failed:', e);
      }
      // TV web prod: dedicated bridge invoke if /api/stream unavailable on older deploy.
      if (import.meta.env.PROD && isTvMode()) {
        const res = await fetch(tvBridgeInvokeUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'anix:getDirectVideoLink', args: [embedUrl] }),
        });
        const json = await res.json() as { ok?: boolean; data?: unknown; error?: string };
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || `Не удалось получить ссылку (${res.status})`);
        }
        return json.data;
      }
      const { getDirectVideoLink } = await import('./kodik-direct');
      return getDirectVideoLink(embedUrl);
    },
    'anix:randomRelease': h((c, extended = true) => c.getClient().endpoints.release.getRandomRelease(extended)),
    'anix:latestFeed': h((c, page = 0) => c.getClient().endpoints.feed.latest(page)),
    'anix:myFeed': h((c, page = 0, opts = {}) => {
      const channelId = opts?.channelId != null && Number(opts.channelId) > 0
        ? Number(opts.channelId)
        : undefined;
      const date = Number.isFinite(Number(opts?.date)) ? Number(opts.date) : 0;
      const query = {
        date,
        ...(channelId != null ? { channel_id: channelId } : {}),
      };
      return c.getClient().endpoints.feed.feed(page, query);
    }),
    'anix:discoverRecommendations': async (c, [page = -1, previousPage = -1]) =>
      c.getClient().endpoints.discover.getRecommendations(page, previousPage),
    'anix:discoverInteresting': async (c) => c.getClient().endpoints.discover.interesting(),
    'anix:discoverWatching': async (c, [page = 0]) => c.getClient().endpoints.discover.watching(page),
    'anix:discoverDiscussing': async (c) => c.getClient().endpoints.discover.discussing(),
    'anix:discoverCommentsWeek': async (c) => c.getClient().endpoints.discover.commentsWeek(),
    'anix:discoverCollectionsWeek': async (c, [page = -1, previousPage = 0]) =>
      c.getClient().endpoints.discover.collectionsWeek(page, previousPage),
    'anix:filterReleases': h((c, page = 0, filterArgs = {}, extended = true) =>
      c.getClient().endpoints.release.filter(page, filterArgs, extended)),
    'anix:homeCustomTabGet': async (c) => {
      const profileId = c.loadConfig().profileId;
      if (!profileId) return { tabName: '', filter: null, activeTab: null };
      const store = readJson<Record<string, unknown>>(CUSTOM_TAB_KEY, {});
      return store[String(profileId)] ?? { tabName: '', filter: null, activeTab: null };
    },
    'anix:homeCustomTabSet': async (c, [data]) => {
      const profileId = c.loadConfig().profileId;
      if (!profileId) throw new Error('Not logged in');
      const store = readJson<Record<string, unknown>>(CUSTOM_TAB_KEY, {});
      store[String(profileId)] = {
        tabName: typeof (data as any)?.tabName === 'string' ? (data as any).tabName : '',
        filter: (data as any)?.filter ?? null,
        activeTab: typeof (data as any)?.activeTab === 'string' ? (data as any).activeTab : null,
      };
      localStorage.setItem(CUSTOM_TAB_KEY, JSON.stringify(store));
      return { ok: true };
    },
    'anix:articleById': h((c, id) => c.getClient().endpoints.channel.getArticle(id)),
    'anix:articleVote': h((c, id, vote) => c.getClient().endpoints.article.vote(id, vote)),
    'anix:articleCreate': h((c, channelId, body) =>
      c.getClient().endpoints.article.create(channelId, body)),
    'anix:articleSuggestionCreate': h((c, channelId, body) =>
      c.getClient().endpoints.articleSuggestion.create(channelId, body)),
    'anix:articleSuggestions': h((c, page = 0, opts = {}) => {
      const channelId = Number((opts as { channelId?: number; channel_id?: number })?.channelId
        ?? (opts as { channelId?: number; channel_id?: number })?.channel_id
        ?? 0);
      return c.getClient().endpoints.articleSuggestion.articleSuggestions(page, {
        channel_id: channelId > 0 ? channelId : undefined,
      });
    }),
    'anix:articleSuggestionDelete': h((c, suggestionId) =>
      c.getClient().endpoints.articleSuggestion.delete(suggestionId)),
    'anix:articleUploadImage': async () => {
      throw new Error('Загрузка изображений на Android TV пока не поддерживается');
    },
    'anix:articleGenerateEmbed': h((c, type, mediaToken, url) =>
      c.getClient().endpoints.article.generateEmbedData(type, mediaToken, url)),
    'anix:articleCommentsPopular': h((c, id) =>
      c.getClient().endpoints.articleComment.commentsPopular(id)),
    'anix:articleComments': h((c, id, page = 0, sort = 2) =>
      c.getClient().endpoints.articleComment.comments(id, page, { sort })),
    'anix:articleCommentAdd': h((c, id, body) =>
      c.getClient().endpoints.articleComment.add(id, body)),
    'anix:articleCommentReplies': h((c, commentId, page = 0, sort = 2) =>
      c.getClient().endpoints.articleComment.replies(commentId, page, { sort })),
    'anix:articleCommentVote': h(async (c, commentId, vote) => {
      const res = await c.getClient().endpoints.articleComment.vote(commentId, vote);
      if (res?.code != null && res.code !== 0) {
        throw new Error(String(res.code ?? 'article comment vote failed'));
      }
      return res;
    }),
    'anix:articleCommentVotes': h((c, commentId, page = 0, sort = 0) =>
      c.getClient().endpoints.articleComment.votes(commentId, page, { sort })),
    'anix:articleCommentEdit': h(async (c, commentId, body) => {
      const res = await c.getClient().endpoints.articleComment.edit(commentId, {
        message: body.message,
        spoiler: !!(body.spoiler ?? body.isSpoiler),
      });
      if (res?.code != null && res.code !== 0) {
        throw new Error(String(res.code ?? 'article comment edit failed'));
      }
      return res;
    }),
    'anix:articleCommentDelete': h(async (c, commentId) => {
      const res = await c.getClient().endpoints.articleComment.delete(commentId);
      if (res?.code != null && res.code !== 0) {
        throw new Error(String(res.code ?? 'article comment delete failed'));
      }
      return res;
    }),
    'anix:channelById': h((c, id) => c.getClient().endpoints.channel.info(id)),
    'anix:channelArticles': h((c, channelId, page = 0) => c.getClient().endpoints.channel.articles(channelId, page)),
    'anix:channelSubscribe': h((c, channelId) => c.getClient().endpoints.channel.subscribe(channelId)),
    'anix:channelUnsubscribe': h((c, channelId) => c.getClient().endpoints.channel.unsubscribe(channelId)),
    'anix:channelMute': h((c, channelId) => c.getClient().endpoints.channel.mute(channelId)),
    'anix:channelUnmute': h((c, channelId) => c.getClient().endpoints.channel.unmute(channelId)),
    'anix:channelMutes': h((c, page = 0) => c.getClient().endpoints.channel.mutes(page)),
    'anix:profileBlockList': h((c, page = 0) =>
      c.getClient().endpoints.profileBlockList.blockList(page)),
    'anix:profileBlockListAdd': h((c, profileId) =>
      c.getClient().endpoints.profileBlockList.addToBlockList(profileId)),
    'anix:profileBlockListRemove': h((c, profileId) =>
      c.getClient().endpoints.profileBlockList.removeFromBlockList(profileId)),
    'anix:reportArticleReasons': h((c) => c.getClient().endpoints.report.articleReasons()),
    'anix:reportArticle': h((c, body) => c.getClient().endpoints.report.article(body)),
    'anix:reportChannelReasons': h((c) => c.getClient().endpoints.report.channelReasons()),
    'anix:reportChannel': h((c, body) => c.getClient().endpoints.report.channel(body)),
    'anix:channelSubscriptions': h((c, page = 0, opts = {}) => {
      const query: Record<string, number> = {};
      if (typeof (opts as { sort?: number })?.sort === 'number') {
        query.sort = (opts as { sort: number }).sort;
      }
      return c.getClient().endpoints.channel.subscriptions(page, query);
    }),
    'anix:channelAll': h((c, page = 0, opts = {}) => {
      const body: Record<string, unknown> = {};
      if (typeof (opts as { isBlog?: boolean })?.isBlog === 'boolean') {
        body.is_blog = (opts as { isBlog: boolean }).isBlog;
      }
      if (typeof (opts as { isSubscribed?: boolean })?.isSubscribed === 'boolean') {
        body.is_subscribed = (opts as { isSubscribed: boolean }).isSubscribed;
      }
      if (typeof (opts as { permission?: number })?.permission === 'number') {
        body.permission = (opts as { permission: number }).permission;
      }
      if (typeof (opts as { sort?: number })?.sort === 'number') {
        body.sort = (opts as { sort: number }).sort;
      }
      return c.getClient().endpoints.channel.channels(page, body);
    }),
    'anix:channelRecommendations': h((c, page = 0, opts = {}) => {
      const query: Record<string, boolean> = {};
      if (typeof (opts as { isBlog?: boolean })?.isBlog === 'boolean') {
        query.is_blog = (opts as { isBlog: boolean }).isBlog;
      }
      if (typeof (opts as { excludeSubscribed?: boolean })?.excludeSubscribed === 'boolean') {
        query.exclude_subscribed = (opts as { excludeSubscribed: boolean }).excludeSubscribed;
      }
      return c.getClient().endpoints.channel.recommendations(page, query);
    }),
    'anix:channelEditorAll': h((c) => c.getClient().endpoints.channel.editorAvailableAll()),
    'anix:channelEditorAvailable': h((c, channelId, opts = {}) =>
      c.getClient().endpoints.channel.editorAvailable(channelId, {
        is_suggestion: !!(opts as { isSuggestion?: boolean })?.isSuggestion,
        is_edit_mode: !!(opts as { isEditMode?: boolean })?.isEditMode,
      })),
    'anix:channelBlog': h((c, id) => c.getClient().endpoints.channel.getBlog(id)),
    'anix:profileById': h((c, id) => c.getClient().endpoints.profile.info(id)),
    'anix:collectionById': h((c, id) => c.getClient().endpoints.collection.info(id)),
    'anix:collectionReleases': h((c, id, page = 0) => c.getClient().endpoints.collection.getCollectionReleases(id, page)),
    'anix:collectionRandomRelease': h((c, id) => c.getClient().endpoints.collection.getRandomRelease(id, true)),
    'anix:addCollectionFavorite': h((c, id) => c.getClient().endpoints.collection.addCollectionFavorite(id)),
    'anix:removeCollectionFavorite': h((c, id) => c.getClient().endpoints.collection.removeCollectionFavorite(id)),
    'anix:collectionsAll': h(async (c, page = 0, options = {}) => {
      const query: Record<string, number> = { sort: typeof options?.sort === 'number' ? options.sort : 2 };
      if (typeof options?.where === 'number') query.where = options.where;
      if (typeof options?.previousPage === 'number') query.previous_page = options.previousPage;
      return c.getClient().endpoints.collection.collections(page, query);
    }),
    'anix:collectionProfileCollections': h((c, profileId, page = 0) =>
      c.getClient().endpoints.collection.profileCollections(profileId, page)),
    'anix:collectionMyCreate': h((c, body) => c.getClient().endpoints.collectionMy.create(body)),
    'anix:collectionMyEdit': h((c, id, body) => c.getClient().endpoints.collectionMy.edit(id, body)),
    'anix:collectionMyEditImage': async () => {
      throw new Error('Загрузка изображений на Android TV пока не поддерживается');
    },
    'anix:collectionMyReleaseAdd': h((c, id, releaseId) =>
      c.getClient().endpoints.collectionMy.releaseAdd(id, { release_id: releaseId })),
    'anix:collectionMyDelete': h((c, id) => c.getClient().endpoints.collectionMy.delete(id)),
    'anix:schedule': h(async (c) => {
      try {
        return await c.getClient().endpoints.schedule.schedule();
      } catch {
        return {};
      }
    }),
    'anix:favorites': h((c, page = 0, sort = BookmarkSortType.NewToOldAddTime, filterAnnounce = 0, filter = 0) =>
      c.getClient().endpoints.profile.getFavorites({ page, sort, filter_announce: filterAnnounce, filter })),
    'anix:getBookmarks': h((c, profileId, type, page = 0, sort = BookmarkSortType.NewToOldAddTime, filterAnnounce = 0, filter = 0) =>
      c.getClient().endpoints.profile.getBookmarks({
        id: profileId,
        type: type ?? BookmarkType.Watching,
        page,
        sort,
        filter_announce: filterAnnounce,
        filter,
      })),
    'anix:collectionFavorites': h((c, page = 0) => c.getClient().endpoints.collectionFavorite.favorites(page)),
    'anix:randomFavorite': h((c, extended = true) =>
      c.getClient().endpoints.release.randomFavorite({ extended_mode: extended })),
    'anix:randomProfileList': h((c, profileId, status, extended = true) =>
      c.getClient().endpoints.release.randomProfileList(profileId, status, { extended_mode: extended })),
    'anix:notificationsAll': h((c, page = 0) => c.getClient().endpoints.notification.getNotifications(page)),
    'anix:notificationsCount': h((c) => c.getClient().endpoints.notification.countNotifications()),
    'anix:notificationsRead': h((c) => c.getClient().endpoints.notification.read()),
    'anix:notificationPreferenceMy': h((c) => c.getClient().endpoints.notificationPreference.my()),
    'anix:notificationPreferenceEdit': h((c, type) =>
      c.getClient().endpoints.notificationPreference.edit(String(type || ''))),
    'anix:notificationPreferenceEditStatus': h(async (c, statuses) => {
      const list = Array.isArray(statuses)
        ? statuses.map((n) => Number(n)).filter((n) => Number.isFinite(n))
        : [];
      try {
        return await c.getClient().endpoints.notificationPreference.editStatus({
          profileStatusNotificationPreferences: list,
        });
      } catch (err) {
        if (String(err?.message || err || '').includes('empty response')) return { code: 0 };
        throw err;
      }
    }),
    'anix:notificationPreferenceEditType': h(async (c, typeIds) => {
      const list = Array.isArray(typeIds)
        ? typeIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))
        : [];
      try {
        return await c.getClient().endpoints.notificationPreference.editType({
          profileTypeNotificationPreferences: list,
        });
      } catch (err) {
        if (String(err?.message || err || '').includes('empty response')) return { code: 0 };
        throw err;
      }
    }),
    'anix:notificationPreferenceReleaseTypes': h((c, releaseId) =>
      c.getClient().endpoints.notificationPreference.releaseTypes(Number(releaseId))),
    'anix:notificationPreferenceEditReleaseTypes': h(async (c, releaseId, typeIds) => {
      const list = Array.isArray(typeIds)
        ? typeIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))
        : [];
      try {
        return await c.getClient().endpoints.notificationPreference.editReleaseTypes({
          release_id: Number(releaseId),
          profile_release_type_notification_preferences: list,
        });
      } catch (err) {
        if (String(err?.message || err || '').includes('empty response')) return { code: 0 };
        throw err;
      }
    }),
    'anix:notificationPreferenceReleases': h((c, page = 0) =>
      c.getClient().endpoints.notificationPreference.releases(Number(page) || 0)),
    'anix:history': h((c, page = 0) => c.getClient().endpoints.release.getHistory(page)),
    'anix:deleteFromHistory': h((c, releaseId) => c.getClient().endpoints.history.delete(releaseId)),
    'anix:addToHistory': h((c, releaseId, sourceId, episodePosition) =>
      c.getClient().endpoints.release.addToHistory(releaseId, sourceId, episodePosition)),
    'anix:markEpisodeAsWatched': h((c, releaseId, sourceId, episodePosition) =>
      c.getClient().endpoints.release.markEpisodeAsWatched(releaseId, sourceId, episodePosition)),
    'anix:unmarkEpisodeAsWatched': h((c, releaseId, sourceId, episodePosition) =>
      c.getClient().endpoints.release.unmarkEpisodeAsWatched(releaseId, sourceId, episodePosition)),
    'anix:relatedReleases': h((c, relatedId, page = 0) =>
      c.getClient().endpoints.release.getRelatedReleases(relatedId, page)),
    'anix:votedReleases': h((c, profileId, page = 0, sort = 1) =>
      c.getClient().endpoints.profile.getVotedReleases(profileId, page, sort)),
    'anix:profileSocial': h((c, profileId) => c.getClient().endpoints.profile.getSocialPages(profileId)),
    'anix:friends': h((c, profileId, page = 0) =>
      c.getClient().endpoints.profile.getFriends({ id: profileId, page })),
    'anix:friendRequestSend': h((c, profileId) => c.getClient().endpoints.profile.sendFriendRequest(profileId)),
    'anix:friendRequestRemove': h((c, profileId) => c.getClient().endpoints.profile.removeFriendRequest(profileId)),
    'anix:friendRequestHide': h((c, profileId) => c.getClient().endpoints.profile.hideFriendRequest(profileId)),
    'anix:friendRequestsIn': h((c, page = 0) => c.getClient().endpoints.profile.getFriendRequestsIn(page)),
    'anix:friendRequestsOut': h((c, page = 0) => c.getClient().endpoints.profile.getFriendRequestsOut(page)),
    'anix:friendRecommendations': h((c) => c.getClient().endpoints.profile.getFriendRecommendations()),
    'anix:profileReleaseComments': h((c, profileId, page = 0, sort = 1) =>
      c.getClient().endpoints.profile.getReleaseComments(profileId, page, sort)),
    'anix:profileCollectionComments': h((c, profileId, page = 0, sort = 1) =>
      c.getClient().endpoints.profile.getCollectionComments(profileId, page, sort)),
    'anix:profileArticleComments': h((c, profileId, page = 0, sort = 1) =>
      c.getClient().endpoints.profile.getArticleComments(profileId, page, sort)),
    'anix:profileFavoriteVideos': h((c, profileId, page = 0) =>
      c.getClient().endpoints.profile.getFavoriteVideos(profileId, page)),
    'anix:getProfileSettings': h((c) => c.getClient().endpoints.settings.getCurrentProfileSettings()),
    'anix:profileHealthStatus': h((c) => c.getClient().endpoints.profileHealth.status()),
    'anix:profileHealthAccount': h((c, page = 0) => c.getClient().endpoints.profileHealth.account(page)),
    'anix:profileHealthContent': h((c, page = 0) => c.getClient().endpoints.profileHealth.content(page)),
    'anix:profileHealthEnforcement': h((c, id) => c.getClient().endpoints.profileHealth.enforcement(id)),
    'anix:profileHealthAppeal': h((c, id, body) => c.getClient().endpoints.profileHealth.appeal(id, body)),
    'anix:setStatus': h((c, status) => c.getClient().endpoints.settings.setStatus(status)),
    'anix:getSocial': h((c) => c.getClient().endpoints.settings.getSocial()),
    'anix:setSocial': h((c, data) => c.getClient().endpoints.settings.setSocial(data)),
    'anix:setPrivacyStats': h((c, state) => c.getClient().endpoints.settings.setPrivacyStats(state)),
    'anix:setPrivacyCounts': h((c, state) => c.getClient().endpoints.settings.setPrivacyCounts(state)),
    'anix:setPrivacySocial': h((c, state) => c.getClient().endpoints.settings.setPrivacySocial(state)),
    'anix:setPrivacyFriendRequests': h((c, state) => c.getClient().endpoints.settings.setPrivacyFriendRequests(state)),
    'anix:getLoginInfo': h((c) => c.getClient().endpoints.settings.getLoginInfo()),
    'anix:changeLogin': h((c, newLogin) => c.getClient().endpoints.settings.changeLogin(newLogin)),
    'anix:changeEmail': h((c, data) => c.getClient().endpoints.settings.changeEmail(data)),
    'anix:changeEmailResend': h((c, data) => c.getClient().endpoints.settings.changeEmailResend(data)),
    'anix:changeEmailVerify': h((c, data) => c.getClient().endpoints.settings.changeEmailVerify(data)),
    'anix:changePassword': h(async (c, data) => {
      const res = await c.getClient().endpoints.settings.changePassword(data);
      const token = typeof res?.token === 'string' ? res.token.trim() : '';
      const ok = res && (res.code === 0 || res.code === undefined) && token;
      if (ok) {
        const cfg = c.loadConfig();
        c.saveConfig({ token });
        c.resetClient();
      }
      return res;
    }),
    'anix:getBadges': h((c, page = 0) => c.getClient().endpoints.settings.getBadges(page)),
    'anix:setBadge': h((c, id) => c.getClient().endpoints.settings.setBadge(id)),
    'anix:removeBadge': h((c) => c.getClient().endpoints.settings.removeBadge()),
    'anix:getBadgeCollection': h((c, profileId, recent) => c.getClient().endpoints.profileBadge.list(profileId, recent)),
    'anix:getBadgeSection': h((c, profileId, categoryId, page = 0) =>
      c.getClient().endpoints.profileBadge.section(profileId, categoryId, page)),
    'anix:pinBadge': h((c, id) => c.getClient().endpoints.profileBadge.pinToShowcase(id)),
    'anix:unpinBadge': h((c, id) => c.getClient().endpoints.profileBadge.unpinFromShowcase(id)),
    'anix:reorderBadgeShowcase': h((c, ids) => c.getClient().endpoints.profileBadge.reorderShowcase(ids)),
    'anix:pinProfileSection': h((c, section) =>
      c.getClient().endpoints.profilePreference.pinSection({ id: Number(section) || 0 } as never)),
    'anix:previewBadgeCode': h((c, code) => c.getClient().endpoints.achievement.preview(code)),
    'anix:claimBadgeCode': h((c, code, badgeId) => c.getClient().endpoints.achievement.claim(code, badgeId)),
    'anix:selectTheme': h((c, id) => c.getClient().endpoints.settings.selectTheme(id)),
    'anix:setAvatar': async () => {
      throw new Error('Загрузка изображений на Android TV пока не поддерживается');
    },
    'anix:deleteAvatar': h((c) => c.getClient().endpoints.settings.deleteAvatar()),
    'anix:channelUploadCover': async () => {
      throw new Error('Загрузка изображений на Android TV пока не поддерживается');
    },
    'anix:channelDeleteCover': h((c, channelId) => c.getClient().endpoints.channel.deleteCover(channelId)),
    'anix:channelCreateBlog': h((c) => c.getClient().endpoints.channel.createBlog()),
    'anix:channelCreate': h((c, body) => c.getClient().endpoints.channel.create({
      title: String(body?.title ?? '').trim(),
      description: String(body?.description ?? '').trim(),
      is_commenting_enabled: body?.is_commenting_enabled !== false,
      is_article_suggestion_enabled: body?.is_article_suggestion_enabled !== false,
    })),
    'anix:configToggles': h((c) => c.getClient().endpoints.config.toggles({
      version_code: 26080522,
      is_beta: true,
      is_api_alt: false,
    })),
    'anix:loginHistory': h((c, profileId, page = 0) => c.getClient().endpoints.profile.changeLoginHistory(profileId, page)),
    'anix:deleteLoginHistory': h((c) => c.getClient().endpoints.profilePreference.deleteLoginHistory()),
    'anix:searchReleases': h((c, query, page = 0, searchBy = 0) =>
      c.getClient().endpoints.search.releases({ query, page, searchBy })),
    'anix:searchProfiles': h((c, query, page = 0) =>
      c.getClient().endpoints.search.profiles({ query, page })),
    'anix:searchCollections': h((c, query, page = 0) =>
      c.getClient().endpoints.search.collections({ query, page })),
    'anix:searchProfileList': h((c, status, query, page = 0, searchBy = 0) =>
      c.getClient().endpoints.search.profileList?.({ status, query, page, searchBy })),
    'anix:searchFeed': h((c, query, page = 0, searchBy = 0) =>
      c.getClient().endpoints.search.feedSearch(page, { query, page, searchBy })),
    'anix:searchChannelSubscribers': h((c, channelId, page = 0, query = '') =>
      c.getClient().endpoints.search.channelSubscribersSearch(channelId, page, {
        query: String(query ?? ''),
        page,
        searchBy: 0,
        channel_id: Number(channelId),
      })),
    'anix:addToFavorites': h((c, releaseId) => c.getClient().endpoints.release.addFavorite(releaseId)),
    'anix:removeFromFavorites': h((c, releaseId) => c.getClient().endpoints.release.removeFavorite(releaseId)),
    'anix:setListStatus': h(async (c, releaseId, statusId) => {
      const type = typeof statusId === 'number' ? statusId : LIST_STATUS_TO_TYPE[String(statusId)];
      return c.getClient().endpoints.release.addToProfileList(releaseId, type);
    }),
    'anix:clearListStatus': h((c, releaseId, statusId) => {
      const type = typeof statusId === 'number' ? statusId : LIST_STATUS_TO_TYPE[String(statusId)];
      return c.getClient().endpoints.release.removeFromProfileList(releaseId, type);
    }),
    'anix:releaseVote': h((c, releaseId, vote) => c.getClient().endpoints.release.vote(releaseId, vote)),
    'anix:releaseDeleteVote': h((c, releaseId) => c.getClient().endpoints.release.deleteVote(releaseId)),
    'anix:releaseComments': h((c, releaseId, page = 0, sort = 1) =>
      c.getClient().endpoints.releaseComment.comments(releaseId, page, { sort })),
    'anix:releaseCommentReplies': h((c, commentId, page = 0, sort = 2) =>
      c.getClient().endpoints.releaseComment.replies(commentId, page, { sort })),
    'anix:releaseCommentVote': h((c, commentId, vote) => c.getClient().endpoints.releaseComment.vote(commentId, vote)),
    'anix:releaseCommentVotes': h((c, commentId, page = 0, sort = 2) =>
      c.getClient().endpoints.releaseComment.votes(commentId, page, { sort })),
    'anix:releaseCommentById': h((c, commentId) => c.getClient().endpoints.releaseComment.comment(commentId)),
    'anix:releaseCommentAdd': h((c, releaseId, body) =>
      c.getClient().endpoints.releaseComment.add(releaseId, {
        message: body.message,
        spoiler: !!(body.spoiler ?? body.isSpoiler),
        parentCommentId: body.parentCommentId ?? null,
        replyToProfileId: body.replyToProfileId ?? null,
      })),
    'anix:releaseCommentEdit': h((c, commentId, body) =>
      c.getClient().endpoints.releaseComment.edit(commentId, {
        message: body.message,
        spoiler: !!(body.spoiler ?? body.isSpoiler),
      })),
    'anix:releaseCommentDelete': h((c, commentId) => c.getClient().endpoints.releaseComment.delete(commentId)),
  };

  async function invoke(channel: string, args: unknown[] = []) {
    const handler = HANDLERS[channel];
    if (!handler) throw new Error(`Unknown channel: ${channel}`);
    try {
      return await handler(ctx(), args);
    } catch (err) {
      throw enrichAnixError(err);
    }
  }

  return { invoke, loadConfig, saveConfig };
}
