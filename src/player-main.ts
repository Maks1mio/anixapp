import './styles/main.scss';
import './styles/player-titlebar.scss';
import { mount } from 'svelte';
import PlayerApp from './PlayerApp.svelte';

document.addEventListener('DOMContentLoaded', () => {
  mount(PlayerApp, { target: document.getElementById('app')! });
});
