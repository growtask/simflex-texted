// Медиа (Media/image, gallery, video, audio, file) — этап 5.17–5.21. Семейство: одна папка, пять видов (variants), полностью
// в папке (этап 5): разметка, очистка, сохранение, загрузка и окна (media.editor.js), плеер, имена файлов, кнопка «Смотреть на …».
// В редакторе блок живёт в обёртке правки <div class="ted-ui-media" contenteditable="false"> (block.json → wrap).
import MEDIA_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { urlOk } from '../../resources/js/core/urls.js';
import { bjEsc, bjUrl } from '../../resources/js/core/blocks-json.js';
import { MediaBlocks } from './media.editor.js';
export const MEDIA_KINDS = new Set(['image', 'gallery', 'video', 'audio', 'file']);


/** Адрес медиа: путь на сайте или http(s) без логина; поверх — общее правило адресов (core/urls.js). */
export function safeMediaUrl(value) {
  if (!urlOk(value, 'media')) return '';
  if (typeof value !== 'string' || /[\u0000-\u0020\\]/.test(value)) return '';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (!/^https?:\/\//i.test(value)) return '';
  try {
    const url = new URL(value);
    return url.username || url.password ? '' : url.href;
  } catch { return ''; }
}

export function videoEmbedUrl(value) {
  const url = safeMediaUrl(value);
  if (!url || url.startsWith('/')) return '';
  const { hostname, pathname, searchParams } = new URL(url);
  const host = hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    const id = host === 'youtu.be' ? pathname.slice(1) : (searchParams.get('v') || /^\/(?:shorts|embed)\/([^/]+)\/?$/.exec(pathname)?.[1]);
    return /^[\w-]{11}$/.test(id || '') ? `https://www.youtube-nocookie.com/embed/${id}` : '';
  }
  if (host === 'rutube.ru') {
    const id = /^\/(?:video\/(?:private\/)?|play\/embed\/)([a-f0-9]{32})\/?$/i.exec(pathname)?.[1];
    const key = searchParams.get('p');
    return id ? `https://rutube.ru/play/embed/${id}${key ? `?p=${encodeURIComponent(key)}` : ''}` : '';
  }
  if (host === 'vkvideo.ru' || host === 'vk.com') {
    const video = /^\/video(-?\d+)_(\d+)\/?$/.exec(pathname);
    const owner = video?.[1] || searchParams.get('oid');
    const id = video?.[2] || searchParams.get('id');
    const hash = searchParams.get('hash');
    if ((video || pathname === '/video_ext.php') && /^-?\d+$/.test(owner || '') && /^\d+$/.test(id || '')) {
      return `https://vkvideo.ru/video_ext.php?oid=${owner}&id=${id}${hash ? `&hash=${encodeURIComponent(hash)}` : ''}`;
    }
  }
  return '';
}

export function makeMediaFigure(doc, kind, items = [], caption = '') {
  const figure = doc.createElement('figure');
  figure.className = `ted-media ted-media--${kind}`;
  for (const item of items) {
    const url = safeMediaUrl(item.url);
    if (!url) continue;
    let node;
    if (kind === 'image' || kind === 'gallery') {
      node = doc.createElement('img');
      node.src = url;
      node.alt = item.alt || '';
      // размеры из ответа сервера: место под фото резервируется до загрузки картинки, страница не «прыгает»
      const w = Number(item.width); const hh = Number(item.height);
      if (Number.isInteger(w) && Number.isInteger(hh) && w > 0 && hh > 0 && w <= 20000 && hh <= 20000) { node.setAttribute('width', String(w)); node.setAttribute('height', String(hh)); }
      node.loading = 'lazy';
      if (kind === 'gallery') {
        const tile = doc.createElement('figure');
        tile.appendChild(node);
        appendMediaCaption(tile, item.caption);
        node = tile;
      }
    } else if (kind === 'file' || item.embed) {
      // Внешний плеер загружается только после действия посетителя.
      const embedUrl = item.embed ? videoEmbedUrl(url) : '';
      if (item.embed && !embedUrl) continue;
      node = doc.createElement('a');
      node.href = url;
      node.textContent = item.name || (embedUrl ? 'Смотреть видео' : 'Скачать файл');
      if (embedUrl) node.dataset.tedVideo = embedUrl;
      else node.setAttribute('download', '');
    } else {
      node = doc.createElement(kind);
      node.src = url;
      if (kind === 'audio' && item.name) node.title = String(item.name).slice(0, 200);
      node.controls = true;
      // Видео с постером не грузится, пока посетитель не нажмёт «играть» — страница остаётся лёгкой.
      const poster = kind === 'video' ? safeMediaUrl(item.poster) : '';
      node.preload = poster ? 'none' : 'metadata';
      if (poster) node.poster = poster;
      if (kind === 'video') node.setAttribute('playsinline', '');
    }
    figure.appendChild(node);
  }
  appendMediaCaption(figure, caption);
  return figure;
}

