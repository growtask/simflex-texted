// Правки заказчика 22.11.2026 (planmin.md → «Правки 22.11.2026»): поведение, найденное вручную, — тестом.
import { group, test, eq, ok, wait } from '../harness.js';
import { make, select, Ted } from '../helpers.js';
import { blockCanConvert } from '../../resources/js/core/blocks.js';
import { Toaster } from '../../resources/js/ui/widgets.js';
import { buildAudioPlayer } from '../../blocks/media/audio-player.js';
import { productFilesOf } from '../../blocks/product/product.js';

const shown = (b) => !!b && !b.hidden && getComputedStyle(b).display !== 'none';
function caretIn(ed, el) {
  ed.focus();
  const r = document.createRange();
  const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
  if (t) r.setStart(t, 1); else r.setStart(el, 0);
  r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  ed.updateState();
}

group('Правки 22.11: панель в блоках со своим видом', () => {
  test('код: у «Цвета» только фон (1.0.4), нет выравнивания и форматирования текста', () => {
    const ed = make('<p>текст</p><pre data-lang="js" data-nums="1"><code>let a;</code></pre>');
    caretIn(ed, ed.editable.querySelector('pre code'));
    ok(ed.toolbar.colorParts().canBgMenu && !ed.toolbar.colorParts().canTc, 'только фон');
    ok(!shown(ed.toolbar.alignBtn), 'выравнивания нет');
    for (const k of ['bold', 'italic', 'underline', 'strike']) ok(!shown(ed.toolbar.marks[k]), k);
    caretIn(ed, ed.editable.querySelector('p'));
    ok(shown(ed.toolbar.colorBtn) && shown(ed.toolbar.alignBtn) && shown(ed.toolbar.marks.italic), 'в абзаце всё на месте');
  });
  test('ключевые цифры: нет выравнивания и «Стиля текста» (превращения), фон есть; «Превратить в…» нет', () => {
    const ed = make('<ul class="ted-facts"><li><strong>120+</strong><br>стран</li><li><strong>4.8</strong><br>оценка</li></ul>');
    const ul = ed.editable.querySelector('ul');
    caretIn(ed, ul.querySelector('li'));
    ok(!shown(ed.toolbar.alignBtn), 'выравнивания нет');
    ok(!shown(ed.toolbar.styleBtn), 'стиля текста нет');
    ok(shown(ed.toolbar.colorBtn), 'фон по макету есть');
    ok(!blockCanConvert(ul), 'превратить нельзя');
  });
  test('плюсы и минусы: фон и цвет текста есть (1.0.4), нет выравнивания и стиля; «Превратить в…» нет', () => {
    const ed = make('<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>а</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>б</li></ul></li></ul>');
    const ul = ed.editable.querySelector('ul.ted-proscons');
    caretIn(ed, ul.querySelector('ul li'));
    ok(ed.toolbar.colorParts().canBgMenu && ed.toolbar.colorParts().canTc, 'фон и цвет текста есть');
    ok(!shown(ed.toolbar.alignBtn), 'выравнивания нет');
    ok(!shown(ed.toolbar.styleBtn), 'стиля текста нет');
    ok(!blockCanConvert(ul), 'превратить нельзя');
  });
});

group('Правки 22.11: уведомления, аудио, прогресс чтения', () => {
  test('у кнопки «Отменить» в уведомлении нет шеврона', () => {
    const t = new Toaster();
    const el = t.show('Блок удалён', { action: 'Отменить', timeout: 50 });
    const btn = el.querySelector('.ted-ui-toast__action');
    ok(btn && btn.textContent === 'Отменить', 'кнопка есть');
    eq(btn.querySelectorAll('svg').length, 0, 'значка нет');
    t.close(el);
    t.stack.remove();
  });
  test('удалённый аудиоблок не продолжает играть', () => {
    const audio = document.createElement('audio');
    audio.muted = true;
    let paused = false;
    const player = buildAudioPlayer(audio, { name: 'x' });
    Object.defineProperty(audio, 'paused', { get: () => paused, configurable: true });
    audio.pause = () => { paused = true; };
    audio.dispatchEvent(new Event('timeupdate'));   // аудио не в документе и «играет»
    ok(paused, 'остановлено');
    player.dispatchEvent(new Event('ted-audio-destroy'));
  });
  test('полоса прогресса чтения прилипает к верху прокручиваемой области статьи с отступом 8', async () => {
    if (!globalThis.TedContent?.mount) return ok(true, 'content.js не подключён');
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:0;top:100px;width:600px;height:300px;overflow:auto;';
    box.innerHTML = '<div class="ted-content"><nav class="ted-toc"><div class="ted-toc__progress"><div class="ted-toc__bar"></div></div><div class="ted-toc__panel"><p class="ted-toc__title">Содержание</p><ul class="ted-toc__list"><li><a href="#a">А</a></li></ul></div></nav>' + '<p>текст</p>'.repeat(80) + '</div>';
    document.body.appendChild(box);
    try {
      TedContent.mount(box);
      box.scrollTop = 600;
      box.dispatchEvent(new Event('scroll'));
      await wait(80);
      const toc = box.querySelector('.ted-toc');
      ok(toc.hasAttribute('data-ted-stuck'), 'прилипла');
      eq(Math.round(box.querySelector('.ted-toc__progress').getBoundingClientRect().top), 108, 'верх области + 8');
    } finally { box.remove(); }
  });
});

group('Правки 22.11: заглушка на новой пустой строке внутри блока', () => {
  const at = (ed, node, offset) => {
    ed.focus();
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    ed.updatePlaceholders();
  };
  test('аккордеон: новый пустой абзац ответа — заглушка абзаца с «/»', () => {
    const ed = make('<div class="ted-accordion"><div class="ted-accordion__item"><div class="ted-accordion__q">В</div><div class="ted-accordion__body"><p>Ответ</p></div></div></div><p>x</p>');
    const p = document.createElement('p'); p.appendChild(document.createElement('br'));
    ed.editable.querySelector('.ted-accordion__body').appendChild(p);
    at(ed, p, 0);
    ok((p.getAttribute('data-tedui-ph') || '').includes('/'), 'заглушка: ' + p.getAttribute('data-tedui-ph'));
    ed.destroy();
  });
  test('выноска: новый пустой абзац — «Текст выноски»', () => {
    const ed = make('<blockquote class="ted-callout"><p><strong>З</strong></p><p>Текст</p></blockquote><p>x</p>');
    const p = document.createElement('p'); p.appendChild(document.createElement('br'));
    ed.editable.querySelector('blockquote').appendChild(p);
    at(ed, p, 0);
    eq(p.getAttribute('data-tedui-ph'), 'Текст выноски');
    ed.destroy();
  });
  test('цветной фон: пустая строка после переноса — «Текст на цветном фоне» в начале строки', () => {
    const ed = make('<p class="ted-bg-color1">Фон</p><p>x</p>');
    const p = ed.editable.querySelector('p.ted-bg-color1');
    p.append(document.createElement('br'), document.createElement('br'));
    at(ed, p, 2);
    eq(p.getAttribute('data-tedui-phline'), 'Текст на цветном фоне');
    ok(parseFloat(ed.editable.style.getPropertyValue('--ted-ph-y')) > 10, 'на второй строке');
    at(ed, p.firstChild, 1);
    ok(!p.hasAttribute('data-tedui-phline'), 'в строке с текстом заглушки нет');
    ed.destroy();
  });
  test('код: пустая новая строка — «Код»', () => {
    const ed = make('<pre data-lang="js" data-nums="1"><code>a</code></pre><p>x</p>');
    const code = ed.editable.querySelector('pre > code');
    code.textContent = 'let a;\n\nb';
    at(ed, code.firstChild, 7);
    eq(code.getAttribute('data-tedui-phline'), 'Код');
    ok(!ed.getHTML().includes('phline'), 'в сохранённом HTML заглушки нет');
    ed.destroy();
  });
});

group('Правки 22.11: колонки и блоки внутри контейнеров', () => {
  const at = (ed, node, offset = 0) => {
    ed.focus();
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    ed.updateState();
  };
  const key = (ed, k, shift = false) => {
    const e = new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true });
    ed.editable.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const COLS = '<div class="ted-columns ted-columns--2"><div class="ted-columns__col"><p>Лево</p></div><div class="ted-columns__col"><p>Право</p></div></div><p>после</p>';
  test('Tab — в следующую колонку, Shift+Tab — обратно', () => {
    const ed = make(COLS, {}, { width: 1000 });
    const [a, b] = ed.editable.querySelectorAll('.ted-columns__col > p');
    at(ed, a.firstChild, 2);
    ok(key(ed, 'Tab'), 'Tab обработан');
    ok(b.contains(getSelection().anchorNode), 'курсор во второй колонке');
    ok(key(ed, 'Tab', true), 'Shift+Tab обработан');
    ok(a.contains(getSelection().anchorNode), 'курсор в первой колонке');
    ed.destroy();
  });
  test('последняя колонка: две пустые строки и Enter — выход из колонок, пустые строки убраны', () => {
    const ed = make(COLS, {}, { width: 1000 });
    const col = ed.editable.querySelectorAll('.ted-columns__col')[1];
    const e1 = document.createElement('p'); e1.appendChild(document.createElement('br'));
    const e2 = document.createElement('p'); e2.appendChild(document.createElement('br'));
    col.append(e1, e2);
    at(ed, e2, 0);
    ok(key(ed, 'Enter'), 'Enter обработан');
    eq(col.children.length, 1, 'в колонке осталась строка с текстом');
    const after = ed.editable.querySelector('.ted-columns').nextElementSibling;
    ok(after && after.tagName === 'P' && !after.textContent.trim(), 'новый пустой абзац под колонками');
    ok(after.contains(getSelection().anchorNode) || getSelection().anchorNode === after, 'курсор в нём');
    ed.destroy();
  });
  test('одна пустая строка в конце колонки — Enter остаётся в колонке (пустую строку поставить можно)', () => {
    const ed = make(COLS, {}, { width: 1000 });
    const col = ed.editable.querySelectorAll('.ted-columns__col')[1];
    const e1 = document.createElement('p'); e1.appendChild(document.createElement('br'));
    col.append(e1);
    at(ed, e1, 0);
    ok(!ed.columns.onEnter(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })), 'не выход');
    ed.destroy();
  });
  test('курсор в блоке ответа аккордеона — кнопки ⠿ 🗑 у этого блока; удаление последнего блока ответа оставляет пустую строку', () => {
    const ed = make('<div class="ted-accordion"><div class="ted-accordion__item"><div class="ted-accordion__q">В</div><div class="ted-accordion__body"><p>Один</p><p>Два</p></div></div></div><p>после</p>', {}, { width: 1000 });
    const [one, two] = ed.editable.querySelectorAll('.ted-accordion__body > p');
    at(ed, two.firstChild, 1);
    eq(ed.handle.focused, two, 'кнопки у внутреннего блока');
    ed.handle.remove(two);
    ed.handle.remove(one);
    const body = ed.editable.querySelector('.ted-accordion__body');
    ok(body && body.children.length === 1 && !body.textContent.trim(), 'в ответе пустая строка: ' + (body && body.innerHTML));
    ed.destroy();
  });
  test('во второй колонке кнопки блока — строкой над блоком справа (слева соседняя колонка)', () => {
    const ed = make(COLS, {}, { width: 1000 });
    const b = ed.editable.querySelectorAll('.ted-columns__col > p')[1];
    at(ed, b.firstChild, 1);
    eq(ed.handle.focused, b);
    const c = ed.handle.controls.getBoundingClientRect();
    const r = b.getBoundingClientRect();
    ok(c.bottom <= r.top + 2 && c.right <= r.right + 2 && c.left >= r.left - 2, 'над блоком в его пределах: ' + JSON.stringify([c.left, c.top, c.right, c.bottom, r.left, r.top, r.right]));
    ed.destroy();
  });
  test('перенос блока из ответа аккордеона в документ и из документа в колонку (crossTarget + endDrag)', () => {
    const ed = make('<div class="ted-accordion"><div class="ted-accordion__item"><div class="ted-accordion__q">В</div><div class="ted-accordion__body"><p>Один</p><p>Два</p></div></div></div><p>после</p>' + COLS, {}, { width: 1000 });
    const two = ed.editable.querySelectorAll('.ted-accordion__body > p')[1];
    const after = ed.editable.querySelector(':scope > p');
    ed.handle.startDrag(two, two.getBoundingClientRect().top + 4, null, two.getBoundingClientRect().left + 4);
    const ar = after.getBoundingClientRect();
    ed.handle.onDrag({ clientX: ar.left + 20, clientY: ar.bottom - 2, buttons: 1 });
    ok(ed.handle.drag.cross && ed.handle.drag.cross.parent === ed.editable, 'место — в документе');
    ed.handle.endDrag(false);
    eq(two.parentNode, ed.editable, 'вышел из аккордеона');
    const col = ed.editable.querySelectorAll('.ted-columns__col')[1];
    ed.handle.startDrag(after, after.getBoundingClientRect().top + 4, null, after.getBoundingClientRect().left + 4);
    const cr = col.getBoundingClientRect();
    ed.handle.onDrag({ clientX: cr.left + 20, clientY: cr.bottom - 2, buttons: 1 });
    ed.handle.endDrag(false);
    eq(after.parentNode, col, 'абзац во второй колонке');
    ed.destroy();
  });
  test('контейнер в тело другого контейнера не переносится', () => {
    const ed = make('<div class="ted-accordion"><div class="ted-accordion__item"><div class="ted-accordion__q">В</div><div class="ted-accordion__body"><p>Один</p></div></div></div>' + COLS, {}, { width: 1000 });
    const acc = ed.editable.querySelector('.ted-accordion');
    const col = ed.editable.querySelector('.ted-columns__col');
    ed.handle.startDrag(acc, acc.getBoundingClientRect().top + 4, null, acc.getBoundingClientRect().left + 4);
    const cr = col.getBoundingClientRect();
    ed.handle.onDrag({ clientX: cr.left + 20, clientY: cr.top + 4, buttons: 1 });
    ed.handle.endDrag(false);
    eq(acc.parentNode, ed.editable, 'аккордеон остался в документе');
    ed.destroy();
  });
});

