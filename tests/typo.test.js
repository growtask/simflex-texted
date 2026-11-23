import { group, test, eq, ok, deepEq, vis } from './harness.js';
import { typografText, typografBlocks, diffRanges, protectRegExp, TYPO_CATEGORIES } from '../src/core/typo.js';
import { yofy } from '../src/core/yo.js';

const ru = (s, ctx) => vis(typografText(s, 'ru', { depth: 0 }, 'P', ctx || {}));
const en = (s) => vis(typografText(s, 'en', { depth: 0 }, 'P', {}));

group('Типограф: кавычки и тире', () => {
  test('ёлочки и вложенные лапки', () => eq(ru('Он сказал "привет" и "вложенный "пример""'), 'Он·сказал «привет» и·«вложенный „пример“»'));
  test('тире между словами', () => eq(ru('Мир - это дом'), 'Мир·— это·дом'));
  test('тире в начале строки', () => eq(ru('- Это я'), '—·Это·я'));
  test('диапазон чисел', () => ok(ru('с 2002-2009 годы').includes('2002–2009')));
  test('диапазон времени', () => ok(ru('9:00-18:00').includes('9:00–18:00')));
  test('месяцы и дни недели', () => {
    ok(ru('январь-март').includes('январь–март'));
    ok(ru('понедельник-суббота').includes('понедельник–суббота'));
  });
  test('английские кавычки и апостроф', () => {
    eq(en('He said "ok" and it\'s fine'), 'He·said “ok” and it’s fine');
  });
});

group('Типограф: знаки препинания и пробелы', () => {
  test('многоточие', () => ok(ru('Ну...').includes('Ну…')));
  test('?! и ?‥', () => {
    ok(ru('Что!?').includes('?!'));
    ok(ru('Что...?').includes('?‥'));
  });
  test('повторы знаков', () => ok(ru('Готово!!!').startsWith('Готово!')));
  test('двойные пробелы', () => eq(ru('Слово  слово'), 'Слово слово'));
  test('пробел перед запятой', () => ok(ru('Привет , мир').includes('Привет,')));
  test('точка за кавычкой', () => ok(ru('Он "сказал."').includes('».')));
  test('в заголовке точка убирается, в абзаце нет', () => {
    eq(vis(typografText('Новый заголовок.', 'ru', { depth: 0 }, 'H2', { single: true })), 'Новый заголовок');
    ok(vis(typografText('Один абзац.', 'ru', { depth: 0 }, 'P', { single: true })).endsWith('.'));
  });
});

group('Типограф: числа, валюта, телефоны', () => {
  test('рубли и группы тысяч', () => eq(ru('за 2345 руб.'), 'за·2·345·₽'));
  test('копейки', () => ok(ru('45 руб. 5 коп.').includes('45,05·₽')));
  test('доллары перед числом', () => ok(ru('$ 109').includes('109·$')));
  test('тыс. и млн', () => {
    ok(ru('5 тыс. руб').includes('5·тыс.·₽'));
    ok(ru('2 млн. р.').includes('2·млн·₽'));
  });
  test('процент без пробела', () => ok(ru('23 %').includes('23%')));
  test('телефон 8 800', () => ok(ru('8-800-555-55-50').includes('8·800·555-55-50')));
  test('телефон +7', () => ok(ru('+7(495)500-55-50').includes('+7·495·500-55-50')));
  test('год не принимается за телефон', () => ok(!ru('в 2020 году').includes('+7')));
});

group('Типограф: символы и единицы', () => {
  test('м2, °C', () => {
    ok(ru('20 м2').includes('20·м²'));
    ok(ru('20 C и 20°С').includes('20·°C'));
  });
  test('× и дроби', () => {
    ok(ru('1920x1080').includes('1920×1080'));
    ok(ru('1/2 пирога').startsWith('½'));
  });
  test('0x1F не трогается', () => ok(ru('0x1F').includes('0x1F')));
  test('стрелки', () => ok(ru('a -> b').includes('→')));
  test('(c) и (tm)', () => eq(ru('(c) 2024 (tm)').slice(0, 1), '©'));
});

