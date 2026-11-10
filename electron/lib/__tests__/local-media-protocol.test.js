'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { isPathInside } = require('../safe-path');

const filename = path.resolve(__dirname, '../local-media-protocol.js');
const source = fs.readFileSync(filename, 'utf8');
const localRequire = createRequire(filename);
const fixtures = [];

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    assert.ok(isPathInside(os.tmpdir(), root));
    assert.ok(path.basename(root).startsWith('anix-local-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function protocol() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anix-local-test-'));
  fixtures.push(root);
  let handler;
  const context = vm.createContext({
    require: (id) => id === 'electron'
      ? { protocol: { handle: (_, callback) => { handler = callback; } } }
      : localRequire(id),
    module: { exports: {} }, process, URL, Response,
  });
  vm.runInContext(source, context, { filename });
  context.module.exports.setupLocalMediaProtocol(() => root, null);
  const read = (file, headers = {}) => handler(new Request(
    `anix-local://play/?p=${encodeURIComponent(file.replace(/\\/g, '/'))}`,
    { headers },
  ));
  return { root, read };
}

describe('local media protocol', () => {
  it('serves a saved poster with the correct MIME type without API or network access', async () => {
    const { root, read } = protocol();
    const file = path.join(root, '.anixapp-poster.jpg');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    fs.writeFileSync(file, jpeg);
    const result = await read(file);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('Content-Type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), jpeg);
  });

  it('preserves range requests for seeking downloaded videos', async () => {
    const { root, read } = protocol();
    const file = path.join(root, 'episode.mp4');
    fs.writeFileSync(file, Buffer.from('0123456789'));
    const result = await read(file, { Range: 'bytes=2-5' });
    assert.equal(result.status, 206);
    assert.equal(result.headers.get('Content-Type'), 'video/mp4');
    assert.equal(result.headers.get('Content-Range'), 'bytes 2-5/10');
    assert.equal(await result.text(), '2345');
    assert.equal((await read(file, { Range: 'bytes=99-100' })).status, 416);
  });

  it('decodes Cyrillic, spaces and percent sequences exactly once', async () => {
    const { root, read } = protocol();
    const file = path.join(root, 'Серия 100% %20.mp4');
    fs.writeFileSync(file, 'local-video');
    const result = await read(file);
    assert.equal(result.status, 200);
    assert.equal(await result.text(), 'local-video');
  });

  it('rejects outside paths and handles missing files', async () => {
    const { root, read } = protocol();
    assert.equal((await read(path.join(root, '..', 'outside.mp4'))).status, 403);
    assert.equal((await read(path.join(root, 'missing.mp4'))).status, 404);
  });
});
