// Меню блоков (макет editor-menu): открывается по «/», кнопкой «+» у строки,
// строкой «Добавить блок» под последним блоком и кнопкой «Все блоки» в панели.
// Поиск, группы библиотеки, стрелки ↑↓, Enter / Tab — вставить, Esc — закрыть.

import { h, menuItem, smallButton, icon, adminModalOpen } from './widgets.js';
import { menuGroups, filterGroups, convertBlocks, normalizeRoot, emptyBlock, emptyStepsBlock, isEmptyBlock, blockType } from '../core/blocks.js';
import { blockDef, registeredBlocks, inNarrowHost } from '../core/registry.js';
import { getRange, topBlockOf, placeCaret } from '../core/selection.js';

// Порядок групп в плитках (макет editor-block-picker): «Файлы и таблицы» из меню «/» здесь две отдельные группы
const PICKER_ORDER = ['Текст', 'Акцент', 'Списки', 'Медиа', 'Встраивание', 'Файлы', 'Таблицы', 'Макет', 'Интерактив', 'Действия'];

function pickerItems(title, groups = menuGroups()) {
  const out = [];
  for (const g of groups) {
    for (const it of g.items) {
      const own = it.picker || g.title;   // block.json → menu.picker: своя группа в «Все блоки» (файл, таблица)
      if (own === title) out.push(it);
    }
  }
  return out;
}

// Образцы для миниатюр готовых блоков (остальные плитки — значок и «появится на этапе N»)
const TILE_SAMPLES = {
  h2: '<h2>Заголовок 2</h2>',
  h3: '<h3>Заголовок 3</h3>',
  h4: '<h4>Заголовок 4</h4>',
  p: '<p>Всё это создал один человек с простой целью: сделать разработку сайтов быстрее и эффективнее. Моя миссия — помогать командам запускать магазины без лишней сложности.</p>',
  background: '<p class="ted-bg-gray">Всё это создал один человек с простой целью: сделать разработку сайтов быстрее и эффективнее.</p>',
};

export class BlockMenu {
  constructor(editor) {
    this.editor = editor;
    this.picker = null;     // нижнее меню с плитками (openPicker)
    this.mode = null;       // 'slash' | 'insert'
    this.slash = null;      // Range: от «/» до курсора
    this.target = null;     // блок, после которого вставлять (insert)
    this.index = 0;
    this.visible = [];
  }

  /** Блоки, доступные в меню (опция blocks редактора). */
  groups() {
    const groups = filterGroups(menuGroups(), this.editor.allowedBlocks);
    // в ответе аккордеона — всё, кроме цветного фона и других контейнеров (решение заказчика 16.11)
    const t = this.picker || this.pickerBuilding ? this.pickerTarget : this.target;
    const host = t && t.parentNode && t.parentNode.nodeType === 1 && t.parentNode.classList.contains('ted-ui-host');
    if (!host) return groups;
    // block.json → inContainers: false — блок нельзя вставить внутрь контейнера
    // block.json → inNarrow: false — в узкое тело (колонку) не вставляется слишком широкий блок (товар, таблица; решение 22.11)
    const narrow = inNarrowHost(t.parentNode);
    const NO = new Set(registeredBlocks().filter((d) => d.inContainers === false || (narrow && d.inNarrow === false)).map((d) => d.type));
    return groups.map((g) => ({ ...g, items: g.items.filter((it) => !NO.has(it.type)) })).filter((g) => g.items.length);
  }

  get isOpen() {
    return this.mode !== null && this.editor.popover.isOpen && this.editor.popover.owner === this;
  }

  // ---------- Открытие ----------

  /** Пользователь ввёл «/» — node/offset указывают на этот символ. */
  openAtSlash(node, offset) {
    const r = document.createRange();
    r.setStart(node, offset);
    r.setEnd(node, offset + 1);
    this.mode = 'slash';
    this.slash = r;
    this.target = topBlockOf(this.editor.editable, node);
    const rect = r.getBoundingClientRect();
    // макет editor-screen-start: строка 163…187, меню (уголок) с y = 193 → верх строки + 30
    const line = this.target ? this.target.getBoundingClientRect() : rect;
    const lineTop = Math.max(line.top + (parseFloat(getComputedStyle(this.target || document.body).paddingTop) || 0), rect.top - 2);
    const anchor = { left: rect.left, right: rect.right, width: rect.width, top: lineTop, bottom: lineTop + 26, height: 26 };
    this.open(anchor, rect.left + 28, false);
  }