function appendMediaCaption(figure, value) {
  if (!value) return;
  const caption = figure.ownerDocument.createElement('figcaption');
  caption.textContent = value;
  figure.appendChild(caption);
}

export function mediaKind(figure) {
  return [...MEDIA_KINDS].find(kind => figure.classList.contains(`ted-media--${kind}`));
}

export function readMediaFigure(figure, kind) {
  const items = [];
  for (const entry of figure.children) {
    if (entry.tagName === 'FIGCAPTION') continue;
    const node = kind === 'gallery' ? entry.querySelector(':scope > img') : entry;
    const allowed = kind === 'gallery' || kind === 'image' ? ['IMG'] : kind === 'video' ? ['VIDEO', 'A'] : [kind === 'file' ? 'A' : 'AUDIO'];
    if (!node || !allowed.includes(node.tagName)) continue;
    const src = node.getAttribute(node.tagName === 'A' ? 'href' : 'src');
    if (!safeMediaUrl(src)) continue;
    items.push({ url: src, poster: node.tagName === 'VIDEO' ? safeMediaUrl(node.getAttribute('poster')) : '', alt: node.getAttribute('alt') || '', width: Number(node.getAttribute('width')) || 0, height: Number(node.getAttribute('height')) || 0, name: node.tagName === 'A' ? node.textContent : (node.tagName === 'AUDIO' ? node.getAttribute('title') || '' : ''),
      caption: kind === 'gallery' ? entry.querySelector(':scope > figcaption')?.textContent || '' : '', embed: kind === 'video' && node.tagName === 'A' });
    if (!['gallery', 'file'].includes(kind)) break;
  }
  return { items, caption: figure.querySelector(':scope > figcaption')?.textContent || '' };
}

export function mediaEditorBlock(figure) {
  const block = figure.ownerDocument.createElement('div');
  block.className = 'ted-ui-media';
  block.setAttribute('contenteditable', 'false');
  block.appendChild(figure);
  return block;
}

/** Адреса наших файлов (<адрес папки файлов>/…, по умолчанию /uf/…) в медиаблоках документа: изображения, видео и постеры, аудио, файлы. */
export function mediaUrlsOf(html, base = '/uf') {
  const prefix = String(base || '/uf').replace(/\/+$/, '') + '/';
  const urls = new Set();
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  for (const figure of doc.querySelectorAll('figure.ted-media')) {
    for (const node of figure.querySelectorAll('img[src], video[src], audio[src], video[poster], a[href]:not([data-ted-video])')) {
      for (const name of ['src', 'poster', 'href']) {
        const value = node.getAttribute(name);
        if (value && value.startsWith(prefix)) urls.add(value);
      }
    }
  }
  return urls;
}


// Ted.fromBlocks: { "type": "image", "url", "alt", "caption" }, { "type": "gallery", "items": [...] }, video { url, embed, name },
// audio { url, caption }, file { url, name } или { items: [...] }
/** Ted.toMarkdown (22.11): картинки — ![alt](адрес), видео, аудио, файлы — ссылками, подпись — курсивом. */
function mediaToMarkdown(el, md) {
  const imgs = [...el.querySelectorAll('img')].map((i) => `![${i.getAttribute('alt') || ''}](${i.getAttribute('src') || ''})`);
  const links = [...el.querySelectorAll('video[src], audio[src], iframe[src], a[href]')].map((x) => `[${x.getAttribute('title') || x.textContent.trim() || 'Файл'}](${x.getAttribute('src') || x.getAttribute('href')})`);
  const cap = el.querySelector(':scope > figcaption');
  return [...imgs, ...links].join('\n\n') + (cap ? `\n\n*${md.inline(cap).trim()}*` : '');
}

const MEDIA_JSON = {
  image: (b) => `<figure class="ted-media ted-media--image"><img src="${bjUrl(b.url)}" alt="${bjEsc(b.alt)}" loading="lazy">${b.caption ? `<figcaption>${bjEsc(b.caption)}</figcaption>` : ''}</figure>`,
  gallery: (b) => `<figure class="ted-media ted-media--gallery">${(b.items || []).map((i) => `<figure><img src="${bjUrl(i.url)}" alt="${bjEsc(i.alt)}" loading="lazy">${i.caption ? `<figcaption>${bjEsc(i.caption)}</figcaption>` : ''}</figure>`).join('')}${b.caption ? `<figcaption>${bjEsc(b.caption)}</figcaption>` : ''}</figure>`,
  video: (b) => `<figure class="ted-media ted-media--video"><a href="${bjUrl(b.url)}" data-ted-video="${bjUrl(b.embed || b.url)}">${bjEsc(b.name || 'Смотреть видео')}</a></figure>`,
  audio: (b) => `<figure class="ted-media ted-media--audio"><audio src="${bjUrl(b.url)}" controls preload="metadata"></audio>${b.caption ? `<figcaption>${bjEsc(b.caption)}</figcaption>` : ''}</figure>`,
  file: (b) => `<figure class="ted-media ted-media--file">${(b.items || [b]).map((i) => `<a href="${bjUrl(i.url)}" download="">${bjEsc(i.name || 'Скачать файл')}</a>`).join('')}</figure>`,
};

