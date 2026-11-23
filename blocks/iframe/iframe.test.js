// Тесты блока «iFrame» (blocks/iframe, этап 5) — прежние tests/iframe.test.js, перенесены без изменений.
// iFrame (этап 6.4, макет block-iframe, окно kind=iframe): разметка, безопасность, вставка адреса или кода <iframe>, окно настроек, вид.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, html, blocks, Ted } from '../../tests/helpers.js';

const SB = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
const SAVED = (src, extra = '', cap = '') => `<figure class="ted-iframe"><iframe src="${src}"${extra} title="${cap || 'Встроенная страница'}" loading="lazy" sandbox="${SB}" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`;
const pop = () => { const all = document.querySelectorAll('.ted-ui-pop--link'); return all[all.length - 1]; };

group('iFrame: разметка и безопасность', () => {
  test('сайт: <figure class="ted-iframe"> с фреймом в песочнице, высота и подпись; повторная очистка не меняет HTML', () => {
    const src = SAVED('https://forms.example.com/f/1', ' height="600"', 'Форма заявки');
    eq(Ted.clean(src), src);
    eq(Ted.clean(Ted.clean(src)), src);
  });

  test('любой https-адрес; http, javascript:, data:, логин и порт — блок не сохраняется; srcdoc, свои sandbox и обработчики убираются', () => {
    const out = Ted.clean('<figure class="ted-iframe"><iframe src="https://evil.example/" srcdoc="<b>x</b>" sandbox="allow-top-navigation" onload="alert(1)" style="x"></iframe></figure>');
    eq(out, SAVED('https://evil.example/'));
    for (const bad of ['http://a.example/', 'javascript:alert(1)', 'data:text/html,x', 'https://u:p@a.example/', 'https://a.example:8080/']) {
      eq(Ted.clean(`<figure class="ted-iframe"><iframe src="${bad}"></iframe></figure>`), '', bad);
    }
  });

  test('iframe вне блока — по-прежнему только с доверенных видеохостов', () => {
    const out = Ted.clean('<iframe src="https://evil.example/x"></iframe>');
    ok(!/evil\.example/.test(out), out);
  });
});

group('iFrame: правка', () => {
  test('из меню блоков: поле «Адрес страницы» и «Добавить» (курсор в поле); вставленный код <iframe> даёт адрес, пропорция 16 : 9 (22.11)', async () => {
    const ed = make('<p>до</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="iframe"]').click();
    await wait(20);
    const fig = ed.editable.querySelector('figure.ted-iframe');
    ok(fig && fig.hasAttribute('data-tedui-empty'), 'пустой блок');
    const input = fig.querySelector('.ted-ui-media__url');
    eq(input.placeholder, 'Адрес страницы');
    eq(fig.querySelector('.ted-ui-media__link-go').textContent, 'Добавить');
    eq(document.activeElement, input, 'курсор в поле адреса');
    eq(html(ed), '<p>до</p>', 'пустой блок не сохраняется');
    input.value = '<iframe src="https://yandex.ru/map-widget/v1/?um=abc" width="560" height="400" frameborder="0"></iframe>';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(10);
    ok(html(ed).includes('<figure class="ted-iframe" data-ratio="16:9"><iframe src="https://yandex.ru/map-widget/v1/?um=abc" title="Встроенная страница"'), html(ed));
    ok(!/height=/.test(html(ed)), 'высоты в пикселях нет');
    ok(!/ted-ui-media__link|data-tedui/.test(html(ed)), 'служебное не сохраняется');
  });

  test('нажатие на блок — «Настройки iFrame»: адрес и пропорции (без высоты и подписи, 22.11); кнопки блока у него; Undo возвращает', async () => {
    const ed = make(SAVED('https://a.example/x') + '<p>после</p>');
    ed.editable.focus();
    const fig = ed.editable.querySelector('figure.ted-iframe');
    fig.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(10);
    eq(pop().querySelector('.ted-ui-form__title').textContent, 'Настройки iFrame');
    eq(ed.handle.focused, fig, 'кнопки блока ⠿ 🗑 у фрейма');
    const inputs = pop().querySelectorAll('input.ted-ui-input');
    eq(inputs.length, 1, 'в окне только адрес');
    eq(inputs[0].value, 'https://a.example/x');
    const ratios = [...pop().querySelectorAll('[data-act^="ratio-"]')].map((b) => b.textContent);
    eq(ratios.join(','), '16 : 9,4 : 3,1 : 1,21 : 9,9 : 16');
    pop().querySelector('[data-act="ratio-4x3"]').click();
    pop().querySelector('.ted-ui-action--primary').click();
    await wait(10);
    ok(html(ed).includes('<figure class="ted-iframe" data-ratio="4:3"><iframe src="https://a.example/x"'), html(ed));
    ed.exec('undo');
    ok(!/data-ratio/.test(html(ed)), 'Undo');
  });

  test('подпись — полем под фреймом прямо в блоке (как у медиа); Enter — новый абзац под блоком', async () => {
    const ed = make(SAVED('https://a.example/x') + '<p>после</p>');
    ed.updateState();
    const fig = ed.editable.querySelector('figure.ted-iframe');
    const input = fig.querySelector(':scope > .ted-ui-media__caption');
    ok(input, 'поле подписи в блоке');
    eq(input.placeholder, 'Добавить подпись');
    input.focus();
    input.value = 'Калькулятор';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    ok(html(ed).includes('<figcaption>Калькулятор</figcaption>'), html(ed));
    ok(html(ed).includes('title="Калькулятор"'), 'название фрейма — подпись');
    ok(!/ted-ui-media__caption/.test(html(ed)), 'поле не сохраняется');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(10);
    const next = fig.nextElementSibling;
    ok(next && next.tagName === 'P' && (next.contains(getSelection().anchorNode) || getSelection().anchorNode === next), 'курсор в абзаце под блоком');
  });

  test('старый блок с высотой в пикселях сохраняется как был, пока не выбрали пропорцию', () => {
    const ed = make(SAVED('https://a.example/x', ' height="300"') + '<p>после</p>');
    ok(html(ed).includes(' height="300"'), html(ed));
  });

  test('вставка над другим фреймом: курсор не уходит в соседний блок (кнопки блока не у чужого фрейма)', async () => {
    const ed = make('<p>до</p>' + SAVED('https://a.example/x'));
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="iframe"]').click();
    await wait(20);
    const [fresh, old] = ed.editable.querySelectorAll('figure.ted-iframe');
    ok(fresh.hasAttribute('data-tedui-empty') && !old.hasAttribute('data-tedui-empty'));
    ok(ed.handle.focused !== old, 'кнопки блока не у соседнего фрейма');
    eq(fresh.nextElementSibling.tagName, 'P', 'под новым блоком строка текста');
  });

  test('неподходящий адрес не принимается (сообщение), окно остаётся', async () => {
    const ed = make(SAVED('https://a.example/x') + '<p>после</p>');
    ed.editable.focus();
    ed.editable.querySelector('figure.ted-iframe').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(10);
    const [url] = pop().querySelectorAll('input.ted-ui-input');
    url.value = 'javascript:alert(1)';
    pop().querySelector('.ted-ui-action--primary').click();
    ok(ed.popover.isOpen);
    ok(html(ed).includes('https://a.example/x'));
  });
});

