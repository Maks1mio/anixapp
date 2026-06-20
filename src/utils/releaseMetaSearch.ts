import { navigate } from '../stores/navigation';
import { RELEASE_SEARCH_BY } from '../views/Release/_metaInfo';

export function openReleaseMetaSearch(query: string, searchBy: number = RELEASE_SEARCH_BY.title): void {
  const q = query.trim();
  if (!q) return;
  const params = new URLSearchParams({
    q,
    tab: 'releases',
    by: String(searchBy),
  });
  navigate(`/search?${params.toString()}`);
}
