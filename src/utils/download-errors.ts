const NET_ERROR_HINTS: Array<[RegExp, string]> = [
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
];

const CODE_HINTS: Record<string, string> = {
  'embed-url-not-video': 'Не удалось получить прямую ссылку на видео — передан адрес страницы плеера, а не файла',
  'libria-release-missing': 'Релиз удалён или недоступен на AniLibria — попробуйте источник Kodik у той же озвучки',
  'invalid-url': 'Некорректный или пустой URL для скачивания',
  empty: 'Список файлов для скачивания пуст',
};

function mapKnownError(raw: string): string {
  const text = raw.trim();
  if (!text) return '';

  if (CODE_HINTS[text]) return CODE_HINTS[text];

  const httpMatch = /HTTP\s+(\d{3})/i.exec(text);
  if (httpMatch) {
    const code = httpMatch[1];
    if (code === '403') return 'Доступ запрещён (HTTP 403) — ссылка могла устареть';
    if (code === '404') return 'Файл не найден (HTTP 404)';
    if (code === '429') return 'Слишком много запросов (HTTP 429) — CDN ограничил скорость, попробуйте позже';
    if (code === '500' || code === '502' || code === '503') return `Ошибка сервера (HTTP ${code})`;
    return `Ошибка HTTP ${code}`;
  }

  for (const [re, hint] of NET_ERROR_HINTS) {
    if (re.test(text)) return hint;
  }

  return '';
}

/** Показывает понятное описание ошибки загрузки в UI. */
export function formatDownloadErrorMessage(error?: string): string {
  if (!error?.trim()) return 'Неизвестная ошибка скачивания';
  // Уже отформатировано в main process
  if (error.includes(' · ')) return error;
  const friendly = mapKnownError(error);
  if (!friendly || friendly === error) return error;
  return `${friendly} (${error})`;
}
