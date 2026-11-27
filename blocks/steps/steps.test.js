// Тесты блока «Шаги» (blocks/steps, этап 5). Свои — реестр, меню, JSON, наборы; ниже — перенесённые прежние тесты из tests/sizes.test.js.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { Ted, make, blocks, select, pop, html, tagOf } from '../../tests/helpers.js';
import { blockDef, defOf } from '../../resources/js/core/registry.js';
import { menuGroups, styleTypes, kindOf } from '../../resources/js/core/blocks.js';
import { insertBlock } from '../../tests/interaction/samples.js';

const WIDTHS = [1000, 860, 768, 414];
const THEMES = ['light', 'dark'];
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(50); } return fn(); };
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; };
const flat = (h) => h.replace(/>\s+</g, '><');

group('Блок «Шаги» (blocks/steps)', () => {
  test('в реестре; «Списки» четвёртым, «Стиль текста» после чек-листа', () => {
    eq(defOf(el('<ol class="ted-steps"><li><strong>а</strong><br>б</li></ol>')).type, 'steps');
    eq(menuGroups().find((g) => g.title === 'Списки').items[3].type, 'steps');
    const st = styleTypes().map((t) => t.type);
    eq(st[st.indexOf('checklist') + 1], 'steps');
  });
  test('JSON { title, text }; в наборе без шагов — нумерованный список', () => {
    eq(flat(Ted.fromBlocks([{ type: 'steps', items: [{ title: 'Т', text: 'О' }] }])), '<ol class="ted-steps"><li><strong>Т</strong><br>О</li></ol>');
    ok(flat(Ted.clean('<ol class="ted-steps"><li><strong>Т</strong><br>О</li></ol>', { blocks: ['p', 'ol'] })).startsWith('<ol><li>'));
  });
  test('«Все блоки → Шаги»: один пустой шаг, курсор в заголовке', () => {
    const ed = make('<p>до</p>');
    const made = insertBlock(ed, 'steps');
    ok(made && made.matches('ol.ted-steps') && made.children.length === 1, made && made.outerHTML);
    ed.destroy();
  });
});

// ---- перенесено из tests/sizes.test.js (прежние тесты, без изменений) ----

