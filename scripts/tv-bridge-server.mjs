/**
 * Production bridge for tv.anixapp.com:
 * - POST /__anix/invoke  (Kodik direct link resolve via Node)
 * - GET  /__anix/media   (CDN/HLS proxy with Referer)
 * - GET  /__anix/health
 *
 * Usage:
 *   node scripts/tv-bridge-server.mjs
 * Env:
 *   ANIXAPP_TV_BRIDGE_PORT (default 8790)
 *   ANIXAPP_TV_BRIDGE_HOST (default 127.0.0.1)
 */
import http from 'node:http';
import { createAnixBridgeInstance, createBridgeRequestHandler } from '../vite/anix-web-bridge-plugin.mjs';

const host = process.env.ANIXAPP_TV_BRIDGE_HOST || '127.0.0.1';
const port = Number.parseInt(process.env.ANIXAPP_TV_BRIDGE_PORT || '8790', 10);

const bridge = createAnixBridgeInstance({
  configPath: process.env.ANIXAPP_TV_BRIDGE_CONFIG,
  userDataPath: process.env.ANIXAPP_TV_BRIDGE_DATA,
});

const handler = createBridgeRequestHandler(bridge);

const server = http.createServer((req, res) => {
  handler(req, res, () => {
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    }
  });
});

server.on('error', (err) => {
  console.error('[tv-bridge] server error:', err?.message || err);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`[tv-bridge] listening on http://${host}:${port}`);
  console.log(`[tv-bridge] config: ${bridge.configPath}`);
});

function shutdown(signal) {
  console.log(`[tv-bridge] ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
