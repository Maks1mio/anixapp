/** Разворачивает Jackson @JsonIdentityInfo-ссылки вида `{ "@id": 2 }` в полные объекты. */

export function normalizeJacksonId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isJacksonRef(obj: Record<string, unknown>): boolean {
  if (!('@id' in obj)) return false;
  if ('id' in obj && obj.id != null && obj.id !== '') return false;
  const keys = Object.keys(obj);
  if (keys.length === 1) return true;
  return keys.every((key) => key === '@id' || key === '@type');
}

export function buildJacksonIndex(root: unknown): Map<number, Record<string, unknown>> {
  const index = new Map<number, Record<string, unknown>>();

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const obj = node as Record<string, unknown>;
    const jacksonId = normalizeJacksonId(obj['@id']);
    if (jacksonId != null && !isJacksonRef(obj)) {
      index.set(jacksonId, obj);
    }
    Object.values(obj).forEach(walk);
  }

  walk(root);
  return index;
}

export function resolveJacksonEntity(
  node: unknown,
  root?: unknown,
): Record<string, unknown> | undefined {
  if (node == null) return undefined;

  const index = root != null ? buildJacksonIndex(root) : new Map<number, Record<string, unknown>>();

  const scalarId = normalizeJacksonId(node);
  if (scalarId != null && typeof node !== 'object') {
    const entity = index.get(scalarId);
    if (!entity) return undefined;
    return resolveJacksonEntity(entity, root);
  }

  if (typeof node !== 'object' || Array.isArray(node)) return undefined;

  const obj = node as Record<string, unknown>;

  function resolveOne(value: Record<string, unknown>): Record<string, unknown> | undefined {
    if ('id' in value && value.id != null && value.id !== '' && !isJacksonRef(value)) return value;

    const jacksonId = normalizeJacksonId(value['@id']);
    if (jacksonId == null) return Object.keys(value).length ? value : undefined;

    const entity = index.get(jacksonId);
    if (!entity) return isJacksonRef(value) ? undefined : value;
    if (entity === value) return value;

    return resolveOne(entity);
  }

  return resolveOne(obj);
}

export function resolveJacksonRefs<T>(root: T, index = buildJacksonIndex(root)): T {
  const resolving = new Set<number>();

  function walk(node: unknown): unknown {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(walk);

    const obj = node as Record<string, unknown>;
    if (isJacksonRef(obj)) {
      const id = normalizeJacksonId(obj['@id']);
      if (id == null) return obj;
      const entity = index.get(id);
      if (!entity || resolving.has(id)) return obj;
      resolving.add(id);
      const resolved = walk({ ...entity });
      resolving.delete(id);
      return resolved;
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = walk(value);
    }
    return out;
  }

  return walk(root) as T;
}

/** Разворачивает элементы превью, где Jackson отдаёт `@id` числом вместо объекта. */
export function resolveJacksonPreviewList<T extends Record<string, unknown>>(
  items: unknown[],
  root: unknown,
): T[] {
  const index = buildJacksonIndex(root);

  return items
    .map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const obj = item as Record<string, unknown>;
        if (normalizeJacksonId(obj.id) != null || !isJacksonRef(obj)) {
          return resolveJacksonRefs(obj, index) as T;
        }
      }

      const jacksonId = normalizeJacksonId(item);
      if (jacksonId == null) return null;

      const entity = index.get(jacksonId);
      if (!entity) return null;

      return resolveJacksonRefs({ ...entity }, index) as T;
    })
    .filter((item): item is T => item != null);
}

/**
 * Разворот ссылок с учётом типа: у Anixart (@JsonIdentityInfo IntSequenceGenerator) у каждого класса
 * своя нумерация `@id` — Release #3 и Comment #3 в одном ответе. Общий индекс подставлял в `release`
 * чужой объект (комментарий) → «Без названия». Здесь индекс по имени поля: `release: 3` ищется только
 * среди объектов, стоявших в полях `release`.
 */
export function resolveJacksonRefsByKey<T>(root: T, keys: readonly string[]): T {
  const byKey = new Map<string, Map<number, Record<string, unknown>>>(keys.map((k) => [k, new Map()]));

  function index(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(index);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const bucket = byKey.get(key);
      if (bucket && value && typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        const id = normalizeJacksonId(obj['@id']);
        if (id != null && !isJacksonRef(obj)) bucket.set(id, obj);
      }
      index(value);
    }
  }

  const seen = new WeakSet<object>();
  function resolve(node: unknown): void {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(resolve);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      const bucket = byKey.get(key);
      if (bucket) {
        const ref = typeof value === 'object' && value && !Array.isArray(value) && isJacksonRef(value as Record<string, unknown>)
          ? normalizeJacksonId((value as Record<string, unknown>)['@id'])
          : typeof value === 'number' || typeof value === 'string' ? normalizeJacksonId(value) : null;
        const target = ref != null ? bucket.get(ref) : undefined;
        if (target) obj[key] = target;
      }
      resolve(obj[key]);
    }
  }

  index(root);
  resolve(root);
  return root;
}
