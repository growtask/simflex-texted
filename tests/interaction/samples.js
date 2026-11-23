// Образцы всех блоков и общие действия для тестов слоя взаимодействия (MODULAR_PLAN.md, этап 0).
// Слой взаимодействия — общий для всех блоков, поэтому каждая проверка прогоняется по всем видам блоков.
import { make } from '../helpers.js';

export const rect = (el) => el.getBoundingClientRect();
export const NARROW = 364;   // узкий редактор: демо админки на телефоне
export const WIDE = 1000;

/** Все виды блоков меню (кроме медиа и карточек — их сохранённый HTML задан ниже). */
export const MENU_TYPES = ['h2', 'p', 'blockquote', 'pre', 'callout', 'background', 'facts', 'proscons', 'ul', 'ol', 'checklist', 'steps', 'table', 'columns', 'hr', 'toc', 'accordion', 'tabs', 'button'];

const STATIC = [
  '<figure class="ted-media ted-media--image"><img src="/uf/images/a.webp" alt=""><figcaption>Подпись</figcaption></figure>',
  '<figure class="ted-media ted-media--gallery"><figure><img src="/uf/images/a.webp" alt=""></figure><figure><img src="/uf/images/b.webp" alt=""></figure></figure>',
  '<figure class="ted-media ted-media--video"><video src="/uf/video/a.mp4" controls></video></figure>',
  '<figure class="ted-media ted-media--file"><a href="/uf/files/a.pdf" download>Файл.pdf</a></figure>',
  '<figure class="ted-iframe"><iframe src="https://example.com/" height="200" title="Фрейм"></iframe><figcaption>Подпись</figcaption></figure>',
  '<div class="ted-embed"><div class="ted-embed__head"><span class="ted-embed__avatar">GI</span><span class="ted-embed__who"><span class="ted-embed__name">AndreyTimofeevich - Overview</span><span class="ted-embed__sub">GitHub</span></span></div><div class="ted-embed__foot"><a class="ted-embed__open" href="https://github.com/">Открыть</a></div></div>',
  '<div class="ted-product"><span class="ted-product__img"></span><div class="ted-product__text"><p class="ted-product__name">Наушники</p><p class="ted-product__price"><span class="ted-product__now">12 900 ₽</span></p></div><a class="ted-product__btn" href="/a">Перейти</a></div>',
];

/** Вставка блока той же функцией, что по плитке меню (chooseFromPicker → choose), без открытия меню с картинками. */
export function insertBlock(ed, type) {
  let last = ed.editable.lastElementChild;
  if (!last || last.tagName !== 'P' || last.textContent.trim() || last.className) {
    last = document.createElement('p');
    last.innerHTML = '<br>';
    ed.editable.appendChild(last);
    ed.afterChange({ immediate: true });
  }
  placeCaret(ed, last);
  const before = new Set(ed.editable.children);
  Object.assign(ed.blockMenu, { mode: 'insert', slash: null, target: last });
  ed.blockMenu.choose({ type });
  ed.popover.close();
  const added = [...ed.editable.children].filter((c) => !before.has(c));
  return added.find((c) => !(c.tagName === 'P' && !c.textContent.trim() && !c.className)) || added[0] || (type === 'p' ? last : null);
}