  /** Вставка нового блока после target (или в конец), меню у кнопки anchor. */
  openInsert(anchor, target) {
    this.mode = 'insert';
    this.slash = null;
    this.target = target || null;
    const r = anchor.getBoundingClientRect();
    this.open(anchor, r.left + r.width / 2, true);
  }

  open(anchor, anchorX, focusSearch) {
    const ed = this.editor;
    this.input = h('input', { type: 'text', placeholder: 'Найти блок', 'aria-label': 'Найти блок', autocomplete: 'off' });
    this.list = h('div', { class: 'ted-ui-menu__list', role: 'menu' });
    const content = [
      h('div', { class: 'ted-ui-search' }, [this.input]),
      h('div', { class: 'ted-ui-menu__scroll' }, [this.list]),
    ];
    this.input.addEventListener('input', () => this.render(this.input.value));
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    ed.popover.open(content, anchor, {
      cls: 'ted-ui-pop--menu',
      anchorX,
      keyHandler: (e) => this.onKey(e),
      onClose: () => {
        this.reset();
        ed.scheduleState();
      },
    });
    ed.popover.owner = this;
    this.render('');
    if (focusSearch) {
      const input = this.input;
      setTimeout(() => input.focus({ preventScroll: true }), 0);
    }
  }

  reset() {
    this.mode = null;
    this.slash = null;
    this.target = null;
    this.visible = [];
  }

  close() {
    if (this.isOpen) this.editor.popover.close();
    this.reset();
  }

  // ---------- Список ----------

  render(query) {
    const q = String(query || '').trim().toLowerCase();
    this.list.replaceChildren();
    this.visible = [];
    let first = true;
    for (const group of this.groups()) {
      const items = group.items.filter((it) => !q || it.label.toLowerCase().includes(q) || (it.words || '').includes(q));
      if (!items.length) continue;
      if (!first) this.list.appendChild(h('div', { class: 'ted-ui-menu__divider' }));
      first = false;
      this.list.appendChild(h('div', { class: 'ted-ui-menu__group', text: group.title }));
      for (const it of items) {
        const el = menuItem({
          value: it.type,
          label: it.label,
          iconName: it.icon,
          soon: it.soon,
          onSelect: () => this.choose(it),
        });
        if (it.soon) el.addEventListener('click', () => this.editor.toast(`«${it.label}» появится на этапе ${it.soon}`));
        el.addEventListener('mousemove', () => {
          if (it.soon) return;
          const i = this.visible.findIndex((v) => v.item === it);
          if (i >= 0 && i !== this.index) this.highlight(i, false);
        });
        this.list.appendChild(el);
        if (!it.soon) this.visible.push({ item: it, el });
      }
    }
    if (first) this.list.appendChild(h('div', { class: 'ted-ui-menu__empty', text: 'Ничего не найдено' }));
    this.highlight(0, false);
    this.list.scrollTop = 0;
  }

  highlight(i, scroll = true) {
    this.visible.forEach((v) => v.el.classList.remove('is-active'));
    if (!this.visible.length) return;
    this.index = (i + this.visible.length) % this.visible.length;
    const cur = this.visible[this.index].el;
    cur.classList.add('is-active');
    if (scroll) {
      const item = cur.getBoundingClientRect();
      const bounds = this.list.getBoundingClientRect();
      if (item.top < bounds.top) this.list.scrollTop += item.top - bounds.top;
      else if (item.bottom > bounds.bottom) this.list.scrollTop += item.bottom - bounds.bottom;
    }
  }

