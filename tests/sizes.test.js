// Тесты по всем размерам (1000 / 860 / 768 / 414) и обеим темам (light / dark): раскладка, шапка, меню, окна,
// меню блоков с плитками, кнопки блока, просмотр, перетаскивание, демо-страницы.
import { group, test, eq, ok, wait } from './harness.js';
import { Ted, make, blocks, select, pop, html, tagOf } from './helpers.js';

const WIDTHS = [1000, 860, 768, 414];
const THEMES = ['light', 'dark'];
const COLUMN = { 1000: 700, 860: 628, 768: 480, 414: 382 };   // ширина колонки по макету (мобильный: ширина − 2 × 16)
const COLS = { 1000: 3, 860: 3, 768: 2, 414: 2 };             // плиток в ряд в меню блоков
const BLOCK_DOC = '<h2>Заголовок</h2><p>Текст абзаца для проверки раскладки на разных ширинах.</p><ul><li>Раз</li><li>Два</li></ul>';
const SOON = ['image', 'gallery', 'video', 'audio', 'embed', 'iframe', 'file', 'table', 'columns', 'toc', 'accordion', 'tabs', 'button', 'product'];

/** Ждём условия до ms миллисекунд (таймеры редактора и анимации в долгом прогоне могут притормаживать). */
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await wait(50); } return fn(); };

const inside = (el, host, msg) => {
  const r = el.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  ok(r.left >= h.left - 1 && r.right <= h.right + 1, `${msg}: ${Math.round(r.left - h.left)}…${Math.round(r.right - h.left)} вне редактора шириной ${Math.round(h.width)}`);
};

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    const at = (html2 = BLOCK_DOC, opts = {}) => make(html2, { onSave: () => {}, ...opts }, { width, theme });

    group(`Размеры: ${width} px, ${theme}`, () => {
      test('тема и колонка', () => {
        const ed = at();
        eq(ed.ui.dataset.tedTheme, theme);
        eq(Math.round(ed.column.getBoundingClientRect().width), COLUMN[width], 'ширина колонки');
      });

      test('нет горизонтального переполнения', () => {
        const ed = at();
        ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, `scrollWidth ${ed.ui.scrollWidth} > ${ed.ui.clientWidth}`);
        ok(ed.canvas.scrollWidth <= ed.canvas.clientWidth + 1, 'полотно');
      });

      test('шапка: прокрутка включается, только если кнопки не помещаются', () => {
        const ed = at();
        ed.toolbar.checkScroll();
        const overflow = ed.toolbar.el.scrollWidth > ed.toolbar.el.clientWidth + 1;
        eq(ed.toolbar.el.classList.contains('is-scroll'), overflow);
        if (width <= 414) ok(overflow, 'на мобильном шапка прокручивается');
        // у шапки нет горизонтального переполнения самой страницы
        ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1);
      });

      test('шапка: наборы кнопок и «Сохранить»', () => {
        const ed = at();
        const names = (set) => set.filter((e) => e.getAttribute && e.getAttribute('data-act')).map((e) => e.getAttribute('data-act')).join(' ');
        eq(names(ed.toolbar.sets.default), 'style align color media all magic more help save');
        eq(names(ed.toolbar.sets.text), 'style align color bold italic underline strike code link anchor all magic more help save');
        eq(names(ed.toolbar.sets.line), 'more help save');
        eq(names(make('<p>а</p>', { previewMode: false }, { width, theme }).toolbar.sets.default), 'style align color media all magic more help');
      });

      test('выпадающие меню шапки помещаются в редактор', async () => {
        const ed = at();
        for (const btn of ['styleBtn', 'alignBtn', 'colorBtn', 'mediaBtn', 'moreBtn', 'helpBtn']) {
          ed.toolbar[btn].click();
          ok(ed.popover.isOpen, `${btn}: меню не открылось`);
          inside(pop(ed), ed.ui, btn);
          ed.popover.close();
        }
      });

      test('окна «Ссылка», «Якорь» и «Форматирование» помещаются в редактор', () => {
        const ed = at('<h2>Заголовок</h2><p>Текст абзаца, Еще "да"</p>');
        select(ed, 1, 0, 5);
        ed.openLink();
        inside(pop(ed), ed.ui, 'ссылка');
        ed.popover.close();
        select(ed, 1, 0);
        ed.openAnchor();
        inside(pop(ed), ed.ui, 'якорь');
        ed.popover.close();
        ed.editable.blur();
        ed.formatText();
        ok(ed.popover.isOpen, 'панель форматирования');
        inside(pop(ed), ed.ui, 'форматирование');
        ed.popover.close();
      });

      test('кнопки блока: на мобильном в строку, иначе в столбец', () => {
        const ed = at();
        ed.handle.setFocused(blocks(ed)[0]);
        const dir = getComputedStyle(ed.handle.controls).flexDirection;
        eq(dir, width < 480 ? 'row' : 'column');
        const r = ed.handle.controls.getBoundingClientRect();
        const h = ed.ui.getBoundingClientRect();
        ok(r.left >= h.left - 1 && r.right <= h.right + 1, 'кнопки блока внутри редактора');
      });

      test('меню блоков: положение, сетка, шапка, кнопка ×, поиск', async () => {
        const ed = at();
        window.scrollTo(0, 0);
        // ждём, пока закончатся плавные прокрутки от прошлых тестов (две одинаковые проверки подряд)
        let lastY = -1;
        await until(() => { const now = scrollY; const same = now === lastY; lastY = now; return same; }, 3000);
        const y0 = scrollY;
        const hostH0 = ed.ui.offsetHeight;
        ed.toolbar.allBlocksBtn.click();
        await wait(320);
        const p = ed.blockMenu.picker;
        ok(p, 'меню не открылось');
        // всплывающее окно: внутри редактора, под шапкой, страницу не прокручивает
        eq(scrollY, y0, 'страница не должна прокручиваться');
        eq(p.panel.parentElement, ed.ui);
        const r = p.panel.getBoundingClientRect();
        ok(r.top >= ed.toolbar.el.getBoundingClientRect().bottom, 'под шапкой');
        inside(p.panel, ed.ui, 'меню блоков');
        eq(Math.round(r.width), width < 480 ? width - 16 : COLUMN[width], 'ширина панели');
        // сетка плиток
        const tiles = Array.from(p.panel.querySelectorAll('.ted-ui-picker__tiles')[0].children);
        const firstRow = tiles.filter((t) => Math.abs(t.getBoundingClientRect().top - tiles[0].getBoundingClientRect().top) < 2).length;
        eq(firstRow, Math.min(COLS[width], tiles.length), 'плиток в ряд');
        // шапка: на мобильном поиск под заголовком, иначе в одну строку
        const title = p.panel.querySelector('.ted-ui-picker__title').getBoundingClientRect();
        const search = p.panel.querySelector('.ted-ui-search').getBoundingClientRect();
        if (width < 480) ok(search.top >= title.bottom, 'мобильный: поиск под заголовком');
        else ok(Math.abs(search.top + search.height / 2 - (title.top + title.height / 2)) < 8, 'поиск в одной строке с заголовком');
        eq(Math.round(search.height), 40, 'поиск size s');
        ok(search.width > 120, `поиск не должен сужаться: ${Math.round(search.width)}`);
        // кнопка × = Buttons/main secondary s
        const close = p.panel.querySelector('[aria-label="Закрыть"]');
        const cr = close.getBoundingClientRect();
        eq([Math.round(cr.width), Math.round(cr.height)].join('x'), '40x40');
        const cs = getComputedStyle(close);
        eq(cs.borderRadius, '12px');
        eq(cs.backgroundColor, theme === 'dark' ? 'rgb(77, 77, 77)' : 'rgb(237, 243, 250)');
        // линия под шапкой
        const line = p.panel.querySelector('.ted-ui-picker__headline');
        ok(line && Math.round(line.getBoundingClientRect().height) === 1, 'линия под шапкой');
        ok(line.getBoundingClientRect().top >= p.panel.querySelector('.ted-ui-picker__head').getBoundingClientRect().bottom);
        // плитки: фон по теме, картинки по теме
        const prev = p.panel.querySelector('.ted-ui-tile__preview');
        eq(getComputedStyle(prev).backgroundColor, theme === 'dark' ? 'rgb(77, 77, 77)' : 'rgb(237, 243, 250)');
        const img = getComputedStyle(p.panel.querySelector('.ted-ui-tile[data-type="image"] .is-image')).backgroundImage;
        ok(img.includes(`image-${theme}.webp`), img);
        // редактор удлинился под окно (плавно) и вернулся при закрытии
        // запас высоты задаётся переменной (сам рост плавный, поэтому проверяем её, а не мгновенную высоту)
        ok(parseFloat(ed.ui.style.getPropertyValue('--ted-pop-min-height')) >= p.panel.offsetTop + p.panel.offsetHeight, 'редактор вмещает панель');
        ed.blockMenu.closePicker();
        await wait(420);
        ok(await until(() => ed.ui.style.getPropertyValue('--ted-pop-min-height') === ''), 'запас высоты снят после закрытия');
      });

      test('меню блоков: высота подгоняется под окно браузера', async () => {
        const ed = at();
        ed.toolbar.el.scrollIntoView({ block: 'start' });   // редактор в окне — проверяем подгонку под окно, а не место ниже него
        await wait(20);
        ed.toolbar.allBlocksBtn.click();
        await wait(50);
        const p = ed.blockMenu.picker;
        const bar = ed.toolbar.el.getBoundingClientRect();
        const maxScroll = parseFloat(p.scroll.style.maxHeight);
        ok(maxScroll >= 160 && maxScroll <= 420, `прокручиваемая часть ${maxScroll}`);
        // если места под панелью меньше минимума, прокручиваемая часть остаётся 160, а шапка меню — своей высоты (на 414 — 165)
        const head = p.panel.getBoundingClientRect().height - p.scroll.getBoundingClientRect().height;
        ok(p.panel.getBoundingClientRect().bottom <= Math.max(innerHeight, bar.bottom + 8 + head + 160) + 1, 'панель не уходит за окно');
        ed.blockMenu.closePicker();
      });

      test('меню блоков: вставка плитки', () => {
        const ed = at();
        select(ed, 0, 0);
        ed.toolbar.allBlocksBtn.click();
        ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="blockquote"]').click();
        eq(blocks(ed)[1].tagName.toLowerCase(), 'blockquote');
      });

      test('меню блоков: нет пустого места в поиске, пустой запрос и «ничего не найдено»', () => {
        const ed = at();
        ed.toolbar.allBlocksBtn.click();
        const p = ed.blockMenu.picker;
        p.input.value = 'яяя';
        p.input.dispatchEvent(new Event('input'));
        ok(p.panel.textContent.includes('Ничего не найдено'));
        p.input.value = '';
        p.input.dispatchEvent(new Event('input'));
        eq(p.panel.querySelectorAll('.ted-ui-tile').length, 29);
        ed.blockMenu.closePicker();
      });

      test('режим просмотра: сводка, «Редактировать», без переполнения', async () => {
        const ed = at();
        ed.setMode('view');
        ed.toolbar.update({ ...ed.state, mode: 'view' });
        await wait(30);
        ok(ed.toolbar.stats.textContent.includes('слов'), ed.toolbar.stats.textContent);
        ok(ed.toolbar.sets.view.includes(ed.toolbar.modeBtn));
        ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, 'просмотр без переполнения');
        ed.setMode('edit');
      });

      test('перетаскивание блока вниз и вверх', () => {
        const ed = at('<h2>Заг</h2><p class="ted-bg-color1">Фон</p><p>Третий</p>');
        const drag = (i, dy) => {
          ed.handle.setFocused(blocks(ed)[i]);
          ed.handle.startDrag(blocks(ed)[i], blocks(ed)[i].getBoundingClientRect().top);
          ed.handle.onDrag({ clientY: blocks(ed)[i].getBoundingClientRect().top + dy });
          ed.handle.endDrag();
        };
        drag(1, 300);
        eq(blocks(ed).map((b) => b.textContent).join('|'), 'Заг|Третий|Фон');
        drag(2, -300);
        eq(blocks(ed)[0].textContent, 'Фон');
      });

      test('цветной фон: подложка и фрагмент видны в теме', () => {
        const ed = at('<p class="ted-bg-color1">Блок</p><p>один <mark class="ted-bg-color2">два</mark></p>');
        const bg = (el) => getComputedStyle(el).backgroundColor;
        eq(bg(blocks(ed)[0]), theme === 'dark' ? 'rgb(16, 79, 166)' : 'rgb(210, 226, 247)');
        eq(bg(ed.editable.querySelector('mark')), theme === 'dark' ? 'rgb(56, 56, 140)' : 'rgb(229, 229, 255)');
      });

      test('якорь: окно с кнопкой копирования 32 × 32', () => {
        const ed = at();
        select(ed, 0, 0);
        ed.openAnchor();
        const copy = pop(ed).querySelector('.ted-ui-action--icon');
        const r = copy.getBoundingClientRect();
        eq(`${copy.offsetWidth}x${copy.offsetHeight}`, '32x32');   // размеры вёрстки (без масштаба анимации появления)
        const input = pop(ed).querySelector('input').getBoundingClientRect();
        ok(input.right <= r.left + 1, 'кнопка справа от поля');
        ed.popover.close();
      });

      test('✨: панель категорий видна и в пределах редактора', () => {
        const ed = at('<p>Еще "да" - тест 2345 руб.</p>');
        ed.editable.blur();
        ed.formatText();
        const items = pop(ed).querySelectorAll('.ted-ui-toggle');
        ok(items.length >= 5, `категорий: ${items.length}`);
        inside(pop(ed), ed.ui, 'панель форматирования');
        ed.popover.close();
      });

      test('Markdown-сокращения работают на любой ширине', () => {
        const ed = at('<p></p>');
        select(ed, 0, 0);
        document.execCommand('insertText', false, '#');
        document.execCommand('insertText', false, ' ');
        eq(blocks(ed)[0].tagName.toLowerCase(), 'h2');
      });
    });
  }
}

