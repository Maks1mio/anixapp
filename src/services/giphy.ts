/**
 * Giphy API для поиска GIF.
 * Бесплатный ключ: https://developers.giphy.com/dashboard/
 * Добавьте VITE_GIPHY_API_KEY в .env
 */

const API_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GIPHY_API_KEY) ||
  'dc6zaTOxFJmzC'; // Giphy beta key (rate limited), для продакшена добавьте свой в .env
const BASE = 'https://api.giphy.com/v1/gifs';

export interface GifResult {
  id: string;
  url: string;
  preview: string;
  width: number;
  height: number;
}

export async function searchGifs(query: string, limit = 20, offset = 0): Promise<GifResult[]> {
  if (!API_KEY?.trim()) return [];
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  try {
    const res = await fetch(
      `${BASE}/search?api_key=${API_KEY}&q=${q}&limit=${limit}&offset=${offset}&rating=g&lang=ru`
    );
    const json = await res.json();
    const data = json?.data;
    if (!Array.isArray(data)) return [];
    return data.map((g: any) => ({
      id: g.id,
      url: g.images?.original?.url ?? g.images?.fixed_height?.url ?? '',
      preview: g.images?.fixed_height_small?.url ?? g.images?.fixed_height?.url ?? '',
      width: g.images?.fixed_height?.width ?? 200,
      height: g.images?.fixed_height?.height ?? 200,
    })).filter((g: GifResult) => g.url);
  } catch {
    return [];
  }
}

export async function getTrending(limit = 20, offset = 0): Promise<GifResult[]> {
  if (!API_KEY?.trim()) return [];
  try {
    const res = await fetch(
      `${BASE}/trending?api_key=${API_KEY}&limit=${limit}&offset=${offset}&rating=g`
    );
    const json = await res.json();
    const data = json?.data;
    if (!Array.isArray(data)) return [];
    return data.map((g: any) => ({
      id: g.id,
      url: g.images?.original?.url ?? g.images?.fixed_height?.url ?? '',
      preview: g.images?.fixed_height_small?.url ?? g.images?.fixed_height?.url ?? '',
      width: g.images?.fixed_height?.width ?? 200,
      height: g.images?.fixed_height?.height ?? 200,
    })).filter((g: GifResult) => g.url);
  } catch {
    return [];
  }
}

export function hasGiphyKey(): boolean {
  return !!API_KEY?.trim();
}
