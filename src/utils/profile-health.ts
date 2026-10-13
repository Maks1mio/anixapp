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
  appealType: string;
  appealStatus: string;
  appealExpiresTimestamp: number | null;
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
  const appealExpires = raw.appeal_expires_timestamp ?? raw.appealExpiresTimestamp;
  return {
    id: Number(raw.id ?? 0),
    type: String(raw.type ?? ''),
    reason: typeof raw.reason === 'string' ? raw.reason : raw.reason == null ? null : String(raw.reason),
    creationTimestamp: asTs(raw.creation_timestamp ?? raw.creationTimestamp),
    expirationTimestamp: raw.expiration_timestamp != null || raw.expirationTimestamp != null
      ? asTs(raw.expiration_timestamp ?? raw.expirationTimestamp)
      : null,
    isRevoked: !!(raw.is_revoked ?? raw.isRevoked),
    entityId: raw.entity_id != null || raw.entityId != null
      ? Number(raw.entity_id ?? raw.entityId)
      : null,
    entity,
    changes,
    appealType: String(raw.appeal_type ?? raw.appealType ?? '').toUpperCase(),
    appealStatus: String(raw.appeal_status ?? raw.appealStatus ?? '').toUpperCase(),
    appealExpiresTimestamp: appealExpires != null ? asTs(appealExpires) : null,
    raw,
  };
}

/** Дедлайн модерации: «24 сент. 00:00» */
export function formatEnforcementDeadline(timestamp: number): string {
  if (!timestamp) return '';
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const d = new Date(ms);
  const month = d.toLocaleDateString('ru-RU', { month: 'short' }).replace(/\.$/, '');
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${d.getDate()} ${month}. ${time}`;
}

/** Нужно исправить контент до дедлайна (Android AppealType.ADJUSTMENT). */
export function isAdjustmentRequired(item: ProfileEnforcementItem): boolean {
  if (item.isRevoked) return false;
  if (item.appealType !== 'ADJUSTMENT') return false;
  if (item.appealStatus !== 'NOT_SUBMITTED') return false;
  return isActiveExpire(item.appealExpiresTimestamp ?? 0);
}

export function enforcementTargetPath(item: ProfileEnforcementItem): string | null {
  const entity = item.entity;
  const nestedArticleId = (() => {
    if (!entity) return null;
    const direct = Number(entity.article_id ?? entity.articleId ?? 0);
    if (direct > 0) return direct;
    const article = entity.article;
    if (article && typeof article === 'object') {
      const id = Number((article as { id?: unknown }).id ?? 0);
      if (id > 0) return id;
    }
    return null;
  })();

  switch (item.type) {
    case 'article_edit': {
      const id = item.entityId ?? nestedArticleId;
      return id && id > 0 ? `/article/${id}` : null;
    }
    case 'article_comment_edit': {
      const id = nestedArticleId ?? item.entityId;
      return id && id > 0 ? `/article/${id}` : null;
    }
    case 'collection_edit':
    case 'collection_comment_edit': {
      const collectionId = (() => {
        if (!entity) return item.entityId;
        const direct = Number(entity.collection_id ?? entity.collectionId ?? 0);
        if (direct > 0) return direct;
        const collection = entity.collection;
        if (collection && typeof collection === 'object') {
          const id = Number((collection as { id?: unknown }).id ?? 0);
          if (id > 0) return id;
        }
        return item.entityId;
      })();
      return collectionId && collectionId > 0 ? `/collection/${collectionId}` : null;
    }
    case 'release_comment_edit': {
      const releaseId = (() => {
        if (!entity) return item.entityId;
        const direct = Number(entity.release_id ?? entity.releaseId ?? 0);
        if (direct > 0) return direct;
        const release = entity.release;
        if (release && typeof release === 'object') {
          const id = Number((release as { id?: unknown }).id ?? 0);
          if (id > 0) return id;
        }
        return item.entityId;
      })();
      return releaseId && releaseId > 0 ? `/release/${releaseId}` : null;
    }
    default:
      return null;
  }
}

export function enforcementGoTargetLabel(item: ProfileEnforcementItem): string {
  switch (item.type) {
    case 'collection_edit':
      return 'К коллекции';
    case 'article_comment_edit':
    case 'collection_comment_edit':
    case 'release_comment_edit':
      return 'К комменту';
    default:
      return 'К записи';
  }
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
  if (isAdjustmentRequired(item)) {
    const until = item.appealExpiresTimestamp
      ? ` до ${formatEnforcementDeadline(item.appealExpiresTimestamp)}`
      : '';
    switch (item.type) {
      case 'article_edit':
        return `Требуется действие для записи ${ref}${until}`.trim();
      case 'collection_edit':
        return `Требуется действие для коллекции ${ref}${until}`.trim();
      case 'article_comment_edit':
        return `Требуется действие для комментария к записи ${ref}${until}`.trim();
      case 'collection_comment_edit':
        return `Требуется действие для комментария к коллекции ${ref}${until}`.trim();
      case 'release_comment_edit':
        return `Требуется действие для комментария к релизу ${ref}${until}`.trim();
      default:
        return `Требуется действие ${ref}${until}`.trim();
    }
  }
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

export function enforcementListHint(item: ProfileEnforcementItem): string {
  if (isAdjustmentRequired(item) && item.appealExpiresTimestamp) {
    const until = formatEnforcementDeadline(item.appealExpiresTimestamp);
    if (item.type === 'collection_edit') {
      return `Внесите исправление до ${until}, иначе коллекция будет удалена безвозвратно`;
    }
    if (
      item.type === 'article_comment_edit'
      || item.type === 'collection_comment_edit'
      || item.type === 'release_comment_edit'
    ) {
      return `Внесите исправление до ${until}, иначе комментарий будет удалён безвозвратно`;
    }
    return `Внесите исправление до ${until}, иначе запись будет удалена безвозвратно`;
  }
  return item.reason?.trim() || '';
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
  if (isAdjustmentRequired(item)) return 'Требуется действие';
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
  moderatorLabel?: string;
  moderatorMessage?: string;
} {
  const when = item.creationTimestamp ? formatHistoryViewTime(item.creationTimestamp) : 'недавно';
  const channel = extractChannelLogin(item.entity) || 'канале';
  const text = extractArticleText(item.entity);

  if (isAdjustmentRequired(item)) {
    const deadline = item.appealExpiresTimestamp
      ? formatEnforcementDeadline(item.appealExpiresTimestamp)
      : 'указанного срока';
    if (item.type === 'collection_edit') {
      return {
        lead: `Ваша коллекция нарушает правила сообщества. Требуется принять действия до ${deadline}, иначе коллекция будет удалена навсегда.`,
        moderatorLabel: item.reason ? 'Сообщение модератора:' : undefined,
        moderatorMessage: item.reason || undefined,
      };
    }
    return {
      lead: `Ваша запись на канале «${channel}» нарушает правила сообщества. Требуется принять действия до ${deadline}, иначе запись будет удалена навсегда.`,
      moderatorLabel: item.reason ? 'Сообщение модератора:' : undefined,
      moderatorMessage: item.reason || undefined,
    };
  }

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
