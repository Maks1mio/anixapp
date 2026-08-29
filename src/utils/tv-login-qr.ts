/**
 * QR SVG для LAN-ссылки на TV-вход.
 */
import { renderSVG } from '../vendor/uqr.mjs';

export function tvLoginQrSvg(url: string): string {
  return renderSVG(url, {
    pixelSize: 6,
    whiteColor: '#121212',
    blackColor: '#f3f3f3',
  });
}
