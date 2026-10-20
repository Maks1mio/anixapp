'use strict';

/**
 * Compositor-side window positioning for native Wayland.
 *
 * Wayland (xdg-shell) не даёт клиенту позиционировать свои окна: на Windows/macOS
 * BrowserWindow.setBounds() работает, а на Linux/Wayland координаты x/y молча
 * игнорируются — композитор сам решает, куда поставить окно (обычно центр).
 * Стандартного «поставь окно в точку» в протоколе нет, поэтому позицию отдаём
 * композитору напрямую — IPC конкретного композитора.
 *
 * Бэкенды (первый доступный выигрывает): hyprland, sway, kwin, gnome.
 *   • hyprland — точное позиционирование, проверено на живой сессии;
 *   • sway — swaymsg IPC, юнит-тесты (sway на машине разработки не установлен);
 *   • kwin / gnome — best-effort через D-Bus scripting (см. их модули).
 *
 * Как определяем backend (Electron 44): ELECTRON_OZONE_PLATFORM_HINT и
 * --ozone-platform-hint в 44 не работают (обработчики выпилены) — фактическую
 * платформу ставит сам Chromium по сессии, дописывая реальный switch
 * --ozone-platform=wayland|x11, который мы и читаем. Без switch (plain node /
 * юнит-тесты) — определение по признакам сессии, как в gpu-flags.js isLinuxWayland.
 *
 * X11/XWayland: setBounds работает сам, сюда не заходим — guard смотрит на
 * фактический backend окна, а не на сессию.
 * Нативный Wayland без знакомых композиторов: false + разовый warning — баннер
 * встанет туда, куда решит композитор (ограничение протокола, не баг приложения).
 */

const logger = require('../logger');
const hyprland = require('./compositor-position/hyprland');

const BANNER_WINDOW_TITLE = 'anix-banner-stack';
/**
 * Окно появляется в списке композитора не сразу после show, поэтому команду
 * повторяем, пока бэкенд не подтвердит, что окно найдено (или не выйдет лимит).
 * POSITION_RETRY_GAP_MS — пауза между попытками, MAX_ATTEMPTS — их число.
 */
const POSITION_RETRY_GAP_MS = 90;
const POSITION_MAX_ATTEMPTS = 7;
/**
 * Для бэкендов без подтверждения (kwin): нельзя отличить «окно ещё не замаплено»
 * от успеха, поэтому делаем пару повторов на поздний маппинг и считаем успехом.
 */
const POSITION_UNCONFIRMED_ATTEMPTS = 3;

let warnedUnsupported = false;

/**
 * @returns {'wayland' | 'x11'} фактическая ozone-платформа окна
 */
function resolveOzonePlatform() {
  try {
    const { app } = require('electron');
    if (app && typeof app.commandLine?.hasSwitch === 'function'
      && app.commandLine.hasSwitch('ozone-platform')) {
      const explicit = String(app.commandLine.getSwitchValue('ozone-platform') || '').toLowerCase();
      if (explicit === 'wayland' || explicit === 'x11') return explicit;
    }
  } catch { /* plain node (юнит-тесты): require('electron') отдаёт строку */ }

  // Fallback без chromium command line: признаки wayland-сессии.
  const waylandSession = Boolean(process.env.WAYLAND_DISPLAY)
    && String(process.env.XDG_SESSION_TYPE || '').toLowerCase() !== 'x11';
  return waylandSession ? 'wayland' : 'x11';
}

/** Бэкенды в порядке надёжности/распространённости. Ленивый require: файл может отсутствовать. */
function loadBackends() {
  const list = [hyprland];
  for (const name of ['sway', 'kwin', 'gnome']) {
    try {
      list.push(require(`./compositor-position/${name}`));
    } catch { /* бэкенд не собран/не нужен */ }
  }
  return list;
}

