/**
 * Конвертирует PNG-логотипы из public/logo/ в icon.ico для Windows.
 * Использует 512x512.png и to-ico с resize для получения мультиразмерного ICO.
 */
const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');

const rootDir = path.join(__dirname, '..');
const logoDir = path.join(rootDir, 'public', 'logo');
const src512 = path.join(logoDir, '512x512.png');
const outIco = path.join(logoDir, 'icon.ico');

async function main() {
  if (!fs.existsSync(src512)) {
    console.warn('scripts/build-icon.js: 512x512.png не найден, пропуск генерации icon.ico');
    return;
  }
  const buf = fs.readFileSync(src512);
  const ico = await toIco(buf, {
    resize: true,
    sizes: [16, 24, 32, 48, 64, 128, 256],
  });
  fs.writeFileSync(outIco, ico);
  console.log('icon.ico создан в public/logo/');
}

main().catch((err) => {
  console.error('Ошибка сборки иконки:', err);
  process.exit(1);
});
