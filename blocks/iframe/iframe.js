// Блок «iFrame» (этап 6.4, макет block-iframe, Embed/iframe 7456:86209, окно editor-popover kind=iframe) — полностью в папке (этап 5).
// Сайт: <figure class="ted-iframe" data-ratio="16:9"><iframe src="https://…" title="…" loading="lazy" sandbox="…" referrerpolicy="…" allowfullscreen></iframe>[<figcaption>Подпись</figcaption>]</figure>
// Размер — пропорция из стандартных (решение 22.11: вместо высоты в пикселях); у старых блоков без пропорции остаётся height.
// Решение заказчика: поле принимает любой iframe — адрес https:// или вставленный код <iframe …> (из него берутся адрес и высота).
// Безопасность: только https без логина, пароля и порта; песочница и запрет srcdoc ставятся всегда (и на сервере).

import IFRAME_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { IframeUI } from './iframe.editor.js';

export const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
export const IFRAME_MIN_H = 120;
export const IFRAME_MAX_H = 2000;
/** Стандартные пропорции фрейма (решение 22.11); первая — для нового блока. 9 : 16 — вертикальные виджеты (узкий, по центру). */
export const IFRAME_RATIOS = ['16:9', '4:3', '1:1', '21:9', '9:16'];
export const iframeRatio = (v) => (IFRAME_RATIOS.includes(String(v || '').trim()) ? String(v).trim() : '');

