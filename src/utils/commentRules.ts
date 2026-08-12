export const COMMENT_RULES_FORBIDDEN: string[] = [
  'Спойлеры без специальной пометки о том, что это спойлер (над строкой ввода текста)',
  'Оскорбления и угрозы в адрес других пользователей',
  'Провокации на конфликты, а также религиозные, национальные и политические споры',
  'Провокации на нарушение правил другими пользователями',
  'Чрезмерное употребление нецензурной лексики',
  'Выпрашивание или накрутка оценок комментариев',
  'Флуд, оффтоп и спам',
];

/** Полные правила сообщества */
export const COMMENT_RULES_URL = 'https://anixart-app.com/rules';

export const COMMENT_RULES_FOOTER_PREFIX =
  'Это выжимка из основных правил. Полный текст — в';

export const COMMENT_RULES_FOOTER_LINK_LABEL = 'Правилах сообщества';

/** @deprecated используйте PREFIX + ссылку COMMENT_RULES_URL */
export const COMMENT_RULES_FOOTER =
  `${COMMENT_RULES_FOOTER_PREFIX} ${COMMENT_RULES_FOOTER_LINK_LABEL}.`;
