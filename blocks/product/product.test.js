// Тесты блока «Товар» (blocks/product, этап 5) — прежние tests/product.test.js, перенесены без изменений.
// Товар (этап 6.5, макет block-product, окно kind=product): каталог CMS и ручной режим, скидка, безопасность, событие корзины, вид.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { make, html, blocks, Ted } from '../../tests/helpers.js';
import { cleanByAllowlist } from '../../src/core/allowlist.js';

const CAT = [{ id: 'p5', name: 'Наушники Studio 5', sku: 'ST-5', price: 12900, oldPrice: 16900, image: '/uf/images/studio5.webp', url: '/catalog/studio-5/' }];
const products = { search: async (q) => CAT.filter((p) => (p.name + p.sku).toLowerCase().includes(q.toLowerCase())), get: async (id) => CAT.find((p) => p.id === id) };
const pop = () => { const all = document.querySelectorAll('.ted-ui-pop--link'); return all[all.length - 1]; };
const SAVED = '<div class="ted-product" data-ted-product="p5"><img class="ted-product__img" src="/uf/images/studio5.webp" alt=""><div class="ted-product__text"><p class="ted-product__name">Наушники Studio 5</p><p class="ted-product__price"><span class="ted-product__now">12 900 ₽</span><s class="ted-product__old">16 900 ₽</s></p></div><a class="ted-product__btn" href="/catalog/studio-5/" data-ted-cart="p5">В корзину</a></div>';
const MANUAL = '<div class="ted-product"><span class="ted-product__img"></span><div class="ted-product__text"><p class="ted-product__name">Коврик</p><p class="ted-product__price"><span class="ted-product__now">990 ₽</span></p></div><a class="ted-product__btn" href="https://shop.example.com/k" target="_blank" rel="noopener">Перейти</a></div>';

