// Тесты блока «Код» (blocks/pre, этап 5.7). Свои — реестр, меню, Markdown, наборы, JSON, сайт; ниже — перенесённые
// прежние тесты кода из tests/sizes.test.js (шапка, язык, номера, копирование, подсветка, вставка, 1000+ строк).
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { Ted, make, blocks, select, pop, html } from '../../tests/helpers.js';
import { blockDef, defOf, markdownBlock } from '../../resources/js/core/registry.js';
import { menuGroups, styleTypes } from '../../resources/js/core/blocks.js';
import { insertBlock } from '../../tests/interaction/samples.js';

const WIDTHS = [1000, 860, 768, 414];
const THEMES = ['light', 'dark'];
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(50); } return fn(); };

group('Блок «Код» (blocks/pre)', () => {
  test('в реестре: «Текст → Код» после цитаты, «Стиль текста → Код» последним, другое имя code, Markdown ```', () => {
    const d = blockDef('pre');
    ok(d && d.text);
    eq(blockDef('code'), d);
    eq(defOf(document.createElement('pre')), d);
    eq(markdownBlock('```'), d);
    const text = menuGroups().find((g) => g.title === 'Текст').items.map((i) => i.type);
    eq(text.slice(text.indexOf('blockquote'), text.indexOf('blockquote') + 2).join(','), 'blockquote,pre');
    eq(styleTypes().at(-1).type, 'pre');
  });

  test('меню «Текст → Код»: пустой блок кода с курсором', () => {
    const ed = make('<p>до</p>');
    const el = insertBlock(ed, 'pre');
    ok(el && el.matches('pre') && el.querySelector(':scope > code'), el && el.outerHTML);
    ed.destroy();
  });

  test('в наборе без кода — абзац с переносами (как на сервере); другое имя code в списке — блок остаётся', () => {
    eq(Ted.clean('<pre><code>a\nb</code></pre>', { blocks: ['p'] }), '<p>a<br>b</p>');
    ok(Ted.clean('<pre><code>a</code></pre>', { blocks: ['p', 'code'] }).startsWith('<pre'));
  });

  test('JSON: { type: "code", lang, code }', () => {
    ok(Ted.blockJsonTypes.includes('code'));
    const out = Ted.fromBlocks([{ type: 'code', lang: 'js', code: 'let a = 1;' }]);
    ok(out.startsWith('<pre data-lang="js"') && out.includes('let'), out);
  });

  test('сайт: кнопку «Копировать код» ставит блок (pre.site.js) — у каждого кода одна', () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.innerHTML = '<pre><code>a</code></pre><pre><code>b</code></pre>';
    document.body.appendChild(box);
    globalThis.TedContent.mount(box);
    globalThis.TedContent.mount(box);
    eq(box.querySelectorAll('pre > .ted-code-copy').length, 2);
    box.remove();
  });
});

// ---- перенесено из tests/sizes.test.js (прежние тесты, без изменений) ----

