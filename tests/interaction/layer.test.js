// Слой взаимодействия (этап 0): рамка, кнопки блока, ручка при наведении, пустые блоки, меню — одинаково у всех блоков.
import { group, test, eq, ok, wait } from '../harness.js';
import { make } from '../helpers.js';
import { rect, NARROW, WIDE, MENU_TYPES, blockSamples, insertBlock, focusBlock, label, frameOf, outside, dragBy, cancelDrag } from './samples.js';
import { frameKind } from '../../src/ui/handle.js';


group('Слой взаимодействия: рамка', () => {
  test('выбранный блок (открыто меню): подложка 8 вокруг всего блока — у каждого блока одинаково, на 364 и 1000', async () => {
    const problems = [];
    for (const width of [NARROW, WIDE]) {
      for (const html of await blockSamples()) {
        const ed = make('<p>до</p>' + html + '<p>после</p>', {}, { width });
        const el = ed.editable.children[1];
        ed.handle.select(el);
        const f = frameOf(el);
        if (!f) { problems.push(`${width} ${label(el)}: нет подложки`); ed.destroy(); continue; }
        if (!el.matches('pre, hr') && f.inset !== '-8px -8px -8px -8px') problems.push(`${width} ${label(el)}: поля ${f.inset}`);
        const out = outside(el, f);
        if (out) problems.push(`${width} ${label(el)}: вне подложки ${out}`);
        ed.destroy();
      }
    }
    eq(problems.join('\n'), '');
  });

  test('перетаскивание: рамка 2 main/color1/light (с прозрачностью 50 % и свечением shadows/primary/xs) на 8 вокруг блока, скругление 12; своё скругление блока не меняется', async () => {
    const problems = [];
    for (const html of await blockSamples()) {
      const ed = make('<p>до</p>' + html + '<p>после</p>', {}, { width: WIDE });
      const el = ed.editable.children[1];
      const radius = getComputedStyle(el).borderTopLeftRadius;
      el.setAttribute('data-tedui-drag', '');
      frameKind(el, true);   // как при настоящем перетаскивании: у блоков с outline (линия) — рамка обводкой
      document.getAnimations().forEach((x) => x.finish());   // у кода и линии рамка-тень появляется плавно
      const f = frameOf(el);
      if (!el.matches('pre, hr')) {
        const a = getComputedStyle(el, '::after');
        if (f.inset !== '-8px -8px -8px -8px' || a.borderTopLeftRadius !== '12px' || !/0px 0px 0px 2px inset/.test(a.boxShadow) || !/0px 0px 4px 1px/.test(a.boxShadow)) problems.push(`${label(el)}: ${f.inset} r${a.borderTopLeftRadius} ${a.boxShadow}`);
      } else {
        const sh = getComputedStyle(el).boxShadow;
        if (!/0px 0px 0px 8px/.test(sh) || !/0px 0px 4px 9px/.test(sh)) problems.push(`${label(el)}: рамка тенью ${sh}`);
      }
      if (getComputedStyle(el).borderTopLeftRadius !== radius) problems.push(`${label(el)}: скругление блока ${radius} → ${getComputedStyle(el).borderTopLeftRadius}`);
      const out = outside(el, f);
      if (out) problems.push(`${label(el)}: вне рамки ${out}`);
      ed.destroy();
    }
    eq(problems.join('\n'), '');
  });

  test('в стилях нет рамок по видам блоков: --hl-top / --hl-bottom и списков исключений', () => {
    let css = '';
    for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) css += r.cssText + '\n'; } catch (e) { /* чужой файл */ } }
    ok(!/--hl-top|--hl-bottom/.test(css), 'подгонка рамки по видам блоков');
    ok(!/ted-ui-pop--media|ted-ui-media__settings/.test(css), 'своё окно выбора у медиа');
  });
});

