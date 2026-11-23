// Перетаскивание блока (этап 0): блок и все его кнопки едут за пальцем / мышью — и когда блок выбран, и когда тащат за ⠿ при наведении.
import { group, test, eq, ok, wait } from '../harness.js';
import { make } from '../helpers.js';
import { rect, NARROW, WIDE, blockSamples, focusBlock, label, frameOf, outside, dragBy, cancelDrag, translateY } from './samples.js';

const TABLE = '<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="2"><thead><tr><th>А</th><th>Б</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div><figcaption>Подпись</figcaption></figure>';

group('Перетаскивание: выбранный блок', () => {
  test('каждый блок на 364 (палец) и 1000 (мышь): тащится, едет ровно за пальцем, кнопки ⠿ 🗑 — вместе с ним, рамка вокруг всего содержимого, кнопки снаружи рамки', async () => {
    const problems = [];
    for (const [width, pointer] of [[NARROW, 'touch'], [WIDE, 'mouse']]) {
      for (const html of await blockSamples()) {
        const ed = make('<p>до</p>' + html + '<p>после</p>', {}, { width });
        const el = ed.editable.children[1];
        const t = `${width} ${label(el)}`;
        el.scrollIntoView({ block: 'center' });   // у края окна редактор сам прокручивает страницу
        if (el.matches('.ted-accordion, .ted-tabs')) await wait(350);   // раскрытие — плавное
        focusBlock(ed, el);
        if (ed.handle.focused !== el) { problems.push(`${t}: нет кнопок`); ed.destroy(); continue; }
        const ctl0 = rect(ed.handle.controls).top;
        dragBy(ed.handle.ctrlGrip, 20, pointer);
        try {
          if (!el.hasAttribute('data-tedui-drag')) { problems.push(`${t}: не тащится`); continue; }
          const dy = translateY(el);
          const dc = rect(ed.handle.controls).top - ctl0;
          if (Math.abs(dy - 20) > 2) problems.push(`${t}: сдвиг ${Math.round(dy)} вместо 20`);
          if (Math.abs(dc - dy) > 2) problems.push(`${t}: кнопки не едут за блоком (${Math.round(dc)} / ${Math.round(dy)})`);
          if (getComputedStyle(ed.handle.controls).opacity === '0') problems.push(`${t}: кнопки пропали`);
          const f = frameOf(el);
          const out = outside(el, f);
          if (out) problems.push(`${t}: вне рамки ${out}`);
          const c = rect(ed.handle.controls);
          const overlap = c.left < f.right && f.left < c.right && c.top < f.bottom && f.top < c.bottom;
          if (overlap && !(c.right <= f.left + 0.5 || c.bottom <= f.top + 0.5)) problems.push(`${t}: кнопки на рамке`);
        } finally { cancelDrag(); ed.destroy(); }
      }
    }
    eq(problems.join('\n'), '');
  });

  test('таблица выбрана: кнопки строк и столбцов и «Добавить …» не пропадают и едут вместе с ней; после отмены — на месте', async () => {
    const ed = make('<p>до</p>' + TABLE + '<p>после</p>', {}, { width: WIDE });
    const fig = ed.editable.querySelector('figure.ted-table');
    fig.scrollIntoView({ block: 'center' });
    focusBlock(ed, fig.querySelector('td'));
    ed.handle.setFocused(fig);
    await wait(300);   // кнопки таблицы появляются плавно
    const own = [...ed.ui.querySelectorAll('.ted-ui-tableadd.is-visible, .ted-ui-tablectl.is-visible')];
    ok(own.length >= 2, 'у таблицы видны свои кнопки: ' + own.length);
    const before = own.map((el) => rect(el).top);
    const b0 = rect(fig).top;
    dragBy(ed.handle.ctrlGrip, 30);
    try {
      ok(fig.hasAttribute('data-tedui-drag'), 'таблица тащится');
      const db = rect(fig).top - b0;
      own.forEach((el, i) => {
        ok(getComputedStyle(el).opacity !== '0', `${el.className}: не пропадает`);
        eq(Math.round(rect(el).top - before[i]), Math.round(db), `${el.className}: едет за таблицей`);
      });
    } finally { cancelDrag(); }
    await wait(300);
    own.forEach((el, i) => ok(Math.abs(rect(el).top - before[i]) < 2, `${el.className}: после отмены на месте`));
    ed.destroy();
  });
});

