// Очистка HTML: из любого входа (старый контент TinyMCE, вставка из Word /
// Google Docs, DOM редактора) получаем чистую семантическую разметку.
//
// Разрешено:
//   блоки:   p, h2–h6, ul, ol, li, blockquote, pre, hr
//   строчные: strong, em, u, s, code, a[href], sub, sup, br
// Замены: b→strong, i→em, strike/del→s, ins→u, h1→h2, div→p,
//         span со стилями жирного/курсива/подчёркивания/зачёркивания → теги.
// Незнакомые блоки (таблицы, картинки, iframe…) не удаляются, а сохраняются
// как есть в «сыром» блоке — чтобы не потерять старый контент.

import { highlightFragment, normalizeLang, detectCodeLang } from './highlight.js';
import { urlOk, srcsetOk } from './urls.js';
import { cleanByAllowlist, ID_PATTERN } from './allowlist.js';
import { registeredBlocks, defOf, isWrap } from './registry.js';
export const BLOCK_TAGS = ['P', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'];

/** Тег блочного элемента: ядро + блоки реестра (этап 5: тег из selector в block.json, например hr). Только у селектора
 *  без обязательного класса: figure.ted-iframe или div.ted-button не делают блоком любой <figure> / <div>. */
export function isBlockTag(tag) {
  const t = String(tag).toUpperCase();
  return BLOCK_TAGS.includes(t) || registeredBlocks().some((d) => d.selector && /^[a-z0-9]+(?::not\([^)]*\))*$/.test(d.selector) && d.selector.split(/[.#[:\s]/)[0].toUpperCase() === t);
}
export const HEADING_TAGS = ['H2', 'H3', 'H4', 'H5', 'H6'];

const INLINE_MAP = {
  STRONG: 'strong', B: 'strong',
  EM: 'em', I: 'em', CITE: 'em', DFN: 'em',
  U: 'u', INS: 'u',
  S: 's', STRIKE: 's', DEL: 's',
  CODE: 'code', KBD: 'code', SAMP: 'code', TT: 'code',
  SUB: 'sub', SUP: 'sup',
  A: 'a',
  MARK: 'mark',
};

const DROP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE',
  'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'O:P', 'XML',
]);

// Блоки, которые пока не редактируем, но сохраняем без изменений
const RAW_TAGS = new Set([
  'TABLE', 'FIGURE', 'IMG', 'PICTURE', 'IFRAME', 'VIDEO', 'AUDIO', 'OBJECT', 'EMBED',
  'SVG', 'CANVAS', 'FORM', 'DETAILS', 'DL', 'ADDRESS', 'MAP',
]);

// Контейнеры, которые просто «разворачиваем»
const UNWRAP_BLOCK_TAGS = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'CENTER',
  'BODY', 'HTML', 'FIELDSET',
]);

const ALIGN_CLASS = /^ted-align-(center|right)$/;
const BG_CLASS = /^ted-bg-(gray|color1|color2)$/;
const ID_RE = ID_PATTERN;   // id — как на сервере: с буквы, до 64 знаков (core/allowlist.js)

const isWhitespace = (s) => !/[^\t\n\r ]/.test(s);


// Подсветка в сохранённом HTML (<span class="ted-k"…>) нужна только при сохранении; при загрузке в редактор спаны сразу снимаются, поэтому их не создаём.
let emitTokens = true;
export function withoutTokens(fn) {
  const prev = emitTokens;
  emitTokens = false;
  try { return fn(); } finally { emitTokens = prev; }
}
/** HTML-строка → чистый DocumentFragment (для редактора). */
export function sanitizeHTML(html, doc = document) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  const src = unwrapTedRoot(tpl.content);
  return sanitizeNodes(src.childNodes, doc);
}

