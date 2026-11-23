// Тесты блока «Колонки» (blocks/columns, этап 5) — прежние tests/columns.test.js, перенесены без изменений.
// Колонки (этап 6.2, макет block-columns): разметка, очистка, правка («Добавить колонку», кнопки колонки, клавиши), сетка по ширине, вид.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, html, blocks, Ted } from '../../tests/helpers.js';

const COLS = (...cols) => `<div class="ted-columns ted-columns--${cols.length}">\n${cols.map((c) => `<div class="ted-columns__col">\n${c}\n</div>`).join('\n')}\n</div>`;

function caret(ed, el, atEnd = true) {
  ed.editable.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  ed.updateState();
}
const key = (ed, k) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); ed.editable.dispatchEvent(e); ed.updateState(); return e.defaultPrevented; };

group('Колонки: разметка и очистка', () => {
  test('сайт: <div class="ted-columns ted-columns--2">, в колонке — блоки; повторная очистка не меняет HTML', () => {
    const src = COLS('<h6>Доставка</h6>\n<p>От одного до трёх дней.</p>', '<h6>Возврат</h6>\n<ul>\n  <li>Две недели</li>\n</ul>');
    const out = Ted.clean(src);
    eq(out, src);
    eq(Ted.clean(out), out);
  });

  test('не больше четырёх колонок; опасное убирается; фон и вложенные колонки в колонке не остаются', () => {
    const five = Ted.clean(`<div class="ted-columns">${'<div class="ted-columns__col"><p>x</p></div>'.repeat(5)}</div>`);
    eq(five.match(/ted-columns__col/g).length, 4);
    ok(/ted-columns--4/.test(five));
    const out = Ted.clean('<div class="ted-columns" onclick="x"><div class="ted-columns__col" style="color:red"><p class="ted-bg-gray">Фон</p><script>alert(1)</script></div><div class="ted-columns__col">' + COLS('<p>а</p>', '<p>б</p>') + '</div></div>');
    ok(!/onclick|style|script|ted-bg-/.test(out), out);
    eq(out.match(/class="ted-columns /g).length, 1, 'вложенные колонки раскрыты');
    ok(/<p>а<\/p>/.test(out) && /<p>б<\/p>/.test(out), out);
  });

  test('изображение в колонке сохраняется', () => {
    const img = '<figure class="ted-media ted-media--image"><img src="/uf/images/a.webp" alt="Фото"></figure>';
    const out = Ted.clean(COLS(img, '<p>т</p>'));
    ok(/ted-columns__col">\s*<figure[^>]*>\s*<img src="\/uf\/images\/a\.webp"/.test(out), out);
  });
});

group('Колонки: правка', () => {
  test('из меню блоков: две колонки рядом, в каждой — обычная заглушка с «/» (22.11), курсор в первой, «Добавить колонку» под блоком', async () => {
    const ed = make('<p>до</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="columns"]').click();
    await wait(20);
    ed.updatePlaceholders();
    const el = ed.editable.querySelector('.ted-columns');
    ok(el, 'вставлен');
    const cols = el.querySelectorAll(':scope > .ted-columns__col');
    eq(cols.length, 2);
    for (const c of cols) {
      eq(c.children.length, 1, 'одна строка');
      ok((c.firstElementChild.getAttribute('data-tedui-ph') || '').includes('/'), 'заглушка с «/»: ' + c.firstElementChild.getAttribute('data-tedui-ph'));
    }
    ok(cols[0].firstElementChild.contains(getSelection().anchorNode) || getSelection().anchorNode === cols[0].firstElementChild, 'курсор в первой колонке');
    ed.updateState();
    ok(ed.columns.addBtn.classList.contains('is-visible'));
    eq(ed.columns.addBtn.textContent, 'Добавить колонку');
  });

  test('«Добавить колонку» — до четырёх; потом кнопка скрыта; у двух колонок корзины нет', async () => {
    const ed = make(COLS('<p>а</p>', '<p>б</p>') + '<p>после</p>', {}, { width: 1000 });
    caret(ed, ed.editable.querySelector('.ted-columns__col p'));
    ok(ed.handle.itemTrash.hidden, 'две колонки — без корзины');
    ed.columns.addBtn.click();
    ed.updateState();
    ed.columns.addBtn.click();
    ed.updateState();
    const el = ed.editable.querySelector('.ted-columns');
    eq(el.querySelectorAll(':scope > .ted-columns__col').length, 4);
    ok(el.classList.contains('ted-columns--4'));
    ok(!ed.columns.addBtn.classList.contains('is-visible'), 'четыре — кнопка скрыта');
    ok(!ed.handle.itemTrash.hidden, 'корзина у колонки');
    ed.exec('undo');
    eq(ed.editable.querySelectorAll('.ted-columns__col').length, 3);
  });

  test('кнопки колонки ⠿ 🗑 — над её правым верхним углом (в углу колонки кнопки картинки); корзина удаляет колонку, Undo возвращает', () => {
    const ed = make(COLS('<p>а</p>', '<p>б</p>', '<p>в</p>') + '<p>после</p>', {}, { width: 1000 });
    const col = ed.editable.querySelectorAll('.ted-columns__col')[1];
    caret(ed, col.querySelector('p'));
    eq(ed.handle.item, col);
    const c = ed.handle.itemControls.getBoundingClientRect();
    const r = col.getBoundingClientRect();
    ok(c.bottom <= r.top + 1 && Math.abs(c.right - r.right) <= 1, 'над правым верхним углом колонки');
    ed.handle.removeItem(col);
    eq(ed.editable.querySelectorAll('.ted-columns__col').length, 2);
    ok(/ted-columns--2/.test(html(ed)));
    ed.exec('undo');
    eq(ed.editable.querySelectorAll('.ted-columns__col').length, 3);
  });

  test('Backspace в начале колонки и Delete в конце не склеивают соседние колонки', () => {
    const ed = make(COLS('<p>а</p>', '<p>б</p>') + '<p>после</p>');
    const [a, b] = ed.editable.querySelectorAll('.ted-columns__col p');
    caret(ed, b, false);
    ok(key(ed, 'Backspace'));
    caret(ed, a, true);
    ok(key(ed, 'Delete'));
    eq(ed.editable.querySelectorAll('.ted-columns__col').length, 2);
    ok(/<p>а<\/p>[\s\S]*<p>б<\/p>/.test(html(ed)));
  });

  test('в колонке работает меню блоков, но без фона и контейнеров (аккордеон, вкладки, колонки, содержание)', () => {
    const ed = make(COLS('<p>а</p>', '<p><br></p>') + '<p>после</p>');
    const p = ed.editable.querySelectorAll('.ted-columns__col p')[1];
    caret(ed, p);
    ed.blockMenu.openPicker(p);
    const types = [...document.querySelectorAll('.ted-ui-tile')].map((t) => t.dataset.type);
    ok(types.includes('h2') && types.includes('image'), types.join());
    ok(!['background', 'accordion', 'tabs', 'columns', 'toc'].some((t) => types.includes(t)), types.join());
    ed.blockMenu.closePicker();
  });
});

group('Колонки: сетка и вид', () => {
  const grid = (ed) => getComputedStyle(ed.editable.querySelector('.ted-columns')).gridTemplateColumns.split(' ').length;
  test('1000: колонки в ряд (4), между колонками 16; 768: не больше двух в ряд, 12; 414: одна под другой, 20', () => {
    const src = COLS('<p>а</p>', '<p>б</p>', '<p>в</p>', '<p>г</p>');
    const wide = make(src, {}, { width: 1000 });
    eq(grid(wide), 4);
    eq(getComputedStyle(wide.editable.querySelector('.ted-columns')).columnGap, '16px');
    const tab = make(src, {}, { width: 768 });
    eq(grid(tab), 2);
    eq(getComputedStyle(tab.editable.querySelector('.ted-columns')).columnGap, '12px');
    const phone = make(src, {}, { width: 414 });
    eq(grid(phone), 1);
    eq(getComputedStyle(phone.editable.querySelector('.ted-columns')).rowGap, '20px');
  });

  test('вид: заголовок h6 16 / 700, текст 13, блоки в колонке — отступы как в статье (заказчик 22.11)', () => {
    const ed = make(COLS('<h6>Заголовок</h6><p>Текст</p>', '<p>б</p>'), {}, { width: 1000 });
    const h = getComputedStyle(ed.editable.querySelector('.ted-columns__col h6'));
    eq([h.fontSize, h.fontWeight, h.marginTop, h.marginBottom].join(' '), '16px 700 20px 20px', 'как в статье и в аккордеоне');
    eq(getComputedStyle(ed.editable.querySelector('.ted-columns__col p')).fontSize, '13px');
  });
});

// ---- блок полностью в папке (отвязка ядра, 21.11): ядро и общий код контейнеров спрашивают реестр ----
group('Колонки: точки подключения реестра', () => {
  const COLS = (...cols) => `<div class="ted-columns ted-columns--${cols.length}">${cols.map((c) => `<div class="ted-columns__col">${c}</div>`).join('')}</div>`;

  test('editorUi: editor.columns в blockUis; container — последним под ним строка текста', () => {
    const ed = make(COLS('<p>А</p>', '<p>Б</p>'));
    ok(ed.columns && ed.blockUis.includes(ed.columns));
    eq(blocks(ed).map((b) => b.tagName).join(','), 'DIV,P');
    ed.destroy();
  });

  test('unnest: колонки в ответе аккордеона раскрываются — блоки колонок подряд', () => {
    const out = Ted.clean('<div class="ted-accordion"><details class="ted-accordion__item"><summary class="ted-accordion__q">В</summary><div class="ted-accordion__a"><div class="ted-accordion__body">' + COLS('<p>А</p>', '<p>Б</p>') + '</div></div></details></div>');
    ok(!out.includes('ted-columns') && /<p>А<\/p>\s*<p>Б<\/p>/.test(out), out);
  });

  test('canRemove, itemAbove, itemRemoved, itemCaret, removedToast: у двух колонок корзины нет; из трёх — удаляется, класс 2, курсор в первую строку соседней', async () => {
    const ed = make(COLS('<p>А</p>', '<p>Б</p>', '<p>В</p>'));
    const cols = ed.editable.querySelectorAll('.ted-columns__col');
    const p = cols[0].querySelector('p');
    const r = document.createRange(); r.selectNodeContents(p); r.collapse(false);
    ed.editable.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    ed.updateState();
    await wait(30);
    eq(ed.listItem(p.firstChild), cols[0], 'колонка под курсором');
    eq(ed.handle.itemControls.dataset.place, 'card', 'кнопки над правым верхним углом');
    ok(!ed.handle.itemTrash.hidden, 'из трёх — корзина есть');
    const said = [];
    ed.toast = (text) => { said.push(text); return null; };
    ed.handle.removeItem(cols[0]);
    await wait(30);
    const el = ed.editable.querySelector('.ted-columns');
    eq(el.className, 'ted-columns ted-columns--2');
    eq(said.join('|'), 'Колонка удалена');
    const s = getSelection().getRangeAt(0).startContainer;
    eq((s.nodeType === 1 ? s : s.parentNode).closest('p')?.textContent, 'Б', 'курсор в первую строку соседней колонки');
    ed.handle.removeItem(el.querySelector('.ted-columns__col'));
    eq(ed.editable.querySelectorAll('.ted-columns__col').length, 2, 'меньше двух — нельзя');
    ed.destroy();
  });
});