  onKey(e) {
    if (!this.mode) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this.highlight(this.index + (e.key === 'ArrowDown' ? 1 : -1));
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const cur = this.visible[this.index];
      if (cur) this.choose(cur.item);
      else this.close();
      return true;
    }
    return false;
  }

  /** Ввод в редакторе при открытом меню по «/»: обновить запрос или закрыть. */
  syncWithEditor() {
    if (this.mode !== 'slash' || !this.slash) return;
    const ed = this.editor;
    const r = getRange(ed.editable);
    const slashStart = this.slash.startContainer;
    if (!r || !slashStart.isConnected || topBlockOf(ed.editable, r.startContainer) !== this.target) return this.close();
    const span = document.createRange();
    try {
      span.setStart(this.slash.startContainer, this.slash.startOffset);
      span.setEnd(r.startContainer, r.startOffset);
    } catch (err) {
      return this.close();
    }
    const text = span.toString();
    if (!text.startsWith('/') || text.includes('\n') || text.length > 32) return this.close();
    const q = text.slice(1);
    // пробел без совпадений — пользователь просто пишет текст
    if (/\s$/.test(q) && !this.hasMatches(q.trim())) return this.close();
    this.input.value = q;
    this.render(q);
  }

  hasMatches(q) {
    q = q.toLowerCase();
    return this.groups().some((g) => g.items.some((it) => !it.soon && (it.label.toLowerCase().includes(q) || (it.words || '').includes(q))));
  }

  // ---------- Плитки с предпросмотром (макет editor-block-picker) ----------

  get pickerOpen() {
    return !!this.picker;
  }

  /**
   * Всплывающее меню всех блоков: панель внутри редактора под шапкой (страница не прокручивается),
   * поиск, плитки-миниатюры по группам. Нажатие на плитку вставляет блок после target (по умолчанию — в конец).
   * Редактор при необходимости удлиняется плавно (Popover.grow). Закрытие: ×, Esc, клик мимо окна.
   */
  openPicker(target) {
    const ed = this.editor;
    if (this.picker) return this.closePicker();
    this.close();
    ed.popover.close();
    this.pickerTarget = target || ed.lastBlock();
    const sel0 = document.getSelection();
    this.pickerReturn = sel0.rangeCount ? sel0.getRangeAt(0).cloneRange() : null;   // Esc — курсор обратно (проверка 22.11)
    this.pickerBuilding = true;   // плитки собираются для этой цели (в ответе аккордеона — без фона и контейнеров)
    this.pickerIndex = 0;

    const input = h('input', { type: 'text', placeholder: 'Найти блок', 'aria-label': 'Найти блок', autocomplete: 'off' });
    const list = h('div', { class: 'ted-ui-picker__list' });
    const scroll = h('div', { class: 'ted-ui-picker__scroll' }, [list]);
    // Buttons/main secondary size s (иконка по центру, 40 × 40)
    const closeBtn = h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray ted-ui-action--icon ted-ui-action--s', 'aria-label': 'Закрыть', 'data-tip': 'Закрыть' }, [icon('close')]);
    closeBtn.addEventListener('mousedown', (e) => e.preventDefault());
    closeBtn.addEventListener('click', () => this.closePicker());
    const panel = h('section', { class: 'ted-ui-picker', role: 'dialog', 'aria-label': 'Добавить блок' }, [
      h('div', { class: 'ted-ui-picker__head' }, [
        h('p', { class: 'ted-ui-picker__title', text: 'Добавить блок' }),
        h('div', { class: 'ted-ui-search' }, [input]),
        closeBtn,
      ]),
      h('div', { class: 'ted-ui-picker__headline' }),
      scroll,
    ]);
    this.picker = { panel, input, list, scroll, tiles: [] };

    input.addEventListener('input', () => { panel.classList.add('is-kbd'); this.renderPicker(input.value); });
    input.addEventListener('keydown', (e) => this.onPickerKey(e));
    // наведение мышью — только :hover; подсветка выбора с клавиатуры гаснет, как только мышь пошла
    panel.addEventListener('mousemove', () => panel.classList.remove('is-kbd'));

    this.pickerOutside = (e) => {
      if (!this.picker || panel.contains(e.target)) return;
      if (ed.toolbar.allBlocksBtn.contains(e.target) || ed.addBlock.contains(e.target)) return;   // эти кнопки сами переключают
      this.closePicker();
    };
    this.pickerKeyDown = (e) => {
      if (adminModalOpen()) return;   // клавиши — окну админки (файловый менеджер)
      if (e.key === 'Escape' && this.picker) { e.preventDefault(); e.stopPropagation(); const r = this.pickerReturn; this.closePicker(); ed.returnCaret(r); return; }
      // буквы, набранные сразу после «+» (пока поиск ещё не в фокусе), — в поиск, а не в текст (проверка 22.11)
      if (this.picker && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== input) input.focus({ preventScroll: true });
    };
    this.pickerReflow = () => this.placePicker();
    document.addEventListener('mousedown', this.pickerOutside, true);
    document.addEventListener('keydown', this.pickerKeyDown, true);
    window.addEventListener('resize', this.pickerReflow);
    this.pickerRO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.pickerReflow) : null;
    if (this.pickerRO) this.pickerRO.observe(ed.ui);

    ed.ui.appendChild(panel);
    this.renderPicker('');
    this.placePicker();
    requestAnimationFrame(() => { if (this.picker) input.focus({ preventScroll: true }); });
  }

  /** Панель под шапкой, по ширине колонки (на мобильном — во всю ширину); высота подгоняется под окно. */
  placePicker() {
    const ed = this.editor;
    const p = this.picker;
    if (!p) return;
    const host = ed.ui.getBoundingClientRect();
    const bar = ed.toolbar.el.getBoundingClientRect();
    const col = ed.column.getBoundingClientRect();
    const narrow = ed.ui.clientWidth < 480;
    const left = narrow ? 8 : Math.max(8, col.left - host.left);
    const width = narrow ? host.width - 16 : Math.min(col.width, host.width - 16);
    const top = Math.max(0, bar.bottom - host.top) + 8;
    Object.assign(p.panel.style, { left: `${left}px`, top: `${top}px`, width: `${width}px` });
    // прокручивается только список плиток; всё меню помещается в окно, чтобы страницу не уводило вниз
    const chrome = p.panel.offsetHeight - p.scroll.offsetHeight;
    const room = window.innerHeight - Math.max(bar.bottom, 0) - 8 - 16;
    p.scroll.style.maxHeight = `${Math.max(160, Math.min(420, room - chrome))}px`;
    this.fitPicker();
    ed.popover.grow();
  }

  closePicker() {
    const p = this.picker;
    if (!p) return;
    this.picker = null;
    this.pickerBuilding = false;
    this.pickerTarget = null;
    document.removeEventListener('mousedown', this.pickerOutside, true);
    document.removeEventListener('keydown', this.pickerKeyDown, true);
    window.removeEventListener('resize', this.pickerReflow);
    if (this.pickerRO) { this.pickerRO.disconnect(); this.pickerRO = null; }
    p.panel.classList.add('is-closing');
    setTimeout(() => { p.panel.remove(); this.editor.popover.grow(); }, 120);
  }

  renderPicker(query) {
    const p = this.picker;
    if (!p) return;
    const q = String(query || '').trim().toLowerCase();
    p.list.replaceChildren();
    p.tiles = [];
    let first = true;
    for (const title of PICKER_ORDER) {
      const items = pickerItems(title, this.groups()).filter((it) => !q || it.label.toLowerCase().includes(q) || (it.words || '').includes(q) || title.toLowerCase().includes(q));
      if (!items.length) continue;
      if (!first) p.list.appendChild(h('div', { class: 'ted-ui-picker__line' }));
      first = false;
      const tiles = h('div', { class: 'ted-ui-picker__tiles' });
      for (const it of items) {
        const tile = this.makeTile(it);
        tiles.appendChild(tile);
        if (!it.soon) p.tiles.push({ item: it, el: tile });
      }
      p.list.appendChild(h('div', { class: 'ted-ui-picker__group' }, [h('p', { class: 'ted-ui-picker__label', text: title }), tiles]));
    }
    if (first) p.list.appendChild(h('div', { class: 'ted-ui-menu__empty', text: 'Ничего не найдено' }));
    this.pickerIndex = 0;
    this.highlightTile(0, false);
    p.scroll.scrollTop = 0;
    this.fitPicker();
    // список стал короче или длиннее — пересчитать высоту окна
    if (this.picker) this.placePicker();
  }

  makeTile(it) {
    // готовые блоки — живая миниатюра из настоящей разметки; остальные — картинка из макета (tiles/<тип>-light|dark.webp)
    const preview = h('div', { class: 'ted-ui-tile__preview' });
    const sample = TILE_SAMPLES[it.type] || it.sample;   // у блоков из реестра образец — в block.json (menu.sample)
    if (sample && !it.soon) preview.appendChild(h('div', { class: 'ted-content ted-ui-tile__sample', 'data-ted-unit': 'px', html: sample }));
    else preview.classList.add('is-image');
    const tile = h('button', {
      type: 'button',
      class: `ted-ui-tile${it.soon ? ' is-soon' : ''}`,
      'data-type': it.type,
      'aria-label': it.label,
      'aria-disabled': it.soon ? 'true' : null,
      'data-tip': it.soon ? `Появится на этапе ${it.soon}` : null,
    }, [preview, h('span', { class: 'ted-ui-tile__name', text: it.label })]);
    tile.addEventListener('mousedown', (e) => e.preventDefault());
    tile.addEventListener('click', () => {
      if (it.soon) return this.editor.toast(`«${it.label}» появится на этапе ${it.soon}`);
      this.chooseFromPicker(it);
    });
    return tile;
  }

  /** Миниатюры — настоящая разметка блока, уменьшенная до ширины плитки. */
  fitPicker() {
    const p = this.picker;
    if (!p) return;
    for (const sample of p.panel.querySelectorAll('.ted-ui-tile__sample')) {
      const box = sample.parentElement;
      const k = Math.max(0.1, Math.min(0.5, (box.clientWidth - 16) / 700));
      sample.style.setProperty('--k', String(k));
    }
  }

  highlightTile(i, scroll = true) {
    const p = this.picker;
    if (!p) return;
    p.tiles.forEach((t) => t.el.classList.remove('is-active'));
    if (!p.tiles.length) return;
    this.pickerIndex = (i + p.tiles.length) % p.tiles.length;
    const el = p.tiles[this.pickerIndex].el;
    el.classList.add('is-active');
    if (scroll) {
      const r = el.getBoundingClientRect();
      const b = p.scroll.getBoundingClientRect();
      if (r.top < b.top) p.scroll.scrollTop += r.top - b.top;
      else if (r.bottom > b.bottom) p.scroll.scrollTop += r.bottom - b.bottom;
    }
  }

  onPickerKey(e) {
    const p = this.picker;
    if (!p) return;
    const w = p.tiles[0] ? p.tiles[0].el.offsetWidth + 12 : 1;
    const cols = Math.max(1, Math.round(p.list.clientWidth / w));
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (step) {
      e.preventDefault();
      p.panel.classList.add('is-kbd');
      this.highlightTile(Math.max(0, Math.min(p.tiles.length - 1, this.pickerIndex + step)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cur = p.tiles[this.pickerIndex];
      if (cur) this.chooseFromPicker(cur.item);
    }
  }

  chooseFromPicker(item) {
    const target = this.pickerTarget;
    this.closePicker();
    this.mode = 'insert';
    this.slash = null;
    this.target = target;
    this.choose(item);
  }

  // ---------- Вставка ----------

  choose(item) {
    const ed = this.editor;
    const root = ed.editable;
    const mode = this.mode;
    let block = this.target;
    const slash = this.slash;
    this.close();
    ed.editable.focus({ preventScroll: true });
    ed.history.commit();

    // убираем «/запрос» из текста
    if (mode === 'slash' && slash && slash.startContainer.isConnected) {
      const r = getRange(root);
      const del = document.createRange();
      del.setStart(slash.startContainer, slash.startOffset);
      if (r) del.setEnd(r.startContainer, r.startOffset);
      else del.setEnd(slash.startContainer, slash.startOffset + 1);
      del.deleteContents();
      if (block && !block.textContent && !block.querySelector('br')) block.appendChild(document.createElement('br'));
    }

    if (!block || !block.isConnected) block = root.lastElementChild;
    const type = item.type;
    const insDef = blockDef(type);
    if (insDef && insDef.insert) return insDef.insert(ed, block);   // блок вставляет себя сам (медиа: выбор файла)
    const before = new Set(Array.from(root.children));   // чтобы плавно показать новые блоки
    const reuse = block && isEmptyBlock(block) && blockType(block) === 'p';
    let focusEl = null;
    let inserted = null;

    const regDef = blockDef(type);
    if (regDef && regDef.object && typeof regDef.create === 'function') {
      // блок без текста из реестра (линия…): встаёт на место пустого абзаца или после блока, за ним — абзац для курсора
      const el = regDef.create(document);
      if (reuse) block.replaceWith(el);
      else block.after(el);
      let next = el.nextElementSibling;
      if (!next || !isEmptyBlock(next)) {
        next = emptyBlock(document);
        el.after(next);
      }
      focusEl = next;
    } else if (regDef && !regDef.style && typeof regDef.create === 'function') {
      // блок из реестра, который не превращается из абзаца (выноска, цветной фон…): текстовые блоки со «Стилем текста» — ниже: create → элемент или { el, focus } — куда поставить курсор
      const made0 = regDef.create(document);
      const made = made0 && made0.el ? made0 : { el: made0, focus: null };
      inserted = made.el;
      if (reuse) block.replaceWith(made.el);
      else if (block) block.after(made.el);
      else root.appendChild(made.el);
      focusEl = made.focus;
    } else if (type === 'steps' && reuse) {
      // пустой абзац заменяется блоком шагов (макет state=empty), курсор в заголовке первого шага
      const ol = emptyStepsBlock(document);
      block.replaceWith(ol);
      focusEl = ol.firstElementChild.firstElementChild;
    } else if (reuse) {
      if (type !== 'p') convertBlocks(root, [block], type);
      focusEl = null; // курсор остаётся в преобразованном блоке
      const r = getRange(root);
      if (!r || !root.contains(r.startContainer)) focusEl = topBlockOf(root, root.childNodes[0]);
    } else {
      const el = type === 'blockquote' ? (() => { const q = document.createElement('blockquote'); q.appendChild(emptyBlock(document, 'p')); return q; })() : (type === 'steps' ? emptyStepsBlock(document) : emptyBlock(document, type === 'checklist' ? 'ul' : type));
      if (type === 'checklist') el.classList.add('ted-checklist');
      if (block) block.after(el);
      else root.appendChild(el);
      focusEl = type === 'steps' ? el.firstElementChild.firstElementChild : (type === 'blockquote' || type === 'ul' || type === 'ol' || type === 'checklist' ? el.firstElementChild : el);
    }

    normalizeRoot(root);
    // кнопка: курсор — в строку под блоком, сразу открывается окно «Настройки кнопки»
    if ((regDef && regDef.caretBelow) && inserted && inserted.isConnected) {
      // курсор — в строку текста под блоком (если под ним другой нередактируемый блок — новая пустая строка)
      let next = inserted.nextElementSibling;
      if (!next || !/^(P|H[2-6])$/.test(next.tagName)) { next = emptyBlock(document); inserted.after(next); }
      focusEl = next;
    }
    for (const c of Array.from(root.children)) {
      if (before.has(c)) continue;
      c.setAttribute('data-tedui-in', '');
      setTimeout(() => c.removeAttribute('data-tedui-in'), 300);
    }
    if (focusEl && focusEl.isConnected) placeCaret(focusEl);
    ed.afterChange({ immediate: true });
    ed.toast('Блок вставлен', { undo: true });
    if (regDef && regDef.afterInsert && inserted && inserted.isConnected) regDef.afterInsert(ed, inserted);   // окно настроек блока
  }
}
