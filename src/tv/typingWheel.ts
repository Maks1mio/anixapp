import type { TvStick } from '../services/tv-input';

/** Стик ближе к центру — ничего не выбрано (защита от дрейфа). */
export const TV_WHEEL_DEADZONE = 0.45;

/**
 * Сектор колеса под наклоном стика: первый символ — сверху, дальше по часовой.
 * -1 — стик в мёртвой зоне.
 */
export function tvWheelIndex(stick: TvStick, count: number): number {
  if (count <= 0 || Math.hypot(stick.x, stick.y) < TV_WHEEL_DEADZONE) return -1;
  const deg = (Math.atan2(stick.y, stick.x) * 180) / Math.PI + 90;
  const step = 360 / count;
  return Math.round(((deg + 360) % 360) / step) % count;
}

/** Раскладки: символы делятся пополам между левым и правым стиком. */
export type TvWheelLayout = 'ru' | 'en' | 'num';

const LAYOUT_CHARS: Record<TvWheelLayout, string> = {
  ru: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
  en: 'abcdefghijklmnopqrstuvwxyz',
  num: '1234567890-.,:!?\'"&()',
};

export const TV_WHEEL_LAYOUT_NEXT: Record<TvWheelLayout, TvWheelLayout> = { ru: 'en', en: 'num', num: 'ru' };
export const TV_WHEEL_LAYOUT_LABEL: Record<TvWheelLayout, string> = { ru: 'РУС', en: 'ENG', num: '123' };

export function tvWheelChars(layout: TvWheelLayout): { left: string[]; right: string[] } {
  const chars = [...LAYOUT_CHARS[layout]];
  const half = Math.ceil(chars.length / 2);
  return { left: chars.slice(0, half), right: chars.slice(half) };
}