group('Правки 22.11: содержание, вкладки, выноска, кнопка, товар, галерея, вставка, уведомления, история', () => {
  const at = (ed, node, offset = 0) => {
    ed.focus();
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    ed.updateState();
  };
  const key = (ed, k, extra = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
    ed.editable.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const TOC = '<nav class="ted-toc"><div class="ted-toc__progress"><div class="ted-toc__bar"></div></div><div class="ted-toc__panel"><p class="ted-toc__title">Содержание</p><ul class="ted-toc__list"><li><a href="#a">Глава</a></li></ul></div></nav><p>после</p>';

  test('содержание: Enter в заголовке — окно новой главы под блоком', async () => {
    const ed = make(TOC, {}, { width: 1000 });
    const title = ed.editable.querySelector('.ted-toc__title');
    at(ed, title.firstChild, 3);
    ok(key(ed, 'Enter'), 'Enter обработан');
    await wait(10);
    ok(ed.popover.isOpen, 'окно открыто');
    eq(ed.popover.el.querySelector('.ted-ui-form__title').textContent, 'Глава содержания');
    const toc = ed.editable.querySelector('.ted-toc');
    ok(ed.popover.el.getBoundingClientRect().top >= toc.getBoundingClientRect().bottom, 'окно под блоком');
    ed.popover.close();
    ed.destroy();
  });
  test('содержание: стрелка вправо в конце заголовка — в следующий блок (не в список глав)', () => {
    const ed = make(TOC, {}, { width: 1000 });
    const title = ed.editable.querySelector('.ted-toc__title');
    at(ed, title.firstChild, title.firstChild.length);
    ok(key(ed, 'ArrowRight'), 'обработана');
    const after = ed.editable.querySelector(':scope > p');
    ok(after.contains(getSelection().anchorNode) || getSelection().anchorNode === after, 'курсор в абзаце после блока');
    ed.destroy();
  });
  test('содержание: «Скрыть» сворачивает список в редакторе, «Показать» — разворачивает; признак не сохраняется', () => {
    const ed = make(TOC, {}, { width: 1000 });
    ed.updateState();
    const toggle = ed.editable.querySelector('.ted-toc__toggle');
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const list = ed.editable.querySelector('.ted-toc__list');
    ok(document.getAnimations().some((x) => x.transitionProperty === 'height' || x.transitionProperty === 'opacity'), 'сворачивается плавно');
    document.getAnimations().forEach((x) => x.finish());
    eq(Math.round(list.getBoundingClientRect().height) + ' ' + getComputedStyle(list).visibility, '0 hidden', 'свёрнуто');
    eq(toggle.textContent, 'Показать');
    ok(!/collapsed/.test(ed.getInnerHTML()), 'в HTML нет признака');
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    document.getAnimations().forEach((x) => x.finish());
    ok(list.getBoundingClientRect().height > 0 && getComputedStyle(list).visibility === 'visible', 'развёрнуто');
    ed.destroy();
  });
  test('содержание: пока главу тащат, её кнопки ⠿ 🗑 и «Добавить главу» на месте', () => {
    const ed = make(TOC.replace('<li><a href="#a">Глава</a></li>', '<li><a href="#a">Один</a></li><li><a href="#b">Два</a></li>'), {}, { width: 1000 });
    const li = ed.editable.querySelector('.ted-toc__list > li');
    li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    ed.handle.startDrag(li, li.getBoundingClientRect().top + 2, [...li.parentNode.children]);
    ed.updateState();
    ok(ed.handle.itemControls.classList.contains('is-visible'), 'кнопки главы видны');
    ok(ed.toc.addBtn.classList.contains('is-visible'), '«Добавить главу» видна');
    ed.handle.endDrag(true);
    ed.destroy();
  });
  test('вкладки и выноска: в названии вкладки и заголовке выноски «Жирного» нет, Ctrl+B не действует', () => {
    const ed = make('<blockquote class="ted-callout"><p><strong>Заголовок</strong></p><p>Текст</p></blockquote><p>x</p>', {}, { width: 1000 });
    const title = ed.editable.querySelector('blockquote > p strong');
    at(ed, title.firstChild, 2);
    ok(ed.toolbar.marks.bold.hidden, 'кнопки нет');
    const before = ed.getInnerHTML();
    ed.exec('bold');
    eq(ed.getInnerHTML(), before, 'заголовок не изменился');
    at(ed, ed.editable.querySelectorAll('blockquote > p')[1].firstChild, 2);
    ok(!ed.toolbar.marks.bold.hidden, 'в тексте выноски «Жирный» есть');
    ed.destroy();
  });
  test('кнопка: текст из окна сразу виден на кнопке; «Отмена» возвращает как было', async () => {
    const ed = make('<div class="ted-button"><a class="ted-button__btn" href="/a">Подробнее</a></div><p>x</p>', {}, { width: 1000 });
    const a = ed.editable.querySelector('.ted-button > a');
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(10);
    const input = ed.popover.el.querySelector('input[aria-label="Текст кнопки"]');
    input.value = 'Купить';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    eq(ed.editable.querySelector('.ted-button > a').textContent, 'Купить', 'сразу на кнопке');
    const banner = [...ed.popover.el.querySelectorAll('.ted-ui-toggle')].find((x) => /Баннер/.test(x.textContent)).querySelector('input');
    banner.checked = true;
    banner.dispatchEvent(new Event('change', { bubbles: true }));
    ok(ed.editable.querySelector('.ted-button--banner .ted-button__title'), 'баннер виден сразу');
    ed.popover.el.querySelector('.ted-ui-action--gray').click();
    await wait(10);
    ok(!ed.editable.querySelector('.ted-button--banner'), 'отмена убрала баннер');
    eq(ed.editable.querySelector('.ted-button > a').textContent, 'Подробнее', 'отмена вернула текст');
    ed.destroy();
  });
  test('баннер: Enter в тексте — новый абзац под блоком (выход из блока)', () => {
    const ed = make('<div class="ted-button ted-button--banner"><div class="ted-button__text"><p class="ted-button__title">Заг</p><p class="ted-button__desc">Текст</p></div><a class="ted-button__btn" href="/a">Купить</a></div>', {}, { width: 1000 });
    const desc = ed.editable.querySelector('.ted-button__desc');
    at(ed, desc.firstChild, 5);
    ok(key(ed, 'Enter'), 'Enter обработан');
    const next = ed.editable.querySelector('.ted-button').nextElementSibling;
    ok(next && next.tagName === 'P' && (next.contains(getSelection().anchorNode) || getSelection().anchorNode === next), 'курсор в абзаце под баннером');
    ed.destroy();
  });
  test('товар: загруженная картинка — в учёте файлов (не удаляется при сохранении)', () => {
    const urls = productFilesOf('<div class="ted-product"><img class="ted-product__img" src="/uf/images/x.webp" alt=""></div>', '/uf');
    ok(urls.has('/uf/images/x.webp'));
  });
  test('галерея: перестановка не пересоздаёт картинки (без мигания)', async () => {
    const ed = make('<p></p>', { mediaSource: 'manager', pickFile: () => [{ url: '/uf/images/a.webp', alt: 'A' }, { url: '/uf/images/b.webp', alt: 'B' }, { url: '/uf/images/c.webp', alt: 'C' }] });
    const block = ed.media.create('gallery', ed.lastBlock());
    block.querySelector('.ted-ui-media__drop').click();
    await wait(30);
    const imgs = [...block.querySelectorAll('.ted-media--gallery > figure > img')];
    ed.media.reorder(block, 0, 2);
    const after = [...block.querySelectorAll('.ted-media--gallery > figure > img')];
    eq(after.map((i) => i.getAttribute('alt')).join(), 'B,C,A', 'порядок');
    ok(after.every((i) => imgs.includes(i)), 'те же элементы картинок');
    ed.destroy();
  });
  test('вставка блока командой (горячей клавишей): курсор в блоке, как из меню; шаги и чек-лист тоже вставляются', () => {
    for (const [type, sel] of [['callout', 'blockquote.ted-callout'], ['steps', 'ol.ted-steps'], ['checklist', 'ul.ted-checklist']]) {
      const ed = make('<p>до</p>', {}, { width: 1000 });
      at(ed, ed.editable.querySelector('p').firstChild, 2);
      ed.insertBlock(type);
      const el = ed.editable.querySelector(sel);
      ok(el, type + ' вставлен');
      ok(el && el.contains(getSelection().anchorNode), type + ': курсор в блоке');
      ed.destroy();
    }
  });
  test('уведомления складываются колодой: новое спереди, старое за ним меньше', () => {
    const tt = new Toaster();
    const a = tt.show('Первое', { timeout: 5000 });
    const b = tt.show('Второе', { timeout: 5000 });
    eq(b.style.getPropertyValue('--toast-scale'), '1', 'новое — полный размер');
    eq(a.style.getPropertyValue('--toast-scale'), '0.95', 'старое меньше');
    ok(a.hasAttribute('data-back') && !b.hasAttribute('data-back'));
    tt.layout(true);
    ok(parseFloat(a.style.getPropertyValue('--toast-y')) < -8, 'при наведении — списком');
    tt.destroy();
  });
  test('история: служебные поля блоков (подпись, адрес) не попадают в снимки — отмена не делает лишнего шага', () => {
    const ed = make('<p>x</p>', {}, { width: 1000 });
    const f = document.createElement('input');
    f.setAttribute('data-tedui-m', '');
    ed.editable.querySelector('p').appendChild(f);
    ok(!/data-tedui-m|<input/.test(ed.history.snapshot().html), 'поля нет в снимке');
    ed.destroy();
  });
  test('открытие редактора: блоки появляются по очереди (класс на время появления)', () => {
    const ed = make('<p>a</p><p>b</p>', { appear: true });
    ok(ed.ui.classList.contains('is-appearing'), 'появление включено');
    const d1 = getComputedStyle(ed.editable.children[1]).animationDelay;
    ok(d1 && d1 !== '0s', 'второй блок с задержкой: ' + d1);
    ed.destroy();
  });
  test('окно у блока идёт за ним, когда выше меняется высота (раскрылся аккордеон)', async () => {
    const ed = make('<p>верх</p><nav class="ted-toc"><div class="ted-toc__progress"><div class="ted-toc__bar"></div></div><div class="ted-toc__panel"><p class="ted-toc__title">С</p><ul class="ted-toc__list"><li><a href="#a">Глава</a></li></ul></div></nav><p>низ</p>', {}, { width: 1000 });
    const li = ed.editable.querySelector('.ted-toc__list > li');
    li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(30);
    const top0 = ed.popover.el.getBoundingClientRect().top;
    const big = document.createElement('p'); big.style.height = '900px';   // выше min-height редактора — поле правки меняет высоту big.textContent = 'x';
    ed.editable.querySelector('p').after(big);
    ed.handle.onLayout();   // в браузере это делает ResizeObserver поля правки (в тестах без отрисовки он не срабатывает)
    await wait(20);
    ok(ed.popover.el.getBoundingClientRect().top - top0 > 150, 'окно сдвинулось вместе с главой');
    ed.popover.close();
    ed.destroy();
  });
});

group('Правки 22.11: анимации на сайте (аккордеон, вкладки, содержание)', () => {
  const site = (html) => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.style.width = '800px';
    box.innerHTML = html;
    document.body.appendChild(box);
    globalThis.TedContent?.mount?.(box);
    return box;
  };
  test('токены движения сайта: --ted-motion-fast/base/slow и кривые', () => {
    const box = site('<p>x</p>');
    const cs = getComputedStyle(box);
    eq(['--ted-motion-fast', '--ted-motion-base', '--ted-motion-slow'].map((v) => cs.getPropertyValue(v).trim()).join(' '), '120ms 180ms 240ms');
    ok(cs.getPropertyValue('--ted-ease-out').includes('cubic-bezier'), 'ease-out');
    box.remove();
  });
  test('вкладки: одно подчёркивание переезжает к выбранной вкладке; первая установка — без движения', () => {
    if (!globalThis.TedContent?.mount) return ok(true, 'content.js не подключён');
    const box = site('<div class="ted-tabs"><div class="ted-tabs__panel"><p class="ted-tabs__title">Один</p><div class="ted-tabs__body"><p>1</p></div></div><div class="ted-tabs__panel"><p class="ted-tabs__title">Второй длиннее</p><div class="ted-tabs__body"><p>2</p></div></div></div>');
    try {
      const bar = box.querySelector('.ted-tabs__bar');
      const ink = bar.querySelector(':scope > .ted-tabs__ink');
      const btn = [...bar.querySelectorAll('.ted-tabs__tab')];
      ok(ink && ink.getAttribute('aria-hidden') === 'true', 'полоса есть');
      ok(!bar.hasAttribute('data-ted-glide'), 'при открытии не едет');
      eq(ink.style.getPropertyValue('--ted-ink-w'), String(btn[0].offsetWidth), 'ширина первой');
      eq(getComputedStyle(btn[0]).borderBottomColor, 'rgba(0, 0, 0, 0)', 'своё подчёркивание активной скрыто под полосой');
      btn[1].click();
      ok(bar.hasAttribute('data-ted-glide'), 'едет');
      eq(ink.style.getPropertyValue('--ted-ink-x'), btn[1].offsetLeft + 'px', 'к второй');
      ok(/transform/.test(getComputedStyle(ink).transitionProperty), 'переход по transform');
      ok(/^(linear|cubic-bezier)/.test(bar.style.getPropertyValue('--ted-ease-spring')), 'пружина');
      eq(getComputedStyle(ink).backgroundColor, 'rgb(25, 117, 247)', 'цвет активной (main/color1/main)');
    } finally { box.remove(); }
  });
  test('аккордеон на сайте: ответ проявляется со сдвигом; в редакторе — своё раскрытие без прозрачности', () => {
    const html = '<div class="ted-accordion"><details class="ted-accordion__item"><summary class="ted-accordion__q">Вопрос</summary><div class="ted-accordion__body"><p>Ответ</p></div></details></div>';
    const box = site(html);
    try {
      const body = box.querySelector('.ted-accordion__body');
      eq(getComputedStyle(body).opacity, '0', 'закрыт — ответ прозрачный');
      ok(/opacity/.test(getComputedStyle(body).transitionProperty), 'переход прозрачности');
      box.querySelector('details').open = true;
      ok(/240ms|0\.24s/.test(getComputedStyle(body).transitionDuration), 'открытие — slow: ' + getComputedStyle(body).transitionDuration);
    } finally { box.remove(); }
    const ed = make(html + '<p>x</p>', {}, { width: 1000 });
    eq(getComputedStyle(ed.editable.querySelector('.ted-accordion__body')).opacity, '1', 'в редакторе без прозрачности');
    ed.destroy();
  });
});

