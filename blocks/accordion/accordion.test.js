// Тесты блока «Аккордеон» (blocks/accordion, этап 5) — прежние tests/accordion.test.js, перенесены без изменений.
// Аккордеон (этап 6.3, макет block-accordion): разметка сайта с FAQ, очистка, правка, клавиши, блоки в ответе, вид.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, html, blocks, Ted } from '../../tests/helpers.js';

const SAVED = (q, a) => `<div class="ted-accordion" itemscope itemtype="https://schema.org/FAQPage">\n<details class="ted-accordion__item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question"><summary class="ted-accordion__q" itemprop="name">${q}</summary><div class="ted-accordion__a" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer"><div class="ted-accordion__body" itemprop="text">\n${a}\n</div></div></details>\n</div>`;
const flat = (s) => s.replace(/\n/g, '');

function caret(ed, el, atEnd = true) {
  ed.editable.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  ed.updateState();
}
const key = (ed, k, o = {}) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }); ed.editable.dispatchEvent(e); if (!e.defaultPrevented && k === 'Enter') document.execCommand('insertParagraph'); ed.updateState(); ed.updatePlaceholders(); return e.defaultPrevented; };
const type = (ed, t) => { document.execCommand('insertText', false, t); ed.updateState(); ed.updatePlaceholders(); };

