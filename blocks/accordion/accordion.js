// Блок «Аккордеон» — полностью в папке (этап 5). Контейнер: ответы — «хосты» обычных блоков (общий код — resources/js/core/containers.js).
// На сайте — <details>/<summary> с разметкой FAQ schema.org; её атрибуты и значения — в общем белом списке (allowlist.js = Sanitizer).
import ACCORDION_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { HOST_CLASS, stripInHost } from '../../resources/js/core/containers.js';
import { sanitizeNodes, serializeBlocks, cleanInlineChildren } from '../../resources/js/core/sanitize.js';
import { normalizeRoot, isEmptyBlock } from '../../resources/js/core/blocks.js';
import { AccordionUI } from './accordion.editor.js';


const FAQ = 'https://schema.org/FAQPage';
const QUESTION = 'https://schema.org/Question';
const ANSWER = 'https://schema.org/Answer';

/** Пустой пункт аккордеона в правке: вопрос + тело с пустым абзацем. */
export function makeAccordionItem(doc, question = null, bodyNodes = null) {
  const item = doc.createElement('div');
  item.className = 'ted-accordion__item';
  const q = doc.createElement('div');
  q.className = 'ted-accordion__q';
  if (question && question.childNodes.length) while (question.firstChild) q.appendChild(question.firstChild);
  else q.appendChild(doc.createElement('br'));
  const body = doc.createElement('div');
  body.className = `ted-accordion__body ${HOST_CLASS}`;
  if (bodyNodes && bodyNodes.childNodes.length) body.appendChild(bodyNodes);
  else { const p = doc.createElement('p'); p.appendChild(doc.createElement('br')); body.appendChild(p); }
  item.append(q, body);
  return item;
}

export function makeAccordion(doc, count = 1) {
  const acc = doc.createElement('div');
  acc.className = 'ted-accordion';
  for (let i = 0; i < count; i += 1) acc.appendChild(makeAccordionItem(doc));
  return acc;
}

/**
 * Любой вход (наш вывод с <details>, форма правки, одиночный <details>) → форма правки.
 * cleanInline(src, dst) — строчная очистка вопроса; cleanBlocks(nodes) → DocumentFragment чистых блоков ответа.
 */
export function cleanAccordion(node, doc, cleanInline, cleanBlocks, idOk) {
  const items = node.tagName === 'DETAILS' ? [node] : [...node.children].filter((c) => c.tagName === 'DETAILS' || c.classList.contains('ted-accordion__item'));
  if (!items.length) return null;
  const acc = doc.createElement('div');
  acc.className = 'ted-accordion';
  if (idOk && idOk(node.id)) acc.id = node.id;
  for (const it of items) {
    const qSrc = it.tagName === 'DETAILS' ? it.querySelector(':scope > summary') : it.querySelector(':scope > .ted-accordion__q');
    const bodySrc = it.tagName === 'DETAILS'
      ? (it.querySelector(':scope > .ted-accordion__a > .ted-accordion__body') || it.querySelector(':scope > .ted-accordion__a') || it)
      : it.querySelector(':scope > .ted-accordion__body');
    const q = doc.createElement('div');
    if (qSrc) cleanInline(qSrc, q);
    const nodes = bodySrc ? [...bodySrc.childNodes].filter((n) => n !== qSrc && !(n.nodeType === 1 && n.tagName === 'SUMMARY')) : [];
    const frag = cleanBlocks(nodes);
    // внутри ответа нет цветного фона и вложенных контейнеров (решение заказчика: «всё, кроме заливок»)
    for (const el of [...frag.querySelectorAll('[class*="ted-bg-"]')]) {
      for (const c of [...el.classList]) if (c.startsWith('ted-bg-')) el.classList.remove(c);
      if (!el.className) el.removeAttribute('class');
    }
    stripInHost(frag, doc);
    acc.appendChild(makeAccordionItem(doc, q, frag));
  }
  return acc;
}

/** Правка: у каждого пункта вопрос и тело; пустой вопрос — <br>; тело нормализует normalizeBody. Возвращает true, если что-то поправлено. */
export function normalizeAccordion(acc, doc, normalizeBody) {
  let changed = false;
  for (const n of [...acc.childNodes]) {
    if (n.nodeType === 1 && n.classList.contains('ted-accordion__item')) continue;
    if (n.nodeType === 1 && n.hasAttribute('data-tedui-m')) continue;
    n.remove();
    changed = true;
  }
  for (const item of acc.children) {
    let q = item.querySelector(':scope > .ted-accordion__q');
    let body = item.querySelector(':scope > .ted-accordion__body');
    if (!q) { q = doc.createElement('div'); q.className = 'ted-accordion__q'; item.insertBefore(q, item.firstChild); changed = true; }
    if (!body) { body = doc.createElement('div'); body.className = `ted-accordion__body ${HOST_CLASS}`; item.appendChild(body); changed = true; }
    if (!body.classList.contains(HOST_CLASS)) { body.classList.add(HOST_CLASS); changed = true; }
    for (const n of [...item.childNodes]) if (n !== q && n !== body && !(n.nodeType === 1 && n.hasAttribute('data-tedui-m'))) { n.remove(); changed = true; }
    // вопрос — одна строка текста: блоки внутри (после склейки браузером) разворачиваются
    for (const el of [...q.querySelectorAll('p, div, h2, h3, h4, h5, h6, li')]) { el.replaceWith(...el.childNodes); changed = true; }
    if (!q.firstChild) { q.appendChild(doc.createElement('br')); changed = true; }
    if (normalizeBody(body)) changed = true;
    for (const el of body.querySelectorAll(':scope > [class*="ted-bg-"]')) {
      for (const c of [...el.classList]) if (c.startsWith('ted-bg-')) el.classList.remove(c);
      if (!el.className) el.removeAttribute('class');
      changed = true;
    }
  }
  return changed;
}

