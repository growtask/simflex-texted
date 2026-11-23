import { group, test, eq, ok, wait, vis } from './harness.js';
import { Ted, sandbox, make, blocks, text, select, selectAll, selectText, pop, tagOf, typeText, pressEnter, html } from './helpers.js';

group('Редактор: загрузка и сохранение HTML', () => {
  test('setHTML → getHTML с обёрткой и статистикой', () => {
    const ed = make('<h2>Заголовок</h2><p>Два слова</p>');
    const out = ed.getHTML();
    ok(out.startsWith('<div class="ted-content"'), out);
    ok(out.includes('data-words="3"') && out.includes('data-blocks="2"'), out);
    ok(out.includes('<h2>Заголовок</h2>') && out.includes('<p>Два слова</p>'), out);
  });
  test('stats: false убирает атрибуты', () => {
    const ed = make('<p>а</p>', { stats: false });
    ok(!ed.getHTML().includes('data-words'));
  });
  test('wrap: false — без обёртки', () => {
    const ed = make('<p>а</p>', { wrap: false });
    eq(ed.getHTML(), '<p>а</p>');
  });
  test('getStats', () => {
    const ed = make('<h2>Раз два</h2><p>три четыре пять</p>');
    const s = ed.getStats();
    ok(s.words === 5 && s.blocks === 2 && s.minutes === 1 && s.chars > 0, JSON.stringify(s));
  });
  test('старый HTML TinyMCE очищается', () => {
    const ed = make('<div style="color:red"><b>а</b></div>');
    eq(html(ed), '<p><strong>а</strong></p>');
  });
  test('onChange вызывается при изменении', async () => {
    let got = null;
    const ed = make('<p>а</p>', { onChange: (h) => { got = h; } });
    select(ed, 0, 1);
    typeText('б');
    await wait(400);
    ok(got && got.includes('аб'), String(got));
  });
});

group('Редактор: форматирование текста', () => {
  test('жирный / курсив / подчёркнутый / зачёркнутый', () => {
    for (const [cmd, tag] of [['bold', 'strong'], ['italic', 'em'], ['underline', 'u'], ['strike', 's']]) {
      const ed = make('<p>слово</p>');
      selectAll(ed, 0);
      ed.exec(cmd);
      ok(html(ed).includes(`<${tag}>слово</${tag}>`), `${cmd}: ${html(ed)}`);
    }
  });
  test('повторный bold снимает форматирование', () => {
    const ed = make('<p>слово</p>');
    selectAll(ed, 0);
    ed.exec('bold');
    selectAll(ed, 0);
    ed.exec('bold');
    ok(!html(ed).includes('<strong>'), html(ed));
  });
  test('код в строке и обратно', () => {
    const ed = make('<p>один два</p>');
    select(ed, 0, 0, 4);
    ed.exec('code');
    ok(html(ed).includes('<code>один</code>'), html(ed));
  });
  test('выравнивание', () => {
    const ed = make('<p>а</p><p>б</p>');
    select(ed, 0, 0);
    ed.exec('align:center');
    ok(html(ed).includes('<p class="ted-align-center">а</p>'), html(ed));
    ed.exec('align:left');
    ok(!html(ed).includes('ted-align'), html(ed));
  });
  test('смена типа блока', () => {
    const ed = make('<p>а</p>');
    select(ed, 0, 0);
    ed.exec('block:h3');
    eq(html(ed), '<h3>а</h3>');
    ed.exec('block:ul');
    ok(html(ed).includes('<ul>') && html(ed).includes('<li>а</li>'), html(ed));
    ed.exec('block:blockquote');
    ok(html(ed).includes('<blockquote>'), html(ed));
    ed.exec('block:p');
    eq(html(ed), '<p>а</p>');
  });
  test('смена типа сохраняет выравнивание и подложку', () => {
    const ed = make('<p class="ted-align-center ted-bg-gray">а</p>');
    select(ed, 0, 0);
    ed.exec('block:h2');
    const out = html(ed);
    ok(out.includes('ted-align-center') && out.includes('ted-bg-gray'), out);
  });
});

