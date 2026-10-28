/**
 * Единственный TV APK: интерфейс грузится с https://tv.anixapp.com, а не из APK.
 *
 * За счёт этого правки UI (включая новые страницы) доезжают до пользователей
 * простым перезаходом в приложение — после `npm run deploy:tv` пересобирать APK
 * и перевыпускать релиз не нужно. APK обновляют только когда меняется нативный код.
 *
 *   npm run build:android-tv                      # release/AnixApp-TV-<version>.apk
 *   ANIXAPP_TV_REMOTE_URL=https://… npm run …     # другой адрес вместо tv.anixapp.com
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeMissingAndroidEnv, findAndroidSdk, findJavaHome, javaMajor } from './lib/android-env.mjs';

const REMOTE_URL = (process.env.ANIXAPP_TV_REMOTE_URL || 'https://tv.anixapp.com').replace(/\/$/, '');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const webDir = path.join(root, 'dist-android');
const sdkDir = findAndroidSdk();
const javaHome = findJavaHome();

if (!sdkDir || !javaHome) {
  console.error(describeMissingAndroidEnv({ javaHome, sdkDir }));
  process.exit(1);
}

const env = {
  ...process.env,
  ANDROID_HOME: sdkDir,
  ANDROID_SDK_ROOT: sdkDir,
  JAVA_HOME: javaHome,
  ANIXAPP_TV_REMOTE_URL: REMOTE_URL,
};

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    if (result.error) console.error(`${cmd}: ${result.error.message}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`→ TV APK: UI грузится с ${REMOTE_URL}/`);
console.log('  Правки интерфейса доезжают через npm run deploy:tv (APK пересобирать не нужно).');
console.log(`  JDK: ${javaHome} (Java ${javaMajor(javaHome) || '?'})`);
console.log(`  Android SDK: ${sdkDir}`);

// Capacitor требует webDir для sync; реальный интерфейс берётся с сервера,
// локальная страница остаётся только заглушкой на случай недоступности.
mkdirSync(webDir, { recursive: true });
writeFileSync(
  path.join(webDir, 'index.html'),
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${REMOTE_URL}/"></head>`
  + '<body style="margin:0;background:#0d0d0d;color:#9a9a9a;font:500 15px/1.4 system-ui,sans-serif">'
  + '<p style="padding:2rem">Загружаю интерфейс с ' + REMOTE_URL + '…</p></body></html>\n',
);

writeFileSync(
  path.join(androidDir, 'local.properties'),
  `sdk.dir=${sdkDir.replace(/\\/g, '\\\\')}\n`,
);

run('npx', ['cap', 'sync', 'android']);
// gradlew лежит в git без +x — на Linux/macOS запускаем через sh, как в build-android-mobile.
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : 'sh';
const gradlewArgs = process.platform === 'win32'
  ? ['assembleDebug', '--no-daemon', '--console=plain']
  : ['./gradlew', 'assembleDebug', '--no-daemon', '--console=plain'];
run(gradlew, gradlewArgs, androidDir);

const apkSrc = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(apkSrc)) {
  console.error('APK не найден:', apkSrc);
  process.exit(1);
}

const outDir = path.join(root, 'release');
mkdirSync(outDir, { recursive: true });
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const apkDest = path.join(outDir, `AnixApp-TV-${pkg.version}.apk`);
copyFileSync(apkSrc, apkDest);

console.log('✓ APK:', apkDest);
console.log(`✓ UI: ${REMOTE_URL} (обновляется через npm run deploy:tv)`);
