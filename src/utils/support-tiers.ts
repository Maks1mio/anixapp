/** Anix+ tiers for the support modal. Images are bundled so they never depend on anixback. */
import teer1 from '../assets/media/Teer 1.png';
import teer2 from '../assets/media/Teer 2.png';
import teer3 from '../assets/media/Teer 3.png';

export interface SupportTier {
  slug: string;
  name: string;
  image: string;
  price: number;
  description: string;
  /** Chat agent requests per day (admin-editable; refreshed from /badges/catalog). */
  agentDailyLimit: number;
}

/** Defaults mirror anixback BUILTIN_TYPES; price/description are refreshed from /badges/catalog. */
export const SUPPORT_TIERS: SupportTier[] = [
  {
    slug: 'teer-1',
    name: 'Anix+ 1 ур',
    image: teer1,
    price: 99,
    description: 'Значок Anix+ 1 ур + чат-агент в приложении: подбор тайтлов и создание коллекций. Доступ бессрочный.',
    agentDailyLimit: 10,
  },
  {
    slug: 'teer-2',
    name: 'Anix+ 2 ур',
    image: teer2,
    price: 299,
    description: 'Значок Anix+ 2 ур + чат-агент в приложении: подбор тайтлов и создание коллекций. Доступ бессрочный.',
    agentDailyLimit: 30,
  },
  {
    slug: 'teer-3',
    name: 'Anix+ 3 ур',
    image: teer3,
    price: 442,
    description: 'Значок Anix+ 3 ур + чат-агент в приложении: подбор тайтлов и создание коллекций. Доступ бессрочный.',
    agentDailyLimit: 100,
  },
];

/** Подтянуть цену/описание/лимит из каталога anixback (картинки остаются встроенными). */
export function mergeRemoteTiers(
  remote: Array<{ slug: string; name: string; price?: number | null; description?: string | null; agent_daily_limit?: number | null }>,
): SupportTier[] {
  return SUPPORT_TIERS.map((t) => {
    const r = remote.find((x) => x.slug === t.slug);
    return r
      ? {
          ...t,
          name: r.name,
          price: r.price ?? t.price,
          description: r.description ?? t.description,
          agentDailyLimit: r.agent_daily_limit ?? t.agentDailyLimit,
        }
      : t;
  });
}

function requestsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'запрос';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'запроса';
  return 'запросов';
}

/** «Значок … + чат-агент … + …. Доступ бессрочный.» → пункты; сам значок показывается отдельно. */
export function supportTierPerks(t: SupportTier): string[] {
  const list = (t.description ?? '')
    .replace(/\s*Доступ бессрочный\.?\s*$/i, '')
    .split(/\s+\+\s+/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s && !/^значок/i.test(s))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  // Уровни отличаются дневным лимитом агента — эта строка их и различает.
  if (t.agentDailyLimit > 0) list.push(`${t.agentDailyLimit} ${requestsWord(t.agentDailyLimit)} к агенту в день`);
  return list;
}
