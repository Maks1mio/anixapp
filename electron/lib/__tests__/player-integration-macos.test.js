'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileURLToPath } = require('url');

// В plain node require('electron') отдаёт строку — подменяем app.getPath для .m3u.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anix-players-'));
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: { app: { getPath: () => tmpDir } },
};

const { darwinCandidates } = require('../player-integration/detect');
const iina = require('../player-integration/players/iina');
const quicktime = require('../player-integration/players/quicktime');

const PLAYLIST = [
  { title: 'Серия 1', url: 'https://cdn.example/1.m3u8' },
  { title: 'Серия 2', url: 'https://cdn.example/2.m3u8' },
  { title: 'Серия 3', url: 'https://cdn.example/3.m3u8' },
];

function readM3uFromIinaUrl(iinaUrl) {
  const parsed = new URL(iinaUrl);
  return fs.readFileSync(fileURLToPath(parsed.searchParams.get('url')), 'utf8');
}

describe('darwinCandidates', () => {
  const realPlatform = process.platform;
  before(() => Object.defineProperty(process, 'platform', { value: 'darwin' }));
  after(() => Object.defineProperty(process, 'platform', { value: realPlatform }));

  it('ищет приложение в системных и пользовательских «Программах»', () => {
    assert.deepEqual(darwinCandidates('iina', '/Users/u'), [
      '/Applications/IINA.app/Contents/MacOS/IINA',
      '/Users/u/Applications/IINA.app/Contents/MacOS/IINA',
      '/System/Applications/IINA.app/Contents/MacOS/IINA',
    ]);
  });

  it('находит QuickTime в /System/Applications', () => {
    assert.ok(darwinCandidates('quicktime', '/Users/u')
      .includes('/System/Applications/QuickTime Player.app/Contents/MacOS/QuickTime Player'));
  });

  it('для mpv добавляет Homebrew', () => {
    const list = darwinCandidates('mpv', '/Users/u');
    assert.ok(list.includes('/opt/homebrew/bin/mpv'));
    assert.ok(list.includes('/usr/local/bin/mpv'));
  });

  it('неизвестный плеер — пусто', () => {
    assert.deepEqual(darwinCandidates('potplayer', '/Users/u'), []);
  });
});

describe('iina.buildLaunchArgs', () => {
  it('открывает через iina://open, текущая серия первой', () => {
    const { executable, args } = iina.buildLaunchArgs({
      url: PLAYLIST[1].url,
      playlist: PLAYLIST,
      startIndex: 1,
      referer: 'https://kodikplayer.com/',
      userAgent: 'Mozilla/5.0 (Macintosh)',
    });
    assert.equal(executable, '/usr/bin/open');
    assert.equal(args.length, 1);
    assert.ok(args[0].startsWith('iina://open?'));

    const parsed = new URL(args[0]);
    assert.equal(parsed.searchParams.get('mpv_referrer'), 'https://kodikplayer.com/');
    assert.equal(parsed.searchParams.get('mpv_ytdl'), 'no');
    // Пробелы — %20, а не «+»: IINA «+» не декодирует.
    assert.ok(args[0].includes('mpv_user-agent=Mozilla%2F5.0%20(Macintosh)'));

    const urls = readM3uFromIinaUrl(args[0]).split('\n').filter((l) => l.startsWith('https://'));
    assert.deepEqual(urls, [PLAYLIST[1].url, PLAYLIST[2].url, PLAYLIST[0].url]);
  });

  it('одна серия без плейлиста', () => {
    const { args } = iina.buildLaunchArgs({ url: 'https://cdn.example/x.mp4', title: 'Фильм' });
    const body = readM3uFromIinaUrl(args[0]);
    assert.ok(body.includes('#EXTINF:-1,Фильм'));
    assert.ok(body.includes('https://cdn.example/x.mp4'));
    assert.ok(!args[0].includes('mpv_referrer'));
  });

  it('без ссылки — invalid-url', () => {
    assert.throws(() => iina.buildLaunchArgs({ url: 'file:///etc/passwd' }), { code: 'invalid-url' });
  });
});

describe('quicktime.buildLaunchArgs', () => {
  it('открывает текущую серию через open -b', () => {
    const { executable, args } = quicktime.buildLaunchArgs({
      url: PLAYLIST[2].url,
      playlist: PLAYLIST,
      startIndex: 2,
    });
    assert.equal(executable, '/usr/bin/open');
    assert.deepEqual(args, ['-b', 'com.apple.QuickTimePlayerX', PLAYLIST[2].url]);
  });

  it('без url берёт серию по startIndex', () => {
    const { args } = quicktime.buildLaunchArgs({ playlist: PLAYLIST, startIndex: 1 });
    assert.equal(args[2], PLAYLIST[1].url);
  });

  it('без ссылки — invalid-url', () => {
    assert.throws(() => quicktime.buildLaunchArgs({ url: 'javascript:alert(1)' }), { code: 'invalid-url' });
  });
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
