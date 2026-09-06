/**
 * APK с UI с удалённого URL (tv.anixapp.com). Только если TV стабильно достучится до сервера.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REMOTE_URL = (process.env.ANIXAPP_TV_REMOTE_URL || 'https://tv.anixapp.com').replace(/\/$/, '');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const webDir = path.join(root, 'dist-android');
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
    process.exit(result.status ?? 1);
  }
}

console.log(`→ Remote UI APK: ${REMOTE_URL}/`);
console.log('  Если на TV ERR_TIMED_OUT — используйте yarn build:android-tv-prod (bundled)');

if (!existsSync(path.join(webDir, 'index.html'))) {
  mkdirSync(webDir, { recursive: true });
  writeFileSync(
    path.join(webDir, 'index.html'),
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${REMOTE_URL}/"></head><body></body></html>\n`,
  );
}

writeFileSync(
  path.join(androidDir, 'local.properties'),
  `sdk.dir=${sdkDir.replace(/\\/g, '\\\\')}\n`,
);

run('npx', ['cap', 'sync', 'android']);
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleDebug'], androidDir);

const apkSrc = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const outDir = path.join(root, 'release');
mkdirSync(outDir, { recursive: true });
const apkDest = path.join(outDir, 'AnixApp-TV-remote-debug.apk');
copyFileSync(apkSrc, apkDest);
console.log('✓ APK:', apkDest);