group('Шаги', () => {
  const ST = '<ol class="ted-steps"><li><strong>Выберите товар</strong><br>Откройте каталог.</li><li><strong>Добавьте в корзину</strong></li><li><strong>Оформите заказ</strong><br>Выберите доставку.</li></ol>';

  test('санитайзер: класс шагов только у ol, разметка заголовок + описание сохраняется', () => {
    const out = Ted.clean(ST + '<ul class="ted-steps"><li>х</li></ul>');
    ok(out.includes('<ol class="ted-steps">') && out.includes('<li><strong>Выберите товар</strong><br>Откройте каталог.</li>'), out);
    ok(!out.includes('<ul class="ted-steps"'), 'у ul класса нет');
  });
  test('загрузка и сохранение: без служебных атрибутов', () => {
    const ed = make(ST);
    ok(html(ed).includes('<ol class="ted-steps">'), html(ed));
    ok(!html(ed).includes('data-tedui'));
    eq(ed.state.type === 'p' || ed.state.type === 'steps', true);
  });
  test('превращение: абзацы → шаги (заголовки жирным) → абзацы; список ↔ шаги', () => {
    const ed = make('<p>один</p><p>два</p>');
    select(ed, 0, 0);
    ed.exec('block:steps');
    ok(html(ed).includes('<ol class="ted-steps">') && html(ed).includes('<strong>один</strong>'), html(ed));
    eq(ed.state.type, 'steps', 'вид блока для меню «Стиль»');
    ed.exec('block:steps');
    eq(tagOf(ed), 'p', 'повторно — обратно в абзац');
    ed.exec('block:ol');
    ok(html(ed).includes('<ol>') && !html(ed).includes('ted-steps'), html(ed));
    ed.exec('block:steps');
    ok(html(ed).includes('ted-steps'), 'нумерованный → шаги');
  });
  test('меню «Стиль текста», плитка и «/»: пункт «Шаги» готов и вставляет блок с пустым шагом', () => {
    const ed = make('<p>один</p>');
    select(ed, 0, 1);
    ed.toolbar.styleBtn.click();
    ok(Array.from(pop(ed).querySelectorAll('.ted-ui-item__label')).some((n) => n.textContent === 'Шаги'), 'в меню «Стиль»');
    ed.popover.close();
    ed.toolbar.allBlocksBtn.click();
    const tile = ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="steps"]');
    ok(!tile.classList.contains('is-soon') && tile.querySelector('.ted-steps li strong'), 'живая миниатюра');
    tile.click();
    ok(ed.editable.querySelector('ol.ted-steps > li > strong'), html(ed));
    const ed2 = make('<p></p>');
    select(ed2, 0, 0);
    document.execCommand('insertText', false, '/');
    document.execCommand('insertText', false, 'шаг');
    ed2.blockMenu.onKey(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    ok(ed2.editable.querySelector('ol.ted-steps'), 'через «/»');
  });
  // клавиши — через обработчик редактора (раньше тест вызывал команды браузера в обход него: в WebKit они ведут себя иначе)
  test('заголовок шага — одна строка: Shift+Enter в нём ничего не делает, Enter — в описание, Enter в описании — новый шаг', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Шаг</strong></li></ol>');
    const key = (o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, ...o }));
    const strong = ed.editable.querySelector('strong');
    ed.editable.focus();
    const r = document.createRange();
    r.setStart(strong.firstChild, strong.firstChild.length);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    key({ shiftKey: true });
    eq(ed.editable.querySelector('strong').innerHTML, 'Шаг', 'Shift+Enter не разрезал заголовок');
    key({});
    const li = ed.editable.querySelector('li');
    ok(!li.querySelector('strong').contains(getSelection().anchorNode), 'Enter в заголовке — курсор в описании');
    document.execCommand('insertText', false, 'описание');
    eq(ed.editable.querySelector('strong').textContent, 'Шаг', 'описание не попало в заголовок');
    ok(li.textContent.includes('описание'), 'описание в том же шаге');
    eq(ed.editable.querySelectorAll('li').length, 1);
    key({});
    eq(ed.editable.querySelectorAll('li').length, 2, 'Enter в описании — новый шаг');
  });

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`вид по макету: ${width} px, ${theme}`, () => {
        const ed = make(ST, {}, { width, theme });
        const items = ed.editable.querySelectorAll('ol.ted-steps > li');
        const n = getComputedStyle(items[0], '::before');
        eq([n.width, n.height, n.borderRadius].join(' '), '40px 40px 12px', 'номер 40 × 40, r12');
        eq(n.backgroundColor, 'rgb(25, 117, 247)', 'плашка акцента');
        eq(n.content, 'counter(ted-step)', 'номер из счётчика');
        eq(getComputedStyle(items[2], '::before').content, 'counter(ted-step)');
        eq(getComputedStyle(items[0]).paddingLeft, '56px', 'номер 40 + зазор 16');
        const t = getComputedStyle(items[0].querySelector('strong'));
        eq([t.fontSize, t.fontWeight].join(' '), '16px 700', 'заголовок 16 / 700');
        eq(t.color, theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(38, 38, 38)', 'цвет заголовка по теме');
        eq(getComputedStyle(items[0]).fontSize, '13px', 'описание 13 px');
        ok(getComputedStyle(items[0], '::after').width === '2px', 'линия 2 px у не последнего шага');
        eq(getComputedStyle(items[0], '::after').backgroundColor, theme === 'dark' ? 'rgb(77, 77, 77)' : 'rgb(218, 223, 229)', 'цвет линии по теме');
        eq(getComputedStyle(items[2], '::after').content, 'none', 'у последнего шага линии нет');
        ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, 'без переполнения');
      });
    }
  }
  test('в просмотре шаги выглядят так же', () => {
    const ed = make(ST, { preview: 'inline' });
    ed.setMode('view');
    const li = ed.preview.content.querySelector('ol.ted-steps > li');
    eq(getComputedStyle(li, '::before').width, '40px');
  });
});

