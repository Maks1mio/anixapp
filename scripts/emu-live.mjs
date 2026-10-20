/**
 * Live-разработка на Android (эмулятор или реальное устройство): Vite на ПК + debug APK, который грузит UI
 * с dev-сервера. Правки в src/ прилетают через HMR, APK пересобирается только при смене адреса / --rebuild.
 *
 *   node scripts/emu-live.mjs tv                 # AVD с android-tv образом, Vite VITE_TV_MODE=1 :5174
 *   node scripts/emu-live.mjs mobile             # телефонный AVD, Vite VITE_MOBILE_MODE=1 :5175
 *   node scripts/emu-live.mjs mobile --device    # реальный телефон по USB (или уже подключённый по Wi-Fi adb)
 *   node scripts/emu-live.mjs tv --connect 192.168.1.50:5555   # adb connect к телевизору/телефону по Wi-Fi
 *   node scripts/emu-live.mjs tv --serial R58M12345            # конкретное устройство из adb devices
 *   node scripts/emu-live.mjs tv --rebuild       # принудительно пересобрать APK (после правок нативного кода)
 *   node scripts/emu-live.mjs tv --logcat        # + консоль WebView/Capacitor из logcat
 *   node scripts/emu-live.mjs tv --avd TV_API36_Root --port 5180
 *
 * Адрес UI всегда http://localhost:<порт>: `adb reverse` пробрасывает порт устройства на ПК (работает и по USB,
 * и по Wi-Fi adb, и в эмуляторе), поэтому LAN-IP и одна и та же сборка APK подходят везде.
 * WebView отлаживается через chrome://inspect. Обычные сборки (build:android-tv / build:android-mobile)
 * заново делают cap sync, и live-адрес в них не попадает.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { createInterface } from 'node:readline/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeMissingAndroidEnv, findAndroidSdk, findJavaHome } from './lib/android-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  const value = i >= 0 ? argv[i + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
};

const target = argv.find((a) => a === 'tv' || a === 'mobile');
if (!target) {
  console.error('Укажи цель: node scripts/emu-live.mjs tv|mobile [--device | --serial S | --connect IP:PORT | --avd NAME]'
    + ' [--port N] [--rebuild] [--logcat]');
  process.exit(1);
}
const isTv = target === 'tv';

const TARGETS = {
  tv: {
    androidDir: 'android',
    webDir: 'dist-android',
    appId: 'com.anixapp.tv',
    port: 5174,
    viteEnv: { VITE_TV_MODE: '1' },
  },
  mobile: {
    androidDir: 'android-mobile',
    webDir: 'dist-mobile',
    appId: 'com.mobileapp.anix',
    port: 5175,
    viteEnv: { VITE_MOBILE_MODE: '1' },
  },
};
const cfg = TARGETS[target];
const port = Number(option('--port') || process.env.ANIXAPP_DEV_PORT || cfg.port);
const liveUrl = `http://localhost:${port}`;
const connectAddr = option('--connect');
const forcedSerial = option('--serial') || (connectAddr ? (connectAddr.includes(':') ? connectAddr : `${connectAddr}:5555`) : '');
// --connect без адреса: берём устройство, уже подключённое по Wi-Fi adb
const wifiOnly = flag('--connect') && !connectAddr;
const useDevice = flag('--device') || flag('--connect') || Boolean(forcedSerial);

const sdkDir = findAndroidSdk();
const javaHome = findJavaHome();
if (!sdkDir || !javaHome) {
  console.error(describeMissingAndroidEnv({ javaHome, sdkDir }));
  process.exit(1);
}
const adb = path.join(sdkDir, 'platform-tools', isWin ? 'adb.exe' : 'adb');
const emulator = path.join(sdkDir, 'emulator', isWin ? 'emulator.exe' : 'emulator');
for (const bin of useDevice ? [adb] : [adb, emulator]) {
  if (!existsSync(bin)) {
    console.error(`Не найден ${bin} — поставь platform-tools и Android Emulator в SDK Manager.`);
    process.exit(1);
  }
}

const env = {
  ...process.env,
  ANDROID_HOME: sdkDir,
  ANDROID_SDK_ROOT: sdkDir,
  JAVA_HOME: javaHome,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function adbOut(...args) {
  // timeout: зависшая система в эмуляторе не должна вешать скрипт
  const r = spawnSync(adb, args, { env, encoding: 'utf8', timeout: 15_000 });
  return `${r.stdout || ''}${r.stderr || ''}`.trim();
}

function run(cmd, args, cwd = root, extraEnv = {}) {
  const r = spawnSync(cmd, args, { cwd, env: { ...env, ...extraEnv }, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    console.error(`✗ ${cmd} ${args.join(' ')} → код ${r.status}`);
    shutdown(r.status ?? 1);
  }
}

// ── AVD ──────────────────────────────────────────────────────────────────────

function avdHome() {
  return process.env.ANDROID_AVD_HOME
    || path.join(process.env.USERPROFILE || process.env.HOME || '', '.android', 'avd');
}

/** [{ name, tv }] по config.ini каждого AVD (tag.id android-tv / google-tv). */
function listAvds() {
  const home = avdHome();
  const names = existsSync(home)
    ? readdirSync(home).filter((f) => f.endsWith('.ini')).map((f) => f.replace(/\.ini$/, ''))
    : adbOutEmulatorList();
  return names.map((name) => {
    let tag = '';
    try {
      const ini = readFileSync(path.join(home, `${name}.avd`, 'config.ini'), 'utf8');
      tag = ini.match(/^tag\.id\s*=\s*(.*)$/m)?.[1]?.trim() || '';
    } catch {
      /* нет config.ini — решаем по имени */
    }
    return { name, tv: /tv/i.test(tag) || (!tag && /tv/i.test(name)) };
  });
}