group('Товар: разметка и очистка', () => {
  test('из каталога: «В корзину» с data-ted-cart и ссылкой на товар, старая цена зачёркнута; повторная очистка не меняет HTML', () => {
    eq(Ted.clean(SAVED), SAVED);
    eq(Ted.clean(Ted.clean(SAVED)), SAVED);
  });

  test('вручную: «Перейти» по ссылке; без скидки старой цены нет (старая не выше новой)', () => {
    eq(Ted.clean(MANUAL), MANUAL);
    const noDisc = Ted.clean(MANUAL.replace('<span class="ted-product__now">990 ₽</span>', '<span class="ted-product__now">990 ₽</span><s class="ted-product__old">500 ₽</s>'));
    ok(!/ted-product__old/.test(noDisc), noDisc);
  });

  test('опасное убирается: javascript:, обработчики, разметка в названии, чужие атрибуты; пустой товар не сохраняется', () => {
    const out = Ted.clean('<div class="ted-product" onclick="x" data-ted-product="p 5"><img class="ted-product__img" src="javascript:alert(1)" onerror="x"><div class="ted-product__text"><p class="ted-product__name">Т<script>alert(1)</script></p><p class="ted-product__price"><span class="ted-product__now">1 000 ₽<img src=x onerror=alert(1)></span></p></div><a class="ted-product__btn" href="javascript:alert(1)">x</a></div>');
    ok(!/onclick|onerror|script|javascript|data-ted-product="p 5/.test(out), out);
    eq(Ted.clean('<div class="ted-product"><div class="ted-product__text"><p class="ted-product__name"></p></div></div>'), '');
  });
});

group('Товар: правка', () => {
  test('из меню блоков: заглушки «Выберите товар», «0 ₽» и сразу «Настройки товара»; поиск по каталогу и выбор', async () => {
    const ed = make('<p>до</p>', { products });
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="product"]').click();
    await wait(20);
    const el = ed.editable.querySelector('div.ted-product');
    ok(el.hasAttribute('data-tedui-empty'));
    eq(getComputedStyle(el.querySelector('.ted-product__name'), '::before').content, '"Выберите товар"');
    eq(getComputedStyle(el.querySelector('.ted-product__now'), '::before').content, '"0\u00a0₽"');
    eq(html(ed), '<p>до</p>', 'пустой товар не сохраняется');
    eq(el.querySelector('.ted-product__btn').textContent, 'В корзину', 'пустой — как в макете');
    eq(pop().querySelector('.ted-ui-form__title').textContent, 'Настройки товара');
    const search = pop().querySelector('input[aria-label="Товар"]');
    search.value = 'st-5';
    search.dispatchEvent(new Event('input'));
    await wait(20);
    const item = [...document.querySelectorAll('.ted-ui-pop--anchors .ted-ui-item')].find((x) => /Studio 5/.test(x.textContent));
    ok(item, 'товар в списке (поиск по артикулу)');
    item.click();
    await wait(20);
    pop().querySelector('.ted-ui-action--primary').click();
    await wait(20);
    eq(html(ed), '<p>до</p>\n' + SAVED);
    ed.exec('undo');
    ok(!/Studio/.test(html(ed)), 'Undo');
  });

  test('ручной товар правится в карточке (22.11): название, цена, старая цена — поля в карточке; в окне — только ссылка → «Перейти»', async () => {
    const ed = make('<p>до</p>');
    ed.blockMenu.openPicker(blocks(ed)[0]);
    document.querySelector('.ted-ui-tile[data-type="product"]').click();
    await wait(20);
    const el = ed.editable.querySelector('div.ted-product');
    ok(!ed.popover.isOpen, 'без каталога окно не открывается');
    const f = (label) => el.querySelector(`.ted-ui-prodfield[aria-label="${label}"]`);
    ok(f('Название') && f('Цена') && f('Старая цена'), 'поля в карточке');
    eq(document.activeElement, f('Название'), 'курсор в названии');
    const type = (label, val) => { const i = f(label); i.value = val; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); };
    type('Название', 'Коврик');
    type('Цена', '990');
    type('Старая цена', '1490');
    eq(f('Цена').value, '990 ₽', 'цена в виде «990 ₽»');
    el.querySelector('a.ted-product__btn').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(10);
    const inputs = [...pop().querySelectorAll('input.ted-ui-input')].filter((i) => !i.closest('[hidden]'));
    eq(inputs.map((i) => i.getAttribute('aria-label')).join(','), 'Ссылка', 'в окне только ссылка');
    inputs[0].value = 'https://shop.example.com/k';
    pop().querySelector('.ted-ui-action--primary').click();
    await wait(20);
    ok(html(ed).includes('<p class="ted-product__name">Коврик</p><p class="ted-product__price"><span class="ted-product__now">990 ₽</span><s class="ted-product__old">1 490 ₽</s></p></div><a class="ted-product__btn" href="https://shop.example.com/k" target="_blank" rel="noopener">Перейти</a>'), html(ed));
    ok(!/prodfield|data-tedui/.test(html(ed)), 'поля правки не сохраняются');
  });

  test('карточка без названия и цены не сохраняется; Enter в последнем поле — абзац под блоком', async () => {
    const ed = make(MANUAL + '<p>после</p>');
    ed.updateState();
    const el = ed.editable.querySelector('div.ted-product');
    for (const label of ['Название', 'Цена', 'Старая цена']) {
      const i = el.querySelector(`.ted-ui-prodfield[aria-label="${label}"]`);
      i.value = '';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ok(!/ted-product/.test(html(ed)), 'пустая карточка не сохраняется: ' + html(ed));
    const last = el.querySelector('.ted-ui-prodfield[aria-label="Старая цена"]');
    last.focus();
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(10);
    const next = el.nextElementSibling;
    ok(next && next.tagName === 'P' && (next.contains(getSelection().anchorNode) || getSelection().anchorNode === next), 'курсор в абзаце под блоком');
  });
});

