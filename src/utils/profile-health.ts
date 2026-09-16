import { formatHistoryViewTime } from './historyFormat';
import { COMMENT_RULES_URL } from './commentRules';
import { sanitizeArticleHtml } from './article-block-format';

export type HealthTab = 'account' | 'content';

export type ProfileHealthStatus = {
  banCount: number;
  banFor3MonthCount: number;
  lastBanTimestamp: number;
  lastBanExpires: number;
  blogSuspensionExpires: number;
  blogMuteExpires: number;
};

export type ProfileEnforcementItem = {
  id: number;
  type: string;
  reason: string | null;
  creationTimestamp: number;
  expirationTimestamp: number | null;
  isRevoked: boolean;
  entityId: number | null;
  entity: Record<string, unknown> | null;
  changes: Array<{ type: string; new_value?: unknown }>;
  raw: Record<string, unknown>;
};

export const PROFILE_HEALTH_INFO_HTML = `
<p>Здесь вы можете отслеживать состояние своего аккаунта: просматривать историю банов, модерационные действия с вашим контентом и текущие ограничения.</p>
<p><strong>Что отображается на странице</strong></p>
<ul>
  <li>Текущий статус аккаунта (безупречный / забанен / дата последнего бана)</li>
  <li>Количество банов за все время и за последние 3 месяца</li>
  <li>Активные ограничения на публикации (если есть) с указанием срока</li>
  <li>Информация о скрытии публикаций из блога в общей ленте</li>
  <li>История всех ограничений с причинами и датами</li>
  <li>Список модерационных действий с вашим контентом</li>
</ul>
<p><strong>Что ограничивается во время бана</strong></p>
<p>При нарушении правил сообщества на ваш аккаунт могут быть наложены временные ограничения:</p>
<ul>
  <li>написание комментариев</li>
  <li>создание коллекций</li>
  <li>публикация записей</li>
  <li>изменение аватара и обложки</li>
  <li>смена имени пользователя</li>
  <li>обновление статуса</li>
</ul>
<p>Ограничения действуют указанный срок, после чего автоматически снимаются.</p>
<p><strong>Важно:</strong> систематические нарушения правил могут привести к перманентной блокировке аккаунта.</p>
`.trim();

export { COMMENT_RULES_URL };

function asTs(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isActiveExpire(ts: number): boolean {
  if (!ts || ts <= 0) return false;
  const ms = ts > 1e12 ? ts : ts * 1000;
  return ms > Date.now();
}

export function normalizeHealthStatus(raw: Record<string, unknown> | null | undefined): ProfileHealthStatus {
  return {
    banCount: Number(raw?.ban_count ?? 0) || 0,
    banFor3MonthCount: Number(raw?.ban_for_3_month_count ?? 0) || 0,
    lastBanTimestamp: asTs(raw?.last_ban_timestamp),
    lastBanExpires: asTs(raw?.last_ban_expires),
    blogSuspensionExpires: asTs(raw?.blog_suspension_expires),
    blogMuteExpires: asTs(raw?.blog_mute_expires),
  };
}

export function isCurrentlyBanned(status: ProfileHealthStatus): boolean {
  return isActiveExpire(status.lastBanExpires);
}

export function healthStatusTitle(status: ProfileHealthStatus): string {
  return isCurrentlyBanned(status) ? 'Вы забанены' : 'Вы безупречны';
}

export function healthStatusNote(status: ProfileHealthStatus): string {
  if (isCurrentlyBanned(status)) return 'сейчас действуют ограничения на определенные действия';
  if (status.lastBanTimestamp > 0) {
    return `последний бан · ${formatHistoryViewTime(status.lastBanTimestamp)}`;
  }
  return 'банов нет';
}

export function blogSuspensionLine(status: ProfileHealthStatus): string {
  if (isActiveExpire(status.blogSuspensionExpires)) {
    return `Имеется ограничение на создание новых записей до ${formatHistoryViewTime(status.blogSuspensionExpires)}`;
  }
  return 'Нет ограничения на создание новых записей';
}

export function blogMuteLine(status: ProfileHealthStatus): string {
  if (isActiveExpire(status.blogMuteExpires)) {
    return `Имеется скрытие всех записей из блога в общей ленте до ${formatHistoryViewTime(status.blogMuteExpires)}`;
  }
  return 'Нет скрытия всех записей из блога в общей ленте';
}

export function normalizeEnforcementList(data: unknown): ProfileEnforcementItem[] {
  if (Array.isArray(data)) {
    return data
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(normalizeEnforcement);
  }
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const nested =
    (Array.isArray(obj.content) && obj.content)
    || (Array.isArray(obj.enforcements) && obj.enforcements)
    || (Array.isArray(obj.items) && obj.items)
    || [];
  return nested
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(normalizeEnforcement);
}

export function normalizeEnforcement(raw: Record<string, unknown>): ProfileEnforcementItem {
  const changes = Array.isArray(raw.changes)
    ? raw.changes.filter((c): c is { type: string; new_value?: unknown } => !!c && typeof c === 'object')
    : [];
  const entity =
    raw.entity && typeof raw.entity === 'object' && !Array.isArray(raw.entity)
      ? (raw.entity as Record<string, unknown>)
      : null;
  return {
    id: Number(raw.id ?? 0),
    type: String(raw.type ?? ''),
    reason: typeof raw.reason === 'string' ? raw.reason : raw.reason == null ? null : String(raw.reason),
    creationTimestamp: asTs(raw.creation_timestamp),
    expirationTimestamp: raw.expiration_timestamp != null ? asTs(raw.expiration_timestamp) : null,
    isRevoked: !!(raw.is_revoked ?? raw.isRevoked),
    entityId: raw.entity_id != null ? Number(raw.entity_id) : null,
    entity,
    changes,
    raw,
  };
}

function articleAction(item: ProfileEnforcementItem): 'deleted' | 'restored' | 'edited' {
  const del = item.changes.find((c) => c.type === 'is_deleted');
  if (del) {
    if (del.new_value === true || del.new_value === 1 || del.new_value === 'true') return 'deleted';
    if (del.new_value === false || del.new_value === 0 || del.new_value === 'false') return 'restored';
  }
  return 'edited';
}

function entityRef(item: ProfileEnforcementItem): string {
  const id = item.entityId ?? item.id;
  return id > 0 ? `#${id}` : '';
}

export function enforcementListTitle(item: ProfileEnforcementItem): string {
  const ref = entityRef(item);
  switch (item.type) {
    case 'article_edit': {
      const a = articleAction(item);
      if (a === 'deleted') return `Удалена запись ${ref}`.trim();
      if (a === 'restored') return `Восстановлена запись ${ref}`.trim();
      return `Отредактирована запись ${ref}`.trim();
    }
    case 'article_comment_edit':
      return `Удалён комментарий к записи ${ref}`.trim();
    case 'release_comment_edit':
      return `Удалён комментарий к релизу ${ref}`.trim();
    case 'collection_comment_edit':
      return `Удалён комментарий к коллекции ${ref}`.trim();
    case 'collection_edit':
      return `Изменена коллекция ${ref}`.trim();
    case 'profile_ban':
      return item.expirationTimestamp
        ? `Бан до ${formatHistoryViewTime(item.expirationTimestamp)}`
        : 'Бан аккаунта';
    case 'channel_suspension':
      return item.expirationTimestamp
        ? `Ограничение публикаций до ${formatHistoryViewTime(item.expirationTimestamp)}`
        : 'Ограничение публикаций';
    case 'channel_mute':
      return item.expirationTimestamp
        ? `Скрыты публикации из блога до ${formatHistoryViewTime(item.expirationTimestamp)}`
        : 'Скрыты публикации из блога';
    default:
      return item.reason?.trim() || 'Модерационное действие';
  }
}

export function enforcementTimeLabel(item: ProfileEnforcementItem): string {
  if (!item.creationTimestamp) return '';
  return `От ${formatHistoryViewTime(item.creationTimestamp)}`;
}

export function extractArticleText(entity: Record<string, unknown> | null): string {
  if (!entity) return '';
  if (typeof entity.message === 'string' && entity.message.trim()) return entity.message.trim();
  if (typeof entity.title === 'string' && entity.title.trim()) return entity.title.trim();
  const payload = entity.payload;
  if (payload && typeof payload === 'object') {
    const blocks = (payload as { blocks?: unknown }).blocks;
    if (Array.isArray(blocks)) {
      const texts: string[] = [];
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue;
        const data = (b as { data?: Record<string, unknown> }).data;
        const t = data?.text ?? data?.content ?? (b as { text?: unknown }).text;
        if (typeof t === 'string' && t.trim()) texts.push(t.trim());
      }
      if (texts.length) return texts.join('\n');
    }
  }
  return '';
}

