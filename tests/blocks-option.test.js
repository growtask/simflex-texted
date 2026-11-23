import { group, test, eq, ok } from './harness.js';
import { Ted, make, select, blocks } from './helpers.js';

const RICH = '<h2>Заголовок</h2><p class="ted-bg-gray">Плашка</p><ul class="ted-checklist"><li class="ted-checked">Раз</li><li>Два</li></ul>'
  + '<ol class="ted-steps"><li><strong>Шаг</strong><br>Описание</li></ol><blockquote class="ted-callout"><p><strong>Совет</strong></p><p>Текст совета</p></blockquote>'
  + '<ul class="ted-facts"><li><strong>120+</strong><br>стран</li><li><strong>4.8</strong><br>оценка</li></ul>'
  + '<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Хорошо</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Плохо</li></ul></li></ul>'
  + '<blockquote><p>Цитата</p><p class="ted-author"><strong>Автор</strong><br>Должность</p></blockquote><pre data-lang="js"><code>let a = 1;\nlet b = 2;</code></pre><hr><p>Конец</p>';

const tags = (html) => Array.from(new Set(Array.from(new DOMParser().parseFromString(html, 'text/html').body.querySelectorAll('*')).map((n) => n.localName))).sort().join(',');
const topTags = (ed) => blocks(ed).map((b) => b.localName).join(',');

