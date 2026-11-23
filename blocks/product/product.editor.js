// Товар в правке (этап 6.5, макет block-product, окно editor-popover kind=product).
// Карточку правят в ней самой (решение 22.11): название, цена и старая цена — поля прямо в карточке, картинка — нажатием
// на неё загружается с компьютера (или из библиотеки CMS), как у медиа. Нажатие на кнопку карточки или её край —
// «Настройки товара» под блоком: ссылка (куда ведёт «Перейти»), а с каталогом CMS — поиск товара (options.products.search):
// выбор подставляет название, цены, картинку и ссылку (товар из каталога правится только выбором).

import { h, icon, smallButton, menuItem } from '../../src/ui/widgets.js';
import { emptyBlock, isEmptyBlock } from '../../src/core/blocks.js';
import { readProduct, productData, productPrice, makeProductBlock } from './product.js';

/** Поле цены — по ширине текста (как цена на сайте: старая цена сразу за новой). */
const fitField = (input) => { input.style.width = `${Math.max(3, (input.value || input.placeholder).length + 1)}ch`; };
/** Многострочное поле — по высоте текста (там, где нет CSS field-sizing; проверка 22.11). */
const fitHeight = (t) => requestAnimationFrame(() => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; });

/** Поля карточки в правке: [класс элемента сайта, заглушка, подпись]. */
const PRODUCT_FIELDS = [['ted-product__name', 'Название товара', 'Название'], ['ted-product__now', 'Цена', 'Цена'], ['ted-product__old', 'Старая цена', 'Старая цена']];

export class ProductUI {
  constructor(editor) {
    this.editor = editor;
    this.root = editor.editable;
    this.current = null;
    this.onClick = (e) => {
      if (this.editor.mode !== 'edit') return;
      const el = e.target && e.target.closest && e.target.closest('div.ted-product');
      if (!el || !this.root.contains(el)) return;
      if (e.target.closest('[data-tedui-m]')) return;   // поле карточки — своё
      e.preventDefault();
      const manual = !el.getAttribute('data-ted-product');
      if (manual && e.target.closest('.ted-product__img')) { this.pickImage(el); return; }
      this.open(el);
    };
    this.root.addEventListener('click', this.onClick);
  }

  destroy() { this.root.removeEventListener('click', this.onClick); }

  /** Поля прямо в карточке (ручной товар): название и цены. Служебные (data-tedui-m) — в HTML не попадают. */
  sync() {
    for (const el of this.root.querySelectorAll('div.ted-product')) {
      const manual = !el.getAttribute('data-ted-product');
      el.toggleAttribute('data-tedui-inline', manual);
      if (!manual) { for (const m of el.querySelectorAll('.ted-ui-prodfield')) m.remove(); continue; }
      const box = el.querySelector(':scope > .ted-product__text');
      if (!box || box.querySelector('.ted-ui-prodfield')) continue;
      const priceRow = h('div', { class: 'ted-ui-prodfield__row', 'data-tedui-m': '' });
      for (const [cls, ph, label] of PRODUCT_FIELDS) {
        const real = el.querySelector('.' + cls);
        // название — многострочное поле (длинное название переносится, как на сайте; проверка 22.11), цены — в одну строку
        const isName = cls === 'ted-product__name';
        const input = isName
          ? h('textarea', { class: 'ted-ui-prodfield ted-ui-prodfield--name', 'data-tedui-m': '', placeholder: ph, 'aria-label': label, autocomplete: 'off', rows: '1' })
          : h('input', { type: 'text', class: 'ted-ui-prodfield ted-ui-prodfield--' + cls.split('__')[1], 'data-tedui-m': '', placeholder: ph, 'aria-label': label, autocomplete: 'off', size: '1' });   // size 1 — поле сжимается по карточке (узкий редактор)
        input.value = real ? real.textContent : '';
        if (isName) fitHeight(input);
        if (cls !== 'ted-product__name') input.setAttribute('inputmode', 'decimal');
        this.bindField(el, input, cls);
        if (cls !== 'ted-product__name') fitField(input);
        if (cls === 'ted-product__name') box.insertBefore(input, box.firstChild); else priceRow.appendChild(input);
      }
      box.appendChild(priceRow);
    }
  }

