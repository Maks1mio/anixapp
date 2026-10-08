'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isFile(filePath) {
  try { return !!filePath && fs.statSync(filePath).isFile(); } catch { return false; }
}

/**
 * @param {string[]} args
 * @param {number} [timeout]
 * @returns {string}
 */
function regQuery(args, timeout = 2000) {
  try {
    return execFileSync('reg', args, {
      encoding: 'utf8',
      windowsHide: true,
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/**
 * Разворачивает `"C:\path\mpv.exe" -- "%1"` → абсолютный exe.
 * @param {string} raw
 * @returns {string | null}
 */
function extractExeFromCommand(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const quoted = s.match(/^"([^"]+\.exe)"/i);
  if (quoted) return quoted[1];
  const bare = s.match(/^([a-zA-Z]:\\[^\s"]+\.exe)/i);
  if (bare) return bare[1];
  const first = s.split(/\s+/)[0];
  if (/\.exe$/i.test(first) && !/[\\/]/.test(first)) return null; // просто «mpv.exe» без пути
  if (/\.exe$/i.test(first)) return first.replace(/^"|"$/g, '');
  return null;
}

/**
 * Windows: HKCU/HKLM App Paths\<name>.exe → путь установки.
 * @param {string} exeName e.g. mpv.exe
 * @returns {string[]}
 */
function winAppPathsCandidates(exeName) {
  if (process.platform !== 'win32') return [];
  const keys = [
    `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
    `HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`,
  ];
  const out = [];
  for (const key of keys) {
    const def = regQuery(['query', key, '/ve']);
    const mDef = def.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+)$/im);
    if (mDef) {
      const p = mDef[1].trim().replace(/^"|"$/g, '');
      if (p) out.push(p);
    }
    const pathVal = regQuery(['query', key, '/v', 'Path']);
    const mPath = pathVal.match(/Path\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)$/im);
    if (mPath) {
      const dir = mPath[1].trim().replace(/^"|"$/g, '');
      if (dir) out.push(path.join(dir, exeName));
    }
  }
  return out;
}

/**
 * Windows: Uninstall-ключи, в имени которых есть mpv/vlc (portable bootstrapper и т.п.).
 * @param {string} nameHint e.g. mpv
 * @param {string} exeName e.g. mpv.exe
 * @returns {string[]}
 */
function winUninstallCandidates(nameHint, exeName) {
  if (process.platform !== 'win32') return [];
  const roots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  const out = [];
  const re = new RegExp(nameHint, 'i');
  for (const root of roots) {
    const subkeys = regQuery(['query', root], 4000);
    if (!subkeys) continue;
    const lines = subkeys.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith(root) && re.test(l));
    for (const key of lines) {
      const blob = regQuery(['query', key]);
      if (!blob) continue;
      const icon = blob.match(/DisplayIcon\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)$/im);
      if (icon) {
        const raw = icon[1].trim().replace(/^"|"$/g, '').split(',')[0];
        if (/\.exe$/i.test(raw)) out.push(raw);
      }
      const loc = blob.match(/InstallLocation\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)$/im);
      if (loc) {
        const dir = loc[1].trim().replace(/^"|"$/g, '');
        if (dir) out.push(path.join(dir, exeName));
      }
    }
  }
  return out;
}

/**
 * Windows: Classes\Applications\<exe>\shell\open\command
 * @param {string} exeName
 * @returns {string[]}
 */
function winApplicationsCommandCandidates(exeName) {
  if (process.platform !== 'win32') return [];
  const keys = [
    `HKCU\\Software\\Classes\\Applications\\${exeName}\\shell\\open\\command`,
    `HKLM\\Software\\Classes\\Applications\\${exeName}\\shell\\open\\command`,
  ];
  const out = [];
  for (const key of keys) {
    const def = regQuery(['query', key, '/ve']);
    const m = def.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+)$/im);
    if (m) {
      const exe = extractExeFromCommand(m[1].trim());
      if (exe) out.push(exe);
    }
  }
  return out;
}

/** Имена exe для игрока (PotPlayer — несколько вариантов). */
function exeNamesForPlayer(id) {
  if (id === 'potplayer') {
    return ['PotPlayerMini64.exe', 'PotPlayerMini.exe', 'PotPlayer64.exe', 'PotPlayer.exe'];
  }
  if (id === 'vlc') return ['vlc.exe'];
  if (id === 'mpv') return ['mpv.exe'];
  return [`${id}.exe`];
}

/**
 * @param {string} name player id
 * @returns {string[]}
 */
function winProgramCandidates(name) {
  if (process.platform !== 'win32') return [];
  const out = [];
  const homes = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA,
    process.env.APPDATA,
    process.env.USERPROFILE,
  ].filter(Boolean);

  for (const base of homes) {
    if (name === 'vlc') {
      out.push(path.join(base, 'VideoLAN', 'VLC', 'vlc.exe'));
    }
    if (name === 'mpv') {
      out.push(path.join(base, 'mpv', 'mpv.exe'));
      out.push(path.join(base, 'Programs', 'mpv', 'mpv.exe'));
      out.push(path.join(base, 'scoop', 'shims', 'mpv.exe'));
      out.push(path.join(base, 'scoop', 'apps', 'mpv', 'current', 'mpv.exe'));
    }
    if (name === 'potplayer') {
      out.push(path.join(base, 'DAUM', 'PotPlayer', 'PotPlayerMini64.exe'));
      out.push(path.join(base, 'DAUM', 'PotPlayer', 'PotPlayerMini.exe'));
      out.push(path.join(base, 'DAUM', 'PotPlayer', 'PotPlayer64.exe'));
      out.push(path.join(base, 'DAUM', 'PotPlayer', 'PotPlayer.exe'));
      out.push(path.join(base, 'PotPlayer', 'PotPlayerMini64.exe'));
      out.push(path.join(base, 'Programs', 'PotPlayer', 'PotPlayerMini64.exe'));
    }
  }
  if (name === 'mpv') {
    out.push('C:\\ProgramData\\chocolatey\\bin\\mpv.exe');
  }

  for (const exe of exeNamesForPlayer(name)) {
    out.push(...winAppPathsCandidates(exe));
    out.push(...winApplicationsCommandCandidates(exe));
  }
  const uninstallHint = name === 'potplayer' ? 'PotPlayer' : name;
  out.push(...winUninstallCandidates(uninstallHint, exeNamesForPlayer(name)[0]));

  return out;
}

/**
 * @param {string} name
 * @returns {string[]}
 */
function darwinCandidates(name) {
  if (process.platform !== 'darwin') return [];
  if (name === 'vlc') return ['/Applications/VLC.app/Contents/MacOS/VLC'];
  if (name === 'mpv') return ['/Applications/mpv.app/Contents/MacOS/mpv'];
  return [];
}

/**
 * @param {string} name
 * @param {string[]} extraCandidates
 * @returns {string | null}
 */
function findExecutable(name, extraCandidates = []) {
  const win = process.platform === 'win32';
  const executableNames = win
    ? (name === 'potplayer' ? exeNamesForPlayer('potplayer') : [`${name}.exe`, name])
    : [name];
  const candidates = [...extraCandidates];

  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    for (const executable of executableNames) candidates.push(path.join(entry, executable));
  }

  if (win) {
    for (const exeName of executableNames) {
      try {
        const whereOut = execFileSync('where.exe', [exeName], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 3000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        for (const line of whereOut.split(/\r?\n/)) {
          const p = line.trim();
          if (p) candidates.push(p);
        }
      } catch { /* not in PATH */ }
    }
  }

  const seen = new Set();
  for (const candidate of candidates) {
    const abs = path.resolve(candidate);
    if (seen.has(abs.toLowerCase())) continue;
    seen.add(abs.toLowerCase());
    if (isFile(abs)) return abs;
  }
  return null;
}

/**
 * @param {import('./types').ExternalPlayerId} id
 * @returns {string | null}
 */
function findPlayerExecutable(id) {
  return findExecutable(id, [...winProgramCandidates(id), ...darwinCandidates(id)]);
}

module.exports = {
  findExecutable,
  findPlayerExecutable,
  extractExeFromCommand,
};
