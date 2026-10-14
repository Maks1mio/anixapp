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
/** for_window — правило постоянное; не плодим дубликаты при повторных вызовах. */
let appliedRuleTitle = '';

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
 *
 * @param {object} options
 * @param {(err:Error|null)=>void} [cb] — вызывается по завершении swaymsg
 */
function moveWindow(options = {}, cb) {
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
    if (typeof cb === 'function') cb(err || null);
  });
  return true;
}

/** Один `swaymsg -t <topic> -r` с JSON-парсингом; ошибки → cb(null). */
function swayJson(args, cb) {
  execFile('swaymsg', args, { timeout: 2000 }, (err, stdout) => {
    if (err) { cb(null); return; }
    try {
      cb(JSON.parse(String(stdout || 'null')));
    } catch {
      cb(null);
    }
  });
}

/** Монитор из записи sway `get_outputs` (rect/scale) в наш формат. */
function outputToMonitor(out) {
  if (!out || !out.rect) return null;
  const { x, y, width, height } = out.rect;
  // get_outputs отдаёт и выключенные выходы (rect 0×0) — такие не монитор.
  if (!(width > 0) || !(height > 0)) return null;
  return {
    x,
    y,
    width,
    height,
    scale: Number(out.scale) > 0 ? Number(out.scale) : 1,
    // sway IPC не отдаёт reserved (эксклюзивную зону бара) — считаем нулевой.
    reserved: [0, 0, 0, 0],
  };
}

/**
 * Монитор, на котором сейчас фокус. Сначала пробуем `focused` в get_outputs,
 * иначе — output активного workspace (get_workspaces.focused → output).
 * @param {(monitor: {x:number,y:number,width:number,height:number,scale:number,reserved:number[]}|null)=>void} cb
 */
function getFocusedMonitor(cb) {
  const done = (m) => { if (typeof cb === 'function') cb(m); };
  swayJson(['-t', 'get_outputs', '-r'], (outputs) => {
    if (Array.isArray(outputs)) {
      const focused = outputs.find((o) => o && o.focused);
      if (focused) { done(outputToMonitor(focused)); return; }
    }
    swayJson(['-t', 'get_workspaces', '-r'], (ws) => {
      const active = Array.isArray(ws) ? ws.find((w) => w && w.focused) : null;
      if (!active || !active.output) { done(null); return; }
      swayJson(['-t', 'get_outputs', '-r'], (outs) => {
        const out = Array.isArray(outs) ? outs.find((o) => o && o.name === active.output) : null;
        done(outputToMonitor(out));
      });
    });
  });
}

/** Рекурсивный поиск контейнера по pid + name (title) в дереве sway. */
function findTreeNode(node, pid, title) {
  if (!node || typeof node !== 'object') return null;
  if (Number(node.pid) === Number(pid) && node.name === title && node.rect) return node;
  for (const key of ['nodes', 'floating_nodes']) {
    const list = Array.isArray(node[key]) ? node[key] : [];
    for (const child of list) {
      const hit = findTreeNode(child, pid, title);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Монитор, где находится конкретное окно (pid+name). Ищем узел в get_tree и
 * сопоставляем его центр с rect вывода из get_outputs.
 * @param {{pid:number,title:string}} args
 * @param {(monitor: object|null)=>void} cb
 */
function getWindowMonitor({ pid, title } = {}, cb) {
  const done = (m) => { if (typeof cb === 'function') cb(m); };
  swayJson(['-t', 'get_tree', '-r'], (tree) => {
    const node = tree ? findTreeNode(tree, pid, title) : null;
    if (!node) { done(null); return; }
    const cx = node.rect.x + Math.floor(node.rect.width / 2);
    const cy = node.rect.y + Math.floor(node.rect.height / 2);
    swayJson(['-t', 'get_outputs', '-r'], (outs) => {
      const list = Array.isArray(outs) ? outs : [];
      const hit = list.find((o) => o && o.rect
        && cx >= o.rect.x && cx < o.rect.x + o.rect.width
        && cy >= o.rect.y && cy < o.rect.y + o.rect.height);
      // Центр окна не попал ни в один выход — честный null, чтобы фасад взял
      // фокусный/primary, а не первый попавшийся монитор.
      done(outputToMonitor(hit));
    });
  });
}

/**
 * Правило для окна баннера: без рамки и принудительно floating. `for_window`
 * (а не разовый критерий) — правило постоянное и применится к окну и позже, когда
 * оно появится в дереве; разовая команда промахнулась бы до маппинга.
 * Анимаций и per-window фокуса у sway нет — это максимум.
 * @param {string} title
 * @param {(err:Error|null)=>void} [cb]
 */
function applyBannerRule(title, cb) {
  if (appliedRuleTitle === String(title)) {
    if (typeof cb === 'function') cb(null);
    return true;
  }
  const qTitle = escapeTitleRegex(title);
  const command = `for_window [title="^${qTitle}$"] border none, floating enable`;
  execFile('swaymsg', [command], { timeout: 2000 }, (err) => {
    if (err) {
      const message = `swaymsg banner rule failed: ${err.message}`;
      if (warnedError !== message) {
        warnedError = message;
        logger.warn('notifications', message);
      }
    } else {
      appliedRuleTitle = String(title);
    }
    if (typeof cb === 'function') cb(err || null);
  });
  return true;
}

/** @returns {boolean} sway-сокет в env? Синхронно, дёшево, без побочных эффектов. */
function isAvailable() {
  return Boolean(process.env.SWAYSOCK);
}

module.exports = {
  id: 'sway',
  confirmsPlacement: true,
  isAvailable,
  buildCommand,
  outputToMonitor,
  findTreeNode,
  moveWindow,
  getFocusedMonitor,
  getWindowMonitor,
  applyBannerRule,
};
