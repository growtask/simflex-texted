// Блок «Кнопка» (этап 6.5, макет block-button, библиотека Action/button: button, double, banner) — полностью в папке (этап 5).
// Сайт:
//   <div class="ted-button [ted-align-center|right]"><a class="ted-button__btn" href="…">Текст</a>[<a class="ted-button__btn ted-button__btn--secondary" href="…">…</a>]</div>
//   <div class="ted-button ted-button--banner"><div class="ted-button__text"><p class="ted-button__title">…</p><p class="ted-button__desc">…</p></div><a class="ted-button__btn" href="…">…</a></div>
// Правка: та же разметка; кнопки нередактируемые (текст и ссылка — в окне «Настройки кнопки», button.editor.js), заголовок и текст
// баннера — строки текста. Без скрипта: ссылки-кнопки. Не больше двух кнопок; у баннера одна.

import BUTTON_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../src/core/registry.js';
import { ButtonUI } from './button.editor.js';
import { urlOk } from '../../src/core/urls.js';

const BUTTON_ZW = new RegExp(String.fromCharCode(0x200b), 'g');

/** Ссылка кнопки допустима: http(s), mailto, tel, путь или якорь; javascript: и прочие схемы — нет (общее правило core/urls.js). */
export function buttonHrefOk(href) {
  const s = String(href || '').trim();
  return !!s && urlOk(s, 'link') && !/[\s<>"]/.test(s);
}

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Кнопка-ссылка: secondary — вторая (Buttons/main secondary). В правке нередактируемая. */
export function makeButtonLink(doc, { text = '', href = '', blank = false, secondary = false } = {}, edit = true) {
  const a = doc.createElement('a');
  a.className = secondary ? 'ted-button__btn ted-button__btn--secondary' : 'ted-button__btn';
  if (buttonHrefOk(href)) a.setAttribute('href', href.trim());
  if (blank) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
  a.textContent = oneLine(text);
  if (edit) a.setAttribute('contenteditable', 'false');
  return a;
}

/** Текст баннера: заголовок и описание (строки текста). */
function makeBannerText(doc, title = '', desc = '') {
  const box = doc.createElement('div');
  box.className = 'ted-button__text';
  const t = doc.createElement('p');
  t.className = 'ted-button__title';
  const d = doc.createElement('p');
  d.className = 'ted-button__desc';
  for (const [el, v] of [[t, title], [d, desc]]) { if (oneLine(v)) el.textContent = oneLine(v); else el.appendChild(doc.createElement('br')); }
  box.append(t, d);
  return box;
}

/** Блок: buttons — [{ text, href, blank }], banner — { title, desc } или null. */
export function makeButtonBlock(doc, { buttons = [{}], banner = null, align = '' } = {}, edit = true) {
  const el = doc.createElement('div');
  el.className = 'ted-button';
  if (banner) {
    el.classList.add('ted-button--banner');
    el.appendChild(makeBannerText(doc, banner.title, banner.desc));
    el.appendChild(makeButtonLink(doc, buttons[0] || {}, edit));
    return el;
  }
  if (align === 'center' || align === 'right') el.classList.add(`ted-align-${align}`);
  buttons.slice(0, 2).forEach((b, i) => el.appendChild(makeButtonLink(doc, { ...b, secondary: i === 1 }, edit)));
  return el;
}

/** Данные блока (из вывода сайта или формы правки). */
export function readButtonBlock(node) {
  const links = [...node.querySelectorAll(':scope > a, :scope > .ted-button__row > a')].slice(0, 2);
  const buttons = links.map((a) => ({ text: oneLine(a.textContent), href: a.getAttribute('href') || '', blank: a.getAttribute('target') === '_blank' }));
  const isBanner = node.classList.contains('ted-button--banner');
  const align = node.classList.contains('ted-align-center') ? 'center' : node.classList.contains('ted-align-right') ? 'right' : '';
  const banner = isBanner ? {
    title: oneLine(node.querySelector('.ted-button__title')?.textContent),
    desc: oneLine(node.querySelector('.ted-button__desc')?.textContent),
  } : null;
  return { buttons: buttons.length ? (isBanner ? buttons.slice(0, 1) : buttons) : [{}], banner, align };
}

/** Чужой или наш HTML → форма правки. */
export function cleanButton(node, doc, idOk) {
  const el = makeButtonBlock(doc, readButtonBlock(node), true);
  if (idOk && idOk(node.id)) el.id = node.id;
  return el;
}

/** Правка: структура как у makeButtonBlock (после ввода, вставки, Undo). */
export function normalizeButton(el, doc) {
  const data = readButtonBlock(el);
  const isBanner = !!data.banner;
  const links = [...el.querySelectorAll(':scope > a')];
  const text = el.querySelector(':scope > .ted-button__text');
  const okStruct = (isBanner
    ? el.children.length === 2 && text && el.children[0] === text && text.children.length === 2 && text.children[0].matches('p.ted-button__title') && text.children[1].matches('p.ted-button__desc') && links.length === 1
    : links.length >= 1 && links.length <= 2 && el.children.length === links.length)
    && links.every((a) => a.getAttribute('contenteditable') === 'false')
    && [...el.childNodes].every((n) => n.nodeType === 1);
  if (okStruct) {
    // строки баннера — только текст
    let changed = false;
    if (text) for (const p of text.children) {
      if (p.querySelector('*:not(br)') || (!p.textContent && !p.querySelector('br'))) { const v = oneLine(p.textContent); p.replaceChildren(v ? doc.createTextNode(v) : doc.createElement('br')); changed = true; }
    }
    return changed;
  }
  const fresh = makeButtonBlock(doc, data, true);
  if (el.id) fresh.id = el.id;
  el.replaceChildren(...fresh.childNodes);
  el.className = fresh.className;
  return true;
}

/** Форма правки → HTML сайта (кнопки без текста не выводятся). */
export function serializeButton(el) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const d = readButtonBlock(el);
  const id = el.id ? ` id="${esc(el.id)}"` : '';
  const link = (b, i) => {
    if (!b.text) return '';
    const href = buttonHrefOk(b.href) ? ` href="${esc(b.href.trim())}"` : '';
    const blank = b.blank ? ' target="_blank" rel="noopener"' : '';
    return `<a class="ted-button__btn${i === 1 ? ' ted-button__btn--secondary' : ''}"${href}${blank}>${esc(b.text)}</a>`;
  };
  const btns = d.buttons.map(link).filter(Boolean);
  if (d.banner) {
    if (!d.banner.title && !d.banner.desc && !btns.length) return '';
    const t = d.banner.title ? `<p class="ted-button__title">${esc(d.banner.title)}</p>` : '';
    const s = d.banner.desc ? `<p class="ted-button__desc">${esc(d.banner.desc)}</p>` : '';
    return `<div class="ted-button ted-button--banner"${id}><div class="ted-button__text">${t}${s}</div>${btns.join('')}</div>`;
  }
  if (!btns.length) return '';
  const align = d.align ? ` ted-align-${d.align}` : '';
  return `<div class="ted-button${align}"${id}>${btns.join('')}</div>`;
}