group('Шаги: ввод, заглушки, рамка, кнопки, линия', () => {
  const press = (ed, o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));
  const lis = (ed) => Array.from(ed.editable.querySelectorAll('ol.ted-steps > li'));
  const type = (s) => document.execCommand('insertText', false, s);
  const ST = '<ol class="ted-steps"><li><strong>Выберите товар</strong><br>Откройте каталог.</li><li><strong>Добавьте в корзину</strong><br>Проверьте опции.</li><li><strong>Оформите заказ</strong><br>Выберите доставку.</li></ol><p>после</p>';
  const fresh = () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="steps"]').click();
    return ed;
  };

  test('новый блок: один пустой шаг с заглушками «Шаг» и «Описание шага», курсор в заголовке первого', () => {
    const ed = fresh();
    eq(lis(ed).length, 1, 'один шаг, остальные создаются Enter');
    const li = lis(ed)[0];
    eq(getComputedStyle(li.firstElementChild, '::before').content, '"Шаг"');
    eq(getComputedStyle(li.firstElementChild, '::after').content, '"Описание шага"');
    eq(getComputedStyle(li.firstElementChild, '::before').color, 'rgb(218, 223, 229)', 'text-icon/gray/light');
    ok(lis(ed)[0].contains(getSelection().anchorNode), 'курсор в первом шаге');
    ok(!ed.getInnerHTML().includes('ted-steps'), 'пустые шаги в сохранение не попадают: ' + ed.getInnerHTML());
  });
  test('Enter в заголовке переводит в описание, Enter в описании — новый шаг', () => {
    const ed = fresh();
    type('Выберите товар');
    press(ed, { key: 'Enter' });
    type('Откройте каталог');
    press(ed, { key: 'Enter' });
    type('Добавьте в корзину');
    eq(lis(ed).length, 2, 'в последнем шаге Enter в конце описания создаёт новый шаг');
    const out = ed.getInnerHTML();
    ok(out.includes('<li><strong>Выберите товар</strong><br>Откройте каталог</li>'), out);
    ok(out.includes('<li><strong>Добавьте в корзину</strong></li>'), out);
    const last = make('<ol class="ted-steps"><li><strong>А</strong><br>Б</li></ol>');
    last.caretToStepDescription(last.editable.querySelector('li'));
    last.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const rr = document.createRange(); const d = last.editable.querySelector('li').lastChild; rr.setStart(d, d.data.length); rr.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rr);
    press(last, { key: 'Enter' });
    eq(last.editable.querySelectorAll('li').length, 2, 'в последнем шаге Enter создаёт новый шаг');
    ok(!out.includes('​'), 'служебные нулевые пробелы не сохраняются');
  });
  test('пустой заголовок: Enter и описание — в сохранённом виде заголовка нет, описание поднимается', () => {
    const ed = make('<p></p>', { preview: 'inline' });
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="steps"]').click();
    press(ed, { key: 'Enter' });
    type('Только описание');
    const out = ed.getInnerHTML();
    ok(out.includes('<li>Только описание</li>') && !out.includes('<strong>'), out);
    ed.setMode('view');
    const v = ed.preview.content.querySelector('ol.ted-steps > li');
    const li = v.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(v);
    ok(Math.abs(range.getBoundingClientRect().top - li.top) < 6, 'текст описания у верха шага, пустого места под заголовок нет');
    eq(getComputedStyle(v, '::before').width, '40px');
  });
  test('Enter на пустом последнем шаге выходит из блока, Backspace в пустом шаге удаляет его', () => {
    const ST2 = ST.replace('<br>Выберите доставку.', '');
    const ed = make(ST2);
    ed.caretToStepTitleEnd(lis(ed)[2]);
    press(ed, { key: 'Enter' });
    press(ed, { key: 'Enter' });
    eq(lis(ed).length, 4, 'сначала новый шаг');
    press(ed, { key: 'Enter' });
    press(ed, { key: 'Enter' });
    eq(lis(ed).length, 3, 'пустой последний шаг убран');
    ok(ed.editable.querySelector('ol + p'), 'ниже абзац');
    const ed2 = make(ST2);
    ed2.caretToStepTitleEnd(lis(ed2)[2]);
    press(ed2, { key: 'Enter' });
    press(ed2, { key: 'Enter' });
    eq(lis(ed2).length, 4);
    ed2.caretToStepTitleEnd(lis(ed2)[3]);
    press(ed2, { key: 'Backspace' });
    eq(lis(ed2).length, 3, 'пустой шаг удалён Backspace');
  });
  test('Backspace в начале описания возвращает курсор в заголовок и ничего не склеивает', () => {
    const ed = make(ST);
    ed.caretToStepDescription(lis(ed)[1]);
    press(ed, { key: 'Backspace' });
    eq(lis(ed).length, 3);
    ok(lis(ed)[1].firstElementChild.contains(getSelection().anchorNode), 'курсор в заголовке');
    eq(lis(ed)[1].firstElementChild.textContent, 'Добавьте в корзину');
  });
  test('активный шаг: рамки нет, справа ручка и корзина (углы −0, зазор 2, значки 16), кнопки «Добавить шаг» нет', () => {
    const ed = make(ST);
    ed.focus();
    ed.caretToStepTitleEnd(lis(ed)[1]);
    ed.updateState();
    const li = lis(ed)[1];
    ok(li.hasAttribute('data-tedui-item'), 'активный шаг помечен');
    eq(getComputedStyle(li).outlineStyle, 'none', 'рамка только при перетаскивании');
    const box = ed.handle.itemControls;
    const c = box.getBoundingClientRect();
    const r = li.getBoundingClientRect();
    ok(box.classList.contains('is-visible'), 'кнопки видны');
    eq(getComputedStyle(box).gap, '2px', 'между кнопками 2');
    eq([Math.round(c.width), Math.round(c.height)].join('x'), '50x24', 'две кнопки по 24 и зазор 2');
    ok((c.left >= r.right - 1 || Math.abs(r.right - c.right) <= 1) && Math.abs(c.top - r.top) <= 1, 'кнопки в правом верхнем углу (рамка на 4 px вокруг шага, от неё 4 px)');
    const svg = getComputedStyle(box.querySelector('svg'));
    eq([svg.width, svg.height].join(' '), '16px 16px', 'значки 16, как у блоков');
    ok(!ed.ui.querySelector('.ted-ui-additem'), 'кнопки «Добавить шаг» нет');
  });
  test('ширина блока шагов — по ширине колонки, как у других блоков', () => {
    const ed = make('<p>абзац</p>' + ST);
    const p = ed.editable.querySelector('p').getBoundingClientRect();
    const ol = ed.editable.querySelector('ol').getBoundingClientRect();
    ok(Math.abs(p.width - ol.width) <= 1, `абзац ${p.width}, шаги ${ol.width}`);
    eq(Math.round(lis(ed)[0].getBoundingClientRect().width), Math.round(ol.width));
  });
  test('у шагов, чек-листа и цифр нет цветного фона: класс не сохраняется, команда и кнопка недоступны', () => {
    for (const src of ['<ol class="ted-steps ted-bg-gray"><li><strong>а</strong></li></ol>', '<ul class="ted-checklist ted-bg-color1"><li>а</li></ul>']) {
      ok(!Ted.clean(src).includes('ted-bg-'), Ted.clean(src));
    }
    const ed = make(ST);
    select(ed, 0, 0);
    ed.caretToStepTitleEnd(lis(ed)[0]);
    ed.updateState();
    ok(!ed.toolbar.colorParts().canBgMenu, 'фона нет в меню «Цвет» (цвет текста — есть, 1.0.4)');
    ed.exec('bg:gray');
    ok(!ed.editable.querySelector('[class*="ted-bg-"]'), 'фон не поставился');
    const p = make('<p class="ted-bg-gray">а</p>');
    p.exec('block:steps');
    ok(!p.editable.querySelector('[class*="ted-bg-"]'), 'при превращении фон снимается: ' + p.editable.innerHTML);
  });
  test('корзина шага удаляет шаг, Undo возвращает; последний шаг заменяется абзацем', () => {
    const ed = make(ST);
    ed.focus();
    ed.caretToStepTitleEnd(lis(ed)[1]);
    ed.updateState();
    ed.handle.itemTrash.click();
    eq(lis(ed).length, 2);
    ed.history.undo();
    eq(lis(ed).length, 3, 'Undo');
    const ed2 = make('<ol class="ted-steps"><li><strong>Один</strong></li></ol>');
    ed2.focus();
    ed2.caretToStepTitleEnd(lis(ed2)[0]);
    ed2.updateState();
    ed2.handle.itemTrash.click();
    ok(!ed2.editable.querySelector('ol'), 'блока шагов нет');
  });
  test('перетаскивание шага меняет порядок, рамка у шага; Undo возвращает', () => {
    const ed = make(ST);
    ed.focus();
    ed.caretToStepTitleEnd(lis(ed)[0]);
    ed.updateState();
    const first = lis(ed)[0];
    ed.handle.startDrag(first, first.getBoundingClientRect().top, Array.from(first.parentNode.children));
    ok(first.hasAttribute('data-tedui-drag'));
    const cs = getComputedStyle(first);
    eq([cs.outlineWidth, cs.outlineColor, cs.outlineOffset].join(' '), '2px rgb(99, 161, 247) 2px', 'рамка 2 px, вокруг шага 4 px');
    ok(ed.handle.itemControls.classList.contains('is-visible'), 'кнопки не пропадают при перетаскивании');
    ed.handle.onDrag({ clientY: lis(ed)[2].getBoundingClientRect().bottom + 20 });
    const cb = ed.handle.itemControls.getBoundingClientRect();
    ok(Math.abs(cb.top - first.getBoundingClientRect().top) <= 1 && ed.handle.itemControls.classList.contains('is-visible'), 'кнопки идут за шагом');
    ed.handle.endDrag();
    eq(lis(ed).map((l) => l.firstElementChild.textContent).join('|'), 'Добавьте в корзину|Оформите заказ|Выберите товар');
    ed.history.undo();
    eq(lis(ed)[0].firstElementChild.textContent, 'Выберите товар', 'Undo');
  });

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`линия вплотную к плашкам, заглушки: ${width} px, ${theme}`, () => {
        const ed = make(ST, {}, { width, theme });
        const items = lis(ed);
        for (let i = 0; i < items.length - 1; i += 1) {
          const a = items[i].getBoundingClientRect();
          const b = items[i + 1].getBoundingClientRect();
          const line = getComputedStyle(items[i], '::after');
          eq(Math.round((b.top - a.bottom) * 10) / 10, 0, 'шаги без зазора');
          ok(Math.abs(parseFloat(line.top) + parseFloat(line.height) - a.height) <= 0.6, `линия до низа шага (${line.top} + ${line.height} из ${a.height})`);
          eq(parseFloat(line.top), 40, 'линия начинается под плашкой (40)');
        }
        const ed2 = make(ST, {}, { width, theme });
        const first = ed2.editable.querySelector('li');
        first.replaceChildren(Object.assign(document.createElement('strong'), { innerHTML: '<br>' }), document.createElement('br'), document.createTextNode(String.fromCharCode(8203)));
        ed2.updatePlaceholders();
        const t = getComputedStyle(lis(ed2)[0].firstElementChild, '::before');
        eq(t.color, theme === 'dark' ? 'rgb(145, 149, 153)' : 'rgb(218, 223, 229)', 'цвет заглушки по теме');
        eq([t.fontSize, t.fontWeight].join(' '), '16px 700', 'заглушка заголовка 16 / 700');
        const d = getComputedStyle(lis(ed2)[0].firstElementChild, '::after');
        eq([d.fontSize, d.fontWeight].join(' '), '13px 400', 'заглушка описания 13 / 400');
        ok(ed2.ui.scrollWidth <= ed2.ui.clientWidth + 1, 'без переполнения');
      });
    }
  }
});

