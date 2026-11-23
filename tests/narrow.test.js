// Узкий редактор (уже 480: демо админки на телефоне, ~364): кнопки блока строкой над блоком.
// Замечания заказчика 17.11.2026: код, выноска, цитата, цветной фон, цифры, плюсы и минусы, Tab, курсор в таблице.
import { group, test, eq, ok, wait } from './harness.js';
import { make, html } from './helpers.js';

const W = 364;
const rect = (el) => el.getBoundingClientRect();
function caretIn(ed, el, atEnd = true) {
  ed.editable.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  ed.updateState();
}
function key(ed, k, opts = {}) {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts });
  ed.editable.dispatchEvent(e);
  return e.defaultPrevented;
}
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

group('Узкий редактор (364): кнопки и рамки как у остальных блоков', () => {
  test('выноска в фокусе: свои отступы не меняются (текст не едет), кнопки блока над выноской, а не на заголовке', () => {
    const ed = make('<p>a</p><blockquote class="ted-callout"><p><strong>Заголовок выноски</strong></p><p>Текст</p></blockquote><p>b</p>', {}, { width: W });
    const q = ed.editable.querySelector('blockquote');
    const pad = getComputedStyle(q).paddingTop;
    caretIn(ed, q.lastElementChild);
    eq(getComputedStyle(q).paddingTop, pad, 'отступ сверху прежний');
    ok(rect(ed.handle.controls).bottom <= rect(q).top + 0.5, 'кнопки над выноской');
  });

  test('карточка встраивания, товар, баннер (заказчик 17.11): кнопки блока над рамкой снаружи, не внутри; свой отступ не меняется', async () => {
    const blocks = [
      '<div class="ted-embed"><div class="ted-embed__head"><span class="ted-embed__avatar">GI</span><span class="ted-embed__who"><span class="ted-embed__name">AndreyTimofeevich - Overview</span><span class="ted-embed__sub">GitHub</span></span></div><div class="ted-embed__foot"><a class="ted-embed__open" href="https://github.com/">Открыть</a></div></div>',
      '<div class="ted-product"><span class="ted-product__img"></span><div class="ted-product__text"><p class="ted-product__name">Т</p><p class="ted-product__price"><span class="ted-product__now">1 ₽</span></p></div><a class="ted-product__btn" href="/t">Перейти</a></div>',
      '<div class="ted-button ted-button--banner"><div class="ted-button__text"><p class="ted-button__title">Заголовок</p><p class="ted-button__desc">Текст</p></div><a class="ted-button__btn" href="/a">Кнопка</a></div>',
    ];
    for (const b of blocks) {
      const ed = make('<p>a</p>' + b + '<p>b</p>', {}, { width: W });
      const el = ed.editable.children[1];
      const pad = getComputedStyle(el).paddingTop;
      ed.selectObject(el);
      ed.updateState();
      await wait(10);
      eq(ed.handle.focused, el, el.className);
      eq(getComputedStyle(el).paddingTop, pad, `${el.className}: отступ внутри рамки прежний`);
      ok(rect(ed.handle.controls).bottom <= rect(el).top + 0.5, `${el.className}: кнопки над рамкой`);
      el.setAttribute('data-tedui-drag', '');
      eq(getComputedStyle(el, '::after').top, '-8px', 'рамка вокруг блока, кнопки за рамкой');
      el.removeAttribute('data-tedui-drag');
    }
  });

  test('цитата: при перетаскивании рамка вокруг цитаты, кнопки за ней, «Добавить автора» не остаётся на месте', () => {
    const ed = make('<p>a</p><blockquote><p>Цитата</p></blockquote><p>b</p>', {}, { width: W });
    const q = ed.editable.querySelector('blockquote');
    caretIn(ed, q.firstElementChild);
    ok(rect(ed.handle.controls).bottom <= rect(q).top + 0.5, 'кнопки над цитатой');
    q.setAttribute('data-tedui-drag', '');
    ed.ui.classList.add('is-dragging');
    eq(getComputedStyle(q, '::after').top, '-8px', 'рамка вокруг цитаты, кнопки за рамкой');
    eq(getComputedStyle(ed.handle.authorBtn).opacity, '0', '«Добавить автора» скрыта, пока блок едет');
    ed.ui.classList.remove('is-dragging');
    q.removeAttribute('data-tedui-drag');
  });

  test('цветной фон: фон не растягивается под кнопки, текст не съезжает; рамка перетаскивания — вокруг фона, кнопки за ней', () => {
    const ed = make('<p>a</p><p class="ted-bg-gray">Текст на фоне</p><p>b</p>', {}, { width: W });
    const p = ed.editable.querySelector('.ted-bg-gray');
    const pad = getComputedStyle(p).paddingTop;
    const h = rect(p).height;
    caretIn(ed, p);
    eq(getComputedStyle(p).paddingTop, pad, 'отступ фона прежний');
    eq(Math.round(rect(p).height), Math.round(h), 'высота фона прежняя');
    ok(rect(ed.handle.controls).bottom <= rect(p).top + 0.5, 'кнопки над фоном, не на нём');
    p.setAttribute('data-tedui-drag', '');
    eq(getComputedStyle(p, '::after').top, '-8px', 'рамка вокруг фона, кнопки за рамкой');
    eq(getComputedStyle(p).outlineStyle, 'none');
    p.removeAttribute('data-tedui-drag');
  });

  test('код: колонка номеров строк начинается под шапкой «Выберите язык», шапка с кнопками — на шапке', () => {
    const ed = make('<p>a</p><pre><code>x\ny</code></pre><p>b</p>', {}, { width: W });
    const pre = ed.editable.querySelector('pre');
    caretIn(ed, pre.querySelector('code'));
    const pad = parseFloat(getComputedStyle(pre).paddingTop);
    const head = parseFloat(getComputedStyle(pre, '::before').height) + parseFloat(getComputedStyle(pre, '::before').marginBottom);
    eq(parseFloat(getComputedStyle(pre, '::after').top), pad + head, 'номера строк под шапкой');
    eq(Math.round(rect(ed.handle.codeHead).top), Math.round(rect(pre).top + pad), 'кнопки шапки на шапке');
  });

  test('ключевые цифры: кнопки карточки не закрывают кнопки блока (корзина блока видна)', () => {
    const ed = make('<p>a</p><ul class="ted-facts"><li><strong>48</strong><br>подпись</li><li><strong>468</strong><br>подпись</li></ul>', {}, { width: W });
    const li = ed.editable.querySelectorAll('ul.ted-facts > li')[1];
    caretIn(ed, li.querySelector('strong'));
    ok(ed.handle.itemControls.classList.contains('is-visible'));
    ok(!overlap(rect(ed.handle.itemControls), rect(ed.handle.controls)), 'кнопки не друг на друге');
    const r = rect(ed.handle.itemControls);
    const c = rect(li);
    ok(r.left >= c.left && r.right <= c.right && r.top >= c.top, 'кнопки карточки внутри карточки');
  });

  test('плюсы и минусы: кнопки карточки не закрывают кнопки блока', () => {
    const ed = make('<p>a</p><ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Один</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Два</li></ul></li></ul>', {}, { width: W });
    caretIn(ed, ed.editable.querySelector('.ted-pros > strong'));
    ok(!overlap(rect(ed.handle.itemControls), rect(ed.handle.controls)), 'кнопки не друг на друге');
  });

  test('ручки пунктов, карточек и плиток перетаскиваются пальцем (touch-action: none, как у ручки блока)', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Шаг</strong><br>описание</li></ol>', {}, { width: W });
    eq(getComputedStyle(ed.handle.itemGrip).touchAction, 'none');
    eq(getComputedStyle(ed.handle.ctrlGrip).touchAction, 'none');
  });
});