group('iFrame: вид', () => {
  test('фрейм на всю колонку, r32, без высоты — 16 : 10; с высотой — её; подпись 13 / #919599', () => {
    const ed = make(SAVED('https://a.example/x', '', 'Подпись') + SAVED('https://a.example/y', ' height="300"'), {}, { width: 1000 });
    const [a, b] = ed.editable.querySelectorAll('figure.ted-iframe > iframe');
    const ar = a.getBoundingClientRect();
    eq(Math.round(ar.width), Math.round(a.parentElement.getBoundingClientRect().width));
    eq(Math.round(ar.height), Math.round(ar.width * 10 / 16));
    eq(getComputedStyle(a).borderTopLeftRadius, '32px');
    eq(Math.round(b.getBoundingClientRect().height), 300);
    const cs = getComputedStyle(ed.editable.querySelector('figure.ted-iframe > figcaption'));
    eq([cs.fontSize, cs.color].join(' '), '13px rgb(145, 149, 153)');
  });
});

// ---- блок полностью в папке (отвязка ядра, 21.11): ядро спрашивает реестр ----
group('iFrame: точки подключения реестра', () => {
  const FRAME = '<figure class="ted-iframe"><iframe src="https://forms.example.org/a" height="300" title="Форма"></iframe><figcaption>Анкета</figcaption></figure>';

  test('editorUi: editor.iframes в общем списке blockUis', () => {
    const ed = make(FRAME);
    ok(ed.iframes && ed.blockUis.includes(ed.iframes));
    ed.destroy();
  });

  test('frames (block.json): фрейм внутри блока — любой https-адрес и песочница блока; тот же фрейм вне блока — удаляется', () => {
    const inside = Ted.clean(FRAME);
    ok(/<iframe src="https:\/\/forms\.example\.org\/a"/.test(inside) && /sandbox="[^"]*allow-forms/.test(inside), inside);
    const outside = Ted.clean('<div><iframe src="https://forms.example.org/a"></iframe></div>');
    ok(!outside.includes('<iframe'), outside);
  });

  test('toText: в наборе без iFrame — ссылка с подписью; canAlign / canBg — нет; последним — строка для курсора', () => {
    eq(Ted.clean(FRAME, { blocks: ['p'] }).replace(/>\s+</g, '><'), '<p><a href="https://forms.example.org/a">Анкета</a></p>');
    const ed = make(FRAME);
    eq(blocks(ed).map((b) => b.tagName).join(','), 'FIGURE,P');
    ed.destroy();
  });
});
