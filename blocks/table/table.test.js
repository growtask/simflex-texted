// Тесты блока «Таблица» (blocks/table, этап 5) — прежние tests/table.test.js, перенесены без изменений.
import './formula.test.js';   // формулы таблицы — отдельным файлом
// Блок «Таблица» (этап 6.1): разметка, очистка, правка, клавиши, меню ручки, вставка из Excel, вид по макету block-table.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { blockDef } from '../../resources/js/core/registry.js';
import { make, blocks, html, Ted } from '../../tests/helpers.js';
import { tableRows, moveRow, moveColumn } from './table.js';

const clean = (src) => Ted.clean(src);
const T3 = '<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="3"><thead><tr><th>Тариф</th><th>Цена</th><th>Срок</th></tr></thead><tbody><tr><td>Базовый</td><td>990 ₽</td><td>1 мес</td></tr><tr><td>Про</td><td>2 490 ₽</td><td>3 мес</td></tr></tbody></table></div><figcaption>Цены</figcaption></figure>';

function key(ed, k, opts = {}) {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts });
  ed.editable.dispatchEvent(e);
  return e.defaultPrevented;
}
function caretIn(el, atEnd = true) {
  el.closest('[contenteditable]')?.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  const s = document.getSelection();
  s.removeAllRanges();
  s.addRange(r);
  document.dispatchEvent(new Event('selectionchange'));
}
const cellText = (fig) => tableRows(fig).map((tr) => [...tr.cells].map((c) => c.textContent).join('|')).join('/');

group('Таблица: разметка и очистка (JS)', () => {
  test('наш блок сохраняется как есть: figure.ted-table > обёртка > table[data-cols] с thead / tbody и подписью', () => {
    eq(clean(T3), T3);
  });

  test('старая таблица TinyMCE без объединённых ячеек становится блоком: шапка из th, стили и лишние теги убираются, форматирование текста и ссылки остаются', () => {
    const out = clean('<table border="1" style="width:100%"><tr><th style="color:red">А</th><th>Б</th></tr><tr><td><b>жирный</b> <i>курсив</i></td><td><a href="https://ex.com" onclick="x()">ссылка</a></td></tr></table>');
    eq(out, '<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="2"><thead><tr><th>А</th><th>Б</th></tr></thead><tbody><tr><td><strong>жирный</strong> <em>курсив</em></td><td><a href="https://ex.com">ссылка</a></td></tr></tbody></table></div></figure>');
  });

  test('таблица с объединёнными ячейками остаётся «сырым» блоком (как раньше)', () => {
    const out = clean('<table><tr><td colspan="2">слито</td></tr><tr><td>а</td><td>б</td></tr></table>');
    ok(/<table>.*colspan="2"/.test(out) && !/ted-table/.test(out), out);
  });

  test('строки неравной длины дополняются пустыми ячейками; пустая подпись не сохраняется; без границ — ted-table--plain', () => {
    const out = clean('<figure class="ted-table ted-table--plain"><div class="ted-table__wrap"><table><tbody><tr><td>1</td></tr><tr><td>2</td><td>3</td></tr></tbody></table></div><figcaption> </figcaption></figure>');
    eq(out, '<figure class="ted-table ted-table--plain"><div class="ted-table__wrap"><table data-cols="2"><tbody><tr><td>1</td><td></td></tr><tr><td>2</td><td>3</td></tr></tbody></table></div></figure>');
  });

  test('больше 10 столбцов — «сырой» блок (не ломаем таблицу)', () => {
    const row = `<tr>${'<td>x</td>'.repeat(11)}</tr>`;
    ok(!/ted-table/.test(clean(`<table>${row}</table>`)));
  });
});

