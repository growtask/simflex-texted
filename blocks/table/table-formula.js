// Формулы в таблице: правка (этап 6.1б).
// «=» в ячейке — под ячейкой список функций (Popover + menuItem, как меню «/»): выбрать стрелками / мышью или писать самому.
// Пока пишется формула, клик по другой ячейке (после «=», «(», знака действия, «;») вставляет её адрес; протяжка — диапазон.
// Ссылки формулы подсвечены маской (цвет выделения текста). В ячейке с курсором — формула, в остальных — результат.
// Квадрат в углу ячейки с курсором — протягивание (как в Google Таблицах) вбок, вниз или сразу прямоугольником: маска плавно растёт, формула
// копируется со сдвигом ссылок ($ не сдвигается), простое значение — как есть.

import { h, menuItem, adminModalOpen } from '../../resources/js/ui/widgets.js';
import { getRange, placeCaret } from '../../resources/js/core/selection.js';
import { tableRows, cellInfo } from './table.js';
import { computeGrid, resultText, formulaAllowed, shiftFormula, formulaRanges, refName, FORMULA_FUNCS } from './formula.js';

const FORMULA_START = /^\s*=/;
const REF_SLOT = /[=(+\-−–—*/;:,%]\s*$/;   // после этих знаков клик по ячейке вставляет её адрес

export class TableFormulas {
  constructor(table) {
    this.table = table;
    this.editor = table.editor;
    this.root = table.root;
    this.column = table.column;
    this.fcell = null;          // ячейка, в которой правится формула
    this.menuFor = null;        // запрос, для которого открыт список функций
    this.masks = [];
    this.fill = h('div', { class: 'ted-ui-tablefill', 'aria-hidden': 'true', 'data-tip': 'Протянуть' });
    this.fillMask = h('div', { class: 'ted-ui-tablemask ted-ui-tablemask--fill', 'aria-hidden': 'true' });
    this.column.append(this.fill, this.fillMask);
    this.fill.addEventListener('pointerdown', (e) => this.startFill(e));
    this.fill.addEventListener('mousedown', (e) => e.preventDefault());
    this.onDown = (e) => this.pickRef(e);
    this.root.addEventListener('pointerdown', this.onDown, true);
  }

  destroy() {
    this.root.removeEventListener('pointerdown', this.onDown, true);
  }

  // ---------- состояние ячейки ----------

  /** Вызывается из TableUI.sync: вход и выход из правки формулы, пересчёт, список функций, маски, квадрат протягивания. */
  sync(fig, cell) {
    // ячейки, оставшиеся в правке (после Undo, перестановки), — закрываем
    for (const c of [...this.root.querySelectorAll('[data-tedui-fedit]')]) if (c !== cell) this.commit(c);
    if (this.fcell && this.fcell !== cell) this.commit(this.fcell);
    if (cell && cell !== this.fcell) {
      if (cell.hasAttribute('data-formula')) this.begin(cell, true);
      else if (FORMULA_START.test(cell.textContent)) this.begin(cell, false);
    }
    if (this.fcell) {
      const text = this.fcell.textContent.replace(/​/g, '').trim();
      if (!FORMULA_START.test(text)) { this.fcell.removeAttribute('data-formula'); this.end(this.fcell); }
      else if (formulaAllowed(text)) this.fcell.setAttribute('data-formula', text);
    }
    if (fig) this.recalc(fig);
    this.menu();
    this.showRefs();
    this.placeFill(fig, cell);
  }

  begin(cell, showFormula) {
    this.fcell = cell;
    cell.setAttribute('data-tedui-fedit', '');
    cell.removeAttribute('data-tedui-ferr');
    if (showFormula) {
      cell.textContent = cell.getAttribute('data-formula');
      placeCaret(cell, true);
    }
  }

  end(cell) {
    cell.removeAttribute('aria-expanded');   // метка списка функций (Popover) у ячейки
    cell.removeAttribute('data-tedui-fedit');
    cell.removeAttribute('data-tedui-fval');
    if (this.fcell === cell) this.fcell = null;
  }

  /** Закончить правку: «=…» — формула (результат в ячейке), иначе обычный текст. */
  commit(cell) {
    const text = cell.textContent.replace(/​/g, '').trim();
    if (FORMULA_START.test(text) && formulaAllowed(text)) cell.setAttribute('data-formula', text);
    else cell.removeAttribute('data-formula');
    this.end(cell);
    const fig = cell.closest('figure.ted-table');
    if (fig && cell.isConnected) this.recalc(fig);
    if (!cell.firstChild) cell.appendChild(document.createElement('br'));
    if (this.menuFor !== null) this.closeMenu();
  }

  /** Пересчитать формулы таблицы: в ячейках — результат (в ячейке с правкой — только служебный data-tedui-fval). */
  recalc(fig) {
    if (!fig.querySelector('[data-formula], [data-tedui-fedit]')) return;
    const rows = tableRows(fig);
    const grid = rows.map((tr) => [...tr.cells].map((c) => {
      if (c === this.fcell) {
        const t = c.textContent.replace(/​/g, '').trim();
        return FORMULA_START.test(t) && formulaAllowed(t) ? { formula: t, text: '' } : { text: t };
      }
      const f = c.getAttribute('data-formula');
      return f ? { formula: f, text: '' } : { text: c.textContent.replace(/​/g, '') };
    }));
    const res = computeGrid(grid);
    for (const [key, val] of res) {
      const [r, c] = key.split(':').map(Number);
      const cell = rows[r].cells[c];
      const txt = resultText(val);
      if (cell === this.fcell) { cell.setAttribute('data-tedui-fval', txt); continue; }
      if (cell.textContent !== txt) cell.textContent = txt;
      cell.toggleAttribute('data-tedui-ferr', !!val.err);
    }
  }

  // ---------- список функций под ячейкой ----------

  menu() {
    const cell = this.fcell;
    const r = cell && getRange(this.root);
    const m = cell && /^=\s*([A-Za-zА-Яа-яЁё]*)$/.exec(cell.textContent.replace(/​/g, '').trim());
    const atEnd = r && r.collapsed && cell.contains(r.startContainer) && !caretText(cell, r, 'after').trim();
    if (!m || !atEnd) { if (this.menuFor !== null) this.closeMenu(); return; }
    const q = m[1].toUpperCase();
    const list = FORMULA_FUNCS.filter((f) => !q || f.name.startsWith(q) || f.en.startsWith(q));
    if (!list.length) { if (this.menuFor !== null) this.closeMenu(); return; }
    if (this.menuFor === q && this.editor.popover.isOpen) return;
    this.menuFor = q;
    const items = list.map((f) => menuItem({ value: f.name, label: `${f.name} — ${f.hint.toLowerCase()}`, onSelect: () => this.insertFunc(f.name) }));
    items[0].classList.add('is-focus');   // Enter выбирает первую
    const pop = this.editor.popover;
    // список уже открыт у этой ячейки — меняем пункты на месте (без мигания при каждой букве)
    if (pop.isOpen && pop.anchor === cell && pop.el.classList.contains('ted-ui-pop--formula')) { pop.box.replaceChildren(...items); pop.place(); return; }
    pop.open(items, cell, { cls: 'ted-ui-pop--text ted-ui-pop--formula', onClose: () => { this.menuFor = null; } });
  }

  closeMenu() {
    this.menuFor = null;
    if (this.editor.popover.el && this.editor.popover.el.classList.contains('ted-ui-pop--formula')) this.editor.popover.close();
  }

  insertFunc(name) {
    const cell = this.fcell;
    if (!cell) return;
    this.closeMenu();
    this.editor.history.commit();
    cell.textContent = `=${name}(`;
    placeCaret(cell, true);
    this.editor.afterChange({ immediate: false });
  }

  // ---------- выбор ячеек мышью / пальцем ----------

  pickRef(e) {
    const cell = this.fcell;
    if (!cell || (e.button !== 0 && e.pointerType === 'mouse')) return;
    const target = e.target.closest && e.target.closest('td, th');
    const fig = cell.closest('figure.ted-table');
    if (!target || target === cell || target.closest('figure.ted-table') !== fig) return;
    const r = getRange(this.root);
    if (!r || !cell.contains(r.startContainer) || !REF_SLOT.test(caretText(cell, r, 'before'))) return;   // иначе — обычный клик: формула закрывается
    e.preventDefault();
    const start = cellInfo(target);
    r.deleteContents();
    const node = document.createTextNode(refName(start.colIndex, start.rowIndex));
    r.insertNode(node);
    const caret = () => { const nr = document.createRange(); nr.setStartAfter(node); nr.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(nr); };
    caret();
    this.editor.history.commit();
    const move = (ev) => {
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const c2 = under && under.closest && under.closest('td, th');
      if (!c2 || c2.closest('figure.ted-table') !== fig) return;
      const end = cellInfo(c2);
      const a = refName(start.colIndex, start.rowIndex);
      node.data = end.cell === start.cell ? a : `${a}:${refName(end.colIndex, end.rowIndex)}`;
      caret();
      this.showRefs();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.editor.afterChange({ immediate: true });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.showRefs();
  }

  /** Маски ссылок формулы (цвет выделения текста): видно, какие ячейки считаются. */
  showRefs() {
    const cell = this.fcell;
    const ranges = cell ? formulaRanges(cell.textContent.replace(/​/g, '')) : [];
    const fig = cell && cell.closest('figure.ted-table');
    let used = 0;
    if (fig) {
      const rows = tableRows(fig);
      for (const rg of ranges) {
        const a = rows[rg.r1] && rows[rg.r1].cells[rg.c1];
        const b = rows[rg.r2] && rows[rg.r2].cells[rg.c2];
        if (!a || !b) continue;
        if (!this.masks[used]) { this.masks[used] = h('div', { class: 'ted-ui-tablemask', 'aria-hidden': 'true' }); this.column.appendChild(this.masks[used]); }
        this.placeMask(this.masks[used], fig, a, b);
        used += 1;
      }
    }
    for (let i = used; i < this.masks.length; i += 1) this.masks[i].classList.remove('is-visible');
  }

  placeMask(mask, fig, a, b) {
    const cr = this.column.getBoundingClientRect();
    const wr = fig.querySelector(':scope > .ted-table__wrap').getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const left = Math.max(Math.min(ra.left, rb.left), wr.left);
    const right = Math.min(Math.max(ra.right, rb.right), wr.right);
    const top = Math.min(ra.top, rb.top);
    const bottom = Math.max(ra.bottom, rb.bottom);
    Object.assign(mask.style, { left: `${left - cr.left}px`, top: `${top - cr.top}px`, width: `${Math.max(0, right - left)}px`, height: `${bottom - top}px` });
    mask.classList.toggle('is-visible', right > left);
  }

  // ---------- протягивание ----------

  placeFill(fig, cell) {
    // квадрат есть и у ячейки с формулой (тянут чаще всего её); пока выбирается адрес ячейки (список функций открыт) — нет
    const show = fig && cell && !this.table.drag && this.menuFor === null && this.editor.mode === 'edit';
    if (!show) { this.fill.classList.remove('is-visible'); return; }
    const cr = this.column.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    const wr = fig.querySelector(':scope > .ted-table__wrap').getBoundingClientRect();
    const visible = r.right > wr.left + 4 && r.right <= wr.right + 1;
    this.fill.style.left = `${r.right - cr.left}px`;
    this.fill.style.top = `${r.bottom - cr.top}px`;
    this.fill.classList.toggle('is-visible', visible);
  }

  startFill(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const src = this.table.cell;
    const info = src && cellInfo(src);
    if (!info) return;
    e.preventDefault();
    const fig = info.fig;
    const rows = tableRows(fig);
    const wrap = fig.querySelector(':scope > .ted-table__wrap');
    const state = { r: info.rowIndex, c: info.colIndex, dr: 0, dc: 0 };
    this.filling = state;
    this.fill.classList.remove('is-visible');
    this.placeMask(this.fillMask, fig, src, src);
    const btn = e.currentTarget;
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* без захвата тоже работает */ }
    const target = (x, y) => {
      // ячейка под пальцем; за краем таблицы — крайняя в этом направлении
      let ri = rows.findIndex((tr) => { const b = tr.getBoundingClientRect(); return y < b.bottom; });
      if (ri < 0) ri = rows.length - 1;
      const cells = [...rows[0].cells];
      let ci = cells.findIndex((c) => c.getBoundingClientRect().right > x);
      if (ci < 0) ci = cells.length - 1;
      return { ri, ci };
    };
    const move = (ev) => {
      const wr = wrap.getBoundingClientRect();
      if (ev.clientX > wr.right - 24) wrap.scrollLeft += 12;
      else if (ev.clientX < wr.left + 24) wrap.scrollLeft -= 12;
      const t = target(ev.clientX, ev.clientY);
      let dr = t.ri - state.r;
      let dc = t.ci - state.c;
      // тянем и вбок, и вниз сразу — заполняется прямоугольник (решение заказчика 17.11)
      state.dr = dr; state.dc = dc;
      const end = rows[state.r + dr].cells[state.c + dc];
      this.placeMask(this.fillMask, fig, src, end);
    };
    const finish = (cancel) => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', cancelUp);
      document.removeEventListener('keydown', key, true);
      this.fillMask.classList.remove('is-visible');
      this.filling = null;
      if (!cancel && (state.dr || state.dc)) this.applyFill(fig, src, state);
      this.table.sync();
    };
    const up = () => finish(false);
    const cancelUp = () => finish(true);
    const key = (ev) => { if (ev.key === 'Escape' && !adminModalOpen()) { ev.preventDefault(); ev.stopPropagation(); finish(true); } };
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', cancelUp);
    document.addEventListener('keydown', key, true);
  }

  /** Заполнить ячейки протянутым значением: формула — со сдвигом ссылок, текст — как есть. */
  applyFill(fig, src, { r, c, dr, dc }) {
    const rows = tableRows(fig);
    const formula = src.getAttribute('data-formula');
    const html = src.innerHTML;
    this.editor.history.commit();
    const r1 = Math.min(r, r + dr); const r2 = Math.max(r, r + dr);
    const c1 = Math.min(c, c + dc); const c2 = Math.max(c, c + dc);
    for (let ri = r1; ri <= r2; ri += 1) {
      for (let ci = c1; ci <= c2; ci += 1) {
        const cell = rows[ri].cells[ci];
        if (!cell || cell === src) continue;
        if (formula) {
          cell.setAttribute('data-formula', shiftFormula(formula, ri - r, ci - c));
          cell.textContent = '';
        } else {
          cell.removeAttribute('data-formula');
          cell.innerHTML = html;
        }
      }
    }
    this.recalc(fig);
    this.editor.afterChange({ immediate: true });
  }

  hide() {
    this.fill.classList.remove('is-visible');
    for (const m of this.masks) m.classList.remove('is-visible');
  }
}

/** Текст ячейки до курсора ('before') или после ('after'). */
function caretText(cell, r, side) {
  const t = document.createRange();
  t.selectNodeContents(cell);
  if (side === 'before') t.setEnd(r.startContainer, r.startOffset);
  else t.setStart(r.endContainer, r.endOffset);
  return t.toString().replace(/​/g, '');
}
