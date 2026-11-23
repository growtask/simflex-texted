// Блок «Товар» — полностью в папке (этап 5).
// Товар (этап 6.5, макет block-product, Action/product, окно editor-popover kind=product).
// Решение заказчика: из каталога CMS (опция products: search / get) и вручную; в ручном режиме кнопка «Перейти»;
// скидку показываем (старая цена зачёркнута), наличие — нет.
// Сайт (снимок данных):
//   <div class="ted-product" [data-ted-product="id"]>
//     <img class="ted-product__img" src alt="">
//     <div class="ted-product__text"><p class="ted-product__name">Название</p>
//       <p class="ted-product__price"><span class="ted-product__now">12 900 ₽</span>[<s class="ted-product__old">16 900 ₽</s>]</p></div>
//     <a class="ted-product__btn" href="/товар" [data-ted-cart="id"]>В корзину | Перейти</a>
//   </div>
// «В корзину» без скрипта — ссылка на товар; content.js шлёт событие ted:add-to-cart (CMS кладёт товар в корзину и отменяет переход).

import PRODUCT_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../src/core/registry.js';
import { urlOk } from '../../src/core/urls.js';
import { ProductUI } from './product.editor.js';

const PRODUCT_URL_RE = /^(https?:\/\/|\/(?!\/))/i;
const prodLine = (s, n = 200) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const prodEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const prodUrlOk = (v) => { const s = String(v || '').trim(); return !!s && PRODUCT_URL_RE.test(s) && urlOk(s, 'link') && !/[\s<>"'`]/.test(s); };

/** Цена: число → «12 900 ₽»; строка — как есть (только цифры, пробелы, знаки валют и разделители). */
export function productPrice(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && isFinite(v)) return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(v)} ₽`;
  const s = prodLine(v, 40);
  if (/^\d[\d\s .,]*$/.test(s)) {
    const n = Number(s.replace(/[\s ]/g, '').replace(',', '.'));
    return isFinite(n) ? productPrice(n) : '';
  }
  return /^[\d\s .,₽$€£¥₸₴руб.р-]+$/i.test(s) && /\d/.test(s) ? s : '';
}
const priceNum = (s) => Number(String(s).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

/** Данные товара (ответ каталога CMS или ручной ввод). */
export function productData(raw = {}) {
  const manual = !!raw.manual || raw.id == null || raw.id === '';
  const price = productPrice(raw.price);
  let old = productPrice(raw.oldPrice ?? raw.old);
  if (old && price && priceNum(old) <= priceNum(price)) old = '';   // скидки нет — старую цену не показываем
  return {
    id: manual ? '' : prodLine(raw.id, 64).replace(/[^\w-]/g, ''),
    name: prodLine(raw.name ?? raw.title, 200),
    price,
    old,
    image: prodUrlOk(raw.image) ? String(raw.image).trim() : '',
    url: prodUrlOk(raw.url) ? String(raw.url).trim() : '',
    manual,
  };
}

export function readProduct(node) {
  const q = (s) => node.querySelector(s);
  const btn = q('a.ted-product__btn');
  const id = node.getAttribute('data-ted-product') || '';
  return productData({
    id,
    manual: !id,
    name: q('.ted-product__name')?.textContent,
    price: q('.ted-product__now')?.textContent,
    oldPrice: q('.ted-product__old')?.textContent,
    image: q('img.ted-product__img')?.getAttribute('src'),
    url: btn ? btn.getAttribute('href') : '',
  });
}

/** Пустой товар (макет block-product, state=empty): заглушки «Выберите товар» и «0 ₽». */
export const productEmpty = (d) => !d.name && !d.price;

/** HTML блока: edit — нередактируемый блок правки (пустой — с заглушками). */
export function productHTML(d, { id = '', edit = false } = {}) {
  const empty = productEmpty(d);
  if (empty && !edit) return '';
  const attrs = `${id ? ` id="${prodEsc(id)}"` : ''}${d.id ? ` data-ted-product="${prodEsc(d.id)}"` : ''}${edit ? ' contenteditable="false"' : ''}${edit && empty ? ' data-tedui-empty=""' : ''}`;
  const img = d.image ? `<img class="ted-product__img" src="${prodEsc(d.image)}" alt="">` : '<span class="ted-product__img"></span>';
  // пустой блок правки: заглушки «Выберите товар» и «0 ₽» рисует CSS (в разметке пусто — пустой товар не сохраняется)
  const name = `<p class="ted-product__name">${prodEsc(d.name)}</p>`;
  const price = `<p class="ted-product__price"><span class="ted-product__now">${prodEsc(d.price)}</span>${d.old ? `<s class="ted-product__old">${prodEsc(d.old)}</s>` : ''}</p>`;
  const external = /^https?:/i.test(d.url);
  const href = d.url ? ` href="${prodEsc(d.url)}"${external && d.manual ? ' target="_blank" rel="noopener"' : ''}` : '';
  const btn = `<a class="ted-product__btn"${href}${d.id ? ` data-ted-cart="${prodEsc(d.id)}"` : ''}>${d.manual && !empty ? 'Перейти' : 'В корзину'}</a>`;
  return `<div class="ted-product"${attrs}>${img}<div class="ted-product__text">${name}${price}</div>${btn}</div>`;
}

export function makeProductBlock(doc, raw = {}, id = '') {
  const tpl = doc.createElement('template');
  tpl.innerHTML = productHTML(productData(raw), { id, edit: true });
  return tpl.content.firstElementChild;
}

export function cleanProduct(node, doc, idOk) {
  if (node.hasAttribute('data-tedui-empty')) return null;   // пустой блок правки (заглушки) не сохраняется
  const d = readProduct(node);
  if (productEmpty(d)) return null;
  return makeProductBlock(doc, d, idOk && idOk(node.id) ? node.id : '');
}

/** Правка: блок пересобирается из своих данных, если разметка разошлась с эталоном. */
export function normalizeProduct(el, doc) {
  const d = el.hasAttribute('data-tedui-empty') ? productData({ manual: !el.getAttribute('data-ted-product') }) : readProduct(el);
  const want = productHTML(d, { id: el.id, edit: true });
  const probe = el.cloneNode(true);
  for (const at of [...probe.attributes]) if (at.name.startsWith('data-tedui-') && at.name !== 'data-tedui-empty') probe.removeAttribute(at.name);
  for (const m of probe.querySelectorAll('[data-tedui-m]')) m.remove();   // поля правки в карточке (название, цены) — служебные
  for (const n of probe.querySelectorAll('*')) for (const at of [...n.attributes]) if (at.name.startsWith('data-tedui-')) n.removeAttribute(at.name);
  const tpl = doc.createElement('template');
  tpl.innerHTML = want;   // сравниваем разобранную разметку (неразрывный пробел и &nbsp; — одно и то же)
  if (tpl.content.firstElementChild && probe.outerHTML === tpl.content.firstElementChild.outerHTML) return false;
  el.replaceWith(makeProductBlock(doc, d, el.id));
  return true;
}

/** Свои загруженные файлы в HTML (картинки товаров) — чтобы при сохранении их не сочли лишними (cleanupMedia). */
export function productFilesOf(html, base = '/uf') {
  const prefix = String(base || '/uf').replace(/\/+$/, '') + '/';
  const urls = new Set();
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  for (const img of doc.querySelectorAll('.ted-product img.ted-product__img[src]')) {
    const v = img.getAttribute('src');
    if (v && v.startsWith(prefix)) urls.add(v);
  }
  return urls;
}

export function serializeProduct(el) {
  if (el.hasAttribute('data-tedui-empty')) return '';
  return productHTML(readProduct(el), { id: el.id });
}


registerBlock({
  ...PRODUCT_BLOCK,
  match: (el) => el.tagName === 'DIV' && el.classList.contains('ted-product'),
  /** Макет block-product, state=empty: «Выберите товар», «0 ₽»; после вставки сразу открывается «Настройки товара». */
  create: (doc) => ({ el: makeProductBlock(doc, {}), focus: null }),
  // с каталогом CMS — окно поиска товара; без каталога — курсор в название прямо в карточке (решение 22.11)
  afterInsert: (editor, el) => {
    if (!editor.products) return;
    const catalog = editor.options.products && typeof editor.options.products.search === 'function';
    if (catalog) { editor.products.open(el); return; }
    editor.products.sync();
    el.querySelector('.ted-ui-prodfield')?.focus();
  },
  clean: cleanProduct,
  serialize: serializeProduct,
  normalize: normalizeProduct,
  filesOf: productFilesOf,
  canAlign: () => false,
  canBg: () => false,
  editorUi: (editor) => new ProductUI(editor),
  editorUiName: 'products',
  /** В наборе без товара — «Название — цена» ссылкой на товар; так же на сервере — product.php. */
  toText: (el, { p, esc }) => {
    const n = el.querySelector('.ted-product__name');
    const pr = el.querySelector('.ted-product__now');
    const a = el.querySelector('a.ted-product__btn[href]');
    const t = esc([(n && n.textContent.trim()) || '', (pr && pr.textContent.trim()) || ''].filter(Boolean).join(' — '));
    return t ? [p(a ? '<a href="' + esc(a.getAttribute('href')) + '">' + t + '</a>' : t)] : [];
  },
});