group('Таблица: правка', () => {
  test('из меню блоков — таблица 3 × 3 с шапкой, курсор в первой ячейке; кнопки строки, столбца и «Добавить …» видны', async () => {
    const ed = make('<p>до</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    await wait(20);
    document.querySelector('.ted-ui-tile[data-type="table"]').click();
    await wait(30);
    const fig = ed.editable.querySelector('figure.ted-table');
    ok(fig, 'блок вставлен');
    eq(tableRows(fig).length, 3);
    eq(fig.querySelectorAll('thead th').length, 3, 'шапка включена');
    ed.table.sync();
    ok(ed.table.addBar.classList.contains('is-visible'), '«Добавить строку / столбец» видны');
    ok(ed.table.rowCtl.classList.contains('is-visible') && ed.table.colCtl.classList.contains('is-visible'), 'кнопки строки и столбца');
    eq([...ed.table.addBar.querySelectorAll('button')].map((b) => b.textContent).join(' | '), 'Добавить строку | Добавить столбец');
  });

  test('кнопки строки — справа снаружи таблицы, кнопки столбца — над столбцом; значки 16', async () => {
    const ed = make(T3, {}, { width: 1000 });
    const td = ed.editable.querySelector('tbody td');
    caretIn(td);
    ed.updateState();
    const wr = ed.editable.querySelector('.ted-table__wrap').getBoundingClientRect();
    const rr = ed.table.rowCtl.getBoundingClientRect();
    const cr = ed.table.colCtl.getBoundingClientRect();
    ok(rr.left >= wr.right + 6, `строка снаружи справа: ${rr.left} >= ${wr.right}`);
    ok(cr.bottom <= wr.top, 'столбец над таблицей');
    eq(Math.round(ed.table.rowCtl.querySelector('svg').getBoundingClientRect().width), 16);
  });

  test('редактор стал уже (окно, поворот телефона) — кнопки строки и «Добавить …» едут вместе с таблицей', async () => {
    const ed = make(T3, {}, { width: 1000 });
    caretIn(ed.editable.querySelector('tbody td'));
    ed.updateState();
    let box = ed.editable;
    while (box && box.style.width !== '1000px') box = box.parentElement;
    box.style.width = '700px';
    window.dispatchEvent(new Event('resize'));   // в браузере ещё и ResizeObserver; в безоконном прогоне кадров нет
    await wait(10);
    const wr = ed.editable.querySelector('.ted-table__wrap').getBoundingClientRect();
    const rr = ed.table.rowCtl.getBoundingClientRect();
    const cap = ed.editable.querySelector('figcaption').getBoundingClientRect();
    ok(Math.abs(rr.left - (wr.right + 8)) < 1.5 || Math.abs(rr.right - wr.right) < 1.5, `строка у края таблицы: ${rr.left} / ${wr.right}`);
    ok(Math.abs(ed.table.addBar.getBoundingClientRect().top - (cap.bottom + 20)) < 1.5, '«Добавить …» на 20 ниже подписи');
  });

  test('«Добавить строку» и «Добавить столбец»; больше 10 столбцов нельзя', () => {
    const ed = make(T3);
    caretIn(ed.editable.querySelector('tbody td'));
    ed.updateState();
    ed.table.add('row');
    const fig = ed.editable.querySelector('figure.ted-table');
    eq(tableRows(fig).length, 4);
    for (let i = 0; i < 10; i += 1) ed.table.add('col');
    eq(tableRows(fig)[0].cells.length, 10, 'столбцов не больше 10');
    eq(fig.querySelector('table').getAttribute('data-cols'), '10');
  });

  test('корзины удаляют строку и столбец; последнюю строку не удалить', () => {
    const ed = make(T3);
    const fig = ed.editable.querySelector('figure.ted-table');
    caretIn(tableRows(fig)[1].cells[1]);
    ed.updateState();
    ed.table.remove('row');
    eq(cellText(fig), 'Тариф|Цена|Срок/Про|2 490 ₽|3 мес');
    caretIn(tableRows(fig)[1].cells[1]);
    ed.updateState();
    ed.table.remove('col');
    eq(cellText(fig), 'Тариф|Срок/Про|3 мес');
  });

  test('перестановка строк и столбцов (как ручкой ⠿): шапка остаётся шапкой', () => {
    const ed = make(T3);
    const fig = ed.editable.querySelector('figure.ted-table');
    moveRow(fig, 2, 1);
    eq(cellText(fig), 'Тариф|Цена|Срок/Про|2 490 ₽|3 мес/Базовый|990 ₽|1 мес');
    moveColumn(fig, 0, 2);
    eq(cellText(fig), 'Цена|Срок|Тариф/2 490 ₽|3 мес|Про/990 ₽|1 мес|Базовый');
    moveRow(fig, 1, 0);
    eq(fig.querySelectorAll('thead th').length, 3, 'на месте шапки — строка с th');
    eq(fig.querySelector('thead').textContent, '2 490 ₽3 месПро');
  });

  test('перетаскивание строки за ⠿: строка едет за курсором, соседи плавно сдвигаются, рамка 2 px на 4 вокруг строки (как у шагов)', async () => {
    const ed = make(T3, {}, { width: 1000 });
    const fig = ed.editable.querySelector('figure.ted-table');
    caretIn(tableRows(fig)[1].cells[0]);
    ed.updateState();
    const grip = ed.table.rowCtl.querySelector('[data-act="row-grip"]');
    const g = grip.getBoundingClientRect();
    const rowR = tableRows(fig)[1].cells[0].getBoundingClientRect();
    const target = tableRows(fig)[2].getBoundingClientRect();
    const ev = (type, y) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: g.left + 4, clientY: y }));
    ev('pointerdown', g.top + 4);
    ev('pointermove', g.top + 4 + target.height);
    const moving = tableRows(fig)[1].cells[1];
    ok(/translateY\(/.test(moving.style.transform), 'строка едет за курсором (transform), а не прыгает в DOM');
    ok(/translateY\(-/.test(tableRows(fig)[2].cells[0].style.transform), 'соседняя строка сдвигается навстречу');
    ok(/transform/.test(getComputedStyle(tableRows(fig)[2].cells[0]).transitionProperty), 'сдвиг соседей с анимацией');
    eq(cellText(fig), 'Тариф|Цена|Срок/Базовый|990 ₽|1 мес/Про|2 490 ₽|3 мес', 'до отпускания DOM не меняется');
    const fr = ed.table.frame.getBoundingClientRect();
    const fcs = getComputedStyle(ed.table.frame);
    ok(ed.table.frame.classList.contains('is-visible'), 'рамка видна');
    eq([fcs.borderTopWidth, fcs.borderTopColor, fcs.borderTopLeftRadius].join(' '), '2px rgb(99, 161, 247) 12px', 'рамка main/color1/light 2 px, r12');
    const cur = tableRows(fig)[1].cells[0].getBoundingClientRect();
    ok(Math.abs(fr.top - (cur.top - 4)) < 1.5 && Math.abs(fr.height - (rowR.height + 8)) < 1.5, `рамка на 4 вокруг строки: ${fr.top} / ${cur.top}`);
    ev('pointerup', g.top + 4 + target.height);
    await wait(10);
    eq(cellText(fig), 'Тариф|Цена|Срок/Про|2 490 ₽|3 мес/Базовый|990 ₽|1 мес');
    ok(![...fig.querySelectorAll('th, td')].some((c) => c.style.transform), 'сдвиги сняты');
    ok(!ed.table.frame.classList.contains('is-visible'), 'рамка скрыта');
    ok(!/data-tedui|transform/.test(html(ed)), 'в сохранённом HTML нет служебных меток');
  });

  test('перетаскивание столбца за ⠿ над столбцом; Escape отменяет', async () => {
    const ed = make(T3, {}, { width: 1000 });
    const fig = ed.editable.querySelector('figure.ted-table');
    caretIn(tableRows(fig)[1].cells[0]);
    ed.updateState();
    const grip = ed.table.colCtl.querySelector('[data-act="col-grip"]');
    const g = grip.getBoundingClientRect();
    const w = tableRows(fig)[0].cells[0].getBoundingClientRect().width;
    const ev = (type, x) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: g.top + 4 }));
    ev('pointerdown', g.left + 4);
    ev('pointermove', g.left + 4 + w);
    ok(/translateX\(/.test(tableRows(fig)[0].cells[0].style.transform), 'столбец едет за курсором');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(10);
    eq(cellText(fig), 'Тариф|Цена|Срок/Базовый|990 ₽|1 мес/Про|2 490 ₽|3 мес', 'Escape — всё на месте');
    caretIn(tableRows(fig)[1].cells[0]);
    ed.updateState();
    const g2 = grip.getBoundingClientRect();
    const ev2 = (type, x) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: g2.top + 4 }));
    ev2('pointerdown', g2.left + 4);
    ev2('pointermove', g2.left + 4 + w);
    ev2('pointerup', g2.left + 4 + w);
    await wait(10);
    eq(cellText(fig), 'Цена|Тариф|Срок/990 ₽|Базовый|1 мес/2 490 ₽|Про|3 мес');
  });

  test('Tab — следующая ячейка, Shift+Tab — предыдущая, Tab в последней ячейке добавляет строку', () => {
    const ed = make(T3);
    const fig = ed.editable.querySelector('figure.ted-table');
    const cells = () => tableRows(fig).flatMap((tr) => [...tr.cells]);
    caretIn(cells()[0]);
    ok(key(ed, 'Tab'));
    ok(cells()[1].contains(document.getSelection().anchorNode), 'вторая ячейка');
    key(ed, 'Tab', { shiftKey: true });
    ok(cells()[0].contains(document.getSelection().anchorNode), 'назад в первую');
    caretIn(cells().at(-1));
    key(ed, 'Tab');
    eq(tableRows(fig).length, 4, 'новая строка');
  });

  test('Enter — следующая ячейка; в последней с текстом — новая строка ниже, в пустой последней — новый блок под таблицей; Shift+Enter — перенос в ячейке', () => {
    const ed = make(T3 + '<p>после</p>');
    const fig = ed.editable.querySelector('figure.ted-table');
    const cells = () => tableRows(fig).flatMap((tr) => [...tr.cells]);
    caretIn(cells()[0]);
    ok(key(ed, 'Enter'));
    ok(cells()[1].contains(document.getSelection().anchorNode), 'Enter — в следующую ячейку');
    eq(cells()[0].innerHTML, 'Тариф', 'текст ячейки не тронут');
    caretIn(cells()[3]);
    ok(key(ed, 'Enter', { shiftKey: true }));
    ok(cells()[3].querySelector('br'), 'Shift+Enter — перенос строки в ячейке');
    caretIn(cells().at(-1));
    key(ed, 'Enter');
    eq(tableRows(fig).length, 4, 'в последней ячейке с текстом — новая строка');
    ok(tableRows(fig)[3].cells[0].contains(document.getSelection().anchorNode), 'курсор в первой ячейке новой строки');
    key(ed, 'Enter');
    key(ed, 'Enter');
    ok(tableRows(fig)[3].cells[2].contains(document.getSelection().anchorNode), 'по пустым ячейкам новой строки');
    key(ed, 'Enter');
    eq(tableRows(fig).length, 3, 'пустая последняя строка убрана');
    eq(fig.nextElementSibling.tagName, 'P');
    ok(fig.nextElementSibling.contains(document.getSelection().anchorNode), 'курсор в новом блоке под таблицей');
    eq(fig.nextElementSibling.nextElementSibling.textContent, 'после', 'следующий абзац на месте');
  });

  test('Backspace в начале ячейки не склеивает ячейки; Enter в подписи — новый абзац', () => {
    const ed = make(T3);
    const fig = ed.editable.querySelector('figure.ted-table');
    caretIn(tableRows(fig)[1].cells[1], false);
    ok(key(ed, 'Backspace'), 'остановлен');
    eq(tableRows(fig)[1].cells.length, 3);
    caretIn(fig.querySelector('figcaption'));
    ok(key(ed, 'Enter'));
    eq(fig.nextElementSibling.tagName, 'P');
  });

  test('панель в ячейке: всё форматирование текста (Ж К Ч З код ссылка), без стиля, выравнивания и фона; Ctrl+I и код сохраняются', () => {
    const ed = make(T3);
    const td = ed.editable.querySelector('tbody td');
    caretIn(td);
    ed.updateState();
    const tb = ed.toolbar;
    ok(['bold', 'italic', 'underline', 'strike', 'code', 'link'].every((k) => !tb.marks[k].hidden), 'Ж К Ч З код ссылка видны');
    ok(tb.styleBtn.hidden && tb.alignBtn.hidden && tb.colorParts().canBgMenu, 'стиль и выравнивание скрыты; «Цвет» с фоном — есть (1.0.4)');
    const r = document.createRange();
    r.selectNodeContents(td.firstChild);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    key(ed, 'i', { code: 'KeyI', ctrlKey: true });
    ok(td.querySelector('em, i'), 'Ctrl+I делает курсив');
    eq(Ted.clean(html(ed)).match(/<td><em>Базовый<\/em><\/td>/)?.[0], '<td><em>Базовый</em></td>', 'курсив сохраняется');
    ok(/<td><code>x<\/code> <u>u<\/u> <s>s<\/s><\/td>/.test(Ted.clean(T3.replace('<td>1 мес</td>', '<td><code>x</code> <u>u</u> <s>s</s></td>'))), 'код, подчёркнутый, зачёркнутый в ячейке сохраняются');
  });

  test('заглушки «Заголовок», «Текст», «Описание»: видны в пустых ячейках, исчезают при вводе; курсор в начале ячейки, а не у рамки', () => {
    const ed = make('<p>до</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="table"]').click();
    const fig = ed.editable.querySelector('figure.ted-table');
    const th = fig.querySelector('th');
    const td = fig.querySelector('td');
    ed.updateState();
    eq([th.getAttribute('data-tedui-ph'), td.getAttribute('data-tedui-ph'), fig.querySelector('figcaption').getAttribute('data-tedui-ph')].join(' / '), 'Заголовок / Текст / Описание');
    const cs = getComputedStyle(th, '::before');
    eq([cs.content, cs.position, cs.left, cs.top].join(' '), '"Заголовок" absolute 8px 10px', 'заглушка поверх ячейки с её отступами');
    ok(getComputedStyle(th.querySelector('br')).display !== 'none', 'служебный <br> виден — у курсора есть строка');
    caretIn(th, false);
    document.execCommand('insertText', false, 'Тариф');
    ed.updateState();
    ok(!th.hasAttribute('data-tedui-ph'), 'заглушка исчезла после ввода');
    eq(th.textContent, 'Тариф');
    const caret = getSelection().getRangeAt(0).getBoundingClientRect();
    ok(caret.left > th.getBoundingClientRect().left + 8, 'курсор внутри ячейки, после текста');
  });

  test('меню ручки: «Убрать шапку» / «Добавить шапку», «Убрать границы» / «Показать границы»; «Превратить в…» нет', () => {
    const ed = make(T3);
    const fig = ed.editable.querySelector('figure.ted-table');
    const items = () => [...ed.popover.el.querySelectorAll('[data-value]')];
    ed.handle.openMenu(fig, ed.handle.ctrlGrip);
    eq(items().map((i) => i.dataset.value).slice(0, 2).join(','), 'table-head,table-borders');
    ok(!items().some((i) => i.dataset.value === 'convert'), 'нет «Превратить в…»');
    items().find((i) => i.dataset.value === 'table-head').click();
    ok(!fig.querySelector('thead'), 'шапка убрана');
    ed.handle.openMenu(fig, ed.handle.ctrlGrip);
    ok(items().find((i) => i.dataset.value === 'table-head').textContent.includes('Добавить шапку'));
    items().find((i) => i.dataset.value === 'table-borders').click();
    ok(fig.classList.contains('ted-table--plain'), 'границы убраны');
    ok(/ted-table--plain/.test(html(ed)));
  });

  test('вставка из Excel / Google Таблиц: в пустой абзац — таблица, в ячейку — заполнение вправо и вниз', () => {
    const ed = make('<p>до</p>');
    const p = document.createElement('p');   // пустой абзац, как после Enter (при загрузке пустые абзацы убираются)
    p.innerHTML = '<br>';
    blocks(ed)[0].after(p);
    caretIn(p);
    const dt = new DataTransfer();
    dt.setData('text/plain', 'А\tБ\n1\t2\n3\t4');
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    const fig = ed.editable.querySelector('figure.ted-table');
    ok(fig, 'таблица из вставки');
    eq(cellText(fig), 'А|Б/1|2/3|4');
    caretIn(tableRows(fig)[2].cells[1]);
    const dt2 = new DataTransfer();
    dt2.setData('text/html', '<table><tr><td><b>x</b></td><td>y</td></tr><tr><td>z</td><td>w</td></tr></table>');
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt2, bubbles: true, cancelable: true }));
    eq(cellText(fig), 'А|Б|/1|2|/3|x|y/|z|w', 'добавились столбец и строка');
    ok(tableRows(fig)[2].cells[1].querySelector('strong'), 'жирный сохранился');
  });

  test('«Код» при выделении, захватившем соседнюю ячейку (тройной клик), не ломает таблицу: код только в своей ячейке', () => {
    const ed = make(T3);
    const fig = ed.editable.querySelector('figure.ted-table');
    const a = tableRows(fig)[1].cells[0];
    const b = tableRows(fig)[1].cells[1];
    ed.editable.focus();
    const r = document.createRange();
    r.setStart(a.firstChild, 0);
    r.setEnd(b, 0);   // так выделяет тройной клик: до начала следующей ячейки
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.exec('code');
    eq(tableRows(fig).map((tr) => tr.cells.length).join(','), '3,3,3', 'в каждой строке по 3 ячейки');
    eq(a.innerHTML, '<code>Базовый</code>');
    eq(b.textContent, '990 ₽', 'соседняя ячейка не тронута');
    eq(cellText(fig), 'Тариф|Цена|Срок/Базовый|990 ₽|1 мес/Про|2 490 ₽|3 мес');
  });

  test('выделить всё и Delete: таблица удаляется вместе с обёрткой, остаётся пустой абзац без кнопок «Добавить …»', async () => {
    const ed = make(T3);
    ed.editable.focus();
    const r = document.createRange();
    r.selectNodeContents(ed.editable);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    document.execCommand('delete');
    ed.editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await wait(20);
    ed.updateState();
    ok(!ed.editable.querySelector('figure.ted-table:not(:has(table))'), 'нет пустой обёртки');
    ok(!ed.table.addBar.classList.contains('is-visible'), 'кнопок «Добавить …» нет');
    // то же, если браузер оставил обёртку без таблицы
    const ed2 = make(T3 + '<p>после</p>');
    const fig = ed2.editable.querySelector('figure.ted-table');
    fig.querySelector('.ted-table__wrap').remove();
    ed2.editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    await wait(20);
    ok(!ed2.editable.querySelector('figure'), 'обёртка без таблицы убрана');
    eq(ed2.editable.firstElementChild.tagName, 'P');
  });

  test('Undo после добавления строки возвращает таблицу', () => {
    const ed = make(T3);
    caretIn(ed.editable.querySelector('tbody td'));
    ed.updateState();
    ed.table.add('row');
    ed.exec('undo');
    eq(tableRows(ed.editable.querySelector('figure.ted-table')).length, 3);
  });
});

