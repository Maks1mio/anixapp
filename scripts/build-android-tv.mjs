/**
 * Сборка Android TV APK: Vite TV-бандл → Capacitor sync → Gradle.
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
const javaHome = process.env.JAVA_HOME
  || 'C:\\Program Files\\Android\\Android Studio\\jbr';

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

console.log('→ Vite TV web bundle → dist-android');
yarn(['cross-env', 'VITE_TV_MODE=1', 'ANIXAPP_OUT_DIR=dist-android', 'vite', 'build']);

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
const apkDest = path.join(outDir, 'AnixApp-TV-debug.apk');
if (!existsSync(apkSrc)) {
  console.error('APK not found:', apkSrc);
  process.exit(1);
}
copyFileSync(apkSrc, apkDest);
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const versioned = path.join(outDir, `AnixApp-TV-${pkg.version}-debug.apk`);
copyFileSync(apkSrc, versioned);
console.log('✓ APK:', apkDest);
console.log('✓ APK:', versioned);
