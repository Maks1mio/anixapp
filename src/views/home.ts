import { navigate } from '../app';

export function renderHome(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-home';

  wrap.innerHTML = `
    <section class="hero">
      <h1 class="hero__title">AnixApp</h1>
      <p class="hero__subtitle">Быстрый клиент для просмотра аниме на базе Anixart</p>
      <div class="hero__actions">
        <a href="/feed" class="btn btn-primary" data-nav>Открыть ленту</a>
        <button type="button" class="btn btn-secondary" id="random-release">Случайный релиз</button>
      </div>
    </section>
    <section class="quick-load" id="quick-load"></section>
  `;

  wrap.querySelector('#random-release')?.addEventListener('click', async () => {
    console.log('[home] random-release click');
    if (!window.anix) {
      console.log('[home] window.anix отсутствует, выход');
      return;
    }
    try {
      const data = await window.anix.getRandomRelease(true);
      const release = data?.release as { id?: number } | undefined;
      if (release?.id) navigate(`/release/${release.id}`);
      else console.log('[home] нет release.id в ответе', data);
    } catch (e) {
      console.error('[home] random-release error', e);
    }
  });

  wrap.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const a = el as HTMLAnchorElement;
      const href = a.getAttribute('href');
      console.log('[home] data-nav click', { href });
      if (a.href && href?.startsWith('/')) {
        e.preventDefault();
        navigate(href);
      }
    });
  });

  return wrap;
}
