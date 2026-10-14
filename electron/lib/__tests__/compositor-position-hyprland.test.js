'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BANNER_WINDOW_TITLE } = require('../compositor-position');
const {
  buildHyprlandPositionLua,
  buildBannerRuleLua,
} = require('../compositor-position/hyprland');

describe('buildHyprlandPositionLua', () => {
  it('matches window by pid + title and moves via compositor', () => {
    const lua = buildHyprlandPositionLua({
      pid: 1234,
      title: BANNER_WINDOW_TITLE,
      x: 1504.6,
      y: 1296.2,
    });
    assert.ok(lua.includes('tonumber(w.pid) == 1234'), 'pid matcher');
    assert.ok(lua.includes(`w.title == "${BANNER_WINDOW_TITLE}"`), 'title matcher');
    assert.ok(lua.includes('hl.dsp.window.move({ x = 1505, y = 1296, window = w })'), 'move rounded');
    assert.ok(lua.includes('hl.dsp.window.float({ window = w, action = "set" })'), 'float guard');
    // Возвращаемый статус: по нему фасад отличает реальное перемещение от промаха
    // (hyprctl eval всегда печатает "ok").
    assert.ok(lua.includes('local hit = false'), 'hit flag init');
    assert.ok(lua.includes('hit = true'), 'hit flag set on match');
    assert.ok(lua.includes('return hit and "moved" or "nomatch"'), 'status return');
    // hl.dsp.window.resize — молча no-op на 0.56, размер делает сам Electron setBounds.
    assert.ok(!lua.includes('resize'), 'no resize call');
    // Селекторы-строки ("address:...", "class:...") на 0.56 молча не срабатывают.
    assert.ok(!lua.includes('"address:'), 'must not use string selectors');
  });

  it('multiplies DIP coords by scaleFactor (physical px)', () => {
    const lua = buildHyprlandPositionLua({
      pid: 1,
      title: BANNER_WINDOW_TITLE,
      x: 100,
      y: 64,
      scaleFactor: 1.5,
    });
    assert.ok(lua.includes('move({ x = 150, y = 96, window = w })'), 'scaled coords');
  });

  it('treats bad scaleFactor as 1', () => {
    const lua = buildHyprlandPositionLua({
      pid: 1,
      title: BANNER_WINDOW_TITLE,
      x: 100,
      y: 64,
      scaleFactor: Number.NaN,
    });
    assert.ok(lua.includes('move({ x = 100, y = 64, window = w })'), 'unscaled');
  });

  it('escapes quotes in title', () => {
    const lua = buildHyprlandPositionLua({
      pid: 1,
      title: 'anix "quoted" \\ test',
      x: 0,
      y: 0,
    });
    assert.ok(lua.includes('w.title == "anix \\"quoted\\" \\\\ test"'), 'escaped title');
  });
});

describe('buildBannerRuleLua', () => {
  it('kills border/rounding/shadow/blur and animations for the banner title', () => {
    const lua = buildBannerRuleLua(BANNER_WINDOW_TITLE);
    assert.ok(lua.includes('name = "anix-banner"'), 'named rule');
    assert.ok(lua.includes(`match = { title = "^${BANNER_WINDOW_TITLE}$" }`), 'title matcher');
    assert.ok(lua.includes('border_size = 0'), 'no border');
    assert.ok(lua.includes('rounding = 0'), 'no rounding');
    assert.ok(lua.includes('no_shadow = true'), 'no shadow');
    assert.ok(lua.includes('no_blur = true'), 'no blur');
    assert.ok(lua.includes('no_anim = true'), 'no animations');
    assert.ok(lua.includes('no_initial_focus = true'), 'no initial focus steal');
    assert.ok(lua.includes('no_focus = true'), 'no focus');
  });
});
