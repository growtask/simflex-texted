// Встраивание в правке (этап 6.4, макет block-embed, окно editor-popover kind=embed).
// Пустой блок: поле ссылки и «Добавить» (как ссылка на видео и iFrame). Ссылка → карточка по OpenGraph (options.opengraph,
// страницу читает сервер CMS); текст без адреса → поиск статей CMS (options.articles.search) списком под полем (общее меню).
// Готовый блок: нажатие — «Настройки встраивания» под блоком (как «Якорь»): Ссылка, «В одну строку», Сохранить / Отмена.
// Если сервер карточку не дал — блок остаётся пустым, автор видит сообщение (поле не очищается).

import { h, icon, smallButton, menuItem } from '../../resources/js/ui/widgets.js';
import { emptyBlock, isEmptyBlock } from '../../resources/js/core/blocks.js';
import { embedUrlOk, embedData, readEmbed, makeEmbedBlock } from './embed.js';

const fixLink = (v) => {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^(https?:\/\/|\/)/i.test(s)) return s;
  if (/^[^\s/]+\.[^\s]+/.test(s)) return `https://${s}`;
  return s;
};

/**
 * Плавное появление (заказчик 17.11): высота блока переходит от прежней к новой, содержимое проявляется — как у медиа.
 * WAAPI, а не стили: правка style попала бы в историю.
 */