group('Шаги: кнопки шага не остаются без шага', () => {
  const ST = '<ol class="ted-steps"><li><strong>Один</strong><br>описание</li><li><strong>Два</strong></li></ol><p>после</p>';
  const shown = (ed) => ed.handle.itemControls.classList.contains('is-visible');
  const start = (html = ST) => {
    const ed = make(html);
    ed.focus();
    ed.caretToStepTitleEnd(ed.editable.querySelector('ol.ted-steps > li'));
    ed.updateState();
    return ed;
  };

  test('кнопки видны у шага в правке', () => {
    ok(shown(start()));
  });
  test('блок шагов удалён (выделить всё и удалить, Undo/«Удалить блок») — кнопок нет', () => {
    const ed = start();
    ed.editable.querySelector('ol').remove();
    ed.afterChange({ immediate: true });
    ok(!shown(ed), 'после удаления блока кнопки скрыты');
    const ed2 = start();
    ed2.handle.remove(ed2.editable.querySelector('ol'));
    ok(!shown(ed2), 'после «Удалить блок»');
    const ed3 = start();
    ed3.handle.itemTrash.click();
    ed3.handle.itemTrash.click();
    ok(!shown(ed3) || ed3.editable.querySelector('ol'), 'после удаления шагов');
  });
  test('курсор ушёл в другой блок — кнопок нет', () => {
    const ed = start();
    select(ed, 1, 0);
    ed.updateState();
    ok(!shown(ed));
  });
  test('фокус потерян — кнопки скрываются', async () => {
    const ed = start();
    ed.editable.blur();
    getSelection().removeAllRanges();
    ed.editable.dispatchEvent(new Event('blur'));
    ok(await until(() => !shown(ed)), 'кнопки скрыты после потери фокуса');
  });
  test('просмотр и «Очистить всё» — кнопок нет', async () => {
    const ed = start();
    ed.setMode('view');
    ok(!shown(ed), 'в просмотре');
    const ed2 = make(ST, { preview: 'inline' });
    ed2.focus();
    ed2.caretToStepTitleEnd(ed2.editable.querySelector('li'));
    ed2.updateState();
    ed2.editable.replaceChildren(document.createElement('p'));
    ed2.afterChange({ immediate: true });
    ok(!shown(ed2), 'после замены содержимого');
  });
});

