// Блок «Колонки» — полностью в папке (этап 5). Контейнер: колонки — «хосты» обычных блоков (общий код — src/core/containers.js).
import COLUMNS_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../src/core/registry.js';
import { HOST_CLASS, stripInHost } from '../../src/core/containers.js';
import { sanitizeNodes, serializeBlocks } from '../../src/core/sanitize.js';
import { normalizeRoot, isEmptyBlock } from '../../src/core/blocks.js';
import { ColumnsUI } from './columns.editor.js';

// Сайт: <div class="ted-columns ted-columns--2"><div class="ted-columns__col">блоки</div>…</div> — 2–4 колонки;
// на планшете не больше двух в ряд, на телефоне одна под другой. Правка: колонка — «хост» блоков.

export const COLUMNS_MIN = 2;
export const COLUMNS_MAX = 4;

/** Пустая колонка (решение 22.11): один пустой абзац с обычной заглушкой «/» — в колонку пишут что угодно, как в документ. */
export function makeColumn(doc, frag = null) {
  const col = doc.createElement('div');
  col.className = `ted-columns__col ${HOST_CLASS}`;
  if (frag && frag.childNodes.length) { col.appendChild(frag); return col; }
  const p = doc.createElement('p');
  p.appendChild(doc.createElement('br'));
  col.append(p);
  return col;
}

export function makeColumns(doc, count = 2) {
  const el = doc.createElement('div');
  el.className = `ted-columns ted-columns--${count}`;
  for (let i = 0; i < count; i += 1) el.appendChild(makeColumn(doc));
  return el;
}

/** Наш вывод или форма правки → форма правки. */
export function cleanColumns(node, doc, cleanBlocks, idOk) {
  const cols = [...node.querySelectorAll(':scope > .ted-columns__col')].slice(0, COLUMNS_MAX);
  if (!cols.length) return null;
  const el = doc.createElement('div');
  if (idOk && idOk(node.id)) el.id = node.id;
  for (const c of cols) {
    const frag = cleanBlocks([...c.childNodes]);
    stripInHost(frag, doc);
    const col = doc.createElement('div');
    col.className = `ted-columns__col ${HOST_CLASS}`;
    col.appendChild(frag);
    el.appendChild(col);
  }
  el.className = `ted-columns ted-columns--${Math.max(COLUMNS_MIN, el.children.length)}`;
  return el;
}

/** Правка: только колонки, класс числа колонок, тело каждой — как корень. */
export function normalizeColumns(el, doc, normalizeBody) {
  let changed = false;
  for (const n of [...el.childNodes]) {
    if (n.nodeType === 1 && (n.classList.contains('ted-columns__col') || n.hasAttribute('data-tedui-m'))) continue;
    n.remove();
    changed = true;
  }
  const cols = [...el.querySelectorAll(':scope > .ted-columns__col')];
  for (const c of cols) {
    if (!c.classList.contains(HOST_CLASS)) { c.classList.add(HOST_CLASS); changed = true; }
    if (normalizeBody(c)) changed = true;
    for (const b of c.querySelectorAll(':scope > [class*="ted-bg-"]')) {
      for (const k of [...b.classList]) if (k.startsWith('ted-bg-')) b.classList.remove(k);
      if (!b.className) b.removeAttribute('class');
      changed = true;
    }
  }
  const want = `ted-columns ted-columns--${Math.min(COLUMNS_MAX, Math.max(COLUMNS_MIN, cols.length))}`;
  if (el.className !== want) { el.className = want; changed = true; }
  return changed;
}

/** Форма правки → HTML сайта. */
export function serializeColumns(el, serializeBody) {
  const id = el.id ? ` id="${el.id}"` : '';
  const cols = [...el.querySelectorAll(':scope > .ted-columns__col')];
  const n = Math.min(COLUMNS_MAX, Math.max(COLUMNS_MIN, cols.length));
  return `<div class="ted-columns ted-columns--${n}"${id}>\n${cols.map((c) => `<div class="ted-columns__col">\n${serializeBody(c)}\n</div>`).join('\n')}\n</div>`;
}


/** Колонки без колонок — абзац; иначе — только колонки, класс их числа, тело каждой — как корень. */
function normalizeColumnsBlock(el, doc, normalizeBody) {
  if (!el.querySelector('.ted-columns__col')) {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    el.replaceWith(p);
    return true;
  }
  return normalizeColumns(el, doc, normalizeBody || ((b) => normalizeRoot(b)));
}

/** Колонки в теле другого контейнера раскрываются: блоки колонок подряд. */
function unnestColumns(inner, doc) {
  const flat = doc.createDocumentFragment();
  for (const col of inner.querySelectorAll('.ted-columns__col')) while (col.firstChild) flat.appendChild(col.firstChild);
  return flat;
}

registerBlock({
  toMarkdown: (el, md) => [...el.children].map((c) => md.blocks(c)).join('\n\n'),   // Ted.toMarkdown (22.11): колонки — друг за другом
  ...COLUMNS_BLOCK,
  match: (el) => el.tagName === 'DIV' && el.classList.contains('ted-columns'),
  /** Две колонки рядом, в каждой — пустой абзац с обычной заглушкой (решение 22.11); курсор в первой. */
  create: (doc) => { const el = makeColumns(doc, 2); return { el, focus: el.querySelector('p') }; },
  /** Наш вывод или форма правки → форма правки (2–4 колонки); не колонки — содержимое как обычные блоки. */
  clean: (node, doc, idOk) => cleanColumns(node, doc, (nodes) => sanitizeNodes(nodes, doc), idOk) || sanitizeNodes([...node.childNodes], doc),
  serialize: (el) => serializeColumns(el, (body) => serializeBlocks(body)),
  normalize: normalizeColumnsBlock,
  unnest: unnestColumns,
  canAlign: () => false,
  canBg: () => false,
  editorUi: (editor) => new ColumnsUI(editor),
  editorUiName: 'columns',
  /** Пустая колонка — обычная заглушка абзаца с «/» (как в документе), во всех колонках сразу (решение 22.11). */
  placeholders: (editor, root) => {
    // колонка узкая — короткая заглушка с «/» (решение заказчика 22.11: полная обрезалась многоточием)
    const text = editor.options.placeholder || 'Введите «/» или текст';
    for (const col of root.querySelectorAll('.ted-columns > .ted-columns__col')) {
      const only = col.children.length === 1 ? col.firstElementChild : null;
      if (only && only.tagName === 'P' && isEmptyBlock(only)) only.setAttribute('data-tedui-ph', text);
    }
  },
  /** В наборе без колонок — блоки колонок подряд; так же на сервере — columns.php. */
  toText: (el) => [...el.querySelectorAll(':scope > .ted-columns__col')].flatMap((c) => [...c.children].filter((b) => b.textContent.trim()).map((b) => b.cloneNode(true))),
});
