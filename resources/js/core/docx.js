// Word (.docx) без библиотек (1.0.5): docx — zip с XML. Распаковка — DecompressionStream браузера, упаковка — без сжатия
// (stored: Word открывает такие файлы, картинки внутри и так сжаты). Загрузка: заголовки, абзацы, жирный / курсив /
// подчёркнутый / зачёркнутый, ссылки, списки с вложенностью, цитаты, подписи, таблицы, картинки (файлами — редактор
// загружает их на сервер, как вставленные). Выгрузка: те же элементы плюс код, линия; картинки встраиваются (WebP и другие —
// перекодируются в PNG), чужие без CORS — ссылкой. Всё загруженное дальше проходит обычную очистку и набор блоков поля.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Файлы zip: имя → () => Promise<Uint8Array>. Ошибка — не zip. */
export function unzip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip');
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = u8.subarray(start, start + size);
    files.set(name, () => (method === 0 ? Promise.resolve(data) : method === 8 ? inflateRaw(data) : Promise.reject(new Error('zip method ' + method))));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

let crcTable = null;
function crc32(u8) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip без сжатия: [{ name, data: Uint8Array | string }] → Blob. */
export function zip(entries, type = 'application/zip') {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
    head.setUint16(10, 0, true); head.setUint16(12, 0x21, true); head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    parts.push(new Uint8Array(head.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true); cd.setUint16(14, 0x21, true); cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type });
}

// ---------------------------------------------------------------------------
// Word → HTML
// ---------------------------------------------------------------------------

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
const kid = (el, name) => kids(el, name)[0] || null;
const wAttr = (el, name) => (el ? el.getAttributeNS(W, name) ?? el.getAttribute('w:' + name) : null);
const onFlag = (el) => !!el && !/^(false|0|none|off)$/i.test(wAttr(el, 'val') || '');
const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
/** Метка картинки в HTML загруженного документа: «[[texted-word-image-N]]» — отдельный абзац. */
export const WORD_IMAGE = '[[texted-word-image-';

async function readXml(files, name) {
  const get = files.get(name);
  if (!get) return null;
  return new DOMParser().parseFromString(dec.decode(await get()), 'application/xml');
}

/** Стили документа: id → { level (заголовок 1…), quote }. */
function readStyles(doc) {
  const out = {};
  if (!doc) return out;
  const all = [...doc.getElementsByTagNameNS(W, 'style')];
  const byId = Object.fromEntries(all.map((s) => [wAttr(s, 'styleId'), s]));
  const info = (s, depth = 0) => {
    if (!s || depth > 8) return {};
    const name = (wAttr(kid(s, 'name'), 'val') || '').toLowerCase();
    const m = /^heading\s*(\d)$/.exec(name);
    if (m) return { level: +m[1] };
    if (name === 'title') return { level: 1 };
    if (/quote|цитата/.test(name)) return { quote: true };
    const ol = kid(kid(s, 'pPr'), 'outlineLvl');
    if (ol && +wAttr(ol, 'val') < 6) return { level: +wAttr(ol, 'val') + 1 };
    const base = wAttr(kid(s, 'basedOn'), 'val');
    return base ? info(byId[base], depth + 1) : {};
  };
  for (const s of all) out[wAttr(s, 'styleId')] = info(s);
  return out;
}

/** Нумерация: numId → ilvl → 'ul' | 'ol'. */
function readNumbering(doc) {
  const out = {};
  if (!doc) return out;
  const abstract = {};
  for (const a of doc.getElementsByTagNameNS(W, 'abstractNum')) {
    abstract[wAttr(a, 'abstractNumId')] = Object.fromEntries(kids(a, 'lvl').map((l) => [wAttr(l, 'ilvl'), wAttr(kid(l, 'numFmt'), 'val') === 'bullet' ? 'ul' : 'ol']));
  }
  for (const n of doc.getElementsByTagNameNS(W, 'num')) out[wAttr(n, 'numId')] = abstract[wAttr(kid(n, 'abstractNumId'), 'val')] || {};
  return out;
}

/**
 * .docx → HTML статьи. { html, images, skippedImages }. Ошибка — не документ Word.
 * Заголовок 1 → h2 (h1 у страницы свой), 2 → h3, 3 и ниже → h4.
 */