group('Таблица: вид по макету block-table', () => {
  const box = (theme) => make(T3, {}, { width: 760, theme });

  test('светлая: рамка 2 main/gray/lighter r8, шапка #EDF3FA / #262626, строки 13/1.5 #4D4D4D, ячейка 10 / 8, линии между строками', () => {
    const ed = box();
    const t = ed.editable.querySelector('table');
    const cs = getComputedStyle(t);
    eq([cs.borderTopWidth, cs.borderTopColor, cs.borderTopLeftRadius].join(' '), '2px rgb(237, 243, 250) 8px');
    const th = getComputedStyle(t.querySelector('th'));
    eq([th.backgroundColor, th.color, th.fontSize, th.fontWeight].join(' '), 'rgb(237, 243, 250) rgb(38, 38, 38) 13px 400');
    const td = getComputedStyle(t.querySelector('tbody td'));
    eq([td.color, td.lineHeight, td.paddingTop, td.paddingLeft].join(' '), 'rgb(77, 77, 77) 19.5px 10px 8px');
    eq(getComputedStyle(t.querySelectorAll('tbody tr')[1].cells[0]).borderTopWidth, '2px', 'линия между строками');
    eq(getComputedStyle(t.querySelector('tbody tr').cells[0]).borderTopWidth, '0px', 'под шапкой линии нет (шапка на подложке)');
  });

  test('столбцы не уже 120: 6 столбцов в колонке 480 прокручиваются вбок', () => {
    const six = T3.replace(/data-cols="3"/, 'data-cols="6"').replace(/<\/th><\/tr>/, '</th><th>4</th><th>5</th><th>6</th></tr>').replace(/<\/td><\/tr>/g, '</td><td>a</td><td>b</td><td>c</td></tr>');
    const ed = make(six, {}, { width: 560 });
    const wrap = ed.editable.querySelector('.ted-table__wrap');
    ok(wrap.scrollWidth > wrap.clientWidth, 'прокрутка');
    const thw = ed.editable.querySelector('th').getBoundingClientRect().width;
    ok(thw >= 119.5, `столбец не уже 120: ${thw}, таблица ${ed.editable.querySelector('table').getBoundingClientRect().width}, min ${getComputedStyle(ed.editable.querySelector('table')).minWidth}`);
  });

  test('линии 2 px между столбцами (решение заказчика) и между строками', () => {
    const ed = make(T3);
    const t = ed.editable.querySelector('table');
    const second = t.querySelector('tbody td + td');
    eq([getComputedStyle(second).borderLeftWidth, getComputedStyle(second).borderLeftColor].join(' '), '2px rgb(237, 243, 250)');
    eq(getComputedStyle(t.querySelector('tbody td')).borderLeftWidth, '0px', 'у первого столбца линии нет (рамка таблицы)');
  });

  test('широкая таблица: полоса прокрутки дизайн-системы на 12 ниже таблицы (data-ted-scroll), узкая — без отступа', () => {
    const six = T3.replace(/data-cols="3"/, 'data-cols="6"').replace(/<\/th><\/tr>/, '</th><th>4</th><th>5</th><th>6</th></tr>').replace(/<\/td><\/tr>/g, '</td><td>a</td><td>b</td><td>c</td></tr>');
    const ed = make(six, {}, { width: 560 });
    ed.table.measure();
    const wrap = ed.editable.querySelector('.ted-table__wrap');
    ok(wrap.hasAttribute('data-ted-scroll'), 'отмечена прокрутка');
    // Chrome: 6 отступ + 6 прозрачной рамки зоны захвата 20 px; Firefox: у полосы рамки нет — весь отступ 12
    const webkitBar = CSS.supports('selector(::-webkit-scrollbar)');
    eq(getComputedStyle(wrap).paddingBottom, webkitBar ? '6px' : '12px', '12 до видимой полосы');
    // заказчик 17.11: «полоса слишком тонкая» — видна 8 px, а ухватить можно в зоне 20 px
    if (webkitBar) eq(wrap.offsetHeight - wrap.clientHeight, 20, 'зона захвата полосы 20 px');   // Firefox: полоса браузера, своей зоны нет
    ok(!/data-ted-scroll/.test(html(ed)), 'отметка не сохраняется');
    const ed2 = make(T3, {}, { width: 1000 });
    ed2.table.measure();
    ok(!ed2.editable.querySelector('.ted-table__wrap').hasAttribute('data-ted-scroll'), 'узкая таблица — без отметки');
  });

  test('без границ: ни рамки, ни линий, подложка шапки остаётся', () => {
    const ed = make(T3.replace('class="ted-table"', 'class="ted-table ted-table--plain"'));
    const t = ed.editable.querySelector('table');
    eq(getComputedStyle(t).borderTopColor, 'rgba(0, 0, 0, 0)');
    eq(getComputedStyle(t.querySelectorAll('tbody tr')[1].cells[0]).borderTopColor, 'rgba(0, 0, 0, 0)');
    eq(getComputedStyle(t.querySelector('tbody td + td')).borderLeftColor, 'rgba(0, 0, 0, 0)', 'линий между столбцами нет');
    eq(getComputedStyle(t.querySelector('th')).backgroundColor, 'rgb(237, 243, 250)');
  });

  test('тёмная: рамка, шапка и линии #4D4D4D, шапка #FFF, строки #EDF3FA, подпись #DADFE5', () => {
    const ed = box('dark');
    const t = ed.editable.querySelector('table');
    eq(getComputedStyle(t).borderTopColor, 'rgb(77, 77, 77)');
    const th = getComputedStyle(t.querySelector('th'));
    eq([th.backgroundColor, th.color].join(' '), 'rgb(77, 77, 77) rgb(255, 255, 255)');
    eq(getComputedStyle(t.querySelector('tbody td')).color, 'rgb(237, 243, 250)');
    eq(getComputedStyle(ed.editable.querySelector('figcaption')).color, 'rgb(218, 223, 229)');
  });

  test('подпись как у изображений: text/t3 13 / 1.5 через 12 (как у медиа); пустая подпись в правке — заглушка «Описание»', () => {
    const ed = make(T3);
    const cap = ed.editable.querySelector('figcaption');
    const cs = getComputedStyle(cap);
    const mf = document.createElement('figure');   // подпись изображения в той же колонке
    mf.className = 'ted-media ted-media--image';
    mf.innerHTML = '<figcaption>Фото</figcaption>';
    cap.parentElement.after(mf);
    const media = getComputedStyle(mf.querySelector('figcaption'));
    eq([cs.fontSize, cs.lineHeight, cs.marginTop].join(' '), [media.fontSize, media.lineHeight, media.marginTop].join(' '), 'как у изображения');
    eq([cs.fontSize, cs.marginTop].join(' '), '13px 12px');
    const ed2 = make(T3.replace('<figcaption>Цены</figcaption>', ''));
    const empty = ed2.editable.querySelector('figcaption');
    ok(empty, 'в правке подпись есть всегда');
    ed2.updateState();
    eq(getComputedStyle(empty, '::before').content, '"Описание"');
    ok(!/figcaption/.test(html(ed2)), 'пустая подпись не сохраняется');
  });
});


