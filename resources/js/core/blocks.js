
// Операции с блоками верхнего уровня: тип блока, превращение одного типа
// в другой, выравнивание, нормализация DOM редактора.

import { isBlockTag, makeRaw, applyCodeMeta, initialsOf, ensureCode, setNumsAttrs } from './sanitize.js';
import { getRange } from './selection.js';
import { t } from './i18n.js';
import { isContainer } from './containers.js';
import { presetOf, presetAlias } from './presets.js';
import { blockDef, defOf, isObjectBlock, registeredBlocks, objectSelector, isWrap, wrapSelector } from './registry.js';

// Выпадающий список «Стиль текста» (макет editor-dropdown style=text).
// H5 и H6 добавлены по решению заказчика (в макете списка их нет); горячие клавиши Mod+Shift+5 / 6, Markdown «#### » / «##### ».
export const BLOCK_TYPES = [
];

// Меню блоков по «/» (макет editor-menu): 25 блоков по группам библиотеки.
// soon — номер этапа плана, на котором блок появится.
export const SLASH_GROUPS = [
  { title: 'Текст', items: [
  ] },
  { title: 'Акцент', items: [
  ] },
  { title: 'Списки', items: [
  ] },
  { title: 'Медиа', items: [
  ] },
  { title: 'Файлы и таблицы', items: [
  ] },
  { title: 'Встраивание', items: [
  ] },
  { title: 'Макет', items: [
  ] },
  { title: 'Интерактив', items: [
  ] },
  { title: 'Действия', items: [
  ] },
];

// Подсказки пустых блоков (макет: block-heading / block-body state=empty)
export const PLACEHOLDERS = {
  li: 'Пункт списка',
  pre: 'Код',
};

/**
 * Меню «/» и «Все блоки»: блоки ядра (SLASH_GROUPS) + блоки из реестра (block.json → menu: группа, место after).
 * Пока блоки переносятся по одному (этап 5), ядро ещё держит свой список; перенесённые приходят из реестра.
 */
export function menuGroups() {
  const groups = SLASH_GROUPS.map((g) => ({ ...g, items: g.items.map((it, i) => ({ ...it, order: it.order ?? i * 10 })) }));
  for (const d of registeredBlocks()) {
    if (!d.menu) continue;
    let g = groups.find((x) => x.title === d.menu.group);
    if (!g) { g = { title: d.menu.group, items: [] }; groups.push(g); }
    g.items.push({ type: d.type, label: d.menu.label || d.title, icon: d.menu.icon, words: d.menu.words, convert: d.menu.convert, sample: d.menu.sample, picker: d.menu.picker, order: d.menu.order ?? 1000 });
  }
  for (const g of groups) g.items.sort((a, b) => a.order - b.order);
  return groups;
}

/** Список «Стиль текста»: блоки ядра (BLOCK_TYPES) + текстовые блоки реестра (block.json → style), по номеру order. */
export function styleTypes() {
  const list = [...BLOCK_TYPES];
  for (const d of registeredBlocks()) if (d.style) list.push({ type: d.type, label: d.style.label, icon: d.style.icon, keys: d.style.keys || '', order: d.style.order });
  return list.sort((a, b) => a.order - b.order);
}

/** Подсказка пустого блока: block.json → placeholder или список ядра. */
export function placeholderOf(type) {
  const d = blockDef(type);
  return t((d && d.placeholder) || PLACEHOLDERS[type] || '');   // на языке редактора (i18n)
}

/** «Превратить в…» есть у блока, если в списке блоков у него нет convert: false (меню общее, наполнение — из списка). */
export function blockCanConvert(el) {
  if (!el || blockType(el) === 'raw') return false;
  const kind = kindOf(el);
  for (const g of menuGroups()) for (const it of g.items) if (it.type === kind) return it.convert !== false;
  return true;
}

export function blockType(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el.classList.contains('ted-ui-raw') || isWrap(el)) return 'raw';   // HTML-блок и обёртка правки (медиа)
  return el.tagName.toLowerCase();
}

/** Вид блока: как blockType, но чек-лист (<ul class="ted-checklist">) и шаги (<ol class="ted-steps">) отличаются от обычных списков. */
export function kindOf(el) {
  const def = defOf(el);   // блок из реестра (этап 5)
  if (def) return def.type;
  const t = blockType(el);
  return t;
}

// ---------------------------------------------------------------------------
// Отключаемые блоки: опция blocks — 'all' (по умолчанию), имя набора ('mini', 'text', свой — core/presets.js),
// прежний 'basic' или массив типов
// ---------------------------------------------------------------------------

