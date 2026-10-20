/** Run an AAWA action button (validated server-side; re-checked here). */
import type { AgentAction } from '../../services/agent-api';
import { navigate } from '../../stores/navigation';
import { openSettingsModal } from '../../stores/modals';
import { openSupportModal } from '../../stores/support-promo';
import { openProfilePanel } from '../../stores/profile-panel';
import { showToast } from '../../stores/toast';
import { applyReleaseListStatus, type ReleaseListStatusId } from '../../utils/release-list-status';
import { notifyFavoritesChanged } from '../../utils/favorites-events';
import { requestOpenExternal } from '../../utils/external-link';
import { openSupportTicket } from './support-store';
import {
  iconArrowRight,
  iconBookmark,
  iconGlobe,
  iconHeart,
  iconMessageCircle,
  iconPlay,
  iconSearch,
  iconSettings,
  iconSparkles,
  iconUser,
} from '../../components/icons';

const SETTINGS_TABS = new Set(['appearance', 'connection', 'behavior', 'notifications', 'playback', 'discord', 'update']);

const LIST_STATUS: Record<NonNullable<AgentAction['list']>, { id: ReleaseListStatusId; name: string }> = {
  watching: { id: 'watching', name: 'Смотрю' },
  planned: { id: 'planned', name: 'В планах' },
  completed: { id: 'completed', name: 'Просмотрено' },
  hold_on: { id: 'on_hold', name: 'Отложено' },
  dropped: { id: 'dropped', name: 'Брошено' },
};

/** Buttons that change the user's data — they show a «done» state after the click. */
export function isAgentMutation(a: AgentAction): boolean {
  return a.kind === 'add_to_list' || a.kind === 'add_favorite';
}

/** Resolves `true` when a data-changing action succeeded (navigation resolves `false`). */
export async function runAgentAction(a: AgentAction): Promise<boolean> {
  switch (a.kind) {
    case 'open_release':
      if (a.release_id) navigate(`/release/${a.release_id}`);
      return false;
    case 'open_route':
      if (a.route?.startsWith('/')) navigate(a.route);
      return false;
    case 'open_settings':
      if (a.tab && SETTINGS_TABS.has(a.tab)) openSettingsModal(a.tab);
      return false;
    case 'search':
      if (a.query) navigate(`/search?q=${encodeURIComponent(a.query)}`);
      return false;
    case 'open_support':
      openSupportModal();
      return false;
    case 'open_profile':
      openProfilePanel();
      return false;
    case 'open_url':
      if (a.url && /^https?:\/\//i.test(a.url)) requestOpenExternal(a.url);
      return false;
    case 'open_ticket':
      if (a.ticket_id) openSupportTicket(a.ticket_id);
      return false;
    case 'add_to_list': {
      const status = a.list ? LIST_STATUS[a.list] : null;
      if (!a.release_id || !status) return false;
      try {
        await applyReleaseListStatus(a.release_id, status.id);
        showToast(`Добавлено в «${status.name}»`);
        return true;
      } catch {
        showToast('Не получилось добавить в список', 'err');
        return false;
      }
    }
    case 'add_favorite': {
      const api = window.anixApi?.release;
      if (!a.release_id || !api) return false;
      try {
        await api.addFavorite(a.release_id);
        notifyFavoritesChanged({ releaseId: a.release_id, favorited: true });
        showToast('Добавлено в избранное');
        return true;
      } catch {
        showToast('Не получилось добавить в избранное', 'err');
        return false;
      }
    }
  }
  return false;
}

export function agentActionIcon(a: AgentAction): string {
  switch (a.kind) {
    case 'open_release':
      return iconPlay(14);
    case 'open_settings':
      return iconSettings(14);
    case 'search':
      return iconSearch(14);
    case 'open_support':
      return iconSparkles(14);
    case 'open_profile':
      return iconUser(14);
    case 'add_to_list':
      return iconBookmark(14);
    case 'add_favorite':
      return iconHeart(14);
    case 'open_url':
      return iconGlobe(14);
    case 'open_ticket':
      return iconMessageCircle(14);
    default:
      return iconArrowRight(14);
  }
}
