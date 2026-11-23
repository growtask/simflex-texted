// Тесты блока «Заголовок» (blocks/heading, этап 5.3): семейство h2–h6 — меню, «Стиль текста», клавиши, подсказка, JSON, вид.
import { group, test, eq, ok } from '../../tests/harness.js';
import { make, select, blocks, Ted } from '../../tests/helpers.js';
import { blockDef } from '../../src/core/registry.js';
import { menuGroups, placeholderOf } from '../../src/core/blocks.js';
import { HOTKEYS } from '../../src/core/keys.js';

const LEVELS = ['h2', 'h3', 'h4', 'h5', 'h6'];

group('Блок «Заголовок» (blocks/heading)', () => {
  test('пять видов из одной папки; в меню «/» — h2, h3, h4', () => {
    for (const t of LEVELS) ok(blockDef(t) && blockDef(t).text, t);
    const g = menuGroups().find((x) => x.title === 'Текст').items.map((i) => i.type);
    ok(g.includes('h2') && g.includes('h4') && !g.includes('h5'), g.join(','));
  });

  test('Ctrl+Shift+2…6 превращают абзац в заголовок; клавиши в справке подряд после «Обычный текст»', () => {
    const i = HOTKEYS.findIndex((k) => k.cmd === 'block:p');
    eq(HOTKEYS.slice(i, i + 6).map((k) => k.cmd).join(','), 'block:p,block:h2,block:h3,block:h4,block:h5,block:h6');
    for (const t of LEVELS) {
      const ed = make('<p>текст</p>');
      ed.focus();
      select(ed, 0, 2);
      ed.exec(`block:${t}`);
      eq(blocks(ed)[0].tagName.toLowerCase(), t);
      ed.destroy();
    }
  });

  test('подсказка «Заголовок»; в наборе text заголовок становится абзацем', () => {
    for (const t of LEVELS) eq(placeholderOf(t), 'Заголовок');
    eq(Ted.clean('<h3>Раздел</h3>', { preset: 'text' }), '<p>Раздел</p>');
  });

  test('JSON: якорь — только латиница, цифры, «_», «-»', () => {
    eq(Ted.fromBlocks([{ type: 'h3', text: 'Раздел', anchor: 'razdel-1' }]), '<h3 id="razdel-1">Раздел</h3>');
    eq(Ted.fromBlocks([{ type: 'h2', text: 'x', anchor: 'a" onclick="1' }]), '<h2>x</h2>');
  });

  test('вид по макету: 700, высота строки 1, цвет gray/darker; размеры 42/28/24/20/16 на 1000', () => {
    const ed = make(LEVELS.map((t) => `<${t}>З</${t}>`).join(''), {}, { width: 1000 });
    const out = blocks(ed).map((h) => { const cs = getComputedStyle(h); return `${cs.fontSize}/${cs.lineHeight}/${cs.fontWeight}`; });
    eq(out.join(' '), '42px/42px/700 28px/28px/700 24px/24px/700 20px/20px/700 16px/16px/700');
    eq(getComputedStyle(blocks(ed)[0]).color, 'rgb(38, 38, 38)');
    ed.destroy();
  });
});