group('Редактор: цветной фон', () => {
  test('весь блок', () => {
    const ed = make('<p>абзац</p>');
    select(ed, 0, 2);
    ed.exec('bg:color1');
    eq(html(ed), '<p class="ted-bg-color1">абзац</p>');
  });
  test('фрагмент — mark', () => {
    const ed = make('<p>один два три</p>');
    selectText(ed, 'два');
    ed.exec('bg:color2');
    ok(html(ed).includes('<mark class="ted-bg-color2">два</mark>'), html(ed));
  });
  test('смена цвета и удаление', () => {
    const ed = make('<p class="ted-bg-gray">абзац</p>');
    select(ed, 0, 2);
    ed.exec('bg:color1');
    ok(html(ed).includes('ted-bg-color1') && !html(ed).includes('ted-bg-gray'), html(ed));
    ed.exec('bg:');
    eq(html(ed), '<p>абзац</p>');
  });
  test('удаление фона у фрагмента', () => {
    const ed = make('<p>один <mark class="ted-bg-color1">два</mark> три</p>');
    selectText(ed, 'два');
    ed.exec('bg:');
    ok(!html(ed).includes('<mark'), html(ed));
  });
  test('несколько блоков', () => {
    const ed = make('<p>а</p><p>б</p>');
    ed.editable.focus();
    const r = document.createRange();
    r.setStart(blocks(ed)[0].firstChild, 0);
    r.setEnd(blocks(ed)[1].firstChild, 1);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.exec('bg:gray');
    eq(html(ed).match(/ted-bg-gray/g).length, 2, html(ed));
  });
  test('ul получает подложку целиком', () => {
    const ed = make('<ul><li>раз</li><li>два</li></ul>');
    select(ed, 0, 0);
    ed.exec('bg:color1');
    ok(html(ed).includes('<ul class="ted-bg-color1">'), html(ed));
  });
});

group('Редактор: якоря', () => {
  test('якорь из текста блока (транслит)', () => {
    const ed = make('<h2>Привет мир</h2>');
    select(ed, 0, 0);
    ed.openAnchor();
    const input = pop(ed).querySelector('input.ted-ui-input');
    eq(input.value, 'privet-mir');
    pop(ed).querySelector('.ted-ui-action--primary').click();
    eq(html(ed), '<h2 id="privet-mir">Привет мир</h2>');
  });
  test('повторное имя отклоняется', () => {
    const ed = make('<h2 id="a">Один</h2><h2>Два</h2>');
    select(ed, 1, 0);
    ed.openAnchor();
    const input = pop(ed).querySelector('input.ted-ui-input');
    input.value = 'a';
    pop(ed).querySelector('.ted-ui-action--primary').click();
    ok(!html(ed).includes('<h2 id="a">Два'), html(ed));
    ed.popover.close();
  });
  test('пустое имя удаляет якорь', () => {
    const ed = make('<h2 id="a">Один</h2>');
    select(ed, 0, 0);
    ed.openAnchor();
    pop(ed).querySelector('input.ted-ui-input').value = '';
    pop(ed).querySelector('.ted-ui-action--primary').click();
    eq(html(ed), '<h2>Один</h2>');
  });
  test('removeAnchor из меню блока', () => {
    const ed = make('<h2 id="a">Один</h2>');
    ed.handle.removeAnchor(blocks(ed)[0]);
    eq(html(ed), '<h2>Один</h2>');
  });
  test('кнопка якоря в управлении блоком видна только у блока с id', () => {
    const ed = make('<h2 id="a">Один</h2><p>Два</p>');
    ed.handle.setFocused(blocks(ed)[0]);
    ok(!ed.handle.ctrlAnchor.hidden);
    ed.handle.setFocused(blocks(ed)[1]);
    ok(ed.handle.ctrlAnchor.hidden);
  });
  test('ссылка на блок: pageUrl + #id', () => {
    const ed = make('<h2 id="a">Один</h2>', { pageUrl: 'https://site.ru/page' });
    eq(ed.handle.urlFor(blocks(ed)[0], 'a'), 'https://site.ru/page#a');
  });
});

