// Тесты блока «Плюсы и минусы» (blocks/proscons, этап 5). Свои — реестр, меню, JSON, наборы; ниже — перенесённые прежние тесты из tests/sizes.test.js.
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

group('Блок «Плюсы и минусы» (blocks/proscons)', () => {
  test('в реестре; меню «Акцент» после цифр', () => {
    eq(defOf(el('<ul class="ted-proscons"><li class="ted-pros"><strong>П</strong><ul><li>а</li></ul></li></ul>')).type, 'proscons');
    const a = menuGroups().find((g) => g.title === 'Акцент').items.map((i) => i.type);
    eq(a[a.indexOf('facts') + 1], 'proscons');
  });
  test('новый блок из меню: две карточки по три пустых пункта, курсор в заголовке плюсов', () => {
    const ed = make('<p>до</p>');
    const made = insertBlock(ed, 'proscons');
    ok(made && made.matches('ul.ted-proscons'), made && made.outerHTML);
    eq(Array.from(made.children).map((c) => c.className + ':' + c.querySelectorAll('ul > li').length).join(' '), 'ted-pros:3 ted-cons:3');
    ed.destroy();
  });
  test('JSON pros / cons; в наборе без блока — заголовки и пункты списками', () => {
    eq(flat(Ted.fromBlocks([{ type: 'proscons', pros: { items: ['а'] }, cons: { title: 'Против', items: ['б'] } }])),
      '<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>а</li></ul></li><li class="ted-cons"><strong>Против</strong><ul><li>б</li></ul></li></ul>');
    const out = flat(Ted.clean('<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>а</li></ul></li></ul>', { blocks: ['p', 'ul'] }));
    ok(!out.includes('ted-proscons') && out.includes('<li>а</li>'), out);
  });
});

// ---- перенесено из tests/sizes.test.js (прежние тесты, без изменений) ----