group('Аккордеон: разметка и очистка', () => {
  test('сайт: <details>/<summary>, ответ — блоки, разметка FAQ schema.org; повторная очистка не меняет HTML', () => {
    const src = SAVED('Как долго идёт доставка?', '<p>От одного до трёх дней.</p>\n<ul>\n  <li>Курьер</li>\n</ul>');
    const out = Ted.clean(src);
    eq(out, src);
    eq(Ted.clean(out), out);
  });

  test('одиночный <details> из старого текста — аккордеон; опасное убирается; фон и вложенный аккордеон в ответе не остаются', () => {
    const out = Ted.clean('<details open ontoggle="alert(1)"><summary onclick="x">Вопрос <b>жирный</b></summary><p class="ted-bg-gray" style="color:red">Ответ</p><script>alert(1)</script></details>');
    eq(flat(out), flat(SAVED('Вопрос <strong>жирный</strong>', '<p>Ответ</p>')));
    const nested = Ted.clean(SAVED('Внешний', SAVED('Внутренний', '<p>текст</p>')));
    ok(nested.match(/ted-accordion"/g).length === 1, 'вложенный аккордеон раскрыт в текст');
    ok(/<p><strong>Внутренний<\/strong><\/p>/.test(nested) && /<p>текст<\/p>/.test(nested), nested);
  });

  test('изображение и таблица в ответе сохраняются', () => {
    const img = '<figure class="ted-media ted-media--image"><img src="/uf/images/a.webp" alt="Фото"></figure>';
    const out = Ted.clean(SAVED('Вопрос', img));
    ok(/<details[^>]*>.*<img src="\/uf\/images\/a\.webp"/s.test(out), out);
  });
});

group('Аккордеон: правка', () => {
  test('из меню блоков: один пункт, курсор в вопросе, заглушки «Вопрос» и «Ответ», «Добавить вопрос» под блоком', async () => {
    const ed = make('<p>до</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="accordion"]').click();
    await wait(20);
    ed.updatePlaceholders();
    const acc = ed.editable.querySelector('.ted-accordion');
    ok(acc, 'вставлен');
    const q = acc.querySelector('.ted-accordion__q');
    eq(q.getAttribute('data-tedui-ph'), 'Вопрос');
    eq(acc.querySelector('.ted-accordion__body > p').getAttribute('data-tedui-ph'), 'Ответ');
    ok(q.contains(getSelection().anchorNode) || getSelection().anchorNode === q, 'курсор в вопросе');
    ed.updateState();
    ok(ed.accordion.addBtn.classList.contains('is-visible'));
    eq(ed.accordion.addBtn.textContent, 'Добавить вопрос');
  });

  test('Enter в вопросе — в ответ; двойной Enter в конце ответа — новый вопрос; Enter в пустом последнем вопросе — абзац под блоком', () => {
    const ed = make('<div class="ted-accordion"><details class="ted-accordion__item"><summary>Вопрос</summary><div class="ted-accordion__a"><div class="ted-accordion__body"><p>Ответ</p></div></div></details></div><p>после</p>');
    const item = () => ed.editable.querySelectorAll('.ted-accordion__item');
    caret(ed, item()[0].querySelector('.ted-accordion__q'));
    ok(key(ed, 'Enter'));
    ok(item()[0].querySelector('.ted-accordion__body').contains(getSelection().anchorNode), 'курсор в ответе');
    caret(ed, item()[0].querySelector('.ted-accordion__body > p'));
    key(ed, 'Enter');
    ok(key(ed, 'Enter'), 'второй Enter обработан');
    eq(item().length, 2, 'новый вопрос');
    eq(item()[0].querySelector('.ted-accordion__body').children.length, 1, 'пустая строка убрана');
    type(ed, 'Второй');
    eq(item()[1].querySelector('.ted-accordion__q').textContent, 'Второй', 'текст — в новом вопросе');
    ed.history.commit();
    item()[1].querySelector('.ted-accordion__q').innerHTML = '<br>';
    caret(ed, item()[1].querySelector('.ted-accordion__q'), false);
    ok(key(ed, 'Enter'));
    eq(item().length, 1, 'пустой последний вопрос убран');
    const acc = ed.editable.querySelector('.ted-accordion');
    eq(acc.nextElementSibling.tagName, 'P');
    ok(acc.nextElementSibling.contains(getSelection().anchorNode) || getSelection().anchorNode === acc.nextElementSibling, 'курсор под блоком');
  });

  test('Backspace: в начале ответа не склеивает с вопросом; в пустом вопросе — удаляет пункт', () => {
    const ed = make('<div class="ted-accordion"><details class="ted-accordion__item"><summary>Первый</summary><div class="ted-accordion__a"><div class="ted-accordion__body"><p>Ответ</p></div></div></details><details class="ted-accordion__item"><summary>Второй</summary></details></div>');
    const items = () => ed.editable.querySelectorAll('.ted-accordion__item');
    caret(ed, items()[0].querySelector('.ted-accordion__body > p'), false);
    ok(key(ed, 'Backspace'));
    eq(items()[0].querySelector('.ted-accordion__q').textContent, 'Первый');
    eq(items()[0].querySelector('.ted-accordion__body > p').textContent, 'Ответ');
    items()[1].querySelector('.ted-accordion__q').innerHTML = '<br>';
    caret(ed, items()[1].querySelector('.ted-accordion__q'), false);
    ok(key(ed, 'Backspace'));
    eq(items().length, 1);
  });

  test('в ответе — обычные блоки: стиль текста работает, цветного фона нет; в вопросе — только строчное форматирование', () => {
    const ed = make('<div class="ted-accordion"><details class="ted-accordion__item"><summary>Вопрос</summary><div class="ted-accordion__a"><div class="ted-accordion__body"><p>Ответ</p></div></div></details></div>');
    const p = ed.editable.querySelector('.ted-accordion__body > p');
    caret(ed, p);
    eq(ed.state.type, 'p', 'текущий блок — абзац ответа');
    ok(!ed.toolbar.colorParts().canBgMenu, 'фона нет (цвет текста — есть)');
    ok(!ed.toolbar.styleBtn.hidden, 'стиль текста есть');
    ed.exec('block:h3');
    ok(ed.editable.querySelector('.ted-accordion__body > h3'), 'абзац ответа стал заголовком');
    caret(ed, ed.editable.querySelector('.ted-accordion__q'));
    ok(ed.toolbar.styleBtn.hidden && ed.toolbar.alignBtn.hidden && !ed.toolbar.colorParts().canBgMenu && ed.toolbar.colorParts().canTc, 'в вопросе нет стиля, выравнивания и фона; цвет текста вопроса — есть (1.0.4)');
    ok(!ed.toolbar.marks.bold.hidden && !ed.toolbar.marks.link.hidden);
  });

  test('меню блоков в ответе: без цветного фона и вложенного аккордеона; изображение вставляется в ответ', async () => {
    const ed = make('<div class="ted-accordion"><details class="ted-accordion__item"><summary>Вопрос</summary><div class="ted-accordion__a"><div class="ted-accordion__body"><p><br></p></div></div></details></div>', { mediaSource: 'manager', pickFile: () => [] });
    const p = ed.editable.querySelector('.ted-accordion__body > p');
    caret(ed, p);
    ed.blockMenu.openPicker(p);
    await wait(20);
    ok(!document.querySelector('.ted-ui-tile[data-type="background"]') && !document.querySelector('.ted-ui-tile[data-type="accordion"]'), 'нет фона и аккордеона');
    ok(document.querySelector('.ted-ui-tile[data-type="table"]'), 'таблица есть');
    ed.blockMenu.closePicker();
    const block = ed.media.create('image', p, { select: false, items: [{ url: '/uf/images/a.webp', alt: 'Фото' }] });
    ok(block && block.parentNode.classList.contains('ted-accordion__body'), 'изображение в ответе');
    ok(/<summary[^>]*>Вопрос<\/summary>.*<img src="\/uf\/images\/a\.webp"/s.test(html(ed)), html(ed));
  });

  test('кнопки вопроса (⠿ 🗑) как у шагов: корзина удаляет вопрос, Undo возвращает; «Добавить вопрос»', () => {
    const ed = make('<div class="ted-accordion"><details class="ted-accordion__item"><summary>Первый</summary></details><details class="ted-accordion__item"><summary>Второй</summary></details></div>');
    const items = () => ed.editable.querySelectorAll('.ted-accordion__item');
    caret(ed, items()[1].querySelector('.ted-accordion__q'));
    eq(ed.handle.item, items()[1], 'вопрос — элемент с кнопками');
    ok(ed.handle.itemControls.classList.contains('is-visible'));
    ed.handle.removeItem(items()[1]);
    eq(items().length, 1);
    ed.exec('undo');
    eq(ed.editable.querySelectorAll('.ted-accordion__item').length, 2, 'Undo вернул');
    caret(ed, ed.editable.querySelector('.ted-accordion__q'));
    ed.accordion.addBtn.click();
    eq(ed.editable.querySelectorAll('.ted-accordion__item').length, 3);
  });

  test('шеврон раскрывает и сворачивает пункт; пункт с курсором раскрыт', () => {
    const ed = make('<div class="ted-accordion"><details class="ted-accordion__item"><summary>Первый</summary><div class="ted-accordion__a"><div class="ted-accordion__body"><p>Ответ</p></div></div></details><details class="ted-accordion__item"><summary>Второй</summary></details></div>', {}, { width: 1000 });
    const items = ed.editable.querySelectorAll('.ted-accordion__item');
    caret(ed, items[1].querySelector('.ted-accordion__q'));
    ok(items[1].hasAttribute('data-tedui-open'), 'с курсором — раскрыт');
    ok(!items[0].hasAttribute('data-tedui-open'), 'остальные свёрнуты');
    const q = items[0].querySelector('.ted-accordion__q');
    const r = q.getBoundingClientRect();
    q.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.right - 10, clientY: r.top + 10 }));
    ok(items[0].hasAttribute('data-tedui-open'), 'шеврон раскрыл');
    eq(getComputedStyle(items[1].querySelector('.ted-accordion__body') || document.body).visibility, 'visible');
    q.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.right - 10, clientY: r.top + 10 }));
    ok(!items[0].hasAttribute('data-tedui-open'), 'и свернул');
    ok(!/data-tedui|open/.test(html(ed).replace(/itemtype|itemprop|itemscope/g, '')), 'в HTML нет служебных меток и open');
  });
});

