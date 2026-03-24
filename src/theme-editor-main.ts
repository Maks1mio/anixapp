import './styles/theme-editor.scss';
import { renderThemeEditor } from './views/theme-editor';
import { initTheme } from './services/themes';
import { initTooltipSystem } from './utils/body-tooltip';

initTheme();

const app = document.getElementById('app');
if (app) {
  app.appendChild(renderThemeEditor());
}

document.addEventListener('DOMContentLoaded', () => initTooltipSystem(), { once: true });
if (document.readyState !== 'loading') initTooltipSystem();
