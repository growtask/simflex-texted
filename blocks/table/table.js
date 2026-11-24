// Блок «Таблица» — полностью в папке (этап 5): разметка, очистка, строки и столбцы, формулы (formula.js), правка (table.editor.js,
// table-formula.js), меню блока, превращение в текст. HTML-теги таблицы и правила data-cols / data-formula — в общем белом списке.
import TABLE_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { cleanInlineChildren } from '../../resources/js/core/sanitize.js';
import { normalizeRoot } from '../../resources/js/core/blocks.js';
import { h, menuItem } from '../../resources/js/ui/widgets.js';
import { TableUI } from './table.editor.js';
// Блок «Таблица» (этап 6.1, макет block-table, библиотека Table/table).
// Разметка: <figure class="ted-table [ted-table--plain]" [id]>
//             <div class="ted-table__wrap"><table data-cols="N"><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr></tbody></table></div>
//             <figcaption>…</figcaption>
//           </figure>
// В ячейках — текст, <strong>, <a>, <br>. Шапка (<thead>) включается и выключается в меню ручки, границы — тоже (ted-table--plain).
// Столбцы равной ширины, не уже 120 px: ширину таблицы задаёт data-cols (CSS), лишнее прокручивается вбок внутри .ted-table__wrap.

import { structureMap, remapFormulas, formulaAllowed } from './formula.js';

export const TABLE_MAX_COLS = 10;
export const TABLE_MAX_ROWS = 100;
const CELL_TAGS = new Set(['STRONG', 'EM', 'U', 'S', 'CODE', 'A', 'BR']);   // как в абзаце: жирный, курсив, подчёркнутый, зачёркнутый, код, ссылка

/** figure.ted-table? */
export function isTableBlock(el) {
  return !!(el && el.nodeType === 1 && el.tagName === 'FIGURE' && el.classList.contains('ted-table'));
}

/** Таблица (<table>) блока. */
export function tableOf(fig) { return fig ? fig.querySelector(':scope > .ted-table__wrap > table') : null; }

/** Все строки по порядку: сначала шапка, потом тело. */
export function tableRows(fig) {
  const t = tableOf(fig);
  if (!t) return [];
  return [...t.querySelectorAll(':scope > thead > tr, :scope > tbody > tr')];
}

export function hasHeader(fig) { const t = tableOf(fig); return !!(t && t.tHead && t.tHead.rows.length); }
export function isPlain(fig) { return fig.classList.contains('ted-table--plain'); }
export function colCount(fig) { const r = tableRows(fig)[0]; return r ? r.cells.length : 0; }

/** Ячейка → {fig, row, col, rowIndex, colIndex}. */
export function cellInfo(cell) {
  const td = cell && cell.nodeType === 1 ? cell.closest('td, th') : cell && cell.parentElement && cell.parentElement.closest('td, th');
  if (!td) return null;
  const fig = td.closest('figure.ted-table');
  if (!fig) return null;
  const rows = tableRows(fig);
  const tr = td.parentElement;
  return { fig, cell: td, row: tr, rowIndex: rows.indexOf(tr), colIndex: [...tr.cells].indexOf(td), rows };
}

function makeCell(doc, head) {
  const c = doc.createElement(head ? 'th' : 'td');
  return c;
}

