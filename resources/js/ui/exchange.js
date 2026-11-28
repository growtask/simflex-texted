// Перенос статей и нейросети (решения заказчика 22.11): выгрузка и загрузка JSON, Markdown и Word (.docx, 1.0.5), промт для нейросети.
// Меню «Ещё ⋯» → «Скопировать промт», «Загрузить .md или .json», «Выгрузить в Markdown», «Выгрузить в JSON». Загрузка заменяет статью — после предупреждения;
// «Отменить» в уведомлении возвращает прежнюю. Всё загруженное проходит обычную очистку и набор блоков поля.

import { h, menuItem } from './widgets.js';
import { tf } from '../core/i18n.js';
import { copyText } from '../core/clipboard.js';
import { sanitizeHTML } from '../core/sanitize.js';
import { normalizeRoot } from '../core/blocks.js';
import { blocksToHtml, htmlToBlocks } from '../core/blocks-json.js';
import { registeredBlocks } from '../core/registry.js';
import { detectTedCss } from './preview.js';
import { markdownToHtml, htmlToMarkdown } from '../core/markdown.js';
import { docxToHtml, htmlToDocx, WORD_IMAGE } from '../core/docx.js';

/** Сохранить текст (или Blob) файлом — скачивание в браузере. */
function download(name, text, type) {
  const url = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Выбрать файл и прочитать его как текст. */
function pickText(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      resolve(file ? { name: file.name, text: await file.text() } : null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

const fileName = (ed, ext) => `${(ed.options.fileName || 'statya').replace(/[^\w.-]+/g, '-')}.${ext}`;

/** Статья в JSON: { format, version, blocks } — блоки как у Ted.fromBlocks. */
export function exportJson(ed) {
  const data = { format: 'texted-blocks', version: 1, blocks: htmlToBlocks(ed.getInnerHTML()) };
  download(fileName(ed, 'json'), JSON.stringify(data, null, 2), 'application/json');
}

/** Статья в Markdown. */
export function exportMarkdown(ed) {
  download(fileName(ed, 'md'), htmlToMarkdown(ed.getInnerHTML()), 'text/markdown');
}

/** JSON (массив блоков или { blocks }) или Markdown → HTML; ошибка — понятное сообщение. */
export function toHtml(kind, text) {
  if (kind === 'md') return { html: markdownToHtml(text) };
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'Файл не похож на JSON' }; }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.blocks) ? data.blocks : null;
  if (!list) return { error: 'В JSON нет списка блоков (blocks)' };
  const skipped = [];
  const html = blocksToHtml(list, skipped);
  return { html, skipped: skipped.filter((t) => t !== null) };
}

/** Заменить статью загруженным: история сохраняется — «Отменить» вернёт прежнюю. */
export function replaceDoc(ed, html, skipped = [], prepare = null) {
  ed.history.commit();
  ed.editable.replaceChildren(ed.restrict(sanitizeHTML(html)));
  if (prepare) prepare();   // до записи в историю: «Отменить» сразу возвращает прежнюю статью
  if (!ed.editable.firstElementChild) ed.editable.appendChild(h('p', {}, [h('br')]));
  normalizeRoot(ed.editable);
  ed.afterChange({ immediate: true });
  const text = skipped.length ? tf('Статья заменена (пропущены неизвестные блоки: {types})', { types: [...new Set(skipped)].join(', ') }) : 'Статья заменена';
  ed.toast(text, { undo: true, timeout: skipped.length ? 8000 : undefined });
}

/** Предупреждение перед заменой: окно у кнопки «Ещё» (как «Ссылка»), «Заменить» / «Отмена». */
function confirmReplace(ed, anchor, onYes) {
  if (!ed.getInnerHTML()) { onYes(); return; }   // пустая статья — заменять нечего
  const yes = h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Заменить', onclick: () => { ed.popover.close(); onYes(); } });
  const no = h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отмена', onclick: () => ed.popover.close() });
  ed.popover.open([
    h('div', { class: 'ted-ui-form__head' }, [h('p', { class: 'ted-ui-form__title', text: 'Заменить статью?' })]),
    h('p', { class: 'ted-ui-field__hint', text: 'Всё, что сейчас в редакторе, заменится загруженным. Вернуть можно кнопкой «Отменить» в уведомлении или Ctrl+Z.' }),
    h('div', { class: 'ted-ui-pop__line' }),
    h('div', { class: 'ted-ui-form__footer' }, [yes, no]),
  ], anchor, { cls: 'ted-ui-pop--link', align: 'end', focus: '.ted-ui-action--primary' });
}

