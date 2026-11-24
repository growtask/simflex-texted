// Блок «Вкладки» — полностью в папке (этап 5). Контейнер: тела вкладок — «хосты» обычных блоков (общий код — resources/js/core/containers.js).
import TABS_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { HOST_CLASS, stripInHost } from '../../resources/js/core/containers.js';
import { sanitizeNodes, serializeBlocks, cleanInlineChildren } from '../../resources/js/core/sanitize.js';
import { normalizeRoot } from '../../resources/js/core/blocks.js';
import { TabsUI } from './tabs.editor.js';

// Сайт: <div class="ted-tabs"><div class="ted-tabs__panel"><p class="ted-tabs__title">Название</p><div class="ted-tabs__body">блоки</div></div>…</div>
// Без скрипта — разделы подряд с заголовками; content.js строит ряд вкладок (как в макете) и показывает одну панель.
// Правка: <div class="ted-tabs"><div class="ted-tabs__bar"><div class="ted-tabs__title" data-tedui-key>…</div>…</div>
//          <div class="ted-tabs__body ted-ui-host" data-tedui-key>блоки</div>…</div> — заголовки в ряд, видно тело активной вкладки.

export const TABS_MAX = 8;
let tabKey = 0;
const nextKey = () => String(++tabKey);

function emptyBody(doc, cls) {
  const body = doc.createElement('div');
  body.className = `${cls} ${HOST_CLASS}`;
  const p = doc.createElement('p');
  p.appendChild(doc.createElement('br'));
  body.appendChild(p);
  return body;
}

/** Новая вкладка (форма правки): [заголовок, тело] с общим ключом. */
export function makeTab(doc, titleNodes = null, bodyFrag = null) {
  const key = nextKey();
  const title = doc.createElement('div');
  title.className = 'ted-tabs__title';
  title.setAttribute('data-tedui-key', key);
  if (titleNodes && titleNodes.childNodes.length) while (titleNodes.firstChild) title.appendChild(titleNodes.firstChild);
  else title.appendChild(doc.createElement('br'));
  let body;
  if (bodyFrag && bodyFrag.childNodes.length) {
    body = doc.createElement('div');
    body.className = `ted-tabs__body ${HOST_CLASS}`;
    body.appendChild(bodyFrag);
  } else body = emptyBody(doc, 'ted-tabs__body');
  body.setAttribute('data-tedui-key', key);
  return [title, body];
}

export function makeTabs(doc, count = 3) {
  const tabs = doc.createElement('div');
  tabs.className = 'ted-tabs';
  const bar = doc.createElement('div');
  bar.className = 'ted-tabs__bar';
  tabs.appendChild(bar);
  for (let i = 0; i < count; i += 1) { const [t, b] = makeTab(doc); bar.appendChild(t); tabs.appendChild(b); }
  return tabs;
}

/** Наш вывод (панели) или форма правки → форма правки. */
export function cleanTabs(node, doc, cleanInline, cleanBlocks, idOk) {
  let pairs = [];
  const bar = node.querySelector(':scope > .ted-tabs__bar');
  if (bar) {
    const bodies = [...node.querySelectorAll(':scope > .ted-tabs__body')];
    pairs = [...bar.querySelectorAll(':scope > .ted-tabs__title')].map((t, i) => [t, bodies.find((b) => b.getAttribute('data-tedui-key') && b.getAttribute('data-tedui-key') === t.getAttribute('data-tedui-key')) || bodies[i]]);
  } else {
    pairs = [...node.querySelectorAll(':scope > .ted-tabs__panel')].map((p) => [p.querySelector(':scope > .ted-tabs__title'), p.querySelector(':scope > .ted-tabs__body')]);
  }
  if (!pairs.length) return null;
  const tabs = doc.createElement('div');
  tabs.className = 'ted-tabs';
  if (idOk && idOk(node.id)) tabs.id = node.id;
  const outBar = doc.createElement('div');
  outBar.className = 'ted-tabs__bar';
  tabs.appendChild(outBar);
  for (const [t, b] of pairs.slice(0, TABS_MAX)) {
    const title = doc.createElement('div');
    if (t) cleanInline(t, title);
    const frag = cleanBlocks(b ? [...b.childNodes] : []);
    stripInHost(frag, doc);
    const [tt, bb] = makeTab(doc, title, frag);
    outBar.appendChild(tt);
    tabs.appendChild(bb);
  }
  return tabs;
}

