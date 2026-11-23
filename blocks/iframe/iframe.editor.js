// iFrame в правке (этап 6.4, макет block-iframe, окно editor-popover kind=iframe).
// Пустой блок: поле «Адрес страницы» и «Добавить» (как ссылка на видео: ted-ui-input + Buttons/main primary s).
// Поле принимает адрес https:// или код <iframe …> целиком (из кода берётся адрес).
// Готовый блок: нажатие открывает «Настройки iFrame» (как окно «Якорь»): Адрес страницы, Пропорции, Сохранить / Отмена.
// Подпись — строкой под фреймом прямо в блоке, как у медиа (решение 22.11), не в окне.
// Фрейм в правке не перехватывает нажатия (pointer-events: none): первое нажатие выбирает блок.

import { h, smallButton, button } from '../../src/ui/widgets.js';
import { emptyBlock, isEmptyBlock } from '../../src/core/blocks.js';
import { iframeSrcOk, parseIframeInput, makeIframeBlock, readIframe, IFRAME_RATIOS } from './iframe.js';

/** Сайт не из списка в настройках сервера (ted.config.php → iframe.hosts). */
const frameHostMessage = (ed) => `Этот сайт нельзя встроить: разрешены ${ed.server.iframeHosts.join(', ') || 'только сайты из настроек'}`;

export class IframeUI {
  constructor(editor) {
    this.editor = editor;
    this.root = editor.editable;
    this.current = null;
    this.onClick = (e) => {
      const ed = this.editor;
      if (ed.mode !== 'edit') return;
      const fig = e.target && e.target.closest && e.target.closest('figure.ted-iframe');
      if (!fig || !this.root.contains(fig) || fig.hasAttribute('data-tedui-empty')) return;
      if (e.target.closest('[data-tedui-m]')) return;   // строка подписи — своё поле
      e.preventDefault();
      this.open(fig);
    };
    this.root.addEventListener('click', this.onClick);
  }

  destroy() { this.root.removeEventListener('click', this.onClick); }

  /** Пустым блокам — поле адреса (служебный элемент правки, в HTML не попадает). */
  /** Блок, у которого стоят кнопки ⠿ 🗑, пока его правят в окне (курсора в нём нет). */
  focusBlock() { return this.current && this.current.isConnected ? this.current : null; }

  sync() {
    for (const fig of this.root.querySelectorAll('figure.ted-iframe')) {
      const row = fig.querySelector(':scope > .ted-ui-media__link');
      const capInput = fig.querySelector(':scope > .ted-ui-media__caption');
      if (fig.hasAttribute('data-tedui-empty')) { if (!row) fig.appendChild(this.linkRow(fig)); capInput?.remove(); }
      else {
        if (row) row.remove();
        if (!capInput) fig.appendChild(this.captionRow(fig));
      }
    }
  }

  /** Подпись под фреймом — поле прямо в блоке (как «Добавить подпись» у медиа); Enter — новый абзац под блоком. */
  captionRow(fig) {
    const ed = this.editor;
    const cap = fig.querySelector(':scope > figcaption');
    const input = h('input', { type: 'text', class: 'ted-ui-media__caption', placeholder: 'Добавить подпись', 'aria-label': 'Подпись', 'data-tedui-m': '', value: cap ? cap.textContent : '' });
    input.addEventListener('focus', () => ed.history.commit());
    input.addEventListener('input', () => {
      let c = fig.querySelector(':scope > figcaption');
      const v = input.value.replace(/\s+/g, ' ');
      if (!v.trim()) { c?.remove(); }
      else {
        if (!c) { c = document.createElement('figcaption'); fig.insertBefore(c, input); }
        c.textContent = v;
      }
      const f = fig.querySelector(':scope > iframe');
      if (f) f.setAttribute('title', v.trim() || 'Встроенная страница');
      ed.afterChange();
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      e.preventDefault();
      let next = fig.nextElementSibling;
      if (!next || next.tagName !== 'P' || !isEmptyBlock(next)) { ed.history.commit(); next = emptyBlock(document); fig.after(next); }
      ed.afterChange({ immediate: true, focus: next });
    });
    input.addEventListener('paste', (e) => e.stopPropagation());
    return input;
  }