/** Набор узлов → чистый DocumentFragment из блоков. */
export function sanitizeNodes(nodes, doc = document) {
  const out = doc.createDocumentFragment();
  const ctx = { doc, out, para: null };
  const wordLists = [];
  let wordListId;
  for (const node of Array.from(nodes)) {
    const wordItem = readWordListItem(node);
    if (wordItem) {
      closePara(ctx);
      const { id, level, marker, tag } = wordItem;
      if (id !== wordListId) wordLists.length = 0;
      wordListId = id;
      while (wordLists.length && wordLists.at(-1).level > level) wordLists.pop();
      let entry = wordLists.at(-1);
      if (entry?.level === level && entry.list.tagName !== tag) {
        wordLists.pop();
        entry = wordLists.at(-1);
      }
      if (entry?.level !== level) {
        const list = doc.createElement(tag);
        const number = marker.textContent.trim().match(/^(\d+)[.)]$/)?.[1];
        if (tag === 'OL' && number && Number(number) !== 1) list.start = Number(number);
        (entry?.list.lastElementChild || out).appendChild(list);
        entry = { level, list };
        wordLists.push(entry);
      }
      const li = doc.createElement('li');
      cleanInlineChildren(node, li, doc, { skipNode: marker });
      trimBlock(li);
      if (li.firstChild) entry.list.appendChild(li);
      else if (!entry.list.firstChild) {
        entry.list.remove();
        wordLists.pop();
      }
      continue;
    }
    if (node.nodeType === 3 && isWhitespace(node.data)) {
      cleanBlockLevel(node, ctx);
      continue;
    }
    wordLists.length = 0;
    cleanBlockLevel(node, ctx);
  }
  return out;
}

function readWordListItem(node) {
  if (node.nodeName !== 'P' || isHiddenNode(node)) return null;
  const list = node.getAttribute('style')?.match(/(?:^|;)\s*mso-list\s*:\s*(l\d+)\s+level(\d+)\s+(lfo\d+)/i);
  if (!list) return null;
  const marker = Array.from(node.querySelectorAll('span[style]')).find((span) =>
    /(?:^|;)\s*mso-list\s*:\s*ignore\s*(?:;|$)/i.test(span.getAttribute('style')));
  if (!marker) return null;
  const tag = /^(?:\(?[\da-z]+[.)])+(?:\.)?$/i.test(marker.textContent.trim()) ? 'OL' : 'UL';
  return { id: `${list[1]} ${list[3]}`, level: Number(list[2]), marker, tag };
}

// Если на вход пришёл наш же вывод <div class="ted-content">…</div> — берём содержимое
function unwrapTedRoot(frag) {
  const els = Array.from(frag.childNodes).filter((n) => !(n.nodeType === 3 && isWhitespace(n.data)));
  if (els.length === 1 && els[0].nodeType === 1 && els[0].classList.contains('ted-content')) return els[0];
  return frag;
}

function closePara(ctx) {
  ctx.para = null;
}

function ensurePara(ctx) {
  if (!ctx.para) {
    ctx.para = ctx.doc.createElement('p');
    ctx.out.appendChild(ctx.para);
  }
  return ctx.para;
}

