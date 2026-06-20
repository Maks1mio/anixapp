import 'flag-icons/css/flag-icons.min.css';
import './styles/main.scss';
import { mount } from 'svelte';
import App from './App.svelte';
import { initRendererLogging } from './services/logger';

// Init renderer-side logging before anything else
initRendererLogging();

document.addEventListener('DOMContentLoaded', () => {
  mount(App, { target: document.getElementById('app')! });
});