/** Место блока: верх от редактора и свои отступы. Высота может меняться — у содержания и вкладок в правке свои элементы. */
const place = (el) => { const cs = getComputedStyle(el); return `верх ${Math.round(rect(el).top - rect(el.closest('.ted-ui')).top)}, отступы ${cs.marginTop} ${cs.paddingTop} ${cs.paddingLeft}`; };

group('Слой взаимодействия: кнопки блока', () => {
  test('1000: ⠿ 🗑 слева от блока у его верха, снаружи рамки; у блока ничего не сдвигается', async () => {
    const problems = [];
    for (const html of await blockSamples()) {
      const ed = make('<p>до</p>' + html + '<p>после</p>', {}, { width: WIDE });
      const el = ed.editable.children[1];
      ed.updateState();
      const before = place(el);
      focusBlock(ed, el);
      if (ed.handle.focused !== el) { problems.push(`${label(el)}: нет кнопок`); ed.destroy(); continue; }
      const c = rect(ed.handle.controls);
      const b = rect(el);
      if (place(el) !== before) problems.push(`${label(el)}: блок сдвинулся при фокусе (${before} → ${place(el)})`);
      if (c.right > b.left - 8 + 1) problems.push(`${label(el)}: кнопки не слева снаружи рамки (${Math.round(c.right)} / ${Math.round(b.left)})`);
      if (Math.abs(c.top - b.top) > 1) problems.push(`${label(el)}: кнопки не у верха блока (${Math.round(c.top)} / ${Math.round(b.top)})`);
      ed.destroy();
    }
    eq(problems.join('\n'), '');
  });

  test('1000, 768: от ⠿ 🗑 у выбранного блока и от ⠿ при наведении (и у пустого блока) до блока одинаково — 12; «+» и ⠿ вплотную (заказчик 19.11)', () => {
    const problems = [];
    for (const width of [WIDE, 768]) {
      const ed = make('<p>Текст</p><h2>Заголовок</h2>', {}, { width });
      const [p, h2] = ed.editable.children;
      const empty = document.createElement('p');   // пустая строка (при загрузке пустые строки убираются)
      empty.innerHTML = '<br>';
      p.after(empty);
      for (const el of [p, h2]) {
        focusBlock(ed, el);
        const gap = rect(el).left - rect(ed.handle.controls).right;   // рамка кнопок видна всегда
        if (Math.abs(gap - 12) > 0.5) problems.push(`${width} ${label(el)}: ⠿ 🗑 в ${gap} от блока`);
      }
      ed.handle.setFocused(null);   // у выбранного блока ручки при наведении нет
      if (getComputedStyle(ed.handle.gutter).columnGap !== '0px') problems.push(`${width}: между «+» и ⠿ ${getComputedStyle(ed.handle.gutter).columnGap}`);
      for (const el of [empty, p, h2]) {
        ed.handle.showGutter(el);
        const gap = rect(el).left - rect(ed.handle.gutterGrip).right;   // у ⠿ при наведении и перетаскивании видна подложка кнопки
        if (Math.abs(gap - 12) > 0.5) problems.push(`${width} ${label(el)}${el === empty ? ' (пустой)' : ''}: ⠿ при наведении в ${gap} от блока`);
      }
      ed.destroy();
    }
    eq(problems.join('\n'), '');
  });

  test('364: строка ⠿ 🗑 над рамкой справа, поверх, без отступа (блок не сдвигается), выше панели', async () => {
    const problems = [];
    for (const html of await blockSamples()) {
      const ed = make('<p>до</p>' + html + '<p>после</p>', {}, { width: NARROW });
      const el = ed.editable.children[1];
      ed.updateState();
      const before = place(el);
      focusBlock(ed, el);
      if (ed.handle.focused !== el) { problems.push(`${label(el)}: нет кнопок`); ed.destroy(); continue; }
      const c = rect(ed.handle.controls);
      const b = rect(el);
      if (place(el) !== before) problems.push(`${label(el)}: блок сдвинулся (${before} → ${place(el)})`);
      if (c.bottom > b.top - 8 + 0.5) problems.push(`${label(el)}: кнопки задевают рамку (${Math.round(c.bottom)} / ${Math.round(b.top - 8)})`);
      if (Math.abs(c.right - b.right) > 1) problems.push(`${label(el)}: кнопки не у правого края`);
      ed.destroy();
    }
    eq(problems.join('\n'), '');
    const ed = make('<p>Текст</p>', {}, { width: NARROW });
    focusBlock(ed, ed.editable.firstElementChild);
    ok(parseInt(getComputedStyle(ed.handle.controls).zIndex, 10) > parseInt(getComputedStyle(ed.ui.querySelector('.ted-ui-toolbar')).zIndex, 10), 'кнопки выше панели');
    const btn = ed.ui.querySelector('.ted-ui-toolbar button');
    btn.setAttribute('aria-expanded', 'true');
    eq(getComputedStyle(ed.handle.controls).pointerEvents, 'none', 'открыто меню панели — кнопки блока скрыты');
    btn.removeAttribute('aria-expanded');
    ed.destroy();
  });
});

