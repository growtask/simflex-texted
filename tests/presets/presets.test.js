// Этап 2 (MODULAR_PLAN.md): наборы (пресеты) и право на правку.
// Сервер (src/Presets.php, Config::save) проверяет tests/php/test-presets.php — на тех же примерах tests/presets/vectors.json.
import { group, test, eq, ok, wait } from '../harness.js';
import { make, select, blocks, Ted } from '../helpers.js';
import { PRESETS, presetTypes, checkPreset, definePreset } from '../../resources/js/core/presets.js';
import { menuGroups } from '../../resources/js/core/blocks.js';
import { serverOptions } from '../../resources/js/core/server.js';

const menuTypes = (ed) => ed.blockMenu.groups().flatMap((g) => g.items.map((i) => i.type)).sort().join(',');
const viewVariant = (ed) => { ed.toolbar.update({ ...ed.state, mode: ed.mode }); return ed.toolbar.variant; };
const hasEditButton = (ed) => { viewVariant(ed); return ed.toolbar.el.contains(ed.toolbar.modeBtn); };
const ctrlShiftP = (ed) => ed.ui.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'P', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
const RICH = '<h2>Заголовок</h2><blockquote class="ted-callout"><p>Совет</p></blockquote><p class="ted-bg-gray">Фон</p>'
  + '<figure class="ted-media ted-media--video"><video src="/uf/video/a.mp4" controls></video></figure><pre><code>let a = 1;</code></pre><ul><li>Пункт</li></ul>';

group('Наборы: описание', () => {
  test('базовые наборы — full, mini, text, readonly, docs (таблица этапа 2)', () => {
    eq(Object.keys(PRESETS).join(','), 'full,mini,text,readonly,docs');
    eq(PRESETS.full.blocks, 'all');
    eq(PRESETS.mini.blocks.join(','), 'p,h2,h3,h4,ul,ol,blockquote,image', 'mini: абзац, h2–h4, списки, цитата, изображение');
    eq(PRESETS.text.blocks.join(','), 'p,ul,ol', 'text: абзац и списки, без заголовков');
    eq(PRESETS.readonly.mode, 'readonly');
    eq(PRESETS.docs.mode, 'view');
    eq(PRESETS.docs.blocks, 'all');
  });

  test('виды блоков наборов = все блоки меню + h5, h6 (новый блок не забыть добавить в наборы)', () => {
    const menu = menuGroups().flatMap((g) => g.items.map((i) => i.type));
    eq([...new Set([...menu, 'h5', 'h6'])].sort().join(','), [...presetTypes()].sort().join(','));
  });

  test('описание своего набора проверяется, ошибки понятные (те же правила, что ted.config.php)', () => {
    eq(JSON.stringify(checkPreset('news', { blocks: ['h2', 'quote', 'code'] })), '{"blocks":["h2","blockquote","pre"],"mode":"edit"}', 'другие имена приводятся');
    const msg = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
    ok(msg(() => checkPreset('x', { blocks: ['spoiler'] })).includes('неизвестный блок «spoiler»'));
    ok(msg(() => checkPreset('x', { mode: 'write' })).includes('mode'));
    ok(msg(() => checkPreset('x', { blocks: ['p'], colors: 1 })).includes('неизвестный ключ «colors»'));
    ok(msg(() => checkPreset('Новости', {})).includes('латиница'));
    ok(msg(() => definePreset('mini', { blocks: ['p'] })).includes('базовый'), 'базовый набор не переопределить');
  });
});

