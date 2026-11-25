// Кнопка в правке (этап 6.5, макет block-button, окно editor-popover kind=button).
// Нажатие на кнопку открывает «Настройки кнопки» (как окно «Ссылка»: текст кнопки, ссылка, «Открывать в новой вкладке»,
// «Сохранить» / «Отмена»). У основной кнопки ещё два переключателя вида (Action/button: button, double, banner):
// «Вторая кнопка» (secondary) и «Баннер» (заголовок, текст и кнопка на подложке). Выравнивание — общей кнопкой ≡ панели
// (у баннера его нет). Кнопка, которую правят, — в рамке перетаскивания (как выбранный блок).
// Заголовок и текст баннера — строки прямо в баннере: Enter из заголовка ведёт в текст, Enter в тексте — новый абзац под
// блоком (выход из блока, как у других блоков), Backspace в начале текста — в конец заголовка.
// Всё, что меняют в окне, сразу видно на кнопке (живой предпросмотр, решение 22.11); «Отмена», Escape и нажатие мимо окна
// возвращают как было, «Сохранить» оставляет — одним шагом истории.

import { h, icon, smallButton, button } from '../../resources/js/ui/widgets.js';
import { getRange, placeCaret } from '../../resources/js/core/selection.js';
import { emptyBlock, isEmptyBlock } from '../../resources/js/core/blocks.js';
import { buttonHrefOk, makeButtonLink } from './button.js';

const fixUrl = (v) => {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:|\/|#|\.)/i.test(s)) return s;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  if (/^[^\s/]+\.[^\s]+/.test(s)) return `https://${s}`;
  return s;
};

export class ButtonUI {
  constructor(editor) {
    this.editor = editor;
    this.root = editor.editable;
    this.current = null;
    // нажатие на кнопку — окно настроек (ссылка в правке не уводит со страницы, курсор в кнопку не ставится)
    this.onDown = (e) => { if (this.hit(e)) e.preventDefault(); };
    this.onClick = (e) => {
      const a = this.hit(e);
      if (!a) return;
      e.preventDefault();
      this.open(a);
    };
    this.root.addEventListener('mousedown', this.onDown);
    this.root.addEventListener('click', this.onClick);
  }

  /** Блок, у которого стоят кнопки ⠿ 🗑, пока кнопку правят в окне (курсора в ней нет). */
  focusBlock() { return this.current && this.current.isConnected ? this.current.parentElement : null; }

  destroy() {
    this.root.removeEventListener('mousedown', this.onDown);
    this.root.removeEventListener('click', this.onClick);
  }

  hit(e) {
    if (this.editor.mode !== 'edit') return null;
    const a = e.target && e.target.closest && e.target.closest('div.ted-button > a');
    return a && this.root.contains(a) ? a : null;
  }

