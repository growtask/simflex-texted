// Тесты блока «Список» / «Нумерованный список» (blocks/list, этап 5.8). Свои — реестр, меню, клавиши, наборы, JSON, вид;
// ниже — перенесённые прежние тесты списков из tests/sizes.test.js.
import { group, test, eq, ok } from '../../tests/harness.js';
import { Ted, make, blocks, select, pop, html } from '../../tests/helpers.js';
import { blockDef, defOf } from '../../src/core/registry.js';
import { menuGroups, styleTypes, kindOf } from '../../src/core/blocks.js';
import { HOTKEYS } from '../../src/core/keys.js';

const el = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; };

group('Блок «Список» (blocks/list)', () => {
  test('в реестре ul и ol; чек-лист, шаги, цифры, плюсы и минусы — не списки', () => {
    eq(defOf(el('<ul><li>a</li></ul>')).type, 'ul');
    eq(defOf(el('<ol start="3"><li>a</li></ol>')).type, 'ol');
    eq(defOf(el('<ul class="ted-bg-gray"><li>a</li></ul>')).type, 'ul');
    for (const h of ['<ul class="ted-checklist"></ul>', '<ol class="ted-steps"></ol>', '<ul class="ted-facts"></ul>', '<ul class="ted-proscons"></ul>']) {
      const d = defOf(el(h));
      ok(!d || !/^(ul|ol)$/.test(d.type), h);
      ok(!/^(ul|ol)$/.test(kindOf(el(h))), h);
    }
  });

  test('меню «Списки»: Список, Нумерованный, Чек-лист, Шаги; «Стиль текста»: после цитаты? — порядок 60 / 70', () => {
    eq(menuGroups().find((g) => g.title === 'Списки').items.map((i) => i.type).slice(0, 4).join(','), 'ul,ol,checklist,steps');
    const st = styleTypes().map((t) => t.type);
    eq(st.slice(st.indexOf('ul'), st.indexOf('ul') + 4).join(','), 'ul,ol,checklist,steps');
  });

  test('клавиши Ctrl+Shift+7 / 8 на прежнем месте справки: после заголовков, перед цитатой', () => {
    const cmds = HOTKEYS.map((k) => k.cmd);
    const i = cmds.indexOf('block:h6');
    eq(cmds.slice(i, i + 4).join(','), 'block:h6,block:ol,block:ul,block:blockquote');
    const ed = make('<p>текст</p>');
    select(ed, 0, 1);
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: '8', code: 'Digit8', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    eq(blocks(ed)[0].tagName, 'UL');
    ed.destroy();
  });

  test('очистка: у ol остаётся start; JSON ul / ol; в наборе без списков — абзацы', () => {
    const flat = (h) => h.replace(/>\s+</g, '><');
    eq(flat(Ted.clean('<ol start="3" reversed type="a"><li>а</li></ol>')), '<ol start="3"><li>а</li></ol>');
    eq(flat(Ted.fromBlocks([{ type: 'ul', items: ['а', 'б'] }, { type: 'ol', items: ['в'] }])), '<ul><li>а</li><li>б</li></ul><ol><li>в</li></ol>');
    eq(Ted.clean('<ul><li>а</li><li>б</li></ul>', { blocks: ['p'] }), '<p>а</p>\n<p>б</p>');
  });

  test('вид: отступ слева, маркер disc / decimal, вложенный — circle / lower-alpha', () => {
    const ed = make('<ul><li>а<ul><li>б</li></ul></li></ul><ol><li>в<ol><li>г</li></ol></li></ol>', {}, { width: 1000 });
    const [ul, ol] = blocks(ed);
    eq(getComputedStyle(ul).listStyleType + ' ' + getComputedStyle(ul.querySelector('ul')).listStyleType, 'disc circle');
    eq(getComputedStyle(ol).listStyleType + ' ' + getComputedStyle(ol.querySelector('ol')).listStyleType, 'decimal lower-alpha');
    ok(parseFloat(getComputedStyle(ul).paddingLeft) > 0);
    ed.destroy();
  });
});

// ---- перенесено из tests/sizes.test.js (прежние тесты, без изменений) ----

group('Списки в меню блоков и «/»', () => {
  const pick = (ed, type) => {
    ed.toolbar.allBlocksBtn.click();
    ed.blockMenu.picker.panel.querySelector(`.ted-ui-tile[data-type="${type}"]`).click();
  };
  test('плитки «Список» и «Нумерованный список» — в группе «Списки», готовые (живая миниатюра)', () => {
    const ed = make('<p>а</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    const p = ed.blockMenu.picker;
    const grp = Array.from(p.panel.querySelectorAll('.ted-ui-picker__group')).find((g) => g.querySelector('.ted-ui-picker__label').textContent === 'Списки');
    eq(Array.from(grp.querySelectorAll('.ted-ui-tile__name')).map((n) => n.textContent).join('|'), 'Список|Нумерованный список|Чек-лист|Шаги');
    for (const t of ['ul', 'ol']) {
      const tile = p.panel.querySelector(`.ted-ui-tile[data-type="${t}"]`);
      ok(!tile.classList.contains('is-soon') && tile.querySelector(`.ted-ui-tile__sample ${t} li`), `${t}: живая миниатюра`);
    }
    ed.blockMenu.closePicker();
  });
  test('плитка вставляет маркированный и нумерованный список с пустым пунктом', () => {
    const ed = make('<p>один</p>');
    select(ed, 0, 1);
    pick(ed, 'ul');
    eq(blocks(ed)[1].tagName.toLowerCase(), 'ul');
    ok(blocks(ed)[1].querySelector('li'), 'есть пункт');
    pick(ed, 'ol');
    ok(blocks(ed).some((b) => b.tagName === 'OL'), html(ed));
  });
  test('меню «/»: пункты «Список» и «Нумерованный список», поиск по слову', () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    document.execCommand('insertText', false, '/');
    ok(ed.blockMenu.isOpen, 'меню открылось');
    const names = Array.from(pop(ed).querySelectorAll('.ted-ui-item__label')).map((n) => n.textContent);
    ok(names.includes('Список') && names.includes('Нумерованный список'), names.join('|'));
    document.execCommand('insertText', false, 'нумер');
    const left = Array.from(pop(ed).querySelectorAll('.ted-ui-item__label')).map((n) => n.textContent);
    eq(left.join('|'), 'Нумерованный список');
    ed.blockMenu.close();
  });
  test('«/» + «Список» превращает пустой абзац в список', () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    document.execCommand('insertText', false, '/');
    document.execCommand('insertText', false, 'спис');
    ed.blockMenu.onKey(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    eq(blocks(ed)[0].tagName.toLowerCase(), 'ul');
  });
  test('поиск плиток по «список» находит оба списка', () => {
    const ed = make('<p>а</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    const p = ed.blockMenu.picker;
    p.input.value = 'список';
    p.input.dispatchEvent(new Event('input'));
    const names = Array.from(p.panel.querySelectorAll('.ted-ui-tile__name')).map((n) => n.textContent);
    ok(names.includes('Список') && names.includes('Нумерованный список'), names.join('|'));
    ed.blockMenu.closePicker();
  });
});