group('Независимая проверка 22.11: найденные ошибки', () => {
  const at = (ed, node, offset = 0) => {
    ed.focus();
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    ed.updateState();
  };
  const key = (ed, k, extra = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
    ed.editable.dispatchEvent(e);
    return e.defaultPrevented;
  };
  test('товар: «Стиль текста» не превращает карточку в заголовок; кнопки стиля у товара нет', () => {
    const ed = make('<div class="ted-product"><img class="ted-product__img" src="/uf/images/x.webp" alt=""><div class="ted-product__info"><p class="ted-product__name">Коврик</p><p class="ted-product__price"><span class="ted-product__now">990 ₽</span></p></div><a class="ted-product__btn" href="https://a.example/" target="_blank" rel="noopener">Перейти</a></div><p>x</p>', {}, { width: 1000 });
    ed.updateState();
    ed.editable.querySelector('.ted-ui-prodfield').focus();
    ed.updateState();
    ok(ed.toolbar.styleBtn.hidden, 'кнопки «Стиль текста» нет');
    ed.exec('block:h2');
    ok(ed.editable.querySelector('.ted-product') && !/<h2/.test(ed.getInnerHTML()), ed.getInnerHTML());
    ed.destroy();
  });
  test('код: Tab ставит табуляцию в месте курсора («a», Tab, «b» → «a⇥b»)', () => {
    const ed = make('<pre><code>a</code></pre><p>x</p>', {}, { width: 1000 });
    const code = ed.editable.querySelector('code');
    const t = [...code.childNodes].find((n) => n.nodeType === 3 && n.textContent.includes('a'));
    at(ed, t, t.textContent.indexOf('a') + 1);
    ok(key(ed, 'Tab'), 'Tab обработан');
    document.execCommand('insertText', false, 'b');
    eq(ed.editable.querySelector('code').textContent, 'a\tb');
    ed.destroy();
  });
  test('код: номера строк обновляются сразу по Enter', () => {
    const ed = make('<pre><code>if (a) {\n}</code></pre><p>x</p>', {}, { width: 1000 });
    const code = ed.editable.querySelector('code');
    at(ed, code.firstChild, 8);
    key(ed, 'Enter');
    key(ed, 'Enter');
    const pre = ed.editable.querySelector('pre');
    eq(pre.getAttribute('data-nums').split('\n').length, pre.textContent.split('\n').length, 'номеров столько же, сколько строк');
    ed.destroy();
  });
  test('Backspace под блоком без текста выделяет его, а не удаляет; пустая строка убирается; второй Backspace — удаление', () => {
    const ed = make('<p>до</p><hr><p><br></p>', {}, { width: 1000 });
    at(ed, ed.editable.lastElementChild, 0);
    ok(key(ed, 'Backspace'), 'обработан');
    ok(ed.editable.querySelector('hr'), 'линия на месте');
    eq(ed.editable.children.length, 2, 'пустая строка убрана');
    const r = getSelection().getRangeAt(0);
    eq(ed.editable.childNodes[r.startOffset], ed.editable.querySelector('hr'), 'линия выделена');
    key(ed, 'Backspace');
    ok(!ed.editable.querySelector('hr'), 'второй Backspace удалил');
    ed.destroy();
  });
  test('Backspace в начале текста под блоком без текста выделяет его, текст не трогает', () => {
    const ed = make('<hr><p>текст</p>', {}, { width: 1000 });
    at(ed, ed.editable.querySelector('p').firstChild, 0);
    key(ed, 'Backspace');
    ok(ed.editable.querySelector('hr') && ed.editable.querySelector('p').textContent === 'текст');
    ed.destroy();
  });
  test('новая кнопка: введённое в окне и Esc — текст остаётся, курсор в редакторе', async () => {
    const ed = make('<p>до</p>', {}, { width: 1000 });
    const p = ed.editable.querySelector('p');
    at(ed, p.firstChild, 2);
    Object.assign(ed.blockMenu, { mode: 'insert', target: p, slash: null });
    ed.blockMenu.choose(ed.blockMenu.groups().flatMap((g) => g.items).find((i) => i.type === 'button'));
    await wait(20);
    const inp = ed.popover.el.querySelector('input[aria-label="Текст кнопки"]');
    inp.value = 'Купить';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(20);
    eq(ed.editable.querySelector('.ted-button a').textContent, 'Купить', 'текст остался');
    eq(document.activeElement, ed.editable, 'курсор в редакторе');
    ed.destroy();
  });
  test('Esc в «Добавить блок» — курсор обратно туда, где был', async () => {
    const ed = make('<p>Первый абзац</p><p>второй</p>', {}, { width: 1000 });
    const p = ed.editable.querySelector('p');
    at(ed, p.firstChild, 5);
    ed.blockMenu.openPicker(p);
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await wait(20);
    const s = getSelection();
    ok(document.activeElement === ed.editable && s.anchorNode === p.firstChild && s.anchorOffset === 5, 'курсор на месте');
    ed.destroy();
  });
  const TABS = '<div class="ted-tabs"><div class="ted-tabs__panel"><p class="ted-tabs__title">Один</p><div class="ted-tabs__body"><p>т1</p></div></div><div class="ted-tabs__panel"><p class="ted-tabs__title">Два</p><div class="ted-tabs__body"><p>т2</p></div></div></div><p>x</p>';
  test('вкладки: после загрузки статьи в открытый редактор первая вкладка выбрана', () => {
    const ed = make('<p>a</p>', {}, { width: 1000 });
    ed.setHTML(TABS);
    eq([...ed.editable.querySelectorAll('.ted-tabs__title[data-tedui-active]')].map((e) => e.textContent).join(), 'Один');
    ok(ed.editable.querySelector('.ted-tabs__body[data-tedui-active]').getBoundingClientRect().height > 0, 'содержимое видно');
    ed.destroy();
  });
  test('вкладки: Tab в названии — к следующей вкладке, Shift+Tab — к предыдущей', () => {
    const ed = make(TABS, {}, { width: 1000 });
    const titles = () => [...ed.editable.querySelectorAll('.ted-tabs__title')];
    at(ed, titles()[0].firstChild, 2);
    ok(key(ed, 'Tab'));
    ok(titles()[1].contains(getSelection().anchorNode) && titles()[1].hasAttribute('data-tedui-active'), 'во второй');
    key(ed, 'Tab', { shiftKey: true });
    ok(titles()[0].contains(getSelection().anchorNode), 'обратно в первой');
    ed.destroy();
  });
  test('ключевые цифры: Enter в пустой последней плитке — выход в абзац под блоком (и при двух плитках)', () => {
    const ed = make('<ul class="ted-facts"><li><strong>10</strong><br>лет</li><li><strong>5</strong><br>x</li></ul><p>после</p>', {}, { width: 1000 });
    const li = ed.editable.querySelectorAll('.ted-facts > li')[1];
    const s = li.querySelector('strong');
    s.replaceChildren(document.createElement('br'));
    li.lastChild.textContent = '';
    at(ed, s, 0);
    key(ed, 'Enter');
    key(ed, 'Enter');
    const a = getSelection().anchorNode;
    const el = a.nodeType === 1 ? a : a.parentElement;
    ok(!el.closest('.ted-facts') && el.closest('p'), 'курсор в абзаце под блоком');
    ed.destroy();
  });
});