group('Типограф: неразрывные пробелы и термины', () => {
  test('предлоги', () => ok(ru('в доме и на улице').includes('в·доме')));
  test('инициалы', () => ok(ru('А. А. Иванов').includes('А.А.·Иванов')));
  test('и т.д.', () => ok(ru('цветы и т.д. и др.').includes('и·т.·д.')));
  test('адреса и номера', () => ok(ru('ул. Ленина, д. 5, кв. 7').includes('ул.·Ленина')));
  test('термины', () => {
    const s = ru('wi-fi, e-mail, пин код, смс, он-лайн, qr код, master card, cvv2 код');
    for (const w of ['Wi-Fi', 'email', 'ПИН-код', 'СМС', 'онлайн', 'QR-код', 'Mastercard', 'CVV2-код']) ok(s.includes(w), w);
  });
  test('регистр не меняется', () => ok(ru('Вы и Банк, Сайт').includes('Вы') && ru('Банк').includes('Банк')));
});

group('Типограф: ёфикатор', () => {
  test('слова из словаря', () => eq(yofy('Еще черный и зеленый, ее ждет'), 'Ещё чёрный и зелёный, её ждёт'));
  test('сохраняет регистр', () => eq(yofy('ЕЩЕ Еще'), 'ЕЩЁ Ещё'));
  test('спорные слова не трогает', () => eq(yofy('все берем моем'), 'все берем моем'));
});

group('Типограф: категории, исключения, адреса', () => {
  test('выключенная категория не применяется', () => ok(ru('"тест"', { off: new Set(['quotes']) }).includes('"тест"')));
  test('счётчики по категориям', () => {
    const stats = {};
    typografText('Еще - "тест"', 'ru', { depth: 0 }, 'P', { stats });
    ok(stats.yo === 1 && stats.dashes >= 1 && stats.quotes >= 1, JSON.stringify(stats));
  });
  test('слова-исключения', () => {
    const protect = protectRegExp(['iPhone']);
    ok(ru('купил iPhone - класс', { protect }).includes('iPhone'));
  });
  test('адреса и почта не меняются', () => {
    const s = ru('Смотри https://a.com/x?b=c,d и a@b.ru');
    ok(s.includes('https://a.com/x?b=c,d') && s.includes('a@b.ru'));
  });
  test('свои термины', () => ok(ru('вайфай дома', { terms: [['вайфай', 'Wi-Fi']] }).includes('Wi-Fi')));
  test('список категорий полный', () => deepEq(TYPO_CATEGORIES.map((c) => c.id), ['quotes', 'dashes', 'punct', 'spaces', 'nbsp', 'numbers', 'phones', 'symbols', 'terms', 'yo']));
});

group('Типограф: сравнение строк и блоки', () => {
  test('diffRanges одинаковых строк пуст', () => deepEq(diffRanges('abc', 'abc'), []));
  test('diffRanges находит изменение', () => {
    const d = diffRanges('a b c', 'a — c');
    ok(d.length === 1 && d[0].start >= 2);
  });
  test('typografBlocks не трогает код', () => {
    const box = document.createElement('div');
    box.innerHTML = '<p>Еще "да"</p><pre>Еще "да"</pre>';
    const res = typografBlocks(Array.from(box.children), { lang: 'ru' });
    ok(res.changed === 1);
    eq(box.children[1].textContent, 'Еще "да"');
  });
  test('typografBlocks возвращает правки для отката', () => {
    const box = document.createElement('div');
    box.innerHTML = '<p>Еще</p>';
    const res = typografBlocks([box.firstChild], { lang: 'ru' });
    eq(res.edits[0].before, 'Еще');
    eq(box.textContent, 'Ещё');
  });
});
