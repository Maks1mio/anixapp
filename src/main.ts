import 'flag-icons/css/flag-icons.min.css';
import './styles/main.scss';
import { mount } from 'svelte';
import App from './App.svelte';
import { initRendererLogging } from './services/logger';
import './services/lobby-action-log';
import { initWebAnixApi } from './services/anix-api-web';
import { applyTvDefaults, isTvMode } from './platform/tv';
import { initTvNavigation } from './services/tv-navigation';

// Hirro Sans — only bundled for Android TV / TV dev builds (VITE_TV_MODE=1).
if (import.meta.env.VITE_TV_MODE === '1' || import.meta.env.VITE_TV_MODE === 'true') {
  import('./styles/fonts-tv.scss');
}

// Init renderer-side logging before anything else
initRendererLogging();

if (isTvMode()) {
  applyTvDefaults();
}

document.addEventListener('DOMContentLoaded', () => {
  void initWebAnixApi().finally(() => {
    if (isTvMode()) initTvNavigation();
    mount(App, { target: document.getElementById('app')! });
  });
});
