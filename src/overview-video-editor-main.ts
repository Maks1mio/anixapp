import './styles/overview-video-editor.scss';
import { mount } from 'svelte';
import OverviewVideoEditor from './views/Admin/OverviewVideoEditor.svelte';
import { initTheme } from './services/themes';

initTheme();

const appEl = document.getElementById('app');
if (appEl) {
  mount(OverviewVideoEditor, { target: appEl });
}
