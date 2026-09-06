/**
 * Запускает AVD AnixAppTV и ставит debug APK, если он есть.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AVD_NAME,
  adbBin,
  emulatorBin,
  sdkEnv,
} from './android-sdk-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const emulator = emulatorBin();
const adb = adbBin();
if (!emulator || !adb) {
  console.error('Нет emulator/adb. Сначала: yarn emu:tv:setup');
  process.exit(1);
}

function adbOut(...args) {
  const result = spawnSync(adb, args, { env: sdkEnv, encoding: 'utf8', shell: process.platform === 'win32' });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function apkPath() {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const versioned = path.join(root, 'release', `AnixApp-TV-${pkg.version}-debug.apk`);
  const plain = path.join(root, 'release', 'AnixApp-TV-debug.apk');
  if (existsSync(versioned)) return versioned;
  if (existsSync(plain)) return plain;
  return null;
}

function runningSerial() {
  const out = adbOut('devices', '-l');
  const line = out.split('\n').find((l) => l.includes('emulator-') && l.includes('device'));
  if (!line) return null;
  return line.split(/\s+/)[0];
}

function accelReady() {
  const result = spawnSync(emulator, ['-accel-check'], {
    env: sdkEnv,
    encoding: 'utf8',
  });
  const out = `${result.stdout || ''}${result.stderr || ''}`;
  if (/is installed and usable/i.test(out) || /WHPX.*usable/i.test(out) || /Windows Hypervisor Platform is available/i.test(out)) {
    return true;
  }
  if (result.status === 0 && /accel/i.test(out) && !/not installed/i.test(out) && !/not usable/i.test(out)) {
    return true;
  }
  return false;
}

if (!runningSerial() && !accelReady()) {
  console.error(`
x86 Android TV эмулятор не стартует: на этой машине выключена виртуализация CPU.

В BIOS/UEFI включи:
  Intel: VT-x / Intel Virtualization Technology
  AMD:   SVM / AMD-V

Сохрани настройки, перезагрузи Windows, потом:
  yarn emu:tv

Проверка: в PowerShell
  systeminfo | findstr /i "Virtualization Enabled"
должно быть Yes. Сейчас AVD AnixAppTV уже создан, APK можно ставить на телевизор:
  ${apkPath() || 'yarn build:android-tv'}
`);
  process.exit(1);
}

async function waitBoot(serial, timeoutMs = 360_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const boot = adbOut('-s', serial, 'shell', 'getprop', 'sys.boot_completed');
    if (boot.split('\n').pop()?.trim() === '1') return;
    await sleep(3000);
  }
  throw new Error('emulator boot timeout');
}

let serial = runningSerial();
if (!serial) {
  console.log('→ emulator -avd', AVD_NAME);
  if (process.platform === 'win32') {
    spawnSync('powershell.exe', [
      '-NoProfile', '-Command',
      `Start-Process -FilePath ${JSON.stringify(emulator)} -ArgumentList '-avd','${AVD_NAME}','-gpu','auto','-no-snapshot-save'`,
    ], { env: sdkEnv, stdio: 'inherit' });
  } else {
    const child = spawn(emulator, ['-avd', AVD_NAME, '-gpu', 'auto', '-no-snapshot-save'], {
      env: sdkEnv,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }

  const start = Date.now();
  while (!serial && Date.now() - start < 180_000) {
    await sleep(2500);
    serial = runningSerial();
  }
  if (!serial) {
    console.error('Эмулятор не появился в adb. Открой Device Manager в Android Studio и запусти AnixAppTV.');
    process.exit(1);
  }
}

console.log('✓ device', serial);
await waitBoot(serial);
console.log('✓ booted');

const apk = apkPath();
if (apk) {
  console.log('→ adb install -r', apk);
  const install = spawnSync(adb, ['-s', serial, 'install', '-r', apk], {
    env: sdkEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (install.status === 0) {
    spawnSync(adb, ['-s', serial, 'shell', 'am', 'start', '-n', 'com.anixapp.tv/.MainActivity'], {
      env: sdkEnv,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  }
} else {
  console.log('APK ещё нет — собери yarn build:android-tv, потом снова yarn emu:tv');
}
