// Тесты блока «Встраивание» (blocks/embed, этап 5) — прежние tests/embed.test.js, перенесены без изменений.
// Встраивание (этап 6.4, макет block-embed, окно kind=embed): карточка-снимок по ссылке (OpenGraph через сервер CMS)
// и из статей CMS, компактная версия в строку, безопасность, окно настроек, вид.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, html, blocks, Ted } from '../../tests/helpers.js';

const OG = { url: 'https://blog.example.com/spring', title: 'Весенняя коллекция', text: 'Посмотрите первые десять вещей.', image: 'https://blog.example.com/a.jpg', site: 'Simflex Shop' };
const ARTICLES = [{ id: 'a17', title: 'Как выбрать диван', url: '/blog/divan', text: 'Пять вопросов перед покупкой.', site: 'Блог', date: '12 ноября', views: '1.2K', likes: '128' }];
const providers = {
  opengraph: async (url) => { if (/fail/.test(url)) throw new Error('Сайт ответил ошибкой 404'); return { ...OG, url }; },
  articles: { search: async (q) => ARTICLES.filter((a) => a.title.toLowerCase().includes(q.toLowerCase())), get: async (id) => ARTICLES.find((a) => a.id === id) },
};
const pop = () => { const all = document.querySelectorAll('.ted-ui-pop--link'); return all[all.length - 1]; };
const CARD = '<div class="ted-embed"><div class="ted-embed__head"><span class="ted-embed__avatar">SS</span><span class="ted-embed__who"><span class="ted-embed__name">Весенняя коллекция</span><span class="ted-embed__sub">Simflex Shop</span></span></div><p class="ted-embed__text">Посмотрите первые десять вещей.</p><img class="ted-embed__img" src="https://blog.example.com/a.jpg" alt="" loading="lazy"><div class="ted-embed__foot"><a class="ted-embed__open" href="https://blog.example.com/spring" target="_blank" rel="noopener">Открыть</a></div></div>';

async function insertWith(text, opts = providers) {
  const ed = make('<p>до</p>', opts);
  ed.blockMenu.openPicker(blocks(ed)[0]);
  document.querySelector('.ted-ui-tile[data-type="embed"]').click();
  await wait(20);
  const el = ed.editable.querySelector('div.ted-embed');
  const input = el.querySelector('.ted-ui-media__url');
  input.value = text;
  return { ed, el, input };
}