group('Код: шапка, язык, номера, копирование, подсветка', () => {
  const JS = 'const total = items.reduce((s, i) => s + i.price, 0);\nconsole.log("Итого: " + total); // готово';
  const code = (ed) => ed.editable.querySelector('pre > code');

  test('подсветка в сохранённом HTML: ключевые слова, строки, числа, комментарии, функции', () => {
    const out = Ted.clean('<pre>' + JS.replace(/</g, '&lt;') + '</pre>');
    for (const cls of ["k", "s", "n", "c", "f"]) ok(out.includes(`class="ted-${cls}"`), `${cls}: ${out}`);
    ok(out.includes('<span class="ted-k">const</span>'), out);
    ok(!/<script|onerror/i.test(Ted.clean('<pre><script>alert(1)</script></pre>')), 'теги внутри кода экранируются');
  });
  test('язык определяется сам: PHP, HTML, JSON, SQL, Python, Bash, CSS, JS', () => {
    const lang = (src) => (Ted.clean('<pre>' + src.replace(/</g, '&lt;') + '</pre>').match(/data-lang="([^"]+)"/) || [])[1];
    eq(lang('<?php echo $a; ?>'), 'php');
    eq(lang('<div class="a">Привет</div>'), 'html');
    eq(lang('{"a": 1, "b": [1, 2]}'), 'json');
    eq(lang('SELECT * FROM users WHERE id = 1'), 'sql');
    eq(lang('def hello():\n    print("hi")'), 'python');
    eq(lang('sudo apt install nginx'), 'bash');
    eq(lang('.a { color: red; }'), 'css');
    eq(lang('const a = () => 1;'), 'js');
  });
  test('вставка блока «Код»: шапка, номера строк по умолчанию, язык «Выберите язык» пока код пуст', () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="pre"]').click();
    const pre = ed.editable.querySelector('pre');
    ok(pre && pre.hasAttribute('data-nums'), 'номера строк включены по умолчанию');
    eq(getComputedStyle(pre, '::before').content, '"Выберите язык"');
    document.execCommand('insertText', false, 'SELECT 1');
    ed.refreshCode();
    eq(pre.getAttribute('data-lang'), 'sql', 'язык определился по тексту');
    ok(ed.getInnerHTML().includes('data-lang="sql"'), ed.getInnerHTML());
  });
  test('кнопка «Код» при выделенном блоке целиком превращает его в блок кода и обратно; часть текста — строчный код', () => {
    const ed = make('<p>let a = 1;</p><p>обычный текст и код</p>');
    ed.focus();
    const p0 = ed.editable.children[0];
    const r = document.createRange();
    r.selectNodeContents(p0);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.exec('code');
    ok(ed.editable.querySelector('pre[data-nums] > code'), 'блок кода со строками: ' + ed.editable.innerHTML);
    ed.exec('code');
    ok(!ed.editable.querySelector('pre'), 'повторное нажатие возвращает абзац');
    const p1 = ed.editable.children[1].firstChild;
    const r2 = document.createRange();
    r2.setStart(p1, 14);
    r2.setEnd(p1, 17);
    getSelection().removeAllRanges();
    getSelection().addRange(r2);
    ed.exec('code');
    ok(ed.editable.querySelector('p code'), 'часть абзаца — строчный код');
  });
  test('шапка: клик слева открывает выбор языка (авто, список, свой), справа — копирует; язык применяется', async () => {
    const ed = make('<pre>' + JS + '</pre>');
    const pre = ed.editable.querySelector('pre');
    const r = pre.getBoundingClientRect();
    pre.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 30, clientY: r.top + 10 }));
    ok(await until(() => pop(ed) && Array.from(pop(ed).querySelectorAll('.ted-ui-item')).some((n) => n.textContent.includes('PHP'))), 'список языков');
    ok(Array.from(pop(ed).querySelectorAll('.ted-ui-item')).some((n) => n.textContent.includes('автоматически')), 'пункт «Определить автоматически»');
    ok(pop(ed).querySelector('input'), 'поле для своего языка');
    Array.from(pop(ed).querySelectorAll('.ted-ui-item')).find((n) => n.textContent.includes('PHP')).click();
    eq(pre.getAttribute('data-lang'), 'php');
    ok(!pre.hasAttribute('data-tedui-auto'), 'выбранный язык больше не меняется автоматически');
    let copied = null;
    ed.handle.copyText = (t) => { copied = t; };
    const r2 = pre.getBoundingClientRect();
    pre.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r2.right - 20, clientY: r2.top + 10 }));
    eq(copied, JS, 'копируется весь код');
  });
  test('подсветка в правке: CSS Custom Highlight API, текст не меняется', () => {
    if (!(window.CSS && CSS.highlights && window.Highlight)) return;
    const ed = make('<pre>' + JS + '</pre>');
    ed.refreshCode();
    ok(CSS.highlights.get('ted-kw') && CSS.highlights.get('ted-kw').size > 0, 'ключевые слова подсвечены');
    eq(code(ed).textContent, JS, 'текст кода без разметки');
    ok(!code(ed).querySelector('span'), 'в DOM правки нет span');
  });

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`блок кода по макету: ${width} px, ${theme}`, () => {
        const ed = make('<pre data-lang="js" data-nums="1\n2">let a;\nlet b;</pre>', {}, { width, theme });
        const pre = ed.editable.querySelector('pre');
        const head = getComputedStyle(pre, '::before');
        eq([head.height, head.marginBottom, head.fontSize, head.fontWeight, head.borderRadius].join(' '), '36px 8px 14px 600 12px', 'шапка 36, зазор 8, 14/600, r12');
        eq(head.backgroundColor, theme === 'dark' ? 'rgb(77, 77, 77)' : 'rgb(218, 223, 229)', 'цвет шапки по теме');
        const body = getComputedStyle(code(ed));
        eq([body.borderRadius, body.paddingTop, body.paddingRight].join(' '), '12px 8px 8px', 'код r12, отступы 8');
        const nums = getComputedStyle(pre, '::after');
        eq([nums.width, nums.paddingLeft, nums.textAlign].join(' '), '26px 8px right', 'колонка номеров 26 с отступом 8');
        eq(nums.backgroundColor, theme === 'dark' ? 'rgb(77, 77, 77)' : 'rgb(218, 223, 229)', 'фон колонки номеров');
        ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, 'без переполнения');
      });
    }
  }
});

