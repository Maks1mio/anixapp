#!/usr/bin/env node
/**
 * Probe OP/ED skip timestamps from Anixart episode payloads and player pages.
 * Tests only — does not change the player.
 *
 * Usage: node scripts/probe-skip-timecodes.mjs [id ...]
 * Default: 17419 1605 20290 1387
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { Anixart } = require('anixapi');
const { attachLegacyEndpoints } = require('../electron/anix-legacy-endpoints.js');

const RELEASE_IDS = (process.argv.slice(2).map(Number).filter(Boolean).length
  ? process.argv.slice(2).map(Number).filter(Boolean)
  : [17419, 1605, 20290, 1387]);

const cfgPath = path.join(os.homedir(), '.anixapp', 'web-config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const client = attachLegacyEndpoints(new Anixart({
  baseUrl: cfg.baseUrl || 'https://api-s.anixsekai.com',
  token: cfg.token || undefined,
}));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function hostOf(url) {
  try { return new URL(url.startsWith('http') ? url : `https:${url}`).hostname; } catch { return '?'; }
}

function playerKind(url) {
  const h = hostOf(url).toLowerCase();
  const u = String(url).toLowerCase();
  if (/kodik|aniqit|anixis|aniqart/.test(h)) return 'kodik';
  if (/anilib|libria/.test(h) || /anilibria|aniliberty/.test(u)) return 'anilibria';
  if (/sibnet/.test(h)) return 'sibnet';
  if (/ok\.ru|okcdn/.test(h)) return 'ok';
  if (/vk\.com|vkvideo|userapi|vkuservideo/.test(h)) return 'vk';
  if (/rutube/.test(h)) return 'rutube';
  if (/studiomir/.test(h)) return 'studiomir';
  if (/collaps|cdnvideohub|allohavideo|allo/.test(h)) return 'collaps';
  if (/myvi/.test(h)) return 'myvi';
  return h.split('.').slice(-2).join('.') || 'other';
}

function fmtSec(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const s = Math.round(Number(n));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')} (${s}s)`;
}

function rangeFromUnknown(v) {
  if (v == null) return null;
  if (Array.isArray(v) && v.length >= 2) {
    const a = Number(v[0]);
    const b = Number(v[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a && b > 0) return { start: a, end: b };
    return null;
  }
  if (typeof v === 'object') {
    const start = Number(v.start ?? v.from ?? v.begin ?? v.t ?? v.startTime);
    const end = Number(v.stop ?? v.end ?? v.to ?? v.finish ?? (v.t != null && v.d != null ? Number(v.t) + Number(v.d) : undefined) ?? v.endTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && end > 0) return { start, end };
  }
  return null;
}

function looksSkipKey(k) {
  return /^(skip|opening|ending|intro|outro|op|ed|skip_opening|skip_ending|skipOpening|skipEnding|preroll|credits)$/i.test(k);
}

function collectSkipHits(value, path, out, depth = 0) {
  if (value == null || depth > 8) return;
  if (Array.isArray(value)) {
    if (path.split('.').pop() && looksSkipKey(path.split('.').pop()) && rangeFromUnknown(value)) {
      out.push({ path, range: rangeFromUnknown(value), raw: value });
    }
    return;
  }
  if (typeof value !== 'object') return;
  const keys = Object.keys(value);
  const opening = rangeFromUnknown(value.opening ?? value.intro ?? value.op ?? value.skip_opening);
  const ending = rangeFromUnknown(value.ending ?? value.outro ?? value.ed ?? value.skip_ending);
  if (opening || ending) {
    out.push({ path, opening, ending, raw: { opening: value.opening, ending: value.ending } });
  }
  const skipWrap = value.skip;
  if (skipWrap && typeof skipWrap === 'object' && !Array.isArray(skipWrap)) {
    collectSkipHits(skipWrap, path ? `${path}.skip` : 'skip', out, depth + 1);
  }
  for (const k of keys) {
    if (k === 'links' || k === 'advert' || k === 'ads') continue;
    if (looksSkipKey(k) && rangeFromUnknown(value[k])) {
      out.push({ path: path ? `${path}.${k}` : k, range: rangeFromUnknown(value[k]), raw: value[k] });
    }
    if (value[k] && typeof value[k] === 'object') {
      collectSkipHits(value[k], path ? `${path}.${k}` : k, out, depth + 1);
    }
  }
}

function pickBestSkip(hits) {
  const opening = hits.map((h) => h.opening || (h.path?.match(/open|intro|\.op$/i) ? h.range : null)).find(Boolean) || null;
  const ending = hits.map((h) => h.ending || (h.path?.match(/end|outro|\.ed$/i) ? h.range : null)).find(Boolean) || null;
  return { opening, ending, hits };
}

async function fetchText(url, headers = {}) {
  const abs = url.startsWith('http') ? url : `https:${url}`;
  const res = await fetch(abs, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*', ...headers },
    redirect: 'follow',
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text, finalUrl: res.url };
}

function parseKodikLink(url) {
  const m = String(url).match(/\/(seria|video|movie|anime)\/(\d+)\/([0-9a-f]+)\//i);
  if (!m) return null;
  return { type: m[1], id: m[2], hash: m[3] };
}

function parseKodikFromHtml(html) {
  return {
    hash: html.match(/\w+\.hash\s=\s'([^']+)';/)?.[1],
    id: html.match(/\w+\.id\s=\s'([^']+)';/)?.[1],
    type: html.match(/\w+\.type\s=\s'([^']+)';/)?.[1],
  };
}

function extractJsonSnippets(html) {
  const snippets = [];
  const re = /(?:skip|opening|ending|intro|outro)\s*[:=]\s*(\{[\s\S]{0,1200}?\}|\[[\s\S]{0,200}?\])/gi;
  let m;
  while ((m = re.exec(html))) snippets.push({ around: m[0].slice(0, 240), json: m[1] });
  return snippets;
}

function parseClock(str) {
  const p = String(str).trim().split(':').map(Number);
  if (p.some((n) => !Number.isFinite(n))) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  if (p.length === 1) return p[0];
  return null;
}

/** Kodik: parseSkipButton("1:49-3:19,23:32-25:13", "anime") — 1-й интервал OP, 2-й ED. */
function parseKodikSkipButton(html) {
  const m = html.match(/parseSkipButton\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)/);
  if (!m) return { opening: null, ending: null, raw: null };
  const raw = m[1].trim();
  if (!raw) return { opening: null, ending: null, raw: '' };
  const ranges = raw.split(',').map((part) => {
    const [a, b] = part.split('-').map((x) => parseClock(x));
    if (a == null || b == null || b <= a) return null;
    return { start: a, end: b };
  }).filter(Boolean);
  if (ranges.length >= 2) {
    return { opening: ranges[0], ending: ranges[1], raw };
  }
  if (ranges.length === 1) {
    const only = ranges[0];
    if (only.start >= 600) return { opening: null, ending: only, raw };
    return { opening: only, ending: null, raw };
  }
  return { opening: null, ending: null, raw };
}