group('Ключевые цифры, плюсы и минусы: ввод, заглушки, кнопки', () => {
  const press = (ed, o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));
  const type = (s) => document.execCommand('insertText', false, s);
  const F = '<ul class="ted-facts"><li><strong>120+</strong><br>стран</li><li><strong>4.8</strong><br>оценка</li></ul><p>после</p>';
  const P = '<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Раз</li><li>Два</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Три</li></ul></li></ul><p>после</p>';
  const cards = (ed) => Array.from(ed.editable.querySelectorAll('ul.ted-facts > li'));
  const fresh = (kind) => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector(`.ted-ui-tile[data-type="${kind}"]`).click();
    return ed;
  };

  test('цифры: новый блок — две пустые плитки с заглушками «0» и «Подпись»', () => {
    const ed = fresh('facts');
    eq(cards(ed).length, 2);
    const s = cards(ed)[1].firstElementChild;
    eq(getComputedStyle(s, '::before').content, '"0"');
    eq(getComputedStyle(s, '::after').content, '"Подпись"');
    eq(getComputedStyle(s, '::before').color, 'rgb(145, 149, 153)', 'заглушка «0» читается на плашке');
    ok(!ed.getInnerHTML().includes('ted-facts'), 'пустые плитки не сохраняются');
  });
  test('цифры: Enter из значения → подпись → следующая плитка; в последней создаёт новую до четырёх', () => {
    const ed = make(F);
    ed.focus();
    ed.caretToStepTitleEnd(cards(ed)[0]);
    press(ed, { key: 'Enter' });
    const d0 = cards(ed)[0].lastChild;
    const r0 = document.createRange();
    r0.setStart(d0, d0.data.length);
    r0.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r0);
    press(ed, { key: 'Enter' });
    eq(cards(ed).length, 2, 'переход к следующей, новая не создана');
    ok(cards(ed)[1].contains(getSelection().anchorNode), 'курсор во второй плитке');
    ed.caretToStepDescription(cards(ed)[1]);
    const d = cards(ed)[1].lastChild;
    const r = document.createRange();
    r.setStart(d, d.data.length);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    press(ed, { key: 'Enter' });
    eq(cards(ed).length, 3, 'в последней — новая плитка');
    ed.caretToStepDescription(cards(ed)[2]);
    type('x');
    press(ed, { key: 'Enter' });
    eq(cards(ed).length, 4);
    type('y');
    ed.caretToStepDescription(cards(ed)[3]);
    press(ed, { key: 'Enter' });
    eq(cards(ed).length, 5, 'пятая плитка — вторая строка сетки');
  });
  test('цифры: корзина удаляет плитку, при двух плитках корзины нет; рамка при перетаскивании, кнопки в углу', () => {
    const ed = make(F.replace('</ul>', '<li><strong>24/7</strong><br>поддержка</li></ul>'));
    ed.focus();
    ed.caretToStepTitleEnd(cards(ed)[1]);
    ed.updateState();
    const box = ed.handle.itemControls;
    ok(box.classList.contains('is-visible'));
    const r = cards(ed)[1].getBoundingClientRect();
    const c = box.getBoundingClientRect();
    ok(Math.abs(r.right - c.right) <= 1 && Math.abs(r.top - c.bottom - 4) <= 1, 'кнопки рядом с плиткой: над её правым верхним углом');
    eq(getComputedStyle(cards(ed)[1]).outlineStyle, 'none', 'в фокусе рамки нет');
    ed.handle.itemTrash.click();
    eq(cards(ed).length, 2);
    ed.caretToStepTitleEnd(cards(ed)[0]);
    ed.updateState();
    ok(ed.handle.itemTrash.hidden, 'при двух плитках корзина убрана');
    ed.history.undo();
    eq(cards(ed).length, 3, 'Undo');
  });
  test('цифры: перетаскивание плитки меняет порядок, рамка 2 px', () => {
    const ed = make(F);
    ed.focus();
    ed.caretToStepTitleEnd(cards(ed)[0]);
    ed.updateState();
    const first = cards(ed)[0];
    ed.handle.startDrag(first, first.getBoundingClientRect().top, Array.from(first.parentNode.children));
    const cs = getComputedStyle(first);
    eq([cs.outlineWidth, cs.outlineColor].join(' '), '2px rgb(99, 161, 247)');
    ok(ed.handle.itemControls.classList.contains('is-visible'), 'кнопки остаются');
    ed.handle.endDrag(true);
  });
  test('плюсы и минусы: новый блок — по три пункта, заглушки «Пункт» #919599', () => {
    const ed = fresh('proscons');
    eq(ed.editable.querySelectorAll('ul.ted-proscons li li').length, 6);
    const card = ed.editable.querySelector('ul.ted-proscons > li');
    eq(getComputedStyle(card.firstElementChild, '::before').content, '"Пункт"');
    eq(getComputedStyle(card.firstElementChild, '::before').color, 'rgb(145, 149, 153)');
    const item = card.querySelector('li li');
    eq(getComputedStyle(item, '::after').content, '"Пункт"');
    eq(getComputedStyle(item, '::before').width, '24px', 'значок на месте');
    ok(!ed.getInnerHTML().includes('ted-proscons'), 'пустой блок не сохраняется: ' + ed.getInnerHTML().replace(/</g, '&lt;'));
  });
  test('плюсы и минусы: Enter из заголовка → в пункт, в конце пункта → следующий, в последнем — новый', () => {
    const ed = make(P);
    ed.focus();
    const t = ed.editable.querySelector('li.ted-pros > strong');
    const r = document.createRange();
    r.setStart(t.firstChild, t.firstChild.length);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    press(ed, { key: 'Enter' });
    ok(ed.editable.querySelector('li.ted-pros > ul > li').contains(getSelection().anchorNode), 'курсор в первом пункте');
    press(ed, { key: 'Enter' });
    eq(ed.editable.querySelectorAll('li.ted-pros > ul > li').length, 2, 'переход к следующему без нового');
    press(ed, { key: 'Enter' });
    eq(ed.editable.querySelectorAll('li.ted-pros > ul > li').length, 3, 'в последнем — новый пункт');
    press(ed, { key: 'Enter' });
    eq(ed.editable.querySelectorAll('li.ted-pros > ul > li').length, 2, 'пустой хвост после заполненных пунктов убран');
    ok(ed.editable.querySelector('li.ted-cons > strong').contains(getSelection().anchorNode), 'курсор в заголовке «Минусов», а не в пункте');
    ok(ed.editable.querySelector('li.ted-cons').contains(getSelection().anchorNode), 'курсор в «Минусах»');
  });
  test('плюсы и минусы: рамка пункта при перетаскивании, кнопки в углу, корзина; последний пункт очищается', () => {
    const ed = make(P);
    ed.focus();
    const li = ed.editable.querySelector('li.ted-pros > ul > li');
    const r = document.createRange();
    r.setStart(li.firstChild, 1);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    ok(ed.handle.itemControls.classList.contains('is-visible'));
    eq(getComputedStyle(li).outlineStyle, 'none');
    ed.handle.startDrag(li, li.getBoundingClientRect().top, Array.from(li.parentNode.children));
    eq(getComputedStyle(li).outlineColor, 'rgb(99, 161, 247)');
    ed.handle.endDrag(true);
    const cons = ed.editable.querySelector('li.ted-cons > ul > li');
    const r2 = document.createRange();
    r2.setStart(cons.firstChild, 1);
    r2.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r2);
    ed.updateState();
    ed.handle.itemTrash.click();
    eq(ed.editable.querySelectorAll('li.ted-cons > ul > li').length, 1, 'последний пункт остаётся');
    eq(ed.editable.querySelector('li.ted-cons > ul > li').textContent, '', 'но очищен');
  });
  test('Bold в плитке цифр не действует: кнопка убрана', () => {
    const ed = make(F);
    ed.focus();
    ed.caretToStepTitleEnd(cards(ed)[0]);
    ed.updateState();
    ok(ed.toolbar.marks.bold.hidden);
  });
});