group('Вставка кода', () => {
  test('многострочный код вставляется в блок кода одним блоком, а не по блоку на строку', () => {
    const ed = make('<pre data-lang="html" data-nums="1"><code>x</code></pre>');
    ed.editable.querySelector('pre > code').replaceChildren(document.createElement('br'));
    ed.focus();
    const code = ed.editable.querySelector('pre > code');
    const r = document.createRange();
    r.selectNodeContents(code);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    const src = '<div class="a">\n  <h2>Заголовок</h2>\n  <p>Текст</p>\n</div>';
    const dt = new DataTransfer();
    dt.setData('text/plain', src);
    dt.setData('text/html', '<div>' + src.split('\n').map((l) => '<div>' + l.replace(/</g, '&lt;') + '</div>').join('') + '</div>');
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    eq(ed.editable.querySelectorAll('pre').length, 1, 'один блок кода: ' + ed.editable.innerHTML);
    eq(ed.editable.querySelector('pre > code').textContent, src, 'текст как был, с отступами');
    eq(ed.editable.querySelector('pre').getAttribute('data-nums').split('\n').length, 4, 'номера строк');
    ok(!ed.editable.querySelector('pre p, pre div, pre pre'), 'внутри только текст');
  });
  test('вставка в середину кода и поверх выделения', () => {
    const ed = make('<pre data-lang="js"><code>ab</code></pre>');
    ed.focus();
    const t = ed.editable.querySelector('pre > code').firstChild;
    const r = document.createRange();
    r.setStart(t, 1);
    r.setEnd(t, 1);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    const dt = new DataTransfer();
    dt.setData('text/plain', 'X\nY');
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    eq(ed.editable.querySelector('pre > code').textContent, 'aX\nYb');
  });
});

group('Код: больше 1000 строк, колонка номеров растягивается, язык кириллицей', () => {
  const lines = (n) => Array.from({ length: n }, (_, i) => `const item${i} = ${i}; // строка ${i}`).join('\n');
  const colW = (pre) => parseFloat(getComputedStyle(pre, '::after').width);

  test('язык можно вписать кириллицей: сохраняется как есть, показывается в шапке', async () => {
    const out = Ted.clean('<pre data-lang="Лохебаный">текст</pre>');
    ok(out.includes('data-lang="лохебаный"'), out);
    const ed = make('<pre data-lang="js"><code>let a;</code></pre>');
    const pre = ed.editable.querySelector('pre');
    ed.handle.openLangMenu(pre);
    const input = document.querySelector('.ted-ui-pop .ted-ui-input, .ted-ui-input[aria-label="Свой язык"]');
    ok(input, 'поле «Свой язык»');
    input.value = 'Лохебаный';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    eq(pre.getAttribute('data-lang'), 'лохебаный');
    eq(getComputedStyle(pre, '::before').content, '"лохебаный"');
  });

  test('колонка номеров: ширина растёт с числом цифр, отступы по бокам 8, код сдвигается следом', () => {
    const w = {};
    for (const n of [5, 50, 500, 1200]) {
      const ed = make('<pre data-lang="js" data-nums="1"><code>' + lines(n) + '</code></pre>');
      ed.refreshCode();
      const p = ed.editable.querySelector('pre');
      eq(p.getAttribute('data-nums').split('\n').length, n, `${n} номеров`);
      w[n] = colW(p);
      const cs = getComputedStyle(p, '::after');
      eq([cs.paddingLeft, cs.paddingRight].join(' '), '8px 8px', 'отступы по бокам 8');
      const codePad = parseFloat(getComputedStyle(p.querySelector('code')).paddingLeft);
      ok(Math.abs(codePad - (w[n] + 8)) <= 0.5, `${n}: код начинается через 8 после колонки (${codePad} / ${w[n]})`);
      ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, 'без переполнения страницы');
    }
    eq(Math.round(w[5]), 26, 'одна цифра — 26, как в макете');
    const ch = w[50] - w[5];
    ok(ch > 5 && ch < 12, 'каждая цифра добавляет её ширину: ' + ch);
    ok(Math.abs((w[500] - w[5]) - 2 * ch) < 0.6 && Math.abs((w[1200] - w[5]) - 3 * ch) < 0.6, `1200 строк: ${w[1200]}`);
  });

  test('1200 строк: ввод и подсветка не тормозят и ничего не ломается', async () => {
    const ed = make('<p>x</p>');
    const t0 = performance.now();
    const dt = new DataTransfer();
    dt.setData('text/plain', lines(1200));
    ed.editable.appendChild(Object.assign(document.createElement('pre'), { innerHTML: '<code>a</code>' }));
    ed.editable.querySelector('pre').setAttribute('data-nums', '1');
    ed.focus();
    const code = ed.editable.querySelector('pre > code');
    const r = document.createRange();
    r.selectNodeContents(code);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    const tPaste = performance.now() - t0;
    ok(tPaste < 3000, 'вставка 1200 строк: ' + Math.round(tPaste) + ' мс');
    const pre = ed.editable.querySelector('pre');
    eq(pre.querySelectorAll('code').length, 1);
    eq(pre.getAttribute('data-nums').split('\n').length, 1200);
    eq(pre.getAttribute('data-nums-d'), '4');
    eq(pre.getAttribute('data-lang'), 'js', 'язык определился и у большого кода');
    if (window.CSS && CSS.highlights && window.Highlight) ok(CSS.highlights.get('ted-kw') && CSS.highlights.get('ted-kw').size >= 1200, 'подсветка и у 1200 строк: ' + (CSS.highlights.get('ted-kw') || { size: 0 }).size);
    const t1 = performance.now();
    document.execCommand('insertText', false, 'x');
    ed.afterChange({ immediate: true });
    const tType = performance.now() - t1;
    ok(tType < 1500, 'набор символа в большом коде: ' + Math.round(tType) + ' мс');
    // Enter и выход из блока
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
    eq(ed.editable.querySelectorAll('pre').length, 1);
    ok(ed.getInnerHTML().includes('data-nums-d="4"'), 'сохраняется');
    const saved = Ted.clean(ed.getInnerHTML());
    ok(saved.split('\n').length < 30000 && /<pre[^>]*data-nums-d="4"/.test(saved), 'повторная очистка цела');
    ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, 'без переполнения');
  });
});