group('Отступы между блоками внутри вкладок, колонок, аккордеона (заказчик 22.11)', () => {
  const BODY = '<p>раз</p><p>два</p><h2>Заголовок</h2><p>три</p>';
  const HTML = '<div class="ted-tabs"><div class="ted-tabs__panel"><p class="ted-tabs__title">Т</p><div class="ted-tabs__body">' + BODY + '</div></div></div>'
    + '<div class="ted-accordion"><details class="ted-accordion__item" open><summary class="ted-accordion__q">В</summary><div class="ted-accordion__a"><div class="ted-accordion__body">' + BODY + '</div></div></details></div>'
    + '<div class="ted-columns ted-columns--2"><div class="ted-columns__col">' + BODY + '</div><div class="ted-columns__col"><p>x</p></div></div><p>после</p>';
  const gaps = (root, sel) => [...root.querySelector(sel).children].map((e) => getComputedStyle(e).marginTop + '/' + getComputedStyle(e).marginBottom).join(' ');
  const WANT = '0px/20px 0px/20px 40px/20px 0px/0px';
  test('в редакторе: как в статье — 20 между блоками, над заголовком 20 + 20', () => {
    const ed = make(HTML, {}, { width: 1000 });
    for (const sel of ['.ted-tabs__body', '.ted-accordion__body', '.ted-columns__col']) eq(gaps(ed.editable, sel), WANT, sel);
    ed.destroy();
  });
  test('на сайте: то же', () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.style.width = '900px';
    box.innerHTML = HTML;
    document.body.appendChild(box);
    try {
      for (const sel of ['.ted-tabs__body', '.ted-accordion__body', '.ted-columns__col']) eq(gaps(box, sel), WANT, sel);
    } finally { box.remove(); }
  });
});

group('Меню блока: в начало / в конец, единый отступ и стрелка; один аудиоплеер (заказчик 22.11)', () => {
  test('«Отправить в начало» и «Отправить в конец»: блок встаёт первым / последним, Undo возвращает; у крайнего блока пункта нет', () => {
    const ed = make('<p>один</p><p>два</p><p>три</p>', {}, { width: 1000 });
    const texts = () => [...ed.editable.children].map((e) => e.textContent).join(',');
    const two = ed.editable.children[1];
    ed.handle.openMenu(two, ed.handle.ctrlGrip);
    const item = (v) => ed.popover.el.querySelector(`[data-value="${v}"]`) || [...ed.popover.el.querySelectorAll('.ted-ui-item')].find((x) => x.textContent.includes(v === 'to-top' ? 'в начало' : 'в конец'));
    ok(item('to-top') && item('to-bottom'), 'оба пункта');
    item('to-top').click();
    eq(texts(), 'два,один,три');
    ed.history.undo();
    eq(texts(), 'один,два,три', 'Undo');
    ed.handle.moveToEdge(ed.editable.children[0], 'end');
    eq(texts(), 'два,три,один');
    ed.handle.openMenu(ed.editable.children[0], ed.handle.ctrlGrip);
    ok(!item('to-top') && item('to-bottom'), 'у первого — только «в конец»');
    ed.popover.close();
    ed.destroy();
  });
  test('меню блока — одинаково у всех блоков: уголок на 8 ниже подложки (16 от блока), левый край — по подложке', async () => {
    const ed = make('<p>абзац</p><pre><code>код</code></pre><hr><blockquote class="ted-callout"><p>в</p></blockquote><p>x</p>', {}, { width: 1000 });
    const out = [];
    for (const b of [...ed.editable.children].slice(0, 4)) {
      ed.handle.openMenu(b, ed.handle.ctrlGrip);
      document.getAnimations().forEach((x) => x.finish());
      ed.popover.place();
      const br = b.getBoundingClientRect();
      const pr = ed.popover.el.getBoundingClientRect();
      out.push(`${b.tagName}:${Math.round(pr.top - br.bottom)}/${Math.round(pr.left - br.left)}`);
      ed.popover.close();
      await wait(120);
    }
    eq(out.join(' '), 'P:16/-8 PRE:16/-8 HR:16/-8 BLOCKQUOTE:16/-8');
    ed.destroy();
  });
  test('светлая тема: стрелка окна видна целиком (8 × 4 над окном)', () => {
    const ed = make('<p>абзац</p><p>x</p>', {}, { width: 1000 });
    ed.handle.openMenu(ed.editable.firstElementChild, ed.handle.ctrlGrip);
    const corner = ed.popover.el.querySelector('.ted-ui-pop__corner');
    const clip = getComputedStyle(corner, '::after').clipPath;
    ok(/M\s*0\s*6\s*V\s*4/.test(clip) || clip.includes('0.444'), 'уголок целиком: ' + clip);
    ed.popover.close();
    ed.destroy();
  });
  test('в редакторе один аудиоплеер, даже если на странице подключён скрипт сайта', () => {
    const ed = make('<figure class="ted-media ted-media--audio"><audio src="/uf/audio/a.mp3" controls title="a"></audio></figure><p>x</p>', {}, { width: 1000 });
    for (const a of ed.ui.querySelectorAll('audio')) { a.muted = true; a.pause(); }
    globalThis.TedContent?.mount?.();
    eq(ed.editable.querySelectorAll('.ted-audio').length, 1, 'один плеер');
    ok(!ed.editable.querySelector('[data-ted-player]'), 'плеер сайта в редактор не попал');
    ed.destroy();
  });
});

group('Решения 22.11: колонки, товар, встраивание, типограф', () => {
  test('в колонку не вставляются слишком широкие блоки (товар, таблица): нет в меню «/» и не переносятся', () => {
    const ed = make('<div class="ted-columns ted-columns--2"><div class="ted-columns__col"><p>a</p></div><div class="ted-columns__col"><p>b</p></div></div><p>x</p>', {}, { width: 1000 });
    const p = ed.editable.querySelector('.ted-columns__col p');
    ed.blockMenu.target = p;
    ed.blockMenu.mode = 'slash';
    const types = ed.blockMenu.groups().flatMap((g) => g.items.map((i) => i.type));
    ok(!types.includes('product') && !types.includes('table'), 'нет товара и таблицы: ' + types.join(','));
    ok(types.includes('image') && types.includes('p'), 'обычные блоки есть');
    ed.blockMenu.target = ed.editable.lastElementChild;
    ok(ed.blockMenu.groups().flatMap((g) => g.items.map((i) => i.type)).includes('product'), 'в статье товар есть');
    ed.blockMenu.mode = null;
    ed.destroy();
  });
  test('встраивание: у поста соцсети в аватаре буквы имени, у статьи сайта — буквы сайта', async () => {
    const { embedHTML } = await import('../../blocks/embed/embed.js');
    const base = { button: 'Открыть', text: '', image: '', views: '', likes: '', compact: true, avatar: '' };
    ok(embedHTML({ ...base, url: 'https://t.me/durov/1', title: 'Pavel Durov', sub: 'Telegram' }).includes('>PD<'), 'Telegram → PD');
    ok(embedHTML({ ...base, url: 'https://habr.com/ru/articles/1/', title: 'Длинный заголовок статьи', sub: 'Хабр' }).includes('>ХА<'), 'Хабр → ХА');
  });
  test('типограф: минус только перед числом', async () => {
    const { typografText } = await import('../../resources/js/core/typo.js');
    const t = (s) => typografText(s, 'ru', { depth: 0 }, 'P', {});
    ok(t('Мороз -5 градусов').includes('−5'), t('Мороз -5 градусов'));
    ok(t('(-3)').includes('(−3)') && t('x = -2').includes('−2'), t('x = -2'));
    ok(!t('В-1 и 2026-11-22').includes('−'), t('В-1 и 2026-11-22'));
  });
});

group('Решения 22.11: картинка в абзаце, длинный код', () => {
  test('картинка внутри абзаца — отдельным блоком «Изображение» между частями текста; опасный адрес отбрасывается', () => {
    const out = Ted.clean('<p>До <img src="/uf/images/x.webp" alt="Кот"> после</p><p><a href="/big.jpg"><img src="/uf/images/y.webp" alt=""></a></p><p>текст <span><img src="javascript:alert(1)"></span></p>');
    eq(out.split('\n').map((l) => l.replace(/ loading="lazy"/, '')).join('|'),
      '<p>До</p>|<figure class="ted-media ted-media--image"><img src="/uf/images/x.webp" alt="Кот"></figure>|<p>после</p>|<figure class="ted-media ted-media--image"><img src="/uf/images/y.webp" alt=""></figure>|<p>текст</p>');
  });
  test('код на 2000 строк загружается и собирается быстро (Safari: было 28 с)', () => {
    const code = Array.from({ length: 2000 }, (_, i) => `const value${i} = compute(${i}, "text") + 1; // line ${i}`).join('\n');
    const ed = make('<p>x</p>', {}, { width: 1000 });
    const t = performance.now();
    ed.setHTML(`<pre data-lang="js"><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre>`);
    const html = ed.getHTML();
    const ms = performance.now() - t;
    ok(html.includes('line 1999'), 'весь код на месте');
    ok(ms < 2000, `за ${Math.round(ms)} мс`);
    ed.destroy();
  });
});

