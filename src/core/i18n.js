// Язык интерфейса редактора (решение заказчика 22.11: английский, смена — в «Ещё»). Строки в коде — русские;
// t() возвращает перевод из словаря (lang/<язык>.js), а если его нет — русскую строку. Содержимое статьи не переводится.
// Элементы, созданные через h(), помнят русские подписи — relabel() переводит уже показанный интерфейс без перезагрузки.

const DICT = {};
let LANG = 'ru';

/** Словарь языка: { 'Русская строка': 'Перевод' }. Можно дополнять своими строками. */
export function addLang(lang, map) {
  DICT[lang] = { ...(DICT[lang] || {}), ...map };
}

export function setLang(lang) {
  LANG = lang === 'ru' || DICT[lang] ? lang : 'ru';
  return LANG;
}

export function getLang() { return LANG; }

export function langs() { return ['ru', ...Object.keys(DICT)]; }

/** Перевод строки интерфейса. */
export function t(s) {
  if (LANG === 'ru' || typeof s !== 'string' || !s) return s;
  const d = DICT[LANG];
  return (d && (d[s] ?? d[s.trim()])) ?? s;
}

/** Атрибуты с текстом интерфейса — переводятся в h(). */
export const I18N_ATTRS = ['title', 'placeholder', 'aria-label', 'data-tip'];

/** Запомнить русские подписи элемента и показать их на текущем языке (вызывает h()). */
export function i18nMark(el, text, attrs) {
  if (text === undefined && !attrs) return;
  el.__ru = { text, attrs };
}

/** Перевести уже показанный интерфейс (после смены языка). */
export function relabel(root) {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const ru = el.__ru;
    if (!ru) continue;
    if (ru.text !== undefined) el.textContent = t(ru.text);
    if (ru.attrs) for (const [k, v] of Object.entries(ru.attrs)) el.setAttribute(k, t(v));
  }
}