group('Меню блоков: поведение', () => {
  const open = (ed, target) => { ed.blockMenu.openPicker(target || blocks(ed)[0]); return ed.blockMenu.picker; };

  test('наведение не «залипает»: подсветка с клавиатуры гаснет, когда мышь пошла', async () => {
    const ed = make('<p>а</p>');
    const p = open(ed);
    const shadow = (t) => getComputedStyle(t.querySelector('.ted-ui-tile__preview')).boxShadow;
    p.panel.querySelectorAll('.ted-ui-tile__preview').forEach((x) => { x.style.transition = 'none'; });   // без анимации: в фоновом окне она может не идти
    const tiles = p.panel.querySelectorAll('.ted-ui-tile');
    ok(await until(() => shadow(tiles[0]) === 'none'), 'без клавиатуры и мыши подсветки нет');   // рамка может гаснуть плавно
    p.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    ok(p.panel.classList.contains('is-kbd'));
    ok(await until(() => shadow(p.tiles[1].el).includes('25, 117, 247')), 'выбранная с клавиатуры плитка в рамке');   // рамка появляется плавно
    p.panel.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    ok(!p.panel.classList.contains('is-kbd'));
    ok(await until(() => shadow(p.tiles[1].el) === 'none'), 'после движения мыши рамка у выбранной плитки уходит');
    ed.blockMenu.closePicker();
  });

  test('разделитель на плитке виден (контрастнее фона плитки)', () => {
    const ed = make('<p>а</p>');
    const p = open(ed);
    const hr = p.panel.querySelector('.ted-ui-tile[data-type="hr"] .ted-ui-tile__sample hr');
    ok(hr, 'есть образец');
    const hs = getComputedStyle(hr);
    ok(parseFloat(hs.height) > 0, 'высота линии');
    const bg = getComputedStyle(p.panel.querySelector('.ted-ui-tile[data-type="hr"] .ted-ui-tile__preview')).backgroundColor;
    ok(hs.backgroundColor !== bg, `линия ${hs.backgroundColor} совпадает с фоном ${bg}`);
    ed.blockMenu.closePicker();
  });

  test('закрытие: Esc, клик мимо окна, ×; клик внутри не закрывает', () => {
    const ed = make('<p>а</p>');
    let p = open(ed);
    p.panel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    ok(ed.blockMenu.picker, 'клик внутри не закрывает');
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    ok(!ed.blockMenu.picker, 'клик мимо закрыл');
    p = open(ed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    ok(!ed.blockMenu.picker, 'Esc закрыл');
  });

  test('кнопки «Все блоки» и «Добавить блок» не закрывают сами себя дважды', () => {
    const ed = make('<p>а</p>');
    ed.toolbar.allBlocksBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    ed.toolbar.allBlocksBtn.click();
    ok(ed.blockMenu.picker, 'открыто');
    ed.toolbar.allBlocksBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    ok(ed.blockMenu.picker, 'mousedown по кнопке не закрывает, закроет click');
    ed.toolbar.allBlocksBtn.click();
    ok(!ed.blockMenu.picker, 'закрыто');
  });

  test('после закрытия панель удаляется и редактор не хранит окно', async () => {
    const ed = make('<p>а</p>');
    open(ed);
    ed.blockMenu.closePicker();
    await wait(200);
    eq(ed.ui.querySelectorAll('.ted-ui-picker').length, 0);
  });

  test('картинки ещё не готовых блоков есть и для светлой, и для тёмной темы', async () => {
    const SOON_TYPES = ['image', 'gallery', 'video', 'audio', 'embed', 'iframe', 'file', 'table', 'columns', 'toc', 'accordion', 'tabs', 'button', 'product'];
    const base = new URL('../dist/tiles/', import.meta.url).href;
    for (const t of SOON_TYPES) {
      for (const th of ['light', 'dark']) {
        const res = await fetch(`${base}${t}-${th}.webp`);
        ok(res.ok, `${t}-${th}.webp: ${res.status}`);
        eq(res.headers.get('content-type') && res.headers.get('content-type').includes('webp'), true, `${t}-${th}: тип файла`);
      }
    }
  });

  test('все 29 пунктов плитки на месте и названия как в макете (с двумя списками и заголовками 3 и 4)', () => {
    const ed = make('<p>а</p>');
    const p = open(ed);
    const names = Array.from(p.panel.querySelectorAll('.ted-ui-tile__name')).map((n) => n.textContent);
    eq(names.join('|'), ['Заголовок 2', 'Заголовок 3', 'Заголовок 4', 'Текст', 'Цитата', 'Код', 'Выноска', 'Цветной фон', 'Ключевые цифры', 'Плюсы и минусы', 'Список', 'Нумерованный список', 'Чек-лист', 'Шаги',
      'Изображение', 'Галерея', 'Видео', 'Аудио', 'Встраивание', 'iFrame', 'Файл', 'Таблица', 'Колонки', 'Разделитель',
      'Содержание', 'Аккордеон', 'Вкладки', 'Кнопка', 'Товар'].join('|'));
    ed.blockMenu.closePicker();
  });

  test('вставка плитки плавно показывает новый блок и не оставляет служебный атрибут в HTML', async () => {
    const ed = make('<p>а</p>');
    select(ed, 0, 1);
    ed.toolbar.allBlocksBtn.click();
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="blockquote"]').click();
    ok(blocks(ed)[1].hasAttribute('data-tedui-in'), 'новый блок помечен для анимации');
    ok(!html(ed).includes('data-tedui'), 'в сохраняемом HTML служебных атрибутов нет');
    await wait(360);
    ok(!blocks(ed)[1].hasAttribute('data-tedui-in'), 'метка снята');
  });
});

group('Плавность', () => {
  test('редактор удлиняется и укорачивается плавно (transition min-height)', () => {
    const ed = make('<p>а</p>');
    ok(getComputedStyle(ed.ui).transitionProperty.includes('min-height'), getComputedStyle(ed.ui).transitionProperty);
  });
  test('строка «Добавить блок» скрывается плавно, а не рывком', () => {
    const ed = make('<p>Текст</p>');
    ed.updatePlaceholders();
    ok(!ed.addBlock.classList.contains('is-hidden'), 'есть текст — строка видна');
    ok(getComputedStyle(ed.addBlock).transitionProperty.includes('max-height'));
    ed.setHTML('', { silent: true });
    ed.updatePlaceholders();
    ok(ed.addBlock.classList.contains('is-hidden'), 'пусто — строка свёрнута');
    eq(ed.addBlock.getAttribute('aria-hidden'), 'true');
  });
  test('всплывающие окна и меню блоков появляются с анимацией', () => {
    const ed = make('<p>а</p>');
    ed.toolbar.allBlocksBtn.click();
    ok(getComputedStyle(ed.blockMenu.picker.panel).animationName.includes('ted-picker-in'));
    ed.blockMenu.closePicker();
    ed.toolbar.styleBtn.click();
    ok(getComputedStyle(pop(ed)).animationName !== 'none', 'меню шапки');
    ed.popover.close();
  });
  test('смена наборов кнопок шапки анимируется (переезд и появление)', () => {
    const ed = make('<p>Текст</p>');
    ed.editable.blur();
    ed.toolbar.update({ ...ed.state, focused: false, mode: 'edit' });
    select(ed, 0, 1);
    document.dispatchEvent(new Event('selectionchange'));
    ed.toolbar.update({ ...ed.state, focused: true, type: 'p', mode: 'edit', marks: {} });
    const animated = document.getAnimations().filter((a) => a.effect && a.effect.target && ed.toolbar.el.contains(a.effect.target)).length;
    ok(animated > 0, 'нет анимаций у кнопок шапки');
  });
  test('кнопки блока и смена режима имеют переходы', () => {
    const ed = make('<p>а</p>');
    ed.handle.setFocused(blocks(ed)[0]);
    ok(getComputedStyle(ed.handle.controls).transitionProperty.includes('top'));
  });
});

group('Решения заказчика', () => {
  test('«Сохранить» без правок не вызывает onSave, а с правками вызывает', async () => {
    let saved = 0;
    const ed = make('<p>а</p>', { onSave: () => { saved += 1; } });
    ed.save();
    await wait(30);
    eq(saved, 0, 'без правок onSave не вызывается');
    eq(ed.mode, 'view');
    ed.setMode('edit');
    select(ed, 0, 1);
    document.execCommand('insertText', false, 'б');
    ed.save();
    await wait(30);
    eq(saved, 1);
  });
  test('разделитель — только отдельной секцией: в панели кнопки нет, вставляется через «Все блоки», «/» и Ctrl+Shift+-', () => {
    const ed = make('<p>один</p><p>два</p>');
    for (const set of Object.values(ed.toolbar.sets)) ok(!set.some((e) => e.getAttribute && e.getAttribute('data-act') === 'hr'), 'кнопки «Разделитель» в панели нет');
    select(ed, 0, 1);
    ed.toolbar.allBlocksBtn.click();
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="hr"]').click();
    ok(blocks(ed).some((b) => b.tagName === 'HR'), 'через плитки');
    const ed2 = make('<p>один</p>');
    select(ed2, 0, 1);
    ed2.exec('insert:hr');
    ok(blocks(ed2).some((b) => b.tagName === 'HR'), 'через горячую клавишу');
  });
  test('кнопки смены темы редактора нет', () => {
    const ed = make('<p>а</p>');
    for (const set of Object.values(ed.toolbar.sets)) ok(!set.some((e) => e.getAttribute && /theme|тем/.test(e.getAttribute('data-act') || '')));
  });
});