group('Импорт старых статей (growtask.ru/media, 22.11)', () => {
  test('картинка TinyMCE с адресом от админки и пробелами / кириллицей в имени — блок «Изображение» с адресом от корня', () => {
    const out = Ted.clean('<p><img src="../../../uf/доставка 3.webp" width="739" height="311"></p><p><img src="../../../uf/Frame 802 (1)_x.webp"></p>');
    ok(out.includes('src="/uf/%D0%B4%D0%BE%D1%81%D1%82%D0%B0%D0%B2%D0%BA%D0%B0%203.webp"'), out);
    ok(out.includes('src="/uf/Frame%20802%20(1)_x.webp"'), out);
    eq((out.match(/ted-media--image/g) || []).length, 2);
  });
});

group('Markdown, JSON и нейросети (22.11)', () => {
  const MD = '# Заголовок\n\nАбзац с **жирным** и [ссылкой](https://example.com).\n\n## Раздел\n\n- один\n- два\n  - вложенный\n\n- [ ] задача\n- [x] готово\n\n> [!WARNING] Важно\n> Текст выноски\n\n```js\nconst a = 1;\n```\n\n| Город | Цена |\n| --- | --- |\n| Москва | 100 |\n\n---\n\nКонец <script>alert(1)</script>';
  test('Ted.fromMarkdown: заголовки, оформление, списки, чек-лист, выноска, код, таблица, линия; HTML из текста — текстом', () => {
    const html = Ted.fromMarkdown(MD);
    for (const part of ['<h2>Заголовок</h2>', '<strong>жирным</strong>', '<a href="https://example.com">ссылкой</a>', '<h3>Раздел</h3>', '<ul class="ted-checklist">', 'class="ted-checked"', '<blockquote class="ted-callout"><p><strong>Важно</strong></p><p>Текст выноски</p></blockquote>', 'data-lang="js"', '<th>Город</th>', '<hr>', 'Конец &lt;script&gt;']) ok(html.includes(part), part + ' — ' + html);
    ok(!/<script/.test(html), 'без скриптов');
  });
  test('Markdown туда и обратно: Ted.toMarkdown(Ted.fromMarkdown(md)) снова собирается в тот же HTML', () => {
    const html = Ted.fromMarkdown(MD);
    eq(Ted.fromMarkdown(Ted.toMarkdown(html)), html);
  });
  test('JSON туда и обратно без потерь: Ted.toBlocks → Ted.fromBlocks', () => {
    const html = Ted.fromMarkdown(MD);
    const blocks = Ted.toBlocks(html);
    ok(blocks.some((b) => b.type === 'h2' && b.text === 'Заголовок') && blocks.some((b) => b.type === 'hr'), JSON.stringify(blocks).slice(0, 200));
    eq(Ted.fromBlocks(blocks), html);
    ok(Ted.fromBlocks([{ type: 'markdown', text: '## Раздел\n\n- пункт' }]).includes('<h3>Раздел</h3>'), 'блок markdown');
  });
  test('вставка Markdown обычным текстом — блоками; обычный текст — абзацами', () => {
    const ed = make('<p><br></p>', {}, { width: 1000 });
    const p = ed.editable.querySelector('p');
    ed.focus();
    const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    const dt = new DataTransfer();
    dt.setData('text/plain', '## Раздел\n\n- один\n- два');
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    ok(/<h3>Раздел<\/h3>/.test(ed.getInnerHTML()) && /<ul>/.test(ed.getInnerHTML()), ed.getInnerHTML());
    ed.destroy();
  });
  test('загрузка заменяет статью, «Отменить» (Ctrl+Z) возвращает прежнюю; неизвестные блоки — в сообщении', async () => {
    const { toHtml, replaceDoc } = await import('../../resources/js/ui/exchange.js');
    const ed = make('<p>старая статья</p>', {}, { width: 1000 });
    const said = [];
    ed.toast = (m) => said.push(m);
    const { html, skipped } = toHtml('json', JSON.stringify({ blocks: [{ type: 'h2', text: 'Новая' }, { type: 'spoiler', text: 'x' }] }));
    replaceDoc(ed, html, skipped);
    eq(ed.getInnerHTML(), '<h2>Новая</h2>');
    ok(/spoiler/.test(said.join(' ')), said.join(' | '));
    ed.history.undo();
    eq(ed.getInnerHTML(), '<p>старая статья</p>', 'вернулась');
    eq(toHtml('json', 'не json').error, 'Файл не похож на JSON');
    ed.destroy();
  });
  test('«Ещё»: «Скопировать промт», «Загрузить» (JSON или Markdown), «Выгрузить ▸»; промт описывает блоки из block.json', async () => {
    const { aiPrompt } = await import('../../resources/js/ui/exchange.js');
    const ed = make('<p>x</p>', {}, { width: 1000 });
    ed.toolbar.openMoreMenu();
    const labels = [...ed.popover.el.querySelectorAll('.ted-ui-item')].map((i) => i.textContent.trim());
    eq(labels.filter((l) => /промт|Загрузить|Выгрузить|Очистить/.test(l)).join(','), 'Скопировать промт,Загрузить .md или .json,Загрузить из Word,Выгрузить в Markdown,Выгрузить в JSON,Выгрузить в Word,Очистить всё');
    ok(!labels.includes('Нейросети'), 'без отдельного подменю «Нейросети»');
    ed.popover.close();
    const p = aiPrompt();
    ok(p.includes('"type": "steps"') && p.includes('"type": "image"') && p.includes('> [!NOTE]') && p.includes('texted-blocks'), 'промт');
    ed.destroy();
  });
});

group('Файловый менеджер CMS: вид файла и отмена (22.11)', () => {
  test('в «Изображение» из библиотеки не вставляется pdf — сообщение, картинка вставляется; поздний ответ старого окна не применяется', async () => {
    let calls = 0;
    let first;
    const ed = make('<p>x</p>', { mediaSource: 'manager', pickFile: (o) => { calls++; if (calls === 1) return new Promise((r) => { first = r; }); ok(o.accept.includes('image/') && o.extensions.includes('webp'), 'менеджеру передан вид'); return [{ url: '/uf/files/price.pdf', name: 'price.pdf' }, { url: '/uf/images/a.webp', alt: 'A' }]; } }, { width: 1000 });
    const said = [];
    ed.toast = (m) => said.push(m);
    const stale = ed.chooseMedia('image', { multiple: true });   // окно закрыли без выбора — ответа нет
    const r = await ed.chooseMedia('image', { multiple: true });
    eq(r.assets.map((a) => a.url).join(), '/uf/images/a.webp');
    ok(/price\.pdf — не изображение/.test(said.join(' ')), said.join(' | '));
    first([{ url: '/uf/images/late.webp' }]);
    eq((await stale).assets.length, 0, 'поздний ответ не применён');
    ed.destroy();
  });
});

