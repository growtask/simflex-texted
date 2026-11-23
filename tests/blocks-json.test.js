import { group, test, eq, ok } from './harness.js';
import { Ted, make } from './helpers.js';

const DOC = [
  { type: 'h2', text: 'Заголовок <b>' },
  { type: 'p', text: 'Строка 1\nстрока 2', bg: 'gray', align: 'center' },
  { type: 'ul', items: ['Раз', 'Два'] },
  { type: 'checklist', items: [{ text: 'Сделано', checked: true }, 'Нет'] },
  { type: 'steps', items: [{ title: 'Шаг', text: 'Описание' }] },
  { type: 'callout', title: 'Совет', text: 'Текст' },
  { type: 'facts', items: [{ value: '120+', label: 'стран' }, { value: '4,8', label: 'оценка' }] },
  { type: 'proscons', pros: { items: ['Быстро'] }, cons: { items: ['Дорого'] } },
  { type: 'quote', text: 'Цитата', author: { name: 'Анна', role: 'Редактор' } },
  { type: 'code', lang: 'js', code: 'let a = 1 < 2;' },
  { type: 'hr' },
  { type: 'image', url: '/uf/images/a.webp', alt: 'Фото', caption: 'Подпись' },
  { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', embed: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' },
  { type: 'file', items: [{ url: '/uf/files/a.pdf', name: 'Прайс' }] },
];

group('JSON-блоки → HTML (для агентов)', () => {
  test('все типы превращаются в разметку, которую редактор понимает без потерь', () => {
    const html = Ted.fromBlocks(DOC);
    for (const cls of ['ted-bg-gray', 'ted-align-center', 'ted-checklist', 'ted-checked', 'ted-steps', 'ted-callout', 'ted-facts', 'ted-proscons', 'ted-author', 'ted-media--image', 'ted-media--video', 'ted-media--file']) ok(html.includes(cls), cls + ': ' + html);
    ok(html.includes('data-lang="js"') && html.includes('&lt;') && !html.includes('<b>'), 'текст экранирован');
    const ed = make(html);
    eq(ed.getInnerHTML(), html, 'загрузка и сохранение ничего не меняют');
  });

  test('текст не может внести разметку, неизвестные типы и опасные адреса отбрасываются', () => {
    const skipped = [];
    const html = Ted.fromBlocks([{ type: 'p', text: '<img src=x onerror=alert(1)>' }, { type: 'bogus' }, { type: 'image', url: 'javascript:alert(1)', alt: '"><script>' }], { skipped });
    ok(!/<img src=x|<script|javascript:|onerror=\w/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/, '')), html);
    eq(skipped.join(), 'bogus');
  });

  test('опция blocks ограничивает набор: выноска и цифры превращаются в текст', () => {
    const html = Ted.fromBlocks(DOC, { blocks: 'text' });
    ok(!/ted-callout|ted-facts|<pre|ted-media/.test(html) && html.includes('Совет'), html);
  });
});