/** Прежний набор опции blocks (до этапа 2), оставлен для совместимости. Наборы этапа 2 — PRESETS в core/presets.js. */
export const BLOCK_PRESETS = {
  basic: ['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'pre', 'hr', 'checklist', 'steps'],
};

/** Опция blocks → Set разрешённых типов или null («всё разрешено»). Абзац разрешён всегда. serverPresets — свои наборы с сервера. */
export function resolveBlocks(option, serverPresets = null) {
  if (!option || option === 'all') return null;
  let list = null;
  if (typeof option === 'string') {
    const preset = presetOf(option, serverPresets);
    list = preset ? (preset.blocks === 'all' ? null : preset.blocks) : (BLOCK_PRESETS[option] || null);
  } else if (Array.isArray(option)) list = option;
  if (!list) return null;
  const set = new Set(list.map((t) => presetAlias(t)));
  set.add('p');
  return set;
}

export function blockAllowed(set, type) { return !set || set.has(type); }

/** Меню «/» и «Все блоки»: только разрешённые блоки, пустые группы убираются. */
export function filterGroups(groups, set) {
  if (!set) return groups;
  return groups.map((g) => ({ ...g, items: g.items.filter((it) => set.has(it.type)) })).filter((g) => g.items.length);
}

function restrictKind(el) {
  if (isWrap(el)) { const d = defOf(el.firstElementChild); return d ? d.type : 'raw'; }   // обёртка правки: вид — у блока внутри
  if (el.classList.contains('ted-ui-raw')) return 'raw';
  return kindOf(el) || el.tagName.toLowerCase();
}

function textNodesOf(el, doc, tag = 'p') {
  const p = doc.createElement(tag);
  p.innerHTML = el.innerHTML;
  return p;
}

/** Блок запрещённого вида → обычный текст (абзацы / списки), чтобы содержимое не терялось. */
function degradeBlock(el, kind, doc) {
  const def = blockDef(kind);   // блок из реестра: как превращать в текст — в block.json (degrade), то же читает сервер
  if (def && def.degrade === 'drop') return [];
  // children: вложенные блоки (абзацы) с текстом переносятся как есть и сами проверяются по набору — так же на сервере
  if (def && def.degrade === 'children') return Array.from(el.children).filter((c) => c.textContent.trim()).map((c) => c.cloneNode(true));
  const p = (html) => { const n = doc.createElement('p'); n.innerHTML = html; return n; };
  const list = (tag, items) => { const n = doc.createElement(tag); for (const html of items) { const li = doc.createElement('li'); li.innerHTML = html; n.appendChild(li); } return n; };
  const text = (n) => (n ? n.textContent.replace(/\u200b/g, '').trim() : '');
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (def && def.toText) return def.toText(el, { doc, p, list, text, esc });   // блок из реестра сам превращается в текст
  switch (kind) {
    case 'checklist': return [list('ul', Array.from(el.children).map((li) => li.innerHTML))];
    case 'steps': return [list('ol', Array.from(el.children).map((li) => {
      const t = text(li.firstElementChild);
      const d = text({ textContent: Array.from(li.childNodes).slice(2).map((n) => n.textContent).join('') });
      return esc(t) + (d ? ' — ' + esc(d) : '');
    }))];
    // вложенные блоки (абзац, заголовок, список) переносятся как есть и сами проверяются по набору (restrictBlocks → walk)
    case 'facts': return Array.from(el.children).map((li) => {
      const t = text(li.firstElementChild);
      const d = text({ textContent: Array.from(li.childNodes).slice(2).map((n) => n.textContent).join('') });
      return p(esc(t) + (d ? ' — ' + esc(d) : ''));
    }).filter((n) => n.textContent.trim());
    case 'proscons': return Array.from(el.children).flatMap((card) => {
      const out = [];
      const t = text(card.firstElementChild);
      if (t) out.push(p('<strong>' + esc(t) + '</strong>'));
      const ul = card.querySelector(':scope > ul');
      if (ul) out.push(list('ul', Array.from(ul.children).map((li) => li.innerHTML).filter((h) => h.replace(/<br>/g, '').trim())));
      return out;
    });
    case 'blockquote': return Array.from(el.children).filter((c) => c.tagName === 'P' && !c.classList.contains('ted-author')).map((c) => textNodesOf(c, doc));
    case 'pre': return [p(esc(el.textContent).replace(/\n/g, '<br>'))];
    case 'ul': case 'ol': return Array.from(el.children).map((li) => textNodesOf(li, doc));
    // картинка из старой статьи (<figure> без класса, в редакторе — HTML-блок): подпись — абзацем,
    // как на сервере и у блока «Изображение» (28.11); прочий HTML-блок исчезает
    case 'raw': case 'figure': {
      const fig = el.tagName === 'FIGURE' ? el : el.querySelector(':scope > figure');
      if (!fig || !fig.querySelector('img')) return kind === 'raw' ? [] : [textNodesOf(el, doc)];
      const t = text(fig.querySelector('figcaption'));
      return t ? [p(esc(t))] : [];
    }
    default:
      if (/^h[2-6]$/.test(kind)) return [textNodesOf(el, doc)];
      return [textNodesOf(el, doc)];
  }
}

/**
 * Привести блоки корня (элемента или фрагмента) к набору разрешённых: запрещённые превращаются в обычный текст,
 * цветной фон снимается, если он не разрешён. Вызывается при загрузке, вставке и сохранении — запрещённое не пролезает ни одним путём.
 */
export function restrictBlocks(root, set, doc = document) {
  if (!set) return root;
  const stripBg = (el) => {
    if (set.has('background') || !el.classList) return;
    for (const n of BG_NAMES) el.classList.remove(`ted-bg-${n}`);
    if (!el.className) el.removeAttribute('class');
  };
  const walk = (el, depth) => {
    const kind = restrictKind(el);
    if (set.has(kind)) { stripBg(el); return [el]; }
    if (depth > 4) { const p = doc.createElement('p'); p.textContent = el.textContent; return p.textContent.trim() ? [p] : []; }
    return degradeBlock(el, kind, doc).flatMap((n) => (n.nodeType === 1 ? walk(n, depth + 1) : [n]));
  };
  for (const el of Array.from(root.children)) {
    const replacement = walk(el, 0);
    if (replacement.length === 1 && replacement[0] === el) continue;
    el.replaceWith(...replacement);
  }
  // вложенные блоки (решение 22.11): запрещённый блок внутри разрешённого (абзаца, пункта, ответа аккордеона) тоже превращается в текст,
  // а «сырые» фрейм, видео, таблица, картинка живут только внутри своего блока — то же на сервере (Presets::restrict)
  const check = (c, depth) => {
    const def = defOf(c);
    if (def) {
      if (NESTED_FREE.has(def.type) || set.has(def.type)) { stripBg(c); inner(c, depth); return; }
      const out = depth > 8 ? [] : degradeBlock(c, def.type, doc);
      if (NESTED_INLINE.test(c.parentElement ? c.parentElement.tagName : '')) {
        const t = out.map((n) => n.textContent.trim()).filter(Boolean).join(' ');
        c.replaceWith(...(t ? [doc.createTextNode(t)] : []));
        return;
      }
      c.replaceWith(...out);
      for (const n of out) if (n.nodeType === 1) check(n, depth + 1);
      return;
    }
    if (!ownedNested(c)) { const kids = Array.from(c.childNodes); c.replaceWith(...kids); for (const k of kids) if (k.nodeType === 1) check(k, depth + 1); return; }
    stripBg(c);
    inner(c, depth);
  };
  const inner = (el, depth) => { for (const c of Array.from(el.children)) check(c, depth + 1); };
  for (const el of Array.from(root.children)) inner(el, 0);
  return root;
}

// Вложенные проверки набора: списки — обычный текст (внутри плюсов-минусов, содержания, пунктов).
// Внутри текстового блока, выноски и контейнера — только оформление текста и своя разметка блока (теги из block.json → html и образца
// меню); чужой «сырой» тег (фрейм, видео, таблица, картинка) разворачивается в свой текст. Блок с собственной разметкой (медиа, таблица…) — как есть.
const NESTED_FREE = new Set(['p', 'ul', 'ol']);
const NESTED_INLINE = /^(P|H[1-6]|SUMMARY|A|STRONG|B|EM|I|U|S|SPAN|CODE|SUB|SUP|MARK|SMALL)$/;
const PHRASING = new Set(['a', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'sub', 'sup', 'mark', 'small', 'span', 'br', 'wbr', 'abbr', 'q']);
const OWN_TAGS = new Map();
function ownTags(def) {
  if (OWN_TAGS.has(def.type)) return OWN_TAGS.get(def.type);
  const tags = new Set(Object.keys(def.html || {}));
  const sample = def.menu && def.menu.sample;
  if (sample && typeof document !== 'undefined') {
    const t = document.createElement('template');
    t.innerHTML = sample;
    for (const e of t.content.querySelectorAll('*')) tags.add(e.tagName.toLowerCase());
  }
  OWN_TAGS.set(def.type, tags);
  return tags;
}
/** Элемент без своего вида на своём месте: у блока с собственной разметкой — любой; у текстового, выноски, контейнера — оформление текста и своя разметка. */
function ownedNested(c) {
  const tag = c.tagName.toLowerCase();
  for (let a = c.parentElement; a; a = a.parentElement) {
    const d = defOf(a);
    if (!d) continue;
    if (!d.text && d.degrade !== 'children' && !d.container) return true;
    return PHRASING.has(tag) || ownTags(d).has(tag);
  }
  return PHRASING.has(tag);
}

// ---------------------------------------------------------------------------
// Маркеры курсора: переживают перенос узлов между блоками
// ---------------------------------------------------------------------------

function insertMarkers(root) {
  const range = getRange(root);
  if (!range) return null;
  const doc = root.ownerDocument;
  const end = doc.createElement('span');
  end.setAttribute('data-tedui-m', 'e');
  const start = doc.createElement('span');
  start.setAttribute('data-tedui-m', 's');
  const r2 = range.cloneRange();
  r2.collapse(false);
  r2.insertNode(end);
  const r1 = range.cloneRange();
  r1.collapse(true);
  r1.insertNode(start);
  return { start, end };
}

function restoreMarkers(root, markers) {
  if (!markers) return;
  const doc = root.ownerDocument;
  const range = doc.createRange();
  const point = (m) => {
    if (!m.isConnected || !root.contains(m)) return null;
    const parent = m.parentNode;
    const index = Array.prototype.indexOf.call(parent.childNodes, m);
    parent.removeChild(m);
    return { parent, index };
  };
  const s = point(markers.start);
  const e = point(markers.end);
  root.querySelectorAll('[data-tedui-m]').forEach((m) => m.remove());
  if (!s) return;
  try {
    range.setStart(s.parent, Math.min(s.index, s.parent.childNodes.length));
    if (e && !(e.parent === s.parent && e.index < s.index)) range.setEnd(e.parent, Math.min(e.index, e.parent.childNodes.length));
    else range.collapse(true);
  } catch (err) {
    return;
  }
  const sel = doc.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

export function withMarkers(root, fn) {
  const markers = insertMarkers(root);
  try {
    fn();
  } finally {
    restoreMarkers(root, markers);
  }
}

// ---------------------------------------------------------------------------
// Превращение блоков
// ---------------------------------------------------------------------------

// Блок → «строки» (массивы узлов) для пересборки в новый тип
function toLines(block) {
  const doc = block.ownerDocument;
  const type = blockType(block);
  const lines = [];

  const fromInline = (el) => {
    const nodes = [];
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) continue;
      nodes.push(c);
    }
    return nodes;
  };

  if (type === 'ul' || type === 'ol') {
    const walk = (list) => {
      for (const li of Array.from(list.children)) {
        lines.push(fromInline(li));
        for (const nested of li.querySelectorAll(':scope > ul, :scope > ol')) walk(nested);
      }
    };
    walk(block);
  } else if (type === 'blockquote') {
    for (const c of Array.from(block.childNodes)) {
      if (c.nodeType === 1 && c.tagName === 'P') lines.push(fromInline(c));
      else if (c.textContent.trim() || c.nodeName === 'SPAN') lines.push([c]);
    }
  } else if (type === 'pre') {
    const marker = block.querySelector('[data-tedui-m]');
    const text = block.textContent;
    text.split('\n').forEach((line, i) => {
      const nodes = [doc.createTextNode(line)];
      if (i === 0 && marker) nodes.unshift(marker);
      lines.push(nodes);
    });
  } else {
    lines.push(fromInline(block));
  }
  return lines.length ? lines : [[]];
}

