// Тесты блока «Цитата» (blocks/blockquote, этап 5.4).
import { group, test, eq, ok } from '../../tests/harness.js';
import { make, select, blocks, Ted } from '../../tests/helpers.js';
import { blockDef, defOf } from '../../src/core/registry.js';
import { menuGroups, placeholderOf } from '../../src/core/blocks.js';
import { HOTKEYS } from '../../src/core/keys.js';

group('Блок «Цитата» (blocks/blockquote)', () => {
  test('в реестре; другое имя quote; выноска — не цитата', () => {
    ok(blockDef('blockquote').text);
    eq(blockDef('quote'), blockDef('blockquote'));
    const c = document.createElement('blockquote');
    c.className = 'ted-callout';
    ok(!defOf(c) || defOf(c).type !== 'blockquote');
  });

  test('меню «Текст» после абзаца; Ctrl+Shift+9 после «Список» в справке; подсказка «Цитата»', () => {
    const t = menuGroups().find((x) => x.title === 'Текст').items.map((i) => i.type);
    eq(t.indexOf('blockquote'), t.indexOf('p') + 1);
    const i = HOTKEYS.findIndex((k) => k.cmd === 'block:blockquote');
    eq(HOTKEYS[i - 1].cmd, 'block:ul');
    eq(placeholderOf('blockquote'), 'Цитата');
    const ed = make('<p>текст</p>');
    ed.focus();
    select(ed, 0, 2);
    ed.exec('block:blockquote');
    eq(blocks(ed)[0].tagName, 'BLOCKQUOTE');
    ed.destroy();
  });

  test('автор: инициалы пересчитываются из имени, атрибуты data-initials и data-author-id остаются (белый список из block.json), чужие — нет', () => {
    const out = Ted.clean('<blockquote><p>Ц</p><p class="ted-author" data-initials="АП" data-author-id="a1" data-x="1"><strong>Анна</strong><br>Редактор</p></blockquote>');
    ok(/data-initials="А"/.test(out) && /data-author-id="a1"/.test(out) && !/data-x/.test(out), out);
  });

  test('JSON: «quote» с автором; в наборе text — абзацы без автора', () => {
    ok(Ted.blockJsonTypes.includes('quote'));
    const html = Ted.fromBlocks([{ type: 'quote', text: 'Ц', author: { name: 'Анна', role: 'Редактор' } }]);
    ok(/^<blockquote>\n?<p>Ц<\/p>/.test(html) && html.includes('ted-author'), html);
    eq(Ted.clean('<blockquote><p>Ц</p><p class="ted-author"><strong>А</strong></p></blockquote>', { preset: 'text' }), '<p>Ц</p>');
  });

  test('вид: линия 3 main/color1/main, отступ 23, текст 20 / 30 gray/darker', () => {
    const ed = make('<blockquote><p>Ц</p></blockquote>', {}, { width: 1000 });
    const q = blocks(ed)[0];
    const cs = getComputedStyle(q);
    const line = getComputedStyle(q, '::before');
    eq(`${cs.paddingLeft} ${cs.fontSize} ${cs.lineHeight} ${cs.color}`, '23px 20px 30px rgb(38, 38, 38)');
    eq(`${line.width} ${line.backgroundColor}`, '3px rgb(25, 117, 247)');
    ed.destroy();
  });
});