group('Две вкладки и печать (22.11)', () => {
  test('другая вкладка с тем же документом: предупреждение; там сохранили — сохранение здесь сначала спрашивает', async () => {
    const { Presence } = await import('../../resources/js/core/presence.js');
    const events = [];
    const p = new Presence('test-doc-' + Math.random(), (t) => events.push(t));
    p.receive({ type: 'hello', from: 'x1', page: 'другая' });
    p.receive({ type: 'here', from: 'x2', page: 'другая' });
    eq(events.join(), 'other', 'одно предупреждение');
    p.receive({ type: 'hello', from: 'x3', page: p.constructor.name && undefined });
    p.receive({ type: 'saved', from: 'x1', page: 'другая' });
    ok(p.otherSaved && events.includes('saved'));
    const ed = make('<p>x</p>', { onSave: () => Promise.resolve(), previewMode: false }, { width: 1000 });
    const said = [];
    ed.toast = (m, o) => { said.push({ m, o }); return null; };
    ed.presence = p;
    let saves = 0;
    ed.options.onSave = () => { saves++; return Promise.resolve(); };
    ed.save();
    eq(saves, 0, 'не сохранено без подтверждения');
    ok(/перезаписать/.test(said.at(-1).m) && said.at(-1).o.action === 'Сохранить');
    said.at(-1).o.onAction();
    await wait(10);
    eq(saves, 1, 'сохранено после «Сохранить»');
    ok(!p.otherSaved, 'после своего сохранения — снова обычно');
    p.destroy();
    ed.destroy();
  });
  test('печать: страница A4 со стилями сайта, аккордеон раскрыт, служебное скрыто; окно печати браузера', async () => {
    const { printDoc } = await import('../../resources/js/ui/exchange.js');
    const ed = make('<h2>Заголовок</h2><div class="ted-accordion"><details class="ted-accordion__item"><summary class="ted-accordion__q">В</summary><div class="ted-accordion__body"><p>ответ</p></div></details></div><p>x</p>', {}, { width: 1000 });
    const orig = window.HTMLIFrameElement.prototype;
    printDoc(ed);
    const frame = document.querySelector('iframe[title="Печать"]');
    ok(frame, 'кадр печати');
    const doc = frame.contentDocument;
    frame.contentWindow.print = () => {};
    ok(/@page \{ size: A4/.test(doc.querySelector('style').textContent), 'A4');
    ok(doc.querySelector('details').open, 'аккордеон раскрыт');
    ok(doc.querySelector('.ted-content h2'), 'статья в кадре');
    frame.remove();
    void orig;
    ed.destroy();
  });
});

group('Английский интерфейс (22.11)', () => {
  test('«Ещё» → English: панель, меню, «Добавить блок», «Помощь», заглушки — без русских подписей; Русский — обратно', async () => {
    const CYR = /[А-Яа-яЁё]/;
    const ed = make('<h2>Заголовок статьи</h2><p>текст</p>', {}, { width: 1000 });
    try {
      ed.setLang('en');
      const bad = [];
      const scan = (root, where) => {
        for (const el of root.querySelectorAll('[aria-label], [data-tip], [placeholder], .ted-ui-item__label, .ted-ui-form__title, .ted-ui-tile__name, .ted-ui-help__row span, .ted-ui-help__text, .ted-ui-picker__title, .ted-ui-menu__group')) {
          if (el.closest('[lang="ru"]')) continue;   // «Русский» — название языка на нём самом
          for (const v of [el.getAttribute('aria-label'), el.getAttribute('data-tip'), el.getAttribute('placeholder'), el.matches('[aria-label], [data-tip], [placeholder]') ? '' : el.textContent]) if (v && CYR.test(v)) bad.push(`${where}: ${v}`);
        }
      };
      scan(ed.ui.querySelector('.ted-ui-toolbar'), 'панель');
      ed.toolbar.openMoreMenu(); scan(ed.popover.el, '«Ещё»'); ed.popover.close();
      ed.toolbar.openHelp(); scan(ed.popover.el, '«Помощь»'); ed.popover.close();
      ed.blockMenu.openPicker(ed.editable.lastElementChild); scan(ed.blockMenu.picker.panel, '«Добавить блок»'); ed.blockMenu.closePicker();
      eq(bad.join('\n'), '', 'всё переведено');
      ok(ed.editable.querySelector('h2').textContent === 'Заголовок статьи', 'текст статьи не переводится');
      ed.setLang('ru');
      eq(ed.ui.querySelector('.ted-ui-toolbar [aria-label]').getAttribute('aria-label'), 'Стиль текста', 'обратно на русский');
    } finally {
      ed.setLang('ru');
      try { localStorage.removeItem('ted-lang'); } catch (e) { /* */ }
      ed.destroy();
    }
  });

  // сайт texted 25.11: на /en/ оставались русские строки с числами и именами, заглушки CSS и подписи content.js (1.0.2)
  test('lang: en — все блоки: подписи, подсказки, заглушки (и нарисованные CSS) без русского; у .ted-ui lang="en" сразу', async () => {
    const CYR = /[А-Яа-яЁё]/;
    const ed = make('<p>x</p>', { lang: 'en' }, { width: 1000 });
    try {
      eq(ed.ui.getAttribute('lang'), 'en', 'язык на корне редактора — с создания');
      for (const type of ['accordion', 'background', 'quote', 'button', 'callout', 'checklist', 'columns', 'embed', 'facts', 'hr', 'iframe', 'image', 'gallery', 'video', 'audio', 'file', 'code', 'proscons', 'steps', 'table', 'tabs', 'toc', 'ul', 'ol', 'h3']) {
        const p = document.createElement('p'); p.innerHTML = '<br>';
        ed.editable.appendChild(p); ed.afterChange({ immediate: true });
        ed.focus();
        const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        ed.insertBlock(type);
        ed.popover.close();
      }
      await wait(50);
      ed.updatePlaceholders();
      const bad = new Set();
      for (const el of ed.ui.querySelectorAll('*')) {
        if (el.closest('.ted-ui-pop, .ted-ui-picker')) continue;
        if (!el.children.length && CYR.test(el.textContent)) bad.add(el.textContent.trim().slice(0, 50));
        for (const a of ['aria-label', 'title', 'placeholder', 'data-tip', 'data-tedui-ph', 'data-tedui-phline']) { const v = el.getAttribute(a); if (v && CYR.test(v)) bad.add(`@${a}: ${v}`); }
        for (const ps of ['::before', '::after']) { const c = getComputedStyle(el, ps).content; if (c && c !== 'none' && CYR.test(c)) bad.add(`${ps} ${c}`); }
      }
      eq([...bad].join('\n'), '', 'всё на английском');
    } finally {
      ed.setLang('ru');
      try { localStorage.removeItem('ted-lang'); } catch (e) { /* */ }
      ed.destroy();
    }
  });

  test('tf: строки с подстановками переводятся целиком; дробные числа — 2,5 / 2.5', async () => {
    const { tf, num, setLang } = await import('../../resources/js/core/i18n.js');
    try {
      setLang('en');
      eq(tf('Загружено файлов: {n}', { n: 3 }), 'Files uploaded: 3');
      eq(tf('Галерея · {n} фото. У каждого фото своя подпись; ⠿ — переставить, карандаш — alt', { n: 4 }).startsWith('Gallery · 4 photos'), true);
      eq(num(2.5), '2.5');
      setLang('ru');
      eq(tf('Загружено файлов: {n}', { n: 3 }), 'Загружено файлов: 3');
      eq(num(2.5), '2,5');
    } finally {
      setLang('ru');
    }
  });

  test('content.js на странице lang="en": «Hide» у содержания, «Copy code» у кода', () => {
    if (!window.TedContent) return;
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.setAttribute('lang', 'en');
    box.innerHTML = Ted.clean('<nav class="ted-toc"><div class="ted-toc__panel"><p class="ted-toc__title">Contents</p><ol class="ted-toc__list"><li><a href="#a">A</a></li></ol></div></nav><pre data-lang="js"><code>let a;</code></pre>');
    document.body.appendChild(box);
    try {
      window.TedContent.mount(box);
      const toggle = box.querySelector('.ted-toc__toggle');
      if (toggle) ok(/^(Hide|Show)$/.test(toggle.textContent), toggle.textContent);
      eq(box.querySelector('.ted-code-copy')?.getAttribute('aria-label'), 'Copy code');
    } finally {
      box.remove();
    }
  });
});

group('Окно стало уже (сайт texted 25.11, 1.0.2)', () => {
  test('скрытые кнопки пункта и таблицы не раздвигают страницу: при смене ширины окна уходят к левому краю колонки', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Шаг</strong><br>a</li><li><strong>Шаг</strong><br>b</li></ol><p>x</p>', {}, { width: 1000 });
    try {
      const ctl = ed.ui.querySelector('.ted-ui-itemctl');
      ok(ctl, 'кнопки пункта есть');
      ctl.classList.remove('is-visible');
      ctl.style.left = '5000px';   // место, посчитанное на широком окне
      const controls = ed.ui.querySelector('.ted-ui-controls');
      controls.classList.remove('is-visible');
      controls.style.left = '5000px';   // панель блока — так же
      window.dispatchEvent(new Event('resize'));
      eq(ctl.style.left, '0px');
      eq(controls.style.left, '0px', 'панель блока');
    } finally {
      ed.destroy();
    }
  });
});

group('Доступность (22.11): клавиатура, роли, контраст', () => {
  const at = (ed, node, offset = 0) => {
    ed.focus();
    const r = document.createRange(); r.setStart(node, offset); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    ed.updateState();
  };
  const press = (ed, code, extra) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, ctrlKey: true, bubbles: true, cancelable: true, ...extra }));
  test('Ctrl+Shift+↑/↓ переносят блок с курсором, курсор остаётся в нём; Ctrl+. открывает меню блока (role=menu)', () => {
    const ed = make('<p>один</p><p>два</p><p>три</p>', {}, { width: 1000 });
    const order = () => [...ed.editable.children].map((e) => e.textContent).join(',');
    at(ed, ed.editable.children[1].firstChild, 1);
    press(ed, 'ArrowUp', { shiftKey: true });
    eq(order(), 'два,один,три');
    ok(ed.editable.children[0].contains(getSelection().anchorNode), 'курсор в перенесённом блоке');
    press(ed, 'ArrowDown', { shiftKey: true });
    press(ed, 'ArrowDown', { shiftKey: true });
    eq(order(), 'один,три,два');
    press(ed, 'Period');
    ok(ed.popover.isOpen && ed.popover.el.getAttribute('role') === 'menu', 'меню блока');
    ed.popover.close();
    ed.destroy();
  });
  test('Esc в тексте — фокус на редакторе целиком: следующий Tab ведёт к панели', () => {
    const ed = make('<p>текст</p>', {}, { width: 1000 });
    at(ed, ed.editable.firstChild.firstChild, 2);
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    eq(document.activeElement, ed.ui);
    eq(ed.ui.getAttribute('tabindex'), '-1');
    ed.destroy();
  });
  test('тёмная тема: число «Ключевых цифр» — color1/light (читается на тёмной плитке)', () => {
    const ed = make('<ul class="ted-facts"><li><strong>10</strong><br>лет</li><li><strong>5</strong><br>x</li></ul><p>x</p>', {}, { width: 1000, theme: 'dark' });
    eq(getComputedStyle(ed.editable.querySelector('.ted-facts strong')).color, 'rgb(99, 161, 247)');
    ed.destroy();
  });
});

group('Сайт texted 27.11 (1.0.4): корзина при открытом окне, шапка просмотра', () => {
  test('нажатие на корзину блока не закрывает окно блока заранее (страница не сдвигается под курсором); щелчок удаляет блок и закрывает окно', async () => {
    const ed = make('<p>первый</p><p>второй</p>', {}, { width: 1000 });
    try {
      const block = ed.editable.lastElementChild;
      placeCaretAt(ed, block);
      ed.handle.setFocused(block);
      ed.popover.openUnder([document.createTextNode('окно блока')], block, {});
      ok(ed.popover.isOpen, 'окно открыто');
      const trash = ed.handle.ctrlTrash;
      trash.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      trash.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      ok(ed.popover.isOpen, 'по нажатию на корзину окно не закрылось');
      trash.click();
      await wait(0);
      ok(!block.isConnected, 'блок удалён');
      ok(!ed.popover.isOpen, 'окно закрыто вместе с блоком');
    } finally {
      ed.destroy();
    }
  });

  test('шапка просмотра: сводка и «Редактировать» по краям колонки текста (1000 / 768 / 414)', async () => {
    for (const width of [1000, 768, 414]) {
      const ed = make('<p>текст</p>', { preview: 'inline' }, { width });
      try {
        ed.setMode('view');
        await wait(50);
        // смена режима сворачивает кнопки панели анимацией; в тестовом браузере без окна она не идёт — завершаем сразу
        for (const a of ed.ui.getAnimations({ subtree: true })) a.finish();
        await wait(0);
        const tb = ed.ui.querySelector('.ted-ui-toolbar');
        const stats = tb.querySelector('.ted-ui-stats').getBoundingClientRect();
        const col = ed.ui.querySelector('.ted-ui-view .ted-ui-column').getBoundingClientRect();
        const btn = [...tb.querySelectorAll('button')].filter((b) => b.offsetParent).pop().getBoundingClientRect();
        ok(Math.abs(stats.left - col.left) <= 1, `${width}: сводка у левого края колонки (${stats.left} / ${col.left}; панель ${tb.getBoundingClientRect().left}…${tb.getBoundingClientRect().width}, поля ${getComputedStyle(tb).paddingLeft}, ui ${ed.ui.getBoundingClientRect().width}, кнопок ${tb.querySelectorAll('button').length})`);
        ok(Math.abs(btn.right - col.right) <= 1, `${width}: кнопка у правого края колонки (${btn.right} / ${col.right})`);
      } finally {
        ed.destroy();
      }
    }
  });
});

function placeCaretAt(ed, el) {
  ed.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  ed.updateState();
}