function fill(el, nodes) {
  for (const n of nodes) el.appendChild(n);
  if (!el.textContent && !el.querySelector('br')) el.appendChild(el.ownerDocument.createElement('br'));
  return el;
}

function alignOf(block) {
  return Array.from(block.classList).filter((c) => /^ted-(align|bg|tc)-/.test(c));   // выравнивание, фон и цвет текста (1.0.4) переходят в новый вид
}

/**
 * Превратить блоки в тип type (p, h2…h6, ul, ol, blockquote, pre).
 * Повторное применение списка/цитаты к таким же блокам — снимает их.
 */
export function convertBlocks(root, blocks, type) {
  blocks = blocks.filter((b) => {
    const t = blockType(b);
    return t && t !== 'raw' && !isObjectBlock(b);
  });
  if (!blocks.length) return;
  const doc = root.ownerDocument;

  const allSame = blocks.every((b) => kindOf(b) === type);
  // повторное применение списка / цитаты / чек-листа к тем же блокам снимает их (превращает в абзацы)
  if (allSame && (type === 'ul' || type === 'ol' || type === 'blockquote' || type === 'checklist' || type === 'steps')) type = 'p';
  else if (allSame && /^(p|h[2-6]|pre)$/.test(type)) return;

  withMarkers(root, () => {
    const align = alignOf(blocks[0]);
    const lines = [];
    for (const b of blocks) lines.push(...toLines(b));
    const created = [];

    if (type === 'ul' || type === 'ol' || type === 'checklist') {
      const list = doc.createElement(type === 'checklist' ? 'ul' : type);
      if (type === 'checklist') list.classList.add('ted-checklist');
      for (const line of lines) list.appendChild(fill(doc.createElement('li'), line));
      created.push(list);
    } else if (type === 'steps') {
      // каждая строка — шаг: заголовок жирным (описание добавляется Shift+Enter)
      // пустой абзац → блок как в макете state=empty: четыре шага с заглушками
      if (lines.every((l) => !l.some((n) => (n.textContent || '').trim()))) {
        created.push(emptyStepsBlock(doc));
      } else {
      const ol = doc.createElement('ol');
      ol.classList.add('ted-steps');
      for (const line of lines) {
        const li = doc.createElement('li');
        const title = doc.createElement('strong');
        for (const n of line) title.appendChild(n);
        if (!title.textContent && !title.querySelector('br')) title.appendChild(doc.createElement('br'));
        li.appendChild(title);
        ol.appendChild(li);
      }
      created.push(ol);
      }
    } else if (type === 'blockquote') {
      const bq = doc.createElement('blockquote');
      for (const line of lines) bq.appendChild(fill(doc.createElement('p'), line));
      created.push(bq);
    } else if (type === 'pre') {
      const pre = doc.createElement('pre');
      lines.forEach((line, i) => {
        if (i) pre.appendChild(doc.createTextNode('\n'));
        for (const n of line) {
          if (n.nodeType === 1 && n.hasAttribute('data-tedui-m')) pre.appendChild(n);
          else if (n.nodeName === 'BR') pre.appendChild(doc.createTextNode('\n'));
          else pre.appendChild(doc.createTextNode(n.textContent));
          // маркеры внутри строчных элементов не теряем
          if (n.nodeType === 1 && !n.hasAttribute('data-tedui-m')) n.querySelectorAll('[data-tedui-m]').forEach((m) => pre.appendChild(m));
        }
      });
      // блок кода: <pre><code data-nums> — шапка с языком и номера строк по умолчанию
      const code = doc.createElement('code');
      while (pre.firstChild) code.appendChild(pre.firstChild);
      if (!code.textContent.replace(/\n/g, '')) Array.from(code.childNodes).forEach((n) => { if (n.nodeType === 3) n.remove(); });   // пустой абзац: <br> не должен стать переносом строки
      if (!code.textContent) code.appendChild(doc.createElement('br'));
      pre.setAttribute('data-nums', '1');
      pre.appendChild(code);
      created.push(pre);
    } else {
      for (const line of lines) created.push(fill(doc.createElement(type), line));
    }

    if (align && align.length && type !== 'pre') for (const el of created) el.classList.add(...align);

    const anchor = blocks[0];
    for (const el of created) anchor.parentNode.insertBefore(el, anchor);   // и в теле контейнера (ответ аккордеона)
    for (const b of blocks) b.remove();
  });
}

