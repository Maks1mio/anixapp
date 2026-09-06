/**
 * Ставит Android TV system image и создаёт AVD AnixAppTV.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AVD_NAME,
  TV_IMAGE_CANDIDATES,
  adbBin,
  avdmanagerBin,
  emulatorBin,
  sdkDir,
  sdkEnv,
  sdkmanagerBin,
} from './android-sdk-env.mjs';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function run(bin, args, opts = {}) {
  console.log('→', bin, args.join(' '));
  const result = spawnSync(bin, args, {
    env: sdkEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.status !== 0) fail(`${bin} exited ${result.status}`);
}

function runCapture(bin, args) {
  const result = spawnSync(bin, args, {
    env: sdkEnv,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function acceptLicenses(sdkmanager) {
  console.log('→ sdkmanager --licenses');
  return new Promise((resolve, reject) => {
    const child = spawn(sdkmanager, ['--licenses'], {
      env: sdkEnv,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    const tick = setInterval(() => {
      try {
        child.stdin.write('y\r\n');
      } catch {
        /* closed */
      }
    }, 150);
    child.on('exit', (code) => {
      clearInterval(tick);
      if (code === 0 || code === null) resolve();
      else reject(new Error(`licenses exited ${code}`));
    });
    setTimeout(() => {
      try { child.stdin.end(); } catch { /* ignore */ }
    }, 8000);
  });
}

function imageInstalled(pkg) {
  const parts = pkg.split(';');
  const dir = path.join(sdkDir, ...parts);
  return existsSync(path.join(dir, 'system.img'));
}

function pickInstalledImage() {
  return TV_IMAGE_CANDIDATES.find(imageInstalled) || null;
}

function listAvds() {
  const home = process.env.ANDROID_AVD_HOME
    || path.join(process.env.USERPROFILE || process.env.HOME || '', '.android', 'avd');
  if (!existsSync(home)) return [];
  return readdirSync(home)
    .filter((f) => f.endsWith('.ini'))
    .map((f) => f.replace(/\.ini$/, ''));
}

if (!existsSync(sdkDir)) fail(`Android SDK not found: ${sdkDir}`);

const sdkmanager = sdkmanagerBin();
const avdmanager = avdmanagerBin();
const emulator = emulatorBin();
const adb = adbBin();
if (!sdkmanager) fail('sdkmanager not found (install Android SDK cmdline-tools)');
if (!avdmanager) fail('avdmanager not found');
if (!emulator) fail('emulator not found — install "Android Emulator" in SDK Manager');
if (!adb) fail('adb not found — install platform-tools');

console.log('SDK:', sdkDir);

await acceptLicenses(sdkmanager).catch((err) => {
  console.warn('licenses:', err.message);
});

let image = pickInstalledImage();
if (!image) {
  const listed = runCapture(sdkmanager, ['--list']);
  const available = TV_IMAGE_CANDIDATES.filter((pkg) => listed.includes(pkg));
  const target = available[0] || TV_IMAGE_CANDIDATES[0];
  console.log('→ installing', target);
  run(sdkmanager, [target]);
  image = pickInstalledImage();
  if (!image) fail(`TV system image not installed. Tried ${target}`);
}

console.log('✓ image:', image);

if (!listAvds().includes(AVD_NAME)) {
  const devices = runCapture(avdmanager, ['list', 'device']);
  const deviceId = devices.includes('tv_1080p') ? 'tv_1080p' : 'tv_720p';
  console.log('→ create AVD', AVD_NAME, 'device', deviceId);
  run(avdmanager, [
    'create', 'avd',
    '-n', AVD_NAME,
    '-k', image,
    '-d', deviceId,
    '--force',
  ], { input: 'no\n' });
} else {
  console.log('✓ AVD already exists:', AVD_NAME);
}

const avdConfig = path.join(
  process.env.ANDROID_AVD_HOME
    || path.join(process.env.USERPROFILE || process.env.HOME || '', '.android', 'avd'),
  `${AVD_NAME}.avd`,
  'config.ini',
);
if (existsSync(avdConfig)) {
  let ini = readFileSync(avdConfig, 'utf8');
  ini = ini
    .replace(/^hw\.keyboard=.*/m, 'hw.keyboard=yes')
    .replace(/^hw\.gpu\.enabled=.*/m, 'hw.gpu.enabled=yes')
    .replace(/^hw\.gpu\.mode=.*/m, 'hw.gpu.mode=host')
    .replace(/^hw\.ramSize=.*/m, 'hw.ramSize=3072M')
    .replace(/^hw\.initialOrientation=.*/m, 'hw.initialOrientation=landscape')
    .replace(/^firstboot\.bootFromDownloadableSnapshot=.*/m, 'firstboot.bootFromDownloadableSnapshot=no');
  writeFileSync(avdConfig, ini);
}

console.log(`
Готово. Запуск:
  yarn emu:tv

Пульт: стрелки / Enter. APK подхватится из release/ если уже собран.
`);
