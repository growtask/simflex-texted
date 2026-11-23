// Белый список разметки — тот же, что на сервере (php/sanitize.php → TedSanitizer), этап 3 MODULAR_PLAN.md.
// Им чистится «сырой» HTML старых статей (TinyMCE: таблицы, свои вставки, div со стилями), который редактор
// показывает нередактируемым блоком: в браузере остаётся ровно то, что оставит сервер.
// Списки между маркерами сверяет тест php/test-sanitize.php (с константами TedSanitizer). На этапе 5 они будут
// собираться из block.json блоков.

import { urlOk, srcsetOk } from './urls.js';
import { registeredBlocks } from './registry.js';

/* allowlist:begin — те же списки, что TedSanitizer::ALLOWED, DROP_WITH_CONTENT, ATTRS в php/sanitize.php */
export const ALLOWED_TAGS = [
  "div", "ul", "ol", "li", "code", "br",
  "strong", "em", "u", "s", "sub", "sup", "mark", "a", "span",
  "figure", "figcaption", "img", "picture", "source", "video", "audio",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "dl", "dt", "dd", "details", "summary", "address", "iframe", "nav"
];
export const DROP_WITH_CONTENT = [
  "script", "style", "link", "meta", "base", "template", "noscript", "object", "embed", "applet", "frame", "frameset",
  "form", "input", "button", "select", "option", "textarea", "svg", "math", "xmp", "listing", "plaintext", "title", "head",
  "canvas", "audio-worklet", "bgsound", "marquee", "noframes", "noembed"
];
export const ALLOWED_ATTRS = {
  "a": ["href", "target", "rel", "download", "data-ted-video"],
  "img": ["src", "alt", "width", "height", "loading", "srcset", "sizes"],
  "source": ["src", "srcset", "type", "media", "sizes"],
  "video": ["src", "controls", "preload", "playsinline", "poster", "width", "height", "loop", "muted"],
  "audio": ["src", "controls", "preload", "loop", "muted", "title"],
  "iframe": ["src", "width", "height", "allowfullscreen", "title", "loading", "referrerpolicy"],
  "td": ["colspan", "rowspan", "data-formula"],
  "th": ["colspan", "rowspan", "scope", "data-formula"],
  "table": ["data-cols"],
  "col": ["span"],
  "colgroup": ["span"],
  "ol": ["start", "reversed", "type"],
  "li": ["value"],
  "details": ["open", "itemscope", "itemprop", "itemtype"],
  "summary": ["itemprop"],
  "div": ["data-words", "data-chars", "data-minutes", "data-blocks", "itemscope", "itemprop", "itemtype"]
};
export const VIDEO_HOSTS = ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "player.vimeo.com", "rutube.ru", "vkvideo.ru", "vk.com"];
/* allowlist:end */
// Блоки из реестра (этап 5) приносят свои теги и атрибуты сами — block.json → html; сервер читает те же файлы (php/blocks.php).

/** Тег разрешён: список ядра или блок из реестра. */
export function tagAllowed(tag) {
  return ALLOWED_TAGS.includes(tag) || registeredBlocks().some((d) => Object.prototype.hasOwnProperty.call(d.html, tag));
}

/** Атрибуты тега: ядро + блоки реестра. */
export function attrsAllowed(tag) {
  const out = [...(ALLOWED_ATTRS[tag] || [])];
  for (const d of registeredBlocks()) for (const a of d.html[tag] || []) if (!out.includes(a)) out.push(a);
  return out;
}

// Шаблоны: id — латиница, цифры, «_» и «-», с буквы, до 64 знаков; классы — только ted-* (оформление блоков).
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const CLASS_PATTERN = /^ted-[a-z0-9_-]{1,40}$/;
const BLOCK_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
const VIDEO_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups';
const ALLOW_URL_ATTRS = ['href', 'src', 'poster'];