group('Клавиши: Tab, Enter в цифрах, заглушки выноски', () => {
  test('Tab в абзаце и цитате не уводит курсор из текста на строку «+»', () => {
    const ed = make('<p>Текст</p><blockquote><p>Цитата</p></blockquote>');
    for (const el of [ed.editable.querySelector('p'), ed.editable.querySelector('blockquote > p')]) {
      caretIn(ed, el);
      ok(key(ed, 'Tab'), 'Tab перехвачен');
      ok(el.contains(getSelection().anchorNode), 'курсор на месте');
    }
  });

  test('Enter посреди числа в ключевых цифрах не разрезает число: курсор переходит в подпись', () => {
    const ed = make('<ul class="ted-facts"><li><strong>48</strong><br>подпись</li><li><strong>468</strong><br>вторая</li></ul>');
    const li = ed.editable.querySelectorAll('ul.ted-facts > li')[1];
    const s = li.querySelector('strong');
    ed.editable.focus();
    const r = document.createRange();
    r.setStart(s.firstChild, 1);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ok(key(ed, 'Enter'));
    eq(s.textContent, '468', 'число целое');
    eq(li.textContent.replace(/​/g, ''), '468вторая', 'подпись не тронута');
    const a = getSelection().anchorNode;
    ok(li.contains(a) && !s.contains(a), 'курсор в подписи');
    eq(ed.editable.querySelectorAll('ul.ted-facts > li').length, 2, 'новых плиток нет');
  });

  test('выноска: «Текст выноски» не появляется на пустой строке между абзацами текста', () => {
    const ed = make('<blockquote class="ted-callout"><p><strong>Заголовок</strong></p><p>Текст</p><p>x</p><p>ещё</p></blockquote>');
    const ps = ed.editable.querySelectorAll('blockquote > p');
    eq(ps.length, 4);
    ps[2].innerHTML = '<br>';
    ed.updatePlaceholders();
    ok(!ps[2].hasAttribute('data-tedui-ph'), 'пустая строка без заглушки');
    const ed2 = make('<blockquote class="ted-callout"><p><strong>Заголовок</strong></p><p>x</p></blockquote>');
    ed2.editable.querySelectorAll('blockquote > p')[1].innerHTML = '<br>';
    ed2.updatePlaceholders();
    eq(ed2.editable.querySelectorAll('blockquote > p')[1].getAttribute('data-tedui-ph'), 'Текст выноски', 'пустой текст — заглушка');
  });
});

