'use strict';

/**
 * Warp the OS mouse cursor (Windows). Uses a persistent PowerShell host so
 * SetCursorPos stays cheap enough for short grab bursts.
 */

const { spawn } = require('child_process');

let child = null;
let ready = false;
let queue = [];

function ensureHost() {
  if (process.platform !== 'win32') return false;
  if (child && !child.killed) return true;

  ready = false;
  queue = [];
  try {
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
      { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true },
    );
  } catch {
    child = null;
    return false;
  }

  child.on('exit', () => {
    child = null;
    ready = false;
  });
  child.on('error', () => {
    child = null;
    ready = false;
  });

  const boot =
    "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;" +
    "public class AnixCursor{ [DllImport(\"user32.dll\")] public static extern bool SetCursorPos(int X,int Y); }';\n" +
    "Write-Output ready\n";

  try {
    child.stdin.write(boot);
    ready = true;
    flushQueue();
  } catch {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    child = null;
    ready = false;
    return false;
  }
  return true;
}

function flushQueue() {
  if (!ready || !child || !child.stdin.writable) return;
  while (queue.length) {
    const cmd = queue.shift();
    try {
      child.stdin.write(cmd);
    } catch {
      break;
    }
  }
}

function setCursorScreenPos(x, y) {
  if (process.platform !== 'win32') return false;
  const xi = Math.round(Number(x));
  const yi = Math.round(Number(y));
  if (!Number.isFinite(xi) || !Number.isFinite(yi)) return false;
  if (!ensureHost()) return false;
  const cmd = `[AnixCursor]::SetCursorPos(${xi},${yi})\n`;
  if (!ready) {
    queue.push(cmd);
    return true;
  }
  try {
    child.stdin.write(cmd);
    return true;
  } catch {
    return false;
  }
}

function dispose() {
  if (!child) return;
  try {
    child.stdin.end();
  } catch {
    /* ignore */
  }
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  child = null;
  ready = false;
  queue = [];
}

module.exports = { setCursorScreenPos, dispose };
