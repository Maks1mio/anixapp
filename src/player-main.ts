import './styles/main.scss';
import './styles/player-titlebar.scss';
import './services/lobby-action-log';
import { installWindowFluo } from './fluo';
import { mount } from 'svelte';
import PlayerApp from './PlayerApp.svelte';
import { initWebGpuAvailability } from './utils/webgpu-availability.svelte';

installWindowFluo();

document.addEventListener('DOMContentLoaded', () => {
  // PC player — отдельное окно; без probe Anime4K всегда «Нет WebGPU».
  void initWebGpuAvailability();
  mount(PlayerApp, { target: document.getElementById('app')! });
});