registerBlock({
  ...BUTTON_BLOCK,
  match: (el) => el.tagName === 'DIV' && el.classList.contains('ted-button'),
  /** Макет block-button, state=empty: одна кнопка «Текст кнопки»; после вставки сразу открывается окно «Настройки кнопки». */
  create: (doc) => ({ el: makeButtonBlock(doc, { buttons: [{}] }), focus: null }),
  afterInsert: (editor, el) => { if (editor.buttons) editor.buttons.open(el.querySelector(':scope > a')); },
  clean: cleanButton,
  serialize: serializeButton,
  normalize: normalizeButton,
  canAlign: (el) => !el.classList.contains('ted-button--banner'),   // баннер — на всю ширину колонки
  editorUi: (editor) => new ButtonUI(editor),
  editorUiName: 'buttons',
  /** В наборе без кнопки: заголовок баннера жирным, текст, кнопки — ссылками (так же на сервере — button.php). */
  toText: (el, { p, esc }) => {
    const out = [];
    const t = el.querySelector('.ted-button__title');
    const d = el.querySelector('.ted-button__desc');
    if (t && t.textContent.trim()) out.push(p('<strong>' + esc(t.textContent.trim()) + '</strong>'));
    if (d && d.textContent.trim()) out.push(p(esc(d.textContent.trim())));
    for (const a of el.querySelectorAll(':scope > a')) if (a.textContent.trim()) out.push(p(a.getAttribute('href') ? '<a href="' + esc(a.getAttribute('href')) + '">' + esc(a.textContent.trim()) + '</a>' : esc(a.textContent.trim())));
    return out;
  },
  /** «Текст кнопки» в пустой кнопке (макет block-button, empty); у баннера — «Заголовок» и «Текст». */
  placeholders: (editor, root) => {
    for (const a of root.querySelectorAll('div.ted-button > a')) if (!a.textContent.trim()) a.setAttribute('data-tedui-ph', 'Текст кнопки');
    for (const t of root.querySelectorAll('div.ted-button > .ted-button__text > p')) {
      if (!t.textContent.replace(BUTTON_ZW, '').trim()) t.setAttribute('data-tedui-ph', t.classList.contains('ted-button__title') ? 'Заголовок' : 'Текст');
    }
  },
});
