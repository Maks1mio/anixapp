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
  url: string;
  start: number; // секунды
  end: number;
}

const PRESETS: Preset[] = [
  {
    label: 'Ван-Пис',
    url: 'https://shadow.cloud.kodik-storage.com/useruploads/aa9fff72-8784-4a77-bc80-21193374e9ab/67fd892b01960ec56e2907e73889a667:2026031912/720.mp4:hls:manifest.m3u8',
    start: 6 * 60 + 12,
    end:   6 * 60 + 42,
  },
  {
    label: 'Семья шпиона 2',
    url: 'https://prism.cloud.kodik-storage.com/useruploads/df4c5e5c-dc90-4758-a385-9d00c7b9199b/eb500f01d1d41016561408601dab9829:2026031913/720.mp4:hls:manifest.m3u8',
    start: 0 * 60 + 56,
    end:   1 * 60 + 23,
  },
  {
    label: 'Атака титанов: Финал',
    url: 'https://viking.cloud.kodik-storage.com/useruploads/09f81946-b4d4-48da-8f2e-88863d0c303b/a1856cac54b1f7d5c2d51a7dfef9fe02:2026031913/720.mp4:hls:manifest.m3u8',
    start: 56 * 60 + 42,
    end:   56 * 60 + 50,
  },
  {
    label: 'Богиня благословляет этот мир',
    url: 'https://secret.cloud.kodik-storage.com/useruploads/fb64f6b7-577c-4014-85be-77155351c4cd/bca921d654135e505402d85363624f80:2026031913/720.mp4:hls:manifest.m3u8',
    start: 9 * 60 +  5,
    end:   9 * 60 + 19,
  },
  {
    label: 'Ван-Пис: Письмо от поклонника',
    url: 'https://ozzy.cloud.kodik-storage.com/useruploads/382392ef-08ae-4179-804e-cf82ebd9ef25/a988727bb9eb40068349236b22f0f21a:2026031913/720.mp4:hls:manifest.m3u8',
    start: 0 * 60 + 43,
    end:   1 * 60 + 14,
  },
];

// ── Режимы Anime4K ────────────────────────────────────────────────────────────
const MODES: { id: number; label: string; desc: string }[] = [
  { id: -1, label: 'Оригинал (без фильтра)', desc: 'Исходный видеопоток без обработки.' },
  { id: 14, label: 'ModeA [Preset]',          desc: 'Быстрый пресет с умеренным восстановлением и апскейлом.' },
  { id: 15, label: 'ModeB [Preset]',          desc: 'Сбалансированный пресет с акцентом на детализацию.' },
  { id: 16, label: 'ModeC [Preset]',          desc: 'Качественный пресет с более агрессивным улучшением.' },
  { id: 17, label: 'ModeA+A [Preset]',        desc: 'Расширенный ModeA с дополнительной обработкой.' },
  { id: 18, label: 'ModeB+B [Preset]',        desc: 'Улучшенный ModeB, обеспечивает более высокое качество.' },
  { id: 19, label: 'ModeC+A [Preset]',        desc: 'Комбинированный пресет с высокой чёткостью и восстановлением.' },
  { id: 0,  label: 'DoG [Deblur]',            desc: 'Удаление размытия и усиление границ (фильтр Гауссиан).' },
  { id: 1,  label: 'BilateralMean [Denoise]', desc: 'Снижение шума без потери резкости.' },
  { id: 2,  label: 'CNNM [Restore]',          desc: 'Нейросетевое восстановление, умеренная глубина.' },
  { id: 3,  label: 'CNNSoftM [Restore]',      desc: 'Мягкое восстановление, минимум артефактов.' },
  { id: 4,  label: 'CNNSoftVLM [Restore]',    desc: 'Очень лёгкое восстановление для слабых устройств.' },
  { id: 5,  label: 'CNNVL [Restore]',         desc: 'Малая задержка и быстрая обработка.' },
  { id: 6,  label: 'CNNUL [Restore]',         desc: 'Универсальное восстановление, акцент на стабильность.' },
  { id: 7,  label: 'GANUUL [Restore]',        desc: 'GAN-реконструкция для высокого качества.' },
  { id: 8,  label: 'CNNx2M [Upscale]',        desc: 'Апскейл ×2 с сохранением структуры кадра.' },
  { id: 9,  label: 'CNNx2VL [Upscale]',       desc: 'Быстрый апскейл ×2 для слабых систем.' },
  { id: 10, label: 'DenoiseCNNx2VL [Upscale]',desc: 'Апскейл ×2 с предварительным шумоподавлением.' },
  { id: 11, label: 'CNNx2UL [Upscale]',       desc: 'Универсальный сбалансированный апскейл ×2.' },
  { id: 12, label: 'GANx3L [Upscale]',        desc: 'GAN апскейл ×3 для высокого качества.' },
  { id: 13, label: 'GANx4UUL [Upscale]',      desc: 'GAN апскейл ×4 — максимальное качество.' },
];