let cache = null;
/** Сохранённый HTML всех видов блоков: из меню (с текстом, как у автора) + медиа и карточки. */
export async function blockSamples() {
  if (cache) return cache;
  const src = make('<p><br></p>', {}, { width: NARROW });
  for (const t of MENU_TYPES) {
    const el = insertBlock(src, t);
    await new Promise((r) => setTimeout(r, 10));
    const sel = getSelection();
    const n = sel.rangeCount && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    if (el && n && src.editable.contains(n) && !(n.textContent || '').trim()) document.execCommand('insertText', false, 'Текст ' + t);
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = src.getInnerHTML();
  cache = [...tpl.content.children].map((el) => el.outerHTML).concat(STATIC);
  src.destroy();
  return cache;
}

/** Курсор в начало строки элемента. */
export function placeCaret(ed, el) {
  ed.editable.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(true);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  ed.updateState();
}

/** Блок в правке, как у автора: курсор в текст, нередактируемый (карточка, медиа, линия) — выделение целиком. */
export function focusBlock(ed, el) {
  if (el.getAttribute('contenteditable') === 'false' || el.classList.contains('ted-ui-media') || el.tagName === 'HR') { ed.selectObject(el); ed.updateState(); return; }
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (x) => (x.data.trim() && x.parentElement.isContentEditable ? 1 : 3) });
  const node = w.nextNode();
  ed.editable.focus();
  const r = document.createRange();
  if (node) r.setStart(node, 1); else r.selectNodeContents(el);
  r.collapse(true);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  ed.updateState();
  // у колонок весь текст — во внутренних блоках, кнопки встают у них (22.11); кнопки самих колонок — как после ручки «⠿» при наведении
  if (ed.handle.focused && ed.handle.focused !== el && el.contains(ed.handle.focused)) ed.handle.setFocused(el);
}

export const label = (el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '');

/** Рамка блока: ::after (у кода и линии — обводка и тень). */
export function frameOf(el) {
  const br = rect(el);
  if (!el.matches('pre, hr')) {
    const a = getComputedStyle(el, '::after');
    if (a.content === 'none' || a.content === 'normal') return null;
    return { top: br.top + parseFloat(a.top), bottom: br.bottom - parseFloat(a.bottom), left: br.left + parseFloat(a.left), right: br.right - parseFloat(a.right), inset: [a.top, a.right, a.bottom, a.left].join(' ') };
  }
  const cs = getComputedStyle(el);
  const o = cs.outlineStyle !== 'none' ? parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset) : parseFloat((/(\d+)px\)?\s*$/.exec(cs.boxShadow) || [0, 0])[1]) || 0;
  return { top: br.top - o, bottom: br.bottom + o, left: br.left - o, right: br.right + o, inset: `-${o}px` };
}

/** Видимое содержимое блока, которое вылезает за прямоугольник (обрезанное своим контейнером не считается). */
export function outside(el, box) {
  const inside = (x) => x.top >= box.top - 1 && x.bottom <= box.bottom + 1 && x.left >= box.left - 1 && x.right <= box.right + 1;
  for (const d of el.querySelectorAll('*')) {
    const st = getComputedStyle(d);
    const x = rect(d);
    if (!x.width || !x.height || st.visibility === 'hidden' || st.opacity === '0') continue;
    let clipped = false;
    for (let up = d.parentElement; up && up !== el; up = up.parentElement) {
      if (/hidden|clip|auto|scroll/.test(getComputedStyle(up).overflow)) { const c = rect(up); if (x.bottom > c.bottom + 1 || x.top < c.top - 1 || x.right > c.right + 1 || x.left < c.left - 1) clipped = true; }
    }
    if (!clipped && !inside(x)) return `${d.tagName}.${d.className} (${Math.round(x.top)}–${Math.round(x.bottom)}; рамка ${Math.round(box.top)}–${Math.round(box.bottom)})`;
  }
  return '';
}

/** Перетаскивание за ⠿ (палец или мышь) и отмена. */
export function dragBy(grip, dy, pointerType = 'mouse') {
  const g = rect(grip);
  const ev = (type, y) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType, isPrimary: true, button: 0, buttons: 1, clientX: g.left + 5, clientY: y }));
  ev('pointerdown', g.top + 5);
  for (let i = 1; i <= 5; i++) ev('pointermove', g.top + 5 + (i * dy) / 5);
}
export const cancelDrag = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
export const translateY = (el) => { const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(el).transform); return m ? parseFloat(m[1].split(',')[5]) : 0; };