function adbOutEmulatorList() {
  const r = spawnSync(emulator, ['-list-avds'], { env, encoding: 'utf8' });
  return String(r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function pickAvd() {
  const forced = option('--avd');
  const avds = listAvds();
  if (forced) {
    if (!avds.some((a) => a.name === forced)) {
      console.error(`AVD "${forced}" не найден. Есть: ${avds.map((a) => a.name).join(', ') || '—'}`);
      process.exit(1);
    }
    return forced;
  }
  const match = avds.find((a) => a.tv === isTv);
  if (!match) {
    console.error(`Нет ${isTv ? 'TV' : 'телефонного'} AVD. Есть: ${avds.map((a) => a.name).join(', ') || '—'}.`
      + (isTv ? ' Создать: yarn emu:tv:setup' : ' Создай в Android Studio → Device Manager.'));
    process.exit(1);
  }
  return match.name;
}

/** serial запущенного эмулятора с этим AVD. */
function serialForAvd(name) {
  const serials = adbOut('devices')
    .split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/))
    .filter(([s, state]) => s?.startsWith('emulator-') && state === 'device')
    .map(([s]) => s);
  return serials.find((s) => adbOut('-s', s, 'emu', 'avd', 'name').split(/\r?\n/)[0].trim() === name) || null;
}

