/**
 * One-off helper: extracts logical sections from main.js into module stubs.
 * Run: node electron/scripts/split-main.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const mainPath = path.join(root, 'main.js');
const lines = fs.readFileSync(mainPath, 'utf8').split('\n');

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const sections = {
  'services/video-resolver-body.js': [1054, 1621],
  'services/downloads-body.js': [1626, 1953],
  'windows/player-body.js': [1955, 2290],
  'services/updater-body.js': [2355, 2730],
  'ipc/anix-api-body.js': [957, 1052, 2732, 3434],
  'windows/tools-body.js': [3436, 3633],
};

// anix-api has two ranges - combine
function extractAnixApi() {
  const a = slice(957, 1052);
  const b = slice(2732, 3434);
  return a + '\n\n' + b;
}

fs.mkdirSync(path.join(root, 'services'), { recursive: true });
fs.mkdirSync(path.join(root, 'windows'), { recursive: true });
fs.mkdirSync(path.join(root, 'ipc'), { recursive: true });

for (const [file, range] of Object.entries(sections)) {
  if (file === 'ipc/anix-api-body.js') {
    fs.writeFileSync(path.join(root, file), extractAnixApi());
    continue;
  }
  const [start, end] = range;
  fs.writeFileSync(path.join(root, file), slice(start, end));
}

console.log('Extracted body sections to *-body.js files');
