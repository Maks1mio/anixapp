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
          <!-- Лобби: аватары + лог действий -->
          <div class="watch-lobby-panel" data-lobby-panel hidden>
            <div class="watch-lobby-panel__avatars" data-lobby-avatars></div>
            <div class="watch-lobby-panel__log" data-lobby-log></div>
          </div>
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
  const lobbyPanel = wrap.querySelector('[data-lobby-panel]') as HTMLElement;
  const lobbyAvatarsEl = wrap.querySelector('[data-lobby-avatars]') as HTMLElement;
  const lobbyLogEl = wrap.querySelector('[data-lobby-log]') as HTMLElement;

  if (guiOverlay) guiOverlay.hidden = true;

  const icons = { Play, Pause, Volume2, Maximize, List, Headphones, SkipForward, ChevronRight };
  createIcons({ icons, root: wrap });

  const IDLE_HIDE_MS = 3000;
  const VOLUME_STORAGE_KEY = 'anixapp_player_volume';
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleHideOverlay = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      guiOverlay?.classList.add('watch-page__gui-overlay--hidden');
      playerWrap?.classList.add('watch-page__player-wrap--cursor-hidden');
      idleTimer = null;
    }, IDLE_HIDE_MS);
  };
  const showOverlay = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    guiOverlay?.classList.remove('watch-page__gui-overlay--hidden');
    playerWrap?.classList.remove('watch-page__player-wrap--cursor-hidden');
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

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.key === ' ') {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      e.preventDefault();
      togglePlayPause();
    }
  };
  window.addEventListener('keydown', onKeyDown);

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
    const _panel = popover.querySelector('.watch-page__popover-panel') as HTMLElement | null;
    if (_panel) {
      _panel.classList.remove('watch-page__popover-panel--series', 'watch-page__popover-panel--dubbing');
      _panel.classList.add(`watch-page__popover-panel--${type}`);
    }
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
  let applySyncTimer: ReturnType<typeof setTimeout> | null = null;
  /** Таймер периодической проверки зависания HLS-стрима (stall detection). */
  let stallCheckTimer: ReturnType<typeof setInterval> | null = null;
  // Если первый sync от сервера говорит "пауза", не даём автоплею
  // тут же перезапустить видео.
  let preventAutoPlayDueToInitialSyncPause = false;
  let pendingSync:
    | {
        releaseId?: string;
        sourceId?: string;
        ep?: string;
        dubberId?: string;
        title?: string;
        sourceName?: string;
        paused?: boolean;
        currentTime?: number;
      }
    | null = null;
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
  const sendCommandToLobby = (action: 'play' | 'pause' | 'seek' | 'changeEpisode', currentTimeOverride?: number) => {
    if (isApplyingSync || !window.electron?.sendPlayerState) return;
    const playback = currentTimeOverride !== undefined
      ? { ...getPlaybackPayload(), currentTime: currentTimeOverride }
      : getPlaybackPayload();
    // Оборачиваем в объект с action, но тип в preload
    // объявлен как принимающий только LobbyPlaybackPayload,
    // поэтому приводим к unknown, чтобы не ругался TS.
    window.electron.sendPlayerState({ action, playback } as unknown as Parameters<typeof window.electron.sendPlayerState>[0]);
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
        // Если sync пришёл до того, как видео было готово — применяем его сейчас.
        if (pendingSync && pendingSync.releaseId && pendingSync.sourceId && pendingSync.ep) {
          const sameReleaseAndEpisode =
            state.releaseId === pendingSync.releaseId &&
            state.sourceId === pendingSync.sourceId &&
            state.ep === Number(pendingSync.ep) &&
            (state.dubberId || '') === (pendingSync.dubberId || '');
          if (sameReleaseAndEpisode && !videoEl.hidden && videoEl.readyState >= 2) {
            // Block video events (play/pause) during sync application
            isApplyingSync = true;
            const remoteTime = typeof pendingSync.currentTime === 'number' ? pendingSync.currentTime : 0;
            const clampedRemote = Math.min(remoteTime, videoEl.duration || Infinity);
            videoEl.currentTime = clampedRemote;
            const shouldBePaused = !!pendingSync.paused;
            if (shouldBePaused && !videoEl.paused) {
              videoEl.pause();
              preventAutoPlayDueToInitialSyncPause = true;
            } else if (!shouldBePaused && videoEl.paused) {
              videoEl.play().catch(() => {});
            }
            // Keep isApplyingSync=true to absorb async video events from seek
            if (applySyncTimer) clearTimeout(applySyncTimer);
            applySyncTimer = setTimeout(() => {
              isApplyingSync = false;
              applySyncTimer = null;
            }, 2000);
            pendingSync = null;
          }
          // If readyState < 2, keep pendingSync for canplay to try again
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
        // Не запускаем воспроизведение если нужно начать на паузе (remote sync сказал paused=true)
        const doPlay = () => { if (!initialPaused) videoEl.play().catch(() => {}); };
        if (seekTime != null && seekTime > 0) {
          const restoreTime = () => {
            videoEl.currentTime = Math.min(seekTime, videoEl.duration || Infinity);
            if (initialPaused) videoEl.pause();
            sendCommandToLobby('seek');
          };
          videoEl.addEventListener('loadeddata', restoreTime, { once: true });
          videoEl.addEventListener('canplay', restoreTime, { once: true });
        }
        const embedFallbackUrl = (wrap as unknown as { _originalEpisodeUrl?: string })._originalEpisodeUrl;
        const tryFallbackToIframe = () => {
          if (embedFallbackUrl) applyVideoAndUI(embedFallbackUrl, false, ep, titleStr, sourceNameStr, dubberIdStr);
        };
        if (stallCheckTimer) { clearInterval(stallCheckTimer); stallCheckTimer = null; }
        if (isHlsUrl(playUrlArg) && Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(playUrlArg);
          hls.attachMedia(videoEl);
          (videoEl as unknown as { _hls?: Hls })._hls = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => doPlay());
          let hlsRecoveryAttempts = 0;
          const MAX_HLS_RECOVERY = 3;
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsRecoveryAttempts < MAX_HLS_RECOVERY) {
                hlsRecoveryAttempts++;
                hls.recoverMediaError();
              } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsRecoveryAttempts < MAX_HLS_RECOVERY) {
                hlsRecoveryAttempts++;
                hls.startLoad();
              } else {
                tryFallbackToIframe();
              }
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            }
          });
          // Stall detection: если currentTime не двигается пока идёт воспроизведение — перезапускаем загрузку
          let lastStallTime = -1;
          stallCheckTimer = setInterval(() => {
            if (videoEl.paused || videoEl.ended || videoEl.hidden) { lastStallTime = -1; return; }
            const ct = videoEl.currentTime;
            if (lastStallTime >= 0 && ct === lastStallTime) {
              try { hls.startLoad(ct); } catch (_) {}
            }
            lastStallTime = ct;
          }, 5000);
        } else {
          videoEl.src = playUrlArg;
        }
        videoEl.addEventListener('error', tryFallbackToIframe, { once: true });
        videoEl.addEventListener('playing', () => {
          const rId = parseInt(state.releaseId, 10);
          const sId = parseInt(state.sourceId, 10);
          window.anix?.addToHistory?.(rId, sId, ep);
          window.anix?.markEpisodeAsWatched?.(rId, sId, ep).catch(() => {});
        }, { once: true });
        doPlay();
      } else {
        iframeEl.src = playUrlArg;
        iframeEl.hidden = false;
        if (videoEl) videoEl.hidden = true;
        const rId = parseInt(state.releaseId, 10);
        const sId = parseInt(state.sourceId, 10);
        window.anix?.addToHistory?.(rId, sId, ep);
        window.anix?.markEpisodeAsWatched?.(rId, sId, ep).catch(() => {});
      }
    };

    applyVideoAndUI(playUrl, useVideo, epNum, title, sourceName, dubberId);

    if (useVideo) {
      bindTimeUpdate();
      videoEl.addEventListener('play', () => {
        updatePlayPauseUI();
        sendCommandToLobby('play');
      });
      videoEl.addEventListener('pause', () => {
        updatePlayPauseUI();
        sendCommandToLobby('pause');
      });
      btnPlayCenter?.addEventListener('click', () => videoEl.play());
      updatePlayPauseUI();
      /** Пытается применить pendingSync, если видео готово. Возвращает true если sync применён. */
      const tryApplyPendingSync = (): boolean => {
        if (!pendingSync || !pendingSync.releaseId || !pendingSync.sourceId || !pendingSync.ep) return false;
        if (videoEl.readyState < 2) return false;
        const sameRE =
          state.releaseId === pendingSync.releaseId &&
          state.sourceId === pendingSync.sourceId &&
          state.ep === Number(pendingSync.ep) &&
          (state.dubberId || '') === (pendingSync.dubberId || '');
        if (!sameRE || videoEl.hidden) return false;
        isApplyingSync = true;
        const remoteTime = typeof pendingSync.currentTime === 'number' ? pendingSync.currentTime : 0;
        videoEl.currentTime = Math.min(remoteTime, videoEl.duration || Infinity);
        const shouldBePaused = !!pendingSync.paused;
        if (shouldBePaused && !videoEl.paused) {
          videoEl.pause();
          preventAutoPlayDueToInitialSyncPause = true;
        } else if (!shouldBePaused && videoEl.paused) {
          videoEl.play().catch(() => {});
        }
        if (applySyncTimer) clearTimeout(applySyncTimer);
        applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 2000);
        pendingSync = null;
        return true;
      };
      const doAutoPlay = () => {
        // Если есть pendingSync — применяем его вместо обычного автоплея.
        if (pendingSync && tryApplyPendingSync()) return;
        // Если серверный sync сказал "пауза", не запускаем автоплей.
        if (preventAutoPlayDueToInitialSyncPause) {
          return;
        }
        // Если мы в процессе применения sync, не запускаем автоплей.
        if (isApplyingSync) return;
        videoEl.play().catch(() => {});
      };
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
        sendCommandToLobby('seek');
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
      if (episodes.length === 0) {
        scrollRoot.innerHTML = '<div class="watch-page__popover-load">Нет серий</div>';
        return;
      }

      // Search input
      const searchWrap = document.createElement('div');
      searchWrap.className = 'watch-page__popover-search-wrap';
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.inputMode = 'numeric';
      searchInput.placeholder = 'Номер серии…';
      searchInput.className = 'watch-page__popover-search';
      searchInput.addEventListener('click', (ev) => ev.stopPropagation());
      searchInput.addEventListener('keydown', (ev) => ev.stopPropagation());
      searchWrap.appendChild(searchInput);
      scrollRoot.appendChild(searchWrap);

      // Episode grid
      const grid = document.createElement('div');
      grid.className = 'watch-page__popover-ep-grid';

      const renderGrid = (filter: string) => {
        grid.innerHTML = '';
        const trimmed = filter.trim();
        const filtered = trimmed !== '' ? episodes.filter(ep => String(ep.position).includes(trimmed)) : episodes;
        filtered.forEach((item) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          const isActive = item.position === state.ep;
          const isWatched = item.is_watched === true;
          btn.className = 'watch-page__popover-ep-cell'
            + (isActive ? ' watch-page__popover-ep-cell--active' : '')
            + (isWatched ? ' watch-page__popover-ep-cell--watched' : '');
          btn.dataset.epPosition = String(item.position);
          btn.innerHTML = `<span class="watch-page__popover-ep-num">${item.position}</span>`;
          if (isWatched) btn.innerHTML += '<span class="watch-page__popover-ep-check">✓</span>';
          btn.addEventListener('click', () => {
            closePopover();
            goToEpisode(item.position);
          });
          grid.appendChild(btn);
        });
        if (filtered.length === 0) {
          grid.innerHTML = '<div class="watch-page__popover-load">Нет результатов</div>';
        }
      };

      renderGrid('');
      scrollRoot.appendChild(grid);
      searchInput.addEventListener('input', () => renderGrid(searchInput.value));

      // Auto-scroll: prefer last watched episode, fallback to current
      let scrollTarget = String(state.ep);
      for (let i = episodes.length - 1; i >= 0; i--) {
        if (episodes[i].is_watched) {
          scrollTarget = String(episodes[i].position);
          break;
        }
      }
      setTimeout(() => {
        const targetEl = grid.querySelector(`[data-ep-position="${scrollTarget}"]`);
        if (targetEl) targetEl.scrollIntoView({ block: 'center', behavior: 'auto' });
      }, 0);
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
      if (types.length === 0) {
        scrollRoot.innerHTML = '<div class="watch-page__popover-load">Нет озвучек</div>';
        return;
      }
      const list = document.createElement('div');
      list.className = 'watch-page__popover-list';
      types.forEach((dubber) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = dubber.id === dubberIdNum;
        btn.className = 'watch-page__popover-item' + (isActive ? ' watch-page__popover-item--active' : '');
        const restoreBtn = () => {
          btn.disabled = false;
          btn.classList.remove('watch-page__popover-item--loading');
          btn.innerHTML = `<span class="watch-page__popover-item-text">${escapeHtml(dubber.name)}</span>${isActive ? '<span class="watch-page__popover-check"><i data-lucide="check"></i></span>' : ''}`;
          if (isActive) createIcons({ icons: { Check }, root: btn });
        };
        btn.innerHTML = `<span class="watch-page__popover-item-text">${escapeHtml(dubber.name)}</span>${isActive ? '<span class="watch-page__popover-check"><i data-lucide="check"></i></span>' : ''}`;
        btn.addEventListener('click', () => {
          if (dubber.id === dubberIdNum) return; // already active, no need to switch
          list.querySelectorAll<HTMLButtonElement>('.watch-page__popover-item').forEach(b => { b.disabled = true; });
          btn.classList.add('watch-page__popover-item--loading');
          btn.innerHTML = `<span class="watch-page__popover-item-text">${escapeHtml(dubber.name)}</span><span class="watch-page__popover-spinner"></span>`;
          window.anix?.getDubberSources(releaseIdNum, dubber.id).then((srcRes: { sources?: Array<{ id: number; name: string }> }) => {
            const sources = srcRes?.sources ?? [];
            const first = sources[0];
            if (first) {
              closePopover();
              switchToDubbing(first.id, first.name, dubber.id);
            } else {
              list.querySelectorAll<HTMLButtonElement>('.watch-page__popover-item').forEach(b => { b.disabled = false; });
              restoreBtn();
            }
          }).catch(() => {
            list.querySelectorAll<HTMLButtonElement>('.watch-page__popover-item').forEach(b => { b.disabled = false; });
            restoreBtn();
          });
        });
        list.appendChild(btn);
      });
      scrollRoot.appendChild(list);
      createIcons({ icons: { Check }, root: list });
    }).catch(() => {
      setLoading('Ошибка загрузки');
    });
  });

  const btnSkip = wrap.querySelector('[data-btn-skip]') as HTMLButtonElement;
  btnSkip?.addEventListener('click', () => {
    if (videoEl && !videoEl.hidden && !isNaN(videoEl.duration)) {
      videoEl.currentTime = Math.min(videoEl.currentTime + 85, videoEl.duration);
      sendCommandToLobby('seek');
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
    // Важно сначала обновить локальное состояние, чтобы в payload улетел правильный ep.
    state.ep = ep;
    loadEpisodeInPlace(releaseIdNum, parseInt(state.sourceId, 10), ep, state.title, state.sourceName, state.dubberId);
    // Передаём currentTime=0 чтобы все участники начинали серию с начала
    sendCommandToLobby('changeEpisode', 0);
  };

  const switchToDubbing = (newSourceId: number, newSourceName: string, newDubberId: number) => {
    closePopover();
    const savedTime = videoEl && !videoEl.hidden && !isNaN(videoEl.currentTime) ? videoEl.currentTime : undefined;
    // Запоминаем паузу ДО смены — чтобы после загрузки новой озвучки состояние воспроизведения совпало
    const wasPaused = !!(videoEl && !videoEl.hidden && videoEl.paused);
    state.sourceId = String(newSourceId);
    state.sourceName = newSourceName;
    state.dubberId = String(newDubberId);
    // Сначала отправляем команду (пока isApplyingSync ещё false), затем блокируем исходящие события
    sendCommandToLobby('changeEpisode');
    isApplyingSync = true;
    loadEpisodeInPlace(releaseIdNum, newSourceId, state.ep, title, newSourceName, String(newDubberId), savedTime, wasPaused);
    if (applySyncTimer) clearTimeout(applySyncTimer);
    applySyncTimer = setTimeout(() => { isApplyingSync = false; applySyncTimer = null; }, 4000);
  };

  btnNext?.addEventListener('click', () => {
    goToEpisode(state.ep + 1);
  });

  btnFullscreen?.addEventListener('click', () => {
    window.electron?.togglePlayerFullScreen?.();
  });

  if (volumeInput && videoEl) {
    try {
      const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      const volNum = stored != null ? Number(stored) : NaN;
      if (!Number.isNaN(volNum) && volNum >= 0 && volNum <= 100) {
        volumeInput.value = String(volNum);
        videoEl.volume = volNum / 100;
      }
    } catch {
      // ignore localStorage errors
    }

    volumeInput.addEventListener('input', () => {
      const v = Number(volumeInput.value) / 100;
      const clamped = Math.max(0, Math.min(1, v));
      videoEl.volume = clamped;
      try {
        window.localStorage.setItem(VOLUME_STORAGE_KEY, String(Math.round(clamped * 100)));
      } catch {
        // ignore localStorage errors
      }
    });
    volumeInput.addEventListener('click', (e) => e.stopPropagation());
  }

  // ── Lobby Vote UI (в правом верхнем углу плеера) ──
  const voteContainer = document.createElement('div');
  voteContainer.className = 'player-vote';
  voteContainer.hidden = true;
  playerWrap.appendChild(voteContainer);

  let voteCountdownTimer: ReturnType<typeof setInterval> | null = null;

  const hideVoteUI = () => {
    if (voteCountdownTimer) {
      clearInterval(voteCountdownTimer);
      voteCountdownTimer = null;
    }
    voteContainer.hidden = true;
    voteContainer.innerHTML = '';
    voteContainer.className = 'player-vote';
  };

  const showVoteUI = (data: { proposalId: string; proposerLogin: string; playback: { title?: string; ep?: string; sourceName?: string } }) => {
    hideVoteUI();
    voteContainer.hidden = false;
    voteContainer.className = 'player-vote player-vote--visible';

    const animeTitle = data.playback?.title || 'Неизвестное аниме';
    const epText = data.playback?.ep ? `${data.playback.ep} серия` : '';
    const srcText = data.playback?.sourceName || '';
    const meta = [epText, srcText].filter(Boolean).join(' · ');

    voteContainer.innerHTML = `
      <div class="player-vote__card">
        <div class="player-vote__header">
          <div class="player-vote__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <span class="player-vote__label">Голосование</span>
          <div class="player-vote__timer" data-vote-countdown>30</div>
        </div>
        <div class="player-vote__body">
          <div class="player-vote__proposer"><span class="player-vote__name">${escapeHtml(data.proposerLogin)}</span> предлагает:</div>
          <div class="player-vote__anime">
            <div class="player-vote__anime-title">${escapeHtml(animeTitle)}</div>
            ${meta ? `<div class="player-vote__anime-meta">${escapeHtml(meta)}</div>` : ''}
          </div>
          <div class="player-vote__progress">
            <div class="player-vote__progress-bar" data-vote-progress></div>
          </div>
        </div>
        <div class="player-vote__actions">
          <button class="player-vote__btn player-vote__btn--accept" data-vote-accept>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Принять
          </button>
          <button class="player-vote__btn player-vote__btn--reject" data-vote-reject>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Отмена
          </button>
        </div>
      </div>
    `;

    const acceptBtn = voteContainer.querySelector('[data-vote-accept]') as HTMLButtonElement;
    const rejectBtn = voteContainer.querySelector('[data-vote-reject]') as HTMLButtonElement;
    const countdownEl = voteContainer.querySelector('[data-vote-countdown]') as HTMLElement;
    const progressBarEl = voteContainer.querySelector('[data-vote-progress]') as HTMLElement;

    const startTime = Date.now();
    const VOTE_TIMEOUT = 30;

    voteCountdownTimer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, VOTE_TIMEOUT - Math.floor(elapsed));
      const progress = Math.max(0, 1 - elapsed / VOTE_TIMEOUT);
      if (countdownEl) countdownEl.textContent = String(remaining);
      if (progressBarEl) progressBarEl.style.transform = `scaleX(${progress})`;
      if (remaining <= 0) hideVoteUI();
    }, 250);

    acceptBtn?.addEventListener('click', () => {
      window.electron?.sendLobbyVote?.(data.proposalId, true);
      acceptBtn.disabled = true;
      rejectBtn.disabled = true;
      acceptBtn.classList.add('player-vote__btn--voted');
      acceptBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Голос принят';
    });

    rejectBtn?.addEventListener('click', () => {
      window.electron?.sendLobbyVote?.(data.proposalId, false);
      hideVoteUI();
    });
  };

  const showWaitingUI = (data: { newPlayback?: { title?: string; ep?: string } }) => {
    hideVoteUI();
    voteContainer.hidden = false;
    voteContainer.className = 'player-vote player-vote--visible player-vote--waiting';

    const animeTitle = data.newPlayback?.title || 'новое аниме';

    voteContainer.innerHTML = `
      <div class="player-vote__card">
        <div class="player-vote__header">
          <div class="player-vote__icon player-vote__icon--waiting">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <span class="player-vote__label">Ожидание</span>
        </div>
        <div class="player-vote__body">
          <div class="player-vote__waiting-text">Ожидаем ответа на смену:</div>
          <div class="player-vote__anime">
            <div class="player-vote__anime-title">${escapeHtml(animeTitle)}</div>
          </div>
          <div class="player-vote__spinner"></div>
        </div>
      </div>
    `;
  };

  const showResultToast = (text: string, type: 'accepted' | 'rejected') => {
    hideVoteUI();
    voteContainer.hidden = false;
    voteContainer.className = `player-vote player-vote--visible player-vote--toast player-vote--toast-${type}`;
    voteContainer.innerHTML = `<div class="player-vote__toast">${escapeHtml(text)}</div>`;
    setTimeout(() => {
      hideVoteUI();
    }, 3000);
  };

  // ── Dynamic content change (no player reload) ──
  window.addEventListener('player:changeContent', ((e: CustomEvent) => {
    const p = e.detail as {
      releaseId?: string; sourceId?: string; ep?: string; dubberId?: string;
      title?: string; sourceName?: string; paused?: boolean; currentTime?: number;
      local?: boolean; // true = user-initiated from main window; false = remote sync
    };
    if (!p || !p.releaseId || !p.sourceId || !p.ep) return;

    // Update title in the UI header
    const titleEl = wrap.querySelector('.watch-page__title') as HTMLElement | null;
    if (titleEl && p.title) titleEl.textContent = p.title;

    // Update state BEFORE loading (applyVideoAndUI doesn't update releaseId/sourceId)
    state.releaseId = p.releaseId;
    state.sourceId = p.sourceId;
    state.ep = parseInt(p.ep, 10);
    state.title = p.title || state.title;
    state.sourceName = p.sourceName || '';
    state.dubberId = p.dubberId || '';

    // If local (user-initiated from main window), send changeEpisode to lobby BEFORE blocking
    // Передаём currentTime из payload (или 0) чтобы все начинали с нужного момента
    if (p.local) {
      sendCommandToLobby('changeEpisode', typeof p.currentTime === 'number' ? p.currentTime : 0);
    }

    // Block outgoing commands while loading new content
    isApplyingSync = true;

    loadEpisodeInPlace(
      parseInt(p.releaseId, 10),
      parseInt(p.sourceId, 10),
      parseInt(p.ep, 10),
      p.title || state.title,
      p.sourceName || '',
      p.dubberId || '',
      typeof p.currentTime === 'number' ? p.currentTime : undefined,
      !!p.paused
    );

    // Keep isApplyingSync until the new video starts loading
    if (applySyncTimer) clearTimeout(applySyncTimer);
    applySyncTimer = setTimeout(() => {
      isApplyingSync = false;
      applySyncTimer = null;
    }, 4000);
  }) as EventListener);

  // Слушаем proposal-события из IPC
  window.addEventListener('lobby:proposal', ((e: CustomEvent) => {
    const data = e.detail as { type: string; proposalId?: string; proposerLogin?: string; playback?: any; newPlayback?: any; reason?: string };
    if (!data) return;

    if (data.type === 'vote' && data.proposalId) {
      showVoteUI({
        proposalId: data.proposalId,
        proposerLogin: data.proposerLogin ?? 'Участник',
        playback: data.playback ?? {},
      });
    } else if (data.type === 'waiting') {
      showWaitingUI({ newPlayback: data.newPlayback });
    } else if (data.type === 'accepted') {
      showResultToast('Смена аниме одобрена!', 'accepted');
    } else if (data.type === 'rejected') {
      const text = data.reason === 'timeout' ? 'Время голосования истекло' : 'Смена аниме отклонена';
      showResultToast(text, 'rejected');
    }
  }) as EventListener);

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
      const clampedRemote = Math.min(remoteTime, videoEl.duration || Infinity);
      // Для жёсткой синхронизации всегда доверяем времени сервера.
      videoEl.currentTime = clampedRemote;
      const shouldBePaused = !!p.paused;
      if (shouldBePaused && !videoEl.paused) {
        videoEl.pause();
        // Первый authoritative sync зафиксировал "пауза" — блокируем автоплей.
        preventAutoPlayDueToInitialSyncPause = true;
      } else if (!shouldBePaused && videoEl.paused) {
        videoEl.play().catch(() => {});
      }
    } else if (sameReleaseAndEpisode && videoEl && !videoEl.hidden && videoEl.readyState < 2) {
      // Видео ещё не готово — сохраняем sync и применим его после loadedmetadata.
      pendingSync = p;
    } else if (!sameReleaseAndEpisode && window.anix?.getEpisode) {
      // Update releaseId/sourceId in state (applyVideoAndUI doesn't do this)
      state.releaseId = p.releaseId;
      state.sourceId = p.sourceId;
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
    // Use a long debounce to prevent echo — video play/pause events
    // fire asynchronously after we set currentTime / call play()/pause().
    // Also covers the case when pending sync is stored and applied later
    // (on loadedmetadata) — we keep isApplyingSync=true to block commands
    // from the initial video load events (play at 0:00).
    if (applySyncTimer) clearTimeout(applySyncTimer);
    const debounceMs = pendingSync ? 3000 : 1500;
    applySyncTimer = setTimeout(() => {
      isApplyingSync = false;
      applySyncTimer = null;
    }, debounceMs);
  }) as EventListener);

  // ── Лобби: панель аватаров и лог действий ──

  const LOBBY_LOG_MAX = 5;
  const LOBBY_LOG_TTL = 10000;

  type LobbyActivityEntry = { type: string; login: string; avatar?: string | null };

  const lobbyActionText = (type: string): string => {
    switch (type) {
      case 'play':         return 'продолжил просмотр';
      case 'pause':        return 'поставил на паузу';
      case 'seek':         return 'перемотал';
      case 'changeEpisode':return 'сменил серию/озвучку';
      case 'joined':       return 'присоединился к просмотру';
      case 'left':         return 'покинул комнату';
      case 'proposal':     return 'предложил другое аниме';
      default:             return type;
    }
  };

  const addLobbyLogEntry = (entry: LobbyActivityEntry) => {
    if (!lobbyLogEl) return;
    const el = document.createElement('div');
    el.className = 'watch-lobby-log__entry watch-lobby-log__entry--entering';
    el.innerHTML = `<span class="watch-lobby-log__name">${escapeHtml(entry.login)}</span><span class="watch-lobby-log__action">${escapeHtml(lobbyActionText(entry.type))}</span>`;
    lobbyLogEl.appendChild(el);

    // Trigger enter animation on next frame
    requestAnimationFrame(() => el.classList.remove('watch-lobby-log__entry--entering'));

    // Remove entries beyond max visible
    const allEntries = Array.from(lobbyLogEl.querySelectorAll<HTMLElement>('.watch-lobby-log__entry'));
    if (allEntries.length > LOBBY_LOG_MAX) {
      allEntries.slice(0, allEntries.length - LOBBY_LOG_MAX).forEach((old) => old.remove());
    }

    // Auto-expire
    const expireTimer = setTimeout(() => {
      el.classList.add('watch-lobby-log__entry--leaving');
      setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
    }, LOBBY_LOG_TTL);
    (el as unknown as { _expireTimer: ReturnType<typeof setTimeout> })._expireTimer = expireTimer;
  };

  const renderLobbyAvatars = (participants: Array<{ login: string; avatar?: string | null; peerId?: string | null }>) => {
    if (!lobbyAvatarsEl) return;
    lobbyAvatarsEl.innerHTML = '';
    const MAX_SHOWN = 7;
    const shown = participants.slice(0, MAX_SHOWN);
    shown.forEach((p) => {
      const av = document.createElement('div');
      av.className = 'watch-lobby-avatar';
      av.title = p.login;
      if (p.avatar) {
        const img = document.createElement('img');
        img.src = p.avatar;
        img.alt = p.login;
        img.className = 'watch-lobby-avatar__img';
        img.onerror = () => { img.remove(); av.textContent = (p.login[0] ?? '?').toUpperCase(); };
        av.appendChild(img);
      } else {
        av.textContent = (p.login[0] ?? '?').toUpperCase();
      }
      lobbyAvatarsEl.appendChild(av);
    });
    if (participants.length > MAX_SHOWN) {
      const more = document.createElement('div');
      more.className = 'watch-lobby-avatar watch-lobby-avatar--more';
      more.textContent = `+${participants.length - MAX_SHOWN}`;
      lobbyAvatarsEl.appendChild(more);
    }
    if (lobbyPanel) lobbyPanel.hidden = participants.length === 0;
  };

  // Получаем список участников от главного окна
  window.addEventListener('lobby:participantsList', ((e: CustomEvent) => {
    const participants = Array.isArray(e.detail) ? e.detail : [];
    renderLobbyAvatars(participants);
  }) as EventListener);

  // Получаем события действий (play/pause/seek/join/leave/proposal)
  window.addEventListener('lobby:activityFeed', ((e: CustomEvent) => {
    const data = e.detail as LobbyActivityEntry | null;
    if (data?.type && data.login) {
      addLobbyLogEntry(data);
    }
  }) as EventListener);

  return wrap;
}
