'use strict';

/**
 * macOS: нативные кнопки окна («светофоры») вместо своих.
 *
 * Окно с titleBarStyle: 'hidden' на macOS сохраняет светофоры слева поверх контента.
 * Центрируем их по высоте кастомного тайтлбара (с учётом масштаба интерфейса)
 * и сообщаем рендереру о fullscreen — там светофоры скрыты и отступ под них не нужен.
 * На остальных платформах все функции — no-op.
 */

const isMac = process.platform === 'darwin';

const TRAFFIC_LIGHTS_X = 14;
const TRAFFIC_LIGHTS_HEIGHT = 14;
const DEFAULT_TITLEBAR_HEIGHT = 40;

/** @type {WeakMap<import('electron').BrowserWindow, number>} */
const titlebarHeights = new WeakMap();

function trafficLightPosition(titlebarHeight, zoomFactor = 1) {
  const barPx = titlebarHeight * zoomFactor;
  return {
    x: TRAFFIC_LIGHTS_X,
    y: Math.max(0, Math.round((barPx - TRAFFIC_LIGHTS_HEIGHT) / 2)),
  };
}

/** Опции BrowserWindow для окна с кастомным тайтлбаром высотой titlebarHeight (CSS px). */
function macTitleBarOptions(titlebarHeight = DEFAULT_TITLEBAR_HEIGHT) {
  if (!isMac) return {};
  return {
    titleBarStyle: 'hidden',
    trafficLightPosition: trafficLightPosition(titlebarHeight),
  };
}

/** Вызывать сразу после создания окна с macTitleBarOptions(). */
function setupMacWindow(win, titlebarHeight = DEFAULT_TITLEBAR_HEIGHT) {
  if (!isMac || !win || win.isDestroyed()) return;
  titlebarHeights.set(win, titlebarHeight);
  const sendFullscreen = (on) => {
    if (!win.isDestroyed()) win.webContents.send('window:fullscreen', on);
  };
  win.on('enter-full-screen', () => sendFullscreen(true));
  win.on('leave-full-screen', () => sendFullscreen(false));
  win.webContents.on('did-finish-load', () => sendFullscreen(win.isFullScreen()));
}

/** Масштаб интерфейса меняет высоту тайтлбара в px — держим светофоры по центру. */
function syncTrafficLights(win, zoomFactor) {
  if (!isMac || !win || win.isDestroyed()) return;
  const height = titlebarHeights.get(win);
  if (!height) return;
  try {
    win.setWindowButtonPosition(trafficLightPosition(height, zoomFactor));
  } catch (_) {}
}

module.exports = { isMac, macTitleBarOptions, setupMacWindow, syncTrafficLights };
