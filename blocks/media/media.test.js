// Тесты медиа (blocks/media, этап 5) — прежние tests/media.test.js, перенесены без изменений.
import { group, test, eq, ok, wait } from '../../tests/harness.js';
import { Ted, make, select } from '../../tests/helpers.js';
import { videoEmbedUrl } from './media.js';
import { blockDef } from '../../resources/js/core/registry.js';

group('Медиа', () => {
  test('кнопка «Добавить» открывает менеджер и галерея переживает повторную загрузку HTML', async () => {
    const calls = [];
    const ed = make('<p></p>', {
      mediaSource: 'manager', mediaPageUrl: 'https://example.test/catalog/product/?x=1#fragment',
      pickFile: (context) => { calls.push(context); return [{ url: '/uf/images/a.webp', alt: 'Фото A' }, { url: '/uf/images/b.webp' }]; },
    });
    try {
      const block = ed.media.create('gallery', ed.lastBlock());
      block.querySelector('.ted-ui-media__drop').click();
      await wait(20);
      eq(calls.length, 1);
      eq(calls[0].kind, 'image'); eq(calls[0].pagePath, '/catalog/product/'); eq(calls[0].multiple, true);
      const html = ed.getInnerHTML();
      ok(html.includes('alt="Фото A"') && html.includes('/uf/images/b.webp'));
      ok(!html.includes('ted-ui-'));
      ed.setHTML(html);
      eq(ed.getInnerHTML(), html);
      ed.media.reorder(ed.lastBlock(), 0, 1);
      ok(ed.getInnerHTML().indexOf('b.webp') < ed.getInnerHTML().indexOf('a.webp'));
      ok(ed.history.undo()); eq(ed.getInnerHTML(), html);
    } finally { ed.destroy(); }
  });

  test('прямая загрузка, прогресс, повтор и отмена не попадают в публичный HTML', async () => {
    let attempt = 0;
    let finish;
    const ed = make('<p>Текст</p>', {
      upload: (_file, { onProgress }) => {
        onProgress(0.5);
        return ++attempt === 1 ? Promise.reject(new Error('Не удалось загрузить')) : new Promise(resolve => { finish = resolve; });
      },
    });
    try {
      const block = ed.media.create('file', ed.lastBlock());
      await ed.media.receive(block, [new File(['text'], 'example.txt', { type: 'text/plain' })]);
      ok(!ed.getInnerHTML().includes('Не удалось загрузить'));
      [...block.querySelectorAll('button')].find(btn => btn.textContent === 'Повторить').click();
      await wait(10);
      eq(block.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '50');
      ok(!ed.getInnerHTML().includes('example.txt'));
      finish({ url: '/uf/files/example.txt' });
      await wait(10);
      ok(ed.getInnerHTML().includes('download') && ed.getInnerHTML().includes('example.txt'));
      ok(ed.history.undo()); ok(!ed.getInnerHTML().includes('example.txt'));
      ok(ed.history.redo()); ok(ed.getInnerHTML().includes('example.txt'));
    } finally { ed.destroy(); }
  });

  test('картинка по ссылке (заказчик 17.11): поле в пустом изображении → сервер скачивает и сжимает, в HTML свой адрес; отмена — крестик', async () => {
    const calls = [];
    let finish;
    const upload = () => Promise.reject(new Error('не нужен'));
    upload.fromUrl = (url, ctx) => { calls.push({ url, ctx }); return new Promise((resolve) => { finish = resolve; }); };
    const ed = make('<p>Текст</p>', { upload });
    try {
      const block = ed.media.create('image', ed.lastBlock());
      const input = block.querySelector('input[aria-label="Ссылка на картинку"]');
      ok(input, 'поле ссылки у пустого изображения');
      input.value = 'https://cdn.example.com/photos/sofa.jpg';
      block.querySelector('.ted-ui-media__link-go').click();
      await wait(10);
      eq(calls.length, 1); eq(calls[0].url, 'https://cdn.example.com/photos/sofa.jpg');
      ok(block.querySelector('.ted-ui-media__job [role="progressbar"]'), 'та же область загрузки');
      // процент неизвестен — зона наполняется, а не «ездит» (заказчик 17.11); после перерисовки — с того же места
      const fill = block.querySelector('.ted-ui-media__fill');
      const fcs = getComputedStyle(fill);
      ok(fill.classList.contains('is-pending') && fcs.animationName === 'ted-media-pending' && fcs.transform === 'none' && fcs.animationIterationCount === '1', `${fcs.animationName} ${fcs.transform} ${fcs.animationIterationCount}`);
      await wait(60);
      ed.media.render(block);
      ok(parseFloat(block.querySelector('.ted-ui-media__fill').style.animationDelay) < 0, 'продолжает, а не начинает заново');
      ok(/sofa\.jpg · cdn\.example\.com/.test(block.textContent) && /по ссылке/.test(block.textContent), block.textContent);
      ok(block.querySelector('[data-act="media-cancel"]'), 'отмена — крестик');
      ok(!ed.getInnerHTML().includes('cdn.example.com'), 'пока грузится — в HTML ничего');
      finish({ url: '/uf/images/company/sofa.webp', name: 'sofa.jpg', type: 'webp', width: 1200, height: 800, size: 90000, originalSize: 400000, converted: true });
      await wait(20);
      ok(ed.getInnerHTML().includes('src="/uf/images/company/sofa.webp"') && !ed.getInnerHTML().includes('cdn.example.com'), ed.getInnerHTML());
    } finally { ed.destroy(); }
  });

  test('картинка по ссылке: вставленный адрес JPG — выбор «Вставить изображение»; HTML с чужими картинками — загрузка каждой на месте', async () => {
    const calls = [];
    const upload = () => Promise.reject(new Error('не нужен'));
    upload.fromUrl = (url) => { calls.push(url); return Promise.resolve({ url: `/uf/images/company/${calls.length}.webp` }); };
    const ed = make('<p><br></p>', { upload });
    try {
      select(ed, 0, 0, 0);
      const t1 = new DataTransfer();
      t1.setData('text/plain', 'https://cdn.example.com/a.png');
      ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: t1, bubbles: true, cancelable: true }));
      const btn = [...ed.popover.el.querySelectorAll('button')].find(b => b.textContent === 'Вставить изображение');
      ok(btn, 'выбор как у видео'); btn.click();
      await wait(20);
      ok(ed.getInnerHTML().includes('src="/uf/images/company/1.webp"'), ed.getInnerHTML());
      // HTML со страницы другого сайта: обе картинки галереи грузятся на свой сервер, alt сохраняется
      const p = ed.editable.appendChild(document.createElement('p'));
      p.innerHTML = '<br>';
      const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      const t2 = new DataTransfer();
      t2.setData('text/html', '<figure class="ted-media ted-media--gallery"><figure><img src="https://cdn.example.com/b.jpg" alt="Б"></figure><figure><img src="https://cdn.example.com/c.jpg" alt="В"></figure></figure>');
      t2.setData('text/plain', '');
      ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: t2, bubbles: true, cancelable: true }));
      await wait(30);
      eq(calls.slice(1).sort().join(' '), 'https://cdn.example.com/b.jpg https://cdn.example.com/c.jpg');
      const out = ed.getInnerHTML();
      ok(!out.includes('cdn.example.com') && /alt="Б"/.test(out) && /alt="В"/.test(out), out);
    } finally { ed.destroy(); }
  });

  test('картинка со страницы (заказчик 17.11: вставала как есть, шире колонки, без сжатия): вставка <img> и перетаскивание — блок «Изображение», заглушка загрузки, сжатие на сервере', async () => {
    const calls = [];
    const finish = [];
    const upload = () => Promise.reject(new Error('не нужен'));
    upload.fromUrl = (url) => { calls.push(url); return new Promise((resolve) => finish.push(resolve)); };
    const ed = make('<p><br></p>', { upload }, { width: 1000 });
    try {
      select(ed, 0, 0, 0);
      const t = new DataTransfer();
      t.setData('text/html', '<html><body><!--StartFragment--><img src="https://cdn.example.com/huge.jpg" alt="Огонь" width="3000"><!--EndFragment--></body></html>');
      t.setData('text/plain', '');
      ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true }));
      await wait(20);
      const block = ed.editable.querySelector('.ted-ui-media');
      ok(block && !ed.editable.querySelector('.ted-ui-raw, p > img'), 'блок изображения, не сырой HTML');
      eq(calls[0], 'https://cdn.example.com/huge.jpg');
      ok(block.querySelector('.ted-ui-media__job [role="progressbar"]'), 'заглушка загрузки');
      ok(block.getBoundingClientRect().width <= ed.editable.getBoundingClientRect().width + 1, 'в колонке');
      finish[0]({ url: '/uf/images/company/huge.webp', width: 2560, height: 1440, size: 300000, originalSize: 2400000, converted: true, type: 'webp' });
      await wait(20);
      ok(/WebP · 2560×1440/.test(block.textContent), 'строка о сжатии: ' + block.textContent);
      ok(/src="\/uf\/images\/company\/huge\.webp" alt="Огонь"/.test(ed.getInnerHTML()), ed.getInnerHTML());
      // перетаскивание картинки из другой вкладки: файла нет, есть адрес
      const drop = new DataTransfer();
      drop.setData('text/uri-list', 'https://cdn.example.com/b.png');
      const last = ed.editable.lastElementChild;
      last.dispatchEvent(new DragEvent('drop', { dataTransfer: drop, bubbles: true, cancelable: true }));
      await wait(20);
      eq(calls[1], 'https://cdn.example.com/b.png');
      eq(ed.editable.querySelectorAll('.ted-ui-media').length, 2, 'второй блок изображения');
      ok(!ed.editable.querySelector('p img'), 'браузер не вставил <img> в текст');
    } finally { ed.destroy(); }
  });

  test('вставленная видеоссылка предлагает выбор, сохранённый HTML не загружает iframe заранее', () => {
    const ed = make('<p><br></p>');
    try {
      select(ed, 0, 0, 0);
      const transfer = new DataTransfer();
      transfer.setData('text/plain', 'https://youtu.be/dQw4w9WgXcQ');
      ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
      const btn = [...ed.popover.el.querySelectorAll('button')].find(b => b.textContent === 'Вставить видео');
      ok(btn); btn.click();
      ok(ed.getInnerHTML().includes('data-ted-video="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'));
      ok(!ed.getInnerHTML().includes('<iframe'));
      eq(videoEmbedUrl('https://example.test/?v=dQw4w9WgXcQ'), '');
    } finally { ed.destroy(); }
  });

  test('вставка фото показывает загрузку заливкой зоны, правка сохраняет alt и подпись', async () => {
    let input;
    let finish;
    const ed = make('<p>Текст</p>', { upload: (file) => {
      input = file;
      return new Promise(resolve => { finish = resolve; });
    } });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 2; canvas.height = 2;
      const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const transfer = new DataTransfer();
      transfer.items.add(new File([png], 'photo.png', { type: 'image/png' }));
      select(ed, 0, 0);
      ed.editable.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
      for (let i = 0; i < 20 && !input; i++) await wait(20);
      eq(input?.name, 'photo.png');
      const block = ed.lastBlock();
      ok(block.querySelector('.ted-ui-media__fill') && /Загружается изображение/.test(block.textContent), 'зона заливается, видно что грузится');
      ok(!ed.getInnerHTML().includes('data:image/'));
      finish({ url: '/uf/images/ready.webp' });
      await wait(20);
      block.querySelector('input.ted-ui-media__caption').value = 'Утро'; block.querySelector('input.ted-ui-media__caption').dispatchEvent(new Event('input', { bubbles: true }));
      ed.media.settings(block, 0, block);
      const panel = ed.popover.el;
      panel.querySelector('input[aria-label="Описание (alt)"]').value = 'Пруд';
      [...panel.querySelectorAll('button')].find(btn => btn.textContent === 'Сохранить').click();
      ok(ed.getInnerHTML().includes('alt="Пруд"') && ed.getInnerHTML().includes('<figcaption>Утро</figcaption>'));
    } finally { ed.destroy(); }
  });

  test('отмена останавливает загрузку и запоздавший ответ не вставляет файл', async () => {
    let signal;
    let finish;
    const ed = make('<p>Текст</p>', { upload: (_file, options) => {
      signal = options.signal;
      return new Promise(resolve => { finish = resolve; });
    } });
    try {
      const block = ed.media.create('file', ed.lastBlock());
      const running = ed.media.receive(block, [new File(['%PDF-1.7'], 'a.pdf', { type: 'application/pdf' })]);
      block.querySelector('[data-act="media-cancel"]').click();
      ok(signal.aborted);
      finish({ url: '/uf/files/a.pdf' });
      await running;
      ok(!ed.getInnerHTML().includes('a.pdf'));
    } finally { ed.destroy(); }
  });

  for (const width of [1000, 860, 768, 414]) {
    for (const theme of ['light', 'dark']) {
      test(`зона добавления помещается при ${width} px, ${theme}`, async () => {
        const ed = make('', {}, { width, theme });
        try {
          const block = ed.media.create('image', ed.lastBlock());
          await wait(40);
          const drop = block.querySelector('.ted-ui-media__drop');
          eq(Math.round(drop.getBoundingClientRect().width), Math.round(ed.editable.getBoundingClientRect().width));
          ok(drop.scrollWidth <= drop.clientWidth + 1);
        } finally { ed.destroy(); }
      });
    }
  }
});

