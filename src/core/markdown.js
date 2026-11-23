// Markdown ⇄ блоки texted (решение заказчика 22.11: загрузка и выгрузка .md, вставка Markdown-текста, меню «Нейросети»).
// markdownToHtml — Markdown → HTML блоков; результат всегда проходит обычную очистку (sanitizeHTML / Ted.clean),
// поэтому здесь нет своих белых списков. htmlToMarkdown — сохранённый (чистый) HTML → Markdown.
// Поддерживается: заголовки, абзацы, жирный, курсив, зачёркнутый, код в строке, ссылки, картинки, списки (вложенные),
// чек-листы «- [ ]», цитаты, выноски «> [!NOTE]», блоки кода ```язык, линия ---, таблицы | a | b |.

import { defOf, registeredBlocks, markdownBlock } from './registry.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Markdown → HTML
// ---------------------------------------------------------------------------

/** Строчная разметка: код, картинки, ссылки, жирный, курсив, зачёркнутый. Текст экранируется до разбора. */
export function mdInline(text) {
  const codes = [];
  const escs = [];
  // экранированные символы «\*», «\<» — как есть, без разметки
  let s = String(text).replace(/\\([\\`*_[\]<>|#!.+-])/g, (m, c) => { escs.push(c); return `\u0001${escs.length - 1}\u0001`; });
  s = s.replace(/`([^`\n]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\s*\)/g, (m, alt, url) => `<img src="${url}" alt="${alt}">`);
  s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\s*\)/g, (m, t, url) => `<a href="${url}">${t}</a>`);
  s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (m, url) => `<a href="${url}">${url}</a>`);
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
  s = s.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
  s = s.replace(/ {2,}\n|\\\n/g, '<br>').replace(/\n/g, ' ');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${esc(codes[+i])}</code>`).replace(/\u0001(\d+)\u0001/g, (m, i) => esc(escs[+i]));
}

const RE = {
  fence: /^\s{0,3}(```|~~~)\s*([\w+#.-]*)\s*$/,
  heading: /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/,
  rule: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,   // «---» — блок с block.json → markdown: '---'
  quote: /^\s{0,3}>\s?(.*)$/,
  item: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
  table: /^\s*\|.*\|\s*$/,
  tableSep: /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/,
};

/** Список (вложенность — по отступу): строки начиная с first → [html, следующая строка]. */
function mdList(lines, first) {
  const base = lines[first].match(RE.item)[1].length;
  const ordered = /\d/.test(lines[first].match(RE.item)[2]);
  const items = [];
  let i = first;
  while (i < lines.length) {
    const m = lines[i].match(RE.item);
    if (!m || m[1].length < base) {
      if (m || !lines[i].trim() || !/^\s/.test(lines[i]) || !items.length) break;
      items[items.length - 1].text += '\n' + lines[i].trim();   // продолжение пункта
      i++;
      continue;
    }
    if (m[1].length > base) {   // вложенный список — в последний пункт
      const [html, next] = mdList(lines, i);
      if (items.length) items[items.length - 1].nested += html;
      i = next;
      continue;
    }
    if (/\d/.test(m[2]) !== ordered) break;
    const task = m[3].match(/^\[([ xX])\]\s+(.*)$/);
    items.push({ text: task ? task[2] : m[3], checked: task ? task[1] !== ' ' : null, nested: '' });
    i++;
  }
  const checklist = !ordered && items.length && items.every((it) => it.checked !== null);
  const tag = ordered ? 'ol' : 'ul';
  const lis = items.map((it) => `<li${checklist && it.checked ? ' class="ted-checked"' : ''}>${mdInline(it.text)}${it.nested}</li>`).join('');
  return [`<${tag}${checklist ? ' class="ted-checklist"' : ''}>${lis}</${tag}>`, i];
}

/** Таблица GFM: первая строка — шапка, вторая — разделитель. */
function mdTable(lines, first) {
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(lines[first]);
  let i = first + 2;
  const rows = [];
  while (i < lines.length && RE.table.test(lines[i])) rows.push(cells(lines[i++]));
  const th = head.map((c) => `<th>${mdInline(c)}</th>`).join('');
  const body = rows.map((r) => `<tr>${head.map((_, k) => `<td>${mdInline(r[k] || '')}</td>`).join('')}</tr>`).join('');
  return [`<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`, i];   // очистка делает из неё блок таблицы
}

const CALLOUT = /^\[!(NOTE|TIP|INFO|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i;
const CALLOUT_TITLE = { note: 'Заметка', tip: 'Совет', info: 'Информация', important: 'Важно', warning: 'Внимание', caution: 'Осторожно' };

/** Markdown-документ → HTML блоков texted (дальше — обычная очистка). Заголовки: # → h2, ## → h3 … (как сокращения «# »). */
export function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = [];
  let para = [];
  const flush = () => { if (para.length) out.push(`<p>${mdInline(para.join('\n'))}</p>`); para = []; };
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    let m;
    if (!line.trim()) { flush(); i++; continue; }
    if ((m = line.match(RE.fence))) {
      flush();
      const code = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s{0,3}${m[1]}\\s*$`).test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre${m[2] ? ` data-lang="${esc(m[2].toLowerCase())}"` : ''}><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    if ((m = line.match(RE.heading))) {
      flush();
      const level = Math.min(6, m[1].length + 1);
      out.push(`<h${level}>${mdInline(m[2])}</h${level}>`);
      i++;
      continue;
    }
    if (RE.rule.test(line) && !(para.length && /^\s*-+\s*$/.test(line))) { flush(); const d = markdownBlock('---'); if (d && d.fromJson) out.push(d.fromJson({})); i++; continue; }
    if (RE.quote.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && RE.quote.test(lines[i])) body.push(lines[i++].match(RE.quote)[1]);
      const c = body[0].match(CALLOUT);
      if (c) {
        const title = c[2] || CALLOUT_TITLE[c[1].toLowerCase()];
        // блок, который принимает «> [!NOTE]» (block → fromMarkdownAlert); нет такого — обычная цитата
        const alert = registeredBlocks().find((d) => d.fromMarkdownAlert);
        out.push(alert ? alert.fromMarkdownAlert(mdInline(title), markdownToHtml(body.slice(1).join('\n'))) : `<blockquote><p><strong>${mdInline(title)}</strong></p>${markdownToHtml(body.slice(1).join('\n'))}</blockquote>`);
      } else out.push(`<blockquote>${markdownToHtml(body.join('\n'))}</blockquote>`);
      continue;
    }
    if (RE.item.test(line)) { flush(); const [html, next] = mdList(lines, i); out.push(html); i = next; continue; }
    if (RE.table.test(line) && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) { flush(); const [html, next] = mdTable(lines, i); out.push(html); i = next; continue; }
    para.push(line.replace(/^\s+/, ''));
    i++;
  }
  flush();
  return out.join('\n');
}

/** Похоже ли вставленное (обычный текст) на Markdown-документ: несколько строк и узнаваемая разметка. */
export function looksLikeMarkdown(text) {
  const s = String(text || '');
  if (!/\n/.test(s.trim())) return false;
  let score = 0;
  if (/^\s{0,3}#{1,6}\s+\S/m.test(s)) score += 2;
  if (/^\s{0,3}(```|~~~)/m.test(s)) score += 2;
  if (/^\s*([-*+]|\d+[.)])\s+\S/m.test(s)) score += 1;
  if (/^\s*\|.*\|\s*$/m.test(s) && /^\s*\|?\s*:?-{2,}/m.test(s)) score += 2;
  if (/\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\)/.test(s)) score += 1;
  if (/^\s{0,3}>\s/m.test(s)) score += 1;
  return score >= 2;
}

// ---------------------------------------------------------------------------
// HTML (сохранённый, чистый) → Markdown
// ---------------------------------------------------------------------------

// < и > тоже: чужой просмотрщик Markdown не примет текст за HTML
const mdEsc = (s) => s.replace(/([\\`*_[\]<>])/g, '\\$1');

/** Строчные элементы → Markdown. */
function inlineMd(node) {
  let s = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { s += mdEsc(c.data.replace(/\s+/g, ' ')); continue; }
    if (c.nodeType !== 1) continue;
    const t = c.tagName;
    const inner = () => inlineMd(c);
    if (t === 'BR') s += '  \n';
    else if (t === 'STRONG' || t === 'B') s += `**${inner()}**`;
    else if (t === 'EM' || t === 'I') s += `*${inner()}*`;
    else if (t === 'S' || t === 'DEL') s += `~~${inner()}~~`;
    else if (t === 'CODE') s += `\`${c.textContent}\``;
    else if (t === 'A') s += `[${inner()}](${c.getAttribute('href') || ''})`;
    else if (t === 'IMG') s += `![${c.getAttribute('alt') || ''}](${c.getAttribute('src') || ''})`;
    else s += inner();
  }
  return s;
}

function listMd(list, depth) {
  const ordered = list.tagName === 'OL';
  const check = list.classList.contains('ted-checklist');
  const pad = '  '.repeat(depth);
  return [...list.children].map((li, k) => {
    const nested = [...li.children].filter((x) => x.tagName === 'UL' || x.tagName === 'OL');
    const clone = li.cloneNode(true);
    for (const n of clone.querySelectorAll(':scope > ul, :scope > ol')) n.remove();
    const mark = ordered ? `${k + 1}.` : '-';
    const box = check ? (li.classList.contains('ted-checked') ? '[x] ' : '[ ] ') : '';
    return `${pad}${mark} ${box}${inlineMd(clone).trim()}` + nested.map((n) => '\n' + listMd(n, depth + 1)).join('');
  }).join('\n');
}

function tableMd(table) {
  const rows = [...table.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => inlineMd(c).replace(/\|/g, '\\|').trim()));
  if (!rows.length) return '';
  const n = Math.max(...rows.map((r) => r.length));
  const line = (r) => `| ${Array.from({ length: n }, (_, k) => r[k] || '').join(' | ')} |`;
  return [line(rows[0]), `|${' --- |'.repeat(n)}`, ...rows.slice(1).map(line)].join('\n');
}

/** Один блок → Markdown: блок со своим видом (block → toMarkdown) — сам; текстовые — здесь; остальное — ссылкой или текстом. */
function blockMd(el) {
  const def = defOf(el);
  if (def && def.toMarkdown) return def.toMarkdown(el, MD_API);
  const t = el.tagName;
  const cls = el.classList;
  if (/^H[2-6]$/.test(t)) return `${'#'.repeat(+t[1] - 1)} ${inlineMd(el).trim()}`;
  if (t === 'P') return inlineMd(el).trim();
  if (t === 'PRE') return '```' + (el.getAttribute('data-lang') || '') + '\n' + el.textContent.replace(/\n$/, '') + '\n```';
  if (t === 'BLOCKQUOTE') return [...el.children].map((p) => (p.classList.contains('ted-author') ? '> — ' : '> ') + inlineMd(p).replace(/ {2}\n/g, ', ').trim()).join('\n>\n');
  if (t === 'OL' && cls.contains('ted-steps')) return [...el.children].map((li, k) => `${k + 1}. ${inlineMd(li).replace(/ {2}\n/, ' — ').trim()}`).join('\n');
  if (t === 'UL' && cls.contains('ted-facts')) return [...el.children].map((li) => `- ${inlineMd(li).replace(/ {2}\n/, ' — ').trim()}`).join('\n');
  if (t === 'UL' && cls.contains('ted-proscons')) return [...el.children].map((card) => { const title = card.querySelector(':scope > strong'); const ul = card.querySelector(':scope > ul'); return `**${title ? title.textContent.trim() : ''}**\n\n${ul ? listMd(ul, 0) : ''}`; }).join('\n\n');
  if (t === 'UL' || t === 'OL') return listMd(el, 0);
  const link = el.querySelector('a[href]');
  if (link) return `[${el.textContent.replace(/\s+/g, ' ').trim()}](${link.getAttribute('href')})`;
  return el.textContent.replace(/\s+/g, ' ').trim();
}

const MD_API = { inline: (el) => inlineMd(el), blocks: (el) => blocksMd(el), list: (el) => listMd(el, 0), table: (el) => tableMd(el) };

function blocksMd(root) {
  return [...root.children].map(blockMd).filter(Boolean).join('\n\n');
}

/** Сохранённый HTML texted → Markdown-документ. */
export function htmlToMarkdown(html, doc = document) {
  const box = doc.createElement('div');
  box.innerHTML = String(html || '');
  const root = box.querySelector(':scope > .ted-content') || box;
  return blocksMd(root).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
