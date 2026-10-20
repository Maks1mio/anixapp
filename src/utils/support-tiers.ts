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
}

/** Defaults mirror anixback BUILTIN_TYPES; price/description are refreshed from /badges/catalog. */
export const SUPPORT_TIERS: SupportTier[] = [
  {
    slug: 'teer-1',
    name: 'Anix+ 1 ур',
    image: teer1,
    price: 99,
    description: 'Значок Anix+ 1 ур + чат-агент в приложении: подбор тайтлов и создание коллекций. Доступ бессрочный.',
  },
  {
    slug: 'teer-2',
    name: 'Anix+ 2 ур',
    image: teer2,
    price: 299,
    description:
      'Значок Anix+ 2 ур + чат-агент подбора тайтлов и коллекций + улучшенные серверы совместного просмотра. Доступ бессрочный.',
  },
  {
    slug: 'teer-3',
    name: 'Anix+ 3 ур',
    image: teer3,
    price: 442,
    description:
      'Значок Anix+ 3 ур + чат-агент + улучшенные серверы совместного просмотра + ранний доступ к новым функциям. Доступ бессрочный.',
  },
];
