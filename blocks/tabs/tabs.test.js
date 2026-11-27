// Тесты блока «Вкладки» (blocks/tabs, этап 5) — прежние tests/tabs.test.js, перенесены без изменений.
// Вкладки (этап 6.3, макет block-tabs): разметка сайта, очистка, правка, клавиши, кнопки вкладки, сайт со скриптом, вид.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, html, blocks, Ted } from '../../tests/helpers.js';
import { normalizeRoot } from '../../resources/js/core/blocks.js';

const PANEL = (t, b) => `<div class="ted-tabs__panel"><p class="ted-tabs__title">${t}</p><div class="ted-tabs__body">\n${b}\n</div></div>`;
const SAVED = (...p) => `<div class="ted-tabs">\n${p.join('\n')}\n</div>`;
const T3 = SAVED(PANEL('Описание', '<p>Первая</p>'), PANEL('Характеристики', '<p>Вторая</p>'), PANEL('Доставка', '<p>Третья</p>'));

function caret(ed, el, atEnd = true) {
  ed.editable.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  ed.updateState();
  ed.updatePlaceholders();
}
const key = (ed, k, o = {}) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }); ed.editable.dispatchEvent(e); if (!e.defaultPrevented && k === 'Enter') document.execCommand('insertParagraph'); ed.updateState(); ed.updatePlaceholders(); return e.defaultPrevented; };
const titles = (ed) => [...ed.editable.querySelectorAll('.ted-tabs__bar > .ted-tabs__title')];
const bodies = (ed) => [...ed.editable.querySelectorAll('.ted-tabs > .ted-tabs__body')];

group('Вкладки: разметка и очистка', () => {
  test('сайт: панели с названием и содержимым (без скрипта — разделы подряд); повторная очистка не меняет HTML', () => {
    eq(Ted.clean(T3), T3);
    eq(Ted.clean(Ted.clean(T3)), T3);
  });

  test('в содержимом нет цветного фона и вложенных вкладок; опасное убирается', () => {
    const out = Ted.clean(SAVED(PANEL('A<script>x</script>', '<p class="ted-bg-gray" onclick="x">Текст</p>' + SAVED(PANEL('Внутри', '<p>в</p>')))));
    ok(!/script|onclick|ted-bg-/.test(out), out);
    eq((out.match(/class="ted-tabs"/g) || []).length, 1, 'вложенные вкладки раскрыты');
    ok(/<p><strong>Внутри<\/strong><\/p>/.test(out));
  });
});

