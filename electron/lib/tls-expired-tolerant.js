'use strict';

const https = require('https');
const tls = require('tls');
const { X509Certificate } = require('crypto');

/**
 * Некоторые CDN (solodcdn, anixart CDN) отдают просроченный Let's Encrypt.
 * Раньше для них отключали проверку целиком (rejectUnauthorized:false), и подменённый
 * сертификат при MITM тоже принимался. Здесь игнорируется только срок действия:
 * цепочка до доверенного корня, подписи и имя хоста проверяются как обычно.
 */

const DATE_ERRORS = new Set(['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID']);

let rootCache = null;
function getRoots() {
  if (!rootCache) {
    rootCache = [];
    for (const pem of tls.rootCertificates) {
      try { rootCache.push(new X509Certificate(pem)); } catch (_) { /* skip broken root */ }
    }
  }
  return rootCache;
}

function peerChain(socket) {
  const chain = [];
  let cert = socket.getPeerCertificate(true);
  while (cert && cert.raw && !chain.some((c) => c.raw.equals(cert.raw))) {
    chain.push(cert);
    cert = cert.issuerCertificate;
  }
  return chain.map((c) => new X509Certificate(c.raw));
}

function isIssuedBy(cert, issuer) {
  return issuer.ca && cert.checkIssued(issuer) && cert.verify(issuer.publicKey);
}

function spki(cert) {
  return cert.publicKey.export({ type: 'spki', format: 'der' });
}

function isSameAnchor(cert, root) {
  return cert.raw.equals(root.raw) || (cert.subject === root.subject && spki(cert).equals(spki(root)));
}

/** @returns {Error|null} */
function verifyIgnoringDates(socket, servername) {
  if (socket.authorized) return null;
  const code = String(socket.authorizationError || '');
  if (!DATE_ERRORS.has(code)) {
    return Object.assign(new Error(`TLS certificate rejected: ${code}`), { code });
  }
  // authorizationError — лишь последняя ошибка OpenSSL, поэтому цепочку проверяем сами.
  let chain;
  try { chain = peerChain(socket); } catch (e) { return e; }
  if (!chain.length) return Object.assign(new Error('TLS: no peer certificate'), { code });

  for (let i = 0; i < chain.length - 1; i += 1) {
    if (!isIssuedBy(chain[i], chain[i + 1])) {
      return Object.assign(new Error('TLS: broken certificate chain'), { code: 'CERT_CHAIN_INVALID' });
    }
  }
  // Якорь — любой сертификат цепочки, совпадающий с корнем по имени и ключу
  // (кросс-подписанные корни: COMODO/AddTrust, ISRG/DST) или подписанный корнем.
  const roots = getRoots();
  const trusted = chain.some((cert) => roots.some((root) => isSameAnchor(cert, root) || isIssuedBy(cert, root)));
  if (!trusted) {
    return Object.assign(new Error('TLS: untrusted certificate chain'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' });
  }
  const host = servername || '';
  const identityErr = tls.checkServerIdentity(host, socket.getPeerCertificate());
  return identityErr || null;
}

class ExpiredCertTolerantAgent extends https.Agent {
  constructor(opts = {}) {
    // Без кэша сессий: проверка ниже должна выполняться на каждом рукопожатии.
    super({ ...opts, maxCachedSessions: 0 });
  }

  createConnection(options, oncreate) {
    const servername = options.servername || options.host || options.hostname;
    const socket = tls.connect({ ...options, servername, rejectUnauthorized: false });
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      socket.removeListener('error', done);
      if (err) {
        socket.destroy();
        oncreate(err);
        return;
      }
      oncreate(null, socket);
    };
    socket.once('secureConnect', () => {
      let err;
      try { err = verifyIgnoringDates(socket, servername); } catch (e) { err = e; }
      done(err || null);
    });
    socket.once('error', done);
    // Сокет отдаём http только после проверки — запрос не уйдёт на подменённый хост.
    return undefined;
  }
}

module.exports = { ExpiredCertTolerantAgent, verifyIgnoringDates };
