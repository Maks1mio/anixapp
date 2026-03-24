/**
 * Предпросмотр моделей Anime4K
 * HLS-видео с пресетами, цикл, split-сравнение оригинал vs фильтр.
 */

import Hls from 'hls.js';
import {
  DoG, BilateralMean, CNNM, CNNSoftM, CNNSoftVL, CNNVL, CNNUL, GANUUL,
  CNNx2M, CNNx2VL, DenoiseCNNx2VL, CNNx2UL, GANx3L, GANx4UUL,
  ModeA, ModeB, ModeC, ModeAA, ModeBB, ModeCA,
  render as anime4kRender,
} from 'anime4k-webgpu';
import { initTheme } from './services/themes';
import { initTooltipSystem } from './utils/body-tooltip';
import './styles/titlebar.scss';

// ── Пресеты ───────────────────────────────────────────────────────────────────
interface Preset {
  label: string;
  url?: string;
  kodikPageUrl?: string;
  start: number;
  end: number;
}

const PRESETS: Preset[] = [
  { label: 'ДжоДжо 1 серия', kodikPageUrl: 'https://kodikplayer.com/seria/1583465/da5c70be6ea53735ed3844d789941714/720p', start: 28, end: 70 },
  { label: 'Ван-Пис 171 серия', kodikPageUrl: 'https://kodikplayer.com/seria/512025/e8177f2aca5e09f8f90167aff2ddd8e3/720p', start: 175, end: 189 },
  { label: 'Ван-Пис: Письмо от поклонника', kodikPageUrl: 'https://kodikplayer.com/video/106704/235f5bfa32b527fb1c3ed5935719853e/720p', start: 14, end: 69 },
  { label: 'Коносуба 2 серия', kodikPageUrl: 'https://kodikplayer.com/seria/630039/29e0f0e323046754d572ea8072007d2b/720p', start: 354, end: 404 },
  { label: 'Семья шпиона 2 Опенинг', kodikPageUrl: 'https://kodikplayer.com/seria/1222385/a2bd04af3761c536aa7fca1beeed5c21/720p', start: 6, end: 96 },
];

// ── Режимы Anime4K ────────────────────────────────────────────────────────────
const MODES: { id: number; label: string; desc: string; group: string }[] = [
  { id: -1, label: 'Оригинал', desc: 'Без фильтра', group: '' },
  { id: 14, label: 'ModeA', desc: 'Быстрый пресет', group: 'Preset' },
  { id: 15, label: 'ModeB', desc: 'Сбалансированный', group: 'Preset' },
  { id: 16, label: 'ModeC', desc: 'Качественный', group: 'Preset' },
  { id: 17, label: 'ModeA+A', desc: 'Расширенный A', group: 'Preset' },
  { id: 18, label: 'ModeB+B', desc: 'Улучшенный B', group: 'Preset' },
  { id: 19, label: 'ModeC+A', desc: 'Комбинированный', group: 'Preset' },
  { id: 0, label: 'DoG', desc: 'Deblur', group: 'Deblur' },
  { id: 1, label: 'BilateralMean', desc: 'Denoise', group: 'Denoise' },
  { id: 2, label: 'CNNM', desc: 'Restore', group: 'Restore' },
  { id: 3, label: 'CNNSoftM', desc: 'Restore', group: 'Restore' },
  { id: 4, label: 'CNNSoftVLM', desc: 'Restore', group: 'Restore' },
  { id: 5, label: 'CNNVL', desc: 'Restore', group: 'Restore' },
  { id: 6, label: 'CNNUL', desc: 'Restore', group: 'Restore' },
  { id: 7, label: 'GANUUL', desc: 'Restore', group: 'Restore' },
  { id: 8, label: 'CNNx2M', desc: 'Upscale ×2', group: 'Upscale' },
  { id: 9, label: 'CNNx2VL', desc: 'Upscale ×2', group: 'Upscale' },
  { id: 10, label: 'DenoiseCNNx2VL', desc: 'Upscale ×2', group: 'Upscale' },
  { id: 11, label: 'CNNx2UL', desc: 'Upscale ×2', group: 'Upscale' },
  { id: 12, label: 'GANx3L', desc: 'Upscale ×3', group: 'Upscale' },
  { id: 13, label: 'GANx4UUL', desc: 'Upscale ×4', group: 'Upscale' },
];