group('Вкладки: правка', () => {
  test('из меню блоков: три вкладки, заглушки «Вкладка», курсор в первом названии, «Добавить вкладку»', async () => {
    const ed = make('<p>до</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="tabs"]').click();
    await wait(20);
    ed.updatePlaceholders();
    eq(titles(ed).length, 3);
    eq(titles(ed).map((t) => t.getAttribute('data-tedui-ph')).join(','), 'Вкладка,Вкладка,Вкладка');
    ok(titles(ed)[0].contains(getSelection().anchorNode) || getSelection().anchorNode === titles(ed)[0]);
    ed.updateState();
    ok(ed.tabs.addBtn.classList.contains('is-visible'));
    eq(ed.tabs.addBtn.textContent, 'Добавить вкладку');
  });

  test('видно содержимое активной вкладки; курсор в названии делает её активной; Enter в названии — в содержимое', () => {
    const ed = make(T3);
    caret(ed, titles(ed)[1]);
    ok(titles(ed)[1].hasAttribute('data-tedui-active') && bodies(ed)[1].hasAttribute('data-tedui-active'));
    eq(bodies(ed).map((b) => getComputedStyle(b).display === 'none').join(','), 'true,false,true', 'видно только активное');
    ok(key(ed, 'Enter'));
    ok(bodies(ed)[1].contains(getSelection().anchorNode), 'курсор в содержимом');
  });

  test('Enter на пустой последней строке содержимого — абзац под блоком; Backspace в начале содержимого не склеивает с названием', () => {
    const ed = make(T3 + '<p>после</p>');
    caret(ed, bodies(ed)[0].querySelector('p'));
    key(ed, 'Enter');
    ok(key(ed, 'Enter'));
    const tabs = ed.editable.querySelector('.ted-tabs');
    eq(tabs.nextElementSibling.tagName, 'P');
    ok(tabs.nextElementSibling.contains(getSelection().anchorNode) || getSelection().anchorNode === tabs.nextElementSibling);
    eq(bodies(ed)[0].children.length, 1, 'пустая строка убрана');
    caret(ed, bodies(ed)[0].querySelector('p'), false);
    ok(key(ed, 'Backspace'));
    eq(titles(ed)[0].textContent, 'Описание');
  });

  test('кнопки вкладки над названием; корзина удаляет вкладку с содержимым, Undo возвращает; Backspace в пустой вкладке удаляет её', () => {
    const ed = make(T3, {}, { width: 1000 });
    caret(ed, titles(ed)[1]);
    eq(ed.handle.item, titles(ed)[1]);
    const c = ed.handle.itemControls.getBoundingClientRect();
    const t = titles(ed)[1].getBoundingClientRect();
    ok(c.bottom <= t.top + 1 && c.right <= t.right + 1, 'над названием, у правого края');
    ed.handle.removeItem(titles(ed)[1]);
    eq(titles(ed).map((x) => x.textContent).join(','), 'Описание,Доставка');
    eq(bodies(ed).map((b) => b.textContent).join(','), 'Первая,Третья', 'содержимое удалено вместе с названием');
    ed.exec('undo');
    eq(titles(ed).length, 3);
    titles(ed)[2].innerHTML = '<br>';
    bodies(ed)[2].innerHTML = '<p><br></p>';
    caret(ed, titles(ed)[2], false);
    ok(key(ed, 'Backspace'));
    eq(titles(ed).length, 2);
  });

  test('перестановка названий переносит и содержимое (после правки структуры тела идут за названиями)', () => {
    const ed = make(T3);
    const bar = ed.editable.querySelector('.ted-tabs__bar');
    bar.appendChild(titles(ed)[0]);   // как после перетаскивания первой вкладки в конец
    ed.afterChange({ immediate: true });
    eq(titles(ed).map((x) => x.textContent).join(','), 'Характеристики,Доставка,Описание');
    eq(bodies(ed).map((b) => b.textContent).join(','), 'Вторая,Третья,Первая');
    ok(html(ed).indexOf('Описание') > html(ed).indexOf('Доставка'));
  });

  test('«Добавить вкладку»: новая вкладка активна, курсор в её названии; больше 8 нельзя', () => {
    const ed = make(T3);
    caret(ed, titles(ed)[0]);
    for (let i = 0; i < 7; i += 1) ed.tabs.addBtn.click();
    eq(titles(ed).length, 8, 'не больше 8');
    ok(titles(ed)[7].hasAttribute('data-tedui-active'));
  });

  test('в содержимом — любые блоки, кроме фона; в названии — только строчное форматирование', () => {
    const ed = make(T3);
    caret(ed, titles(ed)[0]);
    ok(ed.toolbar.styleBtn.hidden && !ed.toolbar.colorParts().canBgMenu && ed.toolbar.alignBtn.hidden);
    caret(ed, bodies(ed)[0].querySelector('p'));
    eq(ed.state.type, 'p');
    ok(!ed.toolbar.colorParts().canBgMenu && !ed.toolbar.styleBtn.hidden);
    ed.exec('block:ul');
    ok(bodies(ed)[0].querySelector(':scope > ul'), 'список в содержимом');
  });
});