const MODE_MAP: Record<number, new (opts: { device: GPUDevice; inputTexture: GPUTexture; nativeDimensions: { width: number; height: number }; targetDimensions: { width: number; height: number } }) => unknown> = {
  0: DoG, 1: BilateralMean, 2: CNNM, 3: CNNSoftM, 4: CNNSoftVL,
  5: CNNVL, 6: CNNUL, 7: GANUUL,
  8: CNNx2M, 9: CNNx2VL, 10: DenoiseCNNx2VL, 11: CNNx2UL,
  12: GANx3L, 13: GANx4UUL,
  14: ModeA, 15: ModeB, 16: ModeC, 17: ModeAA, 18: ModeBB, 19: ModeCA,
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentModeId    = 15;
let upscaleStopFn: (() => void) | null = null;
let videoReady       = false;
let splitPercent     = 50;
let isDragging       = false;
let currentPresetIdx = 0;
let loopStart        = PRESETS[0].start;
let loopEnd          = PRESETS[0].end;
let hlsInstance: Hls | null = null;
let isRenderingFrame = false; // однокадровый рендер при паузе — кнопка не мигает

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function parseTimecode(s: string): number {
  const parts = s.trim().split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number(parts[0]) || 0;
}

// ── Theme ─────────────────────────────────────────────────────────────────────
initTheme();
initTooltipSystem();

// ── DOM ───────────────────────────────────────────────────────────────────────
const root = document.getElementById('app')!;
root.innerHTML = `
<div class="ut-root">

  <!-- App titlebar -->
  <div class="titlebar">
    <div class="titlebar__drag">
      <span class="titlebar__logo">
        <img src="logo/512x512.png" alt="" class="titlebar__logo-img" />
      </span>
      <span class="titlebar__title">Предпросмотр моделей</span>
    </div>
    <div class="titlebar__controls">
      <button type="button" class="titlebar__btn titlebar__btn--min" id="btn-tool-min" aria-label="Свернуть"></button>
      <button type="button" class="titlebar__btn titlebar__btn--max" id="btn-tool-max" aria-label="Развернуть"></button>
      <button type="button" class="titlebar__btn titlebar__btn--close" id="btn-tool-close" aria-label="Закрыть"></button>
    </div>
  </div>

<div class="ut-layout">
  <!-- Sidebar: список режимов -->
  <aside class="ut-sidebar">
    <div class="ut-sidebar__header">
      <span class="ut-sidebar__title">Режимы Anime4K</span>
    </div>
    <div class="ut-page">
      <div class="ut-sidebar__list" id="mode-list"></div>
    </div>
  </aside>

  <!-- Main area -->
  <main class="ut-main">
    <!-- Topbar: текущий режим + пресеты -->
    <div class="ut-topbar">
      <div class="ut-topbar__mode-info">
        <div class="ut-topbar__mode" id="current-mode-label">ModeB [Preset]</div>
        <div class="ut-topbar__desc" id="current-mode-desc">Сбалансированный пресет с акцентом на детализацию.</div>
      </div>
      <div class="ut-topbar__right">
        <div class="ut-status" id="status">Загрузка…</div>
      </div>
    </div>

    <!-- Preset bar -->
    <div class="ut-presetbar" id="preset-bar">
      ${PRESETS.map((p, i) => `<button class="ut-preset-btn${i === 0 ? ' ut-preset-btn--active' : ''}" data-idx="${i}">${p.label}</button>`).join('')}
    </div>

    <!-- Video container -->
    <div class="ut-video-wrap" id="video-wrap">
      <video id="video" crossorigin="anonymous" playsinline muted></video>
      <canvas id="canvas" hidden></canvas>

      <!-- Split divider -->
      <div class="ut-split" id="split" hidden>
        <div class="ut-split__line" id="split-line-el"></div>
        <div class="ut-split__handle" id="split-handle">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7 5L2 10L7 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M13 5L18 10L13 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="ut-split__label ut-split__label--left" id="split-left-lbl">Оригинал</span>
        <span class="ut-split__label ut-split__label--right" id="split-right-lbl">Фильтр</span>
      </div>

      <!-- Loading overlay -->
      <div class="ut-overlay" id="overlay">
        <div class="ut-spinner"></div>
        <div id="overlay-text">Загрузка видео…</div>
      </div>
    </div>

    <!-- Bottom bar -->
    <div class="ut-bottombar">
      <button class="ut-playpause-btn" id="btn-playpause" disabled title="Пауза / Воспроизведение">⏸</button>
      <span class="ut-bottombar__sep"></span>
      <span class="ut-bottombar__label">Тайм-код:</span>
      <input class="ut-tc-input" id="tc-input" type="text" value="${formatTime(PRESETS[0].start)}">
      <button class="ut-tc-btn" id="btn-seek">Перейти</button>
      <span class="ut-bottombar__hint" id="loop-hint">Цикл ${formatTime(PRESETS[0].start)} – ${formatTime(PRESETS[0].end)} · Тяни разделитель для сравнения</span>
    </div>
  </main>
</div><!-- /ut-layout -->
</div><!-- /ut-root -->
`;

// ── Styles ────────────────────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--color-bg); color: var(--color-text); font-family: var(--font-sans); height: 100vh; overflow: hidden; }

/* ── Root wrapper ── */
.ut-root { display: flex; flex-direction: column; height: 100vh; }
.ut-layout { display: flex; flex: 1; min-height: 0; }

/* ── Sidebar ── */
.ut-sidebar {
  width: 240px; flex-shrink: 0;
  background: var(--color-surface); border-right: 1px solid var(--color-border);
  display: flex; flex-direction: column; overflow: hidden;
}
.ut-sidebar__header {
  padding: 13px 16px 9px;
  border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}

/* ── Page component (custom scroll) ── */
.ut-page {
  flex: 1; overflow: hidden; position: relative;
}
.ut-page > .ut-sidebar__list {
  height: 100%; overflow-y: auto; padding: 4px 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}
.ut-page > .ut-sidebar__list::-webkit-scrollbar { width: 3px; }
.ut-page > .ut-sidebar__list::-webkit-scrollbar-track { background: transparent; }
.ut-page > .ut-sidebar__list::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }
.ut-page > .ut-sidebar__list::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--color-text) 20%, transparent); }
.ut-sidebar__title { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--color-text-muted); }
.ut-sidebar__list { overflow-y: auto; flex: 1; padding: 4px 0; }
.ut-mode-btn {
  display: block; width: 100%; text-align: left;
  padding: 7px 16px; border: none; background: none;
  color: var(--color-text-muted); font-size: 0.79rem; cursor: pointer;
  transition: background .1s, color .1s; line-height: 1.3;
}
.ut-mode-btn:hover { background: color-mix(in srgb, var(--color-text) 5%, transparent); color: var(--color-text); }
.ut-mode-btn--active { background: color-mix(in srgb, var(--color-text) 9%, transparent); color: var(--color-text); font-weight: 600; }
.ut-mode-btn__label { display: block; }
.ut-mode-btn__type {
  display: inline-block; font-size: 0.63rem; padding: 1px 5px;
  border-radius: 3px; margin-top: 2px; opacity: .55;
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
}

