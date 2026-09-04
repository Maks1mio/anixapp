/**
 * Android TV prod APK:
 * - UI встроен в APK (не грузит tv.anixapp.com при старте — иначе ERR_TIMED_OUT на TV)
 * - API: production (api.anixapp.com)
 * - Сайт tv.anixapp.com: yarn deploy:tv (тот же dist-tv-web)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const webDir = path.join(root, 'dist-android');
const tvWebDir = path.join(root, 'dist-tv-web');
const sdkDir = process.env.ANDROID_HOME
  || process.env.ANDROID_SDK_ROOT
  || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const studioJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const javaHome = existsSync(path.join(studioJbr, 'bin', 'java.exe'))
  ? studioJbr
  : (process.env.JAVA_HOME || studioJbr);

// Без ANIXAPP_TV_URL — Capacitor не подставляет server.url (UI из APK).
const env = {
  ...process.env,
  ANDROID_HOME: sdkDir,
  ANDROID_SDK_ROOT: sdkDir,
  JAVA_HOME: javaHome,
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

if (!process.env.SKIP_TV_WEB_BUILD) {
  console.log('→ Vite TV prod → dist-android (встроенный UI для APK)');
  run('yarn', ['cross-env', 'VITE_TV_MODE=1', 'ANIXAPP_OUT_DIR=dist-android', 'vite', 'build']);

  console.log('→ Vite TV prod → dist-tv-web (для deploy:tv / tv.anixapp.com)');
  run('yarn', ['cross-env', 'VITE_TV_MODE=1', 'ANIXAPP_OUT_DIR=dist-tv-web', 'ANIXAPP_WEB_BASE=/', 'vite', 'build']);
} else {
  console.log('→ SKIP_TV_WEB_BUILD: используем уже собранные dist-android и dist-tv-web');
}

if (!existsSync(path.join(webDir, 'index.html'))) {
  console.error('dist-android/index.html not found');
  process.exit(1);
}

const localProps = path.join(androidDir, 'local.properties');
writeFileSync(localProps, `sdk.dir=${sdkDir.replace(/\\/g, '\\\\')}\n`);

console.log('→ Capacitor sync (bundled UI, без server.url)');
run('npx', ['cap', 'sync', 'android']);

console.log('→ Gradle assembleDebug');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleDebug'], androidDir);

const apkSrc = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outDir = path.join(root, 'release');
mkdirSync(outDir, { recursive: true });
const apkDest = path.join(outDir, 'AnixApp-TV-prod-debug.apk');
if (!existsSync(apkSrc)) {
  console.error('APK not found:', apkSrc);
  process.exit(1);
}
copyFileSync(apkSrc, apkDest);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const versioned = path.join(outDir, `AnixApp-TV-${pkg.version}-prod-debug.apk`);
copyFileSync(apkSrc, versioned);

console.log('✓ APK:', apkDest);
console.log('✓ APK:', versioned);
console.log('✓ UI: встроен в APK · API: api.anixapp.com');
console.log('✓ Сайт: yarn deploy:tv → https://tv.anixapp.com (браузер на TV/ПК)');