group('Сайт texted 27.11 (1.0.4): панель без курсора, заголовки, «+», типограф, отмена замены', () => {
  test('«Стиль текста» без курсора в тексте: стиль получает новый блок в конце, первый блок не меняется', () => {
    const ed = make('<p>первый</p><p>второй</p>', {}, { width: 1000 });
    try {
      getSelection().removeAllRanges();
      ed.saved = null;
      ed.toolbar.openStyleMenu();
      ed.toolbar.pop.el.querySelector('[data-value="h3"]').click();
      eq(ed.editable.firstElementChild.tagName, 'P', 'первый блок не тронут');
      eq(ed.editable.lastElementChild.tagName, 'H3', 'в конце — новый заголовок');
      eq(ed.editable.children.length, 3);
    } finally {
      ed.destroy();
    }
  });

  test('в заголовке h2–h6 кнопки «Жирный» нет, Ctrl+B ничего не меняет', () => {
    const ed = make('<h3>Заголовок</h3><p>текст</p>', {}, { width: 1000 });
    try {
      ed.focus();
      const r = document.createRange(); r.setStart(ed.editable.firstElementChild.firstChild, 0); r.setEnd(ed.editable.firstElementChild.firstChild, 4);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      ed.updateState();
      ed.toolbar.update(ed.state);
      ok(ed.toolbar.marks.bold.hidden, 'кнопки нет');
      ed.exec('bold');
      ok(!ed.editable.querySelector('h3 b, h3 strong'), 'жирный не добавлен');
    } finally {
      ed.destroy();
    }
  });

  test('«+» под статьёй виден и под пустыми вкладками / аккордеоном, скрыт под пустым абзацем', () => {
    const ed = make('<p>текст</p>', {}, { width: 1000 });
    try {
      ed.editable.insertAdjacentHTML('beforeend', '<p><br></p>');
      ed.updatePlaceholders();
      ok(ed.addBlock.classList.contains('is-hidden'), 'под пустым абзацем скрыт');
      ed.editable.lastElementChild.remove();
      ed.editable.insertAdjacentHTML('beforeend', '<div class="ted-tabs"><div class="ted-tabs__panel"><p class="ted-tabs__title"></p><div class="ted-tabs__body"><p></p></div></div></div>');
      ed.afterChange({ immediate: true });
      ed.updatePlaceholders();
      ok(!ed.addBlock.classList.contains('is-hidden'), 'под пустыми вкладками виден');
    } finally {
      ed.destroy();
    }
  });

  test('✨ при курсоре без выделения проверяет всю статью, а не блок с курсором', async () => {
    const ed = make('<p>первый</p><p>Пример - текст</p>', {}, { width: 1000 });
    try {
      ed.focus();
      const r = document.createRange(); r.setStart(ed.editable.firstElementChild.firstChild, 2); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      ed.formatText();
      await wait(30);
      ok(ed.editable.children[1].textContent.includes('—'), 'тире во втором блоке исправлено');
      ed.popover.close();
    } finally {
      ed.destroy();
    }
  });

  test('setHTML(html, { undoable: true }) — замену отменяет Ctrl+Z (сброс демо на сайте)', () => {
    const ed = make('<p>моя правка</p>', {}, { width: 1000 });
    try {
      ed.history.commit();
      ed.setHTML('<p>исходный текст</p>', { undoable: true });
      eq(ed.editable.textContent, 'исходный текст');
      ed.history.undo();
      eq(ed.editable.textContent, 'моя правка', 'отмена вернула правку');
    } finally {
      ed.destroy();
    }
  });
});

group('Экран идёт за правкой (сайт texted 27.11, 1.0.4)', () => {
test('набор у края: несколько запросов прокрутки подряд — одна плавная анимация с общей целью, без рывков (заказчик 27.11)', () => {    const ed = make('<p>текст</p>', {}, { width: 1000 });    const pad = document.createElement('div'); pad.style.height = (window.innerHeight * 3) + 'px'; document.body.appendChild(pad);    try {      window.scrollTo(0, 0);      ed.scrollFollow(40);      const first = ed.follow;      ok(first, 'анимация запущена');      ed.scrollFollow(80);      ok(ed.follow === first, 'второй запрос не запускает новую анимацию');      eq(Math.round(ed.follow.target), 80, 'цель обновлена от текущего положения');      ed.stopFollow();      ok(!ed.follow, 'остановка');    } finally {      pad.remove();      window.scrollTo(0, 0);      ed.destroy();    }  });
  test('курсор в блоке за нижним краем окна — редактор прокручивает к нему; в видимом блоке — не трогает', () => {
    const ed = make('<p>верх</p>' + '<p>строка</p>'.repeat(3) + '<p>низ</p>', {}, { width: 1000 });
    const calls = [];
    try {
      ed.scrollFollow = (dy) => calls.push(dy);
      const spacer = ed.editable.children[1];
      spacer.style.height = (window.innerHeight * 2) + 'px';   // низ статьи — далеко за краем окна
      const last = ed.editable.lastElementChild;
      ed.focus();
      const r = document.createRange(); r.setStart(last.firstChild, 2); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      ed.revealCaret();
      ok(calls.length === 1 && calls[0] > 0, 'прокрутка вниз к курсору: ' + calls.join(','));
      calls.length = 0;
      last.scrollIntoView({ block: 'center' });
      ed.revealCaret();
      eq(calls.length, 0, 'курсор виден — экран не двигается');
    } finally {
      ed.destroy();
    }
  });

  test('новый блок у нижнего края (курсор в его первой строке виден) — экран показывает блок целиком (заказчик 27.11)', () => {
    const ed = make('<p>верх</p><p>строка</p><p>низ</p>', {}, { width: 1000 });
    const calls = [];
    try {
      ed.scrollFollow = (dy) => calls.push(dy);
      ed.focus();
      const low = ed.editable.lastElementChild;
      // строка «низ» — у нижнего края окна, курсор в ней виден
      ed.editable.children[1].style.height = Math.max(0, window.innerHeight - 160 - ed.editable.children[1].getBoundingClientRect().top) + 'px';
      const r = document.createRange(); r.setStart(low.firstChild, 3); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      ed.revealCaret();   // запомнили блоки
      calls.length = 0;
      const block = document.createElement('div');
      block.className = 'ted-callout';
      block.style.height = '240px';
      const p = document.createElement('p'); p.textContent = 'заголовок'; block.appendChild(p);
      low.after(block);
      const r2 = document.createRange(); r2.setStart(p.firstChild, 0); r2.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r2);
      const bottom = block.getBoundingClientRect().bottom;
      ed.revealCaret();
      ok(calls.length === 1 && Math.abs(calls[0] - (bottom - (window.innerHeight - 72))) < 2, 'прокрутка до низа нового блока: ' + calls.join(','));
      calls.length = 0;
      ed.revealCaret();
      eq(calls.length, 0, 'блок уже не новый — повторно не двигаем');
    } finally {
      ed.destroy();
    }
  });
});

group('Тост на телефоне (заказчик 27.11)', () => {
  test('касание тоста не ставит таймер на паузу навсегда; мышь — ставит и снимает', () => {
    const ed = make('<p>текст</p>', { toasts: true });
    try {
      const toast = ed.toast('Проверка');
      const timer = toast.lastElementChild;   // полоса таймера
      toast.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
      ok(timer.style.animationPlayState !== 'paused', 'касание — таймер идёт');
      toast.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      eq(timer.style.animationPlayState, 'paused', 'мышь над тостом — пауза');
      toast.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
      eq(timer.style.animationPlayState, 'running', 'мышь ушла — таймер снова идёт');
    } finally {
      ed.destroy();
    }
  });
});

group('Цвет текста и фон — меню «Цвет» точками (1.0.4, заказчик 27–28.11)', () => {
  const at = (ed, el, end = false) => { ed.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(!end); getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState(); };
  const color = (el) => getComputedStyle(el).color;

  test('меню: «Текст» и «Фон» по 6 точек с подсказками-названиями, «Удалить фон»; выбранная точка отмечена', async () => {
    const ed = make('<p>текст</p>', {}, { width: 1000 });
    at(ed, ed.editable.querySelector('p'));
    ed.toolbar.colorBtn.click();
    await wait(20);
    const pop = ed.popover.el;
    const sw = [...pop.querySelectorAll('.ted-ui-swatch')];
    eq(sw.length, 12, 'точек');
    eq(sw.slice(0, 6).map((b) => b.dataset.tip).join(','), 'Стандартный,Акцентный,Дополнительный,Ошибка,Предупреждение,Успех');
    ok(sw.every((b) => b.getAttribute('aria-label') && b.getAttribute('role') === 'radio'), 'названия для программ чтения');
    ok(sw[0].classList.contains('is-active'), 'текст сейчас стандартный');
    ok([...pop.querySelectorAll('.ted-ui-item')].some((i) => i.dataset.value === 'color:reset'), '«Сбросить цвет»');
    sw[1].click();
    ok(ed.editable.querySelector('p').classList.contains('ted-tc-color1'), 'выбор точки красит блок');
    ed.destroy();
  });

  test('блок: класс ted-tc-*, «Стандартный» снимает; заголовок того же цвета — на ступень сильнее; цвет сохраняется в HTML', () => {
    const ed = make('<h2>Заголовок</h2><p>Абзац <a href="/x">ссылка</a> и <code>код</code></p>', {}, { width: 1000 });
    const [h, p] = ed.editable.children;
    at(ed, h); ed.exec('tc:color1');
    at(ed, p); ed.exec('tc:color1');
    ok(color(h) !== color(p), `заголовок ${color(h)} сильнее абзаца ${color(p)}`);
    ok(color(p.querySelector('a')) !== color(p), 'ссылка своего цвета');
    ok(color(p.querySelector('code')) !== color(p), 'строчный код своего цвета');
    ok(/<h2 class="ted-tc-color1">/.test(ed.getHTML()) && /<p class="ted-tc-color1">/.test(ed.getHTML()), 'в HTML');
    eq(Ted.clean(ed.getHTML()).match(/ted-tc-color1/g).length, 2, 'серверная очистка браузера оставляет');
    at(ed, p); ed.exec('tc:gray');
    ok(!p.className, '«Стандартный» снимает цвет');
    ed.destroy();
  });

  test('часть текста — <mark class="ted-tc-*">; внутри цветного блока «Стандартный» — mark ted-tc-gray; сохраняется', () => {
    const ed = make('<p>один два три</p>', {}, { width: 1000 });
    const p = ed.editable.querySelector('p');
    ed.focus();
    const r = document.createRange(); r.setStart(p.firstChild, 5); r.setEnd(p.firstChild, 8);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    ed.exec('tc:error');
    eq(p.querySelector('mark.ted-tc-error').textContent, 'два');
    ok(/<mark class="ted-tc-error">два<\/mark>/.test(Ted.clean(ed.getHTML())), 'mark с цветом переживает очистку');
    ed.destroy();
  });

  test('отдельные части: вопрос аккордеона, название вкладки, заголовок и описание шага — каждый своим цветом', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Шаг</strong><br>описание</li></ol>', {}, { width: 1000 });
    const li = ed.editable.querySelector('ol li');
    at(ed, li.querySelector('strong')); ed.exec('tc:color2');
    const desc = [...li.childNodes].find((n) => n.nodeType === 3 && n.data.includes('описание'));
    ed.focus(); { const r = document.createRange(); r.setStart(desc, 3); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }
    ed.exec('tc:success');
    ok(li.querySelector('strong mark.ted-tc-color2'), 'заголовок шага');
    ok([...li.querySelectorAll(':scope > mark.ted-tc-success')].length === 1, 'описание шага отдельно');
    ok(!ed.editable.querySelector('ol').className.includes('ted-tc-'), 'блок целиком не покрашен');
    ed.destroy();
  });

  test('цифры: красятся число и текст под ним; подпись медиа не красится', () => {
    const ed = make('<ul class="ted-facts"><li><strong>120</strong><br>стран</li></ul>', {}, { width: 1000 });
    const ul = ed.editable.querySelector('ul');
    at(ed, ul.querySelector('li')); ed.exec('tc:error');
    const li = ul.querySelector('li');
    eq(color(li), color(li.querySelector('strong')), 'подпись под числом — тем же цветом');
    ed.destroy();
  });

  test('фон: ошибка, предупреждение, успех; у кода — только фон; разделитель и товар — выбранные без курсора; сохраняется', () => {
    const ed = make('<p>а</p><pre data-lang="js"><code>let a;</code></pre><hr><p>б</p>', {}, { width: 1000 });
    const [p, pre, hr] = ed.editable.children;
    at(ed, p); ed.exec('bg:alert');
    ok(p.classList.contains('ted-bg-alert'), 'предупреждение');
    at(ed, pre.querySelector('code')); ed.exec('bg:success'); ed.exec('tc:color1');
    ok(pre.classList.contains('ted-bg-success') && !pre.className.includes('ted-tc-'), 'у кода только фон');
    getSelection().removeAllRanges();
    ed.handle.setFocused(hr);
    ed.exec('bg:error');
    ok(hr.classList.contains('ted-bg-error'), 'разделитель — цвет линии');
    const html = ed.getHTML();
    ok(/<hr class="ted-bg-error">/.test(html) && /<pre[^>]*ted-bg-success/.test(html) && /ted-bg-alert/.test(html), 'всё в HTML');
    ed.destroy();
  });
});

