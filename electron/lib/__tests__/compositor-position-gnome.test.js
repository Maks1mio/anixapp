'use strict';

/**
 * Тесты GNOME-бэкенда позиционирования (compositor-position/gnome.js).
 *
 * Покрыто: чистые функции (buildScript/buildDispatchArgv/classifyResult/isAvailable)
 * и ЛОГИКА скрипта через реальное исполнение eval с заглушкой global (в node `global`
 * — обычный globalThis, скрипт ссылается на global.get_window_actors).
 *
 * НЕ покрыто (живого GNOME в тестовом окружении нет): реальный D-Bus вызов, факт
 * применения move_resize_frame в Mutter, допущение о DIP-координатах, реальные тексты
 * отказа Eval. Это best-effort backend — см. доку модуля.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const gnome = require('../compositor-position/gnome');

const TITLE = 'anix-banner-stack';

/**
 * Ставит заглушку global.get_window_actors на время fn(), восстанавливает после.
 * @param {Array} actors — моки WindowActor ({ meta_window: {...} })
 * @param {() => unknown} fn
 */
function withWindowActors(actors, fn) {
  const prev = global.get_window_actors;
  global.get_window_actors = () => actors;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete global.get_window_actors;
    else global.get_window_actors = prev;
  }
}

describe('buildScript', () => {
  it('matches window by pid + title and calls move_resize_frame', () => {
    const script = gnome.buildScript({
      pid: 1234,
      title: TITLE,
      x: 100.6,
      y: 50.2,
      width: 400,
      height: 200,
    });
    assert.ok(script.includes('var pid = 1234;'), 'pid literal');
    assert.ok(script.includes(`var title = '${TITLE}';`), 'title literal');
    assert.ok(script.includes('mw.get_pid() !== pid'), 'pid matcher');
    assert.ok(script.includes('mw.get_title() !== title'), 'title matcher');
    // Координаты округлены до целых (Mutter ждёт целые логические пиксели).
    assert.ok(
      script.includes('mw.move_resize_frame(false, 101, 50, f.width, f.height)'),
      'frame move position-only, user_op=false',
    );
  });

  it('wraps everything in try/catch returning an error string', () => {
    const script = gnome.buildScript({ pid: 1, title: TITLE, x: 0, y: 0, width: 10, height: 10 });
    assert.ok(script.includes('try {'), 'try wrapper');
    assert.ok(script.includes("return 'error: ' + e;"), 'catch returns error string');
    assert.ok(script.includes("return 'no-match';"), 'no-match marker');
    assert.ok(script.includes("return 'ok';"), 'ok marker');
  });

  it('passes DIP coords through — scaleFactor is NOT applied', () => {
    const base = { pid: 1, title: TITLE, x: 100, y: 50, width: 400, height: 200 };
    const s1 = gnome.buildScript({ ...base, scaleFactor: 1.5 });
    const s2 = gnome.buildScript({ ...base, scaleFactor: 2 });
    // В отличие от Hyprland-ветки умножения нет: координаты Mutter считаем DIP.
    assert.ok(s1.includes('mw.move_resize_frame(false, 100, 50, f.width, f.height)'), 'scale 1.5');
    assert.ok(s2.includes('mw.move_resize_frame(false, 100, 50, f.width, f.height)'), 'scale 2');
    assert.ok(s2.includes('scale=2 intentionally not applied'), 'scale задокументирован в скрипте');
  });

  it('escapes quotes and backslashes in title (no injection)', () => {
    const evil = "anix'); require('child_process'); \n\\; ('";
    const script = gnome.buildScript({ pid: 1, title: evil, x: 0, y: 0, width: 10, height: 10 });
    // Сырой payload разорван: перед каждой кавычкой/backslash стоит backslash.
    assert.ok(!script.includes("require('child_process')"), 'payload нейтрализован');
    assert.ok(script.includes("\\'"), 'кавычка экранирована');
    assert.ok(script.includes('\\\\'), 'backslash экранирован');
  });

  it('coerces non-numeric inputs to integers', () => {
    const script = gnome.buildScript({
      pid: Number.NaN,
      title: TITLE,
      x: Number.NaN,
      y: undefined,
      width: '300',
      height: 120.9,
    });
    assert.ok(script.includes('var pid = 0;'), 'bad pid → 0 (ни одно окно не совпадёт)');
    assert.ok(
      script.includes('mw.move_resize_frame(false, 0, 0, f.width, f.height)'),
      'bad coords → 0, строки и дроби coerced',
    );
  });
});