group('Плюсы и минусы меняются местами; заглушка на цветном фоне', () => {
  const P = '<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Раз</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Два</li></ul></li></ul>';
  test('карточку можно перетащить: ручка у заголовка, без корзины, порядок меняется, Undo возвращает', () => {
    const ed = make(P);
    ed.focus();
    const t = ed.editable.querySelector('li.ted-pros > strong');
    const r = document.createRange();
    r.setStart(t.firstChild, 2);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    ok(ed.handle.itemControls.classList.contains('is-visible'), 'кнопки у карточки');
    ok(ed.handle.itemTrash.hidden, 'корзины нет — карточки не удаляются');
    const card = ed.editable.querySelector('li.ted-pros');
    const c = ed.handle.itemControls.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    ok(Math.abs(cr.top - c.bottom - 4) <= 1 && Math.abs(cr.right - c.right) <= 1, 'над правым верхним углом карточки');
    const cards = Array.from(card.parentNode.children);
    const other = cards[1].getBoundingClientRect();
    ed.handle.startDrag(card, cr.top, cards, cr.left);
    ed.handle.onDrag({ clientX: other.left + other.width / 2, clientY: other.top + other.height / 2 });
    ed.handle.endDrag();
    eq(Array.from(ed.editable.querySelectorAll('ul.ted-proscons > li')).map((x) => x.className).join(','), 'ted-cons,ted-pros', 'порядок изменился');
    eq(getComputedStyle(ed.editable.querySelector('li.ted-pros > ul > li'), '::before').backgroundColor, 'rgb(14, 140, 14)', 'зелёная галочка остаётся у плюсов');
    ed.history.undo();
    eq(ed.editable.querySelector('ul.ted-proscons > li').className, 'ted-pros', 'Undo');
  });
  test('заглушка на цветном фоне видна на всех трёх подложках', () => {
    for (const cls of ['ted-bg-gray', 'ted-bg-color1', 'ted-bg-color2']) {
      const ed = make(`<p class="${cls}">а</p>`);
      const p = ed.editable.querySelector('p');
      p.replaceChildren(document.createElement('br'));
      ed.focus();
      select(ed, 0, 0);
      ed.updatePlaceholders();
      eq(getComputedStyle(p, '::before').color, 'rgb(145, 149, 153)', `${cls}: заглушка #919599`);
    }
  });
});

