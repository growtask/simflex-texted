// Тесты блока «Чек-лист» (blocks/checklist, этап 5). Свои — реестр, меню, JSON, наборы; ниже — перенесённые прежние тесты из tests/sizes.test.js.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { Ted, make, blocks, select, pop, html, tagOf } from '../../tests/helpers.js';
import { blockDef, defOf } from '../../src/core/registry.js';
import { menuGroups, styleTypes, kindOf } from '../../src/core/blocks.js';
import { insertBlock } from '../../tests/interaction/samples.js';

const WIDTHS = [1000, 860, 768, 414];
const THEMES = ['light', 'dark'];
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(50); } return fn(); };
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; };
const flat = (h) => h.replace(/>\s+</g, '><');

group('Блок «Чек-лист» (blocks/checklist)', () => {
  test('в реестре; «Списки» третьим, «Стиль текста» после нумерованного', () => {
    eq(defOf(el('<ul class="ted-checklist"><li>а</li></ul>')).type, 'checklist');
    eq(kindOf(el('<ul class="ted-checklist ted-bg-gray"><li>а</li></ul>')), 'checklist');
    eq(menuGroups().find((g) => g.title === 'Списки').items[2].type, 'checklist');
    const st = styleTypes().map((t) => t.type);
    eq(st[st.indexOf('ol') + 1], 'checklist');
  });
  test('JSON: строки и { text, checked }; в наборе без чек-листа — обычный список', () => {
    eq(flat(Ted.fromBlocks([{ type: 'checklist', items: ['а', { text: 'б', checked: true }] }])), '<ul class="ted-checklist"><li>а</li><li class="ted-checked">б</li></ul>');
    eq(flat(Ted.clean('<ul class="ted-checklist"><li class="ted-checked">а</li></ul>', { blocks: ['p', 'ul'] })), '<ul><li>а</li></ul>');
  });
  test('«Все блоки → Чек-лист»: пустой пункт с курсором', () => {
    const ed = make('<p>до</p>');
    const made = insertBlock(ed, 'checklist');
    ok(made && made.matches('ul.ted-checklist') && made.children.length === 1, made && made.outerHTML);
    ed.destroy();
  });
});

// ---- перенесено из tests/sizes.test.js (прежние тесты, без изменений) ----

