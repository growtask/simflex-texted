// Блок «Встраивание» — полностью в папке (этап 5).
// Встраивание (этап 6.4, макет block-embed, Embed/embed type=post, окно editor-popover kind=embed).
// Решение заказчика: карточка из CMS (провайдер articles) и по ссылке через OpenGraph (страницу читает сервер CMS);
// плюс уменьшенная версия в одну строку (ted-embed--compact).
// Сайт (снимок данных, без скрипта):
//   <div class="ted-embed [ted-embed--compact]" [data-ted-article="id"]>
//     <div class="ted-embed__head"><span class="ted-embed__avatar">АП</span>|<img class="ted-embed__avatar" src alt="">
//       <span class="ted-embed__who"><span class="ted-embed__name">Заголовок</span><span class="ted-embed__sub">сайт · дата</span></span>
//       [компактная: <a class="ted-embed__open" …>Открыть</a>]</div>
//     <p class="ted-embed__text">Описание</p><img class="ted-embed__img" src alt="">
//     <div class="ted-embed__foot">[<span class="ted-embed__pill ted-embed__pill--views">1.2K</span>][<span class="… --likes">128</span>]<a class="ted-embed__open" href target="_blank" rel="noopener">Открыть</a></div>
//   </div>

import EMBED_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { urlOk } from '../../resources/js/core/urls.js';
import { EmbedUI } from './embed.editor.js';

