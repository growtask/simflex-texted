// Тесты блока «Кнопка» (blocks/button, этап 5) — прежние tests/button.test.js, перенесены без изменений.
// Кнопка (этап 6.5, макет block-button, окно kind=button): разметка, очистка, окно настроек, вид (одна, две, баннер), клавиши баннера.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, html, blocks, Ted } from '../../tests/helpers.js';
import { alignAllowed } from '../../resources/js/core/blocks.js';

const ONE = '<div class="ted-button"><a class="ted-button__btn" href="/catalog">Перейти в каталог</a></div>';
const pop = () => { const all = document.querySelectorAll('.ted-ui-pop--link'); return all[all.length - 1]; };
const click = (el) => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
const toggles = () => [...pop().querySelectorAll('.ted-ui-toggle')].reduce((o, l) => { o[l.textContent.trim()] = l.querySelector('input'); return o; }, {});

group('Кнопка: разметка и очистка', () => {
  test('сайт: <div class="ted-button"><a class="ted-button__btn" href>; повторная очистка не меняет HTML', () => {
    const out = Ted.clean(ONE);
    eq(out, ONE);
    eq(Ted.clean(out), out);
  });

  test('две кнопки (вторая — secondary), выравнивание, новая вкладка; баннер — заголовок, текст, одна кнопка', () => {
    const two = '<div class="ted-button ted-align-center"><a class="ted-button__btn" href="/a">Купить</a><a class="ted-button__btn ted-button__btn--secondary" href="https://example.com" target="_blank" rel="noopener">Подробнее</a></div>';
    eq(Ted.clean(two), two);
    const banner = '<div class="ted-button ted-button--banner"><div class="ted-button__text"><p class="ted-button__title">Хотите больше советов?</p><p class="ted-button__desc">Подпишитесь и получите гайд первым.</p></div><a class="ted-button__btn" href="/subscribe">Подписаться</a></div>';
    eq(Ted.clean(banner), banner);
  });

  test('опасное убирается: javascript:, обработчики, разметка в тексте; больше двух кнопок не бывает; пустая кнопка не сохраняется', () => {
    const out = Ted.clean('<div class="ted-button" onclick="x"><a class="ted-button__btn" href="javascript:alert(1)" onmouseover="x">Раз<img src=x onerror=alert(1)></a><a class="ted-button__btn" href="/2">Два</a><a class="ted-button__btn" href="/3">Три</a></div>');
    ok(!/javascript|onclick|onmouseover|<img|Три/.test(out), out);
    ok(/>Раз<\/a><a class="ted-button__btn ted-button__btn--secondary" href="\/2">Два</.test(out), out);
    eq(Ted.clean('<div class="ted-button"><a class="ted-button__btn" href="/x"></a></div>'), '');
  });
});