group('Аккордеон: вид по макету block-accordion', () => {
  const ONE = '<div class="ted-accordion"><details class="ted-accordion__item"><summary>Вопрос</summary><div class="ted-accordion__a"><div class="ted-accordion__body"><p>Ответ</p></div></div></details><details class="ted-accordion__item"><summary>Второй</summary></details></div>';
  test('светлая: вопрос 20 / 1.5 #262626, поля 20, шеврон 24, линия 2 #DADFE5, между пунктами 12; ответ — абзацы с отступом', () => {
    const ed = make(ONE, {}, { width: 1000 });
    const q = ed.editable.querySelector('.ted-accordion__q');
    const cs = getComputedStyle(q);
    eq([cs.fontSize, cs.lineHeight, cs.color, cs.paddingTop, cs.paddingBottom].join(' '), '20px 30px rgb(38, 38, 38) 20px 20px');
    eq([getComputedStyle(q, '::after').width, getComputedStyle(q, '::after').height].join(' '), '24px 24px');
    const item = ed.editable.querySelector('.ted-accordion__item');
    eq([getComputedStyle(item).borderBottomWidth, getComputedStyle(item).borderBottomColor].join(' '), '2px rgb(218, 223, 229)');
    eq(getComputedStyle(ed.editable.querySelector('.ted-accordion')).rowGap, '12px');
  });

  test('тёмная: вопрос #FFF, шеврон #DADFE5, ответ #EDF3FA, линия #4D4D4D', () => {
    const ed = make(ONE, {}, { width: 1000, theme: 'dark' });
    const q = ed.editable.querySelector('.ted-accordion__q');
    eq(getComputedStyle(q).color, 'rgb(255, 255, 255)');
    eq(getComputedStyle(q, '::after').backgroundColor, 'rgb(218, 223, 229)');
    eq(getComputedStyle(ed.editable.querySelector('.ted-accordion__body')).color, 'rgb(237, 243, 250)');
    eq(getComputedStyle(ed.editable.querySelector('.ted-accordion__item')).borderBottomColor, 'rgb(77, 77, 77)');
  });
});

