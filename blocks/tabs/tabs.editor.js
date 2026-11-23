// Вкладки в правке (этап 6.3, макет block-tabs: Tabs/main underline m).
// Названия — в ряд (на узком экране ряд прокручивается вбок), видно тело активной вкладки (вкладка с курсором).
// Под блоком — «+ Добавить вкладку» (как «Добавить автора»); кнопки вкладки ⠿ 🗑 — над её названием (общие кнопки элемента:
// перестановка — плавно, как у шагов; удаление вместе с содержимым, Undo). В просмотре вкладки переключаются нажатием.
// Клавиши: Enter в названии → в содержимое; Enter на пустой последней строке содержимого → абзац под блоком;
// Backspace в пустом названии пустой вкладки — удаляет её; на краях содержимого — не склеивает с названием.

import { h, icon } from '../../src/ui/widgets.js';
import { getRange, placeCaret } from '../../src/core/selection.js';
import { objectSelector, wrapSelector } from '../../src/core/registry.js';
import { normalizeRoot, emptyBlock, isEmptyBlock } from '../../src/core/blocks.js';
import { makeTab, normalizeTabs, TABS_MAX } from './tabs.js';

const keyOf = (el) => el.getAttribute('data-tedui-key');

/** Ключи названий и тел на месте и тела идут в порядке названий (после Undo, перетаскивания, вставки — восстанавливаем). */
function ensure(tabs) {
  const titles = [...tabs.querySelectorAll(':scope > .ted-tabs__bar > .ted-tabs__title')];
  const bodies = [...tabs.querySelectorAll(':scope > .ted-tabs__body')];
  const ok = titles.length === bodies.length && titles.every((t, i) => keyOf(t) && keyOf(t) === keyOf(bodies[i]));
  if (!ok) normalizeTabs(tabs, tabs.ownerDocument, (b) => normalizeRoot(b));
}

