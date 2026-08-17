'use strict';

const { app } = require('electron');
const config = require('../lib/config-store');

function isLinuxWayland() {
  if (process.platform !== 'linux') return false;
  const session = String(process.env.XDG_SESSION_TYPE || '').toLowerCase();
  if (session === 'x11') return false;
  if (session === 'wayland') return true;
  return Boolean(process.env.WAYLAND_DISPLAY);
}

function applyGpuFlags() {
  if (!config.getAdaptiveAcceleration()) {
    app.disableHardwareAcceleration();
  }

  if (process.platform !== 'win32') {
    app.commandLine.appendSwitch('disable-gpu-vsync');
  }

  const wayland = isLinuxWayland();

  // DMA-BUF zero-copy overlays fail on Intel Arc + Ozone/Wayland:
  // video plays (audio OK) but the frame stays white.
  if (!wayland) {
    app.commandLine.appendSwitch('enable-zero-copy');
  }

  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  }

  if (process.platform === 'linux') {
    // Native Wayland — X11/XWayland mis-scales on HiDPI (Matebook / fractional scale).
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    app.commandLine.appendSwitch('enable-unsafe-webgpu');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');

    if (wayland) {
      // Chromium: '--ozone-platform=wayland' is not compatible with Vulkan.
      // Vulkan display → CompoundImageBacking / Skia → white video surface.
      app.commandLine.appendSwitch(
        'disable-features',
        'Vulkan,UseVulkanForDisplay,DefaultANGLEVulkan,VulkanFromANGLE',
      );
      app.commandLine.appendSwitch('enable-features', 'WebGPUService');
    } else {
      app.commandLine.appendSwitch('enable-features', 'Vulkan,UseVulkanForDisplay,WebGPUService');
    }
  }
}

module.exports = { applyGpuFlags };
