/**
 * TV / Big Picture: геймпады (Gamepad API → синтетические клавиши) и определение
 * текущего устройства ввода для подсказок внизу экрана.
 */
import { writable } from 'svelte/store';
import { isTvBuild } from '../platform/tv';

/** remote — пульт Android TV (клавиши в TV-сборке): только D-pad, OK и «Назад». */
export type TvInputDevice = 'keyboard' | 'remote' | 'xbox' | 'playstation';

const keysDevice: TvInputDevice = isTvBuild() ? 'remote' : 'keyboard';

export const tvInputDevice = writable<TvInputDevice>(keysDevice);
/** Был ли за сессию подключён геймпад (на Android TV подсказки показываются только тогда). */
export const tvGamepadSeen = writable(false);

/** Действия поверх обычной навигации — их обрабатывает tv-navigation. */
/** В плеере те же кнопки значат другое: menu — настройки, search — список серий, разделы — ±10 с. */
export type TvInputAction =
  | 'menu'
  | 'search'
  | 'prev-section'
  | 'next-section'
  | 'play-pause'
  | 'prev-episode'
  | 'next-episode';
export const TV_INPUT_ACTION_EVENT = 'tv-input:action';

/** Горячие клавиши клавиатуры (в стиле Steam Big Picture). */
export const TV_KEYBOARD_ACTIONS: Record<string, TvInputAction> = {
  F1: 'menu',
  F3: 'search',
  F6: 'prev-section',
  F7: 'next-section',
  PageUp: 'prev-episode',
  PageDown: 'next-episode',
};

// Standard Gamepad mapping (w3c.github.io/gamepad/#remapping)
const BTN_A = 0;
const BTN_B = 1;
const BTN_X = 2;
const BTN_Y = 3;
const BTN_LB = 4;
const BTN_RB = 5;
const BTN_LT = 6;
const BTN_RT = 7;
const BTN_VIEW = 8;
const BTN_START = 9;
const BTN_UP = 12;
const BTN_DOWN = 13;
const BTN_LEFT = 14;
const BTN_RIGHT = 15;

/** Номера кнопок стандартной раскладки — для экранов, которые захватывают геймпад. */
export const TV_PAD_BUTTON = {
  A: BTN_A,
  B: BTN_B,
  X: BTN_X,
  Y: BTN_Y,
  LB: BTN_LB,
  RB: BTN_RB,
  LT: BTN_LT,
  RT: BTN_RT,
} as const;

export interface TvStick {
  x: number;
  y: number;
}

/**
 * Экран забирает геймпад себе (например, круговой ввод текста в поиске):
 * стики уходят в `sticks`, а не в стрелки; кнопки — сначала в `button`.
 * D-pad остаётся навигацией.
 */
export interface TvGamepadCapture {
  sticks: (left: TvStick, right: TvStick) => void;
  /** true — кнопка поглощена, обычное действие не выполняется. */
  button: (index: number) => boolean;
}

let capture: TvGamepadCapture | null = null;
export const tvGamepadCaptureActive = writable(false);

export function setTvGamepadCapture(next: TvGamepadCapture): () => void {
  capture = next;
  tvGamepadCaptureActive.set(true);
  return () => {
    if (capture !== next) return;
    capture = null;
    tvGamepadCaptureActive.set(false);
  };
}

const STICK_THRESHOLD = 0.55;
const REPEAT_DELAY_MS = 380;
const REPEAT_RATE_MS = 95;

type Dir = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

let device: TvInputDevice = keysDevice;

function setDevice(next: TvInputDevice): void {
  if (device === next) return;
  device = next;
  tvInputDevice.set(next);
}

function gamepadKind(pad: Gamepad): TvInputDevice {
  // «Xbox Wireless Controller» тоже содержит «wireless controller» — Xbox проверяем первым.
  if (/xbox|045e|xinput/i.test(pad.id)) return 'xbox';
  return /054c|playstation|dualsense|dualshock|wireless controller/i.test(pad.id) ? 'playstation' : 'xbox';
}

function dispatchKey(type: 'keydown' | 'keyup', key: string, repeat = false): KeyboardEvent {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  const event = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true, repeat });
  target.dispatchEvent(event);
  return event;
}

function dispatchAction(action: TvInputAction): void {
  window.dispatchEvent(new CustomEvent<TvInputAction>(TV_INPUT_ACTION_EVENT, { detail: action }));
}

function pressSelect(): void {
  const before = document.activeElement as HTMLElement | null;
  const event = dispatchKey('keydown', 'Enter');
  // Синтетический Enter не кликает кнопку сам — делаем это, если никто не обработал.
  if (!event.defaultPrevented && before && before === document.activeElement && before !== document.body) {
    before.click();
  }
}

interface PadState {
  pressed: boolean[];
  dir: Dir | null;
  dirSince: number;
  dirLastRepeat: number;
}

const pads = new Map<number, PadState>();

function stickDir(pad: Gamepad): Dir | null {
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  if (Math.abs(x) < STICK_THRESHOLD && Math.abs(y) < STICK_THRESHOLD) return null;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'ArrowRight' : 'ArrowLeft';
  return y > 0 ? 'ArrowDown' : 'ArrowUp';
}

