// Содержание в правке (этап 6.3, макет block-navigation, окно editor-popover kind=chapter).
// Заголовок — строка текста. Глава — ссылка на якорь страницы: нажатие выбирает главу (кнопки ⠿ 🗑 справа в её строке,
// как у пунктов) и открывает окно «Глава содержания» (как окно «Якорь»: название, якорь, «Сохранить» / «Отмена»).
// Якорь выбирается из существующих на странице (список под полем — общее меню) или вводится вручную.
// Под блоком — «+ Добавить главу» (как «Добавить автора»). Внизу панели — «Скрыть» / «Показать»: сворачивает и в правке
// (признак правки data-tedui-collapsed, в HTML не попадает; решение 22.11). Enter в заголовке — новая глава; стрелки вправо и
// вниз в конце заголовка — в следующий блок (в список глав курсор не встаёт). Окно главы — под главой (новой — под блоком).

import { h, icon, smallButton, menuItem } from '../../resources/js/ui/widgets.js';
import { getRange, placeCaret } from '../../resources/js/core/selection.js';
import { makeTocItem, documentAnchors, tocAnchorOk } from './toc.js';

const cleanId = (v) => String(v || '').trim().replace(/^#/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export class TocUI {
  constructor(editor) {
    this.editor = editor;
    this.root = editor.editable;
    this.column = editor.column;
    this.toc = null;
    this.selected = null;
    this.addBtn = h('button', { type: 'button', class: 'ted-ui-addauthor ted-ui-tocadd' }, [icon('plus'), h('span', { text: 'Добавить главу' })]);
    this.addBtn.addEventListener('mousedown', (e) => e.preventDefault());
    this.addBtn.addEventListener('click', () => this.openChapter(null));
    this.column.appendChild(this.addBtn);
    this.onClick = (e) => {
      const toggle = e.target.closest && e.target.closest('.ted-toc__toggle');
      if (toggle && this.root.contains(toggle) && this.editor.mode === 'edit') { e.preventDefault(); this.toggle(toggle.closest('.ted-toc')); return; }
      const li = e.target.closest && e.target.closest('.ted-toc__list > li');
      if (!li || !this.root.contains(li)) return;
      e.preventDefault();   // ссылка в правке не уводит со страницы
      if (this.editor.mode !== 'edit') return;
      this.openChapter(li);
    };
    this.root.addEventListener('click', this.onClick);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.place()) : null;
  }

  destroy() {
    this.ro?.disconnect();
    this.root.removeEventListener('click', this.onClick);
  }

  /** Глава — пункт этого блока: кнопки ⠿ 🗑 внутри её строки; после удаления блок остаётся и без глав. */
  ownsItem(li) { return !!li.parentNode && li.parentNode.nodeType === 1 && li.parentNode.classList.contains('ted-toc__list'); }

  get itemInside() { return true; }

  afterItemRemove() {
    const ed = this.editor;
    ed.popover.close();
    ed.afterChange({ immediate: true });
    ed.toast('Глава удалена', { undo: true });
  }

  /** Глава, выбранная нажатием (пока открыто её окно или её тащат) — для кнопок ⠿ 🗑: при перетаскивании они не пропадают. */
  selectedItem() {
    const drag = this.editor.handle.drag;
    if (drag && drag.itemMode && drag.block.closest && drag.block.closest('.ted-toc__list')) return drag.block;
    const li = this.selected;
    return li && li.isConnected && (this.editor.popover.isOpen || this.keep === li) ? li : null;
  }

  /** «Скрыть» / «Показать» в правке: список глав сворачивается, как на сайте. */
  toggle(toc) {
    if (!toc) return;
    const collapsed = !toc.hasAttribute('data-tedui-collapsed');
    toc.toggleAttribute('data-tedui-collapsed', collapsed);
    const t = toc.querySelector('.ted-toc__toggle');
    if (t) { t.textContent = collapsed ? 'Показать' : 'Скрыть'; t.setAttribute('aria-expanded', String(!collapsed)); }
    this.editor.handle.refresh();
    this.place();
  }

  current() {
    const ed = this.editor;
    if (ed.mode !== 'edit') return null;
    const sel = this.selectedItem();
    if (sel) return sel.closest('.ted-toc');
    if (!ed.isFocused()) return null;
    const r = getRange(this.root);
    const n = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode);
    const toc = n && n.closest && n.closest('.ted-toc');
    return toc && this.root.contains(toc) ? toc : null;
  }

  sync() {
    // «Скрыть» внизу панели — как на сайте (служебный элемент правки, в HTML не попадает)
    for (const panel of this.root.querySelectorAll('.ted-toc > .ted-toc__panel')) {
      if (!panel.querySelector(':scope > .ted-toc__toggle')) {
        const collapsed = panel.parentNode.hasAttribute('data-tedui-collapsed');
        panel.appendChild(h('div', { class: 'ted-toc__toggle', 'data-tedui-m': '', contenteditable: 'false', role: 'button', 'aria-expanded': String(!collapsed), text: collapsed ? 'Показать' : 'Скрыть' }));
      }
    }
    const toc = this.current();
    if (this.toc && this.toc !== toc) { this.toc.removeAttribute('data-tedui-addbtn'); this.ro?.unobserve(this.toc); }
    if (toc && toc !== this.toc) this.ro?.observe(toc);
    this.toc = toc;
    if (!toc) { this.addBtn.classList.remove('is-visible'); return; }   // при перетаскивании главы «Добавить главу» остаётся
    toc.setAttribute('data-tedui-addbtn', '');
    this.place();
  }

  place() {
    const toc = this.toc;
    if (!toc || !toc.isConnected) { this.addBtn.classList.remove('is-visible'); return; }
    const cr = this.column.getBoundingClientRect();
    const r = toc.getBoundingClientRect();
    this.addBtn.style.top = `${r.bottom - cr.top + 20}px`;
    this.addBtn.style.left = `${r.left - cr.left}px`;
    this.addBtn.classList.add('is-visible');
  }

  /** Окно «Глава содержания»: li — правка главы, null — новая глава в конец списка. */
  openChapter(li) {
    const ed = this.editor;
    const toc = li ? li.closest('.ted-toc') : this.toc;
    if (!toc) return;
    const a = li && li.querySelector('a');
    this.selected = li;
    const title = h('input', { class: 'ted-ui-input', type: 'text', autocomplete: 'off', 'aria-label': 'Название', placeholder: 'Первая глава', value: a ? a.textContent : '' });
    const anchor = h('input', { class: 'ted-ui-input', type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Якорь', placeholder: 'glava-1', value: a ? a.getAttribute('href').replace(/^#/, '') : '' });
    const field = (label, input, hint) => h('div', { class: 'ted-ui-field' }, [h('span', { class: 'ted-ui-field__label', text: label }), input, h('span', { class: 'ted-ui-field__hint', text: hint })]);
    const anchors = () => {
      const q = anchor.value.trim().replace(/^#/, '').toLowerCase();
      return documentAnchors(this.root).filter((x) => !q || x.id.toLowerCase().includes(q) || x.text.toLowerCase().includes(q)).slice(0, 8);
    };
    // якоря страницы — списком под полем (общее меню); выбор подставляет якорь, а пустое название — текстом блока
    const showAnchors = () => {
      const list = anchors();
      if (!list.length) { ed.subPopover.close(); return; }
      const items = list.map((x) => menuItem({ value: x.id, label: x.text ? `#${x.id} — ${x.text}` : `#${x.id}`, iconName: 'anchor', onSelect: () => {
        anchor.value = x.id;
        if (!title.value.trim()) title.value = x.text;
        ed.subPopover.close();
        anchor.focus();
      } }));
      ed.subPopover.open(items, anchor, { cls: 'ted-ui-pop--text ted-ui-pop--anchors' });
    };
    anchor.addEventListener('focus', showAnchors);
    anchor.addEventListener('input', showAnchors);
    const save = () => {
      const name = title.value.replace(/\s+/g, ' ').trim();
      const id = cleanId(anchor.value);
      if (!name) { title.focus(); return ed.toast('Введите название главы'); }
      if (!id || !/^[A-Za-z]/.test(id) || !tocAnchorOk(`#${id}`)) { anchor.focus(); return ed.toast('Якорь — латиницей, с буквы'); }
      ed.subPopover.close();
      ed.popover.close();
      ed.history.commit();
      if (toc.hasAttribute('data-tedui-collapsed')) this.toggle(toc);   // новую главу видно
      if (li && li.isConnected) {
        const link = li.querySelector('a') || li.appendChild(document.createElement('a'));
        link.textContent = name;
        link.setAttribute('href', `#${id}`);
      } else toc.querySelector('.ted-toc__list').appendChild(makeTocItem(document, name, `#${id}`));
      // курсор — обратно в блок (в конец заголовка): «Добавить главу» остаётся под рукой
      ed.editable.focus({ preventScroll: true });
      placeCaret(toc.querySelector('.ted-toc__title'), true);
      ed.afterChange({ immediate: true });
    };
    const cancel = () => { ed.subPopover.close(); ed.popover.close(); };
    for (const inp of [title, anchor]) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [
        h('p', { class: 'ted-ui-form__title', text: 'Глава содержания' }),
        smallButton({ name: 'close', label: 'Закрыть', iconName: 'close-small', onClick: cancel }),
      ]),
      field('Название', title, 'Как глава показывается в содержании.'),
      field('Якорь', anchor, 'Латиницей, без #. Куда ведёт ссылка.'),
      h('div', { class: 'ted-ui-form__footer' }, [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Сохранить', onclick: save }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отмена', onclick: cancel }),
      ]),
    ];
    // окно — по общему правилу: под главой, а новой главы — под блоком (решение 22.11)
    ed.popover.openUnder(nodes, li || toc, {
      onClose: () => { ed.subPopover.close(); this.selected = null; ed.updateState(); },
    });
    ed.updateState();   // кнопки ⠿ 🗑 у выбранной главы
  }

  /** Стрелки вправо / вниз в конце заголовка — в следующий блок: в список глав и «Скрыть» курсор не встаёт (22.11). */
  onKeyFirst(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowDown') return false;
    if (e.shiftKey) return false;
    const r = getRange(this.root);
    if (!r || !r.collapsed) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const title = n && n.closest && n.closest('.ted-toc__title');
    if (!title || !this.root.contains(title)) return false;
    const t = document.createRange();
    t.selectNodeContents(title);
    t.setStart(r.endContainer, r.endOffset);
    if (t.toString().replace(/\u200b/g, '').length) return false;
    e.preventDefault();
    const next = title.closest('.ted-toc').nextElementSibling;
    if (next && next.isContentEditable !== false && next.getAttribute('contenteditable') !== 'false') { placeCaret(next, false); this.editor.updateState(); }
    return true;
  }

  /** Заголовок — одна строка: Enter — новая глава (окно «Глава содержания»), Backspace в начале не ломает блок. */
  onKey(e) {
    const r = getRange(this.root);
    if (!r) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const title = n && n.closest && n.closest('.ted-toc__title');
    if (!title || !this.root.contains(title)) return false;
    if (e.key === 'Enter') { e.preventDefault(); if (!e.shiftKey) { this.toc = title.closest('.ted-toc'); this.openChapter(null); } return true; }
    const t = document.createRange();
    t.selectNodeContents(title);
    if (e.key === 'Backspace' && r.collapsed) { t.setEnd(r.startContainer, r.startOffset); if (!t.toString().length) { e.preventDefault(); return true; } }
    if (e.key === 'Delete' && r.collapsed) { t.setStart(r.endContainer, r.endOffset); if (!t.toString().length) { e.preventDefault(); return true; } }
    return false;
  }
}
