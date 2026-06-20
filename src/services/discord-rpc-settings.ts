/** Per-page Discord RPC toggles (all default true when unset). */
export interface DiscordRpcPageSettings {
  discordRpcPageHome: boolean;
  discordRpcPageOverview: boolean;
  discordRpcPagePopular: boolean;
  discordRpcPageCollections: boolean;
  discordRpcPageMyCollections: boolean;
  discordRpcPageCollection: boolean;
  discordRpcPageCollectionEdit: boolean;
  discordRpcPageRelease: boolean;
  discordRpcPageReleaseComments: boolean;
  discordRpcPageReleaseRelated: boolean;
  discordRpcPageProfile: boolean;
  discordRpcPageProfileFriends: boolean;
  discordRpcPageProfileVotes: boolean;
  discordRpcPageBookmarks: boolean;
  discordRpcPageSearch: boolean;
  discordRpcPageDownloads: boolean;
  discordRpcPageAnnouncement: boolean;
  discordRpcPageOther: boolean;
}

export interface DiscordRpcSettings extends DiscordRpcPageSettings {
  discordRpcEnabled: boolean;
  discordRpcShowBrowsing: boolean;
  discordRpcShowWatching: boolean;
  discordRpcShowProgress: boolean;
  discordRpcShowDubber: boolean;
  discordRpcShowImages: boolean;
  discordRpcShowParty: boolean;
}

export type DiscordRpcPageKey = keyof DiscordRpcPageSettings;

export const DISCORD_RPC_PAGE_KEYS: DiscordRpcPageKey[] = [
  'discordRpcPageHome',
  'discordRpcPageOverview',
  'discordRpcPagePopular',
  'discordRpcPageCollections',
  'discordRpcPageMyCollections',
  'discordRpcPageCollection',
  'discordRpcPageCollectionEdit',
  'discordRpcPageRelease',
  'discordRpcPageReleaseComments',
  'discordRpcPageReleaseRelated',
  'discordRpcPageProfile',
  'discordRpcPageProfileFriends',
  'discordRpcPageProfileVotes',
  'discordRpcPageBookmarks',
  'discordRpcPageSearch',
  'discordRpcPageDownloads',
  'discordRpcPageAnnouncement',
  'discordRpcPageOther',
];

export function defaultDiscordRpcSettings(): DiscordRpcSettings {
  const pages = Object.fromEntries(
    DISCORD_RPC_PAGE_KEYS.map((k) => [k, true]),
  ) as DiscordRpcPageSettings;
  return {
    ...pages,
    discordRpcEnabled: true,
    discordRpcShowBrowsing: true,
    discordRpcShowWatching: true,
    discordRpcShowProgress: true,
    discordRpcShowDubber: true,
    discordRpcShowImages: true,
    discordRpcShowParty: true,
  };
}

/** Merge stored settings with defaults (`!== false` for booleans). */
export function normalizeDiscordRpcSettings(raw: Record<string, unknown> | null | undefined): DiscordRpcSettings {
  const d = defaultDiscordRpcSettings();
  if (!raw) return d;
  const out = { ...d };
  for (const key of Object.keys(d) as (keyof DiscordRpcSettings)[]) {
    if (key in raw) {
      (out as Record<string, boolean>)[key] = raw[key] !== false;
    }
  }
  return out;
}

export function isPageRpcEnabled(settings: DiscordRpcSettings, pageKey: keyof DiscordRpcPageSettings): boolean {
  if (!settings.discordRpcEnabled) return false;
  if (
    (pageKey === 'discordRpcPageProfileFriends' || pageKey === 'discordRpcPageProfileVotes')
    && settings.discordRpcPageProfile === false
  ) {
    return false;
  }
  return settings[pageKey] !== false;
}