function padDir(pad: Gamepad): Dir | null {
  const b = pad.buttons;
  if (b[BTN_UP]?.pressed) return 'ArrowUp';
  if (b[BTN_DOWN]?.pressed) return 'ArrowDown';
  if (b[BTN_LEFT]?.pressed) return 'ArrowLeft';
  if (b[BTN_RIGHT]?.pressed) return 'ArrowRight';
  // Стики захвачены экраном — навигация только крестовиной.
  if (capture) return null;
  return stickDir(pad);
}

const CAPTURE_DEADZONE = 0.2;

function feedCapture(pad: Gamepad): boolean {
  if (!capture) return false;
  const left = { x: pad.axes[0] ?? 0, y: pad.axes[1] ?? 0 };
  const right = { x: pad.axes[2] ?? 0, y: pad.axes[3] ?? 0 };
  capture.sticks(left, right);
  return Math.hypot(left.x, left.y) > CAPTURE_DEADZONE || Math.hypot(right.x, right.y) > CAPTURE_DEADZONE;
}

function onButtonDown(index: number): void {
  switch (index) {
    case BTN_A:
      pressSelect();
      break;
    case BTN_B:
      dispatchKey('keydown', 'Escape');
      break;
    case BTN_X:
      dispatchAction('play-pause');
      break;
    case BTN_Y:
      dispatchAction('search');
      break;
    case BTN_LT:
      dispatchAction('prev-episode');
      break;
    case BTN_RT:
      dispatchAction('next-episode');
      break;
    case BTN_LB:
      dispatchAction('prev-section');
      break;
    case BTN_RB:
      dispatchAction('next-section');
      break;
    case BTN_START:
    case BTN_VIEW:
      dispatchAction('menu');
      break;
  }
}

function onButtonUp(index: number): void {
  // keyup нужен для удержания OK (tvLongPress): клик на отпускании.
  if (index === BTN_A) dispatchKey('keyup', 'Enter');
}

function pollPad(pad: Gamepad, now: number): void {
  let state = pads.get(pad.index);
  if (!state) {
    state = { pressed: pad.buttons.map((b) => b.pressed), dir: null, dirSince: 0, dirLastRepeat: 0 };
    pads.set(pad.index, state);
    return;
  }

  let active = false;
  pad.buttons.forEach((button, index) => {
    const was = state.pressed[index] ?? false;
    if (button.pressed === was) return;
    state.pressed[index] = button.pressed;
    if (index >= BTN_UP && index <= BTN_RIGHT) return;
    active = true;
    if (button.pressed) {
      if (capture?.button(index)) return;
      onButtonDown(index);
    } else onButtonUp(index);
  });

  if (feedCapture(pad)) active = true;

  const dir = padDir(pad);
  if (dir !== state.dir) {
    state.dir = dir;
    state.dirSince = now;
    state.dirLastRepeat = now;
    if (dir) {
      active = true;
      dispatchKey('keydown', dir);
    }
  } else if (dir && now - state.dirSince >= REPEAT_DELAY_MS && now - state.dirLastRepeat >= REPEAT_RATE_MS) {
    state.dirLastRepeat = now;
    dispatchKey('keydown', dir, true);
  }

  if (active || dir) {
    setDevice(gamepadKind(pad));
    tvGamepadSeen.set(true);
  }
}

let rafId = 0;

function loop(now: number): void {
  rafId = 0;
  const list = navigator.getGamepads?.() ?? [];
  const focused = document.hasFocus();
  let any = false;
  for (const pad of list) {
    if (!pad || !pad.connected) continue;
    any = true;
    if (focused) pollPad(pad, now);
  }
  if (any) rafId = window.requestAnimationFrame(loop);
  else pads.clear();
}

function startPolling(): void {
  if (!rafId) rafId = window.requestAnimationFrame(loop);
}

export function initTvInput(): void {
  if (typeof window === 'undefined') return;
  if ((window as Window & { __tvInputReady?: boolean }).__tvInputReady) return;
  (window as Window & { __tvInputReady?: boolean }).__tvInputReady = true;

  window.addEventListener('keydown', (event) => {
    if (!event.isTrusted) return;
    setDevice(keysDevice);
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const action = TV_KEYBOARD_ACTIONS[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    dispatchAction(action);
  }, true);
  window.addEventListener('mousemove', () => setDevice(keysDevice), { passive: true });

  window.addEventListener('gamepadconnected', (event) => {
    tvGamepadSeen.set(true);
    setDevice(gamepadKind(event.gamepad));
    startPolling();
  });
  window.addEventListener('gamepaddisconnected', (event) => {
    pads.delete(event.gamepad.index);
    if (!(navigator.getGamepads?.() ?? []).some((p) => p?.connected)) setDevice(keysDevice);
  });
  window.addEventListener('focus', startPolling);

  // Геймпад мог быть подключён до старта — Chromium отдаёт его после первого нажатия.
  startPolling();
}

/** Меню управления (как «Выключение» в Steam Big Picture): «Назад» на корневом экране. */
export const tvSystemMenuOpen = writable(false);