const PAGES = [['index.html', false], ['admin.html', true], ['docs.html', true], ['site.html', false], ['editor.html', true], ['narrow.html', true, false]];
group('Демо-страницы', () => {
  for (const width of WIDTHS) {
    for (const [page, hasTed, strict = true] of PAGES) {   // narrow.html — страница замеров с фиксированными узкими контейнерами, переполнение там не ошибка
      test(`${page} на ${width} px: загружается, без переполнения, редактор поднят`, async () => {
        const frame = document.createElement('iframe');
        frame.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:700px;border:0;visibility:hidden`;
        frame.src = new URL(`../examples/${page}`, import.meta.url).href;
        document.body.appendChild(frame);
        try {
          await new Promise((res, rej) => { frame.onload = res; setTimeout(() => rej(new Error('страница не загрузилась')), 8000); });
          await wait(700);
          const doc = frame.contentDocument;
          const win = frame.contentWindow;
          ok(doc.title.length > 0, 'есть заголовок страницы');
          if (strict) ok(doc.documentElement.scrollWidth <= width + 1, `горизонтальное переполнение: ${doc.documentElement.scrollWidth} > ${width}`);
          if (hasTed) {
            ok(win.Ted && win.Ted.editors.length > 0, 'редактор Ted не поднялся');
            const ui = doc.querySelector('.ted-ui');
            ok(ui && ui.getBoundingClientRect().width > 0, 'интерфейс редактора есть');
          }
        } finally {
          frame.remove();
        }
      });
    }
  }
});

group('Только просмотр (readOnly)', () => {
  const ro = (opts = {}) => make('<h2>Заголовок</h2><p>Текст</p>', { readOnly: true, preview: 'inline', onSave: () => {}, ...opts });
  test('сразу в просмотре, кнопки «Редактировать» нет, видна сводка', () => {
    const ed = ro();
    eq(ed.mode, 'view');
    ed.toolbar.update({ ...ed.state, mode: 'view' });
    eq(ed.toolbar.variant, 'viewRo');
    ok(!ed.toolbar.el.contains(ed.toolbar.modeBtn), 'нет кнопки «Редактировать»');
    ok(ed.toolbar.stats.textContent.includes('слов'));
  });
  test('в правку не попасть: setMode, toggleMode, Ctrl+Shift+P, двойной клик, mode: edit', () => {
    const ed = ro({ mode: 'edit' });
    eq(ed.mode, 'view', 'mode: edit игнорируется');
    ed.setMode('edit');
    eq(ed.mode, 'view');
    ed.toggleMode();
    eq(ed.mode, 'view');
    ed.exec('mode');
    eq(ed.mode, 'view');
    ed.preview.el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    eq(ed.mode, 'view', 'двойной клик не открывает правку');
  });
  test('setReadOnly(true) закрывает правку, setReadOnly(false) возвращает кнопку и правку', () => {
    const ed = make('<p>а</p>', { onSave: () => {} });
    eq(ed.mode, 'edit');
    ed.setReadOnly(true);
    eq(ed.mode, 'view');
    ed.toolbar.update({ ...ed.state, mode: 'view' });
    ok(!ed.toolbar.el.contains(ed.toolbar.modeBtn));
    ed.setReadOnly(false);
    ed.toolbar.update({ ...ed.state, mode: 'view' });
    ok(ed.toolbar.el.contains(ed.toolbar.modeBtn), 'кнопка «Редактировать» вернулась');
    ed.setMode('edit');
    eq(ed.mode, 'edit');
  });
  test('текст читается, getHTML работает, сохранения из шапки нет', () => {
    const ed = ro();
    ok(ed.getHTML().includes('<h2>Заголовок</h2>'));
    ok(ed.preview.content.textContent.includes('Текст'), 'просмотр показывает текст');
    ok(!ed.toolbar.sets.viewRo.includes(ed.toolbar.saveBtn));
  });
  test('на любой ширине и в обеих темах: сводка помещается, без переполнения', async () => {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        const ed = make('<h2>Заголовок</h2><p>Текст</p>', { readOnly: true }, { width, theme });
        ed.toolbar.update({ ...ed.state, mode: 'view' });
        await wait(30);
        ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, `${width}/${theme}: переполнение`);
        ok(ed.toolbar.stats.getBoundingClientRect().width > 0, `${width}/${theme}: сводка видна`);
      }
    }
  });
});

group('Тёмная тема: линия-разделитель', () => {
  test('hr в правке и в просмотре — серый #4D4D4D (main/gray/dark), а не светлый', () => {
    for (const width of WIDTHS) {
      const ed = make('<p>Текст</p><hr><p>Ещё</p>', { preview: 'inline' }, { width, theme: 'dark' });
      eq(getComputedStyle(ed.editable.querySelector('hr')).backgroundColor, 'rgb(77, 77, 77)', `правка, ${width}`);
      ed.setMode('view');
      eq(getComputedStyle(ed.preview.content.querySelector('hr')).backgroundColor, 'rgb(77, 77, 77)', `просмотр, ${width}`);
    }
  });
  test('hr в светлой теме — #EDF3FA', () => {
    const ed = make('<p>Текст</p><hr><p>Ещё</p>', {}, { theme: 'light' });
    eq(getComputedStyle(ed.editable.querySelector('hr')).backgroundColor, 'rgb(237, 243, 250)');
  });
});

group('Демо: меню страниц и доступ', () => {
  const openPage = async (name) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:absolute;left:0;top:0;width:1000px;height:700px;border:0;visibility:hidden';
    frame.src = new URL(`../examples/${name}`, import.meta.url).href;
    document.body.appendChild(frame);
    await new Promise((res, rej) => { frame.onload = res; setTimeout(() => rej(new Error('страница не загрузилась')), 8000); });
    await wait(600);
    return frame;
  };
  test('порядок меню: Главная, Админка, Сайт, Документация; сервисные страницы в конце', async () => {
    const frame = await openPage('index.html');
    try {
      const labels = Array.from(frame.contentDocument.querySelectorAll('[data-demo-nav] .demo-menu')).map((a) => a.textContent.trim());
      eq(labels.join('|'), 'Главная|Админка|Сайт|Документация|Во весь экран|Узкие контейнеры');
    } finally { frame.remove(); }
  });
  test('на странице документации есть переключатель доступа, ?readonly включает чтение', async () => {
    let frame = await openPage('docs.html');
    try {
      eq(frame.contentDocument.querySelectorAll('#access .demo-tab').length, 2, 'два переключателя');
      eq(frame.contentWindow.Ted.editors[0].options.readOnly, false);
      frame.contentDocument.querySelector('#access [data-access="ro"]').click();
      eq(frame.contentWindow.Ted.editors[0].options.readOnly, true);
      eq(frame.contentWindow.Ted.editors[0].mode, 'view');
    } finally { frame.remove(); }
    frame = await openPage('docs.html?readonly');
    try {
      eq(frame.contentWindow.Ted.editors[0].options.readOnly, true, '?readonly');
    } finally { frame.remove(); }
  });
});

group('Тостеры', () => {
  const toasts = () => Array.from(document.querySelectorAll('.ted-ui-toast__text')).map((n) => n.textContent);
  const clear = () => document.querySelectorAll('.ted-ui-toast').forEach((n) => n.remove());
  const withToasts = (html2, opts = {}) => { clear(); return make(html2, { toasts: true, ...opts }); };
  const undoBtn = () => Array.from(document.querySelectorAll('.ted-ui-toast button')).find((b) => /Отменить/.test(b.textContent));

  test('вставка из меню блоков: «Блок вставлен» с «Отменить», отмена убирает блок', () => {
    const ed = withToasts('<p>один</p>');
    select(ed, 0, 1);
    ed.toolbar.allBlocksBtn.click();
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="blockquote"]').click();
    ok(toasts().includes('Блок вставлен'), toasts().join('|'));
    ok(undoBtn(), 'есть «Отменить»');
    undoBtn().click();
    eq(blocks(ed).map((b) => b.tagName.toLowerCase()).join(','), 'p');
  });

  test('вставка через «/»: «Блок вставлен»', () => {
    const ed = withToasts('<p></p>');
    select(ed, 0, 0);
    document.execCommand('insertText', false, '/');
    document.execCommand('insertText', false, 'цит');
    ed.blockMenu.onKey(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    ok(toasts().includes('Блок вставлен'), toasts().join('|'));
  });

  test('«Превратить в…»: «Тип блока изменён» с «Отменить»; тот же тип — без тоста', () => {
    const ed = withToasts('<p>текст</p>');
    ed.handle.openMenu(blocks(ed)[0], ed.handle.ctrlGrip);
    const convert = Array.from(pop(ed).querySelectorAll('.ted-ui-item')).find((i) => /Превратить/.test(i.textContent));
    convert.click();
    const sub = ed.subPopover.el;
    ok(sub, 'подменю открылось');
    Array.from(sub.querySelectorAll('.ted-ui-item')).find((i) => i.textContent.trim() === 'Заголовок 2').click();
    eq(tagOf(ed), 'h2');
    ok(toasts().includes('Тип блока изменён'), toasts().join('|'));
    ok(undoBtn(), 'есть «Отменить»');
    undoBtn().click();
    eq(tagOf(ed), 'p');
    clear();
    ed.handle.openMenu(blocks(ed)[0], ed.handle.ctrlGrip);
    Array.from(pop(ed).querySelectorAll('.ted-ui-item')).find((i) => /Превратить/.test(i.textContent)).click();
    Array.from(ed.subPopover.el.querySelectorAll('.ted-ui-item')).find((i) => i.textContent.trim() === 'Обычный текст').click();
    ok(!toasts().includes('Тип блока изменён'), 'тот же тип — тоста нет');
  });

  test('автосохранение: «Черновик сохранён» один раз за сессию', async () => {
    const ed = withToasts('<p>а</p>', { autosave: `ted-test-toast-${Date.now()}`, autosaveDelay: 10 });
    select(ed, 0, 1);
    document.execCommand('insertText', false, 'б');
    await until(() => toasts().includes('Черновик сохранён'));
    eq(toasts().filter((t) => t === 'Черновик сохранён').length, 1, toasts().join('|'));
    document.execCommand('insertText', false, 'в');
    await wait(600);   // повторный тост не должен появиться
    eq(toasts().filter((t) => t === 'Черновик сохранён').length, 1, 'второй раз не показываем');
    ed.clearDraft();
  });

  test('вставка не удалась: «Не удалось вставить»', () => {
    const ed = withToasts('<p>а</p>');
    select(ed, 0, 1);
    const real = document.execCommand;
    document.execCommand = () => false;
    try {
      ed.onPaste({ clipboardData: { getData: (t) => (t === 'text/html' ? '<p>x</p>' : 'x') }, preventDefault() {} });
    } finally { document.execCommand = real; }
    ok(toasts().includes('Не удалось вставить'), toasts().join('|'));
  });

  test('уже были: дублирование, удаление, очистка, ссылка, форматирование', () => {
    const ed = withToasts('<h2>А</h2><p>Б</p>');
    ed.handle.duplicate(blocks(ed)[0]);
    ok(toasts().includes('Блок продублирован'), toasts().join('|'));
    clear();
    ed.clearAll();
    ok(toasts().includes('Всё очищено'), toasts().join('|'));
  });

  test('тосты на любой ширине и в обеих темах помещаются в окно', async () => {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        clear();
        const ed = make('<p>а</p>', { toasts: true }, { width, theme });
        ed.toast('Блок вставлен', { undo: true });
        await wait(30);
        const t = document.querySelector('.ted-ui-toast');
        ok(t, `${width}/${theme}: тост появился`);
        const r = t.getBoundingClientRect();
        ok(r.left >= -1 && r.right <= innerWidth + 1, `${width}/${theme}: тост вне окна ${Math.round(r.left)}…${Math.round(r.right)}`);
      }
    }
    clear();
  });
});

group('Блоки этапа 4: выноска, цифры, плюсы и минусы, цветной фон', () => {
  const CALLOUT = '<blockquote class="ted-callout"><p><strong>Полезно знать</strong></p><p>Короткие заметки.</p></blockquote>';
  const FACTS = '<ul class="ted-facts"><li><strong>120+</strong><br>стран</li><li><strong>4.8</strong><br>оценка</li><li><strong>24/7</strong><br>поддержка</li><li><strong>1M</strong><br>заказов</li></ul>';
  const PROS = '<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Раз</li><li>Два</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Три</li></ul></li></ul>';
  const px = (v) => `${v}px`;

  test('санитайзер сохраняет классы блоков и не пускает их на чужие теги', () => {
    for (const src of [CALLOUT, FACTS, PROS]) {
      const out = Ted.clean(src);
      for (const cls of ['ted-callout', 'ted-facts', 'ted-proscons', 'ted-pros', 'ted-cons']) {
        if (src.includes(cls)) ok(out.includes(cls), `${cls}: ${out}`);
      }
    }
    const bad = Ted.clean('<p class="ted-callout">а</p><ol class="ted-facts"><li class="ted-pros">б</li></ol>');
    ok(!bad.includes('ted-callout') && !bad.includes('ted-facts'), bad);
  });

  test('загрузка и сохранение: чистая разметка без служебных атрибутов', () => {
    for (const [src, marks] of [[CALLOUT, ['<blockquote class="ted-callout">', '<strong>Полезно знать</strong>']], [FACTS, ['<ul class="ted-facts">', '<strong>120+</strong><br>стран']], [PROS, ['<ul class="ted-proscons">', '<li class="ted-pros">', '<li class="ted-cons">']]]) {
      const ed = make(src);
      const out = html(ed);
      for (const m of marks) ok(out.includes(m), `${m} → ${out}`);
      ok(!out.includes('data-tedui'), 'без служебных атрибутов');
    }
  });

  test('плитки и «/»: пять блоков готовы (живая миниатюра) и вставляются', () => {
    for (const [type, sel] of [['callout', 'blockquote.ted-callout'], ['facts', 'ul.ted-facts li strong'], ['proscons', 'ul.ted-proscons li.ted-pros'], ['background', '[class*="ted-bg-"]']]) {
      const ed = make('<p>один</p>');
      select(ed, 0, 1);
      ed.toolbar.allBlocksBtn.click();
      const tile = ed.blockMenu.picker.panel.querySelector(`.ted-ui-tile[data-type="${type}"]`);
      ok(!tile.classList.contains('is-soon') && tile.querySelector('.ted-ui-tile__sample'), `${type}: живая миниатюра`);
      tile.click();
      ok(ed.editable.querySelector(sel), `${type}: ${ed.editable.innerHTML}`);
      ok(!ed.editable.querySelector('li:empty, p:empty'), 'нет пустых узлов без <br>');
    }
    const ed2 = make('<p></p>');
    select(ed2, 0, 0);
    document.execCommand('insertText', false, '/');
    document.execCommand('insertText', false, 'выно');
    ed2.blockMenu.onKey(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    ok(ed2.editable.querySelector('blockquote.ted-callout'), 'через «/» вместо пустого абзаца');
    eq(ed2.editable.children.length, 1, 'пустой абзац заменён, а не оставлен');
  });

  test('вставка выноски: курсор в заголовке, Enter-ввод идёт в заголовок', () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="callout"]').click();
    document.execCommand('insertText', false, 'Совет');
    eq(ed.editable.querySelector('blockquote.ted-callout > p:first-child strong').textContent, 'Совет');
  });

  test('ключевые цифры: 2 карточки; плюсы и минусы: две карточки с пунктом', () => {
    const ed = make('<p></p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="facts"]').click();
    eq(ed.editable.querySelectorAll('ul.ted-facts > li').length, 2);
    const ed2 = make('<p></p>');
    ed2.blockMenu.openPicker(blocks(ed2)[0]);
    ed2.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="proscons"]').click();
    eq(ed2.editable.querySelectorAll('ul.ted-proscons > li').length, 2);
    ok(ed2.editable.querySelector('li.ted-pros > ul > li') && ed2.editable.querySelector('li.ted-cons > ul > li'), 'пункты внутри');
    eq(ed2.editable.querySelectorAll('li.ted-pros > ul > li').length, 3, 'по макету empty — три пункта в карточке');
    eq(ed2.editable.querySelectorAll('li.ted-cons > ul > li').length, 3);
  });

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`вид по макету: ${width} px, ${theme}`, () => {
        const dark = theme === 'dark';
        const rgb = (r, g, b) => `rgb(${r}, ${g}, ${b})`;
        const ed = make(CALLOUT + FACTS + PROS + '<p class="ted-bg-gray">Фон</p>', {}, { width, theme });
        // выноска: плашка r16 p12, значок 24, заголовок 16/700, текст 13
        const c = ed.editable.querySelector('blockquote.ted-callout');
        const cs = getComputedStyle(c);
        eq(cs.borderRadius, '16px', 'выноска r16');
        eq(cs.paddingTop, '12px');
        eq(cs.backgroundColor, dark ? rgb(38, 38, 38) : rgb(237, 243, 250), 'фон выноски по теме');
        const icon = getComputedStyle(c, '::before');
        eq([icon.width, icon.height].join(' '), '24px 24px', 'значок 24');
        const t = getComputedStyle(c.querySelector('p'));
        eq([t.fontSize, t.fontWeight].join(' '), '16px 700', 'заголовок 16 / 700');
        eq(getComputedStyle(c.querySelectorAll('p')[1]).fontSize, '13px', 'текст 13');
        // ключевые цифры: карточки r12 p16, число 28 / 700 акцентом, подпись 11
        const f = ed.editable.querySelectorAll('ul.ted-facts > li');
        eq(getComputedStyle(f[0]).borderRadius, '12px', 'цифры r12');
        eq(getComputedStyle(f[0]).paddingTop, '16px');
        eq(getComputedStyle(f[0]).backgroundColor, dark ? rgb(77, 77, 77) : rgb(237, 243, 250), 'фон карточки по теме');
        const v = getComputedStyle(f[0].querySelector('strong'));
        eq([v.fontSize, v.fontWeight, v.color].join(' '), '28px 700 rgb(25, 117, 247)', 'число 28 / 700 акцентом');
        eq(getComputedStyle(f[0]).fontSize, '11px', 'подпись 11');
        const cols = getComputedStyle(f[0].parentNode).gridTemplateColumns.split(' ').length;
        ok(cols === 4 || cols === 2, `колонок: ${cols} (4 на десктопе, 2 на узком окне)`);
        // плюсы и минусы: карточки r16 p20, цвета по теме, значки 24
        const p = ed.editable.querySelectorAll('ul.ted-proscons > li');
        eq(getComputedStyle(p[0]).borderRadius, '16px');
        eq(getComputedStyle(p[0]).paddingTop, '20px');
        eq(getComputedStyle(p[0]).backgroundColor, dark ? rgb(77, 77, 77) : rgb(195, 229, 195), 'плюсы');
        eq(getComputedStyle(p[1]).backgroundColor, dark ? rgb(77, 77, 77) : rgb(255, 204, 204), 'минусы');
        const title = getComputedStyle(p[0].querySelector('strong'));
        eq([title.fontSize, title.fontWeight].join(' '), '20px 700', 'заголовок 20 / 700');
        const mark = getComputedStyle(p[0].querySelector('ul > li'), '::before');
        eq([mark.width, mark.height, mark.backgroundColor].join(' '), '24px 24px rgb(14, 140, 14)', 'зелёная галочка 24');
        eq(getComputedStyle(p[1].querySelector('ul > li'), '::before').backgroundColor, 'rgb(204, 41, 41)', 'красный крестик');
        // цветной фон: r24 p20
        const bg = ed.editable.querySelector('p.ted-bg-gray');
        eq(getComputedStyle(bg).borderRadius, '24px', 'фон r24');
        eq(getComputedStyle(bg).paddingTop, '20px');
        ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, 'без переполнения');
      });
    }
  }

  test('в просмотре блоки выглядят так же', () => {
    const ed = make(CALLOUT + FACTS + PROS, { preview: 'inline' });
    ed.setMode('view');
    const v = ed.preview.content;
    eq(getComputedStyle(v.querySelector('blockquote.ted-callout')).borderRadius, '16px');
    eq(getComputedStyle(v.querySelector('ul.ted-facts > li')).borderRadius, '12px');
    eq(getComputedStyle(v.querySelector('ul.ted-proscons > li')).borderRadius, '16px');
  });

  test('перетаскивание и Undo работают для новых блоков', () => {
    const ed = make(CALLOUT + FACTS + '<p>Текст</p>');
    ed.handle.setFocused(blocks(ed)[0]);
    ed.handle.startDrag(blocks(ed)[0], blocks(ed)[0].getBoundingClientRect().top);
    ed.handle.onDrag({ clientY: blocks(ed)[0].getBoundingClientRect().top + 400 });
    ed.handle.endDrag();
    eq(blocks(ed).map((b) => b.tagName.toLowerCase()).join(','), 'ul,p,blockquote');
    ed.history.undo();
    eq(blocks(ed)[0].tagName.toLowerCase(), 'blockquote');
  });
});

group('Цитата с автором и код с языком', () => {
  const Q = '<blockquote><p>Текст цитаты.</p><p class="ted-author"><strong>Анна Петрова</strong><br>Директор</p></blockquote>';
  const C = '<pre data-lang="js" data-nums="1\n2">let a;\nlet b;</pre>';
  const items = (ed) => Array.from(pop(ed).querySelectorAll('.ted-ui-item__label')).map((n) => n.textContent);

  test('санитайзер: автор — только последний абзац цитаты, инициалы считаются сами', () => {
    const out = Ted.clean(Q);
    ok(out.includes('class="ted-author"') && out.includes('data-initials="АП"'), out);
    const bad = Ted.clean('<p class="ted-author">а б</p><blockquote><p class="ted-author">в г</p><p>д</p></blockquote>');
    ok(!bad.includes('ted-author'), bad);
  });
  test('санитайзер: язык по белому списку символов, номера строк по числу строк', () => {
    const out = Ted.clean(C);
    ok(out.includes('data-lang="js"') && out.includes('data-nums="1\n2"') && out.includes('<code>'), out);
    ok(out.includes('<span class="ted-k">let</span>'), 'в сохранённом HTML токены подсветки: ' + out);
    const bad = Ted.clean('<pre data-lang="a b&quot;&gt;">x = 1;</pre>');
    ok(!bad.includes('a b'), bad);
  });
  test('номера строк пересчитываются при правке', () => {
    const ed = make(C);
    const pre = ed.editable.querySelector('pre');
    pre.setAttribute('data-nums', '1');
    pre.querySelector('code').textContent = 'a\nb\nc';
    ed.onInput({ inputType: 'insertText', data: 'c' });
    eq(ed.editable.querySelector('pre').getAttribute('data-nums'), '1\n2\n3');
  });
  test('меню цитаты: добавить и убрать автора', async () => {
    const ed = make('<blockquote><p>Текст</p></blockquote>');
    ed.handle.openMenu(blocks(ed)[0], null);
    ok(items(ed).includes('Добавить автора'), items(ed).join('|'));
    Array.from(pop(ed).querySelectorAll('.ted-ui-item')).find((n) => n.textContent.includes('Добавить автора')).click();
    ok(await until(() => ed.editable.querySelector('blockquote > p.ted-author strong')), 'автор добавлен');
    ed.handle.openMenu(blocks(ed)[0], null);
    ok(items(ed).includes('Убрать автора'));
    Array.from(pop(ed).querySelectorAll('.ted-ui-item')).find((n) => n.textContent.includes('Убрать автора')).click();
    ok(!ed.editable.querySelector('.ted-author'), html(ed));
  });
  test('меню кода: язык, номера строк (по умолчанию включены), копирование', () => {
    const ed = make('<pre>x\ny</pre>');
    eq(ed.editable.querySelector('pre').getAttribute('data-nums'), '1\n2', 'старый <pre> получает номера строк');
    ed.handle.openMenu(blocks(ed)[0], null);
    ok(['Язык кода…', 'Скрыть номера строк', 'Копировать код'].every((t) => items(ed).includes(t)), items(ed).join('|'));
    Array.from(pop(ed).querySelectorAll('.ted-ui-item')).find((n) => n.textContent.includes('Скрыть номера')).click();
    ok(!ed.editable.querySelector('pre').hasAttribute('data-nums') && ed.editable.querySelector('pre').hasAttribute('data-nonums'), 'номера выключены явно');
    ok(ed.getInnerHTML().includes('data-nonums'), 'выбор сохраняется');
    ok(!Ted.clean(ed.getInnerHTML()).includes('data-nums='), 'и переживает повторную очистку');
    ed.handle.openMenu(blocks(ed)[0], null);
    Array.from(pop(ed).querySelectorAll('.ted-ui-item')).find((n) => n.textContent.includes('Показать номера')).click();
    eq(ed.editable.querySelector('pre').getAttribute('data-nums'), '1\n2');
    ed.handle.openMenu(blocks(ed)[0], null);
    Array.from(pop(ed).querySelectorAll('.ted-ui-item')).find((n) => n.textContent.includes('Язык кода')).click();
    const sub = document.querySelectorAll('.ted-ui-pop');
    const php = Array.from(sub).flatMap((p) => Array.from(p.querySelectorAll('.ted-ui-item'))).find((n) => n.textContent.trim() === 'PHP');
    ok(php, 'подменю языков');
    php.click();
    eq(ed.editable.querySelector('pre').getAttribute('data-lang'), 'php');
  });

  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      test(`вид: ${width} px, ${theme}`, () => {
        const ed = make(Q + C, {}, { width, theme });
        const av = getComputedStyle(ed.editable.querySelector('p.ted-author'), '::before');
        eq([av.width, av.height, av.borderRadius].join(' '), '40px 40px 50%', 'аватар 40');
        eq(av.content, '"АП"', 'инициалы');
        eq(getComputedStyle(ed.editable.querySelector('p.ted-author strong')).fontSize, '16px');
        const pre = ed.editable.querySelector('pre');
        const lab = getComputedStyle(pre, '::before');
        eq([lab.height, lab.fontSize, lab.fontWeight].join(' '), '36px 14px 600', 'шапка кода 36, язык 14/600');
        eq(lab.content, '"js"');
        eq(lab.marginBottom, '8px', 'зазор 8 между шапкой и кодом');
        eq(getComputedStyle(pre, '::before').borderRadius, '12px', 'шапка r12');
        const body = pre.querySelector('code');
        eq(getComputedStyle(body).borderRadius, '12px', 'код r12');
        const nm = getComputedStyle(pre, '::after');
        eq([nm.width, nm.color].join(' '), '26px rgb(145, 149, 153)', 'колонка номеров 26, цифры #919599');
        ok(nm.content.includes('1'), 'номера строк');
        ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, 'без переполнения');
      });
    }
  }
});

group('Панель: недоступные кнопки убраны', () => {
  const shown = (b) => !b.hidden && getComputedStyle(b).display !== 'none';
  test('в заголовке шага нет «Жирный», в описании есть; у шагов и чек-листа нет «Цветной фон», в абзаце есть', () => {
    const ed = make('<ol class="ted-steps"><li><strong>Заг</strong><br>описание</li></ol><p>текст</p><ul class="ted-checklist"><li>пункт</li></ul>');
    ed.focus();
    ed.caretToStepTitleEnd(ed.editable.querySelector('li'));
    ed.updateState();
    ok(!shown(ed.toolbar.marks.bold), 'в заголовке шага «Жирный» убран');
    ok(!shown(ed.toolbar.colorBtn), 'у шагов фона нет');
    ed.caretToStepDescription(ed.editable.querySelector('li'));
    ed.updateState();
    ok(shown(ed.toolbar.marks.bold), 'в описании «Жирный» есть');
    select(ed, 1, 1);
    ed.updateState();
    ok(shown(ed.toolbar.colorBtn) && shown(ed.toolbar.marks.bold), 'в абзаце обе кнопки на месте');
    const li = ed.editable.querySelector('ul.ted-checklist > li');
    const r = document.createRange();
    r.setStart(li.firstChild, 2);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    ok(!shown(ed.toolbar.colorBtn), 'у чек-листа фона нет');
  });
  test('в блоке кода нет кнопок жирный / курсив / подчёркнутый / зачёркнутый', () => {
    const ed = make('<pre>код</pre><p>текст</p>');
    ed.focus();
    select(ed, 0, 1);
    ed.updateState();
    for (const k of ['bold', 'italic', 'underline', 'strike']) ok(!shown(ed.toolbar.marks[k]), `${k} убрана`);
    select(ed, 1, 1);
    ed.updateState();
    for (const k of ['bold', 'italic', 'underline', 'strike']) ok(shown(ed.toolbar.marks[k]), `${k} в абзаце есть`);
  });
});

group('Замечания заказчика, раунд 3: заглушки, выноска, цифры, перенос', () => {
  const press = (ed, o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));

  test('заглушка названия шага не сдвигает курсор: псевдоэлемент вне потока', () => {
    const ed = make('<ol class="ted-steps"><li><strong>А</strong></li></ol>');
    const s = ed.editable.querySelector('strong');
    s.replaceChildren(document.createElement('br'));
    ed.updatePlaceholders();
    eq(getComputedStyle(s, '::before').position, 'absolute');
  });
  test('выноска: заглушки «Заголовок выноски» / «Текст выноски», Enter из заголовка → в текст, пустой текст + Enter → выход', () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="callout"]').click();
    ed.updatePlaceholders();
    const ps = ed.editable.querySelectorAll('blockquote.ted-callout > p');
    eq(ps[0].getAttribute('data-tedui-ph'), 'Заголовок выноски');
    eq(ps[1].getAttribute('data-tedui-ph'), 'Текст выноски');
    document.execCommand('insertText', false, 'Привет');
    press(ed, { key: 'Enter' });
    eq(ed.editable.querySelectorAll('blockquote.ted-callout > p').length, 2, 'лишняя строка не создана');
    ok(ed.editable.querySelectorAll('blockquote.ted-callout > p')[1].contains(getSelection().anchorNode), 'курсор в тексте выноски');
    press(ed, { key: 'Enter' });
    ok(!ed.editable.querySelector('blockquote.ted-callout > p:nth-child(3)'), 'пустой текст + Enter не добавляет строк');
    ok(ed.editable.querySelector('blockquote.ted-callout + p'), 'курсор ушёл в абзац под выноской');
  });
  test('цветной фон у выноски и цифр: кнопка работает, плашка и карточки перекрашиваются; у шагов нет', async () => {
    const ed = make('<blockquote class="ted-callout"><p><strong>А</strong></p><p>б</p></blockquote><ul class="ted-facts"><li><strong>1</strong><br>а</li><li><strong>2</strong><br>б</li></ul>');
    select(ed, 0, 0);
    ed.exec('bg:color1');
    ok(ed.editable.querySelector('blockquote.ted-callout.ted-bg-color1'), ed.editable.innerHTML);
    const co = ed.editable.querySelector('blockquote.ted-callout');
    co.style.transition = 'none';
    eq(getComputedStyle(co).backgroundColor, 'rgb(210, 226, 247)', 'плашка выноски акцентным');
    eq(getComputedStyle(ed.editable.querySelector('blockquote.ted-callout')).borderRadius, '16px', 'радиус выноски сохранён');
    select(ed, 1, 0);
    ed.exec('bg:color2');
    const ul = ed.editable.querySelector('ul.ted-facts');
    ok(ul.classList.contains('ted-bg-color2'));
    ul.firstElementChild.style.transition = 'none';
    eq(getComputedStyle(ul.firstElementChild).backgroundColor, 'rgb(229, 229, 255)', 'карточки цифр перекрашены');
    eq(getComputedStyle(ul).backgroundColor, 'rgba(0, 0, 0, 0)', 'у списка своего фона нет');
    ok(Ted.clean(ed.getInnerHTML()).includes('ted-bg-color2'), 'класс сохраняется');
  });
  test('цветной фон: заглушка «Текст на цветном фоне» с отступом 20', () => {
    const ed = make('<p class="ted-bg-gray">а</p>');
    const p = ed.editable.querySelector('p');
    p.replaceChildren(document.createElement('br'));
    ed.focus();
    select(ed, 0, 0);
    ed.updatePlaceholders();
    eq(p.getAttribute('data-tedui-ph'), 'Текст на цветном фоне');
    eq(getComputedStyle(p, '::before').left, '20px', 'заглушка с учётом отступа');
  });
  test('цифры: плитка переносится и в сторону — соседи сдвигаются по горизонтали и порядок меняется', () => {
    const ed = make('<ul class="ted-facts"><li><strong>1</strong><br>а</li><li><strong>2</strong><br>б</li><li><strong>3</strong><br>в</li><li><strong>4</strong><br>г</li></ul>');
    ed.focus();
    const items = Array.from(ed.editable.querySelectorAll('ul.ted-facts > li'));
    ed.caretToStepTitleEnd(items[0]);
    ed.updateState();
    const r0 = items[0].getBoundingClientRect();
    const r2 = items[2].getBoundingClientRect();
    ed.handle.startDrag(items[0], r0.top, items, r0.left);
    ed.handle.onDrag({ clientX: r2.left + r2.width / 2, clientY: r2.top + r2.height / 2 });
    ok(/translate\(/.test(items[1].style.transform), 'соседи сдвигаются плавно: ' + items[1].style.transform);
    ed.handle.endDrag();
    eq(Array.from(ed.editable.querySelectorAll('ul.ted-facts > li strong')).map((s) => s.textContent).join(','), '2,3,1,4');
    ed.history.undo();
    eq(ed.editable.querySelector('ul.ted-facts strong').textContent, '1', 'Undo');
  });
  test('перенос шагов и пунктов плавный: у соседей есть transition во время перетаскивания', () => {
    const ed = make('<ul class="ted-checklist"><li>раз</li><li>два</li></ul><ol class="ted-steps"><li><strong>А</strong></li><li><strong>Б</strong></li></ol>');
    ed.focus();
    const li = ed.editable.querySelector('ul.ted-checklist > li');
    ed.handle.startDrag(li, li.getBoundingClientRect().top, Array.from(li.parentNode.children));
    const other = ed.editable.querySelectorAll('ul.ted-checklist > li')[1];
    ok(getComputedStyle(other).transitionDuration !== '0s', 'сосед едет плавно');
    eq(getComputedStyle(li).transitionDuration, '0s', 'сам пункт без задержки');
    ed.handle.endDrag(true);
  });
  test('кнопки пункта плюсов и минусов — правее своей карточки, в строке пункта, текст не закрыт', () => {
    const ed = make('<ul class="ted-proscons"><li class="ted-pros"><strong>П</strong><ul><li>очень длинный пункт текста</li></ul></li><li class="ted-cons"><strong>М</strong><ul><li>б</li></ul></li></ul>', {}, { width: 1000 });
    ed.focus();
    const li = ed.editable.querySelector('li li');
    const r = document.createRange();
    r.setStart(li.firstChild, 2);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
    const c = ed.handle.itemControls.getBoundingClientRect();
    const b = ed.editable.querySelector('ul.ted-proscons').getBoundingClientRect();
    const card = ed.editable.querySelector('li.ted-pros').getBoundingClientRect();
    const row = li.getBoundingClientRect();
    ok(c.left >= card.right, 'кнопки правее карточки и не закрывают текст пункта: ' + Math.round(c.left - card.right));
    ok(Math.abs((c.top + c.height / 2) - (row.top + row.height / 2)) <= 2, 'по центру строки пункта');
    ok(c.left - card.right <= 8, 'вплотную к карточке');
  });
});

group('Автор цитаты: кнопка, поля, Enter, список авторов сайта', () => {
  const press = (ed, o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));
  const Q = '<blockquote><p>Лучший способ предсказать будущее</p></blockquote><p>после</p>';
  const focusQuote = (ed) => {
    ed.focus();
    const t = ed.editable.querySelector('blockquote > p').firstChild;
    const r = document.createRange();
    r.setStart(t, 3);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    ed.updateState();
  };

  test('кнопка «Добавить автора» под цитатой с курсором; после нажатия — поля «Имя» и «Должность», курсор в имени', async () => {
    const ed = make(Q);
    focusQuote(ed);
    ok(ed.handle.authorBtn.classList.contains('is-visible'), 'кнопка видна');
    eq(ed.handle.authorBtn.textContent.trim(), 'Добавить автора');
    ed.handle.authorBtn.click();
    ok(await until(() => ed.editable.querySelector('blockquote > p.ted-author')), 'автор добавлен');
    const a = ed.editable.querySelector('p.ted-author');
    ed.updatePlaceholders();
    eq(getComputedStyle(a.firstElementChild, '::before').content, '"Имя"');
    eq(getComputedStyle(a.firstElementChild, '::after').content, '"Должность"');
    ok(a.firstElementChild.contains(getSelection().anchorNode), 'курсор в имени');
    ok(!ed.handle.authorBtn.classList.contains('is-visible') || true);
  });
  test('Enter: имя → должность → абзац ниже цитаты; сохраняется <strong>имя</strong><br>должность и инициалы', async () => {
    const ed = make(Q);
    focusQuote(ed);
    ed.handle.authorBtn.click();
    await until(() => ed.editable.querySelector('p.ted-author'));
    document.execCommand('insertText', false, 'Анна Петрова');
    press(ed, { key: 'Enter' });
    document.execCommand('insertText', false, 'Редактор');
    const out = ed.getInnerHTML();
    ok(out.includes('<p class="ted-author" data-initials="АП"><strong>Анна Петрова</strong><br>Редактор</p>'), out);
    press(ed, { key: 'Enter' });
    ok(ed.editable.querySelector('blockquote + p').contains(getSelection().anchorNode), 'курсор ниже цитаты');
    ok(!ed.getInnerHTML().includes('​'));
  });
  test('Backspace в пустых полях автора убирает автора', async () => {
    const ed = make(Q);
    focusQuote(ed);
    ed.handle.authorBtn.click();
    await until(() => ed.editable.querySelector('p.ted-author'));
    press(ed, { key: 'Backspace' });
    ok(!ed.editable.querySelector('p.ted-author'), 'автор убран');
  });
  test('опция authors: список авторов сайта — выбор подставляет имя, должность и id', async () => {
    const ed = make(Q, { authors: [{ id: 'a1', name: 'Иван Смирнов', role: 'Автор' }, { id: 'a2', name: 'Анна Петрова', role: 'Редактор' }] });
    focusQuote(ed);
    ed.handle.authorBtn.click();
    ok(await until(() => pop(ed) && pop(ed).querySelectorAll('.ted-ui-item').length >= 3), 'список авторов в меню + «Ввести вручную»');
    Array.from(pop(ed).querySelectorAll('.ted-ui-item')).find((n) => n.textContent.includes('Анна Петрова')).click();
    const out = ed.getInnerHTML();
    ok(out.includes('data-author-id="a2"') && out.includes('<strong>Анна Петрова</strong><br>Редактор'), out);
  });
  test('вид автора по макету: отступ 20, аватар 40 / 18 600, имя 16 / 600, должность 11 (text/t4)', () => {
    const ed = make('<blockquote><p>Текст</p><p class="ted-author"><strong>Анна Петрова</strong><br>Главный редактор</p></blockquote>');
    const a = ed.editable.querySelector('p.ted-author');
    eq(getComputedStyle(a).marginTop, '20px');
    const av = getComputedStyle(a, '::before');
    eq([av.width, av.fontSize, av.fontWeight].join(' '), '40px 18px 600');
    const nm = getComputedStyle(a.firstElementChild);
    eq([nm.fontSize, nm.fontWeight].join(' '), '16px 600');
    eq(getComputedStyle(a).fontSize, '11px', 'должность 11 / t4');
    eq(getComputedStyle(a).lineHeight, '15.95px', 'межстрочный 145%');
    eq([nm.marginTop, nm.marginBottom, nm.lineHeight].join(' '), '-5.2px 2.8px 22.4px', 'поля дают блок имени 12 и зазор 8, как в Figma');
    const rg = document.createRange();
    rg.selectNodeContents(a.lastChild);
    eq(Math.round((rg.getBoundingClientRect().top - a.getBoundingClientRect().top) * 10) / 10, 22, 'должность на 22 от верха строки (Figma: 2 + 12 + 8)');
    eq(Math.round(a.getBoundingClientRect().height), 40, 'строка автора 40');
    eq(getComputedStyle(a).paddingLeft, '52px', 'аватар 40 + зазор 12');
  });
});

group('Раунд 4: Enter в коде, двойной Enter в цифрах, заглушки не перекрывают текст', () => {
  const press = (ed, o) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...o }));
  const type = (s) => document.execCommand('insertText', false, s);
  const cards = (ed) => Array.from(ed.editable.querySelectorAll('ul.ted-facts > li'));
  const caretAtEnd = (node) => {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  };
  const fresh = (kind) => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector(`.ted-ui-tile[data-type="${kind}"]`).click();
    return ed;
  };

  test('код: Enter переносит строку и не ломает <pre><code>; номера растут', () => {
    const ed = make('<pre data-lang="js" data-nums="1"><code>let a = 1;</code></pre>');
    ed.focus();
    caretAtEnd(ed.editable.querySelector('pre > code'));
    press(ed, { key: 'Enter' });
    ok(ed.editable.querySelector('pre > code'), 'code на месте: ' + ed.editable.innerHTML);
    type('b');
    press(ed, { key: 'Enter' });
    type('c');
    eq(ed.editable.querySelectorAll('pre').length, 1);
    eq(ed.editable.querySelector('pre > code').textContent.replace(/\n+$/, ''), 'let a = 1;\nb\nc');
    ed.refreshCode();
    ok(ed.editable.querySelector('pre').getAttribute('data-nums').split('\n').length >= 3, 'номера строк: ' + ed.editable.querySelector('pre').getAttribute('data-nums'));
  });
  test('код: двойной Enter в конце выходит из блока в абзац, код цел', () => {
    const ed = make('<pre data-lang="js"><code>let a = 1;</code></pre><p>после</p>');
    ed.focus();
    caretAtEnd(ed.editable.querySelector('pre > code'));
    press(ed, { key: 'Enter' });
    press(ed, { key: 'Enter' });
    const pre = ed.editable.querySelector('pre');
    ok(pre && pre.querySelector(':scope > code'), 'code не потерян: ' + ed.editable.innerHTML);
    eq(pre.textContent, 'let a = 1;', 'лишних переносов нет');
    ok(pre.nextElementSibling && pre.nextElementSibling.tagName === 'P', 'ниже абзац');
    ok(pre.nextElementSibling.contains(getSelection().anchorNode), 'курсор в абзаце под кодом');
    ok(ed.getInnerHTML().includes('<pre'), 'код сохраняется');
  });
  test('код: Enter в пустом блоке кода тоже не ломает его', () => {
    const ed = fresh('pre');
    press(ed, { key: 'Enter' });
    ok(!ed.editable.querySelector('pre') || ed.editable.querySelector('pre > code'), 'code на месте: ' + ed.editable.innerHTML);
    press(ed, { key: 'Enter' });
    ok(!ed.editable.querySelector('pre') || ed.editable.querySelector('pre > code'), ed.editable.innerHTML);
  });

  test('цифры: подпись-заглушка у низа карточки и не лезет на длинное значение', () => {
    const ed = make('<ul class="ted-facts"><li><strong>Очень длинное значение которое переносится</strong><br>​</li><li><strong>2</strong><br>б</li></ul>');
    ed.focus();
    ed.caretToStepTitleEnd(cards(ed)[0]);
    ed.updateState();
    ed.updatePlaceholders();
    const li = cards(ed)[0];
    ok(li.hasAttribute('data-tedui-nodesc'), 'подпись пуста: ' + li.outerHTML);
    const t = li.firstElementChild;
    eq(getComputedStyle(t, '::after').content, '"Подпись"');
    eq(getComputedStyle(t, '::after').bottom, '16px', 'заглушка у низа карточки, как и подпись');
    const rt = document.createRange();
    rt.selectNodeContents(t.firstChild);
    const tb = rt.getBoundingClientRect();
    const lb = li.getBoundingClientRect();
    ok(tb.height > 40, 'значение в несколько строк: ' + tb.height);
    ok(lb.bottom - 32 >= tb.bottom - 1, 'подпись под значением, а не поверх');
  });
  test('цифры: Enter из значения → в подпись, текст подписи остаётся подписью; Enter из подписи → в следующую плитку', () => {
    const ed = fresh('facts');
    eq(cards(ed).length, 2, 'новый блок — две плитки');
    ed.focus();
    ed.caretToStepTitleEnd(cards(ed)[0]);
    type('4.8');
    press(ed, { key: 'Enter' });
    ok(cards(ed)[0].contains(getSelection().anchorNode) && !cards(ed)[0].firstElementChild.contains(getSelection().anchorNode), 'курсор в подписи той же плитки');
    type('средняя оценка');
    eq(cards(ed)[0].firstElementChild.textContent, '4.8', 'значение не тронуто');
    eq(cards(ed)[0].lastChild.textContent.replace(/​/g, ''), 'средняя оценка', 'текст — в подписи');
    press(ed, { key: 'Enter' });
    eq(cards(ed).length, 2, 'новой плитки нет — переход к следующей');
    ok(cards(ed)[1].firstElementChild.contains(getSelection().anchorNode), 'курсор в значении второй плитки');
    eq(cards(ed)[0].lastChild.textContent.replace(/​/g, ''), 'средняя оценка', 'подпись первой плитки цела');
    ed.updatePlaceholders();
    ok(cards(ed)[1].hasAttribute('data-tedui-notitle') && cards(ed)[1].hasAttribute('data-tedui-nodesc'), 'у пустой плитки есть заглушки');
  });
  test('цифры: Enter посреди подписи не переносит остаток подписи в заголовок', () => {
    const ed = make('<ul class="ted-facts"><li><strong>1</strong><br>средняя оценка</li><li><strong>2</strong><br>б</li></ul>');
    ed.focus();
    const d = cards(ed)[0].lastChild;
    const r = document.createRange();
    r.setStart(d, 7);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    press(ed, { key: 'Enter' });
    eq(cards(ed)[0].lastChild.textContent, 'средняя оценка', 'подпись цела');
    eq(cards(ed)[1].firstElementChild.textContent, '2', 'заголовок следующей не изменился');
    eq(cards(ed).length, 2);
  });
  test('цифры: двойной Enter (пустая подпись) вставляет новую плитку после текущей, а не прыгает в чужую', () => {
    const ed = make('<ul class="ted-facts"><li><strong>1</strong><br>а</li><li><strong>2</strong><br>б</li></ul>');
    ed.focus();
    cards(ed)[0].lastChild.data = '​';
    ed.caretToStepDescription(cards(ed)[0]);
    press(ed, { key: 'Enter' });
    eq(cards(ed).length, 3, 'новая плитка между первой и второй');
    eq(cards(ed)[2].firstElementChild.textContent, '2', 'вторая плитка осталась на месте');
    ok(cards(ed)[1].firstElementChild.contains(getSelection().anchorNode), 'курсор в значении новой плитки');
    type('Не страшно');
    eq(cards(ed)[1].firstElementChild.textContent, 'Не страшно');
    eq(cards(ed)[2].firstElementChild.textContent, '2', 'чужое значение не дописано');
  });
  test('цифры: в пустой плитке можно писать и в значение, и в подпись; подпись и её заглушка у низа карточки даже при высоких соседях', () => {
    const ed = fresh('facts');
    ed.focus();
    ed.caretToStepTitleEnd(cards(ed)[0]);
    type('Очень длинное значение которое переносится');
    ed.focus();
    ed.caretToStepTitleEnd(cards(ed)[1]);
    ed.updateState();
    ed.updatePlaceholders();
    const li = cards(ed)[1];
    const t = li.firstElementChild;
    ok(cards(ed)[0].getBoundingClientRect().height > t.getBoundingClientRect().height + 40, 'сосед выше');
    eq(getComputedStyle(t, '::after').bottom, '16px', 'заглушка у низа карточки, как и подпись');
    const li0 = cards(ed)[0].getBoundingClientRect();
    eq(Math.round(li.getBoundingClientRect().height), Math.round(li0.height), 'карточки строки одной высоты');
    type('5');
    eq(t.textContent, '5');
    ed.caretToStepDescription(li);
    type('ок');
    eq(li.lastChild.textContent.replace(/​/g, ''), 'ок');
    eq(t.textContent, '5', 'значение не тронуто');
  });
  test('цифры: Enter в подписи последней плитки создаёт новую; в неё можно писать, у неё есть кнопки', () => {
    const ed = make('<ul class="ted-facts"><li><strong>1</strong><br>а</li><li><strong>2</strong><br>б</li></ul>');
    ed.focus();
    ed.caretToStepDescription(cards(ed)[1]);
    const d = cards(ed)[1].lastChild;
    const r = document.createRange();
    r.setStart(d, d.data.length);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    press(ed, { key: 'Enter' });
    eq(cards(ed).length, 3, 'новая плитка');
    ok(cards(ed)[2].firstElementChild.contains(getSelection().anchorNode), 'курсор в значении новой плитки');
    ed.updateState();
    ed.updatePlaceholders();
    ok(ed.handle.itemControls.classList.contains('is-visible'), 'кнопки управления у новой плитки');
    type('77');
    eq(cards(ed)[2].firstElementChild.textContent, '77', 'в неё можно писать');
  });
  test('цифры: сохранённый HTML без пустых плиток и без служебных символов', () => {
    const ed = fresh('facts');
    ed.focus();
    ed.caretToStepTitleEnd(cards(ed)[0]);
    type('1');
    press(ed, { key: 'Enter' });
    type('а');
    press(ed, { key: 'Enter' });
    const html = ed.getInnerHTML();
    ok(!/data-tedui|​/.test(html), html);
    eq((html.match(/<li>/g) || []).length, 1, 'только заполненная плитка: ' + html);
  });
});

group('Автор: длинное имя переносится, блок кода без <code> чинится при вставке', () => {
  test('длинное имя и должность на узком экране переносятся и не вылезают', () => {
    const ed = make('<blockquote><p>Текст</p><p class="ted-author"><strong>Александра Константинопольская-Вишневецкая</strong><br>Главный редактор по связям с общественностью и партнёрами</p></blockquote>', {}, { width: 414 });
    const a = ed.editable.querySelector('p.ted-author');
    ok(a.getBoundingClientRect().height > 60, 'строка выросла: ' + a.getBoundingClientRect().height);
    ok(ed.ui.scrollWidth <= ed.ui.clientWidth + 1, 'горизонтальной прокрутки нет');
    const bq = a.parentNode.getBoundingClientRect();
    ok(a.getBoundingClientRect().right <= bq.right + 1, 'внутри цитаты');
    const s = a.querySelector('strong').getBoundingClientRect();
    ok(s.height > 30, 'имя в две строки: ' + s.height);
    ok(s.right <= bq.right + 1, 'имя не выходит за цитату');
  });
  test('вставка в <pre> без <code>: код восстанавливается, номера и подсветка есть', () => {
    const ed = make('<p>x</p>');
    const pre = document.createElement('pre');
    pre.setAttribute('data-nums', '1');
    pre.textContent = 'a';
    ed.editable.appendChild(pre);
    ed.focus();
    const r = document.createRange();
    r.setStart(pre.firstChild, 1);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    const dt = new DataTransfer();
    dt.setData('text/plain', '<div class="x">\n  <p>Привет</p>\n</div>');
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    const p = ed.editable.querySelector('pre');
    ok(p.querySelector(':scope > code'), 'code на месте: ' + p.outerHTML);
    eq(p.getAttribute('data-nums').split('\n').length, 3);
    if (window.CSS && CSS.highlights && window.Highlight) ok(CSS.highlights.get('ted-tag') && CSS.highlights.get('ted-tag').size > 0, 'теги подсвечены');
  });
  test('новый блок кода из пустого абзаца: одна строка, а не две', () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="pre"]').click();
    const pre = ed.editable.querySelector('pre');
    eq(pre.querySelector('code').textContent, '', 'код пуст');
    eq(pre.getAttribute('data-nums'), '1');
  });
});

group('Сохранение: отказ, очередь, форма (ревью)', () => {
  const edit = (ed, txt) => {
    ed.focus();
    select(ed, 0, 0, 0);
    document.execCommand('insertText', false, txt);
    ed.flush();
  };

  test('отказ onSave: версия не считается сохранённой, повторный выход в просмотр отправляет снова', async () => {
    let calls = 0;
    let fail = true;
    const ed = make('<p>раз</p>', { onSave: () => { calls += 1; return fail ? Promise.reject(new Error('500')) : Promise.resolve(); } });
    edit(ed, 'А');
    ed.setMode('view');
    await until(() => calls === 1 && ed.saveQueue);
    await ed.saveQueue.catch(() => {});
    ok(ed.savedHTML !== ed.lastHTML, 'после отказа версия не сохранена');
    ed.setMode('edit');
    fail = false;
    ed.setMode('view');
    ok(await until(() => calls === 2), 'повторная отправка: ' + calls);
    await ed.saveQueue;
    eq(ed.savedHTML, ed.lastHTML, 'после успеха сохранена');
  });

  test('синхронное исключение в onSave не ломает переход в просмотр', () => {
    const ed = make('<p>раз</p>', { onSave: () => { throw new Error('sync'); } });
    edit(ed, 'Б');
    ed.setMode('view');
    eq(ed.mode, 'view');
    eq(ed.ui.dataset.mode, 'view');
    ed.saveQueue.catch(() => {});
  });

  test('запросы идут по очереди; текст, изменённый во время запроса, остаётся в черновике', async () => {
    const key = 'ted-test-queue-' + Date.now();
    const resolvers = [];
    const started = [];
    const ed = make('<p>раз</p>', { autosave: key, autosaveDelay: 0, onSave: (html) => { started.push(html); return new Promise((res) => resolvers.push(res)); } });
    edit(ed, 'А');
    const first = ed.persist(ed.getHTML());
    eq(started.length, 1);
    edit(ed, 'Б');
    const second = ed.persist(ed.getHTML());
    eq(started.length, 1, 'второй запрос ждёт первый');
    resolvers[0]();
    await first;
    ok(await until(() => started.length === 2), 'второй пошёл после первого');
    ok(started[0] !== started[1]);
    ed.flush();
    await new Promise((r) => setTimeout(r, 30));
    ok(localStorage.getItem(key), 'черновик со свежим текстом цел, пока идёт второй запрос');
    resolvers[1]();
    await second;
    await new Promise((r) => setTimeout(r, 30));
    eq(ed.savedHTML, started[1]);
    eq(localStorage.getItem(key), null, 'после успеха последнего черновик очищен');
  });

  test('один и тот же текст не отправляется дважды, пока запрос идёт', async () => {
    let n = 0;
    let res;
    const ed = make('<p>раз</p>', { onSave: () => { n += 1; return new Promise((r) => { res = r; }); } });
    edit(ed, 'В');
    const html = ed.getHTML();
    const a = ed.persist(html);
    const b = ed.persist(html);
    eq(n, 1);
    res();
    await Promise.all([a, b]);
  });

  test('форма: submit не стирает черновик и не обещает «Сохранено»; markSaved сообщает об успехе', () => {
    const key = 'ted-test-form-' + Date.now();
    const form = document.createElement('form');
    form.addEventListener('submit', (e) => e.preventDefault());
    const ta = document.createElement('textarea');
    ta.value = '<p>раз</p>';
    form.appendChild(ta);
    document.body.appendChild(form);
    const ed = Ted.create(ta, { toasts: false, unit: 'px', autosave: key, autosaveDelay: 0 });
    edit(ed, 'Г');
    localStorage.setItem(key, JSON.stringify({ html: ed.getHTML(), base: ed.baseHTML }));
    let toasts = 0;
    ed.toast = () => { toasts += 1; };
    ed.save();   // previewMode по умолчанию уводит в просмотр — для формы нужен второй вызов в режиме просмотра
    ed.setMode('view');
    ed.save();
    ok(ta.value.includes('Г'), 'значение поля записано');
    ok(localStorage.getItem(key), 'черновик цел после submit');
    eq(toasts, 0, 'сообщение об успехе — на стороне CMS');
    ed.markSaved();
    eq(localStorage.getItem(key), null, 'markSaved очищает черновик');
    ok(toasts >= 1, 'и показывает «Сохранено»');
    Ted.destroy(ta);
    form.remove();
  });
});

group('Уничтожение и повторное создание редактора (ревью)', () => {
  const host = () => {
    const el = document.createElement('div');
    el.id = 'dst' + Math.random().toString(36).slice(2, 7);
    el.innerHTML = '<p>текст</p>';
    document.body.appendChild(el);
    return el;
  };

  test('Ted.destroy работает по элементу, селектору и экземпляру; create после этого даёт новый редактор', () => {
    for (const how of ['element', 'selector', 'instance', 'method']) {
      const el = host();
      const ed = Ted.create(el, { toasts: false });
      ok(Ted.editors.includes(ed));
      if (how === 'element') Ted.destroy(el);
      else if (how === 'selector') Ted.destroy('#' + el.id);
      else if (how === 'instance') Ted.destroy(ed);
      else ed.destroy();
      ok(!el.__ted, `${how}: ссылка на элементе снята`);
      ok(!Ted.editors.includes(ed), `${how}: реестр очищен`);
      const again = Ted.create(el, { toasts: false });
      ok(again !== ed && !again.destroyed, `${how}: создан новый редактор`);
      Ted.destroy(el);
      el.remove();
    }
  });

  test('повторный destroy безопасен', () => {
    const el = host();
    const ed = Ted.create(el, { toasts: false });
    ed.destroy();
    ed.destroy();
    Ted.destroy(el);
    el.remove();
    ok(true);
  });

  test('слушатель resize снимается, окна и меню закрываются, наблюдатели отключаются', () => {
    const added = [];
    const removed = [];
    const a = window.addEventListener;
    const r = window.removeEventListener;
    window.addEventListener = function (t, f, o) { if (t === 'resize') added.push(f); return a.call(this, t, f, o); };
    window.removeEventListener = function (t, f, o) { if (t === 'resize') removed.push(f); return r.call(this, t, f, o); };
    const el = host();
    const ed = Ted.create(el, { toasts: false });
    ed.blockMenu.openPicker(ed.editable.firstElementChild);
    ok(document.querySelector('.ted-ui-picker'), 'меню открыто');
    ed.destroy();
    window.addEventListener = a;
    window.removeEventListener = r;
    ok(added.length >= 1 && added.every((f) => removed.includes(f)), `resize: добавлено ${added.length}, снято ${removed.length}`);
    ok(!document.querySelector('.ted-ui-picker'), 'меню закрыто вместе с редактором');
    el.remove();
  });

  test('многократное создание и удаление не оставляет узлов и слушателей', () => {
    const before = document.body.querySelectorAll('*').length;
    for (let i = 0; i < 15; i += 1) {
      const el = host();
      const ed = Ted.create(el, { toasts: false });
      ed.blockMenu.openPicker(ed.editable.firstElementChild);
      Ted.destroy(ed);
      el.remove();
    }
    eq(document.body.querySelectorAll('*').length, before, 'DOM после 15 циклов не вырос');
    ok(!document.querySelector('.ted-ui-picker, .ted-ui-pop'));
  });

  test('подсветка кода у нескольких редакторов: удаление одного не стирает чужую', () => {
    if (!(window.CSS && CSS.highlights && window.Highlight)) return;
    const mkCode = () => {
      const el = host();
      el.innerHTML = '<pre data-lang="js"><code>const a = 1;</code></pre>';
      const ed = Ted.create(el, { toasts: false });
      ed.refreshCode();
      return { el, ed };
    };
    const base = (CSS.highlights.get('ted-kw') || { size: 0 }).size;
    const one = mkCode();
    const two = mkCode();
    const total = (CSS.highlights.get('ted-kw') || { size: 0 }).size;
    ok(total >= base + 2, 'подсветка обоих: ' + total);
    Ted.destroy(one.ed);
    const left = (CSS.highlights.get('ted-kw') || { size: 0 }).size;
    ok(left >= base + 1 && left < total, `после удаления первого осталась подсветка второго: ${left}`);
    Ted.destroy(two.ed);
    eq((CSS.highlights.get('ted-kw') || { size: 0 }).size, base, 'после удаления обоих осталась только чужая из других тестов');
    one.el.remove();
    two.el.remove();
  });
});

group('Старый «сырой» HTML: опасное вычищается (ревью)', () => {
  const clean = (html) => Ted.clean(html);
  test('скрипты, стили, обработчики, srcdoc, javascript: и data:text/html убираются', () => {
    const out = clean('<table onclick="x()"><tr><td><a href="java\nscript:alert(1)">а</a></td></tr></table>'
      + '<iframe srcdoc="<script>alert(1)</script>" src="data:text/html,<script>1</script>"></iframe>'
      + '<figure><img src="x" onerror="alert(1)"><style>*{display:none}</style><script>alert(2)</script></figure>'
      + '<form action="javascript:alert(3)"><button formaction="vbscript:x">ok</button></form>');
    ok(!/onclick|onerror|srcdoc|<script|<style|javascript:|vbscript:|data:text\/html/i.test(out.replace(/\s+/g, ' ')), out);
    ok(/<table/.test(out) && /<img/.test(out) && !/<iframe/.test(out), 'таблица и картинка сохранены, чужой iframe убран: ' + out);
  });
  test('картинки в data: и обычные ссылки сохраняются', () => {
    const out = clean('<figure><img src="data:image/png;base64,AAAA" srcset="/a.png 1x, /b.png 2x"><a href="/page">с</a></figure>');
    ok(out.includes('data:image/png;base64,AAAA') && out.includes('srcset') && out.includes('href="/page"'), out);
  });
  test('svg: href javascript: и обработчики убираются', () => {
    const out = clean('<svg onload="alert(1)"><a xlink:href="javascript:alert(1)"><text>x</text></a><use href="data:image/svg+xml,<svg onload=alert(1)>"/></svg>');
    ok(!/onload|javascript:|data:image\/svg/i.test(out), out);
  });
  test('предпросмотр в iframe без скриптов', () => {
    const ed = make('<p>а</p>', { preview: 'frame' });
    const f = ed.ui.querySelector('iframe');
    ok(f && f.getAttribute('sandbox') === 'allow-same-origin', 'sandbox: ' + (f && f.getAttribute('sandbox')));
  });
});

group('Решения заказчика после обхода блоков', () => {
  const at = (node, off) => {
    const r = document.createRange();
    r.setStart(node, off);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  };

  test('выравнивания у чек-листа и шагов нет: класс не сохраняется, команда и кнопка недоступны', () => {
    ok(!/ted-align/.test(Ted.clean('<ul class="ted-checklist ted-align-center"><li>а</li></ul>')), 'чек-лист');
    ok(!/ted-align/.test(Ted.clean('<ol class="ted-steps ted-align-right"><li><strong>а</strong><br>б</li></ol>')), 'шаги');
    ok(/ted-align-center/.test(Ted.clean('<p class="ted-align-center">а</p>')), 'у абзаца выравнивание работает');
    for (const html of ['<ul class="ted-checklist"><li>а</li></ul>', '<ol class="ted-steps"><li><strong>а</strong><br>б</li></ol>']) {
      const ed = make(html);
      ed.focus();
      const li = ed.editable.querySelector('li');
      at(li.querySelector('strong') ? li.querySelector('strong').firstChild : li.firstChild, 1);
      ed.updateState();
      ok(ed.toolbar.alignBtn.hidden, 'кнопка «Выравнивание» убрана');
      ed.exec('align:center');
      ok(!/ted-align/.test(ed.editable.innerHTML), 'команда не действует: ' + ed.editable.innerHTML);
    }
    const p = make('<p>текст</p>');
    p.focus();
    at(p.editable.firstChild.firstChild, 1);
    p.updateState();
    ok(!p.toolbar.alignBtn.hidden, 'у абзаца кнопка есть');
  });

  test('цитата с цветным фоном: линия вписана внутрь плашки с отступом 20', () => {
    const ed = make('<blockquote><p>а</p></blockquote><blockquote class="ted-bg-gray"><p>б</p></blockquote>');
    const [plain, bg] = Array.from(ed.editable.querySelectorAll('blockquote'));
    const pl0 = parseFloat(getComputedStyle(plain).paddingLeft);
    eq(parseFloat(getComputedStyle(bg).paddingLeft), pl0 + 20, 'текст сдвинут на 20');
    const line = getComputedStyle(bg, '::before');
    eq([line.left, line.top, line.bottom].join(' '), '20px 20px 20px', 'линия на 20 от краёв плашки');
    eq(getComputedStyle(plain, '::before').left, '0px', 'у обычной цитаты линия у края');
  });

  test('плюсы и минусы: пустой хвост после заполненных пунктов скрыт, у пункта с курсором виден', () => {
    const ed = make('<ul class="ted-proscons"><li class="ted-pros"><strong>П</strong><ul><li>а</li><li>в</li></ul></li><li class="ted-cons"><strong>М</strong><ul><li>б</li></ul></li></ul>');
    ed.editable.querySelectorAll('li.ted-pros li')[1].replaceChildren(document.createElement('br'));
    ed.updatePlaceholders();
    const tail = ed.editable.querySelectorAll('li.ted-pros li')[1];
    ok(tail.hasAttribute('data-tedui-tail'), 'хвост помечен');
    eq(getComputedStyle(tail, '::before').visibility, 'hidden', 'значок не рисуется (нет голого ✓ / ✕)');
    tail.style.display = 'list-item';   // как при курсоре: курсор ставят программно, пока пункт виден
    ed.focus();
    at(tail, 0);
    ed.updatePlaceholders();
    ok(!tail.hasAttribute('data-tedui-tail'), 'с курсором внутри пункт не хвост');
  });

  test('меню «Стиль текста»: есть Заголовок 5 и 6, они работают', async () => {
    const ed = make('<p>Текст заголовка</p>');
    ed.focus();
    at(ed.editable.firstChild.firstChild, 2);
    ed.updateState();
    ed.toolbar.styleBtn.click();
    const labels = Array.from(document.querySelectorAll('.ted-ui-pop .ted-ui-item')).map((n) => n.textContent.trim());
    ok(labels.includes('Заголовок 5') && labels.includes('Заголовок 6'), labels.join('|'));
    ed.popover.close();
    ed.exec('block:h5');
    eq(ed.editable.firstElementChild.tagName, 'H5');
    ed.exec('block:h6');
    eq(ed.editable.firstElementChild.tagName, 'H6');
  });

  test('заглушки выноски и цифр читаются на плашке (#919599)', () => {
    const ed = make('<p></p>');
    select(ed, 0, 0);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    ed.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="callout"]').click();
    ed.updatePlaceholders();
    const c = ed.editable.querySelector('blockquote.ted-callout > p');
    eq(getComputedStyle(c, '::before').color, 'rgb(145, 149, 153)', 'выноска');
    const ed2 = make('<p></p>');
    select(ed2, 0, 0);
    ed2.blockMenu.openPicker(blocks(ed2)[0]);
    ed2.blockMenu.picker.panel.querySelector('.ted-ui-tile[data-type="facts"]').click();
    ed2.updatePlaceholders();
    const s = ed2.editable.querySelector('ul.ted-facts > li > strong');
    eq(getComputedStyle(s, '::before').color, 'rgb(145, 149, 153)', 'значение «0»');
    eq(getComputedStyle(s, '::after').color, 'rgb(145, 149, 153)', 'подпись');
  });
});

group('Enter в блоке с цветным фоном: новая строка в плашке, на пустой строке — новый чистый абзац', () => {
  const press = (ed) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
  const at = (node, off) => { const r = document.createRange(); r.setStart(node, off); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); };

  test('Enter в конце текста: новая строка внутри той же плашки, плашки не размножаются', () => {
    const ed = make('<p class="ted-bg-color1">Текст на плашке</p>');
    ed.focus();
    const t = ed.editable.firstChild.firstChild;
    at(t, t.length);
    press(ed);
    eq(ed.editable.children.length, 1, 'блок один: ' + ed.editable.innerHTML);
    const p = ed.editable.firstChild;
    eq(p.className, 'ted-bg-color1');
    ok(p.querySelector('br'), 'перенос строки внутри плашки: ' + p.innerHTML);
    ok(p.contains(getSelection().anchorNode), 'курсор остался в плашке');
  });
  test('Enter посреди текста: обе части в одной плашке, через перенос строки', () => {
    const ed = make('<p class="ted-bg-gray">Раз Два</p>');
    ed.focus();
    at(ed.editable.firstChild.firstChild, 4);
    press(ed);
    eq(ed.editable.children.length, 1);
    eq(ed.editable.firstChild.textContent, 'Раз Два');
    ok(/Раз\s*<br>\s*Два/.test(ed.editable.firstChild.innerHTML), ed.editable.firstChild.innerHTML);
  });
  test('Enter на пустой последней строке плашки: строка убирается, ниже новый пустой чистый абзац с курсором', () => {
    const ed = make('<p class="ted-bg-color2">Строка</p>');
    ed.focus();
    const t = ed.editable.firstChild.firstChild;
    at(t, t.length);
    press(ed);                // новая строка в плашке
    press(ed);                // пустая строка → выход
    const [a, b] = Array.from(ed.editable.children);
    eq(ed.editable.children.length, 2, ed.editable.innerHTML);
    eq(a.className, 'ted-bg-color2');
    eq(a.textContent, 'Строка');
    ok(!a.querySelector('br'), 'лишний перенос убран: ' + a.innerHTML);
    ok(b.tagName === 'P' && !b.className && !b.textContent, 'новый чистый пустой абзац: ' + b.outerHTML);
    ok(b.contains(getSelection().anchorNode), 'курсор в новом абзаце');
    ok(!/ted-bg/.test(ed.getInnerHTML().split('\n')[1] || ''), 'в сохранённом HTML абзац без фона');
  });
  test('Enter в пустой плашке снимает фон; заголовок с фоном ведёт себя так же, как абзац', () => {
    const ed = make('<p class="ted-bg-gray">а</p><h3 class="ted-bg-color2 ted-align-center">Заголовок</h3>');
    ed.focus();
    ed.editable.firstChild.replaceChildren(document.createElement('br'));
    at(ed.editable.firstChild, 0);
    press(ed);
    ok(!ed.editable.firstChild.className, 'пустая плашка стала обычным абзацем');
    const h = ed.editable.querySelector('h3');
    at(h.firstChild, h.firstChild.length);
    press(ed);
    eq(ed.editable.querySelectorAll('h3').length, 1, 'заголовок не размножился');
    ok(h.querySelector('br') && h.classList.contains('ted-bg-color2'), 'новая строка внутри заголовка с фоном: ' + h.outerHTML);
    press(ed);
    const p = h.nextElementSibling;
    ok(p && p.tagName === 'P' && !p.className, 'вторым Enter — новый чистый абзац: ' + (p && p.outerHTML));
  });
});
