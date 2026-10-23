/**
 * Вход через VK / Google / Telegram / Яндекс на телефоне — зеркало electron/lib/oauth-login.js.
 * Страницу авторизации показывает нативный плагин AnixOAuth (WebView с перехватом redirect),
 * обмен кода на токен — здесь (fetch идёт через CapacitorHttp, CORS не мешает).
 * Клиенты и redirect — те же, что в Anixart 10.5 (AndroidManifest / resources.arsc).
 */

const VK_CLIENT_ID = '54701760';
const VK_REDIRECT_SCHEME = 'vk54701760';
const VK_REDIRECT_BASE = `${VK_REDIRECT_SCHEME}://vk.ru/blank.html`;
const VK_ID_SDK_VERSION = '2.7.2';
const GOOGLE_CLIENT_ID = '983926366374-c3jvolf9t8e151mbgriuqi7uqnbt4c4p.apps.googleusercontent.com';
const FIREBASE_AUTH_HANDLER = 'https://anime-ad-eb8b3.firebaseapp.com/__/auth/handler';
const TELEGRAM_CLIENT_ID = '8789559054';
const TELEGRAM_REDIRECT = 'https://app1593901251-login.tg.dev/tglogin';
const YANDEX_CLIENT_ID = 'a980f00536554180b4826f7daa76f060';
const YANDEX_REDIRECT = `https://yx${YANDEX_CLIENT_ID}.oauth.yandex.ru/auth/finish`;

type OAuthPlugin = {
  open: (opts: { url: string; title?: string; redirects: string[] }) => Promise<{ url?: string; cancelled?: boolean }>;
};

function plugin(): OAuthPlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixOAuth?: OAuthPlugin } } }).Capacitor?.Plugins?.AnixOAuth;
}

export function isNativeOAuthAvailable(): boolean {
  return !!plugin();
}

/** Ошибка с message === 'cancelled' — пользователь закрыл окно (как на desktop). */
async function openAuth(url: string, title: string, redirects: string[]): Promise<{ url: string; params: Record<string, string> }> {
  const p = plugin();
  if (!p) throw new Error('oauth_unavailable');
  const res = await p.open({ url, title, redirects });
  if (!res?.url) throw new Error('cancelled');
  return { url: res.url, params: parseParams(res.url) };
}

function parseParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const query = url.includes('?') ? url.split('?').slice(1).join('?').split('#')[0] : '';
  const hash = url.includes('#') ? url.split('#').slice(1).join('#') : '';
  for (const part of [query, hash]) {
    if (!part) continue;
    for (const [k, v] of new URLSearchParams(part)) if (!(k in out)) out[k] = v;
  }
  // VK ID кладёт code/state/device_id в JSON payload
  if (out.payload) {
    try {
      const payload = JSON.parse(out.payload);
      if (payload && typeof payload === 'object') {
        for (const [k, v] of Object.entries(payload)) if (v != null && out[k] == null) out[k] = String(v);
      }
    } catch { /* ignore */ }
  }
  return out;
}

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Android Base64.DEFAULT без переносов (oauth2_params / stats_info у VK ID). */
function base64Json(obj: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}

function oauthError(params: Record<string, string>, fallback: string): Error {
  return new Error(params.error_description || params.error || fallback);
}

async function postForm(url: string, body: Record<string, string>): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error(String(data?.error_description || data?.error || data?.error_msg || `http_${res.status}`));
  return data;
}

export async function getVkAccessToken(): Promise<string> {
  const codeVerifier = base64Url(randomBytes(96));
  const codeChallenge = base64Url(await sha256(codeVerifier));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const state = Array.from(randomBytes(32), (b) => alphabet[b % alphabet.length]).join('');
  const statsInfo = base64Json({ flow_source: 'from_custom_auth', session_id: crypto.randomUUID() });
  const redirectUri = `${VK_REDIRECT_BASE}?oauth2_params=${base64Json({ scope: 'email' })}`;

  const authUrl = 'https://id.vk.ru/authorize?' + new URLSearchParams({
    client_id: VK_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 's256',
    code_challenge: codeChallenge,
    state,
    prompt: '',
    stats_info: statsInfo,
    sdk_type: 'vkid',
    v: VK_ID_SDK_VERSION,
    scope: 'email',
  }).toString();

  const { params } = await openAuth(authUrl, 'Вход через VK', [`${VK_REDIRECT_SCHEME}://`]);
  if (params.error) throw oauthError(params, 'vk_error');
  const returnedState = (params.state || '').trim();
  if (returnedState && returnedState !== state) throw new Error('vk_state_mismatch');
  if (params.access_token && !params.code) return params.access_token.trim();

  const code = (params.code || '').trim();
  if (!code) throw new Error('vk_no_code');
  const data = await postForm('https://id.vk.ru/oauth2/auth', {
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: VK_CLIENT_ID,
    device_id: (params.device_id || '').trim() || crypto.randomUUID(),
    redirect_uri: redirectUri,
    state: returnedState || state,
  });
  const token = String(data?.access_token ?? '').trim();
  if (!token) throw new Error('vk_no_token');
  return token;
}

