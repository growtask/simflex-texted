// Тесты формул таблицы (blocks/table, этап 5) — прежние tests/formula.test.js, перенесены без изменений.
// Формулы в таблице (этап 6.1б): разборщик, вычисление, ссылки при правке структуры, очистка, правка в ячейке, протягивание.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, html, Ted } from '../../tests/helpers.js';
import { computeGrid, resultText, shiftFormula, parseCellValue, formulaAllowed, formatValue } from './formula.js';
import { tableRows, moveRow, moveColumn, addRow, removeRow, removeColumn, addColumn } from './table.js';

const grid = (rows) => rows.map((r) => r.map((x) => (String(x).startsWith('=') ? { formula: x, text: '' } : { text: String(x) })));
const calc = (rows) => { const m = computeGrid(grid(rows)); const o = {}; for (const [k, v] of m) o[k] = resultText(v); return o; };
const nb = (s) => s.replace(/ /g, ' ');

group('Формулы: вычисление', () => {
  test('СУММ, СРЗНАЧ, МИН, МАКС, СЧЁТ, ОКРУГЛ и английские имена; «;» и «,» между аргументами', () => {
    const o = calc([['10', '20', '30', '=СУММ(A1:C1)', '=SUM(A1:C1)', '=СРЗНАЧ(A1:C1)', '=МИН(A1;B1;C1)', '=MAX(A1,C1)', '=СЧЁТ(A1:C1)', '=ОКРУГЛ(2,555;2)']]);
    eq([o['0:3'], o['0:4'], o['0:5'], o['0:6'], o['0:7'], o['0:8'], o['0:9']].join(' '), '60 60 20 10 30 3 2,56');
  });

  test('арифметика, скобки, унарный минус, проценты', () => {
    const o = calc([['=(1+2)*3-4/2', '=-5+2', '=200*15%', '=10/4']]);
    eq([o['0:0'], o['0:1'], o['0:2'], o['0:3']].join(' '), '7 -3 30 2,5');
  });

  test('числа по-русски и рубли: «12 500 ₽» × 2 = «25 000 ₽», сумма рублей — в рублях', () => {
    const o = calc([['12 500 ₽', '2', '=A1*B1'], ['3 200,50 ₽', '1', '=A2*B2'], ['', '', '=СУММ(C1:C2)']]);
    eq([nb(o['0:2']), nb(o['1:2']), nb(o['2:2'])].join(' | '), '25 000 ₽ | 3 200,5 ₽ | 28 200,5 ₽');
  });

  test('проценты в ячейках: «15%» × 1 000 = 150; доля в процентах', () => {
    const o = calc([['15%', '1 000', '=A1*B1', '=A1+5%']]);
    eq([nb(o['0:2']), o['0:3']].join(' '), '150 20%');
  });

  test('ошибки: #ДЕЛ/0!, #ССЫЛКА!, #ЦИКЛ!, #ОШИБКА! (синтаксис, текст в арифметике)', () => {
    const o = calc([['=1/0', '=K1', '=C1', '=C1'], ['=СУММ(', 'текст', '=B2*2', '=СУММ(A1:A1']]);
    eq(o['0:0'], '#ДЕЛ/0!');
    eq(o['0:1'], '#ССЫЛКА!', 'столбца K нет в таблице');
    eq([o['0:2'], o['0:3']].join(' '), '#ЦИКЛ! #ЦИКЛ!');
    eq([o['1:0'], o['1:2'], o['1:3']].join(' '), '#ОШИБКА! #ОШИБКА! #ОШИБКА!');
  });

  test('пустые ячейки: в арифметике — 0, в СУММ / СЧЁТ / СРЗНАЧ пропускаются; текст в диапазоне пропускается', () => {
    const o = calc([['4', '', 'текст', '=A1+B1', '=СЧЁТ(A1:C1)', '=СРЗНАЧ(A1:C1)']]);
    eq([o['0:3'], o['0:4'], o['0:5']].join(' '), '4 1 4');
  });

  test('сдвиг при протягивании: относительные ссылки сдвигаются, $ — нет', () => {
    eq(shiftFormula('=A1+$B$2+B$3+$C4+СУММ(A1:A3)', 2, 1), '=B3+$B$2+C$3+$C6+СУММ(B3:B5)');
    eq(shiftFormula('=A1', -1, 0), '=#ССЫЛКА!', 'выше первой строки');
  });

  test('значения ячеек и формат: русская запятая, неразрывные пробелы, ₽ и %', () => {
    eq(JSON.stringify(parseCellValue('2 490 ₽')), '{"v":2490,"unit":"₽"}');
    eq(JSON.stringify(parseCellValue('−3,5')), '{"v":-3.5,"unit":""}');
    eq(nb(formatValue(1234567.891)), '1 234 567,891');
    eq(nb(formatValue(0.1 + 0.2)), '0,3', 'без хвоста 0,30000000000000004');
    eq(nb(formatValue(0.125, '%')), '12,5%');
  });

  test('проверка формулы для сохранения: допустимые знаки и длина', () => {
    ok(formulaAllowed('=СУММ(A1:B2)*2%'));
    ok(!formulaAllowed('=alert("x")'), 'кавычки');
    ok(!formulaAllowed('=<img>'));
    ok(!formulaAllowed('SUM(A1)'), 'без «=»');
    ok(!formulaAllowed('=' + '1'.repeat(600)), 'длинная');
  });
});