group('Предпросмотр цвета наведением (заказчик 28.11)', () => {
  test('наведение на точку примеряет цвет на блок / карточку / кусок; уход возвращает; в HTML и историю ничего не попадает', async () => {
    const ed = make('<p>Первый абзац</p><ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>а</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>б</li></ul></li></ul>', {}, { width: 1000 });
    const [p, pc] = ed.editable.children;
    const html0 = ed.getHTML();
    const at = (node, s, e) => { ed.focus(); const r = document.createRange(); r.setStart(node, s); r.setEnd(node, e ?? s); getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState(); };
    at(p.firstChild, 2);
    ed.previewColor('tc:error');
    ok(p.classList.contains('ted-tc-error'), 'блок примеряет цвет');
    eq(ed.getHTML().includes('ted-tc-error'), true, 'видно и в getHTML на время примерки');
    ed.clearPreview();
    eq(p.className, '', 'уход — как было');
    eq(ed.getHTML(), html0, 'HTML как был');
    const cons = pc.children[1];
    at(cons.querySelector('ul li').firstChild, 0);
    ed.previewColor('bg:alert');
    ok(cons.classList.contains('ted-bg-alert') && !pc.children[0].className.includes('ted-bg'), 'только карточка, где курсор');
    ed.clearPreview();
    eq(cons.className, 'ted-cons');
    at(p.firstChild, 0, 6);
    ed.previewColor('tc:color2');
    if (window.CSS && CSS.highlights) ok(CSS.highlights.has('ted-pv-tc-color2'), 'кусок — подсветкой');
    ed.clearPreview();
    if (window.CSS && CSS.highlights) ok(![...CSS.highlights.keys()].some((k) => k.startsWith('ted-pv')), 'подсветка снята');
    ed.destroy();
  });
});

group('Цвет текста: найдено при проверке «как пользователь» (28.11)', () => {
  const at = (ed, node, s, e) => { ed.focus(); const r = document.createRange(); r.setStart(node, s); r.setEnd(node, e ?? s); getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState(); };
  test('«Превратить в» заголовок, цитату, список — цвет и фон сохраняются; в код — цвет снимается', () => {
    for (const [cmd, ok1] of [['block:h2', true], ['block:blockquote', true], ['block:ul', true], ['block:pre', false]]) {
      const ed = make('<p class="ted-tc-error ted-bg-color1">Текст</p>');
      at(ed, ed.editable.querySelector('p').firstChild, 1);
      ed.exec(cmd);
      eq(/ted-tc-error/.test(ed.editable.innerHTML), ok1, cmd);
      ed.destroy();
    }
  });
  test('слово в ячейке таблицы — цвет сохраняется при сохранении и загрузке', () => {
    const ed = make('<figure class="ted-table"><table><tbody><tr><td>один два</td></tr></tbody></table></figure>');
    at(ed, ed.editable.querySelector('td').firstChild, 0, 4);
    ed.exec('tc:error');
    ed.setHTML(ed.getHTML());
    ok(/<td><mark class="ted-tc-error">один<\/mark> два<\/td>/.test(ed.getHTML()), ed.getHTML());
    ed.destroy();
  });
  test('Enter в цветном абзаце: хвост — того же цвета; в конце — новая строка чистая', () => {
    const ed = make('<p class="ted-tc-color1">Раз два</p>');
    at(ed, ed.editable.querySelector('p').firstChild, 3);
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    ok(ed.editable.children[1].classList.contains('ted-tc-color1'), 'хвост цветной');
    const last = ed.editable.children[1];
    at(ed, last.lastChild, last.lastChild.length || 0);
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    eq(ed.editable.children[2].className, '', 'новая строка в конце — чистая');
    ed.destroy();
  });
});

group('Отмена: выделение не съезжает из-за служебных надписей (заказчик 28.11)', () => {
  test('над абзацем «Содержание» (кнопка «Скрыть»): курсив → Ctrl+Z — выделено то же слово', () => {
    const ed = make('<nav class="ted-toc"><div class="ted-toc__progress"><div class="ted-toc__bar"></div></div><div class="ted-toc__panel"><p class="ted-toc__title">Содержание</p><ul class="ted-toc__list"><li><a href="#a">Глава</a></li></ul></div></nav><p>Пишите статьи блоками — текст</p>', {}, { width: 1000 });
    const p = ed.editable.querySelector(':scope > p');
    ed.focus(); ed.updateState(); ed.afterChange({ immediate: true });
    ok(ed.editable.querySelector('.ted-toc__toggle'), 'кнопка «Скрыть» есть в поле правки');
    const t = p.firstChild; const i = t.data.indexOf('блоками');
    ed.focus();
    const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 7);
    getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState();
    ed.exec('italic');
    ed.history.undo();
    eq(getSelection().toString(), 'блоками');
    ed.exec('tc:error');
    ed.history.undo();
    eq(getSelection().toString(), 'блоками', 'и после цвета');
    ed.destroy();
  });
});

group('Фон по умолчанию в меню «Цвет» (заказчик 28.11)', () => {
  test('плюсы — «Успех», минусы — «Ошибка», цифры — «Стандартный», абзац — ничего', () => {
    const ed = make('<p>абзац</p><ul class="ted-facts"><li><strong>1</strong><br>а</li></ul><ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>а</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>б</li></ul></li></ul>');
    const at = (el) => { const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(); ed.focus(); const r = document.createRange(); r.setStart(t, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState(); return ed.state.bg; };
    const E = ed.editable;
    eq(at(E.querySelector('p')), '', 'абзац');
    eq(at(E.querySelector('.ted-facts li')), 'gray', 'цифры');
    eq(at(E.querySelector('.ted-pros ul li')), 'success', 'плюсы');
    eq(at(E.querySelector('.ted-cons ul li')), 'error', 'минусы');
    ed.destroy();
  });
});

group('«Сбросить цвет» и фон по умолчанию в тёмной теме (заказчик 28.11)', () => {
  test('сброс: блок и покрашенные слова внутри — к виду по умолчанию; карточка — с её блоком; Ctrl+Z возвращает', () => {
    const ed = make('<p class="ted-tc-error ted-bg-alert">Раз <mark class="ted-tc-color1">два</mark></p><ul class="ted-proscons ted-tc-color2"><li class="ted-pros ted-bg-color1"><strong>П</strong><ul><li>а</li></ul></li><li class="ted-cons"><strong>М</strong><ul><li>б</li></ul></li></ul>');
    const [p, pc] = ed.editable.children;
    const at = (n) => { ed.focus(); const r = document.createRange(); r.setStart(n, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState(); };
    at(p.firstChild);
    ed.exec('color:reset');
    ok(!p.className && !p.querySelector('mark'), p.outerHTML);
    at(pc.querySelector('.ted-pros ul li').firstChild);
    ed.exec('color:reset');
    ok(!pc.querySelector('.ted-pros').className.includes('ted-bg') && !pc.className.includes('ted-tc'), pc.outerHTML);
    ed.history.undo();
    ok(ed.editable.querySelector('.ted-pros').classList.contains('ted-bg-color1'), 'Ctrl+Z вернул');
    ed.destroy();
  });
  test('тёмная тема: карточки плюсов и минусов и баннер — «Стандартный», выноска — ничего; светлая: баннер — «Акцентный»', () => {
    const html = '<ul class="ted-proscons"><li class="ted-pros"><strong>П</strong><ul><li>а</li></ul></li><li class="ted-cons"><strong>М</strong><ul><li>б</li></ul></li></ul><blockquote class="ted-callout"><p>З</p><p>т</p></blockquote>';
    const bgAt = (ed, el) => { const t = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(); ed.focus(); const r = document.createRange(); r.setStart(t, 0); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState(); return ed.state.bg; };
    const dark = make(html, {}, { theme: 'dark' });
    eq(bgAt(dark, dark.editable.querySelector('.ted-cons ul li')), 'gray', 'минусы в тёмной');
    eq(bgAt(dark, dark.editable.querySelector('.ted-callout p')), '', 'выноска в тёмной');
    dark.destroy();
    const light = make(html);
    eq(bgAt(light, light.editable.querySelector('.ted-cons ul li')), 'error', 'минусы в светлой');
    light.destroy();
  });
});

group('Меню «Цвет» с клавиатуры (заказчик 28.11)', () => {
  const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  test('стрелки: → со «Стандартного» на «Акцентный» с примеркой, ↓ в «Фон», ↑ обратно, Enter — выбрать', async () => {
    const ed = make('<p>текст</p>', {}, { width: 1000 });
    const p = ed.editable.querySelector('p');
    ed.focus(); const r = document.createRange(); r.setStart(p.firstChild, 2); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState();
    ed.toolbar.colorBtn.click();
    await wait(20);
    const focused = () => [...ed.popover.el.querySelectorAll('.is-focus')].map((x) => x.dataset.value).join();
    key('ArrowRight');
    eq(focused(), 'tc:color1', 'первое нажатие — сразу на соседнюю');
    ok(p.classList.contains('ted-tc-color1'), 'примерка');
    key('ArrowRight'); key('ArrowLeft');
    eq(focused(), 'tc:color1');
    key('ArrowDown');
    eq(focused(), 'bg:color1', 'в ряд фона на ту же позицию');
    ok(p.classList.contains('ted-bg-color1') && !p.classList.contains('ted-tc-color1'), 'примерка фона вместо текста');
    key('ArrowUp');
    key('Enter');
    ok(!ed.popover.isOpen, 'меню закрыто');
    eq(p.className, 'ted-tc-color1', 'выбран цвет текста');
    ed.destroy();
  });
  test('меню открыли с панели (курсора в тексте нет) — красится блок, где курсор был последним', async () => {
    const ed = make('<p>один</p><p>два</p>', {}, { width: 1000 });
    const p2 = ed.editable.children[1];
    ed.focus(); const r = document.createRange(); r.setStart(p2.firstChild, 1); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState();
    ed.toolbar.colorBtn.focus();
    getSelection().removeAllRanges();
    ed.toolbar.colorBtn.click();
    await wait(20);
    ok(ed.popover.el.querySelector('[data-value="tc:error"]'), 'ряд «Текст» есть');
    ed.popover.el.querySelector('[data-value="tc:error"]').click();
    eq(p2.className, 'ted-tc-error');
    ed.destroy();
  });
});

group('Окна ставят фокус в поле при открытии (28.11: строка была испорчена)', () => {
  test('«Якорь»: поле названия в фокусе', async () => {
    const ed = make('<p>текст</p>', {}, { width: 1000 });
    const p = ed.editable.querySelector('p');
    ed.focus(); const r = document.createRange(); r.setStart(p.firstChild, 1); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r); ed.updateState();
    ed.exec('anchor');
    await wait(30);
    ok(document.activeElement && document.activeElement.classList.contains('ted-ui-input'), document.activeElement && document.activeElement.className);
    ed.popover.close();
    ed.destroy();
  });
});
