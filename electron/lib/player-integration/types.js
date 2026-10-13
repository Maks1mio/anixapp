'use strict';

/**
 * @typedef {'vlc' | 'mpv' | 'potplayer'} ExternalPlayerId
 *
 * @typedef {{
 *   id: ExternalPlayerId,
 *   label: string,
 *   description: string,
 * }} ExternalPlayerInfo
 *
 * @typedef {{
 *   id: ExternalPlayerId,
 *   label: string,
 *   description: string,
 *   path: string,
 * }} InstalledExternalPlayer
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
