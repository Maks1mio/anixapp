/**
 * Интерактивный запуск live-разработки на Android: стрелки ↑/↓ — выбор, Enter — подтвердить, Пробел — галочка.
 *
 *   npm run live                 # меню: TV / телефон → эмулятор / USB / Wi-Fi → опции
 *   npm run live -- tv --device  # с аргументами меню пропускается, они уходят прямо в emu-live.mjs
 *
 * Адрес устройства по умолчанию: ANIXAPP_LIVE_TV / ANIXAPP_LIVE_MOBILE=IP[:PORT] в .env — он стоит первым
 * и выбран сразу (введённый вручную адрес записывается туда сам). Телефоны с «Отладкой по Wi-Fi» в сети
 * появляются в списке автоматически. Последний выбор запоминается в .anix-live.json (в git не попадает).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { findAndroidSdk } from './lib/android-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emuLive = path.join(root, 'scripts', 'emu-live.mjs');
const stateFile = path.join(root, '.anix-live.json');

function runEmuLive(args) {
  // Ctrl+C получает и дочерний процесс — сами только ждём его завершения
  process.on('SIGINT', () => {});
  const child = spawn(process.execPath, [emuLive, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}

// ── Состояние ────────────────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    /* не критично */
  }
}

// ── Устройства ───────────────────────────────────────────────────────────────

const sdkDir = findAndroidSdk();
const adb = sdkDir ? path.join(sdkDir, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : '';

function adbOut(...args) {
  if (!adb || !existsSync(adb)) return '';
  const r = spawnSync(adb, args, { encoding: 'utf8', timeout: 8000 });
  return `${r.stdout || ''}${r.stderr || ''}`.trim();
}

function listAvds() {
  const home = process.env.ANDROID_AVD_HOME
    || path.join(process.env.USERPROFILE || process.env.HOME || '', '.android', 'avd');
  if (!existsSync(home)) return [];
  return readdirSync(home)
    .filter((f) => f.endsWith('.ini'))
    .map((f) => f.replace(/\.ini$/, ''))
    .map((name) => {
      let tag = '';
      try {
        tag = readFileSync(path.join(home, `${name}.avd`, 'config.ini'), 'utf8').match(/^tag\.id\s*=\s*(.*)$/m)?.[1] || '';
      } catch {
        /* решаем по имени */
      }
      return { name, tv: /tv/i.test(tag) || (!tag && /tv/i.test(name)) };
    });
}

/** [{ serial, state, model, emulator, avd, wifi, tv }] из adb devices -l. */
function listDevices() {
  return adbOut('devices', '-l')
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      const emulator = serial.startsWith('emulator-');
      const online = state === 'device';
      return {
        serial,
        state,
        model: (l.match(/model:(\S+)/)?.[1] || '').replace(/_/g, ' '),
        emulator,
        avd: emulator && online ? adbOut('-s', serial, 'emu', 'avd', 'name').split(/\r?\n/)[0].trim() : '',
        wifi: /:\d+$|_adb-tls-connect/.test(serial),
        tv: online && /tv/i.test(adbOut('-s', serial, 'shell', 'getprop', 'ro.build.characteristics')),
      };
    });
}

/** IP:PORT телефонов, объявивших «Отладку по Wi-Fi» через mDNS (уже сопряжённых с этим ПК). */
function mdnsConnectAddrs() {
  return adbOut('mdns', 'services')
    .split(/\r?\n/)
    .map((l) => l.match(/_adb-tls-connect\._tcp\.?\s+(\S+:\d+)/)?.[1])
    .filter(Boolean);
}

// ── Адрес по умолчанию из .env ───────────────────────────────────────────────

const envKey = (target) => (target === 'tv' ? 'ANIXAPP_LIVE_TV' : 'ANIXAPP_LIVE_MOBILE');