group('Чек-лист', () => {
  const CL = '<ul class="ted-checklist"><li class="ted-checked">Раз</li><li>Два</li></ul>';
  const li = (ed, i) => ed.editable.querySelectorAll('ul.ted-checklist > li')[i];
  const press = (ed, o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));

  test('санитайзер: класс списка и отмеченных пунктов сохраняется, на других тегах — нет', () => {
    const out = Ted.clean('<ul class="ted-checklist"><li class="ted-checked">а</li><li>б</li></ul><p class="ted-checklist">в</p><ol class="ted-checklist"><li>г</li></ol>');
    ok(out.includes('<ul class="ted-checklist">') && out.includes('<li class="ted-checked">а</li>') && out.includes('<li>б</li>'), out);
    ok(!out.includes('<p class="ted-checklist"') && !out.includes('<ol class="ted-checklist"'), 'только ul');
  });
  test('загрузка и сохранение: разметка чистая, без служебных атрибутов', () => {
    const ed = make(CL);
    const out = html(ed);
    ok(out.includes('<ul class="ted-checklist">') && out.includes('<li class="ted-checked">Раз</li>'), out);
    ok(!out.includes('data-tedui') && !out.includes('<input'), 'без служебного и без input');
  });
  test('превращение: абзац → чек-лист → абзац; список ↔ чек-лист', () => {
    const ed = make('<p>один</p><p>два</p>');
    select(ed, 0, 0);
    ed.exec('block:checklist');
    ok(html(ed).includes('ted-checklist') && html(ed).includes('один'), html(ed));
    eq(ed.state.type, 'checklist', 'вид блока для меню «Стиль»');
    ed.exec('block:checklist');
    eq(tagOf(ed), 'p', 'повторно — обратно в абзац');
    ed.exec('block:ul');
    ok(html(ed).includes('<ul>') && !html(ed).includes('ted-checklist'), html(ed));
    ed.exec('block:checklist');
    ok(html(ed).includes('ted-checklist'), 'список → чек-лист');
    ed.exec('block:ul');
    ok(!html(ed).includes('ted-checklist'), 'чек-лист → список');
  });
  test('меню «Стиль текста» содержит «Чек-лист»', () => {
    const ed = make('<p>а</p>');
    select(ed, 0, 0);
    ed.toolbar.styleBtn.click();
    const names = Array.from(pop(ed).querySelectorAll('.ted-ui-item__label')).map((n) => n.textContent);
    ok(names.includes('Чек-лист'), names.join('|'));
    ed.popover.close();
  });
  test('плитка и «/»: пункт готов (не «скоро»), вставляет чек-лист с пустым пунктом', () => {
    const ed = make('<p>один</p>');
    select(ed, 0, 1);
    ed.toolbar.allBlocksBtn.click();
    const tile = ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="checklist"]');
    ok(!tile.classList.contains('is-soon') && tile.querySelector('.ted-checklist li'), 'живая миниатюра');
    tile.click();
    const ul = ed.editable.querySelector('ul.ted-checklist');
    ok(ul && ul.querySelector('li'), html(ed));
    const ed2 = make('<p></p>');
    select(ed2, 0, 0);
    document.execCommand('insertText', false, '/');
    document.execCommand('insertText', false, 'чек');
    ed2.blockMenu.onKey(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    ok(ed2.editable.querySelector('ul.ted-checklist'), 'через «/»');
  });
  test('Markdown: «[] », «[ ] » и «[x] » → чек-лист', () => {
    for (const s of ['[]', '[ ]', '[x]']) {
      const ed = make('<p></p>');
      select(ed, 0, 0);
      for (const ch of s) document.execCommand('insertText', false, ch);
      document.execCommand('insertText', false, ' ');
      ok(ed.editable.querySelector('ul.ted-checklist'), `${s}: ${ed.editable.innerHTML}`);
    }
  });
  test('клик по галочке переключает пункт, клик по тексту — нет; Undo возвращает', () => {
    const ed = make(CL);
    const item = li(ed, 1);
    const r = item.getBoundingClientRect();
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 10, clientY: r.top + 10 }));
    ok(item.classList.contains('ted-checked'), 'отмечен');
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 80, clientY: r.top + 10 }));
    ok(item.classList.contains('ted-checked'), 'клик по тексту не меняет');
    ed.history.undo();
    ok(!li(ed, 1).classList.contains('ted-checked'), 'отмена');
  });
  test('Ctrl+Enter переключает пункт под курсором', () => {
    const ed = make(CL);
    select(ed, 0, 1);
    const target = ed.checklistItem(getSelection().getRangeAt(0).startContainer);
    ok(target, 'курсор в пункте чек-листа');
    press(ed, { key: 'Enter', ctrlKey: true });
    ok(!li(ed, 0).classList.contains('ted-checked'), 'снята галочка с первого пункта');
    press(ed, { key: 'Enter', ctrlKey: true });
    ok(li(ed, 0).classList.contains('ted-checked'), 'поставлена обратно');
  });
  test('пустой пункт не отмечается; новый пункт по Enter не наследует галочку', () => {
    const ed = make('<ul class="ted-checklist"><li class="ted-checked">Раз</li></ul>');
    ed.editable.querySelector('ul').appendChild(Object.assign(document.createElement('li'), { innerHTML: '<br>' }));
    ed.editable.querySelectorAll('li')[1].classList.add('ted-checked');
    ok(!ed.toggleChecklistItem(ed.editable.querySelectorAll('li')[1]), 'пустой пункт не переключается');
    ed.editable.dispatchEvent(new Event('input'));   // нормализация при вводе
    ok(!ed.editable.querySelectorAll('li')[1].classList.contains('ted-checked'), 'у пустого пункта галочка снята при нормализации');
  });
  test('Tab вкладывает пункт, вложенный список остаётся чек-листом при сохранении', () => {
    const ed = make('<ul class="ted-checklist"><li class="ted-checked">Раз</li><li>Два</li></ul>');
    select(ed, 0, 1);
    const second = ed.editable.querySelectorAll('li')[1];
    const r = document.createRange();
    r.setStart(second.firstChild, 1);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    press(ed, { key: 'Tab' });
    ok(html(ed).includes('ted-checked'), html(ed));
  });

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`вид по макету: ${width} px, ${theme}`, () => {
        const ed = make('<ul class="ted-checklist"><li class="ted-checked">Раз</li><li>Два</li></ul>', {}, { width, theme });
        const a = li(ed, 0);
        const b = li(ed, 1);
        const box = getComputedStyle(a, '::before');
        eq([box.width, box.height].join(' '), '20px 20px', 'check-box size=s: рамка 24, значок 20');
        eq(getComputedStyle(a).paddingLeft, '32px', 'чек-бокс 24 + зазор 8');
        eq(Math.round(a.getBoundingClientRect().height), 32, 'строка 32 px');
        eq(getComputedStyle(a, '::before').backgroundColor, 'rgb(25, 117, 247)', 'отмечено — акцент');
        eq(getComputedStyle(b, '::before').backgroundColor, 'rgb(145, 149, 153)', 'не отмечено — серая рамка');
        eq(getComputedStyle(a).color, theme === 'dark' ? 'rgb(237, 243, 250)' : 'rgb(77, 77, 77)', 'цвет текста по теме');
        ok(Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom) >= 8, 'зазор между пунктами 12 (мобильный 8)');
        ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, 'без переполнения');
      });
    }
  }
  test('в просмотре чек-лист выглядит так же, галочка не переключается кликом', () => {
    const ed = make(CL, { preview: 'inline' });
    ed.setMode('view');
    const v = ed.preview.content.querySelector('ul.ted-checklist > li.ted-checked');
    ok(v, 'пункт в просмотре');
    eq(getComputedStyle(v, '::before').width, '20px');
    v.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: v.getBoundingClientRect().left + 5 }));
    ok(v.classList.contains('ted-checked'), 'в просмотре клик ничего не меняет');
  });
});