group('Кнопка: правка', () => {
  test('из меню блоков: кнопка «Текст кнопки» и сразу окно «Настройки кнопки» у кнопки; курсор под блоком', async () => {
    const ed = make('<p>до</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="button"]').click();
    await wait(20);
    ed.updatePlaceholders();
    const a = ed.editable.querySelector('.ted-button > a');
    ok(a, 'вставлена');
    eq(a.getAttribute('data-tedui-ph'), 'Текст кнопки');
    eq(a.getAttribute('contenteditable'), 'false');
    ok(ed.popover.isOpen, 'окно открыто');
    eq(pop().querySelector('.ted-ui-form__title').textContent, 'Настройки кнопки');
    ok(a.hasAttribute('data-tedui-selected'), 'кнопка в рамке');
    eq(ed.handle.focused, a.parentElement, 'кнопки блока ⠿ 🗑 у кнопки (курсора в ней нет)');
    ok(ed.handle.controls.classList.contains('is-visible'));
    const [text, url] = pop().querySelectorAll('input.ted-ui-input');
    text.value = 'Перейти в каталог';
    url.value = 'example.com/catalog';
    pop().querySelector('.ted-ui-action--primary').click();
    await wait(10);
    ok(!a.hasAttribute('data-tedui-selected'), 'рамка снята');
    ok(html(ed).includes('<a class="ted-button__btn" href="https://example.com/catalog"'), html(ed));
  });

  test('«Вторая кнопка» добавляет secondary; её нажатие — своё окно; выравнивание по центру', async () => {
    const ed = make(ONE + '<p>после</p>');
    ed.editable.focus();
    click(ed.editable.querySelector('.ted-button > a'));
    await wait(10);
    toggles()['Вторая кнопка'].click();
    pop().querySelector('[data-act="align-center"]').click();
    pop().querySelector('.ted-ui-action--primary').click();
    await wait(10);
    const links = ed.editable.querySelectorAll('.ted-button > a');
    eq(links.length, 2);
    ok(links[1].classList.contains('ted-button__btn--secondary'));
    ok(ed.editable.querySelector('.ted-button').classList.contains('ted-align-center'));
    click(links[1]);
    await wait(10);
    eq(pop().querySelector('.ted-ui-form__title').textContent, 'Вторая кнопка');
    ok(!toggles()['Баннер: заголовок и текст'], 'вид меняется только у основной кнопки');
    const [text] = pop().querySelectorAll('input.ted-ui-input');
    text.value = 'Подробнее';
    pop().querySelector('.ted-ui-action--primary').click();
    await wait(10);
    ok(/ted-align-center"><a class="ted-button__btn" href="\/catalog">Перейти в каталог<\/a><a class="ted-button__btn ted-button__btn--secondary"[^>]*>Подробнее<\/a>/.test(html(ed)), html(ed));
    ed.exec('undo');
    ok(!/Подробнее/.test(html(ed)), 'Undo');
  });

  test('«Баннер»: заголовок и текст на подложке, курсор в заголовке; Enter → в текст, Backspace в начале текста → в заголовок', async () => {
    const ed = make(ONE + '<p>после</p>');
    ed.editable.focus();
    click(ed.editable.querySelector('.ted-button > a'));
    await wait(10);
    toggles()['Баннер: заголовок и текст'].click();
    pop().querySelector('.ted-ui-action--primary').click();
    await wait(10);
    const el = ed.editable.querySelector('.ted-button');
    ok(el.classList.contains('ted-button--banner'));
    ed.updatePlaceholders();
    const title = el.querySelector('.ted-button__title');
    eq(title.getAttribute('data-tedui-ph'), 'Заголовок');
    eq(el.querySelector('.ted-button__desc').getAttribute('data-tedui-ph'), 'Текст');
    document.execCommand('insertText', false, 'Хотите советов?');
    const key = (k) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); ed.editable.dispatchEvent(e); return e.defaultPrevented; };
    ok(key('Enter'));
    document.execCommand('insertText', false, 'Подпишитесь.');
    eq(el.querySelector('.ted-button__desc').textContent, 'Подпишитесь.');
    const r = document.createRange();
    r.setStart(el.querySelector('.ted-button__desc').firstChild, 0);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ok(key('Backspace'));
    ok(title.contains(getSelection().anchorNode), 'курсор в заголовке');
    eq(el.querySelectorAll('.ted-button__text > p').length, 2, 'строки не склеились');
    ok(/<p class="ted-button__title">Хотите советов\?<\/p><p class="ted-button__desc">Подпишитесь\.<\/p>/.test(html(ed)), html(ed));
    ok(ed.toolbar.alignBtn.hidden && ed.toolbar.marks.bold.hidden && !ed.toolbar.colorBtn.hidden, 'в баннере — простой текст; цвет текста и фон — есть (1.0.4)');
  });
});

