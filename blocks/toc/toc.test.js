// Тесты блока «Содержание» (blocks/toc, этап 5) — прежние tests/toc.test.js, перенесены без изменений.
// Содержание (этап 6.3, макет block-navigation): разметка, очистка, окно главы, выбор якоря, кнопки главы, сайт (свёрнуто, прогресс).
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, html, blocks, Ted } from '../../tests/helpers.js';
import { defOf as tocDefOf } from '../../resources/js/core/registry.js';

group('Блок «Содержание» (blocks/toc): реестр', () => {
  test('один блок и на сайте (<nav class="ted-toc">), и в правке (<div class="ted-toc">) — selector «.ted-toc»', () => {
    for (const tag of ['nav', 'div']) { const e = document.createElement(tag); e.className = 'ted-toc'; eq((tocDefOf(e) || {}).type, 'toc', tag); }
  });
});

const TOC = (items) => `<nav class="ted-toc"><div class="ted-toc__progress"><div class="ted-toc__bar"></div></div><div class="ted-toc__panel"><p class="ted-toc__title">Содержание</p><ul class="ted-toc__list">${items}</ul></div></nav>`;
const DOC = '<h2 id="start">Как всё начиналось</h2><p>Текст</p>' + TOC('<li><a href="#start">Как всё начиналось</a></li><li><a href="#done">Что мы сделали</a></li>') + '<h2 id="done">Что мы сделали</h2><p>после</p>';
const popover = () => { const all = document.querySelectorAll('.ted-ui-pop--link'); return all[all.length - 1]; };