group('Вкладки: сайт и вид', () => {
  test('content.js: ряд вкладок (tablist), одна панель, нажатие и стрелки переключают', () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.innerHTML = T3;
    document.body.appendChild(box);
    window.TedContent && window.TedContent.mount(box);
    const tabs = box.querySelector('.ted-tabs');
    if (!window.TedContent) { box.remove(); return; }
    const btn = [...tabs.querySelectorAll('.ted-tabs__tab')];
    eq(btn.map((b) => b.textContent).join(','), 'Описание,Характеристики,Доставка');
    eq([...tabs.querySelectorAll('.ted-tabs__panel')].map((p) => p.hidden).join(','), 'false,true,true');
    btn[2].click();
    eq([...tabs.querySelectorAll('.ted-tabs__panel')].map((p) => p.hidden).join(','), 'true,true,false');
    btn[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    eq(btn[0].getAttribute('aria-selected'), 'true', 'по кругу');
    box.remove();
  });

  test('вид: название ui/m 16 / 600, высота 48, подчёркивание активной main/color1/main 2; тёмная — текст #FFF', () => {
    const ed = make(T3, {}, { width: 1000 });
    caret(ed, titles(ed)[0]);
    titles(ed)[0].style.transition = 'none';   // цвет подчёркивания меняется плавно — читаем итог
    const cs = getComputedStyle(titles(ed)[0]);
    eq([cs.fontSize, cs.fontWeight, cs.lineHeight, cs.borderBottomWidth, cs.borderBottomColor].join(' '), '16px 600 24px 2px rgb(25, 117, 247)');
    eq(Math.round(titles(ed)[0].getBoundingClientRect().height), 50, '48 + подчёркивание 2');
    const dark = make(T3, {}, { width: 1000, theme: 'dark' });
    caret(dark, titles(dark)[0]);
    for (const t of titles(dark)) t.style.transition = 'none';
    eq(getComputedStyle(titles(dark)[0]).color, 'rgb(255, 255, 255)');
    eq(getComputedStyle(titles(dark)[1]).color, 'rgb(237, 243, 250)');
  });
});

// ---- блок полностью в папке (отвязка ядра, 21.11): ядро и общий код контейнеров спрашивают реестр ----
group('Вкладки: точки подключения реестра', () => {
  const PANEL = (t, b) => `<div class="ted-tabs__panel"><p class="ted-tabs__title">${t}</p><div class="ted-tabs__body">${b}</div></div>`;

  test('editorUi: editor.tabs в blockUis; container — не пустая строка, последним под ним строка текста', () => {
    const ed = make(SAVED(PANEL('Один', '<p>А</p>'), PANEL('Два', '<p>Б</p>')));
    ok(ed.tabs && ed.blockUis.includes(ed.tabs));
    eq(blocks(ed).map((b) => b.tagName).join(','), 'DIV,P');
    ed.destroy();
  });

  test('normalize: вкладки без названий становятся абзацем (как раньше у контейнеров)', () => {
    const ed = make('<p>x</p>');
    ed.editable.insertAdjacentHTML('beforeend', '<div class="ted-tabs"><div class="ted-tabs__bar"></div></div>');
    normalizeRoot(ed.editable);
    ok(!ed.editable.querySelector('.ted-tabs'), ed.editable.innerHTML);
    ed.destroy();
  });

  test('unnest: вкладки в ответе аккордеона раскрываются — название жирным, за ним содержимое', () => {
    const out = Ted.clean('<div class="ted-accordion"><details class="ted-accordion__item"><summary class="ted-accordion__q">Вопрос</summary><div class="ted-accordion__a"><div class="ted-accordion__body">' + SAVED(PANEL('Один', '<p>А</p>')) + '</div></div></details></div>');
    ok(!out.includes('ted-tabs') && /<p><strong>Один<\/strong><\/p>\s*<p>А<\/p>/.test(out), out);
  });

  test('itemAt, itemAbove, itemRemoved, blockOfItems: корзина последней вкладки убирает блок целиком, сообщение «Вкладка удалена»', async () => {
    const ed = make(SAVED(PANEL('Один', '<p>А</p>')) + '<p>После</p>');
    const title = ed.editable.querySelector('.ted-tabs__title');
    const r = document.createRange(); r.selectNodeContents(title); r.collapse(false);
    ed.editable.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    ed.updateState();
    await wait(30);
    eq(ed.listItem(title.firstChild || title), title, 'пункт под курсором — вкладка');
    eq(ed.handle.itemControls.dataset.place, 'above', 'кнопки над названием');
    const said = [];
    ed.toast = (text) => { said.push(text); return null; };
    ed.handle.removeItem(title);
    await wait(30);
    ok(!ed.editable.querySelector('.ted-tabs'), 'блока нет');
    eq(said.join('|'), 'Вкладка удалена', 'сообщение');
    ed.destroy();
  });
});