export function setAlign(blocks, align) {
  for (const b of blocks) {
    const t = blockType(b);
    if (!t || t === 'raw' || t === 'pre' || isObjectBlock(b)) continue;
    if (!alignAllowed(b)) continue;
    b.classList.remove('ted-align-center', 'ted-align-right');
    if (align === 'center' || align === 'right') b.classList.add(`ted-align-${align}`);
    if (!b.className) b.removeAttribute('class');
  }
}

// У чек-листа и шагов выравнивания нет (чек-бокс и номер всегда слева): класс не сохраняется, команда и кнопка недоступны
const NO_ALIGN_KINDS = new Set(['checklist', 'steps']);
export function alignAllowed(b) {
  const ad = b && b.nodeType === 1 ? defOf(b) : null;
  if (ad && ad.canAlign && !ad.canAlign(b)) return false;   // блок из реестра решает сам (баннер кнопки — на всю ширину)
  return !(b && NO_ALIGN_KINDS.has(kindOf(b)));
}

export function alignOfBlock(b) {
  if (!b || !b.classList) return 'left';
  if (b.classList.contains('ted-align-center')) return 'center';
  if (b.classList.contains('ted-align-right')) return 'right';
  return 'left';
}

// Цветной фон (подложка): палитры сайта gray / color1 / color2 → класс ted-bg-<имя>
export const BG_NAMES = ['gray', 'color1', 'color2', 'error', 'alert', 'success'];

