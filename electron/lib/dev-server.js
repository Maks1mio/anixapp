'use strict';

/** Vite dev server origin for Electron windows (desktop 5173, TV 5174). */
function getDevServerOrigin() {
  const port = process.env.ANIXAPP_DEV_PORT
    || (process.env.ANIXAPP_TV === '1' ? '5174' : '5173');
  return `http://127.0.0.1:${port}`;
}

function getDevServerPort() {
  const raw = process.env.ANIXAPP_DEV_PORT
    || (process.env.ANIXAPP_TV === '1' ? '5174' : '5173');
  return Number(raw) || 5173;
}

module.exports = { getDevServerOrigin, getDevServerPort };
