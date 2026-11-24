// Аккордеон в правке (этап 6.3, макет block-accordion).
// Пункт с курсором раскрыт; шеврон справа от вопроса раскрывает и сворачивает пункт (плавно); под блоком — «+ Добавить вопрос»
// (как «Добавить автора»). Кнопки пункта (⠿ 🗑) — общие кнопки элемента (как у шагов): перестановка и удаление вопросов.
// Клавиши — по логике шагов: Enter в вопросе → в ответ; Enter на пустой последней строке ответа → новый вопрос;
// Enter в пустом последнем вопросе → абзац под блоком; Backspace не склеивает вопрос с соседями.

import { h, icon } from '../../resources/js/ui/widgets.js';
import { getRange, placeCaret } from '../../resources/js/core/selection.js';
import { objectSelector, wrapSelector } from '../../resources/js/core/registry.js';
import { normalizeRoot, emptyBlock, isEmptyBlock } from '../../resources/js/core/blocks.js';
import { makeAccordionItem } from './accordion.js';

export class AccordionUI {
  constructor(editor) {
    this.editor = editor;
    this.root = editor.editable;
    this.column = editor.column;
    this.acc = null;
    this.addBtn = h('button', { type: 'button', class: 'ted-ui-addauthor ted-ui-accadd' }, [icon('plus'), h('span', { text: 'Добавить вопрос' })]);
    this.addBtn.addEventListener('mousedown', (e) => e.preventDefault());
    this.addBtn.addEventListener('click', () => this.addItem());
    this.column.appendChild(this.addBtn);
    // шеврон — правые 32 px строки вопроса (рисует CSS): нажатие раскрывает / сворачивает, курсор не ставится
    this.onDown = (e) => { if (this.chevronHit(e)) e.preventDefault(); };
    this.onClick = (e) => { const item = this.chevronHit(e); if (item) this.toggle(item); };
    this.root.addEventListener('mousedown', this.onDown);
    this.root.addEventListener('click', this.onClick);
    // пункт раскрывается плавно — кнопка «Добавить вопрос» едет вместе с низом блока
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.place()) : null;
    this.onEnd = (e) => { if (this.acc && this.acc.contains(e.target)) this.place(); };
    this.root.addEventListener('transitionend', this.onEnd);
  }

  /** Пункт аккордеона: кнопки ⠿ 🗑 на уровне строки вопроса; после удаления курсор — в соседний вопрос. */
  itemAt(node) { const it = node && node.closest ? node.closest('div.ted-accordion > .ted-accordion__item') : null; return it && this.editor.editable.contains(it) ? it : null; }

  ownsItem(li) { return li.classList.contains('ted-accordion__item') && !!li.parentNode && li.parentNode.classList.contains('ted-accordion'); }

  itemRow(li) { return li.querySelector(':scope > .ted-accordion__q'); }

  itemCaret(li) { return li.querySelector(':scope > .ted-accordion__q'); }

  get removedToast() { return 'Вопрос удалён'; }

  destroy() {
    this.ro?.disconnect();
    this.root.removeEventListener('transitionend', this.onEnd);
    this.root.removeEventListener('mousedown', this.onDown);
    this.root.removeEventListener('click', this.onClick);
  }

  chevronHit(e) {
    if (this.editor.mode !== 'edit') return null;
    const q = e.target && e.target.closest && e.target.closest('.ted-accordion__q');
    if (!q || !this.root.contains(q)) return null;
    const r = q.getBoundingClientRect();
    return e.clientX >= r.right - 32 ? q.parentElement : null;
  }

  toggle(item) {
    const open = !item.hasAttribute('data-tedui-open');
    item.toggleAttribute('data-tedui-open', open);
    // свернули пункт с курсором в ответе — курсор в конец вопроса
    const r = getRange(this.root);
    const body = item.querySelector(':scope > .ted-accordion__body');
    if (!open && r && body && body.contains(r.startContainer)) placeCaret(item.querySelector(':scope > .ted-accordion__q'), true);
    this.place();
  }

  /** Аккордеон и пункт с курсором. */
  current() {
    const ed = this.editor;
    if (ed.mode !== 'edit' || !ed.isFocused()) return { acc: null, item: null };
    const r = getRange(this.root);
    const n = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode);
    const item = n && n.closest && n.closest('.ted-accordion__item');
    const acc = item && item.parentElement;
    return acc && this.root.contains(acc) ? { acc, item } : { acc: null, item: null };
  }

  sync() {
    const { acc, item } = this.current();
    if (item && !item.hasAttribute('data-tedui-open')) item.setAttribute('data-tedui-open', '');   // пункт с курсором раскрыт
    if (this.acc && this.acc !== acc) { this.acc.removeAttribute('data-tedui-addbtn'); this.ro?.unobserve(this.acc); }
    if (acc && acc !== this.acc) this.ro?.observe(acc);
    this.acc = acc;
    if (!acc || this.editor.handle.drag) { this.addBtn.classList.remove('is-visible'); return; }
    acc.setAttribute('data-tedui-addbtn', '');   // место под «Добавить вопрос»
    this.place();
  }

  place() {
    const acc = this.acc;
    if (!acc || !acc.isConnected) { this.addBtn.classList.remove('is-visible'); return; }
    const cr = this.column.getBoundingClientRect();
    const ar = acc.getBoundingClientRect();
    this.addBtn.style.top = `${ar.bottom - cr.top + 20}px`;
    this.addBtn.style.left = `${ar.left - cr.left}px`;
    this.addBtn.classList.add('is-visible');
  }

  addItem(after = null) {
    const acc = this.acc;
    if (!acc) return;
    const ed = this.editor;
    ed.history.commit();
    const item = makeAccordionItem(document);
    item.setAttribute('data-tedui-open', '');
    if (after) after.after(item); else acc.appendChild(item);
    placeCaret(item.querySelector(':scope > .ted-accordion__q'), false);   // в пустом вопросе — в начало (после служебного <br> браузер уводит курсор в ответ)
    ed.afterChange({ immediate: true });
    return item;
  }

  /** Новый абзац под блоком (или уже пустой следующий). */
  exitBelow(acc) {
    const ed = this.editor;
    let next = acc.nextElementSibling;
    if (!(next && next.tagName === 'P' && isEmptyBlock(next))) { next = emptyBlock(document); acc.after(next); }
    normalizeRoot(this.root);
    placeCaret(next);
    ed.afterChange({ immediate: true });
  }

  /** Enter, Backspace, Delete в вопросе и на краях ответа. true — нажатие обработано. */
  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const r = getRange(this.root);
    if (!r) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const item = n && n.closest && n.closest('.ted-accordion__item');
    if (!item || !this.root.contains(item)) return false;
    const acc = item.parentElement;
    const ed = this.editor;
    const q = item.querySelector(':scope > .ted-accordion__q');
    const body = item.querySelector(':scope > .ted-accordion__body');
    const blank = (el) => !el.textContent.replace(/​/g, '').trim() && !el.querySelector(['img, table', wrapSelector(), objectSelector()].filter(Boolean).join(', '));
    const items = () => [...acc.querySelectorAll(':scope > .ted-accordion__item')];

    if (q.contains(n)) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) return true;   // вопрос — одна строка
        // пустой последний вопрос без ответа — выход из блока (как у шагов); пункт убирается, если он не единственный
        if (blank(q) && blank(body) && item === acc.lastElementChild) {
          ed.history.commit();
          if (items().length > 1) item.remove();
          this.exitBelow(acc);
          return true;
        }
        item.setAttribute('data-tedui-open', '');
        const first = body.firstElementChild;
        placeCaret(first && !first.matches([wrapSelector(), 'figure', objectSelector()].filter(Boolean).join(', ')) ? first : body, false);
        ed.updateState();
        return true;
      }
      if (e.key === 'Backspace' && r.collapsed && atStart(q, r)) {
        e.preventDefault();
        // пустой пункт целиком удаляется, курсор — в конец предыдущего ответа
        if (blank(q) && blank(body) && items().length > 1) {
          ed.history.commit();
          const prev = item.previousElementSibling;
          item.remove();
          if (prev) { prev.setAttribute('data-tedui-open', ''); const last = prev.querySelector(':scope > .ted-accordion__body').lastElementChild; placeCaret(last || prev, true); }
          else placeCaret(acc.querySelector('.ted-accordion__q'), true);
          ed.afterChange({ immediate: true });
        }
        return true;
      }
      if (e.key === 'Delete' && r.collapsed && atEnd(q, r)) { e.preventDefault(); return true; }
      return false;
    }

    if (body.contains(n)) {
      const block = body === n ? body.childNodes[r.startOffset] : [...body.children].find((c) => c.contains(n));
      // Enter на пустой последней строке ответа — новый вопрос под этим (пустая строка убирается)
      if (e.key === 'Enter' && !e.shiftKey && block && block.tagName === 'P' && isEmptyBlock(block) && block === body.lastElementChild && body.children.length > 1) {
        e.preventDefault();
        ed.history.commit();
        block.remove();
        this.acc = acc;
        this.addItem(item);
        return true;
      }
      // Backspace в начале ответа не склеивает его с вопросом
      if (e.key === 'Backspace' && r.collapsed && block === body.firstElementChild && atStart(block, r)) {
        e.preventDefault();
        if (isEmptyBlock(block) && body.children.length > 1) { ed.history.commit(); const next = block.nextElementSibling; block.remove(); placeCaret(next, false); ed.afterChange({ immediate: true }); }
        else placeCaret(q, true);
        return true;
      }
      // Delete в конце ответа не втягивает следующий вопрос
      if (e.key === 'Delete' && r.collapsed && block === body.lastElementChild && atEnd(block, r)) { e.preventDefault(); return true; }
    }
    return false;
  }
}

function atStart(el, r) {
  const t = document.createRange();
  t.selectNodeContents(el);
  t.setEnd(r.startContainer, r.startOffset);
  return !t.toString().replace(/​/g, '').length;
}

function atEnd(el, r) {
  const t = document.createRange();
  t.selectNodeContents(el);
  t.setStart(r.endContainer, r.endOffset);
  return !t.toString().replace(/​/g, '').length;
}