group('Таблица: курсор между ячейками', () => {
  test('курсор в обёртке после таблицы (касание у полосы прокрутки) переносится в ячейку; текст мимо ячеек попадает в последнюю ячейку', async () => {
    const T = '<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="2"><tbody><tr><td>a</td><td>b</td></tr></tbody></table></div></figure><p>после</p>';
    const ed = make(T, {}, { width: W });
    const wrap = ed.editable.querySelector('.ted-table__wrap');
    ed.editable.focus();
    const r = document.createRange();
    r.setStart(wrap, 1);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    const an = getSelection().anchorNode;
    ok(an && (an.nodeType === 1 ? an : an.parentElement).closest('td'), 'курсор в ячейке');
    wrap.appendChild(document.createTextNode('X'));
    ed.editable.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await wait(20);
    ok(/<td>bX<\/td>/.test(html(ed)), 'текст в последней ячейке: ' + html(ed).slice(0, 200));
  });
});

group('Плюсы и минусы: структура не ломается', () => {
  const PC = '<p>до</p><ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Один</li><li>Два</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Минус</li></ul></li></ul><p>после</p>';
  const OK = '<p>до</p><ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Один</li><li>Два</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Минус</li></ul></li></ul><p>после</p>';
  const flat = (ed) => html(ed).replace(/\n\s*/g, '');

  test('Tab и Shift+Tab в пункте ничего не делают: нет вложенного списка («◦»), пункт не выпадает из карточки', () => {
    const ed = make(PC);
    const li = ed.editable.querySelectorAll('.ted-pros li')[1];
    caretIn(ed, li);
    ok(key(ed, 'Tab'));
    ok(key(ed, 'Tab', { shiftKey: true }));
    caretIn(ed, ed.editable.querySelector('.ted-cons li'));
    ok(key(ed, 'Tab', { shiftKey: true }));
    eq(flat(ed), OK);
  });

  test('Delete в конце абзаца перед блоком не втягивает заголовок карточки', () => {
    const ed = make(PC);
    caretIn(ed, ed.editable.firstElementChild);
    ok(key(ed, 'Delete'));
    eq(flat(ed), OK);
  });

  test('уже сломанный блок чинится при загрузке: вложенные пункты раскрыты, карточка без класса слита, пустые строки убраны', () => {
    const broken = '<p>до</p><ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><br><ul><li>Один<ul><li>Вложенный</li></ul></li><li>Два</li></ul></li><li><ul><li><br></li><li>Хвост</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Минус</li></ul></li></ul><p>после</p>';
    const ed = make(broken);
    eq(flat(ed), '<p>до</p><ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Один</li><li>Вложенный</li><li>Два</li><li>Хвост</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Минус</li></ul></li></ul><p>после</p>');
  });
});