group('Редактор: ссылки', () => {
  test('новая ссылка открывается в новой вкладке по умолчанию', () => {
    const ed = make('<p>один два</p>');
    select(ed, 0, 0, 4);
    ed.openLink();
    const inputs = pop(ed).querySelectorAll('input.ted-ui-input');
    inputs[0].value = 'https://a.ru';
    pop(ed).querySelector('.ted-ui-action--primary').click();
    ok(html(ed).includes('<a href="https://a.ru" target="_blank" rel="noopener">один</a>'), html(ed));
  });
  test('linkBlank: false — без target', () => {
    const ed = make('<p>один два</p>', { linkBlank: false });
    select(ed, 0, 0, 4);
    ed.openLink();
    pop(ed).querySelectorAll('input.ted-ui-input')[0].value = 'https://a.ru';
    pop(ed).querySelector('.ted-ui-action--primary').click();
    ok(html(ed).includes('target="_self"'), html(ed));
  });
  test('пустой адрес удаляет ссылку', () => {
    const ed = make('<p><a href="/a" target="_blank">один</a> два</p>');
    select(ed, 0, 1);
    ed.openLink();
    pop(ed).querySelectorAll('input.ted-ui-input')[0].value = '';
    pop(ed).querySelector('.ted-ui-action--primary').click();
    ok(!html(ed).includes('<a '), html(ed));
  });
});

group('Редактор: Markdown-сокращения', () => {
  // пустые блоки getInnerHTML не отдаёт, поэтому смотрим на DOM
  const fresh = (opts) => {
    const ed = make('<p></p>', opts);
    select(ed, 0, 0);
    return ed;
  };
  test('# → заголовок 2, ## → 3, ### → 4', () => {
    for (const [s, tag] of [['# ', 'h2'], ['## ', 'h3'], ['### ', 'h4']]) {
      const ed = fresh();
      for (const ch of s) typeText(ch);
      eq(tagOf(ed), tag, s);
      eq(text(blocks(ed)[0]).trim(), '', 'знаки сокращения не остаются');
    }
  });
  test('- , * , + → список', () => {
    for (const s of ['-', '*', '+']) {
      const ed = fresh();
      typeText(s);
      typeText(' ');
      eq(tagOf(ed), 'ul', s);
    }
  });
  test('1. и 1) → нумерованный список', () => {
    for (const s of ['1.', '1)']) {
      const ed = fresh();
      typeText(s);
      typeText(' ');
      eq(tagOf(ed), 'ol', s);
    }
  });
  test('> → цитата', () => {
    const ed = fresh();
    typeText('>');
    typeText(' ');
    eq(tagOf(ed), 'blockquote');
  });
  test('после сокращения можно писать текст', () => {
    const ed = fresh();
    typeText('#');
    typeText(' ');
    typeText('Заголовок');
    eq(html(ed), '<h2>Заголовок</h2>');
  });
  test('в середине текста не срабатывает', () => {
    const ed = make('<p>слово</p>');
    select(ed, 0, 5);
    typeText(' ');
    typeText('#');
    typeText(' ');
    eq(tagOf(ed), 'p');
  });
  test('в заголовке не срабатывает', () => {
    const ed = make('<h2>а</h2>');
    selectAll(ed, 0);
    document.execCommand('delete');
    typeText('-');
    typeText(' ');
    eq(tagOf(ed), 'h2');
  });
  test('--- + Enter → разделитель', () => {
    const ed = fresh();
    typeText('---');
    pressEnter(ed);
    ok(blocks(ed).some((b) => b.tagName === 'HR'), html(ed));
  });
  test('``` + Enter → блок кода', () => {
    const ed = fresh();
    typeText('```');
    pressEnter(ed);
    eq(tagOf(ed), 'pre');
  });
  test('Ctrl+Z возвращает абзац', () => {
    const ed = fresh();
    typeText('#');
    typeText(' ');
    eq(tagOf(ed), 'h2');
    ed.history.undo();
    eq(tagOf(ed), 'p');
  });
  test('markdown: false отключает', () => {
    const ed = fresh({ markdown: false });
    typeText('#');
    typeText(' ');
    eq(tagOf(ed), 'p');
  });
});

group('Редактор: история', () => {
  test('undo / redo форматирования', () => {
    const ed = make('<p>слово</p>');
    selectAll(ed, 0);
    ed.exec('bold');
    ok(html(ed).includes('<strong>'));
    ed.history.undo();
    ok(!html(ed).includes('<strong>'), html(ed));
    ed.history.redo();
    ok(html(ed).includes('<strong>'), html(ed));
  });
  test('очистить всё и отменить', () => {
    const ed = make('<h2>А</h2><p>Б</p>');
    ed.clearAll();
    eq(html(ed), '');
    ed.history.undo();
    ok(html(ed).includes('<h2>А</h2>'), html(ed));
  });
});