// ---- блок полностью в папке (отвязка ядра, 21.11): ядро спрашивает реестр ----
group('Таблица: точки подключения реестра', () => {
  const T = '<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="2"><thead><tr><th>Тариф</th><th>Цена</th></tr></thead><tbody><tr><td>Базовый</td><td>990</td></tr></tbody></table></div></figure>';

  test('adopt / clean → false: простая чужая таблица — блок «Таблица»; с объединёнными ячейками — остаётся «сырым» HTML', () => {
    const simple = Ted.clean('<table><tr><td>А</td><td>Б</td></tr></table>');
    ok(/<figure class="ted-table/.test(simple), simple);
    const ed = make('<p>x</p>');
    ed.setHTML('<table><tr><td colspan="2">А</td></tr><tr><td>Б</td><td>В</td></tr></table>', { silent: true });
    ok(ed.editable.querySelector(':scope > .ted-ui-raw table') && !ed.editable.querySelector('figure.ted-table'), ed.editable.innerHTML.slice(0, 200));
    ed.destroy();
  });

  test('editorUi: editor.table в blockUis; blockMenu — «Добавить/Убрать шапку», «Убрать границы»; lockStyle в ячейке', async () => {
    const ed = make(T);
    ok(ed.table && ed.blockUis.includes(ed.table));
    const fig = ed.editable.querySelector('figure.ted-table');
    const items = blockDef('table').blockMenu(ed, fig, () => {}).filter((x) => x.dataset && x.dataset.value).map((x) => x.dataset.value);
    eq(items.join(','), 'table-head,table-borders');
    const td = fig.querySelector('td');
    const r = document.createRange(); r.selectNodeContents(td); r.collapse(false);
    ed.editable.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    ok(ed.table.lockStyle(), 'курсор в ячейке — стиль блока не действует');
    eq(blocks(ed).map((b) => b.tagName).join(','), 'FIGURE,P', 'lineAfter: под таблицей строка текста');
    ed.destroy();
  });

  test('toText: в наборе без таблицы — строки абзацами, ячейки через « · »', () => {
    eq(Ted.clean(T, { blocks: ['p'] }).replace(/>\s+</g, '><'), '<p>Тариф · Цена</p><p>Базовый · 990</p>');
  });
});
