import { navigate } from '../stores/navigation';

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export interface SearchFranchiseData {
  images: string[];
  name: string;
  releaseCount?: number;
  firstReleaseId?: number;
  relatedId?: number;
}

export function renderSearchFranchise(data: SearchFranchiseData): HTMLElement {
  if (!data.images.length && !data.name) {
    const stub = document.createElement('div');
    return stub;
  }

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'search-franchise';

  const thumbs = document.createElement('div');
  thumbs.className = 'search-franchise__thumbs';
  data.images.slice(0, 3).forEach((url) => {
    const div = document.createElement('div');
    div.className = 'search-franchise__thumb';
    div.style.backgroundImage = `url('${esc(url)}')`;
    thumbs.appendChild(div);
  });
  card.appendChild(thumbs);

  const contentEl = document.createElement('div');
  contentEl.className = 'search-franchise__content';
  const titleEl = document.createElement('span');
  titleEl.className = 'search-franchise__title';
  titleEl.textContent = data.name || 'Франшиза';
  const metaEl = document.createElement('span');
  metaEl.className = 'search-franchise__meta';
  if (typeof data.releaseCount === 'number' && data.releaseCount > 0) {
    metaEl.textContent = `${data.releaseCount} релизов во франшизе`;
  } else {
    metaEl.textContent = 'Релизы во франшизе';
  }
  contentEl.appendChild(titleEl);
  contentEl.appendChild(metaEl);
  card.appendChild(contentEl);

  const actionEl = document.createElement('span');
  actionEl.className = 'search-franchise__action';
  actionEl.textContent = 'Перейти';
  card.appendChild(actionEl);

  const targetId = typeof data.relatedId === 'number' ? data.relatedId : data.firstReleaseId;
  if (typeof targetId === 'number') {
    card.addEventListener('click', () => {
      navigate(`/release/${targetId}/related`);
    });
  }

  return card;
}

