/**
 * APK открывает Vite TV с ПК (yarn electron:dev-tv / yarn dev:tv).
 * Телевизор и ПК — в одной сети. HTTP :5174 должен быть доступен.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTvLiveUrl } from './tv-live-url.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const sdkDir = process.env.ANDROID_HOME
  || process.env.ANDROID_SDK_ROOT
  || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const studioJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const javaHome = existsSync(path.join(studioJbr, 'bin', 'java.exe'))
  ? studioJbr
  : (process.env.JAVA_HOME || studioJbr);

const liveUrl = resolveTvLiveUrl();

const env = {
  ...process.env,
  ANDROID_HOME: sdkDir,
  ANDROID_SDK_ROOT: sdkDir,
  JAVA_HOME: javaHome,
  ANIXAPP_TV_LIVE_URL: liveUrl,
};

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`→ TV live URL: ${liveUrl}`);
console.log('  Держите на ПК: yarn electron:dev-tv  (или yarn dev:tv)');
console.log('  Телевизор и ПК в одной Wi‑Fi/LAN. Фаервол: входящий TCP 5174.');

if (!existsSync(path.join(root, 'dist-android', 'index.html'))) {
  console.log('→ Fallback webDir: собираю dist-android (нужен Capacitor, страница всё равно с ПК)');
  run('yarn', ['cross-env', 'VITE_TV_MODE=1', 'ANIXAPP_OUT_DIR=dist-android', 'vite', 'build']);
}

const localProps = path.join(androidDir, 'local.properties');
writeFileSync(localProps, `sdk.dir=${sdkDir.replace(/\\/g, '\\\\')}\n`);

console.log('→ Capacitor sync (server.url → ПК)');
run('npx', ['cap', 'sync', 'android']);

console.log('→ Gradle assembleDebug');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleDebug'], androidDir);

const apkSrc = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outDir = path.join(root, 'release');
mkdirSync(outDir, { recursive: true });
const apkDest = path.join(outDir, 'AnixApp-TV-live-debug.apk');
if (!existsSync(apkSrc)) {
  console.error('APK not found:', apkSrc);
  process.exit(1);
}
copyFileSync(apkSrc, apkDest);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const versioned = path.join(outDir, `AnixApp-TV-${pkg.version}-live-debug.apk`);
copyFileSync(apkSrc, versioned);
console.log('✓ APK:', apkDest);
console.log('✓ APK:', versioned);
console.log(`✓ Открывает: ${liveUrl}`);