group('Товар: сайт и вид', () => {
  test('320: длинное слово в названии переносится, карточка не шире колонки (найдено обходом)', () => {
    const ed = make(MANUAL.replace('Коврик', 'Беспроводные наушники Studio 5 с шумоподавлением'), {}, { width: 320 });
    const col = ed.editable.getBoundingClientRect();
    for (const el of ed.editable.querySelectorAll('div.ted-product *')) ok(el.getBoundingClientRect().right <= col.right + 1, el.className);
  });

  test('content.js: «В корзину» шлёт ted:add-to-cart с id; preventDefault у CMS отменяет переход', () => {
    if (!window.TedContent) return;
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.innerHTML = Ted.clean(SAVED);
    document.body.appendChild(box);
    window.TedContent.mount(box);
    let got = null;
    box.addEventListener('ted:add-to-cart', (e) => { got = e.detail.id; e.preventDefault(); });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    box.querySelector('.ted-product__btn').dispatchEvent(click);
    eq(got, 'p5');
    ok(click.defaultPrevented, 'переход отменён');
    box.remove();
  });

  test('вид: рамка 2 #EDF3FA r16, картинка 96 r12, название 16 / 700, цена 20 / 600, старая #919599 зачёркнута; 414 — кнопка под текстом на всю ширину', () => {
    const ed = make(SAVED, {}, { width: 1000 });
    const el = ed.editable.querySelector('div.ted-product');
    const cs = getComputedStyle(el);
    eq([cs.borderTopWidth, cs.borderTopColor, cs.borderTopLeftRadius, cs.paddingRight].join(' '), '2px rgb(237, 243, 250) 16px 32px');
    eq(getComputedStyle(el.querySelector('.ted-product__img')).width, '96px');
    eq(getComputedStyle(el.querySelector('.ted-product__name')).fontWeight, '700');
    eq(getComputedStyle(el.querySelector('.ted-product__now')).fontSize, '20px');
    const o = getComputedStyle(el.querySelector('.ted-product__old'));
    ok(o.textDecorationLine.includes('line-through') && o.color === 'rgb(145, 149, 153)');
    const phone = make(SAVED, {}, { width: 414 }).editable.querySelector('div.ted-product');
    const b = phone.querySelector('.ted-product__btn').getBoundingClientRect();
    ok(b.top >= phone.querySelector('.ted-product__text').getBoundingClientRect().bottom, 'кнопка под текстом');
    eq(Math.round(b.width), Math.round(phone.getBoundingClientRect().width - 32 - 4));
  });
});

// ---- блок полностью в папке (отвязка ядра, 21.11): ядро спрашивает реестр ----
group('Товар: точки подключения реестра', () => {
  const CARD = '<div class="ted-product" data-ted-product="p1"><div class="ted-product__text"><p class="ted-product__name">Наушники</p><p class="ted-product__price"><span class="ted-product__now">12 900 ₽</span></p></div><a class="ted-product__btn" href="/p/1" data-ted-cart="p1">В корзину</a></div>';

  test('editorUi: editor.products в общем списке blockUis; последним — строка для курсора', () => {
    const ed = make(CARD);
    ok(ed.products && ed.blockUis.includes(ed.products));
    eq(blocks(ed).map((b) => b.tagName).join(','), 'DIV,P');
    ed.destroy();
  });

  test('ids (block.json): id товара и корзины CMS — только латиница, цифры, _ и -; то же правило у id статьи встраивания', () => {
    // белый список (общий с сервером — TedSanitizer, php/test-sanitize.php проверяет то же): атрибут из block.json → html, правило — из ids
    const box = document.createElement('div');
    box.innerHTML = '<p><a href="/x" data-ted-cart="sku-1_A">a</a> <a href="/y" data-ted-cart="x y">b</a></p><div data-ted-product="p 1"></div>';
    cleanByAllowlist(box);
    const out = box.innerHTML;
    ok(out.includes('data-ted-cart="sku-1_A"') && out.split('data-ted-cart').length === 2 && !out.includes('data-ted-product'), out);
    ok(Ted.clean(CARD).includes('data-ted-product="p1"'), 'верный id товара сохраняется');
  });

  test('toText: в наборе без товара — «Название — цена» ссылкой на товар', () => {
    eq(Ted.clean(CARD, { blocks: ['p'] }).replace(/>\s+</g, '><'), '<p><a href="/p/1">Наушники — 12 900 ₽</a></p>');
  });
});