group('Слой взаимодействия: шапка редактора', () => {
  test('высота шапки не меняется, какой бы блок ни был под курсором (кнопки помещаются или прокручиваются): 56 на 364, 57 на 600 и 1000', async () => {
    const problems = [];
    for (const [width, want] of [[NARROW, 56], [600, 57], [WIDE, 57]]) {
      for (const html of await blockSamples()) {
        const ed = make('<p>до</p>' + html + '<p>после</p>', {}, { width });
        const el = ed.editable.children[1];
        const bar = ed.ui.querySelector('.ted-ui-toolbar');
        for (const [state, act] of [['без курсора', () => ed.updateState()], ['курсор в блоке', () => focusBlock(ed, el)]]) {
          act();
          document.getAnimations().forEach((a) => a.finish());
          const h = rect(bar).height;
          const scroll = bar.scrollWidth > bar.clientWidth + 1;
          if (Math.abs(h - want) > 0.5) problems.push(`${width} ${label(el)}, ${state}: высота ${h} вместо ${want}`);
          if (scroll !== bar.classList.contains('is-scroll')) problems.push(`${width} ${label(el)}, ${state}: is-scroll ${bar.classList.contains('is-scroll')}, а прокрутка ${scroll}`);
        }
        ed.destroy();
      }
    }
    eq(problems.join('\n'), '');
  });

  test('у каждой кнопки шапки, которая открывает список, есть стрелка; список открыт — стрелка плавно смотрит вверх, закрыт — вниз (заказчик 19.11)', () => {
    const problems = [];
    const ed = make('<p>Текст</p>', {}, { width: WIDE });
    const bar = ed.ui.querySelector('.ted-ui-toolbar');
    for (const variant of ['default', 'text', 'line']) {
      ed.toolbar.setVariant(variant);
      for (const btn of bar.querySelectorAll('.ted-ui-btn')) {
        if (!btn.getClientRects().length) continue;
        const name = btn.getAttribute('aria-label');
        btn.click();
        const pop = ed.popover.isOpen && ed.popover.anchor === btn ? ed.popover.el : null;
        const list = pop && pop.querySelectorAll('.ted-ui-item').length > 1 && !pop.classList.contains('ted-ui-pop--help');
        const arrow = btn.querySelector('.ted-ui-btn__chevron');
        if (list && !arrow) problems.push(`${variant} «${name}»: список без стрелки`);
        if (arrow) {
          if (!list) problems.push(`${variant} «${name}»: стрелка, а списка нет`);
          if (!arrow.getAnimations().length) problems.push(variant + ' «' + name + '»: поворот без анимации');
          document.getAnimations().forEach((x) => x.finish());
          const up = getComputedStyle(arrow).transform;
          if (!/matrix\(-1, .*-1, 0, 0\)/.test(up)) problems.push(`${variant} «${name}»: открыт — стрелка не вверх (${up})`);
        }
        ed.popover.close();
        ed.subPopover.close();
        document.getAnimations().forEach((x) => x.finish());
        if (arrow && getComputedStyle(arrow).transform !== 'none') problems.push(`${variant} «${name}»: закрыт — стрелка не вниз`);
      }
    }
    ed.destroy();
    eq(problems.join('\n'), '');
  });

  test('кнопки шапки по центру колонки текста, когда помещаются (1000, 860)', () => {
    const problems = [];
    for (const width of [WIDE, 860]) {
      for (const variant of ['default', 'text', 'line']) {
        const ed = make('<p>Текст</p>', {}, { width });
        ed.toolbar.setVariant(variant);
        document.getAnimations().forEach((a) => a.finish());
        const bar = ed.ui.querySelector('.ted-ui-toolbar');
        const kids = [...bar.children].filter((x) => x.getClientRects().length);
        const mid = (rect(kids[0]).left + rect(kids[kids.length - 1]).right) / 2;
        const col = rect(ed.editable);
        if (bar.scrollWidth <= bar.clientWidth + 1 && Math.abs(mid - (col.left + col.right) / 2) > 0.5) problems.push(`${width} ${variant}: центр кнопок ${mid}, колонки ${(col.left + col.right) / 2}`);
        ed.destroy();
      }
    }
    eq(problems.join('\n'), '');
  });
});