group('Редактор: ✨ форматирование', () => {
  test('без панели (review: false)', () => {
    const ed = make('<p>Еще - "тест"</p>', { typograf: { review: false } });
    ed.editable.blur();
    ed.formatText();
    const out = vis(html(ed));
    ok(out.includes('Ещё') && out.includes('«тест»'), out);
  });
  test('панель: Сохранить применяет, Отменить откатывает', () => {
    const ed = make('<p>Еще "да"</p>');
    ed.editable.blur();
    ed.formatText();
    ok(ed.popover.isOpen, 'панель не открылась');
    ok(html(ed).includes('Ещё'));
    [...pop(ed).querySelectorAll('.ted-ui-action')].find((b) => b.textContent === 'Отменить').click();
    eq(html(ed), '<p>Еще "да"</p>');
    ed.formatText();
    [...pop(ed).querySelectorAll('.ted-ui-action')].find((b) => b.textContent === 'Сохранить').click();
    ok(html(ed).includes('Ещё'), html(ed));
  });
  test('закрытие кликом мимо окна откатывает', async () => {
    const ed = make('<p>Еще "да"</p>');
    ed.editable.blur();
    ed.formatText();
    ed.popover.close();
    await wait(20);
    eq(html(ed), '<p>Еще "да"</p>');
  });
  test('переключатель категории пересчитывает текст', () => {
    const ed = make('<p>Еще "да"</p>');
    ed.editable.blur();
    ed.formatText();
    const first = pop(ed).querySelector('.ted-ui-toggle__input');
    first.click();
    ok(html(ed).includes('"да"') || html(ed).includes('Еще'), html(ed));
    ed.popover.close();
    localStorage.removeItem('ted-typograf-off');
  });
  test('настройки сайта: off и protect', () => {
    const ed = make('<p>iPhone Еще</p>', { typograf: { off: ['yo'], review: false, protect: ['iPhone'] } });
    ed.editable.blur();
    ed.formatText();
    ok(html(ed).includes('Еще') && html(ed).includes('iPhone'), html(ed));
  });
  test('текст уже в порядке', () => {
    const ed = make('<p>Всё&nbsp;хорошо</p>');
    ed.editable.blur();
    ed.formatText();
    ok(!ed.popover.isOpen);
  });
});

group('Редактор: режимы и сохранение', () => {
  test('просмотр и обратно', () => {
    const ed = make('<p>а</p>');
    ed.setMode('view');
    eq(ed.mode, 'view');
    ed.setMode('edit');
    eq(ed.mode, 'edit');
  });
  test('previewMode: false не уходит в просмотр', () => {
    const ed = make('<p>а</p>', { previewMode: false });
    ed.setMode('view');
    eq(ed.mode, 'edit');
  });
  test('save() вызывает onSave с HTML', async () => {
    let got = null;
    const ed = make('<p>а</p>', { previewMode: false, onSave: (h) => { got = h; } });
    ed.save();
    await wait(20);
    ok(got && got.includes('<p>а</p>'), String(got));
  });
  test('save() в режиме с просмотром уходит в просмотр', async () => {
    const ed = make('<p>а</p>', { onSave: () => {} });
    ed.save();
    await wait(20);
    eq(ed.mode, 'view');
  });
  test('глаза в режиме правки нет нигде; «Сохранить» — только там, где есть просмотр', () => {
    for (const opts of [{}, { onSave: () => {} }, { previewMode: false }, { previewMode: false, onSave: () => {} }]) {
      const ed = make('<p>а</p>', opts);
      const admin = opts.previewMode === false;
      for (const name of ['default', 'text', 'line']) {
        const set = ed.toolbar.sets[name];
        const label = `${name}, ${JSON.stringify(Object.keys(opts))}`;
        ok(!set.includes(ed.toolbar.modeBtn), `${label}: кнопка режима (глаз) в правке`);
        eq(set.includes(ed.toolbar.saveBtn), !admin, `${label}: «Сохранить» ${admin ? 'не должно быть в админке (своё сохранение на странице)' : 'должно быть'}`);
      }
      ok(!ed.toolbar.el.querySelector('[data-icon="eye"], [data-act="mode"]'), 'в панели нет глаза');
    }
  });
  test('админка: Ctrl+S сохраняет без кнопки', async () => {
    let saved = 0;
    const ed = make('<p>а</p>', { previewMode: false, onSave: () => { saved += 1; } });
    ed.exec('save');
    await wait(30);
    eq(saved, 1);
    eq(ed.mode, 'edit');
  });
  test('в просмотре есть «Редактировать», а не «Сохранить»', () => {
    const ed = make('<p>а</p>');
    ok(ed.toolbar.sets.view.includes(ed.toolbar.modeBtn));
    ok(!ed.toolbar.sets.view.includes(ed.toolbar.saveBtn));
    eq(ed.toolbar.modeBtn.getAttribute('aria-label'), 'Редактировать');
  });
  test('«Сохранить» в режиме правки: onSave и переход в просмотр', async () => {
    let saved = 0;
    const ed = make('<p>а</p>', { onSave: () => { saved += 1; } });
    select(ed, 0, 1);
    typeText('б');   // onSave вызывается, только если текст изменился
    ed.toolbar.saveBtn.click();
    await wait(30);
    eq(saved, 1);
    eq(ed.mode, 'view');
  });
  test('textarea: значение синхронизируется', async () => {
    const ta = document.createElement('textarea');
    ta.value = '<p>один</p>';
    sandbox.appendChild(ta);
    const ed = Ted.create(ta, { toasts: false });
    select(ed, 0, 4);
    typeText('!');
    await wait(400);
    ed.flush();
    ok(ta.value.includes('один!'), ta.value);
  });
});