export class TabsUI {
  constructor(editor) {
    this.editor = editor;
    this.root = editor.editable;
    this.column = editor.column;
    this.tabs = null;
    this.addBtn = h('button', { type: 'button', class: 'ted-ui-addauthor ted-ui-tabsadd' }, [icon('plus'), h('span', { text: 'Добавить вкладку' })]);
    this.addBtn.addEventListener('mousedown', (e) => e.preventDefault());
    this.addBtn.addEventListener('click', () => this.addTab());
    this.column.appendChild(this.addBtn);
    // просмотр: вкладка переключается нажатием на название
    this.onClick = (e) => {
      if (this.editor.mode === 'edit') return;
      const t = e.target.closest && e.target.closest('.ted-tabs__title');
      if (t && this.root.contains(t)) this.activate(t.closest('.ted-tabs'), keyOf(t));
    };
    this.root.addEventListener('click', this.onClick);
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.place()) : null;
  }

  /** Вкладка — пункт этого блока: кнопки ⠿ 🗑 над её названием; удаляется вместе со своим содержимым. */
  itemAt(node) { const t = node && node.closest ? node.closest('div.ted-tabs > .ted-tabs__bar > .ted-tabs__title') : null; return t && this.editor.editable.contains(t) ? t : null; }

  ownsItem(li) { return li.classList.contains('ted-tabs__title') && !!li.parentNode && li.parentNode.classList.contains('ted-tabs__bar'); }

  get itemAbove() { return 'above'; }

  /** Последнюю вкладку удалили — блок целиком (ряд названий лежит внутри блока); сообщение. */
  blockOfItems(bar) { return bar.parentNode; }

  get removedToast() { return 'Вкладка удалена'; }

  itemRemoved(li, bar) { bar.parentNode.querySelector(`:scope > .ted-tabs__body[data-tedui-key="${li.getAttribute('data-tedui-key')}"]`)?.remove(); }

  destroy() {
    this.ro?.disconnect();
    this.root.removeEventListener('click', this.onClick);
  }

  /** Сделать вкладку активной: подсветка названия и видимое содержимое. */
  activate(tabs, key) {
    if (!tabs || !key) return;
    for (const el of tabs.querySelectorAll(':scope > .ted-tabs__bar > .ted-tabs__title, :scope > .ted-tabs__body')) el.toggleAttribute('data-tedui-active', keyOf(el) === key);
  }

  current() {
    const ed = this.editor;
    if (ed.mode !== 'edit' || !ed.isFocused()) return { tabs: null, part: null };
    const r = getRange(this.root);
    const n = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode);
    const part = n && n.closest && n.closest('.ted-tabs__title, .ted-tabs__body');
    const tabs = part && part.closest('.ted-tabs');
    return tabs && this.root.contains(tabs) && tabs.parentNode === this.root ? { tabs, part } : { tabs: null, part: null };
  }

  /** После каждой правки и загрузки статьи (setHTML): у каждого блока вкладок одна активная — по умолчанию первая (проверка 22.11). */
  refresh() {
    for (const tabs of this.root.querySelectorAll(':scope > .ted-tabs')) {
      ensure(tabs);
      if (!tabs.querySelector(':scope > .ted-tabs__bar > [data-tedui-active]')) {
        const first = tabs.querySelector(':scope > .ted-tabs__bar > .ted-tabs__title');
        if (first) this.activate(tabs, keyOf(first));
      }
    }
  }

  sync() {
    this.refresh();
    const { tabs, part } = this.current();
    if (tabs && part) this.activate(tabs, keyOf(part));
    if (this.tabs && this.tabs !== tabs) { this.tabs.removeAttribute('data-tedui-addbtn'); this.ro?.unobserve(this.tabs); }
    if (tabs && tabs !== this.tabs) this.ro?.observe(tabs);
    this.tabs = tabs;
    if (!tabs) { this.addBtn.classList.remove('is-visible'); return; }   // при перетаскивании вкладки «Добавить вкладку» остаётся (22.11)
    tabs.setAttribute('data-tedui-addbtn', '');   // место под «Добавить вкладку»
    this.place();
  }

  place() {
    const tabs = this.tabs;
    if (!tabs || !tabs.isConnected) { this.addBtn.classList.remove('is-visible'); return; }
    const cr = this.column.getBoundingClientRect();
    const r = tabs.getBoundingClientRect();
    this.addBtn.style.top = `${r.bottom - cr.top + 20}px`;
    this.addBtn.style.left = `${r.left - cr.left}px`;
    this.addBtn.classList.add('is-visible');
  }

  addTab() {
    const tabs = this.tabs;
    if (!tabs) return;
    const ed = this.editor;
    const bar = tabs.querySelector(':scope > .ted-tabs__bar');
    if (bar.children.length >= TABS_MAX) { ed.toast(`Не больше ${TABS_MAX} вкладок`); return; }
    ed.history.commit();
    const [title, body] = makeTab(document);
    bar.appendChild(title);
    tabs.appendChild(body);
    this.activate(tabs, keyOf(title));
    placeCaret(title, false);
    title.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    ed.afterChange({ immediate: true });
  }

  exitBelow(tabs) {
    const ed = this.editor;
    let next = tabs.nextElementSibling;
    if (!(next && next.tagName === 'P' && isEmptyBlock(next))) { next = emptyBlock(document); tabs.after(next); }
    normalizeRoot(this.root);
    placeCaret(next);
    ed.afterChange({ immediate: true });
  }

  /** Enter, Backspace, Delete в названии и на краях содержимого. true — нажатие обработано. */
  /** Tab / Shift+Tab в названии — к соседней вкладке (как ячейки таблицы и колонки, проверка 22.11); у крайней — остаётся. */
  onKeyFirst(e) {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return false;
    const r = getRange(this.root);
    const n = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode);
    const title = n && n.closest && n.closest('.ted-tabs__bar > .ted-tabs__title');
    const tabs = title && title.closest('.ted-tabs');
    if (!tabs || !this.root.contains(tabs)) return false;
    e.preventDefault();
    const titles = [...tabs.querySelectorAll(':scope > .ted-tabs__bar > .ted-tabs__title')];
    const next = titles[titles.indexOf(title) + (e.shiftKey ? -1 : 1)];
    if (next) {
      this.activate(tabs, keyOf(next));
      placeCaret(next, true);
      this.editor.updateState();
    }
    return true;
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const r = getRange(this.root);
    if (!r) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const part = n && n.closest && n.closest('.ted-tabs__title, .ted-tabs__body');
    const tabs = part && part.closest('.ted-tabs');
    if (!tabs || !this.root.contains(tabs)) return false;
    ensure(tabs);
    const ed = this.editor;
    const key = keyOf(part);
    const title = tabs.querySelector(`:scope > .ted-tabs__bar > .ted-tabs__title[data-tedui-key="${key}"]`);
    const body = tabs.querySelector(`:scope > .ted-tabs__body[data-tedui-key="${key}"]`);
    const blank = (el) => !el.textContent.replace(/​/g, '').trim() && !el.querySelector(['img, table', wrapSelector(), objectSelector()].filter(Boolean).join(', '));
    const titles = () => [...tabs.querySelectorAll(':scope > .ted-tabs__bar > .ted-tabs__title')];

    if (part === title) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) return true;   // название — одна строка
        const first = body.firstElementChild;
        placeCaret(first && !first.matches([wrapSelector(), 'figure', objectSelector()].filter(Boolean).join(', ')) ? first : body, false);
        ed.updateState();
        return true;
      }
      if (e.key === 'Backspace' && r.collapsed && edge(title, r, 'start')) {
        e.preventDefault();
        if (blank(title) && blank(body) && titles().length > 1) {
          ed.history.commit();
          const prev = title.previousElementSibling || title.nextElementSibling;
          title.remove();
          body.remove();
          this.activate(tabs, keyOf(prev));
          placeCaret(prev, true);
          ed.afterChange({ immediate: true });
        }
        return true;
      }
      if (e.key === 'Delete' && r.collapsed && edge(title, r, 'end')) { e.preventDefault(); return true; }
      return false;
    }

    const block = part === n ? part.childNodes[r.startOffset] : [...part.children].find((c) => c.contains(n));
    if (e.key === 'Enter' && !e.shiftKey && block && block.tagName === 'P' && isEmptyBlock(block) && block === part.lastElementChild && part.children.length > 1) {
      e.preventDefault();
      ed.history.commit();
      block.remove();
      this.exitBelow(tabs);
      return true;
    }
    if (e.key === 'Backspace' && r.collapsed && block === part.firstElementChild && edge(block, r, 'start')) {
      e.preventDefault();
      if (isEmptyBlock(block) && part.children.length > 1) { ed.history.commit(); const next = block.nextElementSibling; block.remove(); placeCaret(next, false); ed.afterChange({ immediate: true }); }
      else placeCaret(title, true);
      return true;
    }
    if (e.key === 'Delete' && r.collapsed && block === part.lastElementChild && edge(block, r, 'end')) { e.preventDefault(); return true; }
    return false;
  }
}

function edge(el, r, side) {
  const t = document.createRange();
  t.selectNodeContents(el);
  if (side === 'start') t.setEnd(r.startContainer, r.startOffset);
  else t.setStart(r.endContainer, r.endOffset);
  return !t.toString().replace(/​/g, '').length;
}
