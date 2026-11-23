// Тесты блока «Выноска» (blocks/callout, этап 5.5).
import { group, test, eq, ok } from '../../tests/harness.js';
import { make, blocks, Ted } from '../../tests/helpers.js';
import { blockDef, defOf } from '../../src/core/registry.js';
import { menuGroups } from '../../src/core/blocks.js';
import { placeCaret, insertBlock } from '../../tests/interaction/samples.js';

const key = (ed, k) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true }));

group('Блок «Выноска» (blocks/callout)', () => {
  test('в реестре; первая в группе «Акцент»; составной блок', () => {
    const d = blockDef('callout');
    ok(d && d.compound && !d.text);
    eq(menuGroups().find((g) => g.title === 'Акцент').items.map((i) => i.type).join(','), 'callout,background,facts,proscons');
    const q = document.createElement('blockquote');
    q.className = 'ted-callout';
    eq(defOf(q), d);
  });

  test('вставка: пустая выноска, заглушки «Заголовок выноски» / «Текст выноски»', () => {
    const ed = make('<p>до</p>');
    const el = insertBlock(ed, 'callout');
    ok(el && el.matches('blockquote.ted-callout'), 'вставлена');
    ed.updateState();
    const ps = el.querySelectorAll(':scope > p');
    eq([ps[0].getAttribute('data-tedui-ph'), ps[1].getAttribute('data-tedui-ph')].join(' / '), 'Заголовок выноски / Текст выноски');
    ed.destroy();
  });

  test('Enter в заголовке → в текст; Enter в пустом последнем абзаце → выход из выноски', () => {
    const ed = make('<blockquote class="ted-callout"><p><strong>З</strong></p><p>Т</p><p><br></p></blockquote>');
    const q = blocks(ed)[0];
    placeCaret(ed, q.children[0].firstChild);
    key(ed, 'Enter');
    const a = getSelection().anchorNode;
    ok(a && q.children[1].contains(a), 'курсор в тексте');
    // пустой последний абзац — как после Enter в конце текста (при загрузке пустые абзацы снимает очистка)
    const q2 = blocks(ed)[0];
    const empty = document.createElement('p');
    empty.appendChild(document.createElement('br'));
    q2.appendChild(empty);
    placeCaret(ed, empty);
    key(ed, 'Enter');
    eq(blocks(ed).map((b) => b.tagName).join(','), 'BLOCKQUOTE,P');
    eq(blocks(ed)[0].querySelectorAll(':scope > p').length, 2);
    ed.destroy();
  });

  test('очистка сохраняет класс; JSON; в наборе без выноски — её абзацы (как на сервере)', () => {
    ok(Ted.clean('<blockquote class="ted-callout x"><p><strong>З</strong></p><p>Т</p></blockquote>').startsWith('<blockquote class="ted-callout">'));
    eq(Ted.fromBlocks([{ type: 'callout', title: 'Совет', text: 'Текст' }]), '<blockquote class="ted-callout"><p><strong>Совет</strong></p><p>Текст</p></blockquote>');
    eq(Ted.clean('<blockquote class="ted-callout"><p><strong>З</strong></p><p>Т</p></blockquote>', { preset: 'text' }), '<p><strong>З</strong></p>\n<p>Т</p>');
  });

  test('вид по макету: плашка r16, поля 12/44, gray/lighter, заголовок 16/700, текст 13; значок 24', () => {
    const ed = make('<blockquote class="ted-callout"><p><strong>З</strong></p><p>Т</p></blockquote>', {}, { width: 1000 });
    const q = blocks(ed)[0];
    const cs = getComputedStyle(q);
    eq(`${cs.borderTopLeftRadius} ${cs.paddingTop} ${cs.paddingLeft} ${cs.backgroundColor} ${cs.fontSize}`, '16px 12px 44px rgb(237, 243, 250) 13px');
    eq(`${getComputedStyle(q.children[0]).fontSize} ${getComputedStyle(q.children[0]).fontWeight}`, '16px 700');
    eq(getComputedStyle(q, '::before').width, '24px');
    ed.destroy();
  });
});