/** ANIXAPP_LIVE_TV / ANIXAPP_LIVE_MOBILE=IP[:PORT] из окружения или .env (без порта — 5555). */
function configuredAddr(target) {
  const key = envKey(target);
  let value = process.env[key] || '';
  if (!value) {
    try {
      const line = readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).find((l) => l.trim().startsWith(`${key}=`));
      value = line ? line.slice(line.indexOf('=') + 1) : '';
    } catch {
      /* нет .env */
    }
  }
  value = value.trim().replace(/^["']|["']$/g, '');
  if (!value) return '';
  return /:\d+$/.test(value) ? value : `${value}:5555`;
}

/** Записывает/заменяет ANIXAPP_LIVE_* в .env (файл в .gitignore). */
function saveConfiguredAddr(target, addr) {
  const file = path.join(root, '.env');
  const key = envKey(target);
  try {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text ? text.split(/\r?\n/) : [];
    const i = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
    if (i >= 0) lines[i] = `${key}=${addr}`;
    else {
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines.push(`${key}=${addr}`, '');
    }
    writeFileSync(file, lines.join(eol));
  } catch {
    /* не критично — адрес всё равно в истории .anix-live.json */
  }
}

// ── Меню на стрелках ─────────────────────────────────────────────────────────

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
};

/**
 * items: [{ label, hint? }]. multi=false → индекс; multi=true → массив отмеченных флагов.
 */
function menu(title, items, { initial = 0, multi = false, checked = [] } = {}) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    let cursor = Math.min(Math.max(initial, 0), items.length - 1);
    const marks = items.map((_, i) => checked.includes(i));
    let drawn = 0;

    const render = () => {
      if (drawn) stdout.write(`\x1b[${drawn}A\x1b[J`);
      const lines = [`${c.bold(title)} ${c.dim(multi ? '↑↓ · Пробел — отметить · Enter — дальше' : '↑↓ · Enter')}`];
      items.forEach((it, i) => {
        const active = i === cursor;
        const box = multi ? `${marks[i] ? '◉' : '○'} ` : '';
        const text = `${active ? '❯' : ' '} ${box}${it.label}${it.hint ? `  ${c.dim(it.hint)}` : ''}`;
        lines.push(active ? c.cyan(text) : text);
      });
      stdout.write(`${lines.join('\n')}\n`);
      drawn = lines.length;
    };

    const done = (value, summary) => {
      stdin.off('keypress', onKey);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write(`\x1b[${drawn}A\x1b[J${c.bold(title)} ${c.cyan(summary)}\n\x1b[?25h`);
      resolve(value);
    };

    const onKey = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        stdout.write('\x1b[?25h\n');
        process.exit(130);
      }
      if (key.name === 'up' || key.name === 'k') cursor = (cursor - 1 + items.length) % items.length;
      else if (key.name === 'down' || key.name === 'j') cursor = (cursor + 1) % items.length;
      else if (multi && key.name === 'space') marks[cursor] = !marks[cursor];
      else if (key.name === 'return' || key.name === 'enter') {
        if (multi) {
          const picked = marks.flatMap((m, i) => (m ? [i] : []));
          return done(picked, picked.length ? picked.map((i) => items[i].label).join(', ') : 'нет');
        }
        return done(cursor, items[cursor].label);
      } else if (!multi && /^[1-9]$/.test(str || '') && Number(str) <= items.length) {
        cursor = Number(str) - 1;
        return done(cursor, items[cursor].label);
      } else return;
      render();
    };

    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKey);
    stdout.write('\x1b[?25l');
    render();
  });
}

