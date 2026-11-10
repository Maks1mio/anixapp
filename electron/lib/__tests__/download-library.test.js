'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { isPathInside } = require('../safe-path');

const mediaPath = path.resolve(__dirname, '../../services/media.js');
const mediaSource = fs.readFileSync(mediaPath, 'utf8');
const mediaRequire = createRequire(mediaPath);
const fixtures = [];

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    assert.ok(isPathInside(os.tmpdir(), root));
    assert.ok(path.basename(root).startsWith('anix-library-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** Реальные временные файлы; Electron, CDN и очередь заменены управляемыми адаптерами. */
function library({ extra = false, failPoster = false, failDelete = false, posters = true } = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'anix-library-test-'));
  fixtures.push(fixture);
  const root = path.join(fixture, 'primary');
  const secondary = path.join(fixture, 'secondary');
  fs.mkdirSync(root);
  if (extra) fs.mkdirSync(secondary);
  const handlers = new Map();
  const active = new Set();
  const stats = { fetches: 0, updates: 0, queued: 0 };
  const image = { isEmpty: () => false, getSize: () => ({ width: 300 }), toJPEG: () => Buffer.from('jpeg-fixture') };
  const config = {
    getDownloadSpeedLimitMBps: () => 0,
    getRawConfig: () => ({ downloadDirectory: root, downloadLibraryDirs: extra ? [secondary] : [] }),
    getDownloadOrganizeByTitle: () => true,
    getDownloadPosters: () => posters,
  };
  const mocks = {
    fs: { ...fs, rmSync(file, options) {
      if (failDelete && isPathInside(secondary, file)) throw new Error('EACCES fixture');
      return fs.rmSync(file, options);
    } },
    electron: {
      ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
      app: { getPath: () => fixture },
      nativeImage: {
        createFromBuffer: () => image,
        createFromPath: (file) => ({ isEmpty: () => fs.readFileSync(file, 'utf8') !== 'jpeg-fixture' }),
      },
    },
    '../cdn-proxy': {
      isAnixartCdnUrl: () => true,
      fetchRemoteImage: async () => {
        stats.fetches++;
        if (failPoster) throw new Error('offline fixture');
        return { data: Buffer.from('jpeg-fixture') };
      },
    },
    '../lib/config-store': config,
    '../lib/app-state': { mainWindow: { webContents: { send: () => { stats.updates++; } } } },
    '../lib/download-queue': {
      getActiveDownloadPaths: () => active,
      getActiveDownloadArtifacts: () => new Set([...active].flatMap((p) => [p, p + '.anixdl', p + '.part'])),
      setProgressSink() {},
      setStreamingHoldSink() {},
      enqueue: (input) => { stats.queued++; return { ...input, id: 'job' }; },
    },
    '../lib/download-throttle': { setLimit() {} },
    '../lib/library-migrate': { migrateLibraryLayout() {} },
  };
  const realModules = new Set(['path', 'child_process', '../lib/safe-path', '../lib/download-meta']);
  const context = vm.createContext({
    require: (id) => mocks[id] || (realModules.has(id) ? mediaRequire(id) : {}),
    module: { exports: {} }, console, process, Buffer, URL,
  });
  vm.runInContext(mediaSource, context, { filename: mediaPath });
  context.module.exports.register({
    getAnixart: () => ({ endpoints: { release: { info: async () => ({ release: { poster: 'fixture-hash' } }) } } }),
  });
  const call = (key, data) => handlers.get(key)({}, data);
  const video = (relative, where = root) => {
    const file = path.join(where, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.alloc(300 * 1024));
    return file;
  };
  return { root, secondary, active, stats, call, video };
}