function cleanBlockLevel(node, ctx) {
  const { doc } = ctx;

  if (node.nodeType === 3) {
    if (isWhitespace(node.data)) {
      if (ctx.para && ctx.para.lastChild) ctx.para.appendChild(doc.createTextNode(' '));
      return;
    }
    ensurePara(ctx).appendChild(doc.createTextNode(collapse(node.data)));
    return;
  }
  if (node.nodeType !== 1) return;

  const tag = node.tagName.toUpperCase();
  if (DROP_TAGS.has(tag) || isHiddenNode(node)) return;

  // блок из реестра (этап 5): очистку делает сам блок — clean(node, doc, idOk) из blocks/<тип>/<тип>.js
  // обёртка правки (медиа, block.json → wrap): очищается блок внутри, якорь обёртки — его
  const inner = isWrap(node) && node.firstElementChild ? node.firstElementChild : null;
  // ... или чужой элемент, который блок забирает себе (block → adopt: аккордеон — одиночный <details>)
  const regDef = registeredBlocks().find((d) => d.clean && (d.match(inner || node) || (!inner && d.adopt && d.adopt(node))));
  const made = regDef ? regDef.clean(inner || node, doc, (id) => ID_RE.test(id || ''), inner ? node : null) : false;
  if (made !== false) {   // false — «не мой»: элемент очищается дальше как обычно (сложная таблица — «сырой» HTML)
    closePara(ctx);
    if (made) ctx.out.appendChild(made);
    return;
  }

  // Наш «сырой» блок — сохраняем содержимое как есть
  if (node.classList && node.classList.contains('ted-ui-raw')) {
    closePara(ctx);
    const tpl = doc.createElement('template');
    tpl.innerHTML = node.getAttribute('data-ted-raw') || node.innerHTML;
    stripDangerous(tpl.content);
    for (const n of Array.from(tpl.content.childNodes)) {
      if (n.nodeType === 1) ctx.out.appendChild(makeRaw(n, doc));
    }
    return;
  }

  // картинка внутри абзаца (старые страницы TinyMCE): абзац режется — текст до, картинка отдельным блоком, текст после
  // (решение 22.11; раньше картинка пропадала). Блок делает тот, кто умеет (block → fromRaw: изображение)
  if ((tag === 'P' || (tag === 'DIV' && !hasBlockChild(node))) && node.querySelector('img')) {
    closePara(ctx);
    let seg = doc.createElement('div');
    const flush = () => {
      if (!seg.childNodes.length) return;
      const p = withAlign(doc.createElement('p'), node);
      cleanInlineChildren(seg, p, doc);
      trimBlock(p);
      if (p.firstChild) ctx.out.appendChild(p);
      seg = doc.createElement('div');
    };
    for (const child of Array.from(node.childNodes)) {
      const own = child.nodeType === 1 && (child.tagName === 'IMG' || (child.querySelectorAll('img').length === 1 && !child.textContent.trim()));
      const made = own ? registeredBlocks().map((d) => (d.fromRaw ? d.fromRaw(child, doc) : null)).find(Boolean) : null;
      if (made) { flush(); cleanBlockLevel(made, ctx); }
      else seg.appendChild(child.cloneNode(true));
    }
    flush();
    return;
  }

  if (tag === 'P' || (tag === 'DIV' && !hasBlockChild(node))) {
    closePara(ctx);
    const p = withAlign(doc.createElement('p'), node);
    cleanInlineChildren(node, p, doc);
    trimBlock(p);
    if (p.firstChild) ctx.out.appendChild(p);
    return;
  }

  if (tag === 'H1' || HEADING_TAGS.includes(tag)) {
    closePara(ctx);
    const h = withAlign(doc.createElement(tag === 'H1' ? 'h2' : tag.toLowerCase()), node);
    cleanInlineChildren(node, h, doc, { noStrong: true });
    trimBlock(h);
    if (h.firstChild) ctx.out.appendChild(h);
    return;
  }

  if (tag === 'UL' || tag === 'OL') {
    closePara(ctx);
    const list = cleanList(node, doc);
    if (list) ctx.out.appendChild(list);
    return;
  }

  if (tag === 'LI') {
    // li без списка — заворачиваем в ul
    closePara(ctx);
    const ul = doc.createElement('ul');
    const li = cleanListItem(node, doc);
    if (li) {
      ul.appendChild(li);
      ctx.out.appendChild(ul);
    }
    return;
  }

  if (tag === 'BLOCKQUOTE') {
    closePara(ctx);
    const bq = withAlign(doc.createElement('blockquote'), node);
    // блок из реестра на основе blockquote (выноска): его классы сохраняются — block.json → classes
    const regQuote = registeredBlocks().find((d) => d.classes && d.match(node));
    if (regQuote) bq.classList.add(...regQuote.classes);
    const inner = sanitizeNodes(node.childNodes, doc);
    // автор цитаты: последний абзац p.ted-author (имя жирным, должность после <br>)
    const lastSrc = Array.from(node.children).pop();
    const hasAuthor = !!(lastSrc && lastSrc.tagName === 'P' && lastSrc.classList.contains('ted-author'));
    const kids = Array.from(inner.childNodes);
    for (const child of kids) {
      // внутри цитаты — только абзацы
      if (child.tagName === 'P') {
        if (hasAuthor && kids.length > 1 && child === kids[kids.length - 1]) {
          child.className = 'ted-author';
          // нулевые пробелы и пустое имя при сохранении убираем
          const walker = doc.createTreeWalker(child, 4);
          for (let t = walker.nextNode(); t; t = walker.nextNode()) t.data = t.data.replace(/​/g, '');
          const nm = child.firstChild;
          if (nm && nm.nodeType === 1 && nm.tagName === 'STRONG' && !nm.textContent.trim()) {
            const nb = nm.nextSibling;
            nm.remove();
            if (nb && nb.nodeType === 1 && nb.tagName === 'BR') nb.remove();
          }
          while (child.lastChild && ((child.lastChild.nodeType === 1 && child.lastChild.tagName === 'BR') || (child.lastChild.nodeType === 3 && !child.lastChild.data.trim()))) child.lastChild.remove();
          const aid = node.lastElementChild && node.lastElementChild.getAttribute('data-author-id');
          if (aid && /^[\w.-]{1,64}$/.test(aid)) child.setAttribute('data-author-id', aid);
          const strongEl = child.querySelector('strong');
          child.setAttribute('data-initials', initialsOf(strongEl ? strongEl.textContent : child.textContent));
          if (!child.textContent.trim()) continue;   // пустого автора не сохраняем
        }
        bq.appendChild(child);
      }
      else if (child.textContent.trim()) {
        const p = doc.createElement('p');
        p.textContent = child.textContent;
        bq.appendChild(p);
      }
    }
    if (bq.firstChild) ctx.out.appendChild(bq);
    return;
  }

  if (tag === 'PRE') {
    closePara(ctx);
    const pre = doc.createElement('pre');
    const text = preText(node).replace(/\n$/, '');
    if (text.trim()) {
      // <pre data-lang="js"><code data-nums="1\n2">…<span class="ted-k">…</span>…</code></pre>
      const lang = normalizeLang(node.getAttribute('data-lang')) || detectCodeLang(text);
      const nums = !node.hasAttribute('data-nonums');   // номера строк по умолчанию; data-nonums — выключены явно
      const code = doc.createElement('code');
      if (emitTokens) code.appendChild(highlightFragment(text, lang, doc)); else code.appendChild(doc.createTextNode(text));
      pre.appendChild(code);
      applyCodeMeta(pre, lang, nums);
      ctx.out.appendChild(pre);
    }
    return;
  }

  if (tag === 'BR') {
    if (ctx.para) closePara(ctx);
    return;
  }

  if (RAW_TAGS.has(tag)) {
    closePara(ctx);
    ctx.out.appendChild(makeRaw(node, doc));
    return;
  }

  if (UNWRAP_BLOCK_TAGS.has(tag) || hasBlockChild(node)) {
    closePara(ctx);
    for (const child of Array.from(node.childNodes)) cleanBlockLevel(child, ctx);
    closePara(ctx);
    return;
  }

  // Строчный элемент на верхнем уровне — в текущий абзац
  cleanInlineNode(node, ensurePara(ctx), doc, {});
}