group('Медиа и «выделить всё» (замечания 17.11)', () => {
  test('поле ссылки на видео: Enter в пустом поле — новый абзац под блоком', async () => {
    const ed = make('<p></p>', { mediaSource: 'manager', pickFile: () => [] }, { width: W });
    try {
      const b = ed.media.create('video', ed.editable.firstChild, { select: false });
      const url = b.querySelector('input.ted-ui-media__url');
      url.focus();
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      url.dispatchEvent(e);
      ok(e.defaultPrevented);
      await wait(20);
      const next = b.nextElementSibling;
      eq(next && next.tagName, 'P', 'абзац под видео');
      ok(next.contains(getSelection().anchorNode) || getSelection().anchorNode === next, 'курсор в новом абзаце');
    } finally { ed.destroy(); }
  });

  test('зона загрузки видео в узкой колонке: «Выбрать видео» и «или перетащите сюда» рядом, по центру', () => {
    const ed = make('<p></p>', { mediaSource: 'direct', uploadUrl: '/ted-demo-media/upload' }, { width: W });
    try {
      const b = ed.media.create('video', ed.editable.firstChild, { select: false });
      const drop = b.querySelector('.ted-ui-media__drop');
      eq([getComputedStyle(drop).alignContent, getComputedStyle(drop).textAlign].join(' '), 'center center');
      const label = rect(drop.querySelector('.ted-ui-media__drop-label'));
      const hint = rect(drop.querySelector('.ted-ui-media__drop-hint'));
      ok(hint.top - label.bottom < 12, `строки рядом: ${Math.round(hint.top - label.bottom)}`);
    } finally { ed.destroy(); }
  });

  test('ошибка загрузки аудио: текст по центру, крестик его не закрывает', () => {
    const job = document.createElement('div');
    job.className = 'ted-ui-media__job ted-ui-media__job--audio is-error';
    job.innerHTML = '<div class="ted-ui-media__status"><span class="ted-ui-media__file"><strong>Не удалось загрузить</strong><span>Формат файла не поддерживается</span></span></div>';
    const ed = make('<p>a</p>', {}, { width: W });
    ed.column.appendChild(job);
    const st = getComputedStyle(job.querySelector('.ted-ui-media__status'));
    eq([st.textAlign, st.paddingLeft, st.paddingRight].join(' '), 'center 40px 40px');
    eq(getComputedStyle(job.querySelector('.ted-ui-media__file')).justifyItems, 'center');
    job.remove();
  });

  test('Ctrl+A и Delete: удаляется всё, и таблица, и файлы в конце; Undo возвращает', async () => {
    const ed = make('<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="2"><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div></figure><figure class="ted-media ted-media--file"><a href="/uf/files/a.pdf" download>a.pdf</a></figure>', {}, { width: W });
    await wait(30);
    caretIn(ed, ed.editable.querySelector('td'));
    ok(key(ed, 'a', { code: 'KeyA', ctrlKey: true }), 'Ctrl+A перехвачен');
    ok(key(ed, 'Delete'));
    await wait(30);
    eq(html(ed), '', 'пусто');
    ok(!ed.editable.querySelector('.ted-ui-media, figure'), 'ни таблицы, ни файлов');
    ed.exec('undo');
    await wait(30);
    eq(ed.editable.querySelectorAll('.ted-ui-media, figure.ted-table').length, 2, 'Undo вернул');
  });
});

group('Таблица на телефоне (замечания 17.11)', () => {
  const T = '<p>a</p><figure class="ted-table"><div class="ted-table__wrap"><table data-cols="3"><thead><tr><th>Тариф</th><th>Цена</th><th>Срок</th></tr></thead><tbody><tr><td>Базовый</td><td>990</td><td>1 мес</td></tr></tbody></table></div></figure><p>b</p>';
  test('кнопки столбца не ложатся на кнопки блока (правый столбец)', async () => {
    const ed = make(T, {}, { width: W });
    const fig = ed.editable.querySelector('figure.ted-table');
    fig.querySelector('.ted-table__wrap').scrollLeft = 1000;
    caretIn(ed, fig.querySelectorAll('tbody td')[2]);
    await wait(10);
    ok(ed.table.colCtl.classList.contains('is-visible'));
    ok(!overlap(rect(ed.table.colCtl), rect(ed.handle.controls)), 'кнопки столбца и блока не друг на друге');
    ok(!overlap(rect(ed.table.rowCtl), rect(ed.handle.controls)), 'кнопки строки и блока не друг на друге');
  });

  test('«Добавить строку / столбец» не выходят за таблицу: прокручиваются', () => {
    const ed = make(T, {}, { width: W });
    const fig = ed.editable.querySelector('figure.ted-table');
    caretIn(ed, fig.querySelector('td'));
    const bar = ed.table.addBar;
    ok(rect(bar).right <= rect(fig).right + 0.5, 'в пределах таблицы');
    eq(getComputedStyle(bar).overflowX, 'auto');
    ok(bar.scrollWidth >= bar.clientWidth);
  });
});

