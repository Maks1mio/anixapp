import { navigate } from '../app';
import type { FeedArticle } from '../types/feed';
import { buildPosterUrl } from '../utils/posterUrl';

export function renderFeed(page: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-feed';

  wrap.innerHTML = `
    <div class="feed-header">
      <h1 class="feed-title">Лента</h1>
      <p class="feed-page">Страница ${page}</p>
    </div>
    <div class="feed-list" id="feed-list">
      <div class="feed-loading">Загрузка…</div>
    </div>
    <div class="feed-pagination" id="feed-pagination"></div>
  `;

  const listEl = wrap.querySelector('#feed-list') as HTMLElement;
  const paginationEl = wrap.querySelector('#feed-pagination') as HTMLElement;

  if (!window.anix) {
    listEl.innerHTML = '<p class="feed-error">API недоступно (только в Electron).</p>';
    return wrap;
  }

  window.anix
    .getLatestFeed(page)
    .then((data) => {
      console.log('[Anix API] getLatestFeed', data);
      const content = (data?.content ?? []) as FeedArticle[];
      listEl.innerHTML = '';
      if (content.length === 0) {
        listEl.innerHTML = '<p class="feed-empty">Нет записей.</p>';
        return;
      }
      content.forEach((article) => {
        listEl.appendChild(renderFeedCard(article));
      });
      renderPagination(paginationEl, page, content.length >= 20);
    })
    .catch((err) => {
      listEl.innerHTML = `<p class="feed-error">Ошибка: ${String(err)}</p>`;
    });

  return wrap;
}

function renderFeedCard(article: FeedArticle): HTMLElement {
  const card = document.createElement('article');
  card.className = 'feed-card';
  const release = article.release;
  const id = release?.id;
  const title = release?.titleRu || release?.titleEn || 'Без названия';
  const posterRaw = release?.poster?.medium?.url || release?.poster?.small?.url || '';
  const poster = buildPosterUrl(posterRaw);

  card.innerHTML = `
    <a href="/release/${id}" class="feed-card__link" data-release-id="${id}">
      <div class="feed-card__poster">
        ${poster ? `<img src="${poster}" alt="" loading="lazy" />` : '<div class="feed-card__no-poster"></div>'}
      </div>
      <div class="feed-card__info">
        <h3 class="feed-card__title">${escapeHtml(title)}</h3>
      </div>
    </a>
  `;

  card.querySelector('a')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (id) navigate(`/release/${id}`);
  });

  return card;
}

function renderPagination(container: HTMLElement, currentPage: number, hasMore: boolean): void {
  container.innerHTML = '';
  if (currentPage > 1) {
    const prev = document.createElement('a');
    prev.href = `/feed?page=${currentPage - 1}`;
    prev.className = 'btn btn-secondary';
    prev.textContent = '← Назад';
    prev.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(`/feed?page=${currentPage - 1}`);
    });
    container.appendChild(prev);
  }
  if (hasMore) {
    const next = document.createElement('a');
    next.href = `/feed?page=${currentPage + 1}`;
    next.className = 'btn btn-primary';
    next.textContent = 'Вперёд →';
    next.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(`/feed?page=${currentPage + 1}`);
    });
    container.appendChild(next);
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