group('Слой взаимодействия: пустые блоки и ручка при наведении', () => {
  test('любой блок, и пустой (только что вставленный, с заглушками), и пустая строка: есть ⠿ 🗑 и ⠿ при наведении — пустой блок тоже перетаскивается (заказчик 17.11, 19.11)', async () => {
    const problems = [];
    for (const t of MENU_TYPES) {
      const ed = make('<p>до</p><p><br></p>', {}, { width: WIDE });
      const el = insertBlock(ed, t);
      await wait(10);
      if (!el) { problems.push(`${t}: не вставлен`); ed.destroy(); continue; }
      ed.handle.showGutter(el);
      if (ed.handle.gutterGrip.hidden) problems.push(`${t}: нет ⠿ при наведении`);
      ed.handle.hideGutter();
      focusBlock(ed, el);
      if (ed.handle.focused !== el) problems.push(`${t}: нет ⠿ 🗑 у блока`);
      ed.destroy();
    }
    const ed = make('<p>до</p><p><br></p><p>после</p>', {}, { width: WIDE });
    const empty = ed.editable.children[1];
    focusBlock(ed, empty);
    if (ed.handle.focused !== empty) problems.push('пустая строка: нет ⠿ 🗑');
    dragBy(ed.handle.ctrlGrip, 40);
    if (!empty.hasAttribute('data-tedui-drag')) problems.push('пустая строка не тащится');
    cancelDrag();
    ed.destroy();
    eq(problems.join('\n'), '');
  });

  test('ручка при наведении: в промежутке между блоками остаётся у верхнего блока (отступ между блоками снаружи блока)', () => {
    const ed = make('<p>Первый</p><p>Второй</p>', {}, { width: WIDE });
    const [a, b] = ed.editable.children;
    const gap = (rect(a).bottom + rect(b).top) / 2;
    eq(ed.handle.blockAtY(gap), a, 'середина промежутка — верхний блок');
    eq(ed.handle.blockAtY(rect(b).top + 1), b);
    ed.destroy();
  });
});

