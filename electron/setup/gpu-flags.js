'use strict';

const { app } = require('electron');
const config = require('../lib/config-store');

function applyGpuFlags() {
  if (!config.getAdaptiveAcceleration()) {
    app.disableHardwareAcceleration();
  }

  if (process.platform !== 'win32') {
    app.commandLine.appendSwitch('disable-gpu-vsync');
  }
  app.commandLine.appendSwitch('enable-zero-copy');

  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  }

  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-unsafe-webgpu');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('enable-features', 'Vulkan,UseVulkanForDisplay,WebGPUService');
  }
}

module.exports = { applyGpuFlags };