// Блоки со своим видом (чек-лист, шаги, плюсы и минусы): цветной фон запрещён; выноска и цифры красятся целиком
const NO_BG_KINDS = new Set(['checklist', 'steps']);
export function bgAllowed(b) {
  const bd = b && b.nodeType === 1 ? defOf(b) : null;
  if (bd && bd.toolbar && bd.toolbar.bg === false) return false;   // block.json → toolbar.bg
  if (bd && bd.canBg && !bd.canBg(b)) return false;   // блок из реестра решает сам
  return !(b && NO_BG_KINDS.has(kindOf(b)));
}

export function setBg(blocks, name) {
  for (const b of blocks) {
    const t = blockType(b);
    if (!t || t === 'raw') continue;
    // код и объекты (разделитель, кнопка, товар) — только если блок сам разрешил фон (canBg, 1.0.4)
    const bd = defOf(b);
    if ((t === 'pre' || isObjectBlock(b)) && !(bd && bd.canBg && bd.canBg(b))) continue;
    if (!bgAllowed(b)) continue;
    for (const n of BG_NAMES) b.classList.remove(`ted-bg-${n}`);
    if (BG_NAMES.includes(name)) b.classList.add(`ted-bg-${name}`);
    if (!b.className) b.removeAttribute('class');
  }
}

export function bgOfBlock(b) {
  if (!b || !b.classList) return '';
  return BG_NAMES.find((n) => b.classList.contains(`ted-bg-${n}`)) || '';
}

// Цвет текста (меню «Цвет» → «Текст», 1.0.4): класс ted-tc-<имя> на блоке или <mark class="ted-tc-<имя>"> на выделении.
// «Стандартный» снимает цвет с блока; внутри цветного блока выделение «Стандартным» — mark ted-tc-gray.
// Заголовки того же цвета — на ступень сильнее (светлая darker, тёмная lighter) — в стилях (content.css).
export const TC_NAMES = ['color1', 'color2', 'error', 'alert', 'success'];

/** Можно ли красить текст блока: не код, не сырой HTML, не объект; блок из реестра решает сам (block.json → toolbar.tc, canTc). */
export function tcAllowed(b) {
  if (!b || b.nodeType !== 1) return false;
  const t = blockType(b);
  if (!t || t === 'raw') return false;
  const bd = defOf(b);
  if (bd && bd.toolbar && bd.toolbar.tc === false) return false;
  if (bd && bd.canTc) return !!bd.canTc(b);   // блок решает сам (баннер, товар — да; карточки — нет)
  return !(t === 'pre' || isObjectBlock(b));
}