group('Встраивание: разметка и очистка', () => {
  test('сайт: карточка-снимок (шапка, текст, картинка, «Открыть»); повторная очистка не меняет HTML', () => {
    eq(Ted.clean(CARD), CARD);
    eq(Ted.clean(Ted.clean(CARD)), CARD);
  });

  test('компактная версия — одна строка: шапка и «Открыть»; статья CMS — data-ted-article, просмотры и лайки', () => {
    const compact = '<div class="ted-embed ted-embed--compact" data-ted-article="a17"><div class="ted-embed__head"><span class="ted-embed__avatar">БЛ</span><span class="ted-embed__who"><span class="ted-embed__name">Как выбрать диван</span><span class="ted-embed__sub">Блог · 12 ноября</span></span><a class="ted-embed__open" href="/blog/divan">Открыть</a></div></div>';
    eq(Ted.clean(compact), compact);
  });

  test('опасное убирается: javascript:, data:, обработчики, разметка в тексте; без ссылки карточка не сохраняется', () => {
    const out = Ted.clean('<div class="ted-embed" onclick="x" data-ted-article="a b<"><div class="ted-embed__head"><span class="ted-embed__avatar">X</span><span class="ted-embed__who"><span class="ted-embed__name">Т<img src=x onerror=alert(1)></span></span></div><img class="ted-embed__img" src="javascript:alert(1)"><div class="ted-embed__foot"><span class="ted-embed__pill ted-embed__pill--views">1<script>alert(1)</script></span><a class="ted-embed__open" href="https://ok.example/">Открыть</a></div></div>');
    ok(!/onclick|onerror|<script|javascript|data-ted-article="a b/.test(out), out);
    ok(/href="https:\/\/ok\.example\/"/.test(out), out);
    eq(Ted.clean('<div class="ted-embed"><div class="ted-embed__foot"><a class="ted-embed__open" href="javascript:alert(1)">x</a></div></div>'), '');
  });
});

group('Встраивание: правка', () => {
  test('из меню блоков: поле ссылки и «Добавить» (курсор в поле); ссылка → карточка с сервера CMS', async () => {
    const { ed, el, input } = await insertWith('blog.example.com/spring');
    eq(document.activeElement, input, 'курсор в поле');
    eq(el.querySelector('.ted-ui-media__link-go').textContent, 'Добавить');
    eq(html(ed), '<p>до</p>', 'пустой блок не сохраняется');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(20);
    const card = ed.editable.querySelector('div.ted-embed');
    ok(!card.hasAttribute('data-tedui-empty'), 'карточка');
    ok(html(ed).includes('<span class="ted-embed__name">Весенняя коллекция</span>') && html(ed).includes('href="https://blog.example.com/spring"'), html(ed));
    ok(!/data-tedui|ted-ui-media__link|contenteditable/.test(html(ed)), 'служебное не сохраняется');
    ed.exec('undo');
    ok(!/ted-embed__name/.test(html(ed)), 'Undo');
  });

  test('сервер не дал карточку — сообщение, поле не очищается; без провайдера — понятное сообщение', async () => {
    const { ed, el, input } = await insertWith('https://fail.example.com/x');
    const said = [];
    ed.toast = (m) => said.push(m);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(20);
    ok(el.isConnected && el.hasAttribute('data-tedui-empty'), 'блок пустой');
    eq(input.value, 'https://fail.example.com/x');
    ok(!input.disabled, 'поле снова доступно');
    ok(/404/.test(said.join(' ')), said.join(' | '));
    const none = await insertWith('https://a.example.com/', {});
    const said2 = [];
    none.ed.toast = (m) => said2.push(m);
    none.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(20);
    ok(/opengraph/.test(said2.join(' ')), said2.join(' | '));
    void ed;
  });

  test('текст без адреса — статьи CMS списком под полем; выбор даёт карточку статьи (просмотры, лайки, id)', async () => {
    const { ed, input } = await insertWith('диван');
    input.dispatchEvent(new Event('input'));
    await wait(20);
    const item = [...document.querySelectorAll('.ted-ui-pop--anchors .ted-ui-item')].find((x) => /Как выбрать диван/.test(x.textContent));
    ok(item, 'статья в списке');
    item.click();
    await wait(20);
    const out = html(ed);
    ok(out.includes('data-ted-article="a17"') && out.includes('ted-embed__pill--views">1.2K') && out.includes('href="/blog/divan"'), out);
  });

  test('нажатие на карточку — «Настройки встраивания» под блоком: «В одну строку» делает компактную версию', async () => {
    const ed = make(CARD + '<p>после</p>', providers);
    ed.editable.focus();
    const el = ed.editable.querySelector('div.ted-embed');
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(10);
    eq(pop().querySelector('.ted-ui-form__title').textContent, 'Настройки встраивания');
    eq(ed.handle.focused, el, 'кнопки блока у карточки');
    pop().querySelector('.ted-ui-toggle input').click();
    pop().querySelector('.ted-ui-action--primary').click();
    await wait(20);
    ok(/class="ted-embed ted-embed--compact"/.test(html(ed)), html(ed));
    ok(!/ted-embed__img/.test(html(ed)), 'в строке нет картинки');
  });
});

group('Встраивание: вставка ссылки, меню, дублирование (заказчик 17.11)', () => {
  const pasteUrl = (ed, url) => {
    const p = ed.editable.lastElementChild;
    const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
    ed.editable.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    const t = new DataTransfer(); t.setData('text/plain', url);
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true }));
  };

  test('вставленный адрес сразу становится ссылкой; закрыли выбор — остаётся ссылкой', async () => {
    const ed = make('<p><br></p>', providers);
    pasteUrl(ed, 'https://blog.example.com/spring');
    ok(/<a href="https:\/\/blog\.example\.com\/spring"[^>]*>https:\/\/blog\.example\.com\/spring<\/a>/.test(html(ed)), html(ed));
    ok(ed.popover.isOpen && /Как показать ссылку/.test(pop().textContent), 'выбор под ссылкой (окно как «Якорь»)');
    const btns = [...pop().querySelectorAll('.ted-ui-form__footer button')];
    eq(btns.map((b) => b.textContent).join(' | '), 'Встроить карточкой | Оставить ссылкой');
    ok(btns.every((b) => b.offsetHeight >= 32), 'кнопки видны (раньше высота 0)');
    ok(btns.every((b) => b.scrollWidth <= b.clientWidth + 1), 'подписи не обрезаются (заказчик 17.11)');
    const box = pop().getBoundingClientRect();
    ok(btns.every((b) => b.getBoundingClientRect().right <= box.right + 1), 'кнопки внутри окна');
    pop().querySelector('[data-act="close"]').click();
    await wait(10);
    ok(!ed.popover.isOpen && /<a href="https:\/\/blog\.example\.com\/spring"/.test(html(ed)) && !/ted-embed/.test(html(ed)), html(ed));
  });

  test('«Открывать в новой вкладке» в окне после вставки — меняет ссылку сразу; без opengraph — окно «Ссылка» только с выбором вкладки (заказчик 17.11)', async () => {
    const ed = make('<p><br></p>', providers);
    pasteUrl(ed, 'https://blog.example.com/spring');
    const sw = pop().querySelector('.ted-ui-toggle input');
    ok(sw && sw.checked, 'по умолчанию — в новой вкладке (linkBlank)');
    sw.click();
    ok(/<a href="https:\/\/blog\.example\.com\/spring">/.test(html(ed)), 'выключили — без target: ' + html(ed));
    sw.click();
    ok(/<a href="https:\/\/blog\.example\.com\/spring" target="_blank" rel="noopener">/.test(html(ed)), html(ed));
    const plain = make('<p><br></p>');
    pasteUrl(plain, 'https://blog.example.com/spring');
    ok(plain.popover.isOpen && /^Ссылка/.test(pop().textContent), 'окно «Ссылка»');
    eq([...pop().querySelectorAll('.ted-ui-form__footer button')].map((b) => b.textContent).join(' | '), 'Готово');
    ok(pop().querySelector('.ted-ui-toggle input'), 'выбор вкладки');
  });

  test('«Встроить карточкой» — карточка вместо ссылки (появляется плавно), кнопки блока у карточки', async () => {
    const ed = make('<p><br></p>', providers);
    pasteUrl(ed, 'https://blog.example.com/spring');
    [...pop().querySelectorAll('button')].find((b) => b.textContent === 'Встроить карточкой').click();
    await wait(30);
    const card = ed.editable.querySelector('div.ted-embed');
    ok(card && !card.hasAttribute('data-tedui-empty'), 'карточка');
    ok(!/<p><a href/.test(html(ed)) && /ted-embed__name">Весенняя коллекция/.test(html(ed)), html(ed));
    eq(ed.handle.focused, card, 'кнопки блока у новой карточки');
  });

  test('карточка появляется плавно: высота блока и содержимое анимируются (WAAPI)', async () => {
    const ed = make('<p>до</p>', providers);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="embed"]').click();
    await wait(20);
    const row = ed.editable.querySelector('div.ted-embed[data-tedui-empty] .ted-ui-media__link');
    row.querySelector('.ted-ui-media__url').value = 'https://blog.example.com/spring';
    // в прогоне время виртуальное — анимация успевает кончиться; проверяем, что она запущена и с какими кадрами
    const calls = [];
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (frames, opts) { calls.push({ el: this, frames }); return orig.call(this, frames, opts); };
    try {
      row.querySelector('.ted-ui-media__link-go').click();
      await wait(10);
    } finally { Element.prototype.animate = orig; }
    const card = ed.editable.querySelector('div.ted-embed:not([data-tedui-empty])');
    ok(calls.some((c) => c.el === card && c.frames.some((k) => k.height)), 'высота плавно');
    ok(calls.some((c) => c.el.parentElement === card && c.frames[0].opacity === 0), 'содержимое проявляется');
  });

  test('у карточки нет «Превратить в…»; «Дублировать» — такая же карточка, кнопки блока у копии', async () => {
    const ed = make('<p>до</p>' + CARD + '<p>после</p>', providers);
    const card = ed.editable.querySelector('div.ted-embed');
    ed.selectObject(card);
    ed.handle.openMenu(card, document.querySelector('.ted-ui-controls [data-act="grip"]'));
    const items = [...ed.popover.el.querySelectorAll('.ted-ui-item')].map((x) => x.textContent.trim());
    ok(!items.some((t) => /Превратить/.test(t)), items.join(', '));
    [...ed.popover.el.querySelectorAll('.ted-ui-item')].find((x) => /Дублировать/.test(x.textContent)).click();
    await wait(20);
    const all = ed.editable.querySelectorAll('div.ted-embed');
    eq(all.length, 2);
    const plainHTML = (el) => el.outerHTML.replace(/ data-tedui-[a-z-]+="[^"]*"/g, '');
    eq(plainHTML(all[1]), plainHTML(all[0]));
    eq(ed.handle.focused, all[1], 'кнопки у копии');
    eq((html(ed).match(/ted-embed__name/g) || []).length, 2);
  });

  test('копия пустого встраивания — пустая, со своим рабочим полем ссылки', async () => {
    const ed = make('<p>до</p>', providers);
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="embed"]').click();
    await wait(20);
    const empty = ed.editable.querySelector('div.ted-embed[data-tedui-empty]');
    ed.handle.duplicate(empty);
    await wait(20);
    const copies = ed.editable.querySelectorAll('div.ted-embed[data-tedui-empty]');
    eq(copies.length, 2, 'копия тоже пустая');
    eq(copies[1].querySelectorAll('.ted-ui-media__link').length, 1, 'одно поле ссылки');
    const row = copies[1].querySelector('.ted-ui-media__link');
    row.querySelector('.ted-ui-media__url').value = 'https://blog.example.com/spring';
    row.querySelector('.ted-ui-media__link-go').click();
    await wait(30);
    eq(ed.editable.querySelectorAll('div.ted-embed[data-tedui-empty]').length, 1, 'поле копии работает');
  });
});

