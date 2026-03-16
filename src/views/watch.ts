/**
 * Страница просмотра: кастомный плеер в отдельном окне.
 * Параметры: releaseId, sourceId, ep, title, sourceName (из getWatchParams).
 */

import Hls from 'hls.js';
import { KodikParser } from 'anixartjs';
import { getWatchParams } from '../router';
import { renderPage } from '../components/page';
import { createIcons, Play, Pause, Volume2, Maximize, List, Headphones, SkipForward, Check, ChevronRight } from 'lucide';

function isHlsUrl(url: string): boolean {
  return /\.m3u8/i.test(url) || url.includes(':hls:manifest');
}

/** Убирает query-параметры (d, s, ip и др.) у Kodik/AniQit URL — запрос должен идти только на базовый путь. */
function stripKodikQueryParams(url: string): string {
  try {
    const u = new URL(url);
    if (/kodik\.info|aniqit\.com|anixis\.com|aniqart\.com/i.test(u.hostname)) {
      return u.origin + u.pathname;
    }
    return url;
  } catch {
    return url;
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function renderWatch(): HTMLElement {
  const params = getWatchParams();
  const releaseId = params.get('releaseId') || params.get('viewId');
  const sourceId = params.get('sourceId');
  const ep = params.get('ep');
  const dubberId = params.get('dubberId') || '';
  const title = params.get('title') || 'Просмотр';
  const sourceName = params.get('sourceName') || '';

  const wrap = document.createElement('div');
  wrap.className = 'view view-watch';

  wrap.innerHTML = `
    <div class="watch-page watch-page--anidesk">
      <div class="watch-page__player-wrap" data-player-wrap>
        <div class="watch-page__player-loading" data-player-loading>Загрузка…</div>
        <div class="watch-page__player-area" data-player-area hidden>
          <iframe data-iframe class="watch-page__iframe" allow="autoplay; fullscreen"></iframe>
          <video data-video class="watch-page__video" crossorigin="anonymous" playsinline></video>
        </div>
        <div class="watch-page__player-error" data-player-error hidden></div>
        <div class="watch-page__tap-overlay" data-tap-overlay></div>
        <div class="watch-page__gui-overlay" data-gui-overlay>
          <div class="watch-page__title-overlay watch-page__title-overlay--center">
            <h1 class="watch-page__title">${escapeHtml(title)}</h1>
            <p class="watch-page__subtitle" data-watch-subtitle>${ep || '—'} серия</p>
            <p class="watch-page__dub-hint" data-watch-dub-hint>Если не загружается — выберите другую озвучку (кнопка «Озвучка»).</p>
          </div>
          <div class="watch-page__tap-layer" data-tap-layer></div>
          <div class="watch-page__center-play" data-center-play>
            <button type="button" class="watch-page__center-play-btn" data-btn-play-center aria-label="Воспроизвести"></button>
          </div>
          <div class="watch-page__controls watch-page__controls--overlay" data-controls-overlay>
            <div class="watch-page__bottom-bar watch-page__bottom-bar--anidesk">
              <div class="watch-page__row watch-page__row--timeline">
                <button type="button" class="watch-page__btn watch-page__btn--play" data-btn-play aria-label="Play/Pause"><i data-lucide="play"></i></button>
                <span class="watch-page__time" data-time>0:00 / 0:00</span>
                <div class="watch-page__progress-wrap" data-progress-wrap>
                  <div class="watch-page__timeline" data-progress>
                    <div class="watch-page__timeline-loaded" data-timeline-loaded></div>
                    <div class="watch-page__progress-bar" data-progress-bar></div>
                    <div class="watch-page__timeline-dot" data-timeline-dot></div>
                  </div>
                </div>
                <div class="watch-page__icon-btn watch-page__btn--volume-wrap" data-btn-volume title="Громкость">
                  <i data-lucide="volume-2"></i>
                  <input type="range" class="watch-page__volume" data-volume min="0" max="100" value="100" title="Громкость">
                </div>
                <button type="button" class="watch-page__icon-btn" data-btn-fullscreen title="Полный экран"><i data-lucide="maximize"></i></button>
              </div>
              <div class="watch-page__row watch-page__row--actions watch-page__row--popover-anchor" data-actions-row>
                <div class="watch-page__row-actions-left">
                  <button type="button" class="watch-page__pill" data-btn-series title="Серии">Серии <i data-lucide="list"></i></button>
                  <button type="button" class="watch-page__pill" data-btn-dub title="Озвучка">Озвучка <i data-lucide="headphones"></i></button>
                </div>
                <div class="watch-page__row-actions-right">
                  <button type="button" class="watch-page__pill" data-btn-skip title="Пропуск опенинга">Пропуск опенинга <i data-lucide="skip-forward"></i></button>
                  <button type="button" class="watch-page__pill watch-page__pill--next" data-btn-next title="Следующая серия">${Number(ep) + 1} серия <i data-lucide="chevron-right"></i></button>
                </div>
                <div class="watch-page__popover" data-popover hidden>
                  <div class="watch-page__popover-panel">
                    <div class="watch-page__popover-head">
                      <h3 class="watch-page__popover-title" data-popover-title></h3>
                      <button type="button" class="watch-page__popover-close" data-popover-close aria-label="Закрыть"></button>
                    </div>
                    <div class="watch-page__popover-body" data-popover-body></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const playerWrap = wrap.querySelector('[data-player-wrap]') as HTMLElement;
  const playerLoading = wrap.querySelector('[data-player-loading]') as HTMLElement;
  const playerArea = wrap.querySelector('[data-player-area]') as HTMLElement;
  const playerError = wrap.querySelector('[data-player-error]') as HTMLElement;
  const iframeEl = wrap.querySelector('[data-iframe]') as HTMLIFrameElement;
  const videoEl = wrap.querySelector('[data-video]') as HTMLVideoElement;
  const progressBar = wrap.querySelector('[data-progress-bar]') as HTMLElement;
  const timeEl = wrap.querySelector('[data-time]') as HTMLElement;
  const btnPlay = wrap.querySelector('[data-btn-play]') as HTMLButtonElement;
  const btnSeries = wrap.querySelector('[data-btn-series]') as HTMLButtonElement;
  const btnDub = wrap.querySelector('[data-btn-dub]') as HTMLButtonElement;
  const btnNext = wrap.querySelector('[data-btn-next]') as HTMLButtonElement;
  const controlsOverlay = wrap.querySelector('[data-controls-overlay]') as HTMLElement;
  const guiOverlay = wrap.querySelector('[data-gui-overlay]') as HTMLElement;
  const btnVolume = wrap.querySelector('[data-btn-volume]') as HTMLElement;
  const volumeInput = wrap.querySelector('[data-volume]') as HTMLInputElement;
  const btnFullscreen = wrap.querySelector('[data-btn-fullscreen]') as HTMLButtonElement;
  const centerPlay = wrap.querySelector('[data-center-play]') as HTMLElement;
  const btnPlayCenter = wrap.querySelector('[data-btn-play-center]') as HTMLButtonElement;
  const tapLayer = wrap.querySelector('[data-tap-layer]') as HTMLElement;
  const tapOverlay = wrap.querySelector('[data-tap-overlay]') as HTMLElement;
  const popover = wrap.querySelector('[data-popover]') as HTMLElement;
  const popoverTitle = wrap.querySelector('[data-popover-title]') as HTMLElement;
  const popoverClose = wrap.querySelector('[data-popover-close]') as HTMLButtonElement;
  const popoverBody = wrap.querySelector('[data-popover-body]') as HTMLElement;
  const actionsRow = wrap.querySelector('[data-actions-row]') as HTMLElement;

  if (guiOverlay) guiOverlay.hidden = true;

  const icons = { Play, Pause, Volume2, Maximize, List, Headphones, SkipForward, ChevronRight };
  createIcons({ icons, root: wrap });

  const IDLE_HIDE_MS = 3000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleHideOverlay = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      guiOverlay?.classList.add('watch-page__gui-overlay--hidden');
      idleTimer = null;
    }, IDLE_HIDE_MS);
  };
  const showOverlay = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    guiOverlay?.classList.remove('watch-page__gui-overlay--hidden');
  };
  playerWrap?.addEventListener('mousemove', () => {
    showOverlay();
    scheduleHideOverlay();
  });
  playerWrap?.addEventListener('mouseleave', () => scheduleHideOverlay());

  const togglePlayPause = () => {
    if (videoEl && !videoEl.hidden) {
      if (videoEl.paused) videoEl.play();
      else videoEl.pause();
    }
    showOverlay();
    scheduleHideOverlay();
  };
  tapLayer?.addEventListener('click', togglePlayPause);
  tapOverlay?.addEventListener('click', () => {
    if (!guiOverlay?.classList.contains('watch-page__gui-overlay--hidden')) return;
    showOverlay();
    scheduleHideOverlay();
    togglePlayPause();
  });

  let popoverDocumentClick: ((e: MouseEvent) => void) | null = null;
  let currentPopoverType: 'series' | 'dubbing' | null = null;
  const closePopover = () => {
    if (popover) {
      popover.hidden = true;
      currentPopoverType = null;
      if (popoverDocumentClick) {
        document.removeEventListener('click', popoverDocumentClick, true);
        popoverDocumentClick = null;
      }
    }
  };
  const openPopover = (titleText: string, type: 'series' | 'dubbing'): { scrollRoot: HTMLElement; setLoading: (text: string) => void } => {
    if (!popover || !popoverTitle || !popoverBody) return { scrollRoot: document.createElement('div'), setLoading: () => {} };
    if (popoverDocumentClick) {
      document.removeEventListener('click', popoverDocumentClick, true);
      popoverDocumentClick = null;
    }
    popoverTitle.textContent = titleText;
    popoverBody.innerHTML = '';
    const page = renderPage();
    page.classList.remove('page--padded');
    page.classList.add('watch-page__popover-page');
    const scrollRoot = page.querySelector('.page__scroll') as HTMLElement;
    if (scrollRoot) scrollRoot.removeAttribute('id');
    popoverBody.appendChild(page);
    popover.hidden = false;
    currentPopoverType = type;
    popoverDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (popover?.contains(target) || btnSeries?.contains(target) || btnDub?.contains(target))) return;
      closePopover();
    };
    document.addEventListener('click', popoverDocumentClick, true);
    const setLoading = (text: string) => {
      if (scrollRoot) scrollRoot.innerHTML = `<div class="watch-page__popover-load">${escapeHtml(text)}</div>`;
    };
    return { scrollRoot: scrollRoot || popoverBody, setLoading };
  };
  popoverClose?.addEventListener('click', closePopover);

  if (!releaseId || !sourceId || !ep || !window.anix?.getEpisode) {
    if (playerLoading) playerLoading.textContent = 'Неверные параметры просмотра.';
    return wrap;
  }

  const releaseIdNum = parseInt(releaseId, 10);
  const sourceIdNum = parseInt(sourceId, 10);
  const epNum = parseInt(ep, 10);

  const state = { releaseId, sourceId, ep: epNum, title, sourceName, dubberId };

  async function resolveEpisodeUrl(episodeUrl: string, iframe: boolean): Promise<{ playUrl: string; useVideo: boolean }> {
    let url = episodeUrl.startsWith('http') ? episodeUrl : `https:${episodeUrl}`;
    url = stripKodikQueryParams(url);
    const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
    const isAniqitEmbed = /aniqit\.com|anixis\.com|aniqart\.com/i.test(host);
    if (isAniqitEmbed) {
      try {
        const u = new URL(url);
        url = u.origin + u.pathname;
      } catch (_) {}
    }
    let playUrl = url;
    let useVideo = !iframe;
    const isEmbedPage = /aniqit\.com|anixis\.com|aniqart\.com|kodik\.info/i.test(host);
    if (isEmbedPage) {
      try {
        const links = await KodikParser.getDirectLinks(url);
        if (links && typeof links === 'object') {
          const q720 = links['720']?.[0]?.src ?? (links as Record<string, { src: string }[]>)['720p']?.[0]?.src;
          const q1080 = links['1080']?.[0]?.src ?? (links as Record<string, { src: string }[]>)['1080p']?.[0]?.src;
          const q480 = links['480']?.[0]?.src ?? (links as Record<string, { src: string }[]>)['480p']?.[0]?.src;
          const src = q720 || q1080 || q480 || (Object.values(links)[0] as { src: string }[])?.[0]?.src;
          if (src) {
            const raw = src.startsWith('http') ? src : `https:${src}`;
            playUrl = stripKodikQueryParams(raw);
            useVideo = true;
          }
        }
      } catch (_) {}
      if (!useVideo) {
        playUrl = url;
        useVideo = false;
      }
    } else if (host.includes('kodik')) {
      try {
        const links = await KodikParser.getDirectLinks(url);
        if (links && typeof links === 'object') {
          const q720 = links['720']?.[0]?.src || (links as Record<string, { src: string }[]>)['720p']?.[0]?.src;
          const q1080 = links['1080']?.[0]?.src || (links as Record<string, { src: string }[]>)['1080p']?.[0]?.src;
          const q480 = links['480']?.[0]?.src || (links as Record<string, { src: string }[]>)['480p']?.[0]?.src;
          const src = q720 || q1080 || q480 || (Object.values(links)[0] as { src: string }[])?.[0]?.src;
          if (src) {
            const raw = src.startsWith('http') ? src : `https:${src}`;
            playUrl = stripKodikQueryParams(raw);
            useVideo = true;
          }
        }
      } catch (_) {}
    }
    if (!useVideo && !isEmbedPage && window.anix?.getDirectVideoLink) {
      try {
        const { directUrl } = await window.anix.getDirectVideoLink(url);
        if (directUrl) {
          const raw = directUrl.startsWith('http') ? directUrl : `https:${directUrl}`;
          playUrl = stripKodikQueryParams(raw);
          useVideo = true;
        }
      } catch (_) {}
    }
    if (!useVideo && iframe) {
      playUrl = url;
      useVideo = false;
    }
    return { playUrl, useVideo };
  }

  let applyVideoAndUI: (playUrl: string, useVideo: boolean, ep: number, titleStr: string, sourceNameStr: string, dubberIdStr: string, seekTime?: number, initialPaused?: boolean) => void = () => {};
  let isApplyingSync = false;
  const getPlaybackPayload = (): { releaseId: string; sourceId: string; ep: string; dubberId?: string; title: string; sourceName: string; paused: boolean; currentTime: number } => ({
    releaseId: state.releaseId,
    sourceId: state.sourceId,
    ep: String(state.ep),
    dubberId: state.dubberId || undefined,
    title: state.title,
    sourceName: state.sourceName,
    paused: !!(videoEl && !videoEl.hidden && videoEl.paused),
    currentTime: videoEl && !videoEl.hidden && !isNaN(videoEl.currentTime) ? videoEl.currentTime : 0,
  });
  const sendPlaybackToLobby = () => {
    if (isApplyingSync || !window.electron?.sendPlayerState) return;
    window.electron.sendPlayerState(getPlaybackPayload());
  };

  window.anix.getEpisode(releaseIdNum, sourceIdNum, epNum).then(async (res: { episode?: { url: string; iframe: boolean } }) => {
    const episode = res?.episode;
    if (!episode?.url) {
      if (playerLoading) playerLoading.hidden = true;
      if (playerError) playerError.hidden = false;
      return;
    }
    const originalEpisodeUrl = stripKodikQueryParams(episode.url.startsWith('http') ? episode.url : `https:${episode.url}`);
    (wrap as unknown as { _originalEpisodeUrl?: string })._originalEpisodeUrl = originalEpisodeUrl;
    const resolved = await resolveEpisodeUrl(episode.url, episode.iframe);
    let playUrl = resolved.playUrl;
    let useVideo = resolved.useVideo;

    if (playerLoading) playerLoading.hidden = true;
    if (playerError) playerError.hidden = true;
    if (playerArea) playerArea.hidden = false;
    if (guiOverlay) guiOverlay.hidden = false;
    scheduleHideOverlay();

    const watchPage = wrap.querySelector('.watch-page') as HTMLElement;
    const progressWrap = wrap.querySelector('[data-progress]') as HTMLElement;
    const timelineLoaded = wrap.querySelector('[data-timeline-loaded]') as HTMLElement;
    const setProgressStyles = (p: number, loaded = p) => {
      if (progressWrap) {
        progressWrap.style.setProperty('--progress-position', `${p}%`);
        progressWrap.style.setProperty('--loaded-position', `${loaded}%`);
      }
      if (progressBar) progressBar.style.width = `${p}%`;
      if (timelineLoaded) timelineLoaded.style.width = `${loaded}%`;
    };
    const bindTimeUpdate = () => {
      videoEl.addEventListener('timeupdate', () => {
        if (!progressBar || !timeEl) return;
        const p = (videoEl.currentTime / videoEl.duration) * 100;
        const loaded = videoEl.buffered.length ? (videoEl.buffered.end(videoEl.buffered.length - 1) / videoEl.duration) * 100 : p;
        setProgressStyles(isNaN(p) ? 0 : p, isNaN(loaded) ? 0 : loaded);
        const fmt = (t: number) => {
          const m = Math.floor(t / 60);
          const s = Math.floor(t % 60);
          return `${m}:${s.toString().padStart(2, '0')}`;
        };
        timeEl.textContent = `${fmt(videoEl.currentTime)} / ${fmt(videoEl.duration || 0)}`;
      });
      videoEl.addEventListener('progress', () => {
        if (videoEl.buffered.length && progressWrap) {
          const loaded = (videoEl.buffered.end(videoEl.buffered.length - 1) / videoEl.duration) * 100;
          progressWrap.style.setProperty('--loaded-position', `${loaded}%`);
          if (timelineLoaded) timelineLoaded.style.width = `${loaded}%`;
        }
      });
      videoEl.addEventListener('loadedmetadata', () => {
        if (timeEl && progressBar) {
          const fmt = (t: number) => {
            const m = Math.floor(t / 60);
            const s = Math.floor(t % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
          };
          timeEl.textContent = `0:00 / ${fmt(videoEl.duration || 0)}`;
        }
      });
    };
    const updatePlayPauseUI = () => {
      if (videoEl.paused) {
        centerPlay?.classList.remove('watch-page__center-play--hidden');
        if (btnPlay) {
          btnPlay.innerHTML = '<i data-lucide="play"></i>';
          createIcons({ icons: { Play }, root: btnPlay });
        }
      } else {
        centerPlay?.classList.add('watch-page__center-play--hidden');
        if (btnPlay) {
          btnPlay.innerHTML = '<i data-lucide="pause"></i>';
          createIcons({ icons: { Pause }, root: btnPlay });
        }
      }
    };

    applyVideoAndUI = (playUrlArg: string, useVideoArg: boolean, ep: number, titleStr: string, sourceNameStr: string, dubberIdStr: string, seekTime?: number, initialPaused?: boolean) => {
      const subEl = wrap.querySelector('[data-watch-subtitle]') as HTMLElement | null;
      const nextBtn = wrap.querySelector('[data-btn-next]') as HTMLElement | null;
      if (subEl) subEl.textContent = `${ep} серия`;
      if (nextBtn) {
        nextBtn.innerHTML = `${ep + 1} серия <i data-lucide="chevron-right"></i>`;
        createIcons({ icons: { ChevronRight }, root: nextBtn });
      }
      state.ep = ep;
      state.title = titleStr;
      state.sourceName = sourceNameStr;
      state.dubberId = dubberIdStr;
      const q = new URLSearchParams({ releaseId: state.releaseId, sourceId: state.sourceId, ep: String(ep), title: titleStr, sourceName: sourceNameStr });
      if (dubberIdStr) q.set('dubberId', dubberIdStr);
      const qs = q.toString();
      if (typeof window.history.replaceState === 'function') {
        const base = window.location.pathname || '';
        window.history.replaceState(null, '', `${base}?${qs}`);
      }
      if (watchPage) watchPage.classList.toggle('watch-page--iframe-mode', !useVideoArg);
      const dubHint = wrap.querySelector('[data-watch-dub-hint]') as HTMLElement | null;
      if (dubHint) dubHint.hidden = !!useVideoArg;
      if (useVideoArg) {
        const hlsInst = (videoEl as unknown as { _hls?: Hls })._hls;
        if (hlsInst) {
          hlsInst.destroy();
          (videoEl as unknown as { _hls?: Hls })._hls = undefined;
        }
        videoEl.hidden = false;
        if (iframeEl) iframeEl.hidden = true;
        videoEl.src = '';
        if (volumeInput) videoEl.volume = Number(volumeInput.value) / 100;
        const doPlay = () => videoEl.play().catch(() => {});
        if (seekTime != null && seekTime > 0) {
          const restoreTime = () => {
            videoEl.currentTime = Math.min(seekTime, videoEl.duration || Infinity);
            if (initialPaused) videoEl.pause();
            setTimeout(sendPlaybackToLobby, 200);
          };
          videoEl.addEventListener('loadeddata', restoreTime, { once: true });
          videoEl.addEventListener('canplay', restoreTime, { once: true });
        }
        const embedFallbackUrl = (wrap as unknown as { _originalEpisodeUrl?: string })._originalEpisodeUrl;
        const tryFallbackToIframe = () => {
          if (embedFallbackUrl) applyVideoAndUI(embedFallbackUrl, false, ep, titleStr, sourceNameStr, dubberIdStr);
        };
        if (isHlsUrl(playUrlArg) && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(playUrlArg);
          hls.attachMedia(videoEl);
          (videoEl as unknown as { _hls?: Hls })._hls = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => doPlay());
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) tryFallbackToIframe();
          });
        } else {
          videoEl.src = playUrlArg;
        }
        videoEl.addEventListener('error', tryFallbackToIframe, { once: true });
        videoEl.addEventListener('playing', () => {
          window.anix?.addToHistory?.(parseInt(state.releaseId, 10), parseInt(state.sourceId, 10), ep);
        }, { once: true });
        doPlay();
      } else {
        iframeEl.src = playUrlArg;
        iframeEl.hidden = false;
        if (videoEl) videoEl.hidden = true;
        window.anix?.addToHistory?.(parseInt(state.releaseId, 10), parseInt(state.sourceId, 10), ep);
      }
    };

    applyVideoAndUI(playUrl, useVideo, epNum, title, sourceName, dubberId);

    if (useVideo) {
      bindTimeUpdate();
      videoEl.addEventListener('play', () => {
        updatePlayPauseUI();
        sendPlaybackToLobby();
      });
      videoEl.addEventListener('pause', () => {
        updatePlayPauseUI();
        sendPlaybackToLobby();
      });
      btnPlayCenter?.addEventListener('click', () => videoEl.play());
      updatePlayPauseUI();
      const doAutoPlay = () => { videoEl.play().catch(() => {}); };
      videoEl.addEventListener('canplay', doAutoPlay, { once: true });
      videoEl.addEventListener('loadeddata', doAutoPlay, { once: true });
      videoEl.addEventListener('playing', doAutoPlay, { once: true });
      setTimeout(doAutoPlay, 800);
      doAutoPlay();
    }
  }).catch(() => {
    if (playerLoading) playerLoading.hidden = true;
    if (playerError) playerError.hidden = false;
  });

  const progressEl = wrap.querySelector('[data-progress]') as HTMLElement;
  if (progressEl && videoEl) {
    progressEl.addEventListener('click', (e) => {
      const rect = progressEl.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      if (!isNaN(videoEl.duration)) {
        videoEl.currentTime = x * videoEl.duration;
        setTimeout(sendPlaybackToLobby, 100);
      }
    });
  }

  btnPlay?.addEventListener('click', () => {
    if (videoEl && !videoEl.hidden) {
      if (videoEl.paused) videoEl.play();
      else videoEl.pause();
    }
  });

  btnSeries?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!popover || !state.releaseId || !state.sourceId) return;
    if (!popover.hidden && currentPopoverType === 'series') {
      closePopover();
      return;
    }
    const dubberIdNum = state.dubberId ? parseInt(state.dubberId, 10) : 0;
    if (!dubberIdNum || !window.anix?.getEpisodes) {
      const { scrollRoot, setLoading } = openPopover('Серии', 'series');
      setLoading('Нет данных об озвучке. Выберите озвучку.');
      return;
    }
    const { scrollRoot, setLoading } = openPopover('Серии', 'series');
    setLoading('Загрузка…');
    window.anix.getEpisodes(releaseIdNum, dubberIdNum, parseInt(state.sourceId, 10)).then((res: { episodes?: Array<{ position: number; name: string; is_watched?: boolean }> }) => {
      const episodes = res?.episodes ?? [];
      scrollRoot.innerHTML = '';
      const list = document.createElement('div');
      list.className = 'watch-page__popover-list';
      episodes.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'watch-page__popover-item' + (item.position === state.ep ? ' watch-page__popover-item--active' : '');
        btn.dataset.epPosition = String(item.position);
        const watchedMark = (item.is_watched ?? (item as Record<string, unknown>).is_watched === true) ? '<span class="watch-page__popover-watched" title="Просмотрено">✓</span>' : '';
        btn.innerHTML = `<span class="watch-page__popover-item-text">${item.position} серия</span>${watchedMark}`;
        btn.addEventListener('click', () => {
          closePopover();
          goToEpisode(item.position);
        });
        list.appendChild(btn);
      });
      scrollRoot.appendChild(list);
      if (episodes.length === 0) scrollRoot.innerHTML = '<div class="watch-page__popover-load">Нет серий</div>';
      else {
        const activeEl = scrollRoot.querySelector(`[data-ep-position="${state.ep}"]`);
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }).catch(() => {
      setLoading('Ошибка загрузки');
    });
  });

  btnDub?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!popover || !state.releaseId || !window.anix?.getDubbers) return;
    if (!popover.hidden && currentPopoverType === 'dubbing') {
      closePopover();
      return;
    }
    const { scrollRoot, setLoading } = openPopover('Озвучка', 'dubbing');
    setLoading('Загрузка…');
    window.anix.getDubbers(releaseIdNum).then((res: { types?: Array<{ id: number; name: string }> }) => {
      const types = res?.types ?? [];
      const dubberIdNum = state.dubberId ? parseInt(state.dubberId, 10) : 0;
      scrollRoot.innerHTML = '';
      const list = document.createElement('div');
      list.className = 'watch-page__popover-list';
      types.forEach((dubber) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = dubber.id === dubberIdNum;
        btn.className = 'watch-page__popover-item' + (isActive ? ' watch-page__popover-item--active' : '');
        btn.innerHTML = `<span class="watch-page__popover-item-text">${escapeHtml(dubber.name)}</span>${isActive ? '<span class="watch-page__popover-check"><i data-lucide="check"></i></span>' : ''}`;
        btn.addEventListener('click', () => {
          window.anix?.getDubberSources(releaseIdNum, dubber.id).then((srcRes: { sources?: Array<{ id: number; name: string }> }) => {
            const sources = srcRes?.sources ?? [];
            const first = sources[0];
            if (first) {
              closePopover();
              switchToDubbing(first.id, first.name, dubber.id);
            }
          }).catch(() => {});
        });
        list.appendChild(btn);
      });
      scrollRoot.appendChild(list);
      if (types.length > 0) createIcons({ icons: { Check }, root: list });
      if (types.length === 0) scrollRoot.innerHTML = '<div class="watch-page__popover-load">Нет озвучек</div>';
    }).catch(() => {
      setLoading('Ошибка загрузки');
    });
  });

  const btnSkip = wrap.querySelector('[data-btn-skip]') as HTMLButtonElement;
  btnSkip?.addEventListener('click', () => {
    if (videoEl && !videoEl.hidden && !isNaN(videoEl.duration)) {
      videoEl.currentTime = Math.min(videoEl.currentTime + 85, videoEl.duration);
    }
  });

  const loadEpisodeInPlace = (rId: number, sId: number, ep: number, titleStr: string, sourceNameStr: string, dubberIdStr: string, seekTime?: number, initialPaused?: boolean) => {
    if (!window.anix?.getEpisode) return;
    window.anix.getEpisode(rId, sId, ep).then(async (res: { episode?: { url: string; iframe: boolean } }) => {
      const episode = res?.episode;
      if (!episode?.url) return;
      const { playUrl: resolvedUrl, useVideo: useVideoRes } = await resolveEpisodeUrl(episode.url, episode.iframe);
      applyVideoAndUI(resolvedUrl, useVideoRes, ep, titleStr, sourceNameStr, dubberIdStr, seekTime, initialPaused);
    }).catch(() => {});
  };

  const goToEpisode = (ep: number) => {
    closePopover();
    loadEpisodeInPlace(releaseIdNum, parseInt(state.sourceId, 10), ep, state.title, state.sourceName, state.dubberId);
  };

  const switchToDubbing = (newSourceId: number, newSourceName: string, newDubberId: number) => {
    closePopover();
    const savedTime = videoEl && !videoEl.hidden && !isNaN(videoEl.currentTime) ? videoEl.currentTime : undefined;
    state.sourceId = String(newSourceId);
    state.sourceName = newSourceName;
    state.dubberId = String(newDubberId);
    loadEpisodeInPlace(releaseIdNum, newSourceId, state.ep, title, newSourceName, String(newDubberId), savedTime);
  };

  btnNext?.addEventListener('click', () => {
    goToEpisode(state.ep + 1);
  });

  btnFullscreen?.addEventListener('click', () => {
    window.electron?.togglePlayerFullScreen?.();
  });

  if (volumeInput && videoEl) {
    volumeInput.addEventListener('input', () => {
      const v = Number(volumeInput.value) / 100;
      videoEl.volume = Math.max(0, Math.min(1, v));
    });
    volumeInput.addEventListener('click', (e) => e.stopPropagation());
  }

  window.addEventListener('player:applySync', ((e: CustomEvent) => {
    const p = e.detail as { releaseId?: string; sourceId?: string; ep?: string; dubberId?: string; title?: string; sourceName?: string; paused?: boolean; currentTime?: number };
    if (!p || !p.releaseId || !p.sourceId || !p.ep) return;
    isApplyingSync = true;
    const sameReleaseAndEpisode =
      state.releaseId === p.releaseId &&
      state.sourceId === p.sourceId &&
      state.ep === Number(p.ep) &&
      (state.dubberId || '') === (p.dubberId || '');
    if (sameReleaseAndEpisode && videoEl && !videoEl.hidden && videoEl.readyState >= 2) {
      const remoteTime = typeof p.currentTime === 'number' ? p.currentTime : 0;
      videoEl.currentTime = Math.min(remoteTime, videoEl.duration || Infinity);
      if (p.paused) videoEl.pause();
      else videoEl.play().catch(() => {});
    } else if (!sameReleaseAndEpisode && window.anix?.getEpisode) {
      loadEpisodeInPlace(
        parseInt(p.releaseId, 10),
        parseInt(p.sourceId, 10),
        parseInt(p.ep, 10),
        p.title || state.title,
        p.sourceName || state.sourceName,
        p.dubberId || '',
        typeof p.currentTime === 'number' ? p.currentTime : undefined,
        !!p.paused
      );
    }
    setTimeout(() => {
      isApplyingSync = false;
    }, 500);
  }) as EventListener);

  return wrap;
}
