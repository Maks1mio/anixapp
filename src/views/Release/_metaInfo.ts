/** Android SearchRequest.searchBy — ReleaseSearchFragment.Companion.a(type, …) */
export const RELEASE_SEARCH_BY = {
  title: 0,
  studio: 1,
  director: 2,
  author: 3,
  genre: 4,
  source: 5,
} as const;

export type ReleaseMetaIconKind =
  | 'country'
  | 'episodes'
  | 'category'
  | 'credits'
  | 'source'
  | 'genres';

export interface ReleaseMetaSegment {
  text: string;
  query?: string;
  searchBy?: number;
}

export interface ReleaseMetaInfoRow {
  kind: ReleaseMetaIconKind;
  segments: ReleaseMetaSegment[];
  /** Country label for flag-icons (country row only). */
  country?: string;
}

function splitCsv(value: string): string[] {
  return value.split(/,\s*/).map((part) => part.trim()).filter(Boolean);
}

function linkedList(items: string[], searchBy: number): ReleaseMetaSegment[] {
  const segments: ReleaseMetaSegment[] = [];
  items.forEach((name, index) => {
    if (index > 0) segments.push({ text: ', ' });
    segments.push({ text: name, query: name, searchBy });
  });
  return segments;
}

export function buildCreditsSegments(
  studio?: string,
  author?: string,
  director?: string,
): ReleaseMetaSegment[] {
  const segments: ReleaseMetaSegment[] = [];
  let needSep = false;

  const appendSep = () => {
    if (needSep) segments.push({ text: ', ' });
  };

  if (studio?.trim()) {
    appendSep();
    segments.push({ text: 'Студия ' });
    segments.push(...linkedList(splitCsv(studio), RELEASE_SEARCH_BY.studio));
    needSep = true;
  }

  if (author?.trim()) {
    appendSep();
    segments.push({ text: 'автор ' });
    segments.push(...linkedList(splitCsv(author), RELEASE_SEARCH_BY.author));
    needSep = true;
  }

  if (director?.trim()) {
    appendSep();
    segments.push({ text: 'режиссёр ' });
    segments.push(...linkedList(splitCsv(director), RELEASE_SEARCH_BY.director));
    needSep = true;
  }

  return segments;
}

export function buildSourceSegments(source: string): ReleaseMetaSegment[] {
  const value = source.trim();
  if (!value) return [];
  return [
    { text: 'Источник: ' },
    { text: value, query: value, searchBy: RELEASE_SEARCH_BY.source },
  ];
}

export function buildGenreSegments(genres: string): ReleaseMetaSegment[] {
  return linkedList(splitCsv(genres), RELEASE_SEARCH_BY.genre);
}

export function plainMetaSegments(text: string): ReleaseMetaSegment[] {
  return text ? [{ text }] : [];
}
