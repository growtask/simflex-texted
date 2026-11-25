// Колонки в правке (этап 6.2, макет block-columns).
// Колонка — тело с любыми блоками (кроме фона и других контейнеров). Кнопки колонки (⠿ 🗑) — общие кнопки элемента
// (как у шагов): в правом верхнем углу колонки; перестановка — перетаскиванием по сетке. Колонок 2–4: у двух корзины нет.
// Под блоком — «+ Добавить колонку» (как «Добавить автора»), пока колонок меньше четырёх.
// Клавиши: Backspace в начале колонки и Delete в её конце не склеивают соседние колонки; Tab / Shift+Tab — в соседнюю колонку;
// Enter в пустой строке последней колонки после ещё одной пустой — выход из колонок (новый абзац под блоком, решение 22.11).

import { h, icon } from '../../resources/js/ui/widgets.js';
import { getRange, placeCaret } from '../../resources/js/core/selection.js';
import { makeColumn, COLUMNS_MAX } from './columns.js';
import { wrapSelector, objectSelector } from '../../resources/js/core/registry.js';
import { isEmptyBlock } from '../../resources/js/core/blocks.js';

export class ColumnsUI {
  constructor(editor) {
    this.editor = editor;
    this.root = editor.editable;
    this.column = editor.column;
    this.cols = null;
    this.addBtn = h('button', { type: 'button', class: 'ted-ui-addauthor ted-ui-coladd' }, [icon('plus'), h('span', { text: 'Добавить колонку' })]);
    this.addBtn.addEventListener('mousedown', (e) => e.preventDefault());
    this.addBtn.addEventListener('click', () => this.addColumn());
    this.column.appendChild(this.addBtn);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.place()) : null;
  }

  /** Колонка — пункт блока: кнопки над её правым верхним углом; колонок не меньше двух; после удаления — класс их числа. */
  itemAt(node) { const c = node && node.closest ? node.closest('div.ted-columns > .ted-columns__col') : null; return c && this.editor.editable.contains(c) ? c : null; }

  ownsItem(li) { return li.classList.contains('ted-columns__col') && !!li.parentNode && li.parentNode.classList.contains('ted-columns'); }

  get itemAbove() { return 'card'; }

  canRemove(li) { return li.parentNode.querySelectorAll(':scope > .ted-columns__col').length > 2; }

  itemRemoved(li, el) { el.className = `ted-columns ted-columns--${el.querySelectorAll(':scope > .ted-columns__col').length}`; }

  /** Курсор после удаления соседней колонки — в первую строку текста (не в картинку). */
  itemCaret(col) { return col.firstElementChild && !col.firstElementChild.matches([wrapSelector(), 'figure', objectSelector()].filter(Boolean).join(', ')) ? col.firstElementChild : (col.querySelector(':scope > :is(p, h2, h3, h4, h5, h6)') || col); }

  get removedToast() { return 'Колонка удалена'; }

  destroy() { this.ro?.disconnect(); }

  current() {
    const ed = this.editor;
    if (ed.mode !== 'edit' || !ed.isFocused()) return null;
    const r = getRange(this.root);
    const n = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode);
    const col = n && n.closest && n.closest('.ted-columns > .ted-columns__col');
    const el = col && col.parentElement;
    return el && this.root.contains(el) ? el : null;
  }

  sync() {
    const el = this.current();
    if (this.cols && this.cols !== el) { this.cols.removeAttribute('data-tedui-addbtn'); this.ro?.unobserve(this.cols); }
    if (el && el !== this.cols) this.ro?.observe(el);
    this.cols = el;
    const full = el && el.querySelectorAll(':scope > .ted-columns__col').length >= COLUMNS_MAX;
    if (!el || full) {   // при перетаскивании колонки «Добавить колонку» остаётся (22.11)
      if (el) el.removeAttribute('data-tedui-addbtn');
      this.addBtn.classList.remove('is-visible');
      return;
    }
    el.setAttribute('data-tedui-addbtn', '');   // место под «Добавить колонку»
    this.place();
  }

  place() {
    const el = this.cols;
    if (!el || !el.isConnected || !el.hasAttribute('data-tedui-addbtn')) { this.addBtn.classList.remove('is-visible'); return; }
    const cr = this.column.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    this.addBtn.style.top = `${r.bottom - cr.top + 20}px`;
    this.addBtn.style.left = `${r.left - cr.left}px`;
    this.addBtn.classList.add('is-visible');
  }

  /** Новая колонка в конец — пустой абзац с обычной заглушкой; курсор в него. */
  addColumn() {
    const el = this.cols;
    if (!el || el.querySelectorAll(':scope > .ted-columns__col').length >= COLUMNS_MAX) return null;
    const ed = this.editor;
    ed.history.commit();
    const col = makeColumn(document);
    el.appendChild(col);
    el.className = `ted-columns ted-columns--${el.querySelectorAll(":scope > .ted-columns__col").length}`;
    placeCaret(col.firstElementChild || col, false);
    ed.afterChange({ immediate: true });
    return col;
  }

  /** Колонка и блок в ней, где стоит курсор (свёрнутое выделение). */
  caretCol() {
    const r = getRange(this.root);
    if (!r || !r.collapsed) return null;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const col = n && n.closest && n.closest('.ted-columns > .ted-columns__col');
    if (!col || !this.root.contains(col)) return null;
    const block = [...col.children].find((c) => c.contains(n)) || null;
    return { r, n, col, block };
  }

  /** Tab / Shift+Tab — в соседнюю колонку (в начало её первого блока / конец последнего); в списке и коде Tab свой. */
  onTab(e) {
    const at = this.caretCol();
    if (!at || !at.block || at.n.closest('li, pre, td, th')) return false;
    const cols = [...at.col.parentNode.querySelectorAll(':scope > .ted-columns__col')];
    const next = cols[cols.indexOf(at.col) + (e.shiftKey ? -1 : 1)];
    e.preventDefault();
    if (!next) return true;   // за краем колонок — ничего (Tab в обычном тексте ничего не делает)
    const target = e.shiftKey ? next.lastElementChild : next.firstElementChild;
    placeCaret(target || next, !e.shiftKey ? false : true);
    this.editor.updateState();
    return true;
  }

  /** Enter в пустой строке в конце последней колонки, когда строкой выше тоже пусто: обе пустые строки убираются,
   *  курсор — в новый абзац под колонками (две пустые строки подряд в колонке поставить можно, третья — выход). */
  onEnter(e) {
    const at = this.caretCol();
    if (!at || !at.block) return false;
    const cols = [...at.col.parentNode.querySelectorAll(':scope > .ted-columns__col')];
    if (at.col !== cols[cols.length - 1] || at.block !== at.col.lastElementChild) return false;
    const prev = at.block.previousElementSibling;
    if (at.block.tagName !== 'P' || !isEmptyBlock(at.block) || !prev || prev.tagName !== 'P' || !isEmptyBlock(prev)) return false;
    e.preventDefault();
    const ed = this.editor;
    ed.history.commit();
    at.block.remove();
    prev.remove();
    if (!at.col.firstElementChild) { const p = document.createElement('p'); p.appendChild(document.createElement('br')); at.col.appendChild(p); }
    const out = document.createElement('p');
    out.appendChild(document.createElement('br'));
    at.col.parentNode.after(out);
    placeCaret(out, false);
    ed.afterChange({ immediate: true, focus: out });
    return true;
  }

  /** Backspace в начале колонки и Delete в конце не склеивают колонки. true — нажатие обработано. */
  /** Tab и Enter — раньше общих клавиш редактора (Tab в тексте ничего не делает, Enter делит абзац). */
  onKeyFirst(e) {
    if (e.key === 'Tab') return this.onTab(e);
    if (e.key === 'Enter' && !e.shiftKey) return this.onEnter(e);
    return false;
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
    const r = getRange(this.root);
    if (!r || !r.collapsed) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const col = n && n.closest && n.closest('.ted-columns > .ted-columns__col');
    if (!col || !this.root.contains(col)) return false;
    // только на краю колонки: в начале её первого блока / в конце последнего
    const block = [...col.children].find((c) => c.contains(n)) || col.childNodes[r.startOffset] || null;
    if (block !== (e.key === 'Backspace' ? col.firstElementChild : col.lastElementChild)) return false;
    const t = document.createRange();
    t.selectNodeContents(block && block.nodeType === 1 ? block : col);
    if (e.key === 'Backspace') t.setEnd(r.startContainer, r.startOffset);
    else t.setStart(r.endContainer, r.endOffset);
    if (t.toString().replace(/​/g, '').length) return false;
    // пустой первый абзац перед другими блоками убирается (как в теле аккордеона); иначе — ничего не склеивается
    const first = e.key === 'Backspace' ? col.firstElementChild : null;
    if (first && first.tagName === 'P' && !first.textContent.trim() && !first.querySelector('img') && col.children.length > 1 && first.contains(n)) {
      const ed = this.editor;
      ed.history.commit();
      const next = first.nextElementSibling;
      first.remove();
      placeCaret(next, false);
      ed.afterChange({ immediate: true });
    }
    e.preventDefault();
    return true;
  }
}