function frameUrl(value, hosts) {
  try {
    const v = String(value || '').trim();
    if (!v || /[\s<>"'`]/.test(v)) return false;
    const u = new URL(v);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && !u.port && (!hosts || hosts.includes(u.hostname.toLowerCase()));
  } catch (e) { return false; }
}

/** Элемент блока с фреймом (block.json → frames: true, блок «iFrame»). */
function isFrameBlock(el) {
  return !!el && el.nodeType === 1 && registeredBlocks().some((d) => d.frames && d.match(el));
}

/** Песочница и правила фрейма — как на сервере; frameHosts — сайты блока «iFrame» (null — любой https). */
function frameOk(el, frameHosts) {
  const parent = el.parentElement;
  const block = isFrameBlock(parent);
  return block ? frameUrl(el.getAttribute('src'), frameHosts) : frameUrl(el.getAttribute('src'), VIDEO_HOSTS);
}

/** Атрибут-идентификатор CMS из block.json → ids (встраивание, товар). */
function idAttr(name) {
  return registeredBlocks().some((d) => d.ids && d.ids.includes(name));
}

function cleanAttributes(el, tag) {
  const allowed = attrsAllowed(tag);
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name === 'class') {
      const classes = [...new Set(value.trim().split(/\s+/).filter((c) => CLASS_PATTERN.test(c)))];
      if (classes.length) el.setAttribute('class', classes.join(' ')); else el.removeAttribute(attr.name);
      continue;
    }
    if (name === 'id') { if (!ID_PATTERN.test(value)) el.removeAttribute(attr.name); continue; }
    if (!allowed.includes(name)) { el.removeAttribute(attr.name); continue; }
    if (ALLOW_URL_ATTRS.includes(name)) {
      const kind = name === 'href' ? 'link' : (name === 'src' && (tag === 'img' || (tag === 'source' && el.parentElement && el.parentElement.tagName === 'PICTURE'))) ? 'image' : 'media';
      if (!urlOk(value, kind)) { el.removeAttribute(attr.name); continue; }
    }
    if (name === 'srcset' && !srcsetOk(value)) { el.removeAttribute(attr.name); continue; }
    if (name === 'target' && value !== '_blank' && value !== '_self') el.removeAttribute(attr.name);
    if (idAttr(name) && !/^[\w-]{1,64}$/.test(value)) el.removeAttribute(attr.name);   // block.json → ids: id статьи, товара CMS
    if (name === 'data-cols' && !/^(?:[1-9]|10)$/.test(value)) el.removeAttribute(attr.name);
    if (name === 'itemscope' && value !== '' && value !== 'itemscope') el.setAttribute('itemscope', '');
    if (name === 'itemprop' && !['mainEntity', 'name', 'acceptedAnswer', 'text'].includes(value)) el.removeAttribute(attr.name);
    if (name === 'itemtype' && !['https://schema.org/FAQPage', 'https://schema.org/Question', 'https://schema.org/Answer'].includes(value)) el.removeAttribute(attr.name);
    if (name === 'data-formula' && !/^=[0-9A-Za-zА-Яа-яЁё$:;,.+\-−–—*/×÷()%#!\s]{0,499}$/u.test(value)) el.removeAttribute(attr.name);
    if (['width', 'height', 'colspan', 'rowspan', 'span', 'start', 'value'].includes(name) && !/^\d{1,5}%?$/.test(value)) el.removeAttribute(attr.name);
  }
  if (tag === 'a') {
    if (el.getAttribute('target') === '_blank') el.setAttribute('rel', 'noopener noreferrer');
    else el.removeAttribute('rel');
    const video = el.getAttribute('data-ted-video');
    if (video && !frameUrl(video, VIDEO_HOSTS)) el.removeAttribute('data-ted-video');
  }
  if (tag === 'iframe') {
    const inBlock = isFrameBlock(el.parentElement);
    const full = el.hasAttribute('allowfullscreen');
    for (const fixed of ['loading', 'sandbox', 'referrerpolicy', 'allowfullscreen']) el.removeAttribute(fixed);
    el.setAttribute('loading', 'lazy');
    el.setAttribute('sandbox', inBlock ? BLOCK_SANDBOX : VIDEO_SANDBOX);
    el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    if (full) el.setAttribute('allowfullscreen', '');
  }
}

/**
 * Очистить содержимое элемента по белому списку (как TedSanitizer::walk): опасные теги — с содержимым,
 * неизвестные — без обёртки (текст остаётся), атрибуты — по списку, адреса — по общему правилу, фреймы — в песочнице.
 */
export function cleanByAllowlist(parent, frameHosts = null) {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 8 || node.nodeType === 7 || node.nodeType === 10) { node.remove(); continue; }
    if (node.nodeType !== 1) continue;
    const tag = node.localName.toLowerCase();
    if (DROP_WITH_CONTENT.includes(tag)) { node.remove(); continue; }
    if (!tagAllowed(tag) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      cleanByAllowlist(node, frameHosts);
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      node.remove();
      continue;
    }
    if (tag === 'iframe' && !frameOk(node, frameHosts)) { node.remove(); continue; }
    cleanAttributes(node, tag);
    cleanByAllowlist(node, frameHosts);
  }
  return parent;
}
