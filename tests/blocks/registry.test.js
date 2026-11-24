// Этап 5 (MODULAR_PLAN.md): реестр блоков. Блок — папка blocks/<тип>/ (block.json + код), регистрирует себя;
// ядро не упоминает перенесённые блоки. Тесты самих блоков — blocks/<тип>/<тип>.test.js (набор blocks в tests/run.html).
import { group, test, eq, ok } from '../harness.js';
import { registerBlock, registeredBlocks } from '../../src/core/registry.js';
import { menuGroups } from '../../src/core/blocks.js';
import { isBlockTag } from '../../src/core/sanitize.js';

const BUILD = await (await fetch(new URL('../../tools/build.json', import.meta.url), { cache: 'no-store' })).json();
const FIELDS = ['type', 'title', 'aliases', 'figma', 'menu', 'object', 'outline', 'handleAt', 'selector', 'markdown', 'hotkey', 'html', 'degrade', 'text', 'style', 'placeholder', 'variants', 'jsonType', 'classes', 'compound', 'inContainers', 'core', 'toolbar', 'neverEmpty', 'caretBelow', 'frames', 'ids', 'wrap', 'insertMenu', 'lineAfter', 'container', 'linePlaceholder', 'noBold', 'narrow', 'inNarrow', 'jsonExample'];

/** Виды блоков папки: у семейства (заголовки, списки) — variants, иначе — type. */
async function folderTypes(b) {
  const json = await (await fetch(new URL(`../../blocks/${b}/block.json`, import.meta.url), { cache: 'no-store' })).json();
  return json.variants ? json.variants.map((v) => v.type) : [json.type];
}

