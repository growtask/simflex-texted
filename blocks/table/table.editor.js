// Таблица в правке (этап 6.1, макет block-table, меню editor-block-menu-table).
// Кнопки строки (⠿ 🗑) — справа от таблицы на уровне строки, кнопки столбца — над столбцом у его правого края;
// на узком экране, где справа места нет, кнопки строки лежат поверх правого края строки (как у шагов).
// Под таблицей — «+ Добавить строку» и «+ Добавить столбец». Строки и столбцы перетаскиваются за ⠿.

import { h, smallButton, icon, adminModalOpen } from '../../resources/js/ui/widgets.js';
import { tf } from '../../resources/js/core/i18n.js';
import { TableFormulas } from './table-formula.js';
import { getRange, placeCaret } from '../../resources/js/core/selection.js';
import { normalizeRoot, emptyBlock, isEmptyBlock } from '../../resources/js/core/blocks.js';
import { sanitizeNodes } from '../../resources/js/core/sanitize.js';
import {
  isTableBlock, tableRows, colCount, cellInfo, addRow, addColumn, removeRow, removeColumn, moveRow, moveColumn,
  parseClipboardTable, TABLE_MAX_COLS, TABLE_MAX_ROWS,
} from './table.js';

export class TableUI {
  constructor(editor) {
    this.editor = editor;
    this.root = editor.editable;
    this.column = editor.column;
    this.fig = null;
    this.cell = null;
    this.drag = null;
    const ctl = (kind) => {
      const grip = smallButton({ name: `${kind}-grip`, label: kind === 'row' ? 'Перетащить строку' : 'Перетащить столбец', iconName: 'grip', flat: true });
      const trash = smallButton({ name: `${kind}-trash`, label: kind === 'row' ? 'Удалить строку' : 'Удалить столбец', iconName: 'trash', flat: true, onClick: () => this.remove(kind) });
      grip.addEventListener('contextmenu', (e) => e.preventDefault());
      grip.addEventListener('pointerdown', (e) => this.startDrag(e, kind));
      for (const b of [grip, trash]) b.addEventListener('mousedown', (e) => e.preventDefault());
      return h('div', { class: `ted-ui-itemctl ted-ui-tablectl ted-ui-tablectl--${kind}` }, [grip, trash]);
    };
    this.rowCtl = ctl('row');
    this.colCtl = ctl('col');
    const addBtn = (text, fn) => {
      const b = h('button', { type: 'button', class: 'ted-ui-addauthor' }, [icon('plus'), h('span', { text })]);   // общая «+ Добавить …»
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', fn);
      return b;
    };
    this.addBar = h('div', { class: 'ted-ui-tableadd' }, [
      addBtn('Добавить строку', () => this.add('row')),
      addBtn('Добавить столбец', () => this.add('col')),
    ]);
    this.frame = h('div', { class: 'ted-ui-tableframe', 'aria-hidden': 'true' });   // рамка перетаскивания строки / столбца
    this.column.append(this.rowCtl, this.colCtl, this.addBar, this.frame);
    this.formulas = new TableFormulas(this);   // формулы: «=», выбор ячеек, протягивание (этап 6.1б)
    this.onScroll = () => this.place();
    // ширина окна или колонки поменялась (поворот телефона, перенос строк, картинка догрузилась) — кнопки едут вместе с таблицей
    // скрытые кнопки уходят к левому краю колонки: прозрачные, но со старым местом они раздвигали страницу вбок,
    // когда окно стало уже (1.0.2)
    this.onReflow = () => {
      this.measure();
      if (this.drag) return;
      if (this.fig) this.place();
      for (const el of [this.rowCtl, this.colCtl, this.addBar]) if (!el.classList.contains('is-visible')) el.style.left = '0px';
    };
    window.addEventListener('resize', this.onReflow);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.onReflow) : null;
    this.ro?.observe(this.root);
  }

  /** Блок таблицы и ячейка с курсором (или null). */
  current() {
    const ed = this.editor;
    if (ed.mode !== 'edit' || !ed.isFocused()) return { fig: null, cell: null };
    const r = getRange(this.root);
    if (!r) return { fig: null, cell: null };
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const fig = n && n.closest('figure.ted-table');
    if (!fig || !this.root.contains(fig)) return { fig: null, cell: null };
    return { fig, cell: n.closest('td, th') };
  }

  sync() {
    if (this.drag) return;
    this.measure();
    const { fig, cell } = this.current();
    // курсор внутри таблицы, но не в ячейке (касание у края или полосы прокрутки на телефоне) — переносим в ближайшую ячейку,
    // иначе набранный текст окажется вне ячеек
    if (fig && !cell) {
      const r = getRange(this.root);
      const n = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
      if (n && !n.closest('figcaption')) {
        const target = nearestCell(fig, r);
        if (target) { this.focusCell(target); return this.sync(); }
      }
    }
    if (this.fig && this.fig !== fig) {
      this.fig.removeAttribute('data-tedui-tbtn');
      this.fig.querySelector(':scope > .ted-table__wrap')?.removeEventListener('scroll', this.onScroll);
    }
    if (fig && fig !== this.fig) fig.querySelector(':scope > .ted-table__wrap')?.addEventListener('scroll', this.onScroll);
    this.fig = fig;
    this.cell = cell;
    this.formulas.sync(fig, cell);
    if (!fig) { this.hide(); return; }
    fig.setAttribute('data-tedui-tbtn', '');   // место под кнопками «Добавить …»
    this.place();
  }

  /** Таблица шире колонки — у обёртки data-ted-scroll: под таблицей 12 до полосы прокрутки (макет block-table, Scroll). */
  measure() {
    for (const wrap of this.root.querySelectorAll(':scope > figure.ted-table > .ted-table__wrap')) {
      wrap.toggleAttribute('data-ted-scroll', wrap.scrollWidth > wrap.clientWidth + 1);
    }
  }

  hide() {
    for (const el of [this.rowCtl, this.colCtl, this.addBar]) el.classList.remove('is-visible');
    this.formulas.hide();
  }

  /** Положение кнопок. */
  place() {
    const fig = this.fig;
    if (!fig || !fig.isConnected) { this.hide(); return; }
    const ed = this.editor;
    const cr = this.column.getBoundingClientRect();
    const fr = fig.getBoundingClientRect();
    const wrap = fig.querySelector(':scope > .ted-table__wrap');
    const wr = wrap.getBoundingClientRect();
    // «Добавить строку / столбец» — под блоком, на 20 ниже подписи
    const cap = fig.querySelector(':scope > figcaption');
    const bottom = (cap ? cap.getBoundingClientRect().bottom : wr.bottom);
    this.addBar.style.top = `${bottom - cr.top + 20}px`;
    this.addBar.style.left = `${fr.left - cr.left}px`;
    this.addBar.style.width = `${fr.width}px`;   // не влезают — прокручиваются вбок, а не вылезают за колонку
    this.addBar.classList.add('is-visible');
    const cell = this.cell && this.cell.isConnected ? this.cell : null;
    this.formulas.placeFill(fig, cell);
    this.formulas.showRefs();
    if (!cell) { this.rowCtl.classList.remove('is-visible'); this.colCtl.classList.remove('is-visible'); return; }
    const row = cell.parentElement;
    const rr = row.getBoundingClientRect();
    // одна строка (один столбец): переносить и удалять нечего — кнопок нет
    const manyRows = tableRows(fig).length > 1;
    const manyCols = colCount(fig) > 1;
    const w = this.rowCtl.offsetWidth || 50;
    const hgt = this.rowCtl.offsetHeight || 24;
    // строка: справа от таблицы (снаружи), если рядом есть место; иначе поверх правого края строки
    const outside = ed.ui.getBoundingClientRect().right - wr.right >= w + 12;
    this.rowCtl.dataset.place = outside ? 'outside' : 'corner';
    this.rowCtl.style.top = `${rr.top - cr.top + (rr.height - hgt) / 2}px`;
    this.rowCtl.style.left = `${(outside ? wr.right + 8 : wr.right - w) - cr.left}px`;
    this.rowCtl.classList.toggle('is-visible', manyRows);
    // столбец: над столбцом у его правого края (если столбец прокручен за край — у видимого края)
    const cw = this.colCtl.offsetWidth || 50;
    const cellR = cell.getBoundingClientRect();
    const right = Math.min(Math.max(cellR.right, wr.left + cw), wr.right);
    this.colCtl.style.top = `${wr.top - cr.top - 28}px`;
    let colLeft = right - cw;
    // узкий редактор: в той же полосе над таблицей справа стоят кнопки блока (⠿ 🗑, бывает и якорь) —
    // кнопки столбца не заходят в их зону: правый край таблицы минус ширина группы блока и 8
    if (ed.ui.clientWidth < 480) {
      const bw = (ed.handle && ed.handle.controls.offsetWidth) || 56;
      const limit = fr.right - bw - 8 - cw;
      if (colLeft > limit) colLeft = Math.max(wr.left, limit);
    }
    this.colCtl.style.left = `${colLeft - cr.left}px`;
    this.colCtl.classList.toggle('is-visible', manyCols && cellR.right > wr.left + 8 && cellR.left < wr.right - 8);
  }

  /** Курсор в ячейку (в конец текста). */
  focusCell(cell, atStart = false) {
    if (!cell) return;
    placeCaret(cell, !atStart);
    cell.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  add(kind) {
    const ed = this.editor;
    const fig = this.fig;
    if (!fig) return;
    if (kind === 'row' && tableRows(fig).length >= TABLE_MAX_ROWS) { ed.toast(tf('Не больше {n} строк', { n: TABLE_MAX_ROWS })); return; }
    if (kind === 'col' && colCount(fig) >= TABLE_MAX_COLS) { ed.toast(tf('Не больше {n} столбцов', { n: TABLE_MAX_COLS })); return; }
    ed.history.commit();
    let target;
    if (kind === 'row') target = addRow(fig).cells[0];
    else target = addColumn(fig);
    normalizeRoot(this.root);
    ed.afterChange({ immediate: true });
    this.focusCell(target, true);
    if (kind === 'col') fig.querySelector(':scope > .ted-table__wrap').scrollLeft = 1e6;
  }

  remove(kind) {
    const ed = this.editor;
    const info = cellInfo(this.cell);
    if (!info) return;
    ed.history.commit();
    const { fig, rowIndex, colIndex } = info;
    const done = kind === 'row' ? removeRow(fig, rowIndex) : removeColumn(fig, colIndex);
    normalizeRoot(this.root);
    const rows = tableRows(fig);
    const r = rows[Math.min(rowIndex, rows.length - 1)];
    const target = r && r.cells[Math.min(colIndex, r.cells.length - 1)];
    this.focusCell(target);
    ed.afterChange({ immediate: true });
    if (done) ed.toast(kind === 'row' ? 'Строка удалена' : 'Столбец удалён', { undo: true });
  }

  // ---------- Перетаскивание строк и столбцов ----------

  /**
   * Перетаскивание строки или столбца — как у шагов и пунктов чек-листа: строка (столбец) едет за курсором,
   * соседи плавно сдвигаются на её место (transform 0.22 s), вокруг — рамка 2 px main/color1/light с отступом 4.
   * При отпускании сдвиги снимаются и DOM переставляется в одном кадре — без скачка.
   */
  startDrag(e, kind) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const info = cellInfo(this.cell);
    if (!info) return;
    e.preventDefault();
    const ed = this.editor;
    ed.popover.close();
    ed.tooltip?.hide();
    const fig = info.fig;
    const rows = tableRows(fig);
    // «ломтики»: строки (их ячейки) или столбцы (ячейки столбца во всех строках)
    const slices = kind === 'row'
      ? rows.map((tr) => [...tr.cells])
      : [...rows[0].cells].map((_, c) => rows.map((tr) => tr.cells[c]).filter(Boolean));
    const box = (cells) => {
      const rs = cells.map((c) => c.getBoundingClientRect());
      return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
    };
    const boxes = slices.map(box);
    const pos = boxes.map((r) => (kind === 'row' ? r.top : r.left));
    const size = boxes.map((r) => (kind === 'row' ? r.bottom - r.top : r.right - r.left));
    const index = kind === 'row' ? info.rowIndex : info.colIndex;
    const wrap = fig.querySelector(':scope > .ted-table__wrap');
    this.drag = {
      kind, fig, wrap, slices, pos, size, index, target: index, cell: info.cell, shifts: slices.map(() => 0),
      start: kind === 'row' ? e.clientY : e.clientX, scroll0: wrap.scrollLeft, delta: 0,
    };
    for (const c of slices[index]) c.setAttribute('data-tedui-drag', '');
    this.formulas.hide();
    ed.ui.classList.add('is-dragging');
    this.frame.classList.add('is-visible');
    this.placeFrame();
    const btn = e.currentTarget;
    try { btn.setPointerCapture?.(e.pointerId); } catch (err) { /* без захвата тоже работает */ }
    const move = (ev) => this.onDrag(ev);
    const finish = (cancelled) => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', cancel);
      window.removeEventListener('pointerup', up);
      document.removeEventListener('keydown', key, true);
      this.endDrag(cancelled);
    };
    const up = () => finish(false);
    const cancel = () => finish(true);
    const key = (ev) => { if (ev.key === 'Escape' && !adminModalOpen()) { ev.preventDefault(); ev.stopPropagation(); finish(true); } };
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', cancel);
    window.addEventListener('pointerup', up);
    document.addEventListener('keydown', key, true);
  }

  onDrag(e) {
    const d = this.drag;
    if (!d) return;
    const row = d.kind === 'row';
    const n = d.slices.length;
    const i = d.index;
    if (!row) {
      // у края видимой части — прокручиваем таблицу вбок
      const wr = d.wrap.getBoundingClientRect();
      if (e.clientX > wr.right - 24) d.wrap.scrollLeft += 12;
      else if (e.clientX < wr.left + 24) d.wrap.scrollLeft -= 12;
    }
    const scrolled = row ? 0 : d.wrap.scrollLeft - d.scroll0;
    // ломтик идёт за курсором, но не выходит за края таблицы
    const min = d.pos[0] - d.pos[i];
    const max = d.pos[n - 1] + d.size[n - 1] - d.size[i] - d.pos[i];
    const delta = Math.max(min, Math.min(max, (row ? e.clientY : e.clientX) - d.start + scrolled));
    d.delta = delta;
    const shift = (cells, v) => { for (const c of cells) c.style.transform = v ? (row ? 'translateY(' + v + 'px)' : 'translateX(' + v + 'px)') : ''; };
    shift(d.slices[i], delta);
    // новое место: край ломтика прошёл середину соседа
    const a = d.pos[i] + delta;
    const b = a + d.size[i];
    let t = i;
    for (let j = i + 1; j < n; j++) { if (b > d.pos[j] + d.size[j] / 2) t = j; else break; }
    for (let j = i - 1; j >= 0; j--) { if (a < d.pos[j] + d.size[j] / 2) t = j; else break; }
    d.target = t;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      let v = 0;
      if (t > i && j > i && j <= t) v = -d.size[i];
      else if (t < i && j >= t && j < i) v = d.size[i];
      if (v !== d.shifts[j]) { d.shifts[j] = v; shift(d.slices[j], v); }
    }
    this.placeFrame();
    // кнопки строки (столбца) едут вместе с ней
    if (row) this.rowCtl.style.transform = 'translateY(' + delta + 'px)';
    else this.colCtl.style.transform = 'translateX(' + (delta - scrolled) + 'px)';
  }

  /** Рамка перетаскивания вокруг ломтика: 2 px main/color1/light, отступ 4, r12 (как у шагов и чек-листа). */
  placeFrame() {
    const d = this.drag;
    if (!d) return;
    const rs = d.slices[d.index].map((c) => c.getBoundingClientRect());
    const cr = this.column.getBoundingClientRect();
    const wr = d.wrap.getBoundingClientRect();
    // столбец у края прокрутки рамкой не вылезает за таблицу
    const left = Math.max(Math.min(...rs.map((r) => r.left)), wr.left);
    const right = Math.min(Math.max(...rs.map((r) => r.right)), wr.right);
    const top = Math.min(...rs.map((r) => r.top));
    const bottom = Math.max(...rs.map((r) => r.bottom));
    Object.assign(this.frame.style, {
      left: (left - cr.left - 4) + 'px', top: (top - cr.top - 4) + 'px', width: (right - left + 8) + 'px', height: (bottom - top + 8) + 'px',
    });
  }

  endDrag(cancelled = false) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const ed = this.editor;
    // без анимации: снимаем сдвиги и переставляем DOM в одном кадре — позиции совпадают
    ed.ui.classList.add('is-dropping');
    for (const cells of d.slices) for (const c of cells) { c.style.transform = ''; c.removeAttribute('data-tedui-drag'); }
    this.rowCtl.style.transform = '';
    this.colCtl.style.transform = '';
    this.frame.classList.remove('is-visible');
    ed.ui.classList.remove('is-dragging');
    const moved = !cancelled && d.target !== d.index;
    if (moved) {
      ed.history.commit();
      if (d.kind === 'row') moveRow(d.fig, d.index, d.target); else moveColumn(d.fig, d.index, d.target);
      normalizeRoot(this.root);
    }
    const rows = tableRows(d.fig);
    const at = moved ? d.target : d.index;
    // курсор остаётся в той же ячейке (после перестановки шапки ячейка могла смениться на th)
    const target = d.kind === 'row' ? rows[at]?.cells[cellInfoIndex(d.cell, 'col')] : rows[cellInfoIndex(d.cell, 'row')]?.cells[at];
    this.focusCell(target && target.isConnected ? target : d.cell);
    if (moved) ed.afterChange({ immediate: true });
    this.sync();
    requestAnimationFrame(() => requestAnimationFrame(() => ed.ui.classList.remove('is-dropping')));
  }

  // ---------- Клавиши ----------

  /** Enter, Tab, ↑ ↓, Backspace / Delete у края ячейки. true — нажатие обработано. */
  onKeyFirst(e) {
    const r = getRange(this.root);
    if (!r) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const fig = n && n.closest('figure.ted-table');
    if (!fig || !this.root.contains(fig)) return false;
    const ed = this.editor;
    const cap = n.closest('figcaption');
    if (cap) {
      // подпись: Enter — новый абзац под таблицей
      if (e.key === 'Enter') { e.preventDefault(); this.exitBelow(fig); return true; }
      if (e.key === 'Backspace' && r.collapsed && atEdge(cap, r, 'start')) { e.preventDefault(); return true; }
      return false;
    }
    const cell = n.closest('td, th');
    if (!cell) return false;
    const info = cellInfo(cell);
    if (e.key === 'Tab') {
      e.preventDefault();
      const cells = tableRows(fig).flatMap((tr) => [...tr.cells]);
      const i = cells.indexOf(cell);
      if (e.shiftKey) { if (i > 0) this.focusCell(cells[i - 1]); return true; }
      if (i < cells.length - 1) { this.focusCell(cells[i + 1]); return true; }
      if (tableRows(fig).length >= TABLE_MAX_ROWS) return true;
      ed.history.commit();
      const tr = addRow(fig);
      normalizeRoot(this.root);
      ed.afterChange({ immediate: true });
      this.focusCell(tr.cells[0], true);
      return true;
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      // Shift+Enter — перенос строки внутри ячейки
      if (e.shiftKey) {
        ed.history.commit();
        insertBreak(cell, r);
        ed.afterChange({ immediate: false });
        return true;
      }
      // Enter — следующая ячейка; в последней: есть текст — новая строка ниже, пусто — новый блок под таблицей
      const cells = tableRows(fig).flatMap((tr) => [...tr.cells]);
      const i = cells.indexOf(cell);
      if (i < cells.length - 1) { this.focusCell(cells[i + 1]); return true; }
      ed.history.commit();
      if (isCellEmpty(cell)) {
        // пустая последняя строка не остаётся хвостом (как пустой пункт чек-листа), если в теле есть другие строки
        const rows = tableRows(fig);
        const last = rows[rows.length - 1];
        const bodyRows = fig.querySelectorAll('tbody > tr').length;
        if (last.parentElement.tagName === 'TBODY' && bodyRows > 1 && [...last.cells].every(isCellEmpty)) removeRow(fig, rows.length - 1);
        this.exitBelow(fig);
        return true;
      }
      if (tableRows(fig).length >= TABLE_MAX_ROWS) { this.exitBelow(fig); return true; }
      const tr = addRow(fig);
      normalizeRoot(this.root);
      ed.afterChange({ immediate: true });
      this.focusCell(tr.cells[0], true);
      return true;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && r.collapsed) {
      const down = e.key === 'ArrowDown';
      if (!onEdgeLine(cell, r, down)) return false;
      const rows = tableRows(fig);
      const next = rows[info.rowIndex + (down ? 1 : -1)];
      if (!next) return false;   // за таблицей — как обычно (браузер переходит к соседнему блоку)
      e.preventDefault();
      this.focusCell(next.cells[info.colIndex], !down);
      return true;
    }
    // Backspace в начале и Delete в конце ячейки не склеивают ячейки и не ломают таблицу
    if (e.key === 'Backspace' && r.collapsed && atEdge(cell, r, 'start')) { e.preventDefault(); return true; }
    if (e.key === 'Delete' && r.collapsed && atEdge(cell, r, 'end')) { e.preventDefault(); return true; }
    return false;
  }

  /** Новый абзац под таблицей (или уже пустой следующий). */
  exitBelow(fig) {
    const ed = this.editor;
    let next = fig.nextElementSibling;
    if (!(next && next.tagName === 'P' && isEmptyBlock(next))) {
      next = emptyBlock(document);
      fig.after(next);
    }
    normalizeRoot(this.root);
    placeCaret(next);
    ed.afterChange({ immediate: true });
  }

  // ---------- Вставка из Excel / Google Таблиц ----------

  /** true — вставка обработана: в пустой абзац — новая таблица, в ячейку — заполнение от неё вправо и вниз. */
  onPaste(cd, block, r) {
    const data = parseClipboardTable(cd.getData('text/html'), cd.getData('text/plain'));
    if (!data) return false;
    const ed = this.editor;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const cell = n && n.closest('figure.ted-table td, figure.ted-table th');
    const clean = cleanRows(data);
    if (!clean) return false;
    if (cell) {
      const info = cellInfo(cell);
      ed.history.commit();
      const { fig } = info;
      clean.forEach((cells, i) => {
        let rows = tableRows(fig);
        while (rows.length <= info.rowIndex + i && rows.length < TABLE_MAX_ROWS) { addRow(fig); rows = tableRows(fig); }
        const tr = rows[info.rowIndex + i];
        if (!tr) return;
        cells.forEach((html, j) => {
          while (colCount(fig) <= info.colIndex + j && colCount(fig) < TABLE_MAX_COLS) addColumn(fig);
          const target = tableRows(fig)[info.rowIndex + i].cells[info.colIndex + j];
          if (target) target.innerHTML = html || '<br>';
        });
      });
      normalizeRoot(this.root);
      ed.afterChange({ immediate: true });
      this.focusCell(cell);
      return true;
    }
    if (!(block && block.tagName === 'P' && isEmptyBlock(block))) return false;
    // новая таблица из вставленных данных (через ту же очистку, что и при загрузке)
    const esc = (rowsHtml) => `<table><tbody>${rowsHtml.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const frag = sanitizeNodes(templateNodes(esc(clean)));
    const fig = frag.firstChild && isTableBlock(frag.firstChild) ? frag.firstChild : null;
    if (!fig) return false;
    ed.history.commit();
    block.replaceWith(fig);
    normalizeRoot(this.root);
    ed.afterChange({ immediate: true });
    this.focusCell(fig.querySelector('th, td'));
    ed.toast('Таблица вставлена');
    return true;
  }

  /** Раньше кнопок блока: место под «Добавить …» под таблицей; после них — кнопки столбца не наезжают на кнопки блока. */
  syncFirst() { this.sync(); }

  afterSync() { if (this.fig) this.place(); }

  /** Курсор в ячейке или подписи таблицы: стиль блока и выравнивание не действуют (форматирование текста — да). */
  lockStyle() { return !!this.current().fig; }

  destroy() {
    this.formulas.destroy();
    window.removeEventListener('resize', this.onReflow);
    this.ro?.disconnect();
    this.fig?.querySelector(':scope > .ted-table__wrap')?.removeEventListener('scroll', this.onScroll);
    this.drag = null;
  }
}

/** Ячейка рядом с курсором, стоящим между ячейками: в строке — по смещению, до таблицы — первая, после — последняя. */
function nearestCell(fig, r) {
  const rows = tableRows(fig);
  if (!rows.length) return null;
  const c = r.startContainer;
  if (c.nodeType === 1 && c.tagName === 'TR' && c.cells.length) return c.cells[Math.min(r.startOffset, c.cells.length - 1)];
  const table = fig.querySelector('table');
  const probe = document.createRange();
  probe.selectNode(table);
  const before = r.compareBoundaryPoints(Range.START_TO_START, probe) <= 0;
  const row = before ? rows[0] : rows[rows.length - 1];
  return before ? row.cells[0] : row.cells[row.cells.length - 1];
}

/** Пустая ячейка: нет текста (служебные <br> и пробелы не считаются). */
function isCellEmpty(cell) {
  return !cell.textContent.replace(/\u200b/g, '').trim() && !cell.querySelector('img');
}

function cellInfoIndex(cell, axis) {
  const info = cellInfo(cell);
  if (!info) return 0;
  return axis === 'row' ? info.rowIndex : info.colIndex;
}

function templateNodes(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content.childNodes;
}

/** Вставленные ячейки → чистый HTML (жирный, ссылки, переносы), не больше 10 столбцов и 100 строк. */
function cleanRows(rows) {
  const html = `<table><tbody>${rows.slice(0, TABLE_MAX_ROWS).map((cells) => `<tr>${cells.slice(0, TABLE_MAX_COLS).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const frag = sanitizeNodes(templateNodes(html));
  const fig = frag.firstChild;
  if (!fig || !isTableBlock(fig)) return null;
  return tableRows(fig).map((tr) => [...tr.cells].map((c) => c.innerHTML));
}

/** Курсор в самом начале / конце ячейки (в конце допускается только служебный последний <br>). */
function atEdge(el, r, side) {
  const probe = document.createRange();
  probe.selectNodeContents(el);
  if (side === 'start') probe.setEnd(r.startContainer, r.startOffset);
  else probe.setStart(r.endContainer, r.endOffset);
  if (probe.toString().replace(/​/g, '').length) return false;
  const brs = probe.cloneContents().querySelectorAll('br');
  if (side === 'start') return !brs.length;
  return brs.length === 0 || (brs.length === 1 && el.lastChild && el.lastChild.nodeName === 'BR');
}



/** Перенос строки в ячейке: <br> на месте курсора; если после него в ячейке ничего нет — второй <br>, иначе новая строка не видна. */
function insertBreak(cell, r) {
  r.deleteContents();
  const br = document.createElement('br');
  r.insertNode(br);
  let after = br.nextSibling;
  while (after && after.nodeType === 3 && !after.data.length) after = after.nextSibling;
  if (!after) br.after(document.createElement('br'));
  const nr = document.createRange();
  nr.setStartAfter(br);
  nr.collapse(true);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(nr);
}

/** Курсор на первой (вверх) или последней (вниз) строке текста ячейки. */
function onEdgeLine(cell, r, down) {
  const rect = caretRect(r);
  const cr = cell.getBoundingClientRect();
  if (!rect) return true;
  const lh = parseFloat(getComputedStyle(cell).lineHeight) || 20;
  const pad = parseFloat(getComputedStyle(cell)[down ? 'paddingBottom' : 'paddingTop']) || 0;
  return down ? cr.bottom - pad - rect.bottom < lh * 0.6 : rect.top - (cr.top + pad) < lh * 0.6;
}

function caretRect(r) {
  const rects = r.getClientRects();
  if (rects.length) return rects[rects.length - 1];
  const b = r.getBoundingClientRect();
  return b && (b.width || b.height) ? b : null;
}