/** Правка: ряд заголовков, тело на каждый заголовок в том же порядке (после перестановки заголовков тела идут за ними). */
export function normalizeTabs(tabs, doc, normalizeBody) {
  let changed = false;
  let bar = tabs.querySelector(':scope > .ted-tabs__bar');
  if (!bar) { bar = doc.createElement('div'); bar.className = 'ted-tabs__bar'; tabs.insertBefore(bar, tabs.firstChild); changed = true; }
  if (bar !== tabs.firstElementChild) { tabs.insertBefore(bar, tabs.firstChild); changed = true; }
  for (const n of [...bar.childNodes]) {
    if (n.nodeType === 1 && n.classList.contains('ted-tabs__title')) continue;
    if (n.nodeType === 1 && n.hasAttribute('data-tedui-m')) continue;
    if (n.textContent && n.textContent.trim()) {
      const near = n.previousElementSibling || n.nextElementSibling;
      if (near && near.classList.contains('ted-tabs__title')) near.appendChild(doc.createTextNode(n.textContent));
    }
    n.remove();
    changed = true;
  }
  if (!bar.children.length) { const [t, b] = makeTab(doc); bar.appendChild(t); tabs.appendChild(b); changed = true; }
  const bodies = [...tabs.querySelectorAll(':scope > .ted-tabs__body')];
  const titles = [...bar.children];
  const used = new Set();
  let prev = bar;
  for (const t of titles) {
    let key = t.getAttribute('data-tedui-key');
    if (!key) { key = nextKey(); t.setAttribute('data-tedui-key', key); changed = true; }
    let body = bodies.find((b) => !used.has(b) && b.getAttribute('data-tedui-key') === key);
    if (!body) body = bodies.find((b) => !used.has(b) && !titles.some((x) => x.getAttribute('data-tedui-key') === b.getAttribute('data-tedui-key')));
    if (!body) { body = emptyBody(doc, 'ted-tabs__body'); changed = true; }
    if (body.getAttribute('data-tedui-key') !== key) { body.setAttribute('data-tedui-key', key); changed = true; }
    if (!body.classList.contains(HOST_CLASS)) { body.classList.add(HOST_CLASS); changed = true; }
    used.add(body);
    if (prev.nextSibling !== body) { prev.after(body); changed = true; }
    prev = body;
    for (const el of [...t.querySelectorAll('p, div, h2, h3, h4, h5, h6, li')]) { el.replaceWith(...el.childNodes); changed = true; }
    if (!t.firstChild) { t.appendChild(doc.createElement('br')); changed = true; }
    if (normalizeBody(body)) changed = true;
    for (const el of body.querySelectorAll(':scope > [class*="ted-bg-"]')) {
      for (const c of [...el.classList]) if (c.startsWith('ted-bg-')) el.classList.remove(c);
      if (!el.className) el.removeAttribute('class');
      changed = true;
    }
  }
  for (const n of [...tabs.childNodes]) {
    if (n === bar || used.has(n) || (n.nodeType === 1 && n.hasAttribute('data-tedui-m'))) continue;
    n.remove();
    changed = true;
  }
  return changed;
}

/** Форма правки → HTML сайта: панели с заголовком и телом. */
export function serializeTabs(tabs, serializeBody) {
  const id = tabs.id ? ` id="${tabs.id}"` : '';
  const bar = tabs.querySelector(':scope > .ted-tabs__bar');
  const bodies = [...tabs.querySelectorAll(':scope > .ted-tabs__body')];
  const panels = (bar ? [...bar.querySelectorAll(':scope > .ted-tabs__title')] : []).map((t, i) => {
    const title = t.innerHTML.replace(/<br\s*\/?>$/i, '');
    return `<div class="ted-tabs__panel"><p class="ted-tabs__title">${title}</p><div class="ted-tabs__body">\n${bodies[i] ? serializeBody(bodies[i]) : ''}\n</div></div>`;
  });
  return `<div class="ted-tabs"${id}>\n${panels.join('\n')}\n</div>`;
}


