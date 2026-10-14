'use strict';

/**
 * Sway-бэкенд позиционирования баннера средствами композитора (Wayland IPC).
 *
 * Дополнение к ../compositor-position.js (тот — Hyprland через `hyprctl eval`).
 * Sway управляется через `swaymsg '<command>'`: команда уходит в сокет из
 * $SWAYSOCK. Детект композитора — только по env, синхронно и дёшево: вызывается
 * уже после того, как колллер подтвердил linux + нативный wayland.
 *
 * ВАЖНО: проверено только юнит-тестами — sway на машине разработки не установлен,
 * живой прогон не делался. Реализация консервативна: ровно один argv в execFile
 * (без shell, поэтому shell-инъекций нет в принципе), никаких парсингов ответа.
 *
 * Селекция окна — критериями sway: [pid=NNN title="^regex$"]. pid — основной
 * ключ (колллер отдаёт уже Number-coerced целое), title — вторичная защита от
 * чужих окон того же процесса. Значение title в критерии — ERE-регэксп, поэтому
 * экранируем его и как строку в кавычках (`\`, `"`), и как регэксп
 * (.*[]{}()^$?+|/`-`), и от разделителей команд sway (`;`, `,`) — см.
 * escapeTitleRegex().
 *
 * Порядок команд важен: floating enable ДО move — замещённые (tiled) окна
 * absolute move игнорируют, раскладку двигает композитор. Размер не задаём
 * (position-only: его держит Electron setBounds, move размер не меняет).
 *
 * Координаты и масштаб: sway живёт в координатах глобального layout-пространства
 * (`move absolute position X Y`), Electron (workArea/setBounds) — в DIP. Умножаем
 * на display.scaleFactor, как в Hyprland-бэкенде; на scale=1 это no-op.
 * ДОПУЩЕНИЕ: глобальные координаты sway — физические пиксели того же
 * пространства, что DIP*scaleFactor у Electron. Проверка на живом sway: при
 * output scale=1.5 (`swaymsg -t get_outputs`) после move сверить x/y окна в
 * `swaymsg -t get_tree` с round(x*1.5)/round(y*1.5); если совпадёт с сырыми
 * DIP-координатами — значит sway ждёт layout- (логические) пиксели и множитель
 * надо убрать.
 *
 * Ошибки: swaymsg при непопавшем критерии или неизвестной команде выходит с
 * non-zero + stderr — пишем в logger.warn с дедупликацией «одинаковый текст —
 * один раз», как в ../compositor-position.js. Наружу не бросаем никогда.
 */

const { execFile } = require('child_process');
const logger = require('../../logger');

/** Повтор команды: при первом show окна может ещё не быть в дереве композитора. */

let warnedError = '';

/**
 * Экранирование title для критерия sway `title="..."`. Значение критерия —
 * ERE-регэксп, поэтому экранируем одним проходом:
 *  • как строку в кавычках: `\` и `"` (иначе `"` закрывает критерий);
 *  • как регэксп: `.*[]{}()^$?+|/` и `-` (ср. пример `^anix\-banner\-stack$`);
 *  • от разделителей команд sway `;` и `,`: даже наивный парсер, плюющий на
 *    кавычки, не увидит в значении ни одного сырого разделителя.
 * Заголовок — app-owned константа, но экранируем защищённо; чистая функция,
 * покрыта юнит-тестом.
 */
function escapeTitleRegex(title) {
  return String(title).replace(/[\\.*[\]{}()^$?+|/;,"-]/g, '\\$&');
}

/**
 * Чистая сборка строки команды для swaymsg — покрыта юнит-тестом.
 * Координаты Electron DIP + scaleFactor → физические пиксели (умножить,
 * округлить). Одна команда: критерий, floating enable, абсолютный move.
 */
function buildCommand({ pid, title, x, y, width: _width, height: _height, scaleFactor = 1 }) {
  const safePid = Math.round(Number(pid) || 0);
  const qTitle = escapeTitleRegex(title);
  const k = Number(scaleFactor) > 0 ? Number(scaleFactor) : 1;
  const px = (v) => Math.round((Number(v) || 0) * k);
  return [
    `[pid=${safePid} title="^${qTitle}$"]`,
    'floating enable',
    `move absolute position ${px(x)} ${px(y)}`,
  ].join(', ');
}

/**
 * Асинхронно отправляет команду позиционирования через swaymsg IPC. Никогда не
 * бросает; @returns {boolean} true, если команда отправлена. Повтор при первом
 * show — забота фасада (единый RETRY_DELAY_MS для всех бэкендов).
 */
function moveWindow(options) {
  const command = buildCommand(options);
  // Весь criteria+command — ОДИН argv: swaymsg принимает команду одним
  // аргументом, shell не участвует. timeout страховка от зависшего сокета.
  execFile('swaymsg', [command], { timeout: 2000 }, (err) => {
    // logger в этой сборке no-op, но ошибку держим видимой для будущих сборок:
    // warn повторяется при смене текста ошибки (например, пропал swaymsg).
    if (err) {
      const message = `swaymsg position failed: ${err.message}`;
      if (warnedError !== message) {
        warnedError = message;
        logger.warn('notifications', message);
      }
    }
  });
  return true;
}

/** @returns {boolean} sway-сокет в env? Синхронно, дёшево, без побочных эффектов. */
function isAvailable() {
  return Boolean(process.env.SWAYSOCK);
}

module.exports = {
  id: 'sway',
  isAvailable,
  buildCommand,
  moveWindow,
};
