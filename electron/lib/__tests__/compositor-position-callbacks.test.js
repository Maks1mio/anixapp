'use strict';

/**
 * Контракт колбэков бэкендов композитора: `cb(err|null)` — null ТОЛЬКО когда окно
 * реально найдено и перемещено (иначе фасад показал бы контент в центре), плюс
 * деградация без исключений. execFile стабим ДО require каждого бэкенда — модули
 * деструктурируют его при загрузке.
 */

const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');

const realExecFile = cp.execFile;

/** handler(file, args) → { err?, stdout?, stderr? }; по умолчанию — успех без вывода. */
let handler = () => ({ err: null, stdout: '', stderr: '' });
cp.execFile = function stubbedExecFile(file, args, opts, callback) {
  const cb = typeof opts === 'function' ? opts : callback;
  let res;
  try {
    res = handler(file, args) || {};
  } catch (e) {
    res = { err: e };
  }
  setImmediate(() => cb(res.err || null, res.stdout || '', res.stderr || ''));
  return {};
};

function fresh(rel) {
  const p = require.resolve(rel);
  delete require.cache[p];
  return require(rel);
}

function callCb(fn) {
  return new Promise((resolve) => { fn(resolve); });
}

after(() => { cp.execFile = realExecFile; });

describe('sway moveWindow callback semantics', () => {
  beforeEach(() => { handler = () => ({ err: null }); });

  it('cb(null) when swaymsg succeeds (window found+moved)', async () => {
    const sway = fresh('../compositor-position/sway');
    const err = await callCb((cb) => sway.moveWindow({ pid: 1, title: 'anix-banner-stack', x: 1, y: 2 }, cb));
    assert.equal(err, null);
  });

  it('cb(err) when swaymsg fails (no matching node → retry)', async () => {
    handler = () => ({ err: new Error('No matching node.') });
    const sway = fresh('../compositor-position/sway');
    const err = await callCb((cb) => sway.moveWindow({ pid: 1, title: 'anix-banner-stack', x: 1, y: 2 }, cb));
    assert.ok(err instanceof Error);
  });

  it('moveWindow tolerates missing/undefined args without throwing', () => {
    const sway = fresh('../compositor-position/sway');
    assert.doesNotThrow(() => sway.moveWindow(undefined, () => {}));
    assert.doesNotThrow(() => sway.getWindowMonitor(undefined, () => {}));
  });
});

describe('sway monitor lookups', () => {
  it('getFocusedMonitor uses focused output rect + scale', async () => {
    handler = (file, args) => {
      if (args.includes('get_outputs')) {
        return {
          stdout: JSON.stringify([
            { name: 'DP-1', focused: false, rect: { x: 0, y: 0, width: 1920, height: 1080 }, scale: 1 },
            { name: 'DP-2', focused: true, rect: { x: 1920, y: 0, width: 2560, height: 1440 }, scale: 1 },
          ]),
        };
      }
      return { stdout: '[]' };
    };
    const sway = fresh('../compositor-position/sway');
    const mon = await callCb((cb) => sway.getFocusedMonitor(cb));
    assert.deepEqual(mon, { x: 1920, y: 0, width: 2560, height: 1440, scale: 1, reserved: [0, 0, 0, 0] });
  });

  it('getWindowMonitor finds the node by pid+name and its output', async () => {
    handler = (file, args) => {
      if (args.includes('get_tree')) {
        return {
          stdout: JSON.stringify({
            nodes: [{ nodes: [{ pid: 42, name: 'anix-banner-stack', rect: { x: 2100, y: 100, width: 400, height: 236 } }] }],
          }),
        };
      }
      if (args.includes('get_outputs')) {
        return {
          stdout: JSON.stringify([
            { name: 'DP-1', rect: { x: 0, y: 0, width: 1920, height: 1080 }, scale: 1 },
            { name: 'DP-2', rect: { x: 1920, y: 0, width: 2560, height: 1440 }, scale: 1 },
          ]),
        };
      }
      return { stdout: '[]' };
    };
    const sway = fresh('../compositor-position/sway');
    const mon = await callCb((cb) => sway.getWindowMonitor({ pid: 42, title: 'anix-banner-stack' }, cb));
    assert.equal(mon.x, 1920);
  });

  it('getWindowMonitor → null when the node is absent (no wrong-monitor guess)', async () => {
    handler = (file, args) => (args.includes('get_tree') ? { stdout: '{"nodes":[]}' } : { stdout: '[]' });
    const sway = fresh('../compositor-position/sway');
    const mon = await callCb((cb) => sway.getWindowMonitor({ pid: 1, title: 'nope' }, cb));
    assert.equal(mon, null);
  });

  it('malformed JSON degrades to null, never throws', async () => {
    handler = () => ({ stdout: 'not json' });
    const sway = fresh('../compositor-position/sway');
    assert.equal(await callCb((cb) => sway.getFocusedMonitor(cb)), null);
    assert.equal(await callCb((cb) => sway.getWindowMonitor({ pid: 1, title: 'x' }, cb)), null);
  });

  it('applyBannerRule uses a persistent for_window rule', async () => {
    let seen = '';
    handler = (file, args) => { seen = args[0] || ''; return { err: null }; };
    const sway = fresh('../compositor-position/sway');
    const err = await callCb((cb) => sway.applyBannerRule('anix-banner-stack', cb));
    assert.equal(err, null);
    assert.ok(seen.startsWith('for_window [title="^anix\\-banner\\-stack$"]'), `persistent rule, got: ${seen}`);
  });
});