export async function docxToHtml(buffer) {
  const files = unzip(buffer);
  const doc = await readXml(files, 'word/document.xml');
  if (!doc || !doc.getElementsByTagNameNS(W, 'body')[0]) throw new Error('not docx');
  const styles = readStyles(await readXml(files, 'word/styles.xml'));
  const numbering = readNumbering(await readXml(files, 'word/numbering.xml'));
  const relsDoc = await readXml(files, 'word/_rels/document.xml.rels');
  const rels = {};
  if (relsDoc) for (const r of relsDoc.getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = { target: r.getAttribute('Target') || '', external: r.getAttribute('TargetMode') === 'External' };
  const images = [];
  let skippedImages = 0;

  // картинка — метка-абзац [[texted-word-image-N]]: в HTML статьи data: не пускаем (блок «Изображение» — только файлы
  // на сервере); редактор ставит на место метки блок и загружает файл, как вставленный (exchange.js → placeWordImages)
  const imageHtml = async (rid) => {
    const rel = rels[rid];
    if (!rel || rel.external) { skippedImages++; return ''; }
    const path = rel.target.startsWith('/') ? rel.target.slice(1) : 'word/' + rel.target.replace(/^\.\//, '');
    const ext = (path.split('.').pop() || '').toLowerCase();
    const type = IMAGE_TYPES[ext];
    const get = files.get(path);
    if (!type || !get) { skippedImages++; return ''; }   // EMF / WMF и прочее браузер не покажет
    images.push(new File([await get()], `word-image-${images.length + 1}.${ext === 'jpeg' ? 'jpg' : ext}`, { type }));
    return `<p>${WORD_IMAGE}${images.length}]]</p>`;
  };

  /** Текст абзаца: отрезки с оформлением, соседние одинаковые склеиваются. Картинки — отдельно, блоками после абзаца. */
  const inline = async (p, pics) => {
    const segs = [];
    const run = async (r, href) => {
      const pr = kid(r, 'rPr');
      const f = { b: onFlag(kid(pr, 'b')), i: onFlag(kid(pr, 'i')), u: !!kid(pr, 'u') && wAttr(kid(pr, 'u'), 'val') !== 'none', s: onFlag(kid(pr, 'strike')) || onFlag(kid(pr, 'dstrike')), href };
      const va = wAttr(kid(pr, 'vertAlign'), 'val');
      f.sup = va === 'superscript';
      f.sub = va === 'subscript';
      for (const c of r.children) {
        if (c.localName === 't') segs.push({ ...f, html: escHtml(c.textContent) });
        else if (c.localName === 'tab') segs.push({ ...f, html: ' ' });
        else if (c.localName === 'noBreakHyphen') segs.push({ ...f, html: '-' });
        else if (c.localName === 'br' && !wAttr(c, 'type')) segs.push({ ...f, html: '<br>' });
        else if (c.localName === 'drawing' || c.localName === 'pict') {
          const blip = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
          const vml = [...c.getElementsByTagName('*')].find((x) => x.localName === 'imagedata');
          const rid = blip ? blip.getAttributeNS(R, 'embed') : vml ? vml.getAttributeNS(R, 'id') : null;
          if (rid) pics.push(await imageHtml(rid));
        }
      }
    };
    const walk = async (el, href) => {
      for (const c of el.children) {
        if (c.localName === 'r') await run(c, href);
        else if (c.localName === 'hyperlink') {
          const rel = rels[c.getAttributeNS(R, 'id')];
          await walk(c, rel && rel.external && /^(https?:|mailto:|tel:)/i.test(rel.target) ? rel.target : href);
        } else if (['ins', 'smartTag', 'fldSimple', 'customXml', 'sdtContent', 'sdt'].includes(c.localName)) await walk(c, href);
      }
    };
    await walk(p, null);
    let html = '';
    let i = 0;
    while (i < segs.length) {
      const key = ['b', 'i', 'u', 's', 'sup', 'sub', 'href'].map((k) => segs[i][k]).join('|');
      let text = '';
      const first = segs[i];
      while (i < segs.length && ['b', 'i', 'u', 's', 'sup', 'sub', 'href'].map((k) => segs[i][k]).join('|') === key) text += segs[i++].html;
      if (!text.replace(/<br>/g, '').trim() && !text.includes('<br>')) { html += text; continue; }
      let t = text;
      if (first.sup) t = `<sup>${t}</sup>`;
      if (first.sub) t = `<sub>${t}</sub>`;
      if (first.s) t = `<s>${t}</s>`;
      if (first.u && !first.href) t = `<u>${t}</u>`;
      if (first.i) t = `<em>${t}</em>`;
      if (first.b) t = `<strong>${t}</strong>`;
      if (first.href) t = `<a href="${escHtml(first.href)}">${t}</a>`;
      html += t;
    }
    return html.replace(/(<br>)+$/, '');
  };

  const out = [];
  let list = null;   // { stack: [{ type }], html }
  const closeList = () => {
    if (!list) return;
    while (list.stack.length) list.html += `</li></${list.stack.pop()}>`;
    out.push(list.html);
    list = null;
  };
  const addItem = (type, level, html) => {
    if (!list) list = { stack: [], html: '' };
    const st = list.stack;
    if (st.length && level < st.length - 1) { while (st.length > level + 1) list.html += `</li></${st.pop()}>`; }
    if (st.length === level + 1 && st[level] !== type) { list.html += `</li></${st.pop()}>`; }
    if (st.length === level + 1) list.html += `</li><li>${html}`;
    else {
      while (st.length < level + 1) { st.push(type); list.html += `<${type}><li>${st.length === level + 1 ? html : ''}`; }
    }
  };

  const paragraph = async (p) => {
    const pPr = kid(p, 'pPr');
    const style = styles[wAttr(kid(pPr, 'pStyle'), 'val')] || {};
    const pics = [];
    const html = await inline(p, pics);
    const numPr = kid(pPr, 'numPr');
    const numId = wAttr(kid(numPr, 'numId'), 'val');
    const has = html.replace(/<[^>]+>/g, '').trim();
    if (numPr && numId && numId !== '0' && !style.level) {
      const level = Math.min(8, +wAttr(kid(numPr, 'ilvl'), 'val') || 0);
      if (has) addItem((numbering[numId] || {})[String(level)] || 'ul', level, html);
    } else {
      closeList();
      if (has) {
        if (style.level) { const h = Math.min(4, style.level + 1); out.push(`<h${h}>${html}</h${h}>`); }
        else if (style.quote) out.push(`<blockquote><p>${html}</p></blockquote>`);
        else out.push(`<p>${html}</p>`);
      }
    }
    for (const pic of pics) if (pic) { closeList(); out.push(pic); }
  };

  const table = async (tbl) => {
    closeList();
    const rows = [];
    for (const tr of kids(tbl, 'tr')) {
      const head = !!kid(kid(tr, 'trPr'), 'tblHeader');
      const cells = [];
      for (const tc of kids(tr, 'tc')) {
        const parts = [];
        for (const p of tc.getElementsByTagNameNS(W, 'p')) { const t = await inline(p, []); if (t.replace(/<[^>]+>/g, '').trim()) parts.push(t); }
        const tag = head ? 'th' : 'td';
        cells.push(`<${tag}>${parts.join('<br>')}</${tag}>`);
      }
      if (cells.length) rows.push((head ? '<thead>' : '') + `<tr>${cells.join('')}</tr>` + (head ? '</thead>' : ''));
    }
    if (rows.length) out.push(`<table>${rows.join('')}</table>`.replace(/<\/thead><thead>/g, ''));
  };

  const blocks = async (el) => {
    for (const c of el.children) {
      if (c.localName === 'p') await paragraph(c);
      else if (c.localName === 'tbl') await table(c);
      else if (c.localName === 'sdt') await blocks(kid(c, 'sdtContent') || c);
      else if (c.localName === 'customXml') await blocks(c);
    }
  };
  await blocks(doc.getElementsByTagNameNS(W, 'body')[0]);
  closeList();
  return { html: out.join('\n'), images, skippedImages };
}

// ---------------------------------------------------------------------------
// HTML → Word
// ---------------------------------------------------------------------------

const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BLOCK = /^(P|H[1-6]|UL|OL|LI|PRE|BLOCKQUOTE|TABLE|THEAD|TBODY|TFOOT|TR|FIGURE|FIGCAPTION|DIV|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|NAV|DETAILS|SUMMARY|HR|DL|DT|DD|IMG|IFRAME|VIDEO|AUDIO)$/;
const EMU_PX = 9525;
const MAX_PX = 600;   // ширина текста страницы A4 с полями ~16,5 см

/** Картинка → { data: PNG/JPEG/GIF, ext, w, h } или null (чужая без CORS, битая). */
async function loadImage(src) {
  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    let { width: w, height: h } = bmp;
    let data;
    let ext;
    if (/^image\/(png|jpeg|gif)$/.test(blob.type)) {
      data = new Uint8Array(await blob.arrayBuffer());
      ext = blob.type === 'image/jpeg' ? 'jpeg' : blob.type.split('/')[1];
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
      const png = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
      if (!png) return null;
      data = new Uint8Array(await png.arrayBuffer());
      ext = 'png';
    }
    if (bmp.close) bmp.close();
    if (w > MAX_PX) { h = Math.round(h * MAX_PX / w); w = MAX_PX; }
    return { data, ext, w, h };
  } catch {
    return null;
  }
}

/**
 * HTML статьи → .docx (Blob). { blob, missedImages }.
 * h2 → «Заголовок 1», h3 → «Заголовок 2», h4–h6 → «Заголовок 3» (видны в навигации Word).
 */
export async function htmlToDocx(html, { title = '' } = {}) {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstElementChild;
  const rels = [];
  const media = [];
  const nums = ['ul'];   // numId (с 1) → 'ul' | 'ol': 1 — все маркированные, у каждого нумерованного списка свой (счёт с 1)
  let missedImages = 0;
  let picId = 0;
  const rel = (type, target, external) => {
    const id = 'rId' + (rels.length + 10);
    rels.push({ id, type, target, external });
    return id;
  };
  const absUrl = (href) => { try { return new URL(href, document.baseURI).href; } catch { return ''; } };

  const rPr = (f) => {
    const p = [];
    if (f.code) p.push('<w:rStyle w:val="CodeChar"/>');
    else if (f.link) p.push('<w:rStyle w:val="Hyperlink"/>');
    if (f.b) p.push('<w:b/>');
    if (f.i) p.push('<w:i/>');
    if (f.s) p.push('<w:strike/>');
    if (f.u && !f.link) p.push('<w:u w:val="single"/>');
    if (f.sup) p.push('<w:vertAlign w:val="superscript"/>');
    if (f.sub) p.push('<w:vertAlign w:val="subscript"/>');
    return p.length ? `<w:rPr>${p.join('')}</w:rPr>` : '';
  };
  const textRun = (text, f) => (text ? `<w:r>${rPr(f)}<w:t xml:space="preserve">${x(text)}</w:t></w:r>` : '');

  const imageRun = async (img) => {
    const src = img.getAttribute('src');
    const pic = src ? await loadImage(absUrl(src)) : null;
    if (!pic) { missedImages++; return src ? textRun(img.getAttribute('alt') || absUrl(src), {}) : ''; }
    const name = `image${media.length + 1}.${pic.ext}`;
    media.push({ name, data: pic.data, ext: pic.ext });
    const rid = rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', 'media/' + name);
    const cx = pic.w * EMU_PX;
    const cy = pic.h * EMU_PX;
    const id = ++picId;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${x(img.getAttribute('alt') || '')}"/>`
      + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
      + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };

  /** Строчное содержимое → прогоны Word. pre — пробелы и переносы как есть. */
  const runs = async (nodes, f = {}, pre = false) => {
    let out = '';
    for (const n of nodes) {
      if (n.nodeType === 3) {
        const t = pre ? n.data : n.data.replace(/\s+/g, ' ');
        out += pre ? t.split('\n').map((line) => textRun(line, f)).join('<w:r><w:br/></w:r>') : textRun(t, f);
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === 'BR') { out += '<w:r><w:br/></w:r>'; continue; }
      if (tag === 'IMG') { out += await imageRun(n); continue; }
      if (/^(BUTTON|SCRIPT|STYLE|TEMPLATE|SVG|INPUT|SELECT|TEXTAREA)$/.test(tag)) continue;
      const g = { ...f };
      if (/^(STRONG|B)$/.test(tag)) g.b = true;
      if (/^(EM|I)$/.test(tag)) g.i = true;
      if (tag === 'U') g.u = true;
      if (/^(S|DEL|STRIKE)$/.test(tag)) g.s = true;
      if (/^(CODE|KBD|SAMP)$/.test(tag)) g.code = true;
      if (tag === 'SUP') g.sup = true;
      if (tag === 'SUB') g.sub = true;
      const href = tag === 'A' ? n.getAttribute('href') || '' : '';
      if (href && !href.startsWith('#') && /^(https?:|mailto:|tel:)/i.test(absUrl(href))) {
        g.link = true;
        const rid = rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', absUrl(href), true);
        out += `<w:hyperlink r:id="${rid}">${await runs(n.childNodes, g, pre)}</w:hyperlink>`;
      } else out += await runs(n.childNodes, g, pre);
    }
    return out;
  };

  const para = (content, { style = '', num = null, extra = '' } = {}) => {
    const pPr = (style ? `<w:pStyle w:val="${style}"/>` : '') + (num ? `<w:numPr><w:ilvl w:val="${num.level}"/><w:numId w:val="${num.id}"/></w:numPr>` : '') + extra;
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`;
  };
  const hasText = (s) => /<w:t[ >]|<w:drawing>/.test(s);

  const HEAD = { H1: 'Heading1', H2: 'Heading1', H3: 'Heading2', H4: 'Heading3', H5: 'Heading3', H6: 'Heading3' };

  /** Блоки контейнера; подряд идущие строчные узлы — один абзац. */
  const blocks = async (el, ctx = {}) => {
    let out = '';
    let pending = [];
    const flush = async () => {
      if (!pending.length) return;
      // переносы строк между блоками в HTML — не абзац
      if (pending.every((n) => n.nodeType === 3 && !n.data.trim())) { pending = []; return; }
      const r = await runs(pending, ctx.f || {});
      pending = [];
      if (hasText(r)) out += para(r, { style: ctx.style || '' });
    };
    for (const n of el.childNodes) {
      if (n.nodeType === 3 || (n.nodeType === 1 && !BLOCK.test(n.tagName))) { pending.push(n); continue; }
      if (n.nodeType !== 1) continue;
      await flush();
      const piece = await block(n, ctx);
      if (out.endsWith('</w:tbl>') && piece.startsWith('<w:tbl>')) out += para('');   // Word склеивает соседние таблицы
      out += piece;
    }
    await flush();
    return out;
  };

  const list = async (el, level, ordered) => {
    let id;
    if (ordered) { nums.push('ol'); id = nums.length; } else id = 1;
    let out = '';
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const inlineNodes = [];
      const nested = [];
      for (const c of li.childNodes) {
        if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) nested.push(c);
        else if (c.nodeType === 1 && /^(P|DIV)$/.test(c.tagName)) { if (inlineNodes.length) inlineNodes.push(document.createElement('br')); inlineNodes.push(...c.childNodes); }
        else inlineNodes.push(c);
      }
      const r = await runs(inlineNodes);
      out += para(hasText(r) ? r : '', { style: 'ListParagraph', num: { level: Math.min(8, level), id } });
      for (const sub of nested) out += await list(sub, level + 1, sub.tagName === 'OL');
    }
    return out;
  };

  const table = async (el) => {
    const rows = [...el.querySelectorAll('tr')].filter((tr) => tr.closest('table') === el);
    if (!rows.length) return '';
    const cols = Math.max(...rows.map((tr) => [...tr.children].length));
    let out = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="0420" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>'
      + Array.from({ length: cols }, () => `<w:gridCol w:w="${Math.floor(9000 / cols)}"/>`).join('') + '</w:tblGrid>';
    for (const tr of rows) {
      const head = tr.parentNode.tagName === 'THEAD' || [...tr.children].every((c) => c.tagName === 'TH');
      out += `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}`;
      for (const cell of tr.children) {
        const r = await runs(cell.childNodes);   // шапка жирная стилем таблицы (firstRow), а не прямым оформлением
        out += `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(r)}</w:tc>`;
      }
      out += '</w:tr>';
    }
    return out + '</w:tbl>';
  };

  const block = async (n, ctx) => {
    const tag = n.tagName;
    if (HEAD[tag]) { const r = await runs(n.childNodes); return hasText(r) ? para(r, { style: HEAD[tag] }) : ''; }
    if (tag === 'P') { const r = await runs(n.childNodes, ctx.f || {}); return hasText(r) ? para(r, { style: ctx.style || '' }) : ''; }
    if (tag === 'UL' || tag === 'OL') return list(n, 0, tag === 'OL');
    if (tag === 'PRE') return n.textContent.replace(/\n$/, '').split('\n').map((line) => para(textRun(line, {}), { style: 'Code' })).join('');
    if (tag === 'BLOCKQUOTE') return blocks(n, { ...ctx, style: 'Quote' });
    if (tag === 'HR') return para('', { extra: '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>' });
    if (tag === 'TABLE') return table(n);
    if (tag === 'IMG') return para(await imageRun(n));
    if (tag === 'FIGCAPTION') { const r = await runs(n.childNodes); return hasText(r) ? para(r, { style: 'Caption' }) : ''; }
    if (tag === 'SUMMARY') { const r = await runs(n.childNodes, { b: true }); return hasText(r) ? para(r) : ''; }
    if (/^(IFRAME|VIDEO|AUDIO)$/.test(tag)) {
      const src = n.getAttribute('src') || (n.querySelector('source') || { getAttribute: () => '' }).getAttribute('src');
      if (!src || !/^https?:/i.test(absUrl(src))) return '';
      const rid = rel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', absUrl(src), true);
      return para(`<w:hyperlink r:id="${rid}">${textRun(n.getAttribute('title') || absUrl(src), { link: true })}</w:hyperlink>`);
    }
    if (tag === 'FIGURE') {
      const imgs = [...n.querySelectorAll('img')].filter((i) => !i.closest('a[download]'));
      if (imgs.length && !n.querySelector('table')) {
        let out = '';
        for (const img of imgs) out += para(await imageRun(img));
        const cap = n.querySelector('figcaption');
        if (cap) out += await block(cap, ctx);
        return out;
      }
    }
    return blocks(n, ctx);
  };

  let body = await blocks(root);
  if (!body || body.endsWith('</w:tbl>')) body += para('');   // документ не кончается таблицей
  const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W_NS}><w:body>${body || para('')}`
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';

  const lvls = (bullet) => Array.from({ length: 9 }, (_, l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${bullet ? 'bullet' : 'decimal'}"/>`
    + `<w:lvlText w:val="${bullet ? ['•', '◦', '▪'][l % 3] : `%${l + 1}.`}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join('');
  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="${W}">`
    + `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvls(true)}</w:abstractNum>`
    + `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvls(false)}</w:abstractNum>`
    + nums.map((t, i) => `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${t === 'ol' ? 1 : 0}"/>${t === 'ol' ? '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride>' : ''}</w:num>`).join('')
    + '</w:numbering>';
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="${W}">`
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + [1, 2, 3].map((l) => `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>`
      + `<w:pPr><w:keepNext/><w:spacing w:before="${[360, 280, 240][l - 1]}" w:after="120"/><w:outlineLvl w:val="${l - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[36, 30, 26][l - 1]}"/></w:rPr></w:style>`).join('')
    + '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="A6A6A6"/></w:pBdr><w:ind w:left="284"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:contextualSpacing/></w:pPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:i/><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr></w:style>'
    + '<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:rPr></w:style>'
    + '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
    + '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`).join('')
    + '</w:tblBorders><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr><w:pPr><w:spacing w:after="0"/></w:pPr><w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr></w:tblStylePr></w:style>'
    + '</w:styles>';
  const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
    + rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${x(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')
    + '</Relationships>';
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const coreXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    + `<dc:title>${x(title)}</dc:title><dc:creator>texted</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
    + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + '</Types>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    + '</Relationships>';
  const blob = zip([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: coreXml },
    { name: 'word/document.xml', data: documentXml },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'word/numbering.xml', data: numberingXml },
    // режим совместимости — Word 2013 и новее, иначе Word пишет в заголовке «режим совместимости»
    { name: 'word/settings.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="${W}"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>` },
    { name: 'word/_rels/document.xml.rels', data: relsXml },
    ...media.map((m) => ({ name: 'word/media/' + m.name, data: m.data })),
  ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  return { blob, missedImages };
}