group('Раунд 7: плюсы и минусы — Enter, Delete, Backspace не ломают структуру; подпись цифр у низа', () => {
  const press = (ed, o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));
  const P = '<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Раз</li><li>Два</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Три</li></ul></li></ul><p>после</p>';
  const shape = (ed) => Array.from(ed.editable.querySelectorAll('ul.ted-proscons > li')).map((c) => c.firstElementChild.tagName + ':' + c.querySelectorAll(':scope > ul > li').length).join(' ');
  const at = (node, off) => {
    const r = document.createRange();
    r.setStart(node, off);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  };
  const fresh = () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="proscons"]').click();
    return ed;
  };

  test('Enter по пустым заглушкам ничего не удаляет и доходит до выхода из блока', () => {
    const ed = fresh();
    ed.focus();
    const items = () => ed.editable.querySelectorAll('ul.ted-proscons li li').length;
    eq(items(), 6);
    // Enter — пока курсор не выйдет из блока (дальше Enter в абзаце создаёт новые строки, 23.11)
    const out = () => !ed.editable.querySelector('ul.ted-proscons').contains(getSelection().anchorNode);
    for (let i = 0; i < 12 && !out(); i += 1) press(ed, { key: 'Enter' });
    eq(items(), 6, 'ни одна заглушка не пропала');
    eq(ed.editable.querySelectorAll('ul.ted-proscons').length, 1, 'блок один');
    eq(shape(ed), 'STRONG:3 STRONG:3');
    ok(ed.editable.querySelector('ul.ted-proscons + p'), 'ниже есть абзац');
    ok(ed.editable.querySelector('ul.ted-proscons + p').contains(getSelection().anchorNode) || ed.editable.querySelector('ul.ted-proscons').nextElementSibling.contains(getSelection().anchorNode), 'курсор в абзаце под блоком');
    ok(ed.editable.querySelectorAll('ul.ted-proscons + p').length === 1 && ed.editable.children.length <= 3, 'пустые абзацы не плодятся: ' + ed.editable.children.length);
  });
  test('Enter в единственном пустом пункте последней карточки выходит из блока', () => {
    const ed = make('<ul class="ted-proscons"><li class="ted-pros"><strong>П</strong><ul><li>а</li></ul></li><li class="ted-cons"><strong>М</strong><ul><li>б</li></ul></li></ul>');
    ed.focus();
    const li = ed.editable.querySelector('li.ted-cons li');
    li.replaceChildren(document.createElement('br'));
    at(li, 0);
    press(ed, { key: 'Enter' });
    ok(ed.editable.querySelector('ul.ted-proscons + p'), 'абзац под блоком: ' + ed.editable.innerHTML);
    ok(ed.editable.lastElementChild.contains(getSelection().anchorNode), 'курсор в нём');
  });
  test('Delete в конце последнего пункта и заголовка не склеивает карточки', () => {
    const ed = make(P);
    ed.focus();
    const two = ed.editable.querySelectorAll('li.ted-pros li')[1];
    at(two.firstChild, 3);
    press(ed, { key: 'Delete' });
    eq(shape(ed), 'STRONG:2 STRONG:1', 'после Delete в конце пункта: ' + ed.editable.innerHTML);
    const t = ed.editable.querySelector('li.ted-pros > strong');
    at(t.firstChild, t.firstChild.length);
    press(ed, { key: 'Delete' });
    eq(shape(ed), 'STRONG:2 STRONG:1', 'после Delete в конце заголовка');
    eq(t.textContent, 'Плюсы');
  });
  test('Backspace в начале заголовка и первого пункта не втягивает текст в заголовок', () => {
    const ed = make(P);
    ed.focus();
    const first = ed.editable.querySelector('li.ted-pros li');
    at(first.firstChild, 0);
    press(ed, { key: 'Backspace' });
    eq(ed.editable.querySelector('li.ted-pros > strong').textContent, 'Плюсы', 'заголовок цел');
    eq(first.textContent, 'Раз');
    const t = ed.editable.querySelector('li.ted-cons > strong');
    at(t.firstChild, 0);
    press(ed, { key: 'Backspace' });
    eq(t.textContent, 'Минусы');
  });
  test('лишнюю (третью) карточку можно удалить корзиной, две основные — нет', () => {
    const ed = make(P.replace('</ul><p>', '<li class="ted-pros"><strong>Ещё</strong><ul><li>x</li></ul></li></ul><p>'));
    ed.focus();
    const li = ed.editable.querySelector('ul.ted-proscons > li:nth-child(3)');
    at(li.querySelector('strong').firstChild, 1);
    ed.updateState();
    ok(!ed.handle.itemTrash.hidden, 'корзина у лишней карточки');
    ed.handle.itemTrash.click();
    eq(ed.editable.querySelectorAll('ul.ted-proscons > li').length, 2);
    at(ed.editable.querySelector('li.ted-pros > strong').firstChild, 1);
    ed.updateState();
    ok(ed.handle.itemTrash.hidden, 'у двух основных корзины нет');
  });
});

