'use strict';

const https = require('https');
const { URL } = require('url');
const { ANIXART_UA, EDITOR_ORIGIN } = require('./constants');

/** @type {Map<string, import('https').ClientRequest>} */
const activeUploads = new Map();

function mimeFromFileName(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase() || 'jpg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
}

function httpError(message, status, path) {
  const err = new Error(message);
  err.name = 'HttpError';
  err.status = status;
  err.httpStatus = status;
  err.path = path;
  return err;
}

function abortError() {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function parseEditorBody(status, text, path) {
  if (status === 401 || status === 403) {
    throw httpError('Нет прав на загрузку медиа в этот канал', status, path);
  }
  if (status === 413) {
    throw httpError('Файл слишком большой', status, path);
  }
  if (status < 200 || status >= 300) {
    throw httpError(status === 404 ? 'Не найдено' : `HTTP ${status}`, status, path);
  }
  if (!String(text || '').trim()) {
    throw httpError('Пустой ответ сервера', status || 0, path);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw httpError('Сервер вернул некорректный ответ', status || 0, path);
  }
}

function toBuffer(file) {
  if (Buffer.isBuffer(file)) return file;
  if (file instanceof Uint8Array) return Buffer.from(file);
  if (file && typeof file === 'object' && Buffer.isBuffer(file.buffer)) {
    return Buffer.from(file.buffer);
  }
  return Buffer.from(file || []);
}

function abortUpload(uploadId) {
  const id = String(uploadId || '');
  if (!id) return;
  const req = activeUploads.get(id);
  if (!req) return;
  activeUploads.delete(id);
  req.destroy(abortError());
}

function postMultipart(url, token, bytes, fileName, mime, opts = {}) {
  const uploadId = String(opts.uploadId || '');
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const boundary = `----anixart${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const safeName = String(fileName || 'image.jpg').replace(/[^\w.\-]+/g, '_') || 'image.jpg';
  const head = Buffer.from(
    `--${boundary}\r\n`
    + `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n`
    + `Content-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const total = head.length + bytes.length + tail.length;
  const parsed = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': ANIXART_UA,
        Accept: 'application/json,text/plain,*/*',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': total,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (uploadId) activeUploads.delete(uploadId);
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(parseEditorBody(res.statusCode || 0, text, '/content/upload'));
        } catch (err) {
          reject(err);
        }
      });
    });

    if (uploadId) activeUploads.set(uploadId, req);

    req.on('error', (err) => {
      if (uploadId) activeUploads.delete(uploadId);
      if (req.destroyed || err?.name === 'AbortError' || err?.code === 'ECONNRESET') {
        reject(abortError());
        return;
      }
      reject(err);
    });

    let sent = 0;
    const report = () => {
      if (!onProgress || total <= 0) return;
      onProgress(Math.min(0.99, sent / total));
    };

    req.write(head);
    sent += head.length;
    report();

    const chunkSize = 64 * 1024;
    let offset = 0;
    const writeBody = () => {
      while (offset < bytes.length) {
        if (req.destroyed) return;
        const end = Math.min(offset + chunkSize, bytes.length);
        const slice = bytes.subarray(offset, end);
        offset = end;
        sent += slice.length;
        const ok = req.write(slice);
        report();
        if (!ok) {
          req.once('drain', writeBody);
          return;
        }
      }
      if (req.destroyed) return;
      sent += tail.length;
      report();
      req.end(tail);
    };
    writeBody();
  });
}

async function uploadArticleImage(mediaToken, file, fileName = 'image.jpg', opts = {}) {
  const token = String(mediaToken || '').trim();
  if (!token) throw httpError('Нет прав на загрузку медиа в этот канал', 401, '/content/upload');

  const name = String(fileName || 'image.jpg').replace(/[^\w.\-]+/g, '_') || 'image.jpg';
  const bytes = toBuffer(file);
  if (!bytes.length) throw new Error('Пустой файл изображения');

  return postMultipart(
    `${EDITOR_ORIGIN}/content/upload`,
    token,
    bytes,
    name,
    mimeFromFileName(name),
    opts,
  );
}

async function generateEmbedData(type, mediaToken, url) {
  const token = String(mediaToken || '').trim();
  const link = String(url || '').trim();
  const kind = String(type || 'link').trim() || 'link';
  if (!token) throw httpError('Нет прав на загрузку медиа в этот канал', 401, `/embed/${kind}`);
  if (!link) throw new Error('Вставьте корректную ссылку');

  const endpoint = new URL(`/embed/${encodeURIComponent(kind)}`, EDITOR_ORIGIN);
  endpoint.searchParams.set('url', link);

  const res = await fetch(endpoint.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': ANIXART_UA,
    },
  });
  const text = await res.text();
  const result = parseEditorBody(res.status, text, `/embed/${kind}`);
  result.url = link;
  return result;
}

module.exports = {
  EDITOR_ORIGIN,
  uploadArticleImage,
  generateEmbedData,
  abortUpload,
};