group('Подсказки загрузчиков', () => {
  test('значок «i» в двухстрочной подсказке не сжимается (16 × 16)', () => {
    const ed = make('<p></p>', { mediaSource: 'direct', uploadUrl: '/ted-demo-media/upload' }, { width: W });
    try {
      const b = ed.media.create('video', ed.editable.firstChild, { select: false });
      const hint = b.querySelector('.ted-ui-media__hint');
      eq(getComputedStyle(hint, '::before').width, '16px');
      eq(getComputedStyle(hint, '::before').flexShrink, '0');
    } finally { ed.destroy(); }
  });
});

group('Таблица из одной строки (замечание 17.11)', () => {
  const ONE = '<p>a</p><figure class="ted-table"><div class="ted-table__wrap"><table data-cols="2"><tbody><tr><td>Таблицы</td><td>сохраняются как есть</td></tr></tbody></table></div></figure><p>b</p>';
  test('одна строка: кнопок строки нет (переносить и удалять нечего); кнопки столбца не наезжают на кнопки блока', async () => {
    const ed = make(ONE, {}, { width: W });
    const td = ed.editable.querySelectorAll('td')[1];
    caretIn(ed, td);
    await wait(10);
    ok(!ed.table.rowCtl.classList.contains('is-visible'), 'кнопок строки нет');
    ok(ed.table.colCtl.classList.contains('is-visible'), 'кнопки столбца есть');
    // кнопки едут плавно — сверяем целевые места (style.left), а не промежуточные
    const colX = () => parseFloat(ed.table.colCtl.style.left);
    const blockX = () => rect(ed.handle.controls).right - rect(ed.column).left - ed.handle.controls.offsetWidth;
    const c = { right: colX() + ed.table.colCtl.offsetWidth };
    const b = { left: blockX() };
    ok(c.right <= b.left - 7.5, `между кнопками столбца и блока не меньше 8: ${Math.round(b.left - c.right)}`);
    // с якорем у блока группа кнопок шире — всё равно не наезжают
    ed.editable.querySelector('figure.ted-table').id = 'tablica';
    ed.updateState();
    await wait(10);
    ok(colX() + ed.table.colCtl.offsetWidth <= rect(ed.editable.querySelector('figure.ted-table')).right - rect(ed.column).left - ed.handle.controls.offsetWidth - 7.5, 'с якорем тоже не наезжают');
  });

  test('один столбец: кнопок столбца нет', () => {
    const ed = make('<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="1"><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table></div></figure>', {}, { width: W });
    caretIn(ed, ed.editable.querySelector('td'));
    ok(!ed.table.colCtl.classList.contains('is-visible'));
    ok(ed.table.rowCtl.classList.contains('is-visible'), 'кнопки строки есть: строк две');
  });
});

group('Переход с таблицы на линию (замечание 17.11)', () => {
  test('курсор из подписи таблицы на линию: кнопки блока у линии, а не у следующего абзаца', async () => {
    const ed = make('<p>a</p><figure class="ted-table"><div class="ted-table__wrap"><table data-cols="2"><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div><figcaption>Цены</figcaption></figure><hr><p>конец</p>', {}, { width: 1000 });
    caretIn(ed, ed.editable.querySelector('figcaption'));
    const hr = ed.editable.querySelector('hr');
    // курсор на линии — как после стрелки вниз: между таблицей и линией
    const r = document.createRange();
    r.setStart(ed.editable, [...ed.editable.childNodes].indexOf(hr));
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    await wait(10);
    eq(ed.handle.focused, hr, 'в фокусе линия');
    // кнопки едут плавно (0.14 s) — сверяем место, куда они едут
    const target = rect(hr).top - rect(ed.column).top;
    ok(Math.abs(parseFloat(ed.handle.controls.style.top) - target) < 2, `кнопки у линии: ${ed.handle.controls.style.top} / ${Math.round(target)}`);
  });
});