group('Редактор: черновик (автосохранение)', () => {
  test('запись и восстановление', async () => {
    const key = `ted-test-${Date.now()}`;
    const ed = make('<p>а</p>', { autosave: key, autosaveDelay: 10 });
    select(ed, 0, 1);
    typeText('б');
    await wait(400);
    ok((localStorage.getItem(key) || '').includes('аб'), localStorage.getItem(key));
    ed.clearDraft();
    eq(localStorage.getItem(key), null);
  });
});

group('Редактор: шапка', () => {
  test('наборы кнопок', () => {
    const ed = make('<p>а</p>', { onSave: () => {} });
    const names = (set) => set.filter((e) => e.getAttribute && e.getAttribute('data-act')).map((e) => e.getAttribute('data-act')).join(' ');
    eq(names(ed.toolbar.sets.default), 'style align color media all magic more help save');
    eq(names(ed.toolbar.sets.text), 'style align color bold italic underline strike code link anchor all magic more help save');
    eq(names(ed.toolbar.sets.line), 'more help save');
    const admin = make('<p>а</p>', { previewMode: false });
    eq(names(admin.toolbar.sets.default), 'style align color media all magic more help');
  });
  test('режим просмотра: сводка и кнопка', () => {
    const ed = make('<p>а б в</p>');
    ed.setMode('view');
    ed.toolbar.update({ ...ed.state, mode: 'view' });
    ok(ed.toolbar.stats.textContent.includes('3 слова'), ed.toolbar.stats.textContent);
  });
  test('«Ещё»: удалить блок и очистить всё', () => {
    const ed = make('<p>а</p><p>б</p>');
    select(ed, 0, 0);
    ed.toolbar.moreBtn.click();
    const items = Array.from(pop(ed).querySelectorAll('.ted-ui-item')).map((i) => i.textContent.trim());
    ok(items.includes('Удалить блок') && items.includes('Очистить всё'), items.join('|'));
    ed.popover.close();
  });
  test('«Медиа»: четыре пункта', () => {
    const ed = make('<p>а</p>');
    ed.toolbar.mediaBtn.click();
    eq(pop(ed).querySelectorAll('.ted-ui-item').length, 4);
    ed.popover.close();
  });
});