/* ── Main ── */
.ut-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* ── Topbar ── */
.ut-topbar {
  flex-shrink: 0; padding: 9px 16px;
  border-bottom: 1px solid var(--color-border); background: var(--color-surface);
  display: flex; align-items: center; gap: 12px;
}
.ut-topbar__mode-info { flex: 1; min-width: 0; }
.ut-topbar__mode { font-size: 0.875rem; font-weight: 700; color: var(--color-text); white-space: nowrap; }
.ut-topbar__desc { font-size: 0.74rem; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.ut-topbar__right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.ut-status { font-size: 0.74rem; color: var(--color-text-muted); white-space: nowrap; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }

/* ── Preset bar ── */
.ut-presetbar {
  flex-shrink: 0;
  display: flex; gap: 6px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
  overflow-x: auto;
}
.ut-presetbar::-webkit-scrollbar { height: 3px; }
.ut-presetbar::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }
.ut-preset-btn {
  flex-shrink: 0;
  padding: 5px 13px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 20px; color: var(--color-text-muted); font-size: 0.78rem;
  cursor: pointer; transition: background .12s, color .12s, border-color .12s;
  white-space: nowrap;
}
.ut-preset-btn:hover { background: var(--color-surface-hover); color: var(--color-text); border-color: color-mix(in srgb, var(--color-text) 20%, transparent); }
.ut-preset-btn--active {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  border-color: var(--color-accent);
  color: var(--color-accent); font-weight: 600;
}