group('Встраивание: вид', () => {
  test('карточка: рамка 2 #EDF3FA, r16, поля 16; заголовок 16 / 600; картинка 2 : 1; «Открыть» 40, рамка #DADFE5; тёмная — рамка #4D4D4D', () => {
    const ed = make(CARD, {}, { width: 1000 });
    const card = ed.editable.querySelector('div.ted-embed');
    const cs = getComputedStyle(card);
    eq([cs.borderTopWidth, cs.borderTopColor, cs.borderTopLeftRadius, cs.paddingTop].join(' '), '2px rgb(237, 243, 250) 16px 16px');
    const n = getComputedStyle(card.querySelector('.ted-embed__name'));
    eq([n.fontSize, n.fontWeight].join(' '), '16px 600');
    const img = card.querySelector('.ted-embed__img').getBoundingClientRect();
    eq(Math.round(img.width / img.height), 2);
    const o = getComputedStyle(card.querySelector('.ted-embed__open'));
    eq([o.height, o.borderTopColor].join(' '), '40px rgb(218, 223, 229)');
    const pill = make(CARD.replace('<a class', '<span class="ted-embed__pill ted-embed__pill--views">1.2K</span><a class'), {}, { width: 1000 }).editable.querySelector('.ted-embed__pill');
    ok(/path d='M8/.test(getComputedStyle(pill, '::before').maskImage || getComputedStyle(pill, '::before').webkitMaskImage), 'значок глаза на плашке (путь из макета)');
    const dark = make(CARD, {}, { width: 1000, theme: 'dark' });
    eq(getComputedStyle(dark.editable.querySelector('div.ted-embed')).borderTopColor, 'rgb(77, 77, 77)');
  });

  test('телефон (заказчик 17.11): «В одну строку» — «Открыть» под заголовком на всю ширину; пустой блок — «Добавить» под полем на всю ширину', async () => {
    const compact = '<div class="ted-embed ted-embed--compact"><div class="ted-embed__head"><span class="ted-embed__avatar">ХА</span><span class="ted-embed__who"><span class="ted-embed__name">Давай сделаем сайт с помощью дизайн-системы? Ты будешь дизайнить гораздо быстрее</span><span class="ted-embed__sub">Хабр</span></span><a class="ted-embed__open" href="https://habr.com/ru/articles/1041124/" target="_blank" rel="noopener">Открыть</a></div></div>';
    const card = make(compact, {}, { width: 414 }).editable.querySelector('div.ted-embed');
    const head = card.querySelector('.ted-embed__head').getBoundingClientRect();
    const open = card.querySelector('.ted-embed__open').getBoundingClientRect();
    ok(open.top >= card.querySelector('.ted-embed__who').getBoundingClientRect().bottom, 'кнопка под заголовком');
    eq(Math.round(open.width), Math.round(head.width), 'на всю ширину');
    ok(card.querySelector('.ted-embed__name').getBoundingClientRect().width > 250, 'заголовку хватает места');
    const wide = make(compact, {}, { width: 1000 }).editable.querySelector('div.ted-embed');
    ok(Math.abs(wide.querySelector('.ted-embed__open').getBoundingClientRect().top - wide.querySelector('.ted-embed__head').getBoundingClientRect().top) < 2, 'на 1000 — в одну строку');
    const ed = make('<p>до</p>', providers, { width: 414 });
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="embed"]').click();
    await wait(20);
    const row = ed.editable.querySelector('.ted-ui-media__link');
    const input = row.querySelector('.ted-ui-media__url').getBoundingClientRect();
    const go = row.querySelector('.ted-ui-media__link-go').getBoundingClientRect();
    ok(go.top >= input.bottom, '«Добавить» под полем');
    eq(Math.round(go.width), Math.round(input.width), 'кнопка на всю ширину поля');
  });

  test('сайт: последний блок — карточка (и товар, выноска, фон) сохраняет нижний отступ внутри рамки (заказчик 17.11: кнопка лежала на рамке; правило «без отступа у последнего блока» убрано)', () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.style.width = '700px';
    document.body.appendChild(box);
    try {
      for (const last of [
        '<div class="ted-embed ted-embed--compact"><div class="ted-embed__head"><span class="ted-embed__avatar">ХА</span><span class="ted-embed__who"><span class="ted-embed__name">Хабр</span><span class="ted-embed__sub">Хабр</span></span><a class="ted-embed__open" href="https://habr.com/">Открыть</a></div></div>',
        '<div class="ted-product"><span class="ted-product__img"></span><div class="ted-product__text"><p class="ted-product__name">Т</p><p class="ted-product__price"><span class="ted-product__now">1 ₽</span></p></div><a class="ted-product__btn" href="/t">Перейти</a></div>',
        '<blockquote class="ted-callout"><p>Текст</p></blockquote>',
        '<p class="ted-bg-gray">Фон</p>',
      ]) {
        box.innerHTML = '<p>до</p>' + last;
        const el = box.lastElementChild;
        ok(parseFloat(getComputedStyle(el).paddingBottom) >= 12, `${el.className}: снизу ${getComputedStyle(el).paddingBottom}`);
      }
      box.innerHTML = '<p>до</p><p>последний</p>';
      ok(parseFloat(getComputedStyle(box.lastElementChild).marginBottom) > 0, 'у последнего абзаца обычный отступ (правило убрано по решению заказчика; отступ снаружи — этап 0)');
    } finally { box.remove(); }
  });

  test('у каждой кнопки есть нажатие (заказчик 17.11: у «Открыть» не было); «Открыть» — Buttons/alt monochrome: hover #DADFE5, press #D2E2F7', () => {
    const sels = [];
    const walk = (rules) => { for (const r of rules) { if (r.cssRules) walk(r.cssRules); if (r.selectorText) sels.push(r.selectorText); } };
    for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) { /* чужой файл */ } }
    const all = sels.join('\n');
    for (const cls of ['ted-embed__open', 'ted-button__btn', 'ted-product__btn', 'ted-media__source', 'ted-code-copy', 'ted-ui-addauthor', 'ted-ui-action--primary', 'ted-ui-action--gray']) {   // «+ Добавить строку / столбец» таблицы и × окон — общие ted-ui-addauthor и ted-ui-action (прежних классов нет)
      ok(new RegExp(`${cls}[^\\n]*:active`).test(all), `${cls}: нет :active`);
    }
    for (const box of ['ted-ui-gutter', 'ted-ui-controls', 'ted-ui-itemctl', 'ted-ui-media__tile-tools']) {
      ok(new RegExp(`${box}[^\\n]*ted-ui-small:active`).test(all), `${box}: :hover перебивает нажатие маленькой кнопки`);
    }
    const rule = (sel) => { const out = []; const w = (rules) => { for (const r of rules) { if (r.cssRules) w(r.cssRules); if (r.selectorText === sel) out.push(r.style); } }; for (const sh of document.styleSheets) { try { w(sh.cssRules); } catch (e) { /* */ } } return out[out.length - 1]; };
    // нажатие — main/color1/lighter (#D2E2F7); с этапа 4 цвет задан переменной Simflex, поэтому сверяем токен в правиле
    ok(/background: var\(--color-main-color1-lighter, #d2e2f7\)/.test(rule('.ted-content .ted-embed__open:active').cssText), rule('.ted-content .ted-embed__open:active').cssText);
    ok(/background: var\(--ted-embed-open\)/.test(rule('.ted-content .ted-embed__open:hover').cssText), 'hover — заливка gray/light, как рамка');
  });
});

