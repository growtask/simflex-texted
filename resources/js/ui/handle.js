// Строка блока (макет editor-row, block-controls, editor-block-menu).
//
//  • наведение — слева от колонки «+» и ⠿ (gap 4, pt 4, в 8 px от текста);
//  • правка (курсор в блоке) — кнопки ⠿ и 🗑 в рамке: left −42 (в макете −34; −42 — снаружи рамки блока + 8, решение 19.11), top 0
//    (на мобильном — в строку справа сверху);
//  • клик по ⠿ — блок выделяется (selected) и открывается меню блока;
//  • нажать и тянуть ⠿ — перетаскивание (dragging): рамка 2 px и линия места.

import { h, smallButton, menuItem, icon, adminModalOpen } from './widgets.js';
import { styleTypes, blockAllowed, blockType, kindOf, blockCanConvert, convertBlocks, normalizeRoot, isEmptyBlock, emptyBlock, emptyStepItem } from '../core/blocks.js';
import { applyCodeMeta } from '../core/sanitize.js';
import { copyText } from '../core/clipboard.js';
import { defOf, objectSelector, isWrap, wrapSelector, isObjectBlock, inNarrowHost } from '../core/registry.js';
import { t } from '../core/i18n.js';

/**
 * Вид рамки слоя взаимодействия: у блока с outline (block.json, например линия) рамка рисуется обводкой вокруг элемента,
 * у остальных — подложкой ::after (ui/interaction.css). Признак ставится только на время выделения или перетаскивания.
 */
export function frameKind(block, on) {
  if (!block || block.nodeType !== 1) return;
  const def = defOf(block);
  if (on && def && def.outline) block.setAttribute('data-tedui-frame', 'outline');
  else block.removeAttribute('data-tedui-frame');
}
import { CODE_LANGS, normalizeLang } from '../core/highlight.js';
import { placeCaret, getRange } from '../core/selection.js';
import { isHost, rootBlockOf } from '../core/containers.js';

/** Блок лежит в теле контейнера (ответ аккордеона, вкладка, колонка). */
const inHostOf = (block) => !!(block && block.parentNode && isHost(block.parentNode));

/** Блок можно положить в тело контейнера: не контейнер и не запрещён внутри (block.json → inContainers: false). */
function hostAllows(block, host = null) {
  const def = defOf(block);
  if (def && host && def.inNarrow === false && inNarrowHost(host)) return false;   // широкий блок — не в колонку (22.11)
  return !(def && (def.inContainers === false || def.container));
}

const DRAG_START = 4; // px до начала перетаскивания

/** Кнопки и поля редактора, которые стоят у блока с курсором и едут вместе с ним при перетаскивании. */
const CARRY = '.ted-ui-addauthor.is-visible, .ted-ui-tableadd.is-visible, .ted-ui-tablectl.is-visible, .ted-ui-tablefill.is-visible, .ted-ui-itemctl.is-visible, .ted-ui-codehead.is-visible';

/** Подложка выделенного блока — 8 px вокруг него (решение 22.11, --ui-selected); окна блока встают от неё одинаково. */
const UNDERLAY = 8;