group('Содержание: разметка и очистка', () => {
  test('сайт: <nav class="ted-toc"> с полосой прогресса, заголовком и главами; повторная очистка не меняет HTML', () => {
    const out = Ted.clean(DOC);
    ok(out.includes(TOC('<li><a href="#start">Как всё начиналось</a></li><li><a href="#done">Что мы сделали</a></li>')), out);
    eq(Ted.clean(out), out);
  });

  test('главы — только ссылки на якоря страницы: внешние, javascript: и пустые отбрасываются; в заголовке — только текст', () => {
    const out = Ted.clean(TOC('<li><a href="https://evil.example">Внешняя</a></li><li><a href="javascript:alert(1)">JS</a></li><li><a href="#ok">Своя</a></li><li><a href="#">Пустая</a></li>').replace('Содержание', 'Со<b onclick="x">держ</b>ание'));
    ok(/<li><a href="#ok">Своя<\/a><\/li>/.test(out), out);
    ok(!/evil|javascript|Пустая|onclick|<b>/.test(out), out);
    ok(/ted-toc__title">Содержание</.test(out));
  });
});

group('Содержание: правка', () => {
  test('из меню блоков: заглушка «Заголовок», курсор в заголовке, «Добавить главу» под блоком, «Скрыть» внизу панели', async () => {
    const ed = make('<p>до</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="toc"]').click();
    await wait(20);
    ed.updatePlaceholders();
    const toc = ed.editable.querySelector('.ted-toc');
    eq(toc.querySelector('.ted-toc__title').getAttribute('data-tedui-ph'), 'Заголовок');
    ed.updateState();
    ok(ed.toc.addBtn.classList.contains('is-visible'));
    eq(ed.toc.addBtn.textContent, 'Добавить главу');
    eq(toc.querySelector('.ted-toc__toggle').textContent, 'Скрыть');
    ok(!/ted-toc__toggle|contenteditable/.test(html(ed)), 'служебное не сохраняется');
  });

  test('«Добавить главу»: окно с названием и якорем; якорь выбирается из существующих (подставляет и название)', async () => {
    const ed = make('<h2 id="start">Как всё начиналось</h2>' + TOC('') + '<p>после</p>');
    const title = ed.editable.querySelector('.ted-toc__title');
    ed.editable.focus();
    const r = document.createRange();
    r.selectNodeContents(title);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    ed.toc.addBtn.click();
    await wait(20);
    const pop = popover();
    eq(pop.querySelector('.ted-ui-form__title').textContent, 'Глава содержания');
    const [name, anchor] = pop.querySelectorAll('input');
    anchor.focus();
    anchor.dispatchEvent(new Event('input'));
    const item = document.querySelector('.ted-ui-pop--anchors .ted-ui-item');
    ok(item && /#start — Как всё начиналось/.test(item.textContent), 'якоря страницы в списке');
    item.click();
    eq([name.value, anchor.value].join(' | '), 'Как всё начиналось | start');
    pop.querySelector('.ted-ui-action--primary').click();
    await wait(20);
    ok(/<li><a href="#start">Как всё начиналось<\/a><\/li>/.test(html(ed)), html(ed));
    ok(ed.toc.addBtn.classList.contains('is-visible'), 'курсор вернулся в блок — кнопка на месте');
  });

  test('якорь проверяется: латиницей, с буквы; без названия не сохраняется', async () => {
    const ed = make(TOC('') + '<p>после</p>');
    ed.editable.focus();
    const r = document.createRange();
    r.selectNodeContents(ed.editable.querySelector('.ted-toc__title'));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    ed.toc.addBtn.click();
    await wait(20);
    const pop = popover();
    const [name, anchor] = pop.querySelectorAll('input');
    name.value = 'Глава';
    anchor.value = '1-глава';
    pop.querySelector('.ted-ui-action--primary').click();
    ok(ed.popover.isOpen, 'не сохранено: с цифры');
    anchor.value = 'Глава один';
    pop.querySelector('.ted-ui-action--primary').click();
    ok(ed.popover.isOpen, 'не сохранено: кириллица');
    anchor.value = '#glava-1';
    pop.querySelector('.ted-ui-action--primary').click();
    ok(!ed.popover.isOpen);
    ok(/href="#glava-1">Глава</.test(html(ed)));
  });

  test('нажатие на главу: окно правки и кнопки ⠿ 🗑 в её строке; корзина удаляет главу, Undo возвращает', async () => {
    const ed = make(DOC, {}, { width: 1000 });
    ed.editable.focus();
    const li = ed.editable.querySelectorAll('.ted-toc__list > li')[1];
    li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(20);
    eq(popover().querySelector('input').value, 'Что мы сделали');
    eq(ed.handle.item, li);
    const c = ed.handle.itemControls.getBoundingClientRect();
    const lr = li.getBoundingClientRect();
    const pr = li.parentNode.getBoundingClientRect();
    ok(c.top >= lr.top - 1 && c.bottom <= lr.bottom + 1 && c.right <= pr.right + 1, 'в строке главы, внутри панели');
    ed.handle.removeItem(li);
    eq(ed.editable.querySelectorAll('.ted-toc__list > li').length, 1);
    ok(ed.editable.querySelector('.ted-toc'), 'блок остаётся');
    ed.exec('undo');
    eq(ed.editable.querySelectorAll('.ted-toc__list > li').length, 2);
  });

  test('заголовок — одна строка (Enter не ломает); в заголовке нет форматирования, стиля, фона', () => {
    const ed = make(DOC);
    const t = ed.editable.querySelector('.ted-toc__title');
    ed.editable.focus();
    const r = document.createRange();
    r.selectNodeContents(t);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ed.editable.dispatchEvent(e);
    ok(e.defaultPrevented);
    eq(ed.editable.querySelectorAll('.ted-toc__title').length, 1);
    ok(ed.toolbar.styleBtn.hidden && ed.toolbar.colorBtn.hidden && ed.toolbar.marks.bold.hidden && ed.toolbar.marks.link.hidden);
  });
});

group('Содержание: сайт и вид', () => {
  test('content.js: список свёрнут, «Показать» / «Скрыть»; полоса прогресса', () => {
    if (!window.TedContent) return;
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.innerHTML = Ted.clean(DOC);
    document.body.appendChild(box);
    window.TedContent.mount(box);
    const toc = box.querySelector('.ted-toc');
    const btn = toc.querySelector('.ted-toc__toggle');
    ok(toc.hasAttribute('data-ted-collapsed'), 'свёрнуто по умолчанию');
    eq(btn.textContent, 'Показать');
    const list = toc.querySelector('.ted-toc__list');
    eq(Math.round(list.getBoundingClientRect().height) + ' ' + getComputedStyle(list).visibility, '0 hidden', 'свёрнуто сразу, без анимации при загрузке');
    btn.click();
    eq(btn.textContent, 'Скрыть');
    ok(!toc.hasAttribute('data-ted-collapsed'));
    ok(toc.querySelector('.ted-toc__bar').style.width !== '', 'прогресс посчитан');
    box.remove();
  });

  test('вид: панель main/gray/lighter r24, поля 20 / 20 / 12, заголовок 24 / 700, главы 16 #1461CC; тёмная — панель #4D4D4D, главы #63A1F7', () => {
    const ed = make(DOC, {}, { width: 1000 });
    const panel = ed.editable.querySelector('.ted-toc__panel');
    const cs = getComputedStyle(panel);
    eq([cs.backgroundColor, cs.borderTopLeftRadius, cs.paddingTop, cs.paddingRight, cs.paddingBottom].join(' '), 'rgb(237, 243, 250) 24px 20px 20px 12px');
    const t = getComputedStyle(ed.editable.querySelector('.ted-toc__title'));
    eq([t.fontSize, t.fontWeight].join(' '), '24px 700');
    const a = getComputedStyle(ed.editable.querySelector('.ted-toc__list a'));
    eq([a.fontSize, a.color].join(' '), '16px rgb(20, 97, 204)');
    const dark = make(DOC, {}, { width: 1000, theme: 'dark' });
    eq(getComputedStyle(dark.editable.querySelector('.ted-toc__panel')).backgroundColor, 'rgb(77, 77, 77)');
    eq(getComputedStyle(dark.editable.querySelector('.ted-toc__list a')).color, 'rgb(99, 161, 247)');
  });
});

// ---- блок полностью в папке (отвязка ядра, 21.11): ядро спрашивает реестр ----
group('Содержание: точки подключения реестра', () => {
  const TOC = '<nav class="ted-toc"><div class="ted-toc__panel"><p class="ted-toc__title">Оглавление</p><ul class="ted-toc__list"><li><a href="#start">Начало</a></li><li><a href="#end">Итог</a></li></ul></div></nav>';

  test('editorUi: editor.toc в blockUis; lineAfter — последним под ним строка текста; курсор после вставки — в заголовке', () => {
    const ed = make(TOC);
    ok(ed.toc && ed.blockUis.includes(ed.toc));
    eq(blocks(ed).map((b) => b.tagName).join(','), 'DIV,P');
    ed.destroy();
    const ed2 = make('<p><br></p>');
    ed2.blockMenu.openPicker(ed2.editable.firstElementChild);
    document.querySelector('.ted-ui-tile[data-type="toc"]').click();
    const r = getSelection().rangeCount ? getSelection().getRangeAt(0) : null;
    ok(r && r.startContainer.nodeType && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode).closest('.ted-toc__title'), 'курсор в заголовке');
    ed2.destroy();
  });

  test('toolbar (block.json): в заголовке — без стиля, фона, выравнивания и форматирования (inContainers: false проверяет тест колонок)', () => {
    const ed = make(TOC);
    ed.toolbar.update({ ...ed.state, type: 'toc', mode: 'edit', focused: true, marks: {} });
    ok(ed.toolbar.styleBtn.hidden && ed.toolbar.alignBtn.hidden && ed.toolbar.colorBtn.hidden, 'стиль, выравнивание, фон');
    ok(Object.values(ed.toolbar.marks).every((b) => b.hidden), 'Ж К Ч З код ссылка');
    ed.destroy();
  });

  test('toText: в наборе без содержания — заголовок жирным и ссылки на главы', () => {
    eq(Ted.clean(TOC, { blocks: ['p', 'ul'] }).replace(/>\s+</g, '><'), '<p><strong>Оглавление</strong></p><ul><li><a href="#start">Начало</a></li><li><a href="#end">Итог</a></li></ul>');
  });
});