if (new URLSearchParams(location.search).has('php-upload')) {
  group('Медиа HTTP', () => {
    test('редактор загружает PNG через настоящий PHP и применяет URL к документу', async () => {
      const headers = { 'X-Ted-Demo': 'media' };
      const ed = make('', {
        mediaPageUrl: '/company/', upload: Ted.createUpload('/ted-demo-media/upload', { headers }),
        async onSave(html) {
          const response = await fetch('/ted-demo-media/save', { method: 'POST', headers, body: html });
          if (!response.ok || !(await response.json()).saved) throw new Error('Не сохранено');
        },
      });
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 8; canvas.height = 8;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const block = ed.media.create('image', ed.lastBlock());
        await ed.media.receive(block, [new File([blob], 'browser.png', { type: 'image/png' })]);
        ok(/\/uf\/images\/company\/[a-f0-9]{32}\.webp/.test(ed.getInnerHTML()), block.textContent);
        ok(await ed.persist(ed.getHTML()));
        ed.handle.remove(block);
        ok(!ed.getInnerHTML().includes('.webp'));
        ok(await ed.persist(ed.getHTML()));
      } finally { ed.destroy(); }
    });
  });
}

group('Галерея: кнопки и перетаскивание как у других компонентов', () => {
  const gallery = async () => {
    const ed = make('<p></p>', { mediaSource: 'manager', pickFile: () => [{ url: '/uf/images/a.webp', alt: 'A' }, { url: '/uf/images/b.webp', alt: 'B' }, { url: '/uf/images/c.webp', alt: 'C' }] });
    const block = ed.media.create('gallery', ed.lastBlock());
    block.querySelector('.ted-ui-media__drop').click();
    await wait(30);
    return { ed, block, tiles: () => [...block.querySelectorAll('.ted-media--gallery > figure')] };
  };
  const ptr = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 7, pointerType: 'mouse', clientX: x, clientY: y }));
  const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  test('три кнопки в правом верхнем углу плитки (ручка, Alt и подпись, корзина), зазор 2, значки 16; рамки при наведении и фокусе нет', async () => {
    const { ed, block, tiles } = await gallery();
    try {
      const tile = tiles()[0];
      const tools = tile.querySelector('.ted-ui-media__tile-tools');
      eq([...tools.querySelectorAll('button')].map((b) => b.dataset.act).join(), 'media-grip,media-settings,media-delete');
      eq(getComputedStyle(tools).gap, '2px');
      eq(getComputedStyle(tools.querySelector('svg')).width, '16px');
      tools.style.transition = 'none';
      tile.querySelector('button').focus();
      eq(getComputedStyle(tile).outlineStyle, 'none', 'в фокусе рамки нет');
      eq(getComputedStyle(tools).opacity, '1', 'кнопки видны, пока фокус в плитке');
    } finally { ed.destroy(); }
  });

  test('перетаскивание ручкой: рамка 2 px, кнопки остаются, соседи сдвигаются, порядок меняется, Undo возвращает', async () => {
    const { ed, block, tiles } = await gallery();
    try {
      const before = ed.getInnerHTML();
      const first = tiles()[0];
      const grip = first.querySelector('[data-act="media-grip"]');
      const [sx, sy] = centre(grip);
      const [tx, ty] = centre(tiles()[2]);
      ptr(grip, 'pointerdown', sx, sy);
      ptr(grip, 'pointermove', sx + 30, sy + 5);
      ptr(grip, 'pointermove', tx, ty);
      first.querySelector('.ted-ui-media__tile-tools').style.transition = 'none';
      const cs = getComputedStyle(first);
      ok(first.hasAttribute('data-tedui-drag'), 'плитка в состоянии перетаскивания');
      eq([cs.outlineWidth, cs.outlineColor, cs.outlineOffset].join(' '), '2px rgb(99, 161, 247) 2px', 'рамка как у шагов');
      eq(getComputedStyle(first.querySelector('.ted-ui-media__tile-tools')).opacity, '1', 'кнопки не пропадают');
      ok(tiles().slice(1).some((t) => /translate\(/.test(t.style.transform)), 'соседи сдвинуты плавно');
      ptr(grip, 'pointerup', tx, ty);
      const html = ed.getInnerHTML();
      ok(html.indexOf('b.webp') < html.indexOf('c.webp') && html.indexOf('c.webp') < html.indexOf('a.webp'), 'порядок: b, c, a');
      ok(!block.querySelector('[data-tedui-drag]') && !ed.ui.classList.contains('is-dragging'), 'состояние перетаскивания снято');
      ok(ed.history.undo()); eq(ed.getInnerHTML(), before, 'Undo');
    } finally { ed.destroy(); }
  });

  test('Esc отменяет перетаскивание, порядок не меняется', async () => {
    const { ed, tiles } = await gallery();
    try {
      const before = ed.getInnerHTML();
      const grip = tiles()[0].querySelector('[data-act="media-grip"]');
      const [sx, sy] = centre(grip);
      const [tx, ty] = centre(tiles()[2]);
      ptr(grip, 'pointerdown', sx, sy); ptr(grip, 'pointermove', sx + 30, sy); ptr(grip, 'pointermove', tx, ty);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      eq(ed.getInnerHTML(), before);
      ok(!ed.ui.classList.contains('is-dragging'));
    } finally { ed.destroy(); }
  });
});