  /** Поле «Адрес страницы» в пустом блоке. */
  linkRow(fig) {
    const ed = this.editor;
    const input = h('input', { type: 'text', class: 'ted-ui-input ted-ui-media__url', autocomplete: 'off', spellcheck: 'false', placeholder: 'Адрес страницы', 'aria-label': 'Адрес страницы или код iframe' });
    const submit = () => {
      const { src, title } = parseIframeInput(input.value);
      if (!iframeSrcOk(src)) return ed.toast('Адрес не подошёл: нужна ссылка https:// или код <iframe>', { status: 'error' });
      if (!iframeSrcOk(src, ed.server.iframeHosts)) return ed.toast(frameHostMessage(ed), { status: 'error' });
      this.apply(fig, { src, ratio: IFRAME_RATIOS[0], caption: '', title });
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (input.value.trim()) { submit(); return; }
      // пустое поле: Enter — новый абзац под блоком (как у ссылки на видео)
      let next = fig.nextElementSibling;
      if (!next || next.tagName !== 'P' || !isEmptyBlock(next)) { ed.history.commit(); next = emptyBlock(document); fig.after(next); }
      ed.afterChange({ immediate: true, focus: next });
    });
    input.addEventListener('paste', (e) => e.stopPropagation());
    const button = h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary ted-ui-action--s ted-ui-media__link-go', text: 'Добавить' });
    button.addEventListener('click', submit);
    return h('div', { class: 'ted-ui-field__row ted-ui-media__link', 'data-tedui-m': '' }, [input, button]);
  }

  focusInput(fig) {
    const input = fig && fig.querySelector('.ted-ui-media__url');
    if (input) input.focus({ preventScroll: true });
  }

  /** Новые адрес, высота и подпись блока. */
  apply(fig, data) {
    const ed = this.editor;
    ed.history.commit();
    const fresh = makeIframeBlock(document, data);
    if (fig.id) fresh.id = fig.id;
    fig.replaceWith(fresh);
    ed.afterChange({ immediate: true });
    ed.selectObject(fresh);   // кнопки блока остаются у фрейма (поле ссылки с фокусом исчезло)
    return fresh;
  }

  /** Окно «Настройки iFrame»: адрес и пропорции (подпись — в самом блоке). */
  open(fig) {
    const ed = this.editor;
    const f = fig.querySelector(':scope > iframe');
    const data = readIframe(fig);
    const field = (label, hint, attrs) => {
      const input = h('input', { class: 'ted-ui-input', type: 'text', autocomplete: 'off', ...attrs });
      return { input, el: h('label', { class: 'ted-ui-field' }, [h('span', { class: 'ted-ui-field__label', text: label }), input, h('span', { class: 'ted-ui-field__hint', text: hint })]) };
    };
    const url = field('Адрес страницы', 'Что встроить: ссылка или код <iframe>.', { placeholder: 'https://…', spellcheck: 'false', value: f ? f.getAttribute('src') : '', 'aria-label': 'Адрес страницы' });
    // пропорции — рядом кнопками, как «Выравнивание» в окне кнопки; у старого блока с высотой ни одна не выбрана
    let ratio = data.ratio;
    const ratioBtns = IFRAME_RATIOS.map((v) => {
      const b = button({ name: 'ratio-' + v.replace(':', 'x'), label: 'Пропорции ' + v.replace(':', ' : '), text: v.replace(':', ' : '), onClick: () => { ratio = v; for (const x of ratioBtns) x.classList.toggle('is-active', x === b); } });
      b.classList.toggle('is-active', v === ratio);
      return b;
    });
    const ratioRow = h('div', { class: 'ted-ui-field' }, [h('span', { class: 'ted-ui-field__label', text: 'Пропорции' }), h('div', { class: 'ted-ui-pop__row ted-ui-pop__row--wrap' }, ratioBtns), h('span', { class: 'ted-ui-field__hint', text: 'Ширина — по колонке, высота — по пропорции.' })]);
    const cancel = () => ed.popover.close();
    const save = () => {
      const parsed = parseIframeInput(url.input.value);
      if (!iframeSrcOk(parsed.src)) { url.input.focus(); return ed.toast('Адрес не подошёл: нужна ссылка https:// или код <iframe>', { status: 'error' }); }
      if (!iframeSrcOk(parsed.src, ed.server.iframeHosts)) { url.input.focus(); return ed.toast(frameHostMessage(ed), { status: 'error' }); }
      ed.popover.close();
      this.apply(fig, { src: parsed.src, ratio, height: ratio ? '' : data.height, caption: data.caption });
    };
    url.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [
        h('p', { class: 'ted-ui-form__title', text: 'Настройки iFrame' }),
        smallButton({ name: 'close', label: 'Закрыть', iconName: 'close-small', onClick: cancel }),
      ]),
      url.el, ratioRow,
      h('div', { class: 'ted-ui-form__footer' }, [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Сохранить', onclick: save }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отмена', onclick: cancel }),
      ]),
    ];
    this.current = fig;
    ed.handle.select(fig);
    ed.updateState();   // кнопки блока ⠿ 🗑 — у этого блока
    ed.popover.openUnder(nodes, fig, {   // окно — под блоком, у левого края (общее правило окон настроек)
      onClose: () => { if (ed.handle.selected === fig) ed.handle.select(null); this.current = null; ed.updateState(); },
    });
  }
}
