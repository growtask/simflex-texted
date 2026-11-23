// Тесты блока «Разделитель» (blocks/hr, этап 5.1). Общий слой взаимодействия (рамка, кнопки, перетаскивание) проверяют
// наборы layer и drag по всем блокам — здесь только своё: меню, вставка, Markdown, клавиша, очистка, наборы, JSON, вид.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, select, blocks, Ted } from '../../tests/helpers.js';
import { blockDef, defOf } from '../../src/core/registry.js';
import { menuGroups } from '../../src/core/blocks.js';
import { HOTKEYS } from '../../src/core/keys.js';
import { frameKind } from '../../src/ui/handle.js';
import { insertBlock } from '../../tests/interaction/samples.js';

const tags = (ed) => blocks(ed).map((b) => b.tagName.toLowerCase()).join(',');
const key = (ed, init) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

group('Блок «Разделитель» (blocks/hr)', () => {
  test('в реестре: описание из block.json, свой элемент, другое имя separator', () => {
    const d = blockDef('hr');
    ok(d, 'блок зарегистрирован');
    eq(d.title, 'Разделитель');
    eq(blockDef('separator'), d, 'другое имя');
    ok(d.object && d.outline, 'без текста, рамка обводкой');
    eq(defOf(document.createElement('hr')), d);
    eq(defOf(document.createElement('div')), null);
  });

  test('меню «/» и «Все блоки»: в группе «Макет» после «Колонки», без «Превратить в…»', () => {
    const g = menuGroups().find((x) => x.title === 'Макет');
    const types = g.items.map((i) => i.type);
    eq(types.indexOf('hr'), types.indexOf('columns') + 1, types.join(','));
    eq(g.items.find((i) => i.type === 'hr').convert, false);
    const ed = make('<p>а</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    const tile = ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="hr"]');
    ok(tile && tile.querySelector('.ted-ui-tile__sample hr'), 'плитка с живым образцом линии');
    ed.blockMenu.closePicker();
    ed.destroy();
  });

  test('вставка из меню: пустой абзац становится линией, за ней — абзац для курсора', () => {
    const ed = make('<p>текст</p><p><br></p>');
    insertBlock(ed, 'hr');   // как по плитке меню (общий способ тестов слоя)
    eq(tags(ed), 'p,hr,p');
    ed.destroy();
  });

  test('Markdown «---» + Enter вставляет линию; в наборе без линии — остаётся текстом', () => {
    const ed = make('<p>---</p>');
    ed.focus();
    select(ed, 0, 3);
    key(ed, { key: 'Enter', code: 'Enter' });
    ok(tags(ed).startsWith('hr'), tags(ed));
    ed.destroy();
    const t = make('<p>---</p>', { preset: 'text' });
    t.focus();
    select(t, 0, 3);
    key(t, { key: 'Enter', code: 'Enter' });
    ok(!t.editable.querySelector('hr'), 'в наборе text линии нет');
    t.destroy();
  });

  test('Ctrl+Shift+− вставляет линию; клавиша — в справке один раз, после «Повторить»; в наборе без линии не действует', () => {
    const list = HOTKEYS.filter((k) => k.cmd === 'insert:hr');
    eq(list.length, 1, 'одна клавиша');
    const i = HOTKEYS.indexOf(list[0]);
    eq(HOTKEYS[i - 1].cmd, 'redo');
    const ed = make('<p>текст</p>');
    ed.focus();
    select(ed, 0, 2);
    ed.exec('insert:hr');
    eq(tags(ed), 'p,hr,p');
    ed.destroy();
    const m = make('<p>текст</p>', { preset: 'mini' });
    m.focus();
    select(m, 0, 2);
    m.exec('insert:hr');
    ok(!m.editable.querySelector('hr'), 'mini без линии');
    m.destroy();
  });

  test('выбранная линия: панель «line», нет «Превратить в…»; Backspace за линией выделяет её, второй — удаляет (проверка 22.11)', async () => {
    const ed = make('<p>до</p><hr><p>после</p>');
    ed.selectObject(blocks(ed)[1]);
    ed.updateState();
    eq(ed.toolbar.variant, 'line');
    eq(ed.state.canEdit, false);
    ed.focus();
    select(ed, 2, 0);
    key(ed, { key: 'Backspace', code: 'Backspace' });
    eq(tags(ed), 'p,hr,p', 'первый Backspace — линия выделена');
    key(ed, { key: 'Backspace', code: 'Backspace' });
    eq(tags(ed), 'p,p');
    ed.destroy();
  });

  test('очистка: у линии нет атрибутов и содержимого (вставка, загрузка); сервер даёт то же', () => {
    eq(Ted.clean('<hr class="x" style="border:1px solid red" onclick="alert(1)" id="a1">'), '<hr>');
    eq(Ted.clean('<p>а</p><hr><p>б</p>'), '<p>а</p>\n<hr>\n<p>б</p>');
  });

  test('наборы: в mini и text линия исчезает (как на сервере — block.json → degrade: drop), в full остаётся', () => {
    eq(Ted.clean('<p>а</p><hr><p>б</p>', { preset: 'text' }), '<p>а</p>\n<p>б</p>');
    ok(Ted.clean('<hr>', { preset: 'full' }).includes('<hr>'));
    ok(Ted.clean('<hr>', { blocks: ['separator'] }).includes('<hr>'), 'другое имя в списке блоков');
  });

  test('Ted.fromBlocks: { type: "hr" } → <hr>; вид есть в Ted.blockJsonTypes', () => {
    eq(Ted.fromBlocks([{ type: 'p', text: 'а' }, { type: 'hr' }]), '<p>а</p>\n<hr>');
    ok(Ted.blockJsonTypes.includes('hr'));
  });

  test('вид на сайте и в правке: 2 px, main/gray/lighter, скругление; рамка выделения и перетаскивания — обводкой', async () => {
    const ed = make('<p>а</p><hr><p>б</p>', {}, { width: 1000 });
    const hr = blocks(ed)[1];
    const cs = getComputedStyle(hr);
    eq(`${cs.height} ${cs.backgroundColor} ${cs.borderTopWidth}`, '2px rgb(237, 243, 250) 0px', 'светлая: main/gray/lighter (Figma block-line)');
    eq(`${cs.marginTop} ${cs.marginBottom} ${cs.marginLeft} ${cs.paddingTop}`, '0px 20px 0px 0px', 'отступы: сверху 0, снизу общий ритм 20 (макет: 2 + 20 = 22)');
    const site = document.createElement('div');
    site.className = 'ted-content';
    site.innerHTML = '<p>а</p><hr><p>б</p>';
    document.body.append(site);
    const scs = getComputedStyle(site.querySelector('hr'));
    eq(`${scs.marginTop} ${scs.marginBottom} ${scs.height}`, '0px 20px 2px', 'на сайте — так же');
    site.remove();
    const dark = make('<hr>', { theme: 'dark' }, { width: 1000 });
    eq(getComputedStyle(dark.editable.querySelector('hr')).backgroundColor, 'rgb(77, 77, 77)', 'тёмная: main/gray/dark (Figma block-line, theme=dark)');
    dark.destroy();
    ed.handle.select(hr);
    eq(hr.getAttribute('data-tedui-frame'), 'outline', 'выбрана — рамка обводкой');
    document.getAnimations().forEach((a) => a.finish());
    ok(/0px 0px 0px 8px/.test(getComputedStyle(hr).boxShadow), getComputedStyle(hr).boxShadow);
    ed.handle.select(null);
    ok(!hr.hasAttribute('data-tedui-frame'), 'признак снят');
    hr.setAttribute('data-tedui-drag', '');
    frameKind(hr, true);
    document.getAnimations().forEach((a) => a.finish());
    ok(/0px 0px 4px 9px/.test(getComputedStyle(hr).boxShadow), 'перетаскивание: обводка и свечение');
    ed.destroy();
  });

  test('ручка ⠿ при наведении — по центру линии (handleAt: middle)', async () => {
    const ed = make('<p>а</p><hr><p>б</p>', {}, { width: 1000 });
    const hr = blocks(ed)[1];
    ed.handle.showGutter ? ed.handle.showGutter(hr) : ed.handle.hover && ed.handle.hover(hr);
    await wait(30);
    const g = ed.handle.gutter.getBoundingClientRect();
    const r = hr.getBoundingClientRect();
    ok(Math.abs((g.top + g.bottom) / 2 - (r.top + r.bottom) / 2) <= 3, `центр ручки ${(g.top + g.bottom) / 2} и линии ${(r.top + r.bottom) / 2}`);
    ed.destroy();
  });
});