const T = (body, cols = 3) => `<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="${cols}"><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody>${body}</tbody></table></div></figure><p>после</p>`;

group('Формулы: правка структуры таблицы', () => {
  const fig = (ed) => ed.editable.querySelector('figure.ted-table');
  const f = (ed, r, c) => tableRows(fig(ed))[r].cells[c].getAttribute('data-formula');

  test('перестановка строк и столбцов переписывает ссылки', () => {
    const ed = make(T('<tr><td>1</td><td>2</td><td data-formula="=A2+B2">3</td></tr><tr><td>5</td><td>6</td><td data-formula="=СУММ(A2:A3)">6</td></tr>'));
    moveRow(fig(ed), 1, 2);
    eq(f(ed, 2, 2), '=A3+B3', 'строка переехала — ссылки за ней');
    eq(f(ed, 1, 2), '=СУММ(A3:A2)', 'диапазон следит за строками');
    moveColumn(fig(ed), 0, 1);
    eq(f(ed, 2, 2), '=B3+A3');
  });

  test('вставка строки и столбца сдвигает ссылки; удаление ячейки, на которую ссылаются, — #ССЫЛКА!, диапазон сужается', () => {
    const ed = make(T('<tr><td>1</td><td>2</td><td data-formula="=B2">2</td></tr><tr><td>3</td><td>4</td><td data-formula="=СУММ(A2:A3)">4</td></tr><tr><td>7</td><td>8</td><td data-formula="=A3*2">6</td></tr>'));
    addRow(fig(ed), 0);   // новая первая строка тела
    eq(f(ed, 4, 2), '=A4*2');
    eq(f(ed, 3, 2), '=СУММ(A3:A4)');
    removeRow(fig(ed), 2);   // строка, с которой начинался диапазон
    eq(f(ed, 2, 2), '=СУММ(A3:A3)', 'удалили начало диапазона — диапазон сузился');
    eq(f(ed, 3, 2), '=A3*2');
    const ed2 = make(T('<tr><td>1</td><td>2</td><td data-formula="=B2*2">4</td></tr>'));
    removeColumn(fig(ed2), 1);
    eq(f(ed2, 1, 1), '=#ССЫЛКА!*2', 'удалили столбец, на который ссылались');
    addColumn(fig(ed2), 0);
    eq(f(ed2, 1, 2), '=#ССЫЛКА!*2');
  });

  test('шапка: строка с формулой, ставшая шапкой при перестановке, не теряет формулу', () => {
    const ed = make(T('<tr><td>1</td><td>2</td><td data-formula="=A2+B2">3</td></tr>'));
    moveRow(fig(ed), 1, 0);
    eq(f(ed, 0, 2), '=A1+B1');
    eq(tableRows(fig(ed))[0].cells[2].tagName, 'TH');
  });
});

group('Формулы: очистка HTML', () => {
  test('data-formula сохраняется у ячейки; опасная или чужая — отбрасывается, число остаётся', () => {
    const ok1 = Ted.clean(T('<tr><td>1</td><td>2</td><td data-formula="=A2+B2">3</td></tr>'));
    ok(/<td data-formula="=A2\+B2">3<\/td>/.test(ok1), ok1);
    const bad = Ted.clean(T('<tr><td data-formula="=HYPERLINK(&quot;javascript:x&quot;)">1</td><td data-formula="javascript:alert(1)">2</td><td data-formula="=1&quot; onclick=&quot;x">3</td></tr>'));
    ok(!/data-formula|javascript|onclick/.test(bad), bad);
  });
});

