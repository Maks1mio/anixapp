'use strict';

/**
 * Профиль для `npm run electron:dev-prev`: дев рядом с установленной прод-версией.
 * Свой userData → свой single-instance lock. При первом запуске копируем из прод-профиля
 * вход, настройки и localStorage, чтобы сравнивать версии на том же аккаунте.
 * Очередь загрузок и FCM-ключи не копируем: иначе дев начнёт качать то же самое
 * и перехватит push-уведомления у прода. Удали папку профиля, чтобы скопировать заново.
 */
const fs = require('fs');
const path = require('path');

const DEV_PREV_DIR = 'anixapp-dev-prev';
const SEED_FILES = ['auth.json', 'home-custom-filters.json'];
const SEED_DIRS = ['Local Storage'];

function isDevPrev() {
  return process.env.ANIXAPP_DEV_PREV === '1';
}

/**
 * @param {string} prodUserData
 * @param {string} devUserData
 */
function seedFromProd(prodUserData, devUserData) {
  if (fs.existsSync(path.join(devUserData, 'auth.json'))) return;
  fs.mkdirSync(devUserData, { recursive: true });
  for (const name of SEED_FILES) {
    try {
      fs.copyFileSync(path.join(prodUserData, name), path.join(devUserData, name));
    } catch { /* в проде файла может не быть */ }
  }
  for (const name of SEED_DIRS) {
    try {
      fs.cpSync(path.join(prodUserData, name), path.join(devUserData, name), {
        recursive: true,
        // LOCK держит запущенный прод; leveldb создаст свой.
        filter: (src) => path.basename(src) !== 'LOCK',
      });
    } catch { /* ignore */ }
  }
}

/** @param {import('electron').App} app */
function applyDevPrevProfile(app) {
  const prodUserData = app.getPath('userData');
  const devUserData = path.join(app.getPath('appData'), DEV_PREV_DIR);
  seedFromProd(prodUserData, devUserData);
  app.setPath('userData', devUserData);
}

module.exports = { isDevPrev, applyDevPrevProfile };
