'use strict';

/**
 * Хайпроленд-бэкенд позиционирования окон: Lua API через `hyprctl eval`.
 *
 * Нюансы Hyprland 0.56, проверенные на живой сессии:
 *   • селекторы-строки ("address:...", "class:...", "pid:...") молча не срабатывают —
 *     окно ищем объектом из hl.get_windows();
 *   • hl.dsp.window.resize молча no-op даже с объектом — размер оставлен Electron
 *     (setBounds размер на Wayland применяется, не двигается только позиция);
 *   • координаты Electron — DIP, композитора — физические пиксели: умножаем на
 *     display.scaleFactor (на scale=1 это no-op).
 */

const { execFile } = require('child_process');
const logger = require('../../logger');

let warnedError = '';

/**
 * Lua-скрипт позиционирования окна баннера в Hyprland.
 * Совпадение строго по pid+title: у одного процесса несколько окон (главное окно),
 * а два dev-инстанса приложения имеют один title, но разные pid.
 * Скрипт возвращает "moved" | "nomatch" — вызывающий (через `hyprctl repl`)
 * понимает, реально ли нашлось окно: `hyprctl eval` всегда печатает "ok", даже
 * когда окно ещё не замаплено, и по нему успех не отличить от промаха.
 * Чистая функция — покрыта юнит-тестом.
 */
function buildHyprlandPositionLua({ pid, title, x, y, scaleFactor = 1 }) {
  const qTitle = String(title).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const k = Number(scaleFactor) > 0 ? Number(scaleFactor) : 1;
  const px = (v) => Math.round((Number(v) || 0) * k);
  return [
    'local hit = false',
    'for _, w in ipairs(hl.get_windows()) do',
    `  if tonumber(w.pid) == ${Math.round(Number(pid) || 0)} and w.title == "${qTitle}" then`,
    '    hit = true',
    '    if not w.floating then',
    '      hl.dispatch(hl.dsp.window.float({ window = w, action = "set" }))',
    '    end',
    `    hl.dispatch(hl.dsp.window.move({ x = ${px(x)}, y = ${px(y)}, window = w }))`,
    '  end',
    'end',
    'return hit and "moved" or "nomatch"',
  ].join('\n');
}

/**
 * Lua-правило композитора для окна баннера: без рамки/скругления/тени/блюра и
 * без анимаций. Иначе Hyprland рисует свою рамку вокруг прозрачного floating-окна,
 * а анимация перемещения превращает постановку в угловую точку в «телепорт».
 * Чистая функция — покрыта юнит-тестом.
 */
function buildBannerRuleLua(title) {
  const qTitle = String(title).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return [
    'hl.window_rule({',
    '  name = "anix-banner",',
    `  match = { title = "^${qTitle}$" },`,
    '  border_size = 0,',
    '  rounding = 0,',
    '  no_shadow = true,',
    '  no_blur = true,',
    '  no_anim = true,',
    '  no_initial_focus = true,',
    '  no_focus = true,',
    '})',
  ].join('\n');
}