group('Медиа: подписи, постер, ссылки, файлы (раунд 15)', () => {
  const block = (ed) => ed.editable.querySelector('.ted-ui-media');
  const html = (body) => '<figure class="ted-media ' + body;

  test('подпись пишется прямо под изображением и сохраняется в figcaption; пустая — исчезает', () => {
    const ed = make(html('ted-media--image"><img src="/uf/images/a.webp" alt=""></figure>'), { mediaSource: 'manager', pickFile: () => [] });
    try {
      const input = block(ed).querySelector('input.ted-ui-media__caption');
      ok(input, 'поле подписи есть в блоке');
      input.value = 'Мой пруд'; input.dispatchEvent(new Event('input', { bubbles: true }));
      ok(ed.getInnerHTML().includes('<figcaption>Мой пруд</figcaption>'), ed.getInnerHTML());
      input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
      ok(!ed.getInnerHTML().includes('figcaption'), 'пустая подпись не выводится');
      ok(block(ed).querySelector('[data-act="media-settings"]'), 'кнопка «Описание (alt)…» видна у блока');
    } finally { ed.destroy(); }
  });

  test('подпись есть у видео и аудио, у плиток галереи — своя', () => {
    const ed = make(html('ted-media--video"><video src="/uf/video/a.mp4" controls></video></figure>') + html('ted-media--audio"><audio src="/uf/audio/a.mp3" controls></audio></figure>')
      + html('ted-media--gallery"><figure><img src="/uf/images/a.webp" alt=""></figure><figure><img src="/uf/images/b.webp" alt=""></figure></figure>'), { mediaSource: 'manager', pickFile: () => [] });
    try {
      const blocks = ed.editable.querySelectorAll('.ted-ui-media');
      ok(blocks[0].querySelector('input.ted-ui-media__caption') && blocks[1].querySelector('input.ted-ui-media__caption'));
      const tiles = blocks[2].querySelectorAll('.ted-media--gallery > figure > input.ted-ui-media__caption');
      eq(tiles.length, 2);
      tiles[1].value = 'Второе'; tiles[1].dispatchEvent(new Event('input', { bubbles: true }));
      ok(ed.getInnerHTML().includes('<figcaption>Второе</figcaption>'), ed.getInnerHTML());
    } finally { ed.destroy(); }
  });

  test('видео с постером: poster сохраняется, preload=none; чужой адрес постера отбрасывается', () => {
    const ed = make(html('ted-media--video"><video src="/uf/video/a.mp4" poster="/uf/images/p.webp" controls></video></figure>'), { mediaSource: 'manager', pickFile: () => [] });
    try {
      const out = ed.getInnerHTML();
      ok(out.includes('poster="/uf/images/p.webp"') && out.includes('preload="none"'), out);
      ok(!Ted.clean(html('ted-media--video"><video src="/a.mp4" poster="javascript:alert(1)" controls></video></figure>')).includes('javascript'));
    } finally { ed.destroy(); }
  });

  test('пустой блок видео: поле «вставьте ссылку» принимает YouTube и MP4, чужое отклоняет', () => {
    const ed = make('<p></p>', { mediaSource: 'manager', pickFile: () => [] });
    try {
      const b = ed.media.create('video', ed.editable.firstChild, { select: false });
      const url = b.querySelector('input.ted-ui-media__url');
      ok(url, 'поле ссылки есть');
      url.value = 'https://example.test/page'; url.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      ok(!ed.getInnerHTML().includes('example.test'), 'не видео — не вставлено');
      url.value = 'https://youtu.be/dQw4w9WgXcQ'; url.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      ok(ed.getInnerHTML().includes('data-ted-video="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'), ed.getInnerHTML());
    } finally { ed.destroy(); }
  });

  test('у файлов есть ручка, переименование и корзина; ручка переставляет файлы', () => {
    const ed = make(html('ted-media--file"><a href="/uf/files/a.pdf" download>А</a><a href="/uf/files/b.pdf" download>Б</a></figure>'), { mediaSource: 'manager', pickFile: () => [] });
    try {
      const b = block(ed);
      eq(b.querySelectorAll('.ted-media--file > a > .ted-ui-media__tile-tools').length, 2);
      eq(b.querySelectorAll('.ted-media--file [data-act="media-delete"]').length, 2, 'у каждого файла внешняя корзина');
      eq(b.querySelectorAll('.ted-media--file [data-act="media-grip"]').length, 2, 'и ручка перетаскивания');
      const names = () => [...ed.editable.querySelectorAll('.ted-media--file > a')].map((a) => a.firstChild.textContent);
      ed.media.reorder(b, 0, 1);
      eq(names().join(), 'Б,А');
      ok(!ed.getInnerHTML().includes('tile-tools'), 'кнопки редактора не попадают в HTML');
      b.querySelector('.ted-media--file > a [data-act="media-settings"]').click();
      ok(ed.popover.el.querySelector('input[aria-label="Имя файла"]'), 'окно переименования открылось');
      ed.popover.close();
    } finally { ed.destroy(); }
  });

  test('клик по видео и аудио выделяет блок целиком — на секции можно остановиться', () => {
    const ed = make(html('ted-media--video"><video src="/uf/video/a.mp4" controls></video></figure>'), { mediaSource: 'manager', pickFile: () => [] });
    try {
      block(ed).querySelector('video').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const r = getSelection().getRangeAt(0);
      ok(r.startContainer === ed.editable && r.endOffset - r.startOffset === 1, 'блок выделен как объект');
    } finally { ed.destroy(); }
  });

  test('видео: высота 16:9 целая, скругление общее у изображения и видео', () => {
    const ed = make(html('ted-media--video"><video src="/uf/video/a.mp4" controls></video></figure>') + html('ted-media--image"><img src="/uf/images/a.webp" alt=""></figure>'), { mediaSource: 'manager', pickFile: () => [] });
    try {
      const v = ed.editable.querySelector('video');
      const h = v.getBoundingClientRect().height;
      if (CSS.supports('height', 'round(down, 1px, 1px)')) ok(Math.abs(h - Math.round(h)) < 0.01, 'высота видео целая: ' + h);
      ok(Math.abs(h - Math.floor(v.getBoundingClientRect().width * 9 / 16)) <= 1, 'пропорция 16:9');
      eq(getComputedStyle(v).borderRadius, getComputedStyle(ed.editable.querySelector('img')).borderRadius, 'скругления одинаковые');
    } finally { ed.destroy(); }
  });
});

