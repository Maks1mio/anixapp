'use strict';

const { describe, it, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

// execFile стабим ДО загрузки модуля (он деструктурирует его при require):
// живого KWin в тестовой среде нет, D-Bus не трогаем. Загрузка скрипта
// эмулируется ответом `(int32 7,)` → run должен уйти на /Scripting/Script7.
const realExecFile = cp.execFile;
let execCalls = [];
cp.execFile = function stubbedExecFile(file, args, opts, callback) {
  execCalls.push({ file, args, opts });
  const cb = typeof opts === 'function' ? opts : callback;
  setImmediate(() => cb(null, '(int32 7,)', ''));
};

const kwin = require('../compositor-position/kwin');

const BANNER_WINDOW_TITLE = 'anix-banner-stack';

describe('buildScript', () => {
  it('matches window by pid + caption and sets frameGeometry', () => {
    const script = kwin.buildScript({
      pid: 1234,
      title: BANNER_WINDOW_TITLE,
      x: 10,
      y: 20,
      width: 300,
      height: 80,
    });
    assert.ok(script.includes('var PID = 1234;'), 'pid matcher');
    assert.ok(script.includes(`w.caption !== TITLE`), 'caption guarded');
    assert.ok(script.includes(`var TITLE = "${BANNER_WINDOW_TITLE}";`), 'title constant');
    assert.ok(script.includes('{ x: 10, y: 20, width: g.width, height: g.height }'), 'position-only geometry');
    assert.ok(script.includes('w.tile = null'), 'tile-drop assignment');
    assert.ok(script.includes('typeof w.tile !== "undefined"'), 'tile guarded by typeof');
  });

  it('uses workspace.windowList (KWin 6) with clientList fallback (Plasma 5)', () => {
    const script = kwin.buildScript({ pid: 1, title: BANNER_WINDOW_TITLE, x: 0, y: 0, width: 10, height: 10 });
    assert.ok(script.includes('workspace.windowList()'), 'KWin 6 list');
    assert.ok(script.includes('workspace.clientList()'), 'Plasma 5 fallback');
  });

  it('passes DIP coords through: no scaleFactor multiply', () => {
    const script = kwin.buildScript({
      pid: 1,
      title: BANNER_WINDOW_TITLE,
      x: 100,
      y: 64,
      width: 300,
      height: 80,
      scaleFactor: 2,
    });
    // KWin frameGeometry — логические пиксели (Qt), как Electron DIP.
    assert.ok(script.includes('{ x: 100, y: 64, width: g.width, height: g.height }'), 'unscaled coords, position-only');
    assert.ok(!script.includes('scaleFactor'), 'scaleFactor never reaches kwin script');
  });

  it('treats bad numbers as 0 and clamps negative pid', () => {
    const script = kwin.buildScript({
      pid: Number.NaN,
      title: BANNER_WINDOW_TITLE,
      x: Number.NaN,
      y: -5,
      width: '300',
      height: undefined,
    });
    assert.ok(script.includes('var PID = 0;'), 'NaN pid → 0');
    assert.ok(script.includes('{ x: 0, y: -5, width: g.width, height: g.height }'), 'coords coerced: NaN→0, negatives kept');
  });

  it('escapes title: no injection into kwin script', () => {
    const payload = 'x"; closeWindow(); \\ "';
    const script = kwin.buildScript({ pid: 1, title: payload, x: 0, y: 0, width: 10, height: 10 });
    // Встроено ровно как JSON-литерал: кавычки и бэкслеши экранированы.
    assert.equal(
      script.includes(`var TITLE = ${JSON.stringify(payload)};`),
      true,
      'title embedded as JSON-escaped literal',
    );
  });

  it('injected title cannot break out: script executes safely in a sandbox', () => {
    const payload = 'x"; closeWindow(); //';
    const script = kwin.buildScript({ pid: 1, title: payload, x: 5, y: 6, width: 7, height: 8 });
    let hacked = false;
    const banner = { pid: 1, caption: payload, frameGeometry: { x: 0, y: 0, width: 7, height: 8 }, tile: undefined };
    const sandbox = {
      // Канарейка: легитимный скрипт closeWindow() не вызывает никогда —
      // она сработает только если title прорвёт строковый литерал.
      closeWindow: () => { hacked = true; },
      workspace: { windowList: () => [banner] },
      // Qt НЕ в скоупе kwin-скриптов (проверено на kwin_wayland 6.7.5).
    };
    assert.doesNotThrow(() => vm.runInNewContext(script, sandbox), 'script stays parseable');
    assert.equal(hacked, false, 'payload stayed a string');
    // vm-сэндбокс отдаёт объекты чужого реалма — deepStrictEqual падает на прототипе.
    const fg = banner.frameGeometry;
    assert.equal(fg && fg.x, 5, 'positioning ran: x');
    assert.equal(fg && fg.y, 6, 'positioning ran: y');
    assert.equal(fg && fg.width, 7, 'size preserved from current geometry');
    assert.equal(fg && fg.height, 8, 'size preserved from current geometry');
  });
});

describe('buildDispatchArgv', () => {
  it('targets org.kde.KWin /Scripting loadScript, path is a single argv element', () => {
    const argv = kwin.buildDispatchArgv('/tmp/dir with space/anix.js', 'anix-position-42');
    assert.equal(argv[0], 'call', 'gdbus subcommand');
    assert.ok(argv.includes('--session'), 'session bus flag');
    const pick = (flag) => argv[argv.indexOf(flag) + 1];
    assert.equal(pick('--dest'), 'org.kde.KWin', 'dest');
    assert.equal(pick('--object-path'), '/Scripting', 'object path');
    assert.equal(pick('--method'), 'org.kde.kwin.Scripting.loadScript', 'method');
    assert.deepEqual(argv.slice(-2), ['/tmp/dir with space/anix.js', 'anix-position-42'], 'path+name as-is');
    assert.ok(argv.every((a) => !/[;&|`$]/.test(a)), 'no shell metacharacters anywhere');
  });
});

describe('isAvailable', () => {
  const saved = {};
  const ENV_KEYS = ['XDG_CURRENT_DESKTOP', 'KDE_FULL_SESSION'];

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('true when XDG_CURRENT_DESKTOP is KDE (case-insensitive)', () => {
    process.env.XDG_CURRENT_DESKTOP = 'KDE';
    assert.equal(kwin.isAvailable(), true);
    process.env.XDG_CURRENT_DESKTOP = 'kde';
    assert.equal(kwin.isAvailable(), true);
  });

  it('true for colon-separated desktop lists containing the kde token', () => {
    process.env.XDG_CURRENT_DESKTOP = 'ubuntu:KDE';
    assert.equal(kwin.isAvailable(), true);
  });

  it('false when XDG_CURRENT_DESKTOP is another desktop', () => {
    process.env.XDG_CURRENT_DESKTOP = 'GNOME';
    assert.equal(kwin.isAvailable(), false);
  });

  it('true when only KDE_FULL_SESSION is set', () => {
    process.env.XDG_CURRENT_DESKTOP = 'GNOME';
    process.env.KDE_FULL_SESSION = 'true';
    assert.equal(kwin.isAvailable(), true);
  });

  it('false without any KDE markers', () => {
    assert.equal(kwin.isAvailable(), false);
  });
});

describe('moveWindow', () => {
  const tmpPrefix = path.join(os.tmpdir(), 'anix-kwin-position-4242-');
  const writtenPaths = () => fs.readdirSync(os.tmpdir())
    .filter((f) => f.startsWith('anix-kwin-position-4242-'))
    .map((f) => path.join(os.tmpdir(), f));

  afterEach(() => {
    execCalls = [];
    for (const p of writtenPaths()) fs.rmSync(p, { force: true });
  });

  it('writes script to unpredictable tmp path and dispatches unload → load → run', async () => {
    const dispatched = kwin.moveWindow({
      pid: 4242,
      title: BANNER_WINDOW_TITLE,
      x: 10,
      y: 20,
    });
    assert.equal(dispatched, true, 'dispatch initiated');

    // unload+load уходят сразу, run — после парса id; ждём микротаск-цепочку.
    for (let waited = 0; execCalls.length < 3 && waited < 100; waited += 5) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(execCalls.length >= 3, 'three gdbus calls chained');
    assert.ok(execCalls.every((call) => call.file === 'gdbus'), 'gdbus binary');
    assert.equal(execCalls[0].opts.timeout, 2000, 'timeout per call');

    assert.ok(execCalls[0].args.includes('org.kde.kwin.Scripting.unloadScript'), 'unload first');
    assert.ok(execCalls[0].args.includes('anix-position-4242'), 'per-pid script name');

    const load = execCalls[1];
    assert.ok(load.args.includes('org.kde.kwin.Scripting.loadScript'), 'load second');
    const scriptPath = writtenPaths()[0];
    assert.ok(scriptPath, 'script file written to os.tmpdir');
    assert.ok(load.args.includes(scriptPath), 'script path passed to loadScript');

    const run = execCalls[2];
    assert.ok(run.args.includes('/Scripting/Script7'), 'object path from parsed id');
    assert.ok(run.args.includes('org.kde.kwin.Script.run'), 'run last');
  });

  it('writes the script file with DIP geometry inside', () => {
    // Другие координаты: у бэкенда content-кэш, после afterEach удалённый файл
    // вернулся бы как «актуальный» путь.
    kwin.moveWindow({ pid: 4242, title: BANNER_WINDOW_TITLE, x: 30, y: 40 });
    const script = fs.readFileSync(writtenPaths()[0], 'utf8');
    assert.ok(script.includes('{ x: 30, y: 40, width: g.width, height: g.height }'), 'position-only geometry embedded');
    assert.ok(script.includes('var PID = 4242;'), 'pid embedded');
  });

  it('never throws on garbage input', () => {
    assert.doesNotThrow(() => kwin.moveWindow({ pid: Number.NaN, title: 'x', x: 'a', y: null }));
    assert.doesNotThrow(() => kwin.moveWindow());
    assert.equal(typeof kwin.moveWindow(), 'boolean');
  });
});

after(() => {
  cp.execFile = realExecFile;
  fs.rmSync(path.join(os.tmpdir(), 'anix-kwin-position-0.js'), { force: true });
});