/** Пустые вкладки (ни одного названия) — абзац; иначе — ряд названий и тело на каждое (как раньше normalizeRoot для контейнеров). */
function normalizeTabsBlock(el, doc, normalizeBody) {
  if (!el.querySelector('.ted-tabs__title')) {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    el.replaceWith(p);
    return true;
  }
  return normalizeTabs(el, doc, normalizeBody || ((b) => normalizeRoot(b)));
}

/** Вкладки в теле другого контейнера раскрываются: название жирным, за ним содержимое. */
function unnestTabs(inner, doc) {
  const flat = doc.createDocumentFragment();
  const titles = [...inner.querySelectorAll('.ted-tabs__title')];
  const bodies = [...inner.querySelectorAll('.ted-tabs__body')];
  titles.forEach((t, i) => {
    const p = doc.createElement('p');
    const s = doc.createElement('strong');
    s.textContent = t.textContent;
    p.appendChild(s);
    flat.appendChild(p);
    const b = bodies[i];
    if (b) while (b.firstChild) flat.appendChild(b.firstChild);
  });
  return flat;
}

registerBlock({
  // Ted.toMarkdown (22.11): название вкладки жирным, содержимое — блоками
  toMarkdown: (el, md) => [...el.querySelectorAll(':scope > .ted-tabs__panel')].map((p) => `**${(p.querySelector('.ted-tabs__title') || p).textContent.trim()}**\n\n${md.blocks(p.querySelector('.ted-tabs__body') || p)}`).join('\n\n'),
  ...TABS_BLOCK,
  match: (el) => el.tagName === 'DIV' && el.classList.contains('ted-tabs'),
  /** Макет block-tabs, state=empty: три вкладки, курсор в названии первой. */
  create: (doc) => { const tabs = makeTabs(doc, 3); return { el: tabs, focus: tabs.querySelector('.ted-tabs__title') }; },
  /** Наш вывод (панели) или форма правки → форма правки; не вкладки — содержимое как обычные блоки. */
  clean: (node, doc, idOk) => cleanTabs(node, doc, (from, to) => cleanInlineChildren(from, to, doc), (nodes) => sanitizeNodes(nodes, doc), idOk)
    || sanitizeNodes([...node.childNodes], doc),
  serialize: (el) => serializeTabs(el, (body) => serializeBlocks(body)),
  normalize: normalizeTabsBlock,
  unnest: unnestTabs,
  canAlign: () => false,
  canBg: () => false,
  editorUi: (editor) => new TabsUI(editor),
  editorUiName: 'tabs',
  /** «Вкладка» в пустом названии (макет block-tabs, empty). */
  placeholders: (editor, root) => {
    for (const t of root.querySelectorAll('.ted-tabs > .ted-tabs__bar > .ted-tabs__title')) {
      if (!t.textContent.replace(/\u200b/g, '').trim()) t.setAttribute('data-tedui-ph', 'Вкладка');
    }
  },
  /** В наборе без вкладок — название жирным, за ним блоки вкладки; так же на сервере — tabs.php. */
  toText: (el, { p, esc }) => {
    const bodies = [...el.querySelectorAll(':scope > .ted-tabs__body')];
    return [...el.querySelectorAll(':scope > .ted-tabs__bar > .ted-tabs__title')].flatMap((t, i) => {
      const out = [];
      if (t.textContent.trim()) out.push(p('<strong>' + esc(t.textContent.trim()) + '</strong>'));
      if (bodies[i]) for (const c of bodies[i].children) if (c.textContent.trim()) out.push(c.cloneNode(true));
      return out;
    });
  },
});