module.exports = {
  id: 'hyprland',
  confirmsPlacement: true,
  buildHyprlandPositionLua,
  buildBannerRuleLua,

  isAvailable() {
    return Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE);
  },

  /**
   * Монитор, на котором сейчас фокус. Нужен, чтобы поставить баннер на экран,
   * где пользователь: на Wayland клиент не знает ни своей позиции (getBounds
   * отдаёт 0,0), ни глобальной позиции курсора, поэтому спрашиваем композитор.
   * @param {(monitor: {x:number,y:number,width:number,height:number,scale:number}|null)=>void} cb
   */
  getFocusedMonitor(cb) {
    execFile('hyprctl', ['-j', 'monitors'], { timeout: 2000 }, (err, stdout) => {
      if (err) {
        if (typeof cb === 'function') cb(null);
        return;
      }
      try {
        const list = JSON.parse(String(stdout || '[]'));
        const m = Array.isArray(list) ? list.find((x) => x && x.focused) : null;
        if (typeof cb === 'function') {
          cb(m ? {
            x: m.x,
            y: m.y,
            width: m.width,
            height: m.height,
            scale: m.scale,
            reserved: m.reserved,
          } : null);
        }
      } catch {
        if (typeof cb === 'function') cb(null);
      }
    });
  },

  /**
   * Монитор, на котором находится конкретное окно (pid+title). Нужен, чтобы
   * ставить баннер на экран, где живёт главное окно приложения: на Wayland
   * Electron не знает позицию окна (getBounds → 0,0), поэтому спрашиваем
   * композитор. Если окно скрыто (трей) — его нет в списке, вернём null.
   * @param {{pid:number,title:string}} args
   * @param {(monitor: {x:number,y:number,width:number,height:number,scale:number}|null)=>void} cb
   */
  getWindowMonitor({ pid, title } = {}, cb) {
    const done = (m) => { if (typeof cb === 'function') cb(m); };
    execFile('hyprctl', ['-j', 'clients'], { timeout: 2000 }, (err, stdout) => {
      if (err) { done(null); return; }
      let idx;
      try {
        const list = JSON.parse(String(stdout || '[]'));
        const w = Array.isArray(list)
          ? list.find((c) => c && Number(c.pid) === Number(pid) && c.title === title)
          : null;
        if (!w || typeof w.monitor !== 'number') { done(null); return; }
        idx = w.monitor;
      } catch { done(null); return; }
      execFile('hyprctl', ['-j', 'monitors'], { timeout: 2000 }, (err2, out2) => {
        if (err2) { done(null); return; }
        try {
          const mons = JSON.parse(String(out2 || '[]'));
          const m = Array.isArray(mons) ? mons[idx] : null;
          done(m ? {
            x: m.x,
            y: m.y,
            width: m.width,
            height: m.height,
            scale: m.scale,
            reserved: m.reserved,
          } : null);
        } catch { done(null); }
      });
    });
  },

  /**
   * Правило для окна баннера: без рамки/скругления/тени/блюра и без анимаций.
   * Иначе Hyprland рисует свою рамку вокруг прозрачного floating-окна, а анимация
   * перемещения превращает постановку в угловую точку в «телепорт».
   * border_size/rounding — динамические эффекты, применяются и к уже созданному окну.
   * @param {string} title — точный заголовок окна баннера
   * @param {(err:Error|null)=>void} [cb]
   */
  applyBannerRule(title, cb) {
    const lua = buildBannerRuleLua(title);
    execFile('hyprctl', ['eval', lua], { timeout: 2000 }, (err) => {
      if (err) {
        const message = `hyprctl banner rule failed: ${err.message}`;
        if (warnedError !== message) {
          warnedError = message;
          logger.warn('notifications', message);
        }
      }
      if (typeof cb === 'function') cb(err || null);
    });
    return true;
  },

  /**
   * @param {{pid:number, title:string, x:number, y:number, scaleFactor?:number}} args
   * @param {(err:Error|null)=>void} [cb] — null, если окно найдено и перемещено;
   *   ошибка — если окно ещё не замаплено (повторяемо) или hyprctl упал
   * @returns {boolean} true, если команда композитору отправлена
   */
  moveWindow({ pid, title, x, y, scaleFactor } = {}, cb) {
    const lua = buildHyprlandPositionLua({ pid, title, x, y, scaleFactor });
    // repl, а не eval: возвращает значение скрипта ("moved"/"nomatch"), тогда как
    // eval всегда печатает "ok" и не отличает промах от успеха.
    execFile('hyprctl', ['repl', lua], { timeout: 2000 }, (err, stdout, stderr) => {
      if (err) {
        const message = `hyprctl position failed: ${err.message}`;
        if (warnedError !== message) {
          warnedError = message;
          logger.warn('notifications', message);
        }
        if (typeof cb === 'function') cb(err);
        return;
      }
      const out = `${stdout || ''}${stderr || ''}`;
      const moved = out.split('\n').some((line) => line.trim() === 'moved');
      if (typeof cb === 'function') cb(moved ? null : new Error('banner window not mapped yet'));
    });
    return true;
  },
};
