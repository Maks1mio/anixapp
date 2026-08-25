'use strict';

const NET_ERROR_HINTS = [
  [/ERR_BLOCKED_BY_CLIENT/i, 'Запрос заблокирован клиентом (расширение, антивирус или правила сети)'],
  [/ERR_BLOCKED_BY_CSP/i, 'Запрос заблокирован политикой безопасности (CSP)'],
  [/ERR_BLOCKED_BY_ADMINISTRATOR/i, 'Запрос заблокирован администратором системы'],
  [/ERR_CONNECTION_REFUSED/i, 'Сервер отклонил подключение'],
  [/ERR_CONNECTION_RESET/i, 'Соединение разорвано сервером'],
  [/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ETIMEDOUT/i, 'Превышено время ожидания ответа'],
  [/ERR_NAME_NOT_RESOLVED|ENOTFOUND/i, 'Не удалось найти сервер (DNS)'],
  [/ERR_SSL|CERT_/i, 'Ошибка SSL-сертификата'],
  [/ERR_ACCESS_DENIED/i, 'Доступ запрещён'],
  [/ERR_INVALID_URL/i, 'Некорректный URL'],
  [/ERR_FAILED/i, 'Сетевая ошибка'],
  [/cancelled/i, 'Загрузка отменена пользователем'],
  [/FFmpeg не найден|нужен FFmpeg|нужен ffmpeg/i, 'FFmpeg не установлен — нужен для быстрой сборки HLS'],
];

const CODE_HINTS = {
  'embed-url-not-video': 'Не удалось получить прямую ссылку на видео — передан адрес страницы плеера, а не файла. Выберите другой источник или озвучку',
  'libria-release-missing': 'Релиз удалён или недоступен на AniLibria — попробуйте источник Kodik у той же озвучки',
  'invalid-url': 'Некорректный или пустой URL для скачивания',
  empty: 'Список файлов для скачивания пуст',
};

function extractRawMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err.trim();
  if (typeof err.message === 'string' && err.message.trim()) return err.message.trim();
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function hostFromUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function splitRawAndUrl(raw) {
  const text = String(raw || '').trim();
  const atIdx = text.lastIndexOf(' @ ');
  if (atIdx === -1) return { message: text, url: '' };
  return {
    message: text.slice(0, atIdx).trim(),
    url: text.slice(atIdx + 3).trim(),
  };
}

function mapKnownError(raw, extra = {}) {
  const text = String(raw || '').trim();
  if (!text) return '';

  if (CODE_HINTS[text]) return CODE_HINTS[text];

  const httpMatch = /HTTP\s+(\d{3})/i.exec(text);
  if (httpMatch) {
    const code = httpMatch[1];
    if (code === '403') return 'Доступ запрещён (HTTP 403) — ссылка могла устареть, попробуйте снова из плеера';
    if (code === '404') {
      const hay = `${text} ${extra.url || ''} ${extra.host || ''}`;
      if (/libria\.fun|anilibria|aniliberty|iframe\.php/i.test(hay)) {
        return 'Релиз недоступен на AniLibria (HTTP 404) — попробуйте Kodik у той же озвучки';
      }
      return 'Файл не найден (HTTP 404) — попробуйте другое качество или источник';
    }
    if (code === '429') return 'Слишком много запросов (HTTP 429) — CDN ограничил скорость, подождите и повторите';
    if (code === '500' || code === '502' || code === '503') return `Ошибка сервера источника (HTTP ${code})`;
    return `Ошибка HTTP ${code}`;
  }

  for (const [re, hint] of NET_ERROR_HINTS) {
    if (re.test(text)) return hint;
  }

  if (/ffmpeg/i.test(text) || /ffprobe/i.test(text)) {
    if (/не найден|ENOENT|нужен/i.test(text)) {
      return 'FFmpeg не найден. Установите его во вкладке «Загрузки»';
    }
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
  }

  if (/Не все сегменты|плейлисте нет|master-плейлисте|пустым|устареть|отменена/i.test(text)) return text;

  return '';
}

/**
 * @param {unknown} err
 * @param {{ url?: string, filename?: string, segment?: number, segmentTotal?: number, skipReformat?: boolean }} [context]
 */
function formatDownloadError(err, context = {}) {
  const rawFull = extractRawMessage(err);
  if (context.skipReformat && rawFull.includes(' · ')) {
    if (context.filename && !rawFull.includes('«')) {
      return `${rawFull} · «${context.filename}»`;
    }
    return rawFull;
  }
  if (rawFull.includes(' · ') && (/источник:|сегмент \d/i.test(rawFull))) {
    return rawFull;
  }

  const { message: raw, url: rawUrl } = splitRawAndUrl(rawFull);
  const host = hostFromUrl(context.url || rawUrl);
  const friendly = mapKnownError(raw || rawFull, { url: context.url || rawUrl, host });
  const parts = [];

  if (friendly) parts.push(friendly);
  else if (raw || rawFull) parts.push(raw || rawFull);
  else parts.push('Неизвестная ошибка скачивания');

  if (context.filename) parts.push(`«${context.filename}»`);
  if (host) parts.push(`источник: ${host}`);
  if (Number.isFinite(context.segment) && Number.isFinite(context.segmentTotal)) {
    parts.push(`сегмент ${context.segment + 1}/${context.segmentTotal}`);
  }

  const technical = raw || rawFull;
  if (friendly && technical && friendly !== technical) {
    const techShort = splitRawAndUrl(technical).message || technical;
    if (techShort && techShort !== friendly && techShort.length < 120) {
      parts.push(`(${techShort})`);
    }
  }

  return parts.join(' · ');
}

module.exports = { formatDownloadError, extractRawMessage, mapKnownError };
