// Ритм содержимого (этап 0): отступы между блоками — одно правило снаружи блоков, значения — как в макете.
// Окно тестов ≥ 812, поэтому здесь десктопные значения; узкие экраны — снимок расположения в полном прогоне
// (tools/layout-snapshot.ps1 против tests/rhythm/layout-baseline.txt).
import { group, test, eq } from '../harness.js';
import { make, sandbox } from '../helpers.js';

const rect = (el) => el.getBoundingClientRect();
const gap = (a, b) => Math.round(rect(b).top - rect(a).bottom);

const DOC = '<h2>Первый заголовок</h2><p>Абзац</p><p>Второй абзац</p><h3>Заголовок</h3><blockquote><p>Цитата</p></blockquote>' +
  '<p class="ted-bg-gray">Фон</p><h2 class="ted-bg-color1">Заголовок на фоне</h2>' +
  '<ol class="ted-steps"><li><strong>Шаг</strong><br>Описание</li><li><strong>Два</strong><br>Описание</li></ol><p>После шагов</p>' +
  '<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="2"><thead><tr><th>А</th><th>Б</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div><figcaption>Подпись</figcaption></figure><p>После таблицы</p>' +
  '<div class="ted-columns ted-columns--2"><div class="ted-columns__col"><h6>Колонка</h6><p>Текст</p><p>Последний</p></div><div class="ted-columns__col"><p>Вторая</p></div></div><p>Последний абзац</p>';

function check(root) {
  const k = [...root.children];
  const q = (sel) => root.querySelector(':scope > ' + sel);
  const top = Math.round(rect(k[0]).top - rect(root).top);
  const steps = q('ol.ted-steps');
  const col = root.querySelector('.ted-columns__col');
  return [
    `первый заголовок сверху ${top}`,
    `абзац → абзац ${gap(k[1], k[2])}`,
    `абзац → заголовок ${gap(k[2], k[3])}`,
    `заголовок → цитата ${gap(k[3], k[4])}`,
    `фон → заголовок на фоне ${gap(k[5], k[6])}`,
    // у последнего шага свой нижний отступ внутри блока — считаем от содержимого шага
    `шаги → абзац ${Math.round(rect(steps.nextElementSibling).top - rect(steps.lastElementChild).bottom + parseFloat(getComputedStyle(steps.lastElementChild).paddingBottom))}`,
    `таблица → абзац ${gap(q('figure.ted-table'), q('figure.ted-table').nextElementSibling)}`,
    `в колонке ${gap(col.children[0], col.children[1])} ${gap(col.children[1], col.children[2])}, у последнего ${Math.round(rect(col).bottom - rect(col.lastElementChild).bottom)}`,
    `колонки → абзац ${gap(q('.ted-columns'), q('.ted-columns').nextElementSibling)}`,
  ].join('\n');
}

// как в макете (десктоп): обычный промежуток 20, над заголовком 20 + свой 20, у первого заголовка — свой 20,
// над цитатой 20 + 0, заголовок на фоне — только промежуток, под шагами — свой отступ шага 20 + промежуток, в колонке — как в статье, 20 (заказчик 22.11)
const WANT = ['первый заголовок сверху 20', 'абзац → абзац 20', 'абзац → заголовок 40', 'заголовок → цитата 20', 'фон → заголовок на фоне 20',
  'шаги → абзац 40', 'таблица → абзац 20', 'в колонке 20 20, у последнего 0', 'колонки → абзац 20'].join('\n');

group('Ритм содержимого: отступы между блоками (десктоп)', () => {
  test('сайт: значения как в макете', () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.style.cssText = 'width:700px;--ted-u:1px';
    box.innerHTML = DOC;
    sandbox.appendChild(box);
    try { eq(check(box), WANT); } finally { box.remove(); }
  });

  test('редактор: те же значения, что на сайте', () => {
    const ed = make(DOC, {}, { width: 1000 });
    eq(check(ed.editable), WANT);
    ed.destroy();
  });

  test('блок — это его содержимое: у текстовых блоков нет внутренних отступов под соседей', () => {
    const ed = make(DOC, {}, { width: 1000 });
    const bad = [...ed.editable.children].filter((el) => /^(P|H[2-6]|UL|OL)$/.test(el.tagName) && !/ted-bg-/.test(el.className))
      .filter((el) => getComputedStyle(el).paddingTop !== '0px' || getComputedStyle(el).paddingBottom !== '0px')
      .map((el) => `${el.tagName}: ${getComputedStyle(el).paddingTop} / ${getComputedStyle(el).paddingBottom}`);
    eq(bad.join(', '), '');
    ed.destroy();
  });
});
