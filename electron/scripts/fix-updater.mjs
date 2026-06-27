import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let body = fs.readFileSync(path.join(root, 'services/updater-body.js'), 'utf8');
body = body.replace(/^let pendingInstallerPath = null;\r?\nlet updateDownloadState = \{ state: 'idle', received: 0, total: 0 \};\r?\n\r?\n/, '');
const reps = [
  [/\bmainWindow\b/g, 'state.mainWindow'],
  [/\bpendingInstallerPath\b/g, 'state.pendingInstallerPath'],
  [/\bupdateDownloadState\b/g, 'state.updateDownloadState'],
];
for (const [re, rep] of reps) body = body.replace(re, rep);

const header = `'use strict';

const path = require('path');
const fs = require('fs');
const { app, ipcMain, shell, dialog } = require('electron');
const state = require('../lib/app-state');
const logger = require('../logger');

function register() {

`;

fs.writeFileSync(path.join(root, 'services/updater.js'), header + body + '\n}\n\nmodule.exports = { register };\n');
console.log('updater.js ok');
