import './styles/main.scss';
import './styles/player-titlebar.scss';
import './services/lobby-action-log';
import { installWindowFluo } from './fluo';
import { mount } from 'svelte';
import PlayerApp from './PlayerApp.svelte';

installWindowFluo();

document.addEventListener('DOMContentLoaded', () => {
  mount(PlayerApp, { target: document.getElementById('app')! });
});