/** x86_64-образы без WHPX / AEHD не стартуют вообще — проверяем до сборки. */
function checkAccel() {
  const r = spawnSync(emulator, ['-accel-check'], { env, encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status === 0) return;
  console.error(`
✗ Эмулятор не запустится: нет аппаратного ускорения CPU.
  ${out.split(/\r?\n/).find((l) => /not|hypervisor|whpx|aehd/i.test(l)) || out.trim()}

Варианты (любой один):
  • Windows Hypervisor Platform: «Включение или отключение компонентов Windows» →
    отметь «Платформа низкоуровневой оболочки Windows» (+ «Платформа виртуальной машины»), перезагрузка.
  • Android Studio → SDK Manager → SDK Tools → «Android Emulator hypervisor driver (installer)».
  • В BIOS/UEFI должна быть включена виртуализация (Intel VT-x / AMD SVM).
Проверка: emulator -accel-check
${physicalDevices().length
    ? `\nК adb подключено реальное устройство — можно без эмулятора: npm run live\n`
    : `\nБез эмулятора: подключи устройство по USB (отладка по USB) и запусти npm run live\n`}`);
  shutdown(1);
}

let killingEmulator = false;

async function ensureEmulator(name, { cold = false } = {}) {
  let serial = serialForAvd(name);
  if (serial) return serial;
  checkAccel();
  const logFile = path.join(os.tmpdir(), `anix-emu-${name}.log`);
  console.log(`→ запускаю эмулятор ${name}${cold ? ' (холодная загрузка)' : ''} (лог: ${logFile})`);
  const log = openSync(logFile, 'w');
  const emuArgs = ['-avd', name, '-gpu', 'auto', ...(cold ? ['-no-snapshot-load'] : [])];
  // windowsHide: без него netsimd открывает пустое консольное окно
  const child = spawn(emulator, emuArgs, { env, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  child.on('exit', (code) => {
    if (killingEmulator || serialForAvd(name)) return;
    const tail = readFileSync(logFile, 'utf8').split(/\r?\n/).filter((l) => /ERROR|FATAL/.test(l)).slice(-8);
    console.error(`✗ эмулятор завершился (${code}):\n${tail.join('\n')}`);
    shutdown(1);
  });
  child.unref();
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    await sleep(2500);
    serial = serialForAvd(name);
    if (serial) return serial;
  }
  console.error('Эмулятор не появился в adb за 3 минуты. Запусти его вручную из Device Manager и повтори.');
  return shutdown(1);
}

/** true — система загрузилась; false — не дождались (зависла или грузится слишком долго). */
async function waitBoot(serial, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (adbOut('-s', serial, 'shell', 'getprop', 'sys.boot_completed').split(/\r?\n/).pop()?.trim() === '1') return true;
    await sleep(2500);
  }
  return false;
}

async function killEmulator(serial) {
  killingEmulator = true;
  adbOut('-s', serial, 'emu', 'kill');
  const start = Date.now();
  while (Date.now() - start < 30_000 && adbOut('devices').includes(serial)) await sleep(1000);
  await sleep(2000);
  killingEmulator = false;
}

// ── Реальное устройство ──────────────────────────────────────────────────────

/** [{ serial, state, model }] из adb devices -l, без эмуляторов. */
function physicalDevices() {
  return adbOut('devices', '-l')
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      return { serial, state, model: l.match(/model:(\S+)/)?.[1] || '' };
    })
    .filter((d) => d.serial && !d.serial.startsWith('emulator-'));
}

// Wi-Fi adb: serial вида IP:PORT или adb-XXXX._adb-tls-connect._tcp (mDNS после adb pair)
const isWifi = (d) => /:\d+$|_adb-tls-connect/.test(d.serial);
const wifiReady = () => physicalDevices().filter((d) => d.state === 'device' && isWifi(d));

/** [{ type: 'connect'|'pairing', addr }] — телефоны с включённой «Отладкой по Wi-Fi» в этой сети. */
function mdnsServices() {
  return adbOut('mdns', 'services')
    .split(/\r?\n/)
    .map((l) => l.match(/_adb-tls-(connect|pairing)\._tcp\.?\s+(\S+:\d+)/))
    .filter(Boolean)
    .map(([, type, addr]) => ({ type, addr }));
}

/**
 * Ищет телефон по mDNS: уже сопряжённый — подключает сразу, новый — просит код из «Подключить по коду».
 * Android TV с «Отладкой по сети» (порт 5555) в mDNS не виден — ему нужен адрес.
 */
