/**
 * Мобильная сборка (Capacitor, ANIXAPP_TARGET=mobile → android-mobile, applicationId из capacitor.config.ts).
 *
 *   node scripts/build-android-mobile.mjs            # vite build (VITE_MOBILE_MODE=1) → cap sync → gradle assembleDebug
 *   node scripts/build-android-mobile.mjs --install  # + adb install на подключённое устройство/эмулятор
 *
 * Ключ резервного прокси (необязательно) берётся из ANIXART_PROXY_APP_KEY в окружении или .env при сборке;
 * в репозитории его нет.
 *
 * Важно: Android Gradle Plugin / javac на Windows не работают с не-ASCII путями (у проекта путь с кириллицей).
 * Скрипт определяет это и просит собрать через ASCII-диск:  subst P: "<папка с кириллицей>"  → P:\anixapp-mobile
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runViteBuild } from './lib/vite-build.mjs';
import { describeMissingAndroidEnv, findAndroidSdk, findJavaHome, javaMajor } from './lib/android-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android-mobile');
const install = process.argv.includes('--install');

if (/[^\x00-\x7F]/.test(root)) {
  console.error(
    `Путь проекта содержит не-ASCII символы:\n  ${root}\n` +
      'Gradle/javac на Windows с таким путём падают. Смонтируйте ASCII-диск и запустите сборку оттуда, например:\n' +
      '  subst P: "<родительская папка проекта>"   затем   P:\\anixapp-mobile> node scripts/build-android-mobile.mjs',
  );
  process.exit(2);
}

const sdkDir = findAndroidSdk();
// AGP 8.x / Gradle 8.x — JDK 17–21 (JBR из свежей Android Studio бывает 25 и не подходит).
const javaHome = findJavaHome();

if (!sdkDir || !javaHome) {
  console.error(describeMissingAndroidEnv({ javaHome, sdkDir }));
  process.exit(1);
}

const env = {
  ...process.env,
  ANIXAPP_TARGET: 'mobile',
  ANDROID_HOME: sdkDir,
  ANDROID_SDK_ROOT: sdkDir,
  JAVA_HOME: javaHome,
};

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('→ Vite (VITE_MOBILE_MODE=1) → dist-mobile');
console.log(`  JDK: ${javaHome} (Java ${javaMajor(javaHome) || '?'})`);
console.log(`  Android SDK: ${sdkDir}`);
runViteBuild({ VITE_MOBILE_MODE: '1', ANIXAPP_OUT_DIR: 'dist-mobile' });

// local.properties: прямые слеши, иначе \U в формате .properties съедает путь к SDK.
writeFileSync(path.join(androidDir, 'local.properties'), `sdk.dir=${sdkDir.replace(/\\/g, '/').replace(':', '\\:')}\n`);

console.log('→ Capacitor sync (android-mobile)');
run('npx', ['cap', 'sync', 'android']);

console.log('→ Gradle assembleDebug');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : 'sh';
const gradlewArgs = process.platform === 'win32'
  ? ['assembleDebug', '--no-daemon', '--console=plain']
  : ['./gradlew', 'assembleDebug', '--no-daemon', '--console=plain'];
run(gradlew, gradlewArgs, androidDir);

const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(apk)) {
  console.error('APK не найден:', apk);
  process.exit(1);
}
const outDir = path.join(root, 'release');
mkdirSync(outDir, { recursive: true });
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const apkDest = path.join(outDir, `AnixApp-Mobile-${pkg.version}-alpha.apk`);
cpSync(apk, apkDest);
console.log('✓ APK (Android телефон):', apkDest);

if (install) {
  const adb = path.join(sdkDir, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  run(adb, ['install', '-r', apk]);
}