  /** Ввод в поле карточки — сразу в данные блока (цена — в виде «12 900 ₽» после ухода из поля). */
  bindField(el, input, cls) {
    const ed = this.editor;
    const write = (final) => {
      const block = input.closest('div.ted-product');
      if (!block) return;
      let real = block.querySelector('.' + cls);
      if (!real && cls === 'ted-product__old') { real = document.createElement('s'); real.className = cls; block.querySelector('.ted-product__price')?.appendChild(real); }
      if (!real) return;
      const raw = input.value.replace(/\s+/g, ' ');
      real.textContent = cls === 'ted-product__name' ? raw.trim() : (productPrice(raw.trim()) || (final ? '' : raw.trim()));
      if (final && cls !== 'ted-product__name') { input.value = real.textContent; fitField(input); }
      if (cls === 'ted-product__old' && !real.textContent) real.remove();   // нет старой цены — нет и элемента (как у сохранённого товара)
      const filled = !!(block.querySelector('.ted-product__name')?.textContent.trim() || block.querySelector('.ted-product__now')?.textContent.trim());
      block.toggleAttribute('data-tedui-empty', !filled);
      const btn = block.querySelector('a.ted-product__btn');
      if (btn && filled && btn.textContent !== 'Перейти') btn.textContent = 'Перейти';
      ed.afterChange(final ? { immediate: true } : undefined);
    };
    input.addEventListener('focus', () => { ed.history.commit(); ed.handle.setFocused(el); });
    input.addEventListener('input', () => { write(false); if (cls !== 'ted-product__name') fitField(input); else fitHeight(input); });
    input.addEventListener('change', () => write(true));
    input.addEventListener('paste', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key !== 'Enter') return;
      e.preventDefault();
      write(true);
      // Enter — следующее поле карточки; в последнем — новый абзац под блоком (как у подписи медиа)
      const card = input.closest('div.ted-product') || el;
      const fields = [...card.querySelectorAll('.ted-ui-prodfield')];
      const next = fields[fields.indexOf(input) + 1];
      if (next) { next.focus(); return; }
      let p = card.nextElementSibling;
      if (!p || p.tagName !== 'P' || !isEmptyBlock(p)) { ed.history.commit(); p = emptyBlock(document); card.after(p); }
      ed.afterChange({ immediate: true, focus: p });
    });
  }

  /** Картинка товара: выбор файла и загрузка (как у медиа) или файл из библиотеки CMS. */
  async pickImage(el) {
    const ed = this.editor;
    try {
      const { source, assets } = await ed.chooseMedia('image');
      if (!assets.length || !el.isConnected) return;
      let url = '';
      if (source === 'manager') url = assets[0].url || '';
      else {
        const file = assets[0];
        const limit = ed.server.limits && ed.server.limits.image;
        if (limit && file.size > limit) return ed.toast('Картинка слишком большая — так настроено на сайте', { status: 'error' });
        el.setAttribute('data-tedui-loading', '');
        // картинка карточки ~160 px: сервер уменьшает до 480 (с запасом для ретины, решение 22.11) и сжимает в WebP
        const asset = await ed.options.upload(file, { kind: 'image', pagePath: ed.options.mediaPageUrl || location.pathname, maxSide: 480 });
        el.removeAttribute('data-tedui-loading');
        url = asset && asset.url ? asset.url : '';
        if (url) ed.mediaUploaded.add(url);
      }
      if (!url || !el.isConnected) return;
      const d = readProduct(el);
      this.apply(el, { ...d, manual: true, image: url });
    } catch (err) {
      el.removeAttribute('data-tedui-loading');
      ed.toast(err && err.message ? err.message : 'Не удалось загрузить картинку', { status: 'error' });
    }
  }

  /** Товар, который правят в окне «Настройки товара»: кнопки блока (⠿ 🗑) — у него. */
  focusBlock() { return this.current && this.current.isConnected ? this.current : null; }

  apply(el, raw) {
    const ed = this.editor;
    ed.history.commit();
    const fresh = makeProductBlock(document, raw, el.id);
    el.replaceWith(fresh);
    ed.afterChange({ immediate: true });
    ed.selectObject(fresh);   // кнопки блока остаются у товара
    return fresh;
  }

  open(el) {
    const ed = this.editor;
    const catalog = ed.options.products && typeof ed.options.products.search === 'function' ? ed.options.products : null;
    const empty = el.hasAttribute('data-tedui-empty');
    const cur = empty ? productData({}) : readProduct(el);
    let picked = !empty && !cur.manual ? cur : null;
    const field = (label, hint, attrs) => {
      const input = h('input', { class: 'ted-ui-input', type: 'text', autocomplete: 'off', ...attrs });
      return { input, el: h('label', { class: 'ted-ui-field' }, [h('span', { class: 'ted-ui-field__label', text: label }), input, h('span', { class: 'ted-ui-field__hint', text: hint })]) };
    };
    const search = field('Товар', 'Начните вводить название или артикул.', { placeholder: 'Alpine Lunch Box', value: picked ? picked.name : '', 'aria-label': 'Товар' });
    // название, цены и картинка — в самой карточке; в окне — только ссылка
    const url = field('Ссылка', 'Куда ведёт кнопка «Перейти».', { placeholder: 'https://example.com/product', spellcheck: 'false', value: cur.manual ? cur.url : '', 'aria-label': 'Ссылка' });
    const manualFields = h('div', { class: 'ted-ui-pop__group' }, [url.el]);
    // Switches/toggle size s — «Вручную, без каталога» (как «Открывать в новой вкладке»)
    const mInput = h('input', { type: 'checkbox', role: 'switch', class: 'ted-ui-toggle__input' });
    mInput.checked = !catalog || (!empty && cur.manual);
    const manualToggle = h('label', { class: 'ted-ui-toggle' }, [
      mInput,
      h('span', { class: 'ted-ui-toggle__track', 'aria-hidden': 'true' }, [h('span', { class: 'ted-ui-toggle__knob' }, [icon('check')])]),
      h('span', { class: 'ted-ui-toggle__text', text: 'Вручную, без каталога' }),
    ]);
    const mode = () => { search.el.hidden = mInput.checked; manualFields.hidden = !mInput.checked; if (ed.popover.isOpen) ed.popover.place(); };
    mInput.addEventListener('change', () => { ed.subPopover.close(); mode(); (mInput.checked ? url.input : search.input).focus(); });
    mode();
    // каталог CMS: список под полем
    let stamp = 0;
    search.input.addEventListener('input', async () => {
      picked = null;
      const q = search.input.value.trim();
      if (!q) { ed.subPopover.close(); return; }
      const my = ++stamp;
      let list = [];
      try { list = (await catalog.search(q)) || []; } catch (e) { list = []; }
      if (my !== stamp || !search.input.isConnected) return;
      if (!list.length) { ed.subPopover.close(); return; }
      const items = list.slice(0, 8).map((p) => menuItem({ value: String(p.id), label: `${p.name || p.title || ''}${p.sku ? ` · ${p.sku}` : ''}`, iconName: 'image', onSelect: async () => {
        ed.subPopover.close();
        let full = p;
        if (catalog.get) { try { full = { ...p, ...(await catalog.get(p.id)) }; } catch (e) { full = p; } }
        picked = productData({ ...full, manual: false });
        search.input.value = picked.name;
        search.input.focus();
      } }));
      ed.subPopover.open(items, search.input, { cls: 'ted-ui-pop--text ted-ui-pop--anchors' });
    });
    const cancel = () => { ed.subPopover.close(); ed.popover.close(); };
    const save = () => {
      if (mInput.checked) {
        const base = cur.manual ? cur : productData({});
        const d = productData({ ...base, manual: true, url: url.input.value.trim() });
        if (url.input.value.trim() && !d.url) { url.input.focus(); return ed.toast('Ссылка: https://… или адрес страницы сайта', { status: 'error' }); }
        cancel();
        if (!productData(d).name && !productData(d).price) {   // карточка ещё пустая: ссылку держим, название пишут в карточке
          el.querySelector('a.ted-product__btn')?.setAttribute('href', d.url);
          if (!d.url) el.querySelector('a.ted-product__btn')?.removeAttribute('href');
          const f = el.querySelector('.ted-ui-prodfield'); if (f) f.focus();
          return;
        }
        this.apply(el, d);
        return;
      }
      if (!picked) { search.input.focus(); return ed.toast('Выберите товар из списка'); }
      cancel();
      this.apply(el, picked);
    };
    url.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [
        h('p', { class: 'ted-ui-form__title', text: 'Настройки товара' }),
        smallButton({ name: 'close', label: 'Закрыть', iconName: 'close-small', onClick: cancel }),
      ]),
      catalog ? search.el : null,
      catalog ? manualToggle : null,
      manualFields,
      h('div', { class: 'ted-ui-form__footer' }, [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Сохранить', onclick: save }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отмена', onclick: cancel }),
      ]),
    ].filter(Boolean);
    this.current = el;
    ed.handle.select(el);
    ed.updateState();
    ed.popover.openUnder(nodes, el, {
      focus: '.ted-ui-input:not([hidden])',
      onClose: () => { ed.subPopover.close(); if (ed.handle.selected === el) ed.handle.select(null); this.current = null; ed.updateState(); },
    });
    (mInput.checked ? url.input : search.input).focus();
  }
}