const MODE_MAP: Record<number, new (opts: object) => unknown> = {
  0: DoG, 1: BilateralMean, 2: CNNM, 3: CNNSoftM, 4: CNNSoftVL,
  5: CNNVL, 6: CNNUL, 7: GANUUL,
  8: CNNx2M, 9: CNNx2VL, 10: DenoiseCNNx2VL, 11: CNNx2UL,
  12: GANx3L, 13: GANx4UUL,
  14: ModeA, 15: ModeB, 16: ModeC, 17: ModeAA, 18: ModeBB, 19: ModeCA,
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentModeId = 15;
let upscaleStopFn: (() => void) | null = null;
let videoReady = false;
let splitPercent = 50;
let isDragging = false;
let currentPresetIdx = 0;
let loopStart = PRESETS[0].start;
let loopEnd = PRESETS[0].end;
let hlsInstance: Hls | null = null;
let leftPanelOpen = true;
let rightPanelOpen = true;
let timelineRaf = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function parseTimecode(s: string): number {
  const parts = s.trim().split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number(parts[0]) || 0;
}

initTheme();
initTooltipSystem();

// ── Groups for modes ───────────────────────────────────────────────────────────
const MODE_GROUPS = ['', 'Preset', 'Deblur', 'Denoise', 'Restore', 'Upscale'];

// ── DOM ───────────────────────────────────────────────────────────────────────
const root = document.getElementById('app')!;
root.innerHTML = `
<div class="ut-root">
  <div class="titlebar">
    <div class="titlebar__drag">
      <span class="titlebar__logo"><img src="logo/512x512.png" alt="" class="titlebar__logo-img" /></span>
      <span class="titlebar__title">Предпросмотр моделей</span>
    </div>
    <div class="titlebar__controls">
      <button type="button" class="titlebar__btn titlebar__btn--min" id="btn-tool-min" aria-label="Свернуть"></button>
      <button type="button" class="titlebar__btn titlebar__btn--max" id="btn-tool-max" aria-label="Развернуть"></button>
      <button type="button" class="titlebar__btn titlebar__btn--close" id="btn-tool-close" aria-label="Закрыть"></button>
    </div>
  </div>

  <div class="ut-layout">
    <!-- Left: Presets list (full height) -->
    <aside class="ut-panel ut-panel--left" id="panel-left">
      <button class="ut-panel__tog" id="tog-left" aria-label="Свернуть серии">‹</button>
      <div class="ut-panel__inner">
        <div class="ut-panel__title">Серии</div>
        <div class="ut-list ut-list--presets" id="preset-list"></div>
      </div>
    </aside>

    <!-- Center: Video -->
    <main class="ut-main">
      <div class="ut-video-wrap" id="video-wrap">
        <video id="video" crossorigin="anonymous" playsinline muted></video>
        <canvas id="canvas" hidden></canvas>
        <div class="ut-split" id="split" hidden>
          <div class="ut-split__line" id="split-line-el"></div>
          <div class="ut-split__handle" id="split-handle">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M7 5L2 10L7 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13 5L18 10L13 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <span class="ut-split__label ut-split__label--left" id="split-left-lbl">Оригинал</span>
          <span class="ut-split__label ut-split__label--right" id="split-right-lbl">Фильтр</span>
        </div>
        <div class="ut-overlay" id="overlay">
          <div class="ut-spinner"></div>
          <div id="overlay-text">Загрузка…</div>
        </div>
      </div>
      <div class="ut-controls">
        <button class="ut-btn ut-btn--icon" id="btn-playpause" disabled title="Воспроизведение">▶</button>
        <div class="ut-timeline" id="timeline">
          <div class="ut-timeline__track"><div class="ut-timeline__playhead" id="timeline-playhead"></div></div>
        </div>
        <span class="ut-time" id="tc-display">0:00</span>
        <input class="ut-tc-input" id="tc-input" type="text" value="0:00" title="Тайм-код">
        <button class="ut-btn" id="btn-seek">Перейти</button>
      </div>
    </main>

    <!-- Right: Models list (full height) -->
    <aside class="ut-panel ut-panel--right" id="panel-right">
      <button class="ut-panel__tog" id="tog-right" aria-label="Свернуть модели">›</button>
      <div class="ut-panel__inner">
        <div class="ut-panel__title">Модели</div>
        <div class="ut-list ut-list--modes" id="mode-groups"></div>
        <div class="ut-status" id="status"></div>
      </div>
    </aside>
  </div>
</div>`;

// ── Styles ────────────────────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-sans); height: 100vh; overflow: hidden; }
.ut-root { display: flex; flex-direction: column; height: 100vh; }
.ut-layout { display: flex; flex: 1; min-height: 0; }

.ut-panel {
  background: var(--color-surface); border: 1px solid var(--color-border);
  display: flex; flex-direction: column; position: relative;
  transition: width .2s ease;
}
.ut-panel--left { border-right: none; width: 200px; }
.ut-panel--right { border-left: none; width: 220px; }
.ut-panel.collapsed { width: 0 !important; min-width: 0 !important; overflow: visible; flex-shrink: 0; }
.ut-panel.collapsed .ut-panel__inner { display: none; }
.ut-panel__tog {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 20px; height: 48px; border: none; border-radius: 0 4px 4px 0;
  background: var(--color-surface-hover); color: var(--color-text-muted);
  cursor: pointer; font-size: 1rem; z-index: 10;
  display: flex; align-items: center; justify-content: center;
}
.ut-panel--left .ut-panel__tog { right: -20px; }
.ut-panel--right .ut-panel__tog { left: -20px; border-radius: 4px 0 0 4px; }
.ut-panel__tog:hover { background: var(--color-border); color: var(--color-text); }
.ut-panel.collapsed .ut-panel__tog { width: 24px; height: 56px; }
.ut-panel--left.collapsed .ut-panel__tog { right: auto; left: 0; border-radius: 0 6px 6px 0; }
.ut-panel--right.collapsed .ut-panel__tog { left: auto; right: 0; border-radius: 6px 0 0 6px; }
.ut-panel__inner { padding: 12px; flex: 1; display: flex; flex-direction: column; min-height: 0; }
.ut-panel__title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--color-text-muted); margin-bottom: 8px; flex-shrink: 0; }

