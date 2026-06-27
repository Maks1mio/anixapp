import { toPng } from 'html-to-image';
import { resolveCdnAssetUrl } from '../../../utils/posterUrl';

export async function downloadWrappedSharePng(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    skipFonts: false,
    filter: (el) => {
      if (el instanceof HTMLElement && el.dataset.shareSkip != null) return false;
      return true;
    },
    style: {
      transform: 'none',
    },
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Источник постера для шер-карточки. Оставляем прокси-схему anix-cdn:// (в Electron),
 * иначе прямой https к s.anixmirai.com грузится без Referer и блокируется CDN.
 */
export function sharePosterSrc(url: string): string {
  return resolveCdnAssetUrl(url);
}