group('Редактор: нижнее меню блоков (плитки)', () => {
  const open = (ed, target) => { ed.blockMenu.openPicker(target || blocks(ed)[0]); return ed.blockMenu.picker; };
  const press = (p, key) => p.input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  test('панель внутри редактора, 29 плиток, 10 групп', () => {
    const ed = make('<p>а</p>');
    const p = open(ed);
    ok(p.panel.parentElement === ed.ui, 'панель внутри редактора, а не в потоке страницы');
    ok(p.panel.getBoundingClientRect().top >= ed.toolbar.el.getBoundingClientRect().bottom, 'под шапкой');
    eq(p.panel.querySelectorAll('.ted-ui-tile').length, 29);
    eq(Array.from(p.panel.querySelectorAll('.ted-ui-picker__label')).map((l) => l.textContent).join('|'),
      'Текст|Акцент|Списки|Медиа|Встраивание|Файлы|Таблицы|Макет|Интерактив|Действия');
    ed.blockMenu.closePicker();
  });
  test('у готовых блоков миниатюра из настоящей разметки, у остальных значок и «появится на этапе»', () => {
    const ed = make('<p>а</p>');
    const p = open(ed);
    const tile = (type) => p.panel.querySelector(`.ted-ui-tile[data-type="${type}"]`);
    ok(tile('h2').querySelector('.ted-ui-tile__sample h2'), 'заголовок');
    ok(tile('blockquote').querySelector('.ted-ui-tile__sample blockquote'), 'цитата');
    ok(tile('hr').querySelector('.ted-ui-tile__sample hr'), 'разделитель');
    ok(!tile('image').classList.contains('is-soon') && tile('image').querySelector('.is-image'), 'изображение доступно, миниатюра из макета');
    ok(tile('table').querySelector('.ted-ui-tile__sample figure.ted-table'), 'таблица доступна (этап 6.1), миниатюра из настоящей разметки');
    ok(!p.panel.querySelector('.ted-ui-tile.is-soon'), 'этап 6 закрыт: «появится на этапе» больше нет ни у одной плитки');
    eq(p.tiles.length, 29, 'доступны все блоки: 15 текстовых, 5 медиа, таблица, аккордеон, вкладки, колонки, содержание, кнопка, iFrame, встраивание и товар');
    ed.blockMenu.closePicker();
  });
  test('поиск по названию и словам', () => {
    const ed = make('<p>а</p>');
    const p = open(ed);
    p.input.value = 'цит';
    p.input.dispatchEvent(new Event('input'));
    eq(p.panel.querySelectorAll('.ted-ui-tile').length, 1);
    p.input.value = 'heading';
    p.input.dispatchEvent(new Event('input'));
    eq(p.panel.querySelector('.ted-ui-tile').getAttribute('data-type'), 'h2');
    p.input.value = 'ничегонет';
    p.input.dispatchEvent(new Event('input'));
    ok(p.panel.textContent.includes('Ничего не найдено'));
    ed.blockMenu.closePicker();
  });
  test('Enter вставляет подсвеченный блок после выбранного', () => {
    const ed = make('<p>один</p><p>два</p>');
    const p = open(ed, blocks(ed)[0]);
    p.input.value = 'цит';
    p.input.dispatchEvent(new Event('input'));
    press(p, 'Enter');
    eq(blocks(ed).map((b) => b.tagName.toLowerCase()).join(','), 'p,blockquote,p');
    ok(!ed.blockMenu.picker, 'панель закрылась');
  });
  test('клик по плитке разделителя вставляет линию', () => {
    const ed = make('<p>один</p>');
    const p = open(ed, blocks(ed)[0]);
    p.panel.querySelector('.ted-ui-tile[data-type="hr"]').click();
    ok(blocks(ed).some((b) => b.tagName === 'HR'), html(ed));
  });
  test('стрелки двигают подсветку: → → Текст, Enter вставляет абзац', () => {
    const ed = make('<h2>Заг</h2>');
    const p = open(ed, blocks(ed)[0]);
    press(p, 'ArrowRight');
    press(p, 'ArrowRight');
    press(p, 'ArrowRight');
    ok(p.tiles[ed.blockMenu.pickerIndex].item.type === 'p', 'четвёртая плитка — Текст (после заголовков 3 и 4)');
    press(p, 'Enter');
    eq(blocks(ed).map((b) => b.tagName.toLowerCase()).join(','), 'h2,p');
  });
  test('плиток «скоро» нет: каждая плитка вставляет блок', () => {
    const ed = make('<p>а</p>');
    const p = open(ed);
    eq(p.panel.querySelectorAll('.ted-ui-tile.is-soon').length, 0);
    ed.blockMenu.closePicker();
  });
  test('Esc и × закрывают', () => {
    const ed = make('<p>а</p>');
    const p = open(ed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    ok(!ed.blockMenu.picker);
    const p2 = open(ed);
    p2.panel.querySelector('[aria-label="Закрыть"]').click();
    ok(!ed.blockMenu.picker);
  });
  test('кнопка «Все блоки» открывает и закрывает, строка «Добавить блок» открывает', () => {
    const ed = make('<p>а</p>');
    ed.toolbar.allBlocksBtn.click();
    ok(ed.blockMenu.picker, 'открылась');
    ed.toolbar.allBlocksBtn.click();
    ok(!ed.blockMenu.picker, 'закрылась');
    ed.addBlock.click();
    ok(ed.blockMenu.picker, 'открылась по строке');
    ed.blockMenu.closePicker();
  });
  test('вставка идёт после блока с курсором, а без курсора — в конец', () => {
    const ed = make('<p>один</p><p>два</p><p>три</p>');
    select(ed, 0, 1);
    ed.toolbar.allBlocksBtn.click();
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="blockquote"]').click();
    eq(blocks(ed)[1].tagName.toLowerCase(), 'blockquote');
    ed.editable.blur();
    getSelection().removeAllRanges();
    ed.toolbar.allBlocksBtn.click();
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="hr"]').click();
    eq(blocks(ed)[blocks(ed).length - 2].tagName === 'HR' || blocks(ed)[blocks(ed).length - 1].tagName === 'HR', true, html(ed));
  });
  test('в режиме просмотра панель закрывается', () => {
    const ed = make('<p>а</p>');
    open(ed);
    ed.setMode('view');
    ok(!ed.blockMenu.picker);
  });
  test('ширина панели = ширина колонки, плитки в сетке', () => {
    const ed = make('<p>а</p>');
    const p = open(ed);
    const col = ed.column.getBoundingClientRect().width;
    ok(Math.abs(p.panel.getBoundingClientRect().width - col) < 1, `${p.panel.getBoundingClientRect().width} ≠ ${col}`);
    const tiles = p.panel.querySelectorAll('.ted-ui-picker__tiles')[0].children;
    ok(tiles.length >= 3 && tiles[0].getBoundingClientRect().top === tiles[1].getBoundingClientRect().top, 'в ряд');
    ed.blockMenu.closePicker();
  });
});