export function setTc(blocks, name) {
  for (const b of blocks) {
    if (!tcAllowed(b)) continue;
    for (const n of TC_NAMES) b.classList.remove(`ted-tc-${n}`);
    if (TC_NAMES.includes(name)) b.classList.add(`ted-tc-${name}`);
    if (!b.className) b.removeAttribute('class');
  }
}

export function tcOfBlock(b) {
  if (!b || !b.classList) return '';
  return TC_NAMES.find((n) => b.classList.contains(`ted-tc-${n}`)) || '';
}

// ---------------------------------------------------------------------------
// Нормализация DOM редактора после ввода
// ---------------------------------------------------------------------------

const INLINE_ROOT = /^(#text|B|STRONG|I|EM|U|S|STRIKE|DEL|CODE|A|SPAN|FONT|SUB|SUP|BR|MARK|SMALL|BIG)$/;

export function normalizeRoot(root) {
  const doc = root.ownerDocument;
  let changed = false;
  let para = null;

  for (const node of Array.from(root.childNodes)) {
    const name = node.nodeName.toUpperCase();

    if (node.nodeType === 3 && !node.data.trim() && !para) {
      node.remove();
      continue;
    }
    if (node.nodeType === 8) {
      node.remove();
      continue;
    }
    if (node.nodeType === 3 || INLINE_ROOT.test(name)) {
      // строчное содержимое прямо в корне → в абзац
      if (name === 'BR' && !para) {
        node.remove();
        changed = true;
        continue;
      }
      if (!para) {
        para = doc.createElement('p');
        root.insertBefore(para, node);
      }
      para.appendChild(node);
      changed = true;
      continue;
    }
    para = null;

    if (node.nodeType !== 1) continue;
    if (node.matches('.ted-ui-raw') || isWrap(node)) continue;
    // блок из реестра приводит свою форму правки к порядку сам (blocks/<тип>/<тип>.js → normalize)
    const nd = defOf(node);
    if (nd && nd.normalize) {
      if (nd.normalize(node, doc)) changed = true;
      continue;
    }

    if (name === 'DIV' || name === 'H1') {
      // Chrome иногда создаёт <div> вместо <p>
      const el = doc.createElement(name === 'H1' ? 'h2' : 'p');
      while (node.firstChild) el.appendChild(node.firstChild);
      if (node.className) el.className = node.className;
      node.replaceWith(el);
      changed = true;
      continue;
    }
    if (!isBlockTag(name)) {
      node.replaceWith(makeRaw(node, doc));
      changed = true;
    }
  }

  // мусор, который оставляет браузер при склейке блоков
  // код с токенами подсветки — сразу в чистый текст одним присваиванием: снимать тысячи span по одному — тысячи перестроек
  // текста (код на 2000 строк грузился 20 с в Safari). С маркерами курсора — ниже, по одному (их мало: идёт правка)
  for (const code of root.querySelectorAll('pre > code')) {
    if (!code.children.length || code.closest('.ted-ui-raw') || code.querySelector('[data-tedui-m]') || code.querySelector(':scope > br')) continue;
    code.textContent = code.textContent;
    changed = true;
  }
  for (const el of Array.from(root.querySelectorAll('span, font'))) {
    if (el.closest('.ted-ui-raw, [contenteditable="false"]') || el.hasAttribute('data-tedui-m')) continue;   // нередактируемый снимок (карточка) со своими span
    el.replaceWith(...el.childNodes);
    changed = true;
  }
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    // нередактируемые части блоков (полоса прогресса содержания и т. п.): их положение задаёт сам блок, при наборе не сбрасываем
    if (el.closest(`.ted-ui-raw, [contenteditable="false"], ${wrapSelector()}`)) continue;
    el.removeAttribute('style');
    changed = true;
  }

  // пустые блоки должны содержать <br>, чтобы в них можно было поставить курсор
  for (const el of root.querySelectorAll(':scope > p, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > pre, li, blockquote > p')) {
    if (!el.firstChild) {
      el.appendChild(doc.createElement('br'));
      changed = true;
    }
  }

  // пустой список/цитата → абзац
  for (const el of root.querySelectorAll(':scope > ul, :scope > ol, :scope > blockquote')) {
    if (!el.children.length) {
      const p = doc.createElement('p');
      p.appendChild(doc.createElement('br'));
      el.replaceWith(p);
      changed = true;
    }
  }

  // всегда есть куда поставить курсор
  const last = root.lastElementChild;
  if (!last || /^(HR|PRE)$/.test(last.tagName) || last.classList.contains('ted-ui-raw') || !!(defOf(last) && (defOf(last).caretBelow || defOf(last).lineAfter)) || (last.parentNode === root && !root.classList.contains('ted-ui-host') && isContainer(last))) {
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    root.appendChild(p);
    changed = true;
  }
  // пустой пункт чек-листа не бывает отмеченным (при Enter браузер копирует класс предыдущего пункта)
  for (const li of root.querySelectorAll('ul.ted-checklist > li.ted-checked')) {
    if (!li.textContent.replace(/[​\s]/g, '')) li.classList.remove('ted-checked');
  }
  // у блоков со своим видом цветного фона нет (остаётся от превращения или вставки)
  for (const el of root.querySelectorAll(':scope > [class*="ted-bg-"]')) {
    if (bgAllowed(el)) continue;
    for (const n of BG_NAMES) el.classList.remove(`ted-bg-${n}`);
    if (!el.className) el.removeAttribute('class');
    changed = true;
  }
  // у чек-листа и шагов выравнивания нет (остаётся от превращения или вставки)
  for (const el of root.querySelectorAll(':scope > [class*="ted-align-"]')) {
    if (alignAllowed(el)) continue;
    el.classList.remove('ted-align-center', 'ted-align-right');
    if (!el.className) el.removeAttribute('class');
    changed = true;
  }
  // шаги: у каждого пункта заголовок, <br> и описание (в описании — нулевой пробел, если оно пустое)
  for (const li of root.querySelectorAll('ol.ted-steps > li, ul.ted-facts > li')) {
    if (li.closest('.ted-ui-raw')) continue;
    if (fixStepItem(li, doc)) changed = true;
    // нулевой пробел лишний, когда в описании есть текст
    const sep = li.firstElementChild && li.firstElementChild.nextSibling;
    const d = sep && sep.nextSibling;
    if (d && d.nodeType === 3 && d.data.length > 1 && d.data.startsWith(ZWSP)) {
      const sel = document.getSelection();
      const keep = sel && sel.rangeCount && sel.anchorNode === d ? sel.anchorOffset - 1 : null;
      d.data = d.data.slice(1);
      if (keep !== null && keep >= 0) sel.collapse(d, keep);
      changed = true;
    }
  }
  // плюсы и минусы: починка структуры (после вложенного списка, вынесенного пункта, разбитой карточки):
  // карточка без класса сливается с предыдущей; вложенные списки в пунктах раскрываются в обычные пункты
  for (const pc of root.querySelectorAll(':scope > ul.ted-proscons')) {
    for (const card of [...pc.children]) {
      if (card.tagName !== 'LI') { card.remove(); changed = true; continue; }
      if (!card.classList.contains('ted-pros') && !card.classList.contains('ted-cons')) {
        const prev = card.previousElementSibling;
        if (prev) {
          let target = prev.querySelector(':scope > ul');
          if (!target) { target = doc.createElement('ul'); prev.appendChild(target); }
          for (const item of [...card.querySelectorAll('li')]) {
            if (item.querySelector('li')) continue;
            if (item.textContent.replace(/\u200b/g, '').trim()) target.appendChild(item);
          }
          const own = [...card.childNodes].filter((n) => n.nodeType === 3 || (n.nodeType === 1 && !/^(UL|OL)$/.test(n.tagName)));
          const text = own.map((n) => n.textContent).join('').replace(/\u200b/g, '').trim();
          if (text) { const li = doc.createElement('li'); li.textContent = text; target.appendChild(li); }
          card.remove();
        } else card.classList.add(pc.querySelector(':scope > li.ted-pros') ? 'ted-cons' : 'ted-pros');
        changed = true;
      }
    }
    for (const list of pc.querySelectorAll(':scope > li > ul')) {
      for (const nested of [...list.querySelectorAll(':scope > li > ul, :scope > li > ol')]) {
        const owner = nested.parentElement;
        let at = owner;
        for (const item of [...nested.children]) { at.after(item); at = item; }
        nested.remove();
        if (!owner.textContent.replace(/\u200b/g, '').trim() && !owner.querySelector('br')) owner.appendChild(doc.createElement('br'));
        changed = true;
      }
    }
    // лишнее между заголовком и списком карточки (пустые строки, <br>) убираем
    for (const card of pc.querySelectorAll(':scope > li')) {
      for (const n of [...card.childNodes]) {
        if (n === card.firstElementChild || (n.nodeType === 1 && n.tagName === 'UL')) continue;
        if (n.nodeType === 3 && n.data.trim()) continue;
        if (n.nodeType === 1 && n.textContent.trim()) continue;
        n.remove();
        changed = true;
      }
    }
  }
  // плюсы и минусы: у карточки всегда есть заголовок (может быть пустым) и список с пунктами
  for (const card of root.querySelectorAll('ul.ted-proscons > li')) {
    const first = card.firstChild;
    if (!(first && first.nodeType === 1 && first.tagName === 'STRONG')) {
      const t = doc.createElement('strong');
      t.appendChild(doc.createElement('br'));
      card.insertBefore(t, card.firstChild);
      changed = true;
    } else if (!first.firstChild) {
      first.appendChild(doc.createElement('br'));
      changed = true;
    }
    if (!card.querySelector(':scope > ul')) {
      const inner = doc.createElement('ul');
      const item = doc.createElement('li');
      item.appendChild(doc.createElement('br'));
      inner.appendChild(item);
      card.appendChild(inner);
      changed = true;
    }
  }
  // номера строк кода и инициалы автора цитаты пересчитываются при правке текста
  // блок кода: внутри <pre> всегда <code>; подсветка в правке рисуется поверх текста, поэтому токены-<span> из загруженного HTML снимаем
  for (const pre of root.querySelectorAll(':scope > pre')) {
    if (pre.closest('.ted-ui-raw')) continue;
    const had = !!pre.querySelector(':scope > code');
    const code = ensureCode(pre, doc);
    if (!had) changed = true;
    if (code.hasAttribute('data-nums')) { code.removeAttribute('data-nums'); pre.setAttribute('data-nums', '1'); changed = true; }
    if (code.children.length && !code.querySelector('[data-tedui-m]') && !code.querySelector(':scope > br')) {
      const sel = document.getSelection();
      const keep = sel && sel.rangeCount && code.contains(sel.anchorNode) ? null : undefined;
      void keep;
      code.textContent = code.textContent;
      changed = true;
    }
    if (code.childNodes.length > 1 && !code.querySelector('[data-tedui-m]')) code.normalize();   // тысячи соседних текстовых узлов (после загрузки) склеиваем
    if (!pre.hasAttribute('data-lang') && !pre.hasAttribute('data-tedui-auto')) pre.setAttribute('data-tedui-auto', '');
    if (pre.hasAttribute('data-nums')) {
      const before = pre.getAttribute('data-nums');
      const n = (code.textContent.match(/\n/g) || []).length + 1;
      if (before.split('\n').length !== n || (n > 9) !== pre.hasAttribute('data-nums-d')) { setNumsAttrs(pre, n); changed = true; }
    } else if (!pre.hasAttribute('data-nonums')) {
      // номера строк по умолчанию: старый <pre> без data-nums получает их при загрузке (выключены явно — data-nonums)
      setNumsAttrs(pre, (code.textContent.match(/\n/g) || []).length + 1);
      changed = true;
    }
  }
  for (const p of root.querySelectorAll('blockquote > p.ted-author')) {
    if (fixStepItem(p, doc)) changed = true;
    const nameEl = p.querySelector('strong');
    const init = initialsOf(nameEl ? nameEl.textContent : p.textContent);
    if (p.getAttribute('data-initials') !== init) { p.setAttribute('data-initials', init); changed = true; }
  }
  return changed;
}