group('Слой взаимодействия: только общие кнопки и подсказки (дубли убраны 19.11)', () => {
  test('в стилях нет своих кнопок: ted-ui-iconbtn, ted-ui-tableadd__btn; кнопка ted-ui-action описана один раз', () => {
    let css = '';
    for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) css += r.cssText + '\n'; } catch (e) { /* чужой файл */ } }
    ok(!/ted-ui-iconbtn|ted-ui-tableadd__btn/.test(css), 'остались свои кнопки');
    eq((css.match(/(^|\n)\.ted-ui-action \{/g) || []).length, 0, 'второе описание общей кнопки');
  });

  test('шапка кода: подсказки общие (с клавишами), не браузерные; язык и копирование работают', async () => {
    const ed = make('<pre><code>let a = 1;</code></pre><p>после</p>', {}, { width: WIDE });
    const pre = ed.editable.querySelector('pre');
    focusBlock(ed, pre);
    ed.handle.syncCodeHead();
    const { codeLang, codeCopy } = ed.handle;
    ok(!ed.ui.querySelector('[title]:not(iframe)'), 'подсказка браузера (title): ' + (ed.ui.querySelector('[title]:not(iframe)')?.outerHTML || '').slice(0, 80));
    eq(codeLang.getAttribute('data-tip'), 'Язык кода');
    ed.tooltip.show(codeLang);
    ok(/Язык кода/.test(ed.tooltip.el.textContent) && ed.tooltip.el.querySelector('kbd'), 'общая подсказка с клавишами: ' + ed.tooltip.el.textContent);
    ed.tooltip.hide();
    codeLang.click();
    ok(ed.popover.isOpen, 'язык: открылся список');
    ed.popover.close();
    eq(codeCopy.getAttribute('data-tip'), 'Копировать код');
    ed.destroy();
  });

  test('окно «Все блоки»: крестик — общая кнопка Buttons/main secondary s (40 × 40), закрывает окно', () => {
    const ed = make('<p>Текст</p>', {}, { width: WIDE });
    ed.blockMenu.openPicker(ed.editable.firstElementChild);
    const btn = ed.blockMenu.picker && ed.blockMenu.picker.panel.querySelector('[aria-label="Закрыть"]');
    ok(btn, 'есть крестик');
    ok(btn.matches('.ted-ui-action.ted-ui-action--gray.ted-ui-action--icon.ted-ui-action--s'), 'класс ' + btn.className);
    eq(`${rect(btn).width}×${rect(btn).height}`, '40×40');
    btn.click();
    ok(!ed.blockMenu.picker, 'окно закрылось');
    ed.destroy();
  });

  test('таблица: «+ Добавить строку / столбец» — общая «+ Добавить …» (как «Добавить автора»), добавляет строку и столбец', async () => {
    const ed = make('<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="2"><thead><tr><th>А</th><th>Б</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div><figcaption>Подпись</figcaption></figure><p>после</p>', {}, { width: WIDE });
    const fig = ed.editable.querySelector('figure.ted-table');
    focusBlock(ed, fig.querySelector('td'));
    await wait(50);
    const btns = [...ed.ui.querySelectorAll('.ted-ui-tableadd button')];
    eq(btns.map((b) => b.className).join(', '), 'ted-ui-addauthor, ted-ui-addauthor');
    const author = getComputedStyle(btns[0]);
    eq(`${author.height} ${author.borderRadius} ${author.fontWeight} ${author.fontSize}`, '40px 12px 600 14px');
    const rows = fig.querySelectorAll('tr').length;
    const cols = fig.querySelector('tr').children.length;
    btns.find((b) => /строку/.test(b.textContent)).click();
    eq(fig.querySelectorAll('tr').length, rows + 1, 'строка добавлена');
    focusBlock(ed, fig.querySelector('td'));
    await wait(50);
    [...ed.ui.querySelectorAll('.ted-ui-tableadd button')].find((b) => /столбец/.test(b.textContent)).click();
    eq(fig.querySelector('tr').children.length, cols + 1, 'столбец добавлен');
    ed.destroy();
  });
});