  /** Окно «Настройки кнопки» у кнопки a. */
  open(a) {
    const ed = this.editor;
    if (!a || !a.isConnected) return;
    const block = a.parentElement;
    const primary = a === block.querySelector(':scope > a');
    const banner = block.classList.contains('ted-button--banner');
    const second = block.querySelectorAll(':scope > a').length > 1;

    const field = (label, hint, attrs) => {
      const input = h('input', { class: 'ted-ui-input', type: 'text', autocomplete: 'off', ...attrs });
      return { input, el: h('label', { class: 'ted-ui-field' }, [h('span', { class: 'ted-ui-field__label', text: label }), input, h('span', { class: 'ted-ui-field__hint', text: hint })]) };
    };
    const text = field('Текст кнопки', 'Коротко, глаголом.', { placeholder: 'Перейти в каталог', value: a.textContent.trim(), 'aria-label': 'Текст кнопки' });
    const url = field('Ссылка', 'Адрес страницы или товара.', { inputmode: 'url', placeholder: 'https://example.com', value: a.getAttribute('href') || '', 'aria-label': 'Ссылка' });
    // Switches/toggle size s — как в окне «Ссылка»
    const toggle = (label, checked) => {
      const input = h('input', { type: 'checkbox', role: 'switch', class: 'ted-ui-toggle__input' });
      input.checked = checked;
      return { input, el: h('label', { class: 'ted-ui-toggle' }, [
        input,
        h('span', { class: 'ted-ui-toggle__track', 'aria-hidden': 'true' }, [h('span', { class: 'ted-ui-toggle__knob' }, [icon('check')])]),
        h('span', { class: 'ted-ui-toggle__text', text: label }),
      ]) };
    };
    const isNew = !a.textContent.trim() && !a.getAttribute('href');
    const blank = toggle('Открывать в новой вкладке', isNew ? ed.options.linkBlank !== false : a.getAttribute('target') === '_blank');
    const twoBtn = primary ? toggle('Вторая кнопка', second) : null;
    const bannerT = primary ? toggle('Баннер: заголовок и текст', banner) : null;
    // выравнивание кнопок — те же кнопки, что ≡ в панели (у баннера его нет)
    let align = block.classList.contains('ted-align-center') ? 'center' : block.classList.contains('ted-align-right') ? 'right' : 'left';
    const alignBtns = [['left', 'Слева', 'align-left'], ['center', 'По центру', 'align-center'], ['right', 'Справа', 'align-right']].map(([v, label, ic]) => {
      const b = button({ name: 'align-' + v, label, iconName: ic, onClick: () => { align = v; for (const x of alignBtns) x.classList.toggle('is-active', x === b); } });
      b.classList.toggle('is-active', v === align);
      return b;
    });
    const alignRow = primary ? h('div', { class: 'ted-ui-field' }, [h('span', { class: 'ted-ui-field__label', text: 'Выравнивание' }), h('div', { class: 'ted-ui-pop__row' }, alignBtns), h('span', { class: 'ted-ui-field__hint', text: 'Где стоят кнопки в колонке.' })]) : null;
    if (alignRow) alignRow.hidden = banner;
    // у баннера одна кнопка: переключатели взаимоисключающие
    if (twoBtn && bannerT) {
      twoBtn.input.addEventListener('change', () => { if (twoBtn.input.checked) bannerT.input.checked = false; });
      bannerT.input.addEventListener('change', () => { if (bannerT.input.checked) twoBtn.input.checked = false; alignRow.hidden = bannerT.input.checked; });
    }

    // живой предпросмотр: блок до правки — чтобы «Отмена» вернула как было
    ed.history.commit();
    const before = { cls: block.className, html: block.innerHTML, index: [...block.querySelectorAll(':scope > a')].indexOf(a) };
    let saved = false;
    let cancelled = false;   // «Отмена» и крестик возвращают как было; Esc и клик мимо окна оставляют введённое (проверка 22.11)
    const preview = () => {
      if (!a.isConnected) return;
      a.textContent = text.input.value.replace(/\s+/g, ' ');
      if (primary) {
        this.applyKind(block, bannerT.input.checked ? 'banner' : twoBtn.input.checked ? 'double' : 'button');
        block.classList.remove('ted-align-center', 'ted-align-right');
        if (!bannerT.input.checked && align !== 'left') block.classList.add('ted-align-' + align);
      }
      ed.updatePlaceholders();
      ed.handle.refresh();
    };
    this.preview = preview;
    text.input.addEventListener('input', preview);
    for (const t of [twoBtn, bannerT]) if (t) t.input.addEventListener('change', preview);
    for (const b of alignBtns) b.addEventListener('click', preview);
    const restore = () => {
      block.className = before.cls;
      block.innerHTML = before.html;
      ed.afterChange({ record: false });
    };
    const cancel = () => { cancelled = true; ed.popover.close(); };
    const save = () => {
      const label = text.input.value.replace(/\s+/g, ' ').trim();
      const href = fixUrl(url.input.value);
      if (href && !buttonHrefOk(href)) { url.input.focus(); return ed.toast('Ссылка: адрес страницы, https://, mailto: или tel:', { status: 'error' }); }
      saved = true;
      ed.popover.close();
      preview();
      a.textContent = label;
      if (href) a.setAttribute('href', href); else a.removeAttribute('href');
      if (blank.input.checked) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
      else { a.removeAttribute('target'); a.removeAttribute('rel'); }
      ed.afterChange({ immediate: true });
      // новый баннер — курсор в заголовок; иначе — в строку под блоком (клавиатура остаётся в редакторе)
      const title = block.querySelector('.ted-button__title');
      if (title && !title.textContent.trim()) { ed.editable.focus({ preventScroll: true }); placeCaret(title, false); ed.updateState(); }
    };
    for (const inp of [text.input, url.input]) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });

    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [
        h('p', { class: 'ted-ui-form__title', text: primary ? 'Настройки кнопки' : 'Вторая кнопка' }),
        smallButton({ name: 'close', label: 'Закрыть', iconName: 'close-small', onClick: cancel }),
      ]),
      text.el,
      url.el,
      blank.el,
      alignRow,
      twoBtn ? twoBtn.el : null,
      bannerT ? bannerT.el : null,
      h('div', { class: 'ted-ui-pop__line' }),
      h('div', { class: 'ted-ui-form__footer' }, [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Сохранить', onclick: save }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отмена', onclick: cancel }),
      ]),
    ].filter(Boolean);

    this.select(a);
    ed.updateState();   // кнопки блока ⠿ 🗑 — у блока этой кнопки
    // окно у самой кнопки и идёт за ней, пока она меняется (предпросмотр)
    ed.popover.open(nodes, a, {
      cls: 'ted-ui-pop--link',
      focus: '.ted-ui-input',
      anchorX: (r) => r.left + Math.min(28, r.width / 2 || 28),
      onClose: () => {
        this.preview = null;
        this.select(null);
        if (!saved && cancelled) restore();
        else if (!saved && a.isConnected) { a.textContent = text.input.value.replace(/\s+/g, ' ').trim(); ed.afterChange({ immediate: true }); }
        ed.updateState();
      },
    });
  }

  /** Кнопка, которую правят, — в рамке (как выбранный блок). */
  select(a) {
    if (this.current && this.current !== a) this.current.removeAttribute('data-tedui-selected');
    this.current = a && a.isConnected ? a : null;
    if (this.current) this.current.setAttribute('data-tedui-selected', '');
  }

  /** Вид блока: button — одна кнопка, double — основная и вторичная, banner — заголовок, текст и кнопка. */
  applyKind(block, kind) {
    const links = [...block.querySelectorAll(':scope > a')];
    const textBox = block.querySelector(':scope > .ted-button__text');
    if (kind === 'banner') {
      block.classList.add('ted-button--banner');
      block.classList.remove('ted-align-center', 'ted-align-right');
      for (const extra of links.slice(1)) extra.remove();
      if (!textBox) {
        const box = document.createElement('div');
        box.className = 'ted-button__text';
        for (const cls of ['ted-button__title', 'ted-button__desc']) { const p = document.createElement('p'); p.className = cls; p.appendChild(document.createElement('br')); box.appendChild(p); }
        block.insertBefore(box, block.firstChild);
      }
      return;
    }
    block.classList.remove('ted-button--banner');
    if (textBox) textBox.remove();
    if (kind === 'double' && links.length < 2) block.appendChild(makeButtonLink(document, { secondary: true }, true));
    if (kind === 'button') for (const extra of links.slice(1)) extra.remove();
  }

  /** Клавиши в заголовке и тексте баннера. true — нажатие обработано. */
  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const r = getRange(this.root);
    if (!r) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const line = n && n.closest && n.closest('.ted-button__title, .ted-button__desc');
    if (!line || !this.root.contains(line)) return false;
    const isTitle = line.classList.contains('ted-button__title');
    const other = isTitle ? line.nextElementSibling : line.previousElementSibling;
    const edge = (start) => {
      const t = document.createRange();
      t.selectNodeContents(line);
      if (start) t.setEnd(r.startContainer, r.startOffset); else t.setStart(r.endContainer, r.endOffset);
      return !t.toString().replace(/​/g, '').length;
    };
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isTitle && other) { placeCaret(other, false); this.editor.updateState(); return true; }
      if (!isTitle && !e.shiftKey) {
        // Enter в тексте баннера — новый абзац под блоком, как у других блоков (решение 22.11)
        const ed = this.editor;
        const block = line.closest('div.ted-button');
        let next = block.nextElementSibling;
        if (!next || next.tagName !== 'P' || !isEmptyBlock(next)) { ed.history.commit(); next = emptyBlock(document); block.after(next); }
        ed.afterChange({ immediate: true, focus: next });
      }
      return true;
    }
    if (e.key === 'Backspace' && r.collapsed && edge(true)) {
      e.preventDefault();
      if (!isTitle && other) { placeCaret(other, true); this.editor.updateState(); }
      return true;
    }
    if (e.key === 'Delete' && r.collapsed && edge(false)) { e.preventDefault(); return true; }
    return false;
  }
}