function grow(el, from) {
  if (!el || !el.isConnected || !el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const to = el.offsetHeight;
  if (Math.abs(to - from) > 1) el.animate([{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }], { duration: 300, easing: 'ease' });
  for (const c of el.children) c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' });
}

export class EmbedUI {
  constructor(editor) {
    this.editor = editor;
    this.root = editor.editable;
    this.current = null;
    this.onClick = (e) => {
      const ed = this.editor;
      if (ed.mode !== 'edit') return;
      const el = e.target && e.target.closest && e.target.closest('div.ted-embed');
      if (!el || !this.root.contains(el)) return;
      if (e.target.closest('a')) e.preventDefault();   // ссылки карточки в правке не уводят со страницы
      if (el.hasAttribute('data-tedui-empty')) return;
      e.preventDefault();
      this.open(el);
    };
    this.root.addEventListener('click', this.onClick);
  }

  destroy() { this.root.removeEventListener('click', this.onClick); }

  /** Карточка, которую правят в окне «Настройки встраивания»: кнопки блока (⠿ 🗑) — у неё. */
  focusBlock() { return this.current && this.current.isConnected ? this.current : null; }

  /** После вставки из меню: поле ссылки и курсор в нём. */
  focusInput(el) {
    this.sync();
    const inp = el.querySelector('.ted-ui-media__url');
    if (inp) inp.focus({ preventScroll: true });
  }

  sync() {
    for (const el of this.root.querySelectorAll('div.ted-embed[data-tedui-empty]')) {
      if (!el.querySelector(':scope > .ted-ui-media__link')) el.appendChild(this.linkRow(el));
    }
  }

  /** Поле ссылки в пустом блоке: адрес или название статьи CMS. */
  linkRow(el) {
    const ed = this.editor;
    const articles = ed.options.articles;
    const input = h('input', { type: 'text', class: 'ted-ui-input ted-ui-media__url', autocomplete: 'off', spellcheck: 'false',
      placeholder: articles ? 'Ссылка или название статьи' : 'Ссылка на статью или пост', 'aria-label': 'Ссылка для встраивания' });
    const button = h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary ted-ui-action--s ted-ui-media__link-go', text: 'Добавить' });
    const busy = (on) => { input.disabled = on; button.disabled = on; button.textContent = on ? 'Загрузка…' : 'Добавить'; };
    const submit = async () => {
      const text = input.value.trim();
      if (!text) return;
      const url = fixLink(text);
      if (!embedUrlOk(url)) {
        if (articles) return this.search(input, el, text, true);
        return ed.toast('Нужна ссылка: https://… или адрес страницы сайта', { status: 'error' });
      }
      busy(true);
      try {
        const data = await this.fetchCard(url);
        ed.subPopover.close();
        this.apply(el, data);
      } catch (err) {
        busy(false);
        ed.toast(err && err.message ? `Карточка не получена: ${err.message}` : 'Карточка не получена', { status: 'error' });
      }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (input.value.trim()) { submit(); return; }
      let next = el.nextElementSibling;
      if (!next || next.tagName !== 'P' || !isEmptyBlock(next)) { ed.history.commit(); next = emptyBlock(document); el.after(next); }
      ed.afterChange({ immediate: true, focus: next });
    });
    input.addEventListener('paste', (e) => e.stopPropagation());
    // текст без адреса — статьи CMS списком под полем (общее меню, как якоря в окне главы)
    if (articles) input.addEventListener('input', () => { const t = input.value.trim(); if (t && !/^(https?:|\/)/i.test(t)) this.search(input, el, t, false); else ed.subPopover.close(); });
    button.addEventListener('click', submit);
    return h('div', { class: 'ted-ui-field__row ted-ui-media__link', 'data-tedui-m': '' }, [input, button]);
  }

  async search(input, el, q, explicit) {
    const ed = this.editor;
    const articles = ed.options.articles;
    if (!articles || typeof articles.search !== 'function') return;
    const stamp = (this.searchStamp = (this.searchStamp || 0) + 1);
    let list = [];
    try { list = (await articles.search(q)) || []; } catch (e) { list = []; }
    if (stamp !== this.searchStamp || !input.isConnected) return;
    if (!list.length) { ed.subPopover.close(); if (explicit) ed.toast('Статьи не найдены'); return; }
    const items = list.slice(0, 8).map((a) => menuItem({ value: String(a.id ?? a.url), label: String(a.title || a.url || ''), iconName: 'text', onSelect: async () => {
      ed.subPopover.close();
      let full = a;
      if (articles.get && a.id != null) { try { full = { ...a, ...(await articles.get(a.id)) }; } catch (e) { full = a; } }
      this.apply(el, full);
    } }));
    ed.subPopover.open(items, input, { cls: 'ted-ui-pop--text ted-ui-pop--anchors' });
  }

  /**
   * Вставленную ссылку показать карточкой (выбор после вставки, заказчик 17.11): пустой блок встраивания на месте
   * пустого абзаца (или под ним) и сразу запрос карточки — как «Добавить» в поле блока (то же «Загрузка…» и сообщения).
   */
  fromUrl(after, url) {
    const ed = this.editor;
    ed.history.commit();
    const el = makeEmbedBlock(document);
    if (after && after.tagName === 'P' && isEmptyBlock(after)) after.replaceWith(el);
    else if (after) after.after(el);
    else this.root.appendChild(el);
    ed.afterChange({ immediate: true });
    this.sync();
    grow(el, 0);
    const row = el.querySelector(':scope > .ted-ui-media__link');
    if (!row) return el;
    row.querySelector('.ted-ui-media__url').value = url;
    row.querySelector('.ted-ui-media__link-go').click();
    return el;
  }

  /** Карточка по ссылке: провайдер CMS (OpenGraph на сервере). */
  async fetchCard(url) {
    const og = this.editor.options.opengraph;
    if (typeof og !== 'function') throw new Error('карточка по ссылке не подключена в CMS (опция opengraph)');
    const data = await og(url);
    return { ...data, url: data && data.url ? data.url : url };
  }

  apply(el, raw, extra = {}) {
    const ed = this.editor;
    const d = embedData({ ...raw, ...extra });
    if (!d.url) { ed.toast('У карточки нет ссылки', { status: 'error' }); return null; }
    ed.history.commit();
    const from = el.offsetHeight;
    const fresh = makeEmbedBlock(document, d, el.id);
    el.replaceWith(fresh);
    ed.afterChange({ immediate: true });
    grow(fresh, from);
    ed.selectObject(fresh);   // кнопки блока (⠿ 🗑) — у новой карточки, а не пропадают вместе с полем ссылки (заказчик 17.11)
    return fresh;
  }

  /** Окно «Настройки встраивания». */
  open(el) {
    const ed = this.editor;
    const d = readEmbed(el);
    const input = h('input', { class: 'ted-ui-input', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://example.com', value: d.url, 'aria-label': 'Ссылка' });
    const tInput = h('input', { type: 'checkbox', role: 'switch', class: 'ted-ui-toggle__input' });
    tInput.checked = d.compact;
    const compact = h('label', { class: 'ted-ui-toggle' }, [
      tInput,
      h('span', { class: 'ted-ui-toggle__track', 'aria-hidden': 'true' }, [h('span', { class: 'ted-ui-toggle__knob' }, [icon('check')])]),
      h('span', { class: 'ted-ui-toggle__text', text: 'В одну строку' }),
    ]);
    const cancel = () => ed.popover.close();
    let saving = false;
    const save = async () => {
      if (saving) return;
      const url = fixLink(input.value);
      if (!embedUrlOk(url)) { input.focus(); return ed.toast('Нужна ссылка: https://… или адрес страницы сайта', { status: 'error' }); }
      if (url === d.url) { ed.popover.close(); this.apply(el, { ...d, compact: tInput.checked }); return; }
      saving = true;
      try {
        const data = await this.fetchCard(url);
        ed.popover.close();
        this.apply(el, data, { compact: tInput.checked });
      } catch (err) {
        ed.toast(err && err.message ? `Карточка не получена: ${err.message}` : 'Карточка не получена', { status: 'error' });
      } finally { saving = false; }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [
        h('p', { class: 'ted-ui-form__title', text: 'Настройки встраивания' }),
        smallButton({ name: 'close', label: 'Закрыть', iconName: 'close-small', onClick: cancel }),
      ]),
      h('label', { class: 'ted-ui-field' }, [h('span', { class: 'ted-ui-field__label', text: 'Ссылка' }), input, h('span', { class: 'ted-ui-field__hint', text: 'Адрес статьи или поста.' })]),
      compact,
      h('div', { class: 'ted-ui-pop__line' }),
      h('div', { class: 'ted-ui-form__footer' }, [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Сохранить', onclick: save }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отмена', onclick: cancel }),
      ]),
    ];
    this.current = el;
    ed.handle.select(el);
    ed.updateState();
    ed.popover.openUnder(nodes, el, {
      onClose: () => { if (ed.handle.selected === el) ed.handle.select(null); this.current = null; ed.updateState(); },
    });
  }
}
