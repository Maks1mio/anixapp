'use strict';

/**
 * @typedef {'vlc' | 'mpv' | 'potplayer' | 'iina' | 'quicktime'} ExternalPlayerId
 *
 * @typedef {{
 *   id: ExternalPlayerId,
 *   label: string,
 *   description: string,
 *   platforms: NodeJS.Platform[],
 *   playlist: boolean,
 *   downloadUrl: string | null,
 *   note?: string,
 * }} ExternalPlayerInfo
 *
 * @typedef {ExternalPlayerInfo & { path: string }} InstalledExternalPlayer
 *
 * @typedef {{
 *   title: string,
 *   url: string,
 * }} PlaylistEntry
 *
 * @typedef {{
 *   url?: string,
 *   title?: string,
 *   referer?: string,
 *   userAgent?: string,
 *   playlist?: PlaylistEntry[],
 *   startIndex?: number,
 * }} LaunchMedia
 */

module.exports = {};
