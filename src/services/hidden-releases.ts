import { getApiBase } from './anixback-endpoint';

// «Скрыт в Anixart» для любой карточки тайтла (главная, подборки, закладки…):
// каждая карточка спрашивает свой id, загрузчик склеивает их в /releases/hidden?ids=… запросы.

const CACHE_TTL_MS = 10 * 60 * 1000;
const BATCH_DELAY_MS = 40;
const BATCH_MAX = 200;

const cache = new Map<number, { hidden: boolean; at: number }>();
const waiting = new Map<number, Array<(hidden: boolean) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function requestChunk(ids: number[]): Promise<Set<number> | null> {
  try {
    const res = await fetch(`${getApiBase()}/releases/hidden?ids=${ids.join(',')}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { hidden?: unknown[] };
    return new Set((data.hidden ?? []).map(Number));
  } catch {
    return null;
  }
}

async function flush(): Promise<void> {
  flushTimer = null;
  const batch = new Map(waiting);
  waiting.clear();
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += BATCH_MAX) {
    const chunk = ids.slice(i, i + BATCH_MAX);
    const hidden = await requestChunk(chunk);
    for (const id of chunk) {
      const value = hidden?.has(id) ?? false;
      // Кэшируем только ответ сервера — при ошибке спросим снова на следующей карточке
      if (hidden) cache.set(id, { hidden: value, at: Date.now() });
      for (const resolve of batch.get(id) ?? []) resolve(value);
    }
  }
}

/** Скрывает ли Anixart тайтл из своего поиска (по каталогу anixback). */
export function isReleaseHiddenInAnixart(releaseId: number): Promise<boolean> {
  if (!Number.isInteger(releaseId) || releaseId <= 0) return Promise.resolve(false);
  const hit = cache.get(releaseId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.hidden);
  return new Promise((resolve) => {
    const list = waiting.get(releaseId);
    if (list) list.push(resolve);
    else waiting.set(releaseId, [resolve]);
    flushTimer ??= setTimeout(() => void flush(), BATCH_DELAY_MS);
  });
}
