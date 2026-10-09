'use strict';

/**
 * Копирует звуки уведомлений в единственный каталог:
 *   electron/assets/sounds/*.wav
 *
 * Доступ из main и renderer через протокол anix-sound://
 *
 * Источник: %USERPROFILE%\Documents\REAPER Media\sa *.wav
 * Chime не перезаписывается.
 *
 * Запуск: node scripts/generate-notification-sounds.js
 * Опционально: NOTIF_SOUNDS_SRC="D:\\path\\to\\wavs" node ...
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const target = path.join(__dirname, '..', 'electron', 'assets', 'sounds');

const MAP = {
  'sa plub.wav': 'plub.wav',
  'sa rawr.wav': 'rawr.wav',
  'sa nya.wav': 'nya.wav',
  'sa bonk.wav': 'bonk.wav',
  'sa eh.wav': 'eh.wav',
  'sa gatcha.wav': 'gatcha.wav',
  'sa mambo.wav': 'mambo.wav',
  'sa pue.wav': 'pue.wav',
  'sa note.wav': 'note.wav',
};

const srcDir = process.env.NOTIF_SOUNDS_SRC
  || path.join(os.homedir(), 'Documents', 'REAPER Media');

fs.mkdirSync(target, { recursive: true });

let copied = 0;
for (const [fromName, toName] of Object.entries(MAP)) {
  const from = path.join(srcDir, fromName);
  if (!fs.existsSync(from)) {
    console.warn(`  skip missing: ${from}`);
    continue;
  }
  fs.copyFileSync(from, path.join(target, toName));
  console.log(`  ✓ ${toName}`);
  copied += 1;
}

const chime = path.join(target, 'chime.wav');
if (fs.existsSync(chime)) {
  console.log('  · keep chime.wav');
} else {
  console.warn('  ! chime.wav отсутствует');
}

console.log(`\nГотово: ${copied} звуков → ${target}`);