/* ── Video wrap ── */
.ut-video-wrap {
  flex: 1; position: relative;
  background: #000; overflow: hidden; min-height: 0;
  user-select: none;
}
#video, #canvas {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: contain; display: block;
}
#video { background: #000; }

/* ── Split divider ── */
.ut-split { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.ut-split__line {
  position: absolute; top: 0; bottom: 0; left: 50%;
  width: 2px; background: rgba(255,255,255,.85);
  box-shadow: 0 0 8px rgba(0,0,0,.8);
  transform: translateX(-50%);
}
.ut-split__handle {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 44px; height: 44px; border-radius: 50%;
  background: #fff; box-shadow: 0 2px 16px rgba(0,0,0,.7);
  display: flex; align-items: center; justify-content: center;
  cursor: ew-resize; pointer-events: all;
}
.ut-split__label {
  position: absolute; top: 12px;
  background: rgba(0,0,0,.6); backdrop-filter: blur(4px);
  color: #fff; font-size: 0.7rem; font-weight: 600;
  padding: 3px 8px; border-radius: 4px; white-space: nowrap;
  pointer-events: none; letter-spacing: .02em;
}

/* ── Overlay ── */
.ut-overlay {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 14px; background: rgba(0,0,0,.72);
  z-index: 10; font-size: 0.875rem; color: var(--color-text-muted);
  transition: opacity .25s;
}
.ut-overlay.hidden { opacity: 0; pointer-events: none; }
.ut-spinner {
  width: 36px; height: 36px; border-radius: 50%;
  border: 3px solid color-mix(in srgb, var(--color-text) 8%, transparent);
  border-top-color: var(--color-accent);
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Bottombar ── */
.ut-bottombar {
  flex-shrink: 0; padding: 9px 16px;
  border-top: 1px solid var(--color-border); background: var(--color-surface);
  display: flex; align-items: center; gap: 9px; font-size: 0.79rem;
}
.ut-bottombar__sep  { width: 1px; height: 18px; background: var(--color-border); flex-shrink: 0; }
.ut-bottombar__label{ color: var(--color-text-muted); white-space: nowrap; }
.ut-bottombar__hint { color: color-mix(in srgb, var(--color-text-muted) 60%, transparent); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ut-playpause-btn {
  width: 34px; height: 34px; flex-shrink: 0;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 8px; color: var(--color-text-muted); font-size: 1rem;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background .1s, color .1s;
}
.ut-playpause-btn:hover:not(:disabled) { background: var(--color-surface-hover); color: var(--color-text); }
.ut-playpause-btn:disabled { opacity: .3; cursor: default; }
.ut-tc-input {
  width: 58px; padding: 5px 8px;
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 6px; color: var(--color-text); font-size: 0.78rem; text-align: center;
}
.ut-tc-input:focus { outline: none; border-color: var(--color-accent); }
.ut-tc-btn {
  padding: 5px 12px; background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 6px; color: var(--color-text-muted); font-size: 0.76rem; cursor: pointer;
  transition: background .1s;
}
.ut-tc-btn:hover { background: var(--color-surface-hover); }
`;
document.head.appendChild(style);

// ── Refs ──────────────────────────────────────────────────────────────────────
const videoEl       = document.getElementById('video')          as HTMLVideoElement;
const canvasEl      = document.getElementById('canvas')         as HTMLCanvasElement;
const overlayEl     = document.getElementById('overlay')        as HTMLElement;
const overlayTxt    = document.getElementById('overlay-text')   as HTMLElement;
const statusEl      = document.getElementById('status')         as HTMLElement;
const seekBtn       = document.getElementById('btn-seek')        as HTMLButtonElement;
const tcInput       = document.getElementById('tc-input')        as HTMLInputElement;
const modeList      = document.getElementById('mode-list')       as HTMLElement;
const modeLabelEl   = document.getElementById('current-mode-label') as HTMLElement;
const modeDescEl    = document.getElementById('current-mode-desc')  as HTMLElement;
const videoWrap     = document.getElementById('video-wrap')      as HTMLElement;
const splitEl       = document.getElementById('split')           as HTMLElement;
const splitHandle   = document.getElementById('split-handle')    as HTMLElement;
const splitLineEl   = document.getElementById('split-line-el')   as HTMLElement;
const splitLeftLbl  = document.getElementById('split-left-lbl')  as HTMLElement;
const splitRightLbl = document.getElementById('split-right-lbl') as HTMLElement;
const playPauseBtn  = document.getElementById('btn-playpause')   as HTMLButtonElement;
const loopHint      = document.getElementById('loop-hint')       as HTMLElement;
const presetBar     = document.getElementById('preset-bar')      as HTMLElement;

// ── Mode sidebar ──────────────────────────────────────────────────────────────
function getTypeTag(label: string): string {
  if (label.includes('[Preset]'))  return 'Preset';
  if (label.includes('[Deblur]'))  return 'Deblur';
  if (label.includes('[Denoise]')) return 'Denoise';
  if (label.includes('[Restore]')) return 'Restore';
  if (label.includes('[Upscale]')) return 'Upscale';
  return '';
}

function buildModeList() {
  modeList.innerHTML = '';
  MODES.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'ut-mode-btn' + (m.id === currentModeId ? ' ut-mode-btn--active' : '');
    btn.dataset.id = String(m.id);
    const tag = getTypeTag(m.label);
    const shortLabel = m.label.replace(/ \[.*\]/, '');
    btn.innerHTML = `
      <span class="ut-mode-btn__label">${shortLabel}</span>
      ${tag ? `<span class="ut-mode-btn__type">${tag}</span>` : ''}
    `;
    btn.addEventListener('click', () => selectMode(m.id));
    modeList.appendChild(btn);
  });
}

function selectMode(id: number) {
  currentModeId = id;
  modeList.querySelectorAll<HTMLElement>('.ut-mode-btn').forEach(btn => {
    btn.classList.toggle('ut-mode-btn--active', Number(btn.dataset.id) === id);
  });
  const m = MODES.find(x => x.id === id)!;
  modeLabelEl.textContent = m.label;
  modeDescEl.textContent  = m.desc;
  if (videoReady) applyUpscale();
}

buildModeList();

// ── Preset bar ────────────────────────────────────────────────────────────────
presetBar.querySelectorAll<HTMLButtonElement>('.ut-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.idx);
    if (idx === currentPresetIdx) return;
    loadPreset(idx);
  });
});

function loadPreset(idx: number) {
  currentPresetIdx = idx;
  const preset = PRESETS[idx];
  loopStart = preset.start;
  loopEnd   = preset.end;

  // Update preset bar UI
  presetBar.querySelectorAll('.ut-preset-btn').forEach((b, i) => {
    b.classList.toggle('ut-preset-btn--active', i === idx);
  });

  // Update loop hint + timecode input
  tcInput.value = formatTime(preset.start);
  loopHint.textContent = `Цикл ${formatTime(preset.start)} – ${formatTime(preset.end)} · Тяни разделитель для сравнения`;

  // Reset state
  videoReady = false;
  playPauseBtn.disabled = true;
  overlayEl.classList.remove('hidden');
  overlayTxt.textContent = 'Загрузка…';
  setStatus('Загрузка пресета…');

  // Stop upscale
  if (upscaleStopFn) { try { upscaleStopFn(); } catch (_) {} upscaleStopFn = null; }
  canvasEl.hidden = true;
  videoEl.style.visibility = 'visible';
  hideSplit();

  // Destroy old HLS and init new
  if (hlsInstance) { try { hlsInstance.destroy(); } catch (_) {} hlsInstance = null; }
  initHls(preset.url, preset.start);
}

// ── HLS ───────────────────────────────────────────────────────────────────────
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
    if (!data.fatal) return;
    if (hlsInstance !== hls) return;

    // На ошибке делаем то же что кнопка «Перейти»: перезапускаем загрузку с тайм-кода
    overlayEl.classList.remove('hidden');
    overlayTxt.textContent = `Переход к ${formatTime(targetTime)}…`;
    setStatus('');

    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      hls.recoverMediaError();
    } else {
      hls.startLoad(targetTime); // возобновляем загрузку с нужной позиции
    }
    videoEl.currentTime = targetTime;
    videoEl.play().catch(() => {});
  });
}

// Initial load
initHls(PRESETS[0].url, PRESETS[0].start);

videoEl.addEventListener('canplay', () => {
  if (!videoReady) overlayTxt.textContent = 'Буферизация…';
});

videoEl.addEventListener('seeked', () => {
  if (videoReady) return; // loop-seek или ручной seek — игнорировать
  videoReady = true;
  overlayEl.classList.add('hidden');
  playPauseBtn.disabled = false;
  setStatus('');
  applyUpscale();
});

// ── Loop ──────────────────────────────────────────────────────────────────────
videoEl.addEventListener('timeupdate', () => {
  if (!videoReady) return;
  if (videoEl.currentTime >= loopEnd) {
    videoEl.currentTime = loopStart;
    if (!videoEl.paused) videoEl.play().catch(() => {});
  }
});

// ── Play / Pause ──────────────────────────────────────────────────────────────
playPauseBtn.addEventListener('click', () => {
  if (videoEl.paused) {
    // Синхронизация: если тайм-код вышел за цикл — возвращаем в начало
    if (videoEl.currentTime < loopStart || videoEl.currentTime >= loopEnd) {
      videoEl.currentTime = loopStart;
    }
    videoEl.play().catch(() => {});
  } else {
    videoEl.pause();
  }
});
videoEl.addEventListener('play',  () => { if (!isRenderingFrame) playPauseBtn.textContent = '⏸'; });
videoEl.addEventListener('pause', () => { if (!isRenderingFrame) playPauseBtn.textContent = '▶'; });

// ── Seek button ───────────────────────────────────────────────────────────────
seekBtn.addEventListener('click', () => {
  const t = parseTimecode(tcInput.value);
  videoReady = false;
  playPauseBtn.disabled = true;
  overlayEl.classList.remove('hidden');
  overlayTxt.textContent = `Переход к ${tcInput.value}…`;
  if (upscaleStopFn) { try { upscaleStopFn(); } catch (_) {} upscaleStopFn = null; }
  canvasEl.hidden = true;
  hideSplit();
  videoEl.style.visibility = 'visible';
  videoEl.currentTime = t;
  videoEl.play().catch(() => {});
});

// ── Split divider ─────────────────────────────────────────────────────────────
function applySplitPercent() {
  const p    = splitPercent;
  const wrapW = videoWrap.clientWidth;
  const splitPx = (p / 100) * wrapW;
  const GAP = 10;

  splitLineEl.style.left  = p + '%';
  splitHandle.style.left  = p + '%';
  canvasEl.style.clipPath = `inset(0 0 0 ${p}%)`;

  // Labels: left ends before the line, right starts after
  const leftW  = splitLeftLbl.offsetWidth  || 65;
  const rightW = splitRightLbl.offsetWidth || 65;

  splitLeftLbl.style.right = '';
  splitLeftLbl.style.left  = Math.max(8, splitPx - GAP - leftW) + 'px';

  splitRightLbl.style.left  = '';
  splitRightLbl.style.left  = Math.min(splitPx + GAP, wrapW - rightW - 8) + 'px';
}

splitHandle.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
splitHandle.addEventListener('touchstart', (e) => { isDragging = true; e.preventDefault(); }, { passive: false });

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const rect = videoWrap.getBoundingClientRect();
  splitPercent = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
  applySplitPercent();
});
document.addEventListener('touchmove', (e) => {
  if (!isDragging || !e.touches[0]) return;
  const rect = videoWrap.getBoundingClientRect();
  splitPercent = Math.max(5, Math.min(95, ((e.touches[0].clientX - rect.left) / rect.width) * 100));
  applySplitPercent();
}, { passive: true });
document.addEventListener('mouseup',  () => { isDragging = false; });
document.addEventListener('touchend', () => { isDragging = false; });

function showSplit(modeLabel: string) {
  splitRightLbl.textContent = modeLabel.replace(/ \[.*\]/, '');
  splitEl.hidden = false;
  applySplitPercent();
}
function hideSplit() { splitEl.hidden = true; }

// ── Upscale ───────────────────────────────────────────────────────────────────
async function applyUpscale() {
  if (upscaleStopFn) { try { upscaleStopFn(); } catch (_) {} upscaleStopFn = null; }

  const m = MODES.find(x => x.id === currentModeId)!;

  if (currentModeId === -1 || typeof navigator.gpu === 'undefined') {
    canvasEl.hidden = true;
    videoEl.style.visibility = 'visible';
    hideSplit();
    setStatus(currentModeId === -1 ? 'Оригинал' : 'WebGPU недоступен');
    return;
  }

  setStatus('Инициализация ' + m.label.replace(/ \[.*\]/, '') + '…');

  const w = videoEl.videoWidth  || 1280;
  const h = videoEl.videoHeight || 720;
  canvasEl.width  = w;
  canvasEl.height = h;
  canvasEl.hidden = false;
  videoEl.style.visibility = 'visible'; // видео нужно для split-левой стороны

  const ModeClass = MODE_MAP[currentModeId] ?? ModeB;

  try {
    const stop = await anime4kRender({
      video: videoEl,
      canvas: canvasEl,
      pipelineBuilder: (device: GPUDevice, inputTexture: GPUTexture) => {
        const native = { width: videoEl.videoWidth || w, height: videoEl.videoHeight || h };
        const target = { width: canvasEl.width, height: canvasEl.height };
        return [new ModeClass({ device, inputTexture, nativeDimensions: native, targetDimensions: target }) as any];
      },
    });
    upscaleStopFn = stop as () => void;
    setStatus('✓ ' + m.label.replace(/ \[.*\]/, ''));
    showSplit(m.label);

    // Если видео на паузе — прокрутить один кадр чтобы фильтр отрисовался сразу
    if (videoEl.paused) {
      isRenderingFrame = true;
      videoEl.requestVideoFrameCallback(() => {
        videoEl.pause();
        isRenderingFrame = false;
      });
      videoEl.play().catch(() => { isRenderingFrame = false; });
    }
  } catch (err) {
    console.error('[Anime4K]', err);
    canvasEl.hidden = true;
    hideSplit();
    setStatus('Ошибка GPU: ' + String(err).slice(0, 50));
  }
}

// ── Titlebar window controls ──────────────────────────────────────────────────
const el = (window as any).electron as Record<string, (...a: any[]) => any> | undefined;
document.getElementById('btn-tool-min')?.addEventListener('click',   () => el?.minimizeToolWindow?.());
document.getElementById('btn-tool-max')?.addEventListener('click',   () => el?.toggleMaximizeToolWindow?.());
document.getElementById('btn-tool-close')?.addEventListener('click', () => el?.closeToolWindow?.());

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(text: string) { statusEl.textContent = text; }