async function discoverWifi() {
  console.log(`→ ищу устройства с «Отладкой по Wi-Fi» в сети (до 90 с)…
  Телефон: Настройки → Для разработчиков → «Отладка по Wi-Fi» → включить.
  Первый раз — там же «Подключить устройство по коду», код введёшь здесь.
  Android TV / другой способ: npm run live → «Wi-Fi: ввести IP»`);
  const tried = new Set();
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    const services = mdnsServices();
    for (const s of services.filter((x) => x.type === 'connect' && !tried.has(x.addr))) {
      tried.add(s.addr);
      console.log(`→ adb connect ${s.addr}: ${adbOut('connect', s.addr)}`);
    }
    await sleep(1500);
    if (wifiReady().length) return;

    const pairing = services.find((x) => x.type === 'pairing' && !tried.has(x.addr));
    if (pairing) {
      tried.add(pairing.addr);
      if (!process.stdin.isTTY) {
        console.error(`✗ Нужно сопряжение (${pairing.addr}), но терминал не интерактивный: adb pair ${pairing.addr}`);
        return;
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const code = (await rl.question(`Код сопряжения с экрана телефона (${pairing.addr}): `)).trim();
      rl.close();
      const out = adbOut('pair', pairing.addr, code);
      console.log(`  ${out}`);
      if (!/success/i.test(out)) console.log('  не вышло — открой «Подключить по коду» ещё раз, попробую снова');
      // после сопряжения телефон объявит _adb-tls-connect, его подключит следующий круг
      tried.clear();
    }
    await sleep(1500);
  }
}

async function pickDevice() {
  let serialWanted = forcedSerial;
  if (connectAddr) {
    console.log(`→ adb connect ${forcedSerial}`);
    console.log(`  ${adbOut('connect', forcedSerial)}`);
    // Порт «Отладки по Wi-Fi» на телефоне меняется при каждом включении — ищем тот же IP по mDNS
    if (!wifiReady().some((d) => d.serial === forcedSerial)) {
      const host = forcedSerial.replace(/:\d+$/, '');
      const fresh = mdnsServices().find((s) => s.type === 'connect' && s.addr.startsWith(`${host}:`));
      if (fresh) {
        console.log(`→ порт сменился, adb connect ${fresh.addr}: ${adbOut('connect', fresh.addr)}`);
        serialWanted = fresh.addr;
      }
    }
  }
  if (wifiOnly && !wifiReady().length) await discoverWifi();
  const devices = physicalDevices();
  const ready = devices.filter((d) => d.state === 'device' && (!wifiOnly || isWifi(d)));
  const pick = serialWanted
    ? ready.find((d) => d.serial === serialWanted)
      // после adb pair телефон может числиться под mDNS-именем, а не IP:PORT
      || (connectAddr ? ready.find(isWifi) : undefined)
    : ready[0];
  if (!pick && wifiOnly) {
    console.error(`✗ Устройство по Wi-Fi не найдено. Проверь, что ПК и устройство в одной сети, либо укажи адрес:
  npm run live → «Wi-Fi: ввести IP[:порт]…»
  (Android TV — «Отладка по сети», порт 5555; телефон — IP и порт с экрана «Отладка по Wi-Fi»)`);
    return shutdown(1);
  }
  if (pick) {
    if (!forcedSerial && ready.length > 1) {
      console.log(`  устройств несколько (${ready.map((d) => d.serial).join(', ')}), беру первое; другое — --serial S`);
    }
    return pick;
  }
  const unauthorized = devices.find((d) => d.state === 'unauthorized');
  console.error(unauthorized
    ? `✗ ${unauthorized.serial}: отладка не разрешена — подтверди «Разрешить отладку по USB» на экране устройства и повтори.`
    : `✗ Нет подключённого устройства${forcedSerial ? ` ${forcedSerial}` : ''}.
  USB: Настройки → Для разработчиков → «Отладка по USB», подключи кабель, подтверди запрос на устройстве.
  Wi-Fi (Android 11+): «Отладка по Wi-Fi» → adb pair IP:PORT (код с экрана), затем --connect IP:PORT.
  Android TV: Для разработчиков → «Отладка по сети», затем --connect IP (порт 5555).
  Проверка: adb devices`);
  return shutdown(1);
}

