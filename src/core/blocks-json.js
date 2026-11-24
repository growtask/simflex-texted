// Описание документа списком блоков (JSON) → HTML редактора. Для агентов и скриптов: не нужно знать классы ted-*.
// Текст везде простой (экранируется), строчное форматирование — через поле html у абзаца не поддерживается намеренно.
// Результат всё равно проходит Ted.clean / Sanitizer::clean, поэтому ошибка в описании не создаёт небезопасную разметку.

import { markdownToHtml } from './markdown.js';
import { blockDef, defOf, registeredBlocks } from './registry.js';

export const bjEsc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const bjBg = (b) => (['gray', 'color1', 'color2'].includes(b.bg) ? `ted-bg-${b.bg}` : '');
export const bjCls = (...names) => { const list = names.filter(Boolean); return list.length ? ` class="${list.join(' ')}"` : ''; };
export const bjLines = (t) => bjEsc(t).replace(/\r?\n/g, '<br>');
export const bjUrl = (u) => bjEsc(u);
export const bjAlign = (b) => (b.align && ['center', 'right'].includes(b.align) ? `ted-align-${b.align}` : '');

const BJ_RENDER = {
  // любой блок как есть: { "type": "html", "html": "<figure class=\"ted-table\">…" } — дальше обычная очистка (выгрузка в JSON, 22.11)
  html: (b) => String(b.html || ''),
  // кусок Markdown: { "type": "markdown", "text": "## Раздел … - пункт" } — удобно нейросетям (22.11)
  markdown: (b) => markdownToHtml(String(b.text || '')),
};


/** Список блоков → HTML. Неизвестный тип пропускается и попадает в `skipped`, если передан массив. */
export function blocksToHtml(list, skipped = []) {
  const out = [];
  for (const b of Array.isArray(list) ? list : []) {
    const def = b ? blockDef(b.type) : null;   // блок из реестра (этап 5): fromJson в blocks/<тип>/<тип>.js
    const fn = def && def.fromJson ? def.fromJson : (b && Object.hasOwn(BJ_RENDER, b.type) ? BJ_RENDER[b.type] : null);
    if (fn) out.push(fn(b)); else skipped.push(b?.type ?? null);
  }
  return out.join('');
}

/** Виды блоков JSON: ядро + блоки реестра с fromJson. */
export function blockJsonTypes() { return [...Object.keys(BJ_RENDER), ...registeredBlocks().filter((d) => d.fromJson).map((d) => d.jsonType || d.type)]; }

/**
 * Сохранённый HTML → список блоков JSON (выгрузка, 22.11). Простой текст (абзац, заголовок без оформления) — { type, text },
 * линия — { type: "hr" }, остальное — { type: "html", html } без потерь: Ted.fromBlocks собирает его обратно.
 */
export function htmlToBlocks(html, doc = document) {
  const box = doc.createElement('div');
  box.innerHTML = String(html || '');
  const root = box.querySelector(':scope > .ted-content') || box;
  const plain = (el) => !el.attributes.length && [...el.childNodes].every((n) => n.nodeType === 3 || n.nodeName === 'BR');
  const text = (el) => [...el.childNodes].map((n) => (n.nodeName === 'BR' ? '\n' : n.textContent)).join('');
  return [...root.children].map((el) => {
    const t = el.tagName.toLowerCase();
    const d = defOf(el);   // блок без текста и без настроек (линия) — просто вид
    if (d && d.object && d.fromJson && !el.attributes.length && !el.childNodes.length) return { type: d.jsonType || d.type };
    if (/^(p|h[2-6])$/.test(t) && plain(el)) return { type: t, text: text(el) };
    return { type: 'html', html: el.outerHTML };
  });
}
