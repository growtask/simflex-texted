// Блок «Содержание» — полностью в папке (этап 5).
import TOC_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { TocUI } from './toc.editor.js';

// Содержание (этап 6.3, макет block-navigation): заголовок и главы — ссылки на якоря страницы.
// Сайт: <nav class="ted-toc"><div class="ted-toc__progress"><div class="ted-toc__bar"></div></div>
//        <div class="ted-toc__panel"><p class="ted-toc__title">Заголовок</p><ul class="ted-toc__list"><li><a href="#glava-1">Глава</a></li></ul></div></nav>
// content.js: полоса прогресса чтения идёт за читателем (прилипает к верху окна), список свёрнут — «Показать» / «Скрыть».
// Без скрипта — список виден. Правка: заголовок — строка текста, главы правятся окном «Глава содержания» (название + якорь).

const ANCHOR_RE = /^#[A-Za-z][A-Za-z0-9_-]{0,79}$/;
export const tocAnchorOk = (href) => typeof href === 'string' && ANCHOR_RE.test(href);

export function makeTocItem(doc, title, href) {
  const li = doc.createElement('li');
  li.setAttribute('contenteditable', 'false');
  const a = doc.createElement('a');
  a.setAttribute('href', href);
  a.textContent = title;
  li.appendChild(a);
  return li;
}

/** Блок содержания в правке. */
export function makeToc(doc, title = '', items = []) {
  const toc = doc.createElement('div');
  toc.className = 'ted-toc';
  const progress = doc.createElement('div');
  progress.className = 'ted-toc__progress';
  progress.setAttribute('contenteditable', 'false');
  const bar = doc.createElement('div');
  bar.className = 'ted-toc__bar';
  progress.appendChild(bar);
  const panel = doc.createElement('div');
  panel.className = 'ted-toc__panel';
  const t = doc.createElement('p');
  t.className = 'ted-toc__title';
  if (title) t.textContent = title; else t.appendChild(doc.createElement('br'));
  const list = doc.createElement('ul');
  list.className = 'ted-toc__list';
  list.setAttribute('contenteditable', 'false');
  for (const it of items) list.appendChild(makeTocItem(doc, it.title, it.href));
  panel.append(t, list);
  toc.append(progress, panel);
  return toc;
}

/** Наш вывод или форма правки → форма правки (главы — только ссылки на якоря #id). */
export function cleanToc(node, doc, idOk) {
  const title = node.querySelector('.ted-toc__title');
  const items = [...node.querySelectorAll('.ted-toc__list > li')].map((li) => {
    const a = li.querySelector('a[href]');
    const href = a ? a.getAttribute('href') : '';
    return { title: (a || li).textContent.replace(/\s+/g, ' ').trim(), href };
  }).filter((it) => it.title && tocAnchorOk(it.href));
  const toc = makeToc(doc, title ? title.textContent.replace(/\s+/g, ' ').trim() : '', items);
  if (idOk && idOk(node.id)) toc.id = node.id;
  return toc;
}

/** Правка: полоса, панель, заголовок одной строкой, главы — нередактируемые ссылки. */
export function normalizeToc(toc, doc) {
  let changed = false;
  let progress = toc.querySelector(':scope > .ted-toc__progress');
  let panel = toc.querySelector(':scope > .ted-toc__panel');
  if (!progress || !panel) {
    const fresh = cleanToc(toc, doc);
    if (toc.id) fresh.id = toc.id;
    toc.replaceWith(fresh);
    return true;
  }
  let title = panel.querySelector(':scope > .ted-toc__title');
  let list = panel.querySelector(':scope > .ted-toc__list');
  if (!title) { title = doc.createElement('p'); title.className = 'ted-toc__title'; panel.insertBefore(title, panel.firstChild); changed = true; }
  if (!list) { list = doc.createElement('ul'); list.className = 'ted-toc__list'; list.setAttribute('contenteditable', 'false'); panel.appendChild(list); changed = true; }
  for (const el of [...title.querySelectorAll('p, div, h2, h3, h4, h5, h6, li, ul, ol')]) { el.replaceWith(...el.childNodes); changed = true; }
  if (!title.firstChild) { title.appendChild(doc.createElement('br')); changed = true; }
  for (const n of [...panel.childNodes]) if (n !== title && n !== list && !(n.nodeType === 1 && n.hasAttribute('data-tedui-m'))) { n.remove(); changed = true; }
  for (const n of [...toc.childNodes]) if (n !== progress && n !== panel && !(n.nodeType === 1 && n.hasAttribute('data-tedui-m'))) { n.remove(); changed = true; }
  for (const li of list.children) if (li.getAttribute('contenteditable') !== 'false') { li.setAttribute('contenteditable', 'false'); changed = true; }
  return changed;
}

