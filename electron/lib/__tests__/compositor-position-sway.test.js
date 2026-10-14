'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const sway = require('../compositor-position/sway');

const { buildCommand, isAvailable, moveWindow } = sway;

describe('sway.buildCommand', () => {
  const base = {
    pid: 1234,
    title: 'anix-banner-stack',
    x: 1504.6,
    y: 1296.2,
    width: 400,
    height: 128,
  };

  it('exposes the module contract', () => {
    assert.equal(sway.id, 'sway');
    assert.equal(typeof isAvailable, 'function');
    assert.equal(typeof buildCommand, 'function');
    assert.equal(typeof moveWindow, 'function');
  });

  it('selects window by pid + anchored title regex', () => {
    const cmd = buildCommand(base);
    assert.ok(
      cmd.startsWith('[pid=1234 title="^anix\\-banner\\-stack$"]'),
      `criteria first, got: ${cmd}`,
    );
  });

  it('orders floating enable → move (position-only: size делает Electron setBounds)', () => {
    const cmd = buildCommand(base);
    const floatingAt = cmd.indexOf('floating enable');
    const moveAt = cmd.indexOf('move absolute position');
    assert.ok(floatingAt !== -1, 'floating enable present');
    assert.ok(moveAt !== -1, 'move present');
    assert.ok(!cmd.includes('resize set'), 'no resize (position-only)');    assert.ok(floatingAt < moveAt, 'floating before move');
  });

  it('multiplies DIP coords by scaleFactor and rounds (physical px)', () => {
    const cmd = buildCommand({ ...base, x: 100.4, y: 64.6, scaleFactor: 1.5 });
    assert.ok(cmd.includes('move absolute position 151 97'), `scaled+rounded, got: ${cmd}`);
  });

  it('treats bad scaleFactor as 1', () => {
    const cmd = buildCommand({ ...base, scaleFactor: Number.NaN });
    assert.ok(cmd.includes('move absolute position 1505 1296'), 'unscaled coords');
  });

  it('coerces non-numeric coords to 0', () => {
    const cmd = buildCommand({ ...base, x: Number.NaN, y: undefined });
    assert.ok(cmd.includes('move absolute position 0 0'), `zeroed coords, got: ${cmd}`);
  });

  it('regex-escapes regex specials in title', () => {
    const cmd = buildCommand({ ...base, title: 'anix.banner [v1.0] (test)' });
    assert.ok(
      cmd.includes('title="^anix\\.banner \\[v1\\.0\\] \\(test\\)$"'),
      `escaped title, got: ${cmd}`,
    );
  });

  it('escapes quotes and backslashes in title', () => {
    const cmd = buildCommand({ ...base, title: 'anix "quoted" \\ test' });
    assert.ok(
      cmd.includes('title="^anix \\"quoted\\" \\\\ test$"'),
      `escaped quotes, got: ${cmd}`,
    );
  });

  it('title cannot break out of criteria or append commands', () => {
    const cmd = buildCommand({ ...base, title: 'x"] floating disable; exec evil, kill' });
    // Все спецсимволы экранированы: `"` `]` `\;` `\,` — сырых разделителей нет.
    assert.ok(
      cmd.startsWith('[pid=1234 title="^x\\"\\] floating disable\\; exec evil\\, kill$"]'),
      `fully escaped criteria, got: ${cmd}`,
    );
    // Реальная команда одна, идёт после закрытия критерия.
    assert.ok(
      cmd.includes('$"], floating enable, move absolute position 1505 1296'),
      'single real command tail',
    );
    assert.ok(!cmd.includes('disable;'), 'no raw ; from title');
    assert.ok(!cmd.includes('disable,'), 'no raw , from title');
  });

  it('pid is Number-coerced, injection attempts collapse to pid=0', () => {
    const cmd = buildCommand({ ...base, pid: '1234] exec evil' });
    assert.ok(cmd.startsWith('[pid=0 title='), `coerced pid, got: ${cmd}`);
    assert.ok(!cmd.includes('exec evil'), 'no pid payload in command');
  });
});

describe('isAvailable', () => {
  const saved = {};
  const ENV_KEYS = ['SWAYSOCK'];

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

  it('true when SWAYSOCK set', () => {
    process.env.SWAYSOCK = '/run/user/1000/sway-ipc.1234.sock';
    assert.equal(isAvailable(), true);
  });

  it('false without SWAYSOCK', () => {
    assert.equal(isAvailable(), false);
  });

  it('false on empty SWAYSOCK', () => {
    process.env.SWAYSOCK = '';
    assert.equal(isAvailable(), false);
  });
});

describe('sway.moveWindow', () => {
  it('dispatches without throwing and reports dispatch', () => {
    // swaymsg на этой машине не установлен — execFile отдаст ENOENT в колбэк,
    // контракт «никогда не бросает, true если отправлено» соблюдается на любой
    // машине (с swaymsg — реальная отправка, без — error в no-op logger).
    assert.equal(
      moveWindow({ pid: 1234, title: 'anix-banner-stack', x: 10, y: 20, width: 30, height: 40 }),
      true,
    );
  });
});
