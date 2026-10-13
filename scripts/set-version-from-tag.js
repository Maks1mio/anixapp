/**
 * CI: подставляет версию из тега релиза в package.json перед сборкой,
 * чтобы версия приложения и имена файлов совпадали с тегом, даже если
 * package.json в репозитории забыли обновить.
 *
 * Тег: аргумент, RELEASE_TAG или GITHUB_REF_NAME (только при сборке по тегу).
 * Без тега ничего не делает — локальная разработка не затрагивается.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const fromRef = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : '';
const tag = String(process.argv[2] || process.env.RELEASE_TAG || fromRef || '').trim();

if (!tag) {
  console.log('set-version-from-tag: тег не задан, package.json не меняется.');
  process.exit(0);
}

const version = tag.replace(/^v/i, '');
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`set-version-from-tag: тег «${tag}» не похож на версию (ожидается vX.Y.Z).`);
  process.exit(1);
}

const pkgPath = path.join(__dirname, '..', 'package.json');
const source = fs.readFileSync(pkgPath, 'utf8');
const current = JSON.parse(source).version;

if (current === version) {
  console.log(`set-version-from-tag: версия уже ${version}.`);
  process.exit(0);
}

// Меняем только строку версии, чтобы не трогать форматирование и переводы строк
const updated = source.replace(/^(\s*"version"\s*:\s*")[^"]*(")/m, `$1${version}$2`);
if (JSON.parse(updated).version !== version) {
  console.error('set-version-from-tag: не удалось заменить версию в package.json.');
  process.exit(1);
}

fs.writeFileSync(pkgPath, updated);
if (process.env.GITHUB_ACTIONS) {
  console.log(
    `::warning::package.json в репозитории содержит ${current}, тег — ${version}. ` +
      'Сборка использует версию тега; обновите package.json в main.',
  );
}
console.log(`set-version-from-tag: ${current} → ${version}`);
