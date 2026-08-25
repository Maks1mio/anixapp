/**
 * Короткий бенч пропускной способности Kodik CDN (релиз 18982).
 * Сравнивает: 1 файл / все сегменты vs 13 «воркеров» делят канал.
 */
'use strict';

const http = require('http');
const https = require('https');
const { getDirectVideoLink } = require('../electron/kodik-direct');
const { ConnectionBudget } = require('../electron/lib/connection-budget');

const RELEASE = 18982;
const SOURCE = 153;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const DURATION_MS = 20000;

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 2048, rejectUnauthorized: false });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 2048 });

function fetchBuffer(url, headers = {}) {
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
      timeout: 20000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchBuffer(new URL(res.headers.location, url).href, headers).then(resolve, reject);
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
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function apiJson(url) {
  return JSON.parse((await fetchBuffer(url)).toString('utf8'));
}

function parseSegs(text, base) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => new URL(l, base).href);
}

async function resolveEp(pos) {
  const target = await apiJson(`https://api.anixart.tv/episode/target/${RELEASE}/${SOURCE}/${pos}`);
  const direct = await getDirectVideoLink(target.episode.url);
  const url = direct.directUrl;
  const headers = direct.downloadHeaders || {};
  let body = (await fetchBuffer(url, headers)).toString('utf8');
  let base = url;
  if (/#EXT-X-STREAM-INF/i.test(body)) {
    const vars = parseSegs(body, url);
    base = vars[vars.length - 1];
    body = (await fetchBuffer(base, headers)).toString('utf8');
  }
  return { segments: parseSegs(body, base), headers, pos };
}

async function hammer(label, episodes, budgetLimit, workersPerFile) {
  const budget = new ConnectionBudget(budgetLimit);
  let bytes = 0;
  let ok = 0;
  let fail = 0;
  const stopAt = Date.now() + DURATION_MS;
  const cursors = episodes.map(() => 0);

  async function worker(epIdx) {
    const ep = episodes[epIdx];
    while (Date.now() < stopAt) {
      const i = cursors[epIdx]++;
      if (i >= ep.segments.length) cursors[epIdx] = 0;
      const url = ep.segments[cursors[epIdx] % ep.segments.length];
      const release = await budget.acquire();
      try {
        const buf = await fetchBuffer(url, ep.headers);
        bytes += buf.length;
        ok += 1;
      } catch {
        fail += 1;
      } finally {
        release();
      }
    }
  }

  const workers = [];
  for (let e = 0; e < episodes.length; e++) {
    for (let w = 0; w < workersPerFile; w++) workers.push(worker(e));
  }
  const t0 = Date.now();
  await Promise.all(workers);
  const sec = (Date.now() - t0) / 1000;
  const mbps = bytes / sec / (1024 * 1024);
  console.log(
    `[${label}] files=${episodes.length} workers/file=${workersPerFile} budget=${budgetLimit} `
    + `→ ${mbps.toFixed(2)} MB/s  ok=${ok} fail=${fail} bytes=${(bytes / 1e6).toFixed(1)}MB`,
  );
  return mbps;
}

async function main() {
  console.log(`Bench ${DURATION_MS / 1000}s on release ${RELEASE} Kodik…\n`);
  const ep1 = await resolveEp(1);
  console.log(`ep1 segments=${ep1.segments.length}`);

  const multi = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((p) => resolveEp(p)));
  console.log(`resolved ${multi.length} episodes\n`);

  const a = await hammer('A Kodik-style 1file×all', [ep1], ep1.segments.length, ep1.segments.length);
  const b = await hammer('B 13files×512 no shared', multi, 13 * 512, 512);
  const c = await hammer('C 13files shared budget 512', multi, 512, 64);
  const d = await hammer('D 2files shared budget 512', multi.slice(0, 2), 512, 256);

  console.log('\n=== Итог ===');
  console.log(`A (как Kodik, 1 файл):     ${a.toFixed(2)} MB/s`);
  console.log(`B (13×512 без лимита):     ${b.toFixed(2)} MB/s  ← твой скрин ~0.2`);
  console.log(`C (13 файлов, бюджет 512): ${c.toFixed(2)} MB/s`);
  console.log(`D (2 файла, бюджет 512):   ${d.toFixed(2)} MB/s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
