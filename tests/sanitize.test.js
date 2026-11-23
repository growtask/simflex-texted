import { group, test, eq, ok } from './harness.js';
import Ted from '../src/index.js';

const clean = (html) => Ted.clean(html);

group('Санитайзер', () => {
  test('b → strong, i → em', () => eq(clean('<p><b>а</b> <i>б</i></p>'), '<p><strong>а</strong> <em>б</em></p>'));
  test('h1 → h2', () => eq(clean('<h1>Заголовок</h1>'), '<h2>Заголовок</h2>'));
  test('div → p', () => eq(clean('<div>текст</div>'), '<p>текст</p>'));
  test('скрипты и стили удаляются', () => {
    const s = clean('<p>а<script>alert(1)</script><style>p{}</style></p>');
    ok(!/script|style|alert/.test(s), s);
  });
  test('onclick и style удаляются', () => {
    const s = clean('<p onclick="x()" style="color:red">а</p>');
    ok(!/onclick|style|color/.test(s), s);
  });
  test('javascript: в ссылке не проходит', () => ok(!/javascript/i.test(clean('<p><a href="javascript:alert(1)">х</a></p>'))));
  test('ссылка с target', () => {
    const s = clean('<p><a href="/a" target="_blank">х</a></p>');
    ok(s.includes('target="_blank"') && s.includes('rel="noopener"'), s);
  });
  test('target="_self" сохраняется', () => ok(clean('<p><a href="/a" target="_self">х</a></p>').includes('target="_self"')));
  test('id блока (якорь) сохраняется', () => ok(clean('<h2 id="glava-1">Г</h2>').includes('id="glava-1"')));
  test('плохой id отбрасывается', () => ok(!clean('<h2 id="1 bad">Г</h2>').includes('id=')));
  test('выравнивание сохраняется', () => ok(clean('<p class="ted-align-center">а</p>').includes('ted-align-center')));
  test('выравнивание из style превращается в класс', () => ok(clean('<p style="text-align:right">а</p>').includes('ted-align-right')));
  test('подложка блока сохраняется', () => ok(clean('<p class="ted-bg-color1">а</p>').includes('ted-bg-color1')));
  test('подложка вместе с выравниванием', () => {
    const s = clean('<p class="ted-align-center ted-bg-gray">а</p>');
    ok(s.includes('ted-align-center') && s.includes('ted-bg-gray'), s);
  });
  test('чужие классы удаляются', () => ok(!clean('<p class="foo bar">а</p>').includes('class')));
  test('mark с классом палитры сохраняется', () => ok(clean('<p>а <mark class="ted-bg-color2">б</mark></p>').includes('<mark class="ted-bg-color2">б</mark>')));
  test('mark без класса — просто текст', () => ok(!clean('<p>а <mark>б</mark></p>').includes('mark')));
  test('вложенные списки', () => {
    const s = clean('<ul><li>а<ul><li>б</li></ul></li></ul>');
    ok(s.includes('<ul>') && s.includes('б'), s);
  });
  test('Word: абзацы mso-list → список', () => {
    const s = clean('<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.<span>&nbsp;</span></span>Пункт</p>');
    ok(/<(ol|ul)>/.test(s), s);
  });
  test('таблица и iframe сохраняются как есть', () => ok(clean('<table><tr><td>1</td></tr></table>').includes('<table')));
  test('пустые обёртки удаляются', () => ok(!clean('<p><strong></strong>а</p>').includes('<strong>')));
});
