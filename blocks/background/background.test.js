// Тесты блока «Цветной фон» (blocks/background, этап 5.6).
import { group, test, eq, ok } from '../../tests/harness.js';
import { make, blocks, Ted } from '../../tests/helpers.js';
import { blockDef, defOf } from '../../src/core/registry.js';
import { menuGroups, kindOf } from '../../src/core/blocks.js';
import { insertBlock } from '../../tests/interaction/samples.js';

group('Блок «Цветной фон» (blocks/background)', () => {
  test('в реестре; другие имена bg и color; абзац на фоне остаётся абзацем', () => {
    ok(blockDef('background'));
    eq(blockDef('bg'), blockDef('background'));
    eq(blockDef('color'), blockDef('background'));
    const p = document.createElement('p');
    p.className = 'ted-bg-gray';
    eq(defOf(p).type, 'p');
    eq(kindOf(p), 'p');
    eq(menuGroups().find((g) => g.title === 'Акцент').items[1].type, 'background');
  });

  test('меню «Акцент → Цветной фон»: новый абзац на сером фоне', () => {
    const ed = make('<p>до</p>');
    const el = insertBlock(ed, 'background');
    ok(el && el.matches('p.ted-bg-gray'), el && el.outerHTML);
    ed.destroy();
  });

  test('внутри ответа аккордеона «Цветного фона» в меню нет (inContainers: false)', () => {
    const ed = make('<div class="ted-accordion"><details class="ted-accordion__item" open><summary class="ted-accordion__q">В</summary><div class="ted-accordion__a"><div class="ted-accordion__body"><p>О</p></div></div></details></div>');
    const body = ed.editable.querySelector('.ted-accordion__body');
    ok(body, 'ответ');
    ed.blockMenu.target = body.firstElementChild;
    const types = ed.blockMenu.groups().flatMap((g) => g.items.map((i) => i.type));
    ok(!types.includes('background') && types.includes('callout'), types.join(','));
    ed.destroy();
  });

  test('в наборе без фона классы снимаются (другое имя bg в списке — остаются)', () => {
    eq(Ted.clean('<p class="ted-bg-color1">Т</p>', { preset: 'text' }), '<p>Т</p>');
    eq(Ted.clean('<p class="ted-bg-color1">Т</p>', { blocks: ['p', 'bg'] }), '<p class="ted-bg-color1">Т</p>');
  });

  test('вид по макету: подложка r24, поля 20, палитры серая / акцент / доп; тёмная — gray/dark', () => {
    const ed = make('<p class="ted-bg-gray">а</p><p class="ted-bg-color1">б</p><p class="ted-bg-color2">в</p>', {}, { width: 1000 });
    const cs = blocks(ed).map((p) => getComputedStyle(p));
    eq(`${cs[0].borderTopLeftRadius} ${cs[0].paddingTop} ${cs[0].paddingLeft}`, '24px 20px 20px');
    eq(cs.map((c) => c.backgroundColor).join(' | '), 'rgb(237, 243, 250) | rgb(210, 226, 247) | rgb(229, 229, 255)');
    ed.destroy();
    const dark = make('<p class="ted-bg-gray">а</p>', { theme: 'dark' }, { width: 1000 });
    eq(getComputedStyle(blocks(dark)[0]).backgroundColor, 'rgb(77, 77, 77)');
    dark.destroy();
  });
});