function cleanList(node, doc) {
  const list = withAlign(doc.createElement(node.tagName.toLowerCase()), node);
  // чек-лист: <ul class="ted-checklist"> с пунктами <li class="ted-checked"> (галочка рисуется стилем, JS на сайте не нужен)
  for (const cls of ['ted-checklist', 'ted-facts', 'ted-proscons']) {
    if (list.tagName === 'UL' && node.classList && node.classList.contains(cls)) list.classList.add(cls);
  }
  // шаги: <ol class="ted-steps">, в пункте <strong>заголовок</strong><br>описание
  if (list.tagName === 'OL' && node.classList && node.classList.contains('ted-steps')) list.classList.add('ted-steps');
  const start = node.getAttribute('start');
  if (list.tagName === 'OL' && /^-?\d+$/.test(start || '')) list.start = Number(start);
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1 && child.tagName === 'LI') {
      const li = cleanListItem(child, doc);
      if (li) list.appendChild(li);
    } else if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) {
      // вложенный список без li — прикрепляем к предыдущему пункту
      const nested = cleanList(child, doc);
      if (nested) {
        if (list.lastElementChild) list.lastElementChild.appendChild(nested);
        else {
          const li = doc.createElement('li');
          li.appendChild(nested);
          list.appendChild(li);
        }
      }
    } else if (child.textContent && child.textContent.trim()) {
      const li = doc.createElement('li');
      cleanInlineNode(child, li, doc, {});
      trimBlock(li);
      if (li.firstChild) list.appendChild(li);
    }
  }
  if (list.classList.contains('ted-steps') || list.classList.contains('ted-facts')) tidySteps(list, doc);
  if (list.classList.contains('ted-proscons')) {
    for (const card of Array.from(list.children)) {
      const t = card.firstChild;
      if (t && t.nodeType === 1 && t.tagName === 'STRONG' && !t.textContent.trim()) t.remove();
      if (!card.textContent.trim()) card.remove();   // карточка без заголовка и пунктов
    }
  }
  return list.firstChild ? list : null;
}

