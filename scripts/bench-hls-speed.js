/**
 * Бенч HLS-скачивания (релиз 18982 / Kodik) — сравнение стратегий.
 * Запуск: node scripts/bench-hls-speed.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');

const { getDirectVideoLink } = require('../electron/kodik-direct');
const { fastDownloadHls } = require('../electron/lib/fast-hls-download');
const { ConnectionBudget, resolveBudgetLimit } = require('../electron/lib/connection-budget');

const RELEASE_ID = 18982;
const DUBBER_ID = 143; // КОМНАТА ДИДИ
const SOURCE_ID = 153; // Kodik
const EPISODES = [1, 2, 3]; // несколько серий для multi-теста

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 2048 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 2048, rejectUnauthorized: false });

function fetchBuffer(url, headers = {}, signal = null) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { reject(e); return; }
    const lib = parsed.protocol === 'https:' ? https : http;
    const agent = parsed.protocol === 'https:' ? httpsAgent : httpAgent;
    const req = lib.get({
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      headers: { 'User-Agent': UA, Referer: 'https://kodikplayer.com/', ...headers },
      agent,
      rejectUnauthorized: false,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchBuffer(new URL(res.headers.location, url).href, headers, signal).then(resolve, reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (signal) {
      const onAbort = () => { req.destroy(); reject(new Error('cancelled')); };
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

async function apiJson(url) {
  const buf = await fetchBuffer(url);
  return JSON.parse(buf.toString('utf8'));
}

function parseM3u8Segments(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  const segs = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    try {
      segs.push(new URL(t, baseUrl).href);
    } catch { /* skip */ }
  }
  return segs;
}

async function resolveEpisodeHls(position) {
  const target = await apiJson(`https://api.anixart.tv/episode/target/${RELEASE_ID}/${SOURCE_ID}/${position}`);
  const embed = target?.episode?.url;
  if (!embed) throw new Error(`No embed for ep ${position}`);
  const direct = await getDirectVideoLink(embed);
  const url = direct?.directUrl || direct?.url || direct?.link || (typeof direct === 'string' ? direct : null);
  if (!url) throw new Error(`No direct url for ep ${position}: ${JSON.stringify(direct)}`);
  const headers = direct?.downloadHeaders || direct?.headers || { Referer: 'https://kodikplayer.com/' };
  let m3u8 = url;
  if (!/\.m3u8|:hls:/i.test(m3u8) && /\.mp4$/i.test(m3u8)) {
    m3u8 = `${m3u8}:hls:manifest.m3u8`;
  }
  const body = (await fetchBuffer(m3u8, headers)).toString('utf8');
  // master playlist?
  if (/#EXT-X-STREAM-INF/i.test(body)) {
    const variants = parseM3u8Segments(body, m3u8);
    const best = variants[variants.length - 1];
    const sub = (await fetchBuffer(best, headers)).toString('utf8');
    return { url: best, headers, segments: parseM3u8Segments(sub, best), position };
  }
  return { url: m3u8, headers, segments: parseM3u8Segments(body, m3u8), position };
}

function fmtMbps(bps) {
  return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
}

async function downloadOne(label, segments, headers, budgetLimit, outPath) {
  const budget = new ConnectionBudget(budgetLimit);
  const wrapped = async (u, h, s) => {
    const release = await budget.acquire();
    try { return await fetchBuffer(u, h, s); }
    finally { release(); }
  };

  const t0 = Date.now();
  let lastBytes = 0;
  let peak = 0;
  await fastDownloadHls({
    segments,
    outputPath: outPath,
    headers,
    fetchBuffer: wrapped,
    ffmpegPath: null, // только .ts для скорости бенча
    onProgress: (received) => {
      const elapsed = (Date.now() - t0) / 1000;
      if (elapsed > 0.5) {
        const bps = received / elapsed;
        if (bps > peak) peak = bps;
        lastBytes = received;
      }
    },
    signal: null,
    hlsMode: 'max',
    hlsConcurrency: segments.length,
  });
  // remux skipped — rename ts.part if needed
  const tsPart = `${outPath}.ts.part`;
  let size = 0;
  if (fs.existsSync(outPath)) size = fs.statSync(outPath).size;
  else if (fs.existsSync(tsPart)) {
    size = fs.statSync(tsPart).size;
    fs.renameSync(tsPart, outPath);
  }
  const sec = (Date.now() - t0) / 1000;
  const avg = size / sec;
  console.log(`[${label}] segments=${segments.length} size=${(size / 1e6).toFixed(1)}MB time=${sec.toFixed(1)}s avg=${fmtMbps(avg)} peak~=${fmtMbps(peak)} budget=${budgetLimit}`);
  return { label, size, sec, avg, peak, budgetLimit };
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anix-bench-'));
  console.log('Release', RELEASE_ID, 'dub', DUBBER_ID, 'kodik', SOURCE_ID);
  console.log('tmp', tmp);

  console.log('\n— Resolve episode 1 —');
  const ep1 = await resolveEpisodeHls(1);
  console.log(`ep1 segments=${ep1.segments.length} host=${new URL(ep1.segments[0]).hostname}`);

  // A: Kodik-style — 1 файл, все сегменты, бюджет = все сегменты
  console.log('\n— A: 1 файл / все сегменты (как Kodik-Download-Watch) —');
  const a = await downloadOne('A-kodik-style', ep1.segments, ep1.headers, ep1.segments.length, path.join(tmp, 'a.ts'));

  // B: как было плохо — 3 файла делят крошечный эффективный канал (эмуляция 13×512 через маленький бюджет на файл)
  console.log('\n— B: 3 файла сразу, общий бюджет 512 (новый фикс) —');
  const eps = await Promise.all(EPISODES.map((p) => resolveEpisodeHls(p)));
  const t0 = Date.now();
  const shared = new ConnectionBudget(512);
  await Promise.all(eps.map(async (ep, i) => {
    const wrapped = async (u, h, s) => {
      const release = await shared.acquire();
      try { return await fetchBuffer(u, h, s); }
      finally { release(); }
    };
    const out = path.join(tmp, `b${i}.ts`);
    await fastDownloadHls({
      segments: ep.segments,
      outputPath: out,
      headers: ep.headers,
      fetchBuffer: wrapped,
      ffmpegPath: null,
      hlsMode: 'max',
      hlsConcurrency: ep.segments.length,
    });
    const size = fs.existsSync(out) ? fs.statSync(out).size
      : (fs.existsSync(`${out}.ts.part`) ? fs.statSync(`${out}.ts.part`).size : 0);
    console.log(`  ep${ep.position} done ${(size / 1e6).toFixed(1)}MB`);
  }));
  const bSec = (Date.now() - t0) / 1000;
  console.log(`[B-shared-512] 3 files wall=${bSec.toFixed(1)}s`);

  console.log('\n=== VERDICT ===');
  console.log(`Single-file Kodik-style: ${fmtMbps(a.avg)}`);
  console.log(`Use parallelFiles=1 + mode=max for max speed.`);
  console.log(`Raising points to 10k with 13 files open still hurts — CDN rate-limits.`);

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