group('Медиа: единый вид с окнами редактора (раунд 16)', () => {
  const fig = (kind, inner) => '<figure class="ted-media ted-media--' + kind + '">' + inner + '</figure>';
  const IMG = fig('image', '<img src="/uf/images/a.webp" alt="">');
  const mgr = { mediaSource: 'manager', pickFile: () => [] };

  test('дублирование блока: у копии своя рабочая панель, подписи не множатся', () => {
    const ed = make(fig('image', '<img src="/uf/images/a.webp" alt=""><figcaption>Подпись</figcaption>'), mgr);
    try {
      ed.handle.duplicate(ed.editable.querySelector('.ted-ui-media'));
      const blocks = ed.editable.querySelectorAll('.ted-ui-media');
      eq(blocks.length, 2);
      for (const b of blocks) {
        eq(b.querySelectorAll('input.ted-ui-media__caption').length, 1, 'одно поле подписи');
        eq(b.querySelectorAll('.ted-ui-media__info').length <= 1, true, 'не больше одной строки о файле');
        eq(b.querySelectorAll(':scope > [data-tedui-media-panel]').length, 1, 'одна панель');
      }
      const input = blocks[1].querySelector('input.ted-ui-media__caption');
      eq(input.value, 'Подпись');
      input.value = 'Другая'; input.dispatchEvent(new Event('input', { bubbles: true }));
      ok(ed.getInnerHTML().includes('Подпись') && ed.getInnerHTML().includes('Другая'), 'копия правится отдельно от оригинала: ' + ed.getInnerHTML());
    } finally { ed.destroy(); }
  });

  test('Enter в подписи: курсор в новом абзаце после блока', () => {
    const ed = make(IMG, mgr);
    try {
      const input = ed.editable.querySelector('input.ted-ui-media__caption');
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      const last = ed.editable.lastElementChild;
      eq(last.tagName, 'P');
      eq(ed.editable.children.length, 2);
      const r = getSelection().getRangeAt(0);
      ok(last.contains(r.startContainer) || r.startContainer === last, 'курсор в новом абзаце');
    } finally { ed.destroy(); }
  });

  test('подпись без линий: у поля нет рамки и подчёркивания', () => {
    const ed = make(IMG, mgr);
    try {
      const cs = getComputedStyle(ed.editable.querySelector('input.ted-ui-media__caption'));
      eq(cs.borderBottomWidth, '0px');
      eq(cs.borderTopWidth, '0px');
    } finally { ed.destroy(); }
  });

  test('окно alt устроено как окно «Якорь»: шапка с крестиком, поле, подсказка, Сохранить и Отмена; без подписи и выравнивания', () => {
    const ed = make(IMG, mgr);
    try {
      const pencil = ed.editable.querySelector('[data-act="media-settings"]');
      pencil.click();
      const pop = ed.popover.el;
      ok(pop.classList.contains('ted-ui-pop--link'), 'тот же контейнер, что у «Якоря» и «Ссылки»');
      ok(pop.querySelector('.ted-ui-form__head [data-act="close"]') && pop.querySelector('input.ted-ui-input') && pop.querySelector('.ted-ui-field__hint'));
      const labels = [...pop.querySelectorAll('.ted-ui-action')].map((b) => b.textContent);
      eq(labels.join(), 'Сохранить,Отмена');
      ok(!pop.querySelector('select') && !pop.querySelector('input[aria-label="Подпись"]'), 'нет выравнивания и подписи');
      const box = pop.getBoundingClientRect();
      const host = ed.ui.getBoundingClientRect();
      ok(box.left >= host.left - 1 && box.right <= host.right + 1, 'окно не вылезает за редактор');
      const anchor = pencil.getBoundingClientRect();
      ok(Math.abs((box.top) - (anchor.bottom + 4)) < 16, 'окно привязано к кнопке-карандашу');
      pop.querySelector('input.ted-ui-input').value = 'Красный диван';
      [...pop.querySelectorAll('.ted-ui-action')][0].click();
      ok(ed.getInnerHTML().includes('alt="Красный диван"'), ed.getInnerHTML());
    } finally { ed.destroy(); }
  });

  test('окно плитки галереи и файла привязано к своему карандашу, у файла — только имя', () => {
    const ed = make(fig('gallery', '<figure><img src="/a.webp" alt=""></figure><figure><img src="/b.webp" alt=""></figure>') + fig('file', '<a href="/uf/files/a.pdf" download>Договор</a>'), mgr);
    try {
      const pencils = [...ed.editable.querySelectorAll('[data-act="media-settings"]')];
      pencils[1].click();
      let anchor = pencils[1].getBoundingClientRect();
      ok(Math.abs(ed.popover.el.getBoundingClientRect().top - (anchor.bottom + 4)) < 16, 'плитка: окно у кнопки');
      ed.popover.close();
      pencils[2].click();
      ok(ed.popover.el.querySelector('input[aria-label="Имя файла"]') && !ed.popover.el.querySelector('input[aria-label="Описание"]'));
      eq(ed.popover.el.querySelectorAll('.ted-ui-field').length, 1);
      ed.popover.close();
    } finally { ed.destroy(); }
  });

  test('кнопка отмены загрузки — крестик Buttons/icon-small, без слова; ошибка — «Повторить» кнопкой редактора', async () => {
    let finish;
    const ed = make('<p>Текст</p>', { upload: () => new Promise((_, reject) => { finish = reject; }) });
    try {
      const b = ed.media.create('video', ed.lastBlock());
      ed.media.receive(b, [new File(['x'], 'v.mp4', { type: 'video/mp4' })]);
      const cancel = b.querySelector('.ted-ui-media__job .ted-ui-small[data-act="media-cancel"]');
      ok(cancel && cancel.textContent.trim() === '', 'крестик, без текста');
      eq(cancel.getBoundingClientRect().width, 24, 'тот же размер, что у кнопки «Заменить файл»');
      finish(new Error('Файл больше лимита'));
      await wait(40);
      ok(/Файл больше лимита/.test(b.textContent), 'причина ошибки видна');
      const retry = b.querySelector('.ted-ui-media__job .ted-ui-action');
      ok(retry?.textContent === 'Повторить' && retry.classList.contains('ted-ui-action--gray'), '«Повторить» — secondary (Buttons/main secondary xs), рядом нет второй яркой кнопки');
      ok(!b.querySelector('.ted-ui-media__job .ted-ui-action--primary'), 'ярких кнопок в ошибке нет');
      const reason = [...b.querySelectorAll('.ted-ui-media__file span')].pop();
      eq(Math.round(retry.getBoundingClientRect().top - reason.getBoundingClientRect().bottom), 16, 'от текста до кнопки 16');
      const jobR = getComputedStyle(b.querySelector('.ted-ui-media__job')).borderTopLeftRadius;
      eq(jobR, '24px', 'скругление ошибки как у загрузки видео');
    } finally { ed.destroy(); }
  });

  test('поле ссылки на видео и кнопка — из окон редактора и одной высоты', () => {
    const ed = make('<p></p>', mgr);
    try {
      const b = ed.media.create('video', ed.editable.firstChild, { select: false });
      const input = b.querySelector('input.ted-ui-input');
      const go = b.querySelector('.ted-ui-action--primary');
      ok(input && go);
      eq(Math.round(input.getBoundingClientRect().height), Math.round(go.getBoundingClientRect().height), 'одна высота');
      eq(Math.round(input.getBoundingClientRect().height), 40, 'Inputs/main s и Buttons/main s — 40 (решение заказчика 16.11)');
      const ic = getComputedStyle(input), gc = getComputedStyle(go);
      eq([ic.borderTopLeftRadius, ic.fontSize, ic.lineHeight].join(' '), '12px 16px 24px', 'поле s: r12, text/t2');
      eq([gc.borderTopLeftRadius, gc.paddingLeft, gc.fontWeight, gc.fontSize].join(' '), '12px 16px 600 14px', 'кнопка s: r12, поля 16, ui/s');
      ok(/Ted Inter/.test(gc.fontFamily), 'шрифт кнопки — Inter дизайн-системы');
      ok(!b.querySelector('.ted-ui-media__action'), 'нет самодельных кнопок');
    } finally { ed.destroy(); }
  });

  test('превью с площадки: в редакторе виден плеер, в HTML остаётся только ссылка', () => {
    const ed = make(fig('video', '<a href="https://youtu.be/dQw4w9WgXcQ" data-ted-video="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ">Смотреть видео</a>'), mgr);
    try {
      const frame = ed.editable.querySelector('.ted-ui-media__embed > iframe');
      ok(frame && frame.src.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'iframe с превью');
      ok(!ed.getInnerHTML().includes('<iframe'), 'iframe в сохранённый HTML не попадает');
      ok(ed.getInnerHTML().includes('data-ted-video'));
    } finally { ed.destroy(); }
  });

  test('фото, открытое заново: под подписью тип, размеры и вес («WebP · 600×400 · 96 КБ»)', async () => {
    const real = window.fetch;
    const asked = [];
    window.fetch = (url, opts) => { asked.push((opts?.method || 'GET') + ' ' + new URL(url).pathname); return Promise.resolve(new Response(null, { status: 200, headers: { 'content-length': String(96 * 1024) } })); };
    const ed = make(fig('image', '<img src="/uf/images/company/saved-photo.webp" alt="" width="600" height="400">'), mgr);
    try {
      await wait(60);
      eq(ed.editable.querySelector('.ted-ui-media__info')?.textContent, 'WebP · 600×400 · 96 КБ');
      // только запросы к этому фото: редакторы прошлых тестов могут ещё догружать свои картинки (Firefox)
      eq(asked.filter((a) => a.includes('saved-photo')).join(), 'HEAD /uf/images/company/saved-photo.webp', 'вес узнаётся HEAD-запросом, файл не качается');
      ok(!ed.getInnerHTML().includes('ted-ui-media__info'), 'строки нет в HTML');
    } finally { ed.destroy(); window.fetch = real; }
  });

  test('под превью площадки кнопка «Смотреть на YouTube»: первый щелчок выбирает блок, второй открывает видео; в HTML её нет', async () => {
    const ed = make(fig('video', '<a href="https://youtu.be/dQw4w9WgXcQ" data-ted-video="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ">Смотреть видео</a>'), mgr);
    try {
      const btn = () => ed.editable.querySelector('.ted-ui-media__panel > .ted-media__source');
      ok(btn(), 'кнопка под превью');
      eq(btn().textContent, 'Смотреть на YouTube');
      eq([btn().getAttribute('href'), btn().target].join(' '), 'https://youtu.be/dQw4w9WgXcQ _blank');
      eq(getComputedStyle(btn()).height, '40px');
      ok(!ed.getInnerHTML().includes('ted-media__source'), 'кнопки нет в сохранённом HTML');
      const states = [];
      const spy = (event) => { if (event.target.closest?.('.ted-media__source')) { states.push(event.defaultPrevented); event.preventDefault(); } };
      window.addEventListener('click', spy);
      try {
        btn().click();
        await wait(30);
        btn().click();
      } finally { window.removeEventListener('click', spy); }
      eq(states.join(','), 'true,false', 'первый щелчок не уводит, второй открывает ссылку');
    } finally { ed.destroy(); }
  });

  test('аудио по макету Media/audio: плеер (play, волна, время, название), подпись и название правятся', async () => {
    const ed = make(fig('audio', '<audio src="/uf/audio/a.mp3" title="Подкаст" controls></audio>'), mgr);
    try {
      await wait(80);
      const b = ed.editable.querySelector('.ted-ui-media');
      const player = b.querySelector('.ted-audio');
      ok(player, 'плеер есть');
      ok(player.querySelector('.ted-audio__play') && player.querySelector('.ted-audio__wave') && player.querySelector('.ted-audio__time'));
      eq(player.querySelector('.ted-audio__name').textContent, 'Подкаст');
      const cs = getComputedStyle(player);
      eq([cs.borderRadius, cs.backgroundColor].join(' '), '16px rgb(237, 243, 250)', 'подложка #EDF3FA, радиус 16');
      const play = getComputedStyle(player.querySelector('.ted-audio__play'));
      eq([play.width, play.height, play.backgroundColor, play.color].join(' '), '48px 48px rgb(13, 13, 13) rgb(255, 255, 255)', 'круг #0D0D0D, значок белый');
      eq(Math.round(b.querySelector('.ted-audio__wave').getBoundingClientRect().height), 48);
      eq(Math.round(player.getBoundingClientRect().height), 132, 'карточка 132, как в макете');
      eq(getComputedStyle(b.querySelector('audio')).display, 'none', 'родной плеер скрыт');
      ok(player.querySelectorAll('.ted-audio__wave > i').length > 20, 'волна из столбиков');
      b.querySelector('[data-act="media-settings"]').click();
      ok(ed.popover.el.querySelector('input[aria-label="Название"]'));
      ed.popover.el.querySelector('input.ted-ui-input').value = 'Выпуск 2';
      ed.popover.el.querySelector('.ted-ui-action--primary').click();
      ok(ed.getInnerHTML().includes('title="Выпуск 2"'), ed.getInnerHTML());
    } finally { ed.destroy(); }
  });

  test('Ted.enhance на сайте собирает тот же плеер; без скрипта остаётся <audio controls>', () => {
    const box = document.createElement('div');
    box.innerHTML = fig('audio', '<audio src="/uf/audio/a.mp3" title="Запись" controls></audio>');
    document.body.appendChild(box);
    try {
      Ted.enhance(box);
      ok(box.querySelector('figure[data-ted-player] > .ted-audio .ted-audio__name'));
      ok(!box.querySelector('audio').hasAttribute('controls'));
      Ted.enhance(box);
      eq(box.querySelectorAll('.ted-audio').length, 1, 'повторный вызов не дублирует');
    } finally { box.remove(); }
  });

  test('у блока «Превратить в…» не показывается для медиа', () => {
    const ed = make(IMG, mgr);
    try {
      ed.handle.openMenu(ed.editable.querySelector('.ted-ui-media'), null);
      const labels = [...document.querySelectorAll('.ted-ui-pop .ted-ui-item')].map((n) => n.textContent.trim());
      ok(!labels.some((t) => t.startsWith('Превратить')), labels.join('|'));
      ed.popover.close();
    } finally { ed.destroy(); }
  });
});

