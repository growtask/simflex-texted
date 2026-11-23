// Тесты блока «Ключевые цифры» (blocks/facts, этап 5). Свои — реестр, меню, JSON, наборы; ниже — перенесённые прежние тесты из tests/sizes.test.js.
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

group('Блок «Ключевые цифры» (blocks/facts)', () => {
  test('в реестре; меню «Акцент» после цветного фона', () => {
    eq(defOf(el('<ul class="ted-facts"><li><strong>1</strong><br>а</li></ul>')).type, 'facts');
    const a = menuGroups().find((g) => g.title === 'Акцент').items.map((i) => i.type);
    eq(a[a.indexOf('background') + 1], 'facts');
  });
  test('новый блок из меню: две пустые плитки, курсор в первом числе', () => {
    const ed = make('<p>до</p>');
    const made = insertBlock(ed, 'facts');
    ok(made && made.matches('ul.ted-facts') && made.children.length === 2, made && made.outerHTML);
    const a = getSelection().anchorNode;
    ok(a && made.firstElementChild.contains(a), 'курсор в первой плитке');
    ed.destroy();
  });
  test('JSON { value, label }; на цветном фоне перекрашиваются карточки', () => {
    eq(flat(Ted.fromBlocks([{ type: 'facts', items: [{ value: '120+', label: 'стран' }] }])), '<ul class="ted-facts"><li><strong>120+</strong><br>стран</li></ul>');
    const ed = make('<ul class="ted-facts ted-bg-color1"><li><strong>1</strong><br>а</li><li><strong>2</strong><br>б</li></ul>', {}, { width: 1000 });
    const ul = blocks(ed)[0];
    eq(getComputedStyle(ul).backgroundColor, 'rgba(0, 0, 0, 0)');
    eq(getComputedStyle(ul.firstElementChild).backgroundColor, 'rgb(210, 226, 247)');
    ed.destroy();
  });
});