export class BlockHandle {
  constructor(editor) {
    this.editor = editor;
    this.canvas = editor.canvas;
    this.column = editor.column;
    this.root = editor.editable;
    this.hovered = null;
    this.focused = null;
    this.selected = null;
    this.drag = null;

    // наведение: «+» и ⠿
    this.addBtn = smallButton({ name: 'add', label: 'Добавить блок ниже', iconName: 'plus', flat: true, onClick: () => this.addBelow(this.hovered) });
    this.gutterGrip = smallButton({ name: 'grip', label: 'Меню блока, перетащить', iconName: 'grip', flat: true });
    this.gutter = h('div', { class: 'ted-ui-gutter' }, [this.addBtn, this.gutterGrip]);

    // правка: ⠿ и 🗑
    this.ctrlGrip = smallButton({ name: 'grip', label: 'Меню блока, перетащить', iconName: 'grip', flat: true });
    this.ctrlTrash = smallButton({ name: 'trash', label: 'Удалить блок', iconName: 'trash', flat: true, onClick: () => {
      if (Date.now() < (this.trashLock || 0)) return;   // сразу после удаления корзина следующего блока под курсором не срабатывает (проверка 22.11)
      // блок запомнен при нажатии: открытое окно блока («Настройки товара», «Ссылка»…) закрывается раньше щелчка, и выбранный
      // блок успевал сброситься — корзина ничего не удаляла (сайт texted 27.11, 1.0.4)
      const target = this.trashTarget && this.trashTarget.isConnected ? this.trashTarget : this.focused;
      this.trashTarget = null;
      this.remove(target);
    } });
    this.ctrlTrash.addEventListener('pointerdown', () => { this.trashTarget = this.focused; }, true);
    // якорь: кнопка видна только у блока с id; клик открывает окно «Якорь» (там можно изменить или удалить)
    this.ctrlAnchor = smallButton({ name: 'anchor', label: 'Якорь блока', iconName: 'anchor', flat: true, onClick: () => this.focused && this.editor.openAnchor(this.focused) });
    this.ctrlAnchor.hidden = true;
    this.controls = h('div', { class: 'ted-ui-controls' }, [this.ctrlGrip, this.ctrlTrash, this.ctrlAnchor]);


    // шаги: кнопки справа у активного шага (item-controls) и «Добавить шаг» под блоком
    this.itemGrip = smallButton({ name: 'item-grip', label: 'Перетащить', iconName: 'grip', flat: true });
    this.itemTrash = smallButton({ name: 'item-trash', label: 'Удалить', iconName: 'trash', flat: true, onClick: () => this.removeItem(this.item) });
    this.itemControls = h('div', { class: 'ted-ui-itemctl' }, [this.itemGrip, this.itemTrash]);
    this.itemGrip.addEventListener('contextmenu', (e) => e.preventDefault());
    this.itemGrip.addEventListener('pointerdown', (e) => this.onGripDown(e, () => this.item, this.itemGrip, { item: true }));
    this.item = null;
    // цитата: «Добавить автора» под блоком
    this.authorBtn = h('button', { type: 'button', class: 'ted-ui-addauthor' }, [icon('plus'), h('span', { text: 'Добавить автора' })]);
    this.authorBtn.addEventListener('mousedown', (e) => e.preventDefault());
    this.authorBtn.addEventListener('click', () => this.authorQuote && this.pickAuthor(this.authorQuote, this.authorBtn));
    this.authorQuote = null;
    // шапка блока кода: настоящие кнопки (язык, копирование) поверх нарисованной шапки — для клавиатуры, сенсора и скринридеров
    this.codeLang = h('button', { type: 'button', class: 'ted-ui-codebtn is-lang', 'aria-label': 'Язык кода', 'data-tip': 'Язык кода', 'data-keys': 'Mod+Alt+L' });   // подсказка — общая (Tooltip), не браузерная
    this.codeCopy = h('button', { type: 'button', class: 'ted-ui-codebtn is-copy', 'aria-label': 'Копировать код', 'data-tip': 'Копировать код', 'data-keys': 'Mod+Alt+C' });
    this.codeHead = h('div', { class: 'ted-ui-codehead', hidden: true }, [this.codeLang, this.codeCopy]);
    this.codePre = null;
    for (const b of [this.codeLang, this.codeCopy]) b.addEventListener('mousedown', (e) => e.preventDefault());
    this.codeLang.addEventListener('click', () => this.codePre && this.openLangMenu(this.codePre));
    this.codeCopy.addEventListener('click', () => this.codePre && this.copyText(this.codePre.textContent, 'Код скопирован', 'Не удалось скопировать код'));
    this.line = h('div', { class: 'ted-ui-drop', hidden: true });
    this.column.append(this.gutter, this.controls, this.itemControls, this.authorBtn, this.codeHead, this.line);

    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
    this.canvas.addEventListener('mouseleave', () => { if (!this.drag) this.hideGutter(); });
    for (const g of [this.gutterGrip, this.ctrlGrip]) g.addEventListener('contextmenu', (e) => e.preventDefault());
    this.gutterGrip.addEventListener('pointerdown', (e) => this.onGripDown(e, () => this.hovered, this.gutterGrip));
    this.ctrlGrip.addEventListener('pointerdown', (e) => this.onGripDown(e, () => this.focused, this.ctrlGrip));
    // скрытые кнопки блока и пунктов (шаги, таблица…) — к левому краю колонки: прозрачные, но со старым местом они раздвигали
    // страницу вбок, когда окно стало уже (1.0.2)
    this.onWinResize = () => {
      this.refresh();
      for (const el of this.column.querySelectorAll('.ted-ui-itemctl:not(.is-visible), .ted-ui-controls:not(.is-visible)')) { el.style.left = '0px'; el.style.right = ''; }
    };
    window.addEventListener('resize', this.onWinResize);
    // высота содержимого изменилась (раскрылся аккордеон, загрузилась картинка выше) — кнопки идут за блоком (22.11)
    // ResizeObserver и так вызывается раз в кадр, после раскладки; requestAnimationFrame не нужен (в фоновой вкладке он не срабатывает)
    this.ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.onLayout());
    this.ro?.observe(this.root);
  }

  /** Высота содержимого изменилась: кнопки и открытое окно — снова у своего блока. */
  onLayout() {
    if (this.drag || !this.root.isConnected) return;
    this.refresh();
    if (this.editor.popover.isOpen) this.editor.popover.place();   // окно у блока идёт за ним (выше раскрылся аккордеон)
  }

  blocks() {
    return Array.from(this.root.children);
  }

  // ---------- Наведение ----------

  /** Блок под курсором: полоса блока — от его верха до верха следующего (отступ между блоками снаружи блока, этап 0). */
  blockAtY(y) {
    const list = this.blocks();
    for (let i = 0; i < list.length; i++) {
      const r = list[i].getBoundingClientRect();
      const next = list[i + 1] ? list[i + 1].getBoundingClientRect().top : r.bottom + (parseFloat(getComputedStyle(list[i]).marginBottom) || 0);
      if (y >= r.top && y < Math.max(r.bottom, next)) return list[i];
    }
    return null;
  }

  /** Блок в теле контейнера под точкой (видимое тело, полоса блока по высоте), иначе null. */
  innerAt(top, x, y) {
    if (!top || !top.querySelector) return null;
    for (const host of top.querySelectorAll('.ted-ui-host')) {
      const hr = host.getBoundingClientRect();
      if (!hr.height || x < hr.left - 8 || x > hr.right + 8 || y < hr.top || y > hr.bottom) continue;
      const list = Array.from(host.children);
      for (let i = 0; i < list.length; i++) {
        const r = list[i].getBoundingClientRect();
        const next = list[i + 1] ? list[i + 1].getBoundingClientRect().top : r.bottom;
        if (y >= r.top && y < Math.max(r.bottom, next)) return list[i];
      }
    }
    return null;
  }

  /** Слева от внутреннего блока лежит соседняя колонка: кнопкам там места нет — они строкой над блоком справа. */
  noRoomLeft(block) {
    if (!inHostOf(block)) return false;
    const top = rootBlockOf(this.root, block);
    const br = block.getBoundingClientRect();
    return Array.from(top.querySelectorAll('.ted-ui-host')).some((h) => {
      if (h === block.parentNode) return false;
      const r = h.getBoundingClientRect();
      return r.height && r.right > br.left - 48 && r.left < br.left && r.bottom > br.top && r.top < br.bottom;
    });
  }

  onMove(e) {
    if (this.drag || this.editor.mode !== 'edit') return;
    if (this.gutter.contains(e.target)) return;
    // курсор на кнопках выбранного блока — ручка «+ ⠿» соседа, над которым он прошёл, не остаётся висеть (заказчик 19.11)
    if (this.controls.contains(e.target)) return this.hideGutter();
    const top = this.blockAtY(e.clientY);
    if (!top) return this.hideGutter();
    // в теле контейнера — ручка у внутреннего блока (решение 22.11); где места слева нет (вторая колонка) — у контейнера
    const inner = this.innerAt(top, e.clientX, e.clientY);
    this.showGutter(inner && !this.noRoomLeft(inner) ? inner : top);
  }

  showGutter(block) {
    if (block === this.focused || block === this.selected) return this.hideGutter();
    // ⠿ есть у любого блока, и у пустого — его тоже можно перетащить (решение заказчика 19.11)
    this.gutterGrip.hidden = false;
    this.hovered = block;
    const cr = this.column.getBoundingClientRect();
    const br = block.getBoundingClientRect();
    // ручка у верхнего края блока: кнопки 24 по центру первой строки текста (pt 4 у ручки)
    const cs = getComputedStyle(block);
    const textBlock = /^(P|H[2-6]|UL|OL)$/.test(block.tagName);
    const pt = textBlock ? parseFloat(cs.paddingTop) || 0 : 0;
    const lh = parseFloat(cs.lineHeight) || 24;
    const def = defOf(block);
    // блок из реестра с handleAt: 'middle' (линия): ручка по центру всей высоты блока
    const first = def && def.handleAt === 'middle' ? (parseFloat(cs.height) || 2) : Math.min(lh, br.height - pt);
    this.gutter.style.top = `${br.top - cr.top + pt + (first - 24) / 2 - 4}px`;
    // правый край ⠿ — в 12 от блока, как у рамки кнопок ⠿ 🗑 выбранного блока (заказчик 19.11)
    this.gutter.style.left = `${br.left - cr.left - (this.gutter.offsetWidth || 48) - 12}px`;
    this.gutter.classList.add('is-visible');
    // ручка соседа не ложится на кнопки выбранного блока (кнопки никогда не лежат на других кнопках)
    if (this.controls.classList.contains('is-visible')) {
      const g = this.gutter.getBoundingClientRect();
      const c = this.controls.getBoundingClientRect();
      if (g.left < c.right && g.right > c.left && g.top < c.bottom && g.bottom > c.top) this.hideGutter();
    }
  }

  hideGutter() {
    this.hovered = null;
    this.gutter.classList.remove('is-visible');
  }

  // ---------- Правка ----------

  setFocused(block) {
    if (block && !this.root.contains(block)) block = null;
    if (this.focused && this.focused !== block) this.focused.removeAttribute('data-tedui-focus');
    const changed = this.focused !== block;
    this.focused = block;
    if (!block || this.editor.mode !== 'edit') {
      this.controls.classList.remove('is-visible');
      return;
    }
    block.setAttribute('data-tedui-focus', '');
    // выбран другой блок (вставка, клавиатура) — «+ ⠿» соседа под мышью прячутся до следующего движения мыши: одна пара кнопок (проверка 22.11)
    if (this.hovered === block || changed) this.hideGutter();
    this.placeControls();
  }

  placeControls() {
    const block = this.focused;
    if (!block || !block.isConnected) return;
    const cr = this.column.getBoundingClientRect();
    const br = block.getBoundingClientRect();
    // то же условие, что у CSS (@container ted (width < 480px)): ширина редактора, а не колонки
    const mobile = this.editor.ui.clientWidth < 480 || this.noRoomLeft(block);   // во второй колонке — как на телефоне
    this.ctrlAnchor.hidden = !block.id;
    // узкий редактор: строка кнопок над блоком, над его рамкой (рамка — 8 вокруг блока), поверх — блок не сдвигается.
    // Одно правило для всех блоков (MODULAR_PLAN.md, этап 0)
    const lift = mobile ? (this.controls.offsetHeight || 30) + 10 : 0;
    this.controls.style.top = `${br.top - cr.top - lift}px`;
    // На мобильном группа расширяется влево, когда к ней добавляется кнопка якоря.
    this.controls.style.left = mobile ? '' : `${br.left - cr.left - 42}px`;   // −42: кнопки снаружи рамки (блок + 8), решение 19.11
    this.controls.style.right = mobile ? `${cr.right - br.right}px` : '';
    this.controls.classList.add('is-visible');
    // строка кнопок блока не ложится на ⠿ пункта (колонки, вкладки), который стоит там же: встаёт левее (проверка 22.11)
    if (mobile && this.itemControls.classList.contains('is-visible')) {
      const a = this.controls.getBoundingClientRect();
      const b = this.itemControls.getBoundingClientRect();
      if (a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
        this.controls.style.right = `${cr.right - b.left + 4}px`;
      }
    }
  }

  refresh() {
    this.syncItem();
    if (this.focused) this.placeControls();
    if (this.hovered && !this.drag) this.showGutter(this.hovered);
  }

  // ---------- Шаги: активный шаг и кнопки справа (ручка, корзина) ----------

  /** Синхронизация с курсором: у активного шага справа ручка и корзина. */
  /** Кнопки шапки показываем у блока кода, в котором стоит курсор. */
  syncCodeHead() {
    const ed = this.editor;
    const r = ed.mode === 'edit' && ed.isFocused() ? getRange(ed.editable) : null;
    const n = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode);
    const pre = n && n.closest ? n.closest('pre') : null;
    this.codePre = pre && ed.editable.contains(pre) && (pre.parentNode === ed.editable || pre.parentNode.classList.contains('ted-ui-host')) ? pre : null;
    if (!this.codePre) { this.codeHead.hidden = true; return; }
    const cr = this.column.getBoundingClientRect();
    const pr = this.codePre.getBoundingClientRect();
    const head = parseFloat(getComputedStyle(this.codePre, '::before').height) || 36;
    const u = head / 36;
    const padTop = parseFloat(getComputedStyle(this.codePre).paddingTop) || 0;   // узкий редактор: над шапкой строка кнопок блока
    Object.assign(this.codeHead.style, { top: `${pr.top - cr.top + padTop}px`, left: `${pr.left - cr.left}px`, width: `${pr.width}px`, height: `${head}px` });
    Object.assign(this.codeCopy.style, { width: `${24 * u}px`, height: `${24 * u}px`, right: `${6 * u}px`, top: `${6 * u}px` });
    Object.assign(this.codeLang.style, { right: `${36 * u}px` });
    this.codeHead.hidden = false;
  }

  syncItem() {
    this.syncAuthor();
    this.syncCodeHead();
    if (this.drag) return;   // при перетаскивании кнопки остаются у шага
    const ed = this.editor;
    const r = ed.mode === 'edit' && ed.isFocused() ? getRange(ed.editable) : null;
    // пункт, выбранный нажатием (глава содержания: курсора в ней нет) — кнопки ⠿ 🗑 у него (editorUi → selectedItem)
    const li = (r ? ed.listItem(r.startContainer) : null) || ed.blockUis.map((u) => (u.selectedItem ? u.selectedItem() : null)).find(Boolean) || null;
    if (this.item && this.item !== li) this.item.removeAttribute('data-tedui-item');
    this.item = li;
    if (!li) {
      this.itemControls.classList.remove('is-visible');
      return;
    }
    li.setAttribute('data-tedui-item', '');
    this.placeItemControls();
  }

  /** Снять глобальные слушатели и прервать перетаскивание — вызывается при уничтожении редактора. */
  destroy() {
    window.removeEventListener('resize', this.onWinResize);
    this.ro?.disconnect();
    if (this.drag) this.endDrag(true);
    this.item = null;
  }

  /** Кнопки у элемента (шаг, плитка, пункт): положение зависит от вида блока. */
  placeItemControls() {
    const li = this.item;
    if (!li || !li.isConnected) return;
    // у ключевых цифр меньше двух плиток не бывает: корзина не нужна
    // у цифр меньше двух плиток не бывает, карточки плюсов и минусов только меняются местами — корзина не нужна
    this.itemTrash.hidden = (li.parentNode.classList.contains('ted-facts') && li.parentNode.children.length <= 2) || (li.parentNode.classList.contains('ted-proscons') && li.parentNode.children.length <= 2)
      || !!(itemOwner(this.editor, li)?.canRemove && !itemOwner(this.editor, li).canRemove(li));   // колонок не меньше двух
    const cr = this.column.getBoundingClientRect();
    const lr = li.getBoundingClientRect();
    // кнопки справа от блока, чтобы не закрывать текст; если места нет (узкий экран) — в правом верхнем углу элемента
    const block = li.closest('.ted-ui-editable > *');
    const br = block ? block.getBoundingClientRect() : lr;
    const w = this.itemControls.offsetWidth;
    const room = this.column.getBoundingClientRect().right - br.right;
    const outside = this.editor.ui.getBoundingClientRect().right - br.right >= w + 12;
    // плитки цифр и карточки плюсов-минусов: кнопки рядом с карточкой — над её правым верхним углом
    const nearCard = li.parentNode.classList.contains('ted-facts') || li.parentNode.classList.contains('ted-proscons');
    // пункт плюсов и минусов: кнопки у правого края своей карточки, в строке пункта
    const prosCard = !nearCard && li.closest('ul.ted-proscons > li');
    if (prosCard) {
      const pr = prosCard.getBoundingClientRect();
      this.itemControls.dataset.place = 'inside';
      this.itemControls.style.top = `${lr.top - cr.top + (lr.height - this.itemControls.offsetHeight) / 2}px`;
      // кнопки правее своей карточки (можно поверх соседней): текст, с которым работают, остаётся виден
      const fits = this.editor.ui.getBoundingClientRect().right - pr.right >= w + 8;
      this.itemControls.style.left = `${fits ? pr.right - cr.left + 4 : pr.right - cr.left - w - 8}px`;
      this.itemControls.classList.add('is-visible');
      return;
    }
    // узкий редактор: над карточкой стоит строка кнопок блока — кнопки карточки в её правом верхнем углу, внутри
    if (nearCard && this.editor.ui.clientWidth < 480) {
      this.itemControls.dataset.place = 'corner';
      this.itemControls.style.top = `${lr.top - cr.top + 8}px`;
      this.itemControls.style.left = `${lr.right - cr.left - w - 8}px`;
      this.itemControls.classList.add('is-visible');
      return;
    }
    // вопрос аккордеона: кнопки на уровне строки вопроса (центр строки), справа от блока; на узком экране — над шевроном
    // пункт блока с кнопками внутри строки (глава содержания: справа, внутри панели — макет block-navigation, edit)
    if (itemOwner(this.editor, li)?.itemInside) {
      const pr = li.parentNode.getBoundingClientRect();
      const hgt = this.itemControls.offsetHeight || 24;
      this.itemControls.dataset.place = 'inside';
      this.itemControls.style.top = `${lr.top - cr.top + (lr.height - hgt) / 2}px`;
      this.itemControls.style.left = `${pr.right - cr.left - w}px`;
      this.itemControls.classList.add('is-visible');
      return;
    }
    // пункт с кнопками над ним — у правого края, на узком экране не на кнопках блока: вкладка — над названием (как кнопки столбца
    // таблицы), колонка — над правым верхним углом (как у карточек цифр; в углу колонки картинка со своими кнопками)
    const above = itemOwner(this.editor, li)?.itemAbove;
    if (above) {
      let left = lr.right - w;
      if (this.editor.ui.clientWidth < 480) { const bw = this.controls.offsetWidth || 56; left = Math.min(left, br.right - bw - 8 - w); }
      left = Math.max(left, br.left);
      this.itemControls.dataset.place = typeof above === 'string' ? above : 'above';
      this.itemControls.style.top = `${lr.top - cr.top - 28}px`;
      this.itemControls.style.left = `${left - cr.left}px`;
      this.itemControls.classList.add('is-visible');
      return;
    }
    const accQ = itemOwner(this.editor, li)?.itemRow?.(li) || null;   // строка пункта (вопрос аккордеона) — кнопки на её уровне
    if (accQ) {
      const qr = accQ.getBoundingClientRect();
      const hgt = this.itemControls.offsetHeight || 24;
      this.itemControls.dataset.place = outside ? 'outside' : 'corner';
      this.itemControls.style.top = `${qr.top - cr.top + (qr.height - hgt) / 2}px`;
      this.itemControls.style.left = outside ? `${br.right - cr.left + 8}px` : `${qr.right - cr.left - w - 36}px`;
      this.itemControls.classList.add('is-visible');
      return;
    }
    this.itemControls.dataset.place = nearCard ? 'card' : (outside ? 'outside' : 'corner');
    this.itemControls.style.top = `${lr.top - cr.top - (nearCard ? 28 : 0)}px`;
    this.itemControls.style.left = nearCard ? `${lr.right - cr.left - w}px` : (outside ? `${br.right - cr.left + 8}px` : `${lr.right - cr.left - w}px`);
    void room;
    this.itemControls.classList.add('is-visible');
  }

  removeItem(li) {
    const ed = this.editor;
    if (!li || !li.isConnected) return;
    const ol = li.parentNode;
    const facts = ol.classList.contains('ted-facts');
    const inPros = !!ol.closest('ul.ted-proscons');
    const owner = itemOwner(ed, li);   // пункт блока из реестра (глава содержания)
    if (owner && owner.canRemove && !owner.canRemove(li)) return;   // меньше двух колонок не бывает
    if ((facts && ol.children.length <= 2) || (ol.classList.contains('ted-proscons') && ol.children.length <= 2)) return;   // меньше двух плиток не бывает; карточки плюсов и минусов не удаляются
    ed.history.commit();
    const next = li.nextElementSibling || li.previousElementSibling;
    if (inPros && !next) {
      // последний пункт карточки не удаляем, а очищаем
      li.replaceChildren(document.createElement('br'));
      this.item = null;
      placeCaret(li, true);
      ed.afterChange({ immediate: true });
      return;
    }
    li.remove();
    if (owner && owner.itemRemoved) owner.itemRemoved(li, ol);   // вкладка — вместе со своим содержимым; у колонок — класс их числа
    this.item = null;
    if (owner && owner.afterItemRemove) { owner.afterItemRemove(); return; }   // блок остаётся и без пунктов (главы добавляют кнопкой)
    if (!next) {
      const p = emptyBlock(document);
      (owner && owner.blockOfItems ? owner.blockOfItems(ol) : ol).replaceWith(p);   // последняя вкладка — вместе с блоком
      normalizeRoot(this.root);
      placeCaret(p);
    } else {
      const parent = next.parentNode;
      if (parent.classList.contains('ted-steps') || parent.classList.contains('ted-facts')) ed.caretToStepTitleEnd(next);
      else if (owner && owner.itemCaret) placeCaret(owner.itemCaret(next), true);   // вопрос аккордеона, первая строка колонки
      else placeCaret(next, true);
    }
    ed.afterChange({ immediate: true });
    ed.toast(ol.classList.contains('ted-checklist') ? 'Пункт удалён' : facts ? 'Плитка удалена' : inPros ? 'Пункт удалён' : owner && owner.removedToast ? owner.removedToast : 'Шаг удалён', { undo: true });
  }

  // ---------- Блок кода: выбор языка ----------

  /** Язык блока кода: автоопределение, список или свой (вписать). */
  openLangMenu(pre) {
    const ed = this.editor;
    ed.tooltip.hide();
    const cur = pre.hasAttribute('data-tedui-auto') ? '' : (pre.getAttribute('data-lang') || '');
    const apply = (lang) => {
      ed.history.commit();
      const code = pre.querySelector(':scope > code');
      const nums = !pre.hasAttribute('data-nonums');
      if (lang) { pre.removeAttribute('data-tedui-auto'); applyCodeMeta(pre, lang, nums); } else { pre.setAttribute('data-tedui-auto', ''); applyCodeMeta(pre, '', nums); }
      ed.popover.close();
      ed.afterChange({ immediate: true });
    };
    const input = h('input', { class: 'ted-ui-input', type: 'text', placeholder: 'Свой язык, например ruby', 'aria-label': 'Свой язык' });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); const v = normalizeLang(input.value); if (v) apply(v); }
      if (e.key === 'Escape') ed.popover.close();
    });
    const items = [
      menuItem({ value: 'auto', label: 'Определить автоматически', iconName: 'magic', active: !cur, onSelect: () => apply('') }),
      h('div', { class: 'ted-ui-pop__line' }),
      ...CODE_LANGS.map((l) => menuItem({ value: l.id, label: l.label, active: l.id === cur, onSelect: () => apply(l.id) })),
      h('div', { class: 'ted-ui-pop__line' }),
      h('div', { class: 'ted-ui-pop__field' }, [input]),
    ];
    const anchor = { getBoundingClientRect() { const r = pre.getBoundingClientRect(); return { left: r.left + 16, right: r.left + 16, top: r.top, bottom: r.top + 36, width: 0 }; } };
    ed.popover.open(items, anchor, { cls: 'ted-ui-pop--text' });
  }

  // ---------- Автор цитаты: кнопка под цитатой ----------

  /** Кнопка «Добавить автора» под цитатой, пока в ней курсор и автора ещё нет. */
  syncAuthor() {
    const ed = this.editor;
    const r = ed.mode === 'edit' && ed.isFocused() ? getRange(ed.editable) : null;
    const q = r && !this.drag ? ed.quoteBlock(r.startContainer) : null;
    const show = q && !q.querySelector(':scope > p.ted-author') ? q : null;
    for (const x of this.root.querySelectorAll('blockquote[data-tedui-qbtn]')) if (x !== show) x.removeAttribute('data-tedui-qbtn');
    this.authorQuote = show;
    if (!show) { this.authorBtn.classList.remove('is-visible'); return; }
    show.setAttribute('data-tedui-qbtn', '');
    const cr = this.column.getBoundingClientRect();
    const qr = show.getBoundingClientRect();
    this.authorBtn.style.top = `${qr.bottom - cr.top + 20}px`;
    this.authorBtn.style.left = `${qr.left - cr.left}px`;
    this.authorBtn.classList.add('is-visible');
  }

  /** Добавить автора: если сайт передал список авторов (опция authors) — выбрать из него или ввести вручную. */
  async pickAuthor(quote, anchorEl) {
    const ed = this.editor;
    ed.popover.close();
    const list = await ed.loadAuthors('');
    if (!list || !list.length) { ed.addAuthor(quote); return; }
    const items = [
      ...list.slice(0, 12).map((a) => menuItem({
        value: String(a.id ?? a.name), label: a.role ? `${a.name} — ${a.role}` : a.name, iconName: 'edit',
        onSelect: () => { ed.popover.close(); ed.addAuthor(quote, a); },
      })),
      h('div', { class: 'ted-ui-pop__line' }),
      menuItem({ value: 'manual', label: 'Ввести вручную', iconName: 'edit', onSelect: () => { ed.popover.close(); ed.addAuthor(quote); } }),
    ];
    ed.popover.open(items, anchorEl || this.authorBtn, { cls: 'ted-ui-pop--text' });
  }

  // ---------- Выделение и меню блока ----------

  select(block) {
    if (this.selected && this.selected !== block) { this.selected.removeAttribute('data-tedui-selected'); frameKind(this.selected, false); }
    this.selected = block || null;
    if (block) { block.setAttribute('data-tedui-selected', ''); frameKind(block, true); }
  }

  openMenu(block, anchorBtn) {
    const ed = this.editor;
    if (!block) return;
    ed.tooltip.hide();
    this.select(block);
    this.hideGutter();
    const type = blockType(block);
    // «Превратить в…» — только у блоков, которые можно превратить в другой вид (признак в общем списке блоков)
    const canConvert = blockCanConvert(block);   // признак — в общем списке блоков (convert: false)
    const items = [
      // у медиа, линии и HTML-блока превращать не во что: пункт не показываем, чтобы не было «мёртвой» кнопки
      ...(canConvert ? [menuItem({ value: 'convert', label: 'Превратить в…', iconName: 'type', submenu: true, onSelect: (v, el) => this.openConvert(block, el) })] : []),
      ...this.extraItems(block),
      menuItem({ value: 'duplicate', label: 'Дублировать', iconName: 'copy', onSelect: () => { ed.popover.close(); this.duplicate(block); } }),
      // в начало / в конец своего уровня (статьи или тела контейнера); у крайнего блока пункта нет (заказчик 22.11)
      block.previousElementSibling ? menuItem({ value: 'to-top', label: 'Отправить в начало', iconName: 'to-top', onSelect: () => { ed.popover.close(); this.moveToEdge(block, 'start'); } }) : null,
      block.nextElementSibling ? menuItem({ value: 'to-bottom', label: 'Отправить в конец', iconName: 'to-bottom', onSelect: () => { ed.popover.close(); this.moveToEdge(block, 'end'); } }) : null,
      menuItem({ value: 'link', label: 'Копировать ссылку', iconName: 'link', onSelect: () => { ed.popover.close(); this.copyLink(block, anchorBtn); } }),
      block.id ? menuItem({ value: 'unanchor', label: 'Удалить якорь', iconName: 'anchor', onSelect: () => { ed.popover.close(); this.removeAnchor(block); } }) : null,
      h('div', { class: 'ted-ui-pop__line' }),
      menuItem({ value: 'delete', label: 'Удалить', iconName: 'trash-danger', danger: true, onSelect: () => { ed.popover.close(); this.remove(block); } }),
    ].filter(Boolean);
    // единое правило для всех блоков (проверка 22.11): подложка выделения — 8 px вокруг блока, уголок окна — ещё на 8 ниже неё,
    // левый край окна — по левому краю подложки (раньше у кода, у блоков с обводкой расчёт давал другое место)
    const anchor = {
      getBoundingClientRect() {
        const rect = block.getBoundingClientRect();
        const left = rect.left - UNDERLAY;
        // Popover добавляет ещё 4 px от якоря до уголка
        return { left, right: left, top: rect.top, bottom: rect.bottom + UNDERLAY + 4, width: 0 };
      },
    };
    ed.popover.open(items, anchor, {
      cls: 'ted-ui-pop--block',
      anchorX: (rect) => rect.left + 28,
      keyHandler: (e) => {
        if (e.key === 'Delete') {
          e.preventDefault();
          e.stopPropagation();
          ed.popover.close();
          this.remove(block);
        } else if (this.drill && (e.key === 'ArrowLeft' || e.key === 'Backspace')) {
          e.preventDefault();
          e.stopPropagation();
          this.drill.back();
        } else {
          ed.popover.menuKeys(e);
        }
      },
      onClose: () => { this.select(null); this.drill = null; this.menuBlock = null; },
    });
    ed.popover.el.setAttribute('role', 'menu');   // для программ чтения с экрана — как «Ещё» (проверка доступности 22.11)
    ed.popover.el.setAttribute('aria-label', t('Меню блока'));
    this.menuBlock = block;
  }

  /**
   * «Превратить в…»: где рядом есть место (редактор ≥ 640 px) — боковое меню справа;
   * в узком контейнере и на мобильном — замена содержимого той же панели
   * со строкой «‹ Превратить в…» для возврата (панель не растёт вниз).
   */
  openConvert(block, itemEl) {
    const ed = this.editor;
    const type = blockType(block);
    const pick = (to) => {
      ed.popover.close();
      ed.history.commit();
      convertBlocks(this.root, [block], to);
      normalizeRoot(this.root);
      ed.afterChange({ immediate: true });
      if (to !== type) ed.toast('Тип блока изменён', { undo: true });
    };
    const types = () => styleTypes().filter((b) => blockAllowed(ed.allowedBlocks, b.type)).map((b) => menuItem({
      value: b.type, label: b.label, iconName: b.icon, active: b.type === type, onSelect: () => pick(b.type),
    }));

    this.openSub('Превратить в…', types, itemEl);
  }

  /** Пункты меню, зависящие от вида блока: автор цитаты, язык и номера строк кода. */
  extraItems(block) {
    const ed = this.editor;
    const done = (msg) => { ed.popover.close(); ed.afterChange({ immediate: true }); if (msg) ed.toast(msg, { undo: true }); };
    if (defOf(block) && defOf(block).type === 'blockquote') {
      const author = block.querySelector(':scope > p.ted-author');
      return [
        menuItem({
          value: 'author', label: author ? 'Убрать автора' : 'Добавить автора', iconName: 'edit',
          onSelect: (v, el) => {
            if (author) { ed.popover.close(); ed.removeAuthor(block); return; }
            this.pickAuthor(block, el);
          },
        }),
      ];
    }
    const own = defOf(block);   // свои пункты меню блока из реестра (таблица — «Шапка», «Границы»)
    if (own && own.blockMenu) return own.blockMenu(ed, block, done);
    if (block.tagName === 'PRE') {
      const code = block.querySelector(':scope > code');
      const hasNums = !block.hasAttribute('data-nonums');
      return [
        menuItem({
          value: 'lang', label: 'Язык кода…', iconName: 'code-block', submenu: true,
          onSelect: () => { ed.popover.close(); this.openLangMenu(block); },
        }),
        menuItem({
          value: 'nums', label: hasNums ? 'Скрыть номера строк' : 'Показать номера строк', iconName: 'list',
          onSelect: () => {
            ed.history.commit();
            applyCodeMeta(block, block.getAttribute('data-lang'), !hasNums);
            done();
          },
        }),
        menuItem({
          value: 'copycode', label: 'Копировать код', iconName: 'copy',
          onSelect: () => { ed.popover.close(); this.copyText(block.textContent, 'Код скопирован', 'Не удалось скопировать код'); },
        }),
      ];
    }
    return [];
  }

  /** Подменю: справа от пункта (широкий редактор) или с заменой меню и кнопкой «назад» (узкий). */
  openSub(title, makeItems, itemEl) {
    const ed = this.editor;
    if (ed.ui.clientWidth >= 640 && ed.subPopover) {
      ed.subPopover.open(makeItems(), itemEl, { cls: 'ted-ui-pop--text ted-ui-pop--side', side: 'right' });
      return;
    }

    const pop = ed.popover;
    const box = pop.box;
    const el = pop.el;
    const saved = Array.from(box.childNodes);
    const back = () => {
      if (!this.drill) return;
      this.drill = null;
      box.replaceChildren(...saved);
      el.classList.replace('ted-ui-pop--text', 'ted-ui-pop--block');
      pop.place();
    };
    const head = menuItem({ value: 'back', label: title, iconName: 'chevron-left', onSelect: back });
    head.classList.add('ted-ui-item--back');
    box.replaceChildren(head, h('div', { class: 'ted-ui-pop__line' }), ...makeItems());
    el.classList.replace('ted-ui-pop--block', 'ted-ui-pop--text');
    this.drill = { back };
    pop.place();
  }

  // ---------- Действия ----------

  addBelow(block) {
    const ed = this.editor;
    if (!block) return;
    ed.history.commit();
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    block.after(p);
    placeCaret(p);
    ed.afterChange({ immediate: true });
    ed.blockMenu.openInsert(this.addBtn, p);
  }

  /** Блок на одно место выше (-1) или ниже (1) на своём уровне — с клавиатуры (Ctrl+Shift+↑/↓); курсор остаётся в блоке. */
  moveBy(block, step) {
    const ed = this.editor;
    const sib = step < 0 ? block.previousElementSibling : block.nextElementSibling;
    if (!sib) return;
    const r = getRange(this.root);
    // место курсора — числами: живой Range при переносе узла сбрасывается на родителя
    const keep = r && block.contains(r.startContainer) ? { node: r.startContainer, offset: r.startOffset } : null;
    ed.history.commit();
    if (step < 0) sib.before(block); else sib.after(block);
    normalizeRoot(this.root);
    if (keep && keep.node.isConnected) {
      const nr = document.createRange();
      nr.setStart(keep.node, Math.min(keep.offset, keep.node.nodeType === 3 ? keep.node.length : keep.node.childNodes.length));
      nr.collapse(true);
      const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(nr);
    }
    ed.afterChange({ immediate: true });
    block.scrollIntoView({ block: 'nearest' });
  }

  /** Блок — первым или последним на своём уровне (в статье или в теле контейнера); Undo возвращает. */
  moveToEdge(block, edge) {
    const ed = this.editor;
    const parent = block.parentNode;
    if (!parent) return;
    ed.history.commit();
    if (edge === 'start') parent.insertBefore(block, parent.firstElementChild);
    else parent.appendChild(block);
    normalizeRoot(this.root);
    const object = block.getAttribute('contenteditable') === 'false' || isWrap(block) || isObjectBlock(block);
    ed.afterChange({ immediate: true, focus: object ? null : block });
    if (object && block.isConnected) { ed.selectObject(block); ed.updateState(); }
    block.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    ed.toast(edge === 'start' ? 'Блок перенесён в начало' : 'Блок перенесён в конец', { undo: true });
  }

  duplicate(block) {
    const ed = this.editor;
    ed.history.commit();
    const copy = block.cloneNode(true);
    // служебные поля правки (поле ссылки пустого встраивания, iFrame) — без обработчиков в копии: их соберут заново
    for (const el of copy.querySelectorAll('[data-tedui-m]')) el.remove();
    for (const el of [copy, ...copy.querySelectorAll('*')]) {
      for (const a of Array.from(el.attributes)) if ((a.name.startsWith('data-tedui-') && a.name !== 'data-tedui-empty') || a.name === 'id') el.removeAttribute(a.name);
    }
    block.after(copy);
    // нередактируемый блок (карточка, товар, фрейм, медиа): курсор в него не встаёт — кнопки блока держим выделением
    const object = copy.getAttribute('contenteditable') === 'false' || isWrap(copy);
    ed.afterChange({ immediate: true, focus: object ? null : copy });
    if (object && copy.isConnected) { ed.selectObject(copy); ed.updateState(); }
    ed.toast('Блок продублирован', { undo: true });
  }

  /**
   * Ссылка на блок = адрес страницы + #id блока. id создаётся из текста блока при первом
   * копировании и сохраняется в HTML (<h2 id="...">), на сайте работает как якорь.
   * Адрес страницы берётся из опции pageUrl (в админке это адрес публичной страницы,
   * а не админки), по умолчанию — адрес текущей страницы.
   */
  copyLink(block) {
    const ed = this.editor;
    if (!block.id) {
      ed.history.commit();
      block.id = uniqueId(this.root, slugify(block.textContent) || 'block');
      ed.afterChange({ immediate: true });
    }
    this.copyText(this.urlFor(block, block.id));
  }

  /** Убрать якорь блока (id); ссылки на него перестанут работать, поэтому «Отменить» в тосте. */
  removeAnchor(block) {
    const ed = this.editor;
    if (!block || !block.id) return;
    ed.history.commit();
    block.removeAttribute('id');
    ed.afterChange({ immediate: true });
    this.placeControls();
    ed.toast('Якорь удалён', { undo: true });
  }
  /** Адрес страницы + #id (pageUrl задаёт публичный адрес страницы). */
  urlFor(block, id) {
    const opt = this.editor.options.pageUrl;
    const base = String((typeof opt === 'function' ? opt(block) : opt) || location.href).split('#')[0];
    return `${base}#${id}`;
  }

  /** Копирует текст в буфер обмена (core/clipboard.js: без https — запасной способ сразу при нажатии) и говорит, вышло ли. */
  copyText(text, okMsg = 'Ссылка скопирована', failMsg = 'Не удалось скопировать ссылку') {
    const ed = this.editor;
    copyText(text).then((ok) => { ed.toast(ok ? okMsg : failMsg, ok ? {} : { status: 'error' }); });
  }

  remove(block) {
    const ed = this.editor;
    if (!block || !block.isConnected) return;
    const wasEmpty = isEmptyBlock(block);
    // единственный пустой блок удалять нечего: остаётся он сам с заглушкой «Введите «/»…»
    if (wasEmpty && block.parentNode.children.length === 1) {
      this.hideGutter();
      placeCaret(block);
      ed.afterChange({ record: false });
      return;
    }
    this.hideGutter();
    if (ed.popover.isOpen) ed.popover.close();   // окно удаляемого блока («Настройки товара»…) — вместе с ним
    ed.history.commit();
    let next = block.nextElementSibling || block.previousElementSibling;
    block.remove();
    normalizeRoot(this.root);   // если блоков не осталось — появится пустой абзац с заглушкой
    if (!next || !next.isConnected) next = this.root.firstElementChild;
    this.setFocused(null);
    this.trashLock = Date.now() + 600;   // двойной клик по корзине не удаляет и следующий блок
    ed.afterChange({ immediate: true, focus: next });
    if (!wasEmpty) ed.toast('Блок удалён', { undo: true });
  }

  // ---------- Перетаскивание ----------

  onGripDown(e, getBlock, btn, opts = {}) {
    const block = getBlock();
    if (!block || e.button !== 0) return;
    e.preventDefault();
    // меню этого блока уже открыто — клик по ⠿ его закрывает (pointerdown раньше mousedown, который закроет панели)
    const wasOpen = this.menuBlock === block && this.editor.popover.isOpen;
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    let done = false;
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* захват не обязателен */ }

    const move = (ev) => {
      // кнопку отпустили вне окна или вкладки, а pointerup не пришёл — завершаем перетаскивание
      if (ev.buttons === 0 && ev.pointerType === 'mouse') return finish(false);
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > DRAG_START) {
        dragging = true;
        this.startDrag(block, start.y, opts.item ? (opts.siblings ? opts.siblings() : Array.from(block.parentNode.children)) : null, start.x);
        if (opts.onDrop && this.drag) this.drag.onDrop = opts.onDrop;   // свой способ применить новый порядок (галерея перерисовывается по состоянию)
      }
      if (dragging) this.onDrag(ev);
    };
    const finish = (cancelled) => {
      if (done) return;
      done = true;
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', cancel);
      btn.removeEventListener('lostpointercapture', cancel);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('keydown', key, true);
      try { btn.releasePointerCapture(e.pointerId); } catch (err) { /* уже снят */ }
      if (dragging) this.endDrag(cancelled);
      else if (cancelled) return;
      else if (wasOpen) this.editor.popover.close();   // preventDefault у pointerdown отменяет mousedown — «клик снаружи» не сработает
      else if (!opts.item) this.openMenu(block, btn);
    };
    const up = () => finish(false);
    const cancel = () => finish(true);
    const key = (ev) => { if (ev.key === 'Escape' && !adminModalOpen()) { ev.preventDefault(); ev.stopPropagation(); finish(true); } };
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', cancel);
    btn.addEventListener('lostpointercapture', cancel);
    window.addEventListener('pointerup', up);
    window.addEventListener('blur', cancel);
    document.addEventListener('keydown', key, true);
  }

  /**
   * Перетаскивание: блок следует за курсором, а блоки между старым и новым местом
   * плавно сдвигаются на его высоту — видно, куда он встанет и что подвинется.
   * При отпускании сдвиги снимаются, а DOM переставляется в том же кадре (без скачка).
   */
  startDrag(block, startY, siblings = null, startX = null) {
    const ed = this.editor;
    const blocks = siblings || Array.from(block.parentNode.children);
    const sy = window.scrollY;
    const rects = blocks.map((b) => b.getBoundingClientRect());
    const tops = rects.map((r) => r.top + sy);
    const slots = blocks.map((b, i) => (i < blocks.length - 1
      ? tops[i + 1] - tops[i]
      : rects[i].height + (parseFloat(getComputedStyle(b).marginBottom) || 0)));
    const centers = rects.map((r) => r.top + sy + r.height / 2);
    const index = blocks.indexOf(block);
    const heights = rects.map((r) => r.height);
    this.drag = { block, parent: block.parentNode, blocks, index, tops, slots, heights, centers, startY: (startY ?? rects[index].top) + sy, target: index, shifts: blocks.map(() => 0) };
    // окно закрывается, когда перетаскивание уже началось: кнопки выбранного пункта (глава содержания) не пропадают (22.11)
    ed.popover.close();
    ed.tooltip.hide();
    // плитки в сетке (ключевые цифры) переносятся и по горизонтали, и по вертикали
    if (siblings && getComputedStyle(block.parentNode).display === 'grid') {
      const sx = window.scrollX;
      this.drag.grid = true;
      this.drag.cells = rects.map((r) => ({ x: r.left + sx, y: r.top + sy, w: r.width, h: r.height }));
      this.drag.startX = (startX ?? rects[index].left) + sx;
    }
    // ручка «+ ⠿» другого блока (курсор прошёл над ним по пути к ⠿) не остаётся на старом месте, пока блоки сдвигаются
    if (this.hovered !== block) this.hideGutter();
    block.setAttribute('data-tedui-drag', '');
    frameKind(block, true);
    ed.ui.classList.add('is-dragging');
    this.drag.itemMode = !!siblings;
    // кнопки выбранного блока (⠿ 🗑, строки и столбцы таблицы, «Добавить …», шапка кода, кнопки пункта) всегда там же, где блок:
    // тащат его — едут за пальцем; тащат другой блок и выбранный отодвигается — плавно отодвигаются вместе с ним (заказчик 18–19.11)
    this.drag.carry = [];
    this.drag.focusIndex = -1;
    if (!siblings && this.focused && blocks.includes(this.focused)) {
      this.drag.focusIndex = blocks.indexOf(this.focused);
      this.drag.carry = [this.controls, ...ed.ui.querySelectorAll(CARRY)].filter((el, k, all) => all.indexOf(el) === k && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => ({ el, transform: el.style.transform, transition: el.style.transition }));
      ed.ui.classList.add('is-carrying');
    }
    // тащат пункт (главу, шаг, колонку) — кнопки блока ⠿ 🗑 остаются на месте: блок не двигается (решение 22.11)
    this.line.hidden = true;
    this.drag.startX = this.drag.startX ?? (startX ?? rects[index].left) + window.scrollX;
    this.drag.cross = null;
  }

  /**
   * Куда положить блок, если курсор ушёл из его родителя (решение 22.11: внутренние блоки переносятся между контейнерами
   * и наружу, блоки документа — в тело контейнера): тело контейнера под курсором или корень. null — свой родитель (сдвиги).
   */
  crossTarget(x, y) {
    const d = this.drag;
    const block = d.block;
    let parent = this.root;
    for (const host of this.root.querySelectorAll('.ted-ui-host')) {
      if (block.contains(host)) continue;
      const r = host.getBoundingClientRect();
      if (!r.height || x < r.left || x > r.right || y < r.top - 4 || y > r.bottom + 4) continue;
      if (hostAllows(block, host)) parent = host;
      break;
    }
    if (parent === d.parent) return null;
    const kids = Array.from(parent.children).filter((c) => c !== block && !c.contains(block));
    let before = null;
    for (const c of kids) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = c; break; }
    }
    // в корне нельзя встать внутрь контейнера: место — до или после контейнера, в котором курсор
    return { parent, before };
  }

  /** Линия места вставки: на границе между блоками родителя. */
  showLine(t) {
    const cr = this.column.getBoundingClientRect();
    const pr = t.parent === this.root ? this.root.getBoundingClientRect() : t.parent.getBoundingClientRect();
    const kids = Array.from(t.parent.children).filter((c) => c !== this.drag.block);
    let y;
    if (t.before) {
      const r = t.before.getBoundingClientRect();
      const prev = t.before.previousElementSibling && t.before.previousElementSibling !== this.drag.block ? t.before.previousElementSibling.getBoundingClientRect() : null;
      y = prev ? (prev.bottom + r.top) / 2 : r.top - 4;
    } else {
      const last = kids[kids.length - 1];
      y = last ? last.getBoundingClientRect().bottom + 4 : pr.top + 4;
    }
    Object.assign(this.line.style, { top: `${y - cr.top - 1}px`, left: `${pr.left - cr.left}px`, width: `${pr.width}px` });
    this.line.hidden = false;
  }

  onDrag(e) {
    const d = this.drag;
    if (!d) return;
    d.lastEvent = e;
    const sy = window.scrollY;
    if (d.grid) {
      const sx = window.scrollX;
      const i0 = d.index;
      const c0 = d.cells[i0];
      // плитка идёт за курсором, но не выходит за края сетки блока (заказчик 27.11: уносилась за края)
      const box = d.cells.reduce((b, c) => ({ l: Math.min(b.l, c.x), t: Math.min(b.t, c.y), r: Math.max(b.r, c.x + c.w), b: Math.max(b.b, c.y + c.h) }), { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
      const gx = Math.max(box.l - c0.x, Math.min(box.r - c0.x - c0.w, e.clientX + sx - d.startX));
      const gy = Math.max(box.t - c0.y, Math.min(box.b - c0.y - c0.h, e.clientY + sy - d.startY));
      d.block.style.transform = `translate(${gx}px, ${gy}px)`;
      // новое место — ячейка под курсором (или ближайшая по центру)
      const px = e.clientX + sx;
      const py = e.clientY + sy;
      let t = i0;
      let best = Infinity;
      d.cells.forEach((c, j) => {
        const dist = Math.hypot(px - (c.x + c.w / 2), py - (c.y + c.h / 2));
        if (dist < best) { best = dist; t = j; }
      });
      d.target = t;
      d.blocks.forEach((b, j) => {
        if (j === i0) return;
        let p = j;
        if (t > i0 && j > i0 && j <= t) p = j - 1;
        else if (t < i0 && j >= t && j < i0) p = j + 1;
        const dx = d.cells[p].x - d.cells[j].x;
        const dy = d.cells[p].y - d.cells[j].y;
        b.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
      });
      const edge = e.clientY < 60 ? -12 : e.clientY > window.innerHeight - 60 ? 12 : 0;
      if (edge) {
        window.scrollBy(0, edge);
        requestAnimationFrame(() => { if (this.drag === d) this.onDrag(d.lastEvent); });
      }
      if (this.item === d.block) this.placeItemControls();
      return;
    }
    if (!d.itemMode) {
      const cross = this.crossTarget(e.clientX, e.clientY);
      if (cross) {
        // курсор над другим родителем: соседи на местах, блок идёт за курсором, линия показывает место
        d.cross = cross;
        for (let j = 0; j < d.blocks.length; j++) if (d.shifts[j]) { d.shifts[j] = 0; d.blocks[j].style.transform = ''; }
        d.target = d.index;
        const dx = e.clientX + window.scrollX - d.startX;
        const dyFree = e.clientY + sy - d.startY;
        d.block.style.transform = `translate(${dx}px, ${dyFree}px)`;
        for (const c of d.carry) { c.el.style.transition = 'none'; c.el.style.transform = `${c.transform} translate(${dx}px, ${dyFree}px)`.trim(); }
        if (this.hovered === d.block) this.gutter.style.transform = `translate(${dx}px, ${dyFree}px)`;
        this.showLine(cross);
        const edgeX = e.clientY < 60 ? -12 : e.clientY > window.innerHeight - 60 ? 12 : 0;
        if (edgeX) { window.scrollBy(0, edgeX); requestAnimationFrame(() => { if (this.drag === d) this.onDrag(d.lastEvent); }); }
        return;
      }
      if (d.cross) { d.cross = null; this.line.hidden = true; }
    }
    const n = d.blocks.length;
    const i = d.index;
    // блок идёт за курсором, но не выходит за пределы списка блоков
    const minDy = d.tops[0] - d.tops[i];
    // низ — не ниже низа последнего (без его нижнего отступа: пункт содержания уходил под край панели, заказчик 27.11)
    const maxDy = Math.min((d.tops[n - 1] - d.slots[i] + d.slots[n - 1]) - d.tops[i], d.tops[n - 1] + d.heights[n - 1] - d.heights[i] - d.tops[i]);
    const dy = Math.max(minDy, Math.min(maxDy, e.clientY + sy - d.startY));
    d.block.style.transform = `translateY(${dy}px)`;
    if (!d.itemMode && this.hovered === d.block) this.gutter.style.transform = `translateY(${dy}px)`;   // блок не выбран: ручка «+ ⠿» тоже едет за ним
    if (this.item === d.block) this.placeItemControls();

    // новое место: нижний край блока прошёл центр нижнего соседа (вниз) или верхний край — центр верхнего (вверх);
    // центры считаются по «слоту» (блок + отступ), поэтому блок любой высоты доходит и до последнего места
    const top = d.tops[i] + dy;
    const bottom = top + d.slots[i];
    let t = i;
    for (let j = i + 1; j < n; j++) { if (bottom > d.tops[j] + d.slots[j] / 2) t = j; else break; }
    for (let j = i - 1; j >= 0; j--) { if (top < d.tops[j] + d.slots[j] / 2) t = j; else break; }
    d.target = t;

    // сдвиги: вниз по списку → блоки (i, t] вверх, вверх по списку → блоки [t, i) вниз
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      let shift = 0;
      if (t > i && j > i && j <= t) shift = -d.slots[i];
      else if (t < i && j >= t && j < i) shift = d.slots[i];
      if (shift !== d.shifts[j]) {
        d.shifts[j] = shift;
        d.blocks[j].style.transform = shift ? `translateY(${shift}px)` : '';
      }
    }

    // кнопки выбранного блока — там же, где блок: за пальцем (его тащат) или со сдвигом соседа (плавно, как блоки)
    if (d.focusIndex >= 0) {
      const own = d.focusIndex === i;
      const off = own ? dy : d.shifts[d.focusIndex];
      for (const c of d.carry) {
        c.el.style.transition = own ? 'none' : 'transform 0.22s var(--ui-ease)';
        c.el.style.transform = off ? `${c.transform} translateY(${off}px)`.trim() : c.transform;
      }
    }

    // автопрокрутка у краёв окна (продолжается, пока курсор у края)
    const edge = e.clientY < 60 ? -12 : e.clientY > window.innerHeight - 60 ? 12 : 0;
    if (edge) {
      window.scrollBy(0, edge);
      requestAnimationFrame(() => { if (this.drag === d) this.onDrag(d.lastEvent); });
    }
  }

  endDrag(cancelled = false) {
    const d = this.drag;
    this.drag = null;
    this.line.hidden = true;
    const ed = this.editor;
    if (!d) return;
    // без анимации: снимаем сдвиги и переставляем DOM в одном кадре — позиции совпадают
    ed.ui.classList.add('is-dropping');
    for (const b of d.blocks) b.style.transform = '';
    this.controls.style.transform = '';
    for (const c of d.carry || []) { c.el.style.transform = c.transform; c.el.style.transition = c.transition; }
    this.gutter.style.transform = '';
    ed.ui.classList.remove('is-carrying');
    d.block.removeAttribute('data-tedui-drag');
    if (d.block !== this.selected) frameKind(d.block, false);
    ed.ui.classList.remove('is-dragging');
    if (!cancelled && d.cross) {
      ed.history.commit();
      d.cross.parent.insertBefore(d.block, d.cross.before && d.cross.before.parentNode === d.cross.parent ? d.cross.before : null);
      normalizeRoot(this.root);   // тело контейнера, из которого ушёл последний блок, получает пустой абзац
      ed.afterChange({ immediate: true, focus: d.block.getAttribute('contenteditable') === 'false' || isWrap(d.block) ? null : d.block });
    } else if (!cancelled && d.target !== d.index && d.onDrop) {
      ed.history.commit();
      d.onDrop(d.index, d.target);
    } else if (!cancelled && d.target !== d.index) {
      ed.history.commit();
      const others = d.blocks.filter((b) => b !== d.block);
      d.parent.insertBefore(d.block, others[d.target] || null);
      ed.afterChange({ immediate: true });
    }
    this.refresh();
    this.syncItem();
    requestAnimationFrame(() => requestAnimationFrame(() => ed.ui.classList.remove('is-dropping')));
  }
}
export function slugify(text) {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  return String(text || '').toLowerCase().trim().slice(0, 60)
    .replace(/[а-яё]/g, (c) => map[c] || '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueId(root, base) {
  let id = base;
  let i = 2;
  while (root.querySelector(`#${CSS.escape(id)}`)) id = `${base}-${i++}`;
  return id;
}

/** Правка блока из реестра, которой принадлежит пункт (editorUi → ownsItem), или null. */
function itemOwner(ed, li) {
  return (li && ed.blockUis.find((u) => u.ownsItem && u.ownsItem(li))) || null;
}
