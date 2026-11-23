// Тесты блока «Текст» (blocks/p, этап 5.2): описание из папки — меню, «Стиль текста», клавиша, подсказка, JSON, вид.
import { group, test, eq, ok } from '../../tests/harness.js';
import { make, select, blocks, Ted } from '../../tests/helpers.js';
import { blockDef } from '../../src/core/registry.js';
import { menuGroups, styleTypes, placeholderOf } from '../../src/core/blocks.js';
import { HOTKEYS } from '../../src/core/keys.js';

group('Блок «Текст» (blocks/p)', () => {
  test('в реестре: текстовый блок, меню «Текст» после h4, первый в «Стиле текста»', () => {
    const d = blockDef('p');
    ok(d && d.text && !d.object, 'текстовый, не объект');
    const g = menuGroups().find((x) => x.title === 'Текст').items.map((i) => i.type).join(',');
    eq(g, 'h2,h3,h4,p,blockquote,pre', 'порядок группы «Текст» — как в макете editor-menu');
    eq(styleTypes()[0].type, 'p');
    eq(styleTypes().map((t) => t.type).join(','), 'p,h2,h3,h4,h5,h6,ul,ol,checklist,steps,blockquote,pre', 'список «Стиль текста» — прежний порядок');
  });

  test('Ctrl+Shift+0 превращает блок в абзац; клавиша в справке на прежнем месте (после «Ссылка»)', () => {
    const i = HOTKEYS.findIndex((k) => k.cmd === 'block:p');
    ok(i > 0 && HOTKEYS[i - 1].cmd === 'link', 'место в справке');
    const ed = make('<h2>Заголовок</h2>');
    ed.focus();
    select(ed, 0, 2);
    ed.exec('block:p');
    eq(blocks(ed)[0].tagName, 'P');
    ed.destroy();
  });

  test('подсказка пустого абзаца; опция placeholder её заменяет', () => {
    ok(placeholderOf('p').startsWith('Введите «/»'));
    const ed = make('<p><br></p>');
    ed.focus();
    select(ed, 0, 0);
    ed.updateState();
    ok((blocks(ed)[0].getAttribute('data-tedui-ph') || '').startsWith('Введите'), 'подсказка стоит');
    ed.destroy();
    const own = make('<p><br></p>', { placeholder: 'Пишите здесь' });
    own.focus();
    select(own, 0, 0);
    own.updateState();
    eq(blocks(own)[0].getAttribute('data-tedui-ph'), 'Пишите здесь');
    own.destroy();
  });

  test('JSON: текст экранируется, выравнивание и фон — только из списка', () => {
    eq(Ted.fromBlocks([{ type: 'p', text: 'a <b>\nb', align: 'center', bg: 'gray' }]), '<p class="ted-align-center ted-bg-gray">a &lt;b&gt;<br>b</p>');
    eq(Ted.fromBlocks([{ type: 'p', text: 'x', align: 'evil', bg: 'red' }]), '<p>x</p>');
  });

  test('очистка: классы выравнивания и фона остаются, чужие — нет; в любом наборе абзац есть', () => {
    eq(Ted.clean('<p class="ted-align-right x" style="color:red">т</p>'), '<p class="ted-align-right">т</p>');
    ok(Ted.clean('<p>т</p>', { preset: 'text' }).includes('<p>т</p>'));
  });

  test('вид: шрифт, размер и цвет абзаца — от .ted-content (сброс сайта не меняет)', () => {
    const ed = make('<p>т</p>', {}, { width: 1000 });
    const cs = getComputedStyle(blocks(ed)[0]);
    eq(`${cs.fontSize} ${cs.lineHeight} ${cs.color} ${cs.fontWeight}`, '16px 24px rgb(77, 77, 77) 400');
    ed.destroy();
  });
});
