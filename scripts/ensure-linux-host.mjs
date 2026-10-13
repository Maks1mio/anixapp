/**
 * AppImage / deb / pacman нельзя собрать на Windows: electron-builder
 * запускает Linux-бинарник mksquashfs (на win32 ошибочно берёт darwin/).
 */
'use strict';

if (process.platform === 'linux') process.exit(0);

const target = process.argv[2] || 'Linux-пакет';

console.error(`
${target} нельзя собрать на ${process.platform}.

electron-builder вызывает mksquashfs из кэша AppImage — это Linux ELF.
На Windows он ищет darwin/mksquashfs и падает с ENOENT.

Как собрать:
• GitHub Actions — job build-linux-appimage (тег v* или workflow Release)
• Linux-машина / VM:  yarn build:linux-appimage
• WSL2, если включена «Платформа виртуальной машины» в Windows

Локально на Windows: yarn build:win
`.trim());
process.exit(1);