group('Загрузка больших блоков кода', () => {
  test('setHTML с кодом на 2000 строк не тормозит (раньше рос квадратично: 800 строк ≈ 6 с)', () => {
    const ed = make('<p>x</p>');
    const src = Array.from({ length: 2000 }, (_, i) => `<div class="row${i}" data-id="${i}">${i} привет</div>`).join('\n').replace(/</g, '&lt;');
    const t = performance.now();
    ed.setHTML('<pre data-lang="html" data-nums="1"><code>' + src + '</code></pre>', { silent: true });
    const ms = performance.now() - t;
    ok(ms < 2500, 'загрузка: ' + Math.round(ms) + ' мс');
    const code = ed.editable.querySelector('pre > code');
    eq(code.childNodes.length, 1, 'код — один текстовый узел, а не тысячи');
    eq(ed.editable.querySelector('pre').getAttribute('data-nums').split('\n').length, 2000);
    const t2 = performance.now();
    const saved = ed.getInnerHTML();
    ok(performance.now() - t2 < 1500, 'сохранение быстрое');
    ok(saved.includes('class="ted-t"'), 'в сохранённом HTML подсветка есть');
    const t3 = performance.now();
    ed.setHTML(saved, { silent: true });
    ok(performance.now() - t3 < 4000, 'повторная загрузка сохранённого: ' + Math.round(performance.now() - t3) + ' мс');
  });
});

group('Пустой блок кода по макету (state=empty)', () => {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`заглушки «Выберите язык» и «// Вставьте или напишите код»: ${width} px, ${theme}`, () => {
        const ed = make('<p></p>', {}, { width, theme });
        select(ed, 0, 0);
        ed.blockMenu.openPicker(blocks(ed)[0]);
        ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="pre"]').click();
        ed.updatePlaceholders();
        const pre = ed.editable.querySelector('pre');
        ok(pre.hasAttribute('data-tedui-empty') && !pre.hasAttribute('data-tedui-ph'), 'признак пустого блока, без общей заглушки');
        const head = getComputedStyle(pre, '::before');
        eq([head.content, head.position, head.height].join(' '), '"Выберите язык" static 36px', 'шапка на месте, над кодом');
        eq(head.color, 'rgb(145, 149, 153)', 'заглушка шапки видна (#919599)');
        const body = getComputedStyle(pre.querySelector('code'), '::before');
        eq(body.content, '"// Вставьте или напишите код"');
        eq(body.color, theme === 'dark' ? 'rgb(145, 149, 153)' : 'rgb(218, 223, 229)', 'цвет заглушки тела как в макете');
        const hr = pre.getBoundingClientRect();
        const cr = pre.querySelector('code').getBoundingClientRect();
        ok(cr.top - hr.top >= 44 - 1, `код ниже шапки: ${Math.round(cr.top - hr.top)}`);
        ok(!ed.getInnerHTML().includes('<pre'), 'пустой блок не сохраняется');
        document.execCommand('insertText', false, 'a');
        ed.updatePlaceholders();
        ok(!pre.hasAttribute('data-tedui-empty'), 'после ввода заглушки уходят');
      });
    }
  }
});