.ut-list { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 2px; }
.ut-list::-webkit-scrollbar { width: 5px; }
.ut-list::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }
.ut-list-item {
  display: block; width: 100%; text-align: left; padding: 10px 12px;
  border: none; background: none; border-radius: 6px; color: var(--color-text-muted);
  font-size: 0.85rem; cursor: pointer; transition: background .12s, color .12s;
  flex-shrink: 0;
}
.ut-list-item:hover { background: var(--color-surface-hover); color: var(--color-text); }
.ut-list-item--active { background: color-mix(in srgb, var(--color-accent) 18%, transparent); color: var(--color-accent); font-weight: 600; }

.ut-mode-groups { display: flex; flex-direction: column; gap: 2px; }
.ut-mode-group { margin-bottom: 6px; }
.ut-mode-group__head { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-muted); padding: 4px 0; }
.ut-mode-item {
  display: block; width: 100%; text-align: left; padding: 8px 12px;
  border: none; background: none; border-radius: 6px; color: var(--color-text-muted);
  font-size: 0.82rem; cursor: pointer; transition: background .12s, color .12s;
}
.ut-mode-item:hover { background: var(--color-surface-hover); color: var(--color-text); }
.ut-mode-item--active { background: color-mix(in srgb, var(--color-accent) 18%, transparent); color: var(--color-accent); font-weight: 600; }
.ut-mode-item--upscale { border-left: 3px solid rgba(239,68,68,0.5); }

.ut-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.ut-video-wrap { flex: 1; position: relative; background: #000; min-height: 0; user-select: none; }
#video, #canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; display: block;
}
#canvas { will-change: transform; transform: translateZ(0); backface-visibility: hidden; image-rendering: smooth; }
#video { background: #000; }

