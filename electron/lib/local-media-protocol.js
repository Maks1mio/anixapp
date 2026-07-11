'use strict';

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { protocol } = require('electron');

function registerLocalMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'anix-local',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function guessVideoMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mkv') return 'video/x-matroska';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.m4v') return 'video/x-m4v';
  return 'video/mp4';
}

/**
 * @param {() => string} getDownloadRoot
 * @param {{ error?: (tag: string, msg: string) => void } | null} logger
 */
function setupLocalMediaProtocol(getDownloadRoot, logger) {
  protocol.handle('anix-local', async (request) => {
    try {
      const reqUrl = new URL(request.url);
      const encoded = reqUrl.searchParams.get('p');
      if (!encoded) return new Response('Bad Request', { status: 400 });

      let filePath = decodeURIComponent(encoded);
      if (process.platform === 'win32') {
        filePath = filePath.replace(/\//g, '\\');
      }

      const resolved = path.resolve(filePath);
      const root = path.resolve(getDownloadRoot() || '');
      const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
      if (!root || !norm(resolved).startsWith(norm(root))) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!fs.existsSync(resolved)) {
        return new Response('Not Found', { status: 404 });
      }

      const stat = fs.statSync(resolved);
      if (!stat.isFile()) return new Response('Forbidden', { status: 403 });

      const mime = guessVideoMime(resolved);
      const size = stat.size;
      const rangeHeader = request.headers.get('Range');

      if (rangeHeader) {
        const parts = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
        if (!parts) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
        }
        const start = parseInt(parts[1], 10);
        const end = parts[2] ? parseInt(parts[2], 10) : size - 1;
        if (Number.isNaN(start) || start >= size || end >= size || start > end) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
        }
        const chunkSize = end - start + 1;
        const nodeStream = fs.createReadStream(resolved, { start, end });
        const webStream = Readable.toWeb(nodeStream);
        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }

      const nodeStream = fs.createReadStream(resolved);
      const webStream = Readable.toWeb(nodeStream);
      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
        },
      });
    } catch (err) {
      if (logger) logger.error('local-media', err?.message ?? err);
      return new Response('Internal Error', { status: 500 });
    }
  });
}

module.exports = { registerLocalMediaScheme, setupLocalMediaProtocol };
