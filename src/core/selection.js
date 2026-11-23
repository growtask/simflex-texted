// Работа с выделением: сохранение/восстановление позиции курсора через
// «смещение в символах» от начала редактора. Так курсор переживает любые
// перестройки DOM (смена типа блока, undo/redo, нормализация).

import { isWrap } from './registry.js';

/** Текущий Range, если он внутри root. */
export function getRange(root) {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  return range;
}

// Каждый блок верхнего уровня добавляет 1 «символ»-разделитель, иначе позиция
// в конце одного блока и в начале следующего совпадала бы.
function walkOffset(root, container, offset) {
  let count = 0;
  let found = -1;
  const visit = (node, isBlockStart) => {
    if (found >= 0) return;
    if (node.nodeType === 1 && node.hasAttribute('data-tedui-media-panel')) return;
    if (node === container && node.nodeType !== 3) {
      // смещение указывает на дочерний узел
      for (let i = 0; i < offset && i < node.childNodes.length; i++) count += textLen(node.childNodes[i], node === root);
      found = count;
      return;
    }
    if (node.nodeType === 3) {
      if (node === container) {
        found = count + offset;
        return;
      }
      count += node.data.length;
      return;
    }
    const isRoot = node === root;
    for (const child of node.childNodes) {
      visit(child, isRoot);
      if (found >= 0) return;
      if (isRoot) count += 1;
    }
  };
  visit(root, false);
  return found < 0 ? count : found;
}

function textLen(node, isTopLevel) {
  let len = node.nodeType === 3 ? node.data.length : node.textContent.length;
  if (node.nodeType === 1 && isWrap(node)) {   // обёртка правки (медиа): текст её панели не считается
    for (const ui of node.querySelectorAll('[data-tedui-media-panel]')) len -= ui.textContent.length;
  }
  return len + (isTopLevel ? 1 : 0);
}

export function saveSelection(root) {
  const range = getRange(root);
  if (!range) return null;
  return {
    start: walkOffset(root, range.startContainer, range.startOffset),
    end: walkOffset(root, range.endContainer, range.endOffset),
  };
}

function findPoint(root, target) {
  let count = 0;
  let lastText = null;
  for (let i = 0; i < root.childNodes.length; i++) {
    const block = root.childNodes[i];
    const len = textLen(block, false);
    if (target <= count + len) {
      const walker = root.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (node.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
          return node.hasAttribute('data-tedui-media-panel') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        },
      });
      let local = target - count;
      let t;
      while ((t = walker.nextNode())) {
        lastText = t;
        if (local <= t.data.length) return { node: t, offset: local };
        local -= t.data.length;
      }
      // пустой блок: курсор в его начало
      return { node: block, offset: 0 };
    }
    count += len + 1;
  }
  if (lastText) return { node: lastText, offset: lastText.data.length };
  const last = root.lastChild;
  return last ? { node: last, offset: last.childNodes.length } : { node: root, offset: 0 };
}

export function restoreSelection(root, saved) {
  if (!saved) return;
  const a = findPoint(root, saved.start);
  const b = saved.end === saved.start ? a : findPoint(root, saved.end);
  const range = root.ownerDocument.createRange();
  try {
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
  } catch (e) {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  const sel = root.ownerDocument.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Блок верхнего уровня, в котором находится узел. */
export function topBlockOf(root, node) {
  let n = node;
  while (n && n.parentNode !== root) {
    const parent = n.parentNode;
    if (!parent) return null;
    // тело контейнера (ответ аккордеона и т. п.) — свой «корень» блоков: блок — его прямой ребёнок
    if (parent.nodeType === 1 && parent.classList && parent.classList.contains('ted-ui-host') && root.contains(parent)) return n;
    n = parent;
  }
  return n && n.parentNode === root ? n : null;
}

/** Все блоки верхнего уровня, задетые выделением. */
export function selectedBlocks(root) {
  const range = getRange(root);
  if (!range) return [];
  const first = topBlockOf(root, range.startContainer === root ? root.childNodes[range.startOffset] || root.lastChild : range.startContainer);
  const last = topBlockOf(root, range.endContainer === root ? root.childNodes[Math.max(0, range.endOffset - 1)] || root.lastChild : range.endContainer);
  if (!first) return [];
  const out = [];
  for (let n = first; n; n = n.nextSibling) {
    if (n.nodeType === 1) out.push(n);
    if (n === last) break;
  }
  return out;
}

/** Курсор в самом начале элемента? */
export function isAtStart(el, range) {
  if (!range || !range.collapsed) return false;
  const r = el.ownerDocument.createRange();
  r.selectNodeContents(el);
  r.setEnd(range.startContainer, range.startOffset);
  return r.toString().length === 0;
}

/** Курсор в самом конце элемента? */
export function isAtEnd(el, range) {
  if (!range || !range.collapsed) return false;
  const r = el.ownerDocument.createRange();
  r.selectNodeContents(el);
  r.setStart(range.endContainer, range.endOffset);
  return r.toString().length === 0;
}

export function placeCaret(el, atEnd = false) {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  range.collapse(!atEnd);
  const sel = el.ownerDocument.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