group('Слой взаимодействия: «Помощь»', () => {
  test('горячие клавиши на месте, ниже — инструкция из макета: 4 шага, текст и картинка интерфейса в своей теме (заказчик 19.11)', async () => {
    for (const theme of ['light', 'dark']) {
      const ed = make('<p>Текст</p>', { theme }, { width: WIDE });
      ed.toolbar.openHelp();
      const box = ed.popover.el;
      ok(box && box.classList.contains('ted-ui-pop--help'), 'окно «Помощь»');
      const titles = [...box.querySelectorAll('.ted-ui-form__title')].map((t) => t.textContent);
      eq(titles.join(' | '), 'Горячие клавиши | Как работать с редактором | Статья с помощью нейросети', 'горячие клавиши первыми, инструкция ниже, затем нейросети (22.11)');
      ok(box.querySelectorAll('.ted-ui-help__row kbd').length >= 10, 'горячие клавиши не убраны');
      const steps = [...box.querySelectorAll('.ted-ui-help__step')].filter((s) => s.querySelector('.ted-ui-help__shot'));
      eq(steps.map((s) => s.querySelector('.ted-ui-help__text').textContent).join('\n'), [
        'Добавить блок: нажмите «/» в пустой строке или «+» слева.',
        'Все блоки с примерами: кнопка «Все блоки» на панели.',
        'Панель сверху меняется под выбранный блок. Выделите текст, чтобы его оформить.',
        'Поменять порядок: перетащите блок за ручку. Клик по ручке открывает меню с удалением.',
      ].join('\n'), 'тексты шагов — как в макете');
      steps.forEach((s, i) => {
        const shot = getComputedStyle(s.querySelector('.ted-ui-help__shot'));
        ok(shot.backgroundImage.includes(`tiles/help-${i + 1}-${theme}.webp`), `шаг ${i + 1}: картинка ${theme} — ${shot.backgroundImage}`);
        eq(`${shot.height} ${shot.borderRadius} ${shot.backgroundSize}`, '120px 12px 496px 120px', `шаг ${i + 1}: высота, скругление, картинка в своём размере`);
      });
      const text = getComputedStyle(steps[0].querySelector('.ted-ui-help__text'));
      eq(`${text.fontSize} ${text.lineHeight}`, '13px 19.5px', 'text/t3');
      eq(text.color, theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(38, 38, 38)', 'цвет текста шага');
      const img = new Image();
      img.src = new URL(`../tiles/help-1-${theme}.webp`, location.href).href;
      await new Promise((r) => { img.onload = r; img.onerror = r; });
      eq(`${img.naturalWidth}×${img.naturalHeight}`, '992×240', 'картинка есть, двойной размер 496 × 120');
      ed.popover.close();
      ed.destroy();
    }
  });
});

group('Слой взаимодействия: меню блока', () => {
  test('«Превратить в…» — у текстовых блоков; нет у ключевых цифр, плюсов и минусов (22.11), таблицы, линии, медиа, аккордеона, вкладок, содержания, колонок, кнопки, iFrame, карточки, товара', async () => {
    const problems = [];
    for (const html of await blockSamples()) {
      const ed = make('<p>до</p>' + html + '<p>после</p>', {}, { width: WIDE });
      const el = ed.editable.children[1];
      focusBlock(ed, el);
      ed.handle.openMenu(el, ed.handle.ctrlGrip);
      const has = [...ed.popover.el.querySelectorAll('.ted-ui-item')].some((x) => /Превратить/.test(x.textContent));
      const want = !el.matches('ul.ted-facts, ul.ted-proscons, figure.ted-table, hr, .ted-ui-media, .ted-ui-raw, div.ted-accordion, div.ted-tabs, div.ted-toc, div.ted-columns, div.ted-button, figure.ted-iframe, div.ted-embed, div.ted-product');
      if (has !== want) problems.push(`${label(el)}: «Превратить в…» ${has ? 'есть' : 'нет'}`);
      if (!ed.popover.el.classList.contains('ted-ui-pop--block')) problems.push(`${label(el)}: не общее меню блока`);
      ed.popover.close();
      ed.destroy();
    }
    eq(problems.join('\n'), '');
  });
});