group('Медиа: подписи и плеер по размерам Figma (раунд 17)', () => {
  const fig = (kind, inner) => '<figure class="ted-media ted-media--' + kind + '">' + inner + '</figure>';
  const mgr = { mediaSource: 'manager', pickFile: () => [] };
  const top = (el, ref) => Math.round(el.getBoundingClientRect().top - ref.getBoundingClientRect().top);

  test('подпись под изображением: t3 (13 px, строка 150%), #919599, от картинки 12 px', async () => {
    const ed = make(fig('image', '<img src="/uf/images/a.webp" alt="">'), mgr);
    try {
      const b = ed.editable.querySelector('.ted-ui-media');
      const cap = b.querySelector('input.ted-ui-media__caption');
      const cs = getComputedStyle(cap);
      eq([cs.fontSize, cs.lineHeight, cs.color, Math.round(cap.getBoundingClientRect().height)].join(' '), '13px 19.5px rgb(145, 149, 153) 20');
      const img = b.querySelector('img').getBoundingClientRect();
      eq(Math.round(cap.getBoundingClientRect().top - img.bottom), 12, 'отступ от медиа 12');
    } finally { ed.destroy(); }
  });

  test('на планшете (768) отступ подписи 8, плеер 40 и карточка 120; на 1000 — 12, 48 и 132', async () => {
    for (const [width, gap, play, card] of [[1000, 12, 48, 132], [768, 8, 40, 120], [414, 8, 40, 120]]) {
      const ed = make(fig('audio', '<audio src="/uf/audio/a.mp3" title="Название" controls></audio><figcaption>Описание</figcaption>'), mgr, { width });
      try {
        await wait(120);
        const b = ed.editable.querySelector('.ted-ui-media');
        const player = b.querySelector('.ted-audio');
        eq(Math.round(player.querySelector('.ted-audio__play').getBoundingClientRect().width), play, width + ': play');
        eq(Math.round(player.getBoundingClientRect().height), card, width + ': карточка');
        eq(Math.round(b.querySelector('input.ted-ui-media__caption').getBoundingClientRect().top - player.getBoundingClientRect().bottom), gap, width + ': отступ подписи');
        const x = player.getBoundingClientRect();
        eq([Math.round(player.querySelector('.ted-audio__play').getBoundingClientRect().left - x.left), Math.round(player.querySelector('.ted-audio__play').getBoundingClientRect().top - x.top)].join(), '12,12', width + ': поля 12');
      } finally { ed.destroy(); }
    }
  });

  test('аудио: без названия в редакторе стоит заготовка «Название», клик по ней открывает окно', async () => {
    const ed = make(fig('audio', '<audio src="/uf/audio/a.mp3" controls></audio>'), mgr);
    try {
      await wait(60);
      const name = ed.editable.querySelector('.ted-audio__name');
      eq(name.textContent, 'Название');
      ok(name.classList.contains('is-empty'));
      name.click();
      ok(ed.popover.el?.querySelector('input[aria-label="Название"]'), 'окно названия открылось');
      ed.popover.close();
    } finally { ed.destroy(); }
  });

  test('значок play белый в светлой и тёмный на светлом круге в тёмной теме (не перебивается стилями кнопок редактора)', async () => {
    for (const [theme, icon, bg] of [['light', 'rgb(255, 255, 255)', 'rgb(13, 13, 13)'], ['dark', 'rgb(38, 38, 38)', 'rgb(255, 255, 255)']]) {
      const ed = make(fig('audio', '<audio src="/uf/audio/a.mp3" controls></audio>'), mgr, { theme });
      try {
        await wait(60);
        const cs = getComputedStyle(ed.editable.querySelector('.ted-audio__play'));
        eq([cs.color, cs.backgroundColor].join(' / '), icon + ' / ' + bg, theme);
        eq(getComputedStyle(ed.editable.querySelector('.ted-audio__play svg path')).fill, icon, theme + ': заливка значка');
      } finally { ed.destroy(); }
    }
  });
});

