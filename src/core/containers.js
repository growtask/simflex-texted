// Блоки-контейнеры этапа 6: внутри — обычные блоки (абзацы, списки, медиа, таблица …), кроме цветного фона и других контейнеров.
// В редакторе тело контейнера — «хост» блоков (.ted-ui-host): определение текущего блока, «/», медиа и Enter работают в нём,
// как в корне. На сайте — своя разметка без скриптов (аккордеон — <details>/<summary> с разметкой FAQ schema.org).

import { registeredBlocks } from './registry.js';

export const HOST_CLASS = 'ted-ui-host';
/** CSS-селектор контейнеров: блоки реестра с block.json → container (аккордеон, вкладки, колонки). */
export const containerSel = () => registeredBlocks().filter((d) => d.container && d.selector).map((d) => d.selector).join(', ') || ':not(*)';

/** Элемент — тело контейнера, где лежат блоки. */
export const isHost = (el) => !!(el && el.nodeType === 1 && el.classList.contains(HOST_CLASS));

/** Родитель блоков: корень редактора или тело контейнера внутри него. */
export const isBlockParent = (el, root) => el === root || (isHost(el) && root.contains(el));

/** Блок верхнего уровня (прямой ребёнок корня), внутри которого лежит узел. */
export function rootBlockOf(root, node) {
  let n = node;
  while (n && n.parentNode !== root) { n = n.parentNode; if (!n) return null; }
  return n && n.parentNode === root ? n : null;
}

export const isContainer = (el) => !!(el && el.nodeType === 1 && el.matches(containerSel()));

/** Внутри тела контейнера нет цветного фона и других контейнеров (вложенные раскрываются в текст). */
export function stripInHost(frag, doc) {
  for (const el of [...frag.querySelectorAll('[class*="ted-bg-"]')]) {
    for (const c of [...el.classList]) if (c.startsWith('ted-bg-')) el.classList.remove(c);
    if (!el.className) el.removeAttribute('class');
  }
  // блок, который в теле контейнера не живёт, раскрывается в текст сам (blocks/<тип>/<тип>.js → unnest: вкладки, аккордеон, колонки)
  for (const d of registeredBlocks()) {
    if (!d.unnest || !d.selector) continue;
    for (const inner of [...frag.querySelectorAll(d.selector)]) inner.replaceWith(d.unnest(inner, doc));
  }
}