group('Плюсы и минусы: серые заглушки не остаются после перехода', () => {
  const press = (ed, o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));
  test('Enter из последнего заполненного пункта → новый пустой; ещё Enter → в заголовок следующей карточки, хвост убран, серого «Пункт» нет', () => {
    const ed = make('<ul class="ted-proscons"><li class="ted-pros"><strong>П</strong><ul><li>а</li><li>б</li></ul></li><li class="ted-cons"><strong>М</strong><ul><li>в</li></ul></li></ul>');
    ed.focus();
    const last = ed.editable.querySelectorAll('li.ted-pros li')[1];
    const r = document.createRange();
    r.setStart(last.firstChild, 1);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    press(ed, { key: 'Enter' });
    eq(ed.editable.querySelectorAll('li.ted-pros li').length, 3, 'новый пункт');
    ed.updatePlaceholders();
    ok(ed.editable.querySelectorAll('li.ted-pros li')[2].hasAttribute('data-tedui-empty'), 'в новом пункте заглушка, пока курсор в нём');
    press(ed, { key: 'Enter' });
    eq(ed.editable.querySelectorAll('li.ted-pros li').length, 2, 'пустой хвост убран');
    ok(ed.editable.querySelector('li.ted-cons > strong').contains(getSelection().anchorNode), 'курсор в заголовке красной карточки');
    ed.updatePlaceholders();
    eq(ed.editable.querySelectorAll('li.ted-pros li[data-tedui-empty]').length, 0, 'серых заглушек нет');
  });
  test('пустые хвосты после заполненных пунктов не светятся серым, у полностью пустой карточки заглушки есть', () => {
    const ed = make('<ul class="ted-proscons"><li class="ted-pros"><strong>П</strong><ul><li>а</li><li><br></li></ul></li><li class="ted-cons"><strong>М</strong><ul><li>в</li></ul></li></ul>');
    ed.updatePlaceholders();
    eq(ed.editable.querySelectorAll('li.ted-pros li[data-tedui-empty]').length, 0);
    const ed2 = make('<p></p>');
    select(ed2, 0, 0);
    ed2.blockMenu.openPicker(blocks(ed2)[0]);
    ed2.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="proscons"]').click();
    ed2.updatePlaceholders();
    eq(ed2.editable.querySelectorAll('ul.ted-proscons li li[data-tedui-empty]').length, 6, 'в новом блоке заглушки у всех шести');
  });
});