group('Медиа: удаление файлов с сервера после сохранения, маска выбора, GIF (раунд 18)', () => {
  const fig = (kind, inner) => '<figure class="ted-media ted-media--' + kind + '">' + inner + '</figure>';
  const IMG = (n) => fig('image', '<img src="/uf/images/company/' + n + '.webp" alt="">');
  const server = () => {
    const calls = [];
    const upload = () => Promise.reject(new Error('не нужен'));
    upload.remove = (urls, ctx) => { calls.push({ urls, ctx }); return Promise.resolve({ removed: urls.length }); };
    return { upload, calls };
  };

  test('файлы удаляются с сервера только после сохранения, а до него Ctrl+Z возвращает блок', async () => {
    const { upload, calls } = server();
    const saved = [];
    const ed = make(IMG('a') + IMG('b'), { upload, mediaPageUrl: '/company/', onSave: (html) => { saved.push(html); } });
    try {
      const [first] = ed.editable.querySelectorAll('.ted-ui-media');
      first.remove();
      ed.afterChange({ immediate: true });
      await wait(30);
      eq(calls.length, 0, 'до сохранения ничего не удаляется');
      await ed.persist(ed.getHTML());
      await wait(30);
      eq(calls.length, 1, 'после сохранения запрос удаления');
      eq(calls[0].urls.join(), '/uf/images/company/a.webp');
      eq(calls[0].ctx.pagePath, '/company/');
      await ed.persist(ed.getHTML() + ' ');
      await wait(30);
      eq(calls.length, 1, 'второе сохранение не удаляет повторно');
    } finally { ed.destroy(); }
  });

  test('Ctrl+Z перед сохранением возвращает файл: удалять нечего', async () => {
    const { upload, calls } = server();
    const ed = make(IMG('a'), { upload, onSave: () => {} });
    try {
      ed.editable.querySelector('.ted-ui-media').remove();
      ed.afterChange({ immediate: true });
      ok(ed.history.undo(), 'Undo сработал');
      await ed.persist(ed.getHTML());
      await wait(30);
      eq(calls.length, 0, 'файл на месте — с сервера не удаляется');
    } finally { ed.destroy(); }
  });

  test('загруженный и удалённый до первого сохранения файл тоже удаляется; нужный текущему тексту не трогается', async () => {
    const { upload, calls } = server();
    const ed = make('<p>Текст</p>', { upload, onSave: () => {} });
    try {
      ed.mediaUploaded.add('/uf/images/company/tmp.webp');
      ed.mediaUploaded.add('/uf/images/company/keep.webp');
      ed.setHTML('<p>Текст</p>' + IMG('keep'));
      await ed.persist('<p>Текст</p>');
      await wait(30);
      eq(calls.length, 1);
      eq(calls[0].urls.join(), '/uf/images/company/tmp.webp', 'keep нужен текущему тексту, остаётся');
    } finally { ed.destroy(); }
  });

  test('в режиме файлового менеджера (manager) с сервера ничего не удаляется', async () => {
    const { upload, calls } = server();
    const ed = make(IMG('a'), { upload, mediaSource: 'manager', pickFile: () => [], onSave: () => {} });
    try {
      ed.editable.querySelector('.ted-ui-media').remove();
      ed.afterChange({ immediate: true });
      await ed.persist(ed.getHTML());
      await wait(30);
      eq(calls.length, 0);
    } finally { ed.destroy(); }
  });

  test('видео, постер, аудио и файлы учитываются при удалении; чужие адреса не трогаются', async () => {
    const { upload, calls } = server();
    const html = fig('video', '<video src="/uf/video/company/v.mp4" poster="/uf/images/company/p.webp" controls></video>') + fig('audio', '<audio src="/uf/audio/company/a.mp3" controls></audio>')
      + fig('file', '<a href="/uf/files/company/f.pdf" download>f</a>') + fig('image', '<img src="https://cdn.example/x.webp" alt="">');
    const ed = make(html, { upload, onSave: () => {} });
    try {
      ed.setHTML('<p>пусто</p>');
      await ed.persist(ed.getHTML());
      await wait(30);
      eq(calls[0].urls.sort().join(), ['/uf/audio/company/a.mp3', '/uf/files/company/f.pdf', '/uf/images/company/p.webp', '/uf/video/company/v.mp4'].join());
    } finally { ed.destroy(); }
  });

  test('выбранный медиа-блок — та же подложка 8 px, что у всех блоков; маски поверх картинки нет (22.11)', () => {
    const ed = make(IMG('a') + '<p>текст</p>', { mediaSource: 'manager', pickFile: () => [] });
    try {
      const b = ed.editable.querySelector('.ted-ui-media');
      ed.handle.select(b);
      const mediaBg = getComputedStyle(b, '::after').backgroundColor;
      const p = ed.editable.querySelector(':scope > p');
      const mask = getComputedStyle(b.firstElementChild, '::after');
      ok(mask.content === 'none' || mask.backgroundColor === 'rgba(0, 0, 0, 0)', 'маски нет');
      ed.handle.select(p);
      const pBg = getComputedStyle(p, '::after').backgroundColor;
      ok(pBg !== 'rgba(0, 0, 0, 0)' && mediaBg === pBg, 'подложка как у абзаца: ' + mediaBg + ' / ' + pBg);
      ed.handle.select(b);
      eq(getComputedStyle(b, '::after').inset, '-8px', 'на 8 px вокруг');
      ed.handle.select(null);
    } finally { ed.destroy(); }
  });

  test('GIF: подсказка и отчёт говорят «как есть»; адрес .gif остаётся изображением', () => {
    const ed = make(fig('image', '<img src="/uf/images/company/anim.gif" alt="">'), { mediaSource: 'manager', pickFile: () => [] });
    try {
      ok(ed.getInnerHTML().includes('anim.gif'), 'GIF не отбрасывается');
      eq(ed.editable.querySelector('.ted-ui-media__info')?.textContent, 'GIF');
    } finally { ed.destroy(); }
  });

  test('у фото галереи и у файла есть внешние корзина и ручка; в окне карандаша кнопки «Удалить» нет', () => {
    const ed = make(fig('gallery', '<figure><img src="/a.webp" alt=""></figure><figure><img src="/b.webp" alt=""></figure>') + fig('file', '<a href="/uf/files/company/a.pdf" download>А</a>'), { mediaSource: 'manager', pickFile: () => [] });
    try {
      const b = ed.editable.querySelectorAll('.ted-ui-media');
      eq(b[0].querySelectorAll('[data-act="media-delete"]').length, 2);
      eq(b[1].querySelectorAll('[data-act="media-delete"]').length, 1);
      eq(b[1].querySelectorAll('[data-act="media-grip"]').length, 1);
      b[1].querySelector('[data-act="media-settings"]').click();
      ok(![...ed.popover.el.querySelectorAll('button')].some((x) => /Удалить/.test(x.textContent)), 'в окне нет удаления');
      ed.popover.close();
      b[1].querySelector('[data-act="media-delete"]').click();
      ok(!ed.getInnerHTML().includes('a.pdf'), 'внешняя корзина убирает файл');
    } finally { ed.destroy(); }
  });
});

group('Медиа: цвет значков кнопок плитки (раунд 19)', () => {
  test('значки ручки, карандаша и корзины у файла и фото — цвета значков редактора, а не синей ссылки файла', () => {
    for (const theme of ['light', 'dark']) {
      const ed = make('<figure class="ted-media ted-media--file"><a href="/uf/files/company/a.pdf" download>А</a></figure><figure class="ted-media ted-media--gallery"><figure><img src="/a.webp" alt=""></figure></figure>', { mediaSource: 'manager', pickFile: () => [] }, { theme });
      try {
        const expected = theme === 'light' ? 'rgb(38, 38, 38)' : 'rgb(255, 255, 255)';
        const buttons = [...ed.editable.querySelectorAll('.ted-ui-media__tile-tools .ted-ui-small')];
        eq(buttons.length, 6, theme + ': 3 кнопки у файла и 3 у фото');
        for (const b of buttons) eq(getComputedStyle(b).color, expected, theme + ': ' + b.dataset.act);
      } finally { ed.destroy(); }
    }
  });
});

