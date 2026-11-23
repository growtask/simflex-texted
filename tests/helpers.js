// Общие помощники автотестов Ted: создание редактора нужной ширины и темы, выделение, ввод, ожидание.
import Ted from '../src/index.js';
import { afterEach } from './harness.js';
export { Ted };
export const sandbox = document.createElement('div');
sandbox.style.cssText = 'position:absolute;left:0;top:0;width:1100px';
document.body.appendChild(sandbox);

let counter = 0;
let last = null;
const made = [];   // редакторы текущего теста — закрываются после него
afterEach(() => {
  for (const { ed, wrap } of made.splice(0)) { ed.destroy(); wrap.remove(); }
  last = null;
});
/** Новый редактор в песочнице. */
export function make(html = '<p>Текст</p>', options = {}, { width = 900, theme } = {}) {
  if (last && last.blockMenu && last.blockMenu.picker) last.blockMenu.closePicker();   // не оставляем чужие окна и их обработчики
  document.querySelectorAll('.ted-ui-pop, .ted-ui-picker').forEach((n) => n.remove());
  localStorage.removeItem('ted-typograf-off');
  const wrap = document.createElement('div');
  wrap.style.cssText = `width:${width}px;position:relative`;
  sandbox.appendChild(wrap);
  const host = document.createElement('div');
  host.id = `t${++counter}`;
  wrap.appendChild(host);
  const ed = Ted.create(host, { toasts: false, appear: false, unit: 'px', ...(theme ? { theme } : {}), ...options });   // appear: false — замеры без анимации появления
  ed.setHTML(html, { silent: true });
  last = ed;
  made.push({ ed, wrap });
  return ed;
}

export const blocks = (ed) => Array.from(ed.editable.children);
export const text = (el) => el.textContent.replace(/ /g, ' ');

/** Курсор / выделение внутри текстового узла блока. */
export function select(ed, blockIndex, from = 0, to = from) {
  ed.editable.focus();
  const block = blocks(ed)[blockIndex];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  const r = document.createRange();
  if (node) { r.setStart(node, from); r.setEnd(node, to); } else { r.selectNodeContents(block); r.collapse(true); }
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  document.dispatchEvent(new Event('selectionchange'));
}

export function selectAll(ed, blockIndex) {
  const block = blocks(ed)[blockIndex];
  select(ed, blockIndex, 0, block.textContent.length);
}


/** Всплывающее окно этого редактора. */
export const pop = (ed) => ed.popover.el;

/** Выделить подстроку внутри блока (в том числе внутри вложенного тега). */
export function selectText(ed, needle) {
  ed.editable.focus();
  const walker = document.createTreeWalker(ed.editable, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.data.indexOf(needle);
    if (i >= 0) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + needle.length);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
  }
  throw new Error(`текст «${needle}» не найден`);
}

export const tagOf = (ed, i = 0) => blocks(ed)[i].tagName.toLowerCase();
export function typeText(str) { document.execCommand('insertText', false, str); }

export function pressEnter(ed) {
  ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
}

export function html(ed) { return ed.getInnerHTML(); }