/** Адрес фрейма допустим: https, без логина / пароля / порта, без пробелов и кавычек; hosts — сайты из настроек сервера (null — любой). */
export function iframeSrcOk(value, hosts = null) {
  const s = String(value || '').trim();
  if (!s || /[\s<>"'`]/.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && !u.port && (!hosts || hosts.includes(u.hostname.toLowerCase()));
  } catch (e) { return false; }
}

/** Высота: целое число пикселей в разумных пределах, иначе '' (по умолчанию — пропорция 16 : 10). */
export function iframeHeight(value) {
  const n = parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
  if (!n) return '';
  return String(Math.min(IFRAME_MAX_H, Math.max(IFRAME_MIN_H, n)));
}

/** Разбор поля «Адрес страницы»: адрес или код <iframe src=… height=…>. */
export function parseIframeInput(text) {
  const s = String(text || '').trim();
  if (/^<iframe[\s>]/i.test(s)) {
    const doc = new DOMParser().parseFromString(s, 'text/html');
    const f = doc.querySelector('iframe');
    if (!f) return { src: '', height: '' };
    const h = f.getAttribute('height') || '';
    return { src: (f.getAttribute('src') || '').trim(), height: /%/.test(h) ? '' : iframeHeight(h), title: (f.getAttribute('title') || '').trim() };
  }
  let src = s;
  if (src && !/^[a-z][a-z0-9+.-]*:/i.test(src) && /^[^\s/]+\.[^\s]+/.test(src)) src = `https://${src}`;
  return { src, height: '' };
}

const frameEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const frameLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Данные блока (из вывода сайта или формы правки). */
export function readIframe(node) {
  const f = node.querySelector('iframe');
  const cap = node.querySelector(':scope > figcaption');
  const ratio = iframeRatio(node.getAttribute && node.getAttribute('data-ratio'));
  return {
    src: f && iframeSrcOk(f.getAttribute('src')) ? f.getAttribute('src').trim() : '',
    ratio,
    height: f && !ratio ? iframeHeight(f.getAttribute('height')) : '',   // пропорция важнее старой высоты
    caption: cap ? frameLine(cap.textContent) : '',
  };
}

/** Фрейм с обязательными атрибутами безопасности. */
function makeFrame(doc, { src, height, caption }) {
  const f = doc.createElement('iframe');
  f.setAttribute('src', src);
  if (height) f.setAttribute('height', height);
  // в правке высота и стилем: сброс стилей админки (iframe{height:auto}) сильнее атрибута, а attr() в CSS есть не везде;
  // сохраняется только атрибут (serializeIframe собирает разметку из данных)
  if (height && !(window.CSS && CSS.supports && CSS.supports('height', 'attr(height px)'))) f.style.height = `${parseInt(height, 10)}px`;
  f.setAttribute('title', caption || 'Встроенная страница');
  f.setAttribute('loading', 'lazy');
  f.setAttribute('sandbox', IFRAME_SANDBOX);
  f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  f.setAttribute('allowfullscreen', '');
  return f;
}

/** Форма правки: нередактируемый блок; без адреса — пустое состояние (поле адреса рисует интерфейс). */
export function makeIframeBlock(doc, data = {}) {
  const fig = doc.createElement('figure');
  fig.className = 'ted-iframe';
  fig.setAttribute('contenteditable', 'false');
  const ratio = iframeRatio(data.ratio);
  const d = { src: iframeSrcOk(data.src) ? String(data.src).trim() : '', height: ratio ? '' : iframeHeight(data.height), caption: frameLine(data.caption) };
  if (ratio) fig.setAttribute('data-ratio', ratio);
  if (d.src) fig.appendChild(makeFrame(doc, d));
  else fig.setAttribute('data-tedui-empty', '');
  if (d.caption) { const c = doc.createElement('figcaption'); c.textContent = d.caption; fig.appendChild(c); }
  return fig;
}

export function cleanIframe(node, doc, idOk) {
  const fig = makeIframeBlock(doc, readIframe(node));
  if (idOk && idOk(node.id)) fig.id = node.id;
  return fig;
}

/** Правка: структура как у makeIframeBlock (служебные элементы интерфейса — data-tedui-m — не трогаем). */
export function normalizeIframe(fig, doc) {
  const d = readIframe(fig);
  const f = fig.querySelector(':scope > iframe');
  const ok = fig.getAttribute('contenteditable') === 'false'
    && (fig.getAttribute('data-ratio') || '') === d.ratio
    && (d.src ? f && f.getAttribute('sandbox') === IFRAME_SANDBOX && !f.hasAttribute('srcdoc') : !f)
    && [...fig.childNodes].every((n) => n.nodeType === 1 && (n.tagName === 'IFRAME' || n.tagName === 'FIGCAPTION' || n.hasAttribute('data-tedui-m')));
  if (ok) return false;
  const fresh = makeIframeBlock(doc, d);
  const ui = [...fig.querySelectorAll(':scope > [data-tedui-m]')];
  fig.replaceChildren(...fresh.childNodes, ...ui);
  fig.setAttribute('contenteditable', 'false');
  fig.toggleAttribute('data-tedui-empty', !d.src);
  return true;
}

/** Форма правки → HTML сайта; без адреса блок не сохраняется. */
export function serializeIframe(fig) {
  const d = readIframe(fig);
  if (!d.src) return '';
  const id = fig.id ? ` id="${frameEsc(fig.id)}"` : '';
  const ratio = d.ratio ? ` data-ratio="${d.ratio}"` : '';
  const h = d.height ? ` height="${d.height}"` : '';
  const cap = d.caption ? `<figcaption>${frameEsc(d.caption)}</figcaption>` : '';
  return `<figure class="ted-iframe"${id}${ratio}><iframe src="${frameEsc(d.src)}"${h} title="${frameEsc(d.caption || 'Встроенная страница')}" loading="lazy" sandbox="${IFRAME_SANDBOX}" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>${cap}</figure>`;
}


registerBlock({
  toMarkdown: (el) => { const f = el.querySelector('iframe'); return f ? `[Встроенная страница](${f.getAttribute('src')})` : ''; },   // Ted.toMarkdown (22.11)
  ...IFRAME_BLOCK,
  match: (el) => el.tagName === 'FIGURE' && el.classList.contains('ted-iframe'),
  /** Макет block-iframe, state=empty: поле «Адрес страницы» и «Добавить»; после вставки курсор — в поле. */
  create: (doc) => ({ el: makeIframeBlock(doc), focus: null }),
  afterInsert: (editor, el) => { if (editor.iframes) { editor.iframes.sync(); editor.iframes.focusInput(el); } },
  clean: cleanIframe,
  serialize: serializeIframe,
  normalize: normalizeIframe,
  canAlign: () => false,
  canBg: () => false,
  canTc: () => false,   // карточка: цвет текста не меняется (меню «Цвет», 27.11)
  editorUi: (editor) => new IframeUI(editor),
  editorUiName: 'iframes',
  /** В наборе без iFrame — ссылка на страницу (текст — подпись или адрес); так же на сервере — iframe.php. */
  toText: (el, { p, esc }) => {
    const f = el.querySelector('iframe[src]');
    const cap = el.querySelector('figcaption');
    return f ? [p('<a href="' + esc(f.getAttribute('src')) + '">' + esc((cap && cap.textContent.trim()) || f.getAttribute('src')) + '</a>')] : [];
  },
});
