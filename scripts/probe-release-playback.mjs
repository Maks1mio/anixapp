#!/usr/bin/env node
/**
 * Probe playback URL resolution for a release (default: Anixart test title 17419).
 * Usage: node scripts/probe-release-playback.mjs [releaseId]
 */
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { Anixart } = require('anixapi');
const { attachLegacyEndpoints } = require('../electron/anix-legacy-endpoints.js');
const { getDirectVideoLink, isHtmlPlayerPage } = require('../electron/lib/direct-video-link.js');

const RELEASE_ID = Number(process.argv[2] || 17419);
const cfgPath = path.join(os.homedir(), '.anixapp', 'web-config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const client = attachLegacyEndpoints(new Anixart({
  baseUrl: cfg.baseUrl || 'https://api-s.anixsekai.com',
  token: cfg.token || undefined,
}));

function hostOf(url) {
  try { return new URL(url).host; } catch { return '?'; }
}

function kind(url) {
  if (!url) return 'empty';
  if (isHtmlPlayerPage(url)) return 'embed-html';
  if (/\.m3u8|\:hls:/i.test(url)) return 'hls';
  if (/\.(mp4|mkv|webm)(\?|$)/i.test(url)) return 'file';
  return 'stream';
}

async function headOk(url, headers = {}) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1', ...headers },
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, ct: ct.slice(0, 40), ok: res.status < 400 && !/text\/html/i.test(ct) };
  } catch (e) {
    return { status: 0, ct: '', ok: false, error: e.message };
  }
}

const dubRes = await client.endpoints.release.getDubbers(RELEASE_ID);
const types = dubRes?.types ?? [];
console.log(`release ${RELEASE_ID}: ${types.length} dubbers`);

const rows = [];
for (const dub of types) {
  const srcRes = await client.endpoints.release.getDubberSources(RELEASE_ID, dub.id);
  const sources = srcRes?.sources ?? [];
  for (const src of sources) {
    let ep;
    try {
      const listRes = await client.endpoints.release.getEpisodes(RELEASE_ID, dub.id, src.id, 1);
      ep = (listRes.episodes || []).find((e) => e?.url);
    } catch (e) {
      rows.push({ dub: dub.name, src: src.name, playable: false, embedHost: '?', http: e.message });
      console.log(`[FAIL] ${dub.name} / ${src.name}  error  ${e.message}`);
      continue;
    }
    const embed = ep?.url || '';
    const iframe = !!ep?.iframe;
    if (!embed) {
      rows.push({ dub: dub.name, src: src.name, playable: true, skipped: true, embedHost: '?', http: 'no-url (Anixart stub)' });
      console.log(`[SKIP] ${dub.name} / ${src.name}  no episode url (stub)`);
      continue;
    }
    const t0 = Date.now();
    const resolved = embed ? await getDirectVideoLink(embed) : { directUrl: null };
    const ms = Date.now() - t0;
    const direct = resolved?.directUrl || null;
    let probe = { ok: iframe && !direct, status: iframe ? 'iframe' : 0, ct: '' };
    if (direct) {
      probe = await headOk(direct, resolved.downloadHeaders || {});
    }
    const iframeOk = !!(embed && (iframe || isHtmlPlayerPage(embed)));
    const playable = !!(direct && probe.ok) || iframeOk;
    rows.push({
      dub: dub.name,
      src: src.name,
      iframe,
      embedHost: hostOf(embed),
      directHost: direct ? hostOf(direct) : '',
      kind: direct ? kind(direct) : (iframeOk ? 'iframe' : kind(embed)),
      ms,
      playable,
      http: direct ? `${probe.status} ${probe.ct}` : (iframeOk ? 'iframe' : (embed ? 'unresolved' : 'no-url')),
    });
    const mark = playable ? 'OK' : 'FAIL';
    console.log(`[${mark}] ${dub.name} / ${src.name}  ${rows[rows.length - 1].kind}  ${ms}ms  ${rows[rows.length - 1].http}`);
  }
}

const ok = rows.filter((r) => r.playable).length;
const fail = rows.filter((r) => !r.playable);
console.log(`\nplayable ${ok}/${rows.length}`);
if (fail.length) {
  console.log('failures:');
  for (const f of fail) console.log(`  - ${f.dub} / ${f.src} (${f.embedHost}) ${f.http}`);
  process.exitCode = 1;
}