/** localhost:<порт> на устройстве → ПК. Слетает при переподключении кабеля / adb, поэтому держим в фоне. */
function ensureReverse(serial) {
  const spec = `tcp:${port}`;
  if (adbOut('-s', serial, 'reverse', '--list').includes(`${spec} ${spec}`)) return true;
  const out = adbOut('-s', serial, 'reverse', spec, spec);
  if (/error/i.test(out)) {
    console.error(`✗ adb reverse ${spec}: ${out}`);
    return false;
  }
  return true;
}

function keepReverse(serial) {
  const timer = setInterval(() => {
    if (adbOut('-s', serial, 'get-state') === 'device') ensureReverse(serial);
  }, 5000);
  timer.unref();
}

// ── Vite ─────────────────────────────────────────────────────────────────────

function ping(p) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: p, path: '/', timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

const children = [];

function startVite() {
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin], {
    cwd: root,
    env: { ...process.env, ...cfg.viteEnv, ANIXAPP_DEV_PORT: String(port) },
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    console.log(`Vite завершился (${code}).`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

async function waitVite() {
  const start = Date.now();
  while (Date.now() - start < 90_000) {
    if (await ping(port)) return;
    await sleep(700);
  }
  console.error(`Vite не ответил на :${port} за 90 с.`);
  shutdown(1);
}

// ── APK ──────────────────────────────────────────────────────────────────────

const androidDir = path.join(root, cfg.androidDir);
const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const stampFile = path.join(androidDir, 'app', 'build', 'anix-live.json');

function liveApkUpToDate() {
  if (flag('--rebuild') || !existsSync(apk) || !existsSync(stampFile)) return false;
  try {
    const stamp = JSON.parse(readFileSync(stampFile, 'utf8'));
    // APK новее штампа → его перезаписала обычная (не live) сборка
    return stamp.url === liveUrl && statSync(apk).mtimeMs <= statSync(stampFile).mtimeMs;
  } catch {
    return false;
  }
}

function buildLiveApk() {
  if (/[^\x00-\x7F]/.test(root)) {
    console.error(`Gradle на Windows не работает с не-ASCII путём: ${root}\nСмонтируй ASCII-диск: subst P: "<папка>"`);
    shutdown(2);
  }
  console.log(`→ live APK (${target}): UI = ${liveUrl}`);
  const webDir = path.join(root, cfg.webDir);
  if (!existsSync(path.join(webDir, 'index.html'))) {
    // cap sync требует webDir; в live-режиме он не используется
    mkdirSync(webDir, { recursive: true });
    writeFileSync(path.join(webDir, 'index.html'), '<!DOCTYPE html><meta charset="utf-8"><p>AnixApp</p>\n');
  }
  writeFileSync(
    path.join(androidDir, 'local.properties'),
    `sdk.dir=${sdkDir.replace(/\\/g, '/').replace(':', '\\:')}\n`,
  );
  const buildEnv = {
    ANIXAPP_TARGET: target,
    ANIXAPP_TV_LIVE_URL: liveUrl,
    ANIXAPP_DEBUG_WEBVIEW: '1',
  };
  run('npx', ['cap', 'sync', 'android'], root, buildEnv);
  // Полный путь: при NoDefaultCurrentDirectoryInExePath cmd не ищет gradlew.bat в cwd
  run(isWin ? `"${path.join(androidDir, 'gradlew.bat')}"` : './gradlew',['assembleDebug', '--console=plain'], androidDir, buildEnv);
  writeFileSync(stampFile, JSON.stringify({ url: liveUrl, builtAt: new Date().toISOString() }, null, 2));
}

function installAndLaunch(serial) {
  console.log(`→ adb install ${path.relative(root, apk)} → ${serial}`);
  let r = spawnSync(adb, ['-s', serial, 'install', '-r', apk], { env, encoding: 'utf8' });
  let out = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0 && /UPDATE_INCOMPATIBLE|signatures do not match/i.test(out)) {
    // На реальном устройстве удаление стирает данные приложения (вход, загрузки) — только по явному флагу
    if (useDevice && !flag('--reinstall')) {
      console.error(`✗ На устройстве стоит ${cfg.appId} с другой подписью (например, релизная сборка).
  Удалить его и поставить live-сборку (данные приложения сотрутся): добавь --reinstall`);
      shutdown(1);
    }
    console.log(`  подпись не совпадает с установленной — удаляю старое приложение с ${useDevice ? 'устройства' : 'эмулятора'}`);
    adbOut('-s', serial, 'uninstall', cfg.appId);
    r = spawnSync(adb, ['-s', serial, 'install', '-r', apk], { env, encoding: 'utf8' });
    out = `${r.stdout || ''}${r.stderr || ''}`;
  }
  if (r.status !== 0) {
    console.error(out);
    shutdown(1);
  }
  adbOut('-s', serial, 'shell', 'am', 'force-stop', cfg.appId);
  adbOut('-s', serial, 'shell', 'am', 'start', '-n', `${cfg.appId}/.MainActivity`);
  console.log(`✓ ${cfg.appId} запущен`);
}

function startLogcat(serial) {
  adbOut('-s', serial, 'logcat', '-c');
  const child = spawn(adb, ['-s', serial, 'logcat', '-v', 'brief', 'Capacitor/Console:V', 'Capacitor:V', 'chromium:W', '*:S'], {
    env,
    stdio: 'inherit',
  });
  children.push(child);
}

// ── main ─────────────────────────────────────────────────────────────────────

let shuttingDown = false;
function shutdown(code = 0) {
  if (!shuttingDown) {
    shuttingDown = true;
    for (const c of children) {
      try {
        c.kill();
      } catch {
        /* уже завершён */
      }
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

let serialPromise;
let avd = '';
if (useDevice) {
  const device = await pickDevice();
  console.log(`Устройство: ${device.serial}${device.model ? ` (${device.model})` : ''} · порт ${port} · ${liveUrl}`);
  serialPromise = Promise.resolve(device.serial);
} else {
  avd = pickAvd();
  console.log(`AVD: ${avd} · порт ${port} · ${liveUrl}`);
  serialPromise = ensureEmulator(avd);
}

if (await ping(port)) {
  console.log(`✓ на :${port} уже что-то отвечает — использую этот dev-сервер (убедись, что он в режиме ${target})`);
} else {
  startVite();
}

if (!liveApkUpToDate()) buildLiveApk();
else console.log('✓ live APK актуален (--rebuild чтобы пересобрать)');

let serial = await serialPromise;
if (!useDevice) {
  console.log(`✓ эмулятор ${serial}, жду загрузку…`);
  if (!await waitBoot(serial, 120_000)) {
    // Частый случай: быстрый старт из снимка (quickboot) поднял «замёрзшую» систему — экран есть,
    // но процессы внутри не запускаются. Холодная загрузка это лечит.
    console.log('  система не отвечает (завис снимок быстрого старта) — перезапускаю с холодной загрузкой…');
    await killEmulator(serial);
    serial = await ensureEmulator(avd, { cold: true });
    if (!await waitBoot(serial, 360_000)) {
      console.error('✗ Эмулятор не загрузился и после холодной загрузки. Попробуй Device Manager → ⋮ → Wipe Data.');
      shutdown(1);
    }
  }
  console.log('✓ система загружена');
}
await waitVite();
if (!ensureReverse(serial)) shutdown(1);
console.log(`✓ adb reverse tcp:${port} → ПК`);
keepReverse(serial);
installAndLaunch(serial);
if (flag('--logcat')) startLogcat(serial);

console.log(`
Live: правки в src/ подхватываются HMR. Ctrl+C — остановить Vite (${useDevice ? 'устройство' : 'эмулятор'} продолжит работать).
Переподключил кабель / adb — проброс порта восстановится сам, затем перезапусти приложение.
DevTools WebView: chrome://inspect/#devices
${isTv ? 'Пульт: стрелки / Enter / Esc (Back).' : ''}`);

if (!children.length) process.exit(0);
