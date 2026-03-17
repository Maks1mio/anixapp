import { navigate } from '../app';
import { renderReleaseCardHorizontal } from '../components/release-card-h';
import { iconFlag } from '../components/icons';
import type { ReleaseCardData } from '../types/release';

const POSTER_BASE = 'https://s.anixmirai.com/posters';

function buildPosterUrl(value: string | undefined): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return undefined;
  if (v.startsWith('http')) return v;
  const id = v.endsWith('.jpg') || v.endsWith('.png') ? v : `${v}.jpg`;
  return `${POSTER_BASE}/${id}`;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatDate(ts: number): string {
  const date = new Date(ts * 1000);
  const day = date.getDate();
  const months = 'янв. февр. мар. апр. май июн. июл. авг. сен. окт. нояб. дек.'.split(' ');
  const month = months[date.getMonth()];
  const h = date.getHours();
  const m = date.getMinutes();
  return `${day} ${month} в ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
  const p = raw.poster as Record<string, { url?: string }> | undefined;
  const posterRaw =
    p?.original?.url ?? p?.medium?.url ?? p?.small?.url ?? (typeof raw.poster === 'string' ? raw.poster : undefined) ?? (typeof raw.image === 'string' ? raw.image : undefined);
  const poster = posterRaw ? buildPosterUrl(posterRaw) : undefined;
  const grade = typeof raw.grade === 'number' ? raw.grade : undefined;
  const statusObj = raw.status as { name?: string } | undefined;
  const categoryObj = raw.category as { name?: string } | undefined;
  const profileListStatus = typeof raw.profile_list_status === 'number' ? raw.profile_list_status : undefined;
  let listStatus: ReleaseCardData['listStatus'];
  switch (profileListStatus) {
    case 1: listStatus = 'watching'; break;
    case 2: listStatus = 'planned'; break;
    case 3: listStatus = 'completed'; break;
    case 4: listStatus = 'on_hold'; break;
    case 5: listStatus = 'dropped'; break;
    default: listStatus = undefined;
  }
  return {
    id: raw.id as number | undefined,
    titleRu: (raw.title_ru ?? raw.titleRu) as string | undefined,
    titleEn: (raw.title_original ?? raw.titleEn) as string | undefined,
    titleAlt: (raw.title_alt as string) || undefined,
    description: (raw.description as string) || undefined,
    poster: poster || undefined,
    rating: grade,
    voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : undefined,
    episodesReleased: typeof raw.episodes_released === 'number' ? raw.episodes_released : undefined,
    episodesTotal: typeof raw.episodes_total === 'number' ? raw.episodes_total : undefined,
    year: typeof raw.year === 'string' ? raw.year : (typeof raw.year === 'number' ? String(raw.year) : undefined),
    country: (raw.country as string) || undefined,
    genres: (raw.genres as string) || undefined,
    status: statusObj?.name,
    studio: (raw.studio as string) || undefined,
    category: categoryObj?.name,
    releaseDate: (raw.release_date as string) || undefined,
    isFavorite: !!(raw.is_favorite),
    listStatus,
  };
}

const STATUS_COLORS: Record<string, string> = {
  watching: '#22c55e',
  planned: '#a855f7',
  completed: '#3b82f6',
  on_hold: '#eab308',
  dropped: '#ef4444',
};

export function renderCollection(collectionId: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-collection';

  wrap.innerHTML = `
    <div class="collection-page">
      <div class="collection-page__head">
        <div class="collection-page__loading">Загрузка…</div>
      </div>
      <div class="collection-page__body" id="collection-body" hidden>
        <div class="collection-banner" data-banner>
          <div class="collection-banner__placeholder" data-banner-placeholder></div>
        </div>
        <div class="collection-info">
          <div class="collection-info__title-row">
            <h1 class="collection-info__title" data-title></h1>
            <div class="collection-header__author" data-author-wrap>
              <span class="collection-header__author-label">Автор коллекции</span>
              <a href="#" class="collection-header__author-link" data-author-link>
                <span class="collection-header__author-avatar" data-author-avatar></span>
                <span class="collection-header__author-name" data-author-name></span>
              </a>
            </div>
          </div>
          <p class="collection-info__date" data-date></p>
          <div class="collection-info__actions">
            <button type="button" class="collection-info__action collection-info__action--bookmark" data-action-bookmark>
              <span class="collection-info__action-count" data-fav-count></span>
              <span class="collection-info__action-icon">${iconFlag(16, false)}</span>
              <span class="collection-info__action-label">Добавить в закладки</span>
            </button>
          </div>
        </div>
        <div class="collection-desc" data-desc-wrap hidden>
          <div class="collection-desc__text" data-desc></div>
        </div>
        <section class="collection-stats" id="collection-stats">
          <h2 class="collection-stats__title" data-stats-title></h2>
          <div class="collection-stats__bar-wrap">
            <div class="collection-stats__bar" data-stats-bar></div>
          </div>
          <div class="collection-stats__legend" data-stats-legend></div>
          <button type="button" class="collection-stats__random" data-action-random>
            <span class="collection-stats__random-icon">↻</span>
            Открыть случайный
          </button>
        </section>
        <div class="collection-releases" id="collection-releases">
          <div class="collection-releases__loading" data-releases-loading>Загрузка релизов…</div>
          <div class="collection-releases__list" data-releases-list hidden></div>
          <div class="collection-releases__more" data-releases-more hidden></div>
        </div>
      </div>
    </div>
  `;

  const body = wrap.querySelector('#collection-body') as HTMLElement;
  const loading = wrap.querySelector('.collection-page__loading') as HTMLElement;

  if (!window.anixApi) {
    if (loading) loading.textContent = 'API недоступно.';
    return wrap;
  }

  Promise.all([
    window.anixApi.collection.info(collectionId),
    window.anixApi.collection.getReleases(collectionId, 0),
  ])
    .then(([infoRes, releasesRes]) => {
      const info = infoRes?.collection ?? infoRes;
      const code = infoRes?.code;
      if (code !== 0 && code !== undefined) {
        if (loading) loading.textContent = 'Коллекция недоступна или удалена.';
        return;
      }
      if (!info) {
        if (loading) loading.textContent = 'Коллекция не найдена.';
        return;
      }

      const creator = info.creator || {};
      const authorId = creator.id ?? creator['@id'];
      const authorName = creator.nickname ?? creator.username ?? creator.login ?? (creator as Record<string, unknown>).name ?? 'Пользователь';
      const authorAvatar = creator.avatar ?? '';
      const title = info.title || 'Без названия';
      const description = info.description || '';
      const image = info.image || '';
      const lastUpdate = info.last_update_date ?? info.creation_date ?? 0;
      const favoritesCount = info.favorites_count ?? 0;
      const rawRes = infoRes as Record<string, unknown> | undefined;
      const isFavorite = !!(
        info.is_favorite ??
        rawRes?.is_favorite ??
        (rawRes?.collection && typeof rawRes.collection === 'object' && (rawRes.collection as Record<string, unknown>).is_favorite)
      );
      const watchingCount = infoRes?.watching_count ?? 0;
      const planCount = infoRes?.plan_count ?? 0;
      const completedCount = infoRes?.completed_count ?? 0;
      const holdOnCount = infoRes?.hold_on_count ?? 0;
      const droppedCount = infoRes?.dropped_count ?? 0;
      const statusSum = watchingCount + planCount + completedCount + holdOnCount + droppedCount;
      const totalFromReleasesApi = releasesRes?.total_count;
      const totalReleases = typeof totalFromReleasesApi === 'number' && totalFromReleasesApi >= 0
        ? totalFromReleasesApi
        : statusSum || (info.releases?.length ?? 0);

      if (loading) loading.hidden = true;
      if (body) body.hidden = false;

      const authorLink = wrap.querySelector('[data-author-link]') as HTMLAnchorElement | null;
      if (authorLink && authorId) {
        authorLink.href = `/profile/${authorId}`;
        authorLink.addEventListener('click', (e) => {
          e.preventDefault();
          navigate(`/profile/${authorId}`);
        });
      }
      const avatarEl = wrap.querySelector('[data-author-avatar]') as HTMLElement | null;
      if (avatarEl) {
        if (authorAvatar) {
          avatarEl.style.backgroundImage = `url(${esc(authorAvatar)})`;
          avatarEl.classList.add('collection-header__author-avatar--img');
        }
      }
      const nameEl = wrap.querySelector('[data-author-name]');
      if (nameEl) nameEl.textContent = authorName;

      const banner = wrap.querySelector('[data-banner]') as HTMLElement;
      const bannerPlaceholder = wrap.querySelector('[data-banner-placeholder]') as HTMLElement;
      if (banner) {
        if (image) {
          if (bannerPlaceholder) bannerPlaceholder.remove();
          const img = document.createElement('img');
          img.src = image.startsWith('http') ? image : `${POSTER_BASE}/${image}`;
          img.alt = '';
          img.loading = 'eager';
          banner.appendChild(img);
        } else if (bannerPlaceholder) {
          bannerPlaceholder.style.display = 'block';
        }
      }

      const titleEl = wrap.querySelector('[data-title]');
      if (titleEl) titleEl.textContent = title;
      const dateEl = wrap.querySelector('[data-date]');
      if (dateEl) dateEl.textContent = formatDate(lastUpdate);

      const favCountEl = wrap.querySelector('[data-fav-count]');
      const bookmarkLabelEl = wrap.querySelector('.collection-info__action-label');
      const bookmarkBtn = wrap.querySelector('[data-action-bookmark]') as HTMLElement | null;
      const updateBookmarkUi = (inFav: boolean) => {
        bookmarkBtn?.classList.toggle('collection-info__action--active', inFav);
        if (bookmarkLabelEl) bookmarkLabelEl.textContent = inFav ? 'В закладках' : 'Добавить в закладки';
      };
      if (favCountEl) favCountEl.textContent = String(favoritesCount);
      if (bookmarkBtn) {
        updateBookmarkUi(isFavorite);
        bookmarkBtn.addEventListener('click', () => {
          if (!window.anixApi) return;
          const next = !bookmarkBtn.classList.contains('collection-info__action--active');
          (next ? window.anixApi.collection.addFavorite(collectionId) : window.anixApi.collection.removeFavorite(collectionId))
            .then(() => updateBookmarkUi(next))
            .catch(() => {});
        });
      }

      if (description) {
        const descWrap = wrap.querySelector('[data-desc-wrap]') as HTMLElement;
        const descEl = wrap.querySelector('[data-desc]');
        if (descWrap) descWrap.hidden = false;
        if (descEl) descEl.innerHTML = esc(description).replace(/\n/g, '<br>');
      }

      const totalEl = wrap.querySelector('[data-stats-title]');
      if (totalEl) totalEl.textContent = `${totalReleases} релизов в коллекции`;

      const totalForBar = watchingCount + planCount + completedCount + holdOnCount + droppedCount;
      const barEl = wrap.querySelector('[data-stats-bar]') as HTMLElement;
      if (barEl && totalForBar > 0) {
        const parts = [
          { v: watchingCount, c: STATUS_COLORS.watching },
          { v: planCount, c: STATUS_COLORS.planned },
          { v: completedCount, c: STATUS_COLORS.completed },
          { v: holdOnCount, c: STATUS_COLORS.on_hold },
          { v: droppedCount, c: STATUS_COLORS.dropped },
        ];
        barEl.innerHTML = parts
          .filter((p) => p.v > 0)
          .map((p) => `<span style="width:${(100 * p.v) / totalForBar}%;background:${p.c}"></span>`)
          .join('');
      }

      const legendEl = wrap.querySelector('[data-stats-legend]');
      if (legendEl) {
        const items = [
          { label: 'Смотрю', count: watchingCount, c: STATUS_COLORS.watching },
          { label: 'В планах', count: planCount, c: STATUS_COLORS.planned },
          { label: 'Просмотрено', count: completedCount, c: STATUS_COLORS.completed },
          { label: 'Отложено', count: holdOnCount, c: STATUS_COLORS.on_hold },
          { label: 'Брошено', count: droppedCount, c: STATUS_COLORS.dropped },
        ];
        legendEl.innerHTML = items.map((i) => `<span class="collection-stats__legend-item"><i style="background:${i.c}"></i>${i.label} ${i.count}</span>`).join('');
      }

      const randomBtn = wrap.querySelector('[data-action-random]');
      if (randomBtn) {
        randomBtn.addEventListener('click', () => {
          window.anixApi!.collection.getRandomRelease(collectionId).then((res: any) => {
            const release = res?.release;
            const id = release?.id;
            if (id) navigate(`/release/${id}`);
          });
        });
      }

      const listEl = wrap.querySelector('[data-releases-list]') as HTMLElement;
      const releasesLoading = wrap.querySelector('[data-releases-loading]') as HTMLElement;
      let content = releasesRes?.content ?? releasesRes?.releases;
      if (content && !Array.isArray(content) && Array.isArray((content as any).releases)) content = (content as any).releases;
      const rawList = Array.isArray(content) ? content : [];
      const list = rawList.filter((item: any) => {
        if (!item || typeof item.id !== 'number') return false;
        if (item.release_count != null && !item.title_ru && !item.title_original) return false;
        return item.title_ru != null || item.title_original != null;
      });

      if (releasesLoading) releasesLoading.hidden = true;
      if (listEl) {
        listEl.hidden = false;
        list.forEach((raw: any) => {
          const data = mapReleaseToCardData(raw as Record<string, unknown>);
          listEl.appendChild(renderReleaseCardHorizontal(data));
        });
      }

      const moreEl = wrap.querySelector('[data-releases-more]') as HTMLElement;
      const totalFromApi = typeof totalFromReleasesApi === 'number' ? totalFromReleasesApi : totalReleases;
      let nextPage = 1;
      const totalLoaded = list.length;
      let hasMore = totalFromApi > totalLoaded || (totalFromApi <= 0 && totalLoaded > 0);
      let isLoadingMore = false;

      function loadMore() {
        if (!hasMore || isLoadingMore || !window.anixApi) return;
        isLoadingMore = true;
        if (moreEl) {
          moreEl.hidden = false;
          moreEl.textContent = 'Загрузка…';
        }
        window.anixApi.collection.getReleases(collectionId, nextPage).then((res: any) => {
          let content = res?.content ?? res?.releases;
          if (content && !Array.isArray(content) && Array.isArray(content.releases)) content = content.releases;
          const rawListNext = Array.isArray(content) ? content : [];
          const listNext = rawListNext.filter((item: any) => {
            if (!item || typeof item.id !== 'number') return false;
            if (item.release_count != null && !item.title_ru && !item.title_original) return false;
            return item.title_ru != null || item.title_original != null;
          });
          if (listEl) {
            listNext.forEach((raw: any) => {
              const data = mapReleaseToCardData(raw as Record<string, unknown>);
              listEl.appendChild(renderReleaseCardHorizontal(data));
            });
          }
          nextPage += 1;
          if (listNext.length === 0 || (totalFromApi > 0 && listEl && listEl.children.length >= totalFromApi)) hasMore = false;
          if (moreEl) {
            moreEl.textContent = hasMore ? '' : 'это всё :)';
            moreEl.hidden = hasMore;
          }
          isLoadingMore = false;
          if (scrollEl && hasMore && scrollEl.scrollHeight <= scrollEl.clientHeight + 50) requestAnimationFrame(() => loadMore());
        }).catch(() => {
          if (moreEl) moreEl.hidden = true;
          isLoadingMore = false;
        });
      }

      if (moreEl) {
        moreEl.hidden = hasMore;
        moreEl.textContent = 'это всё :)';
      }
      const scrollEl = wrap.closest('.page__scroll') as HTMLElement | null;
      if (scrollEl && hasMore) {
        scrollEl.addEventListener('scroll', () => {
          if (!hasMore || isLoadingMore) return;
          const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
          if (distance < 300) loadMore();
        });
        requestAnimationFrame(() => {
          if (!hasMore || isLoadingMore) return;
          if (scrollEl.scrollHeight <= scrollEl.clientHeight + 50) loadMore();
        });
      }
    })
    .catch(() => {
      if (loading) loading.textContent = 'Ошибка загрузки.';
    });

  return wrap;
}