describe('gnome moveWindow callback semantics', () => {
  it("cb(null) on (true,'ok')", async () => {
    handler = () => ({ stdout: "(true, 'ok')" });
    const gnome = fresh('../compositor-position/gnome');
    const err = await callCb((cb) => gnome.moveWindow({ pid: 1, title: 'x', x: 1, y: 2 }, cb));
    assert.equal(err, null);
  });

  it("cb(err) on (true,'no-match') → facade retries", async () => {
    handler = () => ({ stdout: "(true, 'no-match')" });
    const gnome = fresh('../compositor-position/gnome');
    const err = await callCb((cb) => gnome.moveWindow({ pid: 1, title: 'x', x: 1, y: 2 }, cb));
    assert.ok(err instanceof Error);
  });

  it("cb(err) when Eval is disabled ((false, ''))", async () => {
    handler = () => ({ stdout: "(false, '')" });
    const gnome = fresh('../compositor-position/gnome');
    const err = await callCb((cb) => gnome.moveWindow({ pid: 1, title: 'x', x: 1, y: 2 }, cb));
    assert.ok(err instanceof Error);
  });
});

describe('gnome monitor lookups', () => {
  it('getFocusedMonitor parses geometry and derives reserved from the work area', async () => {
    // monitor 0,0 1920x1080 scale 1; work area 0,32 1920x1048 → reserved top 32.
    handler = () => ({ stdout: "(true, '0,0,1920,1080,1,0,32,1920,1048')" });
    const gnome = fresh('../compositor-position/gnome');
    const mon = await callCb((cb) => gnome.getFocusedMonitor(cb));
    assert.deepEqual(mon, { x: 0, y: 0, width: 1920, height: 1080, scale: 1, reserved: [0, 32, 0, 0] });
  });

  it("getFocusedMonitor → null on (true,'error: ...')", async () => {
    handler = () => ({ stdout: "(true, 'error: boom')" });
    const gnome = fresh('../compositor-position/gnome');
    assert.equal(await callCb((cb) => gnome.getFocusedMonitor(cb)), null);
  });

  it("applyBannerRule → err when Eval disabled", async () => {
    handler = () => ({ stdout: "(false, '')" });
    const gnome = fresh('../compositor-position/gnome');
    const err = await callCb((cb) => gnome.applyBannerRule('x', cb));
    assert.ok(err instanceof Error);
  });

  it("applyBannerRule → err on (true,'error: ...') (script caught an exception)", async () => {
    handler = () => ({ stdout: "(true, 'error: boom')" });
    const gnome = fresh('../compositor-position/gnome');
    const err = await callCb((cb) => gnome.applyBannerRule('x', cb));
    assert.ok(err instanceof Error, 'error payload must not read as success');
  });
});

describe('backend placement-confirmation flags', () => {
  it('hyprland/sway/gnome confirm; kwin does not', () => {
    assert.equal(fresh('../compositor-position/hyprland').confirmsPlacement, true);
    assert.equal(fresh('../compositor-position/sway').confirmsPlacement, true);
    assert.equal(fresh('../compositor-position/gnome').confirmsPlacement, true);
    assert.equal(fresh('../compositor-position/kwin').confirmsPlacement, false);
  });
});
