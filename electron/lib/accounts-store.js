'use strict';

const config = require('./config-store');

/**
 * @typedef {{
 *   id: number,
 *   login: string,
 *   avatar: string | null,
 *   token: string,
 *   profileRaw?: unknown,
 *   updatedAt?: number,
 * }} SavedAccount
 */

/**
 * @param {unknown} raw
 * @returns {SavedAccount[]}
 */
function normalizeAccounts(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {SavedAccount[]} */
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = Number(/** @type {any} */ (item).id);
    const token = String(/** @type {any} */ (item).token || '');
    if (!(id > 0) || !token) continue;
    out.push({
      id,
      login: String(/** @type {any} */ (item).login || '').trim() || `ID ${id}`,
      avatar: /** @type {any} */ (item).avatar ? String(/** @type {any} */ (item).avatar) : null,
      token,
      profileRaw: /** @type {any} */ (item).profileRaw ?? null,
      updatedAt: Number(/** @type {any} */ (item).updatedAt) || Date.now(),
    });
  }
  return out;
}

/** @returns {SavedAccount[]} */
function getAccounts() {
  const raw = config.getRawConfig();
  let accounts = normalizeAccounts(raw.accounts);

  // Миграция: текущая сессия → список, если ещё не в accounts
  const activeId = Number(raw.profileId);
  const activeToken = typeof raw.token === 'string' ? raw.token : '';
  if (activeId > 0 && activeToken) {
    const idx = accounts.findIndex((a) => a.id === activeId);
    if (idx < 0) {
      accounts = [
        ...accounts,
        {
          id: activeId,
          login: String(raw.profileLogin || '').trim() || `ID ${activeId}`,
          avatar: raw.profileAvatar ? String(raw.profileAvatar) : null,
          token: activeToken,
          profileRaw: raw.profileRaw ?? null,
          updatedAt: Date.now(),
        },
      ];
      config.saveConfig({ accounts });
    } else if (accounts[idx].token !== activeToken) {
      accounts = accounts.map((a, i) =>
        i === idx
          ? {
              ...a,
              token: activeToken,
              login: String(raw.profileLogin || a.login).trim() || a.login,
              avatar: raw.profileAvatar != null ? String(raw.profileAvatar) : a.avatar,
              profileRaw: raw.profileRaw ?? a.profileRaw,
              updatedAt: Date.now(),
            }
          : a,
      );
      config.saveConfig({ accounts });
    }
  }

  return accounts;
}

/** @param {SavedAccount[]} accounts */
function writeAccounts(accounts) {
  config.saveConfig({ accounts: normalizeAccounts(accounts) });
}

/**
 * @param {{
 *   id: number,
 *   login?: string | null,
 *   avatar?: string | null,
 *   token: string,
 *   profileRaw?: unknown,
 * }} entry
 */
function upsertAccount(entry) {
  const id = Number(entry.id);
  const token = String(entry.token || '');
  if (!(id > 0) || !token) return;

  const accounts = getAccounts();
  const next = {
    id,
    login: String(entry.login || '').trim() || `ID ${id}`,
    avatar: entry.avatar ? String(entry.avatar) : null,
    token,
    profileRaw: entry.profileRaw ?? null,
    updatedAt: Date.now(),
  };
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], ...next };
  } else {
    accounts.push(next);
  }
  // Активный / свежий — выше в списке
  accounts.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  writeAccounts(accounts);
}

/**
 * Сохранить текущую активную сессию в список (перед логином другого аккаунта).
 */
function preserveActiveSession() {
  const cfg = config.loadConfig();
  const id = Number(cfg.profileId);
  const token = typeof cfg.token === 'string' ? cfg.token : '';
  if (!(id > 0) || !token) return;
  upsertAccount({
    id,
    login: cfg.profileLogin,
    avatar: cfg.profileAvatar,
    token,
    profileRaw: cfg.profileRaw,
  });
}

/**
 * @returns {{ id: number, login: string, avatar: string | null, active: boolean }[]}
 */
function listAccountsPublic() {
  const activeId = Number(config.loadConfig().profileId) || 0;
  return getAccounts().map((a) => ({
    id: a.id,
    login: a.login,
    avatar: a.avatar,
    active: a.id === activeId,
  }));
}

/**
 * @param {number} profileId
 * @returns {SavedAccount | null}
 */
function findAccount(profileId) {
  const id = Number(profileId);
  if (!(id > 0)) return null;
  return getAccounts().find((a) => a.id === id) ?? null;
}

/**
 * @param {number} profileId
 * @returns {boolean} removed active session
 */
function removeAccount(profileId) {
  const id = Number(profileId);
  if (!(id > 0)) return false;
  const activeId = Number(config.loadConfig().profileId) || 0;
  const next = getAccounts().filter((a) => a.id !== id);
  writeAccounts(next);
  return activeId === id;
}

/**
 * @returns {SavedAccount | null} следующий аккаунт после удаления активного
 */
function pickFallbackAccount(exceptId) {
  const except = Number(exceptId) || 0;
  return getAccounts().find((a) => a.id !== except) ?? null;
}

module.exports = {
  getAccounts,
  upsertAccount,
  preserveActiveSession,
  listAccountsPublic,
  findAccount,
  removeAccount,
  pickFallbackAccount,
  writeAccounts,
};