/** Безопасный HTML для диалога: emoji-сущности, <b>/<br>, переносы блоков. */
export function formatEnforcementContentHtml(raw: string): string {
  const withBreaks = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, '<br>');
  return sanitizeArticleHtml(withBreaks);
}

export function extractChannelLogin(entity: Record<string, unknown> | null): string {
  if (!entity) return '';
  const channel = entity.channel;
  if (channel && typeof channel === 'object') {
    const login = (channel as { login?: unknown; name?: unknown }).login
      ?? (channel as { name?: unknown }).name;
    if (typeof login === 'string' && login.trim()) return login.trim();
  }
  if (typeof entity.channel_login === 'string') return entity.channel_login;
  return '';
}

export function enforcementDetailTitle(item: ProfileEnforcementItem): string {
  if (item.type === 'article_edit') {
    const a = articleAction(item);
    if (a === 'deleted') return 'Удалена запись';
    if (a === 'restored') return 'Восстановлена запись';
    return 'Отредактирована запись';
  }
  return enforcementListTitle(item);
}

export function enforcementDetailBody(item: ProfileEnforcementItem): {
  lead: string;
  contentLabel?: string;
  content?: string;
} {
  const when = item.creationTimestamp ? formatHistoryViewTime(item.creationTimestamp) : 'недавно';
  const channel = extractChannelLogin(item.entity) || 'канале';
  const text = extractArticleText(item.entity);

  if (item.type === 'article_edit') {
    const a = articleAction(item);
    const verb = a === 'deleted' ? 'удалена' : a === 'restored' ? 'восстановлена' : 'изменена';
    return {
      lead: `Ваша запись на канале «${channel}», оставленная ${when}, была ${verb}, поскольку нарушала правила сообщества.`,
      contentLabel: text ? 'Содержание вашей записи:' : undefined,
      content: text || undefined,
    };
  }

  if (item.type.startsWith('profile_ban') || item.type === 'channel_suspension' || item.type === 'channel_mute') {
    return {
      lead: item.reason?.trim()
        || `Ограничение от ${when}${item.expirationTimestamp ? ` до ${formatHistoryViewTime(item.expirationTimestamp)}` : ''}.`,
    };
  }

  return {
    lead: item.reason?.trim()
      || `Модерационное действие от ${when}.`,
    contentLabel: text ? 'Содержание:' : undefined,
    content: text || undefined,
  };
}
