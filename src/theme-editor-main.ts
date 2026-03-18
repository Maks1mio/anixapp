import './styles/theme-editor.scss';
import { renderThemeEditor } from './views/theme-editor';
import { initTheme } from './services/themes';

initTheme();

const app = document.getElementById('app');
if (app) {
  app.appendChild(renderThemeEditor());
}