group('Наборы: что доступно в редакторе', () => {
  test('mini — в меню «/» и «Все блоки» только абзац, h2–h4, списки, цитата, изображение; в «Медиа» только изображение', () => {
    const ed = make('<p>а</p>', { preset: 'mini' });
    eq(menuTypes(ed), 'blockquote,h2,h3,h4,image,ol,p,ul');
    ed.focus();
    select(ed, 0, 1);
    ed.updateState();
    ok(!ed.toolbar.colorParts().canBgMenu, 'нет «Фона» в меню «Цвет» (цвет текста — есть)');
    ok(!ed.toolbar.mediaBtn.hidden, 'есть «Медиа»');
    ed.toolbar.openMediaMenu();
    const items = [...document.querySelectorAll('.ted-ui-pop .ted-ui-item')].map((n) => n.textContent.trim());
    eq(items.join('|'), 'Изображение', 'в «Медиа» нет видео, аудио, файла');
    ed.popover.close();
    ed.destroy();
  });

  test('text — без заголовков: нет в меню, в «Стиле текста», «# » остаётся текстом', () => {
    const ed = make('<p>а</p>', { preset: 'text' });
    eq(menuTypes(ed), 'ol,p,ul');
    ed.focus();
    select(ed, 0, 1);
    ed.updateState();
    ed.toolbar.styleBtn.click();
    const labels = [...document.querySelectorAll('.ted-ui-pop .ted-ui-item')].map((n) => n.textContent.trim());
    ok(!labels.some((l) => l.startsWith('Заголовок')), labels.join('|'));
    ed.popover.close();
    ed.exec('block:h2');
    eq(blocks(ed)[0].tagName, 'P', 'команда заголовка не действует');
    ed.destroy();
  });

  test('при загрузке и сохранении запрещённые блоки становятся текстом, текст не теряется', () => {
    const ed = make(RICH, { preset: 'mini' });
    const html = ed.getInnerHTML();
    ok(html.includes('<h2>Заголовок</h2>'), 'h2 в mini есть');
    ok(!/ted-callout|ted-bg-|<video|<pre/.test(html), html);
    for (const w of ['Совет', 'Фон', 'let a = 1;', 'Пункт']) ok(html.includes(w), `«${w}» сохранился: ${html}`);
    ed.destroy();
    const t = make(RICH, { preset: 'text' });
    ok(!/<h2/.test(t.getInnerHTML()) && t.getInnerHTML().includes('<p>Заголовок</p>'), t.getInnerHTML());
    t.destroy();
  });

  test('вложенный запрещённый блок (фрейм в абзаце, таблица и вопрос в пункте, видео в абзаце, фон внутри) не сохраняется — как tests/php/test-presets.php', () => {
    for (const forged of [
      '<p>x<figure class="ted-iframe"><iframe src="https://evil.example/"></iframe></figure></p>',
      '<div><figure class="ted-iframe"><iframe src="https://evil.example/"></iframe></figure></div>',
      '<ul><li>a<figure class="ted-table"><table><tbody><tr><td>b</td></tr></tbody></table></figure></li></ul>',
      '<p>a<video src="/uf/video/a.mp4" controls></video></p>',
      '<ul><li>a<details class="ted-accordion__item"><summary class="ted-accordion__q">q</summary><div class="ted-accordion__body"><p>b</p></div></details></li></ul>',
      '<ul><li>a<ul><li>b<p>c<iframe src="https://evil.example/"></iframe></p></li></ul></li></ul>',
      '<p class="ted-bg-gray">a<strong class="ted-bg-gray">b</strong></p>',
    ]) {
      const got = Ted.clean(forged, { blocks: 'text' });
      ok(!/<(iframe|table|video|details|figure)\b|ted-bg-/.test(got), forged + ' → ' + got);
    }
    ok(/<iframe/.test(Ted.clean('<figure class="ted-iframe"><iframe src="https://example.com/"></iframe></figure>', { blocks: ['iframe'] })), 'разрешённый iFrame остаётся');
  });

  test('общие примеры с сервером (vectors.json): браузер даёт то же, что ждёт PHP', async () => {
    const data = await (await fetch(new URL('./vectors.json', import.meta.url))).json();
    const sets = { mini: 'mini', text: 'text', custom: data.custom };
    let bad = [];
    for (const v of data.vectors) for (const [name, exp] of Object.entries(v.expect)) {
      const got = Ted.clean(v.html, { blocks: sets[name] });
      if (got !== exp) bad.push(`${name}: ${v.html.slice(0, 80)}\n  ждали ${exp.slice(0, 120)}\n  есть  ${got.slice(0, 120)}`);
    }
    ok(data.vectors.length >= 40, 'примеров: ' + data.vectors.length);
    eq(bad.length, 0, bad.slice(0, 3).join('\n'));
  });

  test('вставка картинки файлом в text не создаёт блок, ссылка на видео в mini остаётся ссылкой', () => {
    const ed = make('<p>а</p>', { preset: 'text', upload: async () => ({ url: '/uf/images/a.webp' }) });
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }));
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    eq(ed.media.pasteFiles(ev, blocks(ed)[0]), false, 'изображение не разрешено — файл не вставляется');
    ed.destroy();
    const m = make('<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">ролик</a></p>', { preset: 'mini' });
    const link = m.editable.querySelector('a');
    m.media.linkChoice(link.href, link, blocks(m)[0]);
    const actions = [...document.querySelectorAll('.ted-ui-pop--choice .ted-ui-action')].map((b) => b.textContent).join('|');
    ok(actions && !/видео|карточк/i.test(actions), 'нет «Вставить видео» и карточки — их нет в наборе: ' + actions);
    m.popover.close();
    m.destroy();
  });

  test('Ted.clean(html, { preset }) — как на сервере Config::clean($html, $preset)', () => {
    const out = Ted.clean(RICH, { preset: 'text' });
    ok(!/<h2|ted-callout|<video/.test(out) && out.includes('Совет'), out);
    eq(Ted.clean(RICH, { preset: 'full' }), Ted.clean(RICH), 'full — всё разрешено');
  });
});