function skipFromHtml(html) {
  const hits = [];
  const kodikBtn = parseKodikSkipButton(html);
  if (kodikBtn.opening || kodikBtn.ending) {
    hits.push({ path: 'parseSkipButton', opening: kodikBtn.opening, ending: kodikBtn.ending, raw: kodikBtn.raw });
  }
  for (const snip of extractJsonSnippets(html)) {
    try {
      const parsed = JSON.parse(snip.json.replace(/'/g, '"'));
      collectSkipHits(parsed, 'html', hits);
      const r = rangeFromUnknown(parsed);
      if (r) hits.push({ path: 'html.range', range: r, raw: parsed });
    } catch { /* ignore */ }
  }
  const kv = html.match(/videoInfo\s*=\s*(\{[\s\S]{0,8000}?\})\s*;/);
  if (kv) {
    try { collectSkipHits(JSON.parse(kv[1]), 'videoInfo', hits); } catch { /* ignore */ }
  }
  return pickBestSkip(hits);
}

async function probeKodik(embedUrl) {
  const page = await fetchText(embedUrl, { Referer: 'https://kodikplayer.com/' });
  const htmlSkip = skipFromHtml(page.text);
  let info = parseKodikLink(page.finalUrl || embedUrl) || parseKodikFromHtml(page.text);
  let ftorKeys = [];
  let ftorSkip = { opening: null, ending: null, hits: [] };
  if (info?.type && info?.hash && info?.id) {
    const ftorUrl = `https://kodikplayer.com/ftor?${new URLSearchParams({ type: info.type, hash: info.hash, id: info.id })}`;
    try {
      const ftor = await fetchText(ftorUrl, { Referer: page.finalUrl || embedUrl, Accept: 'application/json' });
      const json = JSON.parse(ftor.text);
      ftorKeys = Object.keys(json || {}).filter((k) => k !== 'links');
      collectSkipHits(json, 'ftor', ftorSkip.hits);
      ftorSkip = pickBestSkip(ftorSkip.hits);
      if (!htmlSkip.opening && !htmlSkip.ending && (ftorSkip.opening || ftorSkip.ending)) {
        return { source: 'kodik.ftor', keys: ftorKeys, ...ftorSkip, htmlStatus: page.status };
      }
    } catch (e) {
      ftorKeys = [`ftor-error:${e.message}`];
    }
  }
  return {
    source: htmlSkip.opening || htmlSkip.ending ? 'kodik.parseSkipButton' : 'kodik.none',
    keys: ftorKeys,
    opening: htmlSkip.opening || ftorSkip.opening,
    ending: htmlSkip.ending || ftorSkip.ending,
    htmlStatus: page.status,
    htmlHits: htmlSkip.hits.length,
    snippets: htmlSkip.hits?.[0]?.raw
      ? [String(htmlSkip.hits[0].raw)]
      : extractJsonSnippets(page.text).slice(0, 3).map((s) => s.around),
  };
}

async function probeAnilibria(embedUrl) {
  const id = String(embedUrl).match(/id=(\d+)/)?.[1];
  const ep = String(embedUrl).match(/ep=(\d+)/)?.[1];
  if (!id) return { source: 'anilibria.parse-fail' };
  const hosts = ['anilibria.top', 'aniliberty.top', 'anilibria.tv'];
  for (const host of hosts) {
    try {
      const res = await fetchText(`https://${host}/api/v1/anime/releases/${id}`, { Accept: 'application/json' });
      if (!res.ok) continue;
      const body = JSON.parse(res.text);
      const episodes = body.episodes || [];
      const item = episodes.find((e) => String(e.ordinal) === String(ep)) || episodes[0];
      if (!item) continue;
      const opening = rangeFromUnknown(item.opening);
      const ending = rangeFromUnknown(item.ending);
      return {
        source: `anilibria.${host}`,
        opening,
        ending,
        episodeKeys: Object.keys(item),
        ordinal: item.ordinal,
      };
    } catch {
      /* next host */
    }
  }
  return { source: 'anilibria.unreachable' };
}

async function probeGenericHtml(embedUrl, kind) {
  try {
    const page = await fetchText(embedUrl);
    const skip = skipFromHtml(page.text);
    const lower = page.text.toLowerCase();
    const mentions = ['skip', 'opening', 'ending', 'intro', 'outro', 'таймкод', 'опенинг', 'эндинг']
      .filter((w) => lower.includes(w));
    return {
      source: `${kind}.html`,
      htmlStatus: page.status,
      opening: skip.opening,
      ending: skip.ending,
      mentions,
      snippets: extractJsonSnippets(page.text).slice(0, 2).map((s) => s.around),
    };
  } catch (e) {
    return { source: `${kind}.error`, error: e.message };
  }
}

function summarizeAnixartEpisode(ep) {
  if (!ep || typeof ep !== 'object') return [];
  return Object.keys(ep).filter((k) => /skip|open|end|intro|outro|time/i.test(k));
}

function fmtRange(r) {
  if (!r) return '—';
  return `${fmtSec(r.start)} → ${fmtSec(r.end)}`;
}

async function probeEmbed(url) {
  const kind = playerKind(url);
  if (kind === 'kodik') return probeKodik(url);
  if (kind === 'anilibria') return probeAnilibria(url);
  return probeGenericHtml(url, kind);
}

const rows = [];
let anixartSkipKeysSeen = new Set();

for (const releaseId of RELEASE_IDS) {
  let title = `#${releaseId}`;
  try {
    const info = await client.endpoints.release.info(releaseId, false);
    title = info?.release?.title_ru || info?.release?.title || title;
  } catch { /* keep id */ }

  const dubRes = await client.endpoints.release.getDubbers(releaseId);
  const types = dubRes?.types ?? [];
  console.log(`\n=== ${releaseId} «${title}» — ${types.length} озвучек ===`);

  for (const dub of types) {
    let sources = [];
    try {
      const srcRes = await client.endpoints.release.getDubberSources(releaseId, dub.id);
      sources = srcRes?.sources ?? [];
    } catch (e) {
      console.log(`  [FAIL] ${dub.name} sources: ${e.message}`);
      continue;
    }
    for (const src of sources) {
      let episodes = [];
      try {
        const listRes = await client.endpoints.release.getEpisodes(releaseId, dub.id, src.id, 1);
        episodes = (listRes.episodes || []).filter((e) => e?.url);
      } catch (e) {
        rows.push({ releaseId, title, dub: dub.name, src: src.name, kind: '?', ep: '?', skip: 'error', detail: e.message });
        continue;
      }
      if (!episodes.length) {
        rows.push({ releaseId, title, dub: dub.name, src: src.name, kind: 'stub', ep: '—', skip: 'no-url', detail: 'Anixart stub' });
        continue;
      }
      const sample = [episodes[0], episodes[Math.min(1, episodes.length - 1)], episodes[Math.min(4, episodes.length - 1)]]
        .filter((e, i, a) => a.findIndex((x) => x.position === e.position) === i)
        .slice(0, 2);

      for (const ep of sample) {
        for (const k of summarizeAnixartEpisode(ep)) anixartSkipKeysSeen.add(k);
        const kind = playerKind(ep.url);
        let result;
        try {
          result = await probeEmbed(ep.url);
        } catch (e) {
          result = { source: 'throw', error: e.message };
        }
        const has = !!(result.opening || result.ending);
        const line = {
          releaseId,
          title,
          dub: dub.name,
          src: src.name,
          kind,
          ep: ep.position,
          skip: has ? 'YES' : 'no',
          op: fmtRange(result.opening),
          ed: fmtRange(result.ending),
          from: result.source,
          extra: result.episodeKeys?.join(',') || result.keys?.join(',') || result.mentions?.join(',') || result.error || '',
        };
        rows.push(line);
        const mark = has ? 'YES' : ' no';
        console.log(`  [${mark}] ${dub.name} / ${src.name}  ep${ep.position}  ${kind}  OP ${line.op}  ED ${line.ed}  ← ${result.source}`);
        if (!has && result.snippets?.length) {
          console.log(`         html: ${result.snippets[0].replace(/\s+/g, ' ').slice(0, 180)}`);
        }
      }
    }
  }
}

const yes = rows.filter((r) => r.skip === 'YES');
const byKind = {};
for (const r of rows) {
  byKind[r.kind] ??= { total: 0, yes: 0 };
  byKind[r.kind].total += 1;
  if (r.skip === 'YES') byKind[r.kind].yes += 1;
}

console.log('\n========== SUMMARY ==========');
console.log(`Anixart episode skip-like keys: ${[...anixartSkipKeysSeen].join(', ') || '(none)'}`);
console.log('By player:');
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].yes - a[1].yes || b[1].total - a[1].total)) {
  console.log(`  ${k.padEnd(16)} ${v.yes}/${v.total} with OP/ED`);
}
console.log(`Hits: ${yes.length}/${rows.length}`);

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'probe-skip-timecodes.last.json');
fs.writeFileSync(outPath, JSON.stringify({ anixartSkipKeysSeen: [...anixartSkipKeysSeen], byKind, rows }, null, 2));
console.log(`Wrote ${outPath}`);