group('Формулы: правка в ячейке', () => {
  function caret(ed, cell, atEnd = true) {
    ed.editable.focus();
    const r = document.createRange();
    r.selectNodeContents(cell);
    r.collapse(!atEnd);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
  }
  const key = (ed, k, o = {}) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }); ed.editable.dispatchEvent(e); return e.defaultPrevented; };
  const BODY = '<tr><td>12 500 ₽</td><td>2</td><td><br></td></tr><tr><td>3 200 ₽</td><td>6</td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr>';

  test('«=» открывает список функций под ячейкой; буквы фильтруют; Enter вставляет «=СУММ(»', async () => {
    const ed = make(T(BODY));
    const cell = tableRows(ed.editable.querySelector('figure.ted-table'))[3].cells[0];
    caret(ed, cell, false);
    document.execCommand('insertText', false, '=');
    ed.updateState();
    const pop = () => document.querySelector('.ted-ui-pop--formula');
    ok(pop(), 'список открыт');
    eq([...pop().querySelectorAll('.ted-ui-item')].length, 6);
    document.execCommand('insertText', false, 'с');
    ed.updateState();
    eq([...pop().querySelectorAll('.ted-ui-item')].map((i) => i.dataset.value).join(','), 'СУММ,СРЗНАЧ,СЧЁТ');
    key(ed, 'Enter');
    eq(cell.textContent, '=СУММ(');
    ok(!ed.popover.isOpen, 'список закрыт');
  });

  test('клик по ячейке после «(» вставляет её адрес, протяжка — диапазон; Enter — результат в ячейке и в HTML', async () => {
    const ed = make(T(BODY));
    const rows = tableRows(ed.editable.querySelector('figure.ted-table'));
    const cell = rows[3].cells[0];
    caret(ed, cell, false);
    document.execCommand('insertText', false, '=СУММ(');
    ed.updateState();
    const a = rows[1].cells[0]; const b = rows[2].cells[0];
    const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', clientX: ra.left + 4, clientY: ra.top + 4 }));
    eq(cell.textContent, '=СУММ(A2');
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: rb.left + 4, clientY: rb.top + 4 }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));
    eq(cell.textContent, '=СУММ(A2:A3');
    ok(document.querySelector('.ted-ui-tablemask.is-visible'), 'маска диапазона');
    document.execCommand('insertText', false, ')');
    ed.updateState();
    ok(key(ed, 'Enter'));
    ed.updateState();
    eq(nb(cell.textContent), '15 700 ₽', 'в ячейке — результат');
    ok(/<td data-formula="=СУММ\(A2:A3\)">15&nbsp;700&nbsp;₽<\/td>/.test(html(ed)), html(ed));
  });

  test('в ячейке с курсором — формула, в HTML — результат; правка числа сразу пересчитывает', () => {
    const ed = make(T('<tr><td>1</td><td>2</td><td data-formula="=A2+B2">3</td></tr>'));
    const rows = tableRows(ed.editable.querySelector('figure.ted-table'));
    caret(ed, rows[1].cells[2]);
    eq(rows[1].cells[2].textContent, '=A2+B2', 'видна формула');
    ok(/<td data-formula="=A2\+B2">3<\/td>/.test(html(ed)), 'сохраняется результат');
    caret(ed, rows[1].cells[0]);
    eq(rows[1].cells[2].textContent, '3', 'ушли — результат');
    document.execCommand('selectAll');
    caret(ed, rows[1].cells[0]);
    rows[1].cells[0].textContent = '10';
    ed.afterChange({ immediate: true });
    eq(rows[1].cells[2].textContent, '12', 'пересчитано');
  });

  test('ошибка формулы видна в правке красным (states/error), на сайте — текстом', () => {
    const ed = make(T('<tr><td>1</td><td>0</td><td data-formula="=A2/B2">0</td></tr>'));
    const rows = tableRows(ed.editable.querySelector('figure.ted-table'));
    caret(ed, rows[1].cells[0]);
    eq(rows[1].cells[2].textContent, '#ДЕЛ/0!');
    eq(getComputedStyle(rows[1].cells[2]).color, 'rgb(204, 41, 41)');
    ok(/#ДЕЛ\/0!/.test(html(ed)) && !/data-tedui/.test(html(ed)));
  });

  test('протягивание: квадрат в углу ячейки, маска растёт, формулы копируются со сдвигом; Escape отменяет', async () => {
    const body = '<tr><td>12 500 ₽</td><td>2</td><td data-formula="=A2*B2">25 000 ₽</td></tr><tr><td>3 200 ₽</td><td>6</td><td><br></td></tr><tr><td>990 ₽</td><td>3</td><td><br></td></tr>';
    const ed = make(T(body), {}, { width: 1000 });
    const rows = tableRows(ed.editable.querySelector('figure.ted-table'));
    caret(ed, rows[1].cells[2]);
    const fill = ed.table.formulas.fill;
    ok(fill.classList.contains('is-visible'), 'квадрат у ячейки с формулой');
    const fr = fill.getBoundingClientRect();
    const cr = rows[1].cells[2].getBoundingClientRect();
    ok(Math.abs(fr.left + fr.width / 2 - cr.right) < 2 && Math.abs(fr.top + fr.height / 2 - cr.bottom) < 2, 'в правом нижнем углу');
    const target = rows[3].cells[2].getBoundingClientRect();
    const ev = (type, x, y) => fill.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y }));
    ev('pointerdown', fr.left + 4, fr.top + 4);
    ev('pointermove', target.left + 10, target.top + 10);
    const mask = ed.table.formulas.fillMask;
    ok(mask.classList.contains('is-visible'), 'маска видна');
    ok(/left/.test(getComputedStyle(mask).transitionProperty) && /height/.test(getComputedStyle(mask).transitionProperty), 'маска растёт плавно');
    ok(Math.abs(parseFloat(mask.style.height) - (target.bottom - cr.top)) < 2, 'маска до последней ячейки');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    ok(!rows[2].cells[2].hasAttribute('data-formula'), 'Escape — ничего не заполнено');
    caret(ed, rows[1].cells[2]);
    const fr2 = fill.getBoundingClientRect();
    ev('pointerdown', fr2.left + 4, fr2.top + 4);
    ev('pointermove', target.left + 10, target.top + 10);
    ev('pointerup', target.left + 10, target.top + 10);
    await wait(10);
    eq([2, 3].map((r) => rows[r].cells[2].getAttribute('data-formula')).join(' '), '=A3*B3 =A4*B4');
    eq(nb(rows[3].cells[2].textContent), '2 970 ₽');
    ed.exec('undo');
    ok(!tableRows(ed.editable.querySelector('figure.ted-table'))[3].cells[2].hasAttribute('data-formula'), 'Undo убирает протянутое');
  });

  test('протягивание простого значения вправо копирует текст', async () => {
    const ed = make(T('<tr><td>Да</td><td><br></td><td><br></td></tr>'), {}, { width: 1000 });
    const rows = tableRows(ed.editable.querySelector('figure.ted-table'));
    caret(ed, rows[1].cells[0]);
    const fill = ed.table.formulas.fill;
    const fr = fill.getBoundingClientRect();
    const t = rows[1].cells[2].getBoundingClientRect();
    const ev = (type, x, y) => fill.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y }));
    ev('pointerdown', fr.left + 4, fr.top + 4);
    ev('pointermove', t.left + 10, t.top + 10);
    ev('pointerup', t.left + 10, t.top + 10);
    await wait(10);
    eq([...rows[1].cells].map((c) => c.textContent).join('|'), 'Да|Да|Да');
  });

  test('протягивание по диагонали заполняет прямоугольник: формулы со сдвигом по строкам и столбцам (заказчик 17.11)', async () => {
    const ed = make(T('<tr><td>1</td><td>2</td><td><br></td><td><br></td></tr><tr><td>3</td><td>4</td><td><br></td><td><br></td></tr><tr><td data-formula="=A2+1">2</td><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td><td><br></td></tr>'), {}, { width: 1000 });
    const rows = tableRows(ed.editable.querySelector('figure.ted-table'));
    caret(ed, rows[3].cells[0]);
    const fill = ed.table.formulas.fill;
    const fr = fill.getBoundingClientRect();
    const t = rows[4].cells[1].getBoundingClientRect();
    const ev = (type, x, y) => fill.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y }));
    ev('pointerdown', fr.left + 4, fr.top + 4);
    ev('pointermove', t.left + 10, t.top + 10);
    const mask = ed.table.formulas.fillMask;
    const a = rows[3].cells[0].getBoundingClientRect();
    ok(Math.abs(parseFloat(mask.style.width) - (t.right - a.left)) < 2 && Math.abs(parseFloat(mask.style.height) - (t.bottom - a.top)) < 2, 'маска — прямоугольник 2×2');
    ev('pointerup', t.left + 10, t.top + 10);
    await wait(10);
    eq([[3, 1], [4, 0], [4, 1]].map(([r, c]) => rows[r].cells[c].getAttribute('data-formula')).join(' '), '=B2+1 =A3+1 =B3+1');
    eq([[3, 1], [4, 0], [4, 1]].map(([r, c]) => rows[r].cells[c].textContent).join(' '), '3 4 5');
  });

  test('квадрат протягивания перетаскивается пальцем (touch-action: none, зона 24)', () => {
    const ed = make(T(BODY), {}, { width: 1000 });
    const fill = ed.table.formulas.fill;
    eq(getComputedStyle(fill).touchAction, 'none');
    eq(getComputedStyle(fill, '::before').left, '-8px');
  });
});