group('Наборы: как открывается редактор', () => {
  test('full и mini — сразу правка', () => {
    for (const preset of ['full', 'mini']) {
      const ed = make('<p>а</p>', { preset, onSave: () => {} });
      eq(ed.mode, 'edit', preset);
      ed.destroy();
    }
  });

  test('docs — просмотр на странице, «Редактировать» включает правку там же', () => {
    const ed = make('<h2>Док</h2><p>Текст</p>', { preset: 'docs', onSave: () => {} });
    eq(ed.mode, 'view');
    eq(ed.options.preview, 'inline', 'просмотр на той же странице');
    ok(hasEditButton(ed), 'есть «Редактировать»');
    ed.toolbar.modeBtn.click();
    eq(ed.mode, 'edit', 'кнопка включила правку');
    ed.setMode('view');
    ctrlShiftP(ed);
    eq(ed.mode, 'edit', 'Ctrl+Shift+P тоже');
    ed.destroy();
  });

  test('readonly — только просмотр: нет «Редактировать», ни клавиша, ни двойной клик, ни setReadOnly(false) правку не включают', () => {
    const ed = make('<p>Текст</p>', { preset: 'readonly', onSave: () => {} });
    eq(ed.mode, 'view');
    ok(!hasEditButton(ed), 'нет кнопки');
    ctrlShiftP(ed);
    eq(ed.mode, 'view', 'Ctrl+Shift+P');
    ed.preview.el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    eq(ed.mode, 'view', 'двойной клик');
    ed.setReadOnly(false);
    ed.setMode('edit');
    eq(ed.mode, 'view', 'setReadOnly(false) не возвращает правку');
    ed.destroy();
  });
});