const EMBED_URL_RE = /^(https?:\/\/|\/(?!\/))/i;
const EMBED_IMG_RE = /^(https?:\/\/|\/(?!\/))/i;
const embedLine = (s, n = 300) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const embedEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Ссылка карточки: http(s) или путь на сайте. */
export function embedUrlOk(v) {
  const s = String(v || '').trim();
  return !!s && EMBED_URL_RE.test(s) && urlOk(s, 'link') && !/[\s<>"'`]/.test(s);
}

const imgOk = (v) => { const s = String(v || '').trim(); return !!s && EMBED_IMG_RE.test(s) && urlOk(s, 'image') && !/[\s<>"'`]/.test(s); };
const countOk = (v) => { const s = embedLine(v, 12); return /^[\d\s.,]+[KkMmКкМм]?$/.test(s) ? s : ''; };

/** Инициалы для аватара (как у автора цитаты): две буквы. */
/** Ссылка на пост или страницу соцсети: в заголовке карточки — имя автора или канала. */
const EMBED_SOCIAL = /(^|\.)(t\.me|telegram\.me|vk\.com|vk\.ru|ok\.ru|x\.com|twitter\.com|instagram\.com|facebook\.com|threads\.net|dzen\.ru|pikabu\.ru)$/i;
export function embedSocial(url) {
  try { return EMBED_SOCIAL.test(new URL(url, 'https://x.invalid/').hostname); } catch { return false; }
}

export function embedInitials(name) {
  const words = embedLine(name).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '').slice(0, 2)).toUpperCase();
}

/** Данные карточки из ответа провайдера (articles / opengraph) — только строки в разумных пределах. */
export function embedData(raw = {}) {
  const url = embedUrlOk(raw.url) ? String(raw.url).trim() : '';
  let host = '';
  try { host = url && /^https?:/i.test(url) ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch (e) { host = ''; }
  const site = embedLine(raw.site || raw.author || host, 80);
  const date = embedLine(raw.date, 40);
  return {
    url,
    id: embedLine(raw.id, 64).replace(/[^\w-]/g, ''),
    title: embedLine(raw.title, 200) || site || host,
    text: embedLine(raw.text || raw.description, 500),
    image: imgOk(raw.image) ? String(raw.image).trim() : '',
    avatar: imgOk(raw.avatar) ? String(raw.avatar).trim() : '',
    sub: embedLine(raw.sub, 120) || [site, date].filter(Boolean).join(' · '),
    views: countOk(raw.views),
    likes: countOk(raw.likes),
    compact: !!raw.compact,
    button: embedLine(raw.button, 30) || 'Открыть',
  };
}

/** Данные из разметки блока (сайт или правка). */
export function readEmbed(node) {
  const q = (s) => node.querySelector(s);
  const open = q('a.ted-embed__open');
  const av = q('.ted-embed__avatar');
  return embedData({
    url: open ? open.getAttribute('href') : '',
    id: node.getAttribute('data-ted-article') || '',
    title: q('.ted-embed__name')?.textContent,
    sub: q('.ted-embed__sub')?.textContent,
    text: q('.ted-embed__text')?.textContent,
    image: q('img.ted-embed__img')?.getAttribute('src'),
    avatar: av && av.tagName === 'IMG' ? av.getAttribute('src') : '',
    views: q('.ted-embed__pill--views')?.textContent,
    likes: q('.ted-embed__pill--likes')?.textContent,
    compact: node.classList.contains('ted-embed--compact'),
    button: open ? open.textContent : '',
  });
}

/** HTML карточки (и для сайта, и для правки — в правке блок нередактируемый). */
export function embedHTML(d, { id = '', edit = false } = {}) {
  if (!d.url) return '';
  const cls = `ted-embed${d.compact ? ' ted-embed--compact' : ''}`;
  const attrs = `${id ? ` id="${embedEsc(id)}"` : ''}${d.id ? ` data-ted-article="${embedEsc(d.id)}"` : ''}${edit ? ' contenteditable="false"' : ''}`;
  // буквы аватара: у поста соцсети — имя автора (заголовок карточки), у статьи сайта и CMS — сайт или автор в подписи (решение 22.11)
  const letters = embedSocial(d.url) ? (d.title || d.sub) : (d.sub.split(' · ')[0] || d.title);
  const avatar = d.avatar ? `<img class="ted-embed__avatar" src="${embedEsc(d.avatar)}" alt="">` : `<span class="ted-embed__avatar">${embedEsc(embedInitials(letters))}</span>`;
  const external = /^https?:/i.test(d.url);
  const open = `<a class="ted-embed__open" href="${embedEsc(d.url)}"${external ? ' target="_blank" rel="noopener"' : ''}>${embedEsc(d.button)}</a>`;
  const who = `<span class="ted-embed__who"><span class="ted-embed__name">${embedEsc(d.title)}</span>${d.sub ? `<span class="ted-embed__sub">${embedEsc(d.sub)}</span>` : ''}</span>`;
  if (d.compact) return `<div class="${cls}"${attrs}><div class="ted-embed__head">${avatar}${who}${open}</div></div>`;
  const text = d.text ? `<p class="ted-embed__text">${embedEsc(d.text)}</p>` : '';
  const img = d.image ? `<img class="ted-embed__img" src="${embedEsc(d.image)}" alt="" loading="lazy">` : '';
  const pills = (d.views ? `<span class="ted-embed__pill ted-embed__pill--views">${embedEsc(d.views)}</span>` : '') + (d.likes ? `<span class="ted-embed__pill ted-embed__pill--likes">${embedEsc(d.likes)}</span>` : '');
  return `<div class="${cls}"${attrs}><div class="ted-embed__head">${avatar}${who}</div>${text}${img}<div class="ted-embed__foot">${pills}${open}</div></div>`;
}

/** Блок правки из данных (без ссылки — пустое состояние: поле ссылки рисует интерфейс). */
export function makeEmbedBlock(doc, raw = null, id = '') {
  const d = raw ? embedData(raw) : null;
  if (d && d.url) {
    const tpl = doc.createElement('template');
    tpl.innerHTML = embedHTML(d, { id, edit: true });
    return tpl.content.firstElementChild;
  }
  const el = doc.createElement('div');
  el.className = 'ted-embed';
  el.setAttribute('contenteditable', 'false');
  el.setAttribute('data-tedui-empty', '');
  if (id) el.id = id;
  return el;
}

export function cleanEmbed(node, doc, idOk) {
  return makeEmbedBlock(doc, readEmbed(node), idOk && idOk(node.id) ? node.id : '');
}

/** Правка: блок пересобирается из своих данных, если разметка разошлась с эталоном. */
export function normalizeEmbed(el, doc) {
  if (el.hasAttribute('data-tedui-empty')) {
    let changed = false;
    if (el.getAttribute('contenteditable') !== 'false') { el.setAttribute('contenteditable', 'false'); changed = true; }
    for (const n of [...el.childNodes]) if (!(n.nodeType === 1 && n.hasAttribute('data-tedui-m'))) { n.remove(); changed = true; }
    return changed;
  }
  const d = readEmbed(el);
  const want = embedHTML(d, { id: el.id, edit: true });
  const probe = el.cloneNode(true);
  for (const at of [...probe.attributes]) if (at.name.startsWith('data-tedui-')) probe.removeAttribute(at.name);   // служебные пометки правки
  const tpl = doc.createElement('template');
  tpl.innerHTML = want;   // сравниваем разобранную разметку (неразрывный пробел и &nbsp; — одно и то же)
  if (tpl.content.firstElementChild && probe.outerHTML === tpl.content.firstElementChild.outerHTML) return false;
  const fresh = makeEmbedBlock(doc, d, el.id);
  el.replaceWith(fresh);
  return true;
}

/** Форма правки → HTML сайта; пустой блок не сохраняется. */
export function serializeEmbed(el) {
  if (el.hasAttribute('data-tedui-empty')) return '';
  return embedHTML(readEmbed(el), { id: el.id });
}


registerBlock({
  ...EMBED_BLOCK,
  match: (el) => el.tagName === 'DIV' && el.classList.contains('ted-embed'),
  /** Макет block-embed, state=empty: поле ссылки и «Добавить»; после вставки курсор — в поле. */
  create: (doc) => ({ el: makeEmbedBlock(doc), focus: null }),
  afterInsert: (editor, el) => { if (editor.embeds) editor.embeds.focusInput(el); },
  /** Пустой блок (без ссылки) из вставки не сохраняется. */
  clean: (node, doc, idOk) => { const card = cleanEmbed(node, doc, idOk); return card.hasAttribute('data-tedui-empty') ? null : card; },
  serialize: serializeEmbed,
  normalize: normalizeEmbed,
  canAlign: () => false,
  canBg: () => false,
  editorUi: (editor) => new EmbedUI(editor),
  editorUiName: 'embeds',
  /** Вставили ссылку отдельным абзацем: «Встроить карточкой» — если CMS подключила opengraph. */
  canFromLink: (editor) => typeof editor.options.opengraph === 'function' && !!editor.embeds,
  fromLink: (editor, block, url) => editor.embeds.fromUrl(block, url),
  /** В наборе без встраивания — ссылка «Открыть» с заголовком карточки; так же на сервере — embed.php. */
  toText: (el, { p, esc }) => {
    const a = el.querySelector('a.ted-embed__open[href]');
    const t = el.querySelector('.ted-embed__name');
    return a ? [p('<a href="' + esc(a.getAttribute('href')) + '">' + esc((t && t.textContent.trim()) || a.getAttribute('href')) + '</a>')] : [];
  },
});