group('Редактор: перетаскивание блоков', () => {
  function drag(ed, index, dy) {
    ed.handle.setFocused(blocks(ed)[index]);
    ed.handle.startDrag(blocks(ed)[index], blocks(ed)[index].getBoundingClientRect().top);
    ed.handle.onDrag({ clientY: blocks(ed)[index].getBoundingClientRect().top + dy });
    ed.handle.endDrag();
  }
  test('вниз до последнего места (блок с подложкой)', () => {
    const ed = make('<h2>Заг</h2><p class="ted-bg-color1">Фон</p><p>Третий</p>');
    drag(ed, 1, 200);
    eq(blocks(ed).map((b) => b.textContent).join('|'), 'Заг|Третий|Фон');
  });
  test('вверх', () => {
    const ed = make('<h2>Заг</h2><p>Один</p><p>Два</p>');
    drag(ed, 2, -300);
    eq(blocks(ed)[0].textContent, 'Два');
  });
  test('отмена перетаскивания не переставляет блоки', () => {
    const ed = make('<p>А</p><p>Б</p><p>В</p>');
    ed.handle.startDrag(blocks(ed)[0], blocks(ed)[0].getBoundingClientRect().top);
    ed.handle.onDrag({ clientY: blocks(ed)[0].getBoundingClientRect().top + 300 });
    ed.handle.endDrag(true);
    eq(blocks(ed).map((b) => b.textContent).join(''), 'АБВ');
    ok(!ed.editable.querySelector('[data-tedui-drag]'));
  });
});

/** Убрать редакторы и окна, созданные тестами (страница тестов вызывает после прогона; `?keep` — оставить для просмотра). */
export function cleanup() {
  sandbox.remove();
  document.querySelectorAll('.ted-ui-pop, .ted-ui-tip, .ted-ui-toast').forEach((n) => n.remove());
}
