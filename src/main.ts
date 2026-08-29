import 'flag-icons/css/flag-icons.min.css';
import './styles/main.scss';
import { mount } from 'svelte';
import App from './App.svelte';
import { initRendererLogging } from './services/logger';
import './services/lobby-action-log';
import { initWebAnixApi } from './services/anix-api-web';
import { applyTvDefaults, isTvMode } from './platform/tv';
import { initTvNavigation } from './services/tv-navigation';

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