group('Наборы: право на правку и набор задаёт сервер', () => {
  test('serverOptions: набор, свои наборы, право; неверное отбрасывается', () => {
    const s = serverOptions({ preset: 'news', presets: { news: { blocks: ['h2'] }, bad: { blocks: ['spoiler'] }, mini: { blocks: ['p'] } }, canEdit: false });
    eq(s.preset, 'news');
    eq(Object.keys(s.presets).join(','), 'news', 'неверный и «базовый» свой набор отброшены');
    eq(s.canEdit, false);
    eq(serverOptions({ preset: 'nope' }).preset, null, 'неизвестный набор не принимается');
    eq(serverOptions({}).canEdit, true, 'по умолчанию право есть');
  });

  test('без права (canEdit: false) в docs — нет «Редактировать», клавиша и двойной клик не включают правку', () => {
    const ed = make('<p>Текст</p>', { onSave: () => {}, server: { preset: 'docs', canEdit: false } });
    eq(ed.mode, 'view');
    ok(!hasEditButton(ed), 'нет кнопки «Редактировать»');
    ctrlShiftP(ed);
    eq(ed.mode, 'view', 'Ctrl+Shift+P');
    ed.preview.el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    eq(ed.mode, 'view', 'двойной клик');
    ed.setReadOnly(false);
    ed.setMode('edit');
    eq(ed.mode, 'view', 'браузер не может выдать себе право');
    ed.destroy();
  });

  test('без права в любом наборе (full, mini) — только просмотр', () => {
    for (const preset of ['full', 'mini']) {
      const ed = make('<p>а</p>', { onSave: () => {}, server: { preset, canEdit: false } });
      eq(ed.mode, 'view', preset);
      ok(!hasEditButton(ed), preset + ': нет кнопки');
      ed.destroy();
    }
  });

  test('набор с сервера главнее опций браузера', () => {
    const ed = make(RICH, { preset: 'full', blocks: 'all', server: { preset: 'text' } });
    eq(ed.preset.name, 'text');
    eq(menuTypes(ed), 'ol,p,ul');
    ok(!/<h2|ted-callout/.test(ed.getInnerHTML()), ed.getInnerHTML());
    ed.destroy();
  });

  test('свой набор из ted.config.php приходит описанием и работает так же, как базовый', () => {
    const ed = make('<p>а</p><pre><code>x</code></pre>', { server: { preset: 'news', presets: { news: { blocks: ['h2', 'quote', 'image'], mode: 'edit' } } } });
    eq(menuTypes(ed), 'blockquote,h2,image,p');
    ok(!/<pre/.test(ed.getInnerHTML()), 'код стал текстом');
    ed.destroy();
  });

  test('Ted.definePreset — свой набор в браузере (для страниц без PHP)', () => {
    Ted.definePreset('test-faq', { blocks: ['accordion'], mode: 'view' });
    const ed = make('<p>а</p>', { preset: 'test-faq', onSave: () => {} });
    eq(ed.mode, 'view');
    eq(menuTypes(ed), 'accordion,p');
    ed.destroy();
  });
});

group('Наборы: таблицы из старых статей (28.11)', () => {
  test('голая <table> и <figure> без класса: в полном наборе — блок «Таблица», в text и mini — строки абзацами, как на сервере', () => {
    const bare = '<table><tr><th>Тариф</th><th>Цена</th></tr><tr><td>Базовый</td><td><b>990</b> ₽</td></tr></table>';
    const fig = '<figure><table><tbody><tr><td>x</td><td>y</td></tr></tbody></table><figcaption>Подпись</figcaption></figure>';
    const flat = (s) => s.replace(/>\s+</g, '><').trim();
    ok(Ted.clean(fig).startsWith('<figure class="ted-table">') && Ted.clean(fig).includes('<figcaption>Подпись</figcaption>'), 'figure с таблицей — блок «Таблица» с подписью');
    for (const p of ['text', 'mini']) {
      eq(flat(Ted.clean(bare, { preset: p })), '<p>Тариф · Цена</p><p>Базовый · <strong>990</strong> ₽</p>', `${p}: голая таблица`);
      eq(flat(Ted.clean(fig, { preset: p })), '<p>x · y</p><p>Подпись</p>', `${p}: таблица в figure`);
    }
    eq(Ted.clean('<figure><img src="/a.png" alt=""><figcaption>Фото</figcaption></figure>').includes('ted-table'), false, 'figure с картинкой таблицей не становится');
  });
});