describe('download library posters', () => {
  it('rejects a flat group even when an unrelated empty directory has the same name', async () => {
    const s = library();
    const file = s.video('Flat sample 01.mp4');
    const group = s.call('downloads:listLibrary')[0];
    fs.mkdirSync(path.join(s.root, group.name));
    assert.equal(group.hasOwnFolder, false);
    const result = await s.call('downloads:savePoster', { groupId: group.id, releaseId: 1 });
    assert.equal(result.error, 'no-folder');
    assert.equal(s.stats.fetches, 0);
    assert.ok(fs.existsSync(file));
  });

  it('saves an old folder poster, associates the chosen release and avoids duplicate downloads', async () => {
    const s = library();
    s.video('Title/Voice/Source/01.mp4');
    const group = s.call('downloads:listLibrary')[0];
    assert.equal(group.hasOwnFolder, true);
    assert.equal(group.posterUrl, undefined);
    assert.equal((await s.call('downloads:savePoster', { groupId: 'Title', releaseId: 7 })).ok, true);
    const refreshed = s.call('downloads:listLibrary')[0];
    assert.ok(refreshed.posterUrl.startsWith('anix-local:'));
    assert.equal(refreshed.releaseId, 7);
    assert.equal((await s.call('downloads:savePoster', { groupId: 'Title' })).ok, true);
    assert.equal(s.stats.fetches, 1);
    assert.equal(s.stats.updates, 1);
  });

  it('allows retrying an invalid saved image', async () => {
    const s = library();
    s.video('Title/01.mp4');
    fs.writeFileSync(path.join(s.root, 'Title/.anixapp-poster.jpg'), 'invalid');
    assert.equal(s.call('downloads:listLibrary')[0].posterUrl, undefined);
    assert.equal((await s.call('downloads:savePoster', { groupId: 'Title', releaseId: 4 })).ok, true);
    assert.ok(s.call('downloads:listLibrary')[0].posterUrl);
  });

  it('does not damage episodes when metadata is missing or the CDN is unavailable', async () => {
    const s = library({ failPoster: true });
    const file = s.video('Title/01.mp4');
    assert.equal((await s.call('downloads:savePoster', { groupId: 'Title' })).error, 'missing-release');
    assert.equal((await s.call('downloads:savePoster', { groupId: 'Title', releaseId: 4 })).ok, false);
    assert.ok(fs.existsSync(file));
    assert.equal(s.call('downloads:listLibrary')[0].posterUrl, undefined);
  });

  for (const posters of [true, false]) {
    it(`keeps episode queueing working with posters ${posters ? 'enabled' : 'disabled'}`, async () => {
      const s = library({ posters });
      const result = await s.call('episode-download:queue', {
        items: [{ url: 'https://video.example/01.mp4', filename: '01.mp4', folder: 'Title/Voice/Source', releaseId: 3 }],
      });
      await new Promise(setImmediate);
      assert.equal(result.ok, true);
      assert.equal(s.stats.queued, 1);
      assert.equal(s.stats.fetches, posters ? 1 : 0);
      assert.equal(fs.existsSync(path.join(s.root, 'Title/.anixapp-poster.jpg')), posters);
    });
  }
});

describe('download library deletion', () => {
  it('deletes flat files and sidecars while preserving other titles and the root', () => {
    const s = library();
    const file = s.video('Flat sample 01.mp4');
    const other = s.video('Other show 01.mp4');
    fs.writeFileSync(file + '.anixskip', '{}');
    const group = s.call('downloads:listLibrary').find((g) => g.files.some((f) => f.path === file));
    assert.equal(s.call('downloads:deleteGroup', group.id).ok, true);
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(file + '.anixskip'), false);
    assert.ok(fs.existsSync(other));
    assert.ok(fs.existsSync(s.root));
  });

  it('uses the actual directory name without truncation and removes its poster', () => {
    const s = library();
    const title = 'A'.repeat(130);
    s.video(title + '/01.mp4');
    fs.writeFileSync(path.join(s.root, title, '.anixapp-poster.jpg'), 'jpeg-fixture');
    assert.equal(s.call('downloads:deleteGroup', title).ok, true);
    assert.equal(fs.existsSync(path.join(s.root, title)), false);
    assert.ok(fs.existsSync(s.root));
  });

  it('preserves active episodes and their sidecars', () => {
    const s = library();
    const completed = s.video('Title/Voice/Source/01.mp4');
    const active = s.video('Title/Voice/Source/02.mp4');
    fs.writeFileSync(active + '.anixdl', '{}');
    s.active.add(active);
    assert.equal(s.call('downloads:deleteGroup', 'Title').ok, true);
    assert.equal(fs.existsSync(completed), false);
    assert.ok(fs.existsSync(active));
    assert.ok(fs.existsSync(active + '.anixdl'));
  });

  for (const failDelete of [false, true]) {
    it(`handles multiple roots with ${failDelete ? 'a visible partial failure' : 'successful deletion'}`, () => {
      const s = library({ extra: true, failDelete });
      s.video('Title/01.mp4');
      const file = s.video('Title/02.mp4', s.secondary);
      assert.equal(s.call('downloads:deleteGroup', 'Title').ok, !failDelete);
      assert.equal(fs.existsSync(path.join(s.root, 'Title')), false);
      assert.equal(fs.existsSync(file), failDelete);
    });
  }

  it('rejects traversal and does not affect files outside the library', async () => {
    const s = library();
    const outside = path.join(path.dirname(s.root), 'protected.mp4');
    fs.writeFileSync(outside, 'preserve');
    assert.equal(s.call('downloads:deleteGroup', '../protected.mp4').ok, false);
    assert.equal((await s.call('downloads:savePoster', { groupId: '../', releaseId: 3 })).ok, false);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'preserve');
  });
});