/**
 * Позиционирует окно средствами композитора. Безопасно вызывать на любой ОС/сессии:
 * вне нативного Wayland это no-op.
 *
 * Команда повторяется, пока бэкенд не подтвердит, что окно найдено: сразу после
 * show окна ещё нет в списке композитора, а по `hyprctl eval` промах не отличить
 * от успеха (всегда "ok"). Повтор идемпотентен — бэкенды шлют абсолютные координаты.
 * Бэкенды без подтверждения (`confirmsPlacement: false`, kwin) прогоняют
 * ограниченное число попыток и затем считаются успешными — иначе контент ждал бы
 * полный лимит повторов.
 *
 * Координаты x/y — Electron DIP; бэкенд сам приводит их к своей системе
 * (физические пиксели: sway/hyprland, логические: kwin/gnome) через scaleFactor.
 * Все бэкенды position-only: размер не передаётся принципиально — на Wayland
 * BrowserWindow.setBounds размер применяет сам Electron (композитор игнорирует
 * только позицию), а это спасает от рассинхрона размер-контракт между фасадом
 * и бэкендами.
 *
 * @param {string} title — точный заголовок окна (у главного окна он другой)
 * @param {number} scaleFactor — display.scaleFactor окна
 * @param {(ok:boolean)=>void} [onDone] — вызывается, когда окно найдено и
 *   перемещено, либо когда попытки исчерпаны. Нужно, чтобы показать контент уже
 *   после перемещения — иначе окно мелькнёт в центре (телепорт).
 * @returns {boolean} true, если команда композитору отправлена
 */
function positionWindowOnCompositor(title, x, y, scaleFactor, onDone) {
  const done = (ok) => {
    if (typeof onDone === 'function') onDone(ok);
  };
  if (process.platform !== 'linux') { done(false); return false; }
  if (resolveOzonePlatform() !== 'wayland') { done(false); return false; }

  const backend = loadBackends().find((b) => {
    try {
      return b.isAvailable();
    } catch { return false; }
  });
  if (!backend) {
    if (!warnedUnsupported) {
      warnedUnsupported = true;
      logger.warn(
        'notifications',
        'Wayland: compositor-side positioning supported only on Hyprland/sway/KDE/GNOME; banner position is compositor-decided',
      );
    }
    done(false);
    return false;
  }

  const args = { pid: process.pid, title, x, y, scaleFactor };
  let settled = false;
  let sawError = false;
  const finish = (ok) => {
    if (settled) return;
    settled = true;
    done(ok);
  };
  // Бэкенды без подтверждения (kwin): «окно не найдено» и успех неразличимы,
  // поэтому ограничиваемся парой повторов и затем считаем позицию выставленной.
  const confirms = backend.confirmsPlacement !== false;
  const maxAttempts = confirms ? POSITION_MAX_ATTEMPTS : POSITION_UNCONFIRMED_ATTEMPTS;
  const attempt = (n) => {
    if (settled) return;
    let handled = false;
    const afterAttempt = (err) => {
      if (settled || handled) return;
      handled = true;
      if (err) sawError = true;
      // Подтверждающий бэкенд: null — окно найдено и перемещено, финишируем сразу;
      // ошибка — окно ещё не замаплено, ретраим.
      if (confirms && !err) { finish(true); return; }
      // Неподтверждающий (kwin): успех и «окно не найдено» неразличимы, поэтому
      // прогоняем ВСЕ попытки (окно могло не замапиться) и затем считаем позицию
      // выставленной. Команда идемпотентна — повтор безопасен. Если при этом
      // упала сама диспетчеризация — честно сообщаем неуспех.
      if (n + 1 < maxAttempts) {
        const t = setTimeout(() => attempt(n + 1), POSITION_RETRY_GAP_MS);
        t.unref?.();
      } else {
        finish(!confirms && !sawError);
      }
    };
    try {
      backend.moveWindow(args, afterAttempt);
    } catch {
      afterAttempt(new Error('backend threw'));
    }
  };
  attempt(0);
  return true;
}

