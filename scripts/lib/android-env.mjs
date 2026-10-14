/**
 * Поиск JDK и Android SDK для сборки APK + понятная подсказка, если их нет.
 * Используется сборками `build-android-tv.mjs` и `build-android-mobile.mjs`.
 *
 * Важно: AGP 8.x работает на JDK 17–21. JBR из свежей Android Studio бывает
 * JDK 25 — такой Gradle не примет, поэтому 21 в приоритете.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function hasJava(home) {
  if (!home) return false;
  return existsSync(path.join(home, 'bin', 'java.exe')) || existsSync(path.join(home, 'bin', 'java'));
}

/** Мажорная версия JDK: из файла release, иначе из имени каталога. */
export function javaMajor(home) {
  if (!home) return 0;
  try {
    const raw = readFileSync(path.join(home, 'release'), 'utf8');
    const match = raw.match(/JAVA_VERSION="(\d+)(?:\.(\d+))?/);
    if (match) {
      const major = Number(match[1]);
      // Java 8 пишется как 1.8.0_xxx
      return major === 1 ? Number(match[2] || 0) : major;
    }
  } catch {
    /* нет файла release — определим по имени */
  }
  const byName = path.basename(home).match(/(\d+)(?:\.\d+)*/);
  return byName ? Number(byName[1]) : 0;
}

/** JAVA_HOME → Android Studio JBR → установленные JDK → java из PATH. */
export function findJavaHome() {
  const found = [];
  const add = (home) => {
    if (home && hasJava(home) && !found.includes(home)) found.push(home);
  };

  add(process.env.JAVA_HOME);

  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || '';

  add(path.join(pf, 'Android', 'Android Studio', 'jbr'));
  add(path.join(local, 'Programs', 'Android Studio', 'jbr'));
  add(path.join(pf, 'Android', 'Android Studio Preview', 'jbr'));

  const bases = [
    path.join(pf, 'Java'),
    path.join(pf, 'Eclipse Adoptium'),
    path.join(pf, 'Microsoft'),
    path.join(pf86, 'Java'),
    path.join(local, 'Programs', 'Eclipse Adoptium'),
    path.join(local, 'Programs', 'Microsoft'),
    path.join(userProfile, '.jdks'),
  ];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    let entries = [];
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }
    for (const name of entries) add(path.join(base, name));
  }

  // java.exe в PATH → каталог bin → домашний каталог JDK.
  for (const entry of String(process.env.PATH || '').split(path.delimiter)) {
    const trimmed = entry.replace(/[\\/]+$/, '');
    if (!/[\\/]bin$/i.test(trimmed)) continue;
    add(trimmed.replace(/[\\/]bin$/i, ''));
  }

  if (!found.length) return '';

  // Gradle 8.14.3 не умеет читать class-файлы новее Java 24 (major 68).
  // JBR из свежей Android Studio = Java 25 — из-за него падает сборка
  // («Unsupported class file major version 69»), поэтому такой JDK не берём,
  // если есть пригодный 17–24.
  const MAX_MAJOR = 24;
  const rank = (major) => {
    if (major === 21) return 0;
    if (major === 17) return 1;
    if (major >= 18 && major <= 20) return 2;
    if (major >= 22 && major <= MAX_MAJOR) return 3;
    // Java < 17 (нет javac/слишком старая) и новее поддерживаемого Gradle — крайний случай.
    return 4;
  };
  return found
    .map((home) => ({ home, major: javaMajor(home) }))
    .sort((a, b) => rank(a.major) - rank(b.major))[0].home;
}

/** ANDROID_HOME → ANDROID_SDK_ROOT → стандартные каталоги Android Studio. */
export function findAndroidSdk() {
  for (const env of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
    if (env && existsSync(env)) return env;
  }
  const local = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || '';
  const candidates = [
    path.join(local, 'Android', 'Sdk'),
    path.join(userProfile, 'AppData', 'Local', 'Android', 'Sdk'),
    'C:\\Android\\Sdk',
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return '';
}

/** Текст-подсказка: чего не хватает и как это поставить. */
export function describeMissingAndroidEnv({ javaHome, sdkDir }) {
  const lines = ['', '✖ Собрать APK не получится: не хватает окружения.', ''];
  if (!javaHome) {
    lines.push('• JDK 21 (или 17) не найден — без него Gradle не запускается.');
    lines.push('  Проще всего поставить Android Studio: она приносит и JDK, и Android SDK.');
    lines.push('    https://developer.android.com/studio');
    lines.push('  Либо только JDK 21 (Temurin) и прописать JAVA_HOME:');
    lines.push('    https://adoptium.net/temurin/releases/?version=21');
    lines.push('    setx JAVA_HOME "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.х-hotspot"');
    lines.push('');
  }
  if (!sdkDir) {
    lines.push('• Android SDK не найден.');
    lines.push('  Android Studio ставит его в %LOCALAPPDATA%\\Android\\Sdk — скрипт найдёт сам.');
    lines.push('  Либо command-line tools: https://developer.android.com/studio#command-line-tools-only');
    lines.push('    setx ANDROID_HOME "%LOCALAPPDATA%\\Android\\Sdk"');
    lines.push('');
  }
  lines.push('APK можно вообще не собирать локально: CI соберёт его при релизе');
  lines.push('(workflow «Release Android APK» → yarn build:android-tv, файл прикрепится к релизу).');
  return lines.join('\n');
}
