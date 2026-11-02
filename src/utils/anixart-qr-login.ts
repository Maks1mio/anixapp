/**
 * Вход по QR через Anixart (11+): ПК показывает QR, приложение Anixart на телефоне
 * открывает ссылку и подтверждает вход PIN-кодом.
 */
import { renderSVG } from '../vendor/uqr.mjs';

/** Deep link, который принимает Anixart (`DeepLinkUtils`: anixart://sign-in/qr?key=…). */
export function anixartQrLoginLink(key: string): string {
  return `anixart://sign-in/qr?key=${encodeURIComponent(key)}`;
}

/** Обычный QR (тёмные модули на светлом фоне): так его надёжнее читает камера телефона. */
export function anixartQrLoginSvg(key: string): string {
  return renderSVG(anixartQrLoginLink(key), {
    pixelSize: 6,
    whiteColor: '#ffffff',
    blackColor: '#111111',
  });
}