let backendAvailable = null;

/**
 * Есть ли на этой сессии рабочий бэкенд композитора. Нужно вызывающей стороне,
 * чтобы выбрать стратегию окна (на native Wayland позицию держит композитор и
 * высоту надо фиксировать — иначе рост стека в нижних углах меняет y).
 * Кэшируется: окружение сессии за процесс не меняется.
 *
 * @returns {boolean}
 */
function hasCompositorBackend() {
  if (process.platform !== 'linux') return false;
  if (resolveOzonePlatform() !== 'wayland') return false;
  if (backendAvailable === null) {
    backendAvailable = loadBackends().some((b) => {
      try {
        return b.isAvailable();
      } catch { return false; }
    });
  }
  return backendAvailable;
}

/**
 * Монитор под фокусом у активного композитора (только там, где это умеет бэкенд).
 * На Wayland Electron не знает ни позиции окна, ни позиции курсора, поэтому экран
 * для баннера приходится брать у композитора.
 * @param {(monitor: {x:number,y:number,width:number,height:number,scale:number}|null)=>void} cb
 */
function resolveFocusedMonitor(cb) {
  const done = (m) => { if (typeof cb === 'function') cb(m); };
  if (process.platform !== 'linux') { done(null); return; }
  if (resolveOzonePlatform() !== 'wayland') { done(null); return; }
  const backend = loadBackends().find((b) => {
    try {
      return b.isAvailable();
    } catch { return false; }
  });
  if (!backend || typeof backend.getFocusedMonitor !== 'function') { done(null); return; }
  try {
    backend.getFocusedMonitor(done);
  } catch {
    done(null);
  }
}

/**
 * Монитор, где находится конкретное окно (по pid+title) — у активного композитора.
 * Приоритетнее фокусного: баннер должен висеть там, где окно приложения, а не там,
 * где случайно оказался фокус.
 * @param {{pid:number,title:string}} win
 * @param {(monitor: {x:number,y:number,width:number,height:number,scale:number}|null)=>void} cb
 */
function resolveWindowMonitor(win, cb) {
  const done = (m) => { if (typeof cb === 'function') cb(m); };
  if (process.platform !== 'linux') { done(null); return; }
  if (resolveOzonePlatform() !== 'wayland') { done(null); return; }
  const backend = loadBackends().find((b) => {
    try {
      return b.isAvailable();
    } catch { return false; }
  });
  if (!backend || typeof backend.getWindowMonitor !== 'function') { done(null); return; }
  try {
    backend.getWindowMonitor(win, done);
  } catch {
    done(null);
  }
}

/**
 * Навесить на окно баннера правило композитора (без рамки/анимаций и т.п.).
 * @param {(err:Error|null)=>void} [cb]
 */
function applyBannerWindowRule(cb) {
  const done = (e) => { if (typeof cb === 'function') cb(e || null); };
  if (process.platform !== 'linux') { done(null); return false; }
  if (resolveOzonePlatform() !== 'wayland') { done(null); return false; }
  const backend = loadBackends().find((b) => {
    try {
      return b.isAvailable();
    } catch { return false; }
  });
  if (!backend || typeof backend.applyBannerRule !== 'function') { done(null); return false; }
  try {
    backend.applyBannerRule(BANNER_WINDOW_TITLE, done);
  } catch {
    done(null);
  }
  return true;
}

// Публичные алиасы для тестов и внешних вызовов.
module.exports = {
  BANNER_WINDOW_TITLE,
  POSITION_RETRY_GAP_MS,
  POSITION_MAX_ATTEMPTS,
  POSITION_UNCONFIRMED_ATTEMPTS,
  resolveOzonePlatform,
  hasCompositorBackend,
  resolveFocusedMonitor,
  resolveWindowMonitor,
  applyBannerWindowRule,
  buildHyprlandPositionLua: hyprland.buildHyprlandPositionLua,
  positionWindowOnCompositor,
};