group('Кнопка: вид', () => {
  test('кнопка 48, r12, 16 / 600, primary #1975F7, вторичная #EDF3FA; тёмная вторичная #4D4D4D', () => {
    const ed = make('<div class="ted-button"><a class="ted-button__btn" href="/a">Купить</a><a class="ted-button__btn ted-button__btn--secondary" href="/b">Ещё</a></div>', {}, { width: 1000 });
    const [a, b] = ed.editable.querySelectorAll('.ted-button > a');
    const cs = getComputedStyle(a);
    eq([cs.height, cs.borderTopLeftRadius, cs.fontSize, cs.fontWeight, cs.backgroundColor].join(' '), '48px 12px 16px 600 rgb(25, 117, 247)');
    eq(getComputedStyle(b).backgroundColor, 'rgb(237, 243, 250)');
    eq(a.getBoundingClientRect().top, b.getBoundingClientRect().top, 'в ряд');
    const dark = make('<div class="ted-button"><a class="ted-button__btn" href="/a">Купить</a><a class="ted-button__btn ted-button__btn--secondary" href="/b">Ещё</a></div>', {}, { width: 1000, theme: 'dark' });
    eq(getComputedStyle(dark.editable.querySelectorAll('.ted-button > a')[1]).backgroundColor, 'rgb(77, 77, 77)');
  });

  test('414: две кнопки друг под другом на всю ширину; баннер — текст над кнопкой', () => {
    const ed = make('<div class="ted-button"><a class="ted-button__btn" href="/a">Купить</a><a class="ted-button__btn ted-button__btn--secondary" href="/b">Ещё</a></div><div class="ted-button ted-button--banner"><div class="ted-button__text"><p class="ted-button__title">Т</p><p class="ted-button__desc">Д</p></div><a class="ted-button__btn" href="/c">Да</a></div>', {}, { width: 414 });
    const [a, b] = ed.editable.querySelectorAll('.ted-button:not(.ted-button--banner) > a');
    ok(b.getBoundingClientRect().top >= a.getBoundingClientRect().bottom, 'друг под другом');
    eq(Math.round(a.getBoundingClientRect().width), Math.round(a.parentElement.getBoundingClientRect().width));
    const banner = ed.editable.querySelector('.ted-button--banner');
    ok(banner.querySelector('a').getBoundingClientRect().top >= banner.querySelector('.ted-button__text').getBoundingClientRect().bottom, 'кнопка под текстом');
    const cs = getComputedStyle(banner);
    eq([cs.paddingTop, cs.borderTopLeftRadius, cs.backgroundColor].join(' '), '20px 24px rgb(210, 226, 247)');
  });
});

// ---- блок полностью в папке (отвязка ядра, 21.11): ядро спрашивает реестр через точки подключения ----
group('Кнопка: точки подключения реестра', () => {
  const BANNER = '<div class="ted-button ted-button--banner"><div class="ted-button__text"><p class="ted-button__title">Заголовок</p><p class="ted-button__desc">Текст</p></div><a class="ted-button__btn" href="/a">Купить</a></div>';

  test('editorUi: у редактора есть editor.buttons и он в общем списке blockUis; destroy снимает его', () => {
    const ed = make(ONE);
    ok(ed.buttons && ed.blockUis.includes(ed.buttons));
    ed.destroy();
  });

  test('toolbar (block.json): курсор в кнопке — в панели нет фона, выравнивания, стиля текста и форматирования', () => {
    const ed = make(BANNER);
    ed.toolbar.update({ ...ed.state, type: 'button', mode: 'edit', focused: true, marks: {} });
    const tb = ed.toolbar;
    ok(!tb.colorBtn.hidden && tb.alignBtn.hidden && tb.styleBtn.hidden, 'выравнивания и стиля нет; «Цвет» — есть (1.0.4)');
    ok(Object.values(tb.marks).every((b) => b.hidden), 'форматирование');
    ed.toolbar.update({ ...ed.state, type: 'p', mode: 'edit', focused: true, marks: {} });
    ok(!tb.alignBtn.hidden && !tb.styleBtn.hidden && !tb.marks.bold.hidden, 'в абзаце — снова есть');
    ed.destroy();
  });

  test('neverEmpty и caretBelow: кнопка не пустая строка; последней в документе — под ней строка для курсора', () => {
    const ed = make(ONE);
    const bs = blocks(ed);
    eq(bs.map((b) => b.tagName).join(','), 'DIV,P');
    ed.destroy();
  });

  test('canAlign: баннер не выравнивается, обычная кнопка — да; toText: в наборе без кнопки — текст и ссылки', () => {
    const ed = make(BANNER + ONE);
    const [banner, one] = blocks(ed);
    ok(!alignAllowed(banner) && alignAllowed(one), 'баннер — нет, кнопка — да');
    eq(Ted.clean(BANNER, { blocks: ['p'] }).replace(/>\s+</g, '><'), '<p><strong>Заголовок</strong></p><p>Текст</p><p><a href="/a">Купить</a></p>');
    ok(banner && one);
    ed.destroy();
  });
});