/** Очистка: элемент сайта или блок внутри обёртки правки → обёртка правки (пустой — null). */
function cleanMedia(media, doc, idOk, wrap = null) {
  const kind = mediaKind(media);
  if (!kind) return null;
  const { items, caption } = readMediaFigure(media, kind);
  if (!items.length) return null;
  const figure = makeMediaFigure(doc, kind, items, caption);
  const id = (wrap && wrap.id) || media.id;
  if (idOk(id)) figure.id = id;
  for (const cls of media.classList) if (/^ted-align-(center|right)$/.test(cls)) figure.classList.add(cls);
  const block = mediaEditorBlock(figure);
  if (figure.id) { block.id = figure.id; figure.removeAttribute('id'); }
  return block;
}

/** Сохранение: блок внутри обёртки → HTML сайта; якорь — с обёртки; всё вычищено (опасный адрес) — не сохраняем. */
function serializeMedia(figure, wrap = null) {
  if (!figure.firstElementChild) return '';
  const out = figure.cloneNode(true);
  if (wrap && wrap.id) out.id = wrap.id;
  return out.outerHTML;
}

/** В наборе без вида: файлы и видео — ссылками (так же на сервере — Media.php); у изображения остаётся подпись абзацем
 * (28.11: подпись старой статьи не пропадает), галерея и аудио исчезают (degrade: drop). */
const captionToText = (el, { p, text, esc }) => { const t = text(el.querySelector("figcaption")); return t ? [p(esc(t))] : []; };
const linksToText = (el, { doc }) => [...el.querySelectorAll('a[href]')].map((a) => {
  const n = doc.createElement('p'); const link = doc.createElement('a');
  link.href = a.getAttribute('href'); link.textContent = a.textContent || a.getAttribute('href');
  n.appendChild(link);
  return n;
});

/** Вставили чужой HTML: одиночная картинка (<img>, <picture>, чужой <figure> с подписью) — блок «Изображение», а не «сырой» HTML
 * (заказчик 17.11). Дальше её скачивает и сжимает сервер (afterPaste → fetchExternal). */
function imageFromRaw(el, doc) {
  const imgs = el.tagName === 'IMG' ? [el] : [...el.querySelectorAll('img')];
  if (imgs.length !== 1 || !/^(IMG|PICTURE|FIGURE|A)$/.test(el.tagName) || el.querySelector('video, audio, iframe, table')) return null;
  const img = imgs[0];
  // старые страницы TinyMCE: адрес относительно админки («../../../uf/x.webp») — от корня сайта («/uf/x.webp», импорт 22.11)
  const raw = (img.getAttribute('src') || '').trim().replace(/^(?:\.\.?\/)+/, '/');
  // пробелы и кириллица в имени файла («доставка 3.webp») — в виде адреса, как его кодирует браузер (%20, %D0…)
  let enc = raw;
  try { enc = encodeURI(decodeURI(raw)); } catch { enc = encodeURI(raw); }
  const url = safeMediaUrl(enc);
  if (!url) return null;
  const cap = el.tagName === 'FIGURE' ? (el.querySelector('figcaption')?.textContent || '').replace(/\s+/g, ' ').trim() : '';
  return mediaEditorBlock(makeMediaFigure(doc, 'image', [{ url, alt: img.getAttribute('alt') || '' }], cap));
}

const mediaUi = (editor) => new MediaBlocks(editor);   // одна правка на всё семейство
const { variants: MEDIA_VARIANTS, ...MEDIA_BASE } = MEDIA_BLOCK;
for (const v of MEDIA_VARIANTS) {
  registerBlock({
    toMarkdown: mediaToMarkdown,
    ...MEDIA_BASE,
    ...v,
    match: (el) => el.matches(v.selector),
    fromJson: MEDIA_JSON[v.type],
    clean: cleanMedia,
    serialize: serializeMedia,
    insert: (editor, block) => (editor.media ? editor.media.create(v.type, block) : null),
    blank: (doc) => mediaEditorBlock(makeMediaFigure(doc, v.type, [])),
    filesOf: mediaUrlsOf,
    editorUi: mediaUi,
    editorUiName: 'media',
    ...(v.type === 'file' || v.type === 'video' ? { toText: linksToText } : {}),
    ...(v.type === 'image' ? { toText: captionToText } : {}),
    ...(v.type === 'image' ? { fromRaw: imageFromRaw } : {}),
  });
}