/** Шаги при сохранении: без служебных нулевых пробелов и пустого заголовка (описание «поднимается» наверх). */
function tidySteps(list, doc) {
  for (const li of Array.from(list.children)) {
    const walker = doc.createTreeWalker(li, 4);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) n.data = n.data.replace(/​/g, '');
    const first = li.firstElementChild;
    if (first && first.tagName === 'STRONG' && first === li.firstChild && !first.textContent.trim()) {
      const br = first.nextSibling;
      first.remove();
      if (br && br.nodeType === 1 && br.tagName === 'BR') br.remove();
    }
    // хвостовые переносы после описания
    for (let n = li.lastChild; n && ((n.nodeType === 1 && n.tagName === 'BR') || (n.nodeType === 3 && !n.data.trim())); n = li.lastChild) n.remove();
    if (!li.textContent.trim() && !li.querySelector('ul, ol')) li.remove();
  }
}

function cleanListItem(node, doc) {
  const li = doc.createElement('li');
  for (const cls of ['ted-checked', 'ted-pros', 'ted-cons']) {
    if (node.classList && node.classList.contains(cls)) li.classList.add(cls);
  }
  const nested = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL')) {
      const l = cleanList(child, doc);
      if (l) nested.push(l);
    } else if (child.nodeType === 1 && isBlockish(child)) {
      if (hasInlineContent(li)) li.appendChild(doc.createElement('br'));
      cleanInlineChildren(child, li, doc);
    } else {
      cleanInlineNode(child, li, doc, {});
    }
  }
  trimBlock(li);
  for (const l of nested) li.appendChild(l);
  return li.firstChild ? li : null;
}

export function cleanInlineChildren(src, dest, doc, opts = {}) {
  for (const child of Array.from(src.childNodes)) cleanInlineNode(child, dest, doc, opts);
}

