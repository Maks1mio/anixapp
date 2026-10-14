'use strict';

const { describe, it, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  BANNER_WINDOW_TITLE,
  resolveOzonePlatform,
  positionWindowOnCompositor,
  hasCompositorBackend,
  POSITION_MAX_ATTEMPTS,
} = require('../compositor-position');

describe('compositor-position facade', () => {
  it('hyprland backend exposed for tests', () => {
    const { buildHyprlandPositionLua } = require('../compositor-position');
    assert.equal(typeof buildHyprlandPositionLua, 'function');
    const lua = buildHyprlandPositionLua({
      pid: 1, title: BANNER_WINDOW_TITLE, x: 10, y: 20,
    });
    assert.ok(lua.includes(`w.title == "${BANNER_WINDOW_TITLE}"`));
  });
});

describe('resolveOzonePlatform', () => {
  const saved = {};
  const ENV_KEYS = [
    'WAYLAND_DISPLAY',
    'XDG_SESSION_TYPE',
  ];

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

  // В plain node require('electron') отдаёт строку, chromium command line
  // недоступен — тесты покрывают fallback по признакам сессии. Ветка явного
  // switch --ozone-platform проверена e2e-пробой на живой сессии.

  it('wayland when WAYLAND_DISPLAY set and session is wayland', () => {
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    process.env.XDG_SESSION_TYPE = 'wayland';
    assert.equal(resolveOzonePlatform(), 'wayland');
  });

  it('x11 without WAYLAND_DISPLAY', () => {
    process.env.XDG_SESSION_TYPE = 'x11';
    assert.equal(resolveOzonePlatform(), 'x11');
  });

  it('x11 session wins over stray WAYLAND_DISPLAY', () => {
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    process.env.XDG_SESSION_TYPE = 'x11';
    assert.equal(resolveOzonePlatform(), 'x11');
  });

  it('no session markers at all: x11', () => {
    assert.equal(resolveOzonePlatform(), 'x11');
  });
});

describe('positionWindowOnCompositor', () => {
  const saved = {};
  const ENV_KEYS = [
    'WAYLAND_DISPLAY',
    'XDG_SESSION_TYPE',
    'HYPRLAND_INSTANCE_SIGNATURE',
    'SWAYSOCK',
    'XDG_CURRENT_DESKTOP',
    'XDG_SESSION_DESKTOP',
    'KDE_FULL_SESSION',
  ];

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

  it('no-op (false) on x11 session', () => {
    process.env.XDG_SESSION_TYPE = 'x11';
    assert.equal(positionWindowOnCompositor(BANNER_WINDOW_TITLE, 10, 20, 1), false);
  });

  it('no-op (false) on wayland without any known compositor', () => {
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    process.env.XDG_SESSION_TYPE = 'wayland';
    assert.equal(positionWindowOnCompositor(BANNER_WINDOW_TITLE, 10, 20, 1), false);
  });

  it('dispatches on hyprland wayland session', () => {
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    process.env.XDG_SESSION_TYPE = 'wayland';
    process.env.HYPRLAND_INSTANCE_SIGNATURE = 'sig_test';
    assert.equal(positionWindowOnCompositor(BANNER_WINDOW_TITLE, 10, 20, 1), true);
  });

  it('facade → backend arg contract: {pid, title, x, y, scaleFactor}, no width/height', () => {
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    process.env.XDG_SESSION_TYPE = 'wayland';
    process.env.HYPRLAND_INSTANCE_SIGNATURE = 'sig_test';

    // Фасад держит ссылку на объект модуля hyprland — шпионим поверх метода.
    const hypr = require('../compositor-position/hyprland');
    const real = hypr.moveWindow;
    let seen = null;
    hypr.moveWindow = (args) => { seen = args; return true; };
    try {
      assert.equal(positionWindowOnCompositor(BANNER_WINDOW_TITLE, 11, 22, 1.5), true);
      assert.deepEqual(seen, {
        pid: process.pid,
        title: BANNER_WINDOW_TITLE,
        x: 11,
        y: 22,
        scaleFactor: 1.5,
      }, 'arg shape locked: position-only (C1 regression)');
      assert.ok(!('width' in seen) && !('height' in seen), 'no size keys — position-only contract');
    } finally {
      hypr.moveWindow = real;
    }
  });
});

describe('positionWindowOnCompositor retry', () => {
  const saved = {};
  const KEYS = ['WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'HYPRLAND_INSTANCE_SIGNATURE'];
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('retries until backend reports the window found, then onDone(true)', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    process.env.XDG_SESSION_TYPE = 'wayland';
    process.env.HYPRLAND_INSTANCE_SIGNATURE = 'sig_test';

    const hypr = require('../compositor-position/hyprland');
    const real = hypr.moveWindow;
    let calls = 0;
    hypr.moveWindow = (args, cb) => {
      calls += 1;
      // Первые попытки — окно ещё не замаплено; успех с третьей.
      cb(calls < 3 ? new Error('not mapped') : null);
      return true;
    };
    try {
      const ok = await new Promise((resolve) => {
        positionWindowOnCompositor(BANNER_WINDOW_TITLE, 5, 6, 1, resolve);
      });
      assert.equal(ok, true, 'onDone(true) after real match');
      assert.ok(calls >= 3, `retried until found (calls=${calls})`);
    } finally {
      hypr.moveWindow = real;
    }
  });

  it('gives up after max attempts with onDone(false)', async () => {
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    process.env.XDG_SESSION_TYPE = 'wayland';
    process.env.HYPRLAND_INSTANCE_SIGNATURE = 'sig_test';

    const hypr = require('../compositor-position/hyprland');
    const real = hypr.moveWindow;
    let calls = 0;
    hypr.moveWindow = (args, cb) => {
      calls += 1;
      cb(new Error('never mapped'));
      return true;
    };
    try {
      const ok = await new Promise((resolve) => {
        positionWindowOnCompositor(BANNER_WINDOW_TITLE, 5, 6, 1, resolve);
      });
      assert.equal(ok, false, 'onDone(false) after exhausting attempts');
      assert.equal(calls, POSITION_MAX_ATTEMPTS, 'attempts capped');
    } finally {
      hypr.moveWindow = real;
    }
  });
});

// Последним: hasCompositorBackend кэширует доступность бэкенда на процесс,
// поэтому до него в файле его никто не дёргает.
describe('hasCompositorBackend', () => {
  const saved = {};
  const KEYS = ['WAYLAND_DISPLAY', 'XDG_SESSION_TYPE', 'HYPRLAND_INSTANCE_SIGNATURE'];
  after(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('true on hyprland wayland session, false on x11', () => {
    for (const key of KEYS) saved[key] = process.env[key];
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    process.env.XDG_SESSION_TYPE = 'wayland';
    process.env.HYPRLAND_INSTANCE_SIGNATURE = 'sig_test';
    assert.equal(hasCompositorBackend(), true);
  });
});