.ut-split { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.ut-split__line { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: rgba(255,255,255,.9); transform: translateX(-50%); }
.ut-split__handle {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  width: 40px; height: 40px; border-radius: 50%; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.6);
  display: flex; align-items: center; justify-content: center; cursor: ew-resize; pointer-events: all; color: #333;
}
.ut-split__label { position: absolute; top: 10px; background: rgba(0,0,0,.7); color: #fff; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
.ut-split__label--left { left: 10px; right: auto; }
.ut-split__label--right { left: auto; right: 10px; }

.ut-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: rgba(0,0,0,.8); z-index: 10; font-size: 0.85rem; color: var(--color-text-muted); }
.ut-overlay.hidden { opacity: 0; pointer-events: none; }
.ut-spinner { width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; border-top-color: var(--color-accent); animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.ut-controls {
  flex-shrink: 0; padding: 8px 12px; background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  display: flex; align-items: center; gap: 10px; font-size: 0.8rem;
}
.ut-btn { padding: 6px 12px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 6px; color: var(--color-text); cursor: pointer; font-size: 0.78rem; }
.ut-btn:hover:not(:disabled) { background: var(--color-surface-hover); }
.ut-btn:disabled { opacity: .4; cursor: default; }
.ut-btn--icon { width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; }
.ut-timeline { flex: 1; min-width: 80px; cursor: pointer; }
.ut-timeline__track { position: relative; height: 20px; background: var(--color-bg); border-radius: 4px; overflow: hidden; }
.ut-timeline__playhead { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; background: var(--color-accent); border-radius: 2px; transition: none; }
.ut-time { color: var(--color-text-muted); min-width: 36px; font-variant-numeric: tabular-nums; }
.ut-tc-input { width: 52px; padding: 4px 6px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-text); font-size: 0.78rem; text-align: center; }
.ut-tc-input:focus { outline: none; border-color: var(--color-accent); }
.ut-status { font-size: 0.72rem; color: var(--color-text-muted); margin-top: 8px; flex-shrink: 0; }
`;
document.head.appendChild(style);

// ── Refs ──────────────────────────────────────────────────────────────────────
const videoEl = document.getElementById('video') as HTMLVideoElement;
const canvasEl = document.getElementById('canvas') as HTMLCanvasElement;
const overlayEl = document.getElementById('overlay') as HTMLElement;
const overlayTxt = document.getElementById('overlay-text') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const presetList = document.getElementById('preset-list') as HTMLElement;
const modeGroups = document.getElementById('mode-groups') as HTMLElement;
const videoWrap = document.getElementById('video-wrap') as HTMLElement;
const splitEl = document.getElementById('split') as HTMLElement;
const splitHandle = document.getElementById('split-handle') as HTMLElement;
const splitLineEl = document.getElementById('split-line-el') as HTMLElement;
const splitLeftLbl = document.getElementById('split-left-lbl') as HTMLElement;
const splitRightLbl = document.getElementById('split-right-lbl') as HTMLElement;
const playPauseBtn = document.getElementById('btn-playpause') as HTMLButtonElement;
const tcInput = document.getElementById('tc-input') as HTMLInputElement;
const tcDisplay = document.getElementById('tc-display') as HTMLElement;
const seekBtn = document.getElementById('btn-seek') as HTMLButtonElement;
const timelineEl = document.getElementById('timeline') as HTMLElement;
const timelinePh = document.getElementById('timeline-playhead') as HTMLElement;
const panelLeft = document.getElementById('panel-left') as HTMLElement;
const panelRight = document.getElementById('panel-right') as HTMLElement;

// ── Panel toggles (стрелка меняется: свернуто → раскрыть, открыто → свернуть) ───
const togLeft = document.getElementById('tog-left') as HTMLButtonElement;
const togRight = document.getElementById('tog-right') as HTMLButtonElement;
function updateTogLabels() {
  if (togLeft) togLeft.textContent = leftPanelOpen ? '‹' : '›';
  if (togRight) togRight.textContent = rightPanelOpen ? '›' : '‹';
}
document.getElementById('tog-left')?.addEventListener('click', () => {
  leftPanelOpen = !leftPanelOpen;
  panelLeft.classList.toggle('collapsed', !leftPanelOpen);
  updateTogLabels();
});
document.getElementById('tog-right')?.addEventListener('click', () => {
  rightPanelOpen = !rightPanelOpen;
  panelRight.classList.toggle('collapsed', !rightPanelOpen);
  updateTogLabels();
});

// ── Mode groups UI ─────────────────────────────────────────────────────────────
function buildModeGroups() {
  modeGroups.innerHTML = '';
  MODE_GROUPS.forEach(group => {
    const items = MODES.filter(m => m.group === group);
    if (items.length === 0) return;
    const div = document.createElement('div');
    div.className = 'ut-mode-group';
    div.innerHTML = `<div class="ut-mode-group__head">${group || 'Без фильтра'}</div>`;
    items.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'ut-mode-item' + (m.id === currentModeId ? ' ut-mode-item--active' : '') + (m.group === 'Upscale' ? ' ut-mode-item--upscale' : '');
      btn.textContent = m.label;
      btn.dataset.id = String(m.id);
      btn.addEventListener('click', () => selectMode(m.id));
      div.appendChild(btn);
    });
    modeGroups.appendChild(div);
  });
}

function selectMode(id: number) {
  currentModeId = id;
  modeGroups.querySelectorAll('.ut-mode-item').forEach(btn => {
    const bid = Number((btn as HTMLElement).dataset.id);
    btn.classList.toggle('ut-mode-item--active', bid === id);
  });
  if (videoReady) {
    void applyUpscale().then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => playOneFrame()));
    });
  }
}

function playOneFrame() {
  if (!videoReady || !videoEl) return;
  const t = videoEl.currentTime;
  const frameStep = 1 / 30;
  let next = t + frameStep;
  if (next >= loopEnd - 0.01) {
    next = Math.max(loopStart, t - frameStep);
  } else {
    next = Math.min(next, loopEnd - 0.01);
  }
  if (Math.abs(next - t) < 0.001) {
    next = t + 0.034;
    if (next >= loopEnd - 0.01) next = Math.max(loopStart, t - 0.034);
  }
  videoEl.currentTime = next;
  const wasPaused = videoEl.paused;
  if (!wasPaused) return;
  const stop = () => { videoEl.pause(); };
  videoEl.play().then(() => {
    if ('requestVideoFrameCallback' in videoEl) {
      (videoEl as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number })
        .requestVideoFrameCallback(stop);
    } else {
      videoEl.addEventListener('timeupdate', stop, { once: true });
      setTimeout(stop, 120);
    }
  }).catch(() => {});
}

buildModeGroups();

// ── Preset list (full height) ──────────────────────────────────────────────────
function buildPresetList() {
  presetList.innerHTML = '';
  PRESETS.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.className = 'ut-list-item' + (i === currentPresetIdx ? ' ut-list-item--active' : '');
    btn.textContent = p.label;
    btn.dataset.idx = String(i);
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (idx !== currentPresetIdx) loadPreset(idx);
    });
    presetList.appendChild(btn);
  });
}

function updatePresetListActive() {
  presetList.querySelectorAll('.ut-list-item').forEach((btn, i) => {
    btn.classList.toggle('ut-list-item--active', i === currentPresetIdx);
  });
}

buildPresetList();

async function resolvePresetUrl(preset: Preset): Promise<string> {
  if (preset.url) return preset.url;
  if (preset.kodikPageUrl && typeof (window as any).anixApi?.release?.getDirectVideoLink === 'function') {
    const { directUrl } = await (window as any).anixApi.release.getDirectVideoLink(preset.kodikPageUrl);
    if (directUrl) return (directUrl.startsWith('http') ? directUrl : `https:${directUrl}`).replace(/\?.*$/, '');
  }
  throw new Error('Не удалось получить ссылку с Kodik');
}

async function loadPreset(idx: number) {
  currentPresetIdx = idx;
  const preset = PRESETS[idx];
  loopStart = preset.start;
  loopEnd = preset.end;

  updatePresetListActive();
  tcInput.value = formatTime(preset.start);
  tcDisplay.textContent = formatTime(preset.start);

  videoReady = false;
  playPauseBtn.disabled = true;
  overlayEl.classList.remove('hidden');
  overlayTxt.textContent = preset.kodikPageUrl ? 'Получение ссылки…' : 'Загрузка…';
  statusEl.textContent = '';

  if (upscaleStopFn) { try { upscaleStopFn(); } catch (_) {} upscaleStopFn = null; }
  canvasEl.hidden = true;
  splitEl.hidden = true;
  if (hlsInstance) { try { hlsInstance.destroy(); } catch (_) {} hlsInstance = null; }

  try {
    const playUrl = await resolvePresetUrl(preset);
    overlayTxt.textContent = `Переход к ${formatTime(preset.start)}…`;
    initHls(playUrl, preset.start);
  } catch (err) {
    overlayTxt.textContent = String(err?.message || err || 'Ошибка');
    statusEl.textContent = 'Ошибка';
  }
}

function initHls(url: string, targetTime: number) {
  const hls = new Hls();
  hlsInstance = hls;
  hls.loadSource(url);
  hls.attachMedia(videoEl);
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    overlayTxt.textContent = `Переход к ${formatTime(targetTime)}…`;
    videoEl.currentTime = targetTime;
    videoEl.play().catch(() => {});
  });
  hls.on(Hls.Events.ERROR, (_, data) => {
    if (!data.fatal || hlsInstance !== hls) return;
    overlayEl.classList.remove('hidden');
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    else hls.startLoad(targetTime);
    videoEl.currentTime = targetTime;
    videoEl.play().catch(() => {});
  });
}

void loadPreset(0);

videoEl.addEventListener('seeked', () => {
  if (videoReady) return;
  videoReady = true;
  overlayEl.classList.add('hidden');
  playPauseBtn.disabled = false;
  statusEl.textContent = '';
  applyUpscale();
});

// ── Timeline (throttled, no jitter) ────────────────────────────────────────────
function updateTimeline() {
  if (!videoReady || !timelineEl) return;
  const t = videoEl.currentTime;
  const duration = loopEnd - loopStart;
  const pct = duration > 0 ? Math.max(0, Math.min(1, (t - loopStart) / duration)) : 0;
  timelinePh.style.left = (pct * 100) + '%';
  tcDisplay.textContent = formatTime(t);
  tcInput.value = formatTime(t);
}

videoEl.addEventListener('timeupdate', () => {
  if (!videoReady) return;
  if (videoEl.currentTime >= loopEnd) {
    videoEl.currentTime = loopStart;
    if (!videoEl.paused) videoEl.play().catch(() => {});
  }
  if (timelineRaf) return;
  timelineRaf = requestAnimationFrame(() => {
    timelineRaf = 0;
    updateTimeline();
  });
});

function seekFromTimeline(clientX: number) {
  if (!timelineEl) return;
  const rect = timelineEl.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const t = loopStart + pct * (loopEnd - loopStart);
  videoEl.currentTime = t;
  updateTimeline();
}

timelineEl?.addEventListener('click', (e) => { if (videoReady) seekFromTimeline(e.clientX); });
let timelineDragging = false;
timelineEl?.addEventListener('mousedown', (e) => { if (videoReady && e.button === 0) timelineDragging = true; });
document.addEventListener('mousemove', (e) => { if (timelineDragging && videoReady) seekFromTimeline(e.clientX); });
document.addEventListener('mouseup', () => { timelineDragging = false; });

// ── Play / Pause (без микро-seek — устраняет подёргивание) ─────────────────────
playPauseBtn.addEventListener('click', () => {
  if (videoEl.paused) {
    let t = videoEl.currentTime;
    if (t < loopStart || t >= loopEnd) { t = loopStart; videoEl.currentTime = t; }
    videoEl.play().catch(() => {});
  } else {
    videoEl.pause();
  }
});
videoEl.addEventListener('play', () => { playPauseBtn.textContent = '⏸'; });
videoEl.addEventListener('pause', () => {
  playPauseBtn.textContent = '▶';
  updateTimeline();
});

seekBtn.addEventListener('click', () => {
  const t = parseTimecode(tcInput.value);
  videoReady = false;
  playPauseBtn.disabled = true;
  overlayEl.classList.remove('hidden');
  overlayTxt.textContent = `Переход к ${tcInput.value}…`;
  if (upscaleStopFn) { try { upscaleStopFn(); } catch (_) {} upscaleStopFn = null; }
  canvasEl.hidden = true;
  splitEl.hidden = true;
  videoEl.currentTime = t;
  videoEl.play().catch(() => {});
});

// ── Split ──────────────────────────────────────────────────────────────────────
function applySplitPercent() {
  const p = splitPercent;
  const wrapW = videoWrap.clientWidth;
  const splitPx = (p / 100) * wrapW;
  splitLineEl.style.left = p + '%';
  splitHandle.style.left = p + '%';
  canvasEl.style.clipPath = `inset(0 0 0 ${p}%)`;
  splitLeftLbl.style.left = '12px';
  splitLeftLbl.style.right = 'auto';
  splitRightLbl.style.left = 'auto';
  splitRightLbl.style.right = '12px';
}

splitHandle.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = videoWrap.getBoundingClientRect();
  splitPercent = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
  applySplitPercent();
});
document.addEventListener('mouseup', () => { isDragging = false; });

function showSplit(modeLabel: string) {
  splitRightLbl.textContent = modeLabel;
  splitEl.hidden = false;
  applySplitPercent();
}
function hideSplit() { splitEl.hidden = true; }

// ── Upscale (разрешение под 2K/4K, devicePixelRatio для чёткого отображения) ────
function even(v: number): number {
  return Math.floor(v / 2) * 2;
}

function getTargetDimensions(): { width: number; height: number } {
  const vw = videoEl.videoWidth || 1280;
  const vh = videoEl.videoHeight || 720;
  const wrapW = videoWrap.clientWidth || vw;
  const wrapH = videoWrap.clientHeight || vh;
  const videoAspect = vw / vh;
  const wrapAspect = wrapW / wrapH;
  let displayW: number, displayH: number;
  if (wrapAspect > videoAspect) {
    displayH = wrapH;
    displayW = wrapH * videoAspect;
  } else {
    displayW = wrapW;
    displayH = wrapW / videoAspect;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxW = 3840;
  const maxH = 2160;
  let outW: number, outH: number;
  if (currentModeId >= 8 && currentModeId <= 13) {
    const scale = currentModeId === 12 ? 3 : currentModeId === 13 ? 4 : 2;
    outW = Math.min(even(vw * scale), maxW);
    outH = Math.min(even(vh * scale), maxH);
    const displayPx = displayW * dpr;
    if (displayPx > outW) {
      outW = Math.min(even(displayW * dpr), maxW);
      outH = Math.min(even(displayH * dpr), maxH);
    }
  } else {
    outW = Math.min(even(displayW * dpr), maxW);
    outH = Math.min(even(displayH * dpr), maxH);
  }
  outW = Math.max(outW, vw);
  outH = Math.max(outH, vh);
  return { width: outW, height: outH };
}

async function applyUpscale() {
  if (upscaleStopFn) { try { upscaleStopFn(); } catch (_) {} upscaleStopFn = null; }

  const m = MODES.find(x => x.id === currentModeId)!;
  if (currentModeId === -1 || typeof navigator.gpu === 'undefined') {
    canvasEl.hidden = true;
    splitEl.hidden = true;
    statusEl.textContent = currentModeId === -1 ? 'Оригинал' : 'WebGPU недоступен';
    return;
  }

  statusEl.textContent = 'Инициализация…';
  const vw = videoEl.videoWidth || 1280;
  const vh = videoEl.videoHeight || 720;
  const target = getTargetDimensions();
  canvasEl.width = target.width;
  canvasEl.height = target.height;
  canvasEl.hidden = false;
  const ModeClass = MODE_MAP[currentModeId] ?? ModeB;

  try {
    const stop = await anime4kRender({
      video: videoEl,
      canvas: canvasEl,
      pipelineBuilder: (device: GPUDevice, inputTexture: GPUTexture) => {
        const native = { width: vw, height: vh };
        const t = { width: canvasEl.width, height: canvasEl.height };
        return [new ModeClass({ device, inputTexture, nativeDimensions: native, targetDimensions: t }) as any];
      },
    });
    upscaleStopFn = stop as () => void;
    statusEl.textContent = '✓ ' + m.label;
    showSplit(m.label);
  } catch (err) {
    console.error('[Anime4K]', err);
    canvasEl.hidden = true;
    splitEl.hidden = true;
    statusEl.textContent = 'Ошибка GPU';
  }
}

let resizeTid = 0;
new ResizeObserver(() => {
  if (!videoReady || currentModeId === -1 || !upscaleStopFn) return;
  clearTimeout(resizeTid);
  resizeTid = window.setTimeout(() => void applyUpscale(), 150);
}).observe(videoWrap);

document.getElementById('btn-tool-min')?.addEventListener('click', () => (window as any).electron?.minimizeToolWindow?.());
document.getElementById('btn-tool-max')?.addEventListener('click', () => (window as any).electron?.toggleMaximizeToolWindow?.());
document.getElementById('btn-tool-close')?.addEventListener('click', () => (window as any).electron?.closeToolWindow?.());
function setStatus(t: string) { statusEl.textContent = t; }
