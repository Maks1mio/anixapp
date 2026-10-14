'use strict';

/**
 * GNOME (Mutter) backend: позиционирование баннера через GNOME Shell D-Bus Eval.
 *
 * Аналог Hyprland-ветки compositor-position.js: на нативном Wayland клиент не может
 * позиционировать свои окна, координаты отдаём композитору напрямую. На GNOME команда
 * уходит через:
 *   gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
 *     --method org.gnome.Shell.Eval '<js>'
 *
 * ЧЕСТНОЕ ПОЛОЖЕНИЕ ДЕЛ — на живом gnome-shell 50.5 (headless) проверена только
 * форма отказа Eval: `(false, '')` (пустое сообщение) — см. classifyResult.
 * Сам move (move_resize_frame для Wayland-окна) НЕ проверен — для этого нужен
 * Eval, а он в headless-сессии включается только unsafe-режимом (catch-22).
 * Все прочие допущения помечены:
 *   • org.gnome.Shell.Eval по умолчанию ОТКЛЮЧЁН начиная с GNOME 41 (unsafe mode off):
 *     вызов возвращает (false, ...) и/или ошибку D-Bus. Поэтому backend best-effort:
 *     при отказе классифицируем результат, разово логируем и никогда не роняем
 *     приложение — баннер останется там, куда его поставит композитор (ограничение
 *     протокола, не баг приложения).
 *   • Координаты: считаем, что MetaWindow.move_resize_frame() принимает ЛОГИЧЕСКИЕ
 *     пиксели (DIP), как координаты Electron, — поэтому scaleFactor осознанно НЕ
 *     применяется (в отличие от Hyprland-ветки). ДОПУЩЕНИЕ НЕ ПРОВЕРЕНО; проверять
 *     в nested gnome-shell с scale != 1.
 *   • move_resize_frame(false, ...) — user_op=false, чтобы move не считался
 *     пользовательским (в противном случае Mutter может дополнительно мешать).
 *   • Wayland-окнам Mutter может отказаться двигать/изменять окно — ожидаемо для
 *     best-effort: отказ всплывает как 'error: ...' из скрипта, БЕЗ ретраев.
 *   • Совпадение строго по pid + get_title(): у Wayland-приложений title может
 *     отличаться от ожидаемого, так что матчинг best-effort; wm_class намеренно
 *     не проверяем (у главного окна приложения тот же класс — нужен точный pid+title).
 */

const { execFile } = require('child_process');
const logger = require('../../logger');

const GDBUS_TIMEOUT_MS = 2000;

/** Разовый лог на уникальный текст (паттерн warnedError из compositor-position.js). */
let warnedMessage = '';

/**
 * Экранирование строки под одинарные кавычки JS-литерала внутри Eval-скрипта.
 * Заголовок — константа приложения, но экранируем защищённо: backslash → \\,
 * одинарная кавычка → \', управляющие символы (переводы строк и пр.) → пробел,
 * чтобы литерал не разорвать. Внешняя инъекция невозможна и по построению: скрипт
 * уходит одним argv-элементом execFile (без shell), а pid/координаты — числа.
 * @param {unknown} value
 * @returns {string}
 */
function escapeEvalString(value) {
  let out = '';
  for (const ch of String(value)) {
    const code = ch.codePointAt(0);
    if (code === 0x5c) out += '\\\\'; // backslash
    else if (code === 0x27) out += "\\'"; // одинарная кавычка
    else if (code <= 0x1f || code === 0x7f) out += ' '; // control chars
    else out += ch;
  }
  return out;
}

/**
 * JS-источник для org.gnome.Shell.Eval: ищет окно баннера по pid+title и двигает
 * его через move_resize_frame. Всё тело обёрнуто в try/catch — любая ошибка скрипта
 * возвращается строкой 'error: ...', а не исключением D-Bus. Чистая функция —
 * покрыта юнит-тестами, включая реальное исполнение через eval с заглушкой global.
 *
 * @param {object} params
 * @param {number} params.pid — pid процесса-владельца окна
 * @param {string} params.title — точный заголовок окна баннера
 * @param {number} params.x — DIP (логические пиксели)
 * @param {number} params.y — DIP
 * @param {number} params.width — DIP
 * @param {number} params.height — DIP
 * @param {number} [params.scaleFactor] — принимается для совместимости сигнатуры
 *   с Hyprland-бэкендом, НЕ применяется (см. доку модуля про DIP)
 * @returns {string} JS-исходник для Eval
 */
function buildScript({ pid, title, x, y, width: _width, height: _height, scaleFactor = 1 }) {
  // В скрипт попадают только числа: всё приводим жёстко (Number + round), чтобы
  // ни один вход не мог превратиться в произвольный JS-код.
  const num = (v) => Math.round(Number(v) || 0);
  const qTitle = escapeEvalString(title);
  // scale валидируем, но НЕ используем для умножения — координаты уже DIP.
  const scale = Number(scaleFactor) > 0 ? Number(scaleFactor) : 1;
  return [
    `// anix banner move: coords are DIP (scale=${scale} intentionally not applied)`,
    '(function () {',
    '  try {',
    `    var pid = ${num(pid)};`,
    `    var title = '${qTitle}';`,
    '    var actors = global.get_window_actors() || [];',
    '    for (var i = 0; i < actors.length; i++) {',
    '      var mw = actors[i] && actors[i].meta_window;',
    '      if (!mw) continue;',
    '      if (mw.get_pid() !== pid) continue;',
    '      if (mw.get_title() !== title) continue;',
    // position-only: размер не трогаем (держит Electron setBounds) — читаем текущий.
    '      var f = mw.get_frame_rect();',
    `      mw.move_resize_frame(false, ${num(x)}, ${num(y)}, f.width, f.height);`,
    "      return 'ok';",
    '    }',
    "    return 'no-match';",
    '  } catch (e) {',
    "    return 'error: ' + e;",
    '  }',
    '})()',
  ].join('\n');
}