group('Медиа: итог загрузки, кнопки при открытом окне и перетаскивании (раунд 20)', () => {
  const fig = (kind, inner) => '<figure class="ted-media ted-media--' + kind + '">' + inner + '</figure>';
  const mgr = { mediaSource: 'manager', pickFile: () => [] };

  test('множественная загрузка: готовый файл зеленеет вместо прогресса, когда загружены все — области убираются (галерея)', async () => {
    const gates = [];
    const upload = () => new Promise((resolve) => gates.push(resolve));
    const ed = make('<p>Текст</p>', { upload });
    try {
      const b = ed.media.create('gallery', ed.lastBlock());
      const running = ed.media.receive(b, [new File(['a'], 'cover.jpg', { type: 'image/jpeg' }), new File(['b'], 'Screenshot_3.jpg', { type: 'image/jpeg' })]);
      await wait(30);
      eq(gates.length, 2);
      eq(b.querySelectorAll('.ted-ui-media__job--done').length, 0, 'пока никто не загружен — только прогресс');
      gates[0]({ url: '/uf/images/company/a.webp', name: 'a.webp' });
      await wait(40);
      const done = b.querySelectorAll('.ted-ui-media__job--done');
      eq(done.length, 1, 'первый зазеленел вместо прогресса');
      ok(/cover\.jpg/.test(done[0].textContent) && done[0].querySelector('.ted-ui-media__done-icon svg') && !done[0].querySelector('.ted-ui-media__spinner'), 'галочка вместо кольца');
      eq(getComputedStyle(done[0]).backgroundColor, 'rgb(195, 229, 195)', 'фон states/success/light');
      eq(getComputedStyle(done[0].querySelector('.ted-ui-media__done-icon')).color, 'rgb(14, 140, 14)', 'галочка states/success/dark');
      ok(b.querySelector('.ted-ui-media__job:not(.ted-ui-media__job--done) .ted-ui-media__fill'), 'у второго идёт прогресс');
      eq(b.querySelectorAll('.ted-media--gallery > figure').length, 0, 'до конца всей загрузки в галерею ничего не вставлено');
      gates[1]({ url: '/uf/images/company/b.webp', name: 'b.webp' });
      await running;
      await wait(30);
      eq(b.querySelectorAll('.ted-ui-media__job').length, 0, 'все загружены — зелёные области убраны');
      eq(b.querySelectorAll('.ted-media--gallery > figure').length, 2, 'оба фото вставлены');
    } finally { ed.destroy(); }
  });

  test('одиночная загрузка зелёной области не показывает: только прогресс, потом файл', async () => {
    let finish;
    const ed = make('<p>Текст</p>', { upload: () => new Promise((resolve) => { finish = resolve; }) });
    try {
      const b = ed.media.create('file', ed.lastBlock());
      const running = ed.media.receive(b, [new File(['a'], 'Договор.pdf', { type: 'application/pdf' })]);
      await wait(30);
      finish({ url: '/uf/files/company/doc.pdf', name: 'Договор.pdf' });
      await running;
      await wait(30);
      eq(b.querySelectorAll('.ted-ui-media__job').length, 0);
      eq(b.querySelectorAll('.ted-media--file > a').length, 1);
    } finally { ed.destroy(); }
  });

  test('пока открыто окно у карандаша, кнопки плитки видны и нажатая подсвечена (и у файлов, и у галереи)', () => {
    const ed = make(fig('file', '<a href="/uf/files/company/a.pdf" download>А</a>') + fig('gallery', '<figure><img src="/a.webp" alt=""></figure><figure><img src="/b.webp" alt=""></figure>'), mgr);
    // устройство без наведения (сенсорный экран, headless Chrome на Linux без мыши) показывает кнопки всегда —
    // @media (hover: none) в media.editor.css; проверки «скрыты» там не имеют смысла
    const hoverable = !matchMedia('(hover: none)').matches;
    try {
      for (const tools of ed.editable.querySelectorAll('.ted-ui-media__tile-tools')) {
        tools.style.transition = 'none';
        if (hoverable) eq(getComputedStyle(tools).opacity, '0', 'без наведения кнопок не видно');
        const pencil = tools.querySelector('[data-act="media-settings"]');
        pencil.style.transition = 'none';
        pencil.click();
        eq(getComputedStyle(tools).opacity, '1', 'при открытом окне видны: ' + tools.parentElement.localName);
        ok(getComputedStyle(pencil).backgroundColor !== 'rgba(0, 0, 0, 0)', 'нажатая кнопка подсвечена');
        ed.popover.close();
        if (hoverable) eq(getComputedStyle(tools).opacity, '0', 'после закрытия снова скрыты');
      }
    } finally { ed.destroy(); }
  });

  test('множественная загрузка файлов: готовый зеленеет, после всех области убираются', async () => {
    const gates = [];
    const ed = make('<p>Текст</p>', { upload: () => new Promise((resolve) => gates.push(resolve)) });
    try {
      const b = ed.media.create('file', ed.lastBlock());
      const running = ed.media.receive(b, [new File(['a'], 'Договор.pdf', { type: 'application/pdf' }), new File(['b'], 'Прайс.pdf', { type: 'application/pdf' })]);
      await wait(30);
      gates[1]({ url: '/uf/files/company/price.pdf', name: 'Прайс.pdf' });
      await wait(40);
      const done = b.querySelectorAll('.ted-ui-media__job--done');
      eq(done.length, 1);
      ok(/Прайс\.pdf/.test(done[0].textContent), done[0].textContent);
      gates[0]({ url: '/uf/files/company/doc.pdf', name: 'Договор.pdf' });
      await running;
      await wait(30);
      eq(b.querySelectorAll('.ted-ui-media__job').length, 0, 'области убраны');
      eq(b.querySelectorAll('.ted-media--file > a').length, 2, 'оба файла в блоке');
    } finally { ed.destroy(); }
  });

  test('при перетаскивании блока боковые кнопки (⠿ и корзина) идут за блоком', () => {
    const ed = make('<p>Раз</p><p>Два</p><p>Три</p>', mgr);
    try {
      const [first] = ed.editable.children;
      ed.handle.focus?.(first);
      ed.handle.focused = first;
      ed.handle.placeControls();
      ed.handle.startDrag(first, first.getBoundingClientRect().top);
      ed.handle.onDrag({ clientY: first.getBoundingClientRect().top + 60 });
      ok(/translateY\(/.test(ed.handle.controls.style.transform), 'кнопки сдвинуты вместе с блоком: ' + ed.handle.controls.style.transform);
      ok(ed.handle.controls.classList.contains('is-visible'), 'и не скрыты');
      ed.handle.endDrag(true);
      eq(ed.handle.controls.style.transform, '', 'после отпускания сдвиг снят');
    } finally { ed.destroy(); }
  });
});

group('Сохранение очищает историю правок (раунд 21)', () => {
  test('после сохранения Ctrl+Z не возвращает прежний текст (удалённый файл не вернуть)', async () => {
    const ed = make('<p>Раз</p>', { onSave: () => {} });
    try {
      ed.editable.insertAdjacentHTML('beforeend', '<p>Два</p>');
      ed.afterChange({ immediate: true });
      ed.history.commit();
      ok(ed.history.canUndo(), 'до сохранения Undo доступен');
      await ed.persist(ed.getHTML());
      ok(!ed.history.canUndo(), 'после сохранения истории нет');
    } finally { ed.destroy(); }
  });
});

group('Автосохранение страницы после загрузки (раунд 21)', () => {
  test('после загрузки файла страница сохраняется (onSave) вместе с ним; с saveAfterUpload: false — нет', async () => {
    const make1 = (extra) => { const saved = []; const ed = make('<p>Текст</p>', { upload: () => Promise.resolve({ url: '/uf/files/company/doc.pdf', name: 'doc.pdf' }), onSave: (html) => { saved.push(html); }, ...extra }); return { ed, saved }; };
    const a = make1({});
    try {
      const b = a.ed.media.create('file', a.ed.lastBlock());
      await a.ed.media.receive(b, [new File(['x'], 'doc.pdf', { type: 'application/pdf' })]);
      await wait(40);
      eq(a.saved.length, 1, 'onSave вызван один раз');
      ok(a.saved[0].includes('/uf/files/company/doc.pdf'), 'сохранён текст уже с файлом');
    } finally { a.ed.destroy(); }
    const c = make1({ saveAfterUpload: false });
    try {
      const b = c.ed.media.create('file', c.ed.lastBlock());
      await c.ed.media.receive(b, [new File(['x'], 'doc.pdf', { type: 'application/pdf' })]);
      await wait(40);
      eq(c.saved.length, 0, 'отключено');
    } finally { c.ed.destroy(); }
  });
});

group('Плавность после загрузки (раунд 22)', () => {
  test('области загрузки уходят плавно: высота блока анимируется, новые файлы проявляются, у фото есть размеры', async () => {
    const upload = () => Promise.resolve({ url: '/uf/images/company/a.webp', name: 'a.webp', type: 'webp', size: 1000, originalSize: 5000, width: 1200, height: 800 });
    const ed = make('<p>Текст</p>', { upload });
    try {
      const b = ed.media.create('image', ed.lastBlock());
      let seen = null;
      const original = b.animate;
      b.animate = function (...args) { const a = original.apply(this, args); seen = args[0]; return a; };
      await ed.media.receive(b, [new File(['x'], 'a.png', { type: 'image/png' })]);
      await wait(20);
      ok(seen && seen.length === 2 && /px$/.test(seen[0].height) && /px$/.test(seen[1].height), 'высота блока плавно меняется: ' + JSON.stringify(seen));
      ok(b.querySelector('img').getAttribute('width') === '1200' && b.querySelector('img').getAttribute('height') === '800', 'размеры фото в разметке: место резервируется до загрузки картинки');
      ok(ed.getInnerHTML().includes('width="1200"'), 'и в сохранённом HTML');
      ok(!b.getAttribute('style'), 'inline-стили блока не появляются (иначе попадали бы в историю правок)');
    } finally { ed.destroy(); }
  });

  test('при «уменьшении движения» смена мгновенная', () => {
    const ed = make('<p>Текст</p>', { mediaSource: 'manager', pickFile: () => [] });
    try {
      const b = ed.media.create('image', ed.lastBlock());
      let animated = false;
      b.animate = () => { animated = true; };
      const real = window.matchMedia;
      window.matchMedia = (q) => (/reduced-motion/.test(q) ? { matches: true } : real.call(window, q));
      try { ed.media.smooth(b, () => { b.style.minHeight = ''; }); } finally { window.matchMedia = real; }
      eq(animated, false);
    } finally { ed.destroy(); }
  });
});

// ---- семейство полностью в папке (отвязка ядра, 21.11): ядро спрашивает реестр ----
group('Медиа: точки подключения реестра', () => {
  const fig = (kind, inner) => '<figure class="ted-media ted-media--' + kind + '">' + inner + '</figure>';
  const mgr = { mediaSource: 'manager', pickFile: () => [] };

  test('«Медиа» остаётся в шапке при наборе текста: блок встаёт под абзацем, пустой абзац заменяет (28.11)', () => {
    const ed = make('<p>текст</p><p>дальше</p>', mgr);
    select(ed, 0, 2);
    ed.toolbar.update({ ...ed.state, focused: true });
    eq(ed.toolbar.variant, 'text');
    ok(ed.toolbar.mediaBtn.isConnected && !ed.toolbar.mediaBtn.hidden, 'кнопка «Медиа» в шапке при наборе текста');
    ed.toolbar.mediaBtn.click();
    ed.popover.el.querySelector('.ted-ui-item[data-value="image"]').click();
    const kids = Array.from(ed.editable.children);
    eq(kids[0].textContent, 'текст', 'абзац с текстом на месте');
    ok(kids[1].classList.contains('ted-ui-media'), 'медиа — сразу под абзацем');
    eq(kids[2].textContent, 'дальше');
    ed.destroy();
    const ed2 = make('<p>текст</p><p>ещё</p>', mgr);
    const empty = document.createElement('p'); empty.innerHTML = '<br>'; ed2.editable.firstElementChild.after(empty);   // новый пустой абзац, как после Enter
    select(ed2, 1, 0);
    ed2.toolbar.update({ ...ed2.state, focused: true });
    ed2.toolbar.mediaBtn.click();
    ed2.popover.el.querySelector('.ted-ui-item[data-value="image"]').click();
    eq(ed2.editable.children.length, 3, 'пустой абзац заменён, как из меню «/»');
    ok(ed2.editable.children[1].classList.contains('ted-ui-media'), ed2.editable.innerHTML.slice(0, 300));
    ed2.destroy();
  });

  test('wrap (block.json): обёртка правки — ted-ui-media; editor.media в blockUis; сохраняется блок внутри, с якорем обёртки', () => {
    const ed = make('<p>Текст</p>' + fig('image', '<img src="/uf/images/a.webp" alt="">').replace('<figure ', '<figure id="photo" '), mgr);
    const w = ed.editable.querySelector(':scope > .ted-ui-media');
    ok(w && w.getAttribute('contenteditable') === 'false', 'обёртка правки');
    ok(ed.media && ed.blockUis.includes(ed.media));
    ok(/<figure class="ted-media ted-media--image" id="photo"><img src="\/uf\/images\/a\.webp"/.test(ed.getInnerHTML()) && !ed.getInnerHTML().includes('ted-ui-media'), ed.getInnerHTML());
    ed.destroy();
  });

  test('statsOf: в сводке у медиа считается подпись, пустой блок — не блок', () => {
    const ed = make('<p>Раз два</p>' + fig('image', '<img src="/uf/images/a.webp" alt=""><figcaption>Три четыре</figcaption>'), mgr);
    const s = ed.getStats();
    eq(s.words + '/' + s.blocks, '4/2');
    ed.media.create('audio', ed.editable.lastElementChild, { select: false });
    eq(ed.getStats().blocks, 2, 'пустой аудиоблок без файла не считается');
    ed.destroy();
  });

  test('onKey: Alt+Enter на выделенном медиаблоке — окно настроек', async () => {
    const ed = make('<p>Текст</p>' + fig('image', '<img src="/uf/images/a.webp" alt="">'), mgr);
    const w = ed.editable.querySelector(':scope > .ted-ui-media');
    ed.selectObject(w);
    ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true, cancelable: true }));
    await wait(30);
    ok(ed.popover.isOpen, 'окно настроек открыто');
    ed.popover.close();
    ed.destroy();
  });

  test('insertMenu, menu.picker, blank, toText: «Медиа ▾» — четыре вида; в «Все блоки» файл — в «Файлы»; колонка — с пустым изображением; файл без набора — ссылкой', () => {
    const ed = make('<p>Текст</p>', mgr);
    eq(ed.toolbar.mediaItems().map((i) => i.value).join(','), 'image,video,audio,file');
    ed.blockMenu.openPicker(ed.editable.firstElementChild);
    const tile = document.querySelector('.ted-ui-tile[data-type="file"]');
    const groupTitle = tile && tile.closest('section, .ted-ui-picker__group, [data-group]');
    ok(tile && groupTitle && /Файлы/.test(groupTitle.textContent) && !/Таблиц/.test(groupTitle.querySelector('h2, h3, h4, .ted-ui-picker__title')?.textContent || ''), groupTitle ? groupTitle.className : 'нет плитки');
    ed.blockMenu.closePicker();
    ed.destroy();
    const blank = blockDef('image').blank(document);   // пустое изображение колонок (resources/js/ui/columns.js)
    ok(blank.classList.contains('ted-ui-media') && blank.querySelector(':scope > figure.ted-media--image') && !blank.querySelector('img'), blank.outerHTML);
    eq(Ted.clean(fig('file', '<a href="/uf/files/a.pdf" download="">Прайс</a>'), { blocks: ['p'] }).replace(/>\s+</g, '><'), '<p><a href="/uf/files/a.pdf">Прайс</a></p>');
    eq(Ted.clean(fig('image', '<img src="/uf/images/a.webp" alt="">') + '<p>x</p>', { blocks: ['p'] }), '<p>x</p>');
  });
});

