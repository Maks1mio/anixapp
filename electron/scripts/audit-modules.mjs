/**
 * Static audit: flags likely missing imports in refactored electron modules.
 * Run: node electron/scripts/audit-modules.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = ['ipc', 'services', 'windows', 'setup'];

const SYMBOL_CHECKS = [
  { sym: 'DefaultResult', fix: "require('anixapi').DefaultResult" },
  { sym: 'BookmarkType', fix: "require('anixapi').BookmarkType" },
  { sym: 'BookmarkSortType', fix: "require('anixapi').BookmarkSortType" },
  { sym: 'DOWNLOAD_VIDEO_EXT', fix: 'define in media.js or constants' },
  { sym: 'MIN_DOWNLOAD_VIDEO_BYTES', fix: 'define in media.js' },
];

function auditFile(filePath) {
  const rel = path.relative(root, filePath);
  const src = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  for (const { sym, fix } of SYMBOL_CHECKS) {
    if (new RegExp(`\\b${sym}\\b`).test(src) && !src.includes(sym) === false) {
      const imported = src.includes(`{ ${sym}`) || src.includes(`, ${sym}`) || src.includes(`${sym},`)
        || src.includes(`const ${sym}`) || src.includes(`let ${sym}`) || src.includes(`function ${sym}`);
      if (!imported && new RegExp(`\\b${sym}\\b`).test(src)) {
        issues.push(`${sym} used but not defined/imported (${fix})`);
      }
    }
  }

  if (/\bapp\./.test(src) && !/require\('electron'\)/.test(src.replace(/\{[^}]+\}/, ''))) {
    // crude: file uses app. but electron require might not include app
    const electronReq = src.match(/require\('electron'\)/);
    if (electronReq && !/\bapp\b/.test(src.match(/const\s*\{([^}]+)\}\s*=\s*require\('electron'\)/)?.[1] || '')) {
      issues.push('app used but not imported from electron');
    }
  }

  if (/\bsaveConfig\(/.test(src) && !src.includes('config.saveConfig') && !src.includes('function saveConfig')) {
    issues.push('bare saveConfig() call');
  }
  if (/\bloadConfig\(/.test(src) && !src.includes('config.loadConfig') && !src.includes('function loadConfig')) {
    issues.push('bare loadConfig() call');
  }

  return issues.map((m) => `${rel}: ${m}`);
}

const all = [];
for (const dir of dirs) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) continue;
  for (const name of fs.readdirSync(full)) {
    if (!name.endsWith('.js')) continue;
    all.push(...auditFile(path.join(full, name)));
  }
}

if (all.length) {
  console.error('Audit issues:\n' + all.join('\n'));
  process.exit(1);
}
console.log('Audit OK — no obvious missing symbols');