group('Опция blocks: отключаемые секции (редактор «только текст»)', () => {
  test('по умолчанию доступно всё', () => {
    const ed = make(RICH);
    ok(ed.getInnerHTML().includes('ted-facts') && ed.getInnerHTML().includes('ted-callout') && ed.getInnerHTML().includes('<hr>'));
    eq(ed.allowedBlocks, null);
  });

  test("blocks: 'text' — при загрузке всё лишнее превращается в абзацы и списки, текст не теряется", () => {
    const ed = make(RICH, { blocks: 'text' });
    const html = ed.getInnerHTML();
    ok(/^[a-z0-9,]+$/.test(tags(html).replace(/,(strong|em|a|br|u|s|code|mark|sub|sup)\b/g, '')), 'только текстовые теги: ' + tags(html));
    ok(!/ted-(facts|callout|proscons|checklist|steps|bg-)|<pre|<blockquote|<hr/.test(html), html);
    for (const word of ['Плашка', 'Раз', 'Два', 'Шаг', 'Описание', 'Совет', 'Текст совета', '120+', 'стран', 'Плюсы', 'Хорошо', 'Минусы', 'Плохо', 'Цитата', 'let a = 1;', 'Конец']) ok(html.includes(word), `«${word}» сохранился: ${html}`);
    ok(!html.includes('Автор'), 'подпись автора цитаты не входит в текст');
  });

  test("blocks: 'text' — меню «/», «Все блоки», «Стиль текста» и панель показывают только разрешённое", () => {
    const ed = make('<p>а</p>', { blocks: 'text' });
    const types = ed.blockMenu.groups().flatMap((g) => g.items.map((i) => i.type));
    eq(types.sort().join(','), ['h2', 'h3', 'h4', 'ol', 'p', 'ul'].join(','), 'в меню: ' + types);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    const tiles = Array.from(ed.blockMenu.picker.panel.querySelectorAll('.ted-ui-tile')).map((t) => t.dataset.type).sort();
    eq(tiles.join(','), types.join(','), 'в «Все блоки» то же');
    ed.blockMenu.closePicker();
    ed.focus();
    select(ed, 0, 1);
    ed.updateState();
    ok(ed.toolbar.colorBtn.hidden, 'кнопка «Цветной фон» убрана');
    ok(ed.toolbar.mediaBtn.hidden, 'кнопка «Медиа» убрана');
    ed.toolbar.styleBtn.click();
    const labels = Array.from(document.querySelectorAll('.ted-ui-pop .ted-ui-item')).map((n) => n.textContent.trim());
    ok(!labels.includes('Чек-лист') && !labels.includes('Цитата') && !labels.includes('Код') && labels.includes('Заголовок 3'), labels.join('|'));
    ed.popover.close();
  });

  test("blocks: 'text' — команды и Markdown запрещённых блоков не действуют, разрешённых — действуют", () => {
    const ed = make('<p>а</p>', { blocks: 'text' });
    ed.focus();
    select(ed, 0, 1);
    ed.exec('block:callout');
    ed.exec('block:pre');
    ed.exec('bg:color1');
    eq(topTags(ed), 'p', 'блок не изменился');
    ok(!/ted-bg/.test(ed.editable.innerHTML), 'фон не наложен');
    ed.exec('block:h3');
    eq(topTags(ed), 'h3');
    // Markdown: «> » (цитата) остаётся текстом, «- » (список) работает
    const e2 = make('<p></p>', { blocks: 'text' });
    e2.focus();
    select(e2, 0, 0);
    document.execCommand('insertText', false, '>');
    document.execCommand('insertText', false, ' ');
    eq(topTags(e2), 'p', 'цитата по «> » не создана');
    const e3 = make('<p></p>', { blocks: 'text' });
    e3.focus();
    select(e3, 0, 0);
    document.execCommand('insertText', false, '-');
    document.execCommand('insertText', false, ' ');
    eq(topTags(e3), 'ul', 'список по «- » создан');
  });

  test('вставка из буфера и сохранение тоже приводятся к разрешённому', () => {
    const ed = make('<p>а</p>', { blocks: 'text' });
    ed.focus();
    const r = document.createRange();
    r.selectNodeContents(ed.editable.firstChild);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    const dt = new DataTransfer();
    dt.setData('text/html', '<ul class="ted-facts"><li><strong>5</strong><br>штук</li><li><strong>6</strong><br>раз</li></ul>');
    dt.setData('text/plain', '5 штук');
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    ok(!/ted-facts/.test(ed.editable.innerHTML) && ed.editable.textContent.includes('штук'), ed.editable.innerHTML);
    // кто-то мимо меню положил запрещённый блок в DOM — сохранение его всё равно приведёт к тексту
    ed.editable.insertAdjacentHTML('beforeend', '<blockquote class="ted-callout"><p><strong>Х</strong></p><p>Y</p></blockquote>');
    ok(!/ted-callout/.test(ed.getInnerHTML()), ed.getInnerHTML());
  });

  test('массив типов: callout и h2 разрешены, цифры — нет; фон снимается, если background не в списке', () => {
    const ed = make(RICH, { blocks: ['h2', 'callout', 'ul'] });
    const html = ed.getInnerHTML();
    ok(html.includes('ted-callout') && html.includes('<h2'), html);
    ok(!/ted-facts|ted-bg-|ted-checklist|<pre/.test(html), html);
    ok(!ed.toolbar.styleBtn.hidden);
    const ed2 = make('<p class="ted-bg-color1">Плашка</p>', { blocks: ['h2', 'background'] });
    ok(ed2.getInnerHTML().includes('ted-bg-color1'), 'фон разрешён — остался');
    ok(!make('<p class="ted-bg-color1">Плашка</p>', { blocks: ['h2'] }).getInnerHTML().includes('ted-bg-'), 'фон не разрешён — снят');
  });

  test('Ted.clean(html, { blocks }) для серверной стороны и проверок; неизвестный пресет = всё разрешено', () => {
    const out = Ted.clean(RICH, { blocks: 'text' });
    ok(!/ted-callout|ted-facts|<pre/.test(out) && out.includes('Текст совета'), out);
    ok(Ted.clean(RICH, { blocks: 'что-то' }).includes('ted-facts'), 'без пресета — как обычно');
    eq(Ted.clean(Ted.clean(RICH, { blocks: 'text' }), { blocks: 'text' }), out, 'идемпотентно');
  });

  test("blocks: 'basic' оставляет цитату, код, линию, чек-лист и шаги, но убирает акценты и медиа", () => {
    const ed = make(RICH, { blocks: 'basic' });
    const html = ed.getInnerHTML();
    ok(html.includes('ted-checklist') && html.includes('ted-steps') && html.includes('<pre') && html.includes('<hr>') && html.includes('<blockquote>'), html);
    ok(!/ted-callout|ted-facts|ted-proscons|ted-bg-/.test(html), html);
  });
});