describe('buildScript: исполнение (eval с заглушкой global)', () => {
  const base = { pid: 1234, title: TITLE, x: 100, y: 50, width: 400, height: 200 };

  it('moves matched window once with exact frame args', () => {
    const calls = [];
    const win = {
      get_pid: () => 1234,
      get_title: () => TITLE,
      get_frame_rect: () => ({ x: 0, y: 0, width: 400, height: 200 }),
      move_resize_frame: (...args) => calls.push(args),
    };
    const result = withWindowActors([{ meta_window: win }], () =>
      eval(gnome.buildScript(base)));
    assert.equal(result, 'ok');
    assert.deepEqual(calls, [[false, 100, 50, 400, 200]], 'user_op=false, position-only, size preserved');
  });

  it('skips other pids and other titles → no-match', () => {
    const win = {
      get_pid: () => 9999,
      get_title: () => TITLE,
      get_frame_rect: () => ({ x: 0, y: 0, width: 400, height: 200 }),
      move_resize_frame: () => assert.fail('не должен вызываться'),
    };
    const result = withWindowActors([{ meta_window: win }], () => eval(gnome.buildScript(base)));
    assert.equal(result, 'no-match');

    const samePidWrongTitle = {
      get_pid: () => 1234,
      get_title: () => 'main-window',
      get_frame_rect: () => ({ x: 0, y: 0, width: 400, height: 200 }),
      move_resize_frame: () => assert.fail('не должен вызываться'),
    };
    const result2 = withWindowActors([{ meta_window: samePidWrongTitle }], () =>
      eval(gnome.buildScript(base)));
    assert.equal(result2, 'no-match');
  });

  it('skips actors without meta_window and null titles', () => {
    const win = {
      get_pid: () => 1234,
      get_title: () => null,
      get_frame_rect: () => ({ x: 0, y: 0, width: 400, height: 200 }),
      move_resize_frame: () => assert.fail('не должен вызываться'),
    };
    const result = withWindowActors([{}, { meta_window: win }], () =>
      eval(gnome.buildScript(base)));
    assert.equal(result, 'no-match');
  });

  it('catches missing global.get_window_actors (returns error string, no throw)', () => {
    // global.get_window_actors намеренно не задан — как в GNOME Shell без наших моков.
    const prev = global.get_window_actors;
    delete global.get_window_actors;
    try {
      let result;
      assert.doesNotThrow(() => { result = eval(gnome.buildScript(base)); });
      assert.ok(String(result).startsWith('error: '), `catch сработал: ${result}`);
    } finally {
      if (prev !== undefined) global.get_window_actors = prev;
    }
  });

  it('catches throwing move_resize_frame (Mutter refusal) without throwing', () => {
    const refusing = {
      get_pid: () => 1234,
      get_title: () => TITLE,
      get_frame_rect: () => ({ x: 0, y: 0, width: 400, height: 200 }),
      move_resize_frame: () => { throw new Error('WAYLAND: move not allowed'); },
    };
    const result = withWindowActors([{ meta_window: refusing }], () =>
      eval(gnome.buildScript(base)));
    assert.ok(String(result).startsWith('error: '), `отказ Mutter виден в результате: ${result}`);
  });

  it('malicious title cannot break out of the string literal', () => {
    const evil = "x'); global.pwned = 42; ('";
    const win = {
      get_pid: () => 1234,
      get_title: () => evil,
      get_frame_rect: () => ({ x: 0, y: 0, width: 400, height: 200 }),
      move_resize_frame: (...args) => calls.push(args),
    };
    const calls = [];
    const script = gnome.buildScript({ ...base, title: evil });
    const result = withWindowActors([{ meta_window: win }], () => eval(script));
    assert.equal(result, 'ok', 'окно с опасным title найдено и сдвинуто');
    assert.deepEqual(calls, [[false, 100, 50, 400, 200]]);
    assert.equal(global.pwned, undefined, 'инъекция не исполнилась');
    delete global.pwned;
  });
});

describe('buildDispatchArgv', () => {
  it('builds exact gdbus argv with the script as a single argument', () => {
    const argv = gnome.buildDispatchArgv('JS SOURCE');
    assert.deepEqual(argv, [
      'call',
      '--session',
      '--dest', 'org.gnome.Shell',
      '--object-path', '/org/gnome/Shell',
      '--method', 'org.gnome.Shell.Eval',
      'JS SOURCE',
    ]);
  });
});

describe('classifyResult', () => {
  const cases = [
    // [stdout, stderr, exitCode, expected]
    ["(true, 'ok')", '', 0, 'ok'],
    ["(true, 'no-match')", '', 0, 'no-match'],
    ["(true, 'error: TypeError: x is not a function')", '', 0, 'error'],
    ["(true, 'undefined')", '', 0, 'error'],
    ["(false, 'Eval is not allowed')", '', 0, 'eval-disabled'],
    ["(false, 'GNOME Shell unsafe mode is disabled')", '', 0, 'eval-disabled'],
    ["(false, 'security policy blocks Eval')", '', 0, 'eval-disabled'],
    ["(false, 'Eval is locked down')", '', 0, 'eval-disabled'],
    // Пустое сообщение при false: наш скрипт false не возвращает — классифицируем error.
    ["(false, '')", '', 0, 'eval-disabled'],
    ["(false, 'SyntaxError: unexpected token')", '', 0, 'error'],
    ['', 'Error: The name org.gnome.Shell was not provided by any .service files', 1, 'error'],
    ["(true, 'ok')", '', 1, 'error'],
    ["(false, 'Eval is not allowed')", '', null, 'error'],
    ['', 'gdbus: no session bus', undefined, 'error'],
  ];

  for (const [stdout, stderr, exitCode, expected] of cases) {
    it(`${JSON.stringify([stdout, exitCode])} → ${expected}`, () => {
      assert.equal(gnome.classifyResult(stdout, stderr, exitCode), expected);
    });
  }
});