function cleanInlineNode(node, dest, doc, opts) {
  if (node === opts.skipNode) return;
  if (node.nodeType === 3) {
    dest.appendChild(doc.createTextNode(collapse(node.data)));
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.tagName.toUpperCase();
  if (DROP_TAGS.has(tag) || isHiddenNode(node)) return;

  if (tag === 'BR') {
    dest.appendChild(doc.createElement('br'));
    return;
  }

  if (tag === 'IMG' || RAW_TAGS.has(tag)) return; // внутри текста медиа не поддерживаем

  let target = dest;
  let mapped = INLINE_MAP[tag];

  // Google Docs оборачивает всё в <b style="font-weight:normal">
  if (tag === 'B' && /font-weight\s*:\s*(normal|[1-5]00)/i.test(node.getAttribute('style') || '')) mapped = null;
  if (mapped === 'strong' && opts.noStrong) mapped = null;

  if (mapped === 'a') {
    const href = (node.getAttribute('href') || '').trim();
    if (href && urlOk(href, 'link')) {   // общее правило ссылок (core/urls.js), то же на сервере
      const a = doc.createElement('a');
      a.setAttribute('href', href);
      if (node.getAttribute('target') === '_self') a.setAttribute('target', '_self');   // явно «в этой вкладке» (переключатель выключен)
      if (node.getAttribute('target') === '_blank') {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      }
      dest.appendChild(a);
      target = a;
    }
  } else if (mapped === 'mark') {
    // подложка под фрагментом текста: только с классом палитры, иначе <mark> без смысла — просто текст
    const bg = node.classList && Array.from(node.classList).find((c) => BG_CLASS.test(c));
    if (bg) {
      const el = doc.createElement('mark');
      el.className = bg;
      dest.appendChild(el);
      target = el;
    }
  } else if (mapped) {
    if (!hasAncestorTag(dest, mapped)) {
      const el = doc.createElement(mapped);
      dest.appendChild(el);
      target = el;
    }
  }

  // Стили span / font / и любых тегов: жирный, курсив, подчёркнутый, зачёркнутый
  const style = node.getAttribute('style') || '';
  if (style) {
    const wraps = [];
    if (!opts.noStrong && /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) wraps.push('strong');
    if (/font-style\s*:\s*italic/i.test(style)) wraps.push('em');
    if (/text-decoration[^;]*underline/i.test(style)) wraps.push('u');
    if (/text-decoration[^;]*line-through/i.test(style)) wraps.push('s');
    if (/vertical-align\s*:\s*super/i.test(style)) wraps.push('sup');
    if (/vertical-align\s*:\s*sub/i.test(style)) wraps.push('sub');
    for (const w of wraps) {
      if (hasAncestorTag(target, w) || w === mapped) continue;
      const el = doc.createElement(w);
      target.appendChild(el);
      target = el;
    }
  }

  const blockish = isBlockish(node);
  if (blockish && hasInlineContent(dest) && dest.lastChild && dest.lastChild.nodeName !== 'BR') {
    dest.insertBefore(doc.createElement('br'), target === dest ? null : topChildOf(dest, target));
  }
  cleanInlineChildren(node, target, doc, opts);

  // пустые обёртки не нужны
  if (target !== dest) removeEmptyChain(target, dest);
}

function topChildOf(root, el) {
  let n = el;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n;
}

function removeEmptyChain(el, stopAt) {
  let n = el;
  while (n && n !== stopAt && !n.textContent && !n.querySelector('br')) {
    const parent = n.parentNode;
    parent.removeChild(n);
    n = parent;
  }
}

function hasAncestorTag(el, tagLower) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (n.tagName.toLowerCase() === tagLower) return true;
    if (isBlockTag(n.tagName) || n.tagName === 'LI') return false;
  }
  return false;
}

function hasBlockChild(node) {
  for (const c of node.children || []) {
    const t = c.tagName.toUpperCase();
    if (isBlockTag(t) || t === 'H1' || t === 'LI' || RAW_TAGS.has(t) || UNWRAP_BLOCK_TAGS.has(t) || t === 'TABLE') return true;
  }
  return false;
}

function isBlockish(node) {
  const t = node.tagName.toUpperCase();
  return t === 'P' || t === 'DIV' || t === 'H1' || isBlockTag(t) || UNWRAP_BLOCK_TAGS.has(t) || t === 'LI';
}

function hasInlineContent(el) {
  return !!(el.textContent && el.textContent.length);
}

function isHiddenNode(node) {
  const style = node.getAttribute && node.getAttribute('style');
  return !!(style && /display\s*:\s*none/i.test(style));
}

/** Инициалы для аватара автора: первые буквы первых двух слов. */
export function initialsOf(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return words.map((w) => (w.match(/[\p{L}\p{N}]/u) || [''])[0]).join('').toUpperCase();
}

