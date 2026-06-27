/**
 * Extract smaller IPC / setup sections from main.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = fs.readFileSync(path.join(root, 'main.js'), 'utf8').split('\n');

function slice(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const chunks = {
  'ipc/auth-body.js': [746, 956],
  'ipc/app-settings-body.js': [674, 736],
  'ipc/window-controls-body.js': [660, 672],
  'ipc/shell-logs-body.js': [2292, 2353],
  'setup/main-window-body.js': [475, 526],
  'setup/tray-body.js': [439, 473],
};

for (const [file, [start, end]] of Object.entries(chunks)) {
  fs.writeFileSync(path.join(root, file), slice(start, end));
  console.log(file, end - start + 1, 'lines');
}

// Combined media module body
const mediaBody = [
  slice(1054, 1621),
  slice(1626, 1953),
].join('\n\n');
fs.writeFileSync(path.join(root, 'services/media-body.js'), mediaBody);
console.log('services/media-body.js', mediaBody.split('\n').length, 'lines');