// ---- блок полностью в папке (отвязка ядра, 21.11): ядро и медиа спрашивают реестр ----
group('Встраивание: точки подключения реестра', () => {
  const pasteUrl = (ed, url) => {
    const p = ed.editable.lastElementChild;
    const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
    ed.editable.focus(); getSelection().removeAllRanges(); getSelection().addRange(r);
    const t = new DataTransfer(); t.setData('text/plain', url);
    ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true }));
  };
  const cardBtn = () => [...document.querySelectorAll('.ted-ui-pop--link button')].some((b) => b.textContent === 'Встроить карточкой');

  test('editorUi: editor.embeds в общем списке blockUis', () => {
    const ed = make(CARD, providers);
    ok(ed.embeds && ed.blockUis.includes(ed.embeds));
    ed.destroy();
  });

  test('fromLink / canFromLink: без opengraph и в наборе без встраивания «Встроить карточкой» не предлагается', async () => {
    for (const opts of [{}, { ...providers, blocks: ['p', 'h2'] }]) {
      const ed = make('<p><br></p>', opts);
      pasteUrl(ed, 'https://blog.example.com/spring');
      await wait(10);
      ok(!cardBtn(), JSON.stringify(Object.keys(opts)));
      ed.popover.close();
      ed.destroy();
    }
  });

  test('toText: в наборе без встраивания — ссылка с заголовком; пустой блок из вставки не сохраняется; последним — строка для курсора', () => {
    eq(Ted.clean(CARD, { blocks: ['p'] }).replace(/>\s+</g, '><'), '<p><a href="https://blog.example.com/spring">Весенняя коллекция</a></p>');
    eq(Ted.clean('<div class="ted-embed" data-tedui-empty=""></div><p>x</p>'), '<p>x</p>');
    const ed = make(CARD, providers);
    eq(blocks(ed).map((b) => b.tagName).join(','), 'DIV,P');
    ok(ed.editable.querySelector('div.ted-embed span.ted-embed__name'), 'span карточки не вычищены как мусор склейки');
    ed.destroy();
  });
});