function firebaseKey(): string {
  try {
    return typeof __ANIXAPP_FIREBASE_KEY__ === 'string' ? __ANIXAPP_FIREBASE_KEY__.trim() : '';
  } catch {
    return '';
  }
}

/** Как в Anixart: Google id_token → Firebase signInWithIdp → Firebase id_token для /auth/google. */
export async function getGoogleFirebaseIdToken(): Promise<string> {
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: FIREBASE_AUTH_HANDLER,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce: base64Url(randomBytes(16)),
    prompt: 'select_account',
  }).toString();

  const { params } = await openAuth(authUrl, 'Вход через Google', [FIREBASE_AUTH_HANDLER]);
  if (params.error) throw oauthError(params, 'google_error');
  const googleIdToken = (params.id_token || '').trim();
  if (!googleIdToken) throw new Error('google_no_token');

  const key = firebaseKey();
  if (!key) return googleIdToken;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${googleIdToken}&providerId=google.com`,
        requestUri: 'http://localhost',
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.idToken) return String(data.idToken);
  } catch { /* ниже — сырой токен Google, как на desktop */ }
  return googleIdToken;
}

export async function getTelegramIdToken(): Promise<string> {
  const codeVerifier = base64Url(randomBytes(32));
  const challenge = base64Url(await sha256(codeVerifier));
  const authUrl = 'https://oauth.telegram.org/auth?' + new URLSearchParams({
    client_id: TELEGRAM_CLIENT_ID,
    response_type: 'code',
    scope: 'profile',
    redirect_uri: TELEGRAM_REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();

  const { params } = await openAuth(authUrl, 'Вход через Telegram', [TELEGRAM_REDIRECT]);
  if (params.error) throw oauthError(params, 'telegram_error');
  const code = (params.code || '').trim();
  if (!code) throw new Error('telegram_no_code');
  const data = await postForm('https://oauth.telegram.org/token', {
    grant_type: 'authorization_code',
    client_id: TELEGRAM_CLIENT_ID,
    code,
    redirect_uri: TELEGRAM_REDIRECT,
    code_verifier: codeVerifier,
  });
  const idToken = String(data?.id_token ?? '').trim();
  if (!idToken) throw new Error('telegram_no_id_token');
  return idToken;
}

export async function getYandexAccessToken(): Promise<string> {
  const authUrl = 'https://oauth.yandex.ru/authorize?' + new URLSearchParams({
    response_type: 'token',
    client_id: YANDEX_CLIENT_ID,
    redirect_uri: YANDEX_REDIRECT,
    force_confirm: 'yes',
  }).toString();

  const { params } = await openAuth(authUrl, 'Вход через Яндекс', [YANDEX_REDIRECT, `yx${YANDEX_CLIENT_ID}://`]);
  if (params.error) throw oauthError(params, 'yandex_error');
  const token = (params.access_token || '').trim();
  if (!token) throw new Error('yandex_no_token');
  return token;
}

export type OAuthProvider = 'vk' | 'google' | 'telegram' | 'yandex';

/** Токен сервиса для /auth/<provider> и profile/preference/<provider>/bind. */
export async function getOAuthToken(provider: OAuthProvider): Promise<string> {
  const token = provider === 'vk'
    ? await getVkAccessToken()
    : provider === 'google'
      ? await getGoogleFirebaseIdToken()
      : provider === 'telegram'
        ? await getTelegramIdToken()
        : await getYandexAccessToken();
  return String(token || '').trim();
}
