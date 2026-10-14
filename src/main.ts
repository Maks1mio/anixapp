import './styles/main.scss';
import { mount } from 'svelte';
import App from './App.svelte';
import './services/lobby-action-log';
import { installWindowFluo } from './fluo';
import { initWebAnixApi } from './services/anix-api-web';
import { applyTvDefaults, isTvMode } from './platform/tv';
import { applyMobileDefaults, isMobileMode } from './platform/mobile';
import { initTvNavigation } from './services/tv-navigation';
import { startDebugMetrics } from './services/debug-metrics';
import { initWebGpuAvailability } from './utils/webgpu-availability.svelte';

void import('flag-icons/css/flag-icons.min.css');

installWindowFluo();

if (isMobileMode()) {
  applyMobileDefaults();
}

if (isTvMode()) {
  // Страница пары для телефона (?ref=…) — обычный мобильный размер шрифта,
  // TV-масштаб 1920×1080 на телефоне сделал бы текст нечитаемым.
  const isPairPage = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('ref');
  if (!isPairPage) {
    applyTvDefaults();
    startDebugMetrics();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // WebGPU не блокирует первый кадр — probe в фоне (Anime4K / плеер подхватят статус).
  void initWebGpuAvailability();

  void initWebAnixApi()
    .catch(() => false)
    .finally(() => {
      if (isTvMode()) initTvNavigation();
      mount(App, { target: document.getElementById('app')! });
    });
});