/**
 * argv для execFile('gdbus', ...): call + точные dest/object-path/method и сам
 * скрипт одним аргументом (shell не участвует — экранировать под shell не нужно).
 * @param {string} jsSource
 * @returns {string[]}
 */
function buildDispatchArgv(jsSource) {
  return [
    'call',
    '--session',
    '--dest', 'org.gnome.Shell',
    '--object-path', '/org/gnome/Shell',
    '--method', 'org.gnome.Shell.Eval',
    String(jsSource),
  ];
}

/**
 * Классификация результата gdbus.
 *
 * Формы ответа (по докам/соглашению; живой пргон НЕ выполнялся):
 *   • скрипт дошёл до Eval и вернул строку: stdout "(true, 'ok')",
 *     "(true, 'no-match')", "(true, 'error: ...')";
 *   • Eval запрещён (unsafe mode off с GNOME 41): exit 0 и stdout "(false, <текст>)",
 *     где текст упоминает Eval/security/unsafe — ТЕКСТ НЕ ПРОВЕРЕН по версиям GNOME,
 *     при пустом сообщении честно классифицируем 'error' (наш скрипт false не возвращает);
 *   • прочее (нет шины, нет org.gnome.Shell, таймаут) — ненулевой exit → 'error'.
 *
 * @param {string|undefined} stdout
 * @param {string|undefined} stderr
 * @param {number|null|undefined} exitCode
 * @returns {'ok' | 'eval-disabled' | 'no-match' | 'error'}
 */
function classifyResult(stdout, stderr, exitCode) {
  // null/undefined exitCode (процесс убит по таймауту, код неизвестен) — не успех.
  const code = exitCode == null ? Number.NaN : Number(exitCode);
  if (!Number.isFinite(code) || code !== 0) return 'error';

  const out = String(stdout || '');
  if (out.includes('(true')) {
    if (out.includes("'no-match'")) return 'no-match';
    if (out.includes("'ok'")) return 'ok';
    // "(true, 'error: ...')" — скрипт поймал исключение внутри себя (например,
    // Mutter отказал в move) или вернул неизвестный payload.
    return 'error';
  }

  const falseIdx = out.indexOf('(false');
  if (falseIdx !== -1) {
    // (false, ...): наш скрипт false не возвращает (try/catch + строки 'ok'/'no-match'),
    // значит Shell отказал в Eval. ПРОВЕРЕНО на живом gnome-shell 50.5 (headless):
    // отключённый Eval приходит как (false, '') — ПУСТОЕ сообщение. Поэтому пустой
    // текст = eval-disabled, содержательный — по ключевым словам.
    const detail = out.slice(falseIdx);
    if (!detail.replace('(false', '').replace(/[^\w]/g, '').trim()
      || /eval|secur|unsafe|lock|disabl|allow/i.test(detail)) {
      return 'eval-disabled';
    }
    return 'error';
  }

  // Exit 0 без ожидаемого stdout / что-то в stderr — ошибка вызова.
  return 'error';
}

/**
 * Dispatch позиции баннера через GNOME Shell Eval. Никогда не бросает; при проблемах
 * логирует разово на уникальный текст (logger в этой сборке no-op, но текст держим
 * полным для будущих сборок). Без ретраев: отказ Mutter/отсутствие окна ещё раз
 * не дёргаем — повторный вызов придёт от следующего изменения позиции баннера.
 *
 * @param {object} params — { pid, title, x, y }; width/height бэкендом не
 *   используются (position-only: размер держит Electron setBounds)
 * @returns {boolean} true, если вызов gdbus отправлен (не гарантирует успех move)
 */
function moveWindow(params) {
  try {
    const jsSource = buildScript(params);
    const argv = buildDispatchArgv(jsSource);
    execFile('gdbus', argv, { timeout: GDBUS_TIMEOUT_MS }, (err, stdout, stderr) => {
      const exitCode = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      const verdict = classifyResult(stdout, stderr, exitCode);
      const message = `gnome Eval move: ${verdict}${err ? ` (${err.message})` : ''}`;
      if (warnedMessage !== message) {
        warnedMessage = message;
        if (verdict === 'ok') logger.debug('notifications', message);
        else logger.warn('notifications', message);
      }
    });
    return true;
  } catch (err) {
    // execFile с callback не бросает синхронно (ENOENT уйдёт в callback), но
    // защищаемся от синхронных исключений при построении скрипта.
    const message = `gnome Eval move failed: ${err && err.message}`;
    if (warnedMessage !== message) {
      warnedMessage = message;
      logger.warn('notifications', message);
    }
    return false;
  }
}

module.exports = {
  id: 'gnome',
  /**
   * GNOME обнаружен? Синхронно и дёшево, только env. Вызывающий код уже подтвердил
   * linux + нативный wayland.
   * @returns {boolean}
   */
  isAvailable() {
    const markers = [
      String(process.env.XDG_CURRENT_DESKTOP || ''),
      String(process.env.XDG_SESSION_DESKTOP || ''),
    ];
    return markers.some((v) => v.toLowerCase().includes('gnome'));
  },
  buildScript,
  buildDispatchArgv,
  classifyResult,
  moveWindow,
};
