import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const body = fs.readFileSync(path.join(root, 'ipc/anix-api-body.js'), 'utf8');

const header = `'use strict';

const { ipcMain } = require('electron');
const { BookmarkType, BookmarkSortType, DefaultResult } = require('anixapi');

function register(deps) {
  const {
    loggedHandle,
    handleAnixError,
    getAnixart,
    appendLog,
    homeCustomFilter,
    LIST_STATUS_TO_TYPE,
  } = deps;

`;

const footer = `
}

module.exports = { register };
`;

fs.writeFileSync(path.join(root, 'ipc/anix-api.js'), header + body + footer);
console.log('anix-api.js ok');