/** Код ядра без комментариев. */
async function coreSources() {
  const out = [];
  for (const m of BUILD.modules.filter((m) => m.startsWith('src/') && m !== 'src/ui/icons.js')) {   // набор значков Figma — общая библиотека, не логика блоков
    const code = await (await fetch(new URL(`../../${m}`, import.meta.url), { cache: 'no-store' })).text();
    out.push([m, code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1')]);
  }
  for (const s of BUILD.styles.filter((s) => s.startsWith('styles/'))) {
    const css = await (await fetch(new URL(`../../${s}`, import.meta.url), { cache: 'no-store' })).text();
    out.push([s, css.replace(/\/\*[\s\S]*?\*\//g, '')]);
  }
  return out;
}

group('Реестр блоков', () => {
  test('блоки из tools/build.json зарегистрированы, у каждого папка с block.json, тип = имя папки', async () => {
    const types = registeredBlocks().map((d) => d.type);
    const expected = [];
    for (const b of BUILD.blocks) expected.push(...await folderTypes(b));
    eq(types.join(','), expected.join(','), 'порядок и состав — как в build.json');
    for (const b of BUILD.blocks) {
      const json = await (await fetch(new URL(`../../blocks/${b}/block.json`, import.meta.url), { cache: 'no-store' })).json();
      eq(json.type, b, `blocks/${b}/block.json → type`);
    }
  });

  test('block.json: только известные поля, у меню — существующая группа, degrade — drop или нет', async () => {
    const bad = [];
    const groups = menuGroups().map((g) => g.title);
    for (const b of BUILD.blocks) {
      const json = await (await fetch(new URL(`../../blocks/${b}/block.json`, import.meta.url), { cache: 'no-store' })).json();
      for (const k of Object.keys(json)) if (!FIELDS.includes(k)) bad.push(`${b}: неизвестное поле ${k}`);
      if (json.menu && !groups.includes(json.menu.group)) bad.push(`${b}: группа меню ${json.menu.group}`);
      if (json.degrade !== undefined && !['drop', 'children'].includes(json.degrade)) bad.push(`${b}: degrade ${json.degrade}`);
      if (!json.html || typeof json.html !== 'object') bad.push(`${b}: нет html (белый список)`);
      for (const f of [`${b}.js`, `${b}.test.js`, 'README.md']) {
        const r = await fetch(new URL(`../../blocks/${b}/${f}`, import.meta.url), { method: 'HEAD', cache: 'no-store' });
        if (!r.ok) bad.push(`${b}: нет файла ${f}`);
      }
    }
    eq(bad.join('\n'), '');
  });

  // Текстовые блоки (text: true — абзац, заголовки, цитата, код, списки) — исключение: их правку ведёт текстовый движок ядра
  // (ввод, Enter, Backspace, Markdown, превращение), он общий для всех текстовых блоков. Их описание, меню, клавиши, стили — в папке.
  test('ядро не упоминает перенесённые блоки: ни вид, ни тег, ни селектор (кроме имён в прежних наборах; текстовые — см. выше)', async () => {
    const bad = [];
    // блок, который ещё ведут модули ядра (block.json → core: список файлов), перечисляет их сам — см. тест ниже
    for (const d of registeredBlocks().filter((x) => !x.text && !x.core)) {
      // у блока с классом (blockquote.ted-callout) ищем класс, у блока-тега (hr) — тег
      const cls = (/\.([a-z0-9_-]+)/.exec(d.selector) || [])[1];
      const tag = d.selector.split(/[.#[:\s]/)[0];
      const re = cls
        // вид — в роли вида (type === 'button', case, список, Set.has); слово 'button' как HTML-тег (h('button', …)) — не упоминание;
        // виды в коде ядра — в одинарных кавычках, списки HTML-тегов (allowlist.js) — в двойных; tag === 'iframe' — HTML-тег
        // (фреймы видео проверяет тот же белый список), не блок
        ? new RegExp(`(?:(?<!tag\\s*)(?<!=)===?\\s*|case\\s+|[[,]\\s*|has\\()'${d.type}'|\\b${cls}\\b`, 'g')
        : new RegExp(`(['"\`])${d.type}\\1|['"]${tag.toUpperCase()}['"]|[\\s,(]${tag}\\s*[,)]|\\b${tag}\\s*[{[:]`, 'g');
      for (const [file, code] of await coreSources()) {
        for (const line of code.split('\n')) {
          if (/basic:\s*\[/.test(line)) continue;   // прежний набор опции blocks называет виды по имени
          // вид адреса (urlOk(…, 'image'), URL_KINDS — src/core/urls.js = Sanitizer::urlOk) и вид файла службы загрузки
          // (лимиты сервера, поле kind запроса — src/core/server.js, upload.js): слова те же, но это не блоки
          if (/urlOk\(|URL_KINDS|kind === 'image' && IMAGE_DATA|body\.append\('kind'|const KINDS = \[/.test(line)) continue;
          if (re.test(line)) bad.push(`${file}: ${line.trim().slice(0, 100)}`);
          re.lastIndex = 0;
        }
      }
    }
    eq(bad.join('\n'), '');
  });

  test('block.json → core: файлы ядра, которые ещё ведут блок, существуют и правда его упоминают (список не устаревает)', async () => {
    const bad = [];
    // у семейства (медиа) список общий: файл должен упоминать хотя бы один вид семейства
    const byList = new Map();
    for (const d of registeredBlocks().filter((x) => x.core)) { if (!byList.has(d.core)) byList.set(d.core, []); byList.get(d.core).push(d); }
    for (const [core, defs] of byList) {
      const name = defs.map((d) => d.type).join('/');
      if (!Array.isArray(core) || !core.length) { bad.push(`${name}: core — непустой список файлов`); continue; }
      const marks = defs.flatMap((d) => [`'${d.type}'`, (/\.([a-z0-9_-]+)/.exec(d.selector || '') || [])[1]]).filter(Boolean);
      for (const f of core) {
        const res = await fetch(new URL(`../../${f}`, import.meta.url), { cache: 'no-store' });
        if (!res.ok) { bad.push(`${name}: нет файла ${f}`); continue; }
        const code = await res.text();
        if (!marks.some((m) => code.includes(m))) bad.push(`${name}: ${f} блок не упоминает — убрать из core`);
      }
    }
    eq(bad.join('\n'), '');
  });

  test('блочный тег из реестра — только у селектора без класса: hr — да, любой div / figure — нет (div.ted-button, figure.ted-iframe)', () => {
    ok(isBlockTag('hr') && isBlockTag('blockquote') && isBlockTag('ul'));
    ok(!isBlockTag('div') && !isBlockTag('figure') && !isBlockTag('span'));
  });

  test('registerBlock проверяет описание: вид, match, повтор', () => {
    const msg = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
    ok(msg(() => registerBlock({ type: 'Плохо', match: () => false })).includes('вид блока'));
    ok(msg(() => registerBlock({ type: 'x-test' })).includes('match'));
    ok(msg(() => registerBlock({ type: 'hr', match: () => false })).includes('уже зарегистрирован'));
  });
});

group('Реестр блоков: команда insert:<тип>', () => {
  test('вставляет и блок, чей create отдаёт { el, focus } (iFrame, встраивание), а не только элемент (линия)', async () => {
    const { make } = await import('../helpers.js');
    for (const [type, sel] of [['hr', 'hr'], ['iframe', 'figure.ted-iframe'], ['embed', 'div.ted-embed']]) {
      const ed = make('<p>Текст</p>');
      const p = ed.editable.firstElementChild;
      const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
      ed.editable.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
      ed.exec(`insert:${type}`);
      ok(ed.editable.querySelector(sel), `${type}: ${ed.editable.innerHTML.slice(0, 120)}`);
      ed.destroy();
    }
  });
});