group('Шаги: «Жирный» в заголовке', () => {
  test('Ctrl+B / кнопка «Жирный» в заголовке шага не удаляют заголовок', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Заголовок</strong><br>описание</li></ol>');
    ed.focus();
    const t = ed.editable.querySelector('strong');
    const r = document.createRange();
    r.selectNodeContents(t);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.exec('bold');
    eq(ed.getInnerHTML().includes('<strong>Заголовок</strong><br>описание'), true, ed.getInnerHTML());
  });
});

group('Шаги: Enter переходит к следующему шагу', () => {
  test('в конце описания при наличии следующего шага Enter не создаёт новый, а ставит курсор в его заголовок', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Один</strong><br>раз</li><li><strong>Два</strong><br>два</li></ol>');
    ed.focus();
    const d = ed.editable.querySelector('li').lastChild;
    const r = document.createRange();
    r.setStart(d, d.data.length);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    eq(ed.editable.querySelectorAll('li').length, 2, 'шагов по-прежнему два');
    ok(ed.editable.querySelectorAll('li')[1].firstElementChild.contains(getSelection().anchorNode), 'курсор во втором заголовке');
  });
});

group('Шаги: Enter в середине описания (сайт texted 27.11, 1.0.4)', () => {
  const enterAt = (ed, li, offset) => {
    ed.focus();
    const d = li.lastChild;
    const r = document.createRange();
    r.setStart(d, offset);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  };
  test('хвост описания уходит в описание нового шага (не в жирный заголовок), курсор — в пустой заголовок нового шага', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Один</strong><br>начало и конец</li><li><strong>Два</strong><br>два</li></ol>', {}, { width: 1000 });
    enterAt(ed, ed.editable.querySelector('li'), 7);
    const lis = ed.editable.querySelectorAll('li');
    eq(lis.length, 3);
    eq(ed.stepDescription(lis[0]), 'начало ', 'в первом шаге — начало описания');
    eq(lis[1].firstElementChild.textContent.replace(/​/g, ''), '', 'заголовок нового шага пуст');
    eq(ed.stepDescription(lis[1]), 'и конец', 'хвост — в описании нового шага');
    ok(lis[1].firstElementChild.contains(getSelection().anchorNode) || getSelection().anchorNode === lis[1].firstElementChild, 'курсор в заголовке нового шага');
  });
  test('Enter в начале описания: у шага остаётся пустое описание со строкой — высота шага не проседает, шаги не наезжают', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Один</strong><br>описание</li><li><strong>Два</strong><br>два</li></ol>', {}, { width: 1000 });
    const first = ed.editable.querySelector('li');
    const before = first.getBoundingClientRect().height;
    enterAt(ed, first, 0);
    const lis = ed.editable.querySelectorAll('li');
    eq(ed.stepDescription(lis[1]), 'описание', 'описание ушло в новый шаг');
    eq(Math.round(lis[0].getBoundingClientRect().height), Math.round(before), 'шаг с пустым описанием той же высоты');
    eq(ed.getHTML().includes('<strong>описание</strong>'), false, 'описание не стало заголовком');
  });
});