/** Форма правки → HTML сайта: <details>/<summary>, ответ — блоки, разметка FAQ (schema.org microdata). */
export function serializeAccordion(acc, serializeBody) {
  const id = acc.id ? ` id="${acc.id}"` : '';
  const items = [...acc.querySelectorAll(':scope > .ted-accordion__item')].map((item) => {
    const q = item.querySelector(':scope > .ted-accordion__q');
    const body = item.querySelector(':scope > .ted-accordion__body');
    const qHtml = q ? q.innerHTML.replace(/<br\s*\/?>$/i, '') : '';
    const bodyHtml = body ? serializeBody(body) : '';
    return `<details class="ted-accordion__item" itemscope itemprop="mainEntity" itemtype="${QUESTION}"><summary class="ted-accordion__q" itemprop="name">${qHtml}</summary><div class="ted-accordion__a" itemscope itemprop="acceptedAnswer" itemtype="${ANSWER}"><div class="ted-accordion__body" itemprop="text">\n${bodyHtml}\n</div></div></details>`;
  });
  return `<div class="ted-accordion"${id} itemscope itemtype="${FAQ}">\n${items.join('\n')}\n</div>`;
}

/** Microdata FAQ: допустимые значения атрибутов (как в PHP). */
export const MICRODATA = {
  itemtype: new Set([FAQ, QUESTION, ANSWER]),
  itemprop: new Set(['mainEntity', 'name', 'acceptedAnswer', 'text']),
};


/** Аккордеон без пунктов — абзац; иначе — у каждого пункта вопрос и тело, тело — как корень (как раньше normalizeRoot для контейнеров). */
function normalizeAccordionBlock(el, doc, normalizeBody) {
  if (!el.querySelector('.ted-accordion__item')) {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    el.replaceWith(p);
    return true;
  }
  return normalizeAccordion(el, doc, normalizeBody || ((b) => normalizeRoot(b)));
}

/** Аккордеон в теле другого контейнера (колонка, ответ) раскрывается: вопрос жирным, за ним ответ. */
function unnestAccordion(inner, doc) {
  const flat = doc.createDocumentFragment();
  for (const sub of inner.querySelectorAll('.ted-accordion__item')) {
    const p = doc.createElement('p');
    const s = doc.createElement('strong');
    s.textContent = sub.querySelector('.ted-accordion__q')?.textContent || '';
    p.appendChild(s);
    flat.appendChild(p);
    const b = sub.querySelector('.ted-accordion__body');
    if (b) while (b.firstChild) flat.appendChild(b.firstChild);
  }
  return flat;
}

registerBlock({
  // Ted.toMarkdown (22.11): вопрос жирным, ответ — блоками
  toMarkdown: (el, md) => [...el.querySelectorAll('details')].map((d) => `**${(d.querySelector('summary') || d).textContent.trim()}**\n\n${md.blocks(d.querySelector('.ted-accordion__body') || d)}`).join('\n\n'),
  ...ACCORDION_BLOCK,
  match: (el) => el.tagName === 'DIV' && el.classList.contains('ted-accordion'),
  /** Одиночный <details> со страницы — тоже аккордеон (один пункт). */
  adopt: (el) => el.tagName === 'DETAILS',
  /** Макет block-accordion, state=empty: один пункт, курсор в вопросе. */
  create: (doc) => { const acc = makeAccordion(doc, 1); return { el: acc, focus: acc.querySelector('.ted-accordion__q') }; },
  /** Наш вывод (<details>), форма правки или одиночный <details> → форма правки; ответ — чистые блоки; иначе — содержимое как обычные блоки. */
  clean: (node, doc, idOk) => cleanAccordion(node, doc, (from, to) => cleanInlineChildren(from, to, doc), (nodes) => sanitizeNodes(nodes, doc), idOk)
    || sanitizeNodes([...node.childNodes], doc),
  serialize: (el) => serializeAccordion(el, (body) => serializeBlocks(body)),
  normalize: normalizeAccordionBlock,
  unnest: unnestAccordion,
  canAlign: () => false,
  canBg: () => false,
  editorUi: (editor) => new AccordionUI(editor),
  editorUiName: 'accordion',
  /** «Вопрос» в пустом вопросе, «Ответ» в пустом ответе (макет block-accordion, empty). */
  placeholders: (editor, root) => {
    for (const item of root.querySelectorAll('.ted-accordion > .ted-accordion__item')) {
      const q = item.querySelector(':scope > .ted-accordion__q');
      if (q && !q.textContent.replace(/\u200b/g, '').trim()) q.setAttribute('data-tedui-ph', 'Вопрос');
      const body = item.querySelector(':scope > .ted-accordion__body');
      const only = body && body.children.length === 1 ? body.firstElementChild : null;
      if (only && only.tagName === 'P' && isEmptyBlock(only)) only.setAttribute('data-tedui-ph', 'Ответ');
    }
  },
  /** В наборе без аккордеона — вопрос жирным, за ним блоки ответа; так же на сервере — accordion.php. */
  toText: (el, { p, esc }) => [...el.querySelectorAll(':scope > .ted-accordion__item')].flatMap((it) => {
    const out = [];
    const q = it.querySelector(':scope > .ted-accordion__q');
    if (q && q.textContent.trim()) out.push(p('<strong>' + esc(q.textContent.trim()) + '</strong>'));
    const body = it.querySelector(':scope > .ted-accordion__body');
    if (body) for (const c of body.children) if (c.textContent.trim()) out.push(c.cloneNode(true));
    return out;
  }),
});