group('Аккордеон в узком редакторе (364)', () => {
  test('кнопки вопроса — на строке вопроса левее шеврона; не лежат на кнопках блока', () => {
    const ed = make('<p>a</p><div class="ted-accordion"><details class="ted-accordion__item"><summary>Первый вопрос</summary></details><details class="ted-accordion__item"><summary>Второй</summary></details></div>', {}, { width: 364 });
    const q = ed.editable.querySelectorAll('.ted-accordion__q')[0];
    caret(ed, q);
    const c = ed.handle.itemControls.getBoundingClientRect();
    const b = ed.handle.controls.getBoundingClientRect();
    const qr = q.getBoundingClientRect();
    ok(c.top >= qr.top && c.bottom <= qr.bottom, 'на строке вопроса');
    ok(c.right <= qr.right - 32, 'левее шеврона');
    ok(!(c.left < b.right && b.left < c.right && c.top < b.bottom && b.top < c.bottom), 'не на кнопках блока');
  });
});

// ---- блок полностью в папке (отвязка ядра, 21.11): ядро и общий код контейнеров спрашивают реестр ----
group('Аккордеон: точки подключения реестра', () => {
  const ITEM = (q, a) => `<details class="ted-accordion__item"><summary class="ted-accordion__q">${q}</summary><div class="ted-accordion__a"><div class="ted-accordion__body">${a}</div></div></details>`;
  const ACC = (...items) => `<div class="ted-accordion">${items.join('')}</div>`;

  test('editorUi: editor.accordion в blockUis; container — последним под ним строка текста', () => {
    const ed = make(ACC(ITEM('Сколько?', '<p>Два дня</p>')));
    ok(ed.accordion && ed.blockUis.includes(ed.accordion));
    eq(blocks(ed).map((b) => b.tagName).join(','), 'DIV,P');
    ed.destroy();
  });

  test('adopt: одиночный <details> со страницы — аккордеон из одного пункта', () => {
    const out = Ted.clean('<details><summary>Вопрос</summary><p>Ответ</p></details>');
    ok(/class="ted-accordion"/.test(out) && /<summary class="ted-accordion__q"[^>]*>Вопрос<\/summary>/.test(out) && out.includes('<p>Ответ</p>'), out);
  });

  test('unnest: аккордеон в колонке раскрывается — вопрос жирным, за ним ответ', () => {
    const out = Ted.clean('<div class="ted-columns ted-columns--2"><div class="ted-columns__col">' + ACC(ITEM('Вопрос', '<p>Ответ</p>')) + '</div><div class="ted-columns__col"><p>Б</p></div></div>');
    ok(!out.includes('ted-accordion') && /<p><strong>Вопрос<\/strong><\/p>\s*<p>Ответ<\/p>/.test(out), out);
  });

  test('itemRow, itemCaret, removedToast: кнопки на строке вопроса; корзина — «Вопрос удалён», курсор в соседний вопрос', async () => {
    const ed = make(ACC(ITEM('Первый', '<p>А</p>'), ITEM('Второй', '<p>Б</p>')));
    const items = ed.editable.querySelectorAll('.ted-accordion__item');
    const q = items[0].querySelector('.ted-accordion__q');
    const r = document.createRange(); r.selectNodeContents(q); r.collapse(false);
    ed.editable.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    ed.updateState();
    await wait(30);
    eq(ed.listItem(q.firstChild || q), items[0], 'пункт под курсором');
    const qr = q.getBoundingClientRect(); const cr = ed.handle.itemControls.getBoundingClientRect();
    ok(Math.abs((cr.top + cr.bottom) / 2 - (qr.top + qr.bottom) / 2) < 3, 'кнопки на уровне вопроса');
    const said = [];
    ed.toast = (text) => { said.push(text); return null; };
    ed.handle.removeItem(items[0]);
    await wait(30);
    eq(said.join('|'), 'Вопрос удалён');
    const s = getSelection().getRangeAt(0).startContainer;
    ok((s.nodeType === 1 ? s : s.parentNode).closest('.ted-accordion__q'), 'курсор в вопросе');
    ed.destroy();
  });
});

group('Аккордеон на сайте (сайт texted 27.11, 1.0.4)', () => {
  test('раскрытый ответ виден: сохранённая разметка с обёрткой FAQ (.ted-accordion__a) — ответ непрозрачный', async () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.innerHTML = Ted.clean('<div class="ted-accordion"><details class="ted-accordion__item"><summary class="ted-accordion__q">Вопрос</summary><div class="ted-accordion__body"><p>Ответ</p></div></details></div>');
    document.body.appendChild(box);
    try {
      const item = box.querySelector('details');
      ok(item.querySelector('.ted-accordion__a > .ted-accordion__body'), 'ответ в обёртке FAQ');
      item.open = true;
      await wait(30);
      for (const a of box.getAnimations({ subtree: true })) a.finish();
      await wait(0);
      eq(getComputedStyle(item.querySelector('.ted-accordion__body')).opacity, '1', 'ответ виден');
    } finally {
      box.remove();
    }
  });
});