group('Чек-лист: чек-бокс 24, взаимодействие, пункты', () => {
  const CL = '<ul class="ted-checklist"><li class="ted-checked">Раз</li><li>Два</li><li>Три</li></ul><p>после</p>';
  const items = (ed) => Array.from(ed.editable.querySelectorAll('ul.ted-checklist > li'));
  const press = (ed, o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));
  const move = (li, x) => { const r = li.getBoundingClientRect(); li.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + x, clientY: r.top + 12 })); };

  test('курсор-рука и hover только над чек-боксом, в тексте обычный курсор', () => {
    const ed = make(CL);
    const li = items(ed)[0];
    move(li, 10);
    eq(ed.editable.style.cursor, 'pointer', 'над чек-боксом рука');
    eq(li.getAttribute('data-tedui-cb'), 'hover');
    eq(getComputedStyle(li, '::before').backgroundColor, 'rgb(99, 161, 247)', 'hover отмеченного: main/color1/light');
    move(li, 80);
    eq(ed.editable.style.cursor, '', 'над текстом курсор текстовый');
    ok(!li.hasAttribute('data-tedui-cb'), 'hover снят');
  });
  test('нажатие: press-цвета как у check-box, клик переключает, Undo возвращает', () => {
    const ed = make(CL);
    const li = items(ed)[1];
    const r = li.getBoundingClientRect();
    li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 10, clientY: r.top + 10 }));
    ok(li.classList.contains('ted-checked'), 'отмечено');
    eq(li.getAttribute('data-tedui-cb'), 'press');
    eq(getComputedStyle(li, '::before').backgroundColor, 'rgb(20, 97, 204)', 'press отмеченного #1461CC');
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    eq(li.getAttribute('data-tedui-cb'), 'hover', 'после отпускания — hover');
    ed.history.undo();
    ok(!items(ed)[1].classList.contains('ted-checked'), 'Undo');
  });
  test('Enter в конце пункта переходит к следующему, в последнем создаёт новый; заглушка «Пункт»', () => {
    const ed = make(CL);
    const d = items(ed)[0].firstChild;
    const rg = document.createRange();
    rg.setStart(d, d.data.length);
    rg.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(rg);
    ed.focus();
    press(ed, { key: 'Enter' });
    eq(items(ed).length, 3, 'новый пункт не создан');
    ok(items(ed)[1].contains(getSelection().anchorNode), 'курсор во втором пункте');
    const ed2 = make('<p></p>');
    select(ed2, 0, 0);
    ed2.blockMenu.openPicker(blocks(ed2)[0]);
    ed2.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="checklist"]').click();
    ed2.updatePlaceholders();
    eq(ed2.editable.querySelector('li').getAttribute('data-tedui-ph'), 'Пункт', 'заглушка пункта чек-листа');
  });
  test('новый блок: один пустой пункт', () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="checklist"]').click();
    eq(items(ed).length, 1);
  });
  test('рамка только при перетаскивании (2 px, поле 4), кнопки пункта в углу и не пропадают; без «Добавить пункт»', () => {
    const ed = make(CL);
    ed.focus();
    select(ed, 0, 0);
    const li = items(ed)[1];
    const rg = document.createRange();
    rg.setStart(li.firstChild, 1);
    rg.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(rg);
    ed.updateState();
    eq(getComputedStyle(li).outlineStyle, 'none', 'в фокусе рамки нет');
    const box = ed.handle.itemControls;
    ok(box.classList.contains('is-visible'), 'кнопки видны');
    const c = box.getBoundingClientRect();
    const r = li.getBoundingClientRect();
    ok((c.left >= r.right - 1 || Math.abs(r.right - c.right) <= 1) && Math.abs(c.top - r.top) <= 1, 'в правом верхнем углу пункта');
    eq(getComputedStyle(box).gap, '2px');
    ed.handle.startDrag(li, r.top, Array.from(li.parentNode.children));
    const cs = getComputedStyle(li);
    eq([cs.outlineWidth, cs.outlineColor, cs.outlineOffset].join(' '), '2px rgb(99, 161, 247) 2px', 'рамка при перетаскивании');
    ok(box.classList.contains('is-visible'), 'кнопки не пропадают при перетаскивании');
    ed.handle.onDrag({ clientY: items(ed)[2].getBoundingClientRect().bottom + 10 });
    ed.handle.endDrag();
    eq(items(ed).map((x) => x.textContent).join('|'), 'Раз|Три|Два', 'порядок изменился');
    ed.history.undo();
    eq(items(ed).map((x) => x.textContent).join('|'), 'Раз|Два|Три', 'Undo');
    ok(!ed.ui.querySelector('.ted-ui-additem'), 'кнопки «Добавить пункт» нет');
  });
  test('корзина пункта удаляет пункт; последний — заменяется абзацем', () => {
    const ed = make(CL);
    ed.focus();
    const li = items(ed)[1];
    const rg = document.createRange();
    rg.setStart(li.firstChild, 1);
    rg.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(rg);
    ed.updateState();
    ed.handle.itemTrash.click();
    eq(items(ed).length, 2);
    ed.history.undo();
    eq(items(ed).length, 3, 'Undo');
  });

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`чек-бокс 24 и ширина колонки: ${width} px, ${theme}`, () => {
        const ed = make(CL, {}, { width, theme });
        const li = items(ed)[0];
        const b = getComputedStyle(li, '::before');
        eq([b.width, b.height, b.left].join(' '), '20px 20px 2px', 'значок 20 в рамке 24');
        const r = li.getBoundingClientRect();
        eq(Math.round(r.height), 32, 'строка 32');
        eq(getComputedStyle(li).paddingLeft, '32px', '24 + зазор 8');
        const p = ed.editable.querySelector('p').getBoundingClientRect();
        ok(Math.abs(p.width - r.width) <= 1, 'ширина как у колонки');
      });
    }
  }
});

group('Чек-лист: заглушка пустого пункта видна', () => {
  for (const theme of THEMES) {
    test(`заглушка «Пункт» рисуется, чек-бокс на месте: ${theme}`, () => {
      const ed = make('<p></p>', {}, { theme });
      select(ed, 0, 0);
      ed.blockMenu.openPicker(blocks(ed)[0]);
      ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="checklist"]').click();
      ed.updatePlaceholders();
      const li = ed.editable.querySelector('ul.ted-checklist > li');
      const a = getComputedStyle(li, '::after');
      eq(a.content, '"Пункт"', 'текст заглушки');
      eq(a.left, '32px', 'у текста пункта');
      eq(a.color, theme === 'dark' ? 'rgb(145, 149, 153)' : 'rgb(218, 223, 229)', 'цвет заглушки');
      const b = getComputedStyle(li, '::before');
      eq([b.width, b.height, b.left, b.top].join(' '), '20px 20px 2px 6px', 'чек-бокс не сломан заглушкой');
    });
  }
});
