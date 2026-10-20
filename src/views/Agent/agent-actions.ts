/** Run an AAWA action button (validated server-side; re-checked here). */
import type { AgentAction } from '../../services/agent-api';
import { navigate } from '../../stores/navigation';
import { openSettingsModal } from '../../stores/modals';
import { openSupportModal } from '../../stores/support-promo';
import { openProfilePanel } from '../../stores/profile-panel';
import {
  iconArrowRight,
  iconPlay,
  iconSearch,
  iconSettings,
  iconSparkles,
  iconUser,
} from '../../components/icons';

const SETTINGS_TABS = new Set(['appearance', 'connection', 'behavior', 'notifications', 'playback', 'discord', 'update']);

export function runAgentAction(a: AgentAction): void {
  switch (a.kind) {
    case 'open_release':
      if (a.release_id) navigate(`/release/${a.release_id}`);
      break;
    case 'open_route':
      if (a.route?.startsWith('/')) navigate(a.route);
      break;
    case 'open_settings':
      if (a.tab && SETTINGS_TABS.has(a.tab)) openSettingsModal(a.tab);
      break;
    case 'search':
      if (a.query) navigate(`/search?q=${encodeURIComponent(a.query)}`);
      break;
    case 'open_support':
      openSupportModal();
      break;
    case 'open_profile':
      openProfilePanel();
      break;
  }
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
    default:
      return iconArrowRight(14);
  }
}