async function ask(question, fallback = '') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${c.bold(question)}${fallback ? c.dim(` (${fallback})`) : ''}: `)).trim();
  rl.close();
  return answer || fallback;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const state = loadState();
  const wifiHistory = Array.isArray(state.wifiHistory) ? state.wifiHistory : [];

  const targets = [
    { id: 'tv', label: 'Android TV' },
    { id: 'mobile', label: 'Телефон' },
  ];
  const targetIdx = await menu('Что запускаем?', targets, {
    initial: Math.max(0, targets.findIndex((t) => t.id === state.target)),
  });
  const target = targets[targetIdx].id;
  const isTv = target === 'tv';

  // Варианты «где»: подключённые сейчас → эмуляторы → сохранённые Wi-Fi → ввод / поиск
  const devices = listDevices();
  const where = [];
  for (const d of devices.filter((x) => !x.emulator && x.state === 'device')
    .sort((a, b) => Number(b.tv === isTv) - Number(a.tv === isTv))) {
    where.push({
      key: `serial:${d.serial}`,
      label: `${d.wifi ? 'Wi-Fi' : 'USB'}: ${d.model || d.serial}`,
      hint: `${d.serial}${d.tv !== isTv ? (d.tv ? ' · это TV' : ' · это не TV') : ''}`,
      args: ['--serial', d.serial],
    });
  }
  for (const d of devices.filter((x) => !x.emulator && x.state === 'unauthorized')) {
    where.push({ key: `serial:${d.serial}`, label: `USB: ${d.serial}`, hint: 'подтверди отладку на экране устройства', args: ['--serial', d.serial] });
  }
  const running = new Set(devices.filter((d) => d.avd).map((d) => d.avd));
  for (const avd of listAvds().filter((a) => a.tv === isTv)) {
    where.push({ key: `avd:${avd.name}`, label: `Эмулятор: ${avd.name}`, hint: running.has(avd.name) ? 'запущен' : '', args: ['--avd', avd.name] });
  }
  const connectedSerials = new Set(devices.map((d) => d.serial));
  const listed = new Set(connectedSerials);
  const addWifi = (addr, hint, front = false) => {
    if (listed.has(addr)) return;
    listed.add(addr);
    const item = { key: `wifi:${addr}`, label: `Wi-Fi: ${addr}`, hint, args: ['--connect', addr], addr };
    if (front) where.unshift(item);
    else where.push(item);
  };
  // Адрес из .env — первым и выбранным по умолчанию
  const configured = configuredAddr(target);
  if (configured) {
    const connected = where.find((w) => w.key === `serial:${configured}`);
    if (connected) where.unshift(...where.splice(where.indexOf(connected), 1));
    else addWifi(configured, `из .env (${envKey(target)})`, true);
  }
  // Телефоны с включённой «Отладкой по Wi-Fi» в этой сети — сразу с IP и портом
  for (const addr of mdnsConnectAddrs()) addWifi(addr, 'найден в сети');
  for (const addr of wifiHistory) addWifi(addr, 'сохранённый');
  where.push({ key: 'wifi:new', label: 'Wi-Fi: ввести IP[:порт]…', hint: isTv ? 'TV: «Отладка по сети», порт 5555' : 'IP и порт с экрана «Отладка по Wi-Fi»' });
  if (!isTv) where.push({ key: 'wifi:auto', label: 'Wi-Fi: найти телефон автоматически', hint: 'mDNS, сопряжение по коду', args: ['--connect'] });

  const whereIdx = await menu('Где?', where, {
    initial: configured ? 0 : Math.max(0, where.findIndex((w) => w.key === state.where)),
  });
  const choice = where[whereIdx];

  let args = choice.args;
  let addr = choice.addr;
  if (choice.key === 'wifi:new') {
    addr = await ask('IP[:порт] устройства', wifiHistory[0] || '');
    if (!addr) {
      console.error('Адрес не указан.');
      process.exit(1);
    }
    if (!/:\d+$/.test(addr)) addr = `${addr}:5555`;
    args = ['--connect', addr];
    saveConfiguredAddr(target, addr);
    console.log(c.dim(`  сохранено в .env: ${envKey(target)}=${addr} — дальше подставится само`));
  }
  // Подключённое по Wi-Fi устройство тоже запоминаем, чтобы в следующий раз оно было в списке
  if (!addr && choice.key.startsWith('serial:') && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(choice.key.slice(7))) addr = choice.key.slice(7);

  const options = [
    { flag: '--rebuild', label: 'Пересобрать APK', hint: 'после правок нативного кода' },
    { flag: '--logcat', label: 'Логи WebView в терминал', hint: 'logcat' },
    { flag: '--reinstall', label: 'Переустановить при другой подписи', hint: 'сотрёт данные приложения' },
  ];
  const lastFlags = Array.isArray(state.flags) ? state.flags.filter((f) => f !== '--rebuild') : [];
  const picked = await menu('Опции', options, {
    multi: true,
    checked: options.flatMap((o, i) => (lastFlags.includes(o.flag) ? [i] : [])),
  });
  const flags = picked.map((i) => options[i].flag);

  saveState({
    target,
    where: addr ? `wifi:${addr}` : choice.key,
    flags,
    wifiHistory: addr ? [addr, ...wifiHistory.filter((a) => a !== addr)].slice(0, 6) : wifiHistory,
  });

  const finalArgs = [target, ...args, ...flags];
  console.log(c.dim(`→ node scripts/emu-live.mjs ${finalArgs.join(' ')}\n`));
  runEmuLive(finalArgs);
}

const passthrough = process.argv.slice(2);
if (passthrough.length || !process.stdin.isTTY) {
  if (!passthrough.length) {
    console.error('Нет интерактивного терминала — передай аргументы: npm run live -- tv|mobile [--device | --connect IP:PORT]');
    process.exit(1);
  }
  runEmuLive(passthrough);
} else {
  await main();
}