group('Медиа: загрузка и библиотека CMS вместе (заказчик 23.11)', () => {
  const upload = () => Promise.reject(new Error('не должно вызываться'));
  test('при прямой загрузке и pickFile в зоне изображения, галереи, видео, аудио и файла есть «Из библиотеки» (Uploader/drop, library); без pickFile — нет', () => {
    const ed = make('<p></p>', { upload, pickFile: () => [] });
    for (const kind of ['image', 'gallery', 'video', 'file', 'audio']) ed.media.create(kind, ed.lastBlock(), { select: false });
    const zones = [...ed.editable.querySelectorAll('.ted-ui-media')].map((b) => [b.dataset.mediaKind, b.querySelector('.ted-ui-media__drop')]);
    for (const [kind, zone] of zones) {
      const link = zone.querySelector('[data-act="media-library"]');
      ok(link && link.textContent === 'Из библиотеки' && link.tagName === 'BUTTON', kind);
      ok(zone.tagName !== 'BUTTON' && !zone.querySelector('button button'), `${kind}: кнопка не вложена в кнопку`);
      ok(/или перетащите сюда\s*·\s*Из библиотеки/.test(zone.querySelector('.ted-ui-media__drop-more').textContent), `${kind}: «или перетащите сюда · Из библиотеки»`);
    }
    const plain = make('<p></p>', { upload });
    eq(plain.media.create('image', plain.lastBlock(), { select: false }).querySelector('[data-act="media-library"]'), null, 'без pickFile ссылки нет');
    const manager = make('<p></p>', { mediaSource: 'manager', pickFile: () => [] });
    const zone = manager.media.create('image', manager.lastBlock(), { select: false }).querySelector('.ted-ui-media__drop');
    ok(zone.tagName === 'BUTTON' && !zone.querySelector('[data-act="media-library"]'), 'режим только библиотеки — как раньше');
  });

  test('«Из библиотеки» открывает менеджер с видом файла и вставляет файл без загрузки; щелчок по зоне — выбор с компьютера', async () => {
    const calls = [];
    const ed = make('<p></p>', { upload, pickFile: (o) => { calls.push(o); return [{ url: '/uf/images/lib.webp', name: 'lib.webp' }]; } });
    const block = ed.media.create('image', ed.lastBlock(), { select: false });
    const sources = [];
    const choose = ed.chooseMedia.bind(ed);
    ed.chooseMedia = (kind, o) => { sources.push(o.source || 'direct'); return o.source ? choose(kind, o) : Promise.resolve({ source: 'direct', assets: [] }); };
    block.querySelector('.ted-ui-media__drop').click();
    block.querySelector('.ted-ui-media__drop-link:not([data-act])').click();
    block.querySelector('[data-act="media-library"]').click();
    await wait(30);
    eq(sources.join(), 'direct,direct,manager', 'зона и «Выбрать изображение» — с компьютера, ссылка — библиотека');
    eq(calls.length, 1);
    ok(calls[0].kind === 'image' && calls[0].extensions.includes('webp') && !calls[0].extensions.includes('pdf'), 'менеджеру передан вид');
    ok(ed.getHTML().includes('/uf/images/lib.webp'), ed.getHTML());
    ok(!ed.mediaUploaded.has('/uf/images/lib.webp'), 'файл библиотеки не считается загруженным — после сохранения не удаляется');
  });

  test('аудио из библиотеки: менеджеру — mp3 и wav, название — без расширения', async () => {
    const calls = [];
    const ed = make('<p></p>', { upload, pickFile: (o) => { calls.push(o); return [{ url: '/uf/audio/podcast.mp3', name: 'Подкаст.mp3' }]; } });
    const block = ed.media.create('audio', ed.lastBlock(), { select: false });
    block.querySelector('[data-act="media-library"]').click();
    await wait(30);
    ok(calls[0]?.kind === 'audio' && calls[0].extensions.join() === 'mp3,wav', JSON.stringify(calls[0]?.extensions));
    const html = ed.getHTML();
    ok(html.includes('src="/uf/audio/podcast.mp3"') && html.includes('title="Подкаст"'), html);
    ok(!ed.mediaUploaded.has('/uf/audio/podcast.mp3'));
  });
});