export function emptyBlock(doc, tag = 'p') {
  const el = doc.createElement(tag);
  // список — всегда с пунктом: <ul><li><br></li></ul>, иначе получается пустой <ul>
  let inner = tag === 'ul' || tag === 'ol' ? el.appendChild(doc.createElement('li')) : el;
  if (tag === 'pre') {
    inner = el.appendChild(doc.createElement('code'));   // блок кода: шапка и номера строк по умолчанию
    el.setAttribute('data-nums', '1');
  }
  inner.appendChild(doc.createElement('br'));
  return el;
}

export function isEmptyBlock(el) {
  if (!el || el.nodeType !== 1) return false;
  const t = blockType(el);
  if (t === 'raw' || isObjectBlock(el) || isContainer(el) || !!(defOf(el) && defOf(el).neverEmpty)) return false;   // пустая таблица — всё равно блок (у неё есть ручка и корзина)
  const text = el.textContent.replace(/​/g, '');
  // При преобразовании пустого абзаца его <br> становится переносом в <pre>.
  return !(t === 'pre' ? text.trim() : text).length && !el.querySelector(['img', objectSelector()].filter(Boolean).join(', '));
}

export const ZWSP = '​';

/** Шаг в правке: <li><strong>заголовок</strong><br>описание</li>; пустое описание держит нулевой пробел, чтобы в нём был курсор. */
export function fixStepItem(li, doc) {
  let changed = false;
  let title = li.firstChild;
  if (!(title && title.nodeType === 1 && title.tagName === 'STRONG')) {
    // старая или вставленная разметка без заголовка: заголовок пустой, всё остальное — описание
    title = doc.createElement('strong');
    title.appendChild(doc.createElement('br'));
    li.insertBefore(title, li.firstChild);
    if (li.childNodes.length > 1) li.insertBefore(doc.createElement('br'), title.nextSibling);
    changed = true;
  } else if (!title.firstChild) {
    title.appendChild(doc.createElement('br'));
    changed = true;
  }
  let sep = title.nextSibling;
  if (!(sep && sep.nodeType === 1 && sep.tagName === 'BR')) {
    sep = doc.createElement('br');
    li.insertBefore(sep, title.nextSibling);
    changed = true;
  }
  const desc = sep.nextSibling;
  if (!desc || (desc.nodeType === 1 && /^(UL|OL)$/.test(desc.tagName))) {
    li.insertBefore(doc.createTextNode(ZWSP), desc);
    changed = true;
  } else if (desc.nodeType === 3 && !desc.data) {
    // пустой текст (описание целиком ушло в новый шаг) строки не даёт — шаг ниже, и следующий наезжает (1.0.4)
    let rest = '';
    for (let n = desc.nextSibling; n && !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName)); n = n.nextSibling) rest += n.textContent;
    if (!rest) { desc.data = ZWSP; changed = true; }
  }
  return changed;
}

/** Новый шаг: пустой заголовок и пустое описание. */
export function emptyStepItem(doc) {
  const li = doc.createElement('li');
  fixStepItem(li, doc);
  return li;
}

/** Пустой блок «Шаги»: один пустой шаг с заглушками «Шаг» / «Описание шага»; следующие создаются Enter. */
export function emptyStepsBlock(doc) {
  const ol = doc.createElement('ol');
  ol.classList.add('ted-steps');
  ol.appendChild(emptyStepItem(doc));
  return ol;
}