group('Шаги: Enter в заголовке (сайт texted 27.11, 1.0.4)', () => {
  const at = (ed, node, offset) => {
    ed.focus();
    const r = document.createRange(); r.setStart(node, offset); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  };
  test('посреди заголовка: новый шаг с хвостом заголовка и описанием, текст не склеивается', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Выберите блок</strong><br>Описание</li></ol>', {}, { width: 1000 });
    at(ed, ed.editable.querySelector('strong').firstChild, 9);
    const lis = ed.editable.querySelectorAll('li');
    eq(lis.length, 2);
    eq(lis[0].querySelector('strong').textContent.trim(), 'Выберите');
    eq(ed.stepDescription(lis[0]), '', 'у первого шага описание пустое');
    eq(lis[1].querySelector('strong').textContent, 'блок', 'хвост — заголовок нового шага');
    eq(ed.stepDescription(lis[1]), 'Описание', 'описание переехало вместе с хвостом');
    ok(!ed.getHTML().includes('блокОписание'), 'ничего не склеилось');
  });
  test('в начале заголовка: пустой шаг перед этим; в конце — курсор в описание', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Шаг</strong><br>д</li></ol>', {}, { width: 1000 });
    at(ed, ed.editable.querySelector('strong').firstChild, 0);
    const lis = ed.editable.querySelectorAll('li');
    eq(lis.length, 2);
    eq(lis[1].querySelector('strong').textContent, 'Шаг', 'шаг остался с заголовком');
    const ed2 = make('<ol class="ted-steps"><li><strong>Шаг</strong><br>д</li></ol>', {}, { width: 1000 });
    at(ed2, ed2.editable.querySelector('strong').firstChild, 3);
    eq(ed2.editable.querySelectorAll('li').length, 1, 'в конце заголовка шаг не делится');
    ok(!ed2.editable.querySelector('strong').contains(getSelection().anchorNode), 'курсор в описании');
  });
});