/** Форма правки → HTML сайта. */
export function serializeToc(toc) {
  const id = toc.id ? ` id="${toc.id}"` : '';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const title = toc.querySelector('.ted-toc__title');
  const items = [...toc.querySelectorAll('.ted-toc__list > li')].map((li) => {
    const a = li.querySelector('a[href]');
    const href = a && a.getAttribute('href');
    if (!tocAnchorOk(href)) return '';
    return `<li><a href="${esc(href)}">${esc(a.textContent.trim())}</a></li>`;
  }).filter(Boolean);
  return `<nav class="ted-toc"${id}><div class="ted-toc__progress"><div class="ted-toc__bar"></div></div><div class="ted-toc__panel"><p class="ted-toc__title">${esc(title ? title.textContent.trim() : '')}</p><ul class="ted-toc__list">${items.join('')}</ul></div></nav>`;
}

/** Якоря документа для выбора в окне главы: [{ id, text }]. */
export function documentAnchors(root) {
  return [...root.querySelectorAll('[id]')]
    .filter((el) => !el.closest('.ted-toc') && /^[A-Za-z][A-Za-z0-9_-]*$/.test(el.id))
    .map((el) => ({ id: el.id, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) }));
}


registerBlock({
  toMarkdown: () => '',   // Ted.toMarkdown (22.11): содержание собирается заново по заголовкам
  ...TOC_BLOCK,
  match: (el) => el.classList.contains('ted-toc'),   // <nav> на сайте, <div> в правке
  /** Макет block-navigation, state=empty: заголовок, глав пока нет — «Добавить главу» под блоком; курсор — в заголовке. */
  create: (doc) => { const toc = makeToc(doc); return { el: toc, focus: toc.querySelector('.ted-toc__title') }; },
  /** Наш вывод (<nav>) или форма правки; главы — только ссылки на якоря. */
  clean: (node, doc, idOk) => cleanToc(node, doc, idOk),
  serialize: serializeToc,
  normalize: normalizeToc,   // полоса, панель, заголовок одной строкой, главы — ссылки
  canAlign: () => false,
  canBg: () => false,
  editorUi: (editor) => new TocUI(editor),
  editorUiName: 'toc',
  /** «Заголовок» в пустом заголовке (макет block-navigation). */
  placeholders: (editor, root) => {
    for (const t of root.querySelectorAll('.ted-toc > .ted-toc__panel > .ted-toc__title')) {
      if (!t.textContent.replace(/\u200b/g, '').trim()) t.setAttribute('data-tedui-ph', 'Заголовок');
    }
  },
  /** В наборе без содержания — заголовок жирным и список ссылок на главы; так же на сервере — toc.php. */
  toText: (el, { p, list, esc }) => {
    const out = [];
    const t = el.querySelector('.ted-toc__title');
    if (t && t.textContent.trim()) out.push(p('<strong>' + esc(t.textContent.trim()) + '</strong>'));
    const links = [...el.querySelectorAll('.ted-toc__list a[href]')].map((a) => '<a href="' + esc(a.getAttribute('href')) + '">' + esc(a.textContent.trim()) + '</a>');
    if (links.length) out.push(list('ul', links));
    return out;
  },
});