/** Новый пустой блок: rows × cols, шапка — первая строка. В правке ячейки получают <br> при нормализации. */
export function createTable(doc, rows = 3, cols = 3, header = true) {
  const fig = doc.createElement('figure');
  fig.className = 'ted-table';
  const wrap = doc.createElement('div');
  wrap.className = 'ted-table__wrap';
  const table = doc.createElement('table');
  table.setAttribute('data-cols', String(cols));
  if (header) {
    const thead = doc.createElement('thead');
    const tr = doc.createElement('tr');
    for (let c = 0; c < cols; c += 1) tr.appendChild(makeCell(doc, true));
    thead.appendChild(tr);
    table.appendChild(thead);
  }
  const tbody = doc.createElement('tbody');
  for (let r = header ? 1 : 0; r < rows; r += 1) {
    const tr = doc.createElement('tr');
    for (let c = 0; c < cols; c += 1) tr.appendChild(makeCell(doc, false));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  fig.appendChild(wrap);
  return fig;
}

/** Содержимое ячейки: только текст, жирный, ссылки и переносы (остальные теги разворачиваются). */
function keepCellInline(el) {
  for (const n of [...el.querySelectorAll('*')]) {
    if (!el.contains(n) || CELL_TAGS.has(n.tagName)) continue;
    n.replaceWith(...n.childNodes);
  }
  // переносы в конце ячейки не нужны
  while (el.lastChild && el.lastChild.nodeName === 'BR') el.lastChild.remove();
  while (el.lastChild && el.lastChild.nodeType === 3 && !el.lastChild.data.trim()) el.lastChild.remove();
}

/**
 * Любая входная таблица (наш блок, старая таблица TinyMCE, вставка) → чистый figure.ted-table.
 * null — если таблицу нельзя сделать редактируемой (объединённые ячейки, вложенные таблицы, больше 10 столбцов или 100 строк):
 * тогда она остаётся «сырым» блоком, как раньше.
 * cleanInline(src, dst) — строчная очистка из sanitize.js (передаётся, чтобы не было круговой зависимости модулей).
 */
export function cleanTableNode(node, doc, cleanInline, idOk) {
  const ours = node.tagName === 'FIGURE' && node.classList.contains('ted-table');
  const table = node.tagName === 'TABLE' ? node : node.querySelector('table');
  if (!table || table.querySelector('table')) return null;
  const srcRows = [...table.rows];
  if (!srcRows.length || srcRows.length > TABLE_MAX_ROWS) return null;
  for (const tr of srcRows) for (const c of tr.cells) if ((c.colSpan || 1) > 1 || (c.rowSpan || 1) > 1) return null;
  const cols = Math.max(...srcRows.map((r) => r.cells.length));
  if (!cols || cols > TABLE_MAX_COLS) return null;
  const header = ours ? !!(table.tHead && table.tHead.rows.length)
    : !!((table.tHead && table.tHead.rows.length) || [...srcRows[0].cells].every((c) => c.tagName === 'TH'));
  const fig = doc.createElement('figure');
  fig.className = 'ted-table';
  if (ours && node.classList.contains('ted-table--plain')) fig.classList.add('ted-table--plain');
  if (idOk && idOk(node.id)) fig.id = node.id;
  const wrap = doc.createElement('div');
  wrap.className = 'ted-table__wrap';
  const out = doc.createElement('table');
  out.setAttribute('data-cols', String(cols));
  const thead = header ? doc.createElement('thead') : null;
  const tbody = doc.createElement('tbody');
  srcRows.forEach((src, r) => {
    const head = header && r === 0;
    const tr = doc.createElement('tr');
    for (let c = 0; c < cols; c += 1) {
      const cell = makeCell(doc, head);
      const from = src.cells[c];
      if (from) {
        cleanInline(from, cell);
        keepCellInline(cell);
        // формула ячейки (этап 6.1б): только допустимые знаки, иначе отбрасывается — на сайте остаётся число
        const f = from.getAttribute('data-formula');
        if (f && formulaAllowed(f)) cell.setAttribute('data-formula', f);
      }
      tr.appendChild(cell);
    }
    (head ? thead : tbody).appendChild(tr);
  });
  if (thead) out.appendChild(thead);
  out.appendChild(tbody);
  wrap.appendChild(out);
  fig.appendChild(wrap);
  const capSrc = (ours ? node.querySelector(':scope > figcaption') : null) || table.querySelector(':scope > caption');
  if (capSrc) {
    const cap = doc.createElement('figcaption');
    cleanInline(capSrc, cap);
    keepCellInline(cap);
    if (cap.textContent.trim()) fig.appendChild(cap);
  }
  return fig;
}

/** Правка: структура всегда полная — обёртка, data-cols, одинаковое число ячеек, <br> в пустых ячейках, подпись (может быть пустой). */
export function normalizeTableBlock(fig, doc) {
  let changed = false;
  let wrap = fig.querySelector(':scope > .ted-table__wrap');
  let table = wrap && wrap.querySelector(':scope > table');
  if (!table) {
    const t = fig.querySelector('table');
    if (!t) return false;
    wrap = doc.createElement('div');
    wrap.className = 'ted-table__wrap';
    fig.insertBefore(wrap, fig.firstChild);
    wrap.appendChild(t);
    table = t;
    changed = true;
  }
  if (!table.tBodies.length) { table.appendChild(doc.createElement('tbody')); changed = true; }
  // строки вне thead / tbody (браузер иногда кладёт их прямо в table) — в тело
  for (const tr of [...table.querySelectorAll(':scope > tr')]) { table.tBodies[0].appendChild(tr); changed = true; }
  const rows = tableRows(fig);
  if (!rows.length) {
    const tr = doc.createElement('tr');
    tr.appendChild(makeCell(doc, false));
    table.tBodies[0].appendChild(tr);
    rows.push(tr);
    changed = true;
  }
  const cols = Math.min(TABLE_MAX_COLS, Math.max(1, ...rows.map((r) => r.cells.length)));
  for (const tr of rows) {
    const head = tr.parentElement.tagName === 'THEAD';
    while (tr.cells.length < cols) { tr.appendChild(makeCell(doc, head)); changed = true; }
    while (tr.cells.length > cols) { tr.lastElementChild.remove(); changed = true; }
    for (const c of [...tr.cells]) {
      if (head !== (c.tagName === 'TH')) {
        const n = makeCell(doc, head);
        while (c.firstChild) n.appendChild(c.firstChild);
        c.replaceWith(n);
        changed = true;
      }
    }
    for (const c of tr.cells) if (!c.firstChild) { c.appendChild(doc.createElement('br')); changed = true; }
  }
  if (table.getAttribute('data-cols') !== String(cols)) { table.setAttribute('data-cols', String(cols)); changed = true; }
  let cap = fig.querySelector(':scope > figcaption');
  if (!cap) { cap = doc.createElement('figcaption'); fig.appendChild(cap); changed = true; }
  if (!cap.firstChild) { cap.appendChild(doc.createElement('br')); changed = true; }
  // текст, попавший в обёртку мимо ячеек, — в последнюю ячейку; прочее лишнее в обёртке убираем
  for (const n of [...wrap.childNodes]) {
    if (n === table) continue;
    if (n.textContent && n.textContent.replace(/​/g, '').trim()) {
      const rowsNow = tableRows(fig);
      const last = rowsNow[rowsNow.length - 1].lastElementChild;
      if (last.lastChild && last.lastChild.nodeName === 'BR' && last.childNodes.length === 1) last.lastChild.remove();
      last.appendChild(n);
    } else n.remove();
    changed = true;
  }
  // лишнее внутри figure (после склейки браузером) — убираем
  for (const n of [...fig.childNodes]) if (n !== wrap && n !== cap) { n.remove(); changed = true; }
  return changed;
}

/** Добавить строку после индекса (по умолчанию — в конец). Возвращает новую строку. */
export function addRow(fig, after = null, doc = document) {
  const rows = tableRows(fig);
  const cols = colCount(fig) || 1;
  const tr = doc.createElement('tr');
  for (let c = 0; c < cols; c += 1) { const td = makeCell(doc, false); td.appendChild(doc.createElement('br')); tr.appendChild(td); }
  const ref = after === null ? rows[rows.length - 1] : rows[after];
  const table = tableOf(fig);
  if (!ref || ref.parentElement.tagName === 'THEAD') table.tBodies[0].insertBefore(tr, table.tBodies[0].firstChild);
  else ref.after(tr);
  formulasAfter(fig, 'row', 'insert', tableRows(fig).indexOf(tr));
  return tr;
}

/** Добавить столбец после индекса (по умолчанию — в конец). Возвращает ячейку первой строки или null, если столбцов уже 10. */
export function addColumn(fig, after = null, doc = document) {
  const cols = colCount(fig);
  if (cols >= TABLE_MAX_COLS) return null;
  const at = after === null ? cols - 1 : after;
  let first = null;
  for (const tr of tableRows(fig)) {
    const cell = makeCell(doc, tr.parentElement.tagName === 'THEAD');
    cell.appendChild(doc.createElement('br'));
    const ref = tr.cells[at];
    if (ref) ref.after(cell); else tr.appendChild(cell);
    if (!first) first = cell;
  }
  tableOf(fig).setAttribute('data-cols', String(cols + 1));
  formulasAfter(fig, 'col', 'insert', at + 1);
  return first;
}

/** Удалить строку; последнюю строку не удаляем (только очищаем). */
export function removeRow(fig, index, doc = document) {
  const rows = tableRows(fig);
  const tr = rows[index];
  if (!tr) return false;
  if (rows.length <= 1) { for (const c of tr.cells) c.replaceChildren(doc.createElement('br')); return false; }
  const thead = tr.parentElement.tagName === 'THEAD' ? tr.parentElement : null;
  tr.remove();
  formulasAfter(fig, 'row', 'remove', index);
  // удалили шапку — шапкой становится следующая строка (как в меню: шапка включена)
  if (thead && !thead.rows.length) {
    const next = tableOf(fig).tBodies[0].rows[0];
    if (next) moveRowToHead(fig, next, doc); else thead.remove();
  }
  return true;
}

/** Удалить столбец; последний столбец не удаляем (только очищаем). */
export function removeColumn(fig, index, doc = document) {
  const cols = colCount(fig);
  if (cols <= 1) { for (const tr of tableRows(fig)) tr.cells[0].replaceChildren(doc.createElement('br')); return false; }
  for (const tr of tableRows(fig)) tr.cells[index]?.remove();
  tableOf(fig).setAttribute('data-cols', String(cols - 1));
  formulasAfter(fig, 'col', 'remove', index);
  return true;
}

function retag(cell, tag, doc) {
  if (cell.tagName === tag) return cell;
  const n = doc.createElement(tag.toLowerCase());
  // формула и служебные метки правки переезжают вместе с содержимым
  for (const a of [...cell.attributes]) if (a.name === 'data-formula' || a.name.startsWith('data-tedui-')) n.setAttribute(a.name, a.value);
  while (cell.firstChild) n.appendChild(cell.firstChild);
  cell.replaceWith(n);
  return n;
}

function moveRowToHead(fig, tr, doc) {
  const table = tableOf(fig);
  let thead = table.tHead;
  if (!thead) { thead = doc.createElement('thead'); table.insertBefore(thead, table.firstChild); }
  thead.appendChild(tr);
  for (const c of [...tr.cells]) retag(c, 'TH', doc);
}

/** Переставить строку from → to (индексы в общем списке строк). Шапка остаётся шапкой: строка, попавшая на её место, становится заголовком. */
export function moveRow(fig, from, to, doc = document) {
  const rows = tableRows(fig);
  if (from === to || !rows[from] || to < 0 || to >= rows.length) return false;
  const header = hasHeader(fig);
  const order = rows.slice();
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const table = tableOf(fig);
  const tbody = table.tBodies[0];
  order.forEach((tr, i) => {
    if (header && i === 0) { moveRowToHead(fig, tr, doc); return; }
    tbody.appendChild(tr);
    for (const c of [...tr.cells]) retag(c, 'TD', doc);
  });
  formulasAfter(fig, 'row', 'move', from, to);
  return true;
}

/** Переставить столбец from → to. */
export function moveColumn(fig, from, to) {
  const cols = colCount(fig);
  if (from === to || from < 0 || to < 0 || from >= cols || to >= cols) return false;
  for (const tr of tableRows(fig)) {
    const cell = tr.cells[from];
    const ref = tr.cells[to];
    if (from < to) ref.after(cell); else ref.before(cell);
  }
  formulasAfter(fig, 'col', 'move', from, to);
  return true;
}

/** Ссылки формул после вставки, удаления или перестановки строки (столбца). */
function formulasAfter(fig, axis, kind, a, b) {
  const cells = fig.querySelectorAll('[data-formula]');
  if (cells.length) remapFormulas(cells, axis, structureMap(kind, a, b));
}

/** Включить или выключить шапку (первая строка — th в thead). */
export function setHeader(fig, on, doc = document) {
  const table = tableOf(fig);
  if (on === hasHeader(fig)) return false;
  if (on) {
    const first = table.tBodies[0].rows[0];
    if (!first) return false;
    moveRowToHead(fig, first, doc);
  } else {
    const thead = table.tHead;
    const tbody = table.tBodies[0];
    for (const tr of [...thead.rows].reverse()) {
      tbody.insertBefore(tr, tbody.firstChild);
      for (const c of [...tr.cells]) retag(c, 'TD', doc);
    }
    thead.remove();
  }
  return true;
}

export function setPlain(fig, on) {
  fig.classList.toggle('ted-table--plain', !!on);
  return true;
}

/**
 * Буфер обмена → строки и ячейки (HTML-строки ячеек) или null.
 * HTML с <table> (Excel, Google Таблицы, Word) или текст с табуляциями (TSV).
 */
export function parseClipboardTable(html, text, doc = document) {
  if (html && /<table[\s>]/i.test(html)) {
    const tpl = doc.createElement('template');
    tpl.innerHTML = html;
    const table = tpl.content.querySelector('table');
    if (table) {
      const rows = [...table.rows].map((tr) => [...tr.cells].map((c) => c.innerHTML));
      if (rows.length && rows.some((r) => r.length)) return rows;
    }
  }
  const t = String(text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (t.includes('\t')) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return t.split('\n').map((line) => line.split('\t').map(esc));
  }
  return null;
}


registerBlock({
  toMarkdown: (el, md) => { const t = el.querySelector('table'); const cap = el.querySelector('figcaption'); return (t ? md.table(t) : '') + (cap ? `\n\n*${md.inline(cap).trim()}*` : ''); },   // Ted.toMarkdown (22.11)
  ...TABLE_BLOCK,
  match: (el) => isTableBlock(el),
  /** Простая таблица со страницы или из Word (без объединённых ячеек, до 10 столбцов и 100 строк) — тоже блок «Таблица». */
  adopt: (el) => el.tagName === 'TABLE',
  /** Макет block-table: новая таблица 3 × 3, шапка включена; курсор — в первой ячейке. */
  create: (doc) => { const fig = createTable(doc, 3, 3, true); normalizeTableBlock(fig, doc); return { el: fig, focus: fig.querySelector('th, td') }; },
  /** Наш блок или простая таблица → блок; сложная — false: остаётся «сырым» HTML (очистка ядра). */
  clean: (node, doc, idOk) => cleanTableNode(node, doc, (from, to) => cleanInlineChildren(from, to, doc), idOk) || false,
  /** Таблицу удалили целиком (выделить всё + Del) — от неё осталась пустая обёртка: на её месте пустой абзац. */
  normalize: (fig, doc) => {
    if (!fig.querySelector('table')) {
      const p = doc.createElement('p');
      p.appendChild(doc.createElement('br'));
      fig.replaceWith(p);
      return true;
    }
    return normalizeTableBlock(fig, doc);
  },
  canAlign: () => false,
  canBg: () => false,
  editorUi: (editor) => new TableUI(editor),
  editorUiName: 'table',
  /** Меню блока (editor-block-menu-table): шапка и границы; подписи меняются по состоянию, как «Добавить автора» / «Убрать автора». */
  blockMenu: (ed, block, done) => {
    const head = hasHeader(block);
    const plain = isPlain(block);
    return [
      menuItem({
        value: 'table-head', label: head ? 'Убрать шапку' : 'Добавить шапку', iconName: 'heading',
        onSelect: () => { ed.history.commit(); setHeader(block, !head); normalizeRoot(ed.editable); done(head ? 'Шапка убрана' : 'Шапка добавлена'); },
      }),
      menuItem({
        value: 'table-borders', label: plain ? 'Показать границы' : 'Убрать границы', iconName: 'table',
        onSelect: () => { ed.history.commit(); setPlain(block, !plain); done(plain ? 'Границы показаны' : 'Границы убраны'); },
      }),
      h('div', { class: 'ted-ui-pop__line' }),
    ];
  },
  /** «Заголовок» (шапка), «Текст» (ячейки) и «Описание» (подпись) в пустых — макет block-table, empty. */
  placeholders: (editor, root) => {
    for (const fig of root.querySelectorAll(':scope > figure.ted-table')) {
      for (const c of fig.querySelectorAll('th, td, :scope > figcaption')) {
        if (c.textContent.replace(/\u200b/g, '').trim() || c.querySelector('img')) continue;
        c.setAttribute('data-tedui-ph', c.tagName === 'TH' ? 'Заголовок' : c.tagName === 'TD' ? 'Текст' : 'Описание');
      }
    }
  },
  /** В наборе без таблицы — строка абзацем (ячейки через « · »), подпись — абзацем; так же на сервере — table.php. */
  toText: (el, { p, esc, text }) => {
    const rows = tableRows(el).map((tr) => p([...tr.cells].map((c) => c.innerHTML).filter((x) => x.replace(/<br>/g, '').trim()).join(' · '))).filter((n) => n.textContent.trim());
    const cap = el.querySelector(':scope > figcaption');   // подпись таблицы не теряется
    return cap && text(cap) ? [...rows, p(esc(text(cap)))] : rows;
  },
});