group('Шапка кода: настоящие кнопки и горячие клавиши (ревью)', () => {
  const inCode = () => {
    const ed = make('<pre data-lang="js"><code>let a = 1;</code></pre><p>после</p>');
    ed.focus();
    const t = ed.editable.querySelector('pre > code').firstChild;
    const r = document.createRange();
    r.setStart(t, 3);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    return ed;
  };

  test('у блока кода с курсором есть кнопки «Язык кода» и «Копировать код» с доступными именами, поверх шапки', () => {
    const ed = inCode();
    const h = ed.handle;
    ok(!h.codeHead.hidden, 'кнопки показаны');
    eq(h.codeLang.getAttribute('aria-label'), 'Язык кода');
    eq(h.codeCopy.getAttribute('aria-label'), 'Копировать код');
    eq(h.codeLang.tagName + h.codeCopy.tagName, 'BUTTONBUTTON', 'это кнопки, а не псевдоэлементы');
    const pr = ed.editable.querySelector('pre').getBoundingClientRect();
    const hr = h.codeHead.getBoundingClientRect();
    ok(Math.abs(hr.top - pr.top) <= 1 && Math.abs(hr.left - pr.left) <= 1 && Math.abs(hr.width - pr.width) <= 1, 'поверх шапки');
    eq(Math.round(hr.height), 36);
    const c = h.codeCopy.getBoundingClientRect();
    eq([Math.round(c.width), Math.round(c.height), Math.round(hr.right - c.right), Math.round(c.top - hr.top)].join(' '), '24 24 6 6', 'копирование 24, отступы 6');
    select(ed, 1, 0);
    ed.updateState();
    ok(h.codeHead.hidden, 'вне блока кода кнопки скрыты');
  });

  test('кнопка языка открывает выбор, кнопка копирования копирует весь код', async () => {
    const ed = inCode();
    let copied = null;
    ed.handle.copyText = (t) => { copied = t; };
    ed.handle.codeCopy.click();
    eq(copied, 'let a = 1;');
    ed.handle.codeLang.click();
    ok(await until(() => ed.popover.isOpen), 'окно выбора языка');
    ed.popover.close();
  });

  test('Ctrl+Alt+L — язык, Ctrl+Alt+C — копирование', async () => {
    const ed = inCode();
    let copied = null;
    ed.handle.copyText = (t) => { copied = t; };
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, altKey: true, code: 'KeyC', key: 'c' }));
    eq(copied, 'let a = 1;');
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, altKey: true, code: 'KeyL', key: 'l' }));
    ok(await until(() => ed.popover.isOpen), 'окно языка по клавише');
    ed.popover.close();
  });
});

group('Сайт: «Копировать код» (1.0.4)', () => {
  // на сайте texted по http галочка была, а в буфер не попадало, и тоста не было — проверка вручную 27.11
  test('кнопка копирует весь код (запасной способ, если Clipboard API нет или отказал) и показывает тост, как в редакторе', async () => {
    if (!window.TedContent) return;
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.innerHTML = Ted.clean('<pre data-lang="js"><code>let a = 1;\nlet b = 2;</code></pre>');
    document.body.appendChild(box);
    const exec = document.execCommand;
    let copied = null;
    try {
      // Clipboard API отказывает (как без https или без разрешения) — копирует запасной способ
      Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => ({ writeText: () => Promise.reject(new Error('нет доступа')) }) });
      document.execCommand = (cmd) => { if (cmd === 'copy') { copied = document.activeElement && document.activeElement.value; return true; } return false; };
      window.TedContent.mount(box);
      box.querySelector('.ted-code-copy').click();
      await wait(50);
      eq(copied, 'let a = 1;\nlet b = 2;', 'в буфер — весь код');
      ok(box.querySelector('.ted-code-copy').classList.contains('is-copied'), 'галочка');
      const toast = document.querySelector('body > .ted-ui-toasts[data-ted-site] .ted-ui-toast');
      ok(toast && /Код скопирован|Code copied/.test(toast.textContent), 'тост «Код скопирован»');
    } finally {
      document.execCommand = exec;
      delete navigator.clipboard;
      document.querySelectorAll('body > .ted-ui-toasts[data-ted-site]').forEach((n) => n.remove());
      box.remove();
    }
  });
});