/** «Загрузить»: файл .json или .md (формат — по расширению, иначе по содержимому) и, после предупреждения, замена статьи. */
export async function importFile(ed, anchor) {
  const file = await pickText('.json,.md,.markdown,.txt,application/json,text/markdown,text/plain');
  if (!file) return;
  const kind = /\.json$/i.test(file.name) || /^\s*[[{]/.test(file.text) ? 'json' : 'md';
  const { html, error, skipped } = toHtml(kind, file.text);
  if (error) { ed.toast(error, { status: 'error' }); return; }
  confirmReplace(ed, anchor, () => replaceDoc(ed, html, skipped));
}

/** Выбрать файл и прочитать его целиком (ArrayBuffer). */
function pickBinary(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      resolve(file ? { name: file.name, size: file.size, buffer: await file.arrayBuffer() } : null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** «Выгрузить в Word»: .docx; картинки встраиваются, не скачанные (чужой сайт без разрешения) — ссылкой. */
export async function exportWord(ed) {
  const { blob, missedImages } = await htmlToDocx(ed.getInnerHTML(), { title: ed.options.fileName || document.title || '' });
  download(fileName(ed, 'docx'), blob);
  if (missedImages) ed.toast(tf('Выгружено в Word. Картинок не удалось встроить: {n} — вместо них ссылки', { n: missedImages }), { timeout: 8000 });
}

/** Word (.docx) → HTML статьи; ошибка — понятное сообщение. */
export async function wordToHtml(name, buffer) {
  if (/\.doc$/i.test(name)) return { error: 'Старый формат .doc не поддерживается — сохраните файл в Word как .docx' };
  try {
    return await docxToHtml(buffer);
  } catch {
    return { error: 'Файл не похож на документ Word (.docx)' };
  }
}

/**
 * Заменить статью документом Word. Картинки: на месте метки [[texted-word-image-N]] — блок «Изображение» с загрузкой
 * файла на сервер, как при вставке файла (хук pasteFiles блоков). Загрузки нет (upload) или блок не встал (набор без
 * изображений) — метка убирается. → сколько картинок не встало.
 */
export function replaceWithWord(ed, { html, images = [], skippedImages = 0 }) {
  const canUpload = typeof ed.options.upload === 'function';
  const slots = [];
  let missed = skippedImages;
  replaceDoc(ed, html, [], () => {
    for (const p of [...ed.editable.querySelectorAll('p')]) {
      const text = p.textContent.trim();
      if (!text.startsWith(WORD_IMAGE)) continue;
      const file = images[parseInt(text.slice(WORD_IMAGE.length), 10) - 1];
      if (canUpload && file) { p.replaceChildren(h('br')); slots.push([p, file]); } else { p.remove(); missed++; }
    }
  });
  for (const [p, file] of slots) {
    const event = { clipboardData: { files: [file] } };
    if (!p.isConnected || !ed.blockUis.some((u) => u.pasteFiles && u.pasteFiles(event, p))) { if (p.isConnected) p.remove(); missed++; }
  }
  if (missed) ed.toast(tf('Статья заменена. Картинок не загружено: {n}', { n: missed }), { undo: true, timeout: 8000 });
  return missed;
}

/** «Загрузить из Word»: .docx и, после предупреждения, замена статьи. */
export async function importWord(ed, anchor) {
  const file = await pickBinary('.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  if (!file) return;
  const doc = await wordToHtml(file.name, file.buffer);
  if (doc.error) { ed.toast(doc.error, { status: 'error' }); return; }
  confirmReplace(ed, anchor, () => replaceWithWord(ed, doc));
}

/** Промт для нейросети: как вернуть статью, чтобы редактор её принял (Markdown или JSON блоков). Собирается из реестра блоков. */
export function aiPrompt() {
  const json = [...new Set(registeredBlocks().map((d) => d.jsonExample).filter(Boolean)),
    '{ "type": "markdown", "text": "Кусок статьи в Markdown — для всего остального" }'];
  return `Подготовь статью для редактора texted. Верни ТОЛЬКО результат, без пояснений, в одном из двух форматов.

Вариант 1 — Markdown:
- заголовки разделов: ## (подразделы — ###), заголовок «#» превратится в раздел;
- абзацы через пустую строку; **жирный**, *курсив*, \`код\`, [ссылка](https://…);
- списки «- пункт» и «1. пункт», задачи «- [ ] пункт» / «- [x] пункт»;
- цитата «> текст»; выноска «> [!NOTE] Заголовок» и следующие строки «> текст»;
- таблица | столбец | столбец | со строкой | --- | --- |;
- код в \`\`\`язык … \`\`\`; картинка ![описание](https://…); линия ---.

Вариант 2 — JSON: { "format": "texted-blocks", "version": 1, "blocks": [ … ] }, где блоки:
${json.map((j) => '  ' + j).join('\n')}

Правила: пиши по-русски, без HTML-тегов, без эмодзи в заголовках; не придумывай факты, которых нет в исходном тексте;
картинки — только по ссылкам из исходного текста. Ответ сохрани файлом .md или .json и загрузи в редактор: «Ещё» → «Загрузить .md или .json».

Исходный текст:
`;
}

/** Скопировать промт в буфер обмена. */
export function copyPrompt(ed) {
  const text = aiPrompt();
  const done = () => ed.toast('Промт скопирован — вставьте его в нейросеть вместе с текстом статьи');
  // и без https: запасной способ сразу при нажатии (core/clipboard.js, 1.0.4) — раньше на http была только ошибка
  copyText(text).then((ok) => (ok ? done() : ed.toast('Не удалось скопировать промт', { status: 'error' })));
}

/** Смена языка интерфейса: название языка, на который переключит, — на нём самом (English / Русский). */
function langItem(ed) {
  const next = ed.lang === 'en' ? 'ru' : 'en';
  const item = menuItem({ value: 'lang', label: next === 'en' ? 'English' : 'Русский', iconName: 'type', onSelect: () => { ed.popover.close(); ed.setLang(next); } });
  const label = item.querySelector('.ted-ui-item__label');
  if (label) { label.textContent = next === 'en' ? 'English' : 'Русский'; delete label.__ru; }
  item.setAttribute('lang', next);
  return item;
}

/** Пункты «Ещё ⋯» (решения заказчика 22.11): промт для нейросети, загрузка (.md или .json — по файлу), выгрузка — отдельными пунктами, без подменю. */
export function exchangeItems(ed, anchor) {
  const close = () => ed.popover.close();
  return [
    menuItem({ value: 'ai-prompt', label: 'Скопировать промт', iconName: 'copy', onSelect: () => { close(); copyPrompt(ed); } }),
    menuItem({ value: 'import', label: 'Загрузить .md или .json', iconName: 'file', onSelect: () => { close(); importFile(ed, anchor); } }),
    menuItem({ value: 'import-word', label: 'Загрузить из Word', iconName: 'file', onSelect: () => { close(); importWord(ed, anchor); } }),
    menuItem({ value: 'out-md', label: 'Выгрузить в Markdown', iconName: 'save', onSelect: () => { close(); exportMarkdown(ed); } }),
    menuItem({ value: 'out-json', label: 'Выгрузить в JSON', iconName: 'save', onSelect: () => { close(); exportJson(ed); } }),
    menuItem({ value: 'out-word', label: 'Выгрузить в Word', iconName: 'save', onSelect: () => { close(); exportWord(ed); } }),
    // «Microsoft Print to PDF» пишет файл со сдвигом ссылок — Яндекс Браузер его не открывает (22.11); подсказываем пункт браузера
    menuItem({ value: 'print', label: 'Печать и PDF', iconName: 'file', onSelect: () => { close(); ed.toast('Для PDF выберите в окне печати «Сохранить как PDF»', { timeout: 6000 }); printDoc(ed); } }),
    langItem(ed),
  ];
}

/**
 * Печать и PDF (решение заказчика 22.11): статья — в скрытой странице со стилями сайта и правилами для бумаги
 * (A4, поля; заголовок не отрывается от текста; картинки, таблицы, код, выноски не рвутся между страницами;
 * аккордеон раскрыт, вкладки — разделами подряд, как без скрипта). Дальше — окно печати браузера («Сохранить как PDF»).
 */
export function printDoc(ed) {
  // прежний кадр печати (если afterprint не пришёл) — убираем
  for (const old of document.querySelectorAll('iframe[data-ted-print]')) old.remove();
  const css = [...detectTedCss(), ...[].concat(ed.options.contentCss || [])];
  const frame = h('iframe', { title: 'Печать', 'data-ted-print': '', 'aria-hidden': 'true', style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  doc.open();
  doc.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><base href="${esc(document.baseURI)}"><title>${esc(ed.options.fileName || document.title || 'Статья')}</title>
${css.map((u) => `<link rel="stylesheet" href="${esc(u)}">`).join('\n')}
<style>
  @page { size: A4; margin: 18mm 16mm; }
  html, body { margin: 0; background: #fff; }
  .ted-content { --ted-u: 1px; }
  .ted-content :is(h2, h3, h4, h5, h6) { break-after: avoid; page-break-after: avoid; }
  /* общие правила для любых блоков; своё (полоса прогресса содержания…) — в @media print стилей блока */
  .ted-content > :not(p, ul, ol), .ted-content li, .ted-content img { break-inside: avoid; page-break-inside: avoid; }
  .ted-content p { orphans: 3; widows: 3; }
  .ted-content details > :not(summary) { display: block !important; height: auto !important; }
  .ted-content details::details-content { block-size: auto !important; content-visibility: visible !important; }
  .ted-content :is(iframe, video, audio, button) { display: none !important; }
  .ted-content a { color: inherit; }
</style></head><body><div class="ted-content">${ed.getInnerHTML()}</div></body></html>`);
  doc.close();
  for (const d of doc.querySelectorAll('details')) d.open = true;
  const done = () => setTimeout(() => frame.remove(), 500);
  const go = () => {
    if (!frame.isConnected || !frame.contentWindow) return;   // кадр уже убран (новая печать)
    frame.contentWindow.addEventListener('afterprint', done, { once: true });
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };
  const ready = () => (doc.fonts && doc.fonts.ready ? doc.fonts.ready.then(go) : go());
  if (doc.readyState === 'complete') setTimeout(ready, 300); else frame.addEventListener('load', () => setTimeout(ready, 100), { once: true });
}