group('Перетаскивание: блок не выбран (тащат за ⠿ при наведении)', () => {
  test('каждый блок на 1000 и 768: ручка «+ ⠿» видна и едет вместе с блоком, рамка 8 вокруг блока (заказчик 18.11)', async () => {
    const problems = [];
    for (const width of [WIDE, 768]) {
      for (const html of await blockSamples()) {
        const ed = make('<p>до</p>' + html + '<p>после</p>', {}, { width });
        const el = ed.editable.children[1];
        const t = `${width} ${label(el)}`;
        el.scrollIntoView({ block: 'center' });
        ed.handle.gutter.style.transition = 'none';   // проверяем итог, а не середину плавного появления
        ed.handle.showGutter(el);
        const grip = ed.handle.gutterGrip;
        if (grip.hidden) { problems.push(`${t}: нет ⠿ при наведении`); ed.destroy(); continue; }
        const g0 = rect(grip).top;
        dragBy(grip, 30);
        try {
          if (!el.hasAttribute('data-tedui-drag')) { problems.push(`${t}: не тащится`); continue; }
          const dy = translateY(el);
          if (Math.abs(rect(grip).top - g0 - dy) > 1) problems.push(`${t}: ручка не едет за блоком (${Math.round(rect(grip).top - g0)} / ${Math.round(dy)})`);
          if (getComputedStyle(ed.handle.gutter).opacity === '0') problems.push(`${t}: ручка пропала`);
          const out = outside(el, frameOf(el));
          if (out) problems.push(`${t}: вне рамки ${out}`);
        } finally { cancelDrag(); ed.destroy(); }
      }
    }
    eq(problems.join('\n'), '');
  });

  test('тащат выбранный блок, а курсор по пути к ⠿ прошёл над соседом — ручка «+ ⠿» соседа не остаётся на старом месте (заказчик 19.11)', () => {
    const ed = make('<blockquote class="ted-callout"><p><strong>Выноска</strong><br>Текст</p></blockquote><ul class="ted-facts"><li><strong>1</strong><br>Цифра</li><li><strong>2</strong><br>Цифра</li></ul><h2>Заголовок</h2><p>после</p>', {}, { width: WIDE });
    const [, facts, h2] = ed.editable.children;
    h2.scrollIntoView({ block: 'center' });
    focusBlock(ed, h2);
    ed.handle.showGutter(facts);   // курсор прошёл над «Ключевыми цифрами»
    ed.handle.onMove({ target: ed.handle.ctrlGrip, clientY: rect(ed.handle.ctrlGrip).top + 5 });   // и пришёл на ⠿ заголовка
    ok(!ed.handle.gutter.classList.contains('is-visible'), 'на кнопках блока ручка соседа скрыта');
    ed.handle.showGutter(facts);
    dragBy(ed.handle.ctrlGrip, -60);
    try {
      ok(h2.hasAttribute('data-tedui-drag'), 'заголовок тащится');
      ok(!ed.handle.gutter.classList.contains('is-visible'), 'во время перетаскивания ручки соседа нет');
      ed.handle.refresh();
      ok(!ed.handle.gutter.classList.contains('is-visible'), 'обновление слоя во время перетаскивания её не возвращает');
    } finally { cancelDrag(); ed.destroy(); }
  });

  test('тащат другой блок, выбранный отодвигается — его кнопки (⠿ 🗑, кнопки таблицы) плавно отодвигаются вместе с ним; после отмены — на месте (заказчик 19.11)', async () => {
    const problems = [];
    for (const width of [WIDE, 768]) {
      const ed = make('<p>Первый</p><p>Второй</p>' + TABLE + '<p>после</p>', {}, { width });
      const [first] = ed.editable.children;
      const fig = ed.editable.querySelector('figure.ted-table');
      fig.scrollIntoView({ block: 'center' });
      focusBlock(ed, fig.querySelector('td'));
      ed.handle.setFocused(fig);
      await wait(300);   // кнопки таблицы появляются плавно
      const own = [ed.handle.controls, ...ed.ui.querySelectorAll('.ted-ui-tableadd.is-visible, .ted-ui-tablectl.is-visible')];
      if (own.length < 3) problems.push(`${width}: у таблицы нет своих кнопок (${own.length})`);
      const before = own.map((el) => rect(el).top);
      const b0 = rect(fig).top;
      ed.handle.gutter.style.transition = 'none';
      ed.handle.showGutter(first);
      dragBy(ed.handle.gutterGrip, rect(fig).bottom - rect(first).bottom + 10);   // первый блок — под таблицу
      try {
        if (!first.hasAttribute('data-tedui-drag')) throw new Error(`${width}: первый блок не тащится`);
        if (ed.handle.focused !== fig) problems.push(`${width}: выбор ушёл с таблицы`);
        // соседи и кнопки отодвигаются плавно: переход есть; проверяем его итог (без окна браузер кадры не рисует — доводим переходы до конца)
        if (!ed.handle.controls.getAnimations().length) problems.push(`${width} ⠿ 🗑: отодвигаются без плавного перехода`);
        document.getAnimations().forEach((a) => a.finish());
        const db = rect(fig).top - b0;
        if (db > -10) problems.push(`${width}: таблица не отодвинулась (${Math.round(db)})`);
        own.forEach((el, k) => {
          const name = el === ed.handle.controls ? '⠿ 🗑' : el.className.split(' ')[0];
          if (getComputedStyle(el).opacity === '0') problems.push(`${width} ${name}: пропали`);
          const dc = rect(el).top - before[k];
          if (Math.abs(dc - db) > 1) problems.push(`${width} ${name}: не едут с таблицей (${Math.round(dc)} / ${Math.round(db)})`);
        });
      } finally { cancelDrag(); }
      await wait(350);
      own.forEach((el, k) => { if (Math.abs(rect(el).top - before[k]) > 1) problems.push(`${width} ${el.className.split(' ')[0]}: после отмены не на месте`); });
      ed.destroy();
    }
    eq(problems.join('\n'), '');
  });
});