describe('isAvailable', () => {
  const saved = {};
  const ENV_KEYS = ['XDG_CURRENT_DESKTOP', 'XDG_SESSION_DESKTOP'];

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

  it('XDG_CURRENT_DESKTOP ubuntu:GNOME → true', () => {
    process.env.XDG_CURRENT_DESKTOP = 'ubuntu:GNOME';
    assert.equal(gnome.isAvailable(), true);
  });

  it('XDG_CURRENT_DESKTOP KDE → false', () => {
    process.env.XDG_CURRENT_DESKTOP = 'KDE';
    assert.equal(gnome.isAvailable(), false);
  });

  it('XDG_SESSION_DESKTOP gnome → true', () => {
    process.env.XDG_SESSION_DESKTOP = 'gnome';
    assert.equal(gnome.isAvailable(), true);
  });

  it('регистр не важен (GNOME-Classic)', () => {
    process.env.XDG_CURRENT_DESKTOP = 'GNOME-Classic';
    assert.equal(gnome.isAvailable(), true);
  });

  it('обе переменные отсутствуют → false', () => {
    assert.equal(gnome.isAvailable(), false);
  });
});

describe('gnome.parseMonitorPayload', () => {
  it('parses "x,y,w,h,scale"', () => {
    assert.deepEqual(gnome.parseMonitorPayload('1920,0,2560,1440,1'), {
      x: 1920, y: 0, width: 2560, height: 1440, scale: 1, reserved: [0, 0, 0, 0],
    });
  });

  it('scale defaults to 1 when missing/zero', () => {
    assert.equal(gnome.parseMonitorPayload('0,0,800,600').scale, 1);
    assert.equal(gnome.parseMonitorPayload('0,0,800,600,0').scale, 1);
  });

  it('derives reserved in PHYSICAL px (× scale) for the shared consumer', () => {
    // monitor 0,0 1280x720 @2; work area 0,27 1280x693 → top panel 27 logical
    // → 54 physical (effectiveWorkArea делит на scale и получает 27 DIP).
    assert.deepEqual(
      gnome.parseMonitorPayload('0,0,1280,720,2,0,27,1280,693').reserved,
      [0, 54, 0, 0],
    );
  });

  it('returns null on malformed payloads', () => {
    assert.equal(gnome.parseMonitorPayload('no-match'), null);
    assert.equal(gnome.parseMonitorPayload('1,2,3'), null);
    assert.equal(gnome.parseMonitorPayload(null), null);
    assert.equal(gnome.parseMonitorPayload('a,b,c,d'), null);
  });
});

describe('gnome eval scripts', () => {
  it('focused-monitor script returns geometry + scale, try/catch guarded', () => {
    const s = gnome.buildFocusedMonitorScript();
    assert.ok(s.includes('get_focus_window'), 'uses focus window');
    assert.ok(s.includes('get_monitor_geometry'), 'reads monitor geometry');
    assert.ok(s.includes('get_primary_monitor'), 'primary fallback');
    assert.ok(s.includes("catch (e) { return 'error: '"), 'guarded');
  });

  it('window-monitor script matches pid + title and is guarded', () => {
    const s = gnome.buildWindowMonitorScript({ pid: 42, title: 'anix "banner"' });
    assert.ok(s.includes('var pid = 42;'), 'pid embedded');
    assert.ok(s.includes("var title = 'anix \"banner\"';"), 'title escaped');
    assert.ok(s.includes('get_monitor_geometry'), 'geometry');
    assert.ok(s.includes("return 'no-match';"), 'no-match path');
  });

  it('banner-rule script sets skip_taskbar/above/all-workspaces by title', () => {
    const s = gnome.buildBannerRuleScript('anix-banner-stack');
    assert.ok(s.includes('mw.skip_taskbar = true'), 'skip taskbar');
    assert.ok(s.includes('mw.make_above()'), 'above');
    assert.ok(s.includes('mw.on_all_workspaces = true'), 'all workspaces');
  });

  it('exposes the full backend contract', () => {
    assert.equal(gnome.id, 'gnome');
    for (const fn of ['moveWindow', 'getFocusedMonitor', 'getWindowMonitor', 'applyBannerRule']) {
      assert.equal(typeof gnome[fn], 'function', `${fn} exported`);
    }
  });
});