const LANG_RE = /^[\p{L}\p{N}+#.-]{1,20}$/u;

/** Внутри <pre> всегда есть <code>: в нём текст (в правке) или токены подсветки (в сохранённом HTML). */
export function ensureCode(pre, doc = document) {
  let code = pre.querySelector(':scope > code');
  if (!code) {
    code = doc.createElement('code');
    while (pre.firstChild) code.appendChild(pre.firstChild);
    pre.appendChild(code);
  }
  return code;
}


/** Колонка номеров растягивается по самому длинному номеру: data-nums-d — число цифр (только если больше одной). */
export function setNumsAttrs(pre, n) {
  pre.setAttribute('data-nums', Array.from({ length: n }, (_, i) => i + 1).join('\n'));
  const d = String(n).length;
  if (d > 1) pre.setAttribute('data-nums-d', String(d)); else pre.removeAttribute('data-nums-d');
}
/** Язык кода и номера строк — атрибуты <pre>: data-lang, data-nums (число строк считается по тексту); номера выключены явно — data-nonums. */
export function applyCodeMeta(pre, lang, nums) {
  const code = ensureCode(pre, pre.ownerDocument);
  code.removeAttribute('data-nums');
  if (lang && LANG_RE.test(lang)) pre.setAttribute('data-lang', lang.toLowerCase());
  else pre.removeAttribute('data-lang');
  if (nums) {
    const n = (code.textContent.match(/\n/g) || []).length + 1;
    setNumsAttrs(pre, n);
  } else { pre.removeAttribute('data-nums'); pre.removeAttribute('data-nums-d'); }
  if (nums) pre.removeAttribute('data-nonums'); else pre.setAttribute('data-nonums', '');
}

function withAlign(el, src) {
  const align = (src.style && src.style.textAlign) || src.getAttribute('align') || '';
  let cls = '';
  let bg = '';
  if (src.classList) {
    for (const c of src.classList) { if (ALIGN_CLASS.test(c)) cls = c; if (BG_CLASS.test(c)) bg = c; }
  }
  if (!cls && /center/i.test(align)) cls = 'ted-align-center';
  if (!cls && /right|end/i.test(align)) cls = 'ted-align-right';
  // у чек-листа и шагов выравнивания нет
  if (src.classList && Array.from(src.classList).some((c) => /^ted-(checklist|steps)$/.test(c))) cls = '';
  // у чек-листа, шагов, цифр, плюсов и минусов, выноски фона нет
  if (src.classList && Array.from(src.classList).some((c) => /^ted-(checklist|steps|proscons)$/.test(c))) bg = '';
  const all = [cls, bg].filter(Boolean).join(' ');
  if (all) el.className = all;
  // якоря: id блока (латиница, цифры, дефис) сохраняется
  const id = src.getAttribute && src.getAttribute('id');
  if (id && ID_RE.test(id)) el.id = id;
  return el;
}

function collapse(text) {
  return text.replace(/[\t\n\r ]+/g, ' ').replace(/ /g, ' ');
}

function preText(node) {
  // <br> внутри <pre> → перенос строки
  let s = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) s += c.data;
    else if (c.nodeName === 'BR') s += '\n';
    else if (c.nodeType === 1) {
      s += preText(c);
      if (c.tagName === 'DIV' || c.tagName === 'P') s += '\n';
    }
  }
  return s;
}

// Убираем пробелы и <br> по краям блока
function trimBlock(el) {
  const edge = (first) => {
    for (;;) {
      const n = first ? el.firstChild : el.lastChild;
      if (!n) return;
      if (n.nodeType === 3) {
        const t = first ? n.data.replace(/^[ \t\n\r]+/, '') : n.data.replace(/[ \t\n\r]+$/, '');
        if (!t) { el.removeChild(n); continue; }
        n.data = t;
        return;
      }
      if (n.nodeName === 'BR') { el.removeChild(n); continue; }
      if (n.nodeType === 1 && n.nodeName !== 'UL' && n.nodeName !== 'OL') {
        if (!n.textContent.trim() && !n.querySelector('br')) { el.removeChild(n); continue; }
      }
      return;
    }
  };
  edge(true);
  edge(false);
  // склеиваем соседние текстовые узлы
  el.normalize();
}

export function makeRaw(node, doc = document) {
  // чистим внутри контейнера: корневой элемент блока тоже может оказаться запрещённым (<object>, <form>, чужой <iframe>)
  const holder = doc.createElement('div');
  holder.appendChild(node.cloneNode(true));
  stripDangerous(holder);
  const clone = holder.firstElementChild;
  if (!clone) return doc.createDocumentFragment();
  const wrap = doc.createElement('div');
  wrap.className = 'ted-ui-raw';
  wrap.setAttribute('contenteditable', 'false');
  wrap.setAttribute('data-ted-raw', holder.innerHTML);
  wrap.appendChild(clone);
  return wrap;
}


// Режим «сырого» HTML (старый контент TinyMCE: таблицы, картинки, iframe…). По умолчанию строгий: белый список сервера
// (core/allowlist.js) — iframe только с видеоплощадок (https) и в песочнице. Режим 'trusted' (опция rawHtml: 'trusted')
// оставляет теги как есть — только для доверенных авторов; сервер всё равно чистит по белому списку.
let strictRaw = true;
export function setRawPolicy(mode) { strictRaw = mode !== 'trusted'; }
// Доверенный режим: атрибуты со ссылками — по общему правилу адресов (core/urls.js)
const URL_ATTRS = new Set(['href', 'src', 'data', 'action', 'formaction', 'poster', 'xlink:href', 'srcset', 'background', 'ping']);
const DROP_ATTRS = new Set(['srcdoc']);
const RAW_DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'BASE', 'TEMPLATE', 'NOSCRIPT']);

