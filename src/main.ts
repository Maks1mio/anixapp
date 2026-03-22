import './styles/main.scss';
import { mount } from 'svelte';
import App from './App.svelte';
import { initRendererLogging } from './services/logger';

// Init renderer-side logging before anything else
initRendererLogging();

function initClickLogging(): void {
  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase() ?? '';
      const id = t?.id ?? '';
      const cls = t?.className?.toString().slice(0, 80) ?? '';
      const href = (t?.closest?.('a') as HTMLAnchorElement)?.getAttribute?.('href') ?? '';
      const dataNav = t?.closest?.('[data-nav]') ? 'data-nav' : '';
      console.log('[click]', { tag, id: id || undefined, class: cls || undefined, href: href || undefined, dataNav: dataNav || undefined, defaultPrevented: e.defaultPrevented });
    },
    true
  );
}

document.addEventListener('DOMContentLoaded', () => {
  initClickLogging();
  mount(App, { target: document.getElementById('app')! });
});
