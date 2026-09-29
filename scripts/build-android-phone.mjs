/**
 * Сборка APK для телефона: обычный (не TV) Vite-бандл → Capacitor sync → Gradle.
 * Отличие от build-android-tv.mjs: VITE_TV_MODE не выставляется, выставляется VITE_PHONE_MODE=1.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const sdkDir = process.env.ANDROID_HOME
  || process.env.ANDROID_SDK_ROOT
  || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const studioJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
const javaHome = existsSync(path.join(studioJbr, 'bin', 'java.exe'))
  ? studioJbr
  : (process.env.JAVA_HOME || studioJbr);

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

function yarn(args) {
  run('yarn', args);
}

function npx(args) {
  run('npx', args);
}

/**
 * Прокси AnixApp требует X-AnixApp-Proxy-Key. Ключ кладётся в бандл ТОЛЬКО по флагу
 * --with-proxy (его можно извлечь из APK). Берётся из ANIXART_PROXY_APP_KEY в окружении
 * или в .env. Без флага прокси на телефоне скрыт, работают прямые хосты Anixart.
 */
function readDotEnvValue(name) {
  const file = path.join(root, '.env');
  if (!existsSync(file)) return '';
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === name) return m[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return '';
}

const withProxy = process.argv.includes('--with-proxy');
const proxyKey = withProxy
  ? String(process.env.ANIXART_PROXY_APP_KEY || process.env.ANIXAPP_PROXY_KEY
      || readDotEnvValue('ANIXART_PROXY_APP_KEY') || readDotEnvValue('ANIXAPP_PROXY_KEY')).trim()
  : '';
if (withProxy && !proxyKey) {
  console.error('--with-proxy: ANIXART_PROXY_APP_KEY не найден ни в окружении, ни в .env');
  process.exit(1);
}
// Передаём через env, а не аргументом, чтобы ключ не светился в логе сборки.
env.VITE_ANIXART_PROXY_APP_KEY = proxyKey;
console.log(proxyKey ? '→ Прокси AnixApp: ключ встроен' : '→ Прокси AnixApp: выключен (только прямые хосты)');

console.log('→ Vite phone web bundle → dist-android');
// ANIXAPP_WEB_BASE=/: маршруты телефона — pathname (/release/123), а не hash как в Electron.
// С base './' относительные пути (логотип, ассеты при перезагрузке) уходили в /release/…
yarn(['cross-env', 'VITE_TV_MODE=', 'VITE_PHONE_MODE=1', 'ANIXAPP_OUT_DIR=dist-android', 'ANIXAPP_WEB_BASE=/', 'vite', 'build']);

if (!existsSync(path.join(androidDir, 'app'))) {
  console.log('→ Capacitor: add android');
  npx(['cap', 'add', 'android']);
}

const localProps = path.join(androidDir, 'local.properties');
writeFileSync(localProps, `sdk.dir=${sdkDir.replace(/\\/g, '\\\\')}\n`);

console.log('→ Capacitor sync');
npx(['cap', 'sync', 'android']);

console.log('→ Gradle assembleDebug');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleDebug'], androidDir);

const apkSrc = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outDir = path.join(root, 'release');
mkdirSync(outDir, { recursive: true });
const apkDest = path.join(outDir, 'AnixApp-Phone-debug.apk');
if (!existsSync(apkSrc)) {
  console.error('APK not found:', apkSrc);
  process.exit(1);
}
copyFileSync(apkSrc, apkDest);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
copyFileSync(apkSrc, path.join(outDir, `AnixApp-Phone-${pkg.version}-debug.apk`));
console.log('✓ APK (phone):', apkDest);
console.log('  Установка: adb install -r "' + apkDest + '"');