/** Адрес в «сыром» HTML доверенного режима: общее правило (core/urls.js); href — ссылка, остальное — как у картинки. */
function unsafeUrl(value, name = 'src') {
  return !urlOk(String(value), name === 'href' ? 'link' : 'image');
}

/**
 * Старый «сырой» HTML. Строгий режим (по умолчанию): чистится тем же белым списком, что на сервере (core/allowlist.js) —
 * в редакторе остаётся ровно то, что сохранит и покажет сайт. Доверенный (rawHtml: 'trusted', только для доверенных авторов):
 * теги остаются, убираются скрипты, стили, обработчики, опасные адреса, srcdoc; сервер всё равно чистит по белому списку.
 */
function stripDangerous(root) {
  if (strictRaw) { cleanByAllowlist(root); return; }
  const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of [root, ...all]) {
    if (!el || el.nodeType !== 1) continue;
    if (RAW_DROP_TAGS.has(el.tagName.toUpperCase())) { el.remove(); continue; }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || DROP_ATTRS.has(name)) el.removeAttribute(attr.name);
      else if (URL_ATTRS.has(name) && (name === 'srcset' ? !srcsetOk(attr.value) : unsafeUrl(attr.value, name))) el.removeAttribute(attr.name);
      else if (name === 'style' && /expression\s*\(|url\s*\(\s*['"]?\s*(javascript|vbscript):/i.test(attr.value)) el.removeAttribute(attr.name);
    }
  }
}

/** Чистый фрагмент → аккуратная HTML-строка: один блок на строку. */
export function serializeBlocks(frag) {
  const parts = [];
  for (const node of Array.from(frag.childNodes)) {
    if (node.nodeType !== 1) continue;
    const wrapped = isWrap(node) ? node.firstElementChild : null;   // обёртка правки (медиа): сохраняется блок внутри
    const sd = defOf(wrapped || node);   // блок из реестра сохраняет себя сам (blocks/<тип>/<тип>.js → serialize)
    if (sd && sd.serialize) { const out = sd.serialize(wrapped || node, wrapped ? node : null); if (out) parts.push(out); continue; }
    if (isWrap(node)) continue;   // обёртка без блока внутри (всё вычищено) — не сохраняем
    if (node.classList.contains('ted-ui-raw')) {
      parts.push(node.getAttribute('data-ted-raw') || node.innerHTML);
    } else if (node.tagName === 'UL' || node.tagName === 'OL') {
      parts.push(serializeList(node, ''));
    } else if ((node.tagName === 'P' && !node.firstChild && !node.attributes.length)) {
      continue;   // <p></p> остаётся только от вычищенного (<base>, <math>…): очистка с первого раза даёт окончательный результат
    } else {
      parts.push(node.outerHTML);
    }
  }
  return parts.join('\n');
}

function serializeList(list, indent) {
  const tag = list.tagName.toLowerCase();
  const cls = (list.className ? ` class="${list.className}"` : '') + (list.id ? ` id="${list.id}"` : '');
  const items = [];
  for (const li of list.children) {
    const liCls = li.className ? ` class="${li.className}"` : '';
    let inline = '';
    const nested = [];
    for (const c of li.childNodes) {
      if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(c);
      else inline += c.nodeType === 1 ? c.outerHTML : escapeText(c.data);
    }
    if (nested.length) {
      items.push(`${indent}  <li${liCls}>${inline}\n${nested.map((n) => serializeList(n, indent + '    ')).join('\n')}\n${indent}  </li>`);
    } else {
      items.push(`${indent}  <li${liCls}>${inline}</li>`);
    }
  }
  const start = tag === 'ol' && list.hasAttribute('start') ? ` start="${list.start}"` : '';
  return `${indent}<${tag}${cls}${start}>\n${items.join('\n')}\n${indent}</${tag}>`;
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
}
